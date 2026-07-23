"""Golfballs Toolkit knowledge descriptor for RevStack's generic assistant.

This helper is backend-owned project code.  It reads the generated guide,
inventory, and an allowlisted set of referenced source files; it does not run
extension code or inspect Chrome/customer state.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Iterable


_HELP_MARKER = "export const HELP_CONTENT = "
_SOURCE_VALUE_RE = re.compile(
    r"(?<![A-Za-z0-9_.-])([A-Za-z0-9_./-]+\.(?:js|jsx|mjs|html))(?![A-Za-z0-9_.-])"
)
_SECRET_RE = re.compile(
    r"(?i)(?:rsk[_-]|sk-|ghp_|xox[baprs]-)[_A-Za-z0-9-]{12,}"
    r"|-----BEGIN [A-Z ]*PRIVATE KEY-----(?:.|\n)*?-----END [A-Z ]*PRIVATE KEY-----"
)
_SECRET_ASSIGNMENT_RE = re.compile(
    r"(?im)(\b(?:api[_-]?key|access[_-]?token|password|secret|webhook)[A-Za-z0-9_-]*"
    r"\s*[:=]\s*)(['\"])([^'\"\n]{8,})(\2)"
)
_CODE_EXCLUDES = {
    ".git", "node_modules", "dist", "react-dist", "production",
    ".golfballs-extension-production", "coverage", "playwright-report", "releases",
}
_SOURCE_SUFFIXES = {".js", ".jsx", ".mjs", ".html", ".json", ".css", ".md", ".py"}
_SOURCE_ROOTS = {".revstack", "scripts", "src", "tests"}
_AGENT_CONFIG_ROOT = "golfballs-agent"
_AGENT_MANIFEST = f"{_AGENT_CONFIG_ROOT}/manifest.yaml"
_AGENT_MANIFEST_KEYS = {
    "version", "assistant_id", "system_prompt", "personality",
    "welcome_message", "knowledge", "memory", "effort", "timeouts",
}
_AGENT_DOC_RE = re.compile(
    r"^(?:[A-Za-z0-9][A-Za-z0-9._-]{0,127}/){0,5}"
    r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.md$"
)
_MEMORY_PROJECT_ALLOWLIST = {"golfballs-extension"}
_MEMORY_CATEGORY_ALLOWLIST = {"golfballs-crm", "golfballs-extension"}
_MEMORY_ENTITY_ALLOWLIST = {
    "Golfballs Toolkit", "golfballs-extension", "Golfballs CRM",
}
_DEFAULT_SOURCES = {
    "background.js",
    "help-assistant.js",
    "help-chat-state.js",
    "installation-auth.js",
    "src/ui/components/HelpCompanion.jsx",
    "manifest.json",
    "popup.js",
    "editor.js",
    "src/lib/flags.js",
    "src/lib/devSettings.js",
    "src/guide/lib/app.jsx",
    "src/guide/pages/reference-content.jsx",
}
_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,199}$")


class _LocalConfigReader:
    """Development/test fallback; live routes inject ConfigAccessManager."""

    def __init__(self, root: Path):
        self.root = Path(root).resolve()

    def read(self, file_name: str):
        path = (self.root / file_name).resolve()
        try:
            path.relative_to(self.root)
        except ValueError as exc:
            raise ValueError("managed agent path escaped its config root") from exc
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"managed agent file is unavailable: {file_name}")
        source = path.read_text(encoding="utf-8")
        if path.suffix.lower() in {".yaml", ".yml"}:
            import yaml
            parsed = yaml.safe_load(source)
        else:
            parsed = source
        return path, source, parsed


def _managed_doc_name(value: Any, *, label: str) -> str:
    name = str(value or "").strip().replace("\\", "/")
    if (
        not _AGENT_DOC_RE.fullmatch(name)
        or name.startswith("/")
        or any(part in {".", ".."} for part in name.split("/"))
    ):
        raise ValueError(f"{label} must name a Markdown file inside {_AGENT_CONFIG_ROOT}")
    return name


def _load_agent_config(project_dir: Path, config_reader: Any = None) -> tuple[dict, list[dict]]:
    reader = config_reader or _LocalConfigReader(
        project_dir.parent / "api-access-configs"
    )
    _, manifest_source, manifest = reader.read(_AGENT_MANIFEST)
    if not isinstance(manifest, dict):
        raise ValueError("Golfballs agent manifest must be a YAML mapping")
    unknown = set(manifest) - _AGENT_MANIFEST_KEYS
    if unknown:
        raise ValueError(f"Golfballs agent manifest contains unknown fields: {sorted(unknown)}")
    if manifest.get("version") != 1:
        raise ValueError("Golfballs agent manifest version must be 1")
    if manifest.get("assistant_id") != "golfballs-extension-help":
        raise ValueError("Golfballs agent manifest assistant_id is immutable")

    docs: list[dict] = []
    seen: set[str] = set()
    total_bytes = len(manifest_source.encode("utf-8"))

    def add_doc(relative: Any, *, kind: str, title: str, edition: str = "all") -> str:
        nonlocal total_bytes
        name = _managed_doc_name(relative, label=kind)
        if name in seen:
            raise ValueError(f"duplicate Golfballs agent document: {name}")
        seen.add(name)
        managed_name = f"{_AGENT_CONFIG_ROOT}/{name}"
        _, source, _ = reader.read(managed_name)
        size = len(source.encode("utf-8"))
        total_bytes += size
        if size > 64_000 or total_bytes > 256_000:
            raise ValueError("Golfballs agent managed knowledge exceeds its size limit")
        clean_source = _sanitize_source(source)
        docs.append({
            "path": managed_name,
            "text": clean_source,
            "kind": kind,
            "title": title,
            "edition": edition,
        })
        return clean_source

    system = add_doc(
        manifest.get("system_prompt"), kind="system",
        title="Golfballs Help Companion system prompt",
    )
    personality = add_doc(
        manifest.get("personality"), kind="personality",
        title="Help Companion personality",
    )
    knowledge = manifest.get("knowledge") or []
    if not isinstance(knowledge, list) or len(knowledge) > 16:
        raise ValueError("Golfballs agent knowledge must be a list of at most 16 files")
    for item in knowledge:
        if not isinstance(item, dict) or set(item) - {"path", "title", "kind", "edition"}:
            raise ValueError("Golfballs agent knowledge entry is invalid")
        edition = str(item.get("edition") or "all").lower()
        if edition not in {"all", "admin", "consumer"}:
            raise ValueError("Golfballs agent knowledge edition is invalid")
        kind = str(item.get("kind") or "knowledge").strip()
        if not _IDENTIFIER_RE.fullmatch(kind):
            raise ValueError("Golfballs agent knowledge kind is invalid")
        title = str(item.get("title") or "Managed knowledge").strip()[:160]
        add_doc(item.get("path"), kind=kind, title=title, edition=edition)

    memory = manifest.get("memory") or {}
    if not isinstance(memory, dict) or set(memory) - {
        "enabled", "project_ids", "categories", "entity_terms",
        "max_queries", "max_facts",
    }:
        raise ValueError("Golfballs agent memory policy is invalid")
    effort = manifest.get("effort") or {}
    if not isinstance(effort, dict) or set(effort) - {
        "default", "technical", "troubleshooting", "ticket",
    }:
        raise ValueError("Golfballs agent effort policy is invalid")
    allowed_effort = {"low", "medium", "high"}
    normalized_effort = {}
    for key, fallback in (
        ("default", "low"), ("technical", "medium"),
        ("troubleshooting", "high"), ("ticket", "high"),
    ):
        value = str(effort.get(key) or fallback).lower()
        if value not in allowed_effort:
            raise ValueError(f"Golfballs agent effort {key} is invalid")
        normalized_effort[key] = value

    timeouts = manifest.get("timeouts") or {}
    if not isinstance(timeouts, dict) or len(timeouts) > 8:
        raise ValueError("Golfballs agent timeout policy is invalid")
    timeout_key = re.compile(
        r"^(?:claude|codex)(?::[A-Za-z0-9][A-Za-z0-9._-]{0,119})?$"
    )
    normalized_timeouts = {}
    for key, raw_value in timeouts.items():
        key = str(key or "").strip()
        if not timeout_key.fullmatch(key) or isinstance(raw_value, bool):
            raise ValueError("Golfballs agent timeout policy contains an invalid entry")
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            raise ValueError(
                "Golfballs agent timeout policy contains a non-numeric value"
            ) from None
        if not 10 <= value <= 600:
            raise ValueError("Golfballs agent timeout must be between 10 and 600 seconds")
        normalized_timeouts[key] = value

    def ids(key: str, limit: int) -> list[str]:
        raw = memory.get(key) or []
        if not isinstance(raw, list) or len(raw) > limit:
            raise ValueError(f"Golfballs agent memory {key} is invalid")
        out = []
        for value in raw:
            text = str(value or "").strip()
            if not _IDENTIFIER_RE.fullmatch(text):
                raise ValueError(f"Golfballs agent memory {key} contains an invalid value")
            if text not in out:
                out.append(text)
        return out

    raw_entity_terms = memory.get("entity_terms") or []
    if not isinstance(raw_entity_terms, list):
        raise ValueError("Golfballs agent memory entity_terms is invalid")
    entity_terms = []
    for value in raw_entity_terms:
        text = " ".join(str(value or "").split())[:100]
        if len(text) < 3 or any(ord(char) < 32 for char in text):
            raise ValueError("Golfballs agent memory entity_terms contains an invalid value")
        if text in _MEMORY_ENTITY_ALLOWLIST and text not in entity_terms:
            entity_terms.append(text)
        if len(entity_terms) >= 16:
            break
    normalized_memory = {
        "enabled": memory.get("enabled") is True,
        "project_ids": [
            value for value in ids("project_ids", 16)
            if value in _MEMORY_PROJECT_ALLOWLIST
        ],
        "categories": [
            value for value in ids("categories", 16)
            if value in _MEMORY_CATEGORY_ALLOWLIST
        ],
        "entity_terms": entity_terms,
        "max_queries": max(0, min(int(memory.get("max_queries") or 0), 3)),
        "max_facts": max(0, min(int(memory.get("max_facts") or 0), 12)),
    }
    return {
        "system_prompt": f"{system.strip()}\n\n{personality.strip()}",
        "welcome_message": str(manifest.get("welcome_message") or "").strip()[:1_000],
        "memory_policy": normalized_memory,
        "effort_policy": normalized_effort,
        "completion_timeouts": normalized_timeouts,
    }, docs


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def _read_help(path: Path) -> dict:
    source = path.read_text(encoding="utf-8")
    start = source.find(_HELP_MARKER)
    if start < 0:
        raise ValueError("generated help content marker is missing")
    payload, _ = json.JSONDecoder().raw_decode(source[start + len(_HELP_MARKER):])
    if not isinstance(payload, dict):
        raise ValueError("generated help content is not an object")
    return payload


def _read_settings_registry(project_dir: Path) -> dict:
    """Read the generated JSON literal without executing extension code."""
    try:
        source = (project_dir / "settings-registry.js").read_text(encoding="utf-8")
        marker = "root.GB_SETTINGS_REGISTRY = Object.freeze("
        start = source.index(marker) + len(marker)
        payload, _ = json.JSONDecoder().raw_decode(source[start:])
        return payload if isinstance(payload, dict) else {}
    except (OSError, ValueError):
        return {}


def _preset_scope_ids(project_dir: Path) -> list[str]:
    """Discover share scopes from the live PRESET_SCOPES registry."""
    try:
        source = (project_dir / "src" / "lib" / "presetScopes.js").read_text(
            encoding="utf-8"
        )
    except OSError:
        return []
    start = source.find("export const PRESET_SCOPES = [")
    end = source.find("];", start)
    if start < 0 or end < 0:
        return []
    return list(dict.fromkeys(re.findall(
        r"\bid:\s*['\"]([A-Za-z0-9][A-Za-z0-9._:-]{0,99})['\"]",
        source[start:end],
    )))[:80]


def _theme_variant_values(project_dir: Path, inventory: dict) -> list[str]:
    """Expose stable ids plus their user-facing labels to the model."""
    variants = [
        str(value)
        for value in (
            ((inventory.get("settings") or {}).get("theme") or {}).get("variants") or ()
        )
        if value
    ]
    try:
        source = (project_dir / "src" / "lib" / "theme.js").read_text(encoding="utf-8")
    except OSError:
        return variants
    names = dict(re.findall(
        r"\{\s*id:\s*['\"]([^'\"]+)['\"]\s*,\s*name:\s*['\"]([^'\"]+)['\"]",
        source,
    ))
    values: list[str] = []
    for variant in variants:
        label = unicodedata.normalize("NFKD", names.get(variant, ""))
        label = "".join(char for char in label if not unicodedata.combining(char))
        for value in (variant, label.strip().lower()):
            if value and value not in values:
                values.append(value)
    return values[:80]


def _action_targets(project_dir: Path, inventory: dict) -> list[dict]:
    """Project-owned capabilities consumed by the backend's generic protocol."""
    registry = _read_settings_registry(project_dir)
    targets: list[dict] = []
    for key, rule in (registry.get("features") or {}).items():
        targets.append({
            "id": key, "action_type": "set_feature", "value_type": "bool",
        })
    for key, rule in (registry.get("developerSettings") or {}).items():
        target = {
            "id": key,
            "action_type": "set_setting",
            "value_type": str(rule.get("type") or "string"),
        }
        if rule.get("min") is not None:
            target["minimum"] = rule["min"]
        if rule.get("max") is not None:
            target["maximum"] = rule["max"]
        if rule.get("options"):
            target["allowed_values"] = [str(value) for value in rule["options"]]
        targets.append(target)
    variants = _theme_variant_values(project_dir, inventory)
    if variants:
        targets.append({
            "id": "theme", "action_type": "set_theme_preset",
            "value_type": "select", "allowed_values": variants,
        })
    targets.append({
        "id": "brand", "action_type": "set_theme_palette", "value_type": "palette",
    })
    scopes = _preset_scope_ids(project_dir)
    if scopes:
        targets.append({
            "id": "settings", "action_type": "share_settings", "value_type": "string",
            "option_values": scopes,
        })
    targets.append({
        "id": "email_template", "action_type": "share_email_template",
        "value_type": "none", "resource_kind": "email_template",
    })
    targets.append({
        "id": "email_templates", "action_type": "request_data_access",
        "value_type": "string",
        "description": (
            "User-saved email templates. Requires one-time approval; supports local "
            "name/subject/type filtering and optional body-text projection."
        ),
        "option_values": [
            "type:any", "type:order", "type:case", "type:account", "type:contact",
            "state:enabled", "state:any", "fields:metadata", "fields:content",
            "limit:5", "limit:10", "limit:20",
        ],
    })
    targets.append({
        "id": "note_templates", "action_type": "request_data_access",
        "value_type": "string",
        "description": (
            "User-saved quick notes, task templates, and call-log templates. Requires "
            "one-time approval; supports local name/subtype filtering and optional content."
        ),
        "option_values": [
            "subtype:any", "subtype:note", "subtype:task", "subtype:call_log",
            "state:enabled", "state:any", "fields:metadata", "fields:content",
            "limit:5", "limit:10", "limit:20",
        ],
    })
    targets.extend([
        {"id": "bug", "action_type": "submit_ticket", "value_type": "string"},
        {"id": "feature", "action_type": "submit_ticket", "value_type": "string"},
    ])
    return targets


