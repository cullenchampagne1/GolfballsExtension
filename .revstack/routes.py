"""Golfballs extension — backend routes, mounted at /projects/golfballs-extension.

Runs under the RevStack ProjectManager with framework symbols injected
(APIRouter, Depends, HTTPException, Request, FileResponse, require_admin,
Principal, project_dir, backend_logic, …), so it needs no backend imports; it
may import the standard library normally.

Owns the extension's self-hosted Chrome update channel, its release/publish
control surface, and an admin key-management surface (list + revoke). Key
CREATION stays in the `api-key` terminal CLI, which is the only place that can
safely reveal a new secret once.
"""

import base64
import asyncio
import hashlib
import json
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Union

from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, inspect, select
from sqlalchemy.orm import Session

_RELEASE_FILE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.crx$")
_PRODUCTION = project_dir / ".golfballs-extension-production"
_PUBLIC_DIR = _PRODUCTION / "public"
_LEDGER = _PRODUCTION / "releases.json"

# Golfballs-specific: the single central policy document this extension reads.
_CONFIG_NAME = "golfballs-extension-configuration"
_KEY_NAME_PREFIX = "golfballs-extension-"
_PROJECT_SCOPE_PREFIX = "/projects/golfballs-extension/"
# The generic core enrollment endpoint (/auth/extension-installation) mints
# installation keys named "client-extension-<hex>" scoped to client:extension
# (plus the legacy /extension/* ceiling). ProjectManager's client-route registry
# is what actually authorizes these keys against this project's routes, so an
# enrolled installation is a real golfballs key even though its name/scopes carry
# no golfballs marker — recognize it here so it appears in the admin key table.
_ENROLLMENT_KEY_PREFIX = "client-extension-"
_KEY_NAME_PREFIXES = (_KEY_NAME_PREFIX, _ENROLLMENT_KEY_PREFIX)
_PUBLISH_LOCK = asyncio.Lock()
_BUILD_LOCK = asyncio.Lock()
_GIT_LOCK = asyncio.Lock()
_AUTO_COMMIT_MSG = (
    "Automated push from RevStack console\n\n"
    "Commits and pushes all working-tree changes for the golfballs extension.\n\n"
    "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
)


async def _run(args: list, cwd, timeout: int = 600) -> tuple:
    """Run a subprocess, returning (returncode, combined_output). -1 on timeout."""
    proc = await asyncio.create_subprocess_exec(
        *args, cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        return -1, "timed out"
    return proc.returncode, (out or b"").decode("utf-8", "replace")

_auth = backend_logic("AuthManager")
auth_manager = _auth.auth_manager
EXTENSION_CLIENT_SCOPE = _auth.EXTENSION_CLIENT_SCOPE
_cfg = backend_logic("ConfigAccessManager")
config_access_manager = _cfg.config_access_manager
ConfigAccessError = _cfg.ConfigAccessError
ConfigConflictError = _cfg.ConfigConflictError
ConfigValueError = _cfg.ConfigValueError
_models = backend_import("models.AuthModels")
ExtensionSettingsShare = _models.ExtensionSettingsShare
ExtensionEmailTemplateShare = _models.ExtensionEmailTemplateShare
ExtensionProductStore = _models.ExtensionProductStore
ExtensionInstallationIdentity = _models.ExtensionInstallationIdentity
ExtensionInstallationAccess = _models.ExtensionInstallationAccess
ExtensionSettingsPolicy = _models.ExtensionSettingsPolicy
ExtensionSettingOverride = _models.ExtensionSettingOverride
ExtensionSupportTicket = _models.ExtensionSupportTicket
ExtensionSupportTicketReply = _models.ExtensionSupportTicketReply
AuthApiKey = _models.AuthApiKey

_client_api_module = project_logic("client_api")
_settings_policy_module = project_logic("settings_policy")
SettingsPolicyError = _settings_policy_module.SettingsPolicyError
SettingsPolicyConflict = _settings_policy_module.SettingsPolicyConflict
settings_policy = _settings_policy_module.SettingsPolicyStore(
    engine=auth_manager.engine,
    models=_models,
    config_access_manager=config_access_manager,
    config_error=ConfigAccessError,
    project_dir=project_dir,
)
_service_manager = backend_logic("ServiceManager")
client_api = _client_api_module.ExtensionClientApi(
    auth_manager=auth_manager,
    models=_models,
    settings_policy_store=settings_policy,
    settings_policy_error=SettingsPolicyError,
    client_scope=EXTENSION_CLIENT_SCOPE,
    project_dir=project_dir,
    public_origin=(
        __import__("os").environ.get(
            "RS_PUBLIC_API_ORIGIN", "https://api.cullenchampagne.com"
        )
    ),
    service_manager_factory=_service_manager.ServiceManager,
)
ClientIdentityUpdate = _client_api_module.IdentityUpdate
ClientTicketCreate = _client_api_module.TicketCreate
ClientSettingsShareCreate = _client_api_module.SettingsShareCreate
ClientSettingsShareImport = _client_api_module.SettingsShareImport
ClientEmailTemplateShareCreate = _client_api_module.EmailTemplateShareCreate
ClientProductStoreCreate = _client_api_module.ProductStoreCreate

_assistant = backend_logic("AssistantManager")
assistant_manager = _assistant.assistant_manager
AssistantError = _assistant.AssistantError
AssistantRateLimited = _assistant.AssistantRateLimited
_help_agent = project_logic("help_agent")
_ASSISTANT_ID = "golfballs-extension-help"
_ASSISTANT_REGISTERED = False

router = APIRouter()


class AssistantHistoryTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4_000)


class AssistantAvailableResource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str = Field(
        min_length=1, max_length=100,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$",
    )
    id: str = Field(
        min_length=1, max_length=100,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$",
    )
    label: str = Field(min_length=1, max_length=120)
    summary: Optional[str] = Field(default=None, max_length=1_200)


class AssistantResourceAccess(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: str = Field(
        min_length=1, max_length=180,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,179}$",
    )
    target: str = Field(
        min_length=1, max_length=100,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$",
    )
    query: str = Field(default="", max_length=120)
    options: List[str] = Field(default_factory=list, max_length=16)
    result_count: int = Field(default=0, ge=0, le=10_000)
    truncated: bool = False


class AssistantAutomaticState(BaseModel):
    """Low-risk client state included on every turn without an approval flow."""
    model_config = ConfigDict(extra="forbid")

    features: Dict[str, bool] = Field(default_factory=dict, max_length=80)
    developer_settings: Dict[
        str, Optional[Union[bool, int, float, str]]
    ] = Field(default_factory=dict, max_length=240)


class AssistantRecentAction(BaseModel):
    """Bounded action reference used only to resolve follow-up language."""
    model_config = ConfigDict(extra="forbid")

    type: Literal[
        "set_feature", "set_setting", "set_theme_preset", "set_theme_palette",
        "share_settings", "share_email_template", "request_data_access",
        "submit_ticket",
    ]
    target: str = Field(
        min_length=1, max_length=100,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,99}$",
    )
    value: str = Field(default="", max_length=500)
    options: List[str] = Field(default_factory=list, max_length=16)
    label: str = Field(default="", max_length=100)


class AssistantContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    extension_version: Optional[str] = Field(default=None, max_length=40)
    edition: Literal["admin", "consumer"] = "admin"
    surface: Optional[str] = Field(default=None, max_length=60)
    guide_route: Optional[str] = Field(default=None, max_length=240)
    page_type: Optional[str] = Field(default=None, max_length=60)
    page_url: Optional[str] = Field(default=None, max_length=500)
    answer_mode: Literal["operator", "technical", "adaptive"] = "adaptive"
    feature_states: Dict[str, bool] = Field(default_factory=dict, max_length=80)
    hidden_settings: List[str] = Field(default_factory=list, max_length=160)
    action_confirmations: List[str] = Field(default_factory=list, max_length=20)
    automatic_state: AssistantAutomaticState = Field(
        default_factory=AssistantAutomaticState
    )
    recent_actions: List[AssistantRecentAction] = Field(
        default_factory=list, max_length=8
    )
    available_resources: List[AssistantAvailableResource] = Field(
        default_factory=list, max_length=80
    )
    resource_access: Optional[AssistantResourceAccess] = None


class AssistantMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: str = Field(
        min_length=8, max_length=80, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]+$"
    )
    message: str = Field(min_length=1, max_length=4_000)
    history: List[AssistantHistoryTurn] = Field(default_factory=list, max_length=12)
    context: AssistantContext = Field(default_factory=AssistantContext)


class AssistantFeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str = Field(min_length=8, max_length=80)
    rating: Literal["helpful", "not_helpful"]


class AssistantGrantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirm: Literal["grant assistant access"]


class AssistantKeyGrantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key_id: str = Field(min_length=1, max_length=120)
    enabled: bool = True


class InstallationAccessRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key_id: str = Field(min_length=1, max_length=120)
    enabled: bool


class BulkInstallationAccessRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool
    confirm: Literal["update all extension installations"]


class GlobalSettingUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: List[str] = Field(min_length=1, max_length=4)
    value: Any = None
    hidden: Optional[bool] = None
    managed: Optional[bool] = None


class SettingOverrideUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: List[str] = Field(min_length=1, max_length=4)
    value_mode: Literal["inherit", "override"] = "inherit"
    value: Any = None
    hidden_mode: Literal["inherit", "hidden", "shown"] = "inherit"
    managed_mode: Literal["inherit", "managed", "unmanaged"] = "inherit"


class SettingOverrideClearRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: List[str] = Field(min_length=1, max_length=4)


class TicketReplyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=2_000)
    status: Literal["open", "triaged", "in_progress", "planned", "resolved", "closed"]


def _revoke_action(endpoint: str, body: dict, confirm: str) -> dict:
    """A TableBlock action-cell that POSTs a revoke, with confirm + success gate."""
    return {"action": {
        "endpoint": endpoint,
        "method": "POST",
        "body": body,
        "confirm": confirm,
        "return_criteria": {"path": "revoked", "equals": True},
        "states": {
            "idle": {"label": "Revoke", "variant": "ghost"},
            "done": {"label": "Revoked", "variant": "ok"},
        },
    }}


