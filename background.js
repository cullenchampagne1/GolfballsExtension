// background.js
importScripts('security-policy.js', 'installation-auth.js', 'settings-registry.js', 'remote-settings-policy.js', 'crm-index-store.js', 'defaults.js');

const GB_SECURITY = globalThis.GBSecurity;
if (!GB_SECURITY) throw new Error('Security policy failed to initialize');

/**
 * Read a response without allowing an absent or dishonest Content-Length to
 * make the worker buffer an unbounded body. Callers choose a limit appropriate
 * to the endpoint; the stream is cancelled immediately when that limit is hit.
 */
async function gbReadBytesLimited(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('Response exceeds size limit');

  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error('Response exceeds size limit');
    return new Uint8Array(buffer);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Response exceeds size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function gbReadTextLimited(response, maxBytes) {
  return new TextDecoder().decode(await gbReadBytesLimited(response, maxBytes));
}

async function gbReadJsonLimited(response, maxBytes) {
  const text = await gbReadTextLimited(response, maxBytes);
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

function gbSerializeLimited(value, maxChars, label = 'Request') {
  let text;
  try { text = JSON.stringify(value); } catch { throw new Error(`${label} is not serializable`); }
  if (text.length > maxChars) throw new Error(`${label} exceeds size limit`);
  return text;
}

/* ── Proposal/Email debug interceptor ────────────────────────────────────────
   When devSettings['proposalDebug.enabled'] is on, wrap the worker's fetch and
   record bounded PROPOSAL- and EMAIL-submit request/response snippets and
   timing into chrome.storage.local. The in-page debug panel
   (content/proposal-debug) reads + lists them so the rep can copy any one and
   show exactly what differs vs the website. Capture is OFF by default and
   matches only the relevant endpoints (catalog/upload/image traffic is ignored).
   ─────────────────────────────────────────────────────────────────────────── */
const GB_DBG_KEY = 'gbProposalDebugLog';
const GB_DBG_MAX = 20;                 // bounded diagnostics, newest first
const GB_DBG_BODY_CAP = 100000;        // enough for shape comparison; limits PII retention
let gbDebugOn = false;
let gbDebugLog = [];
try {
  chrome.storage.local.get([GB_DBG_KEY, 'devSettings'], (d) => {
    gbDebugLog = Array.isArray(d && d[GB_DBG_KEY]) ? d[GB_DBG_KEY] : [];
    gbDebugOn = !!(d && d.devSettings && d.devSettings['proposalDebug.enabled']);
  });
} catch { /* */ }
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local') return;
  if (ch.devSettings) {
    gbDebugOn = !!(ch.devSettings.newValue && ch.devSettings.newValue['proposalDebug.enabled']);
    if (!gbDebugOn) {
      gbDebugLog = [];
      chrome.storage.local.remove(GB_DBG_KEY);
    }
  }
  // Keep the in-memory copy in sync when the panel clears the log.
  if (ch[GB_DBG_KEY] && Array.isArray(ch[GB_DBG_KEY].newValue)) gbDebugLog = ch[GB_DBG_KEY].newValue;
});
const _gbCap = (s) => (s == null ? null : (String(s).length > GB_DBG_BODY_CAP ? String(s).slice(0, GB_DBG_BODY_CAP) + '\n…[truncated]' : String(s)));
/* Classify a request → { cat: 'proposal'|'email', label } or null (ignore). */
function gbDebugClassify(url, bodyStr) {
  const u = String(url || '');
  if (bodyStr && bodyStr.indexOf('"emails"') !== -1) {
    try { const b = JSON.parse(bodyStr); if (b && Array.isArray(b.emails)) return { cat: 'email', label: 'Send Email — Power Automate' }; } catch { /* */ }
  }
  const P = [
    [/\/user\/saveProposal\b/i,         'Save Proposal → opportunity'],
    [/\/user\/saveCart\b/i,             'Save Cart'],
    [/\/user\/promotion\b/i,            'Apply Promotion'],
    [/\/user\/getCart\//i,              'Load Cart'],
    [/\/user\/getPackageUpsellData\b/i, 'Gift-set Upsell Data'],
    [/CreateProposalEmail/i,            'CRM · Create Proposal Email'],
    [/TrackProposal/i,                  'CRM · Track Proposal'],
    [/Opportunity\/Update/i,            'CRM · Update Opportunity'],
    [/Opportunity\/Get/i,               'CRM · Get Opportunity'],
  ];
  for (const [re, label] of P) if (re.test(u)) return { cat: 'proposal', label };
  return null;
}
function gbDebugPush(entry) {
  gbDebugLog.unshift(entry);
  if (gbDebugLog.length > GB_DBG_MAX) gbDebugLog.length = GB_DBG_MAX;
  try { chrome.storage.local.set({ [GB_DBG_KEY]: gbDebugLog }); } catch { /* */ }
}
/* Public helper so non-fetch handlers (openMailto) can record too. `source`
   distinguishes OUR requests ('extension') from the website's page requests
   ('website', forwarded from the MAIN-world hook) so they can be compared. */
function gbDebugRecord({ cat, label, method, url, reqBody, status, ok, respBody, error, started, source }) {
  if (!gbDebugOn) return;
  const t0 = started || Date.now();
  gbDebugPush({
    id: 'd' + t0 + '_' + Math.random().toString(36).slice(2, 6),
    ts: t0, durationMs: Math.max(0, Date.now() - t0),
    cat: cat || 'proposal', label: label || 'Request',
    method: method || 'GET', url: String(url || ''),
    reqBody: _gbCap(reqBody), status: status || 0, ok: !!ok,
    respBody: _gbCap(respBody), error: error ? String(error) : null,
    source: source || 'extension',
  });
}
const _gbOrigFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = function (url, opts) {
  if (!gbDebugOn) return _gbOrigFetch(url, opts);
  let reqUrl = url;
  try { if (url && typeof url === 'object' && url.url) reqUrl = url.url; } catch { /* */ }
  const bodyStr = (opts && opts.body != null) ? String(opts.body) : '';
  const cls = gbDebugClassify(reqUrl, bodyStr);
  if (!cls) return _gbOrigFetch(url, opts);
  const started = Date.now();
  const method = (opts && opts.method) || 'GET';
  return _gbOrigFetch(url, opts).then(async (resp) => {
    let txt = '';
    try { txt = await gbReadTextLimited(resp.clone(), GB_DBG_BODY_CAP); } catch { txt = '…[omitted: response exceeded diagnostic cap]'; }
    gbDebugRecord({ ...cls, method, url: reqUrl, reqBody: bodyStr || null, status: resp.status, ok: resp.ok, respBody: txt, started });
    return resp;
  }).catch((e) => {
    gbDebugRecord({ ...cls, method, url: reqUrl, reqBody: bodyStr || null, status: 0, ok: false, respBody: null, error: e, started });
    throw e;
  });
};

/* Remove retired diagnostics and OAuth state that must not survive an upgrade.
   The Graph reply experiment has no callers and its feature flag was retired;
   deleting its tokens avoids retaining bearer credentials for dead code. */
try {
  chrome.storage.local.remove(['gbVarsDebug', 'gbByUrlDebug', 'gbBulkDebug', 'gbGraphToken', 'gbGraphRefresh']);
  chrome.storage.session?.remove('gbGraphAccess');
} catch { /* no storage */ }

let editorWindowId   = null;
let guideTabId       = null;   // the Operator's Guide tab (guide.html) — focus-or-create

// ── Per-product customizer config helpers ────────────────────────────────────
// The real per-product options are driven by the product page's __NEXT_DATA__
// (product.ProductModification + product.ProductChild), NOT the corporate
// modificationName_ss facet. We fetch the product page and normalize that into
// a small config the modal renders from.
const GB_SIZE_RE = /^(one size|os|xxs|xs|s|m|l|xl|2xl|3xl|4xl|5xl|xxl|xxxl|small|medium|large|x-?large|\d{1,2}(\.\d)?)$/i;

// Every base-product input comes from product.PropertyProduct (each entry is a
// labelled property: Color, Size, Metal Finish, …). Falls back to grouping
// ProductChild variants if PropertyProduct is absent.
function gbExtractProperties(prod) {
  const props = prod.PropertyProduct || [];
  if (props.length) {
    return props.map((p) => ({
      label: p.Name || p.FriendlyName || 'Option',
      order: p.PropertyOrder || 0,
      options: (p.PropertyValueProduct || [])
        .slice()
        .sort((a, b) => (a.SortValue || a.PropertyOrder || 0) - (b.SortValue || b.PropertyOrder || 0))
        .map((v) => String(v.Value || '').trim())
        .filter(Boolean),
    })).filter((p) => p.options.length).sort((a, b) => a.order - b.order);
  }
  const byId = {};
  (prod.ProductChild || []).forEach((c) => (c.PropertyValueProduct || []).forEach((pv) => {
    if (pv.propertyProductID == null || !pv.Value) return;
    (byId[pv.propertyProductID] = byId[pv.propertyProductID] || []).push(String(pv.Value).trim());
  }));
  return Object.keys(byId).map((id) => ({ label: 'Option', order: 0, options: [...new Set(byId[id])] }));
}

function gbModOptionValues(mod, name) {
  const o = (mod.ModificationOption || []).find((o) => (o.Name || o.FriendlyName) === name);
  if (!o) return [];
  return (o.ModificationOptionValue || []).map((v) => v.FriendlyName || v.Name || v.Value).filter(Boolean);
}

// Per-child variants + their price. Many base options change the price without
// it living on the child's `Price` (often null) — e.g. golf tees price by "Tee
// Count" via each child's itemFeeModifier_priceBreakHeader ON TOP of the parent
// itemFee. Resolve: price = child.Price ?? (parent itemFee + child modifier).
// Returns [{ sku, values:{<propLabel>:<value>}, price, available }].
function gbExtractVariants(prod) {
  const round2 = (n) => Math.round(n * 100) / 100;
  const firstBreak = (h) => (h && Array.isArray(h.PriceBreak) && h.PriceBreak[0]) || null;
  const idToLabel = {};
  (prod.PropertyProduct || []).forEach((pp) => { idToLabel[pp.propertyProductID] = pp.Name || pp.FriendlyName || 'Option'; });
  const baseFee = firstBreak(prod.itemFee_priceBreakHeader);
  const base = baseFee != null ? (Number(baseFee.Price) || 0) : 0;
  return (prod.ProductChild || []).map((c) => {
    const values = {};
    (c.PropertyValueProduct || []).forEach((pv) => {
      const lbl = idToLabel[pv.propertyProductID];
      if (lbl) values[lbl] = String(pv.Value);
    });
    let price = c.Price != null ? Number(c.Price) : null;
    if (price == null) {
      const modBreak = firstBreak(c.itemFeeModifier_priceBreakHeader);
      price = modBreak != null ? round2(base + (Number(modBreak.Price) || 0)) : (base || null);
    }
    return { sku: c.ShortCode, values, price, available: c.AvailableForSale !== false };
  });
}

function gbNormalizeProductConfig(prod) {
  const mods = (prod.ProductModification || []).map((pm) => pm.Modification || {});
  const customLogo = mods.find((m) => /custom/i.test(m.Name || '') || /custom logo/i.test(m.FriendlyName || ''));
  const secondPole = mods.find((m) => /second pole/i.test((m.FriendlyName || '') + ' ' + (m.Name || '')));
  let cd = {}; try { cd = JSON.parse(prod.customData_s || '{}'); } catch { /* none */ }
  // Product-page authoritative second-pole suppression (Triple Track lines).
  const excludeDualPole = (prod.ProductTagDetail || []).some((t) => /ExcludeDualPole/i.test(t.Name || ''));
  const variants = gbExtractVariants(prod);
  const distinctPrices = new Set(variants.map((v) => v.price).filter((p) => p != null));
  return {
    itemType: (prod.itemType_ss && prod.itemType_ss[0]) || prod.ItemType || prod.itemType_s || '',
    properties: gbExtractProperties(prod),                                       // base inputs: Color, Size, Tee Count, …
    variants,                                                                    // per-child price by option selection
    priceVaries: distinctPrices.size > 1,                                        // does an option change the price?
    modifications: mods.map((m) => m.FriendlyName || m.Name).filter(Boolean),    // decoration blocks
    dualPole: (cd.variant === 'dualPole' || !!secondPole) && !excludeDualPole,   // → second-pole imprint
    excludeDualPole,                                                             // ExcludeDualPolePrinting tag → no second pole
    bundleItems: cd.bundleItems ? cd.bundleItems.split(',').map((s) => s.trim()).filter(Boolean) : null,
    shipping: customLogo ? gbModOptionValues(customLogo, 'Selected Shipping') : [],
    serviceLevel: customLogo ? gbModOptionValues(customLogo, 'Service Level')
      : (mods.map((m) => gbModOptionValues(m, 'Service Level')).find((a) => a.length) || []),
  };
}

// ── Product-config cache ─────────────────────────────────────────────────────
// ~1/3 of item types (towels, tees, bag tags, money clips, apparel, …) carry
// their base inputs ONLY on the product page, so the config fetch is load-bearing.
// Cache the normalized config per URL so reopens are instant and a flaky fetch
// falls back to the last-known config instead of dropping the inputs.
const GB_CONFIG_CACHE_KEY = 'gbProductConfigCache';
const GB_CONFIG_TTL_MS = 24 * 60 * 60 * 1000;
const GB_CONFIG_CACHE_MAX = 400;

function gbStorageGet(key) {
  return new Promise((resolve) => { try { chrome.storage.local.get(key, (d) => resolve((d && d[key]) || null)); } catch { resolve(null); } });
}
function gbStorageSet(key, val) { try { chrome.storage.local.set({ [key]: val }); } catch { /* ignore */ } }

function gbReadCredentials() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get('gbCredentials', (stored) => {
        const value = stored && stored.gbCredentials;
        resolve(value && typeof value === 'object' ? value : {});
      });
    } catch {
      resolve({});
    }
  });
}