def _values(node: Any) -> Iterable[str]:
    if isinstance(node, dict):
        for key, value in node.items():
            yield str(key)
            yield from _values(value)
    elif isinstance(node, list):
        for value in node:
            yield from _values(value)
    elif node is not None:
        yield str(node)


def _plain(node: Any) -> str:
    if isinstance(node, dict):
        return "; ".join(
            f"{key}: {_plain(value)}" for key, value in node.items()
            if value not in (None, "", [], {})
        )
    if isinstance(node, list):
        return "; ".join(_plain(value) for value in node if value not in (None, ""))
    if isinstance(node, bool):
        return "yes" if node else "no"
    return str(node or "")


def _block_text(block: Any) -> str:
    if not isinstance(block, dict):
        return _plain(block)
    kind = block.get("type")
    if kind in {"p", "heading"}:
        return str(block.get("text") or "")
    if kind == "callout":
        return " — ".join(
            value for value in (
                str(block.get("title") or ""), str(block.get("text") or "")
            ) if value
        )
    if kind == "list":
        return "\n".join(f"- {_plain(item)}" for item in block.get("items") or ())
    if kind == "table":
        rows = [block.get("headers") or ()] + list(block.get("rows") or ())
        return "\n".join(" | ".join(_plain(cell) for cell in row) for row in rows)
    return _plain(block)


