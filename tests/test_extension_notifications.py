"""Per-installation notification outbox tests."""

import importlib
import sys
import types
import unittest
from datetime import datetime
from pathlib import Path

from sqlalchemy import (
    Column, DateTime, Integer, JSON, String, Text, UniqueConstraint,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT.parent / "revstack-backend"
package = sys.modules.setdefault(
    "revstack-backend", types.ModuleType("revstack-backend")
)
package.__path__ = [str(BACKEND)]
logic_package = sys.modules.setdefault(
    "revstack-backend.logic", types.ModuleType("revstack-backend.logic")
)
logic_package.__path__ = [str(BACKEND / "logic")]
NOTIFICATIONS = importlib.import_module(
    "revstack-backend.logic.ExtensionNotificationManager"
)


class Base(DeclarativeBase):
    pass


class ApiKey(Base):
    __tablename__ = "auth_api_keys"

    id = Column(String(36), primary_key=True)
    scopes = Column(JSON, nullable=False, default=list)
    revoked_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)


class Notification(Base):
    __tablename__ = "extension_notifications"
    __table_args__ = (
        UniqueConstraint(
            "owner_credential_id", "dedup_key",
            name="uq_extension_notification_owner_dedup",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    owner_credential_id = Column(String(36), nullable=False, index=True)
    topic = Column(String(80), nullable=False)
    kind = Column(String(48), nullable=False)
    level = Column(String(16), nullable=False)
    title = Column(String(160), nullable=False)
    body = Column(Text, nullable=False)
    action = Column(JSON, nullable=True)
    presentation = Column(JSON, nullable=True)
    source = Column(String(48), nullable=False)
    dedup_key = Column(String(180), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)
    dismissed_at = Column(DateTime, nullable=True)
    acted_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class Models:
    AuthApiKey = ApiKey
    ExtensionNotification = Notification


class ExtensionNotificationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        with NOTIFICATIONS.Session(self.engine) as session:
            session.add_all([
                ApiKey(id="a" * 36, scopes=["client:extension"]),
                ApiKey(id="b" * 36, scopes=["client:extension"]),
                ApiKey(id="c" * 36, scopes=["admin"]),
            ])
            session.commit()
        self.service = NOTIFICATIONS.ExtensionNotificationService(
            engine=self.engine, models=Models,
        )

    def tearDown(self):
        self.engine.dispose()

    def test_poll_is_scoped_to_the_authenticated_installation(self):
        first, created = self.service.enqueue(
            owner_credential_id="a" * 36,
            topic="mockup.completed",
            title="Mockups are ready",
            body="Your Venture Towel images are ready.",
            action={
                "label": "View batch",
                "payload": (
                    '{"command":"open_mockup_batch","batch_id":"batch_'
                    + ("1" * 32)
                    + '"}'
                ),
            },
            presentation={"type": "action"},
            dedup_key="batch:one:completed",
        )
        self.assertTrue(created)
        self.service.enqueue(
            owner_credential_id="b" * 36,
            topic="general",
            title="Other user",
            body="This must not leak.",
        )

        payload = self.service.poll(
            owner_credential_id="a" * 36, after=0,
        )
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["notifications"][0]["id"], first["id"])
        self.assertEqual(
            payload["notifications"][0]["action"]["payload"],
            (
                '{"command":"open_mockup_batch","batch_id":"batch_'
                + ("1" * 32)
                + '"}'
            ),
        )
        self.assertEqual(
            payload["notifications"][0]["presentation"]["type"],
            "action",
        )

    def test_deduplication_and_receipts_are_idempotent(self):
        args = {
            "owner_credential_id": "a" * 36,
            "topic": "message.received",
            "title": "New message",
            "body": "A customer replied.",
            "dedup_key": "message:123",
        }
        first, first_created = self.service.enqueue(**args)
        second, second_created = self.service.enqueue(**args)
        self.assertTrue(first_created)
        self.assertFalse(second_created)
        self.assertEqual(first["id"], second["id"])

        result = self.service.receipt(
            owner_credential_id="a" * 36,
            notification_ids=[first["id"]],
            state="acted",
        )
        self.assertTrue(result["updated"])
        row = self.service.poll(
            owner_credential_id="a" * 36, after=0,
        )["notifications"][0]
        self.assertIsNotNone(row["delivered_at"])
        self.assertIsNotNone(row["read_at"])
        self.assertIsNotNone(row["acted_at"])

    def test_rejects_non_extension_recipients_and_arbitrary_actions(self):
        with self.assertRaisesRegex(
            NOTIFICATIONS.ExtensionNotificationError,
            "not an extension installation",
        ):
            self.service.enqueue(
                owner_credential_id="c" * 36,
                topic="general",
                title="No",
                body="Not an extension.",
            )
        with self.assertRaisesRegex(
            NOTIFICATIONS.ExtensionNotificationError,
            "Unsupported notification action field",
        ):
            self.service.enqueue(
                owner_credential_id="a" * 36,
                topic="general",
                title="Unsafe",
                body="No arbitrary navigation.",
                action={
                    "label": "Open",
                    "payload": '{"command":"open_url"}',
                    "url": "https://example.test",
                },
            )

    def test_fanout_targets_only_the_requested_active_installations(self):
        result = self.service.fanout(
            credential_ids=["a" * 36, "b" * 36],
            topic="announcement",
            title="Scheduled update",
            body="A new toolkit update is available.",
            dedup_key="announcement:2026-07-24",
        )
        self.assertEqual(result["recipient_count"], 2)
        self.assertEqual(len(result["created"]), 2)
        self.assertEqual(result["failed"], [])


if __name__ == "__main__":
    unittest.main()
