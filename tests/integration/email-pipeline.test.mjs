/**
 * Integration flow — raw EML → parseEml → sanitizeHtml → emailSender.
 *
 * Chains the real src/lib/emailParse.js, src/lib/sanitizeHtml.js (on a jsdom
 * document), and src/lib/emailSender.js: a multipart .eml fixture is decoded,
 * its CID image spliced in, the HTML sanitized, and the result dispatched both
 * through the Power Automate payload builder and the mailto fallback. The
 * generated mailto URL is finally validated by the real security policy.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createContext, loadScript } from './helpers/harness.mjs';

const dom = new JSDOM('');
globalThis.document = dom.window.document;

const { parseEml } = await import('../../src/lib/emailParse.js');
const { sanitizeHtml } = await import('../../src/lib/sanitizeHtml.js');
const { htmlToPlainText, buildMailtoUrl, withSignature, sendEmail } = await import('../../src/lib/emailSender.js');
const { sendThreadReply } = await import('../../src/lib/emailReply.js');

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const RAW_HTML = '<div><p>Café pricing — see <img src="cid:logo123"> below.</p>'
  + '<script>alert("xss")</script>'
  + '<a href="javascript:evil()" onclick="steal()">bad link</a> '
  + '<a href="https://www.golfballs.com/Golf-Balls.html" target="_blank">catalog</a></div>';

const EML = [
  'Subject: =?utf-8?B?UHJvcG9zYWwg4oCUIFJlYWR5?=', // "Proposal — Ready"
  `From: =?utf-8?B?${Buffer.from('Clément', 'utf8').toString('base64')}?= <rep@golfballs.com>`,
  'To: buyer@example.com',
  'Date: Mon, 13 Jul 2026 10:00:00 -0500',
  'Message-ID: <msg-1@golfballs.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/related; boundary="REL"',
  '',
  '--REL',
  'Content-Type: multipart/alternative; boundary="ALT"',
  '',
  '--ALT',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Pricing attached. See the catalog online.',
  '--ALT',
  'Content-Type: text/html; charset=utf-8',
  'Content-Transfer-Encoding: base64',
  '',
  Buffer.from(RAW_HTML, 'utf8').toString('base64'),
  '--ALT--',
  '--REL',
  'Content-Type: image/png',
  'Content-Transfer-Encoding: base64',
  'Content-ID: <logo123>',
  '',
  PNG_B64,
  '--REL--',
  '',
].join('\r\n');

let parsed;
let sanitized;

before(() => {
  parsed = parseEml(EML);
  sanitized = sanitizeHtml(parsed.bodyHtml);
});

describe('email pipeline', () => {
  it('decodes headers, transfer encodings, and splices CID images into the body', () => {
    assert.equal(parsed.subject, 'Proposal — Ready');
    assert.match(parsed.from, /Clément/);
    assert.equal(parsed.to, 'buyer@example.com');
    assert.equal(parsed.messageId, '<msg-1@golfballs.com>');
    assert.ok(parsed.bodyHtml.includes('Café pricing —'), 'base64 UTF-8 HTML decodes correctly');
    assert.ok(
      parsed.bodyHtml.includes(`src="data:image/png;base64,${PNG_B64}"`),
      'the CID reference becomes an inline data: URI',
    );
    assert.ok(parsed.bodyHtml.includes('<script>'), 'parseEml itself does not sanitize — that is the next stage');
  });

  it('decodes a non-UTF-8 quoted-printable part through TextDecoder', () => {
    const eml = [
      'Subject: hi', 'From: a@b.c', 'To: d@e.f',
      'Content-Type: text/html; charset=windows-1252',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<p>Caf=E9 menu</p>',
    ].join('\r\n');
    assert.equal(parseEml(eml).bodyHtml, '<p>Café menu</p>');
  });

  it('sanitizes the parsed body: scripts, event handlers, and js: URLs are gone; layout survives', () => {
    assert.equal(sanitized.includes('<script'), false);
    assert.equal(/onclick/i.test(sanitized), false);
    assert.equal(/javascript:/i.test(sanitized), false);
    assert.ok(sanitized.includes('Café pricing —'));
    assert.ok(sanitized.includes(`data:image/png;base64,${PNG_B64}`), 'the safe data:image src survives');
    assert.match(sanitized, /<img[^>]*referrerpolicy="no-referrer"/);
    assert.match(
      sanitized,
      /<a href="https:\/\/www\.golfballs\.com\/Golf-Balls\.html"[^>]*rel="noopener noreferrer"/,
    );
    assert.ok(sanitized.includes('bad link'), 'text of a neutered link is kept');
  });

  it('flattens the sanitized HTML to plain text and encodes a policy-valid mailto URL', () => {
    const plain = htmlToPlainText(sanitized);
    assert.ok(plain.includes('Café pricing — see  below.'));
    assert.ok(plain.includes('bad link catalog'));
    assert.equal(/<[^>]+>/.test(plain), false, 'no markup survives');

    const url = buildMailtoUrl(parsed.to, parsed.subject, plain);
    assert.ok(url.startsWith('mailto:buyer%40example.com?subject=Proposal%20%E2%80%94%20Ready&body='));
    assert.ok(url.includes('Caf%C3%A9'));
    assert.equal(/[\r\n ]/.test(url), false, 'everything is percent-encoded');

    // The URL this pipeline builds must pass the background's mailto guard.
    const security = createContext({});
    loadScript(security, 'security-policy.js');
    assert.equal(security.GBSecurity.isMailtoUrl(url), true);
  });

  it('dispatches a Power Automate payload with sanitized body and glued signature', async () => {
    const dispatched = [];
    const result = await sendEmail({
      from: 'rep@golfballs.com',
      to: parsed.to,
      subject: parsed.subject,
      htmlBody: parsed.bodyHtml,
      signature: '<b>Rep Name</b> · Golfballs.com',
      replyMode: 'reply',
      config: { paReady: true },
    }, { dispatch: async (msg) => { dispatched.push(msg); return { ok: true, results: [{ status: 'sent' }] }; } });

    assert.deepEqual(result, { state: 'sent', transport: 'pa', error: null });
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].action, 'paAutomate');
    const [email] = dispatched[0].payload.emails;
    assert.equal(email.from, 'rep@golfballs.com');
    assert.equal(email.to, 'buyer@example.com');
    assert.equal(email.replyMode, 'reply');
    assert.equal(email.htmlBody.includes('<script'), false, 'the PA body is sanitized');
    assert.ok(email.htmlBody.includes('<br><div><b>Rep Name</b> · Golfballs.com</div>'), 'signature is glued via withSignature');
    assert.equal(email.htmlBody, sanitizeHtml(withSignature(parsed.bodyHtml, '<b>Rep Name</b> · Golfballs.com')));
  });

  it('routes a freeform reply through the clicked email channel', async () => {
    const dispatched = [];
    const result = await sendThreadReply({
      email: {
        from: 'Pat Buyer <buyer@example.com>',
        to: 'Cullen <cullen@loyaltylogo.com>',
        subject: 'RE: Order update',
      },
      subject: 'RE: RE: Order update',
      htmlBody: '<p>Thanks, Pat.</p>',
      config: { paReady: true, localPart: 'cullen', signature: '<b>Cullen</b>' },
    }, { dispatch: async (message) => { dispatched.push(message); return { ok: true }; } });

    assert.deepEqual(result, { state: 'sent', transport: 'pa', error: null });
    const email = dispatched[0].payload.emails[0];
    assert.equal(email.from, 'cullen@loyaltylogo.com');
    assert.equal(email.to, 'buyer@example.com');
    assert.equal(email.subject, 'RE: Order update');
    assert.equal(email.replyMode, 'reply');
    assert.equal(email.htmlBody, '<p>Thanks, Pat.</p><br><div><b>Cullen</b></div>');
  });

  it('falls back to a plain-text mailto window when Power Automate is off', async () => {
    const dispatched = [];
    const result = await sendEmail({
      from: 'rep@golfballs.com',
      to: parsed.to,
      subject: parsed.subject,
      htmlBody: sanitized,
      signature: '<b>Rep Name</b>',
      config: { paReady: false },
    }, { dispatch: async (msg) => { dispatched.push(msg); return { ok: true }; } });

    assert.deepEqual(result, { state: 'opened', transport: 'mailto', error: null });
    assert.equal(dispatched[0].action, 'openMailto');
    const body = decodeURIComponent(dispatched[0].url.split('&body=')[1]);
    assert.ok(body.includes('Café pricing — see  below.'));
    assert.equal(/<[^>]+>/.test(body), false, 'mailto body is plain text');
    assert.equal(body.includes('Rep Name'), false, 'the signature is dropped on the mailto path');
  });
});
