/**
 * Unit tests — src/lib/emailSender.js
 *
 * Follows tests/unit/findPhone.test.mjs conventions. chrome.storage and
 * jsdom's document are stubbed BEFORE the dynamic import: readEmailConfig /
 * loadCredentials read chrome.storage.local at call time, and buildPaPayload
 * runs the DOM-based sanitizer over the html body.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
globalThis.document = dom.window.document;

/* In-memory chrome.storage.local — reset per test via setStore(). */
const store = {};
const setStore = (obj) => {
  for (const k of Object.keys(store)) delete store[k];
  Object.assign(store, obj);
};
globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const out = {};
        for (const k of [].concat(keys)) if (k in store) out[k] = store[k];
        cb(out);
      },
      set: (obj, cb) => { Object.assign(store, obj); if (cb) cb(); },
    },
  },
  runtime: { lastError: null },
};

const { withSignature, htmlToPlainText, buildMailtoUrl, buildPaPayload, readEmailConfig, sendEmail } =
  await import('../../src/lib/emailSender.js');

describe('withSignature', () => {
  it('glues the signature on with the canonical <br><div> wrapper', () => {
    assert.equal(withSignature('<p>Body</p>', '<b>Alex</b>'), '<p>Body</p><br><div><b>Alex</b></div>');
  });

  it('returns the body unchanged when the signature is empty', () => {
    assert.equal(withSignature('<p>Body</p>', ''), '<p>Body</p>');
  });

  it('returns an empty string for a null body with no signature', () => {
    assert.equal(withSignature(null, ''), '');
  });
});

describe('htmlToPlainText', () => {
  it('turns breaks and paragraphs into Outlook-compatible CRLF spacing', () => {
    assert.equal(
      htmlToPlainText('<div>line one<br>line two</div><p>para one</p><p>para two</p>'),
      'line one\r\nline two\r\npara one\r\n\r\npara two',
    );
  });

  it('keeps safe link destinations when HTML formatting is stripped', () => {
    assert.equal(
      htmlToPlainText('See <a href="https://golfballs.com/cart?proposalMode=true&amp;cartID=42">your proposal</a> today'),
      'See your proposal: https://golfballs.com/cart?proposalMode=true&cartID=42 today',
    );
  });

  it('does not expose an unsafe link destination in the plain-text body', () => {
    assert.equal(htmlToPlainText('<a href="javascript:alert(1)">Open</a>'), 'Open');
  });

  it('decodes &nbsp; &amp; &lt; &gt; entities', () => {
    assert.equal(htmlToPlainText('a&nbsp;b &amp; c &lt;tag&gt;'), 'a b & c <tag>');
  });

  it('collapses 3+ consecutive newlines to a blank line and trims the ends', () => {
    assert.equal(htmlToPlainText('<p>a</p><p></p><p></p><p>b</p>'), 'a\r\n\r\nb');
  });
});

describe('buildMailtoUrl', () => {
  it('URL-encodes the recipient, subject, and body into a mailto link', () => {
    assert.equal(
      buildMailtoUrl('buyer@example.com', 'Order update', 'Hi Pat'),
      'mailto:buyer%40example.com?subject=Order%20update&body=Hi%20Pat',
    );
  });

  it('encodes newlines, ampersands, and unicode in the body', () => {
    const url = buildMailtoUrl('a@b.com', 'S & P', 'line1\r\nCafé & co');
    assert.equal(url, 'mailto:a%40b.com?subject=S%20%26%20P&body=line1%0D%0ACaf%C3%A9%20%26%20co');
  });
});

