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
    thumbnail: (rec.thumbnail || '').trim(),
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
