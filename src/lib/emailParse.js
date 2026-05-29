/* ───────────────────────────────────────────────────────────────
   emailParse.js — MIME / EML → renderable HTML.

   Ported verbatim (logic-for-logic) from the legacy vanilla
   modal src/vanilla/modals/email-preview.js so the React email
   viewer parses exactly what the old one did:

     • RFC-2047 encoded-word header decode (=?utf-8?B?…?=)
     • quoted-printable + base64 transfer decoding
     • recursive multipart walk, HTML part preferred over text
     • CID inline images extracted to data: URIs and spliced back
       into src= / background= attributes
     • non-UTF-8 charsets decoded via TextDecoder

   Kept as a pure module (no DOM, no chrome.*) so it's unit-
   testable and shared by the content entry + playground.
─────────────────────────────────────────────────────────────── */

function decodeQP(s) {
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function decodeB64(s) {
  try {
    const clean = s.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(clean);
    try {
      return decodeURIComponent(
        bin.split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
      );
    } catch {
      return bin;
    }
  } catch {
    return '';
  }
}

function decodeHeader(h) {
  return (h || '').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, _cs, enc, val) => {
    try {
      if (enc.toUpperCase() === 'B') return decodeB64(val);
      if (enc.toUpperCase() === 'Q') return decodeQP(val.replace(/_/g, ' '));
    } catch { /* fall through to raw */ }
    return val;
  });
}

function decodePart(s, enc) {
  const e = (enc || '').toLowerCase().trim();
  if (e === 'base64') return decodeB64(s);
  if (e === 'quoted-printable') return decodeQP(s);
  return s;
}

/**
 * Parse a raw EML string into a flat record.
 * @returns {{subject,from,to,date,bodyHtml,messageId,references,replyTo}}
 */
