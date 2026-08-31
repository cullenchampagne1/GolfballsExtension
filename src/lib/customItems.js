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

import { decodeEntities } from './htmlEntities.js';
import { sendBackgroundMessage } from './backgroundMessage.js';

export const STORAGE_KEY = 'gbCustomItems';
export const PRODUCT_STORE_FILE_KIND = 'golfballs-product-store';
export const PRODUCT_STORE_FILE_VERSION = 1;
export const PRODUCT_STORE_FILE_MAX_BYTES = 4 * 1024 * 1024;
export const PRODUCT_STORE_FILE_MAX_ITEMS = 5000;

/* Supplier "repos" a custom item can be imported from. `label` is the short tag
   shown on the card; `host` lets us recover the source from an item's link for
   items imported before `source` was stored (migration-proof). */
export const REPOS = {
  hpg:   { label: 'HPG',   name: 'HPG Brands', host: 'hpgbrands.com' },
  snugz: { label: 'SnugZ', name: 'SnugZ USA',  host: 'snugzusa.com' },
};
/* Which repo a custom item came from — its stored `source`, or inferred from the
   product link (so previously-imported items still get tagged). Null = manual. */
export function repoOf(rec) {
  if (!rec) return null;
  if (rec.source && REPOS[rec.source]) return rec.source;
  const link = (rec.link || '').toLowerCase();
  for (const id of Object.keys(REPOS)) { if (link.includes(REPOS[id].host)) return id; }
  return null;
}
const _rid = () => Math.random().toString(36).slice(2, 9);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v) => (v == null ? '' : String(v)).trim();

/* Upload a custom-item thumbnail to the icustomize S3 bucket (same flow as logo
   uploads) and return a stable public URL so the image persists across sessions
   and renders in the cart. `dataUrl` is a base64 data: URL (from a file input). */
export async function uploadCustomItemImage(dataUrl, fileName = 'custom-item.png') {
  const up = await sendBackgroundMessage('uploadCustomLogo', { dataUrl, fileName });
  if (!up.filePath) throw new Error('upload returned no path');
  return 'https://static.golfballs.com/' + up.filePath;
}

/* True when `url` is an external http(s) image that should be re-hosted on our
   S3 bucket (i.e. it's a link, not already a static.golfballs.com URL or a
   data: URL we'll upload anyway). */
export function needsIngest(url) {
  const u = url || '';
  // http(s) AND not already on our S3 bucket. (The old `(^|\.)` anchor failed to
  // match `https://static.golfballs.com/…` because "static" is preceded by "/",
  // so already-hosted images got needlessly re-downloaded/re-uploaded on edit.)
  return /^https?:\/\//i.test(u) && !/static\.golfballs\.com\//i.test(u);
}

/* Download an external image link (via the background proxy, CORS-safe) and
   re-upload it to the icustomize S3 bucket. Returns the stable S3 URL. */
