/* Per-line + blended margin model for resolved proposal entries.
   Extracted verbatim from GiftCatalog.jsx so the breakdown can be reused
   outside the modal in other proposal surfaces.

   Real cost when we have it, else a flat-40% placeholder:
     • custom items carry their own per-unit `cost`,
     • catalog products use the per-SKU Cost cached from the inventory endpoint
       (populated when a rep checks inventory; primed on mount),
     • otherwise fall back to 60%-of-sell.

   Resolved entries look like:
     [{ id, product, decoration, free, splits:[{ qty, price }] }]
   — the same shape GiftCatalog's `marginReport(entries)` consumes. */
import { cachedCostForSku, primeCostCache, importCosts } from './inventory.js';
import { bundleSingle } from './bundleCost.js';
import { costAtQty } from './customItems.js';
import { lineSetupFee, setupFeeTotal } from './lineSetupFee.js';

export const COST_RATIO = 0.60;     // assumed cost as a fraction of sell price → 40% margin
export const ASSUMED_MARGIN = 1 - COST_RATIO;

/* The SKU the Dynamics inventory endpoint keys on = the human parentSku
   (customData.parentSku, e.g. "B3273") — NOT parentCode_s, which is an internal
   product code ("P00G6B") the endpoint 404s on. Prefer sku, fall back to code. */
export const invSkuOf = (p) => (p && (p.sku || p.parentCode)) || '';

/* The SKU whose synced cost actually prices this line. For a "Double Dozen"
   (and other ball multipacks) that's its single sibling's SKU — the bundle's
   own SKU carries no inventory cost (see bundleCost.js); everything else uses
   its own SKU. Drives both the proactive cost fetch and the "couldn't price"
   asterisk so both follow the SKU we really read the cost from. */
export const costSkuOf = (p) => { const b = bundleSingle(p); return b ? b.sku : invSkuOf(p); };

export const unitCostOf = (product, unitPrice, qty) => {
  const p = product || {};
  if (p.isCustom) {
    // Per-qty cost from the net-cost ladder when present (most accurate), else the
    // single cost.
    const cb = p.costBreaks || (p.custom && p.custom.costBreaks);
    if (cb && cb.length) { const c = costAtQty(cb, qty || p.minQty || 1, null); if (c != null && c > 0) return Math.round(c * 100) / 100; }
    const c = p.cost != null ? p.cost : (p.custom && p.custom.cost);
    if (c != null && c > 0) return Math.round(c * 100) / 100;
  } else {
    // Ball multipack → single dozen's cost × the pack count (a double dozen = 2×).
    const b = bundleSingle(p);
    if (b) { const c = cachedCostForSku(b.sku); if (c != null && c > 0) return Math.round(c * b.multiple * 100) / 100; }
    const c = cachedCostForSku(invSkuOf(p));
    if (c != null && c > 0) return Math.round(c * 100) / 100;
  }
  return Math.round((unitPrice || 0) * COST_RATIO * 100) / 100;
};

/* True when we have a real (synced / custom) cost for this product — i.e. the
   margin isn't the 40% placeholder. Drives the breakdown's "actual vs assumed". */
export const hasRealCost = (product) => {
  const p = product || {};
  if (p.isCustom) {
    const cb = p.costBreaks || (p.custom && p.custom.costBreaks);
    if (cb && cb.length) return true;
    const c = p.cost != null ? p.cost : (p.custom && p.custom.cost);
    return c != null && c > 0;
  }
  const c = cachedCostForSku(costSkuOf(p));   // bundle → single's cost
  return c != null && c > 0;
};

/* Per-line + blended margin for resolved entries
   ([{ product, decoration, splits:[{qty,price}] }]).

   ONE ROW PER PRICE BREAK. A proposal built in the modal holds its breaks as
   `splits` on a single entry, while the same proposal built on the website
   comes back as one entry per break — so the overview used to show the modal's
   breaks as a single blended-margin row and the website's as separate rows for
   the identical quote. Every split now becomes its own report line (carrying
   just that break's split), which is what makes a per-break margin visible;
   `count` still counts PRODUCTS, so the "N items" readout doesn't inflate.

   The line item's one-time SETUP FEE is revenue too (the site bills it and
   prints it under the line). It rides on the LAST break — floating to the
   bottom, as everywhere else — with no cost attached, since a decoration setup
   charge has no unit cost on file. */