def _metadata_keys(blocks: Iterable[dict], key: str) -> list[str]:
    values = []
    for block in blocks:
        meta = block.get("meta") if isinstance(block, dict) else None
        for value in (meta or {}).get(key) or ():
            text = str(value or "").strip()
            if text and text not in values:
                values.append(text)
    return values


def _identifiers(*values: Any) -> list[str]:
    out: list[str] = []
    for value in values:
        candidates = value if isinstance(value, list) else [value]
        for candidate in candidates:
            for part in re.split(r"\s*(?:/|\+)\s*", str(candidate or "")):
                part = part.strip()
                if _IDENTIFIER_RE.fullmatch(part) and "*" not in part and part not in out:
                    out.append(part)
    return out


def _shortcut_target(record: dict, index: int) -> str:
    setting_key = str(record.get("settingKey") or "").strip()
    if setting_key.startswith("keyboardShortcuts."):
        return setting_key.split(".", 1)[1]
    action = re.sub(r"[^a-z0-9]+", "-", str(record.get("action") or "").lower()).strip("-")
    return f"shortcut:{action or index}"


def _admin_knowledge(
    project_dir: Path, admin_only: dict
) -> tuple[set[str], set[str], set[str]]:
    slugs: set[str] = set()
    entities = {
        str(value) for key in ("configKeys", "adminModals", "leakTokens")
        for value in admin_only.get(key) or () if value
    }
    content_dir = project_dir / "docs" / "content"
    for file_name in admin_only.get("helpDocs") or ():
        data = _read_json(content_dir / str(file_name), {})
        for article in data.get("articles") or ():
            for value in (
                article.get("slug"), article.get("feature"), article.get("flag"),
                *(article.get("covers") or ()), *(article.get("coversFlags") or ()),
            ):
                if value:
                    entities.add(str(value))
            if article.get("slug"):
                slugs.add(str(article["slug"]))
    tutorials = {
        str(value) for value in admin_only.get("adminTutorials") or () if value
    }
    entities.update(slugs)
    entities.update(tutorials)
    return slugs, tutorials, entities


