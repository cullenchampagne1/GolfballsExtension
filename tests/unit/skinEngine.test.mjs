/**
 * Skin override engine: normalization (namespace/type clamping), the stale-var
 * diff that keeps re-applies clean, and that applySkin sets inheritable vars on
 * documentElement + injects the raw-css layer into the document and any
 * registered shadow root.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
globalThis.document = dom.window.document;
globalThis.window = dom.window;

const {
  normalizeSkin, staleVarKeys, applySkin, registerSkinRoot, currentSkin,
} = await import('../../src/lib/theme/skinEngine.js');
const { REVSTACK_SKIN } = await import('../../src/themes/revstack.skin.js');

beforeEach(() => {
  // reset to an empty skin between tests
  applySkin({ vars: {}, css: '' });
  document.documentElement.removeAttribute('style');
});

describe('normalizeSkin', () => {
  it('keeps only --gb-* string/number vars and a string css', () => {
    const s = normalizeSkin({
      vars: { '--gb-card-bg': 'rgba(0,0,0,.4)', '--gb-card-radius': 16, evil: 'x', '--other': 'y', '--gb-fn': () => {} },
      css: '.gb-card{backdrop-filter:blur(8px)}',
    });
    assert.deepEqual(s.vars, { '--gb-card-bg': 'rgba(0,0,0,.4)', '--gb-card-radius': '16' });
    assert.equal(s.css, '.gb-card{backdrop-filter:blur(8px)}');
  });

  it('defaults to empty vars/css for junk input', () => {
    assert.deepEqual(normalizeSkin(null), { vars: {}, css: '' });
    assert.deepEqual(normalizeSkin({ vars: 'nope', css: 5 }), { vars: {}, css: '' });
  });
});

describe('staleVarKeys', () => {
  it('returns keys present before but absent in the next skin', () => {
    assert.deepEqual(
      staleVarKeys(['--gb-a', '--gb-b', '--gb-c'], { '--gb-b': '1' }),
      ['--gb-a', '--gb-c'],
    );
  });
  it('returns nothing when the next skin is a superset', () => {
    assert.deepEqual(staleVarKeys(['--gb-a'], { '--gb-a': '1', '--gb-b': '2' }), []);
  });
});

describe('applySkin', () => {
  it('sets vars on documentElement so they inherit into shadow DOM', () => {
    applySkin({ vars: { '--gb-app-bg': 'linear-gradient(#000,#111)' }, css: '' });
    assert.equal(document.documentElement.style.getPropertyValue('--gb-app-bg'), 'linear-gradient(#000,#111)');
  });

  it('removes a var that a later skin drops (no stale overrides)', () => {
    applySkin({ vars: { '--gb-card-bg': 'red' }, css: '' });
    applySkin({ vars: { '--gb-app-bg': 'blue' }, css: '' });
    assert.equal(document.documentElement.style.getPropertyValue('--gb-card-bg'), '');
    assert.equal(document.documentElement.style.getPropertyValue('--gb-app-bg'), 'blue');
  });

  it('injects the raw css into a <style> in document.head', () => {
    applySkin({ vars: {}, css: '.gb-card{border-radius:16px}' });
    const el = document.getElementById('__gb-skin-css');
    assert.ok(el, 'skin style element exists');
    assert.equal(el.textContent, '.gb-card{border-radius:16px}');
  });

  it('removes the css style element when css is cleared', () => {
    applySkin({ vars: {}, css: '.x{}' });
    applySkin({ vars: {}, css: '' });
    assert.equal(document.getElementById('__gb-skin-css'), null);
  });
});

describe('registerSkinRoot', () => {
  it('injects the current css into a shadow root and stops after dispose', () => {
    applySkin({ vars: {}, css: '.gb-modal{backdrop-filter:blur(20px)}' });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    const dispose = registerSkinRoot(shadow);
    const injected = shadow.querySelector('#__gb-skin-css');
    assert.ok(injected, 'css injected into shadow root');
    assert.equal(injected.textContent, '.gb-modal{backdrop-filter:blur(20px)}');

    // A new skin updates the shadow root too.
    applySkin({ vars: {}, css: '.gb-modal{backdrop-filter:blur(4px)}' });
    assert.equal(shadow.querySelector('#__gb-skin-css').textContent, '.gb-modal{backdrop-filter:blur(4px)}');

    dispose();
    applySkin({ vars: {}, css: '.gb-modal{border:0}' });
    assert.equal(shadow.querySelector('#__gb-skin-css'), null, 'no longer updated after dispose');
  });
});

describe('RevStack skin', () => {
  it('is a well-formed skin the engine accepts (gradient bg + glass tokens)', () => {
    const s = normalizeSkin(REVSTACK_SKIN);
    // The proof-of-look tokens the shared primitives read.
    assert.match(s.vars['--gb-app-bg'], /gradient/);
    assert.match(s.vars['--gb-card-blur'], /blur\(/);
    assert.ok(s.vars['--gb-card-bg'], 'card glass background set');
    assert.ok(s.vars['--gb-modal-blur'], 'modal blur set');
    // Every key stays inside the --gb- namespace (normalize would have dropped others).
    assert.ok(Object.keys(s.vars).every((k) => k.startsWith('--gb-')));
  });

  it('applies the RevStack gradient to documentElement', () => {
    applySkin(REVSTACK_SKIN);
    assert.match(document.documentElement.style.getPropertyValue('--gb-app-bg'), /linear-gradient/);
    assert.ok(document.documentElement.style.getPropertyValue('--gb-card-blur').includes('blur('));
  });
});
