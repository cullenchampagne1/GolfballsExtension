"""Backend knowledge-corpus contract for the Golfballs help companion."""

import importlib.util
import json
import re
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HELPER_PATH = ROOT / ".revstack" / "_help_agent.py"
SPEC = importlib.util.spec_from_file_location("golfballs_help_agent_test", HELPER_PATH)
HELPER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HELPER)
ASSISTANT_PATH = ROOT.parent / "revstack-backend" / "logic" / "AssistantManager.py"
ASSISTANT_SPEC = importlib.util.spec_from_file_location(
    "revstack_assistant_manager_corpus_test", ASSISTANT_PATH
)
ASSISTANT = importlib.util.module_from_spec(ASSISTANT_SPEC)
sys.modules[ASSISTANT_SPEC.name] = ASSISTANT
ASSISTANT_SPEC.loader.exec_module(ASSISTANT)


class _StatusOnlyRunner:
    def status(self):
        return {"available": True, "mode": "test"}


class HelpAgentCorpusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.descriptor = HELPER.build_descriptor(ROOT)
        cls.chunks = cls.descriptor["chunks"]
        cls.by_id = {chunk["id"]: chunk for chunk in cls.chunks}

    def test_corpus_is_versioned_deterministic_and_has_unique_stable_ids(self):
        rebuilt = HELPER.build_descriptor(ROOT)
        self.assertEqual(self.descriptor["id"], "golfballs-extension-help")
        self.assertEqual(self.descriptor["version"], "3.3.0")
        self.assertRegex(self.descriptor["revision"], r"^[a-f0-9]{64}$")
        self.assertEqual(rebuilt["revision"], self.descriptor["revision"])
        self.assertEqual(len(self.by_id), len(self.chunks))
        self.assertGreater(len(self.chunks), 500)

    def test_guide_tutorial_settings_inventory_and_source_are_all_indexed(self):
        kinds = {chunk["kind"] for chunk in self.chunks}
        self.assertTrue({"guide", "tutorial", "registry", "inventory", "source"} <= kinds)
        self.assertIn("guide:article:margin-calculator:beginner", self.by_id)
        self.assertIn("guide:tutorial:initial-configuration", self.by_id)
        self.assertIn("registry:devSetting:marginCalc.minAllowedMargin", self.by_id)
        self.assertTrue(any(
            chunk["id"].startswith("inventory:modals:crm-search")
            for chunk in self.chunks
        ))
        self.assertTrue(any(
            chunk["id"].startswith("code:src/modals/CRMSearch.jsx:")
            for chunk in self.chunks
        ))

    def test_admin_only_help_and_source_are_tagged_for_consumer_filtering(self):
        notification = self.by_id["guide:article:reply-notifications:beginner"]
        self.assertEqual(notification["edition"], "admin")
        self.assertTrue(any(chunk.get("edition") == "admin" for chunk in self.chunks))
        self.assertTrue(any(chunk.get("edition") == "all" for chunk in self.chunks))

    def test_source_allowlist_excludes_build_artifacts_and_redacts_credentials(self):
        forbidden = ("node_modules/", "react-dist/", ".golfballs-extension-production/")
        secret = re.compile(r"(?i)(?:rsk[_-]|sk-|ghp_|xox[baprs]-)[_A-Za-z0-9-]{12,}")
        for chunk in self.chunks:
            source = str(chunk.get("source") or "")
            self.assertFalse(any(value in source for value in forbidden), source)
            self.assertIsNone(secret.search(str(chunk.get("text") or "")), chunk["id"])

    def test_action_targets_come_only_from_live_registries(self):
        routes = set(self.descriptor["guide_routes"])
        self.assertIn("#manual/margin-calculator", routes)
        self.assertIn("#workflows/run-campaign", routes)
        self.assertIn("crmSearch", self.descriptor["shortcut_targets"])
        margin = self.by_id["registry:devSetting:marginCalc.minAllowedMargin"]
        self.assertEqual(margin["setting_keys"], ["marginCalc.minAllowedMargin"])
        targets = {
            (item["action_type"], item["id"]): item
            for item in self.descriptor["action_targets"]
        }
        self.assertEqual(targets[("set_feature", "actionsShelfEnabled")]["value_type"], "bool")
        self.assertEqual(
            targets[("set_setting", "marginCalc.minAllowedMargin")]["maximum"], 100
        )
        self.assertIn("nord", targets[("set_theme_preset", "theme")]["allowed_values"])
        self.assertIn("midnight", targets[("set_theme_preset", "theme")]["allowed_values"])
        self.assertIn("slate", targets[("set_theme_preset", "theme")]["allowed_values"])
        self.assertIn(
            "settings-appearance", targets[("share_settings", "settings")]["option_values"]
        )
        self.assertIn(
            "fields:metadata",
            targets[("request_data_access", "email_templates")]["option_values"],
        )

    def test_personality_names_creator_and_allows_harmless_general_chat(self):
        prompt = self.descriptor["system_prompt"]
        self.assertIn("created by Cullen Champagne", prompt)
        self.assertIn("Harmless questions do not have to be about the extension", prompt)
        personality = self.by_id["assistant:personality:1"]["text"]
        self.assertIn("dry, playful sarcasm", personality)
        self.assertIn("not a reason to reject small talk", personality)

    def test_generic_backend_retrieval_resolves_real_guide_and_setting_queries(self):
        manager = ASSISTANT.AssistantManager(_StatusOnlyRunner())
        try:
            manager.register(self.descriptor)
            margin = manager.retrieve(
                self.descriptor["id"],
                "Where is marginCalc.minAllowedMargin configured?",
                edition="admin",
                limit=3,
            )
            self.assertEqual(
                margin[0]["id"], "registry:devSetting:marginCalc.minAllowedMargin"
            )
            campaign = manager.retrieve(
                self.descriptor["id"], "How do I safely send a bulk campaign?",
                edition="admin", limit=5,
            )
            self.assertIn(
                "guide:tutorial:run-campaign", {row["id"] for row in campaign}
            )
            consumer = manager.retrieve(
                self.descriptor["id"],
                "reply notifications emailRelay.notifications",
                edition="consumer",
                limit=12,
            )
            consumer_ids = {row["id"] for row in consumer}
            self.assertNotIn(
                "registry:devSetting:emailRelay.notifications", consumer_ids
            )
            self.assertNotIn(
                "guide:article:reply-notifications:beginner", consumer_ids
            )
            self.assertFalse(any(
                row["source"] == "src/modals/Notifications.jsx" for row in consumer
            ))
        finally:
            manager.unregister(self.descriptor["id"])

    def test_project_manifest_registers_every_client_and_documentation_route(self):
        manifest = json.loads((ROOT / "revstack.project.json").read_text())
        expected_client = {
            ("GET", "/projects/golfballs-extension/assistant/status"),
            ("POST", "/projects/golfballs-extension/assistant/messages"),
            ("GET", "/projects/golfballs-extension/assistant/runs/*"),
            ("POST", "/projects/golfballs-extension/assistant/runs/*"),
            ("POST", "/projects/golfballs-extension/assistant/feedback"),
        }
        registered_client = {
            (row["method"], row["path"])
            for row in manifest["client_routes"]
            if "/assistant/" in row["path"]
        }
        self.assertEqual(registered_client, expected_client)
        expected_docs = {
            "GET /assistant/status",
            "POST /assistant/messages",
            "GET /assistant/runs/{run_id}",
            "POST /assistant/runs/{run_id}/cancel",
            "POST /assistant/feedback",
            "GET /assistant/admin/status",
            "POST /assistant/admin/reindex",
            "POST /assistant/admin/grants",
            "POST /keys/assistant-access",
        }
        self.assertTrue(expected_docs <= set(manifest["api_docs"]["routes"]))
        compile((ROOT / ".revstack" / "routes.py").read_text(), "routes.py", "exec")


if __name__ == "__main__":
    unittest.main()