// Normalize to an absolute golfballs.com product URL. A bare path resolves
// against the extension origin (chrome-extension://…/Golf-Balls/…) and 404s, so
// strip any such prefix and rebuild the real URL.
function gbProductUrl(url) {
  if (!url) return '';
  let u = String(url).replace(/^chrome-extension:\/\/[^/]+/i, '');
  if (/^https?:\/\//i.test(u)) return GB_SECURITY.isProductUrl(u) ? u : '';
  if (!u.startsWith('/')) u = '/' + u;
  if (!/\.html?($|[?#])/i.test(u)) u += '.htm';
  const resolved = 'https://www.golfballs.com' + u;
  return GB_SECURITY.isProductUrl(resolved) ? resolved : '';
}

// Raw product object (__NEXT_DATA__.props.pageProps.product) — the full shape
// the cart serializer needs (ProductChild, ProductModification, PropertyProduct,
// fee headers …). Large, so cached IN MEMORY for the service-worker lifetime
// only (re-fetched on restart); it's needed transiently at cart-save time, not
// worth persisting. Shared by the config fetch so we never double-fetch a page.
const GB_RAW_MAX = 60;
const gbRawCache = new Map(); // url -> prod (insertion-ordered → cheap LRU)

async function gbFetchProductPage(rawUrl) {
  const url = gbProductUrl(rawUrl);
  if (!url) throw new Error('No product URL');
  if (gbRawCache.has(url)) {                       // LRU touch
    const p = gbRawCache.get(url); gbRawCache.delete(url); gbRawCache.set(url, p); return p;
  }
  const r = await fetch(url, { headers: { Accept: 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' }, credentials: 'include', redirect: 'error' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const html = await gbReadTextLimited(r, 10_000_000);
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('__NEXT_DATA__ not found');
  const prod = JSON.parse(m[1])?.props?.pageProps?.product;
  if (!prod) throw new Error('No product in page data');
  gbRawCache.set(url, prod);
  if (gbRawCache.size > GB_RAW_MAX) gbRawCache.delete(gbRawCache.keys().next().value); // evict oldest
  return prod;
}

async function gbGetProductConfig(rawUrl) {
  const url = gbProductUrl(rawUrl);
  if (!url) throw new Error('No product URL');
  const cache = (await gbStorageGet(GB_CONFIG_CACHE_KEY)) || {};
  const hit = cache[url];
  if (hit && hit.config && (Date.now() - (hit.ts || 0)) < GB_CONFIG_TTL_MS) return hit.config;

  let prod;
  try {
    prod = await gbFetchProductPage(url);
  } catch (err) {
    if (hit && hit.config) return hit.config;   // stale-on-error: keep the last-known inputs
    throw err;
  }

  const config = gbNormalizeProductConfig(prod);
  cache[url] = { ts: Date.now(), config };
  const keys = Object.keys(cache);
  if (keys.length > GB_CONFIG_CACHE_MAX) {
    keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
    for (let i = 0; i < keys.length - GB_CONFIG_CACHE_MAX; i++) delete cache[keys[i]];
  }
  gbStorageSet(GB_CONFIG_CACHE_KEY, cache);
  return config;
}

// ── Custom-logo upload (runs at cart-save time, not during customization) ─────
// Mirrors the site's exact flow (reverse-engineered from the saveCart HAR):
//   1. PUT master.api.icustomize.com/user/upload {name,type} → presigned S3 URL
//   2. PUT <signedURL> the image bytes → S3 (Source/CustomerUploads/CustomLogo/…)
//   3. PUT /user/cropImage {userImage, url:<convert?fileName=…>} → cropped path
// The image we upload is our already-aligned, rotation-baked decal, so the
// fabric userImage is a centered placement (their crop is axis-aligned — no
// rotate — which is why we bake rotation into the pixels). Returns the pieces
// the cart line needs: { filePath, fileName, cropFilePath, userImage }.
/* icustomize's image-convert service, passed as the ?url= that /user/cropImage
   fetches. The '/dev/' segment is icustomize's API Gateway STAGE NAME (captured
   from the live golfballs.com traffic) — NOT our environment. Do not "fix" it to
   /prod/: there is no such stage and the crop would 404. */
const GB_CONVERT_URL = 'https://7uyieah5s5.execute-api.us-east-2.amazonaws.com/dev/convert';

// The fabric.js image object the cart stores (customUserImage.firstPole.userImage)
// AND that /user/cropImage consumes. `scale` is the print-area fill factor (the
// site used 0.41 of a 500-unit canvas); left/top center it. Tune if the decal
// sits wrong on the ball.
function gbLogoUserImage({ scale = 0.41, left = 250, top = 300, size = 500, src = '' } = {}) {
  return {
    type: 'image', version: '5.3.0', originX: 'center', originY: 'center',
    left, top, width: size, height: size,
    fill: 'rgb(0,0,0)', stroke: null, strokeWidth: 0, strokeDashArray: null, strokeLineCap: 'butt',
    strokeDashOffset: 0, strokeLineJoin: 'miter', strokeUniform: false, strokeMiterLimit: 4,
    scaleX: scale, scaleY: scale, angle: 0, flipX: false, flipY: false, opacity: 1,
    shadow: null, visible: true, backgroundColor: '', fillRule: 'nonzero', paintFirst: 'fill',
    globalCompositeOperation: 'source-over', skewX: 0, skewY: 0, cropX: 0, cropY: 0, src, crossOrigin: null, filters: [],
  };
}

async function gbUploadCustomLogo({ dataUrl, fileName = 'logo.png' }) {
  if (!dataUrl) throw new Error('No image data');
  const type = (/^data:([^;]+)/.exec(dataUrl) || [])[1] || 'image/png';
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' }[type.toLowerCase()] || 'png';
  const baseName = String(fileName || 'logo').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._ -]+/g, '_').trim().slice(0, 100) || 'logo';
  const safeFileName = `${baseName}.${extension}`;
  // 1. presign
  const sr = await fetch('https://master.api.icustomize.com/user/upload', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', sitekey: 'golfballs' },
    body: JSON.stringify({ name: safeFileName, type }),
    redirect: 'error',
  });
  if (!sr.ok) throw new Error('presign HTTP ' + sr.status);
  const signed = GB_SECURITY.parseHttpsUrl((await gbReadJsonLimited(sr, 1_000_000)).signedURL);
  if (!signed || !/(^|\.)s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/i.test(signed.hostname)) throw new Error('invalid upload URL returned');
  const filePath = signed.pathname.replace(/^\/static\.golfballs\.com\//, '').replace(/^\//, '');
  // 2. upload bytes to the presigned S3 URL (Content-Type MUST match what was signed)
  const blob = await (await fetch(dataUrl)).blob();
  const pr = await fetch(signed.href, { method: 'PUT', headers: { 'Content-Type': type }, body: blob, redirect: 'error' });
  if (!pr.ok) throw new Error('S3 PUT HTTP ' + pr.status);
  // 3. crop → cropFilePath (the overlay the ball renders)
  const publicUrl = 'https://static.golfballs.com/' + filePath;
  const userImage = gbLogoUserImage({ src: publicUrl });
  let cropFilePath = '';
  try {
    const cr = await fetch('https://master.api.icustomize.com/user/cropImage', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', sitekey: 'golfballs' },
      body: JSON.stringify({ userImage, url: GB_CONVERT_URL + '?fileName=' + publicUrl }),
      redirect: 'error',
    });
    if (cr.ok) cropFilePath = (await gbReadJsonLimited(cr, 1_000_000)).url || '';
  } catch (e) {
    /* Crop is best-effort; the upload and fabric still drive the cart. */
  }
  return { filePath, fileName: safeFileName, cropFilePath, userImage };
}

// ── Smarty address autocomplete: stamp the golfballs Referer ─────────────────
// golfballs.com's checkout uses Smarty US-Autocomplete-Pro with an embedded
// "website key" that's authorized by Referer/host. fetch() can't set Referer
// (it's a forbidden header), so a declarativeNetRequest rule forces the golfballs
// Referer + Origin onto our requests to that host — making them identical to the
// site's own calls. Re-applied on every worker startup (dynamic rules persist,
// but this keeps it self-healing).
const GB_SMARTY_RULE_ID = 9171;
function gbInstallSmartyHeaderRule() {
  if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateDynamicRules) return;
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [GB_SMARTY_RULE_ID],
    addRules: [{
      id: GB_SMARTY_RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'referer', operation: 'set', value: 'https://www.golfballs.com/' },
          { header: 'origin', operation: 'set', value: 'https://www.golfballs.com' },
        ],
      },
      condition: {
        urlFilter: '||us-autocomplete-pro.api.smartystreets.com/',
        resourceTypes: ['xmlhttprequest'],
      },
    }],
  }).catch(() => {});
}
gbInstallSmartyHeaderRule();
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(gbInstallSmartyHeaderRule);

// ── Seed default state on first install ──────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  gbInstallSmartyHeaderRule();
  if (reason !== 'install') return; // skip updates and browser_update

  // Only write keys that don't already exist — never overwrite user data
  chrome.storage.local.get(null, (existing) => {
    const toWrite = {};
    for (const [key, value] of Object.entries(GB_FACTORY_DEFAULTS)) {
      if (!(key in existing)) {
        toWrite[key] = value;
      }
    }
    if (Object.keys(toWrite).length) {
      chrome.storage.local.set(toWrite);
    }
  });
});

/**
 * Central message router for the extension background service worker.
 * Handles image proxying, calendar fetches/postbacks, iframe API calls,
 * proof-link generation, window management, and element-picker relay.
 * Every handler that performs async work must return `true` to keep the
 * message channel open until sendResponse is called.
 */

/* ── Repo import: HPG detail parser ───────────────────────────────────────────
   hpgbrands product pages embed their pricing as a base64 blob; find the run
   that decodes to the bulk-group config, then pull the net ladder / options out
   with regex (runs in the service worker — no DOMParser). Bound to the FIRST
   product region (the main one) by slicing to the 2nd net-ladder field. */
function gbParseHpgDetail(html) {
  let blob = '';
  const runs = html.match(/[A-Za-z0-9+/]{300,}={0,2}/g) || [];
  for (const r of runs) {
    try {
      const dec = new TextDecoder().decode(Uint8Array.from(atob(r), (c) => c.charCodeAt(0)));
      if (dec.includes('bulkgrp')) { blob = dec; break; }
    } catch (e) { /* not valid base64 */ }
  }
  if (!blob && html.includes('bulkgrp')) blob = html;       // some pages embed it directly
  if (!blob) return null;
  const b = blob.replace(/\\"/g, '"');                       // unescape JSON-in-string
  const KEY = '"name":"__bulkgrp-internal-net_net-standard-usd"';
  const first = b.indexOf(KEY);
  if (first < 0) return null;
  const second = b.indexOf(KEY, first + KEY.length);
  const region = b.slice(0, second > 0 ? second : b.length); // main product only
  const fieldVal = (name) => {
    const i = region.indexOf('"name":"' + name + '"');
    if (i < 0) return null;
    const m = region.slice(i, i + 4000).match(/"value":"([^"]*)"/);
    return m ? m[1] : null;
  };
  const ladder = (v, netOnly) => {
    const out = []; if (!v) return out;
    const rx = netOnly ? /\{(\d+)\|\|([\d.]+)\s*NET/g : /\{(\d+)\|\|\$?([\d.]+)/g;
    let m; while ((m = rx.exec(v))) out.push({ q: parseInt(m[1], 10), v: parseFloat(m[2]) });
    return out;
  };
  const opts = []; const seen = new Set();
  let m; const lr = /"label":"([^"]+)","selected"/g;
  while ((m = lr.exec(region))) { const l = m[1].trim(); if (l && !seen.has(l)) { seen.add(l); opts.push(l); } }
  return {
    net: ladder(fieldVal('__bulkgrp-internal-net_net-standard-usd'), true),
    pub: ladder(fieldVal('__bulk-Standard-usd'), false),
    eqp: parseFloat(fieldVal('search_EQP-Price-usd') || '') || null,
    moq: parseInt(fieldVal('search_MOQ') || '', 10) || null,
    weight: parseFloat(fieldVal('shipest_individual-weight') || '') || null,
    leadTime: fieldVal('search_production-time') || '',
    options: opts,
  };
}

