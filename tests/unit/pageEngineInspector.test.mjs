import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

import {
  buildPageEngineDebugSnapshot,
  enumeratePageEngineDebugVariables,
  pageEngineDebugPreview,
} from '../../src/lib/page-engine/debug-snapshot.js';
import {
  DEV_SETTINGS,
  openPageEngineInspector,
} from '../../src/lib/devSettings.js';

const root = new URL('../../', import.meta.url);
const [backgroundSource, mainSource, entrySource, runnerSource, debugSource, inspectorSource, inspectorHtml, buildSource, packageStoreSource] = await Promise.all([
  readFile(new URL('background.js', root), 'utf8'),
  readFile(new URL('src/vanilla/main.js', root), 'utf8'),
  readFile(new URL('src/vanilla-build/page-engine.entry.js', root), 'utf8'),
  readFile(new URL('src/lib/page-engine/runner.js', root), 'utf8'),
  readFile(new URL('src/lib/page-engine/debug-snapshot.js', root), 'utf8'),
  readFile(new URL('src/page-engine-inspector/page-engine-inspector.jsx', root), 'utf8'),
  readFile(new URL('page-engine-inspector.html', root), 'utf8'),
  readFile(new URL('build.js', root), 'utf8'),
  readFile(new URL('scripts/package-store.mjs', root), 'utf8'),
]);

afterEach(() => {
  delete globalThis.chrome;
  delete globalThis.window;
});

function contactDocument() {
  return new JSDOM(`
    <!doctype html><html><head><title>Ada Lovelace</title></head><body>
      <span id="lblContactFirstName">Ada</span>
      <span id="lblContactLastName">Lovelace</span>
      <span id="lblContactEmail">ada@example.test</span>
      <input id="tbContactId" value="42">
      <input id="AccountID" value="900">
      <select id="TerritoryID"><option value="15" selected>P5 / BDR</option></select>
    </body></html>
  `, { url: 'https://api.golfballs.com/Golfballs/AdminNew/Default.aspx?Page=240&customerID=42' }).window.document;
}

describe('Page Engine live inspector snapshot', () => {
  it('extracts the canonical Contact context and refreshes changed live values', () => {
    const doc = contactDocument();
    const first = buildPageEngineDebugSnapshot(doc, { now: () => 100 });
    assert.equal(first.supported, true);
    assert.equal(first.inspectedAt, 100);
    assert.equal(first.page.schemaId, 'contact');
    assert.equal(first.ids.contact, '42');
    assert.equal(first.data.contact.firstName, 'Ada');
    assert.equal(first.variables.find((item) => item.path === 'contact.firstName')?.value, 'Ada');

    doc.querySelector('#lblContactFirstName').textContent = 'Grace';
    const refreshed = buildPageEngineDebugSnapshot(doc, { now: () => 200 });
    assert.equal(refreshed.data.contact.firstName, 'Grace');
    assert.equal(refreshed.variables.find((item) => item.path === 'contact.firstName')?.preview, 'Grace');
  });

  it('lists schema fields and every concrete array item path with its resolved value', () => {
    const schema = {
      fields: {
        orders: {
          type: 'array',
          label: 'Orders',
          itemFields: {
            number: { type: 'string', label: 'Order number' },
            total: { type: 'number', label: 'Order total' },
          },
        },
      },
    };
    const variables = enumeratePageEngineDebugVariables(schema, {
      orders: [{ number: '100', total: 400 }, { number: '101', total: 825 }],
    });
    assert.equal(variables.find((item) => item.path === 'orders[0].number')?.value, '100');
    assert.equal(variables.find((item) => item.path === 'orders[1].number')?.value, '101');
    assert.equal(variables.find((item) => item.path === 'orders[1].total')?.preview, '825');
    assert.equal(variables.find((item) => item.path === 'orders')?.preview, 'Array(2)');
  });

  it('formats scalar, empty, array, and object previews for a compact live table', () => {
    assert.equal(pageEngineDebugPreview('  hello   world  '), 'hello world');
    assert.equal(pageEngineDebugPreview(''), '(empty string)');
    assert.equal(pageEngineDebugPreview([1, 2, 3]), 'Array(3)');
    assert.equal(pageEngineDebugPreview({ a: 1, b: 2 }), 'Object(2)');
    assert.equal(pageEngineDebugPreview(false), 'false');
  });

  it('registers one non-persisted developer action that opens the inspector window', async () => {
    const messages = [];
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          callback({ ok: true, success: true });
        },
      },
    };
    const action = DEV_SETTINGS.find((row) => row.key === 'pageEngine.liveInspector');
    assert.equal(action?.type, 'action');
    assert.equal(action?.buttonLabel, 'Open inspector');
    assert.equal(action?.runner, openPageEngineInspector);
    assert.equal((await openPageEngineInspector()).ok, true);
    assert.deepEqual(messages, [{ action: 'openPageEngineInspector' }]);
  });

  it('wires the live content snapshot, active-tab listeners, popup surface, and store package', () => {
    assert.match(entrySource, /debugSnapshot: buildPageEngineDebugSnapshot/);
    assert.match(debugSource, /runEngine\(doc, \{ skipIndex: true \}\)/);
    assert.match(runnerSource, /if \(options\.skipIndex !== true\)/);
    assert.match(mainSource, /msg\.action === 'pageEngineDebugSnapshot'/);
    assert.match(mainSource, /engine\.debugSnapshot\(document\)/);
    assert.match(backgroundSource, /msg\.action === 'pageEngineDebugSnapshot'/);
    assert.match(backgroundSource, /msg\.action === 'openPageEngineInspector'/);
    assert.match(backgroundSource, /chrome\.runtime\.getURL\('page-engine-inspector\.html'\)/);
    assert.match(inspectorSource, /chrome\.tabs\.onActivated\.addListener/);
    assert.match(inspectorSource, /chrome\.tabs\.onUpdated\.addListener/);
    assert.match(inspectorSource, /chrome\.windows\.onFocusChanged\.addListener/);
    assert.match(inspectorSource, /setInterval\([\s\S]*REFRESH_INTERVAL_MS/);
    assert.match(inspectorSource, /inspectTab\(sourceTabRef\.current, \{ silent: true \}\)/);
    assert.match(inspectorSource, /sendBackgroundMessage\('pageEngineDebugSnapshot'/);
    assert.match(inspectorHtml, /react-dist\/page-engine-inspector\/page-engine-inspector\.js/);
    assert.match(buildSource, /src\/page-engine-inspector/);
    assert.match(packageStoreSource, /'page-engine-inspector\.html'/);
  });
});