def _assistant_access_action(key_id: str, name: str, enabled: bool = False) -> dict:
    """A reversible credential-specific Help Companion setting action."""
    next_enabled = not enabled
    verb = "Enable" if next_enabled else "Disable"
    return {"action": {
        "endpoint": f"{_PROJECT_SCOPE_PREFIX}keys/assistant-access",
        "method": "POST",
        "body": {"key_id": key_id, "enabled": next_enabled},
        "confirm": f"{verb} Help Companion access for {name}?",
        "return_criteria": {
            "path": "chat_access", "equals": "enabled" if next_enabled else "disabled",
        },
        "states": {
            "idle": {"label": verb, "variant": "bad" if enabled else "ghost"},
            "confirm": {"label": "Confirm", "variant": "warn"},
            "loading": {"label": "Saving", "variant": "ghost", "spinner": True},
            "done": {"label": "Saved", "variant": "ok"},
            "error": {"label": "Retry", "variant": "bad"},
        },
    }}


def _installation_access_action(key_id: str, name: str, enabled: bool) -> dict:
    next_enabled = not enabled
    verb = "Enable" if next_enabled else "Disable"
    return {"action": {
        "endpoint": f"{_PROJECT_SCOPE_PREFIX}keys/access",
        "method": "POST",
        "body": {"key_id": key_id, "enabled": next_enabled},
        "confirm": f"{verb} the Golfballs extension for {name}?",
        "return_criteria": {
            "path": "personal_enabled", "equals": next_enabled,
        },
        "states": {
            "idle": {"label": verb, "variant": "bad" if enabled else "ghost"},
            "loading": {"label": "Saving", "variant": "ghost", "spinner": True},
            "done": {"label": "Saved", "variant": "ok"},
            "error": {"label": "Retry", "variant": "bad"},
        },
    }}


def _bulk_access_action(enabled: bool) -> dict:
    next_enabled = not enabled
    verb = "Restore individual access" if next_enabled else "Disable all"
    return {"action": {
        "endpoint": f"{_PROJECT_SCOPE_PREFIX}keys/access/bulk",
        "method": "POST",
        "body": {
            "enabled": next_enabled,
            "confirm": "update all extension installations",
        },
        "confirm": (
            f"{verb} Golfballs Toolkit access? This applies regardless of "
            "each installation's individual setting."
        ),
        "return_criteria": {"path": "global_enabled", "equals": next_enabled},
        "states": {
            "idle": {"label": verb, "variant": "bad" if enabled else "ghost"},
            "confirm": {"label": "Confirm", "variant": "bad"},
            "loading": {"label": "Saving", "variant": "ghost", "spinner": True},
            "done": {"label": "Saved", "variant": "ok"},
            "error": {"label": "Retry", "variant": "bad"},
        },
    }}


def _ticket_reply_action(ticket_id: str, title: str, status: str) -> dict:
    """Generic modal-form table action configured for one ticket row."""
    return {"action": {
        "endpoint": f"{_PROJECT_SCOPE_PREFIX}tickets/{ticket_id}/reply",
        "method": "POST",
        "body": {},
        "return_criteria": {"path": "replied", "equals": True},
        "states": {
            "idle": {"label": "Reply", "variant": "ghost"},
            "loading": {"label": "Sending", "variant": "ghost", "spinner": True},
            "done": {"label": "Sent", "variant": "ok"},
            "error": {"label": "Retry", "variant": "bad"},
        },
        "modal": {
            "title": f"Reply to {ticket_id}",
            "subtitle": title,
            "description": "Your reply and status update will appear in the user's extension settings.",
            "submit_label": "Send reply",
            "fields": [
                {
                    "key": "message", "label": "Reply", "type": "textarea",
                    "required": True, "min_length": 1, "max_length": 2_000,
                    "rows": 6, "placeholder": "Write a clear update for the extension user…",
                },
                {
                    "key": "status", "label": "Status", "type": "select",
                    "required": True, "default": status,
                    "options": [
                        {"value": "open", "label": "Open"},
                        {"value": "triaged", "label": "Triaged"},
                        {"value": "in_progress", "label": "In progress"},
                        {"value": "planned", "label": "Planned"},
                        {"value": "resolved", "label": "Resolved"},
                        {"value": "closed", "label": "Closed"},
                    ],
                },
            ],
        },
    }}


def _ticket_delete_action(ticket_id: str, title: str) -> dict:
    """Permanent admin deletion exposed through the generic table action API."""
    return {"action": {
        "endpoint": f"{_PROJECT_SCOPE_PREFIX}tickets/{ticket_id}",
        "method": "DELETE",
        "body": {},
        "confirm": f"Permanently delete {ticket_id} — {title}? Its replies will also be deleted.",
        "return_criteria": {"path": "deleted", "equals": True},
        "states": {
            "idle": {"label": "Delete", "variant": "bad"},
            "confirm": {"label": "Confirm", "variant": "bad"},
            "loading": {"label": "Deleting", "variant": "bad", "spinner": True},
            "done": {"label": "Deleted", "variant": "ok"},
            "error": {"label": "Retry", "variant": "bad"},
        },
    }}


# ---------------- helpers ----------------

def _read_ledger() -> dict:
    try:
        return json.loads(_LEDGER.read_text())
    except (OSError, ValueError):
        return {"current": None, "releases": []}


def _month_year(value) -> str:
    """Format an ISO publish timestamp as the compact ``MM/YY`` overview value."""
    text = str(value or "").strip()
    if not text:
        return "—"
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).strftime("%m/%y")
    except ValueError:
        match = re.match(r"^(\d{4})-(\d{2})-\d{2}", text)
        return f"{match.group(2)}/{match.group(1)[2:]}" if match else "—"


def _extension_id() -> str:
    """Derive the Chrome extension id from the extension manifest's public key."""
    try:
        manifest_key = json.loads((project_dir / "manifest.json").read_text()).get("key")
        der = base64.b64decode(manifest_key)
        digest = hashlib.sha256(der).hexdigest()[:32]
        return "".join("abcdefghijklmnop"[int(c, 16)] for c in digest)
    except Exception:
        return ""


def _public_origin() -> str:
    import os
    return os.getenv("RS_PUBLIC_API_ORIGIN", "https://api.cullenchampagne.com").rstrip("/")


def _settings_share_url(share_id: str) -> str:
    return f"{_public_origin()}{_PROJECT_SCOPE_PREFIX}client/settings-shares/{share_id}"


def _email_share_url(share_id: str) -> str:
    return f"{_public_origin()}{_PROJECT_SCOPE_PREFIX}client/email-template-shares/{share_id}"


def _product_store_url(store_id: str) -> str:
    return f"{_public_origin()}{_PROJECT_SCOPE_PREFIX}client/product-stores/{store_id}"


def _read_policy(credential_id: str | None = None) -> tuple[str, dict]:
    """Read the database policy, optionally resolved for one installation."""
    try:
        if credential_id:
            config_doc, revision = settings_policy.resolve(credential_id)
        else:
            config_doc = settings_policy.global_document()
            revision = settings_policy.revision(config_doc)
    except SettingsPolicyError as exc:
        raise HTTPException(status_code=503, detail="Extension configuration unavailable") from exc
    return revision, config_doc


def _policy_entries(document: dict) -> list[dict]:
    return settings_policy.entries(document)


def _toggle_policy_action(path: list[str], hidden: bool) -> dict:
    next_label = "Show" if hidden else "Hide"
    return {"action": {
        "endpoint": f"{_PROJECT_SCOPE_PREFIX}configuration-values/toggle",
        "method": "POST",
        "body": {"path": path, "expected_hidden": hidden},
        "return_criteria": {"path": "updated", "equals": True},
        "states": {
            "idle": {"label": next_label, "variant": "ghost"},
            "loading": {"label": "Saving", "variant": "ghost", "spinner": True},
            "done": {"label": "Saved", "variant": "ok"},
        },
    }}


def _modal_value_field(entry: dict, value, *, key="value") -> dict:
    spec = entry["spec"]
    kind = spec.get("type")
    field = {"key": key, "label": "Value", "required": kind != "string"}
    if kind == "bool":
        field.update({"type": "checkbox", "default": value is True})
    elif kind == "number":
        field.update({"type": "number", "default": value})
        if "min" in spec:
            field["min"] = spec["min"]
        if "max" in spec:
            field["max"] = spec["max"]
    elif kind == "select":
        field.update({
            "type": "select", "default": value,
            "options": [
                {"value": option, "label": option}
                for option in spec.get("options") or ()
            ],
        })
    else:
        field.update({"type": "text", "default": value or "", "max_length": 10_000})
    return field


def _global_policy_action(entry: dict) -> dict:
    fields = []
    if entry["spec"].get("type") != "section":
        fields.append(_modal_value_field(entry, entry["value"]))
    fields.append({
        "key": "hidden", "type": "checkbox", "label": "Hide this setting",
        "default": entry["hidden"],
    })
    if entry["spec"].get("type") != "section":
        fields.append({
            "key": "managed", "type": "checkbox", "label": "Manage this value",
            "default": entry["managed"],
            "hint": "Managed values replace the installation's local value.",
        })
    return {"action": {
        "endpoint": f"{_PROJECT_SCOPE_PREFIX}configuration-values/update",
        "method": "POST", "body": {"path": entry["path"]},
        "modal": {
            "title": f"Edit {entry['label']}",
            "subtitle": "Global extension policy",
            "description": "Applies to every installation unless that user has an override.",
            "submit_label": "Save global policy", "fields": fields,
        },
        "return_criteria": {"path": "updated", "equals": True},
        "states": {
            "idle": {"label": "Edit", "variant": "ghost"},
            "done": {"label": "Saved", "variant": "ok"},
            "error": {"label": "Retry", "variant": "bad"},
        },
    }}


def _override_modes(override: dict | None) -> tuple[str, str, str]:
    if not override:
        return "inherit", "inherit", "inherit"
    value_mode = "override" if override["has_value_override"] else "inherit"
    hidden_mode = (
        "inherit" if override["hidden_override"] is None
        else "hidden" if override["hidden_override"] else "shown"
    )
    managed_mode = (
        "inherit" if override["managed_override"] is None
        else "managed" if override["managed_override"] else "unmanaged"
    )
    return value_mode, hidden_mode, managed_mode