export async function ingestImageUrl(url) {
  const r = await sendBackgroundMessage('proxyFetchImage', { url });
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

/* Per-tier net cost ladder [{q,c}] (parallel to breaks) — drives accurate margin
   at each volume. Empty when not supplied. */
function normCostBreaks(costBreaks) {
  let rows = Array.isArray(costBreaks) ? costBreaks : [];
  return rows
    .map((b) => ({ q: num(b && b.q) || 0, c: num(b && b.c) }))
    .filter((b) => b.q > 0)
    .sort((a, b) => a.q - b.q);
}

/* Largest-tier cost ≤ qty from a [{q,c}] ladder (falls back to the single cost). */
export function costAtQty(costBreaks, qty, fallback = 0) {
  let c = null;
  for (const b of (costBreaks || [])) if (b.q <= qty) c = b.c;
  return c != null ? c : fallback;
}

/* Style options: an array of non-empty labels. Falls back to a single legacy
   `style` string so old items keep their value. */
function normStyleOptions(styleOptions, legacyStyle) {
  let opts = Array.isArray(styleOptions) ? styleOptions : [];
  opts = opts.map((s) => (s == null ? '' : String(s).trim())).filter(Boolean);
  if (!opts.length && legacyStyle && String(legacyStyle).trim()) opts = [String(legacyStyle).trim()];
  return opts;
}

/* A custom item can have a different photo and description for each selectable
   personalization. Legacy string-only `styleOptions` are promoted on read so
   existing libraries and shared stores remain compatible. */
function normPersonalizationOptions(options, styleOptions, legacyStyle) {
  const source = Array.isArray(options) && options.length
    ? options
    : normStyleOptions(styleOptions, legacyStyle).map((name) => ({ name }));
  return source.map((option) => {
    const raw = typeof option === 'string' ? { name: option } : (option || {});
    const image = str(raw.image || raw.thumbnail);
    return {
      name: decodeEntities(str(raw.name || raw.label || raw.style)),
      image: /^data:/i.test(image) ? '' : image,
      details: decodeEntities(str(raw.details || raw.description)),
    };
  }).filter((option) => option.name);
}

/* Normalize a form/stored record into the spec shape. Migrates the legacy flat
   shape ({style, price, qty}) → ({styleOptions, breaks}) so old items keep
   working. `qty` is no longer a field (the ladder's first tier is the min qty). */
export function normalizeCustomItem(rec = {}) {
  const personalizationOptions = normPersonalizationOptions(rec.personalizationOptions, rec.styleOptions, rec.style);
  return {
    id: str(rec.id) || 'ci-' + _rid(),
    name: decodeEntities(str(rec.name)),
    extraDetails: decodeEntities(str(rec.extraDetails)),
    itemID: str(rec.itemID),
    // Source product link (e.g. the hpgbrands.com page) — a button surfaces it
    // later. `source` tags where the item came from (e.g. 'hpg'); `sku` is the
    // supplier SKU (used to dedupe imports).
    link: str(rec.link),
    sku: str(rec.sku),
    source: str(rec.source),
    // Never persist a raw data: URL (would bloat storage + won't load in the
    // cart) — only keep an uploaded/pasted http(s) thumbnail.
    thumbnail: /^data:/i.test(str(rec.thumbnail)) ? '' : str(rec.thumbnail),
    description: str(rec.description),
    personalizationOptions,
    // Retain the string projection for older builds/importers.
    styleOptions: personalizationOptions.map((option) => option.name),
    breaks: normBreaks(rec.breaks, rec.price, rec.qty),
    costBreaks: normCostBreaks(rec.costBreaks),
    cost: num(rec.cost),
    leadTime: str(rec.leadTime),
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

/* Remove many custom items by id (one read + write). Returns the new list. */
export async function removeCustomItems(ids) {
  const set = new Set(ids || []);
  const list = await loadCustomItems();
  const next = list.filter((c) => !set.has(c.id));
  await _writeCustomItems(next);
  return next;
}

/* Wipe the entire custom-items library. Returns the number cleared. */
export async function clearCustomItems() {
  const list = await loadCustomItems();
  await _writeCustomItems([]);
  return list.length;
}

/* ── Product stores ──────────────────────────────────────────────────────────
   A curated set of custom items hosted on the backend and shared through an
   opaque link that persists until revoked. An admin picks items and creates a
   store; anyone with the link imports them without re-running an import. */

/* Create a store from custom-item records. Returns the backend store
   { id, name, url, item_count, … } — surface `url` as the shareable link. */
export async function createProductStore(name, items) {
  const clean = (items || []).map(normalizeCustomItem);
  const res = await sendBackgroundMessage('productStoreCreate', { name: (name || '').trim(), items: clean });
  if (!res || !res.ok) throw new Error((res && res.error) || 'Unable to create store');
  return res.store;
}

/* List the installation's active (unrevoked) stores. */
export async function listProductStores() {
  const res = await sendBackgroundMessage('productStoreList');
  if (!res || !res.ok) throw new Error((res && res.error) || 'Unable to list stores');
  return Array.isArray(res.stores) ? res.stores : [];
}

/* Revoke one store by id. */
export async function revokeProductStore(id) {
  const res = await sendBackgroundMessage('productStoreRevoke', { storeId: id });
  if (!res || !res.ok) throw new Error((res && res.error) || 'Unable to revoke store');
  return true;
}

/* Import a shared store (by link or id) into the local custom-items library.
   Dedupes by sku via addCustomItems. Returns { added, updated, name }. */
export async function importProductStore(linkOrId) {
  const res = await sendBackgroundMessage('productStoreFetch', { url: linkOrId });
  if (!res || !res.ok) throw new Error((res && res.error) || 'Unable to load store');
  const store = res.store || {};
  const items = Array.isArray(store.items) ? store.items : [];
  if (!items.length) return { added: 0, updated: 0, name: store.name || '' };
  const { added, updated } = await addCustomItems(items);
  return { added, updated, name: store.name || '' };
}

/* Build the durable, server-independent equivalent of a product-store link.
   The envelope is deliberately versioned and allowlists fields by normalizing
   every item, matching settings/email share files instead of depending on an
   undocumented dump of chrome.storage. */
export function buildProductStoreFile(name, items) {
  const safeName = str(name).slice(0, 120);
  if (!safeName) throw new Error('A product store name is required');
  if (!Array.isArray(items) || !items.length) throw new Error('Select at least one custom item');
  if (items.length > PRODUCT_STORE_FILE_MAX_ITEMS) {
    throw new Error(`Product stores can contain at most ${PRODUCT_STORE_FILE_MAX_ITEMS.toLocaleString('en-US')} items`);
  }
  return {
    schemaVersion: PRODUCT_STORE_FILE_VERSION,
    kind: PRODUCT_STORE_FILE_KIND,
    name: safeName,
    createdAt: new Date().toISOString(),
    items: items.map(normalizeCustomItem),
  };
}

/* Parse only the documented, versioned envelope. Raw arrays and backend
   responses are intentionally rejected so future migrations remain explicit. */
export function parseProductStoreFile(text) {
  const source = String(text || '');
  if (new TextEncoder().encode(source).byteLength > PRODUCT_STORE_FILE_MAX_BYTES) {
    throw new Error('Product store files must be 4 MB or smaller');
  }
  let raw;
  try { raw = JSON.parse(source); }
  catch (error) { throw new Error(`Not valid JSON — ${error.message}`); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.kind !== PRODUCT_STORE_FILE_KIND) {
    throw new Error('This is not a versioned Golfballs product store file');
  }
  if (raw.schemaVersion !== PRODUCT_STORE_FILE_VERSION) {
    throw new Error('This product store file version is not supported');
  }
  const name = str(raw.name).slice(0, 120);
  if (!name) throw new Error('The product store file is missing its name');
  if (!Array.isArray(raw.items) || !raw.items.length) throw new Error('The product store file has no custom items');
  if (raw.items.length > PRODUCT_STORE_FILE_MAX_ITEMS) {
    throw new Error(`Product stores can contain at most ${PRODUCT_STORE_FILE_MAX_ITEMS.toLocaleString('en-US')} items`);
  }
  return {
    schemaVersion: PRODUCT_STORE_FILE_VERSION,
    kind: PRODUCT_STORE_FILE_KIND,
    name,
    createdAt: str(raw.createdAt),
    items: raw.items.map(normalizeCustomItem),
    transport: 'json',
  };
}

/* Import a JSON store into the same local library used by link imports. */
export async function importProductStoreFile(text) {
  const store = parseProductStoreFile(text);
  const { added, updated } = await addCustomItems(store.items);
  return { added, updated, name: store.name, transport: 'json' };
}

/* Map a stored custom item → a synthetic catalog product the modal's ProductCard
   and addToProposal understand. `isCustom` + `custom` let the cart serializer
   route it to buildCustomItemLine instead of fetching a (non-existent) page. */
export function customItemToProduct(rec) {
  const ci = normalizeCustomItem(rec);     // migrate legacy on the fly
  const breaks = ci.breaks;
  const repo = repoOf(ci);
  return {
    id: 'custom-' + ci.id,
    isCustom: true,
    custom: ci,
    brand: 'Custom',
    // Short repo tag (HPG / SnugZ) shown beside the brand when imported.
    repoTag: repo ? REPOS[repo].label : null,
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
    costBreaks: ci.costBreaks,
    styleOptions: ci.styleOptions,
    personalizationOptions: ci.personalizationOptions,
    cost: ci.cost,
    setup: ci.setup,
    link: ci.link,
    source: ci.source,
    leadTime: ci.leadTime,
    tags: [],
  };
}
