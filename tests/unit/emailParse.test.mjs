/**
 * Unit tests — src/lib/emailParse.js
 *
 * Follows tests/unit/findPhone.test.mjs conventions: node:test + strict
 * assert, real module import, realistic inline .eml fixtures, one behavior
 * per `it`. emailParse is a pure module (no DOM), so no jsdom needed —
 * node's global atob/TextDecoder cover it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { parseEml, isFullHtmlPage, stripPageChrome, plainTextBody, splitThreadHtml } =
  await import('../../src/lib/emailParse.js');

/* Join header/body lines with a chosen line ending to build an .eml string. */
const eml = (lines, eol = '\n') => lines.join(eol);

describe('parseEml — headers', () => {
  it('extracts subject/from/to/date and a singlepart HTML body', () => {
    const r = parseEml(eml([
      'From: Sales Team <sales@golfballs.com>',
      'To: buyer@example.com',
      'Subject: Your golfballs.com order',
      'Date: Mon, 1 Jun 2026 10:00:00 -0400',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Hello Pat</p>',
    ]));
    assert.equal(r.subject, 'Your golfballs.com order');
    assert.equal(r.from, 'Sales Team <sales@golfballs.com>');
    assert.equal(r.to, 'buyer@example.com');
    assert.equal(r.date, 'Mon, 1 Jun 2026 10:00:00 -0400');
    assert.equal(r.bodyHtml, '<p>Hello Pat</p>');
  });

  it('normalizes CRLF line endings before parsing', () => {
    const r = parseEml(eml([
      'Subject: CRLF message',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<b>ok</b>',
    ], '\r\n'));
    assert.equal(r.subject, 'CRLF message');
    assert.equal(r.bodyHtml, '<b>ok</b>');
  });

  it('unfolds a header continued onto an indented line', () => {
    const r = parseEml(eml([
      'Subject: A very long',
      '\tfolded subject line',
      'Content-Type: text/plain',
      '',
      'x',
    ]));
    assert.equal(r.subject, 'A very long folded subject line');
  });

  it('carries Message-ID, References, and Reply-To through', () => {
    const r = parseEml(eml([
      'Subject: t',
      'Message-ID: <abc123@golfballs.com>',
      'References: <root@x> <prev@x>',
      'Reply-To: replies@golfballs.com',
      '',
      'body',
    ]));
    assert.equal(r.messageId, '<abc123@golfballs.com>');
    assert.equal(r.references, '<root@x> <prev@x>');
    assert.equal(r.replyTo, 'replies@golfballs.com');
  });

  it('falls back to Return-Path for replyTo when Reply-To is absent', () => {
    const r = parseEml(eml([
      'Subject: t',
      'Return-Path: <bounce@golfballs.com>',
      '',
      'body',
    ]));
    assert.equal(r.replyTo, '<bounce@golfballs.com>');
  });

  it('decodes an RFC-2047 B-encoded (base64 UTF-8) Subject', () => {
    const r = parseEml(eml([
      'Subject: =?UTF-8?B?Q2Fmw6kgb3JkZXI=?=',
      '',
      'body',
    ]));
    assert.equal(r.subject, 'Café order');
  });

  it('decodes an RFC-2047 Q-encoded From (underscores → spaces, =2C → comma)', () => {
    const r = parseEml(eml([
      'From: =?utf-8?Q?Golf_Balls=2C_Inc.?= <sales@golfballs.com>',
      '',
      'body',
    ]));
    assert.equal(r.from, 'Golf Balls, Inc. <sales@golfballs.com>');
  });

  it('decodes a B-encoded word embedded in surrounding plain header text', () => {
    const r = parseEml(eml([
      'From: =?utf-8?B?R29sZiBCw6RsbGU=?= <de@golfballs.com>',
      '',
      'body',
    ]));
    assert.equal(r.from, 'Golf Bälle <de@golfballs.com>');
  });

  it('returns an all-empty record when there is no header/body separator', () => {
    const r = parseEml('Subject: never terminated — no blank line');
    assert.deepEqual(r, { subject: '', from: '', to: '', date: '', bodyHtml: '' });
  });
});

