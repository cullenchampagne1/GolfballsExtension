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
import { loadDevSettings } from './devSettings.js';
import { decodeEntities } from './htmlEntities.js';

export { decodeEntities } from './htmlEntities.js';

export const GIFT_CATALOG_SEED = seed;

/** Cache lifetime, from the `giftCatalog.cacheHours` dev setting (default 24h;
 *  0 = always pull fresh). Falls back to 24h if settings are unavailable. */
async function cacheTtlMs() {
  try {
    const d = await loadDevSettings();
    const h = Number(d && d['giftCatalog.cacheHours']);
    return Number.isFinite(h) && h >= 0 ? h * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  } catch { return 24 * 60 * 60 * 1000; }
}

const PAGE_ROWS = 500;      // the API honors big pages — ~7 round-trips for the whole catalog
const MAX_PRODUCTS = 6000;  // safety bound, well above the live numFound (~3.1k); we paginate to it

/* The ENTIRE golfballs.com catalog. `*:*` (Solr match-all) is what the
   site's own search/category pages resolve to once every refinement is
   cleared — it returns every indexed product (~3,100), not just the
   ~990 custom-logo SKUs the old `modificationName_ss:"Custom Logo" OR
   itemType_ss:Corporate` query caught. We pull the lot so search finds
   anything the site sells; each product is then tagged customLogo (see
   isCustomLogo) and bucketed by department (deriveDept) / custom-logo
   category (deriveCat) on the client. Out-of-stock is excluded server-
   side via additionalFacets (-tag_ss:ExcludeStock) in the background. */
const MAIN_QUERY = '*:*';

/* Canonical "Shop by Type" + "Shop by Brand" taxonomies from the live
   custom-logo section — the custom-logo rail/chips render in this order. */
export const CATEGORY_ORDER = [
  'Logo Golf Balls', 'Golf Shirts', 'Golf Towels', 'Golf Hats', 'Divot Tools',
  'Logo Tees', 'Logo Travel Bags', 'Promotional Products', 'Golf Umbrellas',
  'Golf Gloves', 'Custom Packaging', 'Drinkware', 'Golf Bags', 'Ball Markers', 'Outerwear',
];
/* Top-level departments for the FULL catalog (everything golfballs.com
   sells, not just custom-logo). Each product gets one via deriveDept; the
   sidebar lists them under the collapsible custom-logo group. Order =
   render order; 'Other' is the catch-all and always trails. */
export const DEPT_ORDER = [
  'Golf Balls', 'Clubs', 'Apparel', 'Footwear', 'Golf Bags',
  'Accessories', 'Drinkware', 'Promotional Products', 'Gift Sets', 'Other',
];
export const BRAND_ORDER = [
  'Titleist', 'Callaway Golf', 'TaylorMade', 'Bridgestone', 'Srixon', 'Mizuno',
  'PXG', 'Pinnacle', 'Venture Golf', 'Vice Golf', 'Wilson',
];

const CACHE_KEY = 'gbGiftCatalogCache_v5'; // bumped: normalizeDoc now carries urlPath (the commission "_1" slug); a v4 cache predates it, so force a one-time re-index
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

/* Strip the "(Decoration)" / "{Decoration}" / "(Custom Logo)" qualifier the feed
   appends to custom-logo product names (in either parens or braces) — every
   catalog item is decorated. */
/* Decode HTML entities the Solr feed leaves in titles/brands (&amp;, &#39;,
   &quot;, numeric, even double-encoded) so a product never reads "Tees &amp; …". */
const cleanTitle = (t) => decodeEntities(String(t || '')).replace(/\s*[({](?:decorat(?:ion|ed)|custom logo)[)}]/ig, '').replace(/\s{2,}/g, ' ').trim();

/* Bucket a Solr doc into a canonical "Shop by Type" category by its
   itemType_ss (the field the live category pages filter on), with a
   title-keyword fallback for itemType-less docs (e.g. the seed). Order
   matters — more specific itemTypes win. */
