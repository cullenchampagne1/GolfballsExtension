import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  emailUsageDimensions,
  reportContactImportUsage,
  reportFeatureUsage,
} from '../../src/lib/usageEvents.js';

const originalChrome = globalThis.chrome;

afterEach(() => {
  globalThis.chrome = originalChrome;
  delete globalThis.__gbUsageSilent;
});

describe('feature utilization event boundary', () => {
  it('derives aggregate email dimensions without retaining body content', () => {
    const dimensions = emailUsageDimensions(`
      <p>Hello there, Sam.</p>
      <span data-gb-attach="https://files.invalid/quote.pdf" data-gb-attach-name="quote.pdf">hidden marker</span>
      <img src="https://images.invalid/logo.png" alt="logo">
    `);

    assert.deepEqual(dimensions, {
      word_count: 3,
      attachment_count: 1,
      inline_image_count: 1,
    });
  });

  it('sends only fixed dimensions and supports a rare-action flush hint', () => {
    const messages = [];
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage(message, callback) { messages.push(message); callback?.(); },
      },
    };

    assert.equal(reportFeatureUsage('proof_submit', {
      source: 'submit_proof', count: 3, word_count: -9,
    }, { flush: 'soon' }), true);
    assert.deepEqual(messages, [{
      action: 'gbUsageEvent',
      flush: 'soon',
      event: {
        kind: 'feature',
        feature: 'proof_submit',
        source: 'submit_proof',
        count: 3,
        word_count: 0,
        attachment_count: 0,
        inline_image_count: 0,
        ok: true,
      },
    }]);
  });

  it('reports contact import runs separately from accepted record volume', () => {
    const messages = [];
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage(message, callback) { messages.push(message); callback?.(); },
      },
    };

    assert.equal(reportContactImportUsage(2_000, { flush: 'soon' }), true);
    assert.deepEqual(
      messages.map(({ event }) => ({ feature: event.feature, count: event.count })),
      [
        { feature: 'contact_import', count: 2_000 },
        { feature: 'contact_import_run', count: 1 },
      ],
    );
    assert.ok(messages.every(({ flush, event }) => (
      flush === 'soon' && event.source === 'crm_search'
    )));
  });

  it('silences live guide demos so they cannot inflate adoption', () => {
    let called = false;
    globalThis.chrome = { runtime: { sendMessage() { called = true; } } };
    globalThis.__gbUsageSilent = true;
    assert.equal(reportFeatureUsage('gift_catalog_open', { source: 'gift_catalog' }), false);
    assert.equal(called, false);
  });
});
