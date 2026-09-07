"""`_extract_trailing_json` — the fix for `/publish`'s `--json` response.

`cmd_publish --json` (the `golfballs` CLI) prints its "▸ step" lines to the
SAME stdout as the final `json.dumps(payload, indent=2)`; `--json` only gates
that last print, not the step lines above it. `json.loads()` on the whole
combined-output blob was therefore never valid, and every `/publish` call
silently fell back to `{"output": text[-2000:]}` instead of the structured
release payload the picker/version chip actually want. This pins the fix:
scan backward for the bare "{" line pretty-printed JSON always opens with,
and parse from there.

Uses the same AST-selection technique `test_extension_analytics.py` already
established for `.revstack/routes.py`: pull just the named function out and
exec it in isolation, so the dozens of RevStack-injected globals elsewhere in
that file (APIRouter, Principal, project_dir, …) never need stubbing for
logic that doesn't touch them.
"""

import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES = ROOT / ".revstack" / "routes.py"


def _load_routes_functions(names, extra_globals=None):
    tree = ast.parse(ROUTES.read_text())
    selected = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in names:
            selected.append(node)
        elif isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id in names for target in node.targets
        ):
            selected.append(node)
    found = {
        node.name if isinstance(node, ast.FunctionDef) else node.targets[0].id
        for node in selected
    }
    missing = names - found
    assert not missing, f"routes.py no longer defines: {sorted(missing)}"
    namespace = dict(extra_globals or {})
    exec(compile(ast.Module(body=selected, type_ignores=[]), "command-routes", "exec"), namespace)
    return namespace


NAMESPACE = _load_routes_functions({"_extract_trailing_json"}, {"json": __import__("json")})
extract_trailing_json = NAMESPACE["_extract_trailing_json"]

ACTIONS_NAMESPACE = _load_routes_functions({"_ACTIONS"})
ACTIONS = ACTIONS_NAMESPACE["_ACTIONS"]


class ActionsTableTests(unittest.TestCase):
    """`_ACTIONS` — the static half of the three `runner` action-mode blocks.

    `channel`'s real HTTP route is `/publish`, not `/channel` (true under the
    old `Pipeline` registrar too), which is exactly the kind of naming
    mismatch a plain `f"/{name}"` would get wrong silently — a card that
    "Run"s and 404s. This pins the override.
    """

    def test_declares_exactly_the_three_migrated_blocks(self):
        self.assertEqual(set(ACTIONS), {"build", "channel", "commit-push"})

    def test_channel_overrides_its_endpoint_to_the_real_publish_route(self):
        self.assertEqual(ACTIONS["channel"].get("endpoint"), "publish")

    def test_build_and_commit_push_use_their_own_name_as_the_route(self):
        # No override declared means `action_status` falls back to `name`
        # itself — correct here because /build and /commit-push are real.
        self.assertNotIn("endpoint", ACTIONS["build"])
        self.assertNotIn("endpoint", ACTIONS["commit-push"])

    def test_every_action_declares_at_least_one_real_stage(self):
        for name, meta in ACTIONS.items():
            with self.subTest(action=name):
                self.assertIsInstance(meta.get("stages"), list)
                self.assertGreater(len(meta["stages"]), 0)

    def test_only_the_destructive_ones_confirm(self):
        self.assertIsNone(ACTIONS["build"]["confirm"])
        self.assertIsNotNone(ACTIONS["channel"]["confirm"])
        self.assertIsNotNone(ACTIONS["commit-push"]["confirm"])


class ExtractTrailingJsonTests(unittest.TestCase):
    def test_finds_the_payload_after_real_cli_step_lines(self):
        text = (
            "▸ Fetching workspace\n"
            "▸ Checking out main\n"
            "▸ Installing dependencies (npm ci)\n"
            "▸ Building (npm run check)\n"
            "▸ Packaging consumer build (GB_ADMIN=0)\n"
            "▸ Packaging CRX3 from the consumer build\n"
            "{\n"
            '  "version": "3.4.77",\n'
            '  "file": "golfballs-extension-3.4.77.crx",\n'
            '  "sha256": "abc123",\n'
            '  "size": 40960,\n'
            '  "codebase": "https://api.cullenchampagne.com/extension/releases/x.crx",\n'
            '  "store_zip": "golfballs-extension-3.4.77.zip"\n'
            "}\n"
        )
        parsed = extract_trailing_json(text)
        self.assertEqual(parsed["version"], "3.4.77")
        self.assertEqual(parsed["file"], "golfballs-extension-3.4.77.crx")

    def test_returns_none_with_no_json_present(self):
        text = "▸ Fetching workspace\n▸ Checking out main\nsomething failed\n"
        self.assertIsNone(extract_trailing_json(text))

    def test_ignores_a_brace_that_opens_a_non_json_line(self):
        # A stray "{" inside a log line (not its own line) must not be mistaken
        # for the start of the pretty-printed payload.
        text = "note: use like this: fn() { ... }\n{\n  \"ok\": true\n}\n"
        parsed = extract_trailing_json(text)
        self.assertEqual(parsed, {"ok": True})

    def test_picks_the_last_json_block_when_more_than_one_brace_line_exists(self):
        # Defensive: if a step line ever legitimately contained a bare "{" of
        # its own, the REAL payload is still the final one in the stream.
        text = "{\n  \"stale\": true\n}\n▸ Publishing\n{\n  \"ok\": true,\n  \"version\": \"1\"\n}\n"
        parsed = extract_trailing_json(text)
        self.assertEqual(parsed, {"ok": True, "version": "1"})


if __name__ == "__main__":
    unittest.main()
