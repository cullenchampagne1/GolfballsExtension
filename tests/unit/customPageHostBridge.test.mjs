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

  it('materializes every registered host DataTable when the isolated engine requests it', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Event = dom.window.Event;

    await import('../../src/vanilla/custom-page-host-bridge.js');

    const calls = [];
    const tables = new Map([
      ['#TableTasks', { length: 10 }],
      ['#ActivityTable', { length: 25 }],
    ]);
    const jquery = (selector) => ({
      DataTable() {
        const state = tables.get(selector);
        const page = () => {};
        page.len = (value) => {
          if (value === undefined) return state.length;
          state.length = value;
          return { draw: (reset) => calls.push({ selector, reset }) };
        };
        return { page };
      },
    });
    jquery.fn = {
      dataTable: {
        isDataTable: (selector) => tables.has(selector),
      },
    };
    dom.window.jQuery = jquery;

    dom.window.document.dispatchEvent(new dom.window.Event(BRIDGE_EVENT));

    assert.deepEqual(calls, [
      { selector: '#TableTasks', reset: false },
      { selector: '#ActivityTable', reset: false },
    ]);
    assert.equal(dom.window.document.documentElement.getAttribute('data-gb-host-tables-expanded'), '2');
  });
});
