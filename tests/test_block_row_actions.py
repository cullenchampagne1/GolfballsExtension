"""Every row action a route emits must be declared by the block that owns it.

This is the invariant the v3 action port rests on, and it fails SILENTLY. A
cell says `{"kind": "action", "action": "clear", "args": {...}}`; the view looks
`clear` up in the block's own `actions:` map and, finding nothing, draws no
button at all. The row still renders, the column still has a header, and the
control the card exists for is simply absent — no console error, no failed
request, nothing to grep for. A typo, or a `.block.yaml` edited without its
route, produces exactly that.

The reverse direction matters too: a declared action nothing emits is dead
weight that reads as a capability the card does not have.

So the two halves are checked against each other here, in the project that owns
both. The dashboard's own tests cover what the BUTTON does with a resolved
action; this covers whether it is resolvable in the first place.
"""

from __future__ import annotations

import ast
import re
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
ROUTES = ROOT / ".revstack" / "routes.py"
BLOCKS = ROOT / "blocks"
PROJECT_ID = "golfballs-extension"


def _row_action_names_by_endpoint() -> dict[str, set[str]]:
    """Every `_row_action("name", ...)` call, grouped by the route it sits in.

    Parsed rather than grepped: the call is nested inside a dict literal inside
    a loop inside an async def, and the enclosing route is the only thing that
    says which BLOCK is supposed to declare the name.
    """
    tree = ast.parse(ROUTES.read_text())
    found: dict[str, set[str]] = {}
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        paths = [
            decorator.args[0].value
            for decorator in node.decorator_list
            if isinstance(decorator, ast.Call)
            and isinstance(decorator.func, ast.Attribute)
            and decorator.func.attr in ("get", "post")
            and decorator.args
            and isinstance(decorator.args[0], ast.Constant)
            and isinstance(decorator.args[0].value, str)
        ]
        if not paths:
            continue
        names = {
            call.args[0].value
            for call in ast.walk(node)
            if isinstance(call, ast.Call)
            and isinstance(call.func, ast.Name)
            and call.func.id == "_row_action"
            and call.args
            and isinstance(call.args[0], ast.Constant)
            and isinstance(call.args[0].value, str)
        }
        if names:
            for path in paths:
                found.setdefault(path, set()).update(names)
    return found


def _blocks_by_data_path() -> dict[str, dict]:
    """Every v3 block file, keyed by the route path its `data.url` reads."""
    prefix = f"/projects/{PROJECT_ID}"
    out: dict[str, dict] = {}
    for path in sorted(BLOCKS.glob("*.block.yaml")):
        doc = yaml.safe_load(path.read_text()) or {}
        url = ((doc.get("data") or {}).get("url") or "")
        if url.startswith(prefix):
            out[url[len(prefix):]] = doc
    return out


