/* ───────────────────────────────────────────────────────────────
   page-engine/code-runtime.js — sandboxed code variables.

   A "code variable" is a one-shot JS block that returns a string to
   substitute into a template. The body is compiled via Function /
   AsyncFunction and called with three arguments:

     ctx    the page's extracted JSON  (data from extract())
     vars   the variables resolved BEFORE this one (by varOrder), so
            a code var can build on earlier results — { name: value }
     h      a frozen helpers namespace — fmt.*, coalesce, regex, the
            async server helpers (send / fetchText / fetchJson), and
            DOM access bound to the resolving page (dom / domAll /
            domText / doc)

   Sync vs async
   ─────────────
   • runCodeSync — compiles a plain Function. No timeout, no awaiting.
     For pure expressions over ctx/vars (the hot path: bulk email
     rendering loops). h.server() etc. won't work here.
   • runCode — compiles an AsyncFunction so the body can `await
     h.fetchJson(...)`. Timeout-guarded. This is the path for code
     that does server calls / multi-step logic.
   The resolver picks the async path when the variable def is marked
   `async` (the editor sets that when the body uses await / h.server).

   Security stance — soft sandbox.
   ──────────────────────────────────
   Templates are authored by the rep themselves and never imported
   from outside sources today. The threat model is "I might write a
   bad expression and break the renderer." Goals here:
     • short execution (timeout for the async path)
     • no surprise side effects on the page or extension
     • clear errors when the body throws so the rep can fix it

   What we DO defend against:
     • Static blocklist of obvious foot-guns (`fetch(`, `chrome.`,
       `while(true)`, `import(`, `eval(`). Privileged work goes
       through the sanctioned `h.*` helpers, so a correct body never
       contains these tokens — the blocklist only trips accidents.
     • Length cap so a paste-bomb can't ship.
     • Strict mode (forces var declarations, makes `this` undefined).
     • Async result awaited with a timeout so a hung server call
       can't freeze the resolution loop.

   What we DON'T defend against (the soft-sandbox compromise):
     • Globals are still reachable in this realm (`window`). To
       harden, run inside a sandboxed <iframe sandbox="allow-scripts">
       with postMessage. Defer until cross-rep template sharing.

   Add new helpers in buildHelpers() below; describeHelpers() mirrors
   the shape so the editor can surface `h.*` autocomplete.
─────────────────────────────────────────────────────────────── */

import {
  fmtCurrency, fmtNumber, fmtDate,
  coalesce, titleCase, parseNumber, parseDate, normalizePhone,
} from './transforms.js';

const MAX_BODY_LENGTH = 8192;
/* Async path only — server calls route through the background worker,
   so allow enough headroom for several slow CDN / Solr round-trips
   (e.g. the recommended-replacement recipe hits the catalog once per
   brand) while still capping a runaway promise. The sync path has no
   timeout (it can't await anything). */
const EXEC_TIMEOUT_MS = 10000;

/* AsyncFunction isn't a global binding — derive its constructor. */
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/* Patterns we straight-up refuse. Not a security boundary — a
   tripwire. Privileged work is the helpers' job, so a real body never
   needs these tokens. Order matters: most-likely first. */
