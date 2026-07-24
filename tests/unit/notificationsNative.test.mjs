import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const actionSource = readFileSync(
  new URL('lib/notification-actions.js', root), 'utf8',
);
const nativeSource = readFileSync(
  new URL('lib/notifications-native.js', root), 'utf8',
);

const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness(notification) {
  const created = [];
  const opened = [];
  const receipts = [];
  const patched = [];
  const clicked = [];
  const buttonClicked = [];
  const chrome = {
    runtime: {
      getURL(path) { return `chrome-extension://fixture/${path}`; },
      lastError: null,
    },
    notifications: {
      create(id, options, callback) {
        created.push({ id, options });
        callback(id);
      },
      clear() {},
      onClicked: {
        addListener(listener) { clicked.push(listener); },
      },
      onButtonClicked: {
        addListener(listener) { buttonClicked.push(listener); },
      },
    },
    tabs: {
      create(options, callback) {
        opened.push(options);
        callback?.({ id: 8, ...options });
      },
      query(_query, callback) { callback([]); },
      update(_id, _options, callback) { callback?.({}); },
      sendMessage(_id, _payload, callback) { callback?.({ ok: true }); },
    },
    windows: { update(_id, _options, callback) { callback?.({}); } },
    storage: {
      local: {
        set(_value, callback) { callback?.(); },
        remove() {},
      },
    },
  };
  const context = vm.createContext({
    chrome,
    console,
    globalThis: null,
    Date,
    Math,
    JSON,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    Map,
    Set,
  });
  context.globalThis = context;
  context.GBNotifications = {
    async find(id) {
      return id === notification.remoteId ? notification : null;
    },
    async patch(ids, values) { patched.push({ ids, values }); },
  };
  context.GBNotificationPoll = {
    async resolveContact() { return notification.localActionUrl || ''; },
    async sendReceipt(ids, state) { receipts.push({ ids, state }); },
  };
  new vm.Script(
    actionSource, { filename: 'notification-actions.js' },
  ).runInContext(context);
  new vm.Script(
    nativeSource, { filename: 'notifications-native.js' },
  ).runInContext(context);
  return {
    native: context.GBNativeNotifications,
    created,
    opened,
    receipts,
    patched,
    clicked,
    buttonClicked,
  };
}

function contactNotification() {
  return {
    remoteId: 12,
    level: 'info',
    title: 'New reply from David',
    body: 'Re: embroidered towels',
    localActionUrl:
      'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=42',
    action: {
      type: 'open_contact',
      version: 1,
      label: 'Open contact',
      arguments: {
        contact_email: 'david@example.com',
        message_id: 'message-12',
      },
    },
    presentation: {
      delivery: 'native',
      requireInteraction: true,
    },
  };
}

describe('Chrome-native extension notifications', () => {
  it('creates an actionable native notification with the RevStack icon', async () => {
    const notification = contactNotification();
    const { native, created } = harness(notification);

    assert.equal(await native.show(notification), true);
    assert.equal(created.length, 1);
    assert.equal(created[0].id, 'gb-extension-notification:12');
    assert.equal(
      created[0].options.iconUrl,
      'chrome-extension://fixture/icons/icon128.png',
    );
    assert.equal(created[0].options.requireInteraction, true);
    assert.equal(created[0].options.buttons.length, 1);
    assert.equal(created[0].options.buttons[0].title, 'Open contact');
  });

  it('runs a registered contact action and records an acted receipt', async () => {
    const notification = contactNotification();
    const {
      native, opened, receipts, patched,
    } = harness(notification);

    assert.equal(
      await native.run('gb-extension-notification:12'),
      true,
    );
    await flush();
    assert.equal(opened[0].url, notification.localActionUrl);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].ids[0], 12);
    assert.equal(receipts[0].state, 'acted');
    assert.equal(patched[0].values.status, 'read');
  });

  it('rejects unregistered executable actions before Chrome displays them', async () => {
    const notification = {
      ...contactNotification(),
      action: {
        type: 'open_url',
        arguments: { url: 'https://evil.example' },
      },
    };
    const { native, created } = harness(notification);

    assert.equal(await native.show(notification), true);
    assert.equal(created[0].options.buttons, undefined);
  });

  it('rejects executable fields added to an otherwise registered action', async () => {
    const notification = {
      ...contactNotification(),
      action: {
        ...contactNotification().action,
        url: 'https://evil.example',
      },
    };
    const { native, created } = harness(notification);

    assert.equal(await native.show(notification), true);
    assert.equal(created[0].options.buttons, undefined);
  });
});