def _override_edit_action(key_id: str, entry: dict, override: dict | None) -> dict:
    value_mode, hidden_mode, managed_mode = _override_modes(override)
    fields = []
    if entry["spec"].get("type") != "section":
        fields.extend([
            {"key": "value_mode", "type": "select", "label": "Value source",
             "default": value_mode, "options": [
                 {"value": "inherit", "label": "Inherit global value"},
                 {"value": "override", "label": "Override for this user"},
             ]},
            _modal_value_field(
                entry,
                override["value_override"]
                if override and override["has_value_override"] else entry["value"],
            ),
        ])
    fields.append({
        "key": "hidden_mode", "type": "select", "label": "Visibility",
        "default": hidden_mode, "options": [
            {"value": "inherit", "label": "Inherit global visibility"},
            {"value": "hidden", "label": "Hidden for this user"},
            {"value": "shown", "label": "Shown for this user"},
        ],
    })
    if entry["spec"].get("type") != "section":
        fields.append({
            "key": "managed_mode", "type": "select", "label": "Management",
            "default": managed_mode, "options": [
                {"value": "inherit", "label": "Inherit global management"},
                {"value": "managed", "label": "Managed for this user"},
                {"value": "unmanaged", "label": "User controls their value"},
            ],
        })
    return {"action": {
        "endpoint": f"{_PROJECT_SCOPE_PREFIX}keys/{key_id}/configuration-overrides",
        "method": "POST", "body": {"path": entry["path"]},
        "modal": {
            "title": f"Override {entry['label']}",
            "subtitle": "Installation-specific policy",
            "description": "Choose inherit everywhere to remove the override.",
            "submit_label": "Save override", "fields": fields,
        },
        "return_criteria": {"path": "updated", "equals": True},
        "states": {
            "idle": {"label": "Edit", "variant": "ghost"},
            "done": {"label": "Saved", "variant": "ok"},
            "error": {"label": "Retry", "variant": "bad"},
        },
    }}


def _settings_modal_action(key_id: str, name: str) -> dict:
    return {"action": {
        "modal": {
            "kind": "remote_table",
            "title": f"Settings · {name}",
            "subtitle": "Per-user overrides",
            "description": "Only explicit differences from global policy are stored.",
            "endpoint": f"{_PROJECT_SCOPE_PREFIX}keys/{key_id}/configuration-overrides",
            "max_width": 1180,
        },
        "states": {"idle": {"label": "Settings", "variant": "ghost"}},
    }}


def _clear_override_action(key_id: str, path: list[str]) -> dict:
    return {"action": {
        "endpoint": f"{_PROJECT_SCOPE_PREFIX}keys/{key_id}/configuration-overrides/clear",
        "method": "POST", "body": {"path": path},
        "confirm": "Remove this user override and inherit global policy?",
        "return_criteria": {"path": "cleared", "equals": True},
        "states": {
            "idle": {"label": "Clear", "variant": "bad"},
            "confirm": {"label": "Confirm", "variant": "warn"},
            "done": {"label": "Cleared", "variant": "ok"},
        },
    }}


def _key_status(row: dict) -> str:
    if row.get("revoked_at"):
        return "revoked"
    expires = row.get("expires_at")
    if expires:
        try:
            from datetime import datetime
            if datetime.fromisoformat(str(expires)) <= datetime.now():
                return "expired"
        except ValueError:
            pass
    return "active"


def _is_golfballs_key(row: dict) -> bool:
    scopes = {str(scope) for scope in row.get("scopes") or []}
    return (
        EXTENSION_CLIENT_SCOPE in scopes
        and (
            str(row.get("name") or "").startswith(_KEY_NAME_PREFIXES)
            or any(_PROJECT_SCOPE_PREFIX in scope for scope in scopes)
        )
    )


def _access_state(session: Session, key: AuthApiKey) -> dict:
    """Resolve the global override, per-key setting, and legacy chat grant."""
    global_row = session.get(ExtensionInstallationAccess, "*")
    row = session.get(ExtensionInstallationAccess, key.id)
    global_enabled = not (
        global_row is not None and global_row.extension_enabled is False
    )
    personal_enabled = not (
        row is not None and row.extension_enabled is False
    )
    extension_enabled = global_enabled and personal_enabled
    if row is not None and row.assistant_enabled is not None:
        personal_assistant_enabled = row.assistant_enabled is True
    else:
        personal_assistant_enabled = any(
            "/projects/golfballs-extension/assistant/" in str(scope)
            for scope in (key.scopes or ())
        )
    return {
        "global_enabled": global_enabled,
        "personal_enabled": personal_enabled,
        "extension_enabled": extension_enabled,
        "assistant_enabled": extension_enabled and personal_assistant_enabled,
        "personal_assistant_enabled": personal_assistant_enabled,
    }


def _set_access(
    session: Session, subject_id: str, *, extension_enabled=None,
    assistant_enabled=None,
):
    row = session.get(ExtensionInstallationAccess, subject_id)
    if row is None:
        row = ExtensionInstallationAccess(subject_id=subject_id)
        session.add(row)
    if extension_enabled is not None:
        row.extension_enabled = bool(extension_enabled)
    if assistant_enabled is not None:
        row.assistant_enabled = bool(assistant_enabled)
    row.updated_at = datetime.utcnow()
    return row


def _installation_owners(session: Session, credential_ids) -> dict[str, dict]:
    """Resolve stable credential owners for keys and historical share rows."""
    ids = {str(value) for value in credential_ids if value}
    if not ids or not inspect(session.get_bind()).has_table(
        ExtensionInstallationIdentity.__tablename__
    ):
        return {}
    identities = {
        row.credential_id: row
        for row in session.scalars(select(ExtensionInstallationIdentity).where(
            ExtensionInstallationIdentity.credential_id.in_(ids)
        )).all()
    }
    keys = {
        row.id: row
        for row in session.scalars(select(AuthApiKey).where(
            AuthApiKey.id.in_(ids)
        )).all()
    }
    return {
        credential_id: {
            "registered": credential_id in identities,
            "display_name": (
                identities[credential_id].display_name
                if credential_id in identities else "Unregistered"
            ),
            "local_part": (
                identities[credential_id].local_part
                if credential_id in identities else None
            ),
            "prefix": (
                f"rsk_{keys[credential_id].key_prefix}_…"
                if credential_id in keys else "unknown key"
            ),
        }
        for credential_id in ids
    }


def _owner_cell(owner: dict | None) -> dict:
    value = owner or {}
    return {
        "text": value.get("display_name") or "Unregistered",
        "sub": value.get("local_part") or value.get("prefix") or "unknown key",
        "color": "ok" if value.get("registered") else "warning",
    }


def _owner_detail(owner: dict | None) -> str:
    value = owner or {}
    name = value.get("display_name") or "Unregistered"
    reference = value.get("local_part") or value.get("prefix") or "unknown key"
    return f"{name} · {reference}"


def _ensure_assistant(*, force: bool = False) -> dict:
    """Lazily build the project corpus so route discovery stays lightweight."""
    global _ASSISTANT_REGISTERED
    if force or not _ASSISTANT_REGISTERED:
        descriptor = _help_agent.build_descriptor(project_dir, config_access_manager)
        assistant_manager.register(descriptor, force=force)
        _ASSISTANT_REGISTERED = True
    return assistant_manager.status(_ASSISTANT_ID)


def _assistant_principal(request: Request) -> Principal:
    principal = getattr(request.state, "principal", None)
    is_extension = bool(
        principal
        and principal.auth_type == "api_key"
        and EXTENSION_CLIENT_SCOPE in set(principal.scopes or ())
    )
    if not principal or (not is_extension and not principal.is_admin):
        raise HTTPException(
            status_code=403, detail="Extension client or administrator required"
        )
    if is_extension:
        return client_api.require_assistant(request)
    return principal


def _assistant_owner(principal: Principal) -> str:
    identity = principal.credential_id or principal.user_id
    if not identity:
        raise HTTPException(status_code=403, detail="Bound credential required")
    return f"{principal.auth_type}:{identity}"


def _assistant_http_error(exc: AssistantError) -> HTTPException:
    headers = None
    if isinstance(exc, AssistantRateLimited):
        headers = {"Retry-After": str(exc.retry_after)}
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": str(exc)},
        headers=headers,
    )


def _assistant_grants() -> list[str]:
    prefix = f"{_PROJECT_SCOPE_PREFIX}assistant/"
    return sorted({
        f"{str(item.get('method') or 'GET').upper()}:{str(item.get('path') or '')}"
        for item in manifest.get("client_routes") or ()
        if str(item.get("path") or "").startswith(prefix)
    })


def _assistant_grant_status() -> dict:
    required = set(_assistant_grants())
    rows = []
    with Session(auth_manager.engine) as session:
        keys = session.scalars(
            select(AuthApiKey).where(AuthApiKey.revoked_at.is_(None))
        ).all()
        for key in keys:
            scopes = set(key.scopes or ())
            if EXTENSION_CLIENT_SCOPE not in scopes:
                continue
            if not (
                str(key.name or "").startswith(_KEY_NAME_PREFIXES)
                or any(_PROJECT_SCOPE_PREFIX in scope for scope in scopes)
            ):
                continue
            missing = sorted(required - scopes)
            rows.append({
                "id": key.id,
                "name": key.name,
                "prefix": f"rsk_{key.key_prefix}_…",
                "missing": missing,
            })
    return {
        "required_grants": sorted(required),
        "credentials": rows,
        "credentials_missing_grants": sum(1 for row in rows if row["missing"]),
    }


def _merge_assistant_grants(key: AuthApiKey) -> list[str]:
    """Merge only this project's declared assistant scopes into one key row."""
    required = set(_assistant_grants())
    if not required:
        raise HTTPException(status_code=503, detail="Assistant grants are unavailable")
    scopes = set(key.scopes or ())
    added = sorted(required - scopes)
    merged = sorted(scopes | required)
    if len(merged) > 32 or any(len(value) > 180 for value in merged):
        raise HTTPException(
            status_code=409,
            detail=f"Credential {key.id} cannot accept additional grants",
        )
    if added:
        key.scopes = merged
    return added


# ---------------- update channel (public) ----------------

@router.get("/updates.xml", include_in_schema=False)
async def updates_xml():
    path = _PUBLIC_DIR / "updates.xml"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="No published release")
    return FileResponse(path, media_type="application/xml",
                        headers={"Cache-Control": "no-store"})


@router.get("/releases/{file_name}", include_in_schema=False)
async def release_file(file_name: str):
    if not _RELEASE_FILE.fullmatch(file_name) or ".." in file_name:
        raise HTTPException(status_code=404, detail="Unknown release")
    path = (_PUBLIC_DIR / "releases" / file_name).resolve()
    if path.parent != (_PUBLIC_DIR / "releases").resolve() or not path.is_file():
        raise HTTPException(status_code=404, detail="Unknown release")
    return FileResponse(path, media_type="application/x-chrome-extension",
                        headers={"Cache-Control": "public, max-age=300"})


