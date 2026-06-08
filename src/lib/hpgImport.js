/* ───────────────────────────────────────────────────────────────────────────
   hpgImport.js — import the full hpgbrands.com catalog as custom items.

   hpgbrands.com runs its product browse on Searchspring (siteId brmth7). The
   no-query search returns the entire catalog (~3,986 products, 24/page). We page
   through it, map each product, and bulk-save them as custom items (which
   serialize to SERVICEITEM cart lines).

   Pricing (constants below — tweak freely):
     • HPG lists a single public price per product (its EQP price).
     • OUR PRICE  = HPG price × (1.19 / 1.98)   — "$1.98 theirs ≈ $1.19 ours".
     • OUR COST   = OUR PRICE × (1 − 0.40)       — a 40% gross margin.
   The listing feed has ONE price + an MOQ (no per-qty breaks — those live on each
   detail page), so the ladder is a single tier at the MOQ. We also keep the
   public product link, the supplier SKU, name, description, and first image.
   ─────────────────────────────────────────────────────────────────────────── */

import { addCustomItems } from './customItems.js';

const SS_URL = 'https://brmth7.a.searchspring.io/api/search/search.json';
const SS_DOMAIN = 'https://hpgbrands.com/search/';
const HPG_PUBLIC = 'https://hpgbrands.com';

// ── Pricing model ────────────────────────────────────────────────────────────
const PRICE_RATIO = 1.19 / 1.98;   // our price as a fraction of HPG's public price
const MARGIN = 0.40;               // our cost = price × (1 − margin)

const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round(n * 100) / 100;
const ourPrice = (hpg) => round2(num(hpg) * PRICE_RATIO);
const ourCost = (price) => round2(price * (1 - MARGIN));

function sendBg(action, payload = {}) {
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

/* Strip HTML tags + decode entities from a description. */
function plainText(html) {
  if (!html) return '';
  try { return (new DOMParser().parseFromString(String(html), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim(); }
  catch { return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
}

/* The feed's url is the backing mybigcommerce store; map it to the public site. */
function publicLink(url) {
  if (!url) return '';
  return url.replace(/^https?:\/\/[^/]*mybigcommerce\.com/i, HPG_PUBLIC);
}

/* Map a Searchspring result → a custom-item record (null if it has no price). */
export function mapHpgProduct(r) {
  const hpg = num(r.price || r.calculated_price || r.msrp);
  if (!hpg) return null;
  const price = ourPrice(hpg);
  const moq = num(r.custom_search_moq) || 1;
  const img = (r.imageUrl || r.ss_image || r.thumbnailImageUrl || '').replace('/300x300/', '/500x500/');
  return {
    name: r.name || r.sku || 'HPG product',
    description: plainText(r.description),
    thumbnail: img,
    sku: r.sku || '',
    itemID: r.sku || '',
    extraDetails: r.brand || '',
    link: publicLink(r.url || ''),
    source: 'hpg',
    styleOptions: [],
    breaks: [{ q: moq, p: price }],
    cost: ourCost(price),
  };
}

/* Page through the entire HPG Searchspring catalog. `onProgress({page,totalPages,
   count,total})` fires after each page. Returns the mapped records. */
export async function fetchHpgProducts({ perPage = 100, onProgress, maxPages = 500 } = {}) {
  const out = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= maxPages) {
    const url = `${SS_URL}?siteId=brmth7&resultsFormat=native&resultsPerPage=${perPage}&page=${page}&domain=${encodeURIComponent(SS_DOMAIN)}`;
    let data;
    try { const r = await sendBg('fetchRaw', { url }); data = JSON.parse(r.text || '{}'); }
    catch (e) { if (page === 1) throw e; break; }   // first-page failure is fatal; later pages stop the loop
    const results = Array.isArray(data.results) ? data.results : [];
    for (const res of results) { const m = mapHpgProduct(res); if (m) out.push(m); }
    const pg = data.pagination || {};
    totalPages = pg.totalPages || page;
    if (onProgress) onProgress({ page, totalPages, count: out.length, total: pg.totalResults || 0 });
    if (!results.length) break;
    page += 1;
  }
  return out;
}

/* Fetch + import the whole HPG catalog into the custom-items library. Resolves to
   { fetched, added, updated }. Re-running updates by SKU (no duplicates). */
export async function importHpgCatalog({ onProgress } = {}) {
  const records = await fetchHpgProducts({ onProgress });
  if (!records.length) throw new Error('No products returned from hpgbrands');
  const res = await addCustomItems(records);
  return { fetched: records.length, added: res.added, updated: res.updated };
}
