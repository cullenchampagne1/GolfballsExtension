/**
 * Unit tests — src/lib/findPhone.js
 *
 * Conventions for this suite (tests/unit/*.test.mjs):
 * - node's built-in runner: `describe`/`it` from node:test, node:assert/strict.
 * - Import the real ESM module from src/lib; never copy logic into the test.
 * - DOM-dependent modules get jsdom globals installed BEFORE the dynamic
 *   import so module-level code sees them.
 * - Every `it` title states the behavior under test; every case asserts a
 *   concrete expected value from a realistic fixture (no tautologies).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
globalThis.DOMParser = dom.window.DOMParser;

const { normalizePhone, extractPhonesFromOrderHtml } = await import('../../src/lib/findPhone.js');

describe('normalizePhone', () => {
  it('formats a bare 10-digit run as (xxx) xxx-xxxx', () => {
    assert.equal(normalizePhone('6103748344'), '(610) 374-8344');
  });

  it('strips punctuation before formatting', () => {
    assert.equal(normalizePhone('610.374.8344'), '(610) 374-8344');
  });

  it('drops a leading country-code 1 from 11-digit numbers', () => {
    assert.equal(normalizePhone('1-610-374-8344'), '(610) 374-8344');
  });

  it('returns the raw input unchanged when digit count is not phone-shaped', () => {
    assert.equal(normalizePhone('12345'), '12345');
  });

  it('tolerates null/undefined without throwing', () => {
    assert.equal(normalizePhone(null), null);
    assert.equal(normalizePhone(undefined), undefined);
  });
});

describe('extractPhonesFromOrderHtml', () => {
  const orderPage = (inner) => `<html><body><div id="customerInfo">${inner}</div></body></html>`;

  it('extracts a formatted phone from the customerInfo block', () => {
    const html = orderPage('<table><tr><td>Phone: (610) 374-8344</td></tr></table>');
    const phones = extractPhonesFromOrderHtml(html).map((c) => c.phone);
    assert.deepEqual(phones, ['(610) 374-8344']);
  });

  it('does not match digit runs embedded in order numbers', () => {
    const html = orderPage('<table><tr><td>Order #2820701-5119355</td></tr></table>');
    assert.deepEqual(extractPhonesFromOrderHtml(html), []);
  });

  it('requires a separator between the last two groups (CRM format)', () => {
    const html = orderPage('<table><tr><td>alt 6103748344</td></tr></table>');
    assert.deepEqual(extractPhonesFromOrderHtml(html), []);
  });

  it('dedupes the same number appearing in different formats', () => {
    const html = orderPage(
      '<table><tr><td>(610) 374-8344</td></tr><tr><td>610-374-8344</td></tr></table>',
    );
    assert.equal(extractPhonesFromOrderHtml(html).length, 1);
  });
});