# Heavy 3D-viewer assets (models/HDRIs/textures) are no longer bundled in the
# extension — it downloads them here on first use and caches them locally. Files
# live under the gitignored production tree, off the shared source.
_ASSETS_DIR = _PRODUCTION / "assets"
_ASSET_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$")
_ASSET_MEDIA = {
    ".obj": "text/plain", ".exr": "image/x-exr", ".hdr": "image/vnd.radiance",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".ktx2": "image/ktx2", ".bin": "application/octet-stream",
}


@router.get("/assets/{file_name:path}")
async def extension_asset(file_name: str):
    """Serve one on-demand 3D-viewer asset (unauthenticated, aggressively cached).

    The Golfball 3D viewer no longer ships its ~45MB of models/HDRIs/textures in
    the CRX; it fetches each here on first use and caches it in the extension.
    ``file_name`` may include the model subfolder (e.g. ``golfball_model/
    Golf_ball.obj``). Path traversal, bad names, and unknown files return 404.
    """
    if not _ASSET_NAME.fullmatch(file_name) or ".." in file_name:
        raise HTTPException(status_code=404, detail="Unknown asset")
    base = _ASSETS_DIR.resolve()
    path = (_ASSETS_DIR / file_name).resolve()
    try:
        path.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=404, detail="Unknown asset")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Unknown asset")
    media = _ASSET_MEDIA.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media, headers={
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
    })


# ---------------- channel status + publish (block-facing) ----------------

@router.get("/status")
async def status():
    """v2 `channel` block data: current version, id, update URL, serving state."""
    ledger = _read_ledger()
    current = next((r for r in ledger.get("releases", [])
                    if r.get("version") == ledger.get("current")), None)
    update_url = f"{_public_origin()}/projects/golfballs-extension/updates.xml"
    return {
        "extension_id": _extension_id(),
        "update_url": update_url,
        "current_version": (current or {}).get("version") or "none",
        "published_at": (current or {}).get("published_at"),
        "current_commit": (current or {}).get("commit"),
        "current_size": (current or {}).get("size"),
        "release_count": len(ledger.get("releases", [])),
        "has_release": current is not None,
    }


@router.get("/overview")
async def overview(_: Principal = Depends(require_admin)):
    """v2 `overview` block: at-a-glance analytics for the extension."""
    keys = [k for k in auth_manager.list_api_keys() if _is_golfballs_key(k)]
    active_keys = sum(1 for k in keys if _key_status(k) == "active")
    now = datetime.utcnow()
    with Session(auth_manager.engine) as session:
        settings_n = session.scalar(
            select(func.count()).select_from(ExtensionSettingsShare)
            .where(ExtensionSettingsShare.revoked_at.is_(None)))
        email_n = session.scalar(
            select(func.count()).select_from(ExtensionEmailTemplateShare)
            .where(ExtensionEmailTemplateShare.revoked_at.is_(None),
                   ExtensionEmailTemplateShare.expires_at > now))
        settings_opens = session.scalar(
            select(func.coalesce(func.sum(ExtensionSettingsShare.access_count), 0))
            .where(ExtensionSettingsShare.revoked_at.is_(None)))
        email_opens = session.scalar(
            select(func.coalesce(func.sum(ExtensionEmailTemplateShare.access_count), 0))
            .where(ExtensionEmailTemplateShare.revoked_at.is_(None)))
        product_opens = session.scalar(
            select(func.coalesce(func.sum(ExtensionProductStore.access_count), 0))
            .where(ExtensionProductStore.revoked_at.is_(None)))
    ledger = _read_ledger()
    releases = ledger.get("releases", [])
    current = next((r for r in releases if r.get("version") == ledger.get("current")), None)
    return {
        "current_version": f"v{ledger.get('current')}" if ledger.get("current") else "none",
        "release_count": len(releases),
        "last_published": _month_year((current or {}).get("published_at")),
        "active_keys": active_keys,
        "total_keys": len(keys),
        "settings_links": int(settings_n or 0),
        "email_links": int(email_n or 0),
        "share_opens": int(
            (settings_opens or 0) + (email_opens or 0) + (product_opens or 0)
        ),
    }


@router.get("/release-list")
async def release_list():
    """v1 `table` block: published releases newest-first."""
    ledger = _read_ledger()
    columns = [
        {"key": "version", "label": "Version"},
        {"key": "published", "label": "Published"},
        {"key": "commit", "label": "Commit"},
        {"key": "size", "label": "Size", "align": "right"},
        {"key": "download", "label": "Download", "mono": True},
    ]
    current = ledger.get("current")
    releases_base = f"{_public_origin()}{_PROJECT_SCOPE_PREFIX}releases"
    rows = []
    for r in ledger.get("releases", []):
        is_current = r.get("version") == current
        # The ledger records the packed CRX filename; surface both the name and
        # a ready-to-fetch URL so a version can actually be downloaded (the
        # /releases/{file_name} endpoint takes the filename, not the version).
        file_name = r.get("file") or ""
        download_url = f"{releases_base}/{file_name}" if file_name else ""
        rows.append({
            "version": {"text": f"v{r.get('version', '?')}",
                        "color": "run" if is_current else None},
            "published": str(r.get("published_at", ""))[:10],
            "commit": r.get("commit", ""),
            "size": f"{(r.get('size', 0) / 1_048_576):.1f} MB",
            "file": file_name,
            "download": download_url,
        })
    return {"primary_key": "version", "columns": columns, "rows": rows}


