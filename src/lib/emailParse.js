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

const RPLY_DIVIDER = /<div\b[^>]*\bid\s*=\s*3?D?"?divRplyFwdMsg[^>]*>/i;
const RPLY_DIVIDER_G = /<div\b[^>]*\bid\s*=\s*3?D?"?divRplyFwdMsg[^>]*>/gi;

/** Pull From/Sent/To/Subject out of a quoted header block. */
function quotedHeader(segment) {
  const head = segment.slice(0, 1200);
  const grab = (label) => {
    const m = head.match(new RegExp('<b>\\s*' + label + '\\s*:?\\s*</b>([\\s\\S]*?)(?:<br|</font|</div|</p)', 'i'));
    if (!m) return '';
    return m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .trim();
  };
  return { from: grab('From'), sent: grab('Sent'), to: grab('To'), subject: grab('Subject') };
}

/**
 * Split a reply's HTML body into thread messages, newest first.
 * Returns null when there's no quoted history (single message).
 * Each entry: { quoted, bodyHtml, from?, sent?, to?, subject? }.
 * The top (index 0) entry has quoted:false and carries the live
 * reply content; the caller fills its from/date from the EML
 * headers.
 */
export function splitThreadHtml(html) {
  if (!html || !RPLY_DIVIDER.test(html)) return null;
  const pieces = html.split(RPLY_DIVIDER_G);
  // pieces[0] = live reply; pieces[1..] = quoted segments. Each quoted
  // segment begins INSIDE its divRplyFwdMsg <div> (the header block),
  // so we pull the From/Sent/To/Subject out into fields and strip the
  // header div from the rendered body — otherwise that metadata
  // duplicates into the message body (the "second email still shows
  // the metadata" bug).
  const messages = [{ quoted: false, bodyHtml: pieces[0] }];
  for (let i = 1; i < pieces.length; i++) {
    const seg = pieces[i];
    messages.push({ quoted: true, bodyHtml: stripHeaderDiv(seg), ...quotedHeader(seg) });
  }
  return messages;
}

/* The segment starts immediately after the divRplyFwdMsg opening
   tag, so we're at <div> depth 1. Walk div open/close tags until the
   depth returns to 0 — that closes the header block — and return only
   what follows (the actual quoted body). */
function stripHeaderDiv(seg) {
  let depth = 1;
  const re = /<\/?div\b[^>]*>/gi;
  let m;
  while ((m = re.exec(seg))) {
    if (m[0][1] === '/') depth -= 1; else depth += 1;
    if (depth === 0) return seg.slice(re.lastIndex);
  }
  return seg;
}
