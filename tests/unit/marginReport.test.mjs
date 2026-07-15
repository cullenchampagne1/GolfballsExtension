/**
 * Unit tests — src/lib/marginReport.js
 *
 * Margin model over resolved proposal entries. The module's import chain
 * (customItems → giftCatalog) pulls a .json module, which plain Node rejects
 * without an import attribute, so a resolve hook supplies `type: json`.
 * Real per-SKU costs are seeded through a chrome.storage stub + the real
 * primeCostCache() so cachedCostForSku answers synchronously, exactly as in
 * the extension.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const r = nextResolve(specifier, context);
    if (r.url && r.url.endsWith('.json')) return { ...r, importAttributes: { type: 'json' } };
    return r;
  },
});

// chrome.storage stub installed BEFORE the module import. gbCostMap is the
// persistent sku→cost store primeCostCache reads into its sync Map.
const store = { gbCostMap: { B100: 10, B200: 0 } };
globalThis.chrome = {
  storage: {
    local: {
      get(key, cb) { cb({ [key]: store[key] }); },
      set(obj) { Object.assign(store, obj); },
    },
  },
};

const {
  invSkuOf, costSkuOf, unitCostOf, hasRealCost, marginReport, proposalCostSkus,
} = await import('../../src/lib/marginReport.js');
const { primeCostCache } = await import('../../src/lib/inventory.js');
const { setBundleCatalog } = await import('../../src/lib/bundleCost.js');

await primeCostCache(); // loads B100 → $10.00, B200 → $0 into the sync cost map

// One single-dozen ball in the catalog so the Double Dozen fixture resolves.
setBundleCatalog([
  { sku: 'B100', brand: 'Titleist', title: 'Pro V1 Golf Balls', itemType: 'gbc-golf_ball' },
]);
const doubleDozen = { sku: 'B9999', brand: 'Titleist', title: 'Titleist Pro V1 Golf Balls - Double Dozen', itemType: 'gbc-golf_ball' };

describe('invSkuOf / costSkuOf', () => {
  it('prefers the human parentSku, falls back to parentCode, then empty', () => {
    assert.equal(invSkuOf({ sku: 'B3273', parentCode: 'P00G6B' }), 'B3273');
    assert.equal(invSkuOf({ parentCode: 'P00G6B' }), 'P00G6B');
    assert.equal(invSkuOf(null), '');
  });

  it('costSkuOf resolves a ball multipack to its single sibling SKU', () => {
    assert.equal(costSkuOf(doubleDozen), 'B100');
  });

  it('costSkuOf keeps a regular product on its own SKU', () => {
    assert.equal(costSkuOf({ sku: 'B200' }), 'B200');
  });
});

describe('unitCostOf', () => {
  it('reads the synced per-unit cost for a cached catalog SKU', () => {
    assert.equal(unitCostOf({ sku: 'B100' }, 50, 12), 10);
  });

  it('prices a Double Dozen at the single dozen cost × 2', () => {
    assert.equal(unitCostOf(doubleDozen, 80, 12), 20);
  });

  it('uses a custom item own cost, rounded to cents', () => {
    assert.equal(unitCostOf({ isCustom: true, cost: 3.567 }, 9.99, 48), 3.57);
  });

  it('walks a custom item net-cost ladder by qty (beats the flat cost)', () => {
    const p = { isCustom: true, cost: 9, costBreaks: [{ q: 12, c: 2.5 }, { q: 48, c: 2 }] };
    assert.equal(unitCostOf(p, 9.99, 12), 2.5);
    assert.equal(unitCostOf(p, 9.99, 48), 2);
  });

  it('falls back to 60% of sell (40% margin placeholder) when no cost is known', () => {
    assert.equal(unitCostOf({ sku: 'BZZZ' }, 50, 12), 30);
  });

  it('treats a cached $0 cost as unknown and falls back to 60% of sell', () => {
    assert.equal(unitCostOf({ sku: 'B200' }, 10, 12), 6);
  });

  it('a custom item without any cost falls back to 60% of sell', () => {
    assert.equal(unitCostOf({ isCustom: true }, 20, 12), 12);
  });
});

describe('hasRealCost', () => {
  it('is true for a cached catalog SKU and false for an unknown one', () => {
    assert.equal(hasRealCost({ sku: 'B100' }), true);
    assert.equal(hasRealCost({ sku: 'BZZZ' }), false);
  });

  it('is false for a cached $0 cost (placeholder, not a real cost)', () => {
    assert.equal(hasRealCost({ sku: 'B200' }), false);
  });

  it('is true for a custom item with a cost or a cost ladder', () => {
    assert.equal(hasRealCost({ isCustom: true, cost: 3.5 }), true);
    assert.equal(hasRealCost({ isCustom: true, costBreaks: [{ q: 12, c: 2 }] }), true);
    assert.equal(hasRealCost({ isCustom: true, cost: 0 }), false);
  });

  it('is true for a bundle whose single sibling cost is cached', () => {
    assert.equal(hasRealCost(doubleDozen), true);
  });
});

describe('marginReport', () => {
  const entries = [
    // Real cost: 12 dz at $50 with a $10 cost → 80% margin.
    { id: 'a', product: { sku: 'B100' }, splits: [{ qty: 12, price: 50 }] },
    // Unknown cost: assumed 60% → $12/unit on a $20 sell.
    { id: 'b', product: { sku: 'BZZZ' }, splits: [{ qty: 10, price: 20 }] },
    // Free promo giveaway: shows as a line, counts nothing.
    { id: 'c', free: true, product: { sku: 'B100' }, splits: [{ qty: 6, price: 0 }] },
  ];

  it('computes per-line revenue, cost, profit, and margin', () => {
    const r = marginReport(entries);
    const a = r.lines[0];
    assert.equal(a.lineRev, 600);
    assert.equal(a.lineCost, 120);
    assert.equal(a.profit, 480);
    assert.equal(a.margin, 0.8);
    assert.equal(a.costKnown, true);
    const b = r.lines[1];
    assert.equal(b.lineRev, 200);
    assert.equal(b.lineCost, 120);
    assert.equal(b.margin, 0.4);
    assert.equal(b.costKnown, false);
  });

  it('excludes free giveaway lines from revenue/cost but keeps them listed', () => {
    const r = marginReport(entries);
    const c = r.lines[2];
    assert.equal(c.free, true);
    assert.equal(c.lineRev, 0);
    assert.equal(c.lineCost, 0);
    assert.equal(c.margin, null);
    assert.equal(c.units, 6);
    assert.equal(r.count, 3);
  });

  it('blends totals over paid lines only', () => {
    const r = marginReport(entries);
    assert.equal(r.rev, 800);
    assert.equal(r.cost, 240);
    assert.equal(r.profit, 560);
    assert.equal(r.margin, 0.7);
    assert.equal(r.units, 28);           // free units still count as units
    assert.equal(r.paidCount, 2);
    assert.equal(r.realCount, 1);
  });

  it('labels the cost basis mixed / actual / assumed by real-cost coverage', () => {
    assert.equal(marginReport(entries).costBasis, 'mixed');
    assert.equal(marginReport([entries[0]]).costBasis, 'actual');
    assert.equal(marginReport([entries[1]]).costBasis, 'assumed');
  });

  it('sums multiple qty/price splits within one line', () => {
    const r = marginReport([{ id: 'a', product: { sku: 'B100' }, splits: [{ qty: 12, price: 50 }, { qty: 24, price: 45 }] }]);
    assert.equal(r.lines[0].lineRev, 1680);   // 600 + 1080
    assert.equal(r.lines[0].lineCost, 360);   // 36 units × $10
    assert.equal(r.lines[0].units, 36);
  });

  it('handles empty/missing entries as an assumed-basis zero report', () => {
    const r = marginReport([]);
    assert.equal(r.rev, 0);
    assert.equal(r.margin, 0);
    assert.equal(r.costBasis, 'assumed');
    assert.deepEqual(marginReport(undefined).lines, []);
  });
});

describe('proposalCostSkus', () => {
  it('collects unique, sorted cost SKUs, resolving bundles and skipping custom items', () => {
    const entries = [
      { product: { sku: 'B200' } },
      { product: doubleDozen },                      // → B100 via the single sibling
      { product: { isCustom: true, cost: 1 } },      // skipped — carries its own cost
      { product: { sku: 'B200' } },                  // duplicate
      { product: {} },                               // no sku → filtered out
    ];
    assert.deepEqual(proposalCostSkus(entries), ['B100', 'B200']);
  });

  it('returns an empty list for no entries', () => {
    assert.deepEqual(proposalCostSkus([]), []);
    assert.deepEqual(proposalCostSkus(undefined), []);
  });
});
