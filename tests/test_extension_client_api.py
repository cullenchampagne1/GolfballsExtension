"""Database-backed extension access and consumer flow package tests."""

import importlib.util
import io
import json
import unittest
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, String, create_engine
from sqlalchemy.orm import Session, declarative_base


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
    def __init__(self, parent_ids=()):
        self.calls = []
        self.parent_ids = set(parent_ids)

    def resolve(self, credential_id):
        return ({
            "developer_settings": {
                "emailTemplates.allowParentAccount": {
                    "value": credential_id in self.parent_ids,
                },
                "emailTemplates.allowLocalTemplateUsage": {"value": True},
            },
        }, "database-revision")

    def resolve_client(self, credential_id, extension_version):
        self.calls.append((credential_id, extension_version))
        registry = "current" if extension_version else "3.4.2"
        return ({
            "schema_version": 1,
            "credential_id": credential_id,
        }, "database-revision", registry)


class FakeNotifications:
    def __init__(self):
        self.enqueued = []
        self.fanouts = []

    def enqueue(self, **payload):
        self.enqueued.append(payload)
        return ({"id": len(self.enqueued)}, True)

    def fanout(self, **payload):
        self.fanouts.append(payload)
        return {
            "created": list(range(len(payload.get("credential_ids") or []))),
            "existing": [], "failed": [],
            "recipient_count": len(payload.get("credential_ids") or []),
        }

    def active_installation_ids(self):
        return ["owner-install", "parent-two", "recipient-install"]


