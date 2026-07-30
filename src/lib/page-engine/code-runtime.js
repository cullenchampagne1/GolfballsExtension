/* ───────────────────────────────────────────────────────────────
   page-engine/code-runtime.js — sandboxed code variables.

   A "code variable" is a one-shot JS block that returns a string to
   substitute into a template. The body is compiled via Function /
   AsyncFunction and called with three arguments:

     ctx    the page's extracted JSON  (data from extract())
     vars   the variables resolved BEFORE this one (by varOrder), so
            a code var can build on earlier results — { name: value }
     h      a frozen helpers namespace — fmt.*, coalesce, regex, the
            approved read-only helpers (fetchText / fetchJson), and
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

   Security stance — isolated sandbox.
   ───────────────────────────────────
   Live extension execution happens in the manifest sandbox through
   sandbox-bridge.js. The threat model includes shared or malformed
   template code, so helper calls are capability-gated and read-only.
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

   Direct compilation exports remain for Node-based tests only. Browser
   callers must use page-engine.evaluateCode(), which uses the iframe.

   Add new helpers in buildHelpers() below; describeHelpers() mirrors
   the shape so the editor can surface `h.*` autocomplete.
─────────────────────────────────────────────────────────────── */

import {
  fmtCurrency, fmtNumber, fmtDate,
  coalesce, titleCase, parseNumber, parseDate, normalizePhone,
} from './transforms.js';
import { loadCatalog } from '../giftCatalog.js';
import { runEngine } from './runner.js';
import { assertCodeBodyAllowed, staticCheckCodeBody } from './code-precheck.js';

/* Async path only — server calls route through the background worker,
   so allow enough headroom for several slow CDN / Solr round-trips
   (e.g. the recommended-replacement recipe hits the catalog once per
   brand) while still capping a runaway promise. The sync path has no
   timeout (it can't await anything). */
const EXEC_TIMEOUT_MS = 10000;

/* AsyncFunction isn't a global binding — derive its constructor. */
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/* Fetch coalescing + short-lived cache, shared across every resolution.
   Variable resolution runs the full set repeatedly — the popup re-resolves
   on re-render, the editor previews each row, matching may re-run — and a
   code var that does h.fetchText(orderUrl) would otherwise re-request the
   SAME page on every pass, piling 20+ identical fetches through the one
   sandbox iframe until they time out. Keyed by URL: an in-flight request is
   shared, and a just-fetched result is reused for RAW_TTL_MS so a burst of
   resolutions costs ONE network request. */
const RAW_TTL_MS = 30000;
const _rawCache = new Map();     // url → { ts, ok, status, text, error }
const _rawInflight = new Map();  // url → Promise<entry>
const _parseCache = new Map();   // html → { schemaId, data } (avoids re-DOMParsing the same page)

/* Host allowlist for code-variable fetches (h.fetchText / h.fetchJson /
   h.product). The background fetchRaw handler enforces the same list — this
   layer is defense-in-depth and gives the code author a clear error instead
   of a generic network failure. A code var only ever needs first-party
   golfballs / icustomize / catalog hosts; anything else is treated as an
   accidental (or exfiltration) target and refused. */
function isAllowedCodeVarHost(url) {
  let host;
  try { host = new URL(String(url), 'https://www.golfballs.com').hostname.toLowerCase(); }
  catch { return false; }
  return /^(?:www|api|static)\.golfballs\.com$/.test(host)
      || /^(?:www|admin|master\.api|production-private-api)\.icustomize\.com$/.test(host)
      || /^(?:office|operations)\.gbcadmin\.com$/.test(host)
      || host === 'www.customizationapplications.com'
      || host === 's.customizationapps.com'
      || host === 'd1tp32r8b76g0z.cloudfront.net'
      || /(^|\.)hpgbrands\.com$/.test(host)
      || host === 'brmth7.a.searchspring.io'
      || host === 'snugzusa.com';
}