const BLOCKED_PATTERNS = [
  { re: /\bwhile\s*\(\s*true\s*\)/i,           reason: 'infinite while loop' },
  { re: /\bfor\s*\(\s*;\s*;\s*\)/,             reason: 'infinite for loop' },
  { re: /\bfetch\s*\(/,                        reason: 'use h.fetchJson / h.fetchText instead of fetch()' },
  { re: /\bchrome\b/,                          reason: 'chrome APIs not allowed — use h.send()' },
  { re: /\bimport\s*\(/,                       reason: 'dynamic import not allowed' },
  { re: /\beval\s*\(/,                         reason: 'eval not allowed' },
  { re: /\bFunction\s*\(/,                     reason: 'Function constructor not allowed' },
  { re: /\bsetTimeout\s*\(/,                   reason: 'setTimeout not allowed' },
  { re: /\bsetInterval\s*\(/,                  reason: 'setInterval not allowed' },
  { re: /\bnew\s+Worker\b/,                    reason: 'Worker not allowed' },
  { re: /\bXMLHttpRequest\b/,                  reason: 'XHR not allowed' },
];

/** Build the helpers namespace passed in as `h`. Frozen so the user
 *  can't mutate it. The async server helpers route through the
 *  background service worker (CORS / mixed-content immune) and only
 *  work where chrome.runtime exists (content scripts + extension
 *  pages); elsewhere they reject cleanly. */
function buildHelpers() {
  /* Generic background-action call. Resolves to the worker's
     response object. Defined as a closure (not via `this`) so it
     survives destructuring: `const { send } = h`. */
  const send = (action, payload = {}) =>
    new Promise((resolve, reject) => {
      try {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
          reject(new Error('server calls are unavailable in this context'));
          return;
        }
        chrome.runtime.sendMessage({ action, ...payload }, (resp) => {
          const err = chrome.runtime.lastError;
          if (err) { reject(new Error(err.message)); return; }
          resolve(resp);
        });
      } catch (e) { reject(e); }
    });

  const fetchText = async (url) => {
    const resp = await send('fetchRaw', { url });
    if (!resp || !resp.ok) throw new Error(resp?.error || `fetch failed (status ${resp?.status ?? '??'})`);
    return resp.text || '';
  };

  const fetchJson = async (url) => {
    const text = await fetchText(url);
    try { return JSON.parse(text); }
    catch { throw new Error('response was not valid JSON'); }
  };

  const h = {
    fmt: Object.freeze({
      currency: fmtCurrency,
      number:   fmtNumber,
      date:     fmtDate,
      upper:    (s) => (s == null ? '' : String(s).toUpperCase()),
      lower:    (s) => (s == null ? '' : String(s).toLowerCase()),
      title:    titleCase,
    }),
    coalesce,
    /* Pull a single capture group from `str` via `pattern`. '' on no
       match. */
    regex(str, pattern, group = 1, flags = '') {
      if (str == null || pattern == null) return '';
      try {
        const re = new RegExp(pattern, flags);
        const m  = re.exec(String(str));
        return m ? (m[group] != null ? m[group] : m[0]) : '';
      } catch { return ''; }
    },
    /* Pass-through type helpers — the same coercers the schema uses. */
    parseNumber,
    parseDate,
    normalizePhone,
    /* `pick(arr, key)` → arr.map(o => o[key]); `sum(arr, key?)`. */
    pick(arr, key) {
      if (!Array.isArray(arr)) return [];
      return arr.map((o) => (o != null ? o[key] : null));
    },
    sum(arr, key) {
      if (!Array.isArray(arr)) return 0;
      let s = 0;
      for (const v of arr) {
        const n = key != null
          ? (v && typeof v === 'object' ? parseNumber(v[key]) : null)
          : (typeof v === 'number' ? v : parseNumber(v));
        if (n != null) s += n;
      }
      return s;
    },
    /* ── Server calls (async, background-routed) ── */
    send,
    fetchText,
    fetchJson,
  };
  return Object.freeze(h);
}

/** Frozen singleton of the doc-independent helpers (fmt, coalesce,
 *  regex, parsers, server). Per-call we extend this with DOM helpers
 *  bound to the document being resolved — see helpersFor(). */
const STATIC_HELPERS = buildHelpers();

/** Build the `h` namespace for one execution, binding the DOM helpers
 *  to `doc` (the document being resolved). On the page that's the live
 *  CRM DOM; in the editor's "Test on page" it's the order tab's DOM
 *  (resolution runs there). Falls back to the ambient `document`.
 *
 *  DOM access is the bridge that lets selector-based variables (OOS,
 *  recommended replacement) move into code today — before the order
 *  schema exists — by querying the DOM now and swapping to ctx.* once
 *  the engine extracts those fields. */
function helpersFor(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const domAll  = (sel) => (d ? Array.from(d.querySelectorAll(sel)) : []);
  const dom     = (sel) => (d ? d.querySelector(sel) : null);
  const domText = (sel) => {
    const el = d ? d.querySelector(sel) : null;
    return el ? (el.innerText || el.textContent || '').trim() : '';
  };
  return Object.freeze({ ...STATIC_HELPERS, doc: d, dom, domAll, domText });
}

/* Shared pre-compile validation: length + blocklist. Throws on the
   first problem (caller surfaces the message). */
function precheck(body) {
  if (typeof body !== 'string') throw new Error('code body must be a string');
  if (body.length > MAX_BODY_LENGTH) {
    throw new Error(`code body exceeds ${MAX_BODY_LENGTH} characters`);
  }
  for (const { re, reason } of BLOCKED_PATTERNS) {
    if (re.test(body)) throw new Error(`blocked: ${reason}`);
  }
}

/** CSP-safe static validation (length + blocklist only — NO eval).
 *  The editor lints with this plus the parser's syntax tree because
 *  `new Function` is blocked on extension pages under MV3 CSP
 *  (script-src 'self'). Returns an error message, or null when the
 *  body passes the static checks. The real compile happens at
 *  resolution time, in the page context. */
export function staticCheck(body) {
  if (typeof body !== 'string') return 'code body must be a string';
  if (body.length > MAX_BODY_LENGTH) return `code body exceeds ${MAX_BODY_LENGTH} characters`;
  for (const { re, reason } of BLOCKED_PATTERNS) {
    if (re.test(body)) return `blocked: ${reason}`;
  }
  return null;
}

/* Bodies WITHOUT a visible `return` are wrapped so the last
   expression is returned — supports `ctx.x.toUpperCase()` as well as
   `return ...`. `return` inside a string literal yields a false
   positive that only means we DON'T wrap (leaves the body as-is). */
function wrapBody(body) {
  const hasReturn = /\breturn\b/.test(body);
  return hasReturn
    ? `"use strict";\n${body}`
    : `"use strict";\nreturn (${body});`;
}

/** Compile a sync code-var body. `new Function('ctx','vars','h', …)`.
 *  Throws on syntax errors (caller catches + surfaces). */
export function compile(body) {
  precheck(body);
  return new Function('ctx', 'vars', 'h', wrapBody(body));
}

/** Compile an async code-var body. Same surface, but an AsyncFunction
 *  so the body can `await h.fetchJson(...)`. */
export function compileAsync(body) {
  precheck(body);
  return new AsyncFunction('ctx', 'vars', 'h', wrapBody(body));
}

/** Run a compiled fn with a timeout. JS can't cancel a synchronous
 *  loop in this realm, so the timeout only bites async returns; the
 *  blocklist defends the sync case. */
function runWithTimeout(fn, ctx, vars, h, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('code var timed out'));
    }, timeoutMs);
    try {
      const result = fn(ctx, vars, h);
      Promise.resolve(result).then(
        (v) => { if (settled) return; settled = true; clearTimeout(timer); resolve(v); },
        (e) => { if (settled) return; settled = true; clearTimeout(timer); reject(e); },
      );
    } catch (e) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    }
  });
}

