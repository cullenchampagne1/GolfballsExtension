"""Database-owned settings policy and per-installation override tests."""

import importlib.util
import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import Boolean, Column, DateTime, JSON, String, create_engine
from sqlalchemy.orm import Session, declarative_base
from sqlalchemy.pool import StaticPool


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "golfballs_settings_policy", ROOT / ".revstack" / "logic" / "settings_policy.py"
)
settings_policy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(settings_policy)

Base = declarative_base()


class Policy(Base):
    __tablename__ = "extension_settings_policies"
    policy_id = Column(String(32), primary_key=True)
    document = Column(JSON, nullable=False)
    seeded_from = Column(String(120))
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class Override(Base):
    __tablename__ = "extension_setting_overrides"
    credential_id = Column(String(36), primary_key=True)
    setting_path = Column(String(512), primary_key=True)
    has_value_override = Column(Boolean, nullable=False, default=False)
    value_override = Column(JSON)
    hidden_override = Column(Boolean)
    managed_override = Column(Boolean)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class FakeLegacyConfig:
    def __init__(self, document):
        self.document = document
        self.read_count = 0

    def read(self, name):
        self.read_count += 1
        return name, "legacy source", json.loads(json.dumps(self.document))


class SettingsPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.project_dir = Path(self.temporary.name)
        registry = {
            "schemaVersion": 1,
            "features": {
                "featureEnabled": {"type": "bool", "default": True, "label": "Feature", "managedDefault": True},
                "workflowManagerEnabled": {"type": "bool", "default": True, "label": "Workflow Manager", "managedDefault": True},
            },
            "developerSettings": {
                "density": {"type": "select", "default": "compact", "options": ["compact", "roomy"], "label": "Density", "managedDefault": True},
                "workflowManager.scale": {"type": "number", "default": 1.2, "min": 0.5, "max": 2, "label": "Workflow Manager: zoom scale", "managedDefault": True},
            },
            "customPageScopes": {
                "orders": {"type": "bool", "default": False, "pageIds": ["orders"]},
                "all": {"type": "bool", "default": False, "label": "Custom Pages", "pageIds": ["contact_details"]},
            },
            "customPages": {"type": "bool", "default": True, "label": "Custom pages"},
        }
        source = (
            "(function (root) {\n  root.GB_SETTINGS_REGISTRY = Object.freeze("
            + json.dumps(registry)
            + ");\n})(globalThis);\n"
        )
        (self.project_dir / "settings-registry.js").write_text(source, encoding="utf-8")
        self.document = {
            "schema_version": 1,
            "refresh_minutes": 15,
            "developer_section": {"hidden": False},
            "features": {
                "featureEnabled": {"value": True, "hidden": False, "managed": True, "label": "Feature"},
                "workflowManagerEnabled": {"value": True, "hidden": False, "managed": True, "label": "Workflow Manager"},
            },
            "developer_settings": {
                "density": {"value": "compact", "hidden": False, "managed": True, "label": "Density"},
                "workflowManager.scale": {"value": 1.2, "hidden": False, "managed": True, "label": "Workflow Manager: zoom scale"},
            },
            "custom_pages": {
                "value": True, "hidden": False, "managed": True, "label": "Custom pages",
                "scopes": {
                    "orders": {"value": False, "hidden": False, "managed": True, "label": "Orders"},
                    "all": {"value": False, "hidden": False, "managed": True, "label": "Custom Pages"},
                },
            },
        }
        self.legacy = FakeLegacyConfig(self.document)
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)
        self.store = settings_policy.SettingsPolicyStore(
            engine=self.engine,
            models=SimpleNamespace(
                ExtensionSettingsPolicy=Policy,
                ExtensionSettingOverride=Override,
            ),
            config_access_manager=self.legacy,
            config_error=RuntimeError,
            project_dir=self.project_dir,
        )

    def tearDown(self):
        self.engine.dispose()
        self.temporary.cleanup()

    def test_legacy_yaml_seeds_once_and_is_not_a_runtime_source(self):
        seeded = self.store.global_document()
        self.legacy.document["features"]["featureEnabled"]["value"] = False
        reread = self.store.global_document()
        self.assertTrue(seeded["features"]["featureEnabled"]["value"])
        self.assertTrue(reread["features"]["featureEnabled"]["value"])
        self.assertEqual(self.legacy.read_count, 1)

    def test_global_database_edit_does_not_write_legacy_configuration(self):
        self.store.update_global(
            ["developer_settings", "density"], value_marker=True, value="roomy",
            hidden_marker=True, hidden=True,
        )
        updated = self.store.global_document()["developer_settings"]["density"]
        self.assertEqual(updated["value"], "roomy")
        self.assertTrue(updated["hidden"])
        self.assertEqual(self.legacy.document["developer_settings"]["density"]["value"], "compact")

    def test_visibility_management_and_value_are_independent_policy_axes(self):
        original = self.store.entry_for_path(["features", "featureEnabled"])
        self.assertTrue(original["value"])
        self.assertTrue(original["managed"])

        hidden = self.store.update_global(
            ["features", "featureEnabled"], hidden_marker=True, hidden=True,
        )
        self.assertTrue(hidden["hidden"])
        self.assertTrue(hidden["value"], "hiding must not force a boolean setting off")
        self.assertTrue(hidden["managed"], "hiding must not hand management back")

        user_controlled = self.store.update_global(
            ["features", "featureEnabled"], managed_marker=True, managed=False,
        )
        self.assertTrue(user_controlled["hidden"])
        self.assertTrue(user_controlled["value"])
        self.assertFalse(user_controlled["managed"])

    def test_user_override_resolves_without_changing_global_policy(self):
        self.store.set_override(
            "install-1", ["features", "featureEnabled"],
            value_mode="override", value=False,
            hidden_mode="hidden", managed_mode="unmanaged",
        )
        resolved, revision = self.store.resolve("install-1")
        effective = resolved["features"]["featureEnabled"]
        self.assertFalse(effective["value"])
        self.assertTrue(effective["hidden"])
        self.assertFalse(effective["managed"])
        self.assertRegex(revision, r"^[a-f0-9]{64}$")
        self.assertTrue(self.store.global_document()["features"]["featureEnabled"]["value"])
        self.assertTrue(self.store.clear_override("install-1", ["features", "featureEnabled"]))
        restored, _ = self.store.resolve("install-1")
        self.assertTrue(restored["features"]["featureEnabled"]["value"])

    def test_registry_type_validation_rejects_invalid_values(self):
        with self.assertRaises(settings_policy.SettingsPolicyError):
            self.store.update_global(
                ["developer_settings", "density"], value_marker=True, value="giant"
            )

    def test_new_registry_settings_are_added_without_returning_to_yaml(self):
        self.store.global_document()
        self.store.registry["features"]["newFeature"] = {
            "type": "bool", "default": False, "label": "New feature",
            "managedDefault": True,
        }
        reconciled = self.store.global_document()
        self.assertEqual(reconciled["features"]["newFeature"], {
            "value": False, "hidden": False, "managed": True,
            "label": "New feature",
        })
        self.assertEqual(self.legacy.read_count, 1)

    def test_email_capability_controls_reconcile_as_managed_backend_settings(self):
        source = (ROOT / "settings-registry.js").read_text(encoding="utf-8")
        registry = json.loads(settings_policy._REGISTRY.search(source).group(1))
        expected = {
            "emailTemplates.allowCreation": (True, "Email Template Creation"),
            "emailTemplates.allowParentAccount": (
                False, "Email Template Parent Account"
            ),
            "emailTemplates.allowLinkImport": (
                True, "Email Template Link Import"
            ),
            "emailTemplates.allowLocalTemplateUsage": (
                True, "Allow Local Template Usage"
            ),
            "emailTemplates.maxDailyBulkSend": (0, "Max Daily Bulk Send"),
            "emailTemplates.allowBulkSending": (True, "Allow Bulk Sending"),
        }

        self.store.global_document()
        for key in expected:
            self.store.registry["developerSettings"][key] = registry[
                "developerSettings"
            ][key]
        reconciled = self.store.global_document()["developer_settings"]

        for key, (value, label) in expected.items():
            self.assertEqual(reconciled[key], {
                "value": value,
                "hidden": False,
                "managed": True,
                "label": label,
            })
        self.assertEqual(self.legacy.read_count, 1)

    def test_published_342_clients_receive_an_exact_compatible_projection(self):
        source = (ROOT / "settings-registry.js").read_text(encoding="utf-8")
        registry = json.loads(settings_policy._REGISTRY.search(source).group(1))

        def entry(spec):
            return {
                "value": spec.get("default"),
                "hidden": False,
                "managed": spec.get("managedDefault", True) is True,
                "label": spec.get("label", "Setting"),
            }

        document = {
            "schema_version": 1,
            "refresh_minutes": 15,
            "developer_section": {"hidden": False},
            "features": {
                key: entry(spec) for key, spec in registry["features"].items()
            },
            "developer_settings": {
                key: entry(spec)
                for key, spec in registry["developerSettings"].items()
            },
            "custom_pages": {
                **entry(registry["customPages"]),
                "scopes": {
                    key: entry(spec)
                    for key, spec in registry["customPageScopes"].items()
                },
            },
        }
        document["features"]["powerAutomateEnabled"]["hidden"] = False
        document["features"]["workflowManagerEnabled"]["hidden"] = True
        document["developer_settings"]["workflowManager.scale"]["value"] = 0.5
        document["developer_settings"][
            "golfballViewer.printAreaScale"
        ]["value"] = 0.1
        document["custom_pages"]["scopes"]["all"]["hidden"] = True

        projected, selected = self.store.project_client_document(document, None)

        self.assertEqual(selected, "3.4.2")
        self.assertEqual(set(projected["features"]), set(
            settings_policy._LEGACY_342_FEATURE_KEYS
        ))
        self.assertEqual(len(projected["features"]), 23)
        self.assertEqual(set(projected["developer_settings"]), set(
            settings_policy._LEGACY_342_DEVELOPER_KEYS
        ))
        self.assertEqual(len(projected["developer_settings"]), 121)
        self.assertEqual(set(projected["custom_pages"]["scopes"]), {"crm"})

        legacy_feature_specs = {
            key: (
                {"type": "bool"}
                if key == "submitProofEnabled"
                else registry["features"][
                    "workflowManagerEnabled"
                    if key == "campaignManagerEnabled" else key
                ]
            ) for key in settings_policy._LEGACY_342_FEATURE_KEYS
        }
        legacy_developer_specs = {
            key: (
                {
                    **registry["developerSettings"]["workflowManager.scale"],
                    "min": 1,
                }
                if key == "campaignManager.scale"
                else registry["developerSettings"][key]
            ) for key in settings_policy._LEGACY_342_DEVELOPER_KEYS
        }
        legacy_developer_specs["golfballViewer.printAreaScale"] = {
            **legacy_developer_specs["golfballViewer.printAreaScale"],
            "min": 0.2, "max": 1.5,
        }

        def assert_legacy_value(spec, value):
            kind = spec["type"]
            if kind == "bool":
                self.assertIs(type(value), bool)
            elif kind == "string":
                self.assertIsInstance(value, str)
            elif kind == "number":
                self.assertIn(type(value), {int, float})
                self.assertGreaterEqual(value, spec.get("min", value))
                self.assertLessEqual(value, spec.get("max", value))
            elif kind == "select":
                self.assertIn(value, spec["options"])
            else:
                self.fail(f"Unsupported legacy test type: {kind}")

        for key, spec in legacy_feature_specs.items():
            assert_legacy_value(spec, projected["features"][key]["value"])
        for key, spec in legacy_developer_specs.items():
            assert_legacy_value(
                spec, projected["developer_settings"][key]["value"]
            )
        self.assertFalse(
            projected["features"]["powerAutomateEnabled"]["hidden"],
            "the global shown state must clear Clay's stale hidden snapshot",
        )
        self.assertTrue(
            projected["features"]["campaignManagerEnabled"]["hidden"]
        )
        self.assertTrue(projected["features"]["submitProofEnabled"]["value"])
        self.assertEqual(
            projected["developer_settings"]["golfballViewer.printAreaScale"]["value"],
            0.2,
        )
        self.assertEqual(
            projected["developer_settings"]["campaignManager.scale"]["value"],
            1,
        )
        self.assertTrue(projected["custom_pages"]["scopes"]["crm"]["hidden"])

        current, current_selected = self.store.project_client_document(
            document, "3.4.6",
        )
        self.assertEqual(current_selected, "current")
        self.assertEqual(current, document)
        self.assertIsNot(current, document)
        self.assertEqual(self.store.client_registry("not-a-version"), "3.4.2")

    def test_renamed_settings_and_override_paths_keep_values_and_refresh_labels(self):
        legacy_document = json.loads(json.dumps(self.document))
        legacy_document["features"]["campaignManagerEnabled"] = {
            "value": False, "hidden": True, "managed": False,
            "label": "Campaign Manager",
        }
        legacy_document["features"]["submitProofEnabled"] = {
            "value": False, "hidden": False, "managed": True,
            "label": "Submit Proof",
        }
        del legacy_document["features"]["workflowManagerEnabled"]
        legacy_document["developer_settings"]["campaignManager.scale"] = {
            "value": 0.75, "hidden": True, "managed": False,
            "label": "Campaign Manager: zoom scale",
        }
        del legacy_document["developer_settings"]["workflowManager.scale"]
        legacy_document["custom_pages"]["scopes"]["crm"] = {
            "value": True, "hidden": True, "managed": False,
            "label": "CRM",
        }
        del legacy_document["custom_pages"]["scopes"]["all"]

        now = datetime.utcnow()
        with Session(self.engine) as session:
            session.add(Policy(
                policy_id=settings_policy.GLOBAL_POLICY_ID,
                document=legacy_document,
                seeded_from="existing database",
                created_at=now,
                updated_at=now,
            ))
            session.add(Override(
                credential_id="install-legacy",
                setting_path=settings_policy._path_key(
                    ["features", "campaignManagerEnabled"]
                ),
                has_value_override=True,
                value_override=True,
                hidden_override=False,
                managed_override=True,
                created_at=now,
                updated_at=now,
            ))
            session.commit()

        migrated = self.store.global_document()
        self.assertNotIn("campaignManagerEnabled", migrated["features"])
        self.assertNotIn("submitProofEnabled", migrated["features"])
        self.assertEqual(migrated["features"]["workflowManagerEnabled"], {
            "value": False, "hidden": True, "managed": False,
            "label": "Workflow Manager",
        })
        self.assertNotIn("campaignManager.scale", migrated["developer_settings"])
        self.assertEqual(migrated["developer_settings"]["workflowManager.scale"], {
            "value": 0.75, "hidden": True, "managed": False,
            "label": "Workflow Manager: zoom scale",
        })
        self.assertNotIn("crm", migrated["custom_pages"]["scopes"])
        self.assertEqual(migrated["custom_pages"]["scopes"]["all"], {
            "value": True, "hidden": True, "managed": False,
            "label": "Custom Pages",
        })

        resolved, _ = self.store.resolve("install-legacy")
        self.assertTrue(resolved["features"]["workflowManagerEnabled"]["value"])
        overrides = self.store.overrides("install-legacy")
        self.assertEqual(overrides[0]["path"], [
            "features", "workflowManagerEnabled",
        ])
        self.assertEqual(overrides[0]["path_key"], settings_policy._path_key([
            "features", "workflowManagerEnabled",
        ]))


if __name__ == "__main__":
    unittest.main()
