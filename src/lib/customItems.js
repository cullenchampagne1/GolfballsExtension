/* ───────────────────────────────────────────────────────────────────────────
   customItems.js — sales-rep "custom items" (one-off / service products that
   aren't in the catalog) saved to chrome.storage.local and addable to proposals.

   On golfballs.com these are cart lines with ShortCode "SERVICEITEM", built from
   a small form (name / style / extraDetails / itemID / price / setup / weight /
   qty / thumbnail / dropship). A saved record here mirrors that form; it becomes
   a synthetic catalog "product" via customItemToProduct() so the existing
   ProductCard + addToProposal path renders and quotes it, and the cart
   serializer turns it into the real SERVICEITEM line (see
   cartSerializer.buildCustomItemLine).
   ─────────────────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'gbCustomItems';
const _rid = () => Math.random().toString(36).slice(2, 9);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function _sendBg(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) { reject(new Error('Not in an extension context')); return; }
    try {
      chrome.runtime.sendMessage({ action, ...payload }, (resp) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        if (!resp || !resp.ok) { reject(new Error((resp && resp.error) || (action + ' failed'))); return; }
        resolve(resp);
      });
    } catch (e) { reject(e); }
  });
}

/* Upload a custom-item thumbnail to the icustomize S3 bucket (same flow as logo
   uploads) and return a stable public URL so the image persists across sessions
   and renders in the cart. `dataUrl` is a base64 data: URL (from a file input). */
export async function uploadCustomItemImage(dataUrl, fileName = 'custom-item.png') {
  const up = await _sendBg('uploadCustomLogo', { dataUrl, fileName });
  if (!up.filePath) throw new Error('upload returned no path');
  return 'https://static.golfballs.com/' + up.filePath;
}

/* True when `url` is an external http(s) image that should be re-hosted on our
   S3 bucket (i.e. it's a link, not already a static.golfballs.com URL or a
   data: URL we'll upload anyway). */
export function needsIngest(url) {
  return /^https?:\/\//i.test(url || '') && !/(^|\.)static\.golfballs\.com\//i.test(url || '');
}

/* Download an external image link (via the background proxy, CORS-safe) and
   re-upload it to the icustomize S3 bucket. Returns the stable S3 URL. */
export async function ingestImageUrl(url) {
  const r = await _sendBg('proxyFetchImage', { url });
  if (!r.dataUrl) throw new Error('could not fetch image');
  const name = ((url.split('/').pop() || 'custom-item').split('?')[0]) || 'custom-item.png';
  return uploadCustomItemImage(r.dataUrl, /\.[a-z0-9]+$/i.test(name) ? name : name + '.png');
}

export function loadCustomItems() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) { resolve([]); return; }
      chrome.storage.local.get(STORAGE_KEY, (d) => resolve((d && Array.isArray(d[STORAGE_KEY])) ? d[STORAGE_KEY] : []));
    } catch { resolve([]); }
  });
}

function _writeCustomItems(list) {
  return new Promise((resolve) => {
    try { chrome.storage.local.set({ [STORAGE_KEY]: list }, () => resolve(list)); } catch { resolve(list); }
  });
}

/* Clean + sort a price ladder; drop empty rows; ensure at least one tier. */
function normBreaks(breaks, legacyPrice, legacyQty) {
  let rows = Array.isArray(breaks) ? breaks : [];
  rows = rows
    .map((b) => ({ q: num(b && b.q) || 0, p: num(b && b.p) }))
    .filter((b) => b.q > 0)
    .sort((a, b) => a.q - b.q);
  if (!rows.length) rows = [{ q: num(legacyQty) || 1, p: num(legacyPrice) }];
  return rows;
}

/* Style options: an array of non-empty labels. Falls back to a single legacy
   `style` string so old items keep their value. */
function normStyleOptions(styleOptions, legacyStyle) {
  let opts = Array.isArray(styleOptions) ? styleOptions : [];
  opts = opts.map((s) => (s == null ? '' : String(s).trim())).filter(Boolean);
  if (!opts.length && legacyStyle && String(legacyStyle).trim()) opts = [String(legacyStyle).trim()];
  return opts;
}

