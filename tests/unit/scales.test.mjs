/**
 * Unit tests — src/lib/scales.js
 *
 * Per-surface UI zoom. Storage lives in chrome.storage.local (stubbed with an
 * in-memory store + captured onChanged listeners) and applyScales writes a
 * <style> tag into the document (jsdom). Both globals are installed BEFORE
 * the dynamic module import.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const store = {};
const changeListeners = [];
globalThis.chrome = {
  storage: {
    local: {
      get(key, cb) { cb({ [key]: store[key] }); },
      set(obj) { Object.assign(store, obj); },
    },
    onChanged: { addListener(fn) { changeListeners.push(fn); } },
  },
};
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
globalThis.document = dom.window.document;

const {
  SCALE_CATEGORIES, DEFAULT_SCALES, loadScales, saveScales, applyScales, ensureScales,
} = await import('../../src/lib/scales.js');

const STYLE_ID = '__gb-ui-scales-css';
const styleEl = () => document.getElementById(STYLE_ID);
const allDefault = (overrides = {}) => ({ ...DEFAULT_SCALES, ...overrides });

beforeEach(() => { delete store.uiScales; });

describe('SCALE_CATEGORIES / DEFAULT_SCALES', () => {
  it('lists the seven UI surfaces in settings order', () => {
    assert.deepEqual(
      SCALE_CATEGORIES.map((c) => c.id),
      ['modals', 'popovers', 'toasts', 'shelf', 'popup', 'editor', 'playground'],
    );
  });

  it('every category carries a label and hint for the settings slider', () => {
    for (const c of SCALE_CATEGORIES) {
      assert.equal(typeof c.label, 'string');
      assert.ok(c.label.length > 0, `${c.id} label`);
      assert.ok(c.hint.length > 0, `${c.id} hint`);
    }
  });

  it('defaults every category to 1 (100%)', () => {
    assert.deepEqual(DEFAULT_SCALES, {
      modals: 1, popovers: 1, toasts: 1, shelf: 1, popup: 1, editor: 1, playground: 1,
    });
  });
});

describe('loadScales', () => {
  it('resolves the defaults when nothing is stored', async () => {
    assert.deepEqual(await loadScales(), DEFAULT_SCALES);
  });

  it('keeps stored in-range values and collapses bad ones to 1', async () => {
    store.uiScales = { modals: 1.25, popovers: 99, toasts: 'abc', shelf: 0.4, popup: 0.5, editor: 1.5 };
    assert.deepEqual(await loadScales(), {
      modals: 1.25,   // in range
      popovers: 1,    // > 1.5 → default
      toasts: 1,      // non-numeric → default
      shelf: 1,       // < 0.5 → default
      popup: 0.5,     // boundary is inclusive
      editor: 1.5,    // boundary is inclusive
      playground: 1,  // missing → default
    });
  });

  it('ignores unknown category keys in the stored blob', async () => {
    store.uiScales = { bogus: 1.2, modals: 1.1 };
    const s = await loadScales();
    assert.equal(s.modals, 1.1);
    assert.equal('bogus' in s, false);
  });
});

describe('saveScales', () => {
  it('persists a sanitized full blob under uiScales', () => {
    saveScales({ shelf: 0.75, modals: 2, bogus: 1.2 });
    assert.deepEqual(store.uiScales, allDefault({ shelf: 0.75 })); // modals 2 clamped, bogus dropped
  });

  it('round-trips through loadScales', async () => {
    saveScales({ editor: 1.2 });
    assert.deepEqual(await loadScales(), allDefault({ editor: 1.2 }));
  });
});

describe('applyScales', () => {
  it('injects one stylesheet with a CSS variable per category', () => {
    applyScales({ modals: 1.2 });
    const el = styleEl();
    assert.ok(el, 'style element injected');
    assert.ok(el.textContent.includes('--gb-scale-modals: 1.2;'));
    assert.ok(el.textContent.includes('--gb-scale-toasts: 1;'));
  });

  it('drives most surfaces with zoom but popovers with the scale property', () => {
    applyScales({});
    const css = styleEl().textContent;
    assert.ok(css.includes('[data-gb-scale="modals"] { zoom: var(--gb-scale-modals, 1) !important; }'));
    assert.ok(css.includes('[data-gb-scale="popovers"] { scale: var(--gb-scale-popovers, 1) !important; transform-origin: top left !important; }'));
    assert.equal(css.includes('[data-gb-scale="popovers"] { zoom:'), false);
  });

  it('clamps out-of-range values before writing the CSS', () => {
    applyScales({ toasts: 9 });
    assert.ok(styleEl().textContent.includes('--gb-scale-toasts: 1;'));
  });

  it('is idempotent — re-applying reuses the same element instead of adding one', () => {
    applyScales({ popup: 1.3 });
    applyScales({ popup: 1.3 });
    assert.equal(document.querySelectorAll('style').length, 1);
    assert.ok(styleEl().textContent.includes('--gb-scale-popup: 1.3;'));
  });
});

describe('ensureScales', () => {
  it('applies the saved scales and re-applies on a chrome.storage change', async () => {
    store.uiScales = { popup: 1.3 };
    ensureScales();
    await new Promise((r) => setTimeout(r, 0)); // loadScales().then(applyScales)
    assert.ok(styleEl().textContent.includes('--gb-scale-popup: 1.3;'));

    assert.ok(changeListeners.length >= 1, 'registered an onChanged listener');
    const fire = changeListeners[changeListeners.length - 1];
    fire({ uiScales: { newValue: { popup: 0.8 } } }, 'local');
    assert.ok(styleEl().textContent.includes('--gb-scale-popup: 0.8;'));
  });

  it('ignores changes outside the local storage area', async () => {
    ensureScales();
    await new Promise((r) => setTimeout(r, 0));
    const before = styleEl().textContent;
    const fire = changeListeners[changeListeners.length - 1];
    fire({ uiScales: { newValue: { popup: 1.45 } } }, 'sync');
    assert.equal(styleEl().textContent, before);
  });

  it('falls back to the defaults when a change clears the stored value', async () => {
    ensureScales();
    await new Promise((r) => setTimeout(r, 0));
    const fire = changeListeners[changeListeners.length - 1];
    fire({ uiScales: { newValue: { modals: 1.4 } } }, 'local');
    assert.ok(styleEl().textContent.includes('--gb-scale-modals: 1.4;'));
    fire({ uiScales: { newValue: undefined } }, 'local');
    assert.ok(styleEl().textContent.includes('--gb-scale-modals: 1;'));
  });
});
