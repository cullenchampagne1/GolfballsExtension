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


#: Calls whose first argument NAMES a declared action.
#:
#: `_row_toggle` is the switch form of `_row_action` — same contract, same
#: first argument — so a roster's access column has to be scanned exactly like
#: a share table's revoke button.
_EMITTERS = ("_row_action", "_row_toggle")


def _named_actions(node: ast.AST) -> set[str]:
    """Action names emitted inside one function body."""
    return {
        call.args[0].value
        for call in ast.walk(node)
        if isinstance(call, ast.Call)
        and isinstance(call.func, ast.Name)
        and call.func.id in _EMITTERS
        and call.args
        and isinstance(call.args[0], ast.Constant)
        and isinstance(call.args[0].value, str)
    }


def _row_action_names_by_endpoint() -> dict[str, set[str]]:
    """Every emitted action name, grouped by the route that serves it.

    Parsed rather than grepped: the call is nested inside a dict literal inside
    a loop inside an async def, and the enclosing route is the only thing that
    says which BLOCK is supposed to declare the name.

    A route may build its payload in a `_console_*` helper rather than inline —
    most of the newer ones do, because the builder is testable on its own and
    the route is then three lines. So helper bodies are scanned too and folded
    into whichever routes CALL them. Without that, moving a payload into a
    helper would silently empty this invariant for that endpoint, which is the
    one failure mode a guard like this must not have.
    """
    tree = ast.parse(ROUTES.read_text())
    functions = {
        node.name: node for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    emitted = {name: _named_actions(node) for name, node in functions.items()}

    found: dict[str, set[str]] = {}
    for node in functions.values():
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
        names = set(emitted.get(node.name) or set())
        # …plus whatever the helpers this route calls emit. One level deep is
        # the shape in use; a builder that called a second builder would want
        # this widened rather than worked around.
        for call in ast.walk(node):
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Name):
                names |= emitted.get(call.func.id) or set()
        if names:
            for path in paths:
                found.setdefault(path, set()).update(names)
    return found


def _footer_action_names(block: dict) -> set[str]:
    """Actions a card's footer names — the other place a block may use one."""
    footer = ((block.get("layout") or {}).get("footer") or {})
    return {
        str(entry.get("action"))
        for entry in (footer.get("actions") or [])
        if isinstance(entry, dict) and entry.get("action")
    }


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
                # The three share tables — email templates, product stores and
                # settings bundles — plus the managed bucket's two clears.
                "/shares/email": {"revoke"},
                "/shares/products": {"revoke"},
                "/shares/settings": {"revoke"},
                "/managed-email-templates": {"clear"},
                "/managed-email-template-sources": {"clearSource"},
                # The installations roster. Not revokes — two reversible
                # switches, which is the first time this file has seen a row
                # action that is not destructive.
                "/keys/roster": {"key-access", "key-chat"},
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

    def test_no_block_declares_an_action_nothing_names(self):
        # `rowClick` is the view's own gesture, not a row action, so it is not
        # expected to appear in any cell. A card's FOOTER is the other place a
        # block may name one — see `keys-detail`, whose actions are all
        # footer-named because the card has no rows at all.
        for endpoint, block in self.blocks.items():
            declared = set((block.get("actions") or {})) - {"rowClick"}
            if not declared:
                continue
            used = self.emitted.get(endpoint, set()) | _footer_action_names(block)
            unused = declared - used
            self.assertFalse(
                unused,
                f"{block['id']} declares {sorted(unused)} but nothing names it",
            )

    #: Emitted actions that DESTROY something — a credential, a mirrored
    #: template, a share. Listed rather than pattern-matched, so adding a
    #: destructive action is a reviewed change to this line and not a naming
    #: accident.
    DESTRUCTIVE = {"revoke", "clear", "clearSource"}

    def test_a_destructive_action_declares_its_own_confirmation(self):
        # The prompt lives in the BLOCK because a payload able to rewrite it
        # could talk a reader into the thing it warns about.
        for endpoint, names in self.emitted.items():
            actions = (self.blocks[endpoint].get("actions") or {})
            for name in sorted(names & self.DESTRUCTIVE):
                action = actions[name]
                self.assertTrue(
                    str(action.get("confirm") or "").strip(),
                    f"{endpoint}:{name} destroys without confirming",
                )
                self.assertEqual(action.get("tone"), "bad", f"{endpoint}:{name}")

    def test_a_reversible_control_does_not_ask(self):
        # The roster's access switches are the everyday gesture and undo
        # themselves in one click. Confirming those is how an operator learns
        # to click through the confirm on the revoke.
        for endpoint, names in self.emitted.items():
            actions = (self.blocks[endpoint].get("actions") or {})
            for name in sorted(names - self.DESTRUCTIVE):
                action = actions[name]
                self.assertFalse(
                    str(action.get("confirm") or "").strip(),
                    f"{endpoint}:{name} is reversible but asks anyway",
                )
                self.assertNotEqual(
                    action.get("tone"), "bad",
                    f"{endpoint}:{name} is toned destructive but is not in DESTRUCTIVE",
                )

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
                         "managed-email-template-sources",
                         "product-stores", "settings-shares"):
            self.assertNotRegex(
                registrar, rf'_list_block\(\s*"{re.escape(block_id)}"',
                f"{block_id} is registered twice")
            self.assertIn(f"blocks/{block_id}.block.yaml", registrar,
                          f"{block_id}'s registrar left no pointer to its port")


if __name__ == "__main__":
    unittest.main()
