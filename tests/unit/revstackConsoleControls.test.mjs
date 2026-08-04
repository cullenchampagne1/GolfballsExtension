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

describe('Golfballs dashboard control surfaces', { skip: !localRuntimeAvailable }, () => {
  it('renders support tickets through the modal-capable ConsoleList contract', () => {
    const ticketBlock = blocks.match(/# --- support tickets[\s\S]*?\n\)\n\n# --- list surfaces/)?.[0] || '';
    assert.match(ticketBlock, /"endpoint": f"\{BASE\}\/tickets"/);
    assert.match(ticketBlock, /"component": "ConsoleList"/);
    assert.match(ticketBlock, /"id": "ticket-list"/);
    assert.doesNotMatch(ticketBlock, /TicketList|tickets\.cards|ticket-reply/);
  });

  it('declares notification composers as action-modal inputs with validated fields', () => {
    assert.match(routes, /action-modal notification composer/);
    assert.match(routes, /"kind": "form", "icon": "send"/);
    assert.match(routes, /"submit_label": "Send notification"/);
    assert.match(routes, /"key": "message"[\s\S]*?"type": "textarea"[\s\S]*?"required": True/);
    assert.match(routes, /"key": "level"[\s\S]*?"type": "select"/);
  });
});
