import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const blocksPath = resolve(root, '.revstack/blocks.py');
const routesPath = resolve(root, '.revstack/routes.py');
const clientApiPath = resolve(root, '.revstack/logic/client_api.py');
const localRuntimeAvailable = existsSync(blocksPath) && existsSync(routesPath) && existsSync(clientApiPath);
const blocks = localRuntimeAvailable ? readFileSync(blocksPath, 'utf8') : '';
const routes = localRuntimeAvailable ? readFileSync(routesPath, 'utf8') : '';
const clientApi = localRuntimeAvailable ? readFileSync(clientApiPath, 'utf8') : '';
const keyOverridesStart = routes.indexOf('@router.get("/keys/{key_id}/configuration-overrides")');
const keyOverridesEnd = routes.indexOf('@router.post("/keys/{key_id}/configuration-overrides")', keyOverridesStart);
const keyOverridesRoute = keyOverridesStart >= 0 && keyOverridesEnd > keyOverridesStart
  ? routes.slice(keyOverridesStart, keyOverridesEnd)
  : '';
const emailLinksStart = routes.indexOf('@router.get("/shares/email")');
const emailLinksEnd = routes.indexOf('@router.get("/shares/products")', emailLinksStart);
const emailLinksRoute = emailLinksStart >= 0 && emailLinksEnd > emailLinksStart
  ? routes.slice(emailLinksStart, emailLinksEnd)
  : '';
const sourceStart = routes.indexOf('@router.get("/managed-email-template-sources")');
const sourceEnd = routes.indexOf('@router.post("/managed-email-templates/clear")', sourceStart);
const sourceRoute = sourceStart >= 0 && sourceEnd > sourceStart
  ? routes.slice(sourceStart, sourceEnd)
  : '';
const overridesStart = routes.indexOf('@router.get("/configuration-overrides")');
const overridesEnd = routes.indexOf('# ---------------- AI help companion', overridesStart);
const overridesRoute = overridesStart >= 0 && overridesEnd > overridesStart
  ? routes.slice(overridesStart, overridesEnd)
  : '';
const editorSettings = localRuntimeAvailable
  ? readFileSync(resolve(root, 'src/content/editor-settings.jsx'), 'utf8') : '';
const editorBridge = localRuntimeAvailable
  ? readFileSync(resolve(root, 'src/content/editor-bridge.jsx'), 'utf8') : '';
const editorSidebar = localRuntimeAvailable
  ? readFileSync(resolve(root, 'src/content/editor-sidebar.jsx'), 'utf8') : '';
const helpCompanion = localRuntimeAvailable
  ? readFileSync(resolve(root, 'src/ui/components/HelpCompanion.jsx'), 'utf8') : '';
const project = localRuntimeAvailable
  ? JSON.parse(readFileSync(resolve(root, 'revstack.project.json'), 'utf8')) : {};

