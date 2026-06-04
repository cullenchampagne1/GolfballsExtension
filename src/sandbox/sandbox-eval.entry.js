/* ───────────────────────────────────────────────────────────────
   sandbox-eval.entry.js — runs INSIDE a sandboxed iframe.

   MV3 forbids `new Function` (unsafe-eval) in the extension /
   content-script world, so code-variable bodies can't be compiled
   there. A manifest "sandbox" page is the one context that IS allowed
   unsafe-eval. The content-script bridge (page-engine/sandbox-bridge.js)
   frames this page, posts a code-var job, and we compile + run it here.

   Helpers:
     • pure ones (fmt, regex, coalesce, parsers, pick, sum,
       catalog.priceAt) run locally — imported / mirrored from
       page-engine/code-runtime.js (keep in sync).
     • privileged ones that need chrome or the page DOM (send,
       fetchText, fetchJson, catalog.search/find, domText) are PROXIED
       back to the bridge over postMessage and awaited.
     • h.dom / h.domAll return live Elements, which can't cross the
       realm boundary — they throw with a pointer to h.domText / ctx.*.

   Protocol (all messages carry `__gbSandbox`):
     bridge → here : { run, id, body, ctx, vars }
     here → bridge : { result, id, ok, value | error }
     here → bridge : { hcall, callId, jobId, path, args }   (privileged helper)
     bridge → here : { hresult, callId, ok, value | error }
     here → bridge : { ready }                               (on load)
─────────────────────────────────────────────────────────────── */

import {
  fmtCurrency, fmtNumber, fmtDate, coalesce, titleCase,
  parseNumber, parseDate, normalizePhone,
} from '../lib/page-engine/transforms.js';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const MAX_BODY_LENGTH = 8192;
const EXEC_TIMEOUT_MS = 10000;

/* Mirror of code-runtime.js BLOCKED_PATTERNS — keep in sync. */
const BLOCKED_PATTERNS = [
  { re: /\bwhile\s*\(\s*true\s*\)/i, reason: 'infinite while loop' },
  { re: /\bfor\s*\(\s*;\s*;\s*\)/,   reason: 'infinite for loop' },
  { re: /\bfetch\s*\(/,              reason: 'use h.fetchJson / h.fetchText instead of fetch()' },
  { re: /\bchrome\b/,                reason: 'chrome APIs not allowed — use h.send()' },
  { re: /\bimport\s*\(/,             reason: 'dynamic import not allowed' },
  { re: /\beval\s*\(/,               reason: 'eval not allowed' },
  { re: /\bsetTimeout\s*\(/,         reason: 'setTimeout not allowed' },
  { re: /\bsetInterval\s*\(/,        reason: 'setInterval not allowed' },
];
function precheck(body) {
  if (typeof body !== 'string') throw new Error('code body must be a string');
  if (body.length > MAX_BODY_LENGTH) throw new Error(`code body exceeds ${MAX_BODY_LENGTH} characters`);
  for (const { re, reason } of BLOCKED_PATTERNS) if (re.test(body)) throw new Error(`blocked: ${reason}`);
}
function wrapBody(body) {
  return /\breturn\b/.test(body) ? `"use strict";\n${body}` : `"use strict";\nreturn (${body});`;
}

/* ── pure helpers (mirror code-runtime) ── */
function regex(str, pattern, group = 1, flags = '') {
  if (str == null || pattern == null) return '';
  try { const m = new RegExp(pattern, flags).exec(String(str)); return m ? (m[group] != null ? m[group] : m[0]) : ''; }
  catch { return ''; }
}
function pick(arr, key) { return Array.isArray(arr) ? arr.map((o) => (o != null ? o[key] : null)) : []; }
function sum(arr, key) {
  if (!Array.isArray(arr)) return 0;
  let s = 0;
  for (const v of arr) {
    const n = key != null ? (v && typeof v === 'object' ? parseNumber(v[key]) : null) : (typeof v === 'number' ? v : parseNumber(v));
    if (n != null) s += n;
  }
  return s;
}
function catalogPriceAt(product, qty = 1) {
  const breaks = (product && Array.isArray(product.breaks)) ? product.breaks : [];
  if (!breaks.length) return product ? (product.price ?? null) : null;
  let price = breaks[0].p;
  for (const b of breaks) if (qty >= b.q) price = b.p;
  return price;
}

/* ── privileged-helper proxy plumbing ── */
let callSeq = 0;
const pending = new Map(); // callId → { resolve, reject }
function post(msg) { try { (window.parent || window).postMessage(msg, '*'); } catch { /* no parent */ } }

function makeProxy(jobId, path) {
  return (...args) => new Promise((resolve, reject) => {
    const callId = `c${++callSeq}`;
    pending.set(callId, { resolve, reject });
    post({ __gbSandbox: 'hcall', callId, jobId, path, args });
  });
}

function buildHelpers(jobId) {
  const fmt = Object.freeze({
    currency: fmtCurrency, number: fmtNumber, date: fmtDate,
    upper: (s) => (s == null ? '' : String(s).toUpperCase()),
    lower: (s) => (s == null ? '' : String(s).toLowerCase()),
    title: titleCase,
  });
  return Object.freeze({
    fmt, coalesce, regex, parseNumber, parseDate, normalizePhone, pick, sum,
    /* privileged → proxied to the bridge (which has chrome + DOM) */
    send:       makeProxy(jobId, 'send'),
    fetchText:  makeProxy(jobId, 'fetchText'),
    fetchJson:  makeProxy(jobId, 'fetchJson'),
    fetchOrder: makeProxy(jobId, 'fetchOrder'),
    catalog: Object.freeze({
      search:  makeProxy(jobId, 'catalog.search'),
      find:    makeProxy(jobId, 'catalog.find'),
      byId:    makeProxy(jobId, 'catalog.byId'),
      priceAt: catalogPriceAt,
    }),
    domText: makeProxy(jobId, 'domText'),
    dom:    () => { throw new Error('h.dom is unavailable in sandboxed code — use h.domText() or ctx.*'); },
    domAll: () => { throw new Error('h.domAll is unavailable in sandboxed code — use h.domText() or ctx.*'); },
  });
}

function runWithTimeout(fn, ctx, vars, h, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('code var timed out')); } }, timeoutMs);
    const finish = (kind, payload) => {
      if (settled) return; settled = true; clearTimeout(timer);
      kind === 'ok' ? resolve(payload) : reject(payload);
    };
    try { Promise.resolve(fn(ctx, vars, h)).then((v) => finish('ok', v), (e) => finish('err', e)); }
    catch (e) { finish('err', e); }
  });
}

async function runJob(id, body, ctx, vars) {
  try {
    precheck(body);
    const fn = new AsyncFunction('ctx', 'vars', 'h', wrapBody(body));
    const value = await runWithTimeout(fn, ctx || {}, vars || {}, buildHelpers(id), EXEC_TIMEOUT_MS);
    post({ __gbSandbox: 'result', id, ok: true, value });
  } catch (e) {
    post({ __gbSandbox: 'result', id, ok: false, error: (e && e.message) || String(e) });
  }
}

window.addEventListener('message', (ev) => {
  const m = ev.data;
  if (!m || m.__gbSandbox == null) return;
  if (m.__gbSandbox === 'run') { runJob(m.id, m.body, m.ctx, m.vars); return; }
  if (m.__gbSandbox === 'hresult') {
    const p = pending.get(m.callId);
    if (!p) return;
    pending.delete(m.callId);
    if (m.ok) p.resolve(m.value); else p.reject(new Error(m.error || 'helper failed'));
  }
});

post({ __gbSandbox: 'ready' });