describe('buildPaPayload', () => {
  it('maps from/to/subject/replyMode into a one-element emails array', () => {
    const p = buildPaPayload({
      from: 'alex@golfballs.com', to: 'buyer@example.com', subject: 'Hi',
      htmlBody: '<p>Body</p>', signature: null, replyMode: 'reply',
    });
    assert.equal(p.emails.length, 1);
    assert.equal(p.emails[0].from, 'alex@golfballs.com');
    assert.equal(p.emails[0].to, 'buyer@example.com');
    assert.equal(p.emails[0].subject, 'Hi');
    assert.equal(p.emails[0].replyMode, 'reply');
    assert.equal(p.emails[0].htmlBody, '<p>Body</p>');
  });

  it('appends the signature to the html body when one is provided', () => {
    const p = buildPaPayload({
      from: 'a@b', to: 'c@d', subject: 's',
      htmlBody: '<p>Body</p>', signature: '<b>Alex</b>', replyMode: 'standalone',
    });
    assert.equal(p.emails[0].htmlBody, '<p>Body</p><br><div><b>Alex</b></div>');
  });

  it('sanitizes the html body (event handlers and scripts stripped)', () => {
    const p = buildPaPayload({
      from: 'a@b', to: 'c@d', subject: 's',
      htmlBody: '<p onclick="steal()">Hi</p><script>evil()</script>', replyMode: 'standalone',
    });
    assert.equal(p.emails[0].htmlBody, '<p>Hi</p>');
  });

  it('carries template, variation, and recipient context for worker-side verification', () => {
    const p = buildPaPayload({
      from: 'a@b.com', to: 'buyer@example.com', subject: 'Order #42 update',
      htmlBody: '<p>Body</p>', replyMode: 'standalone',
      templateId: 'order-update', templateName: 'Order update', variationId: 'brief',
      trackingContext: { contactId: 'c42', accountId: 'a7' },
    });
    assert.deepEqual(
      {
        templateId: p.emails[0].templateId,
        templateName: p.emails[0].templateName,
        variationId: p.emails[0].templateVariationId,
        context: p.emails[0].trackingContext,
      },
      {
        templateId: 'order-update',
        templateName: 'Order update',
        variationId: 'brief',
        context: { contactId: 'c42', accountId: 'a7' },
      },
    );
  });
});

describe('readEmailConfig', () => {
  it('returns frozen defaults when storage is empty', async () => {
    setStore({});
    const cfg = await readEmailConfig();
    assert.equal(cfg.signature, '');
    assert.equal(cfg.localPart, '');
    assert.deepEqual(cfg.templates, []);
    assert.equal(cfg.powerAutomateEnabled, false);
    assert.equal(cfg.paReady, false);
    assert.ok(Object.isFrozen(cfg));
  });

  it('reports paReady only when the flag is on AND a credential URL exists', async () => {
    setStore({
      featureFlags: { powerAutomateEnabled: true },
      gbCredentials: { powerAutomateUrl: 'https://pa.example/flow' },
    });
    assert.equal((await readEmailConfig()).paReady, true);
  });

  it('keeps paReady false when the flag is on but the URL is missing', async () => {
    setStore({ featureFlags: { powerAutomateEnabled: true }, gbCredentials: { powerAutomateUrl: '' } });
    const cfg = await readEmailConfig();
    assert.equal(cfg.powerAutomateEnabled, true);
    assert.equal(cfg.paReady, false);
  });

  it('trims the devSettings email.localPart and passes the signature/templates through', async () => {
    setStore({
      emailSignature: '<b>Alex</b>',
      devSettings: { 'email.localPart': '  alex  ' },
      templates: [{ id: 't1' }],
    });
    const cfg = await readEmailConfig();
    assert.equal(cfg.localPart, 'alex');
    assert.equal(cfg.signature, '<b>Alex</b>');
    assert.deepEqual(cfg.templates, [{ id: 't1' }]);
  });

  it('migrates a legacy featureFlags.powerAutomateUrl into credentials and honors it for paReady', async () => {
    setStore({ featureFlags: { powerAutomateEnabled: true, powerAutomateUrl: 'https://legacy.example/flow' } });
    const cfg = await readEmailConfig();
    assert.equal(cfg.paReady, true);
    // loadCredentials writes the migrated record back to storage.
    assert.equal(store.gbCredentials.powerAutomateUrl, 'https://legacy.example/flow');
    assert.equal('powerAutomateUrl' in store.featureFlags, false);
  });
});