describe('Golfballs dashboard control surfaces', { skip: !localRuntimeAvailable }, () => {
  it('renders support tickets through the modal-capable ConsoleList contract', () => {
    const ticketBlock = blocks.match(/# --- support tickets[\s\S]*?\n\)\n\n# --- list surfaces/)?.[0] || '';
    assert.match(ticketBlock, /"endpoint": f"\{BASE\}\/tickets"/);
    assert.match(ticketBlock, /"component": "ConsoleList"/);
    assert.match(ticketBlock, /"id": "ticket-list"/);
    assert.doesNotMatch(ticketBlock, /TicketList|tickets\.cards|ticket-reply/);
  });

  it('uses the editable block-shell title as the only email-share heading', () => {
    const listHelper = blocks.match(/def _list_block[\s\S]*?# --- secondary surfaces/)?.[0] || '';
    const emailLinks = listHelper.match(/_list_block\("email-links"[\s\S]*?until revoked"\)/)?.[0] || '';

    assert.match(listHelper, /ConsoleList is never handed a `title`/);
    assert.match(listHelper, /hide_title=False/);
    assert.match(emailLinks, /"Shared email templates"/);
    assert.doesNotMatch(blocks, /Temp(?:orary)? email links/i);
  });

  it('balances bucket-source columns and collapses secondary fields at one-column width', () => {
    const emailColumns = emailLinksRoute.match(/columns = \[([\s\S]*?)\]\n    return/)?.[1] || '';
    const sourceColumns = sourceRoute.match(/"columns": \[([\s\S]*?)\],\n        "rows"/)?.[1] || '';
    const keys = (source) => [...source.matchAll(/"key": "([^"]+)"/g)].map((match) => match[1]);

    assert.deepEqual(keys(emailColumns), ['name', 'owner', 'type', 'updated', 'act']);
    assert.match(emailColumns, /"key": "act", "label": "Revoke"/);
    assert.match(emailColumns, /"key": "name", "label": "Name", "grow": True/);
    assert.doesNotMatch(emailColumns, /"key": "imports"|"key": "status"/);
    assert.deepEqual(keys(sourceColumns), ['source', 'templates', 'updated', 'act']);
    assert.match(sourceColumns, /"key": "act", "label": "Clear"/);
    assert.match(sourceColumns, /"key": "source", "label": "Source account", "width": "1fr"/);
    assert.doesNotMatch(sourceColumns, /"key": "source"[^\n]*"grow": True/);
    assert.match(sourceColumns, /"key": "templates", "label": "Count"[^\n]*"width": "44px"[^\n]*"min_w": 2/);
    assert.match(sourceColumns, /"key": "updated"[^\n]*"width": "0\.9fr"[^\n]*"min_w": 2/);
    assert.match(sourceColumns, /"key": "act"[^\n]*"width": "58px"/);
    assert.match(sourceRoute, /"sub": "Parent" if is_parent else "Former parent"/);
    assert.match(sourceRoute, /"sub": f"by \{_owner_detail\(editor\)\}"/);
  });

  it('keeps override status and named actions proportionate', () => {
    assert.match(overridesRoute, /"key": "managed", "label": "Managed", "width": "88px", "min_w": 2/);
    assert.match(overridesRoute, /"key": "settings", "label": "Edit"[^\n]*"width": "50px"/);
    assert.match(overridesRoute, /"key": "clear", "label": "Clear"[^\n]*"width": "50px"/);
    assert.doesNotMatch(overridesRoute, /"key": "(?:settings|clear)", "label": ""/);
  });

  it('long-polls the outbox so live updates stay below the installation quota', () => {
    const notificationRoute = routes.match(
      /@router\.get\("\/client\/notifications"\)[\s\S]*?@router\.post\("\/client\/notifications\/receipts"\)/,
    )?.[0] || '';

    assert.match(notificationRoute, /wait_seconds: int = 25/);
    assert.match(notificationRoute, /await asyncio\.to_thread/);
    assert.match(notificationRoute, /wait_for_poll/);
    assert.doesNotMatch(notificationRoute, /asyncio\.sleep\(0\.5\)/);
  });

  it('defers Settings traffic, avoids duplicate submission sync, and reuses runtime Help capability', () => {
    assert.match(editorSettings, /window\.addEventListener\('gb:open-editor-settings', mount\)/);
    assert.doesNotMatch(editorSettings, /DOMContentLoaded', mount/);
    assert.match(editorBridge, /dispatchEvent\(new CustomEvent\('gb:open-editor-settings'\)\)/);
    assert.equal(
      [...editorSidebar.matchAll(/sendBackgroundMessage\('gbSyncEmailTemplateSubmissions'\)/g)].length,
      1,
    );
    assert.match(helpCompanion, /RUNTIME_STATE_KEY = 'gbRuntimeState'/);
    assert.doesNotMatch(helpCompanion, /checkStatus\(\{ force: true \}\)/);
  });

  it('exposes managed-template inventory and former-parent cleanup blocks', () => {
    assert.match(
      blocks,
      /_list_block\("managed-email-templates", "Managed email templates"[\s\S]*?"managed-email-templates", 4, 4,[\s\S]*?universal bucket"\)/,
    );
    assert.match(
      blocks,
      /_list_block\("managed-email-template-sources", "Template bucket sources"[\s\S]*?"managed-email-template-sources", 4, 3,[\s\S]*?min_w=1\)/,
    );
    assert.match(routes, /@router\.get\("\/managed-email-templates"\)/);
    assert.match(routes, /"editor": _owner_cell\(editor\)/);
    assert.match(routes, /"updated": updated/);
    assert.match(routes, /"conflict": \{/);
    assert.match(routes, /@router\.get\("\/managed-email-template-sources"\)/);
    assert.match(routes, /"sub": "Parent" if is_parent else "Former parent"/);
  });

  it('soft-deletes managed rows and invalidates extension caches through the typed event', () => {
    const clearRoute = routes.match(
      /@router\.post\("\/managed-email-templates\/clear"\)[\s\S]*?return \{"cleared": True, \*\*result\}/,
    )?.[0] || '';
    const clientApi = readFileSync(resolve(root, '.revstack/logic/client_api.py'), 'utf8');
    const clearLogic = clientApi.match(
      /def clear_managed_email_templates\([\s\S]*?\n    def update_managed_email_bucket/,
    )?.[0] || '';

    assert.match(clearLogic, /row\.deleted_at = now/);
    assert.match(clearLogic, /Model\.created_by_credential_id == created_by_credential_id/);
    assert.match(clearRoute, /"reason": "dashboard_clear"/);
    assert.match(clearRoute, /event_type="managed_email_templates\.changed"/);
    assert.match(clearRoute, /"removed_count": result\["removed_count"\]/);
  });

  it('declares notification composers as action-modal inputs with validated fields', () => {
    assert.match(routes, /action-modal notification composer/);
    assert.match(routes, /"kind": "form", "icon": "send"/);
    assert.match(routes, /"submit_label": "Send notification"/);
    assert.match(routes, /"key": "message"[\s\S]*?"type": "textarea"[\s\S]*?"required": True/);
    assert.match(routes, /"key": "level"[\s\S]*?"type": "select"/);
  });

  it('closes per-user settings rows with a narrow, visible reset column', () => {
    assert.match(keyOverridesRoute, /"clear": _clear_override_action[\s\S]*?if override else "—"/);
    assert.match(keyOverridesRoute, /"key": "setting", "label": "Setting", "width": "1\.8fr"/);
    assert.match(keyOverridesRoute, /"key": "act", "label": "Edit"[\s\S]*?"width": "58px"/);
    assert.match(keyOverridesRoute, /"key": "clear", "label": "Reset"[\s\S]*?"width": "62px"/);
    assert.doesNotMatch(keyOverridesRoute, /"key": "clear", "label": ""/);
  });

  it('publishes one switchable multi-line utilization chart and its aggregate table', () => {
    assert.match(blocks, /"usage-utilization", "Tool utilization", "chart-line"/);
    assert.match(blocks, /"component": "LineChart"/);
    assert.match(blocks, /"switcherSetting": "statistic"/);
    assert.match(blocks, /"switcherStyle": "dropdown"/);
    assert.match(blocks, /"switcherPlacement": "top"/);
    assert.match(blocks, /"rangeSetting": "days"/);
    assert.match(blocks, /"rangeOptions": \[/);
    assert.match(blocks, /"usage-utilization-table", "Utilization details", "table"/);
    assert.match(routes, /def _console_usage_utilization\(days: int\)/);
    assert.doesNotMatch(routes, /_TEMPORARY_USAGE_PREVIEW|_temporary_usage_preview_rows|Sample data ·/);
    assert.match(clientApi, /USAGE_RETENTION_DAYS = 365/);
    assert.match(routes, /"email_sends"[\s\S]*"email_transport"[\s\S]*"email_words"/);
    assert.match(routes, /"email_attachments"[\s\S]*"email_inline"[\s\S]*"core_tools"[\s\S]*"catalog"/);
    assert.match(routes, /if endpoint == "usage\.utilization"/);
    assert.match(routes, /if endpoint == "usage\.utilization-table"/);
    const defaults = project.dashboard.default_layout.map((item) => item.block_id);
    assert.ok(defaults.includes('golfballs-extension.usage-utilization'));
    assert.ok(defaults.includes('golfballs-extension.usage-utilization-table'));
  });
});