class RowActionDeclarationTests(unittest.TestCase):
    def setUp(self):
        self.emitted = _row_action_names_by_endpoint()
        self.blocks = _blocks_by_data_path()

    def test_the_ported_tables_are_the_ones_emitting_row_actions(self):
        # A guard on the guard: if this list is empty the checks below pass by
        # vacuously matching nothing.
        self.assertEqual(
            self.emitted,
            {
                "/shares/email": {"revoke"},
                "/managed-email-templates": {"clear"},
                "/managed-email-template-sources": {"clearSource"},
            },
        )

    def test_every_emitted_action_is_declared_by_the_block_that_reads_it(self):
        for endpoint, names in self.emitted.items():
            block = self.blocks.get(endpoint)
            self.assertIsNotNone(block, f"no .block.yaml reads {endpoint}")
            declared = set((block.get("actions") or {}))
            missing = names - declared
            self.assertFalse(
                missing,
                f"{block['id']} emits {sorted(missing)} but declares "
                f"{sorted(declared)} — the row would draw no button",
            )

    def test_no_block_declares_a_row_action_nothing_emits(self):
        # `rowClick` is the view's own gesture, not a row action, so it is not
        # expected to appear in any cell.
        for endpoint, block in self.blocks.items():
            declared = set((block.get("actions") or {})) - {"rowClick"}
            if not declared:
                continue
            unused = declared - self.emitted.get(endpoint, set())
            self.assertFalse(
                unused,
                f"{block['id']} declares {sorted(unused)} but no row names it",
            )

    def test_a_destructive_action_declares_its_own_confirmation(self):
        # The prompt lives in the BLOCK because a payload able to rewrite it
        # could talk a reader into the thing it warns about. Every one of these
        # is a revoke/remove/clear, so every one has to ask.
        for endpoint, names in self.emitted.items():
            actions = (self.blocks[endpoint].get("actions") or {})
            for name in sorted(names):
                action = actions[name]
                self.assertTrue(
                    str(action.get("confirm") or "").strip(),
                    f"{endpoint}:{name} mutates without confirming",
                )
                self.assertEqual(action.get("tone"), "bad", f"{endpoint}:{name}")

    def test_a_declared_request_binds_only_its_own_arguments(self):
        # `${args.*}` is the ONLY interpolation a request body may carry: the
        # row supplies arguments, never the endpoint, the method or the guard
        # string. A `${data.*}` here would let the payload back into the
        # decision this port took away from it.
        binding = re.compile(r"\$\{([^}]+)\}")
        for endpoint, names in self.emitted.items():
            actions = (self.blocks[endpoint].get("actions") or {})
            for name in sorted(names):
                request = actions[name].get("request") or {}
                self.assertEqual(request.get("method"), "POST", f"{endpoint}:{name}")
                self.assertTrue(str(request.get("url", "")).startswith("/projects/"),
                                f"{endpoint}:{name} must stay same-origin")
                for ref in binding.findall(yaml.safe_dump(request)):
                    self.assertTrue(ref.startswith("args."),
                                    f"{endpoint}:{name} binds {ref!r}, not an argument")

    def test_the_two_managed_clears_stay_separate_actions(self):
        # Both post to `managed-email-templates/clear`, which tells "remove one
        # row" from "remove everything this account contributed" by which
        # argument it receives. Under v2 the cell built that body, so a row
        # chose between them. Two declarations, two confirmations, and neither
        # block can name the other's.
        one = (self.blocks["/managed-email-templates"]["actions"])["clear"]
        allof = (self.blocks["/managed-email-template-sources"]["actions"])["clearSource"]
        self.assertEqual(one["request"]["url"], allof["request"]["url"])
        self.assertEqual(one["request"]["body"]["confirm"],
                         "clear managed email template")
        self.assertEqual(allof["request"]["body"]["confirm"],
                         "clear managed email template source")
        self.assertIn("bucket_id", one["request"]["body"])
        self.assertIn("creator_credential_id", allof["request"]["body"])
        self.assertNotIn("clearSource", self.blocks["/managed-email-templates"]["actions"])
        self.assertNotIn("clear", self.blocks["/managed-email-template-sources"]["actions"])


class MigratedRegistrarTests(unittest.TestCase):
    def test_a_ported_block_took_its_v2_registrar_with_it(self):
        # Two registrations for one id is not an error the loader reports: the
        # `.block.yaml` files are staged BEFORE `.revstack/blocks.py` is exec'd,
        # so a surviving `_list_block` of the same id would quietly overwrite
        # the v3 descriptor and the card would render on the old primitive.
        registrar = (ROOT / ".revstack" / "blocks.py").read_text()
        for block_id in ("email-links", "managed-email-templates",
                         "managed-email-template-sources"):
            self.assertNotRegex(
                registrar, rf'_list_block\(\s*"{re.escape(block_id)}"',
                f"{block_id} is registered twice")
            self.assertIn(f"blocks/{block_id}.block.yaml", registrar,
                          f"{block_id}'s registrar left no pointer to its port")


if __name__ == "__main__":
    unittest.main()
