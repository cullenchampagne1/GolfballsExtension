"""A block placeable on a report must have a route a report viewer can read.

This fails SILENTLY, and it looks like a broken report rather than a broken
permission. A block carrying the `custom` scope can be dropped onto a shared
report. `ReportSharing` then grants the viewer exactly the paths that report's
blocks declare — so the request is authorized by the middleware and arrives at
the handler. If the handler is guarded by `require_admin`, it answers 403: the
card mounts, draws its header, its eyebrow and its empty state, and never a
single row. Nothing in the console errors, because the console is being read by
an administrator for whom it works.

That is what `managed-email-templates` did. The table was on the report, the
ceiling allowed its endpoint, the row actions correctly hid themselves, and the
rows never came — for exactly the reader the report was made for.

So the two facts are checked against each other here, in the project that owns
both the block files and the routes:

- a report-placeable block's READ endpoint uses `require_admin_or_viewer`
- every MUTATING route keeps `require_admin`

The second half is the one that keeps the first half honest. Relaxing a read is
a deliberate, bounded widening; relaxing a write would hand a public link the
ability to change things, and the middleware's GET/HEAD check is a backstop,
not the authorization.
"""

from __future__ import annotations

import ast
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
ROUTES = ROOT / ".revstack" / "routes.py"
BLOCKS = ROOT / ".revstack" / "blocks"
PROJECT_ID = "golfballs-extension"

#: The guard that admits an administrator OR a report viewer the ceiling has
#: already cleared for this exact path. Injected by `ProjectManager`.
VIEWER_GUARD = "require_admin_or_viewer"
ADMIN_GUARD = "require_admin"


def _route_guards() -> dict[tuple[str, str], set[str]]:
    """`(method, path)` -> the guard names in the handler's signature.

    Read off the DEFAULTS of the signature, which is where a FastAPI
    dependency lives (`_: Principal = Depends(require_admin)`).
    """
    tree = ast.parse(ROUTES.read_text())
    found: dict[tuple[str, str], set[str]] = {}
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        routes = [
            (decorator.func.attr, decorator.args[0].value)
            for decorator in node.decorator_list
            if isinstance(decorator, ast.Call)
            and isinstance(decorator.func, ast.Attribute)
            and decorator.func.attr in ("get", "post", "patch", "put", "delete")
            and decorator.args
            and isinstance(decorator.args[0], ast.Constant)
            and isinstance(decorator.args[0].value, str)
        ]
        if not routes:
            continue
        guards = {
            inner.id
            for default in node.args.defaults + list(node.args.kw_defaults or [])
            if default is not None
            for inner in ast.walk(default)
            if isinstance(inner, ast.Name)
        }
        for method, path in routes:
            found.setdefault((method, path), set()).update(guards)
    return found


def _report_placeable_read_paths() -> dict[str, str]:
    """Route path -> block id, for every block a report can carry.

    `custom` is the scope that puts a block in a custom page's and a report's
    add-block menu, so it is the scope that decides whether a viewer will ever
    ask for the endpoint.
    """
    prefix = f"/projects/{PROJECT_ID}"
    out: dict[str, str] = {}
    for path in sorted(BLOCKS.glob("*.block.yaml")):
        doc = yaml.safe_load(path.read_text()) or {}
        if "custom" not in (doc.get("scopes") or []):
            continue
        url = ((doc.get("data") or {}).get("url") or "")
        if url.startswith(prefix):
            out[url[len(prefix):]] = doc.get("id") or path.stem
    return out


class ReportReadableRouteTests(unittest.TestCase):
    def setUp(self):
        self.guards = _route_guards()
        self.readable = _report_placeable_read_paths()

    def test_there_are_report_placeable_blocks_to_check(self):
        # A guard on the guard: an empty mapping would make every assertion
        # below pass by matching nothing.
        self.assertGreater(len(self.readable), 5)
        self.assertIn("/managed-email-templates", self.readable)
        self.assertIn("/managed-workflows", self.readable)

    def test_every_report_placeable_read_endpoint_admits_a_viewer(self):
        missing = []
        for path, block_id in sorted(self.readable.items()):
            guards = self.guards.get(("get", path))
            if guards is None:
                # Served by the generic data bridge rather than a bespoke
                # route in this file; the bridge is not admin-gated.
                continue
            if VIEWER_GUARD not in guards:
                missing.append(f"{block_id} reads GET {path} guarded by {sorted(guards)}")
        self.assertEqual(
            missing, [],
            "these blocks can be placed on a report but their endpoint "
            "refuses a report viewer, so the table renders without rows:\n  "
            + "\n  ".join(missing),
        )

    def test_the_managed_bucket_tables_are_among_them(self):
        # Named explicitly: these are the two the bug was reported on, and a
        # refactor that drops them from the scan should fail here rather than
        # quietly shrink the invariant.
        for path in ("/managed-email-templates", "/managed-email-template-sources",
                     "/managed-workflows"):
            self.assertIn(VIEWER_GUARD, self.guards[("get", path)], path)

    def test_no_mutating_route_admits_a_viewer(self):
        relaxed = [
            f"{method.upper()} {path}"
            for (method, path), guards in sorted(self.guards.items())
            if method != "get" and VIEWER_GUARD in guards
        ]
        self.assertEqual(
            relaxed, [],
            "a write must keep require_admin — the middleware's GET/HEAD "
            f"check is a backstop, not the authorization: {relaxed}",
        )

    def test_the_row_actions_on_those_tables_stay_administrator_only(self):
        # The clears and revokes the relaxed tables declare. A viewer never
        # sees the buttons, and must be refused even if it forges the request.
        for path in ("/managed-email-templates/clear",
                     "/managed-workflows/clear",
                     "/managed-email-template-sources/clear",
                     "/shares/email/revoke",
                     "/shares/products/revoke",
                     "/shares/settings/revoke"):
            guards = self.guards.get(("post", path))
            if guards is None:
                continue
            self.assertIn(ADMIN_GUARD, guards, path)
            self.assertNotIn(VIEWER_GUARD, guards, path)


if __name__ == "__main__":
    unittest.main()
