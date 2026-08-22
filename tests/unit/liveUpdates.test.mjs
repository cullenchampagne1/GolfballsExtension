import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../../lib/live-updates.js', import.meta.url), 'utf8',
);
const SHARE_ID = 'T1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p-';

function harness(initial = {}) {
  const stored = structuredClone(initial);
  let policySyncs = 0;
  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(_keys, callback) { callback(structuredClone(stored)); },
        set(values, callback) {
          Object.assign(stored, structuredClone(values));
          callback?.();
        },
      },
    },
  };
  const context = vm.createContext({
    chrome, console, globalThis: null,
    Date, JSON, Promise, Object, Array, String, Number, Boolean,
    RegExp, Error, TypeError, TextEncoder,
  });
  context.globalThis = context;
  context.GBRemoteSettingsPolicy = {
    async sync() { policySyncs += 1; },
  };
  new vm.Script(source, { filename: 'live-updates.js' }).runInContext(context);
  return {
    updates: context.GBLiveUpdates,
    stored,
    policySyncs: () => policySyncs,
  };
}

function notification(type, data, id = 41) {
  return { id, event: { version: 1, type, data } };
}

describe('typed extension live updates', () => {
  it('removes a revoked imported email snapshot and invalidates open share UIs', async () => {
    const { updates, stored } = harness({
      templates: [
        { id: 'local', name: 'Local template' },
        {
          id: 'imported', name: 'Shared template',
          shareImport: {
            kind: 'revstack-email-template-share', shareId: SHARE_ID,
          },
        },
      ],
    });
    const applied = await updates.apply(notification(
      'email_templates.changed',
      { reason: 'revoked', share_id: SHARE_ID, name: 'Shared template' },
    ));

    assert.equal(applied.type, 'email_templates.changed');
    assert.equal(stored.gbLiveUpdate.notificationId, 41);
    assert.equal(stored.gbEmailShareRevision.data.share_id, SHARE_ID);
    assert.deepEqual(stored.templates.map((item) => item.id), ['local']);
  });

  it('invalidates ticket state and refreshes managed settings through one channel', async () => {
    const { updates, stored, policySyncs } = harness();
    await updates.apply(notification(
      'tickets.changed',
      { ticket_id: 'GBT-ABCDEFGH', reason: 'reply', status: 'resolved' },
      42,
    ));
    await updates.apply(notification(
      'settings.changed',
      { revision: 'f'.repeat(64), path: ['features', 'crmSearchEnabled'] },
      43,
    ));

    assert.equal(stored.gbSupportTicketRevision.notificationId, 42);
    assert.equal(stored.gbSettingsPolicyRevision.notificationId, 43);
    assert.equal(stored.gbLiveUpdate.type, 'settings.changed');
    assert.equal(policySyncs(), 1);
  });

  it('keeps future valid events generic and rejects malformed envelopes', async () => {
    const { updates, stored } = harness();
    const future = await updates.apply(notification(
      'catalog.changed', { catalog_id: 'summer' }, 44,
    ));
    assert.equal(future.type, 'catalog.changed');
    assert.equal(stored.gbLiveUpdate.data.catalog_id, 'summer');

    const before = structuredClone(stored.gbLiveUpdate);
    assert.equal(await updates.apply({
      id: 45, event: { version: 2, type: 'catalog.changed', data: {} },
    }), null);
    assert.deepEqual(stored.gbLiveUpdate, before);
  });
});