def _article_routes(help_content: dict) -> dict[str, str]:
    routes: dict[str, str] = {}
    for article in help_content.get("articles") or ():
        route = f"#manual/{article.get('slug')}"
        for value in (
            article.get("slug"), article.get("feature"), article.get("flag"),
            *(article.get("covers") or ()), *(article.get("coversFlags") or ()),
        ):
            if value:
                routes[str(value)] = route
    return routes


def _guide_chunks(
    help_content: dict,
    admin_slugs: set[str],
    admin_tutorials: set[str],
    admin_entities: set[str],
    admin_only: dict,
) -> list[dict]:
    chunks: list[dict] = []
    admin_keys = {str(value) for value in admin_only.get("configKeys") or ()}
    leak_tokens = tuple(str(value) for value in admin_only.get("leakTokens") or ())

    def is_admin(text: str, identifiers: Iterable[str] = ()) -> bool:
        return bool(
            admin_keys & set(identifiers)
            or any(token and token in text for token in leak_tokens)
            or any(entity and entity in text for entity in admin_entities)
        )

    for article in help_content.get("articles") or ():
        slug = str(article.get("slug") or "").strip()
        if not slug:
            continue
        feature_keys = [
            str(value) for value in (
                article.get("feature"), article.get("flag"),
                *(article.get("coversFlags") or ()),
            ) if value
        ]
        for tier, raw_blocks in (article.get("body") or {}).items():
            blocks = raw_blocks if isinstance(raw_blocks, list) else []
            text = "\n".join(filter(None, (
                f"Section: {article.get('sectionLabel', '')}",
                f"Summary: {article.get('summary', '')}",
                f"Keywords: {', '.join(str(v) for v in article.get('keywords') or ())}",
                *(_block_text(block) for block in blocks),
            )))
            setting_keys = _metadata_keys(blocks, "settingKeys")
            chunk_features = feature_keys + _metadata_keys(blocks, "flagKeys")
            chunks.append({
                "id": f"guide:article:{slug}:{tier}",
                "title": f"{article.get('title') or slug} — {str(tier).title()}",
                "text": text,
                "kind": "guide",
                "source": f"docs/content · {slug}",
                "edition": (
                    "admin" if slug in admin_slugs
                    or is_admin(text, (*setting_keys, *chunk_features)) else "all"
                ),
                "guide_route": f"#manual/{slug}",
                "setting_keys": setting_keys,
                "feature_keys": chunk_features,
            })
        for index, faq in enumerate(article.get("faq") or ()):
            faq_text = str(faq.get("a") or "")
            chunks.append({
                "id": f"guide:faq:{slug}:{index}",
                "title": str(faq.get("q") or f"{article.get('title')} FAQ"),
                "text": faq_text,
                "kind": "faq",
                "source": f"docs/content · {slug}",
                "edition": (
                    "admin" if slug in admin_slugs
                    or is_admin(faq_text, feature_keys) else "all"
                ),
                "guide_route": f"#manual/{slug}",
                "feature_keys": feature_keys,
            })

    for tutorial in help_content.get("tutorials") or ():
        tutorial_id = str(tutorial.get("id") or "").strip()
        if not tutorial_id:
            continue
        lines = [
            f"Tier: {tutorial.get('tier', '')}",
            f"Estimated time: {tutorial.get('estMinutes', '')} minutes",
            f"Prerequisites: {_plain(tutorial.get('prerequisites') or [])}",
        ]
        for index, step in enumerate(tutorial.get("steps") or (), 1):
            lines.append(f"Step {index}: {_plain(step)}")
        tutorial_text = "\n".join(lines)
        chunks.append({
            "id": f"guide:tutorial:{tutorial_id}",
            "title": str(tutorial.get("title") or tutorial_id),
            "text": tutorial_text,
            "kind": "tutorial",
            "source": "docs/content/tutorials.json",
            "edition": (
                "admin" if tutorial_id in admin_tutorials
                or is_admin(tutorial_text) else "all"
            ),
            "guide_route": f"#workflows/{tutorial_id}",
        })

    for record in help_content.get("searchIndex") or ():
        record_id = str(record.get("id") or "").strip()
        if not record_id:
            continue
        article = str(record.get("article") or "").strip()
        tutorial = str(record.get("tutorial") or "").strip()
        route = f"#manual/{article}" if article else (
            f"#workflows/{tutorial}" if tutorial else None
        )
        setting_keys = []
        feature_keys = []
        shortcut_keys = []
        if record_id.startswith("devSetting:"):
            setting_keys.append(record_id.split(":", 1)[1])
        if record.get("flag"):
            feature_keys.append(str(record["flag"]))
        if record_id.startswith("shortcut:"):
            shortcut_keys.append(record_id.split(":", 1)[1])
        record_text = _plain({
            "category": record.get("category"),
            "description": record.get("description"),
            "keywords": record.get("keywords"),
        })
        chunks.append({
            "id": f"registry:{record_id}",
            "title": str(record.get("title") or record_id),
            "text": record_text,
            "kind": "registry",
            "source": "generated help registry",
            "edition": (
                "admin" if article in admin_slugs or tutorial in admin_tutorials
                or is_admin(record_text, (*setting_keys, *feature_keys)) else "all"
            ),
            "guide_route": route,
            "setting_keys": setting_keys,
            "feature_keys": feature_keys,
            "shortcut_keys": shortcut_keys,
        })
    return chunks