function deriveCat(doc) {
  const tags = Array.isArray(doc.tag_ss) ? doc.tag_ss : [];
  if (tags.includes('CustomPackaging')) return 'Custom Packaging';
  const it = String(doc.itemType_s || (Array.isArray(doc.itemType_ss) ? doc.itemType_ss.join(' ') : '')).toLowerCase();
  if (it) {
    const hi = (...ks) => ks.some((k) => it.includes(k));
    if (hi('golf_ball', 'gift_sets'))         return 'Logo Golf Balls';
    if (hi('apparel-shirts'))                 return 'Golf Shirts';
    if (hi('apparel-outerwear'))              return 'Outerwear';
    if (hi('apparel-hats'))                   return 'Golf Hats';
    if (hi('apparel-gloves'))                 return 'Golf Gloves';
    if (hi('towels'))                         return 'Golf Towels';
    if (hi('golf_bags-travel', 'golf_bags-duffle', 'golf_bags-shoe')) return 'Logo Travel Bags';
    if (hi('golf_bags'))                      return 'Golf Bags';
    if (hi('golf_tees'))                      return 'Logo Tees';
    if (hi('promotional_products-drinkware')) return 'Drinkware';
    if (hi('umbrellas'))                      return 'Golf Umbrellas';
    if (hi('divot_tools'))                    return 'Divot Tools';
    if (hi('ball_markers'))                   return 'Ball Markers';
    if (hi('promotional_products'))           return 'Promotional Products';
  }
  const t = String(doc.title_s || doc.title_txt_en || doc.title || '').toLowerCase();
  const has = (...ks) => ks.some((k) => t.includes(k));
  if (has('golf ball'))                         return 'Logo Golf Balls';
  if (has('towel'))                             return 'Golf Towels';
  if (has('umbrella'))                          return 'Golf Umbrellas';
  if (has('glove'))                             return 'Golf Gloves';
  if (has('divot'))                             return 'Divot Tools';
  if (has('ball marker', 'hat clip', 'marker')) return 'Ball Markers';
  if (has('travel bag', 'duffel', 'shoe bag'))  return 'Logo Travel Bags';
  if (has('cart bag', 'stand bag', 'golf bag')) return 'Golf Bags';
  if (has(' tee', 'tees'))                      return 'Logo Tees';
  if (has('jacket', 'pullover', 'vest', 'quarter zip', 'outerwear')) return 'Outerwear';
  if (has('polo', 'shirt'))                     return 'Golf Shirts';
  if (has('hat', 'cap', 'visor'))              return 'Golf Hats';
  if (has('tumbler', 'mug', 'bottle', 'drinkware', 'flask')) return 'Drinkware';
  if (has('tin', 'gift set', 'packaging'))     return 'Custom Packaging';
  return 'Promotional Products';
}

/* Coarse top-level department for the FULL catalog (browse rail). Unlike
   deriveCat (custom-logo "Shop by Type"), this buckets EVERY product —
   consumer clubs, balls, apparel, footwear, bags, etc. itemType_s wins
   (e.g. "Consumer-Clubs-Putters"); a title-keyword fallback covers the
   seed and any itemType-less doc. Must return a value in DEPT_ORDER. */
