/**
 * Gift catalog pagination completeness.
 *
 * The catalog is pulled page by page over chrome.runtime (fetchGiftCatalog).
 * A regression once combined a client stride of PAGE_ROWS (500) with a
 * background handler that capped each page at 200 rows: the loop asked for 500,
 * got 200, then advanced `start` by 500 — stepping over rows 200-499 of every
 * window and silently dropping ~60% of the catalog (3,553 → ~1,378). Worse, it
 * declared the pull "complete" (start >= numFound) and cached the truncated set,
 * so the Rebuild button never recovered the missing products.
 *
 * This drives the REAL loadCatalog against a fake chrome whose "server" caps
 * every page at 200 rows (the old backend behavior). loadCatalog must still
 * collect EVERY product — proving it advances by the rows actually returned,
 * not a fixed stride.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Build a fake catalog of unique docs the "server" will page over.
const TOTAL = 1000;
const CATALOG = Array.from({ length: TOTAL }, (_, i) => ({
  id: `guid-${i}`,
  parentCode_s: `P${String(i).padStart(5, '0')}`,
  title_s: `Product ${i}`,
  brand_s: 'Golfballs.com',
  price_d: 9.99,
  itemType_ss: ['Consumer-Accessories'],
}));
const RECOVERY_LOGO = {
  id: 'taylormade-tp5-logo-2026',
  parentCode_s: 'P-TP5-LOGO',
  title_s: 'TaylorMade TP5 Custom Logo Golf Balls 2026 Model',
  brand_s: 'TaylorMade',
  price_d: 57.99,
  product_url_s: '/Golf-Balls/TaylorMade-TP5-Custom-Logo-Golf-Balls-2026-Model',
  itemType_ss: ['Consumer-Golf_Ball'],
  modificationName_ss: ['Custom Logo'],
  // The live doc's real tags (P012Y9): a specially-priced pre-order line that
  // carries ExcludeStock without being dead stock. The broad crawl's
  // `-tag_ss:ExcludeStock` filter used to erase it, so custom-logo TP5s never
  // appeared in the modal at all.
  tag_ss: ['PromotionExcludePercentOff', 'PreOrder', 'ExcludeStock', 'PromotionPRINTED', '2026', 'TM2026'],
};

/* The live TP5 Custom Logo product page (P012Y9), trimmed to the fields
   rawProductToDoc maps. A specially-priced commissionable SKU is its OWN
   product at its own URL — not the usual "<slug>_1" variant of a stock item —
   so when the feed doesn't return it, no crawl can find it and a rep cannot
   quote it at all. It is imported from the page instead. */
const TP5_IMPORT_URL = 'https://www.golfballs.com/Golf-Balls/TaylorMade-TP5-Custom-Logo-Golf-Balls-2026-Model/TP5-Custom-Logo-Golf-Balls-2026-Model.htm';
const TP5_RAW = {
  ShortCode: 'P012Y9',
  Name: 'TP5 Custom Logo Golf Balls - 2026 Model',
  Brand: { Name: 'TaylorMade' },
  ItemType: { Name: 'Golf Balls', ItemTypeParent: { Name: 'Consumer', ItemTypeParent: null } },
  CustomData: { parentSku: 'B5951', standardMapPrice: '57.99' },
  ProductTagDetail: [{ Name: 'PreOrder' }, { Name: 'ExcludeStock' }, { Name: 'TM2026' }],
  ProductModification: [{ Modification: { modificationID: 9, FriendlyName: 'Custom Logo' } }],
  itemFee_priceBreakHeader: {
    PriceBreak: [
      { Quantity: 1, Price: 60.99 }, { Quantity: 12, Price: 58.99 }, { Quantity: 24, Price: 57.99 },
      { Quantity: 48, Price: 56.99 }, { Quantity: 120, Price: 55.99 }, { Quantity: 240, Price: 54.99 },
      { Quantity: 500, Price: 53.99 },
    ],
  },
  ProductUrl: [
    { productChildID: null, URL: '/Golf-Balls/TaylorMade-TP5-Custom-Logo-Golf-Balls-2026-Model' },
    { productChildID: 446222, URL: '/Golf-Balls/TaylorMade-TP5-Custom-Logo-Golf-Balls-2026-Model/TP5-Custom-Logo-Golf-Balls-2026-Model' },
  ],
  ProductImage: [{ URL: 'assets/products/P012Y9/TP5-Custom-Logo-Golf-Balls.jpg' }],
  ProductReview: [],
  ReviewCount: null,
};
const IMPORT_PAGES = { [TP5_IMPORT_URL]: TP5_RAW };