describe('parseEml — transfer decoding', () => {
  it('removes quoted-printable soft line breaks and decodes bytes via a declared cp1252 charset', () => {
    // charset "cp1252" must alias to windows-1252, so byte 0xE9 (=E9) → é.
    const r = parseEml(eml([
      'Content-Type: text/html; charset=cp1252',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<p>Caf=E9 wrap=',
      'ped</p>',
    ]));
    assert.equal(r.bodyHtml, '<p>Café wrapped</p>');
  });

  it('decodes a quoted-printable iso-8859-1 body through TextDecoder', () => {
    const r = parseEml(eml([
      'Content-Type: text/html; charset=iso-8859-1',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<p>r=E9sum=E9</p>',
    ]));
    assert.equal(r.bodyHtml, '<p>résumé</p>');
  });

  it('decodes quoted-printable UTF-8 bytes to real characters', () => {
    // KNOWN BUG (this test fails until fixed): =E2=80=99 (UTF-8 for \u2019) is
    // decoded byte-per-byte and the TextDecoder pass is skipped for utf-8,
    // producing mojibake. Base64 UTF-8 bodies already decode correctly \u2014 QP
    // must match.
    const r = parseEml(eml([
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<p>It=E2=80=99s</p>',
    ]));
    assert.equal(r.bodyHtml, '<p>It\u2019s</p>');
  });

  it('decodes a base64 body and recovers multibyte UTF-8 characters', () => {
    const r = parseEml(eml([
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      'PHA+Q2Fmw6k8L3A+',
    ]));
    assert.equal(r.bodyHtml, '<p>Café</p>');
  });

  it('tolerates whitespace/newlines inside a base64 body', () => {
    const r = parseEml(eml([
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      'PHA+Q2Fm',
      'w6k8L3A+',
    ]));
    assert.equal(r.bodyHtml, '<p>Café</p>');
  });
});

describe('parseEml — multipart walk', () => {
  it('prefers the text/html part of a multipart/alternative over the text/plain one', () => {
    const r = parseEml(eml([
      'Subject: alt',
      'Content-Type: multipart/alternative; boundary="BOUND"',
      '',
      'preamble is ignored',
      '--BOUND',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Plain fallback',
      '--BOUND',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<div>Rich version</div>',
      '--BOUND--',
    ]));
    assert.equal(r.bodyHtml, '<div>Rich version</div>');
  });

  it('handles an unquoted boundary parameter', () => {
    const r = parseEml(eml([
      'Content-Type: multipart/mixed; boundary=simple123',
      '',
      '--simple123',
      'Content-Type: text/html',
      '',
      '<i>unquoted</i>',
      '--simple123--',
    ]));
    assert.equal(r.bodyHtml, '<i>unquoted</i>');
  });

  it('recurses into a nested multipart/alternative inside multipart/mixed and skips attachments', () => {
    const r = parseEml(eml([
      'Content-Type: multipart/mixed; boundary=outer',
      '',
      '--outer',
      'Content-Type: multipart/alternative; boundary=inner',
      '',
      '--inner',
      'Content-Type: text/plain',
      '',
      'fallback text',
      '--inner',
      'Content-Type: text/html',
      '',
      '<b>nested html</b>',
      '--inner--',
      '--outer',
      'Content-Type: application/pdf',
      'Content-Disposition: attachment; filename="quote.pdf"',
      '',
      '%PDF-1.4 not html',
      '--outer--',
    ]));
    assert.equal(r.bodyHtml, '<b>nested html</b>');
  });

  it('joins multiple HTML parts with a newline', () => {
    const r = parseEml(eml([
      'Content-Type: multipart/mixed; boundary=mm',
      '',
      '--mm',
      'Content-Type: text/html',
      '',
      '<p>one</p>',
      '--mm',
      'Content-Type: text/html',
      '',
      '<p>two</p>',
      '--mm--',
    ]));
    assert.equal(r.bodyHtml, '<p>one</p>\n<p>two</p>');
  });

  it('wraps a text/plain-only message in an escaped <pre> block', () => {
    const r = parseEml(eml([
      'Subject: plain',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'totals: a < b & c',
    ]));
    assert.ok(r.bodyHtml.startsWith('<pre '));
    assert.ok(r.bodyHtml.includes('totals: a &lt; b &amp; c'));
  });
});

describe('parseEml — CID inline images', () => {
  const relatedEml = (html) => eml([
    'Content-Type: multipart/related; boundary="rel"',
    '',
    '--rel',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    '--rel',
    'Content-Type: image/png',
    'Content-Transfer-Encoding: base64',
    'Content-ID: <logo@gb>',
    '',
    'iVBORw0KGgo=',
    '--rel--',
  ]);

  it('splices a cid: src into a data: URI from the matching image part', () => {
    const r = parseEml(relatedEml('<img src="cid:logo@gb">'));
    assert.equal(r.bodyHtml, '<img src="data:image/png;base64,iVBORw0KGgo=">');
  });

  it('splices a cid: background attribute the same way', () => {
    const r = parseEml(relatedEml('<td background="cid:logo@gb">x</td>'));
    assert.equal(r.bodyHtml, '<td background="data:image/png;base64,iVBORw0KGgo=">x</td>');
  });

  it('leaves a cid: reference untouched when no matching inline part exists', () => {
    const r = parseEml(relatedEml('<img src="cid:missing@gb">'));
    assert.equal(r.bodyHtml, '<img src="cid:missing@gb">');
  });
});

