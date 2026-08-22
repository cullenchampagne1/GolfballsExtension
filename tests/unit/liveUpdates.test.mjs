import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../../lib/live-updates.js', import.meta.url), 'utf8',
);
const SHARE_ID = 'T1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p-';

function harness(initial = {}, remoteShare = null, { managedError = null } = {}) {
  const stored = structuredClone(initial);
  let policySyncs = 0;
  let shareFetches = 0;
  let managedSyncs = 0;
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
  context.GBManagedEmailTemplates = {
    async sync(options) {
      assert.equal(options?.force, true);
      managedSyncs += 1;
      if (managedError) throw managedError;
    },
  };
  context.GBInstallationAuth = {
    CLIENT_BASE: '/projects/golfballs-extension/client',
    async apiJson() {
      shareFetches += 1;
      return structuredClone(remoteShare);
    },
  };
  new vm.Script(source, { filename: 'live-updates.js' }).runInContext(context);
  return {
    updates: context.GBLiveUpdates,
    stored,
    policySyncs: () => policySyncs,
    shareFetches: () => shareFetches,
    managedSyncs: () => managedSyncs,
  };
}

function notification(type, data, id = 41) {
  return { id, event: { version: 1, type, data } };
}

describe('typed extension live updates', () => {
  it('removes a revoked imported email snapshot and invalidates open share UIs', async () => {
    const { updates, stored } = harness({
      templates: [
        {
          id: 'local', name: 'Local template',
          shareSync: {
            kind: 'revstack-owned-email-template-shares',
            owned: [{ shareId: SHARE_ID }, { shareId: 'Z'.repeat(32) }],
          },
        },
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
    assert.deepEqual(stored.templates[0].shareSync.owned.map((row) => row.shareId), ['Z'.repeat(32)]);
  });

  it('refreshes an imported snapshot while preserving only recipient-owned overrides', async () => {
    const remoteShare = {
      id: SHARE_ID,
      owner_name: 'Template Owner',
      version: 2,
      updated_at: '2026-08-22T12:00:00',
      template: {
        name: 'Updated shared template', type: 'order',
        subject: 'Owner changed this', body: '<p>New source</p>',
        replyMode: 'standalone', presetTaskId: 'owner-task',
        senderAccount: 'golfballs', senderRandomize: false,
        vars: {
          greeting: { type: 'literal', value: 'Owner default' },
          first_name: { type: 'schema', path: 'contact.firstName' },
        },
      },
    };
    const { updates, stored, shareFetches } = harness({
      templates: [{
        id: 'imported', name: 'Old shared template', type: 'order',
        subject: 'Old', body: '<p>Old source</p>', replyMode: 'reply',
        presetTaskId: 'my-task', senderAccount: 'outlook',
        vars: { greeting: { type: 'literal', value: 'Howdy' } },
        shareImport: {
          kind: 'revstack-email-template-share', shareId: SHARE_ID, version: 1,
          overrideDefaults: { replyMode: 'standalone' },
          overrides: {
            replyMode: 'reply', presetTaskId: 'my-task', senderAccount: 'outlook',
            literalVariables: { greeting: 'Howdy', removed_literal: 'No longer valid' },
          },
        },
      }],
    }, remoteShare);

    const event = notification('email_templates.changed', {
      reason: 'updated', share_id: SHARE_ID, version: 2,
    }, 45);
    await updates.apply(event);
    const imported = stored.templates[0];
    assert.equal(imported.name, 'Updated shared template');
    assert.equal(imported.subject, 'Owner changed this');
    assert.equal(imported.replyMode, 'standalone', 'reply mode follows the owner');
    assert.equal(imported.presetTaskId, 'my-task');
    assert.equal(imported.senderAccount, 'outlook');
    assert.equal(imported.vars.greeting.value, 'Howdy');
    assert.equal(imported.shareImport.version, 2);
    assert.equal(imported.shareImport.overrides.replyMode, undefined);
    assert.deepEqual(imported.shareImport.overrides.literalVariables, { greeting: 'Howdy' });
    assert.equal(shareFetches(), 1);

    await updates.apply(notification('email_templates.changed', {
      reason: 'updated', share_id: SHARE_ID, version: 2,
    }, 46));
    assert.equal(shareFetches(), 1, 'visible and silent rows for one version refresh once');
  });

  it('invalidates ticket state and refreshes managed settings through one channel', async () => {
    const { updates, stored, policySyncs, managedSyncs } = harness();
    await updates.apply(notification(
      'tickets.changed',
      { ticket_id: 'GBT-ABCDEFGH', reason: 'reply', status: 'resolved' },
      42,
    ));
    await updates.apply(notification(
      'managed_email_templates.changed',
      { revision: 'a'.repeat(64), editor_name: 'Parent One' },
      44,
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
    assert.equal(managedSyncs(), 1);
  });

  it('propagates managed bucket refresh failures so delivery can retry', async () => {
    const { updates, stored } = harness({}, null, {
      managedError: new Error('managed bucket unavailable'),
    });

    await assert.rejects(
      updates.apply(notification(
        'managed_email_templates.changed',
        { revision: 'b'.repeat(64), editor_name: 'Parent Two' },
        47,
      )),
      /managed bucket unavailable/,
    );
    assert.equal(stored.gbLiveUpdate, undefined);
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
