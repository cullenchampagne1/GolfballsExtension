import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const languageSource = readFileSync(
  new URL('lib/action-language.js', root), 'utf8',
);
const runtimeSource = readFileSync(
  new URL('lib/action-runtime.js', root), 'utf8',
);
const source = readFileSync(new URL('lib/notifications-store.js', root), 'utf8');
const BATCH_ID = `batch_${'a'.repeat(32)}`;

function harness(initial = {}) {
  const stored = structuredClone(initial);
  const badges = [];
  const chrome = {
    storage: {
      local: {
        get(_keys, callback) { callback(structuredClone(stored)); },
        set(values, callback) {
          Object.assign(stored, structuredClone(values));
          callback?.();
        },
      },
    },
    action: {
      setBadgeText(value) { badges.push(value.text); },
      setBadgeBackgroundColor() {},
      setBadgeTextColor() {},
    },
  };
  const context = vm.createContext({
    chrome, console, globalThis: null,
    Date, Math, JSON, Promise, Object, Array, String, Number, Boolean,
    RegExp, Error, TypeError, Map, Set,
  });
  context.globalThis = context;
  new vm.Script(
    languageSource, { filename: 'action-language.js' },
  ).runInContext(context);
  new vm.Script(
    runtimeSource, { filename: 'action-runtime.js' },
  ).runInContext(context);
  new vm.Script(source, { filename: 'notifications-store.js' }).runInContext(context);
  return {
    actions: context.GBActionRuntime,
    store: context.GBNotifications,
    stored,
    badges,
  };
}

function remote(overrides = {}) {
  return {
    id: 12,
    topic: 'mockup.batch.completed',
    kind: 'mockup',
    level: 'success',
    title: 'Your mockups are ready',
    body: 'Venture Towel finished with 4 of 4 images ready.',
    created_at: '2026-07-24T12:00:00Z',
    action: {
      label: 'Open gallery',
      payload: JSON.stringify({
        version: 1,
        command: 'open_mockup_batch',
        target: BATCH_ID,
        value: '',
        options: [],
      }),
    },
    presentation: { type: 'action' },
    ...overrides,
  };
}

describe('notification outbox cache', () => {
  it('normalizes a payload action and fixes its system location top-right', () => {
    const { store } = harness();
    const normalized = store.normalizeRemote(remote());

    assert.equal(normalized.remoteId, 12);
    assert.equal(normalized.status, 'unread');
    assert.deepEqual(Object.keys(normalized.action).sort(), ['label', 'payload']);
    assert.equal(
      JSON.parse(normalized.action.payload).command,
      'open_mockup_batch',
    );
    assert.equal(JSON.parse(normalized.action.payload).target, BATCH_ID);
    assert.equal(normalized.action.label, 'Open gallery');
    assert.equal(normalized.presentation.type, 'action');
    assert.equal(normalized.presentation.location, 'top-right');

    const rejected = store.normalizeRemote(remote({
      id: 13,
      action: {
        label: 'Open',
        payload: '{"command":"open_url","url":"https://evil.example"}',
      },
    }));
    assert.equal(rejected.action, null);
    assert.equal(rejected.presentation.type, 'tag');
  });

  it('deduplicates retries by remote id and paints only the unread count', async () => {
    const { store, stored, badges } = harness();
    const first = await store.mergeRemote([remote()]);
    const second = await store.mergeRemote([remote({
      body: 'Updated body from an idempotent server retry.',
    })]);

    assert.equal(first.length, 1);
    assert.equal(second.length, 0);
    assert.equal(stored.gbNotifications.length, 1);
    assert.equal(stored.gbNotifications[0].body, 'Updated body from an idempotent server retry.');
    assert.equal(store.unreadCount(stored.gbNotifications), 1);
    assert.equal(badges.at(-1), '1');
  });

  it('persists read and archive state while keeping the notification offline', async () => {
    const { store, stored, badges } = harness();
    await store.mergeRemote([remote()]);
    await store.patch([12], { status: 'read' });

    assert.equal(stored.gbNotifications[0].status, 'read');
    assert.ok(stored.gbNotifications[0].readAt > 0);
    assert.equal(badges.at(-1), '');

    await store.patch([12], { status: 'dismissed' });
    assert.equal(stored.gbNotifications.length, 1);
    assert.equal(stored.gbNotifications[0].status, 'dismissed');
    assert.ok(stored.gbNotifications[0].dismissedAt > 0);
  });

  it('accepts only locally resolved CRM URLs for contact actions', async () => {
    const { store, stored } = harness();
    await store.mergeRemote([remote({
      action: {
        label: 'Open contact',
        payload: JSON.stringify({
          version: 1,
          command: 'open_contact',
          target: 'person@example.com',
          value: 'message-12',
          options: [],
        }),
      },
    })]);
    await store.setActionUrl(12, 'https://evil.example/contact/12');
    assert.equal(stored.gbNotifications[0].localActionUrl, '');

    const allowed = 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=42';
    await store.setActionUrl(12, allowed);
    assert.equal(stored.gbNotifications[0].localActionUrl, allowed);
  });

  it('interprets a backend-opaque payload through extension handlers', () => {
    const { actions, store } = harness();
    const normalized = store.normalizeRemote(remote({
      action: {
        label: 'Read reply',
        payload: JSON.stringify({
          version: 1,
          command: 'open_contact',
          target: 'Person@Example.com',
          value: 'message-12',
          options: [],
        }),
      },
      presentation: { type: 'action' },
    }));

    const handled = [];
    actions.registerHandler('open_contact', 'content', (payload) => {
      handled.push(payload);
      return true;
    });
    assert.equal(actions.canExecute(normalized.action, 'content'), true);
    assert.equal(actions.execute(normalized.action, 'content'), true);
    assert.equal(
      handled[0].target,
      'Person@Example.com',
    );
    assert.equal(handled[0].value, 'message-12');
    assert.equal(normalized.presentation.type, 'action');
    assert.equal(normalized.presentation.location, 'top-right');
  });
});