@router.post("/publish")
async def publish(request: Request, _: Principal = Depends(require_admin)):
    """Build the production branch and publish a signed release via the CLI.

    Heavy (npm ci + build + sign). Admin-only; the block gates it behind a
    confirm. Never invoked implicitly.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    args = ["./golfballs", "--no-color", "publish", "--json"]
    if body.get("fast"):
        args.append("--fast")
    if _PUBLISH_LOCK.locked():
        raise HTTPException(status_code=409, detail="A publish is already running")
    async with _PUBLISH_LOCK:
        try:
            process = await asyncio.create_subprocess_exec(
                *args,
                cwd=str(project_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            try:
                output, _ = await asyncio.wait_for(process.communicate(), timeout=1800)
            except asyncio.TimeoutError as exc:
                process.kill()
                await process.communicate()
                raise HTTPException(status_code=504, detail="Publish timed out") from exc
        except HTTPException:
            raise
        except OSError as exc:
            raise HTTPException(status_code=500, detail="Publish process could not start") from exc
    text = output.decode("utf-8", "replace")
    if process.returncode != 0:
        raise HTTPException(status_code=500, detail=text.strip()[-800:] or "Publish failed")
    try:
        return json.loads(text)
    except ValueError:
        return {"output": text[-2000:]}


@router.post("/build")
async def build(_: Principal = Depends(require_admin)):
    """Build the extension bundle (`npm run build`) in the project dir. Admin-only."""
    if _BUILD_LOCK.locked():
        raise HTTPException(status_code=409, detail="A build is already running")
    async with _BUILD_LOCK:
        try:
            rc, out = await _run(["npm", "run", "build"], project_dir, timeout=900)
        except OSError as exc:
            raise HTTPException(status_code=500, detail="Build could not start") from exc
    if rc != 0:
        raise HTTPException(status_code=500, detail=out.strip()[-800:] or "Build failed")
    return {"ok": True, "output": out[-1500:]}


@router.post("/commit-push")
async def commit_push(_: Principal = Depends(require_admin)):
    """Automated push: stage, commit, and push ALL working-tree changes. Admin-only."""
    if _GIT_LOCK.locked():
        raise HTTPException(status_code=409, detail="A push is already running")
    async with _GIT_LOCK:
        rc, out = await _run(["git", "add", "-A"], project_dir, timeout=120)
        if rc != 0:
            raise HTTPException(status_code=500, detail=out.strip()[-800:] or "git add failed")
        rc, cout = await _run(["git", "commit", "-m", _AUTO_COMMIT_MSG], project_dir, timeout=120)
        nothing = "nothing to commit" in cout.lower()
        if rc != 0 and not nothing:
            raise HTTPException(status_code=500, detail=cout.strip()[-800:] or "git commit failed")
        rc, pout = await _run(["git", "push"], project_dir, timeout=300)
        if rc != 0:
            raise HTTPException(status_code=500, detail=pout.strip()[-800:] or "git push failed")
    return {"ok": True, "pushed": True, "committed": not nothing}


# ---------------- authenticated extension client API ----------------

@router.get("/client/health")
async def client_health(request: Request):
    """Validate the installation credential and reversible access setting."""
    return client_api.health(request)


@router.get("/client/configuration")
async def client_configuration(request: Request):
    return client_api.configuration(request)


@router.get("/client/identity")
async def client_identity(request: Request):
    return client_api.get_identity(request)


@router.post("/client/identity")
async def update_client_identity(body: ClientIdentityUpdate, request: Request):
    return client_api.update_identity(body, request)


@router.get("/client/tickets")
async def client_tickets(request: Request):
    return client_api.list_tickets(request)


@router.post("/client/tickets", status_code=201)
async def create_client_ticket(body: ClientTicketCreate, request: Request):
    return client_api.create_ticket(body, request)


@router.get("/client/settings-shares")
async def client_settings_shares(request: Request):
    return client_api.list_settings_shares(request)


@router.post("/client/settings-shares", status_code=201)
async def create_client_settings_share(
    body: ClientSettingsShareCreate, request: Request,
):
    return client_api.create_settings_share(body, request)


@router.get("/client/settings-shares/{share_id}")
async def get_client_settings_share(share_id: str, request: Request):
    return client_api.get_settings_share(share_id, request)


@router.post("/client/settings-shares/{share_id}/imports")
async def retain_client_settings_share(
    share_id: str, body: ClientSettingsShareImport, request: Request,
):
    return client_api.retain_settings_import(share_id, body, request)


@router.post("/client/settings-shares/{share_id}/revoke")
async def revoke_client_settings_share(share_id: str, request: Request):
    return client_api.revoke_settings_share(share_id, request)


@router.get("/client/email-template-shares")
async def client_email_template_shares(request: Request):
    return client_api.list_email_shares(request)


@router.post("/client/email-template-shares", status_code=201)
async def create_client_email_template_share(
    body: ClientEmailTemplateShareCreate, request: Request,
):
    return client_api.create_email_share(body, request)


@router.get("/client/email-template-shares/{share_id}")
async def get_client_email_template_share(share_id: str, request: Request):
    return client_api.get_email_share(share_id, request)


@router.post("/client/email-template-shares/{share_id}/revoke")
async def revoke_client_email_template_share(share_id: str, request: Request):
    return client_api.revoke_email_share(share_id, request)


@router.get("/client/product-stores")
async def client_product_stores(request: Request):
    return client_api.list_product_stores(request)


@router.post("/client/product-stores", status_code=201)
async def create_client_product_store(
    body: ClientProductStoreCreate, request: Request,
):
    return client_api.create_product_store(body, request)


@router.get("/client/product-stores/{store_id}")
async def get_client_product_store(store_id: str, request: Request):
    return client_api.get_product_store(store_id, request)


@router.post("/client/product-stores/{store_id}/revoke")
async def revoke_client_product_store(store_id: str, request: Request):
    return client_api.revoke_product_store(store_id, request)


@router.get("/client/email-exchange-flow")
async def client_email_exchange_flow(request: Request, localPart: str = ""):
    return client_api.email_exchange_flow(request, localPart)


@router.get("/client/email-relay/pending")
async def client_email_relay_pending(
    request: Request, since: int = 0, limit: int = 50, wait: int = 0,
):
    return await client_api.relay_pending(
        request, since=since, limit=limit, wait=wait,
    )


# ---------------- extension configuration (dashboard + compatibility) -----

@router.get("/configuration")
async def configuration(request: Request):
    """Return the resolved database policy, or signal dashboard admin bypass."""
    principal = getattr(request.state, "principal", None)
    if principal is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    is_extension = (
        principal.auth_type == "api_key"
        and EXTENSION_CLIENT_SCOPE in principal.scopes
    )
    if not is_extension and not principal.is_admin:
        raise HTTPException(status_code=403, detail="Extension client or administrator required")
    revision, config_doc = _read_policy(
        principal.credential_id if is_extension else None
    )
    dashboard_principal = auth_manager.authenticate_session_cookie(request)
    admin_bypass = bool(dashboard_principal and dashboard_principal.is_admin)
    payload = {
        "schema_version": 1,
        "admin_bypass": admin_bypass,
        "configuration_reason": "dashboard_admin_bypass" if admin_bypass else "extension_policy",
        "revision": revision,
        "configuration": None if admin_bypass else jsonable_encoder(config_doc),
    }
    return JSONResponse(payload, headers={"Cache-Control": "no-store"})


@router.get("/configuration-values")
async def configuration_values(_: Principal = Depends(require_admin)):
    """Global database policy with broad value/visibility/management editing."""
    _, config_doc = _read_policy()
    rows = []
    for entry in _policy_entries(config_doc):
        rows.append({
            "path_key": entry["path_key"],
            "section": entry["section"],
            "setting": {"text": entry["label"], "sub": entry["setting_path"]},
            "value": _policy_value_cell(entry["value"]),
            "hidden": "Yes" if entry["hidden"] else "No",
            "managed": (
                "—" if entry["managed"] is None
                else "Yes" if entry["managed"] else "No"
            ),
            "act": _global_policy_action(entry),
        })
    rows.sort(key=lambda row: (row["section"].lower(), row["setting"]["text"].lower()))
    payload = {
        "primary_key": "path_key",
        "columns": [
            {"key": "section", "label": "Section"},
            {"key": "setting", "label": "Setting", "grow": True},
            {"key": "value", "label": "Value"},
            {"key": "hidden", "label": "Hidden", "align": "right"},
            {"key": "managed", "label": "Managed", "align": "right"},
            {"key": "act", "label": "", "type": "action", "align": "right"},
        ],
        "rows": rows,
    }
    return JSONResponse(payload, headers={"Cache-Control": "no-store"})


@router.post("/configuration-values/update")
async def update_configuration_value(
    body: GlobalSettingUpdateRequest,
    _: Principal = Depends(require_admin),
):
    """Update global value, hidden, and managed fields in database storage."""
    fields = body.model_fields_set
    try:
        entry = settings_policy.update_global(
            body.path,
            value_marker="value" in fields, value=body.value,
            hidden_marker="hidden" in fields, hidden=body.hidden,
            managed_marker="managed" in fields, managed=body.managed,
        )
    except SettingsPolicyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return JSONResponse({
        "updated": True, "path": entry["path"],
        "value": jsonable_encoder(entry["value"]),
        "hidden": entry["hidden"], "managed": entry["managed"],
    }, headers={"Cache-Control": "no-store"})


@router.post("/configuration-values/toggle")
async def toggle_configuration_value(
    request: Request,
    _: Principal = Depends(require_admin),
):
    """Deprecated Hide/Show action backed by the database policy store."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    requested_path = body.get("path")
    expected_hidden = body.get("expected_hidden")
    if (not isinstance(requested_path, list) or not requested_path
            or any(not isinstance(part, str) or not part for part in requested_path)
            or type(expected_hidden) is not bool):
        raise HTTPException(status_code=422, detail="A path and expected hidden state are required")

    try:
        current = settings_policy.entry_for_path(requested_path)
        if current["hidden"] is not expected_hidden:
            raise SettingsPolicyConflict("Setting visibility changed; refresh and try again")
        updated = settings_policy.update_global(
            requested_path, hidden_marker=True, hidden=not expected_hidden,
        )
    except SettingsPolicyConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (SettingsPolicyError, StopIteration) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return JSONResponse({
        "updated": True,
        "path": requested_path,
        "previous_hidden": current["hidden"],
        "hidden": updated["hidden"],
        "managed": updated["managed"],
        "value": jsonable_encoder(updated["value"]),
    }, headers={"Cache-Control": "no-store"})


def _policy_value_cell(value):
    if type(value) is bool:
        return {"text": "On" if value else "Off", "color": "ok" if value else "bad"}
    if value is None:
        return "—"
    if isinstance(value, (str, int, float)):
        return str(value)
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))[:160]


def _golfballs_key_model(key_id: str):
    with Session(auth_manager.engine) as session:
        key = session.get(AuthApiKey, key_id)
        if key is None or not _is_golfballs_key({
            "name": key.name, "scopes": list(key.scopes or ()),
        }):
            raise HTTPException(status_code=404, detail="Golfballs extension API key not found")
        session.expunge(key)
        return key


@router.get("/keys/{key_id}/configuration-overrides")
async def key_configuration_overrides(
    key_id: str, _: Principal = Depends(require_admin),
):
    """All resolved settings for one API-key modal, with override actions."""
    key = _golfballs_key_model(key_id)
    global_doc = settings_policy.global_document()
    resolved_doc, _ = settings_policy.resolve(key_id)
    resolved = {row["path_key"]: row for row in settings_policy.entries(resolved_doc)}
    overrides = {
        row["path_key"]: row for row in settings_policy.overrides(key_id)
    }
    rows = []
    for entry in settings_policy.entries(global_doc):
        override = overrides.get(entry["path_key"])
        effective = resolved[entry["path_key"]]
        value_mode, hidden_mode, managed_mode = _override_modes(override)
        rows.append({
            "path_key": entry["path_key"],
            "setting": {"text": entry["label"], "sub": entry["setting_path"]},
            "global": _policy_value_cell(entry["value"]),
            "effective": _policy_value_cell(effective["value"]),
            "visibility": hidden_mode.replace("inherit", "Inherit").title(),
            "management": (
                "—" if entry["spec"].get("type") == "section"
                else managed_mode.replace("inherit", "Inherit").title()
            ),
            "act": _override_edit_action(key_id, effective, override),
            "clear": _clear_override_action(key_id, entry["path"]) if override else "",
        })
    return JSONResponse({
        "primary_key": "path_key",
        "columns": [
            {"key": "setting", "label": "Setting", "grow": True},
            {"key": "global", "label": "Global"},
            {"key": "effective", "label": "Effective"},
            {"key": "visibility", "label": "Visibility"},
            {"key": "management", "label": "Managed"},
            {"key": "act", "label": "", "type": "action", "align": "right"},
            {"key": "clear", "label": "", "type": "action", "align": "right"},
        ],
        "rows": rows,
        "meta": {"key_id": key_id, "name": key.name},
    }, headers={"Cache-Control": "no-store"})


@router.post("/keys/{key_id}/configuration-overrides")
async def update_key_configuration_override(
    key_id: str, body: SettingOverrideUpdateRequest,
    _: Principal = Depends(require_admin),
):
    _golfballs_key_model(key_id)
    try:
        payload = settings_policy.set_override(
            key_id, body.path, value_mode=body.value_mode, value=body.value,
            hidden_mode=body.hidden_mode, managed_mode=body.managed_mode,
        )
    except SettingsPolicyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return JSONResponse(payload, headers={"Cache-Control": "no-store"})


@router.post("/keys/{key_id}/configuration-overrides/clear")
async def clear_key_configuration_override(
    key_id: str, body: SettingOverrideClearRequest,
    _: Principal = Depends(require_admin),
):
    _golfballs_key_model(key_id)
    try:
        cleared = settings_policy.clear_override(key_id, body.path)
    except SettingsPolicyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not cleared:
        raise HTTPException(status_code=404, detail="Setting override not found")
    return JSONResponse({"cleared": True, "path": body.path}, headers={"Cache-Control": "no-store"})


@router.get("/configuration-overrides")
async def configuration_overrides(_: Principal = Depends(require_admin)):
    """All explicit per-user overrides for the dedicated dashboard table."""
    overrides = settings_policy.overrides()
    key_ids = {row["credential_id"] for row in overrides}
    with Session(auth_manager.engine) as session:
        owners = _installation_owners(session, key_ids)
        keys = {
            row.id: row for row in session.scalars(select(AuthApiKey).where(
                AuthApiKey.id.in_(key_ids)
            )).all()
        } if key_ids else {}
    global_entries = {
        row["path_key"]: row for row in settings_policy.entries()
    }
    rows = []
    for override in overrides:
        entry = global_entries.get(override["path_key"])
        if not entry:
            continue
        key_id = override["credential_id"]
        key = keys.get(key_id)
        rows.append({
            "id": f"{key_id}:{override['path_key']}",
            "user": _owner_cell(owners.get(key_id)),
            "setting": {"text": entry["label"], "sub": entry["setting_path"]},
            "value": (
                _policy_value_cell(override["value_override"])
                if override["has_value_override"] else "Inherit"
            ),
            "hidden": (
                "Inherit" if override["hidden_override"] is None
                else "Hidden" if override["hidden_override"] else "Shown"
            ),
            "managed": (
                "Inherit" if override["managed_override"] is None
                else "Managed" if override["managed_override"] else "User controlled"
            ),
            "settings": _settings_modal_action(key_id, key.name if key else key_id),
            "clear": _clear_override_action(key_id, entry["path"]),
        })
    return JSONResponse({
        "primary_key": "id",
        "columns": [
            {"key": "user", "label": "User"},
            {"key": "setting", "label": "Setting", "grow": True},
            {"key": "value", "label": "Value"},
            {"key": "hidden", "label": "Visibility"},
            {"key": "managed", "label": "Managed"},
            {"key": "settings", "label": "", "type": "action", "align": "right"},
            {"key": "clear", "label": "", "type": "action", "align": "right"},
        ],
        "rows": rows,
    }, headers={"Cache-Control": "no-store"})


