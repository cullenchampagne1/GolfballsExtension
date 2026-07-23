"""Project-owned authenticated API for Golfballs extension installations.

The RevStack backend supplies authentication, persistence, and the generic AI
runtime.  Product validation and endpoint behavior live beside the extension
that consumes them, so the deprecated core ``/extension/*`` router can remain a
temporary compatibility shim and then be deleted without relocating logic.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import secrets
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal

from fastapi import HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session


CLIENT_ROOT = "/projects/golfballs-extension/client"
GLOBAL_SUBJECT = "*"
SHARE_ID = re.compile(r"^[A-Za-z0-9_-]{32}$")
LOCAL_PART = re.compile(r"^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$", re.I)
TICKET_REQUEST_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$")
OPEN_TICKET_STATUSES = {"open", "triaged", "in_progress", "planned"}
ALLOWED_SHARE_SCOPES = {
    "settings", "settings-preferences", "settings-appearance", "settings-email",
    "tpl-order", "tpl-case", "tpl-account", "tpl-contact",
    "note-quick", "note-task", "note-call",
}

MAX_ACTIVE_SHARES = 100
MAX_ACTIVE_EMAIL_SHARES = 500
MAX_ACTIVE_PRODUCT_STORES = 200
MAX_PRODUCT_STORE_ITEMS = 2_000
MAX_OPEN_TICKETS = 100
MAX_SHARE_BYTES = 100 * 1024 * 1024
MAX_INSTALLATION_BYTES = 1024 * 1024 * 1024
EMAIL_SHARE_TTL_HOURS = 24


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class IdentityUpdate(StrictModel):
    display_name: str = Field(min_length=1, max_length=120)
    local_part: str | None = Field(default=None, max_length=64)
    source: Literal["email_local_part", "settings_prompt", "settings_edit"]


class TicketCreate(StrictModel):
    request_id: str = Field(min_length=8, max_length=180)
    kind: Literal["bug", "feature"]
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=2_000)
    context: dict = Field(default_factory=dict)


class SettingsShareCreate(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    scopes: dict


class SettingsShareImport(StrictModel):
    scope_ids: list[str] = Field(min_length=1, max_length=len(ALLOWED_SHARE_SCOPES))


class EmailTemplateShareCreate(StrictModel):
    template: dict


class ProductStoreCreate(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    items: list = Field(min_length=1)


def _json_size(value) -> int:
    try:
        return len(json.dumps(
            value, ensure_ascii=False, separators=(",", ":"), allow_nan=False,
        ).encode("utf-8"))
    except (TypeError, ValueError, RecursionError):
        return MAX_INSTALLATION_BYTES + 1


class ExtensionClientApi:
    def __init__(
        self, *, auth_manager, models, config_access_manager, config_error,
        client_scope: str, project_dir: Path, public_origin: str,
        service_manager_factory=None,
    ):
        self.auth_manager = auth_manager
        self.models = models
        self.config_access_manager = config_access_manager
        self.config_error = config_error
        self.client_scope = client_scope
        self.project_dir = Path(project_dir)
        self.public_origin = public_origin.rstrip("/")
        self.service_manager_factory = service_manager_factory

    # ----- access ---------------------------------------------------------

    def principal(self, request: Request, *, require_enabled: bool = True):
        principal = getattr(request.state, "principal", None)
        if principal is None:
            raise HTTPException(status_code=401, detail="Not authenticated")
        if (
            principal.auth_type != "api_key"
            or self.client_scope not in set(principal.scopes or ())
            or not principal.credential_id
        ):
            raise HTTPException(
                status_code=403, detail="Extension installation credential required"
            )
        if require_enabled and not self.access(principal)["extension_enabled"]:
            raise HTTPException(status_code=403, detail="Extension access is disabled")
        return principal

    @staticmethod
    def _legacy_assistant_enabled(scopes) -> bool:
        return any(
            "/projects/golfballs-extension/assistant/" in str(scope)
            for scope in (scopes or ())
        )

    def access(self, principal) -> dict:
        Access = self.models.ExtensionInstallationAccess
        with Session(self.auth_manager.engine) as session:
            global_row = session.get(Access, GLOBAL_SUBJECT)
            row = session.get(Access, principal.credential_id)
        globally_enabled = not (
            global_row is not None and global_row.extension_enabled is False
        )
        personally_enabled = not (
            row is not None and row.extension_enabled is False
        )
        extension_enabled = globally_enabled and personally_enabled
        if row is not None and row.assistant_enabled is not None:
            personally_assistant_enabled = row.assistant_enabled is True
        else:
            personally_assistant_enabled = self._legacy_assistant_enabled(
                principal.scopes
            )
        return {
            "extension_enabled": extension_enabled,
            "assistant_enabled": extension_enabled and personally_assistant_enabled,
            "global_enabled": globally_enabled,
            "personal_enabled": personally_enabled,
            "personal_assistant_enabled": personally_assistant_enabled,
        }

    def require_assistant(self, request: Request):
        principal = self.principal(request)
        if not self.access(principal)["assistant_enabled"]:
            raise HTTPException(status_code=403, detail="Help Companion access is disabled")
        return principal

    def health(self, request: Request) -> JSONResponse:
        principal = self.principal(request, require_enabled=False)
        state = self.access(principal)
        if not state["extension_enabled"]:
            raise HTTPException(status_code=403, detail="Extension access is disabled")
        return JSONResponse({
            "ok": True,
            "session_valid": True,
            **state,
        }, headers={"Cache-Control": "no-store"})

    # ----- configuration + identity -------------------------------------

    def configuration(self, request: Request) -> JSONResponse:
        self.principal(request)
        try:
            _, source, document = self.config_access_manager.read(
                "golfballs-extension-configuration"
            )
        except self.config_error as exc:
            raise HTTPException(
                status_code=503, detail="Extension configuration unavailable"
            ) from exc
        if not isinstance(document, dict) or document.get("schema_version") != 1:
            raise HTTPException(status_code=503, detail="Extension configuration is invalid")
        dashboard = self.auth_manager.authenticate_session_cookie(request)
        bypass = bool(dashboard and dashboard.is_admin)
        return JSONResponse({
            "schema_version": 1,
            "admin_bypass": bypass,
            "configuration_reason": (
                "dashboard_admin_bypass" if bypass else "extension_policy"
            ),
            "revision": hashlib.sha256(source.encode("utf-8")).hexdigest(),
            "configuration": None if bypass else jsonable_encoder(document),
        }, headers={"Cache-Control": "no-store"})

    def _identity_payload(self, row, credential_id: str) -> dict:
        if row is None:
            return {"registered": False, "installation_id": credential_id}
        return {
            "registered": True,
            "installation_id": credential_id,
            "display_name": row.display_name,
            "local_part": row.local_part,
            "source": row.source,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }

    def _identity_names(self, session: Session, credential_ids) -> dict[str, str]:
        ids = {str(value) for value in credential_ids if value}
        if not ids:
            return {}
        Identity = self.models.ExtensionInstallationIdentity
        rows = session.scalars(select(Identity).where(
            Identity.credential_id.in_(ids)
        )).all()
        return {row.credential_id: row.display_name for row in rows}

    def get_identity(self, request: Request) -> JSONResponse:
        principal = self.principal(request)
        Identity = self.models.ExtensionInstallationIdentity
        with Session(self.auth_manager.engine) as session:
            row = session.get(Identity, principal.credential_id)
            payload = self._identity_payload(row, principal.credential_id)
        return JSONResponse(payload, headers={"Cache-Control": "no-store"})

    def update_identity(self, body: IdentityUpdate, request: Request) -> JSONResponse:
        principal = self.principal(request)
        name = " ".join(body.display_name.split())
        local_part = str(body.local_part or "").strip().lower() or None
        if not name or (local_part is not None and not LOCAL_PART.fullmatch(local_part)):
            raise HTTPException(status_code=422, detail="Installation identity is invalid")
        if body.source == "email_local_part" and local_part is None:
            raise HTTPException(
                status_code=422, detail="Email-derived identity requires an account host"
            )
        Identity = self.models.ExtensionInstallationIdentity
        now = datetime.utcnow()
        with Session(self.auth_manager.engine) as session:
            row = session.get(Identity, principal.credential_id)
            if row is None:
                row = Identity(
                    credential_id=principal.credential_id, display_name=name,
                    local_part=local_part, source=body.source,
                    created_at=now, updated_at=now,
                )
                session.add(row)
            else:
                row.display_name = name
                row.local_part = local_part or row.local_part
                row.source = body.source
                row.updated_at = now
            session.commit()
            session.refresh(row)
            payload = self._identity_payload(row, principal.credential_id)
        return JSONResponse(payload, headers={"Cache-Control": "no-store"})

    # ----- tickets --------------------------------------------------------

    @staticmethod
    def _ticket_context(value: dict) -> dict:
        allowed = {
            "extension_version", "surface", "page_type", "page_url",
            "source_references",
        }
        if not isinstance(value, dict) or set(value) - allowed:
            raise HTTPException(status_code=422, detail="Ticket context is invalid")
        clean = {}
        for key in ("extension_version", "surface", "page_type"):
            text = " ".join(str(value.get(key) or "").split())
            limit = 40 if key == "extension_version" else 60
            if text:
                if len(text) > limit or not re.fullmatch(r"[A-Za-z0-9._:-]+", text):
                    raise HTTPException(status_code=422, detail="Ticket context is invalid")
                clean[key] = text
        page_url = str(value.get("page_url") or "").strip()
        if page_url:
            if len(page_url) > 500 or not re.fullmatch(r"https?://[^\s<>]{1,490}", page_url):
                raise HTTPException(status_code=422, detail="Ticket context is invalid")
            clean["page_url"] = page_url
        refs = value.get("source_references") or []
        if not isinstance(refs, list) or len(refs) > 6:
            raise HTTPException(status_code=422, detail="Ticket source references are invalid")
        out = []
        for item in refs:
            if not isinstance(item, dict) or set(item) != {"path", "line_start", "line_end"}:
                raise HTTPException(status_code=422, detail="Ticket source references are invalid")
            path = str(item.get("path") or "").strip()
            try:
                start, end = int(item["line_start"]), int(item["line_end"])
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="Ticket source references are invalid") from None
            if (
                not re.fullmatch(r"[A-Za-z0-9_./-]{1,300}", path)
                or path.startswith("/") or ".." in path.split("/")
                or start < 1 or end < start or end > 10_000_000
            ):
                raise HTTPException(status_code=422, detail="Ticket source references are invalid")
            out.append({"path": path, "line_start": start, "line_end": end})
        if out:
            clean["source_references"] = out
        return clean

    def _ticket_replies(self, session: Session, ids) -> dict[str, list[dict]]:
        Reply = self.models.ExtensionSupportTicketReply
        values = [str(value) for value in ids if value]
        if not values:
            return {}
        rows = session.scalars(select(Reply).where(
            Reply.ticket_id.in_(values)
        ).order_by(Reply.created_at.asc())).all()
        grouped = {}
        for row in rows:
            grouped.setdefault(row.ticket_id, []).append({
                "id": row.id, "author": row.author_name, "message": row.message,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            })
        return grouped

    @staticmethod
    def _ticket_payload(row, replies) -> dict:
        return {
            "id": row.id, "kind": row.kind, "title": row.title,
            "description": row.description, "status": row.status,
            "context": row.context if isinstance(row.context, dict) else {},
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            "closed_at": row.closed_at.isoformat() if row.closed_at else None,
            "replies": replies,
        }

    def list_tickets(self, request: Request) -> JSONResponse:
        principal = self.principal(request)
        Ticket = self.models.ExtensionSupportTicket
        with Session(self.auth_manager.engine) as session:
            rows = session.scalars(select(Ticket).where(
                Ticket.owner_credential_id == principal.credential_id
            ).order_by(Ticket.updated_at.desc()).limit(100)).all()
            replies = self._ticket_replies(session, [row.id for row in rows])
            payload = [self._ticket_payload(row, replies.get(row.id, [])) for row in rows]
        return JSONResponse({"tickets": payload}, headers={"Cache-Control": "no-store"})

    def create_ticket(self, body: TicketCreate, request: Request) -> JSONResponse:
        principal = self.principal(request)
        request_id = body.request_id.strip()
        if not TICKET_REQUEST_ID.fullmatch(request_id):
            raise HTTPException(status_code=422, detail="Ticket request id is invalid")
        title = " ".join(body.title.split())
        description = "\n".join(
            " ".join(line.split()) for line in body.description.splitlines()
        ).strip()
        context = self._ticket_context(body.context)
        Ticket = self.models.ExtensionSupportTicket
        now = datetime.utcnow()
        with Session(self.auth_manager.engine) as session:
            existing = session.scalar(select(Ticket).where(
                Ticket.owner_credential_id == principal.credential_id,
                Ticket.request_id == request_id,
            ))
            if existing is not None:
                replies = self._ticket_replies(session, [existing.id]).get(existing.id, [])
                return JSONResponse({
                    "created": False,
                    "ticket": self._ticket_payload(existing, replies),
                }, headers={"Cache-Control": "no-store"})
            active = session.scalar(select(func.count()).select_from(Ticket).where(
                Ticket.owner_credential_id == principal.credential_id,
                Ticket.status.in_(OPEN_TICKET_STATUSES),
            ))
            if int(active or 0) >= MAX_OPEN_TICKETS:
                raise HTTPException(status_code=409, detail="Installation open-ticket limit reached")
            alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
            ticket_id = ""
            for _ in range(20):
                candidate = "GBT-" + "".join(secrets.choice(alphabet) for _ in range(8))
                if session.get(Ticket, candidate) is None:
                    ticket_id = candidate
                    break
            if not ticket_id:
                raise HTTPException(status_code=503, detail="Could not allocate a ticket id")
            row = Ticket(
                id=ticket_id, owner_credential_id=principal.credential_id,
                request_id=request_id, kind=body.kind, title=title,
                description=description, context=context, status="open",
                created_at=now, updated_at=now,
            )
            session.add(row)
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                existing = session.scalar(select(Ticket).where(
                    Ticket.owner_credential_id == principal.credential_id,
                    Ticket.request_id == request_id,
                ))
                if existing is None:
                    raise HTTPException(status_code=409, detail="Ticket submission conflicted; retry")
                replies = self._ticket_replies(session, [existing.id]).get(existing.id, [])
                return JSONResponse({
                    "created": False,
                    "ticket": self._ticket_payload(existing, replies),
                }, headers={"Cache-Control": "no-store"})
            session.refresh(row)
            payload = self._ticket_payload(row, [])
        return JSONResponse(
            {"created": True, "ticket": payload}, status_code=201,
            headers={"Cache-Control": "no-store"},
        )

    # ----- shared objects -------------------------------------------------

    def _url(self, kind: str, object_id: str) -> str:
        return f"{self.public_origin}{CLIENT_ROOT}/{kind}/{object_id}"

    def _validate_settings(self, scopes: dict) -> dict:
        if (
            not isinstance(scopes, dict) or not scopes
            or set(scopes) - ALLOWED_SHARE_SCOPES
            or any(not isinstance(value, dict) for value in scopes.values())
        ):
            raise HTTPException(status_code=422, detail="Settings share contains an unsupported scope")
        if _json_size(scopes) > MAX_SHARE_BYTES:
            raise HTTPException(status_code=413, detail="Settings share exceeds the per-share limit")
        return scopes

    def _share_payload(self, row, *, include_scopes: bool, relationship: str, owner=""):
        payload = {
            "id": row.id, "name": row.name,
            "url": self._url("settings-shares", row.id),
            "scope_ids": sorted(row.scopes.keys()),
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "access_count": int(row.access_count or 0),
            "relationship": relationship,
            "owner_name": owner or "Unregistered installation",
        }
        if include_scopes:
            payload["scopes"] = row.scopes
        return payload

    def list_settings_shares(self, request: Request) -> JSONResponse:
        principal = self.principal(request)
        Share = self.models.ExtensionSettingsShare
        Import = self.models.ExtensionSettingsShareImport
        with Session(self.auth_manager.engine) as session:
            owned = session.scalars(select(Share).where(
                Share.owner_credential_id == principal.credential_id,
                Share.revoked_at.is_(None),
            ).order_by(Share.created_at.desc())).all()
            imported = session.scalars(select(Share).join(
                Import, Import.share_id == Share.id,
            ).where(
                Import.credential_id == principal.credential_id,
                Share.revoked_at.is_(None),
                Share.owner_credential_id != principal.credential_id,
            ).order_by(Import.imported_at.desc())).all()
            names = self._identity_names(
                session, [row.owner_credential_id for row in [*owned, *imported]]
            )
            rows = [self._share_payload(
                row, include_scopes=False, relationship="owned",
                owner=names.get(row.owner_credential_id, ""),
            ) for row in owned]
            rows += [self._share_payload(
                row, include_scopes=False, relationship="imported",
                owner=names.get(row.owner_credential_id, ""),
            ) for row in imported]
        return JSONResponse({"shares": rows}, headers={"Cache-Control": "no-store"})

    def create_settings_share(self, body: SettingsShareCreate, request: Request) -> JSONResponse:
        principal = self.principal(request)
        scopes = self._validate_settings(body.scopes)
        Share = self.models.ExtensionSettingsShare
        with Session(self.auth_manager.engine) as session:
            active = session.scalars(select(Share.scopes).where(
                Share.owner_credential_id == principal.credential_id,
                Share.revoked_at.is_(None),
            )).all()
            if len(active) >= MAX_ACTIVE_SHARES:
                raise HTTPException(status_code=409, detail="Installation share limit reached")
            if sum(_json_size(item) for item in active) + _json_size(scopes) > MAX_INSTALLATION_BYTES:
                raise HTTPException(status_code=413, detail="Installation share storage quota reached")
            row = Share(
                id=secrets.token_urlsafe(24),
                owner_credential_id=principal.credential_id,
                name=body.name.strip(), scopes=scopes,
                created_at=datetime.utcnow(), access_count=0,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            names = self._identity_names(session, [row.owner_credential_id])
            payload = self._share_payload(
                row, include_scopes=True, relationship="owned",
                owner=names.get(row.owner_credential_id, ""),
            )
        return JSONResponse(payload, status_code=201, headers={"Cache-Control": "no-store"})

    def get_settings_share(self, share_id: str, request: Request) -> JSONResponse:
        principal = self.principal(request)
        if not SHARE_ID.fullmatch(share_id):
            raise HTTPException(status_code=404, detail="Settings share not found")
        Share = self.models.ExtensionSettingsShare
        Import = self.models.ExtensionSettingsShareImport
        with Session(self.auth_manager.engine) as session:
            row = session.scalar(select(Share).where(
                Share.id == share_id, Share.revoked_at.is_(None),
            ))
            if row is None:
                raise HTTPException(status_code=404, detail="Settings share not found")
            row.access_count = int(row.access_count or 0) + 1
            row.last_accessed_at = datetime.utcnow()
            if row.owner_credential_id == principal.credential_id:
                relationship = "owned"
            elif session.get(Import, (row.id, principal.credential_id)) is not None:
                relationship = "imported"
            else:
                relationship = "shared"
            session.commit()
            names = self._identity_names(session, [row.owner_credential_id])
            payload = self._share_payload(
                row, include_scopes=True, relationship=relationship,
                owner=names.get(row.owner_credential_id, ""),
            )
        return JSONResponse(payload, headers={"Cache-Control": "no-store"})

    def retain_settings_import(
        self, share_id: str, body: SettingsShareImport, request: Request,
    ) -> JSONResponse:
        principal = self.principal(request)
        if not SHARE_ID.fullmatch(share_id):
            raise HTTPException(status_code=404, detail="Settings share not found")
        Share = self.models.ExtensionSettingsShare
        Import = self.models.ExtensionSettingsShareImport
        scope_ids = list(dict.fromkeys(body.scope_ids))
        with Session(self.auth_manager.engine) as session:
            row = session.scalar(select(Share).where(
                Share.id == share_id, Share.revoked_at.is_(None),
            ))
            if row is None:
                raise HTTPException(status_code=404, detail="Settings share not found")
            if set(scope_ids) - set(row.scopes):
                raise HTTPException(status_code=422, detail="Import contains an unavailable scope")
            relationship = "owned" if row.owner_credential_id == principal.credential_id else "imported"
            if relationship == "imported":
                retained = session.get(Import, (row.id, principal.credential_id))
                if retained is None:
                    session.add(Import(
                        share_id=row.id, credential_id=principal.credential_id,
                        scope_ids=scope_ids, imported_at=datetime.utcnow(),
                    ))
                else:
                    retained.scope_ids = scope_ids
                    retained.imported_at = datetime.utcnow()
                session.commit()
            names = self._identity_names(session, [row.owner_credential_id])
            payload = self._share_payload(
                row, include_scopes=True, relationship=relationship,
                owner=names.get(row.owner_credential_id, ""),
            )
        return JSONResponse(payload, headers={"Cache-Control": "no-store"})

    def revoke_settings_share(self, share_id: str, request: Request) -> JSONResponse:
        return self._revoke_owned(
            self.models.ExtensionSettingsShare, share_id, request,
            "Settings share not found",
        )

    def _validate_email(self, template: dict) -> dict:
        name = str(template.get("name") or "").strip() if isinstance(template, dict) else ""
        if not name or str(template.get("type") or "") not in {"order", "account", "case", "contact"}:
            raise HTTPException(status_code=422, detail="Email template is invalid")
        safe = {key: value for key, value in template.items() if key not in {"id", "folderId"}}
        if _json_size(safe) > MAX_SHARE_BYTES:
            raise HTTPException(status_code=413, detail="Email template exceeds the per-share limit")
        return safe

    def _email_payload(self, row, *, include_template=True, owner="") -> dict:
        payload = {
            "id": row.id, "name": row.name,
            "url": self._url("email-template-shares", row.id),
            "owner_name": owner or "Unregistered installation",
            "created_at": row.created_at.isoformat(),
            "expires_at": row.expires_at.isoformat(),
            "access_count": int(row.access_count or 0),
        }
        if include_template:
            payload.update({"template": row.template, "ttl_hours": EMAIL_SHARE_TTL_HOURS})
        return payload

    def create_email_share(self, body: EmailTemplateShareCreate, request: Request) -> JSONResponse:
        principal = self.principal(request)
        template = self._validate_email(body.template)
        Model = self.models.ExtensionEmailTemplateShare
        now = datetime.utcnow()
        with Session(self.auth_manager.engine) as session:
            active = session.scalars(select(Model.template).where(
                Model.owner_credential_id == principal.credential_id,
                Model.revoked_at.is_(None), Model.expires_at > now,
            )).all()
            if len(active) >= MAX_ACTIVE_EMAIL_SHARES:
                raise HTTPException(status_code=409, detail="Installation email-share limit reached")
            if sum(_json_size(item) for item in active) + _json_size(template) > MAX_INSTALLATION_BYTES:
                raise HTTPException(status_code=413, detail="Installation share storage quota reached")
            row = Model(
                id=secrets.token_urlsafe(24),
                owner_credential_id=principal.credential_id,
                name=template["name"], template=template, created_at=now,
                expires_at=now + timedelta(hours=EMAIL_SHARE_TTL_HOURS), access_count=0,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            names = self._identity_names(session, [row.owner_credential_id])
            payload = self._email_payload(row, owner=names.get(row.owner_credential_id, ""))
        return JSONResponse(payload, status_code=201, headers={"Cache-Control": "no-store"})

    def list_email_shares(self, request: Request) -> JSONResponse:
        principal = self.principal(request)
        Model = self.models.ExtensionEmailTemplateShare
        now = datetime.utcnow()
        with Session(self.auth_manager.engine) as session:
            rows = session.scalars(select(Model).where(
                Model.owner_credential_id == principal.credential_id,
                Model.revoked_at.is_(None), Model.expires_at > now,
            ).order_by(Model.created_at.desc())).all()
            names = self._identity_names(session, [row.owner_credential_id for row in rows])
            payload = [self._email_payload(
                row, include_template=False, owner=names.get(row.owner_credential_id, ""),
            ) for row in rows]
        return JSONResponse({"shares": payload}, headers={"Cache-Control": "no-store"})

    def get_email_share(self, share_id: str, request: Request) -> JSONResponse:
        self.principal(request)
        if not SHARE_ID.fullmatch(share_id):
            raise HTTPException(status_code=404, detail="Email template share not found")
        Model = self.models.ExtensionEmailTemplateShare
        now = datetime.utcnow()
        with Session(self.auth_manager.engine) as session:
            row = session.scalar(select(Model).where(
                Model.id == share_id, Model.revoked_at.is_(None), Model.expires_at > now,
            ))
            if row is None:
                raise HTTPException(status_code=404, detail="Email template share expired or unavailable")
            row.access_count = int(row.access_count or 0) + 1
            session.commit()
            names = self._identity_names(session, [row.owner_credential_id])
            payload = self._email_payload(row, owner=names.get(row.owner_credential_id, ""))
        return JSONResponse(payload, headers={"Cache-Control": "no-store"})

    def revoke_email_share(self, share_id: str, request: Request) -> JSONResponse:
        return self._revoke_owned(
            self.models.ExtensionEmailTemplateShare, share_id, request,
            "Email template share not found",
        )

    def _product_payload(self, row, *, include_items=True) -> dict:
        payload = {
            "id": row.id, "name": row.name,
            "url": self._url("product-stores", row.id),
            "item_count": int(row.item_count or 0),
            "created_at": row.created_at.isoformat(),
            "access_count": int(row.access_count or 0),
        }
        if include_items:
            payload["items"] = row.items
        return payload

    def create_product_store(self, body: ProductStoreCreate, request: Request) -> JSONResponse:
        principal = self.principal(request)
        name = body.name.strip()
        if (
            not name or len(body.items) > MAX_PRODUCT_STORE_ITEMS
            or any(not isinstance(item, dict) for item in body.items)
            or _json_size(body.items) > MAX_SHARE_BYTES
        ):
            raise HTTPException(status_code=422, detail="Product store is invalid")
        Model = self.models.ExtensionProductStore
        with Session(self.auth_manager.engine) as session:
            active = session.scalars(select(Model.items).where(
                Model.owner_credential_id == principal.credential_id,
                Model.revoked_at.is_(None),
            )).all()
            if len(active) >= MAX_ACTIVE_PRODUCT_STORES:
                raise HTTPException(status_code=409, detail="Installation store limit reached")
            if sum(_json_size(item) for item in active) + _json_size(body.items) > MAX_INSTALLATION_BYTES:
                raise HTTPException(status_code=413, detail="Installation store storage quota reached")
            row = Model(
                id=secrets.token_urlsafe(24),
                owner_credential_id=principal.credential_id,
                name=name, items=body.items, item_count=len(body.items),
                created_at=datetime.utcnow(), access_count=0,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            payload = self._product_payload(row)
        return JSONResponse(payload, status_code=201, headers={"Cache-Control": "no-store"})

    def list_product_stores(self, request: Request) -> JSONResponse:
        principal = self.principal(request)
        Model = self.models.ExtensionProductStore
        with Session(self.auth_manager.engine) as session:
            rows = session.scalars(select(Model).where(
                Model.owner_credential_id == principal.credential_id,
                Model.revoked_at.is_(None),
            ).order_by(Model.created_at.desc())).all()
            payload = [self._product_payload(row, include_items=False) for row in rows]
        return JSONResponse({"stores": payload}, headers={"Cache-Control": "no-store"})

    def get_product_store(self, store_id: str, request: Request) -> JSONResponse:
        self.principal(request)
        if not SHARE_ID.fullmatch(store_id):
            raise HTTPException(status_code=404, detail="Product store not found")
        Model = self.models.ExtensionProductStore
        with Session(self.auth_manager.engine) as session:
            row = session.scalar(select(Model).where(
                Model.id == store_id, Model.revoked_at.is_(None),
            ))
            if row is None:
                raise HTTPException(status_code=404, detail="Product store unavailable or revoked")
            row.access_count = int(row.access_count or 0) + 1
            session.commit()
            payload = self._product_payload(row)
        return JSONResponse(payload, headers={"Cache-Control": "no-store"})

    def revoke_product_store(self, store_id: str, request: Request) -> JSONResponse:
        return self._revoke_owned(
            self.models.ExtensionProductStore, store_id, request,
            "Product store not found",
        )

    def _revoke_owned(self, model, object_id: str, request: Request, detail: str):
        principal = self.principal(request)
        if not SHARE_ID.fullmatch(object_id):
            raise HTTPException(status_code=404, detail=detail)
        with Session(self.auth_manager.engine) as session:
            row = session.scalar(select(model).where(
                model.id == object_id,
                model.owner_credential_id == principal.credential_id,
                model.revoked_at.is_(None),
            ))
            if row is None:
                raise HTTPException(status_code=404, detail=detail)
            row.revoked_at = datetime.utcnow()
            session.commit()
        return JSONResponse({"revoked": True, "id": object_id}, headers={"Cache-Control": "no-store"})

    # ----- support downloads + relay -------------------------------------

    def email_exchange_flow(self, request: Request, local_part: str) -> Response:
        self.principal(request)
        part = str(local_part or "").strip()
        if not LOCAL_PART.fullmatch(part):
            raise HTTPException(status_code=400, detail="A valid email account host is required")
        template = self.project_dir / ".revstack" / "assets" / "email-exchange-consumer-flow.template.zip"
        if not template.is_file():
            raise HTTPException(status_code=503, detail="The flow template is unavailable")
        buffer = io.BytesIO()
        with zipfile.ZipFile(template, "r") as source, zipfile.ZipFile(
            buffer, "w", zipfile.ZIP_DEFLATED
        ) as output:
            for name in source.namelist():
                data = source.read(name)
                if name.endswith("definition.json"):
                    data = data.decode("utf-8").replace(
                        "__USER_EMAIL__", f"{part}@loyaltylogo.com"
                    ).encode("utf-8")
                output.writestr(name, data)
        return Response(
            content=buffer.getvalue(), media_type="application/zip",
            headers={
                "Content-Disposition": 'attachment; filename="EmailExchangeService.zip"',
                "Cache-Control": "no-store",
            },
        )

    async def relay_pending(
        self, request: Request, *, since: int = 0, limit: int = 50, wait: int = 0,
    ) -> JSONResponse:
        self.principal(request)
        since = max(0, int(since or 0))
        limit = max(1, min(int(limit or 50), 100))
        wait = max(0, min(int(wait or 0), 30))
        empty = {"messages": [], "count": 0, "cursor": since}
        try:
            service = (getattr(self.service_manager_factory(), "_services", {}) or {}).get(
                "email-relay-service"
            ) if self.service_manager_factory else None
            if service is None or not hasattr(service, "messages_pending"):
                result = empty
            elif wait and hasattr(service, "wait_for_pending"):
                result = await service.wait_for_pending(
                    since=since, limit=limit, timeout=wait
                )
            else:
                result = service.messages_pending(since=since, limit=limit)
        except Exception:
            result = empty
        projected = [{
            key: item.get(key) for key in (
                "message_id", "contact_email", "contact_name", "subject",
                "preview", "body", "order_ref", "received_at",
            )
        } for item in (result.get("messages") or [])]
        return JSONResponse({
            "messages": projected, "count": len(projected),
            "cursor": result.get("cursor", since),
        }, headers={"Cache-Control": "no-store"})
