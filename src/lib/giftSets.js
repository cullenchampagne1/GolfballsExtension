/* ───────────────────────────────────────────────────────────────────────────
   giftSets.js — corporate gift-set "packaging" upsell for custom-logo golf balls.

   A gift set wraps a custom-logo ball into a boxed set (single-sleeve 3-ball /
   6-ball black box / premier wooden) with a divot-tool or poker-chip kit, for an
   upcharge. It is NOT a separate catalog product — it's the BALL line with a
   `bundle` attached, a recomputed ItemPriceBreak, and a kit child appended to
   childList. `OriginalItemQty` (0.25 sleeve / 0.5 box) = the per-set dozen fraction.

   DATA (verified live — both public, header `sitekey: golfballs`, no auth):
     PUT https://master.api.icustomize.com/user/getPackageUpsellData   (NO body)
       → { expiryDate, bundleOptions:[ {name, giftSetType, giftSetTypeFriendlyName,
            OriginalItemQty, workflowTypeID, wrapperImage, thumbnail, descriptions,
            upsellOptions:{showCustom,showConsumer,enabled},
            BundleItems:[{shortCode, legacySku, qty,
              price:{PriceBreak:[{Quantity,Price}]}}] } ] }
     The custom-logo gift sets are the options with upsellOptions.showCustom (8 of
     them); the kit `price.PriceBreak` is the kit's own volume ladder. Ball-
     INDEPENDENT — the same templates apply to any ball; only the ball price varies.

   PRICING (ported byte-exact from the site's bundle reducer — VERIFIED 56/56 real
   cart break points): scale the ball's per-dozen custom-logo ladder by
   OriginalItemQty (rounding each tier to .95), SUM the kit ladder (its breakpoints
   remapped onto the ball's), round each combined tier to .95, then scale the
   breakpoint quantities by 1/OriginalItemQty. See giftSetLadder().

   This module is PURE (no React / no chrome) so it is unit-testable and safe to
   import from cartSerializer. Live loading + the seed live in giftSetsData.js.
   ─────────────────────────────────────────────────────────────────────────── */

import { API } from './constants.js';

export const PACKAGE_UPSELL_URL = `${API.MASTER_USER}/getPackageUpsellData`;

/* Round a price so its cents end in 95 — the site's `u(t,95)`:
   r = 95/100 = .95 ; i = (100-95)/100 + .01 = .06 ; floor(t - i) + r. */
const round95 = (t) => Math.floor(t - 0.06) + 0.95;
const priceAtQ = (lad, q) => { let p = 0; for (const b of (lad || [])) if (b.q <= q) p = b.p; return p; };

/* A bundleOption is a "custom logo gift set" iff the product page would offer it on
   a custom-logo ball: upsellOptions.showCustom AND it bundles a kit with a fractional
   per-set ball count (0.25 sleeve / 0.5 box). Excludes "stock" (no packaging),
   consumer-only sets, and the box-top (OriginalItemQty 1). */
export function isCustomGiftSet(opt) {
  if (!opt || !opt.upsellOptions || !opt.upsellOptions.showCustom) return false;
  if (!(opt.OriginalItemQty > 0 && opt.OriginalItemQty < 1)) return false;
  return Array.isArray(opt.BundleItems) && opt.BundleItems.length > 0;
}

const _kitLadder = (kit) => (((kit && kit.price && kit.price.PriceBreak) || [])
  .map((b) => ({ q: b.Quantity, p: b.Price })));