describe('isFullHtmlPage', () => {
  it('detects a DOCTYPE or <html> document (with leading whitespace) as a full page', () => {
    assert.equal(isFullHtmlPage('<!DOCTYPE html><html></html>'), true);
    assert.equal(isFullHtmlPage('  \n<html lang="en">'), true);
  });

  it('does not flag raw EML text or null as a full page', () => {
    assert.equal(isFullHtmlPage('From: a@b\nSubject: x\n\nbody'), false);
    assert.equal(isFullHtmlPage(null), false);
  });
});

describe('stripPageChrome', () => {
  it('removes <script> blocks (including their contents) and <link> tags', () => {
    const out = stripPageChrome(
      '<link rel="stylesheet" href="/x.css"><div>keep</div><script>alert(1)</script>',
    );
    assert.equal(out, '<div>keep</div>');
  });

  it('keeps inline <style> blocks intact', () => {
    const out = stripPageChrome('<style>.a{color:red}</style><p>hi</p><script src="x"></script>');
    assert.equal(out, '<style>.a{color:red}</style><p>hi</p>');
  });
});

describe('plainTextBody', () => {
  it('escapes &, <, > into an inline-styled <pre> wrapper', () => {
    const out = plainTextBody('1 < 2 & 4 > 3');
    assert.ok(out.startsWith('<pre '));
    assert.ok(out.includes('1 &lt; 2 &amp; 4 &gt; 3'));
  });

  it('caps the escaped content at the requested length', () => {
    const out = plainTextBody('abcdef', 3);
    assert.ok(out.includes('>abc</pre>'));
    assert.ok(!out.includes('abcd'));
  });
});

describe('splitThreadHtml', () => {
  const outlookReply =
    '<style>p.MsoNormal{color:#111}</style>' +
    '<div><p>Thanks, sounds good!</p></div>' +
    '<div id="divRplyFwdMsg"><p><b>From:</b> John Doe &lt;john@example.com&gt;<br>' +
    '<b>Sent:</b> Monday, June 1, 2026 9:00 AM<br>' +
    '<b>To:</b> sales@golfballs.com<br>' +
    '<b>Subject:</b> RE: Your proposal</p>' +
    '<p>Original message body here.</p></div>';

  it('returns null when the body has no quoted history', () => {
    assert.equal(splitThreadHtml('<p>just a single message</p>'), null);
    assert.equal(splitThreadHtml(''), null);
  });

  it('does not treat a lone "From:" without Sent/Subject nearby as a quote header', () => {
    const html = '<p>reply</p><p><b>From:</b> the whole golfballs team</p>';
    assert.equal(splitThreadHtml(html), null);
  });

  it('splits an Outlook reply into the live reply plus one quoted message', () => {
    const msgs = splitThreadHtml(outlookReply);
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].quoted, false);
    assert.ok(msgs[0].bodyHtml.includes('Thanks, sounds good!'));
    assert.equal(msgs[1].quoted, true);
    assert.ok(msgs[1].bodyHtml.includes('Original message body here.'));
  });

  it('extracts From/Sent/To/Subject from the quoted header with entities decoded', () => {
    const [, quoted] = splitThreadHtml(outlookReply);
    assert.equal(quoted.from, 'John Doe <john@example.com>');
    assert.equal(quoted.sent, 'Monday, June 1, 2026 9:00 AM');
    assert.equal(quoted.to, 'sales@golfballs.com');
    assert.equal(quoted.subject, 'RE: Your proposal');
  });

  it('strips the header block from the quoted body and carries <style> blocks into it', () => {
    const [, quoted] = splitThreadHtml(outlookReply);
    assert.ok(quoted.bodyHtml.startsWith('<style>p.MsoNormal{color:#111}</style>'));
    assert.ok(!quoted.bodyHtml.includes('Subject:'));
  });

  it('splits a two-deep thread into three messages, oldest last', () => {
    const older =
      '<div><p><b>From:</b> Alice &lt;alice@example.com&gt;<br>' +
      '<b>Sent:</b> Friday, May 29, 2026 4:15 PM<br>' +
      '<b>To:</b> john@example.com<br>' +
      '<b>Subject:</b> Your proposal</p>' +
      '<p>The very first message.</p></div>';
    const msgs = splitThreadHtml(outlookReply + older);
    assert.equal(msgs.length, 3);
    assert.equal(msgs[2].from, 'Alice <alice@example.com>');
    assert.ok(msgs[2].bodyHtml.includes('The very first message.'));
  });
});
