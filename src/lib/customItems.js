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

/* Normalize a form record into the stored shape (coerce numerics, trim). */
export function normalizeCustomItem(rec = {}) {
  return {
    id: rec.id || 'ci-' + _rid(),
    name: (rec.name || '').trim(),
    style: (rec.style || '').trim(),
    extraDetails: (rec.extraDetails || '').trim(),
    itemID: (rec.itemID || '').trim(),
    // Never persist a raw data: URL (would bloat storage + won't load in the
    // cart) — only keep an uploaded/pasted http(s) thumbnail.
    thumbnail: /^data:/i.test(rec.thumbnail || '') ? '' : (rec.thumbnail || '').trim(),
    description: (rec.description || '').trim(),
    price: num(rec.price),
    setup: num(rec.setup),
    qty: num(rec.qty) || 1,
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

export async function removeCustomItem(id) {
  const list = await loadCustomItems();
  const next = list.filter((c) => c.id !== id);
  await _writeCustomItems(next);
  return next;
}

/* Map a stored custom item → a synthetic catalog product the modal's ProductCard
   and addToProposal understand. `isCustom` + `custom` let the cart serializer
   route it to buildCustomItemLine instead of fetching a (non-existent) page. */
export function customItemToProduct(ci) {
  const title = (ci.name || 'Custom item') + (ci.style ? ' ' + ci.style : '');
  const qty = num(ci.qty) || 1;
  const price = num(ci.price);
  return {
    id: 'custom-' + ci.id,
    isCustom: true,
    custom: ci,
    brand: 'Custom',
    title,
    sku: ci.itemID || '',
    price,
    orig: null,
    logo: null,
    customLogo: false,
    customizable: false,
    img: ci.thumbnail || '',
    url: null,
    urlPath: '',
    rating: null,
    reviews: 0,
    minQty: qty,
    breaks: [{ q: qty, p: price }],
    setup: num(ci.setup),
    tags: [],
  };
}