function deriveDept(doc) {
  const it = String(doc.itemType_s || (Array.isArray(doc.itemType_ss) ? doc.itemType_ss.join(' ') : '')).toLowerCase();
  if (it) {
    if (it.includes('golf_ball'))                                  return 'Golf Balls';
    if (it.includes('clubs'))                                      return 'Clubs';
    if (it.includes('golf_bags') || it.includes('golf-golf_bags')) return 'Golf Bags';
    if (it.includes('shoe') || it.includes('footwear'))            return 'Footwear';
    if (it.includes('apparel') || /(shirt|polo|outerwear|pullover|jacket|hat|cap|visor|glove|sock|belt)/.test(it)) return 'Apparel';
    if (it.includes('drinkware'))                                  return 'Drinkware';
    if (it.includes('gift_set') || it.includes('gift_card'))       return 'Gift Sets';
    if (it.includes('promotional_products'))                       return 'Promotional Products';
    if (it.includes('accessories') || /(golf_tees|tools|towel|headcover|range_finder|ball_marker|divot|umbrella)/.test(it)) return 'Accessories';
  }
  const t = String(doc.title_s || doc.title_txt_en || doc.title || '').toLowerCase();
  if (/golf ball/.test(t))                                              return 'Golf Balls';
  if (/(driver|iron set|putter|wedge|fairway wood|hybrid|club|grip)/.test(t)) return 'Clubs';
  if (/(shoe|spikeless|sneaker)/.test(t))                              return 'Footwear';
  if (/(cart bag|stand bag|golf bag|duffel|backpack|travel bag)/.test(t)) return 'Golf Bags';
  if (/(polo|shirt|hat|cap|visor|glove|jacket|pullover|vest|sock|outerwear|belt)/.test(t)) return 'Apparel';
  if (/(tumbler|mug|bottle|flask|drinkware|cooler|can cooler)/.test(t)) return 'Drinkware';
  if (/(gift set|gift card|tin)/.test(t))                              return 'Gift Sets';
  if (/(tee|towel|marker|divot|umbrella|headcover|tool|rangefinder|range finder)/.test(t)) return 'Accessories';
  return 'Other';
}

/* Is this product custom-logo capable? Reproduces the OLD catalog query
   (modificationName_ss:"Custom Logo" OR itemType_ss:Corporate) so the
   sidebar's "Custom Logo" group holds exactly the items the catalog used
   to show — now a subset of the full feed. */
function isCustomLogo(doc) {
  const mods = Array.isArray(doc.modificationName_ss) ? doc.modificationName_ss : [];
  if (mods.includes('Custom Logo')) return true;
  const it = String(doc.itemType_s || (Array.isArray(doc.itemType_ss) ? doc.itemType_ss.join(' ') : '')).toLowerCase();
  return it.includes('corporate');
}

/** product_url_s is a site-relative path (e.g. "/Golf-Balls/…"); make it an
    absolute golfballs.com URL so a background fetch doesn't resolve it against
    the extension's own origin (chrome-extension://…). */
function absoluteProductUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith('/') ? path : '/' + path;
  return 'https://www.golfballs.com' + p + (/\.html?$/i.test(p) ? '' : '.htm');
}

/** property_*_ss facet fields → [{ label, options }] (the common base options
    the catalog faceted, e.g. Accessories Color, Apparel Color, Apparel Size). */
function extractProperties(doc) {
  return Object.keys(doc)
    .filter((k) => /^property_.+_ss$/.test(k) && Array.isArray(doc[k]) && doc[k].length)
    .map((k) => ({ label: k.replace(/^property_/, '').replace(/_ss$/, '').replace(/_/g, ' ').trim(), options: doc[k] }));
}
/** price_<Mod>_d fields → { Mod: price } (per-modification price). */
function extractPrices(doc) {
  const out = {};
  Object.keys(doc).filter((k) => /^price_.+_d$/.test(k)).forEach((k) => {
    out[k.replace(/^price_/, '').replace(/_d$/, '')] = round2(num(doc[k]));
  });
  return out;
}

/** Solr product doc → catalog product. Carries the rich fields that drive the
    customizer UI (modifications, base properties, second-pole/bundle variant,
    pricing) instead of discarding them. */