/* ── Repo import: SnugZ helpers (injected into a hidden snugzusa.com iframe) ───
   SnugZ pricing is behind login and the site returns no CORS for credentialed
   cross-origin requests, so we drop a hidden snugzusa.com iframe in the page and
   run these IN that frame (MAIN world) — same-origin fetches that carry the SnugZ
   session. They take no outer-scope refs (chrome.scripting serializes them). */
function gbEnsureSnugzFrame(origin) {
  return new Promise((res) => {
    try {
      if (document.getElementById('__gb_snugz_frame')) { res(true); return; }
      const f = document.createElement('iframe');
      f.id = '__gb_snugz_frame';
      f.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:900px;opacity:0;border:0;pointer-events:none';
      f.addEventListener('load', () => res(true));
      f.src = origin + '/';
      document.body.appendChild(f);
      setTimeout(() => res(true), 12000);
    } catch (e) { res(false); }
  });
}
function gbSnugzCats(origin) {
  if (location.origin !== origin) return null;
  const set = new Set();
  document.querySelectorAll('a[href]').forEach((a) => {
    const m = (a.getAttribute('href') || '').match(/\/category\/([a-z0-9_-]+)/i);
    if (m) set.add('/category/' + m[1].toLowerCase());
  });
  return [...set];
}
async function gbSnugzFetchParse(origin, urls, kind) {
  if (location.origin !== origin) return null;
  const parseList = (html) => {
    const slugs = []; const seen = new Set(); const rx = /\/product\/([a-z0-9_.\-]+)/gi; let m;
    while ((m = rx.exec(html))) { const s = m[1].toLowerCase(); if (!seen.has(s)) { seen.add(s); slugs.push(s); } }
    return slugs;
  };
  const parseDetail = (html) => {
    const name = ((html.match(/<h1[^>]*>([^<]{2,160})<\/h1>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const sku = (html.match(/data-sku="([^"]+)"/i) || [])[1] || '';
    const image = (html.match(/https:\/\/media\.snugzusa\.com\/asset\/[A-Za-z0-9\-]+\/thumbnail\/webimage[^"' ,]+/i) || [])[0] || '';
    const tiers = []; const trx = /<strong>\s*([\d,]+)\s*<\/strong>[\s\S]{0,400}?tier_currency_price_USD"[^>]*>\s*\$?([\d.]+)/gi; let t;
    while ((t = trx.exec(html))) tiers.push([parseInt(t[1].replace(/,/g, ''), 10), parseFloat(t[2])]);
    let setup = 0; const srx = /data-setup="([\d.]+)"/gi; let s2;
    while ((s2 = srx.exec(html))) { const v = parseFloat(s2[1]); if (v > setup) setup = v; }
    const zipit = /data-zipit="1"/i.test(html);
    const opts = []; const oseen = new Set(); const orx = /data-sku_adj="([^"]+)"/gi; let o;
    while ((o = orx.exec(html))) { const l = o[1].trim(); if (l && !oseen.has(l)) { oseen.add(l); opts.push(l); } }
    return { name, sku, image, tiers, setup, zipit, options: opts };
  };
  const out = [];
  for (const u of urls) {
    try {
      const safe = new URL(String(u || ''), origin);
      if (safe.origin !== origin || !/^\/(?:category|product)\//i.test(safe.pathname)) {
        out.push({ url: String(u || ''), error: 'Blocked URL' });
        continue;
      }
      const r = await fetch(safe.href, { credentials: 'include', redirect: 'error' });
      if (Number(r.headers.get('content-length') || 0) > 3_000_000) throw new Error('Response exceeds size limit');
      const html = await r.text();
      if (html.length > 3_000_000) throw new Error('Response exceeds size limit');
      out.push(kind === 'list' ? { url: safe.href, slugs: parseList(html) } : { url: safe.href, detail: parseDetail(html) });
    } catch (e) { out.push({ url: u, error: String((e && e.message) || e) }); }
    await new Promise((z) => setTimeout(z, 120));
  }
  return out;
}

/* ── Bulk cost sync: persistent authed gbcadmin iframe + in-frame batch fetch ──
   One hidden office.gbcadmin.com iframe (reused across batches), inside which we
   credentialed-fetch Inventory.aspx?sku=X for a batch of SKUs (same-origin, so no
   CORS, cookies flow). We extract just the per-unit cost per SKU there and return
   { sku: cost|null } so we never ship hundreds of 7KB tables back to the page. */
function gbEnsureInvFrame(origin) {
  return new Promise((res) => {
    try {
      const ex = document.getElementById('__gb_cost_frame');
      if (ex) { res(ex.dataset.ready === '1'); return; }
      const f = document.createElement('iframe');
      f.id = '__gb_cost_frame';
      f.style.cssText = 'position:fixed;left:-10000px;top:0;width:1100px;height:760px;opacity:0;border:0;pointer-events:none';
      f.addEventListener('load', () => { f.dataset.ready = '1'; res(true); });
      f.src = origin + '/office/Dynamics/Inventory.aspx';
      document.body.appendChild(f);
      setTimeout(() => res(f.dataset.ready === '1'), 12000);
    } catch (e) { res(false); }
  });
}
async function gbInvFetchCosts(origin, skus) {
  if (location.origin !== origin) return null;
  // Canonical cost = first variant row (tr[id^="SKU-"]) whose first $-cell is > 0.
  // Falls back to the first $-value > 0 anywhere in the table if no id'd rows.
  const costFromHtml = (html, sku) => {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (/GenericErrorPage|aspxerrorpath|Login/i.test(doc.title || '')) return undefined; // auth bounce
      const money = (s) => { const m = /\$\s*([\d,]+\.?\d*)/.exec(s || ''); return m ? Number(m[1].replace(/,/g, '')) : null; };
      const pref = String(sku).toUpperCase() + '-';
      const rows = Array.from(doc.querySelectorAll('tr'));
      for (const tr of rows) {
        const id = (tr.getAttribute('id') || '').toUpperCase();
        if (!id.startsWith(pref)) continue;
        const cell = Array.from(tr.querySelectorAll('td,th')).map((c) => c.textContent).find((t) => /\$/.test(t));
        const c = money(cell);
        if (c && c > 0) return c;
      }
      // fallback: any $-value > 0 in the table
      for (const tr of rows) {
        for (const c of Array.from(tr.querySelectorAll('td,th'))) {
          const v = money(c.textContent);
          if (v && v > 0) return v;
        }
      }
      return null;
    } catch (e) { return null; }
  };
  const out = {};
  for (const sku of skus) {
    try {
      const r = await fetch('/office/Dynamics/Inventory.aspx?sku=' + encodeURIComponent(sku), { credentials: 'include', headers: { Accept: 'text/html,*/*' } });
      if (Number(r.headers.get('content-length') || 0) > 2_000_000) throw new Error('Response exceeds size limit');
      const html = await r.text();
      if (html.length > 2_000_000) throw new Error('Response exceeds size limit');
      const c = costFromHtml(html, sku);
      if (c === undefined) return { __auth: false };   // bounced to login — abort batch
      out[sku] = c;
    } catch (e) { out[sku] = null; }
    await new Promise((z) => setTimeout(z, 25));
  }
  return out;
}
/* In-frame fetch of a single SKU's full inventory table HTML (same-origin, so
   the gbcadmin session cookie flows). Returns { html }, { notFound:true } for a
   404 (SKU not in Dynamics), or { __auth:false } on a login bounce. */
async function gbInvFetchHtml(origin, sku) {
  if (location.origin !== origin) return null;
  try {
    const r = await fetch('/office/Dynamics/Inventory.aspx?sku=' + encodeURIComponent(sku), { credentials: 'include', headers: { Accept: 'text/html,*/*' } });
    if (r.status === 404) return { notFound: true };
    if (Number(r.headers.get('content-length') || 0) > 2_000_000) throw new Error('Response exceeds size limit');
    const html = await r.text();
    if (html.length > 2_000_000) throw new Error('Response exceeds size limit');
    if (/GenericErrorPage|aspxerrorpath/i.test(r.url || '') || /<title>[^<]*Login/i.test(html)) return { __auth: false };
    return { html };
  } catch (e) { return { error: String((e && e.message) || e) }; }
}
/* Resolve where to run the in-frame inventory fetches. PREFER a real first-party
   office.gbcadmin.com tab — its session cookie survives 3rd-party-cookie blocking
   (an embedded iframe under golfballs.com is a 3rd-party context and loads logged
   out). Fall back to a hidden iframe in the sender tab when no gbcadmin tab is
   open. Returns { tabId, allFrames, needFrame } or null. */
async function gbResolveInvTarget(sender) {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://office.gbcadmin.com/*' });
    if (tabs && tabs.length) {
      // Prefer a non-discarded tab; run in its top frame (first-party).
      const t = tabs.find((x) => !x.discarded) || tabs[0];
      return { tabId: t.id, allFrames: false, needFrame: false };
    }
  } catch (e) { /* tabs.query unavailable — fall through to iframe */ }
  const tabId = sender && sender.tab && sender.tab.id;
  if (tabId) return { tabId, allFrames: true, needFrame: true };
  return null;
}

/* Hosts the URL-taking proxies (fetchRaw / proxyFetchImage) may reach.
   These proxies fetch with the user's session cookies, so an arbitrary URL
   would let a malicious code-variable or injected frame exfiltrate CRM data
   (the request is sent — and any data in its query string leaked — even when
   CORS hides the response). Restricting to first-party data hosts closes that
   without affecting real callers (EmailRunner, image preview, code recipes all
   target these). Mirrors manifest host_permissions, minus the Microsoft OAuth
   endpoints, which are reached only by the dedicated graph/token handlers. */
function gbIsAllowedFetchUrl(url) {
  return GB_SECURITY.isAllowedFetchUrl(url);
}

function gbValidateEmailPayload(payload) {
  if (!payload || !Array.isArray(payload.emails) || payload.emails.length < 1 || payload.emails.length > 100) {
    return 'Email payload must contain 1–100 messages';
  }
  let serializedLength = 0;
  try { serializedLength = JSON.stringify(payload).length; } catch { return 'Email payload is not serializable'; }
  if (serializedLength > 12_000_000) return 'Email payload exceeds 12 MB limit';
  for (const email of payload.emails) {
    if (!email || typeof email !== 'object') return 'Invalid email record';
    if (typeof email.from !== 'string' || email.from.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.from)) {
      return 'Invalid sender address';
    }
    if (typeof email.to !== 'string' || email.to.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.to)) {
      return 'Invalid recipient address';
    }
    if (typeof email.subject !== 'string' || email.subject.length > 998) return 'Invalid email subject';
    if (typeof email.htmlBody !== 'string' || email.htmlBody.length > 2_000_000) return 'Email body exceeds 2 MB limit';
    if (/<\/?(?:script|iframe|object|embed|form|base|meta|link)\b|\bon[a-z]+\s*=|(?:javascript|vbscript)\s*:/i.test(email.htmlBody)) {
      return 'Email body contains active content';
    }
    if (email.attachments != null) {
      if (!Array.isArray(email.attachments) || email.attachments.length > 25) return 'Email has too many attachments';
      for (const attachment of email.attachments) {
        if (!attachment || typeof attachment !== 'object'
            || typeof attachment.name !== 'string' || attachment.name.length > 160
            || typeof attachment.contentType !== 'string' || attachment.contentType.length > 120
            || typeof attachment.contentBytes !== 'string'
            || !/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.contentBytes)) {
          return 'Email contains an invalid attachment';
        }
      }
    }
  }
  return null;
}

function gbValidateCalendarState(msg, includeEvent = false) {
  if (!GB_SECURITY.isCalendarUrl(msg && msg.url)) return 'Blocked calendar URL';
  const fields = ['viewState', 'viewStateGen', 'eventValidation'];
  for (const field of fields) {
    const value = msg && msg[field];
    if (typeof value !== 'string' || value.length > 5_000_000) return `Invalid ${field}`;
  }
  if (includeEvent) {
    if (!['ctl00$ApprovalDate', 'ctl00$DeviveryCommitment'].includes(msg.eventTarget)) return 'Blocked calendar event';
    if (!/^-?\d{1,15}$/.test(String(msg.eventArgument || ''))) return 'Invalid calendar date offset';
  }
  return null;
}

/* FIREFOX dynamic browser theme — content scripts can't call the theme API,
   so they send the computed colors here (the background owns the API). No-ops
   in Chrome, where `browser.theme` doesn't exist. */
try {
  if (typeof browser !== 'undefined' && browser.theme && browser.theme.update) {
    chrome.runtime.onMessage.addListener((msg, sender) => {
      let size = Infinity;
      try { size = JSON.stringify(msg && msg.colors).length; } catch { /* invalid */ }
      if (sender.id === chrome.runtime.id && msg && msg.type === 'gbBrowserTheme'
          && msg.colors && typeof msg.colors === 'object' && size <= 10_000) {
        try { browser.theme.update({ colors: msg.colors }); } catch (e) {}
      }
    });
  }
} catch (e) { /* no theme API */ }