// The bug's fingerprint: the backend hands back at most SERVER_CAP rows per
// page even when the client asks for more.
const SERVER_CAP = 200;

let store = {};
let loadCatalog;
let normalizeCatalogDocs;
let rawProductToDoc;
let normalizeDoc;
let CATALOG_IMPORT_URLS;
// Every fetchGiftCatalog message the "server" saw, so a test can assert the
// custom-logo recovery crawl lifted the out-of-stock filter.
let requests = [];

before(async () => {
  store = {};
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (msg, cb) => {
        if (msg.action === 'fetchProductRaw') {
          cb(IMPORT_PAGES[msg.url] ? { ok: true, product: IMPORT_PAGES[msg.url] } : { ok: false, error: 'HTTP 404' });
          return;
        }
        if (msg.action !== 'fetchGiftCatalog') { cb({ ok: false }); return; }
        requests.push({ searchTerm: msg.searchTerm, includeExcludedStock: !!msg.includeExcludedStock });
        const start = Number(msg.start) || 0;
        const rows = Math.min(SERVER_CAP, Number(msg.rows) || 60); // cap, as the old backend did
        let source = msg.searchTerm === '*:*' ? CATALOG : [RECOVERY_LOGO];
        // The real gateway applies `-tag_ss:ExcludeStock` server-side unless the
        // caller drops it, so the fake does too.
        if (!msg.includeExcludedStock) {
          source = source.filter((doc) => !(doc.tag_ss || []).includes('ExcludeStock'));
        }
        const docs = source.slice(start, start + rows);
        cb({ ok: true, docs, numFound: source.length });
      },
    },
    storage: {
      local: {
        get: (key, cb) => cb({ [key]: store[key] }),
        set: (obj) => { Object.assign(store, obj); },
        remove: (keys, cb) => { (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete store[k]); if (cb) cb(); },
      },
    },
  };
  ({ loadCatalog, normalizeCatalogDocs, rawProductToDoc, normalizeDoc, CATALOG_IMPORT_URLS } = await import('../../src/lib/giftCatalog.js'));
});

after(() => { delete globalThis.chrome; });

describe('gift catalog · pagination completeness', () => {
  it('collects every product even when the server caps pages below the client stride', async () => {
    requests = [];
    const products = await loadCatalog({ force: true });
    assert.equal(products.length, TOTAL + 2,
      `expected all ${TOTAL} broad-crawl products, the custom-logo recovery result, and the URL import`);
    // no gaps: every parentCode present exactly once
    const codes = new Set(products.map((p) => p.parentCode));
    assert.equal(codes.size, TOTAL + 2);
    assert.ok(codes.has('P00250') && codes.has('P00777'),
      'products inside the previously-skipped windows must be present');
    assert.ok(codes.has('P-TP5-LOGO'), 'the focused custom-logo crawl must recover a listing omitted by the broad crawl');
  });

  it('catalogs a specially-priced custom-logo product the stock filter excludes', () => {
    // The broad `*:*` sweep keeps `-tag_ss:ExcludeStock` (out-of-stock retail
    // has no business in the catalog); the custom-logo recovery crawl must NOT,
    // or a PreOrder/ExcludeStock-tagged custom-logo SKU is never cataloged and
    // never shows in the modal.
    const broad = requests.filter((r) => r.searchTerm === '*:*');
    const logo = requests.filter((r) => r.searchTerm !== '*:*');
    assert.ok(broad.length > 0 && logo.length > 0, 'both crawls must run');
    assert.ok(broad.every((r) => r.includeExcludedStock === false), 'the broad sweep keeps the stock filter');
    assert.ok(logo.every((r) => r.includeExcludedStock === true), 'the custom-logo crawl lifts the stock filter');
  });

  it('caches the full pull so a reopen serves the complete set', async () => {
    const products = await loadCatalog({ force: false }); // served from cache written above
    assert.equal(products.length, TOTAL + 2);
  });

  it('keeps stock and commissionable custom-logo documents that share one Solr id', () => {
    const shared = {
      id: 'taylormade-tp5-2026',
      parentCode_s: 'P-TP5',
      title_s: 'TaylorMade TP5 Golf Balls 2026 Model',
      brand_s: 'TaylorMade',
      price_d: 57.99,
      itemType_ss: ['Consumer-Golf_Ball'],
    };
    const products = normalizeCatalogDocs([
      { ...shared, product_url_s: '/Golf-Balls/TaylorMade-TP5-Golf-Balls-2026-Model' },
      {
        ...shared,
        title_s: 'TaylorMade TP5 Custom Logo Golf Balls 2026 Model',
        product_url_s: '/Golf-Balls/TaylorMade-TP5-Custom-Logo-Golf-Balls-2026-Model',
        modificationName_ss: ['Custom Logo'],
        customLogoPriceBreak_s: JSON.stringify({ PriceBreak: [{ Quantity: 12, Price: 49.99 }] }),
      },
      // An exact repeat from a shifted pagination boundary must still collapse.
      { ...shared, product_url_s: '/Golf-Balls/TaylorMade-TP5-Golf-Balls-2026-Model' },
    ]);
    assert.equal(products.length, 2);
    assert.equal(new Set(products.map((product) => product.id)).size, 2, 'React/proposal identities must remain unique');
    assert.equal(products.filter((product) => product.customLogo).length, 1);
    assert.equal(products.find((product) => product.customLogo).breaks[0].p, 49.99);
    assert.equal(products.find((product) => product.customLogo).hasCustomLogoPriceBreaks, true);
  });
});