export function normalizeDoc(doc) {
  if (!doc) return null;
  let breaks = [];
  let productionTime = null;
  try {
    const pb = JSON.parse(doc.customLogoPriceBreak_s || '{}');
    breaks = (pb.PriceBreak || [])
      .filter((b) => b && b.Quantity != null)
      .map((b) => ({ q: b.Quantity, p: round2(b.Price) }));
    if (pb.ProductionTime != null) productionTime = pb.ProductionTime;
  } catch { /* no break ladder */ }

  let customData = {};
  try { customData = JSON.parse(doc.customData_s || '{}'); } catch { /* none */ }

  const price = num(doc.price_d);
  const logo  = num(doc.price_CustomLogo_d);
  if (!breaks.length && price != null) breaks = [{ q: 1, p: round2(price) }];
  const orig = num(doc.originalPrice_d);

  return {
    id:      doc.id || doc.parentCode_s || '',
    parentCode: doc.parentCode_s || '',                 // order line items reference this; keep it for by-id matching
    sku:     customData.parentSku || doc.parentCode_s || '', // human SKU (parentSku, e.g. "M6594"); falls back to the product code
    title:   cleanTitle(doc.title_s || doc.title_txt_en || ''),
    brand:   decodeEntities(doc.brand_s || ''),
    cat:     deriveCat(doc),                             // custom-logo "Shop by Type" bucket
    dept:    deriveDept(doc),                            // full-catalog department bucket
    customLogo: isCustomLogo(doc),                       // in the old custom-logo catalog? (drives the $ badge)
    // Customizable = carries ANY decoration modification (Custom Logo,
    // Personalized, Monogram, Photo, Ball Marker, …) — broader than customLogo.
    // Drives whether the detail panel shows the customization UI (e.g. a
    // "Personalized Ball Marker" hat clip is customizable but not custom-logo).
    customizable: Array.isArray(doc.modificationName_ss) && doc.modificationName_ss.length > 0,
    itemType: doc.itemType_s || (Array.isArray(doc.itemType_ss) && doc.itemType_ss[0]) || '',
    price:   round2(price),
    orig:    orig && orig > 0 ? round2(orig) : null,
    logo:    logo != null ? round2(logo) : null,
    img:     doc.image_s || '',
    url:     absoluteProductUrl(doc.product_url_s),
    // Raw site path (e.g. "/Golf-Balls/…_1"). Custom-logo SKUs carry the "_1"
    // commissionable slug; the cart line keeps it for an imprinted order and
    // strips it for a plain/retail order (see saveProposal).
    urlPath: doc.product_url_s || '',
    rating:  doc.review_d ? Math.round(num(doc.review_d) * 10) / 10 : null,
    reviews: doc.reviewCount_i || 0,
    mods:    Array.isArray(doc.modificationName_ss) ? doc.modificationName_ss.length : 0,
    modNames: Array.isArray(doc.modificationName_ss) ? doc.modificationName_ss : [],
    properties: extractProperties(doc),     // common base inputs (color/size) from the catalog facets
    prices:  extractPrices(doc),            // per-modification price (price_CustomLogo_d, …)
    // Gift-set sleeve overlay asset (e.g. "sleeve-overlay-titleist-pro-v1") — drives
    // the per-ball gift-set sleeve PREVIEW render; absent on most balls (sleeve falls
    // back to a brand overlay). Presence does NOT gate gift-set availability.
    giftSetSleeveImage: customData.giftSetSleeveImage || null,
    dualPole: customData.variant === 'dualPole',                                   // → second-pole imprint (opt-in, accessories)
    // Balls offer a second-pole imprint by DEFAULT; this tag (on Triple Track
    // lines, whose alignment art wraps the ball) removes it. Authoritative signal.
    excludeDualPole: Array.isArray(doc.tag_ss) && doc.tag_ss.some((t) => /ExcludeDualPole/i.test(t)),
    bundleItems: customData.bundleItems ? customData.bundleItems.split(',').map((s) => s.trim()).filter(Boolean) : null,
    tags:    Array.isArray(doc.tag_ss) ? doc.tag_ss : [],
    productionTime,
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
          if (chrome.runtime.lastError || !resp || !resp.ok) {
            resolve({ docs: [], numFound: 0, error: chrome.runtime.lastError?.message || (resp && resp.error) || 'request failed' });
            return;
          }
          resolve({ docs: resp.docs || [], numFound: resp.numFound || 0 });
        },
      );
    } catch (e) { resolve({ docs: [], numFound: 0, error: String(e) }); }
  });
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

