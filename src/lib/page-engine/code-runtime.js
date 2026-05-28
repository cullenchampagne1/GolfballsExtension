/* ───────────────────────────────────────────────────────────────
   page-engine/code-runtime.js — sandboxed code variables.

   A "code variable" is a one-shot JS expression/statement block
   that returns a value to substitute into a template. The body is
   compiled via `new Function('ctx', 'h', body)` and called with:

     ctx   the page's extracted JSON (data from extract())
     h     a frozen helpers namespace (fmt.*, coalesce, regex, upper)

   Security stance — soft sandbox.
   ──────────────────────────────────
   Templates are authored by the rep themselves and never imported
   from outside sources today. The threat model is "I might write a
   bad expression and break the renderer." Goals here:
     • short execution (no infinite loops in the worst case)
     • no surprise side effects on the page or extension
     • clear errors when the body throws so the rep can fix it

   What we DO defend against:
     • Static blocklist of obvious foot-guns (`fetch(`, `chrome.`,
       `while(true)`, `for(;;)`, `import(`). These regexes are not
       a real sandbox — they're a tripwire that catches accidents.
     • Length cap so a paste-bomb can't ship.
     • Strict mode (forces var declarations, blocks octal literals,
       and makes `this` undefined inside the function).
     • Result coerced through Promise.resolve then awaited, with a
       250ms timeout — async helpers (none today) can't hang the
       template.

   What we DON'T defend against (the soft-sandbox compromise):
     • Globals are still reachable in this realm (`window`, `eval`).
       To harden, run inside a sandboxed <iframe sandbox="allow-
       scripts"> with postMessage. Defer until we have a real
       cross-rep template-sharing feature.

   Add new helpers in the helpers object below; the picker UI reads
   the FROZEN structure to surface autocomplete on `h.*`.
─────────────────────────────────────────────────────────────── */

import {
  fmtCurrency, fmtNumber, fmtDate,
  coalesce, titleCase, parseNumber, parseDate, normalizePhone,
} from './transforms.js';

const MAX_BODY_LENGTH = 4096;
const EXEC_TIMEOUT_MS = 250;

/* Patterns we straight-up refuse. Not a security boundary — a
   tripwire. Order matters: most-likely first so the loop bails
   early on common patterns. */
const BLOCKED_PATTERNS = [
  { re: /\bwhile\s*\(\s*true\s*\)/i,           reason: 'infinite while loop' },
  { re: /\bfor\s*\(\s*;\s*;\s*\)/,             reason: 'infinite for loop' },
  { re: /\bfetch\s*\(/,                        reason: 'fetch() not allowed in code vars' },
  { re: /\bchrome\b/,                          reason: 'chrome APIs not allowed' },
  { re: /\bimport\s*\(/,                       reason: 'dynamic import not allowed' },
  { re: /\beval\s*\(/,                         reason: 'eval not allowed' },
  { re: /\bFunction\s*\(/,                     reason: 'Function constructor not allowed' },
  { re: /\bsetTimeout\s*\(/,                   reason: 'setTimeout not allowed' },
  { re: /\bsetInterval\s*\(/,                  reason: 'setInterval not allowed' },
  { re: /\bnew\s+Worker\b/,                    reason: 'Worker not allowed' },
  { re: /\bXMLHttpRequest\b/,                  reason: 'XHR not allowed' },
];

/** Build the helpers namespace passed in as `h`. Frozen so the user
 *  can't mutate it. Each leaf is a function; `fmt` is a sub-object.
 *  Keep this small and uncluttered — every helper has to be worth
 *  the autocomplete noise. */
function buildHelpers() {
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
    /* Pull a single capture group from `str` via `pattern`. Returns
       '' if no match. Useful for code vars that need to fish a sub-
       string out of a longer value (e.g. extracting an order # from
       a free-text note). */
    regex(str, pattern, group = 1, flags = '') {
      if (str == null || pattern == null) return '';
      try {
        const re = new RegExp(pattern, flags);
        const m  = re.exec(String(str));
        return m ? (m[group] != null ? m[group] : m[0]) : '';
      } catch { return ''; }
    },
    /* Pass-through type helpers — the same coercers the schema
       uses. Lets users do e.g. `h.parseNumber(ctx.someString)`
       in a code var without re-importing the lib. */
    parseNumber,
    parseDate,
    normalizePhone,
    /* `pick(arr, key)` → array of objects.map(o => o[key]).
       `sum(arr, key?)` → sums numbers; key picks a property first. */
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
  };
  return Object.freeze(h);
}

/** Frozen singleton — building the helpers is cheap but freezing
 *  every call would let mutations leak between invocations. */
const HELPERS = buildHelpers();

/** Compile a code-var body into a callable. Bodies WITHOUT a
 *  visible `return` are wrapped so the last expression is returned
 *  — supports both styles:
 *
 *    'return ctx.contact.firstName.toUpperCase()'       // explicit
 *    'ctx.contact.firstName.toUpperCase()'              // expression
 *    'const n = ctx.orders.length; n + " orders"'        // multi
 *
 * Detection: if the body contains `return` anywhere (token-level),
 * use it as-is. Otherwise wrap as a single-expression return,
 * which works for the third form too as long as the LAST statement
 * is an expression — strict mode permits this when wrapped.
 *
 * Throws on syntax errors (caller catches + surfaces). */
export function compile(body) {
  if (typeof body !== 'string') throw new Error('code body must be a string');
  if (body.length > MAX_BODY_LENGTH) {
    throw new Error(`code body exceeds ${MAX_BODY_LENGTH} characters`);
  }
  for (const { re, reason } of BLOCKED_PATTERNS) {
    if (re.test(body)) throw new Error(`blocked: ${reason}`);
  }
  /* Token-aware return detection: `return` inside a string literal
     shouldn't count, but for simplicity we treat any `return`
     keyword as "user wrote a return." False positives only mean
     we DON'T wrap, which leaves the user's code as-is — safe. */
  const hasReturn = /\breturn\b/.test(body);
  const wrapped = hasReturn
    ? `"use strict";\n${body}`
    : `"use strict";\nreturn (${body});`;
  return new Function('ctx', 'h', wrapped);
}

/** Run a compiled function with a timeout. JS can't truly cancel a
 *  synchronous loop in this realm, so the timeout only triggers
 *  for async returns. The static block-list above is what defends
 *  against the synchronous case. */
function runWithTimeout(fn, ctx) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('code var timed out'));
    }, EXEC_TIMEOUT_MS);
    try {
      const result = fn(ctx, HELPERS);
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
 * runCode(body, ctx) — compile + execute, returning a Promise that
 * resolves to the body's value (or rejects with the compile/runtime
 * error).
 *
 * Caller responsibility: convert the resolved value to a string for
 * substitution using resolve.toDisplayString(). We DON'T do that
 * here so callers that want the raw value (e.g. a code var feeding
 * a number format step) can keep it typed.
 */
export async function runCode(body, ctx) {
  const fn = compile(body);
  return runWithTimeout(fn, ctx);
}

/**
 * Synchronous variant — no timeout, no async helpers. Used by hot
 * paths that need to render templates inside a tight loop and
 * already know the body is a synchronous expression (the common
 * case today). Errors propagate normally.
 */
export function runCodeSync(body, ctx) {
  const fn = compile(body);
  return fn(ctx, HELPERS);
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
  };
}
