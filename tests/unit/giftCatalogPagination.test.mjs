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
};

// The bug's fingerprint: the backend hands back at most SERVER_CAP rows per
// page even when the client asks for more.
const SERVER_CAP = 200;

let store = {};
let loadCatalog;
let normalizeCatalogDocs;

before(async () => {
  store = {};
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (msg, cb) => {
        if (msg.action !== 'fetchGiftCatalog') { cb({ ok: false }); return; }
        const start = Number(msg.start) || 0;
        const rows = Math.min(SERVER_CAP, Number(msg.rows) || 60); // cap, as the old backend did
        const source = msg.searchTerm === '*:*' ? CATALOG : [RECOVERY_LOGO];
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
  ({ loadCatalog, normalizeCatalogDocs } = await import('../../src/lib/giftCatalog.js'));
});

after(() => { delete globalThis.chrome; });

describe('gift catalog · pagination completeness', () => {
  it('collects every product even when the server caps pages below the client stride', async () => {
    const products = await loadCatalog({ force: true });
    assert.equal(products.length, TOTAL + 1,
      `expected all ${TOTAL} broad-crawl products plus the custom-logo recovery result`);
    // no gaps: every parentCode present exactly once
    const codes = new Set(products.map((p) => p.parentCode));
    assert.equal(codes.size, TOTAL + 1);
    assert.ok(codes.has('P00250') && codes.has('P00777'),
      'products inside the previously-skipped windows must be present');
    assert.ok(codes.has('P-TP5-LOGO'), 'the focused custom-logo crawl must recover a listing omitted by the broad crawl');
  });

  it('caches the full pull so a reopen serves the complete set', async () => {
    const products = await loadCatalog({ force: false }); // served from cache written above
    assert.equal(products.length, TOTAL + 1);
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