const GB_SETTINGS_SHARE_ID_RE = /^[A-Za-z0-9_-]{32}$/;
function gbSettingsShareId(value) {
  const raw = String(value || '').trim();
  if (GB_SETTINGS_SHARE_ID_RE.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.origin !== 'https://api.cullenchampagne.com' || url.search || url.hash) return '';
    const match = url.pathname.match(/^\/extension\/settings-shares\/([A-Za-z0-9_-]{32})\/?$/);
    return match ? match[1] : '';
  } catch { return ''; }
}

function gbEmailTemplateShareId(value) {
  const raw = String(value || '').trim();
  if (GB_SETTINGS_SHARE_ID_RE.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.origin !== 'https://api.cullenchampagne.com' || url.search || url.hash) return '';
    const match = url.pathname.match(/^\/extension\/email-template-shares\/([A-Za-z0-9_-]{32})\/?$/);
    return match ? match[1] : '';
  } catch { return ''; }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  /* Only service messages from this extension's own contexts (content
     scripts, popup, editor). No externally_connectable is declared, so this
     is defense-in-depth: it fails safe if that ever changes and documents
     that page/other-extension senders are not trusted. */
  if (sender.id !== chrome.runtime.id || !msg || typeof msg !== 'object') return;

  // ── Managed-key encrypted CRM index ─────────────────────────────────────
  if (msg.action === 'crmIndexSearch') {
    GBCrmIndex.search({ query: msg.query, limit: msg.limit, employeeId: msg.employeeId })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Unable to search secure CRM index' }));
    return true;
  }
  if (msg.action === 'crmIndexPut') {
    GBCrmIndex.indexRecords(msg.records, msg.employeeId)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Unable to update secure CRM index' }));
    return true;
  }
  if (msg.action === 'crmIndexDelete') {
    GBCrmIndex.deleteRecord(msg.id, msg.employeeId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Unable to remove CRM index record' }));
    return true;
  }
  if (msg.action === 'crmIndexClear') {
    GBCrmIndex.clearIndex()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Unable to clear secure CRM index' }));
    return true;
  }

  // ── Installation-authenticated settings share service ───────────────────
  if (msg.action === 'settingsShareList') {
    GBInstallationAuth.apiJson('/extension/settings-shares')
      .then((payload) => sendResponse({ ok: true, shares: payload.shares || [] }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Unable to list settings shares' }));
    return true;
  }
  if (msg.action === 'emailTemplateShareCreate') {
    let body = '';
    try { body = JSON.stringify({ template: msg.template }); } catch { /* invalid */ }
    if (!msg.template || typeof msg.template !== 'object' || Array.isArray(msg.template)
        || body.length > 256_000) {
      sendResponse({ ok: false, error: 'Invalid email template' });
      return true;
    }
    GBInstallationAuth.apiJson('/extension/email-template-shares', {
      method: 'POST', body,
    }).then((share) => sendResponse({ ok: true, share }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Unable to share email template' }));
    return true;
  }
  if (msg.action === 'emailTemplateShareGet') {
    const shareId = gbEmailTemplateShareId(msg.url || msg.shareId);
    if (!shareId) { sendResponse({ ok: false, error: 'Enter a valid email template link' }); return true; }
    GBInstallationAuth.apiJson(`/extension/email-template-shares/${shareId}`)
      .then((share) => sendResponse({ ok: true, share }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Unable to load email template' }));
    return true;
  }
  if (msg.action === 'settingsShareCreate') {
    const name = typeof msg.name === 'string' ? msg.name.trim() : '';
    let body = '';
    try { body = JSON.stringify({ name, scopes: msg.scopes }); } catch { /* invalid payload */ }
    if (!name || name.length > 120 || !msg.scopes || typeof msg.scopes !== 'object'
        || Array.isArray(msg.scopes) || body.length > 512_000) {
      sendResponse({ ok: false, error: 'Invalid settings share' });
      return true;
    }
    GBInstallationAuth.apiJson('/extension/settings-shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).then((share) => sendResponse({ ok: true, share }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Unable to create settings share' }));
    return true;
  }
  if (msg.action === 'settingsShareGet') {
    const shareId = gbSettingsShareId(msg.url || msg.shareId);
    if (!shareId) { sendResponse({ ok: false, error: 'Enter a valid settings share URL' }); return true; }
    GBInstallationAuth.apiJson(`/extension/settings-shares/${shareId}`)
      .then((share) => sendResponse({ ok: true, share }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Unable to open settings share' }));
    return true;
  }
  if (msg.action === 'settingsShareRecordImport') {
    const shareId = gbSettingsShareId(msg.shareId);
    const scopeIds = Array.isArray(msg.scopeIds)
      ? [...new Set(msg.scopeIds.filter((id) => typeof id === 'string'))]
      : [];
    if (!shareId || scopeIds.length < 1 || scopeIds.length > 8) {
      sendResponse({ ok: false, error: 'Invalid settings share import' });
      return true;
    }
    GBInstallationAuth.apiJson(`/extension/settings-shares/${shareId}/imports`, {
      method: 'POST',
      body: JSON.stringify({ scope_ids: scopeIds }),
    }).then((share) => sendResponse({ ok: true, share }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Unable to retain imported settings share' }));
    return true;
  }
  if (msg.action === 'settingsShareRevoke') {
    const shareId = gbSettingsShareId(msg.shareId);
    if (!shareId) { sendResponse({ ok: false, error: 'Invalid settings share' }); return true; }
    GBInstallationAuth.apiJson(`/extension/settings-shares/${shareId}/revoke`, { method: 'POST' })
      .then(() => sendResponse({ ok: true, shareId }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Unable to revoke settings share' }));
    return true;
  }

  // ── Relay a message to all frames in the sender's tab ──────────────────────
  if (msg.action === 'broadcastToFrames' && msg.payload) {
    const tabId = sender?.tab?.id;
    const allowedActions = new Set([
      'GB_SALES_REP_FOUND', 'GB_EMPLOYEE_ID', 'GB_NOTIFY', 'GB_OPEN_CALENDAR',
      'GB_PUSH_DATES_AND_NOTE', 'GB_CALENDAR_STEP', 'GB_CALENDAR_DONE',
      'GB_CALENDAR_ERROR', 'GB_AUTO_PUSH_STEP', 'GB_DATES_PUSHED',
      'GB_AUTO_PUSH_ERROR', 'GB_CALENDAR_SAVE', 'GB_REQUEST_OPEN_CALENDAR',
    ]);
    let payloadSize = Infinity;
    try { payloadSize = JSON.stringify(msg.payload).length; } catch { /* invalid */ }
    if (!tabId || !allowedActions.has(msg.payload.action) || payloadSize > 20_000) {
      sendResponse({ ok: false, error: 'Invalid frame broadcast' }); return true;
    }
    chrome.tabs.sendMessage(tabId, msg.payload, { frameId: undefined }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }


  // ── 1. Image Proxy ─────────────────────────────────────────
  if (msg.action === 'proxyFetchImage' && msg.url) {
    // Image reads are restricted to the central HTTPS allowlist. Several render
    // endpoints require the signed-in session, so allowing arbitrary URLs here
    // would create a credentialed cross-origin request primitive.
    if (!gbIsAllowedFetchUrl(msg.url)) {
      sendResponse({ ok: false, error: 'Blocked URL' });
      return true;
    }
    fetch(msg.url, { credentials: 'include', redirect: 'error' })
      .then(async r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!/^image\/(?:png|jpe?g|gif|webp|bmp)$/i.test(type)) throw new Error('Response was not a supported image');
        const bytes = await gbReadBytesLimited(r, 15 * 1024 * 1024);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode.apply(null, bytes.slice(i, i + 8192));
        }
        sendResponse({ ok: true, dataUrl: `data:${type};base64,${btoa(binary)}` });
      })
      .catch(err => {
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }

  // ── 1b. Raw text/body fetch (email preview, API calls) ────────
  /**
   * Fetches a URL and returns its raw text body with the session cookies
   * included (credentials:'include'). Used by the email preview feature.
   */
  if (msg.action === 'fetchRaw' && msg.url) {
    if (!gbIsAllowedFetchUrl(msg.url)) { sendResponse({ ok: false, status: 0, text: '', error: 'Blocked URL' }); return true; }
    const method = String(msg.method || 'GET').toUpperCase();
    if (!['GET', 'POST'].includes(method)) {
      sendResponse({ ok: false, status: 0, text: '', error: 'Blocked method' });
      return true;
    }
    if (typeof msg.body === 'string' && msg.body.length > 2_000_000) {
      sendResponse({ ok: false, status: 0, text: '', error: 'Request body exceeds 2 MB limit' });
      return true;
    }
    if (method === 'POST' && !GB_SECURITY.isCrmCallLogUrl(msg.url)) {
      sendResponse({ ok: false, status: 0, text: '', error: 'Blocked POST endpoint' });
      return true;
    }
    const opts = { credentials: 'include', method };
    if (method === 'POST') {
      const contentType = msg.headers && (msg.headers['Content-Type'] || msg.headers['content-type']);
      if (!/^(?:application\/json|application\/x-www-form-urlencoded)(?:\s*;|$)/i.test(String(contentType || ''))) {
        sendResponse({ ok: false, status: 0, text: '', error: 'Blocked content type' });
        return true;
      }
      opts.headers = {
        Accept: 'application/json, text/html, */*',
        ...(contentType ? { 'Content-Type': String(contentType).slice(0, 120) } : {}),
      };
      if (msg.body != null) opts.body = String(msg.body);
    }
    opts.redirect = 'error';
    fetch(msg.url, opts)
      .then(async r => {
        const text = await gbReadTextLimited(r, 10_000_000);
        sendResponse({ ok: r.ok, status: r.status, text });
      })
      .catch(err => sendResponse({ ok: false, error: String((err && err.message) || err), text: '' }));
    return true;
  }

  // ── Address autocomplete (Smarty US-Autocomplete-Pro — golfballs' own feed) ──
  // A DNR rule stamps the authorized golfballs Referer. The browser key is
  // configured locally and deliberately kept out of source control/presets.
  if (msg.action === 'geocodeAddress' && typeof msg.q === 'string') {
    const q = msg.q.trim().slice(0, 160);
    if (q.length < 2) { sendResponse({ ok: true, suggestions: [] }); return true; }
    (async () => {
      const credentials = await gbReadCredentials();
      const key = typeof credentials.addressAutocompleteKey === 'string'
        ? credentials.addressAutocompleteKey.trim()
        : '';
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) {
        sendResponse({ ok: false, error: 'Address autocomplete key is not configured', suggestions: [] });
        return;
      }
      const params = new URLSearchParams({ key, search: q, max_results: '6' });
      if (msg.selected) params.set('selected', String(msg.selected).slice(0, 240));
      const url = `https://us-autocomplete-pro.api.smartystreets.com/lookup?${params}`;
      try {
        const response = await fetch(url, { credentials: 'omit', headers: { Accept: 'application/json' } });
        const data = response.ok ? await gbReadJsonLimited(response, 1_000_000).catch(() => ({})) : {};
        sendResponse({
          ok: response.ok,
          suggestions: Array.isArray(data && data.suggestions) ? data.suggestions.slice(0, 6) : [],
          error: response.ok ? undefined : `HTTP ${response.status}`,
        });
      } catch (error) {
        sendResponse({ ok: false, error: String(error), suggestions: [] });
      }
    })();
    return true;
  }

  // ── Inventory (office.gbcadmin.com) — MUST be SAME-ORIGIN to gbcadmin ──────
  // The Dynamics Inventory endpoint needs the gbcadmin session cookie AND returns
  // Access-Control-Allow-Origin:* — which the browser rejects for any credentialed
  // CORS request. So a background fetch (no session) and a page fetch from
  // api/www.golfballs.com (CORS-blocked) both fail. The only context that works is
  // SAME-ORIGIN to office.gbcadmin.com: we drop a hidden iframe pointed at the
  // Inventory URL (the iframe nav carries the session cookie), then read that
  // frame's own DOM via executeScript (same-origin → no CORS). Returns {ok,text}.
  if (msg.action === 'fetchInventory' && msg.sku) {
    const sku = String(msg.sku).trim();
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(sku)) {
      sendResponse({ ok: false, error: 'Invalid inventory SKU' });
      return true;
    }
    (async () => {
      try {
        const tgt = await gbResolveInvTarget(sender);
        if (!tgt) { sendResponse({ ok: false, error: 'No tab context for inventory request' }); return; }
        if (tgt.needFrame) {
          const ready = await chrome.scripting.executeScript({
            target: { tabId: tgt.tabId }, world: 'MAIN', func: gbEnsureInvFrame, args: ['https://office.gbcadmin.com'],
          });
          if (!(ready || []).some((r) => r && r.result)) {
            sendResponse({ ok: false, error: 'gbcadmin frame did not load — open office.gbcadmin.com in a tab and sign in, then retry.' });
            return;
          }
        }
        const r = await chrome.scripting.executeScript({
          target: { tabId: tgt.tabId, allFrames: tgt.allFrames }, world: 'MAIN',
          func: gbInvFetchHtml, args: ['https://office.gbcadmin.com', sku],
        });
        const hit = (r || []).map((x) => x && x.result).find((v) => v != null);
        if (!hit) { sendResponse({ ok: false, error: 'Inventory frame returned nothing (it may block embedding).' }); return; }
        if (hit.notFound) { sendResponse({ ok: true, text: '', notFound: true }); return; }
        if (hit.__auth === false) { sendResponse({ ok: false, error: 'Not signed in to office.gbcadmin.com — open it in a tab and sign in.' }); return; }
        if (hit.error) { sendResponse({ ok: false, error: hit.error }); return; }
        sendResponse({ ok: true, text: hit.html || '' });
      } catch (err) {
        sendResponse({ ok: false, error: String((err && err.message) || err) });
      }
    })();
    return true;
  }

  // ── CRM relay — credentialed GET/POST to api.golfballs.com admin endpoints ──
  // Drives the real proposal-email flow (CreateProposalEmail / TrackProposal /
  // Opportunity Get+Update) so an extension-generated proposal tracks exactly like
  // one made on the web. Host-locked to api.golfballs.com; cookies flow via
  // credentials:'include' (the rep is signed into the CRM). Returns raw text.
  if (msg.action === 'crmAjax' && msg.url) {
    const url = GB_SECURITY.parseHttpsUrl(msg.url);
    const method = String(msg.method || 'GET').toUpperCase();
    const body = msg.body == null ? null : String(msg.body);
    const contentType = String(msg.contentType || 'application/json').slice(0, 120);
    if (!url || url.hostname !== 'api.golfballs.com' || url.hash
        || !/^\/golfballs\/crm\/admin\//i.test(url.pathname)
        || !['GET', 'POST'].includes(method)
        || (method === 'GET' && body != null)
        || (body != null && body.length > 2_000_000)
        || !/^(?:application\/json|application\/x-www-form-urlencoded)(?:\s*;|$)/i.test(contentType)) {
      sendResponse({ ok: false, error: 'Blocked CRM request' });
      return true;
    }
    const opt = { method, credentials: 'include', redirect: 'error', headers: { Accept: 'application/json, text/html, */*' } };
    if (body != null) { opt.body = body; opt.headers['Content-Type'] = contentType; }
    fetch(url.href, opt)
      .then(async (r) => { const text = await gbReadTextLimited(r, 10_000_000); if (!r.ok) throw new Error('HTTP ' + r.status); sendResponse({ ok: true, text }); })
      .catch((err) => { sendResponse({ ok: false, error: String((err && err.message) || err) }); });
    return true;
  }

  // ── Bulk cost sync: fetch per-unit cost for a batch of SKUs ────────────────
  // Ensures the persistent authed gbcadmin iframe, then in-frame credentialed-
  // fetches Inventory.aspx for each SKU and returns { sku: cost|null }. The lib
  // calls this in chunks so it can report progress + cancel between batches.
  if (msg.action === 'fetchCosts' && Array.isArray(msg.skus)) {
    const skus = msg.skus.map((sku) => String(sku).trim());
    if (skus.length < 1 || skus.length > 100 || skus.some((sku) => !/^[A-Za-z0-9._-]{1,80}$/.test(sku))) {
      sendResponse({ ok: false, error: 'Invalid inventory SKU batch' });
      return true;
    }
    (async () => {
      try {
        const tgt = await gbResolveInvTarget(sender);
        if (!tgt) { sendResponse({ ok: false, error: 'No tab context for cost sync' }); return; }
        if (tgt.needFrame) {
          const ready = await chrome.scripting.executeScript({
            target: { tabId: tgt.tabId }, world: 'MAIN', func: gbEnsureInvFrame, args: ['https://office.gbcadmin.com'],
          });
          if (!(ready || []).some((r) => r && r.result)) {
            sendResponse({ ok: false, error: 'gbcadmin frame did not load — open office.gbcadmin.com in a tab and sign in, then retry.' });
            return;
          }
        }
        const r = await chrome.scripting.executeScript({
          target: { tabId: tgt.tabId, allFrames: tgt.allFrames }, world: 'MAIN',
          func: gbInvFetchCosts, args: ['https://office.gbcadmin.com', skus],
        });
        const hit = (r || []).map((x) => x && x.result).find((v) => v != null);
        if (!hit) { sendResponse({ ok: false, error: 'Cost frame returned nothing (it may block embedding).' }); return; }
        if (hit.__auth === false) { sendResponse({ ok: false, error: 'Not signed in to office.gbcadmin.com — open it in a tab and sign in, then retry.' }); return; }
        sendResponse({ ok: true, costs: hit });
      } catch (err) {
        sendResponse({ ok: false, error: String((err && err.message) || err) });
      }
    })();
    return true;
  }

  // ── Repo import: HPG detail (public page, parsed in the worker) ────────────
  // hpgbrands detail pages are ~540KB; parse the net-cost ladder, options, MOQ,
  // weight, lead time IN the worker so we never ship the whole page to the page.
  if (msg.action === 'hpgDetail' && msg.url) {
    const hpgUrl = GB_SECURITY.parseHttpsUrl(msg.url);
    if (!hpgUrl || !/(^|\.)hpgbrands\.com$/i.test(hpgUrl.hostname)) {
      sendResponse({ ok: false, error: 'Blocked HPG URL' });
      return true;
    }
    fetch(hpgUrl.href, { credentials: 'omit', redirect: 'error', headers: { Accept: 'text/html,*/*' } })
      .then(async (r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const html = await gbReadTextLimited(r, 3_000_000);
        sendResponse({ ok: true, data: gbParseHpgDetail(html) });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }

  // ── Repo import: SnugZ — ensure the authed iframe + scrape nav categories ──
  if (msg.action === 'snugzInit') {
    const tabId = sender && sender.tab && sender.tab.id;
    if (!tabId) { sendResponse({ ok: false, error: 'No tab context' }); return true; }
    (async () => {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: gbEnsureSnugzFrame, args: ['https://snugzusa.com'] });
        const r = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: 'MAIN', func: gbSnugzCats, args: ['https://snugzusa.com'] });
        const hit = (r || []).map((x) => x && x.result).find(Boolean);
        if (!hit || !hit.length) { sendResponse({ ok: false, error: 'snugzusa.com frame did not load / no categories — sign in to SnugZ in a tab (it may also block embedding).' }); return; }
        sendResponse({ ok: true, categories: hit });
      } catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
    })();
    return true;
  }

  // ── Repo import: SnugZ — fetch + parse a batch of URLs in the authed iframe ─
  if (msg.action === 'snugzFetch' && Array.isArray(msg.urls)) {
    if (!['list', 'detail'].includes(msg.kind) || msg.urls.length < 1 || msg.urls.length > 50 || msg.urls.some((url) => {
      const parsed = GB_SECURITY.parseHttpsUrl(url);
      return !parsed || !/(^|\.)snugzusa\.com$/i.test(parsed.hostname);
    })) {
      sendResponse({ ok: false, error: 'Invalid SnugZ URL batch' });
      return true;
    }
    const tabId = sender && sender.tab && sender.tab.id;
    if (!tabId) { sendResponse({ ok: false, error: 'No tab context' }); return true; }
    (async () => {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: gbEnsureSnugzFrame, args: ['https://snugzusa.com'] });
        const r = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: 'MAIN', func: gbSnugzFetchParse, args: ['https://snugzusa.com', msg.urls, msg.kind || 'detail'] });
        const hit = (r || []).map((x) => x && x.result).find((v) => v != null);
        sendResponse({ ok: true, results: hit || [] });
      } catch (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); }
    })();
    return true;
  }

  // ── 2. Brand product catalog fetch (for recommended_replacement) ──
  // Loads /Golf-Balls/{slug}.html, extracts __NEXT_DATA__, returns Solr docs.
  if (msg.action === 'fetchBrandProducts' && msg.slug) {
    const slug = String(msg.slug).trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(slug)) {
      sendResponse({ ok: false, error: 'Invalid brand slug', products: [] });
      return true;
    }
    const url = `https://www.golfballs.com/Golf-Balls/${encodeURIComponent(slug)}.html`;
    fetch(url, {
      headers: { 'Accept': 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
      credentials: 'include',
      redirect: 'error',
    })
    .then(async r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const html = await gbReadTextLimited(r, 10_000_000);

      const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!m) throw new Error('__NEXT_DATA__ not found');

      const nextData = JSON.parse(m[1]);
      const page     = nextData?.props?.pageProps?.contentManagerPage?.page;
      const deps     = page?.dependencies;
      if (!Array.isArray(deps)) throw new Error('No dependencies array');

      let products = [];
      for (const dep of deps) {
        const docs = dep?.value?.response?.docs;
        if (Array.isArray(docs) && docs.length > 0) { products = docs; break; }
      }
      sendResponse({ ok: true, products: products.slice(0, 1_000) });
    })
    .catch(err => {
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  }

  // ── Corporate Gifting Catalog ──────────────────────────────────────
  // The custom-logo catalog is served by icustomize's Solr refinement
  // API (PUT, public `sitekey` header). Body mirrors the live
  // Custom-Logo page calls: full-catalog searchTerm, default sort, and
  // exclude out-of-stock via facetQueries.
  if (msg.action === 'fetchGiftCatalog' && msg.searchTerm) {
    const searchTerm = String(msg.searchTerm).trim();
    const start = Math.max(0, Math.min(100_000, Math.trunc(Number(msg.start) || 0)));
    const rows = Math.max(1, Math.min(200, Math.trunc(Number(msg.rows) || 60)));
    if (!searchTerm || searchTerm.length > 300) {
      sendResponse({ ok: false, error: 'Invalid catalog search', docs: [], numFound: 0 });
      return true;
    }
    // Static facet config the API requires (it iterates these — omitting
    // them 502s the backend). Lifted verbatim from the live page request.
    const GIFT_FACET_REQUEST = [{"name":"Brand","sort":"alphabetical","field":"brand_s","type":"field","alwaysShow":["Adidas","Bridgestone","Callaway Golf","FootJoy","Greg Norman","Nike","Taylor Made","Titleist","Wilson","Under Armour"]},{"name":"Item Type","field":"itemType_ss","type":"field","allowMultiValue":false},{"name":"Decoration","hide":true,"type":"field","field":"modificationName_ss","allowMultiValue":false}];
    const GIFT_FACET_QUERIES = [{"name":"Special Filters","options":[{"name":"Sleeve Kits","search":"tag_ss:CustomSleeveKits"},{"name":"Peter Millar Custom Logo Apparel","search":"tag_ss:PMPolos"},{"name":"Blue Cypress Buy 2 Get 1 Free","search":"tag_ss:bluecypress2and1"}],"type":"manual"},{"name":"Summer Outing Packages","options":[{"name":"Summer Essentials Package","search":"tag_ss:customPackageSummerEssentials"},{"name":"Elevated Summer Essentials","search":"tag_ss:customPackageSummerElevated"},{"name":"Tournament Package","search":"tag_ss:customPackageSummerTournament"},{"name":"After-The-Round Package","search":"tag_ss:customPackageSummerAfterRound"},{"name":"Vacation Package","search":"tag_ss:customPackageSummerVacation"},{"name":"Travel Package","search":"tag_ss:customPackageSummerTravel"},{"name":"Bachelor Party Package","search":"tag_ss:customPackageSummerParty"},{"name":"Family & Friends Package","search":"tag_ss:customPackageSummerFamily"},{"name":"The Host Package","search":"tag_ss:customPackageSummerHost"},{"name":"Executive Retreat Package","search":"tag_ss:customPackageSummerExecutive"}],"type":"manual"},{"name":"Catalog Collections","options":[{"name":"Essentials","search":"tag_ss:customEssentials"},{"name":"Trending Products","search":"tag_ss:customTrending"},{"name":"Corporate Gifting","search":"tag_ss:customCorpGift"},{"name":"Corporate Swag","search":"tag_ss:customSwag"},{"name":"Tournaments & Events","search":"tag_ss:customTournament"}],"type":"manual"},{"name":"Tournaments Categories","options":[{"name":"Golf Balls","search":"tag_ss:customLPTournamentsGolfBalls"},{"name":"Hats & Apparel","search":"tag_ss:customLPTournamentsApparel"},{"name":"On-Course Essentials","search":"tag_ss:customLPTournamentsEssentials"},{"name":"Player Gift Packs","search":"tag_ss:customLPTournamentsGiftPacks"},{"name":"Event Branding Gear","search":"tag_ss:customLPTournamentsBranding"},{"name":"Cooler Bags & Drinkware","search":"tag_ss:customLPTournamentsDrinkware"}],"type":"manual"},{"name":"Corporate Gifting Categories","options":[{"name":"Premium Golf Balls & Gift Sets","search":"tag_ss:customLPGiftGolfBalls"},{"name":"Executive Travel Gear","search":"tag_ss:customLPGiftTravel"},{"name":"Luxury Drinkware & Barware","search":"tag_ss:customLPGiftDrinkware"},{"name":"Lifestyle Accessories","search":"tag_ss:customLPGiftAccessories"},{"name":"Curated Gift Boxes","search":"tag_ss:customLPGiftGiftBoxes"},{"name":"High-End Apparel","search":"tag_ss:customLPGiftApparel"}],"type":"manual"},{"name":"Corporate Swag Categories","options":[{"name":"Golf Balls","search":"tag_ss:customLPSwagGolfBalls"},{"name":"Branded Apparel","search":"tag_ss:customLPSwagApparel"},{"name":"Bags & Packs","search":"tag_ss:customLPSwagBags"},{"name":"Drinkware","search":"tag_ss:customLPSwagDrinkware"},{"name":"Travel Gear","search":"tag_ss:customLPSwagTravel"},{"name":"Office & Tech Accessories","search":"tag_ss:customLPSwagAccessories"}],"type":"manual"}];
    const body = JSON.stringify({
      solrQuery: {
        queryType: 'select',
        start,
        rows: String(rows),
        sort: 'sort_default_i desc',
        searchTerm,
        facetRequest: GIFT_FACET_REQUEST,
        facetQueries: GIFT_FACET_QUERIES,
        filterQuery: [],
      },
      additionalFacets: { facetFields: [], facetQueries: ['-tag_ss:ExcludeStock'] },
      pageKey: 'custom-logo',
    });
    fetch('https://master.api.icustomize.com/user/solr-refinement', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'sitekey': 'golfballs' },
      body,
      cache: 'no-store',   // never serve a CDN/proxy-cached price list on a manual refresh
      redirect: 'error',
    })
      .then(async r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await gbReadJsonLimited(r, 5_000_000);
        const resp = (j && j.response) || {};
        sendResponse({ ok: true, docs: Array.isArray(resp.docs) ? resp.docs.slice(0, rows) : [], numFound: Number(resp.numFound) || 0 });
      })
      .catch(err => {
        sendResponse({ ok: false, error: String(err), docs: [], numFound: 0 });
      });
    return true;
  }

  // ── Save a cart / proposal (PUT /user/saveCart) ────────────────────
  // The golfballs cart is server-side on the icustomize API (localStorage is
  // only a mirror). saveCart is unauthenticated — sitekey only, guest IDs —
  // and returns the human cart/proposal number. msg.body = { cartData,
  // customerID, salesRepID } built by src/lib/cartSerializer.js.
  if (msg.action === 'giftSaveCart' && msg.body) {
    let requestBody;
    try { requestBody = gbSerializeLimited(msg.body, 12_000_000, 'Cart request'); }
    catch (error) { sendResponse({ ok: false, error: error.message }); return true; }
    fetch('https://master.api.icustomize.com/user/saveCart', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'sitekey': 'golfballs' },
      body: requestBody,
      redirect: 'error',
    })
      .then(async r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await gbReadJsonLimited(r, 2_000_000);
        const d = (j && j.d) || {};
        sendResponse({ ok: true, cartNumber: d.cartNumber, cartID: d.cartID, message: d.success });
      })
      .catch(err => {
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }

  // ── Save a proposal to a CRM opportunity (PUT /user/saveProposal) ──────
  // Like saveCart, but the body also carries opportunityID + proposalName so the
  // saved cart is attached to the opportunity's MetaData.Proposals[]. sitekey-only
  // (no auth), msg.body built by src/lib/cartSerializer.buildSaveProposalBody.
  // Returns the raw parsed response (the saved cart GUID) so the caller can verify.
  if (msg.action === 'giftSaveProposal' && msg.body) {
    let requestBody;
    try { requestBody = gbSerializeLimited(msg.body, 12_000_000, 'Proposal request'); }
    catch (error) { sendResponse({ ok: false, error: error.message }); return true; }
    fetch('https://master.api.icustomize.com/user/saveProposal', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'sitekey': 'golfballs' },
      body: requestBody,
      redirect: 'error',
    })
      .then(async r => {
        const text = await gbReadTextLimited(r, 2_000_000);
        if (!r.ok) throw new Error('HTTP ' + r.status + (text ? ' — ' + text.slice(0, 200) : ''));
        let j = null; try { j = text ? JSON.parse(text) : null; } catch { j = text; }
        const d = (j && typeof j === 'object' && j.d !== undefined) ? j.d : j;
        const cartID = (d && typeof d === 'object') ? (d.cartID || d.ProposalCartID || d.id) : d;
        sendResponse({ ok: true, cartID, raw: j });
      })
      .catch(err => {
        sendResponse({ ok: false, error: String(err.message || err) });
      });
    return true;
  }

  // ── Apply / validate a promo code (PUT /user/promotion) ───────────────────
  // Given the cart items + a promo code, the icustomize promotion engine returns
  // the resolved discount: { totalDiscount, promo, promoType, unmetRequirements,
  // orderLevelDiscount, itemLevelDiscounts, freeItems, promoDescription, … }.
  // sitekey-only (no auth). msg.body built by src/lib/saveProposal.validatePromo.
  if (msg.action === 'applyPromotion' && msg.body) {
    let requestBody;
    try { requestBody = gbSerializeLimited(msg.body, 12_000_000, 'Promotion request'); }
    catch (error) { sendResponse({ ok: false, error: error.message }); return true; }
    fetch('https://master.api.icustomize.com/user/promotion', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'sitekey': 'golfballs' },
      body: requestBody,
      redirect: 'error',
    })
      .then(async r => {
        const text = await gbReadTextLimited(r, 2_000_000);
        if (!r.ok) throw new Error('HTTP ' + r.status + (text ? ' — ' + text.slice(0, 200) : ''));
        let j = null; try { j = text ? JSON.parse(text) : null; } catch { j = null; }
        const data = (j && typeof j === 'object' && j.d !== undefined) ? (typeof j.d === 'string' ? JSON.parse(j.d) : j.d) : j;
        sendResponse({ ok: true, promotion: data || null });
      })
      .catch(err => {
        sendResponse({ ok: false, error: String(err.message || err) });
      });
    return true;
  }

  // ── Gift-set / packaging upsell templates (PUT /user/getPackageUpsellData) ──
  // No body, public sitekey. Returns { expiryDate, bundleOptions:[…] } — the gift-
  // set bundle templates (sleeve / 6-ball / wooden + their kit price ladders) that
  // a custom-logo ball can be wrapped into. Ball-independent; the modal filters to
  // upsellOptions.showCustom and prices each per ball (src/lib/giftSets.js).
  if (msg.action === 'fetchPackageUpsell') {
    fetch('https://master.api.icustomize.com/user/getPackageUpsellData', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'sitekey': 'golfballs' },
      cache: 'no-store',
      redirect: 'error',
    })
      .then(async r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await gbReadJsonLimited(r, 2_000_000);
        const data = (j && j.d !== undefined) ? (typeof j.d === 'string' ? JSON.parse(j.d) : j.d) : j;
        sendResponse({ ok: true, bundleOptions: Array.isArray(data && data.bundleOptions) ? data.bundleOptions.slice(0, 500) : [], expiryDate: data && data.expiryDate });
      })
      .catch(err => {
        sendResponse({ ok: false, error: String(err), bundleOptions: [] });
      });
    return true;
  }

  // ── Load a saved cart / proposal (GET /user/getCart/<number>) ───────
  // Returns the stored cartData (the `d` field is a JSON string or object).
  // The getCart Lambda 502s ("Internal server error") on cold/slow carts —
  // a transient timeout, not a bad cart (the same id loads fine on retry).
  // Retry 5xx with backoff so a single slow cart doesn't surface as a null/
  // line-less proposal. (The caller also caps concurrency to avoid stampeding
  // the backend into these timeouts in the first place.)
  if (msg.action === 'giftLoadCart' && msg.cartNumber != null) {
    const cartNumber = String(msg.cartNumber).trim();
    if (!/^[A-Za-z0-9{}._-]{1,128}$/.test(cartNumber)) {
      sendResponse({ ok: false, error: 'Invalid cart identifier' });
      return true;
    }
    (async () => {
      const url = 'https://master.api.icustomize.com/user/getCart/' + encodeURIComponent(cartNumber);
      const attempts = 3;
      let lastErr = null;
      for (let i = 0; i < attempts; i++) {
        if (i > 0) await new Promise((res) => setTimeout(res, 600 * i)); // 0, 600, 1200ms
        try {
          const r = await fetch(url, { method: 'GET', redirect: 'error', headers: { 'Accept': 'application/json', 'sitekey': 'golfballs' } });
          if (!r.ok) {
            lastErr = new Error('HTTP ' + r.status);
            if (r.status >= 500) continue;   // transient — retry
            throw lastErr;                    // 4xx — don't retry
          }
          const j = await gbReadJsonLimited(r, 10_000_000);
          const d = j && j.d !== undefined ? j.d : j;
          const cartData = typeof d === 'string' ? JSON.parse(d) : d;
          sendResponse({ ok: true, cartData });
          return;
        } catch (err) { lastErr = err; }      // network/parse error — retry
      }
      sendResponse({ ok: false, error: String(lastErr) });
    })();
    return true;
  }

  // ── Per-product customizer config ──────────────────────────────────
  // Fetches a product page, extracts __NEXT_DATA__ product.ProductModification
  // + ProductChild, and returns the normalized config the modal renders from
  // (real base colors, second-pole availability, setup fee, shipping/service).
  if (msg.action === 'fetchProductConfig' && msg.url) {
    gbGetProductConfig(msg.url)
      .then((config) => sendResponse({ ok: true, config }))
      .catch((err) => {
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }

  // ── Raw product object (for cart serialization) ────────────────────
  // Returns the full __NEXT_DATA__.product the cart serializer needs to
  // assemble a saveCart line (ProductChild / ProductModification / fee
  // headers). Cached in-memory in the worker; safe to call per cart save.
  if (msg.action === 'fetchProductRaw' && msg.url) {
    gbFetchProductPage(msg.url)
      .then((product) => sendResponse({ ok: true, product }))
      .catch((err) => {
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }

  // ── Custom-logo upload (at cart-save time) ─────────────────────────
  // dataUrl = the aligned + rotation-baked decal; returns
  // { filePath, fileName, cropFilePath, userImage } for the cart line.
  if (msg.action === 'uploadCustomLogo' && msg.dataUrl) {
    if (typeof msg.dataUrl !== 'string'
        || msg.dataUrl.length > 20_000_000
        || !/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(msg.dataUrl)) {
      sendResponse({ ok: false, error: 'Invalid or oversized logo image' });
      return true;
    }
    gbUploadCustomLogo(msg)
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((err) => {
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }

  // ── 2. Calendar HTML Proxy (GET — initial state fetch) ─────
  if (msg.action === 'fetchCalendarState' && msg.url) {
    if (!GB_SECURITY.isCalendarUrl(msg.url)) {
      sendResponse({ ok: false, error: 'Blocked calendar URL' });
      return true;
    }
    const fetchHeaders = {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Cache-Control': 'no-cache',
    };

    fetch(msg.url, {
      headers: fetchHeaders,
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    })
    .then(async r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const html = await gbReadTextLimited(r, 10_000_000);
      if (html.includes('login') || html.includes('Log In')) {
        throw new Error("Server rejected session cookies and redirected to login screen.");
      }
      sendResponse({ ok: true, html: html });
    })
    .catch(err => {
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  }

  // ── 7. Generate Proof Link (Scrape & Post) ─────────────────
  if (msg.action === 'generateProofLink') {
    const customerId = String(msg.customerId || '');
    const orderId = String(msg.orderId || '');
    if (!/^\d{1,12}$/.test(customerId) || (orderId && !/^\d{1,12}$/.test(orderId))) {
      sendResponse({ ok: false, error: 'Invalid customer or order identifier' });
      return true;
    }
    const proofName = String(msg.proofName || `Proof - ${orderId}`).slice(0, 200);
    const notes = String(msg.notes || '').slice(0, 5_000);
    const baseUrl = `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=128&customerID=${customerId}`;

    fetch(baseUrl, { method: 'GET', credentials: 'include', redirect: 'error', referrerPolicy: 'no-referrer' })
      .then(async r => {
        if (!r.ok) throw new Error('Failed to load Create page');
        const html = await gbReadTextLimited(r, 10_000_000);

        const vsMatch  = html.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
        const vsgMatch = html.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);
        const evMatch  = html.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/);

        if (!vsMatch) throw new Error('Could not find __VIEWSTATE');

        // Build payload using the user's custom form inputs
        const formData = new FormData();
        formData.append('__EVENTTARGET', '');
        formData.append('__EVENTARGUMENT', '');
        formData.append('__VIEWSTATE', vsMatch[1]);
        formData.append('__VIEWSTATEGENERATOR', vsgMatch ? vsgMatch[1] : '');
        formData.append('__EVENTVALIDATION', evMatch ? evMatch[1] : '');

        formData.append('ctl00$inputName', proofName);
        formData.append('ctl00$inputKeywords', '');
        formData.append('ctl00$inputNotes', notes);
        formData.append('ctl00$inputLogoType', ['Ball', 'Other'].includes(msg.logoType) ? msg.logoType : 'Ball');
        formData.append('ctl00$inputCustomerID', customerId);
        formData.append('ctl00$DropDownSalesRep', /^\d{1,12}$/.test(String(msg.salesRepId || '')) ? String(msg.salesRepId) : '0');
        formData.append('ctl00$DropDownArtist', /^\d{1,12}$/.test(String(msg.artistId || '')) ? String(msg.artistId) : '42');
        formData.append('ctl00$DropDownStatus', /^\d{1,4}$/.test(String(msg.logoStatus || '')) ? String(msg.logoStatus) : '1');

        // Use a proper File object instead of a blank Blob just to be safe with ASP.NET
        formData.append('ctl00$LogoUpload', new File([""], "empty.png", { type: "image/png" }));
        formData.append('ctl00$Button1', 'Create Logo');

        return fetch(baseUrl, {
          method: 'POST',
          body: formData,
          credentials: 'include',
          redirect: 'follow',
          referrerPolicy: 'no-referrer',
        });
      })
      .then(async r => {
        const finalUrl = new URL(r.url);
        const messageParam = finalUrl.searchParams.get('message');

        if (messageParam && messageParam.includes('http')) {
          const cleanLink = messageParam.replace('New Job Link ', '').trim();
          const parsedLink = GB_SECURITY.parseHttpsUrl(cleanLink);
          if (!parsedLink || !/(^|\.)golfballs\.com$/i.test(parsedLink.hostname)) throw new Error('Server returned an invalid proof link');
          sendResponse({ ok: true, proofLink: parsedLink.href });
        } else {
          await gbReadTextLimited(r, 2_000_000);
          throw new Error('Server rejected the proof form');
        }
      })
      .catch(err => {
        sendResponse({ ok: false, error: err.message });
      });

    return true;
  }

  // ── 3. Calendar Date-Selection POST ────────────────────────
  // Fires a __doPostBack equivalent for ApprovalDate or DeliveryCommitment.
  // Returns the fresh { viewState, viewStateGen, eventValidation } from the
  // server response so the caller can chain the next step.
  if (msg.action === 'postCalendarForm') {
    const validationError = gbValidateCalendarState(msg, true);
    if (validationError) { sendResponse({ ok: false, error: validationError }); return true; }
    const params = new URLSearchParams();
    params.set('__EVENTTARGET',        msg.eventTarget   || '');
    params.set('__EVENTARGUMENT',      msg.eventArgument || '');
    params.set('__VIEWSTATE',          msg.viewState     || '');
    params.set('__VIEWSTATEGENERATOR', msg.viewStateGen  || '');
    params.set('__EVENTVALIDATION',    msg.eventValidation || '');

    fetch(msg.url, {
      method:      'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept':       'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cache-Control': 'no-cache'
      },
      credentials: 'include',
      body:        params.toString()
    })
    .then(async r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const html = await gbReadTextLimited(r, 10_000_000);

      // DOMParser is not available in service workers — use targeted regex instead.
      // The attribute order in ASP.NET output is always: id="…" value="…"
      let vsMatch  = html.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
      const vsgMatch = html.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);
      const evMatch  = html.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/);

      if (!vsMatch) {
        // Sometimes the attribute order is reversed: value="…" … id="…"
        const vsAlt = html.match(/name="__VIEWSTATE"[^>]*value="([^"]+)"/);
        if (!vsAlt) throw new Error('__VIEWSTATE missing from server response. Session may have expired.');
        vsMatch = vsAlt; // reassign to continue
      }

      sendResponse({ ok: true, state: {
        viewState:       vsMatch[1],
        viewStateGen:    vsgMatch ? vsgMatch[1] : msg.viewStateGen,
        eventValidation: evMatch  ? evMatch[1]  : msg.eventValidation
      }});
    })
    .catch(err => {
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  }

  // ── 4. Calendar Final Submit ────────────────────────────────
  // Equivalent to clicking "Update Delivery Date".
  // At this point ViewState already encodes the two selected dates.
  if (msg.action === 'submitCalendarUpdate') {
    const validationError = gbValidateCalendarState(msg, false);
    if (validationError) { sendResponse({ ok: false, error: validationError }); return true; }
    const params = new URLSearchParams();
    params.set('__EVENTTARGET',                  '');
    params.set('__EVENTARGUMENT',                '');
    params.set('__VIEWSTATE',                    msg.viewState     || '');
    params.set('__VIEWSTATEGENERATOR',           msg.viewStateGen  || '');
    params.set('__EVENTVALIDATION',              msg.eventValidation || '');
    params.set('ctl00$btnUpdateDeliveryDate',    'Update Delivery Date');

    fetch(msg.url, {
      method:      'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept':       'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cache-Control': 'no-cache'
      },
      credentials: 'include',
      body:        params.toString()
    })
    .then(async r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const html = await gbReadTextLimited(r, 10_000_000);
      // Detect silent redirect-to-login failure
      if (html.includes('id="login"') || (html.toLowerCase().includes('log in') && !html.includes('btnUpdateDeliveryDate'))) {
        throw new Error('Session expired during submit. Please refresh the order page and try again.');
      }
      sendResponse({ ok: true });
    })
    .catch(err => {
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  }

  // Broadcasts to all frames, but only executes in admin.icustomize.com
  if (msg.action === 'chargeApiProxy') {
    const method = String(msg.method || 'POST').toUpperCase();
    if (!GB_SECURITY.isChargeRequest(msg.url, method)) {
      sendResponse({ ok: false, status: 0, text: '', error: 'Blocked payment endpoint or method' });
      return true;
    }
    chrome.storage.local.get('orderTabId', async ({ orderTabId }) => {
      if (!Number.isInteger(orderTabId) || orderTabId < 0) {
        const err = 'No orderTabId — reopen popup from the order page.';
        sendResponse({ ok: false, status: 0, text: '', error: err });
        return;
      }

      // Serialise body
      let bodyStr = null;
      if (msg.body !== null && msg.body !== undefined) {
        if (typeof msg.body === 'string') {
          const n = Number(msg.body);
          bodyStr = isNaN(n) ? JSON.stringify(msg.body) : String(n);
        } else {
          bodyStr = JSON.stringify(msg.body);
        }
      }
      if (bodyStr != null && bodyStr.length > 1_000_000) {
        sendResponse({ ok: false, status: 0, text: '', error: 'Payment request exceeds 1 MB limit' });
        return;
      }

      try {
        // Execute in ALL frames attached to the order tab
        const results = await chrome.scripting.executeScript({
          target: { tabId: orderTabId, allFrames: true },
          world: 'MAIN', // <-- CRITICAL: Forces script out of the extension sandbox and into the native page context
          func: async (url, method, bodyStr) => {

            // GUARD: Only proceed if we are inside the correct iframe
            if (window.location.origin !== 'https://admin.icustomize.com') {
              return { ignored: true };
            }

            const allowed = new Map([
              ['production-private-api.icustomize.com/api/user/paymentcreditcard/getuserpaymentmethods', 'POST'],
              ['production-private-api.icustomize.com/api/user/paymentordercharge/saveadjustment', 'POST'],
              ['production-private-api.icustomize.com/api/user/creditcardinfo/getbillinginfobybillingrequest', 'POST'],
              ['master.api.icustomize.com/user/billingverify', 'PUT'],
              ['master.api.icustomize.com/user/chargecard', 'PUT'],
              ['master.api.icustomize.com/admin/editorder', 'PUT'],
            ]);
            let parsed;
            try { parsed = new URL(url); } catch { return { ok: false, status: 0, text: '', error: 'Invalid payment URL' }; }
            const key = `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, '').toLowerCase()}`;
            const requestMethod = String(method || 'POST').toUpperCase();
            if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || allowed.get(key) !== requestMethod) {
              return { ok: false, status: 0, text: '', error: 'Blocked payment endpoint or method' };
            }

            if (typeof window.__gbAuthBrokerExecute !== 'function') {
              return { ok: false, status: 0, text: '', error: 'Authenticated iCustomize bridge is unavailable — reload the order page' };
            }
            return window.__gbAuthBrokerExecute({
              action: 'chargeApi',
              url: parsed.href,
              method: requestMethod,
              body: bodyStr,
            });
          },
          args: [msg.url, method, bodyStr]
        });

        // Isolate the result from the iframe that didn't ignore the request
        const validResult = results?.find(r => r.result && !r.result.ignored);

        if (validResult) {
          sendResponse(validResult.result);
        } else {
          const err = 'Could not find admin.icustomize.com iframe. Please ensure the Credit Card Adjustment portlet is visible on the order page.';
          sendResponse({ ok: false, status: 0, text: '', error: err });
        }

      } catch (err) {
        sendResponse({ ok: false, status: 0, text: '', error: err.name + ': ' + err.message });
      }
    });
    return true;
  }

  // ── Operator's Guide: focus the existing tab or open a new one ─
  if (msg.action === 'openGuide') {
    const hash = typeof msg.hash === 'string' && /^#[A-Za-z0-9_./?=&%-]{0,300}$/.test(msg.hash) ? msg.hash : '';
    const url = chrome.runtime.getURL('guide.html') + hash;
    const createGuideTab = () => {
      chrome.tabs.create({ url, active: true }, (tab) => { guideTabId = tab?.id ?? null; });
    };
    if (guideTabId !== null) {
      chrome.tabs.get(guideTabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          guideTabId = null;
          createGuideTab();
        } else {
          chrome.tabs.update(guideTabId, { active: true });
          chrome.windows.update(tab.windowId, { focused: true });
        }
        sendResponse({ success: true });
      });
    } else {
      createGuideTab();
      sendResponse({ success: true });
    }
    return true;
  }

  if (msg.action === 'openEditor') {
    if (editorWindowId !== null) {
      chrome.windows.get(editorWindowId, (win) => {
        if (chrome.runtime.lastError || !win) {
          editorWindowId = null;
          createEditorWindow();
        } else {
          chrome.windows.update(editorWindowId, { focused: true });
        }
        sendResponse({ success: true });
      });
    } else {
      createEditorWindow();
      sendResponse({ success: true });
    }
    return true;
  }

  // ── Start pick: inject content script, switch to order tab ─
  if (msg.action === 'startPick') {
    const fieldId = typeof msg.fieldId === 'string' ? msg.fieldId.trim().slice(0, 200) : '';
    if (!fieldId) { sendResponse({ error: 'Invalid field identifier' }); return true; }
    chrome.storage.local.get(['orderTabId', 'editorTabId'], ({ orderTabId, editorTabId }) => {
      if (!orderTabId) {
        sendResponse({ error: "No order tab" });
        return;
      }
      chrome.storage.local.set({ pickMode: { active: true, fieldId, editorTabId } }, () => {
        chrome.scripting.executeScript(
          { target: { tabId: orderTabId }, files: [
        'theme.js',
        'src/vanilla/smart-detection.js',
        'react-dist/vanilla/page-engine.js',
        'src/vanilla/variable-resolution.js',
        'src/vanilla/modals/charge-modal.js',
        'src/vanilla/modals/order-edit-modal.js',
        'src/vanilla/page-utils.js',
        'src/vanilla/main.js'
      ] },
          () => {
            chrome.tabs.sendMessage(orderTabId, { action: 'enterPickMode' });
            chrome.tabs.update(orderTabId, { active: true });
            chrome.windows.update(msg.editorWindowId || editorWindowId, { focused: false });
            sendResponse({ success: true });
          }
        );
      });
    });
    return true;
  }


  // ── Hover preview during pick mode ────────────────────────────
  if (msg.action === 'pickHover') {
    chrome.storage.local.set({ pickHover: { text: String(msg.text || '').slice(0, 1_000), ts: Date.now() } });
    return false;
  }

  // ── Keepalive ping — prevents service worker from going idle during campaign delays ──
  if (msg.action === 'ping') {
    sendResponse({ ok: true });
    return true;
  }

  // ── Power Automate: post email payload to HTTP trigger ─────────────────────
  if (msg.action === 'paAutomate') {
    const { payload } = msg;
    const payloadError = gbValidateEmailPayload(payload);
    if (payloadError) { sendResponse({ ok: false, error: payloadError }); return true; }
    (async () => {
      try {
        const credentials = await gbReadCredentials();
        const paUrl = credentials.powerAutomateUrl;
        if (!GB_SECURITY.isPowerAutomateUrl(paUrl)) {
          sendResponse({ ok: false, error: 'No valid Power Automate URL configured.' });
          return;
        }
        // Pull every <img> out of the body into inline CID attachments and
        // rewrite each tag to src="cid:…". Outlook ignores base64 data: URIs
        // and external/hotlink-protected URLs, so CID attachments are the
        // only form that renders reliably. The PA flow forwards the
        // per-email `attachments` array to its send action.
        if (payload && Array.isArray(payload.emails)) {
          for (const em of payload.emails) {
            if (em && typeof em.htmlBody === 'string') {
              // Attached-file markers FIRST (they're stripped from the html),
              // then the CID image pass over what remains.
              const fa = await extractEmailFileAttachments(em.htmlBody);
              const r  = await extractEmailImages(fa.html);
              em.htmlBody = r.html;
              const extra = [...fa.attachments, ...r.attachments];
              if (extra.length) {
                em.attachments = [...(em.attachments || []), ...extra];
              }
            }
          }
        }
        const enrichedError = gbValidateEmailPayload(payload);
        if (enrichedError) { sendResponse({ ok: false, error: enrichedError }); return; }
        const outboundBody = gbSerializeLimited(payload, 12_000_000, 'Email payload');
        // PA direct-trigger URLs return 202 Accepted with no JSON body.
        // Treat any 2xx as success — don't require a parseable body.
        const r = await fetch(paUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    outboundBody,
          credentials: 'omit',
          redirect: 'error',
        });
        if (r.ok) {
          const text = await gbReadTextLimited(r, 1_000_000);
          try {
            const data = JSON.parse(text);
            if (typeof data.ok === 'boolean') {
              sendResponse({ ok: data.ok, sent: data.sent, failed: data.failed, results: data.results });
            } else {
              sendResponse({ ok: true, results: [{ status: 'sent' }] });
            }
          } catch {
            sendResponse({ ok: true, results: [{ status: 'sent' }] });
          }
        } else {
          sendResponse({ ok: false, error: `HTTP ${r.status}` });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  /* Open a mailto: URL in a background tab. Used by lib/emailSender.js as
     the PA-off fallback (hand the email to the user's mail client). Goes
     through the background because content scripts (email-preview,
     EmailRunner) have no chrome.tabs access, and chrome.tabs.create on a
     mailto: URL is not popup-blocked — unlike a loop of window.open()
     calls, which matters for a bulk run opening one window per contact.
     active:false so a bulk run doesn't yank focus on every send. The
     popup's own path already does the same chrome.tabs.create. */
  /* Website page requests forwarded from the MAIN-world hook (via the
     proposal-debug content-script bridge). Background is the SINGLE writer of
     the debug log, so these route through here instead of the content script
     touching storage directly (avoids clobbering concurrent extension writes). */
  if (msg.action === 'gbProposalNet' && msg.entry) {
    if (gbDebugOn) {
      const e = msg.entry;
      const url = GB_SECURITY.parseHttpsUrl(e.url);
      let entrySize = Infinity;
      try { entrySize = JSON.stringify(e).length; } catch { /* invalid */ }
      if (url && gbIsAllowedFetchUrl(url.href) && entrySize <= 250_000) gbDebugPush({
        id: 'w' + (e.ts || Date.now()) + '_' + Math.random().toString(36).slice(2, 6),
        ts: e.ts || Date.now(), durationMs: e.durationMs || 0,
        cat: e.cat || 'proposal', label: e.label || 'Request',
        method: e.method || 'GET', url: String(e.url || ''),
        reqBody: _gbCap(e.reqBody), status: e.status || 0, ok: !!e.ok,
        respBody: _gbCap(e.respBody), error: e.error || null, source: 'website',
      });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'openMailto') {
    if (!GB_SECURITY.isMailtoUrl(msg.url)) {
      sendResponse({ ok: false, error: 'Invalid mailto URL' });
      return true;
    }
    gbDebugRecord({ cat: 'email', label: 'Open Mailto (Power Automate off)', method: 'MAILTO', url: msg.url, reqBody: null, status: 0, ok: true, respBody: null });
    try { chrome.tabs.create({ url: msg.url, active: false }); sendResponse({ ok: true }); }
    catch (e) { sendResponse({ ok: false, error: String(e?.message || e) }); }
    return true;
  }


  // ── Element picked by content script ───────────────────────
  if (msg.action === 'elementPicked') {
    const selector = typeof msg.selector === 'string' ? msg.selector.slice(0, 2_000) : '';
    const pickedText = typeof msg.text === 'string' ? msg.text.slice(0, 10_000) : '';
    if (!selector) { sendResponse({ error: 'Invalid picked element' }); return true; }
    chrome.storage.local.get('pickMode', ({ pickMode }) => {
      if (!pickMode?.active) {
        sendResponse({ ignored: true });
        return;
      }
      chrome.storage.local.set({
        pickMode: { active: false },
        pickResult: { fieldId: pickMode.fieldId, selector, text: pickedText, ts: Date.now() }
      }, () => {
        if (editorWindowId) chrome.windows.update(editorWindowId, { focused: true });
        sendResponse({ success: true });
      });
    });
    return true;
  }

  // ── Cancel pick ────────────────────────────────────────────
  if (msg.action === 'cancelPick') {
    chrome.storage.local.set({ pickMode: { active: false } });
    if (editorWindowId) chrome.windows.update(editorWindowId, { focused: true });
    // removed "return true;"
  }
});

/**
 * Opens a new popup window containing the template editor and stores both
 * the window ID and its tab ID in chrome.storage.local so other parts of
 * the extension can target it.
 */
function createEditorWindow() {
  chrome.windows.create({
    url: chrome.runtime.getURL('editor.html'),
    type: 'popup', width: 860, height: 700
  }, (win) => {
    editorWindowId = win.id;
    chrome.tabs.query({ windowId: win.id }, (tabs) => {
      if (tabs[0]) chrome.storage.local.set({ editorTabId: tabs[0].id });
    });
  });
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === editorWindowId) editorWindowId = null;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === guideTabId) guideTabId = null;
});


