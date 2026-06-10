/* ───────────────────────────────────────────────────────────────
   giftCatalogMath.js — pure pricing / formatting helpers extracted
   from GiftCatalog.jsx. No React, no component state, no module
   caches — just functions over product/line data, so they're unit-
   testable and shareable. (The cost-cache-dependent margin helpers
   and the decoration builders stay in GiftCatalog, where their
   module-level state lives.)
─────────────────────────────────────────────────────────────── */

import { giftSetLadder } from './giftSets.js';

export const usd = (n) => (n == null ? '—' : '$' + Number(n).toFixed(2));

export const onSale = (p) => p.orig != null && p.orig > p.price;
export const hasPromo = (p) => !!(p && p.promo);
export const isDeal = (p) => onSale(p) || hasPromo(p);

export const money = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rid = () => Math.random().toString(36).slice(2, 8);
export const nfmt = (n) => Number(n || 0).toLocaleString('en-US');

/* "updated just now / 5m ago / 2h ago / 3d ago" for the catalog index age. */
export function relTime(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

/* Per-unit price for a quantity, walking the custom-logo volume ladder. */
export function priceAtQty(p, qty) {
  if (p.breaks && p.breaks.length) {
    let price = p.breaks[0].p;
    for (const b of p.breaks) if (qty >= b.q) price = b.p;
    return price;
  }
  return p.logo || p.price || 0;
}
/* Has the price been hand-edited away from the tier the qty implies? */
export const isTierPrice = (p, qty, price) => Math.abs(priceAtQty(p, qty) - price) < 0.005;

/* ── Accurate proposal-line pricing ───────────────────────────────────────────
   The card headlines the custom-logo "from" price, but the PROPOSAL/cart must
   reflect what's actually configured:
     • no imprint            → retail (product.price)
     • custom-logo imprint   → the custom-logo volume ladder at the qty
     • a chosen base variant → its price (tee count, etc.)
     • + the second-pole upcharge when a dual-pole imprint is added
   These (Logo +$6 / Text +$4 per dozen) are golfballs.com's standard second-pole
   fees — the charge that was missing and skewing cart totals. */
export const SECOND_POLE_FEE = { logo: 6, text: 4 };
export const lineHasImprint = (line) => { const d = line && line.decoration; return !!(d && d.engine && d.engine !== 'none'); };
export const lineSecondPoleFee = (line) => {
  const d = line && line.decoration;
  if (!d || !d.pole2 || !d.pole2.kind) return 0;   // keyed on a real 2nd-pole imprint
  return SECOND_POLE_FEE[d.pole2.kind] || 0;
};
export function linePriceAt(line, qty) {
  const p = (line && line.product) || {};
  // Gift set: per-set price from the verified gift-set ladder (the catalog's
  // custom-logo ladder == the raw ladder, so this matches the cart exactly).
  const gs = line && line.decoration && line.decoration.giftSet;
  if (gs && p.customLogo && p.breaks && p.breaks.length) {
    const v = priceAtBreaks(giftSetLadder(p.breaks, gs), qty);
    if (v != null) return v;
  }
  let base;
  if (line && line.variant && line.variant.price != null) base = line.variant.price;          // tee count etc.
  else if (p.isCustom && p.breaks && p.breaks.length) base = priceAtQty(p, qty);               // custom item ladder
  else if (lineHasImprint(line) && p.customLogo) base = priceAtQty(p, qty);                    // custom-logo ladder
  else base = p.price || 0;                                                                     // no imprint → retail
  return Math.round((base + lineSecondPoleFee(line)) * 100) / 100;
}
export const lineIsTierPrice = (line, qty, price) => Math.abs(linePriceAt(line, qty) - price) < 0.005;
// Largest break ≤ q from a [{q,p}] ladder (the verified engine's output shape).
export const priceAtBreaks = (breaks, q) => { let p = null; for (const b of (breaks || [])) if (b.q <= q) p = b.p; return p; };

/* Highest custom-logo per-unit price (the smallest-qty tier) — shown
   on the card by default ("from" pricing), before volume discounts. */
export const topPrice = (p) => (p.breaks && p.breaks.length ? Math.max(...p.breaks.map((b) => b.p)) : (p.logo ?? p.price ?? 0));
export const lowPrice = (p) => (p.breaks && p.breaks.length ? Math.min(...p.breaks.map((b) => b.p)) : (p.logo ?? p.price ?? 0));
// On-sale markdown (MSRP − sale price). The custom-logo break ladder is stored
// PRE-markdown; this discount comes off ON TOP (it can be a second, stacked sale).
// So the real per-unit price = break − saleCut, and the raw break is the "was"
// (strike-through). e.g. a $51.99 1+ break with a −$10 markdown actually costs
// $41.99.
export const saleCut = (p) => (onSale(p) ? Math.max(0, p.orig - p.price) : 0);
export const netP    = (p, raw) => Math.max(0, raw - saleCut(p));   // a raw break/unit price after the markdown
export const netTop  = (p) => netP(p, topPrice(p));                  // actual per-unit (1+) price
export const netLow  = (p) => netP(p, lowPrice(p));                  // actual top-volume price
