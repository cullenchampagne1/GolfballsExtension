import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

/* custom-pages.js is a classic content script (IIFE, no exports). It boots
   against browser globals, so stub `window` BEFORE the dynamic import; with
   no chrome.storage present it resolves an empty enabled-set and idles.
   The engine exposes its pure helpers on window.__gbCustomPagesInternals. */
let deepEqual;
before(async () => {
  globalThis.window = globalThis;
  await import('../../src/vanilla/custom-pages.js');
  ({ deepEqual } = globalThis.__gbCustomPagesInternals);
});

describe('custom-pages store · extract diffing (deepEqual)', () => {
  it('treats two extracts with identical nested content as equal', () => {
    const a = { ids: { contact: '41' }, orders: [{ number: 'A1', revenue: 52.5 }], stats: { orderCount: 3 } };
    const b = { ids: { contact: '41' }, orders: [{ number: 'A1', revenue: 52.5 }], stats: { orderCount: 3 } };
    assert.equal(deepEqual(a, b), true);
  });

  it('is key-order insensitive (extractor rebuild must not count as a change)', () => {
    assert.equal(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  });

  it('detects a changed leaf value deep in the tree', () => {
    const a = { stats: { totalRevenue: 100 }, emails: [{ subject: 'Hi' }] };
    const b = { stats: { totalRevenue: 100 }, emails: [{ subject: 'Hi there' }] };
    assert.equal(deepEqual(a, b), false);
  });

  it('detects a late-arriving row (DataTables append)', () => {
    assert.equal(deepEqual({ orders: [{ n: 1 }] }, { orders: [{ n: 1 }, { n: 2 }] }), false);
  });

  it('detects an added/removed key', () => {
    assert.equal(deepEqual({ a: 1 }, { a: 1, b: undefined }), false);
    assert.equal(deepEqual({ a: 1, b: 2 }, { a: 1 }), false);
  });

  it('distinguishes null, {}, and [] from each other', () => {
    assert.equal(deepEqual(null, {}), false);
    assert.equal(deepEqual({}, []), false);
    assert.equal(deepEqual([], []), true);
    assert.equal(deepEqual(null, null), true);
  });

  it('treats NaN as equal to NaN (a re-extract of a bad number is not a change)', () => {
    assert.equal(deepEqual({ v: NaN }, { v: NaN }), true);
    assert.equal(deepEqual(NaN, 1), false);
  });

  it('null extract (engine unavailable) equals only null', () => {
    assert.equal(deepEqual(null, { orders: [] }), false);
    assert.equal(deepEqual(null, null), true);
  });
});

/* With Custom Pages on, CRM Page 294 is the Replacement Contacts takeover, so
   the host's own sidebar link ("Adjust Leader Board") is renamed in place. It
   is found by ROUTE rather than by Metronic markup, which is what these pin. */
describe('custom-pages · host sidebar rename', () => {
  let applyNavRename;
  let rule;
  let win;

  before(async () => {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><body></body>');
    win = dom.window;
    globalThis.document = win.document;
    globalThis.NodeFilter = win.NodeFilter;
    ({ applyNavRename } = globalThis.__gbCustomPagesInternals);
    rule = globalThis.__gbCustomPagesInternals.HOST_NAV_RENAMES()
      .find((r) => r.id === 'replacement_contacts');
  });

  const nav = (html) => { win.document.body.innerHTML = html; };

  it('renames the Page 294 link the CRM renders', () => {
    nav('<a href="Default.aspx?Page=294">Adjust Leader Board</a>');
    assert.equal(applyNavRename(rule), true);
    assert.equal(win.document.querySelector('a').textContent.trim(), 'Replacement Contacts');
  });

  it('keeps the icon markup inside the anchor — only the label changes', () => {
    nav('<a href="/adminnew/Default.aspx?Page=294&x=1"><i class="icon-trophy"></i> Adjust Leader Board </a>');
    assert.equal(applyNavRename(rule), true);
    const link = win.document.querySelector('a');
    assert.equal(link.querySelector('i.icon-trophy') !== null, true);
    assert.equal(link.textContent.includes('Replacement Contacts'), true);
  });

  it('does not touch a different page whose number merely starts with 294', () => {
    nav('<a href="Default.aspx?Page=2940">Adjust Leader Board</a>');
    assert.equal(applyNavRename(rule), false);
    assert.equal(win.document.querySelector('a').textContent.trim(), 'Adjust Leader Board');
  });

  it('reports no hit when the nav has not rendered yet, so the caller retries', () => {
    nav('<div>no nav</div>');
    assert.equal(applyNavRename(rule), false);
  });

  it('is idempotent — a second pass over a renamed link changes nothing', () => {
    nav('<a href="Default.aspx?Page=294">Adjust Leader Board</a>');
    applyNavRename(rule);
    assert.equal(applyNavRename(rule), false);
    assert.equal(win.document.querySelector('a').textContent.trim(), 'Replacement Contacts');
  });
});
