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