def _inventory_chunks(
    inventory: dict,
    routes: dict[str, str],
    admin_only: dict,
    admin_entities: set[str],
) -> list[dict]:
    chunks: list[dict] = []
    admin_modals = {str(value) for value in admin_only.get("adminModals") or ()}
    admin_keys = {str(value) for value in admin_only.get("configKeys") or ()}
    leak_tokens = tuple(str(value) for value in admin_only.get("leakTokens") or ())
    for section, value in inventory.items():
        if section.startswith("$") or section == "generatedAt":
            continue
        records = value if isinstance(value, list) else [value]
        for index, record in enumerate(records):
            if not isinstance(record, dict):
                continue
            identity = next((
                str(record.get(key)) for key in
                ("id", "key", "name", "displayName", "component", "message")
                if record.get(key)
            ), str(index))
            safe_identity = re.sub(r"[^A-Za-z0-9_.-]+", "-", identity).strip("-") or str(index)
            title = next((
                str(record.get(key)) for key in
                ("displayName", "name", "label", "title", "component", "id", "key")
                if record.get(key)
            ), f"{section} {index + 1}")
            setting_keys = _identifiers(record.get("relatedSettings") or ())
            feature_keys = _identifiers(
                record.get("flag"), record.get("relatedFlag")
            )
            if section == "featureFlags" and record.get("key"):
                feature_keys.append(str(record["key"]))
            shortcut_keys = []
            if section == "keyboardShortcuts":
                setting_keys.extend(_identifiers(record.get("settingKey")))
                shortcut_keys.append(_shortcut_target(record, index))
            route = next((
                routes[str(candidate)] for candidate in (
                    record.get("id"), record.get("flag"), record.get("relatedFeature")
                ) if candidate and str(candidate) in routes
            ), None)
            record_text = _plain(record)
            admin_record = bool(
                (section == "modals" and identity in admin_modals)
                or admin_keys & set((*setting_keys, *feature_keys))
                or any(token and token in record_text for token in leak_tokens)
                or any(entity and entity in record_text for entity in admin_entities)
            )
            chunks.append({
                "id": f"inventory:{section}:{safe_identity[:100]}",
                "title": f"{title} ({section})",
                "text": record_text,
                "kind": "inventory",
                "source": f"docs/inventory.json · {section}",
                "edition": "admin" if admin_record else "all",
                "guide_route": route,
                "setting_keys": setting_keys,
                "feature_keys": feature_keys,
                "shortcut_keys": shortcut_keys,
            })
    return chunks