describe('sendEmail', () => {
  it('fails fast with no recipient without dispatching anything', async () => {
    let dispatched = 0;
    const r = await sendEmail({ from: 'a@b', to: '', subject: 's', htmlBody: 'x' }, { dispatch: () => { dispatched++; } });
    assert.deepEqual(r, { state: 'failed', transport: 'none', error: 'No recipient email' });
    assert.equal(dispatched, 0);
  });

  it('sends through the PA path with the signed, sanitized payload when paReady', async () => {
    const seen = [];
    const dispatch = async (msg) => { seen.push(msg); return { ok: true }; };
    const r = await sendEmail({
      from: 'alex@golfballs.com', to: 'buyer@example.com', subject: 'Hi',
      htmlBody: '<p>Body</p>', signature: '<i>Sig</i>', replyMode: 'reply',
      config: { paReady: true },
    }, { dispatch });
    assert.deepEqual(r, { state: 'sent', transport: 'pa', error: null });
    assert.equal(seen[0].action, 'paAutomate');
    assert.equal(seen[0].payload.emails[0].htmlBody, '<p>Body</p><br><div><i>Sig</i></div>');
    assert.equal(seen[0].payload.emails[0].replyMode, 'reply');
  });

  it('fails on the PA path when no From address is configured', async () => {
    const r = await sendEmail({
      from: '', to: 'buyer@example.com', subject: 'Hi', htmlBody: 'x',
      config: { paReady: true },
    }, { dispatch: async () => ({ ok: true }) });
    assert.equal(r.state, 'failed');
    assert.equal(r.transport, 'pa');
    assert.match(r.error, /Configure Email account host/);
  });

  it('surfaces the per-result PA error when the flow reports a failure', async () => {
    const r = await sendEmail({
      from: 'a@golfballs.com', to: 'b@c.com', subject: 's', htmlBody: 'x',
      config: { paReady: true },
    }, { dispatch: async () => ({ ok: false, results: [{ status: 'failed', error: 'mailbox full' }] }) });
    assert.deepEqual(r, { state: 'failed', transport: 'pa', error: 'mailbox full' });
  });

  it('falls back to a plain-text mailto window (no signature) when PA is off', async () => {
    const seen = [];
    const r = await sendEmail({
      from: 'a@golfballs.com', to: 'buyer@example.com', subject: 'Order update',
      htmlBody: '<p>Hello<br>there</p>', signature: '<i>Sig</i>',
      config: { paReady: false },
    }, { dispatch: async (msg) => { seen.push(msg); return { ok: true }; } });
    assert.deepEqual(r, { state: 'opened', transport: 'mailto', error: null });
    assert.equal(seen[0].action, 'openMailto');
    assert.equal(seen[0].url, 'mailto:buyer%40example.com?subject=Order%20update&body=Hello%0D%0Athere');
  });

  it('passes template tracking metadata with a mailto handoff', async () => {
    const seen = [];
    await sendEmail({
      from: 'a@golfballs.com', to: 'buyer@example.com', subject: 'Order #42 update',
      htmlBody: 'Hello', config: { paReady: false },
      templateId: 'update', templateName: 'Update', variationId: '__original',
      trackingContext: { contactId: 'c42' },
    }, { dispatch: async (msg) => { seen.push(msg); return { ok: true }; } });
    assert.deepEqual(seen[0].email, {
      to: 'buyer@example.com',
      subject: 'Order #42 update',
      templateId: 'update',
      templateName: 'Update',
      templateVariationId: '__original',
      trackingContext: { contactId: 'c42' },
    });
  });
});
