/* ───────────────────────────────────────────────────────────────
   giftCatalog.js — Corporate Gifting Catalog data layer.

   Loads the gifting/events product catalog from golfballs.com's Solr
   feed (PUT /api/solr-refinement, routed through the background
   worker, CORS-immune) and normalizes each doc into the shape the
   GiftCatalog modal renders:

     { id, title, brand, cat, price, orig, logo, img, url,
       rating, reviews, mods, minQty, breaks:[{q,p}] }

   A bundled 43-product seed (the real values pulled from the same
   feed) backs the playground and any context without chrome.runtime,
   and is the fallback when the live fetch fails.
─────────────────────────────────────────────────────────────── */

import seed from './giftCatalogSeed.json';

export const GIFT_CATALOG_SEED = seed;

const PAGE_ROWS = 60;
const PER_CAT_MAX = 240; // per-category cap; the sum is the full catalog

/* Each Custom-Logo/<Category> page filters by its OWN itemType set (most
   also AND modificationName:"Custom Logo"). A single global query + a
   shared cap starved the long tail — popular golf balls filled the cap
   and towels/hats/etc. came back nearly empty. So we query per category,
   exactly as the live pages do, and tag each product with its category.
   (Divot Tools / Ball Markers are split by itemType — the live pages
   overlap them, but in a flat list they should land in one bucket.) */
const CATEGORY_QUERIES = [
  { cat: 'Logo Golf Balls', q: 'itemType_ss:(Consumer-Golf_Ball OR Consumer-Golf_Balls OR Corporate-Gift_Sets) AND modificationName_ss:("Custom Logo")' },
  { cat: 'Golf Shirts', q: 'itemType_ss:Corporate-Apparel-Shirts AND modificationName_ss:("Custom Logo")' },
  { cat: 'Golf Towels', q: 'itemType_ss:("Corporate-Towels" OR "Consumer-Accessories-Golf_Towels") AND modificationName_ss:("Custom Logo")' },
  { cat: 'Golf Hats', q: 'itemType_ss:("Corporate-Apparel-Hats") AND modificationName_ss:("Custom Logo")' },
  { cat: 'Divot Tools', q: 'itemType_ss:("Corporate-Divot_Tools") AND modificationName_ss:("Custom Logo")' },
  { cat: 'Logo Tees', q: 'itemType_ss:("Corporate-Golf-Golf_Tees")' },
  { cat: 'Logo Travel Bags', q: 'itemType_ss:("Corporate-Golf-Golf_Bags-Travel" OR "Corporate-Golf-Golf_Bags-Duffle" OR "Corporate-Golf-Golf_Bags-Shoe") AND modificationName_ss:("Custom Logo")' },
  { cat: 'Promotional Products', q: 'itemType_ss:("Corporate-Promotional_Products") AND modificationName_ss:("Custom Logo") -itemType_ss:"Corporate-Promotional_Products-Drinkware"' },
  { cat: 'Golf Umbrellas', q: 'itemType_ss:("Corporate-Umbrellas") AND modificationName_ss:("Custom Logo")' },
  { cat: 'Golf Gloves', q: 'itemType_ss:("Corporate-Apparel-Gloves" OR "Consumer-Apparel-Gloves") AND modificationName_ss:("Custom Logo")' },
  { cat: 'Custom Packaging', q: 'tag_ss:("CustomPackaging") AND modificationName_ss:("Custom Logo")' },
  { cat: 'Drinkware', q: 'itemType_ss:("Corporate-Promotional_Products-Drinkware") AND modificationName_ss:("Custom Logo")' },
  { cat: 'Golf Bags', q: 'itemType_ss:("Corporate-Golf-Golf_Bags-Cart" OR "Corporate-Golf-Golf_Bags-Staff" OR "Corporate-Golf-Golf_Bags-Stand" OR "Corporate-Golf-Golf_Bags-Headcovers") AND modificationName_ss:("Custom Logo")' },
  { cat: 'Ball Markers', q: 'itemType_ss:("Corporate-Ball_Markers") AND modificationName_ss:("Custom Logo")' },
  { cat: 'Outerwear', q: 'itemType_ss:Corporate-Apparel-Outerwear AND modificationName_ss:("Custom Logo")' },
];

