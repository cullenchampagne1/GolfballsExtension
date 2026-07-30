import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  inspectCurrentPageTerritory,
  formatPageEngineTerritoryNotice,
  DEV_SETTINGS,
} from '../../src/lib/devSettings.js';
import { territoryInfoFromResult } from '../../src/lib/page-engine/territory.js';

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

describe('Page Engine territory inspector', () => {
  it('keeps the Territory select value distinct from its display name', () => {
    assert.deepEqual(territoryInfoFromResult({
      schemaId: 'contact',
      data: {
        ids: { contact: '42', account: '900' },
        account: { territoryId: '15', territoryName: 'P5 / BDR (Cullen)' },
      },
    }), {
      schemaId: 'contact',
      recordId: '42',
      accountId: '900',
      territoryId: '15',
      territoryName: 'P5 / BDR (Cullen)',
    });
    assert.deepEqual(territoryInfoFromResult({
      schemaId: 'account',
      data: {
        ids: { account: '900' },
        account: { territoryId: '15', territoryName: 'P5 / BDR (Cullen)' },
      },
    }), {
      schemaId: 'account',
      recordId: '900',
      accountId: '900',
      territoryId: '15',
      territoryName: 'P5 / BDR (Cullen)',
    });
  });

  it('rejects non-Account/Contact schemas and treats Not Set as missing', () => {
    assert.equal(territoryInfoFromResult({
      schemaId: 'order',
      data: {
        ids: { order: '5001', customer: '42' },
        account: { territoryId: '15', territoryName: 'P5 / BDR (Cullen)' },
      },
    }), null);
    assert.deepEqual(territoryInfoFromResult({
      schemaId: 'account',
      data: {
        ids: { account: '900' },
        account: { territoryId: '0', territoryName: 'Not Set' },
      },
    }), {
      schemaId: 'account',
      recordId: '900',
      accountId: '900',
      territoryId: '',
      territoryName: '',
    });
  });

  it('formats id, name-only, and missing-territory notifications clearly', () => {
    assert.deepEqual(formatPageEngineTerritoryNotice({
      schemaId: 'contact',
      recordId: '42',
      territoryId: '15',
      territoryName: 'P5 / BDR (Cullen)',
    }), {
      tone: 'success',
      message: 'Engine territory: 15 · P5 / BDR (Cullen)',
    });
    assert.deepEqual(formatPageEngineTerritoryNotice({
      schemaId: 'account', recordId: '900', territoryName: 'P5 / BDR (Cullen)',
    }), {
      tone: 'success',
      message: 'Engine territory: P5 / BDR (Cullen)',
    });
    assert.equal(
      formatPageEngineTerritoryNotice({ schemaId: 'contact', recordId: '42' }).message,
      'No territory found on contact 42.',
    );
  });

  it('runs the worker territory action and shows its result through the Settings toast host', async () => {
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
            territoryId: '15',
            territoryName: 'P5 / BDR (Cullen)',
          });
        },
      },
    };
    globalThis.window = {
      __gbToast: {
        success(message, options) { toasts.push({ tone: 'success', message, options }); },
      },
    };

    const result = await inspectCurrentPageTerritory();
    assert.deepEqual(messages, [{ action: 'pageEngineInspectTerritory' }]);
    assert.equal(result.territoryId, '15');
    assert.deepEqual(toasts, [{
      tone: 'success',
      message: 'Engine territory: 15 · P5 / BDR (Cullen)',
      options: { duration: 8_000 },
    }]);
  });

  it('registers a non-persisted developer action and wires the live-page message path', () => {
    const action = DEV_SETTINGS.find((row) => row.key === 'pageEngine.inspectTerritory');
    assert.equal(action?.type, 'action');
    assert.equal(action?.buttonLabel, 'Extract territory');
    assert.equal(action?.runner, inspectCurrentPageTerritory);
    assert.match(mainSource, /msg\.action === 'pageEngineTerritoryInfo'/);
    assert.match(mainSource, /engine\.inspectTerritory\(document\)/);
    assert.match(popupSource, /sourceTabId: Number\.isInteger\(tab\?\.id\) \? tab\.id : null/);
  });
});
