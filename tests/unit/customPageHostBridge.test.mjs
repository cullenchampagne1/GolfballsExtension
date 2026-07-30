import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const BRIDGE_EVENT = '__gbCustomPageExpandHostTables';
const BRIDGE_FILE = 'src/vanilla/custom-page-host-bridge.js';

describe('custom pages · host DataTables bridge', () => {
  it('runs in the main page world before the isolated custom-page engine', async () => {
    const manifest = JSON.parse(await readFile(new URL('../../manifest.json', import.meta.url), 'utf8'));
    const group = manifest.content_scripts.find((entry) => entry.js?.includes(BRIDGE_FILE));

    assert.ok(group, 'manifest must register the host DataTables bridge');
    assert.equal(group.world, 'MAIN');
    assert.equal(group.run_at, 'document_start');
    assert.deepEqual(group.matches, [
      'https://www.golfballs.com/*',
      'https://api.golfballs.com/*',
    ]);
  });

  it('materializes every modern host DataTable, including duplicate task ids', async () => {
    const dom = new JSDOM(`<!doctype html><html><body>
      <table id="TableTasks"></table>
      <table id="TableTasks"></table>
      <table id="TableOpportunities"></table>
    </body></html>`);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;

    await import('../../src/vanilla/custom-page-host-bridge.js?modern');

    const calls = [];
    const elements = [...dom.window.document.querySelectorAll('table')];
    const tables = new Map(elements.map((element, index) => [element, { length: index === 2 ? 25 : 10 }]));
    const jquery = (element) => ({
      DataTable() {
        const state = tables.get(element);
        const page = () => {};
        page.len = (value) => {
          if (value === undefined) return state.length;
          state.length = value;
          return { draw: (reset) => calls.push({ element, reset }) };
        };
        return { page };
      },
    });
    jquery.fn = {
      dataTable: {
        isDataTable: (element) => tables.has(element),
      },
    };
    dom.window.jQuery = jquery;

    dom.window.document.dispatchEvent(new dom.window.Event(BRIDGE_EVENT));

    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map((call) => call.reset), [false, false, false]);
    assert.deepEqual([...tables.values()].map((state) => state.length), [-1, -1, -1]);
    assert.equal(dom.window.document.documentElement.getAttribute('data-gb-host-tables-expanded'), '3');
  });

  it('materializes the CRM DataTables 1.9 rows through its legacy settings API', async () => {
    const dom = new JSDOM(`<!doctype html><html><body>
      <table id="TableTasks"></table>
      <table id="TableOpportunities"></table>
    </body></html>`);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;

    const elements = [...dom.window.document.querySelectorAll('table')];
    const draws = [];
    const settings = elements.map((element) => ({
      nTable: element,
      _iDisplayStart: 10,
      _iDisplayLength: 10,
      oInstance: {
        fnDraw(reset) { draws.push({ element, reset }); },
      },
    }));
    const jquery = () => ({
      dataTable() { throw new Error('settings.oInstance should own the redraw'); },
    });
    jquery.fn = {
      dataTable() {},
      dataTableSettings: settings,
    };
    dom.window.jQuery = jquery;

    await import('../../src/vanilla/custom-page-host-bridge.js?legacy');
    dom.window.document.dispatchEvent(new dom.window.Event(BRIDGE_EVENT));

    assert.deepEqual(settings.map((state) => state._iDisplayLength), [-1, -1]);
    assert.deepEqual(settings.map((state) => state._iDisplayStart), [0, 0]);
    assert.equal(draws.length, 2);
    assert.ok(draws.every((draw) => draw.reset === false));
    assert.equal(dom.window.document.documentElement.getAttribute('data-gb-host-tables-expanded'), '2');
  });
});
