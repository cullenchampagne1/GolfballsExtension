"""Database-backed Golfballs settings policy with per-installation overrides.

The legacy YAML document is read only to seed an empty database. Normal reads
and every dashboard mutation use the two extension settings tables instead.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import re
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session


GLOBAL_POLICY_ID = "global"
LEGACY_POLICY_NAME = "golfballs-extension-configuration"
MAX_POLICY_BYTES = 1024 * 1024
_REGISTRY = re.compile(
    r"Object\.freeze\((\{.*\})\);\s*\}\)\(globalThis\);\s*$", re.S,
)


class SettingsPolicyError(RuntimeError):
    pass


class SettingsPolicyConflict(SettingsPolicyError):
    pass


def _clone(value):
    return copy.deepcopy(value)


def _path_key(path) -> str:
    if (
        not isinstance(path, (list, tuple))
        or not 1 <= len(path) <= 4
        or any(not isinstance(part, str) or not part or len(part) > 256 for part in path)
    ):
        raise SettingsPolicyError("Setting path is invalid")
    encoded = json.dumps(list(path), ensure_ascii=False, separators=(",", ":"))
    if len(encoded) > 512:
        raise SettingsPolicyError("Setting path is too long")
    return encoded


def _path_from_key(value: str) -> list[str]:
    try:
        path = json.loads(value)
    except (TypeError, ValueError) as exc:
        raise SettingsPolicyError("Stored setting path is invalid") from exc
    _path_key(path)
    return path


def _node(document: dict, path: list[str]) -> dict:
    current = document
    for segment in path:
        if not isinstance(current, dict) or segment not in current:
            raise SettingsPolicyError("Setting was not found")
        current = current[segment]
    if not isinstance(current, dict):
        raise SettingsPolicyError("Setting was not found")
    return current


class SettingsPolicyStore:
    def __init__(
        self, *, engine, models, config_access_manager, config_error,
        project_dir: Path,
    ):
        self.engine = engine
        self.models = models
        self.config_access_manager = config_access_manager
        self.config_error = config_error
        self.project_dir = Path(project_dir)
        self.registry = self._read_registry()

    def _read_registry(self) -> dict:
        path = self.project_dir / "settings-registry.js"
        try:
            source = path.read_text(encoding="utf-8")
        except OSError as exc:
            raise SettingsPolicyError("Extension settings registry is unavailable") from exc
        match = _REGISTRY.search(source)
        if not match:
            raise SettingsPolicyError("Extension settings registry is invalid")
        try:
            registry = json.loads(match.group(1))
        except (TypeError, ValueError) as exc:
            raise SettingsPolicyError("Extension settings registry is invalid") from exc
        if registry.get("schemaVersion") != 1:
            raise SettingsPolicyError("Extension settings registry is unsupported")
        return registry

    @staticmethod
    def revision(document: dict) -> str:
        encoded = json.dumps(
            document, ensure_ascii=False, sort_keys=True,
            separators=(",", ":"), allow_nan=False,
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def _spec(self, path: list[str]) -> dict:
        if path == ["developer_section"]:
            return {"type": "section"}
        if len(path) == 2 and path[0] == "features":
            spec = self.registry.get("features", {}).get(path[1])
        elif len(path) == 2 and path[0] == "developer_settings":
            spec = self.registry.get("developerSettings", {}).get(path[1])
        elif path == ["custom_pages"]:
            spec = self.registry.get("customPages")
        elif len(path) == 3 and path[:2] == ["custom_pages", "scopes"]:
            spec = self.registry.get("customPageScopes", {}).get(path[2])
        else:
            spec = None
        if not isinstance(spec, dict):
            raise SettingsPolicyError("Setting is not registered by this extension")
        return spec

    @staticmethod
    def _validate_value(spec: dict, value):
        kind = spec.get("type")
        if kind == "bool":
            valid = type(value) is bool
        elif kind == "string":
            valid = isinstance(value, str) and len(value) <= 10_000
        elif kind == "number":
            valid = (
                type(value) in {int, float}
                and math.isfinite(value)
                and ("min" not in spec or value >= spec["min"])
                and ("max" not in spec or value <= spec["max"])
            )
        elif kind == "select":
            valid = isinstance(value, str) and value in set(spec.get("options") or ())
        else:
            valid = False
        if not valid:
            raise SettingsPolicyError("Setting value does not match its registered type")
        return value

    def _validate_document(self, document: dict) -> dict:
        if not isinstance(document, dict) or document.get("schema_version") != 1:
            raise SettingsPolicyError("Extension policy schema is invalid")
        refresh = document.get("refresh_minutes")
        if type(refresh) is not int or not 1 <= refresh <= 1440:
            raise SettingsPolicyError("Extension policy refresh interval is invalid")
        developer = document.get("developer_section")
        if not isinstance(developer, dict) or type(developer.get("hidden")) is not bool:
            raise SettingsPolicyError("Developer section policy is invalid")
        expected = {
            "features": set(self.registry.get("features") or {}),
            "developer_settings": set(self.registry.get("developerSettings") or {}),
        }
        for section, keys in expected.items():
            rows = document.get(section)
            if not isinstance(rows, dict) or set(rows) != keys:
                raise SettingsPolicyError(f"{section} must match the extension registry")
            for key, entry in rows.items():
                self._validate_entry([section, key], entry)
        custom = document.get("custom_pages")
        if not isinstance(custom, dict):
            raise SettingsPolicyError("Custom-page policy is invalid")
        self._validate_entry(["custom_pages"], custom, extra={"scopes"})
        scopes = custom.get("scopes")
        expected_scopes = set(self.registry.get("customPageScopes") or {})
        if not isinstance(scopes, dict) or set(scopes) != expected_scopes:
            raise SettingsPolicyError("Custom-page scopes must match the extension registry")
        for key, entry in scopes.items():
            self._validate_entry(["custom_pages", "scopes", key], entry)
        try:
            size = len(json.dumps(document, allow_nan=False).encode("utf-8"))
        except (TypeError, ValueError, RecursionError) as exc:
            raise SettingsPolicyError("Extension policy is not JSON serializable") from exc
        if size > MAX_POLICY_BYTES:
            raise SettingsPolicyError("Extension policy is too large")
        return document

    @staticmethod
    def _default_entry(spec: dict) -> dict:
        return {
            "value": _clone(spec.get("default")),
            "hidden": False,
            "managed": spec.get("managedDefault", True) is True,
            **({"label": spec["label"]} if isinstance(spec.get("label"), str) else {}),
        }

    def _reconcile_document(self, document: dict) -> dict:
        """Evolve persisted policy shape from the code-owned settings registry."""
        if not isinstance(document, dict) or document.get("schema_version") != 1:
            raise SettingsPolicyError("Extension policy schema is invalid")
        reconciled = _clone(document)
        reconciled.setdefault("refresh_minutes", 15)
        developer = reconciled.get("developer_section")
        if not isinstance(developer, dict) or type(developer.get("hidden")) is not bool:
            reconciled["developer_section"] = {"hidden": False}
        for document_key, registry_key in (
            ("features", "features"),
            ("developer_settings", "developerSettings"),
        ):
            current = reconciled.get(document_key)
            current = current if isinstance(current, dict) else {}
            specs = self.registry.get(registry_key) or {}
            reconciled[document_key] = {
                key: _clone(current[key]) if key in current else self._default_entry(spec)
                for key, spec in specs.items()
            }
        custom_spec = self.registry.get("customPages") or {}
        current_custom = reconciled.get("custom_pages")
        if not isinstance(current_custom, dict):
            current_custom = self._default_entry(custom_spec)
        scopes = current_custom.get("scopes")
        scopes = scopes if isinstance(scopes, dict) else {}
        scope_specs = self.registry.get("customPageScopes") or {}
        reconciled["custom_pages"] = {
            **{key: _clone(value) for key, value in current_custom.items() if key != "scopes"},
            "scopes": {
                key: _clone(scopes[key]) if key in scopes else self._default_entry(spec)
                for key, spec in scope_specs.items()
            },
        }
        return self._validate_document(reconciled)

    def _validate_entry(self, path, entry, *, extra=None):
        allowed = {"value", "hidden", "managed", "label", *(extra or set())}
        if (
            not isinstance(entry, dict)
            or not {"value", "hidden", "managed"}.issubset(entry)
            or not set(entry).issubset(allowed)
            or type(entry.get("hidden")) is not bool
            or type(entry.get("managed")) is not bool
            or ("label" in entry and not isinstance(entry["label"], str))
        ):
            raise SettingsPolicyError("Setting policy metadata is invalid")
        self._validate_value(self._spec(path), entry.get("value"))

    def _legacy_document(self) -> dict:
        try:
            _, _, document = self.config_access_manager.read(LEGACY_POLICY_NAME)
        except self.config_error as exc:
            raise SettingsPolicyError("Legacy extension policy seed is unavailable") from exc
        return self._reconcile_document(document)

    def _global_row(self, session: Session):
        Policy = self.models.ExtensionSettingsPolicy
        row = session.get(Policy, GLOBAL_POLICY_ID)
        if row is not None:
            reconciled = self._reconcile_document(row.document)
            if reconciled != row.document:
                row.document = reconciled
                row.updated_at = datetime.utcnow()
                session.commit()
            return row
        now = datetime.utcnow()
        row = Policy(
            policy_id=GLOBAL_POLICY_ID,
            document=self._legacy_document(),
            seeded_from=f"{LEGACY_POLICY_NAME}.yaml",
            created_at=now,
            updated_at=now,
        )
        session.add(row)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            row = session.get(Policy, GLOBAL_POLICY_ID)
            if row is None:
                raise
        return row

    def global_document(self) -> dict:
        with Session(self.engine) as session:
            return _clone(self._global_row(session).document)

    def entries(self, document: dict | None = None) -> list[dict]:
        source = document if document is not None else self.global_document()
        rows = [{
            "path": ["developer_section"],
            "path_key": _path_key(["developer_section"]),
            "section": "Interface",
            "label": "Developer settings section",
            "setting_path": "developer_section",
            "value": None,
            "hidden": source["developer_section"]["hidden"],
            "managed": None,
            "spec": self._spec(["developer_section"]),
        }]
        for section in ("features", "developer_settings"):
            for key, entry in source[section].items():
                path = [section, key]
                rows.append(self._entry(path, entry))
        rows.append(self._entry(["custom_pages"], source["custom_pages"]))
        for key, entry in source["custom_pages"]["scopes"].items():
            rows.append(self._entry(["custom_pages", "scopes", key], entry))
        return rows

    def _entry(self, path, entry):
        section_labels = {
            "features": "Features",
            "developer_settings": "Developer settings",
            "custom_pages": "Custom pages",
        }
        return {
            "path": list(path),
            "path_key": _path_key(path),
            "section": section_labels[path[0]],
            "label": str(entry.get("label") or path[-1]),
            "setting_path": " › ".join(path[1:]) if len(path) > 1 else path[0],
            "value": _clone(entry.get("value")),
            "hidden": entry.get("hidden") is True,
            "managed": entry.get("managed") is True,
            "spec": self._spec(list(path)),
        }

    def resolve(self, credential_id: str) -> tuple[dict, str]:
        Override = self.models.ExtensionSettingOverride
        with Session(self.engine) as session:
            document = _clone(self._global_row(session).document)
            overrides = session.scalars(select(Override).where(
                Override.credential_id == credential_id
            )).all()
            for override in overrides:
                path = _path_from_key(override.setting_path)
                try:
                    target = _node(document, path)
                    spec = self._spec(path)
                except SettingsPolicyError:
                    # Removed registry settings leave historical audit rows but
                    # never make the extension's active policy unavailable.
                    continue
                if override.has_value_override:
                    if spec.get("type") == "section":
                        raise SettingsPolicyError("Section cannot override a value")
                    target["value"] = self._validate_value(
                        spec, _clone(override.value_override)
                    )
                if override.hidden_override is not None:
                    target["hidden"] = override.hidden_override is True
                if override.managed_override is not None:
                    if spec.get("type") == "section":
                        raise SettingsPolicyError("Section cannot override managed state")
                    target["managed"] = override.managed_override is True
        self._validate_document(document)
        return document, self.revision(document)

    def update_global(self, path, *, value_marker=False, value=None,
                      hidden_marker=False, hidden=None,
                      managed_marker=False, managed=None) -> dict:
        path = list(path)
        spec = self._spec(path)
        with Session(self.engine) as session:
            row = self._global_row(session)
            document = _clone(row.document)
            target = _node(document, path)
            if value_marker:
                if spec.get("type") == "section":
                    raise SettingsPolicyError("Section does not have a value")
                target["value"] = self._validate_value(spec, value)
            if hidden_marker:
                if type(hidden) is not bool:
                    raise SettingsPolicyError("Hidden state must be true or false")
                target["hidden"] = hidden
            if managed_marker:
                if spec.get("type") == "section":
                    raise SettingsPolicyError("Section does not have managed state")
                if type(managed) is not bool:
                    raise SettingsPolicyError("Managed state must be true or false")
                target["managed"] = managed
            self._validate_document(document)
            row.document = document
            row.updated_at = datetime.utcnow()
            session.commit()
        return self.entry_for_path(path)

    def entry_for_path(self, path) -> dict:
        key = _path_key(path)
        return next(
            entry for entry in self.entries()
            if entry["path_key"] == key
        )

    @staticmethod
    def _mode(value, true_name, false_name):
        if value == "inherit":
            return None
        if value == true_name:
            return True
        if value == false_name:
            return False
        raise SettingsPolicyError("Override mode is invalid")

    def set_override(
        self, credential_id: str, path, *, value_mode: str,
        value=None, hidden_mode: str, managed_mode: str,
    ) -> dict:
        path = list(path)
        spec = self._spec(path)
        path_key = _path_key(path)
        has_value = value_mode == "override"
        if value_mode not in {"inherit", "override"}:
            raise SettingsPolicyError("Value override mode is invalid")
        if spec.get("type") == "section" and has_value:
            raise SettingsPolicyError("Section cannot override a value")
        override_value = self._validate_value(spec, value) if has_value else None
        hidden = self._mode(hidden_mode, "hidden", "shown")
        managed = self._mode(managed_mode, "managed", "unmanaged")
        if spec.get("type") == "section" and managed is not None:
            raise SettingsPolicyError("Section cannot override managed state")
        Override = self.models.ExtensionSettingOverride
        with Session(self.engine) as session:
            row = session.get(Override, (credential_id, path_key))
            if not has_value and hidden is None and managed is None:
                if row is not None:
                    session.delete(row)
                    session.commit()
                return {"updated": True, "cleared": True, "path": path}
            now = datetime.utcnow()
            if row is None:
                row = Override(
                    credential_id=credential_id, setting_path=path_key,
                    created_at=now,
                )
                session.add(row)
            row.has_value_override = has_value
            row.value_override = _clone(override_value)
            row.hidden_override = hidden
            row.managed_override = managed
            row.updated_at = now
            session.commit()
        return {"updated": True, "cleared": False, "path": path}

    def clear_override(self, credential_id: str, path) -> bool:
        Override = self.models.ExtensionSettingOverride
        path_key = _path_key(path)
        with Session(self.engine) as session:
            row = session.get(Override, (credential_id, path_key))
            if row is None:
                return False
            session.delete(row)
            session.commit()
            return True

    def overrides(self, credential_id: str | None = None):
        Override = self.models.ExtensionSettingOverride
        with Session(self.engine) as session:
            statement = select(Override)
            if credential_id is not None:
                statement = statement.where(Override.credential_id == credential_id)
            rows = session.scalars(statement).all()
            return [{
                "credential_id": row.credential_id,
                "path": _path_from_key(row.setting_path),
                "path_key": row.setting_path,
                "has_value_override": row.has_value_override is True,
                "value_override": _clone(row.value_override),
                "hidden_override": row.hidden_override,
                "managed_override": row.managed_override,
                "updated_at": row.updated_at,
            } for row in rows]