/* Canonical "Shop by Type" + "Shop by Brand" taxonomies from the live
   custom-logo section — the rail/chips render in this order. */
export const CATEGORY_ORDER = [
  'Logo Golf Balls', 'Golf Shirts', 'Golf Towels', 'Golf Hats', 'Divot Tools',
  'Logo Tees', 'Logo Travel Bags', 'Promotional Products', 'Golf Umbrellas',
  'Golf Gloves', 'Custom Packaging', 'Drinkware', 'Golf Bags', 'Ball Markers', 'Outerwear',
];
export const BRAND_ORDER = [
  'Titleist', 'Callaway Golf', 'TaylorMade', 'Bridgestone', 'Srixon', 'Mizuno',
  'PXG', 'Pinnacle', 'Venture Golf', 'Vice Golf', 'Wilson',
];

const CACHE_KEY = 'gbGiftCatalogCache_v2'; // bumped: per-category query change invalidates old cache
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // re-index daily

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const round2 = (v) => (v == null ? null : Math.round(Number(v) * 100) / 100);

/* Promo codes ride on tag_ss (e.g. "EVERY12GETS6", "BUY12GET4FREE").
   Surface the first recognized one as a readable deal label so the
   product reads as on-sale. */
function parsePromo(tags) {
  if (!Array.isArray(tags)) return null;
  for (const t of tags) {
    const s = String(t);
    let m = /^BUY(\d+)GET(\d+)FREE$/i.exec(s);
    if (m) return { code: s, label: `Buy ${m[1]} get ${m[2]} free` };
    m = /^EVERY(\d+)GETS?(\d+)$/i.exec(s);
    if (m) return { code: s, label: `Buy ${m[1]} get ${m[2]} free` };
  }
  return null;
}

/* Strip the "(Decoration)" / "(Decorated)" qualifier the feed appends
   to custom-logo product names — every catalog item is decorated. */
const cleanTitle = (t) => String(t || '').replace(/\s*\((?:decorat(?:ion|ed)|custom logo)\)/ig, '').replace(/\s{2,}/g, ' ').trim();

/* Map a Solr doc to one of the canonical "Shop by Type" categories.
   itemType is coarse, so most signal is the title. Order matters —
   earlier checks win, so the more specific lines come first. */
function deriveCat(doc) {
  const it = String(doc.itemType_s || (doc.itemType_ss || []).join(' ')).toLowerCase();
  const t  = String(doc.title_s || doc.title_txt_en || '').toLowerCase();
  const has = (...ks) => ks.some((k) => t.includes(k));
  if (it.includes('golf_balls') || has('golf ball')) return 'Logo Golf Balls';
  if (has('towel'))                       return 'Golf Towels';
  if (has('umbrella'))                    return 'Golf Umbrellas';
  if (has('glove'))                       return 'Golf Gloves';
  if (has('divot'))                       return 'Divot Tools';
  if (has('ball marker') || has('hat clip') || has('marker')) return 'Ball Markers';
  if (has('travel bag', 'travel cover', 'shoe bag', 'duffel')) return 'Logo Travel Bags';
  if (has('cart bag', 'stand bag', 'golf bag', 'carry bag'))   return 'Golf Bags';
  if (has(' tee', 'tees', 'golf tee'))    return 'Logo Tees';
  if (has('jacket', 'pullover', 'vest', 'hoodie', 'quarter zip', '1/4 zip', 'outerwear')) return 'Outerwear';
  if (has('polo', 'shirt'))               return 'Golf Shirts';
  if (has('hat', 'cap', 'visor', 'beanie')) return 'Golf Hats';
  if (has('tumbler', 'mug', 'bottle', 'drinkware', 'flask', 'koozie', 'can cooler')) return 'Drinkware';
  if (has('tin', 'gift set', 'gift box', 'packaging', 'gift tube', 'sleeve') || it.includes('packaging')) return 'Custom Packaging';
  return 'Promotional Products';
}