def _referenced_sources(inventory: dict) -> set[str]:
    sources = set(_DEFAULT_SOURCES)
    for value in _values(inventory):
        for match in _SOURCE_VALUE_RE.finditer(value):
            sources.add(match.group(1))
    return sources


def _project_sources(project_dir: Path, inventory: dict) -> set[str]:
    """Discover safe project source broadly without granting live file tools."""
    sources = _referenced_sources(inventory)
    for path in project_dir.iterdir():
        if path.is_file() and path.suffix.lower() in _SOURCE_SUFFIXES:
            sources.add(path.name)
    for root_name in sorted(_SOURCE_ROOTS):
        root = project_dir / root_name
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in _SOURCE_SUFFIXES:
                continue
            relative = path.relative_to(project_dir)
            if any(part in _CODE_EXCLUDES for part in relative.parts):
                continue
            sources.add(relative.as_posix())
    return sources


def _safe_source_path(project_dir: Path, relative: str) -> Path | None:
    raw = Path(relative)
    if raw.is_absolute() or any(part in _CODE_EXCLUDES for part in raw.parts):
        return None
    resolved = (project_dir / raw).resolve()
    try:
        resolved.relative_to(project_dir.resolve())
    except ValueError:
        return None
    if not resolved.is_file() or resolved.suffix.lower() not in _SOURCE_SUFFIXES:
        return None
    lowered = resolved.name.lower()
    if any(token in lowered for token in ("credential", ".env", "auth.json", "secret")):
        return None
    return resolved


