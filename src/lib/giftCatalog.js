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

/* The gifting/events catalog spans customizable golf balls plus the
   accessory lines (towels, tees, markers, gloves, gift packaging).
   Matches the itemTypes seen loading the catalog in the HAR. */
const GIFT_SEARCH_TERM =
  '-tag_ss:DoNotIncludeinCatalog itemType_ss:("Consumer-Golf_Balls" OR "Consumer-Accessories" OR "Consumer-Apparel-Gloves-Mens" OR "Consumer-Packaging-Tin")&sort=sort_default_i desc';
const PAGE_ROWS = 60;
const MAX_PRODUCTS = 240; // cap the live pull; sorted by popularity

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const round2 = (v) => (v == null ? null : Math.round(Number(v) * 100) / 100);

/* Fine category from itemType + title keywords (the Solr itemType is
   coarse — "Consumer-Accessories" — so the rail categories come from
   the product title). Order matters: hat clips/markers/divots overlap. */
function deriveCat(doc) {
  const it = String(doc.itemType_s || (doc.itemType_ss || []).join(' '));
  const t  = String(doc.title_s || doc.title_txt_en || '').toLowerCase();
  if (it.includes('Golf_Balls') || t.includes('golf ball')) return 'Golf Balls';
  if (t.includes('towel'))       return 'Towels';
  if (t.includes('hat clip'))    return 'Hat Clips';
  if (t.includes('poker chip'))  return 'Poker Chips';
  if (t.includes('divot'))       return 'Divot Tools';
  if (t.includes('ball marker') || t.includes('markers')) return 'Ball Markers';
  if (t.includes('glove'))       return 'Gloves';
  if (t.includes('tee'))         return 'Tees';
  if (t.includes('tin') || it.includes('Packaging')) return 'Packaging';
  if (it.includes('Gloves'))     return 'Gloves';
  return 'Accessories';
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
    title:   doc.title_s || doc.title_txt_en || '',
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
  };
}

function fetchPage(start, rows) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { action: 'fetchGiftCatalog', searchTerm: GIFT_SEARCH_TERM, start, rows },
        (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) { resolve({ docs: [], numFound: 0 }); return; }
          resolve({ docs: resp.docs || [], numFound: resp.numFound || 0 });
        },
      );
    } catch { resolve({ docs: [], numFound: 0 }); }
  });
}

/**
 * loadCatalog() — fetch the live gifting catalog (paginated), normalize,
 * and dedupe by id. Falls back to the bundled seed in contexts without
 * chrome.runtime (the playground) or when the live fetch yields nothing.
 */
export async function loadCatalog() {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
    return GIFT_CATALOG_SEED;
  }
  const out = [];
  const seenIds = new Set();
  let start = 0;
  while (start < MAX_PRODUCTS) {
    const { docs, numFound } = await fetchPage(start, PAGE_ROWS);
    if (!docs.length) break;
    for (const d of docs) {
      const p = normalizeDoc(d);
      if (p && p.id && !seenIds.has(p.id)) { seenIds.add(p.id); out.push(p); }
    }
    start += PAGE_ROWS;
    if (numFound && start >= numFound) break;
  }
  return out.length ? out : GIFT_CATALOG_SEED;
}
