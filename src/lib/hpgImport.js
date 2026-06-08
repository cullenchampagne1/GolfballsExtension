/* ───────────────────────────────────────────────────────────────────────────
   hpgImport.js — import customizable hpgbrands.com products as custom items.

   Two phases:
     1. List — page the Searchspring feed (siteId brmth7, no query = whole
        catalog) and KEEP only products that have customization available
        (a non-empty `custom_search_decoration`). Gives name / description /
        image / link / SKU / brand.
     2. Detail — for each kept product, fetch its detail page (in the background,
        parsed there) for the real per-quantity NET COST ladder + the option
        values (colors / flavors). Throttled with reasonable delays.

   Pricing (constants below):
     OUR PRICE(qty) = ( netCost(qty) + SETUP/qty + SHIP_PER_UNIT ) / (1 − MARGIN)
   e.g. net 1.33 @500 → (1.33 + 48/500 + 0.10)/0.6 = $2.54.
   The net ladder is also stored as per-tier cost (costBreaks) for margin, and the
   options become the item's Style options.

   This is meant to run ONCE — results are saved to chrome.storage (deduped by SKU).
   ─────────────────────────────────────────────────────────────────────────── */

import { addCustomItems } from './customItems.js';

const SS_URL = 'https://brmth7.a.searchspring.io/api/search/search.json';
const SS_DOMAIN = 'https://hpgbrands.com/search/';
const HPG_PUBLIC = 'https://hpgbrands.com';

// ── Pricing model (tweak freely) ─────────────────────────────────────────────
const MARGIN = 0.40;          // gross margin on landed cost
const SETUP = 48;             // flat setup charge, amortized per qty tier
const SHIP_PER_UNIT = 0.10;   // flat per-unit shipping

// ── Throttle ─────────────────────────────────────────────────────────────────
const CONCURRENCY = 4;        // detail pages in flight at once
const BATCH_DELAY_MS = 250;   // pause between batches (be a good citizen)

const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round(n * 100) / 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function plainText(html) {
  if (!html) return '';
  try { return (new DOMParser().parseFromString(String(html), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim(); }
  catch { return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
}
function publicLink(url) {
  return url ? url.replace(/^https?:\/\/[^/]*mybigcommerce\.com/i, HPG_PUBLIC) : '';
}
function hasDecoration(r) {
  const d = r.custom_search_decoration;
  return Array.isArray(d) ? d.length > 0 : !!(d && String(d).trim());
}

/* Phase 1 — page the catalog, keep customizable products. Returns base records. */
export async function fetchHpgList({ perPage = 100, onProgress, maxPages = 500 } = {}) {
  const out = [];
  let page = 1, totalPages = 1, total = 0;
  while (page <= totalPages && page <= maxPages) {
    const url = `${SS_URL}?siteId=brmth7&resultsFormat=native&resultsPerPage=${perPage}&page=${page}&domain=${encodeURIComponent(SS_DOMAIN)}`;
    let data;
    try { const r = await sendBg('fetchRaw', { url }); data = JSON.parse(r.text || '{}'); }
    catch (e) { if (page === 1) throw e; break; }
    const results = Array.isArray(data.results) ? data.results : [];
    for (const r of results) {
      if (!hasDecoration(r)) continue;
      const link = publicLink(r.url || '');
      if (!link) continue;
      out.push({
        name: r.name || r.sku || 'HPG product',
        description: plainText(r.description),
        thumbnail: (r.imageUrl || r.ss_image || r.thumbnailImageUrl || '').replace('/300x300/', '/500x500/'),
        sku: r.sku || '',
        brand: r.brand || '',
        eqp: num(r.price || r.calculated_price || r.msrp),
        moq: num(r.custom_search_moq) || 1,
        link,
      });
    }
    const pg = data.pagination || {};
    totalPages = pg.totalPages || page; total = pg.totalResults || 0;
    if (onProgress) onProgress({ phase: 'list', page, totalPages, kept: out.length, total });
    if (!results.length) break;
    page += 1;
  }
  return out;
}

/* Build the price + cost ladders from a parsed net ladder ([{q, v:netCost}]). */
function laddersFromNet(net) {
  const breaks = [];
  const costBreaks = [];
  for (const t of net) {
    const price = round2((t.v + SETUP / t.q + SHIP_PER_UNIT) / (1 - MARGIN));
    breaks.push({ q: t.q, p: price });
    costBreaks.push({ q: t.q, c: round2(t.v) });
  }
  return { breaks, costBreaks };
}

/* Merge a base (listing) record + parsed detail → a custom-item record. */
function toRecord(base, detail) {
  let breaks, costBreaks, cost;
  if (detail && detail.net && detail.net.length) {
    ({ breaks, costBreaks } = laddersFromNet(detail.net));
    cost = costBreaks[0].c;
  } else {
    // No net ladder found — fall back to the public EQP price (cost ≈ 60%).
    const q = (detail && detail.moq) || base.moq || 1;
    const price = base.eqp || 0;
    breaks = [{ q, p: round2((price * 0.6 + SETUP / q + SHIP_PER_UNIT) / (1 - MARGIN)) }];
    costBreaks = [{ q, c: round2(price * 0.6) }];
    cost = costBreaks[0].c;
  }
  const options = (detail && detail.options) || [];
  return {
    name: base.name,
    description: base.description,
    thumbnail: base.thumbnail,
    sku: base.sku,
    itemID: base.sku,
    extraDetails: base.brand,
    link: base.link,
    source: 'hpg',
    styleOptions: options,
    breaks,
    costBreaks,
    cost,
    weight: (detail && detail.weight) || 0,
    leadTime: (detail && detail.leadTime) || '',
  };
}

/* Phase 2 — fetch + parse each detail page, throttled. Returns full records. */
export async function enrichHpg(list, { onProgress } = {}) {
  const records = [];
  let done = 0;
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(batch.map(async (base) => {
      try { const r = await sendBg('hpgDetail', { url: base.link }); return toRecord(base, r.data); }
      catch { return toRecord(base, null); }   // keep the product with fallback pricing
    }));
    records.push(...settled);
    done += batch.length;
    if (onProgress) onProgress({ phase: 'detail', count: done, total: list.length });
    if (i + CONCURRENCY < list.length) await sleep(BATCH_DELAY_MS);
  }
  return records;
}

/* Full import: list → enrich → save. Resolves to { fetched, added, updated }. */
export async function importHpgCatalog({ onProgress } = {}) {
  const list = await fetchHpgList({ onProgress });
  if (!list.length) throw new Error('No customizable products found on hpgbrands');
  const records = await enrichHpg(list, { onProgress });
  const res = await addCustomItems(records);
  return { fetched: records.length, added: res.added, updated: res.updated };
}