/**
 * runCode(body, ctx, vars?, opts?) — compile (async) + execute,
 * returning a Promise that resolves to the body's value (or rejects
 * with the compile/runtime error). Use for code that may await
 * h.server / h.fetchJson.
 *
 * Caller stringifies via resolve.toDisplayString() — we keep the raw
 * value so a code var feeding a number-format step stays typed.
 */
export async function runCode(body, ctx, vars = {}, { timeoutMs = EXEC_TIMEOUT_MS, doc } = {}) {
  const fn = compileAsync(body);
  return runWithTimeout(fn, ctx, vars, helpersFor(doc), timeoutMs);
}

/**
 * Synchronous variant — no timeout, no awaiting. For hot paths that
 * already know the body is a synchronous expression over ctx/vars.
 * Errors propagate normally.
 */
export function runCodeSync(body, ctx, vars = {}, { doc } = {}) {
  const fn = compile(body);
  return fn(ctx, vars, helpersFor(doc));
}

/** Expose the helpers shape for the editor's autocomplete UI. */
export function describeHelpers() {
  return {
    'h.fmt.currency':   { kind: 'fn', signature: '(n, { currency, locale, max, min }) → string' },
    'h.fmt.number':     { kind: 'fn', signature: '(n, { locale, max, min }) → string' },
    'h.fmt.date':       { kind: 'fn', signature: '(input, pattern) → string  // pattern e.g. "M/d/yyyy"' },
    'h.fmt.upper':      { kind: 'fn', signature: '(s) → string' },
    'h.fmt.lower':      { kind: 'fn', signature: '(s) → string' },
    'h.fmt.title':      { kind: 'fn', signature: '(s) → string' },
    'h.coalesce':       { kind: 'fn', signature: '(...args) → first non-empty arg' },
    'h.regex':          { kind: 'fn', signature: '(str, pattern, group = 1, flags = "") → captured | ""' },
    'h.parseNumber':    { kind: 'fn', signature: '(v) → number | null' },
    'h.parseDate':      { kind: 'fn', signature: '(v) → ISO string | null' },
    'h.normalizePhone': { kind: 'fn', signature: '(v) → "+1XXXXXXXXXX"' },
    'h.pick':           { kind: 'fn', signature: '(arr, key) → arr of arr[i][key]' },
    'h.sum':            { kind: 'fn', signature: '(arr, key?) → number' },
    'h.send':           { kind: 'fn', signature: 'async (action, payload?) → background response  // calls a background worker action' },
    'h.fetchText':      { kind: 'fn', signature: 'async (url) → string  // GET via background (CORS/mixed-content immune)' },
    'h.fetchJson':      { kind: 'fn', signature: 'async (url) → parsed JSON' },
    'h.dom':            { kind: 'fn', signature: '(selector) → Element | null  // queries the live page DOM' },
    'h.domAll':         { kind: 'fn', signature: '(selector) → Element[]' },
    'h.domText':        { kind: 'fn', signature: '(selector) → trimmed text of first match | ""' },
    'h.doc':            { kind: 'var', signature: 'Document  // the page being resolved (advanced DOM access)' },
  };
}
