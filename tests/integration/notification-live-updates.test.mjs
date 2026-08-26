import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../../lib/notifications-poll.js', import.meta.url), 'utf8',
);

function harness({ notificationsEnabled = true, applyError = null } = {}) {
  const stored = { featureFlags: { notificationsEnabled } };
  const applied = [];
  const merged = [];
  const receipts = [];
  const messages = [];
  const notificationUrls = [];
  const listeners = { installed: [], startup: [], alarm: [], storage: [] };
  const chrome = {
    runtime: {
      lastError: null,
      onInstalled: { addListener(fn) { listeners.installed.push(fn); } },
      onStartup: { addListener(fn) { listeners.startup.push(fn); } },
    },
    storage: {
      local: {
        get(_keys, callback) { callback(structuredClone(stored)); },
        set(values, callback) {
          Object.assign(stored, structuredClone(values));
          callback?.();
        },
      },
      onChanged: { addListener(fn) { listeners.storage.push(fn); } },
    },
    alarms: {
      get(_name, callback) { callback(null); },
      create() {}, clear() {},
      onAlarm: { addListener(fn) { listeners.alarm.push(fn); } },
    },
    tabs: {
      query(_query, callback) { callback([{ id: 7 }]); },
      sendMessage(_id, payload) { messages.push(payload); return Promise.resolve(); },
    },
  };
  const context = vm.createContext({
    chrome, console, globalThis: null,
    Date, Math, JSON, Promise, Object, Array, String, Number, Boolean,
    RegExp, Error, TypeError, Map, Set, URL, fetch,
    setTimeout, clearTimeout,
  });
  context.globalThis = context;
  context.GBLiveUpdates = {
    async applyAll(rows) {
      applied.push(...rows.map((row) => row.id));
      if (applyError) throw applyError;
    },
  };
  context.GBNotifications = {
    async mergeRemote(rows) {
      merged.push(...rows.map((row) => row.id));
      return rows.map((row) => ({ ...row, remoteId: row.id }));
    },
    async setActionUrl() {},
  };
  context.GBInstallationAuth = {
    async apiJson(url, options = {}) {
      if (url.endsWith('/receipts')) {
        receipts.push(JSON.parse(options.body));
        return { updated: true };
      }
      notificationUrls.push(url);
      return { notifications: [], cursor: 0 };
    },
  };
  new vm.Script(source, { filename: 'notifications-poll.js' }).runInContext(context);
  return {
    poll: context.GBNotificationPoll,
    stored, applied, merged, receipts, messages, notificationUrls,
  };
}

const silent = {
  id: 91, visible: false,
  event: { version: 1, type: 'settings.changed', data: { revision: 'f'.repeat(64) } },
};
const visible = {
  id: 92, visible: true, topic: 'email_templates.changed', kind: 'state_change',
  level: 'warning', title: 'Template Owner revoked “Follow-up”',
  body: 'The shared email template was removed from your imported templates.',
};

describe('notification cursor as live-update transport', () => {
  it('applies silent rows but caches and toasts only visible notifications', async () => {
    const h = harness();
    const result = await h.poll.processResult({
      notifications: [silent, visible], cursor: 92,
    });

    assert.equal(result, true);
    assert.deepEqual(h.applied, [91, 92]);
    assert.deepEqual(h.merged, [92]);
    assert.deepEqual(h.receipts[0], {
      notification_ids: [91, 92], state: 'delivered',
    });
    assert.equal(h.stored.gbNotificationCursor, 92);
    assert.equal(h.messages.length, 1);
    assert.equal(h.messages[0].action, 'GB_EXTENSION_NOTIFICATION');
    assert.equal(h.messages[0].notification.remoteId, 92);
  });

  it('continues applying events and advancing receipts when visible notifications are off', async () => {
    const h = harness({ notificationsEnabled: false });
    await h.poll.processResult({ notifications: [silent, visible], cursor: 92 });

    assert.deepEqual(h.applied, [91, 92]);
    assert.deepEqual(h.merged, []);
    assert.equal(h.messages.length, 0);
    assert.deepEqual(h.receipts[0].notification_ids, [91, 92]);
    assert.equal(h.stored.gbNotificationCursor, 92);
  });

  it('does not acknowledge or advance past an authoritative refresh failure', async () => {
    const h = harness({ applyError: new Error('managed bucket unavailable') });
    const result = await h.poll.processResult({ notifications: [silent], cursor: 91 });

    assert.equal(result, false);
    assert.deepEqual(h.applied, [91]);
    assert.deepEqual(h.merged, []);
    assert.deepEqual(h.receipts, []);
    assert.equal(h.stored.gbNotificationCursor, undefined);
  });

  it('holds one request open for immediate updates without exhausting the shared quota', async () => {
    const h = harness();
    assert.equal(await h.poll.poll(), true);

    assert.equal(h.notificationUrls.length, 1);
    const url = new URL(h.notificationUrls[0], 'https://api.example.test');
    assert.equal(url.searchParams.get('after'), '0');
    assert.equal(url.searchParams.get('limit'), '50');
    assert.equal(url.searchParams.get('wait_seconds'), '25');
  });

  it('coalesces a rapid archive run into one receipt request', async () => {
    const h = harness();
    const ids = Array.from({ length: 35 }, (_, index) => index + 1);

    const sent = await Promise.all(
      ids.map((id) => h.poll.sendReceipt([id], 'dismissed')),
    );

    assert.deepEqual(sent, Array(35).fill(true));
    assert.equal(h.receipts.length, 1);
    assert.deepEqual(h.receipts[0], {
      notification_ids: ids,
      state: 'dismissed',
    });
  });

  it('splits a full local cache into backend-sized receipt batches', async () => {
    const h = harness();
    const ids = Array.from({ length: 200 }, (_, index) => index + 1);

    assert.equal(await h.poll.sendReceipt(ids, 'dismissed'), true);
    assert.deepEqual(
      h.receipts.map((receipt) => receipt.notification_ids.length),
      [100, 100],
    );
    assert.deepEqual(h.receipts.map((receipt) => receipt.state), [
      'dismissed', 'dismissed',
    ]);
  });
});