/* Normalize a raw bundleOption into the compact shape the modal uses. */
export function normalizeBundleOption(opt) {
  const kit = (opt.BundleItems || [])[0] || {};
  const oiq = opt.OriginalItemQty;
  const shortCode = kit.shortCode || kit.ShortCode || '';
  // Stable, unique id: the wrapperImage's /GiftSet/<Token>/ segment (e.g.
  // "SixBallBartender", "SleeveLever") distinguishes sets the kit code/name share.
  const token = (/\/GiftSet\/([^/]+)\//.exec(opt.wrapperImage || '') || [])[1] || shortCode;
  return {
    id: [opt.giftSetType, token, oiq].filter((x) => x != null).join(':'),
    name: opt.name || '',
    friendly: opt.giftSetTypeFriendlyName || 'Gift Sets',
    giftSetType: opt.giftSetType || '',
    oiq,
    ballsPerSet: Math.round(oiq * 12),          // 0.25 → 3, 0.5 → 6
    workflowTypeID: opt.workflowTypeID,
    wrapperImage: opt.wrapperImage || '',
    thumbnail: opt.thumbnail || '',
    descriptions: opt.descriptions || [],
    kit: {
      shortCode,
      legacySku: kit.legacySku || '',
      qty: kit.qty != null ? kit.qty : 1,
      ladder: _kitLadder(kit),
    },
  };
}

/* The custom-logo gift-set options from a raw getPackageUpsellData payload. */
export function customGiftSetsFrom(payload) {
  const opts = (payload && payload.bundleOptions) || (Array.isArray(payload) ? payload : []);
  return opts.filter(isCustomGiftSet).map(normalizeBundleOption);
}

/* The gift-set per-set price ladder for a ball, given the ball's per-dozen custom-
   logo ladder ([{q,p}], from computeDecoratedPricing) and a normalized gift-set
   option. Verified byte-exact against real carts (sleeve / 6-ball / wooden — 56/56).
   Returns [{q,p}] (q = number of gift sets) or null. */
export function giftSetLadder(ballLadder, gs) {
  if (!ballLadder || !ballLadder.length || !gs || !(gs.oiq > 0)) return null;
  const oiq = gs.oiq;
  const I = ballLadder.map((b) => b.q);
  // 1+2 · ball ladder scaled by OriginalItemQty, each tier rounded to .95 (o.f).
  const scaledBall = ballLadder.map((b) => ({ q: b.q, p: round95(b.p * oiq) }));
  // 3 · kit ladder, breakpoints remapped onto the ball's breakpoints I.
  const pbs = gs.kit.ladder || [];
  const own = pbs.map((b) => b.q);
  const kit = [];
  for (const b of pbs) {
    if (I.includes(b.q)) { kit.push({ q: b.q, p: b.p }); continue; }
    const e = I.filter((x) => x > b.q).sort((a, c) => a - c)[0];
    if (e != null && !own.includes(e)) kit.push({ q: e, p: b.p });
  }
  // 4 · sum scaled ball + kit at the union of breaks, round each tier to .95 (o.b/o.g).
  const all = [scaledBall, kit];
  const qs = [...new Set(all.flatMap((l) => l.map((b) => b.q)))].sort((a, b) => a - b);
  let breaks = qs.map((q) => ({ q, p: round95(all.reduce((s, l) => s + priceAtQ(l, q), 0)) }));
  // 5 · scale the breakpoint quantities from dozens to gift-set count (×1/oiq).
  if (oiq > 0 && oiq < 1) {
    const C = Math.round(1 / oiq);
    if (C > 1) breaks = breaks.map((b, i) => ({ q: i === 0 ? b.q : b.q * C, p: b.p }));
  }
  return breaks;
}

/* The cart `bundle` object + the kit childList stub for a gift-set line. Mirrors the
   real cart: the line carries the full template under `bundle` (kit ladder + a live
   renderedPreviewImage) and a minimal kit child appended to childList so the order
   knows the physical kit SKU. `renderedPreviewImage` is cosmetic (price/serialization
   don't depend on it); defaults to the gift-set thumbnail. */
export function buildBundleBlock(gs, { renderedPreviewImage } = {}) {
  const k = gs.kit || {};
  return {
    bundle: {
      OriginalItemQty: gs.oiq,
      workflowTypeID: gs.workflowTypeID,
      wrapperImage: gs.wrapperImage || '',
      thumbnail: gs.thumbnail || '',
      name: gs.name,
      descriptions: gs.descriptions || [],
      BundleItems: [{
        shortCode: k.shortCode, legacySku: k.legacySku || '', qty: k.qty != null ? k.qty : 1,
        price: {
          priceBreakHeaderID: 0,
          PriceBreak: (k.ladder || []).map((b) => ({ Quantity: b.q, Price: b.p, Cost: 0 })),
          ProductionTime: 0, minimumQty: 1,
        },
      }],
      giftSetType: gs.giftSetType,
      giftSetTypeFriendlyName: gs.friendly,
      upsellOptions: { showCustom: true, enabled: true },
      renderedPreviewImage: renderedPreviewImage || gs.thumbnail || '',
    },
    kitChild: {
      ShortCode: k.shortCode, bundleQty: 0, LastUpdated: '', ManufacturerSku: '', Name: '',
      OriginalPriceLabel: '', PropertyValueProduct: [], QtyPerPack: 0,
      itemFeeModifier_priceBreakHeaderID: 0, originalPrice_priceBreakHeader: null,
      originalPrice_priceBreakHeaderID: null, productChildID: 0, productParentID: 0,
      setupFeeModifier_priceBreakHeader: null, setupFeeModifier_priceBreakHeaderID: null,
      ManufacturerUPC: 0,
    },
  };
}

/* A short label for the set's size ("3-ball sleeve" / "6-ball") from OriginalItemQty. */
export function giftSetSizeLabel(gs) {
  if (!gs) return '';
  if (gs.oiq === 0.25) return '3-ball sleeve';
  if (gs.oiq === 0.5) return '6-ball';
  return `${gs.ballsPerSet || Math.round((gs.oiq || 0) * 12)}-ball`;
}
