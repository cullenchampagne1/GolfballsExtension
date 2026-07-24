import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const actionSource = readFileSync(
  new URL('lib/notification-actions.js', root), 'utf8',
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
    actionSource, { filename: 'notification-actions.js' },
  ).runInContext(context);
  new vm.Script(source, { filename: 'notifications-store.js' }).runInContext(context);
  return { store: context.GBNotifications, stored, badges };
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
      type: 'open_mockup_batch',
      batch_id: BATCH_ID,
      label: 'Open gallery',
    },
    ...overrides,
  };
}

describe('notification outbox cache', () => {
  it('normalizes a server row and keeps only a registered action shape', () => {
    const { store } = harness();
    const normalized = store.normalizeRemote(remote());

    assert.equal(normalized.remoteId, 12);
    assert.equal(normalized.status, 'unread');
    assert.equal(normalized.action.type, 'open_mockup_batch');
    assert.equal(normalized.action.version, 1);
    assert.equal(normalized.action.arguments.batch_id, BATCH_ID);
    assert.equal(normalized.action.label, 'Open gallery');
    assert.equal(normalized.presentation.delivery, 'native');

    const rejected = store.normalizeRemote(remote({
      id: 13,
      action: { type: 'open_url', url: 'https://evil.example' },
    }));
    assert.equal(rejected.action, null);
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
        type: 'open_contact',
        contact_email: 'person@example.com',
        message_id: 'message-12',
        label: 'Open contact',
      },
    })]);
    await store.setActionUrl(12, 'https://evil.example/contact/12');
    assert.equal(stored.gbNotifications[0].localActionUrl, '');

    const allowed = 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=42';
    await store.setActionUrl(12, allowed);
    assert.equal(stored.gbNotifications[0].localActionUrl, allowed);
  });

  it('keeps registered action arguments and client display location', () => {
    const { store } = harness();
    const normalized = store.normalizeRemote(remote({
      action: {
        type: 'open_contact',
        version: 1,
        label: 'Read reply',
        arguments: {
          contact_email: 'Person@Example.com',
          message_id: 'message-12',
        },
      },
      presentation: {
        delivery: 'both',
        require_interaction: true,
      },
    }));

    assert.equal(
      normalized.action.arguments.contact_email,
      'person@example.com',
    );
    assert.equal(normalized.action.arguments.message_id, 'message-12');
    assert.equal(normalized.presentation.delivery, 'both');
    assert.equal(normalized.presentation.requireInteraction, true);
  });
});