/* Normalize a form/stored record into the spec shape. Migrates the legacy flat
   shape ({style, price, qty}) → ({styleOptions, breaks}) so old items keep
   working. `qty` is no longer a field (the ladder's first tier is the min qty). */
export function normalizeCustomItem(rec = {}) {
  return {
    id: rec.id || 'ci-' + _rid(),
    name: (rec.name || '').trim(),
    extraDetails: (rec.extraDetails || '').trim(),
    itemID: (rec.itemID || '').trim(),
    // Source product link (e.g. the hpgbrands.com page) — a button surfaces it
    // later. `source` tags where the item came from (e.g. 'hpg'); `sku` is the
    // supplier SKU (used to dedupe imports).
    link: (rec.link || '').trim(),
    sku: (rec.sku || '').trim(),
    source: (rec.source || '').trim(),
    // Never persist a raw data: URL (would bloat storage + won't load in the
    // cart) — only keep an uploaded/pasted http(s) thumbnail.
    thumbnail: /^data:/i.test(rec.thumbnail || '') ? '' : (rec.thumbnail || '').trim(),
    description: (rec.description || '').trim(),
    styleOptions: normStyleOptions(rec.styleOptions, rec.style),
    breaks: normBreaks(rec.breaks, rec.price, rec.qty),
    cost: num(rec.cost),
    setup: num(rec.setup),
    weight: num(rec.weight),
    dropship: !!rec.dropship,
    date: rec.date || new Date().toISOString().slice(0, 10),
  };
}

/* Create or update (by id) a custom item; newest first. Returns { entry, list }. */
export async function saveCustomItem(rec) {
  const entry = normalizeCustomItem(rec);
  const list = await loadCustomItems();
  const idx = list.findIndex((c) => c.id === entry.id);
  let next;
  if (idx >= 0) { next = list.slice(); next[idx] = entry; }
  else next = [entry, ...list];
  await _writeCustomItems(next);
  return { entry, list: next };
}

/* Bulk insert/update (one storage read + write). Dedupes against existing items
   by `sku` (when present) so re-running an import updates rather than duplicates.
   Returns { added, updated, list }. */
export async function addCustomItems(records) {
  const incoming = (records || []).map(normalizeCustomItem);
  const list = await loadCustomItems();
  const bySku = new Map();
  list.forEach((c, i) => { if (c.sku) bySku.set(c.sku, i); });
  let added = 0, updated = 0;
  const next = list.slice();
  for (const rec of incoming) {
    const idx = rec.sku ? bySku.get(rec.sku) : undefined;
    if (idx != null) { next[idx] = { ...rec, id: next[idx].id }; updated++; }
    else { next.unshift(rec); added++; }
  }
  await _writeCustomItems(next);
  return { added, updated, list: next };
}

export async function removeCustomItem(id) {
  const list = await loadCustomItems();
  const next = list.filter((c) => c.id !== id);
  await _writeCustomItems(next);
  return next;
}

/* Map a stored custom item → a synthetic catalog product the modal's ProductCard
   and addToProposal understand. `isCustom` + `custom` let the cart serializer
   route it to buildCustomItemLine instead of fetching a (non-existent) page. */
export function customItemToProduct(rec) {
  const ci = normalizeCustomItem(rec);     // migrate legacy on the fly
  const breaks = ci.breaks;
  return {
    id: 'custom-' + ci.id,
    isCustom: true,
    custom: ci,
    brand: 'Custom',
    title: ci.name || 'Custom item',
    sku: ci.itemID || '',
    price: breaks[0].p,
    orig: null,
    logo: null,
    customLogo: false,
    customizable: false,
    img: ci.thumbnail || '',
    url: null,
    urlPath: '',
    rating: null,
    reviews: 0,
    minQty: breaks[0].q,
    breaks,
    styleOptions: ci.styleOptions,
    cost: ci.cost,
    setup: ci.setup,
    link: ci.link,
    source: ci.source,
    tags: [],
  };
}