/** Solr product doc → catalog product. */
export function normalizeDoc(doc) {
  if (!doc) return null;
  let breaks = [];
  try {
    const pb = JSON.parse(doc.customLogoPriceBreak_s || '{}');
    breaks = (pb.PriceBreak || [])
      .filter((b) => b && b.Quantity != null)
      .map((b) => ({ q: b.Quantity, p: round2(b.Price) }));
  } catch { /* no break ladder */ }

  const price = num(doc.price_d);
  const logo  = num(doc.price_CustomLogo_d);
  if (!breaks.length && price != null) breaks = [{ q: 1, p: round2(price) }];
  const orig = num(doc.originalPrice_d);

  return {
    id:      doc.id || doc.parentCode_s || '',
    title:   cleanTitle(doc.title_s || doc.title_txt_en || ''),
    brand:   doc.brand_s || '',
    cat:     deriveCat(doc),
    price:   round2(price),
    orig:    orig && orig > 0 ? round2(orig) : null,
    logo:    logo != null ? round2(logo) : null,
    img:     doc.image_s || '',
    url:     doc.product_url_s || '',
    rating:  doc.review_d ? Math.round(num(doc.review_d) * 10) / 10 : null,
    reviews: doc.reviewCount_i || 0,
    mods:    Array.isArray(doc.modificationName_ss) ? doc.modificationName_ss.length : 0,
    minQty:  (breaks[0] && breaks[0].q) || 1,
    breaks,
    promo:   parsePromo(doc.tag_ss),
  };
}

function fetchPage(searchTerm, start, rows) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { action: 'fetchGiftCatalog', searchTerm, start, rows },
        (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) { resolve({ docs: [], numFound: 0 }); return; }
          resolve({ docs: resp.docs || [], numFound: resp.numFound || 0 });
        },
      );
    } catch { resolve({ docs: [], numFound: 0 }); }
  });
}

/* Pull one category's full set (paginated), tagging each product with
   the category it came from rather than guessing via deriveCat. */
async function fetchCategory(cat, q) {
  const term = `${q} -tag_ss:DoNotIncludeinCatalog`;
  const items = [];
  let start = 0;
  while (start < PER_CAT_MAX) {
    const { docs, numFound } = await fetchPage(term, start, PAGE_ROWS);
    if (!docs.length) break;
    for (const d of docs) {
      const p = normalizeDoc(d);
      if (p && p.id) { p.cat = cat; items.push(p); }
    }
    start += PAGE_ROWS;
    if (numFound && start >= numFound) break;
  }
  return items;
}

function getCache() {
  return new Promise((resolve) => {
    try { chrome.storage.local.get(CACHE_KEY, (d) => resolve((d && d[CACHE_KEY]) || null)); }
    catch { resolve(null); }
  });
}
function setCache(payload) {
  try { chrome.storage.local.set({ [CACHE_KEY]: payload }); } catch { /* ignore */ }
}

/**
 * loadCatalog({ force }) — returns the gifting catalog. Served from a
 * 24-hour chrome.storage cache (re-indexed daily) so reopening the
 * modal is instant; only a stale/missing cache triggers the live Solr
 * pull. Falls back to the bundled seed when there's no chrome.runtime
 * (the playground) or the live fetch yields nothing.
 */
export async function loadCatalog({ force = false } = {}) {
  const hasChrome = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
  if (!hasChrome) return GIFT_CATALOG_SEED;

  const cached = await getCache();
  if (!force && cached && Array.isArray(cached.products) && cached.products.length
      && (Date.now() - (cached.ts || 0)) < CACHE_TTL_MS) {
    return cached.products;
  }

  // Fetch every category in parallel; merge in CATEGORY_ORDER so a
  // product shared by two categories keeps the earlier bucket.
  const lists = await Promise.all(CATEGORY_QUERIES.map(({ cat, q }) => fetchCategory(cat, q)));
  const out = [];
  const seenIds = new Set();
  for (const list of lists) {
    for (const p of list) {
      if (!seenIds.has(p.id)) { seenIds.add(p.id); out.push(p); }
    }
  }
  if (out.length) { setCache({ ts: Date.now(), products: out }); return out; }
  return (cached && cached.products) || GIFT_CATALOG_SEED;
}