// ── Email image → inline CID attachments ──────────────────────────────────────
// Outlook ignores base64 data: URIs and frequently blocks external image URLs,
// so images only render reliably when sent as inline CID attachments. Before a
// Power Automate send we pull every <img> out of the body, build an attachment
// for each, and rewrite the tag to src="cid:<id>". The PA flow forwards the
// per-email `attachments` array into its send action.

const GB_MAX_IMG_BYTES = 3 * 1024 * 1024; // skip images larger than 3 MB
const GB_MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
const GB_SAFE_IMAGE_TYPE = /^image\/(?:png|jpe?g|gif|webp|bmp)$/i;

/** ArrayBuffer → base64 string (chunked to stay within the call-stack limit). */
function gbBufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Best-guess file extension for an image MIME type. */
function gbExtFor(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('png'))                 return 'png';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  if (t.includes('gif'))                 return 'gif';
  if (t.includes('webp'))                return 'webp';
  if (t.includes('bmp'))                 return 'bmp';
  return 'img';
}

/**
 * Pulls every embeddable <img> out of an HTML string. Returns the rewritten
 * HTML (each handled tag becomes src="cid:<id>") plus an `attachments` array of
 * inline images: { name, contentType, contentBytes (base64), contentId,
 * isInline }. Best-effort — an image that can't be processed keeps its original
 * src and is left out of `attachments`; a failure never blocks the send.
 * Handles base64 data: URIs and http(s) URLs; relative / blob: / cid: are left
 * untouched.
 * @param {string} html
 * @returns {Promise<{ html: string, attachments: Array }>}
 */
