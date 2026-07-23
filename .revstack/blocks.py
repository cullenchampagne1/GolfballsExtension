"""Golfballs extension — dashboard blocks.

Registers the project's block descriptors via the injected `block_registry`.
Data comes from this project's own routes (.revstack/routes.py), mounted at
/projects/golfballs-extension.

- Read grids are v1 `table` blocks. Tables that manage state (keys, settings
  links, email links, product stores) carry a per-row Revoke **action column** and poll so they
  self-refresh after a revoke.
- The update channel is a native staged `action` block for production publish.
- The feature-policy table edits the database-owned global policy. A separate
  table lists explicit per-installation overrides; the legacy YAML is only a
  bootstrap seed for an empty database.
- An `overview` v2 block gives at-a-glance counts.

Key CREATION stays in the `api-key` terminal CLI — the Button/action primitives
discard the response body, so a new secret can't be revealed here.
"""

PID = "golfballs-extension"
BASE = f"/projects/{PID}"
OWNER = {"kind": "project", "id": PID}
SCOPES = [f"provider:{PID}", f"project:{PID}", "custom"]


def _bind(path, default=None):
    b = {"bind": path}
    if default is not None:
        b["default"] = default
    return b


def _table(suffix, title, icon, endpoint, hints, poll=None, row_details=False):
    data = {"endpoint": f"{BASE}/{endpoint}"}
    if poll:
        data["poll_seconds"] = poll
    descriptor = {
        "block_id": f"{PID}.{suffix}",
        "owner": OWNER, "type": "table", "title": title, "icon": icon,
        "data": data, "layout_hints": hints, "scopes": SCOPES,
    }
    if row_details:
        descriptor["interactions"] = {
            "row_click": {"kind": "modal", "source": "_detail"},
        }
    block_registry.register(descriptor)


def _stat(label, path, fmt="int"):
    """A compact stat tile for the overview grid."""
    return {"component": "Metric", "props": {
        "value": _bind(path, "—"), "label": label, "format": fmt,
        "compact": True, "align": "center"}}


# --- v2 overview: at-a-glance counts ----------------------------------------
block_registry.register({
    "block_id": f"{PID}.overview",
    "owner": OWNER, "title": "Overview", "icon": "layout", "scopes": SCOPES,
    # hide_title renders the block without its title row (keeps the card) — a
    # clean full-width analytics strip. Generic descriptor option (see BlockFrame).
    "hide_title": True,
    # The shell inset scales with the placed width (2/6/10/14px across w1-w4)
    # so a half-width strip does not spend scarce space on full-width gutters.
    "body_padding": "adaptive",
    "schema_version": 2,
    "placement": {"preferred": {"w": 4, "h": 1}, "constraints": {"minW": 2, "minH": 1}},
    "resources": {"primary": {"endpoint": f"{BASE}/overview", "refresh": {"poll_seconds": 30}}},
    "render": {"kind": "schema", "root": {
        "component": "Grid", "props": {
            "columns": 8, "gap": "sm", "align": "center",
            # Equal tracks make every statistic's CENTER independent of label/value
            # length. The shell owns adaptive outer padding; the grid fills the rest.
            "justify": "center", "contentJustify": "stretch",
            "columnSizing": "equal", "fill": True, "padding": "none",
        }, "children": [
            _stat("Published", "data.current_version", "text"),
            _stat("Releases", "data.release_count"),
            _stat("Last publish", "data.last_published", "text"),
            _stat("Active keys", "data.active_keys"),
            _stat("Total keys", "data.total_keys"),
            _stat("Settings links", "data.settings_links"),
            _stat("Email links", "data.email_links"),
            _stat("Share opens", "data.share_opens"),
        ],
    }},
})

# --- staged operator actions (publish / build / automated push) -------------
def _action(suffix, title, icon, endpoint, label, confirm, stages, eyebrow):
    block_registry.register({
        "block_id": f"{PID}.{suffix}",
        "owner": OWNER, "title": title, "icon": icon, "scopes": SCOPES,
        "type": "action",
        "data": {"endpoint": f"{BASE}/status", "poll_seconds": 30},
        "layout_hints": {"w": 2, "h": 2, "minW": 1, "minH": 1},
        "action": {
            "endpoint": f"{BASE}/{endpoint}", "method": "POST",
            "label": label, "confirm": confirm, "stages": stages, "eyebrow": eyebrow,
        },
    })


_action("channel", "Update channel", "upload-cloud", "publish", "Publish",
        "Build, sign, and publish a production release?",
        ["Build", "Package", "Sign", "Publish"], "Production channel")
_action("build", "Build", "hammer", "build", "Build",
        "Build the extension bundle?",
        ["Install", "Build", "Bundle"], "Project build")
_action("commit-push", "Automated push", "git-branch", "commit-push", "Automated push",
        "Commit and push ALL working-tree changes?",
        ["Stage", "Commit", "Push"], "Automated push")

# --- v1 tables ---------------------------------------------------------------
_table("releases", "Releases", "package", "release-list",
       {"w": 2, "h": 2, "minW": 2, "minH": 2})
_table("keys", "API keys", "key", "keys",
       {"w": 3, "h": 3, "minW": 2, "minH": 2}, poll=15)
_table("configuration", "Feature policy", "toggle-left", "configuration-values",
       {"w": 4, "h": 4, "minW": 2, "minH": 2}, poll=30)
_table("configuration-overrides", "User setting overrides", "users", "configuration-overrides",
       {"w": 4, "h": 3, "minW": 2, "minH": 2}, poll=20)
_table("settings-shares", "Shared settings", "sliders", "shares/settings",
       {"w": 3, "h": 2, "minW": 2, "minH": 2}, poll=20, row_details=True)
_table("email-links", "Temp email links", "mail", "shares/email",
       {"w": 3, "h": 2, "minW": 2, "minH": 2}, poll=20, row_details=True)
_table("product-stores", "Product stores", "shopping-bag", "shares/products",
       {"w": 3, "h": 2, "minW": 2, "minH": 2}, poll=20, row_details=True)
_table("tickets", "Support tickets", "message-square-warning", "tickets",
       {"w": 4, "h": 3, "minW": 2, "minH": 2}, poll=10, row_details=True)

# --- Help Companion operations ---------------------------------------------
block_registry.register({
    "block_id": f"{PID}.assistant-health",
    "owner": OWNER, "title": "Help Companion", "icon": "sparkles", "scopes": SCOPES,
    "schema_version": 2,
    "placement": {"preferred": {"w": 3, "h": 1}, "constraints": {"minW": 2, "minH": 1}},
    "resources": {"primary": {
        "endpoint": f"{BASE}/assistant/admin/status",
        "refresh": {"poll_seconds": 5},
    }},
    "render": {"kind": "schema", "root": {
        "component": "Grid", "props": {
            "columns": 6, "gap": "sm", "align": "center", "fill": True,
            "columnSizing": "equal", "padding": "none",
        }, "children": [
            _stat("Active", "data.usage.active_runs"),
            _stat("Completed", "data.usage.completed"),
            _stat("Failed", "data.usage.failed"),
            _stat("Knowledge", "data.knowledge.chunks"),
            _stat("Primary", "data.completion.primary", "text"),
            _stat("Last model", "data.completion.last_success.model", "text"),
        ],
    }},
})

_table("assistant-runs", "Help sessions", "message-circle", "assistant/admin/runs",
       {"w": 3, "h": 3, "minW": 2, "minH": 2}, poll=3, row_details=True)