# ---------------- AI help companion (extension client or admin) ----------------

@router.get("/assistant/health")
async def assistant_health(request: Request):
    """Verify credential ownership, Help access, corpus, and provider health."""
    _assistant_principal(request)
    payload = _ensure_assistant()
    ready = bool(
        payload.get("ready") is True
        and (payload.get("completion") or {}).get("available") is not False
    )
    if not ready:
        raise HTTPException(status_code=503, detail="Help Companion is unavailable")
    return JSONResponse(
        {"healthy": True, **payload}, headers={"Cache-Control": "no-store"}
    )

@router.get("/assistant/status")
async def assistant_status(request: Request):
    """Read corpus revision and completion readiness without exposing content."""
    _assistant_principal(request)
    return JSONResponse(_ensure_assistant(), headers={"Cache-Control": "no-store"})


@router.post("/assistant/messages", status_code=202)
async def assistant_message(body: AssistantMessageRequest, request: Request):
    """Queue one bounded, read-only help turn owned by this credential."""
    principal = _assistant_principal(request)
    _ensure_assistant()
    try:
        run = await assistant_manager.start(
            _ASSISTANT_ID, _assistant_owner(principal), body.model_dump()
        )
    except AssistantError as exc:
        raise _assistant_http_error(exc) from exc
    return JSONResponse(run, status_code=202, headers={"Cache-Control": "no-store"})


@router.get("/assistant/runs/{run_id}")
async def assistant_run(run_id: str, request: Request):
    """Recover one queued, active, or short-lived completed help run."""
    principal = _assistant_principal(request)
    _ensure_assistant()
    try:
        payload = assistant_manager.get_run(
            _ASSISTANT_ID, _assistant_owner(principal), run_id
        )
    except AssistantError as exc:
        raise _assistant_http_error(exc) from exc
    return JSONResponse(payload, headers={"Cache-Control": "no-store"})


@router.post("/assistant/runs/{run_id}/cancel")
async def cancel_assistant_run(run_id: str, request: Request):
    """Cancel an installation-owned queued or active completion."""
    principal = _assistant_principal(request)
    _ensure_assistant()
    try:
        payload = await assistant_manager.cancel(
            _ASSISTANT_ID, _assistant_owner(principal), run_id
        )
    except AssistantError as exc:
        raise _assistant_http_error(exc) from exc
    return JSONResponse(payload, headers={"Cache-Control": "no-store"})


@router.post("/assistant/feedback")
async def assistant_feedback(body: AssistantFeedbackRequest, request: Request):
    """Record a content-free helpful/not-helpful signal for a completed run."""
    principal = _assistant_principal(request)
    _ensure_assistant()
    try:
        payload = assistant_manager.feedback(
            _ASSISTANT_ID, _assistant_owner(principal), body.run_id, body.rating
        )
    except AssistantError as exc:
        raise _assistant_http_error(exc) from exc
    return JSONResponse(payload, headers={"Cache-Control": "no-store"})


@router.get("/assistant/admin/status")
async def assistant_admin_status(_: Principal = Depends(require_admin)):
    """Operational readiness, aggregate usage, and existing-key grant drift."""
    _ensure_assistant()
    payload = assistant_manager.status(_ASSISTANT_ID, include_usage=True)
    payload["authorization"] = _assistant_grant_status()
    return JSONResponse(payload, headers={"Cache-Control": "no-store"})


def _assistant_duration(milliseconds) -> str:
    try:
        value = max(0, int(milliseconds or 0))
    except (TypeError, ValueError):
        value = 0
    if value < 1_000:
        return f"{value}ms"
    if value < 60_000:
        return f"{value / 1_000:.1f}s"
    return f"{value / 60_000:.1f}m"


@router.get("/assistant/admin/runs")
async def assistant_admin_runs(_: Principal = Depends(require_admin)):
    """Content-free active/recent session telemetry for the project dashboard."""
    _ensure_assistant()
    runs = assistant_manager.list_runs(_ASSISTANT_ID, limit=100)
    credential_ids = [
        str(run.get("owner_id") or "").split(":", 1)[1]
        for run in runs
        if str(run.get("owner_id") or "").startswith("api_key:")
    ]
    with Session(auth_manager.engine) as session:
        owners = _installation_owners(session, credential_ids)
    tones = {
        "queued": "warning", "running": "accent", "completed": "ok",
        "failed": "bad", "cancelled": "neutral",
    }
    rows = []
    for run in runs:
        owner_id = str(run.get("owner_id") or "")
        credential_id = owner_id.split(":", 1)[1] if owner_id.startswith("api_key:") else ""
        owner = owners.get(credential_id)
        if owner_id.startswith("session:"):
            owner_cell = {"text": "Dashboard administrator", "sub": "session", "color": "accent"}
            owner_detail = "Dashboard administrator · session"
        else:
            owner_cell = _owner_cell(owner)
            owner_detail = _owner_detail(owner)
        status = str(run.get("status") or "unknown")
        provider = str(run.get("provider") or "")
        model = str(run.get("model") or "")
        completion = (
            {"text": provider.title(), "sub": model or "default"}
            if provider else {"text": "—", "sub": str(run.get("phase") or status)}
        )
        rows.append({
            "id": run.get("run_id"),
            "status": {"text": status.title(), "color": tones.get(status, "neutral")},
            "user": owner_cell,
            "phase": str(run.get("phase") or status).replace("_", " ").title(),
            "elapsed": _assistant_duration(run.get("elapsed_ms")),
            "completion": completion,
            "started": str(run.get("started_at") or run.get("created_at") or "")[:19].replace("T", " "),
            "_detail": {
                "title": f"Help session · {status.title()}",
                "subtitle": "Content-free operational telemetry",
                "icon": "message-circle",
                "badge": {"label": status, "tone": tones.get(status, "neutral")},
                "description": "Questions and answers are deliberately excluded from dashboard telemetry.",
                "fields": [
                    {"label": "User", "value": owner_detail},
                    {"label": "Phase", "value": run.get("phase") or status},
                    {"label": "Elapsed", "value": _assistant_duration(run.get("elapsed_ms"))},
                    {"label": "Queue time", "value": _assistant_duration(run.get("queue_ms"))},
                    {"label": "Provider", "value": provider or "Not selected"},
                    {"label": "Model", "value": model or "Not selected"},
                    {"label": "Started", "value": run.get("started_at") or run.get("created_at") or "—", "mono": True},
                    {"label": "Finished", "value": run.get("finished_at") or "In progress", "mono": True},
                    {"label": "Error type", "value": run.get("error_type") or "None"},
                    {"label": "Run ID", "value": run.get("run_id") or "—", "mono": True, "copyable": True},
                ],
            },
        })
    return JSONResponse({
        "primary_key": "id",
        "columns": [
            {"key": "status", "label": "Status"},
            {"key": "user", "label": "User", "grow": True},
            {"key": "phase", "label": "Phase"},
            {"key": "elapsed", "label": "Elapsed", "align": "right"},
            {"key": "completion", "label": "Completion"},
            {"key": "started", "label": "Started", "align": "right"},
        ],
        "rows": rows,
    }, headers={"Cache-Control": "no-store"})


@router.post("/assistant/admin/reindex")
async def reindex_assistant(_: Principal = Depends(require_admin)):
    """Rebuild the in-memory index from current guide, inventory, and source."""
    payload = _ensure_assistant(force=True)
    return JSONResponse(
        {"reindexed": True, **payload}, headers={"Cache-Control": "no-store"}
    )


@router.post("/assistant/admin/grants")
async def grant_assistant_access(
    body: AssistantGrantRequest,
    _: Principal = Depends(require_admin),
):
    """Explicitly add the declared assistant grants to existing installations.

    Project route registration intentionally does not broaden old keys on its
    own.  This confirmed administrator action performs that one migration while
    leaving unrelated scopes and credentials untouched.
    """
    del body  # Literal confirmation has already been validated by Pydantic.
    updated = 0
    with Session(auth_manager.engine) as session:
        keys = session.scalars(
            select(AuthApiKey).where(AuthApiKey.revoked_at.is_(None))
        ).all()
        for key in keys:
            scopes = set(key.scopes or ())
            if EXTENSION_CLIENT_SCOPE not in scopes:
                continue
            if not (
                str(key.name or "").startswith(_KEY_NAME_PREFIXES)
                or any(_PROJECT_SCOPE_PREFIX in scope for scope in scopes)
            ):
                continue
            if _merge_assistant_grants(key):
                updated += 1
            _set_access(session, key.id, assistant_enabled=True)
        session.commit()
    return JSONResponse({
        "updated_credentials": updated,
        **_assistant_grant_status(),
    }, headers={"Cache-Control": "no-store"})


# ---------------- key management (admin) ----------------