def _sanitize_source(text: str) -> str:
    text = _SECRET_RE.sub("[redacted secret]", text)
    return _SECRET_ASSIGNMENT_RE.sub(r"\1\2[redacted secret]\4", text)


def _source_chunks(
    project_dir: Path,
    inventory: dict,
    admin_only: dict,
    admin_entities: set[str],
) -> list[dict]:
    chunks: list[dict] = []
    admin_files = {
        str(value) for value in (
            *(admin_only.get("entries") or ()),
            *(admin_only.get("rootFiles") or ()),
        )
    }
    admin_modal_ids = {str(value) for value in admin_only.get("adminModals") or ()}
    admin_files.update(
        str(modal.get("file")) for modal in inventory.get("modals") or ()
        if str(modal.get("id") or "") in admin_modal_ids and modal.get("file")
    )
    leak_tokens = tuple(str(value) for value in admin_only.get("leakTokens") or ())
    for relative in sorted(_project_sources(project_dir, inventory))[:750]:
        path = _safe_source_path(project_dir, relative)
        if path is None:
            continue
        try:
            if path.stat().st_size > 600_000:
                continue
            source = _sanitize_source(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError):
            continue
        lines = source.splitlines()
        for start in range(0, len(lines), 68):
            end = min(len(lines), start + 80)
            text = "\n".join(lines[start:end]).strip()
            if not text:
                continue
            edition = "all"
            if (
                relative in admin_files
                or relative == "admin-only.json"
                or relative.startswith(".revstack/")
                or any(token and token in text for token in leak_tokens)
                or any(entity and entity in text for entity in admin_entities)
            ):
                edition = "admin"
            chunks.append({
                "id": f"code:{relative}:{start + 1}",
                "title": f"{relative} lines {start + 1}-{end}",
                "text": text,
                "kind": "source",
                "source": relative,
                "edition": edition,
                "line_start": start + 1,
                "line_end": end,
            })
            if len(chunks) >= 3_000:
                return chunks
    return chunks