export function marginReport(entries) {
  let rev = 0, cost = 0, units = 0, real = 0, paidCount = 0;
  const lines = [];
  (entries || []).forEach((e, entryIndex) => {
    const isFree = !!e.free;
    const splits = (e.splits || []).length ? e.splits : [{ qty: 0, price: 0 }];
    const setup = isFree ? 0 : lineSetupFee(e);
    const known = isFree ? true : hasRealCost(e.product);
    splits.forEach((s, i) => {
      const q = s.qty || 0, p = s.price || 0;
      const last = i === splits.length - 1;
      const rowSetup = last ? setup : 0;
      const u = q;
      units += u;
      // Free promotional giveaways don't count toward revenue, cost, or margin —
      // they're a promo, not a 0%-margin sale. They still show as a line.
      if (isFree) {
        lines.push({ ...e, id: rowId(e, i, splits.length), entryIndex, splits: [s], splitIndex: i, splitCount: splits.length, setupFee: 0, units: u, lineRev: 0, lineCost: 0, profit: 0, margin: null, free: true, costKnown: true });
        return;
      }
      const lr = q * p + rowSetup;
      const lc = q * unitCostOf(e.product, p, q);
      rev += lr; cost += lc; paidCount += 1;
      if (known) real += 1;
      lines.push({ ...e, id: rowId(e, i, splits.length), entryIndex, splits: [s], splitIndex: i, splitCount: splits.length, setupFee: rowSetup, units: u, lineRev: lr, lineCost: lc, profit: lr - lc, margin: lr ? (lr - lc) / lr : 0, costKnown: known });
    });
  });
  // How the cost figure was sourced — over PAID rows only.
  const costBasis = paidCount === 0 ? 'assumed' : real === paidCount ? 'actual' : real === 0 ? 'assumed' : 'mixed';
  return {
    lines, units, count: (entries || []).length, rowCount: lines.length,
    setupTotal: setupFeeTotal(entries),
    rev, cost, profit: rev - cost, margin: rev ? (rev - cost) / rev : 0,
    costBasis, realCount: real, paidCount,
  };
}

/* A stable per-break row id. Single-break lines keep the entry's own id so
   nothing that keys off it (React lists, the breakdown's price editor) changes
   behaviour for the common case. */
function rowId(entry, index, count) {
  const base = (entry && entry.id) != null ? entry.id : 'line';
  return count > 1 ? `${base}#${index}` : base;
}

/* The set of inventory SKUs whose synced cost prices these entries' catalog
   lines (custom items carry their own cost, so they're skipped). Bundle lines
   resolve to their single sibling's SKU via costSkuOf. */
export function proposalCostSkus(entries) {
  return Array.from(new Set(
    (entries || [])
      .filter((e) => e && e.product && !e.product.isCustom)
      .map((e) => costSkuOf(e.product))
      .filter(Boolean)
  )).sort();
}

/* Best-effort prime of the inventory cost cache for these entries' SKUs so
   `cachedCostForSku` (and thus marginReport) returns real costs without the
   GiftCatalog modal ever having been opened. First loads any persisted/cached
   costs (primeCostCache), then bulk-fetches the still-missing SKUs via the same
   `fetchCosts` background path GiftCatalog uses. Resolves quietly on failure —
   margins then fall back to the 40% 'assumed' placeholder. */
export async function primeProposalCosts(entries) {
  try { await primeCostCache(); } catch { /* cache may be empty — keep going */ }
  const skus = proposalCostSkus(entries).filter((s) => !(cachedCostForSku(s) > 0));
  if (!skus.length) return;
  try { await importCosts(skus, {}); } catch { /* auth/embed failure → leave as assumed */ }
}
