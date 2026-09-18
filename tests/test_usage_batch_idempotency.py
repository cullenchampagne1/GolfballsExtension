"""Transactional acknowledgement contract for extension telemetry batches."""

import importlib.util
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException
from sqlalchemy import Boolean, Column, DateTime, Integer, String, create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, declarative_base


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "golfballs_usage_batch_client_api", ROOT / ".revstack" / "logic" / "client_api.py"
)
client_api = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = client_api
SPEC.loader.exec_module(client_api)


class UsageBatchIdempotencyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base = declarative_base()

        class UsageSession(Base):
            __tablename__ = "extension_usage_sessions"
            id = Column(String(36), primary_key=True)
            owner_credential_id = Column(String(36), nullable=False)
            started_at = Column(DateTime, nullable=False)
            last_seen_at = Column(DateTime, nullable=False)
            surface = Column(String(64), nullable=True)
            ping_ms = Column(Integer, nullable=True)
            events = Column(Integer, nullable=False, default=0)
            dropped = Column(Integer, nullable=False, default=0)

        class UsageBatch(Base):
            __tablename__ = "extension_usage_batches"
            id = Column(String(36), primary_key=True)
            owner_credential_id = Column(String(36), nullable=False)
            session_id = Column(String(36), nullable=False)
            extension_version = Column(String(40), nullable=True)
            payload_sha256 = Column(String(64), nullable=False)
            event_count = Column(Integer, nullable=False, default=0)
            dropped = Column(Integer, nullable=False, default=0)
            accepted_at = Column(DateTime, nullable=False)

        class UsageEvent(Base):
            __tablename__ = "extension_usage_events"
            id = Column(Integer, primary_key=True, autoincrement=True)
            owner_credential_id = Column(String(36), nullable=False)
            session_id = Column(String(36), nullable=False)
            kind = Column(String(16), nullable=False)
            surface = Column(String(64), nullable=True)
            surface_kind = Column(String(16), nullable=True)
            feature = Column(String(48), nullable=True)
            source = Column(String(32), nullable=True)
            transport = Column(String(16), nullable=True)
            count = Column(Integer, nullable=False, default=1)
            word_count = Column(Integer, nullable=False, default=0)
            attachment_count = Column(Integer, nullable=False, default=0)
            inline_image_count = Column(Integer, nullable=False, default=0)
            subject_cluster_id = Column(String(8192), nullable=True)
            template_id = Column(String(200), nullable=True)
            template_name = Column(String(160), nullable=True)
            template_variation_id = Column(String(200), nullable=True)
            template_variation_name = Column(String(160), nullable=True)
            condition_count = Column(Integer, nullable=False, default=0)
            conditions_matched = Column(Boolean, nullable=True)
            conditions_enforced = Column(Boolean, nullable=False, default=False)
            account_territory_id = Column(String(64), nullable=True)
            account_territory_name = Column(String(160), nullable=True)
            last_emailed_at = Column(DateTime, nullable=True)
            duration_ms = Column(Integer, nullable=True)
            ok = Column(Boolean, nullable=False, default=True)
            occurred_at = Column(DateTime, nullable=False)

        cls.Base = Base
        cls.UsageSession = UsageSession
        cls.UsageBatch = UsageBatch
        cls.UsageEvent = UsageEvent

    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        self.Base.metadata.create_all(self.engine)
        models = SimpleNamespace(
            ExtensionUsageSession=self.UsageSession,
            ExtensionUsageBatch=self.UsageBatch,
            ExtensionUsageEvent=self.UsageEvent,
        )
        self.analytics = SimpleNamespace(mark_dirty=mock.Mock())
        self.api = client_api.ExtensionClientApi(
            auth_manager=SimpleNamespace(engine=self.engine),
            models=models,
            settings_policy_store=SimpleNamespace(),
            settings_policy_error=RuntimeError,
            client_scope="client:extension",
            project_dir=ROOT,
            public_origin="https://api.cullenchampagne.com",
            analytics_manager=self.analytics,
        )
        self.principal = SimpleNamespace(credential_id="installation-1")
        self.api.principal = lambda _request: self.principal

    @staticmethod
    def _body(**updates):
        payload = {
            "batch_id": "12345678-1234-4234-8234-123456789abc",
            "session_id": "87654321-4321-4234-8234-cba987654321",
            "extension_version": "3.5.4",
            "started_at": 1_789_700_000_000,
            "events": [{
                "kind": "feature", "feature": "email_send",
                "source": "popup", "transport": "pa", "count": 1,
            }],
        }
        payload.update(updates)
        return client_api.UsageBatch.model_validate(payload)

    def test_replayed_batch_acknowledges_without_counting_events_twice(self):
        request = SimpleNamespace(state=SimpleNamespace(principal=self.principal))

        first = json.loads(self.api.usage(self._body(), request).body)
        replay = json.loads(self.api.usage(self._body(), request).body)

        self.assertEqual(first, {
            "ok": True,
            "batch_id": "12345678-1234-4234-8234-123456789abc",
            "accepted": 1,
            "duplicate": False,
        })
        self.assertTrue(replay["duplicate"])
        with Session(self.engine) as session:
            self.assertEqual(session.query(self.UsageEvent).count(), 1)
            self.assertEqual(session.query(self.UsageBatch).count(), 1)
            usage_session = session.get(
                self.UsageSession, "87654321-4321-4234-8234-cba987654321",
            )
            self.assertEqual(usage_session.events, 1)
        self.analytics.mark_dirty.assert_called_once()

    def test_reusing_batch_id_for_different_payload_is_rejected(self):
        request = SimpleNamespace(state=SimpleNamespace(principal=self.principal))
        self.api.usage(self._body(), request)

        with self.assertRaises(HTTPException) as raised:
            self.api.usage(self._body(dropped=1), request)

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail["code"], "usage_batch_conflict")

    def test_database_failure_returns_retryable_non_success_response(self):
        request = SimpleNamespace(state=SimpleNamespace(principal=self.principal))
        with mock.patch.object(
            self.api, "_usage_write", side_effect=SQLAlchemyError("database unavailable"),
        ):
            response = self.api.usage(self._body(), request)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(json.loads(response.body)["code"], "telemetry_write_failed")


if __name__ == "__main__":
    unittest.main()