async function extractEmailImages(html) {
  const result = { html, attachments: [] };
  if (!html || typeof html !== 'string' || html.indexOf('<img') === -1) return result;

  // Collect unique <img> src values.
  const urls  = new Set();
  const imgRe = /<img\b[^>]*>/gi;
  const srcRe = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
  let m;
  while ((m = imgRe.exec(html))) {
    const sm = m[0].match(srcRe);
    const url = sm && (sm[1] || sm[2] || '').trim();
    if (url) urls.add(url);
    if (urls.size >= 20) break;
  }
  if (!urls.size) return result;

  // Resolve each src to raw image bytes.
  const found = [];
  let totalBytes = 0;
  for (const raw of urls) {
    try {
      let contentType = '';
      let base64 = '';
      let byteLength = 0;
      if (/^data:/i.test(raw)) {
        const dm = raw.match(/^data:([^;,]*);base64,([\s\S]*)$/i);
        if (!dm) continue;                              // non-base64 data URI — skip
        contentType = (dm[1] || 'image/png').split(';')[0].trim().toLowerCase();
        if (!GB_SAFE_IMAGE_TYPE.test(contentType)) continue;
        base64 = dm[2].replace(/\s/g, '');
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) continue;
        byteLength = Math.floor(base64.length * 3 / 4);
      } else if (/^cid:/i.test(raw)) {
        continue;                                       // already an inline ref
      } else {
        let fetchUrl = raw.replace(/&amp;/gi, '&');
        if (fetchUrl.startsWith('//')) fetchUrl = 'https:' + fetchUrl;
        const parsed = GB_SECURITY.parseHttpsUrl(fetchUrl);
        if (!parsed) continue;                           // relative / blob / plaintext — skip
        const resp = await fetch(parsed.href, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
        if (!resp.ok) continue;
        contentType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!GB_SAFE_IMAGE_TYPE.test(contentType)) continue;
        const bytes = await gbReadBytesLimited(resp, GB_MAX_IMG_BYTES);
        byteLength = bytes.byteLength;
        base64 = gbBufToBase64(bytes);
      }
      if (!base64 || byteLength > GB_MAX_IMG_BYTES || totalBytes + byteLength > GB_MAX_INLINE_IMAGE_BYTES) continue;
      totalBytes += byteLength;
      found.push({ raw, contentType, base64 });
    } catch (e) {
      /* A remote image is optional; keep its original src when it cannot be
         fetched or exceeds the attachment budget. */
    }
  }

  if (!found.length) return result;

  // Assign stable Content-IDs and build the attachment list.
  // @odata.type MUST be the first property: Graph types each attachment by
  // reading @odata.type before its properties. If contentBytes (a
  // fileAttachment-only field) is read first, Graph rejects it as not
  // existing on the base Attachment type → 400 BadRequest.
  const replace = {};
  found.forEach((img, i) => {
    const id = `gbimg${i + 1}`;
    replace[img.raw] = `cid:${id}`;
    result.attachments.push({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name:          `${id}.${gbExtFor(img.contentType)}`,
      contentType:   img.contentType,
      contentBytes:  img.base64,
      contentId:     id,
      isInline:      true,
    });
  });

  // Replace longest src strings first so a shorter one can't corrupt a longer
  // one that contains it as a substring.
  let out = html;
  Object.keys(replace).sort((a, b) => b.length - a.length)
    .forEach((orig) => { out = out.split(orig).join(replace[orig]); });
  result.html = out;
  return result;
}