describe('gift catalog · specially-priced URL import', () => {
  it('lists the TP5 custom-logo page as a built-in import', () => {
    assert.ok(CATALOG_IMPORT_URLS.includes(TP5_IMPORT_URL));
  });

  it('normalizes a product PAGE through the same pipeline as a crawled doc', () => {
    const product = normalizeDoc(rawProductToDoc(TP5_RAW, TP5_IMPORT_URL));
    assert.equal(product.parentCode, 'P012Y9');
    assert.equal(product.sku, 'B5951', 'the human SKU cost/inventory keys on');
    assert.equal(product.title, 'TP5 Custom Logo Golf Balls - 2026 Model');
    assert.equal(product.brand, 'TaylorMade');
    // Bucketed by the rebuilt itemType path ("Consumer-Golf_Balls"), exactly as
    // a crawled doc would be — not by a second, parallel set of rules.
    assert.equal(product.cat, 'Logo Golf Balls');
    assert.equal(product.dept, 'Golf Balls');
    // Commissionable, with the page's real quote ladder — this is what makes it
    // quotable at all.
    assert.equal(product.customLogo, true);
    assert.equal(product.hasCustomLogoPriceBreaks, true);
    assert.deepEqual(product.breaks[0], { q: 1, p: 60.99 });
    assert.deepEqual(product.breaks[product.breaks.length - 1], { q: 500, p: 53.99 });
    assert.equal(product.minQty, 1);
    // The site's own canonical child path, resolved to an absolute URL so the
    // proposal's raw-product fetch can price it.
    assert.equal(product.url, 'https://www.golfballs.com/Golf-Balls/TaylorMade-TP5-Custom-Logo-Golf-Balls-2026-Model/TP5-Custom-Logo-Golf-Balls-2026-Model.htm');
    assert.match(product.img, /^https:\/\/static\.golfballs\.com\/C\/.*P012Y9/);
    assert.equal(product.reviews, 0, 'a pre-order launch genuinely has no reviews yet');
  });

  it('imports it into the catalog even though the feed never returns it', async () => {
    // CATALOG (the fake feed) contains no TP5 doc at all — the crawl cannot
    // produce it, which is the whole point of the URL import.
    const products = await loadCatalog({ force: true });
    const tp5 = products.find((p) => p.parentCode === 'P012Y9');
    assert.ok(tp5, 'the specially-priced custom-logo SKU must be quotable');
    assert.equal(tp5.customLogo, true);
  });

  it('returns null for a page with no product code rather than a junk row', () => {
    assert.equal(rawProductToDoc({}, TP5_IMPORT_URL), null);
    assert.equal(rawProductToDoc(null), null);
  });
});
