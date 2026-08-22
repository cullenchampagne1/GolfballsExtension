import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const blocksPath = resolve(root, '.revstack/blocks.py');
const routesPath = resolve(root, '.revstack/routes.py');
const localRuntimeAvailable = existsSync(blocksPath) && existsSync(routesPath);
const blocks = localRuntimeAvailable ? readFileSync(blocksPath, 'utf8') : '';
const routes = localRuntimeAvailable ? readFileSync(routesPath, 'utf8') : '';
const keyOverridesStart = routes.indexOf('@router.get("/keys/{key_id}/configuration-overrides")');
const keyOverridesEnd = routes.indexOf('@router.post("/keys/{key_id}/configuration-overrides")', keyOverridesStart);
const keyOverridesRoute = keyOverridesStart >= 0 && keyOverridesEnd > keyOverridesStart
  ? routes.slice(keyOverridesStart, keyOverridesEnd)
  : '';

describe('Golfballs dashboard control surfaces', { skip: !localRuntimeAvailable }, () => {
  it('renders support tickets through the modal-capable ConsoleList contract', () => {
    const ticketBlock = blocks.match(/# --- support tickets[\s\S]*?\n\)\n\n# --- list surfaces/)?.[0] || '';
    assert.match(ticketBlock, /"endpoint": f"\{BASE\}\/tickets"/);
    assert.match(ticketBlock, /"component": "ConsoleList"/);
    assert.match(ticketBlock, /"id": "ticket-list"/);
    assert.doesNotMatch(ticketBlock, /TicketList|tickets\.cards|ticket-reply/);
  });

  it('uses the editable block-shell title as the only email-share heading', () => {
    const listHelper = blocks.match(/def _v2_list[\s\S]*?# --- secondary surfaces/)?.[0] || '';
    const emailLinks = listHelper.match(/_v2_list\("email-links"[\s\S]*?shell_title=True\)/)?.[0] || '';

    assert.match(listHelper, /if not shell_title:[\s\S]*props\["title"\] = title/);
    assert.match(listHelper, /hide_title=not shell_title/);
    assert.match(emailLinks, /"Shared email templates"/);
    assert.match(emailLinks, /shell_title=True/);
    assert.doesNotMatch(blocks, /Temp(?:orary)? email links/i);
  });

  it('exposes managed-template inventory and former-parent cleanup blocks', () => {
    assert.match(
      blocks,
      /_v2_list\("managed-email-templates", "Managed email templates"[\s\S]*?"managed-email-templates", 4, 4,[\s\S]*?shell_title=True\)/,
    );
    assert.match(
      blocks,
      /_v2_list\("managed-email-template-sources", "Template bucket sources"[\s\S]*?"managed-email-template-sources", 4, 3,[\s\S]*?shell_title=True\)/,
    );
    assert.match(routes, /@router\.get\("\/managed-email-templates"\)/);
    assert.match(routes, /"editor": _owner_cell\(editor\)/);
    assert.match(routes, /"updated": updated/);
    assert.match(routes, /"conflict": \{/);
    assert.match(routes, /@router\.get\("\/managed-email-template-sources"\)/);
    assert.match(routes, /"text": "Parent" if is_parent else "Former parent"/);
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
});