@router.get("/keys")
async def list_keys(_: Principal = Depends(require_admin)):
    """Golfballs keys with reversible product/chat settings and revocation."""
    keys = [key for key in auth_manager.list_api_keys() if _is_golfballs_key(key)]
    with Session(auth_manager.engine) as session:
        owners = _installation_owners(session, [key.get("id") for key in keys])
        key_models = {
            row.id: row for row in session.scalars(select(AuthApiKey).where(
                AuthApiKey.id.in_([key.get("id") for key in keys])
            )).all()
        }
        access = {
            key_id: _access_state(session, row)
            for key_id, row in key_models.items()
        }
        global_row = session.get(ExtensionInstallationAccess, "*")
        global_enabled = not (
            global_row is not None and global_row.extension_enabled is False
        )
    columns = [
        {"key": "status", "label": "", "align": "left"},
        {"key": "name", "label": "Name", "grow": True},
        {"key": "user", "label": "User"},
        {"key": "prefix", "label": "Prefix", "mono": True},
        {"key": "expires", "label": "Expires", "align": "right"},
        {"key": "access", "label": "Toolkit", "type": "action", "align": "right"},
        {"key": "chat", "label": "Help chat", "type": "action", "align": "right"},
        {"key": "settings", "label": "Settings", "type": "action", "align": "right"},
        {"key": "act", "label": "", "type": "action", "align": "right"},
    ]
    rows = [{
        "id": "*",
        "status": {"text": "◆", "color": "ok" if global_enabled else "bad"},
        "name": {"text": "All installations", "sub": "Global override"},
        "user": "Every current and future user",
        "prefix": "—",
        "expires": "—",
        "access": _bulk_access_action(global_enabled),
        "chat": "Per installation",
        "settings": "Global policy",
        "act": "",
    }]
    for k in keys:
        st = _key_status(k)
        state = access.get(k.get("id"), {
            "extension_enabled": False, "assistant_enabled": False,
            "personal_enabled": False, "personal_assistant_enabled": False,
        })
        name = k.get("name") or "this installation"
        if st != "active":
            chat = {"text": "Unavailable"}
            toolkit = {"text": "Unavailable"}
        else:
            toolkit = _installation_access_action(
                k.get("id"), name, state["personal_enabled"]
            )
            chat = (
                _assistant_access_action(
                    k.get("id"), name, state["personal_assistant_enabled"]
                )
                if state["extension_enabled"]
                else {"text": "Toolkit disabled"}
            )
        row = {
            "id": k.get("id"),
            "status": {
                "text": "●",
                "color": "ok" if st == "active" and state["extension_enabled"] else "bad",
            },
            "name": k.get("name", ""),
            "user": _owner_cell(owners.get(k.get("id"))),
            "prefix": k.get("prefix", ""),
            "expires": str(k.get("expires_at") or "never")[:10],
            "access": toolkit,
            "chat": chat,
            "settings": (
                _settings_modal_action(k.get("id"), name)
                if st == "active" else {"text": "Unavailable"}
            ),
            "act": (_revoke_action(f"{_PROJECT_SCOPE_PREFIX}keys/revoke",
                                   {"key_id": k.get("id")},
                                   "Permanently revoke this API key? Use Toolkit Disable for reversible access.")
                    if st == "active" else ""),
        }
        rows.append(row)
    return {"primary_key": "id", "columns": columns, "rows": rows}


@router.post("/keys/assistant-access")
async def grant_key_assistant_access(
    body: AssistantKeyGrantRequest,
    _: Principal = Depends(require_admin),
):
    """Grant Help Companion routes to one active Golfballs installation."""
    with Session(auth_manager.engine) as session:
        key = session.get(AuthApiKey, body.key_id)
        if key is None or not _is_golfballs_key({
            "name": key.name,
            "scopes": list(key.scopes or ()),
        }):
            raise HTTPException(
                status_code=404, detail="Golfballs extension API key not found"
            )
        if key.revoked_at is not None or (
            key.expires_at is not None and key.expires_at <= datetime.utcnow()
        ):
            raise HTTPException(status_code=409, detail="API key is not active")
        # Preserve exact route grants when enabling for old builds. The real
        # product authorization is the reversible database setting.
        added = _merge_assistant_grants(key) if body.enabled else []
        _set_access(session, key.id, assistant_enabled=body.enabled)
        session.commit()
    return JSONResponse({
        "granted": True,
        "chat_access": "enabled" if body.enabled else "disabled",
        "key_id": body.key_id,
        "already_granted": not added,
        "grants_added": added,
    }, headers={"Cache-Control": "no-store"})


@router.post("/keys/access")
async def update_key_access(
    body: InstallationAccessRequest,
    _: Principal = Depends(require_admin),
):
    """Reversibly enable or disable one installation without revoking its key."""
    with Session(auth_manager.engine) as session:
        key = session.get(AuthApiKey, body.key_id)
        if key is None or not _is_golfballs_key({
            "name": key.name, "scopes": list(key.scopes or ()),
        }):
            raise HTTPException(status_code=404, detail="Golfballs extension API key not found")
        _set_access(session, key.id, extension_enabled=body.enabled)
        session.commit()
        state = _access_state(session, key)
    return JSONResponse(
        {"updated": True, "key_id": body.key_id, **state},
        headers={"Cache-Control": "no-store"},
    )


@router.post("/keys/access/bulk")
async def update_all_key_access(
    body: BulkInstallationAccessRequest,
    _: Principal = Depends(require_admin),
):
    """Set the global access override used by every current and future install."""
    del body.confirm
    with Session(auth_manager.engine) as session:
        _set_access(session, "*", extension_enabled=body.enabled)
        session.commit()
    return JSONResponse({
        "updated": True,
        "global_enabled": body.enabled,
    }, headers={"Cache-Control": "no-store"})