/* ── Attached-file extraction (attachment variables, attach mode) ─────────────
   The template resolver renders an attach-mode attachment variable as an
   invisible marker:
     <span data-gb-attach="<url-or-dataurl>" data-gb-attach-name="file.pdf" …></span>
   Here we strip every marker from the html and turn each one into a REAL
   (non-inline) fileAttachment — fetched and sent as DATA (contentBytes), not a
   link: links rot, need auth, and Graph's fileAttachment requires contentBytes
   anyway. Any content type is allowed (PDF/PNG/etc.), capped at 8 MB. */
const GB_MAX_ATTACH_BYTES = 8 * 1024 * 1024;
async function extractEmailFileAttachments(html) {
  const result = { html, attachments: [] };
  if (!html || typeof html !== 'string' || html.indexOf('data-gb-attach=') === -1) return result;
  const markRe = /<span\b[^>]*\bdata-gb-attach\s*=\s*"([^"]*)"[^>]*>[\s\S]*?<\/span>/gi;
  const nameRe = /\bdata-gb-attach-name\s*=\s*"([^"]*)"/i;
  const unesc = (s) => String(s || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
  const specs = [];
  let m;
  while ((m = markRe.exec(html))) {
    const nm = m[0].match(nameRe);
    specs.push({ tag: m[0], src: unesc(m[1]), name: unesc((nm && nm[1]) || '') || 'attachment' });
    if (specs.length >= 20) break;
  }
  if (!specs.length) return result;
  let out = html;
  let totalBytes = 0;
  for (const spec of specs) {
    out = out.split(spec.tag).join('');                 // marker never reaches the recipient
    try {
      let contentType = '';
      let base64 = '';
      let byteLength = 0;
      if (/^data:/i.test(spec.src)) {
        const dm = spec.src.match(/^data:([^;,]*);base64,([\s\S]*)$/i);
        if (!dm) continue;
        contentType = (dm[1] || 'application/octet-stream').split(';')[0].trim().toLowerCase();
        base64 = dm[2].replace(/\s/g, '');
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) continue;
        byteLength = Math.floor(base64.length * 3 / 4);
      } else {
        let fetchUrl = spec.src.replace(/&amp;/gi, '&');
        if (fetchUrl.startsWith('//')) fetchUrl = 'https:' + fetchUrl;
        const parsed = GB_SECURITY.parseHttpsUrl(fetchUrl);
        if (!parsed) continue;
        const resp = await fetch(parsed.href, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
        if (!resp.ok) continue;
        contentType = (resp.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
        const bytes = await gbReadBytesLimited(resp, GB_MAX_ATTACH_BYTES);
        byteLength = bytes.byteLength;
        base64 = gbBufToBase64(bytes);
      }
      if (!base64 || byteLength > GB_MAX_ATTACH_BYTES || totalBytes + byteLength > GB_MAX_ATTACH_BYTES) continue;
      totalBytes += byteLength;
      const safeName = String(spec.name || 'attachment')
        .replace(/[\u0000-\u001f\u007f/\\:]+/g, '_').trim().slice(0, 160) || 'attachment';
      result.attachments.push({
        '@odata.type': '#microsoft.graph.fileAttachment',   // MUST be first — see extractEmailImages
        name:          safeName,
        contentType:   contentType.slice(0, 120),
        contentBytes:  base64,
        isInline:      false,
      });
    } catch (e) {
      /* Optional remote attachments fail closed without logging their URL. */
    }
  }
  result.html = out;
  return result;
}