class ExtensionClientAccessTests(unittest.TestCase):
    def setUp(self):
        FakeSession.rows = {}
        models = SimpleNamespace(ExtensionInstallationAccess=Access)
        auth = SimpleNamespace(engine=object())
        self.settings_policy = FakeSettingsPolicy()
        self.api = client_api_module.ExtensionClientApi(
            auth_manager=auth,
            models=models,
            settings_policy_store=self.settings_policy,
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

    def request(self, extension_version=None):
        query_params = (
            {"extension_version": extension_version}
            if extension_version is not None else {}
        )
        return SimpleNamespace(
            state=SimpleNamespace(principal=self.principal),
            query_params=query_params,
        )

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
        self.assertEqual(payload["configuration_registry"], "3.4.2")
        self.assertEqual(payload["configuration"]["credential_id"], "install-1")
        self.assertFalse(payload["admin_bypass"])
        self.assertEqual(self.settings_policy.calls[-1], ("install-1", None))

    def test_configuration_negotiates_the_current_registry_by_client_version(self):
        self.api.auth_manager.authenticate_session_cookie = lambda _request: None
        response = self.api.configuration(self.request("3.4.6"))
        payload = json.loads(response.body)
        self.assertEqual(payload["configuration_registry"], "current")
        self.assertEqual(self.settings_policy.calls[-1], ("install-1", "3.4.6"))

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


class EmailTemplateShareLifecycleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base = declarative_base()

        class AccessRow(Base):
            __tablename__ = "extension_installation_access"
            subject_id = Column(String(36), primary_key=True)
            extension_enabled = Column(Boolean, nullable=True)
            assistant_enabled = Column(Boolean, nullable=True)

        class IdentityRow(Base):
            __tablename__ = "extension_installation_identities"
            credential_id = Column(String(36), primary_key=True)
            display_name = Column(String(120), nullable=False)
            local_part = Column(String(64), nullable=True)
            source = Column(String(32), nullable=False)

        class ShareRow(Base):
            __tablename__ = "extension_email_template_shares"
            id = Column(String(64), primary_key=True)
            owner_credential_id = Column(String(36), nullable=False, index=True)
            name = Column(String(120), nullable=False)
            template = Column(JSON, nullable=False)
            created_at = Column(DateTime, nullable=False)
            expires_at = Column(DateTime, nullable=False)
            access_count = Column(Integer, nullable=False, default=0)
            revoked_at = Column(DateTime, nullable=True)

        class ImportRow(Base):
            __tablename__ = "extension_email_template_share_imports"
            share_id = Column(String(64), primary_key=True)
            credential_id = Column(String(36), primary_key=True, index=True)
            imported_at = Column(DateTime, nullable=False)

        class ManagedRow(Base):
            __tablename__ = "extension_managed_email_templates"
            id = Column(String(64), primary_key=True)
            client_template_id = Column(String(160), nullable=False)
            created_by_credential_id = Column(String(36), nullable=False, index=True)
            last_editor_credential_id = Column(String(36), nullable=False, index=True)
            template = Column(JSON, nullable=False)
            version = Column(Integer, nullable=False, default=1)
            created_at = Column(DateTime, nullable=False)
            updated_at = Column(DateTime, nullable=False, index=True)
            deleted_at = Column(DateTime, nullable=True, index=True)

        cls.Base = Base
        cls.models = SimpleNamespace(
            ExtensionInstallationAccess=AccessRow,
            ExtensionInstallationIdentity=IdentityRow,
            ExtensionEmailTemplateShare=ShareRow,
            ExtensionEmailTemplateShareImport=ImportRow,
            ExtensionManagedEmailTemplate=ManagedRow,
        )

    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        self.Base.metadata.create_all(self.engine)
        self.auth = SimpleNamespace(engine=self.engine)
        self.notifications = FakeNotifications()
        self.settings_policy = FakeSettingsPolicy({"owner-install", "parent-two"})
        self.api = client_api_module.ExtensionClientApi(
            auth_manager=self.auth,
            models=self.models,
            settings_policy_store=self.settings_policy,
            settings_policy_error=RuntimeError,
            client_scope="client:extension",
            project_dir=ROOT,
            public_origin="https://api.cullenchampagne.com",
            notification_service=self.notifications,
        )
        self.owner = self._principal("owner-install")
        self.recipient = self._principal("recipient-install")
        self.parent_two = self._principal("parent-two")
        with Session(self.engine) as session:
            session.add(self.models.ExtensionInstallationIdentity(
                credential_id=self.owner.credential_id,
                display_name="Template Owner", source="settings_edit",
            ))
            session.add(self.models.ExtensionInstallationIdentity(
                credential_id=self.parent_two.credential_id,
                display_name="Parent Two", source="settings_edit",
            ))
            session.commit()

    @staticmethod
    def _principal(credential_id):
        return SimpleNamespace(
            auth_type="api_key", credential_id=credential_id,
            scopes=["client:extension"],
        )

    @staticmethod
    def _request(principal):
        return SimpleNamespace(state=SimpleNamespace(principal=principal), query_params={})

    def _seed_share(self, *, expired=True):
        share_id = "T" * 32
        now = datetime.utcnow()
        with Session(self.engine) as session:
            session.add(self.models.ExtensionEmailTemplateShare(
                id=share_id,
                owner_credential_id=self.owner.credential_id,
                name="Permanent follow-up",
                template={
                    "name": "Permanent follow-up", "type": "order",
                    "subject": "Checking in", "body": "<p>Hello</p>",
                    "variations": [{"label": "Short", "body": "Hi"}],
                },
                created_at=now,
                expires_at=now - timedelta(days=30) if expired else datetime.max,
                access_count=0,
            ))
            session.commit()
        return share_id

    @staticmethod
    def _payload(response):
        return json.loads(response.body)

    @staticmethod
    def _managed_write(template, **values):
        return client_api_module.ManagedEmailTemplateWrite(
            client_template_id=values.pop("client_template_id", "welcome-template"),
            template=template,
            **values,
        )

    @staticmethod
    def _managed_body(templates, removed_ids=None):
        return SimpleNamespace(templates=templates, removed_ids=removed_ids or [])

    def test_managed_bucket_requires_parent_and_is_readable_by_managed_users(self):
        template = {
            "name": "Approved welcome", "type": "order",
            "subject": "Welcome", "body": "<p>Hello</p>",
        }
        with self.assertRaises(HTTPException) as raised:
            self.api.update_managed_email_bucket(
                self._managed_body([self._managed_write(template)]),
                self._request(self.recipient),
            )
        self.assertEqual(raised.exception.status_code, 403)

        created = self._payload(self.api.update_managed_email_bucket(
            self._managed_body([self._managed_write(template)]),
            self._request(self.owner),
        ))
        self.assertTrue(created["is_parent"])
        self.assertEqual(created["templates"][0]["client_template_id"], "welcome-template")
        self.assertTrue(created["templates"][0]["created_by_current"])

        child = self._payload(self.api.get_managed_email_bucket(
            self._request(self.recipient),
        ))
        self.assertFalse(child["is_parent"])
        self.assertFalse(child["templates"][0]["created_by_current"])
        self.assertEqual(child["templates"][0]["created_by"], "Template Owner")
        self.assertEqual(child["templates"][0]["template"]["subject"], "Welcome")
        self.assertEqual(self.notifications.fanouts[-1]["event"]["type"], "managed_email_templates.changed")
        self.assertFalse(self.notifications.fanouts[-1]["visible"])

        bucket_id = created["templates"][0]["id"]
        removed = self._payload(self.api.update_managed_email_bucket(
            self._managed_body([], [bucket_id]), self._request(self.parent_two),
        ))
        self.assertEqual(removed["templates"], [], "any parent controls the shared bucket")
        restored = self._payload(self.api.update_managed_email_bucket(
            self._managed_body([self._managed_write(template)]), self._request(self.owner),
        ))
        self.assertEqual(restored["templates"][0]["template"]["name"], "Approved welcome")

    def test_parent_disjoint_edits_merge_and_overlap_names_the_conflicting_parent(self):
        original = {
            "name": "Approved welcome", "type": "order",
            "subject": "Welcome", "body": "<p>Hello</p>",
        }
        created = self._payload(self.api.update_managed_email_bucket(
            self._managed_body([self._managed_write(original)]), self._request(self.owner),
        ))
        row = created["templates"][0]

        parent_two = {**original, "subject": "Hello from parent two"}
        second = self._payload(self.api.update_managed_email_bucket(
            self._managed_body([self._managed_write(
                parent_two,
                bucket_id=row["id"], base_version=row["version"],
                base_template=original, client_template_id="parent-two-copy",
            )]), self._request(self.parent_two),
        ))
        self.assertEqual(second["templates"][0]["version"], 2)

        stale_overlap = {**original, "subject": "Owner competing subject"}
        conflict = self._payload(self.api.update_managed_email_bucket(
            self._managed_body([self._managed_write(
                stale_overlap,
                bucket_id=row["id"], base_version=1, base_template=original,
            )]), self._request(self.owner),
        ))
        self.assertEqual(conflict["sync_conflicts"][0]["with"], "Parent Two")
        self.assertIn("subject", conflict["sync_conflicts"][0]["paths"])
        self.assertTrue(self.notifications.enqueued[-1]["visible"])

        owner_body_edit = {**original, "body": "<p>Owner changed the body</p>"}
        merged = self._payload(self.api.update_managed_email_bucket(
            self._managed_body([self._managed_write(
                owner_body_edit,
                bucket_id=row["id"], base_version=1, base_template=original,
            )]), self._request(self.owner),
        ))
        self.assertEqual(merged["sync_conflicts"], [])
        self.assertEqual(merged["templates"][0]["template"]["subject"], "Hello from parent two")
        self.assertEqual(merged["templates"][0]["template"]["body"], "<p>Owner changed the body</p>")

    def test_expired_legacy_row_is_permanent_and_payload_has_no_ttl(self):
        share_id = self._seed_share(expired=True)
        payload = self._payload(self.api.get_email_share(
            share_id, self._request(self.recipient),
        ))

        self.assertEqual(payload["name"], "Permanent follow-up")
        self.assertEqual(payload["relationship"], "shared")
        self.assertNotIn("expires_at", payload)
        self.assertNotIn("ttl_hours", payload)

    def test_recipient_import_is_listed_read_only_and_removable_without_revocation(self):
        share_id = self._seed_share()
        retained = self._payload(self.api.retain_email_import(
            share_id, self._request(self.recipient),
        ))
        self.assertEqual(retained["relationship"], "imported")

        listed = self._payload(self.api.list_email_shares(
            self._request(self.recipient),
        ))["shares"]
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["relationship"], "imported")
        self.assertEqual(listed[0]["owner_name"], "Template Owner")

        with self.assertRaises(HTTPException) as raised:
            self.api.revoke_email_share(share_id, self._request(self.recipient))
        self.assertEqual(raised.exception.status_code, 404)

        removed = self._payload(self.api.remove_email_import(
            share_id, self._request(self.recipient),
        ))
        self.assertTrue(removed["removed"])
        self.assertEqual(
            self._payload(self.api.list_email_shares(self._request(self.recipient)))["shares"],
            [],
        )
        still_available = self._payload(self.api.get_email_share(
            share_id, self._request(self.recipient),
        ))
        self.assertEqual(still_available["relationship"], "shared")

    def test_creator_keeps_ownership_and_alone_can_revoke(self):
        share_id = self._seed_share()
        self.api.retain_email_import(share_id, self._request(self.recipient))
        owned = self._payload(self.api.get_email_share(
            share_id, self._request(self.owner),
        ))
        self.assertEqual(owned["relationship"], "owned")
        revoked = self._payload(self.api.revoke_email_share(
            share_id, self._request(self.owner),
        ))
        self.assertTrue(revoked["revoked"])
        self.assertEqual(len(self.notifications.enqueued), 1)
        owner_event = self.notifications.enqueued[0]
        self.assertEqual(owner_event["owner_credential_id"], "owner-install")
        self.assertFalse(owner_event["visible"])
        self.assertEqual(owner_event["event"]["type"], "email_templates.changed")
        self.assertEqual(owner_event["event"]["data"]["share_id"], share_id)

        self.assertEqual(len(self.notifications.fanouts), 1)
        recipient_event = self.notifications.fanouts[0]
        self.assertEqual(recipient_event["credential_ids"], ["recipient-install"])
        self.assertTrue(recipient_event["visible"])
        self.assertEqual(
            recipient_event["title"],
            'Template Owner revoked “Permanent follow-up”',
        )

    def test_owner_list_includes_source_snapshot_for_legacy_local_reconciliation(self):
        share_id = self._seed_share()
        owned = self._payload(self.api.list_email_shares(
            self._request(self.owner),
        ))["shares"]
        self.assertEqual(len(owned), 1)
        self.assertEqual(owned[0]["id"], share_id)
        self.assertEqual(owned[0]["relationship"], "owned")
        self.assertEqual(owned[0]["template"]["body"], "<p>Hello</p>")

        self.api.retain_email_import(share_id, self._request(self.recipient))
        imported = self._payload(self.api.list_email_shares(
            self._request(self.recipient),
        ))["shares"]
        self.assertNotIn("template", imported[0])

    def test_owner_diff_versions_share_and_coalesces_visible_notice_per_session(self):
        share_id = self._seed_share()
        self.api.retain_email_import(share_id, self._request(self.recipient))
        session_id = "share-edit-session-0001"

        first = self._payload(self.api.update_email_share(
            share_id,
            client_api_module.EmailTemplateShareUpdate(
                patch={
                    "subject": "Updated subject",
                    "variations": None,
                    "vars": {"signoff": {"type": "literal", "value": "Thanks"}},
                },
                session_id=session_id,
            ),
            self._request(self.owner),
        ))
        self.assertEqual(first["version"], 2)
        self.assertEqual(first["change_count"], 1)
        self.assertEqual(first["template"]["subject"], "Updated subject")
        self.assertNotIn("variations", first["template"])
        self.assertNotIn(client_api_module.EMAIL_SHARE_META, first["template"])

        second = self._payload(self.api.update_email_share(
            share_id,
            client_api_module.EmailTemplateShareUpdate(
                patch={"body": "<p>One more change</p>"},
                session_id=session_id,
            ),
            self._request(self.owner),
        ))
        self.assertEqual(second["version"], 3)
        self.assertEqual(second["change_count"], 2)

        silent = [row for row in self.notifications.fanouts if not row["visible"]]
        visible = [row for row in self.notifications.fanouts if row["visible"]]
        self.assertEqual(len(silent), 2, "every version must invalidate importers")
        self.assertEqual(len(visible), 1, "one editing session produces one notice")
        self.assertEqual(visible[0]["credential_ids"], ["recipient-install"])
        self.assertEqual(
            visible[0]["title"],
            'Template Owner updated “Permanent follow-up”',
        )
        self.assertEqual(silent[-1]["event"]["data"]["version"], 3)

        imported = self._payload(self.api.get_email_share(
            share_id, self._request(self.recipient),
        ))
        self.assertEqual(imported["relationship"], "imported")
        self.assertEqual(imported["version"], 3)
        self.assertEqual(imported["template"]["body"], "<p>One more change</p>")

        with Session(self.engine) as session:
            stored = session.get(self.models.ExtensionEmailTemplateShare, share_id)
            history = stored.template[client_api_module.EMAIL_SHARE_META]["changes"]
            self.assertEqual([change["version"] for change in history], [2, 3])
            self.assertIn("vars.signoff.type", history[0]["paths"])

    def test_share_creation_is_idempotent_for_an_owner_source_template(self):
        request = self._request(self.owner)
        body = client_api_module.EmailTemplateShareCreate(
            template={
                "name": "Persistent source", "type": "order",
                "subject": "Original", "body": "<p>Hello</p>",
            },
            source_template_id="t_local-template-1",
        )
        first = self._payload(self.api.create_email_share(body, request))
        second = self._payload(self.api.create_email_share(
            client_api_module.EmailTemplateShareCreate(
                template={
                    "name": "Persistent source", "type": "order",
                    "subject": "A stale tab", "body": "<p>Different</p>",
                },
                source_template_id="t_local-template-1",
            ),
            request,
        ))

        self.assertEqual(second["id"], first["id"])
        self.assertEqual(second["template"]["subject"], "Original")
        with Session(self.engine) as session:
            self.assertEqual(session.query(
                self.models.ExtensionEmailTemplateShare,
            ).count(), 1)

    def test_non_owner_cannot_patch_a_shared_template(self):
        share_id = self._seed_share()
        with self.assertRaises(HTTPException) as raised:
            self.api.update_email_share(
                share_id,
                client_api_module.EmailTemplateShareUpdate(
                    patch={"subject": "Hijacked"},
                    session_id="share-edit-session-0002",
                ),
                self._request(self.recipient),
            )
        self.assertEqual(raised.exception.status_code, 404)

    def test_share_layer_has_no_payload_count_or_storage_quotas(self):
        source = (ROOT / ".revstack" / "logic" / "client_api.py").read_text()
        for obsolete in (
            "MAX_SHARE_BYTES", "MAX_INSTALLATION_BYTES", "MAX_ACTIVE_SHARES",
            "MAX_ACTIVE_EMAIL_SHARES", "MAX_ACTIVE_PRODUCT_STORES",
            "MAX_PRODUCT_STORE_ITEMS", "per-share limit", "storage quota",
        ):
            self.assertNotIn(obsolete, source)


if __name__ == "__main__":
    unittest.main()