/** Wipe the cached catalog (current + any legacy-version keys) so the next
 *  load starts from a clean slate. Used by the modal's "Rebuild index" so a
 *  rebuild truly clears stale data instead of falling back to the old cache. */
export function clearCatalogCache() {
  return new Promise((resolve) => {
    try { chrome.storage.local.remove([CACHE_KEY, 'gbGiftCatalogCache_v1', 'gbGiftCatalogCache_v2', 'gbGiftCatalogCache_v3'], resolve); }
    catch { resolve(); }
  });
}

/** Read the cached catalog WITHOUT triggering a live pull — for an instant
 *  first paint. Returns { products, ts, stale }: products is null when the
 *  cache is empty/absent; stale is true when older than the re-index
 *  interval (or there's nothing cached). The modal paints `products`
 *  immediately, then refreshes in the background when stale. */
export async function readCatalogCache() {
  const cached = await getCache();
  if (!cached || !Array.isArray(cached.products) || !cached.products.length) {
    return { products: null, ts: 0, stale: true };
  }
  const ttl = await cacheTtlMs();
  const stale = ttl > 0 && (Date.now() - (cached.ts || 0)) >= ttl;
  return { products: cached.products, ts: cached.ts || 0, stale };
}

/**
 * loadCatalog({ force, onProgress }) — returns the full catalog. Served
 * from a 24-hour chrome.storage cache (re-indexed daily) so reopening the
 * modal is instant; only a stale/missing cache triggers the live Solr
 * pull. Falls back to the bundled seed when there's no chrome.runtime
 * (the playground) or the live fetch yields nothing.
 *
 * onProgress({ loaded, total }) fires after each page so the modal can
 * show an "Indexing 1,240 / 3,111" readout + progress bar during a pull.
 */
export async function loadCatalog({ force = false, onProgress } = {}) {
  const hasChrome = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
  if (!hasChrome) return GIFT_CATALOG_SEED;

  const cached = await getCache();
  const ttl = await cacheTtlMs();
  if (!force && ttl > 0 && cached && Array.isArray(cached.products) && cached.products.length
      && (Date.now() - (cached.ts || 0)) < ttl) {
    return cached.products;
  }

  // One paginated pull of the full catalog query, to the live numFound.
  const out = [];
  const seenIds = new Set();
  let start = 0;
  let lastError = null;
  while (start < MAX_PRODUCTS) {
    const { docs, numFound, error } = await fetchPage(MAIN_QUERY, start, PAGE_ROWS);
    if (error) lastError = error;
    if (!docs.length) break;
    for (const d of docs) {
      const p = normalizeDoc(d);
      if (p && p.id && !seenIds.has(p.id)) { seenIds.add(p.id); out.push(p); }
    }
    start += PAGE_ROWS;
    if (typeof onProgress === 'function') {
      try { onProgress({ loaded: out.length, total: numFound || 0 }); } catch { /* non-fatal */ }
    }
    if (numFound && start >= numFound) break;
  }
  if (out.length) { setCache({ ts: Date.now(), products: out }); return out; }
  // A MANUAL refresh (force) that pulls nothing must NOT silently fall back to
  // the old cache / bundled seed — that's exactly the "I refreshed but still see
  // old pricing" trap. Surface it so the caller can tell the user. First open
  // (no force) still degrades gracefully to cache/seed.
  if (force) throw new Error(lastError || 'No products returned from the catalog service');
  return (cached && cached.products) || GIFT_CATALOG_SEED;
}
