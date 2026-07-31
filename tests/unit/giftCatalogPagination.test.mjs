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

// The bug's fingerprint: the backend hands back at most SERVER_CAP rows per
// page even when the client asks for more.
const SERVER_CAP = 200;

let store = {};
let loadCatalog;

before(async () => {
  store = {};
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (msg, cb) => {
        if (msg.action !== 'fetchGiftCatalog') { cb({ ok: false }); return; }
        const start = Number(msg.start) || 0;
        const rows = Math.min(SERVER_CAP, Number(msg.rows) || 60); // cap, as the old backend did
        const docs = CATALOG.slice(start, start + rows);
        cb({ ok: true, docs, numFound: CATALOG.length });
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
  ({ loadCatalog } = await import('../../src/lib/giftCatalog.js'));
});

after(() => { delete globalThis.chrome; });

describe('gift catalog · pagination completeness', () => {
  it('collects every product even when the server caps pages below the client stride', async () => {
    const products = await loadCatalog({ force: true });
    assert.equal(products.length, TOTAL,
      `expected all ${TOTAL} products, got ${products.length} (a stride > server page size drops the gap)`);
    // no gaps: every parentCode present exactly once
    const codes = new Set(products.map((p) => p.parentCode));
    assert.equal(codes.size, TOTAL);
    assert.ok(codes.has('P00250') && codes.has('P00777'),
      'products inside the previously-skipped windows must be present');
  });

  it('caches the full pull so a reopen serves the complete set', async () => {
    const products = await loadCatalog({ force: false }); // served from cache written above
    assert.equal(products.length, TOTAL);
  });
});