function fetchRawCached(send, url) {
  if (!isAllowedCodeVarHost(url)) {
    return Promise.resolve({ ts: Date.now(), ok: false, status: 0, text: '',
      error: 'blocked host — code variables may only fetch golfballs.com / icustomize.com and related catalog hosts' });
  }
  const cached = _rawCache.get(url);
  if (cached && (Date.now() - cached.ts) < RAW_TTL_MS) return Promise.resolve(cached);
  const existing = _rawInflight.get(url);
  if (existing) return existing;
  const p = send('fetchRaw', { url }).then((resp) => {
    const entry = { ts: Date.now(), ok: !!(resp && resp.ok), status: resp && resp.status, text: (resp && resp.text) || '', error: resp && resp.error };
    _rawCache.set(url, entry);
    _rawInflight.delete(url);
    return entry;
  });
  p.catch(() => _rawInflight.delete(url));
  _rawInflight.set(url, p);
  return p;
}

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
    const entry = await fetchRawCached(send, url);
    if (!entry.ok) throw new Error(entry.error || `fetch failed (status ${entry.status ?? '??'})`);
    return entry.text || '';
  };

  const fetchJson = async (url) => {
    const text = await fetchText(url);
    try { return JSON.parse(text); }
    catch { throw new Error('response was not valid JSON'); }
  };

  /* ── Gifting-catalog index (async, cached) ──────────────────────
     Search the live gifting catalog so a code variable can pull CURRENT
     prices — e.g. look up a previous order's item by name and quote
     today's price. loadCatalog() is paginated + cached in storage. */
  /* Catalog titles strip the brand and append promo / "– 2026 Model"
     tails, so derive cleaner names for copy. We sell more than balls,
     so KEEP the product type ("Golf Balls" / "Golf Towel" / …):
       label = brand + title-without-tails  → "Titleist Pro V1 High Number Golf Balls"
       short = product line only            → "Pro V1 High Number"        */
  const cleanBrand = (b) => String(b == null ? '' : b).replace(/\s+golf$/i, '').trim();  // "Callaway Golf" → "Callaway"
  const dropTails  = (t) => String(t == null ? '' : t).split(/\s+[–—-]\s+/)[0].replace(/\s{2,}/g, ' ').trim();
  const shortLine  = (t) => dropTails(t).replace(/\bgolf balls?\b/ig, '').replace(/\s{2,}/g, ' ').trim();
  const slimProduct = (p) => ({
    id: p.id, parentCode: p.parentCode, title: p.title, brand: p.brand,
    name:  `${p.brand ? p.brand + ' ' : ''}${p.title || ''}`.trim(),       // raw brand + raw title
    label: `${cleanBrand(p.brand)} ${dropTails(p.title)}`.trim(),          // "Titleist Pro V1 High Number Golf Balls"
    short: shortLine(p.title),                                             // "Pro V1 High Number"
    price: p.price, logo: p.logo, orig: p.orig,
    breaks: p.breaks, minQty: p.minQty, url: p.url,
    // sales-framework fields: category, deal/promo, sale flag, stock.
    // Catalog products are pulled with `-tag_ss:ExcludeStock`, so anything
    // IN the index is in stock for custom logo → inStock:true.
    cat: p.cat || '', promo: p.promo || null, tags: p.tags || [],
    onSale: !!(p.orig && p.price && p.orig > p.price),
    inStock: true,
  });
  /* Order-item names carry modifiers the catalog title doesn't ("Custom
     Logo", "Bulk", "Golf Balls"…), so an exact "all terms match" never
     hits. Instead: tokenize to whole words (so "v1" ≠ "v1x"), drop noise
     words, and SCORE each product by how many distinctive query words
     appear in its brand+title. Best score wins. */
  /* Generic noise only. Do NOT drop pack-size / variant words like
     "dozen", "double", "bulk", "box", "dz" — those are exactly what
     separate a "Double Dozen Box" or "Bulk" SKU (priced as a flat box /
     different basis) from the plain per-dozen item. Dropping them made
     the matcher tie on the line name and pick the wrong-priced variant. */
  const CATALOG_STOPWORDS = new Set([
    'golf', 'ball', 'balls', 'custom', 'logo', 'logos', 'personalized', 'print',
    'printed', 'imprint', 'imprinted', 'the', 'a', 'an', 'and', 'with',
    'for', 'of', 'model', 'pack', 'set', 'inch', 'new', 'design',
  ]);
  const catalogTokens = (s) => String(s == null ? '' : s)
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const catalogSearch = async (query, opts = {}) => {
    const limit = Math.max(1, Math.min(50, Number(opts.limit) || 10));
    const all = await loadCatalog();
    const rawTerms = catalogTokens(query);
    if (!rawTerms.length) return all.slice(0, limit).map(slimProduct);
    let terms = rawTerms.filter((t) => t.length > 1 && !CATALOG_STOPWORDS.has(t));
    if (!terms.length) terms = rawTerms; // query was ALL noise — fall back to it
    const need = Math.min(2, terms.length); // demand a real signal
    const scored = [];
    for (const p of all) {
      const words = new Set(catalogTokens(`${p.brand || ''} ${p.title || ''}`));
      let score = 0;
      for (const t of terms) if (words.has(t)) score += 1;
      if (score >= need) scored.push({ p, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => slimProduct(s.p));
  };
  const catalogFind = async (query) => {
    const r = await catalogSearch(query, { limit: 1 });
    return r[0] || null;
  };
  /* Backup price source for items NOT in the custom-logo catalog index.
     golfballs.com is a Next.js app — every product page embeds a
     <script id="__NEXT_DATA__"> JSON blob with the live product (ShortCode,
     Brand, itemFee price breaks, and the per-decoration ProductModification
     upcharges). We fetch the order item's product URL, read that, and return
     a product in the SAME slim shape as the catalog (logo-inclusive breaks,
     so priceAt gives the custom-logo unit price) — a drop-in fallback for the
     match chain. Returns null if the page has no product data. */
  const round2 = (n) => (n == null ? null : Math.round(Number(n) * 100) / 100);
  const fetchProduct = async (url) => {
    const u = String(url == null ? '' : url).trim();
    if (!u) return null;
    const resp = await fetchRawCached(send, u);
    if (!resp.ok || !resp.text) return null;
    const m = resp.text.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return null;
    let nd; try { nd = JSON.parse(m[1]); } catch { return null; }
    const p = nd && nd.props && nd.props.pageProps && nd.props.pageProps.product;
    if (!p) return null;
    const baseBreaks = ((p.itemFee_priceBreakHeader || {}).PriceBreak || [])
      .map((b) => ({ q: Number(b.Quantity) || 1, p: round2(b.Price) }))
      .filter((b) => b.p != null).sort((a, b) => a.q - b.q);
    // the "Custom Logo / Icon" decoration upcharge → add so the unit price matches what a logo order pays
    const logoMod = (p.ProductModification || []).find((mm) => /icon|custom logo|logo/i.test(((mm.Modification || {}).Name) || ''));
    const up = logoMod ? Number((((logoMod.itemFee_priceBreakHeader || {}).PriceBreak || [{}])[0] || {}).Price) || 0 : 0;
    const breaks = baseBreaks.map((b) => ({ q: b.q, p: round2(b.p + up) }));
    const availableQty = (p.inventory || []).reduce((s, i) => s + (Number(i.availableQty) || 0), 0);
    const brand = (p.Brand || {}).Name || '';
    // derive a readable title from the URL slug (the JSON Title is unreliable)
    const slug = u.split('?')[0].split('#')[0].split('/').pop()
      .replace(/\.html?$/i, '').replace(/[-_]+/g, ' ')
      .replace(/\bmodel\b/ig, '').replace(/\b20\d\d\b/g, '').replace(/\s{2,}/g, ' ').trim();
    const title = dropTails(slug);
    const label = `${cleanBrand(brand)} ${title}`.replace(/\s{2,}/g, ' ').trim();
    return {
      id: p.ShortCode || '', parentCode: p.ShortCode || '',
      brand, title, name: label, label, short: title,
      price: breaks.length ? breaks[0].p : (baseBreaks.length ? baseBreaks[0].p : null),
      logo: breaks.length ? breaks[0].p : null,
      breaks, minQty: (breaks[0] && breaks[0].q) || 1, url: u,
      cat: '', promo: null, tags: [], onSale: false,
      // REAL stock from the live page — this is the out-of-stock signal.
      availableQty, inStock: availableQty > 0,
    };
  };
  /* Exact lookup by the catalog's product id (doc.id) or parentCode.
     This is the ACCURATE path: an order line item's sku maps to a real
     product, so we never fuzzy-guess a same-named-but-different ball.
     Returns null when the id isn't in the index (caller then decides
     whether to fall back to a name search). */
  const catalogById = async (id) => {
    const key = String(id == null ? '' : id).trim().toLowerCase();
    if (!key) return null;
    const all = await loadCatalog();
    const hit = all.find((p) => {
      const pid = String(p.id == null ? '' : p.id).trim().toLowerCase();
      const pc  = String(p.parentCode == null ? '' : p.parentCode).trim().toLowerCase();
      return pid === key || pc === key;
    });
    return hit ? slimProduct(hit) : null;
  };
  /* Match by product-page URL — the most reliable join we have. The
     catalog `id` is a Solr GUID (not the order's SKU), but every product
     carries its `url`, and order line items carry the SAME product page
     URL. Compare PATH only (drop scheme/query/hash/trailing slash) so
     "…Supersoft-Golf-Balls-2025-Model.htm?p1=C&personalization=…" matches
     the catalog product's clean URL. Exact page = exact product. */
  const normUrl = (u) => {
    let s = String(u == null ? '' : u).trim().toLowerCase();
    if (!s) return '';
    s = s.split('#')[0].split('?')[0];          // drop query + hash
    s = s.replace(/^https?:\/\//, '').replace(/\/+$/, ''); // drop scheme + trailing slash
    return s;
  };
  const catalogByUrl = async (url) => {
    const key = normUrl(url);
    if (!key) return null;
    const all = await loadCatalog();
    let hit = all.find((p) => p.url && normUrl(p.url) === key);
    /* Tail fallback: same product, different category folder (e.g. an order
       links /accessories/…/x.htm but the catalog has /corporate/…/x.htm).
       Only trust it when the filename is UNIQUE in the catalog, so we never
       cross models (ball filenames carry the model year, so they stay
       distinct). */
    if (!hit) {
      const tail = key.split('/').pop();
      if (tail) {
        const sameTail = all.filter((p) => p.url && normUrl(p.url).split('/').pop() === tail);
        if (sameTail.length === 1) hit = sameTail[0];
      }
    }
    return hit ? slimProduct(hit) : null;
  };
  /* Generic primitive: take an HTML string, run it through the SAME page
     engine the live page uses (detect schema → extract), and return
     { schemaId, data }. This is a building block, not a feature — a code
     var fetches whatever page it wants with h.fetchText(url) and parses
     it here, so "read a customer's past order" is just:
       const { data } = await h.parse(await h.fetchText(order.href));
       data.order.items  // real skus, real quantities
     No order-specific URL or schema knowledge lives in the engine. */
  const parse = async (html, sourceUrl = '') => {
    if (typeof html !== 'string' || !html) return { schemaId: null, data: {} };
    const hit = _parseCache.get(html);
    if (hit) return hit;
    if (typeof DOMParser === 'undefined') throw new Error('DOMParser unavailable in this context');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    try { if (doc.body && sourceUrl) doc.body.dataset.gbSourceUrl = String(sourceUrl); } catch {}
    const result = runEngine(doc, { sourceUrl });
    const out = {
      schemaId: (result && result.schemaId) || null,
      data: (result && result.data) || {},
    };
    if (_parseCache.size > 8) _parseCache.clear();   // tiny cap — order pages are big strings
    _parseCache.set(html, out);
    return out;
  };
  /* Unit price for `qty` by walking a product's quantity price breaks
     ([{ q, p }] ascending). Falls back to the base price. */
  const catalogPriceAt = (product, qty = 1) => {
    const breaks = (product && Array.isArray(product.breaks)) ? product.breaks : [];
    if (!breaks.length) return product ? (product.price ?? null) : null;
    let price = breaks[0].p;
    for (const b of breaks) { if (qty >= b.q) price = b.p; }
    return price;
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
    /* ── Read-only server calls (async, background-routed) ── */
    fetchText,
    fetchJson,
    /* ── Run the page engine on an arbitrary HTML string (async) ── */
    parse,
    /* ── Live product (Next.js __NEXT_DATA__) by product URL (async) ── */
    product: fetchProduct,
    /* ── Gifting catalog index (async) ── */
    catalog: Object.freeze({
      search:  catalogSearch,
      find:    catalogFind,
      byId:    catalogById,
      byUrl:   catalogByUrl,
      priceAt: catalogPriceAt,
    }),
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
export function helpersFor(doc) {
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
  assertCodeBodyAllowed(body);
}

/** CSP-safe static validation (length + blocklist only — NO eval).
 *  The editor lints with this plus the parser's syntax tree because
 *  `new Function` is blocked on extension pages under MV3 CSP
 *  (script-src 'self'). Returns an error message, or null when the
 *  body passes the static checks. The real compile happens at
 *  resolution time, in the page context. */
export function staticCheck(body) {
  return staticCheckCodeBody(body);
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
  if (typeof window !== 'undefined') throw new Error('direct code compilation is disabled in browser contexts');
  return new Function('ctx', 'vars', 'h', wrapBody(body));
}

/** Compile an async code-var body. Same surface, but an AsyncFunction
 *  so the body can `await h.fetchJson(...)`. */
export function compileAsync(body) {
  precheck(body);
  if (typeof window !== 'undefined') throw new Error('direct code compilation is disabled in browser contexts');
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
    'h.fetchText':      { kind: 'fn', signature: 'async (url) → string  // GET via background (CORS/mixed-content immune)' },
    'h.fetchJson':      { kind: 'fn', signature: 'async (url) → parsed JSON' },
    'h.catalog.search':  { kind: 'fn', signature: 'async (query, { limit = 10 }) → [{ id, title, brand, name, label, short, price, logo, orig, breaks, minQty, url }]  // label="Titleist Pro V1 High Number Golf Balls", short="Pro V1 High Number"' },
    'h.catalog.find':    { kind: 'fn', signature: 'async (query) → first match | null' },
    'h.catalog.priceAt': { kind: 'fn', signature: '(product, qty = 1) → current unit price for that quantity (walks price breaks)' },
    'h.dom':            { kind: 'fn', signature: '(selector) → Element | null  // queries the live page DOM' },
    'h.domAll':         { kind: 'fn', signature: '(selector) → Element[]' },
    'h.domText':        { kind: 'fn', signature: '(selector) → trimmed text of first match | ""' },
    'h.doc':            { kind: 'var', signature: 'Document  // the page being resolved (advanced DOM access)' },
  };
}