@router.post("/keys/revoke")
async def revoke_key(request: Request, _: Principal = Depends(require_admin)):
    """Revoke a golfballs key by id (table action or the CLI bind here)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    key_id = str(body.get("key_id") or "").strip()
    if not key_id:
        raise HTTPException(status_code=422, detail="key_id is required")
    allowed_ids = {
        key.get("id") for key in auth_manager.list_api_keys()
        if _is_golfballs_key(key)
    }
    if key_id not in allowed_ids:
        raise HTTPException(status_code=404, detail="Golfballs extension API key not found")
    payload = auth_manager.revoke_api_key(key_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="API key not found")
    return {"revoked": True, "api_key": payload}


# ---------------- shared settings, email links + product stores (admin) ----------------

@router.get("/shares/settings")
async def settings_shares(_: Principal = Depends(require_admin)):
    """v1 `table` block: active shared settings bundles, per-row Revoke."""
    with Session(auth_manager.engine) as session:
        rows = session.scalars(
            select(ExtensionSettingsShare)
            .where(ExtensionSettingsShare.revoked_at.is_(None))
            .order_by(ExtensionSettingsShare.created_at.desc())
        ).all()
        owners = _installation_owners(
            session, [row.owner_credential_id for row in rows]
        )
        data = []
        for r in rows:
            scopes = r.scopes if isinstance(r.scopes, dict) else {}
            scope_ids = sorted(str(scope) for scope in scopes)
            setting_count = sum(len(values) for values in scopes.values()
                                if isinstance(values, dict))
            url = _settings_share_url(r.id)
            owner = owners.get(r.owner_credential_id)
            data.append({
                "id": r.id,
                "name": r.name,
                "owner": _owner_cell(owner),
                "scopes": str(len(scope_ids)),
                "opens": str(int(r.access_count or 0)),
                "created": r.created_at.isoformat()[:10] if r.created_at else "",
                "_detail": {
                    "title": r.name,
                    "subtitle": "Shared settings template",
                    "icon": "sliders-horizontal",
                    "badge": {"label": "Active", "tone": "ok"},
                    "description": "An enrolled extension can preview and merge the selected settings scopes from this link.",
                    "fields": [
                        {"label": "Created by", "value": _owner_detail(owner)},
                        {"label": "Scopes", "value": scope_ids, "wrap": True},
                        {"label": "Settings", "value": setting_count, "mono": True},
                        {"label": "Opens", "value": int(r.access_count or 0), "mono": True},
                        {"label": "Created", "value": r.created_at.isoformat() if r.created_at else "—", "mono": True},
                        {"label": "Last opened", "value": r.last_accessed_at.isoformat() if r.last_accessed_at else "Never", "mono": True},
                        {"label": "Share ID", "value": r.id, "mono": True, "copyable": True},
                        {"label": "Link", "value": url, "mono": True, "copyable": True, "wrap": True},
                    ],
                },
                "act": _revoke_action(f"{_PROJECT_SCOPE_PREFIX}shares/settings/revoke",
                                      {"id": r.id}, "Revoke this settings link?"),
            })
    columns = [
        {"key": "name", "label": "Name", "grow": True},
        {"key": "owner", "label": "Created by"},
        {"key": "scopes", "label": "Scopes", "align": "right"},
        {"key": "opens", "label": "Opens", "align": "right"},
        {"key": "created", "label": "Created", "align": "right"},
        {"key": "act", "label": "", "type": "action", "align": "right"},
    ]
    return {"primary_key": "id", "columns": columns, "rows": data}


@router.get("/shares/email")
async def email_shares(_: Principal = Depends(require_admin)):
    """v1 `table` block: unexpired temporary email-template links, per-row Revoke."""
    now = datetime.utcnow()
    with Session(auth_manager.engine) as session:
        rows = session.scalars(
            select(ExtensionEmailTemplateShare)
            .where(ExtensionEmailTemplateShare.revoked_at.is_(None),
                   ExtensionEmailTemplateShare.expires_at > now)
            .order_by(ExtensionEmailTemplateShare.created_at.desc())
        ).all()
        owners = _installation_owners(
            session, [row.owner_credential_id for row in rows]
        )
        data = []
        for r in rows:
            template = r.template if isinstance(r.template, dict) else {}
            url = _email_share_url(r.id)
            subject = template.get("subject") or template.get("subjectLine") or "—"
            variations = template.get("variations")
            variation_count = len(variations) if isinstance(variations, list) else 0
            owner = owners.get(r.owner_credential_id)
            data.append({
                "id": r.id,
                "name": r.name,
                "owner": _owner_cell(owner),
                "type": str(template.get("type") or "—"),
                "expires": r.expires_at.isoformat()[:16].replace("T", " ") if r.expires_at else "",
                "_detail": {
                    "title": r.name,
                    "subtitle": "Temporary email template link",
                    "icon": "mail",
                    "badge": {"label": "24 hour", "tone": "accent"},
                    "description": "This temporary link expires automatically and can be imported by an enrolled extension installation.",
                    "fields": [
                        {"label": "Created by", "value": _owner_detail(owner)},
                        {"label": "Template type", "value": template.get("type") or "—"},
                        {"label": "Subject", "value": subject, "wrap": True},
                        {"label": "Variations", "value": variation_count, "mono": True},
                        {"label": "Opens", "value": int(r.access_count or 0), "mono": True},
                        {"label": "Created", "value": r.created_at.isoformat() if r.created_at else "—", "mono": True},
                        {"label": "Expires", "value": r.expires_at.isoformat() if r.expires_at else "—", "mono": True},
                        {"label": "Share ID", "value": r.id, "mono": True, "copyable": True},
                        {"label": "Link", "value": url, "mono": True, "copyable": True, "wrap": True},
                    ],
                },
                "act": _revoke_action(f"{_PROJECT_SCOPE_PREFIX}shares/email/revoke",
                                      {"id": r.id}, "Revoke this email link?"),
            })
    columns = [
        {"key": "name", "label": "Name", "grow": True},
        {"key": "owner", "label": "Created by"},
        {"key": "type", "label": "Type"},
        {"key": "expires", "label": "Expires", "align": "right"},
        {"key": "act", "label": "", "type": "action", "align": "right"},
    ]
    return {"primary_key": "id", "columns": columns, "rows": data}


@router.get("/shares/products")
async def product_stores(_: Principal = Depends(require_admin)):
    """v1 `table` block: active custom-item product stores, per-row Revoke."""
    with Session(auth_manager.engine) as session:
        rows = session.scalars(
            select(ExtensionProductStore)
            .where(ExtensionProductStore.revoked_at.is_(None))
            .order_by(ExtensionProductStore.created_at.desc())
        ).all()
        owners = _installation_owners(
            session, [row.owner_credential_id for row in rows]
        )
        data = []
        for row in rows:
            items = row.items if isinstance(row.items, list) else []
            item_labels = []
            for index, item in enumerate(items):
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name") or item.get("title") or f"Item {index + 1}")
                sku = str(item.get("sku") or item.get("itemID") or "").strip()
                item_labels.append(f"{name} · {sku}" if sku else name)
            url = _product_store_url(row.id)
            owner = owners.get(row.owner_credential_id)
            data.append({
                "id": row.id,
                "name": row.name,
                "owner": _owner_cell(owner),
                "items": str(int(row.item_count or len(items))),
                "opens": str(int(row.access_count or 0)),
                "created": row.created_at.isoformat()[:10] if row.created_at else "",
                "_detail": {
                    "title": row.name,
                    "subtitle": "Shared custom-item product store",
                    "icon": "shopping-bag",
                    "badge": {"label": "Active", "tone": "ok"},
                    "description": "An enrolled extension can import these custom items while the store remains active.",
                    "fields": [
                        {"label": "Created by", "value": _owner_detail(owner)},
                        {"label": "Items", "value": item_labels or ["No readable items"], "wrap": True},
                        {"label": "Item count", "value": int(row.item_count or len(items)), "mono": True},
                        {"label": "Opens", "value": int(row.access_count or 0), "mono": True},
                        {"label": "Created", "value": row.created_at.isoformat() if row.created_at else "—", "mono": True},
                        {"label": "Store ID", "value": row.id, "mono": True, "copyable": True},
                        {"label": "Link", "value": url, "mono": True, "copyable": True, "wrap": True},
                    ],
                },
                "act": _revoke_action(f"{_PROJECT_SCOPE_PREFIX}shares/products/revoke",
                                      {"id": row.id}, "Revoke this product store?"),
            })
    columns = [
        {"key": "name", "label": "Name", "grow": True},
        {"key": "owner", "label": "Created by"},
        {"key": "items", "label": "Items", "align": "right"},
        {"key": "opens", "label": "Opens", "align": "right"},
        {"key": "created", "label": "Created", "align": "right"},
        {"key": "act", "label": "", "type": "action", "align": "right"},
    ]
    return {"primary_key": "id", "columns": columns, "rows": data}


@router.get("/tickets")
async def support_tickets(_: Principal = Depends(require_admin)):
    """Administrator table of extension bug reports and feature requests."""
    with Session(auth_manager.engine) as session:
        tickets = session.scalars(
            select(ExtensionSupportTicket)
            .order_by(ExtensionSupportTicket.updated_at.desc())
            .limit(250)
        ).all()
        replies = session.scalars(
            select(ExtensionSupportTicketReply)
            .where(ExtensionSupportTicketReply.ticket_id.in_([row.id for row in tickets]))
            .order_by(ExtensionSupportTicketReply.created_at.asc())
        ).all() if tickets else []
        by_ticket = {}
        for reply in replies:
            by_ticket.setdefault(reply.ticket_id, []).append(reply)
        owners = _installation_owners(
            session, [row.owner_credential_id for row in tickets]
        )
        tones = {
            "open": "warning", "triaged": "accent", "in_progress": "accent",
            "planned": "run", "resolved": "ok", "closed": "neutral",
        }
        rows = []
        for ticket in tickets:
            ticket_replies = by_ticket.get(ticket.id, [])
            owner = owners.get(ticket.owner_credential_id)
            status = str(ticket.status or "open")
            kind = str(ticket.kind or "bug")
            context = ticket.context if isinstance(ticket.context, dict) else {}
            source_references = [
                (
                    f"{item.get('path')}:{item.get('line_start')}"
                    + (f"-{item.get('line_end')}" if item.get("line_end") != item.get("line_start") else "")
                )
                for item in context.get("source_references") or ()
                if isinstance(item, dict) and item.get("path") and item.get("line_start")
            ]
            rows.append({
                "id": ticket.id,
                "kind": {
                    "text": "Bug" if kind == "bug" else "Feature",
                    "badge": {
                        "label": "BUG" if kind == "bug" else "IDEA",
                        "color": "bad" if kind == "bug" else "accent",
                    },
                },
                "title": {"text": ticket.title, "sub": ticket.id},
                "owner": _owner_cell(owner),
                "status": {"text": status.replace("_", " ").title(), "color": tones.get(status, "neutral")},
                "replies": str(len(ticket_replies)),
                "updated": ticket.updated_at.isoformat()[:16].replace("T", " ") if ticket.updated_at else "",
                "_detail": {
                    "title": ticket.title,
                    "subtitle": f"{ticket.id} · {'Bug report' if kind == 'bug' else 'Feature request'}",
                    "icon": "bug" if kind == "bug" else "lightbulb",
                    "badge": {"label": status.replace("_", " "), "tone": tones.get(status, "neutral")},
                    "description": ticket.description,
                    "fields": [
                        {"label": "Submitted by", "value": _owner_detail(owner)},
                        {"label": "Status", "value": status.replace("_", " ").title()},
                        {"label": "Extension", "value": context.get("extension_version") or "Unknown", "mono": True},
                        {"label": "Surface", "value": context.get("surface") or "Unknown"},
                        {"label": "Page type", "value": context.get("page_type") or "Unknown"},
                        {"label": "Page route", "value": context.get("page_url") or "Not provided", "mono": True, "wrap": True},
                        {"label": "Source references", "value": source_references or ["No code reference attached"], "mono": True, "wrap": True},
                        {"label": "Replies", "value": [
                            f"{reply.author_name}: {reply.message}" for reply in ticket_replies
                        ] or ["No replies yet"], "wrap": True},
                        {"label": "Created", "value": ticket.created_at.isoformat() if ticket.created_at else "—", "mono": True},
                        {"label": "Updated", "value": ticket.updated_at.isoformat() if ticket.updated_at else "—", "mono": True},
                    ],
                },
                "reply": _ticket_reply_action(ticket.id, ticket.title, status),
                "delete": _ticket_delete_action(ticket.id, ticket.title),
            })
    return {
        "primary_key": "id",
        "columns": [
            {"key": "kind", "label": "Type"},
            {"key": "title", "label": "Ticket", "grow": True},
            {"key": "owner", "label": "User"},
            {"key": "status", "label": "Status"},
            {"key": "replies", "label": "Replies", "align": "right"},
            {"key": "updated", "label": "Updated", "align": "right"},
            {"key": "reply", "label": "", "type": "action", "align": "right"},
            {"key": "delete", "label": "", "type": "action", "align": "right"},
        ],
        "rows": rows,
    }


@router.post("/tickets/{ticket_id}/reply")
async def reply_to_support_ticket(
    ticket_id: str,
    body: TicketReplyRequest,
    principal: Principal = Depends(require_admin),
):
    """Reply to one extension ticket and update its visible workflow status."""
    message = "\n".join(" ".join(line.split()) for line in body.message.splitlines()).strip()
    if not message:
        raise HTTPException(status_code=422, detail="Reply message is required")
    now = datetime.utcnow()
    with Session(auth_manager.engine) as session:
        ticket = session.get(ExtensionSupportTicket, ticket_id)
        if ticket is None:
            raise HTTPException(status_code=404, detail="Support ticket not found")
        reply = ExtensionSupportTicketReply(
            id=str(uuid.uuid4()),
            ticket_id=ticket.id,
            author_user_id=principal.user_id,
            author_name=principal.username or "RevStack administrator",
            message=message,
            created_at=now,
        )
        ticket.status = body.status
        ticket.updated_at = now
        ticket.closed_at = now if body.status in {"resolved", "closed"} else None
        # Keep the response entirely scalar. SQLAlchemy expires ORM attributes
        # on commit, and reading ``reply.id`` after this session closes raises a
        # DetachedInstanceError even though the reply was already persisted.
        reply_id = reply.id
        session.add(reply)
        session.commit()
    return JSONResponse({
        "replied": True,
        "ticket_id": ticket_id,
        "reply_id": reply_id,
        "status": body.status,
    }, headers={"Cache-Control": "no-store"})


@router.delete("/tickets/{ticket_id}")
async def delete_support_ticket(
    ticket_id: str,
    _: Principal = Depends(require_admin),
):
    """Permanently delete one support ticket and all administrator replies."""
    with Session(auth_manager.engine) as session:
        ticket = session.get(ExtensionSupportTicket, ticket_id)
        if ticket is None:
            raise HTTPException(status_code=404, detail="Support ticket not found")
        # Delete explicitly as well as relying on the FK cascade. This keeps the
        # behavior correct for local SQLite databases where FK cascades may not
        # be enabled on every connection.
        session.execute(
            delete(ExtensionSupportTicketReply)
            .where(ExtensionSupportTicketReply.ticket_id == ticket_id)
        )
        session.delete(ticket)
        session.commit()
    return JSONResponse({
        "deleted": True,
        "ticket_id": ticket_id,
    }, headers={"Cache-Control": "no-store"})


async def _revoke_share(request: Request, model):
    try:
        body = await request.json()
    except Exception:
        body = {}
    share_id = str(body.get("id") or "").strip()
    if not share_id:
        raise HTTPException(status_code=422, detail="id is required")
    with Session(auth_manager.engine) as session:
        row = session.get(model, share_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Share not found")
        if row.revoked_at is None:
            row.revoked_at = datetime.utcnow()
            session.commit()
    return {"revoked": True}


@router.post("/shares/settings/revoke")
async def revoke_settings_share(request: Request, _: Principal = Depends(require_admin)):
    return await _revoke_share(request, ExtensionSettingsShare)


@router.post("/shares/email/revoke")
async def revoke_email_share(request: Request, _: Principal = Depends(require_admin)):
    return await _revoke_share(request, ExtensionEmailTemplateShare)


@router.post("/shares/products/revoke")
async def revoke_product_store(request: Request, _: Principal = Depends(require_admin)):
    return await _revoke_share(request, ExtensionProductStore)
