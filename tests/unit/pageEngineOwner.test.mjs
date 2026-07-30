import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  inspectCurrentPageOwner,
  formatPageEngineOwnerNotice,
  DEV_SETTINGS,
} from '../../src/lib/devSettings.js';
import { ownerInfoFromResult } from '../../src/lib/page-engine/owner.js';

const mainSource = await readFile(
  new URL('../../src/vanilla/main.js', import.meta.url),
  'utf8',
);
const popupSource = await readFile(
  new URL('../../src/popup/popup.jsx', import.meta.url),
  'utf8',
);

afterEach(() => {
  delete globalThis.chrome;
  delete globalThis.window;
});

describe('Page Engine owner inspector', () => {
  it('keeps numeric owner ids distinct from display names across page schemas', () => {
    assert.deepEqual(ownerInfoFromResult({
      schemaId: 'contact',
      data: {
        ids: { contact: '42', account: '900' },
        account: { salesRepId: '77', salesRep: 'Cullen Champagne' },
      },
    }), {
      schemaId: 'contact',
      recordId: '42',
      accountId: '900',
      ownerId: '77',
      ownerName: 'Cullen Champagne',
    });
    assert.deepEqual(ownerInfoFromResult({
      schemaId: 'order',
      data: {
        ids: { order: '5001', customer: '42' },
        order: { customerId: '42', salesRepId: '88', salesRep: 'Taylor Reed' },
      },
    }), {
      schemaId: 'order',
      recordId: '5001',
      accountId: '42',
      ownerId: '88',
      ownerName: 'Taylor Reed',
    });
  });

  it('formats numeric, name-only, and missing-owner notifications clearly', () => {
    assert.deepEqual(formatPageEngineOwnerNotice({
      schemaId: 'contact', recordId: '42', ownerId: '77', ownerName: 'Cullen Champagne',
    }), {
      tone: 'success',
      message: 'Engine owner ID: 77 · Cullen Champagne',
    });
    assert.deepEqual(formatPageEngineOwnerNotice({
      schemaId: 'account', recordId: '900', ownerName: 'Cullen Champagne',
    }), {
      tone: 'warning',
      message: 'No numeric owner ID on account 900 · Owner: Cullen Champagne',
    });
    assert.equal(
      formatPageEngineOwnerNotice({ schemaId: 'opportunity', recordId: '28042' }).message,
      'No owner ID found on opportunity 28042.',
    );
  });

  it('runs the worker inspection action and shows its result through the Settings toast host', async () => {
    const messages = [];
    const toasts = [];
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          callback({
            ok: true,
            schemaId: 'contact',
            recordId: '42',
            ownerId: '77',
            ownerName: 'Cullen Champagne',
          });
        },
      },
    };
    globalThis.window = {
      __gbToast: {
        success(message, options) { toasts.push({ tone: 'success', message, options }); },
      },
    };

    const result = await inspectCurrentPageOwner();
    assert.deepEqual(messages, [{ action: 'pageEngineInspectOwner' }]);
    assert.equal(result.ownerId, '77');
    assert.deepEqual(toasts, [{
      tone: 'success',
      message: 'Engine owner ID: 77 · Cullen Champagne',
      options: { duration: 8_000 },
    }]);
  });

  it('registers a non-persisted developer action and wires the live-page message path', () => {
    const action = DEV_SETTINGS.find((row) => row.key === 'pageEngine.inspectOwner');
    assert.equal(action?.type, 'action');
    assert.equal(action?.buttonLabel, 'Extract owner ID');
    assert.equal(action?.runner, inspectCurrentPageOwner);
    assert.match(mainSource, /msg\.action === 'pageEngineOwnerInfo'/);
    assert.match(mainSource, /engine\.inspectOwner\(document\)/);
    assert.match(popupSource, /sourceTabId: Number\.isInteger\(tab\?\.id\) \? tab\.id : null/);
  });
});
