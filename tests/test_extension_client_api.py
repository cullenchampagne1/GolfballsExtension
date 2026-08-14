"""Database-backed extension access and consumer flow package tests."""

import importlib.util
import io
import json
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "golfballs_client_api", ROOT / ".revstack" / "logic" / "client_api.py"
)
client_api_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(client_api_module)


class Access:
    def __init__(self, *, extension_enabled=None, assistant_enabled=None):
        self.extension_enabled = extension_enabled
        self.assistant_enabled = assistant_enabled


class FakeSession:
    rows = {}

    def __init__(self, _engine):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def get(self, _model, subject_id):
        return self.rows.get(subject_id)


class FakeSettingsPolicy:
    def resolve(self, credential_id):
        return ({
            "schema_version": 1,
            "credential_id": credential_id,
        }, "database-revision")


class ExtensionClientAccessTests(unittest.TestCase):
    def setUp(self):
        FakeSession.rows = {}
        models = SimpleNamespace(ExtensionInstallationAccess=Access)
        auth = SimpleNamespace(engine=object())
        self.api = client_api_module.ExtensionClientApi(
            auth_manager=auth,
            models=models,
            settings_policy_store=FakeSettingsPolicy(),
            settings_policy_error=RuntimeError,
            client_scope="client:extension",
            project_dir=ROOT,
            public_origin="https://api.cullenchampagne.com",
        )
        self.principal = SimpleNamespace(
            auth_type="api_key",
            credential_id="install-1",
            scopes=[
                "client:extension",
                "GET:/projects/golfballs-extension/assistant/status",
            ],
        )
        self.session_patch = mock.patch.object(
            client_api_module, "Session", FakeSession
        )
        self.session_patch.start()

    def tearDown(self):
        self.session_patch.stop()

    def request(self):
        return SimpleNamespace(state=SimpleNamespace(principal=self.principal))

    def test_legacy_chat_grant_is_used_only_until_a_database_choice_exists(self):
        initial = self.api.access(self.principal)
        self.assertTrue(initial["extension_enabled"])
        self.assertTrue(initial["assistant_enabled"])

        FakeSession.rows["install-1"] = Access(assistant_enabled=False)
        disabled = self.api.access(self.principal)
        self.assertFalse(disabled["assistant_enabled"])
        self.assertFalse(disabled["personal_assistant_enabled"])

    def test_global_disable_overrides_every_personal_setting(self):
        FakeSession.rows["*"] = Access(extension_enabled=False)
        FakeSession.rows["install-1"] = Access(
            extension_enabled=True, assistant_enabled=True
        )
        state = self.api.access(self.principal)
        self.assertFalse(state["global_enabled"])
        self.assertTrue(state["personal_enabled"])
        self.assertFalse(state["extension_enabled"])
        self.assertFalse(state["assistant_enabled"])

    def test_personal_disable_fails_the_health_check_closed(self):
        FakeSession.rows["install-1"] = Access(extension_enabled=False)
        with self.assertRaises(HTTPException) as raised:
            self.api.health(self.request())
        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(raised.exception.detail["code"], "extension_disabled")

    def test_healthy_installation_returns_session_and_access_state(self):
        FakeSession.rows["install-1"] = Access(
            extension_enabled=True, assistant_enabled=True
        )
        response = self.api.health(self.request())
        payload = json.loads(response.body)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertTrue(payload["ok"])
        self.assertTrue(payload["session_valid"])
        self.assertTrue(payload["extension_enabled"])
        self.assertTrue(payload["assistant_enabled"])

    def test_configuration_is_resolved_for_the_authenticated_installation(self):
        self.api.auth_manager.authenticate_session_cookie = lambda _request: None
        response = self.api.configuration(self.request())
        payload = json.loads(response.body)
        self.assertEqual(payload["revision"], "database-revision")
        self.assertEqual(payload["configuration"]["credential_id"], "install-1")
        self.assertFalse(payload["admin_bypass"])

    def test_email_exchange_flow_creates_reply_drafts_without_sending(self):
        response = self.api.email_exchange_flow(self.request(), "cullen")
        self.assertEqual(response.media_type, "application/zip")
        self.assertNotIn(b"__USER_EMAIL__", response.body)

        with zipfile.ZipFile(io.BytesIO(response.body)) as package:
            definition_name = next(
                name for name in package.namelist()
                if name.endswith("/definition.json")
            )
            package_definition = json.loads(package.read(definition_name))

        definition = package_definition["properties"]["definition"]
        actions = definition["actions"]
        reply_actions = (
            actions["Apply_to_each"]["actions"]["Condition"]["actions"]
            ["For_each"]["actions"]["Condition_1"]["actions"]
            ["Condition_Thread_Found"]["actions"]
        )

        create_draft = reply_actions["Create_Reply_Draft"]
        create_parameters = create_draft["inputs"]["parameters"]
        self.assertEqual(create_parameters["Method"], "POST")
        self.assertIn(
            "/messages/@{encodeUriComponent(first(body('Parse_Thread_JSON')?['value'])?['id'])}/createReply",
            create_parameters["Uri"],
        )
        self.assertEqual(
            create_parameters["Body"],
            "@{string(outputs('Compose_Reply_Body'))}",
        )
        self.assertEqual(
            reply_actions["Compose_Reply_Body"]["inputs"],
            {"comment": "@{items('Apply_to_each')?['htmlBody']}"},
            "createReply must receive only the reply comment, not send-style message fields",
        )

        attachment_loop = reply_actions["For_each_Reply_Attachment"]
        self.assertEqual(
            attachment_loop["foreach"],
            "@coalesce(items('Apply_to_each')?['attachments'], json('[]'))",
        )
        attachment_parameters = (
            attachment_loop["actions"]["Add_Reply_Attachment"]
            ["inputs"]["parameters"]
        )
        self.assertEqual(attachment_parameters["Method"], "POST")
        self.assertIn(
            "/messages/@{encodeUriComponent(body('Create_Reply_Draft')?['id'])}/attachments",
            attachment_parameters["Uri"],
        )
        self.assertEqual(
            attachment_parameters["Body"],
            "@{string(items('For_each_Reply_Attachment'))}",
        )

        graph_actions = []

        def collect_graph_actions(branch):
            for action in branch.values():
                parameters = action.get("inputs", {}).get("parameters", {})
                if "Uri" in parameters:
                    graph_actions.append(parameters)
                collect_graph_actions(action.get("actions", {}))
                collect_graph_actions(action.get("else", {}).get("actions", {}))

        collect_graph_actions(actions)
        graph_uris = [str(action["Uri"]) for action in graph_actions]
        self.assertFalse(
            any(uri.endswith("/reply") or uri.endswith("/send") for uri in graph_uris),
            "the consumer flow may create drafts but must never send them",
        )

        inbox_values = actions["Initialize_DefaultInbox"]["inputs"]["variables"]
        from_values = actions["Initialize_DefaultFrom"]["inputs"]["variables"]
        self.assertEqual(inbox_values[0]["value"], "cullen@loyaltylogo.com")
        self.assertEqual(from_values[0]["value"], "cullen@loyaltylogo.com")


if __name__ == "__main__":
    unittest.main()