export function parseEml(raw) {
  const result = { subject: '', from: '', to: '', date: '', bodyHtml: '' };
  const norm = String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const sep = norm.indexOf('\n\n');
  if (sep === -1) return result;

  const rawH = norm.slice(0, sep).replace(/\n[ \t]+/g, ' ');
  const bodyTx = norm.slice(sep + 2);
  const h = {};
  for (const line of rawH.split('\n')) {
    const m = line.match(/^([A-Za-z0-9-]+)\s*:\s*(.*)/);
    if (m) h[m[1].toLowerCase()] = m[2].trim();
  }
  result.subject = decodeHeader(h.subject);
  result.from = decodeHeader(h.from);
  result.to = decodeHeader(h.to);
  result.date = h.date || '';
  result.messageId = (h['message-id'] || '').trim();
  result.references = (h.references || '').trim();
  result.replyTo = decodeHeader(h['reply-to'] || h['return-path'] || '');

  const out = { html: [], text: [], inlines: {} };

  function walk(body, partCT, partCTE, headers = {}) {
    const ctLow = (partCT || '').toLowerCase();

    // CID inline image → data: URI, stashed for later splice.
    const cid = headers['content-id'];
    if (cid && ctLow.startsWith('image/')) {
      const cleanCid = cid.replace(/^</, '').replace(/>$/, '');
      const b64 = body.replace(/\s/g, '');
      const mime = ctLow.split(';')[0];
      out.inlines[cleanCid] = `data:${mime};base64,${b64}`;
      return;
    }

    if (ctLow.startsWith('multipart/')) {
      const bm = partCT.match(/boundary\s*=\s*"([^"]+)"|boundary\s*=\s*([^\s;]+)/i);
      if (!bm) return;
      const boundary = (bm[1] || bm[2]).replace(/;.*/, '').trim();
      const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const parts = ('\n' + body).split(new RegExp('\n--' + escaped + '(?:--)?(?:\n|$)'));
      for (let i = 1; i < parts.length; i++) {
        const p = parts[i];
        const pSep = p.indexOf('\n\n');
        if (pSep === -1) continue;
        const ph = {};
        for (const hl of p.slice(0, pSep).replace(/\n[ \t]+/g, ' ').split('\n')) {
          const hm = hl.match(/^([A-Za-z0-9-]+)\s*:\s*(.*)/);
          if (hm) ph[hm[1].toLowerCase()] = hm[2].trim();
        }
        walk(p.slice(pSep + 2), ph['content-type'] || 'text/plain', ph['content-transfer-encoding'] || '7bit', ph);
      }
    } else if (ctLow.startsWith('text/html')) {
      const csm = partCT.match(/charset\s*=\s*["']?([^"';\s]+)/i);
      const charset = (csm ? csm[1] : 'utf-8').toLowerCase().replace(/^cp-?/i, 'windows-');
      let decoded = decodePart(body, partCTE);
      if (charset !== 'utf-8' && charset !== 'us-ascii') {
        try {
          const bytes = Uint8Array.from(decodePart(body, partCTE), (c) => c.charCodeAt(0));
          decoded = new TextDecoder(charset, { fatal: false }).decode(bytes);
        } catch { /* keep the best-effort decode */ }
      }
      out.html.push(decoded);
    } else if (ctLow.startsWith('text/plain')) {
      out.text.push(decodePart(body, partCTE));
    }
  }

  walk(bodyTx, h['content-type'] || 'text/plain', h['content-transfer-encoding'] || '7bit', h);

  if (out.html.length) {
    let mergedHtml = out.html.join('\n');
    mergedHtml = mergedHtml.replace(/(src|background)\s*=\s*["']?cid:([^"'\s>]+)["']?/gi, (match, attr, c) => {
      const cleanCid = c.replace(/^</, '').replace(/>$/, '');
      return out.inlines[cleanCid] ? `${attr}="${out.inlines[cleanCid]}"` : match;
    });
    result.bodyHtml = mergedHtml;
  } else if (out.text.length) {
    const safe = out.text.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    result.bodyHtml = `<pre style="white-space:pre-wrap;font:13px/1.6 sans-serif;margin:0;">${safe}</pre>`;
  }
  return result;
}

/** A full-HTML-page response (the server sometimes returns the
    Page=268 chrome instead of raw EML). Strip scripts + external
    CSS links but keep inline <style> blocks. */
export function isFullHtmlPage(raw) {
  return /^\s*<!DOCTYPE|^\s*<html/i.test(raw || '');
}
export function stripPageChrome(raw) {
  return String(raw || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<link[^>]*>/gi, '');
}

/** Escape an arbitrary string into a <pre> fallback body. */
export function plainTextBody(raw, cap = 12000) {
  const safe = String(raw || '').slice(0, cap)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<pre style="white-space:pre-wrap;font:13px/1.5 monospace;margin:0;">${safe}</pre>`;
}

/* ── Quoted-thread splitting ──────────────────────────────────
   Outlook wraps each quoted prior message in a
   <div id="divRplyFwdMsg"> whose leading text is a bold header
   block (From: / Sent: / To: / Subject:). Splitting the HTML on
   that divider turns a single flat reply blob into a real thread:
   the top segment is the new reply, each following segment is one
   older message we can render as its own collapsible card. */

/** Pull From/Sent/To/Subject out of a quoted header block. Tag-
   agnostic: Outlook wraps the labels differently across versions
   (<b>From:</b>, <b><span>From:</span></b>, <span style=bold>…</span>),
   so we anchor on the ">Label:" text and read the value up to the
   next <br> / block close, stripping markup + entities. */
function quotedHeader(segment) {
  const head = segment.slice(0, 1600);
  const grab = (label) => {
    const idx = head.search(new RegExp('>\\s*' + label + '\\s*:', 'i'));
    if (idx === -1) return '';
    const after = head.slice(idx + 1); // skip the leading '>'
    const end = after.search(/<br|<\/p>|<\/div>/i);
    return (end === -1 ? after : after.slice(0, end))
      .replace(/<[^>]+>/g, '')
      .replace(new RegExp('^\\s*' + label + '\\s*:\\s*', 'i'), '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .trim();
  };
  return { from: grab('From'), sent: grab('Sent') || grab('Date'), to: grab('To'), subject: grab('Subject') };
}

/* A "From:" label that starts a quoted-reply header, matched
   independent of the wrapping element (<b>, <b><span>, <span
   style=bold>, …) by anchoring on the ">From:" text. */
const FROM_LABEL = />\s*From\s*:/gi;

/* Find the byte offsets where each quoted message begins. Anchor on
   a From: label, confirm it's a real header (a Sent:/Date: AND a
   Subject: label follow close behind — also tag-agnostic), then walk
   back to the opening of the enclosing block (<div>/<p>) so the split
   lands on a clean element boundary rather than mid-tag. */
function findQuoteBoundaries(html) {
  const bounds = [];
  let m;
  FROM_LABEL.lastIndex = 0;
  while ((m = FROM_LABEL.exec(html)) !== null) {
    const win = html.slice(m.index, m.index + 900);
    if (!/>\s*(Sent|Date)\s*:/i.test(win) || !/>\s*Subject\s*:/i.test(win)) continue;
    const before = html.slice(0, m.index);
    const start = Math.max(before.lastIndexOf('<div'), before.lastIndexOf('<p'));
    bounds.push(start >= 0 ? start : m.index);
  }
  return [...new Set(bounds)].sort((a, b) => a - b);
}

/**
 * Split a reply's HTML body into thread messages, newest first.
 * Returns null when there's no quoted history (single message).
 * Each entry: { quoted, bodyHtml, from?, sent?, to?, subject? }.
 * The top (index 0) entry carries the live reply content; the caller
 * fills its from/date from the EML headers.
 */
export function splitThreadHtml(html) {
  if (!html) return null;
  const bounds = findQuoteBoundaries(html);
  if (bounds.length === 0) return null;
  const cuts = [0, ...bounds, html.length];
  const messages = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const seg = html.slice(cuts[i], cuts[i + 1]);
    if (i === 0) messages.push({ quoted: false, bodyHtml: seg });
    else messages.push({ quoted: true, bodyHtml: stripHeaderBlock(seg), ...quotedHeader(seg) });
  }
  return messages.length > 1 ? messages : null;
}

/* Each quoted segment starts at the header block's opening element.
   Drop everything up to and including the block element that closes
   right after the Subject: value, leaving just the quoted body. */
function stripHeaderBlock(seg) {
  const subjIdx = seg.search(/<b[^>]*>\s*Subject\s*:/i);
  if (subjIdx === -1) return seg;
  const rest = seg.slice(subjIdx);
  const closeM = rest.match(/<\/(div|p)>/i);
  if (!closeM) return seg;
  return seg.slice(subjIdx + closeM.index + closeM[0].length);
}
