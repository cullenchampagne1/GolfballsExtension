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
const round = (n) => Math.round(n * 100) / 100;

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

  it('reports each price break as its own row so per-break margin is visible', () => {
    const r = marginReport([{ id: 'a', product: { sku: 'B100' }, splits: [{ qty: 12, price: 50 }, { qty: 24, price: 45 }] }]);
    assert.equal(r.lines.length, 2, 'one row per break, not one blended row');
    assert.deepEqual(r.lines.map((l) => l.id), ['a#0', 'a#1']);
    assert.deepEqual(r.lines.map((l) => l.splitIndex), [0, 1]);
    assert.deepEqual(r.lines.map((l) => l.splitCount), [2, 2]);
    assert.deepEqual(r.lines.map((l) => l.entryIndex), [0, 0], 'both rows still edit the SAME proposal line');
    // Break 1: 12 × $50 = $600 rev, 12 × $10 synced cost = $120 → 80%.
    assert.equal(r.lines[0].lineRev, 600);
    assert.equal(r.lines[0].lineCost, 120);
    assert.equal(r.lines[0].units, 12);
    assert.equal(r.lines[0].margin, 0.8);
    // Break 2: 24 × $45 = $1,080 rev, 24 × $10 = $240 → a DIFFERENT margin,
    // which is the whole point of splitting the rows.
    assert.equal(r.lines[1].lineRev, 1080);
    assert.equal(r.lines[1].lineCost, 240);
    assert.equal(r.lines[1].units, 24);
    assert.equal(Math.round(r.lines[1].margin * 1000) / 1000, 0.778);
    // Blended totals are unchanged — only the row breakdown got finer.
    assert.equal(r.rev, 1680);
    assert.equal(r.cost, 360);
    assert.equal(r.units, 36);
    assert.equal(r.count, 1, 'still ONE product');
    assert.equal(r.rowCount, 2);
  });

  it('points every row at the proposal ENTRY it came from, not the row position', () => {
    // The breakdown's inline price editor writes back by entry index. With
    // per-break rows the row index diverges from the entry index the moment the
    // first product has more than one break — editing the second product then
    // repriced the first.
    const r = marginReport([
      { id: 'a', product: { sku: 'B100' }, splits: [{ qty: 12, price: 50 }, { qty: 24, price: 45 }] },
      { id: 'b', product: { sku: 'B200' }, splits: [{ qty: 6, price: 20 }] },
    ]);
    assert.deepEqual(r.lines.map((l) => l.entryIndex), [0, 0, 1]);
    assert.equal(r.lines[2].id, 'b');
  });

  it('keeps the entry id on a single-break line', () => {
    const r = marginReport([{ id: 'solo', product: { sku: 'B100' }, splits: [{ qty: 12, price: 50 }] }]);
    assert.equal(r.lines.length, 1);
    assert.equal(r.lines[0].id, 'solo');
    assert.equal(r.lines[0].splitCount, 1);
  });

  it('bills a line item’s setup fee once, on its bottom price break', () => {
    const r = marginReport([{
      id: 'towel', product: { sku: 'B100' }, setupFeeAuto: 50,
      splits: [{ qty: 12, price: 23.99 }, { qty: 24, price: 22.99 }],
    }]);
    assert.equal(r.lines[0].setupFee, 0, 'not charged on the first break');
    assert.equal(r.lines[1].setupFee, 50, 'floats to the bottom break');
    assert.equal(r.lines[0].lineRev, 287.88);
    assert.equal(round(r.lines[1].lineRev), 601.76);   // 24 × 22.99 + 50
    assert.equal(r.setupTotal, 50);
    assert.equal(round(r.rev), 889.64);
  });

  it('never charges setup on a free promotional giveaway line', () => {
    const r = marginReport([{ id: 'promo', free: true, product: { sku: 'B100' }, setupFeeAuto: 50, splits: [{ qty: 12, price: 0 }] }]);
    assert.equal(r.lines[0].setupFee, 0);
    assert.equal(r.rev, 0);
    assert.equal(r.setupTotal, 0);
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