def _assistant_document_chunks(documents: Iterable[dict]) -> list[dict]:
    chunks: list[dict] = []
    for document in documents:
        kind = str(document["kind"])
        relative = str(document["path"])
        lines = str(document["text"]).splitlines()
        for start in range(0, len(lines), 70):
            end = min(len(lines), start + 80)
            text = "\n".join(lines[start:end]).strip()
            if not text:
                continue
            chunks.append({
                "id": f"assistant:{kind}:{start + 1}",
                "title": str(document["title"]),
                "text": text,
                "kind": kind,
                "source": relative,
                "edition": str(document.get("edition") or "all"),
            })
    return chunks


def build_descriptor(project_dir: Path, config_reader: Any = None) -> dict:
    project_dir = Path(project_dir).resolve()
    agent_config, agent_documents = _load_agent_config(project_dir, config_reader)
    help_content = _read_help(project_dir / "src" / "lib" / "helpContent.js")
    inventory = _read_json(project_dir / "docs" / "inventory.json", {})
    admin_only = _read_json(project_dir / "admin-only.json", {})
    package = _read_json(project_dir / "package.json", {})
    admin_slugs, admin_tutorials, admin_entities = _admin_knowledge(
        project_dir, admin_only
    )
    routes = _article_routes(help_content)
    system_prompt = agent_config["system_prompt"]
    welcome_message = agent_config["welcome_message"]
    chunks = [
        *_guide_chunks(
            help_content, admin_slugs, admin_tutorials, admin_entities, admin_only
        ),
        *_inventory_chunks(inventory, routes, admin_only, admin_entities),
        *_assistant_document_chunks(agent_documents),
        *_source_chunks(project_dir, inventory, admin_only, admin_entities),
    ]
    action_targets = _action_targets(project_dir, inventory)
    revision_material = json.dumps(
        {
            "system_prompt": system_prompt,
            "welcome_message": welcome_message,
            "memory_policy": agent_config["memory_policy"],
            "effort_policy": agent_config["effort_policy"],
            "completion_timeouts": agent_config["completion_timeouts"],
            "action_targets": action_targets,
            "chunks": [
                {
                    "id": item["id"], "edition": item.get("edition"),
                    "source": item.get("source"),
                    "line_start": item.get("line_start"),
                    "line_end": item.get("line_end"), "text": item["text"],
                }
                for item in chunks
            ],
        },
        ensure_ascii=False, separators=(",", ":"), sort_keys=True,
    )
    revision = hashlib.sha256(revision_material.encode("utf-8")).hexdigest()
    shortcut_targets = [
        _shortcut_target(record, index)
        for index, record in enumerate(inventory.get("keyboardShortcuts") or ())
    ]
    return {
        "id": "golfballs-extension-help",
        "title": "Golfballs Toolkit",
        "version": str(package.get("version") or help_content.get("version") or "unknown"),
        "revision": revision,
        "system_prompt": system_prompt,
        "welcome_message": welcome_message,
        # This is the legacy/default ceiling. Managed provider/model-specific
        # budgets below let a fast primary fail over sooner than a deeper fallback.
        "completion_timeout_seconds": 75,
        "completion_timeouts": agent_config["completion_timeouts"],
        "chunks": chunks,
        "guide_routes": sorted({
            item["guide_route"] for item in chunks if item.get("guide_route")
        }),
        "shortcut_targets": shortcut_targets,
        "action_targets": action_targets,
        "memory_policy": agent_config["memory_policy"],
        "effort_policy": agent_config["effort_policy"],
        "high_risk_terms": [
            "charge", "refund", "send", "email", "campaign", "delete", "revoke",
            "import", "share", "publish", "place order", "submit proof", "bulk",
        ],
    }
