/* ───────────────────────────────────────────────────────────────
   proposalEmailSource — standalone build of the email `source` model
   from saved proposal carts.

   Extracted VERBATIM from GiftCatalog.jsx (proposalToEmailSource and its
   GiftCatalog-local helpers) so any screen can turn cartIds into the exact
   `source` shape that ProposalEmailComposer / ProposalEmailModal render —
   without depending on the GiftCatalog modal.

   Pipeline (mirrors GiftCatalog): for each cartId,
     cartToEntry(await loadProposalCart(cartId), meta) → linesFromSaved(entry, rid)
   → proposalToEmailSource(lines, name, { promotion, cartLink }). Single cart
   returns the single source; multiple carts return the combined multi shape
   (buildMultiEmailSource).
─────────────────────────────────────────────────────────────── */
import { loadProposalCart, cartToEntry, linesFromSaved } from './saveProposal.js';
import { rid, priceAtBreaks } from './giftCatalogMath.js';
import { promoDiscount, giftSetPreviewUrl } from './cartSerializer.js';
import { decoImprints } from './giftImprints.js';
import { giftSetSizeLabel } from './giftSets.js';
import { colorNameOf } from '../modals/giftCustomize.jsx';

/* ── GiftCatalog-local helpers, copied verbatim ───────────────── */

/* The boxed gift-set preview for a line (sleeve render with the ball's print +
   sleeve overlay; static photo for 6-ball / wooden), or null when not a gift set. */
const lineGiftImg = (line) => {
  const gs = line && line.decoration && line.decoration.giftSet;
  if (!gs) return null;
  const p = line.product || {};
  return giftSetPreviewUrl(gs, { decoration: line.decoration, sleeveImage: p.giftSetSleeveImage, brand: p.brand }) || gs.thumbnail || null;
};

// Describe a line's imprint(s) for the email "Imprint preview" card — type
// label, color (name + swatch), and a short per-pole detail line. Dual-pole
// lines describe BOTH poles (Front: … / Back: …) and surface text/monogram on
// the opposite pole; logo file names are truncated so a line never wraps.
const _imprintLabel = (c) => !c ? '' : (c.kind === 'monogram' ? 'Monogram' : c.kind === 'text' ? 'Personalized' : 'Custom Logo');
const _truncName = (s, n = 26) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).replace(/\s+$/, '') + '…' : s; };
const _chipDesc = (c) => {
  if (!c) return '';
  if (c.kind === 'text') { const t = (c.lines || []).map((x) => (x == null ? '' : String(x).trim())).filter(Boolean).join(' / '); return t ? `“${t}”` : 'Personalized text'; }
  if (c.kind === 'monogram') { return c.text ? `Monogram “${String(c.text).toUpperCase()}”` : 'Monogram'; }
  return _truncName(c.fileName || (c.icon ? ('Icon · ' + c.icon) : 'Custom logo'));
};
const lineImprint = (deco) => {
  if (!deco || !deco.engine || deco.engine === 'none') return null;
  const chips = decoImprints(deco);
  if (!chips.length) return null;
  const front = chips.find((c) => c.slot === 'front') || chips[0];
  const second = chips.find((c) => c.slot === 'second') || null;
  const frontLabel = _imprintLabel(front);
  let typeLabel = frontLabel, detailLines;
  if (second) {
    const secondLabel = _imprintLabel(second);
    typeLabel = frontLabel === secondLabel ? frontLabel : `${frontLabel} + ${secondLabel}`;
    detailLines = [`Front: ${_chipDesc(front)}`, `Back: ${_chipDesc(second)}`];
  } else {
    detailLines = [_chipDesc(front)];
  }
  // Color swatch only for single-color imprints (text / monogram) on the front.
  const colorHex = (front.kind === 'text' || front.kind === 'monogram') ? (front.color || '') : '';
  const color = colorHex ? (colorNameOf(colorHex) || '') : '';
  // First text line (front) drives the synthetic-chip label fallback.
  const text = front.kind === 'text' ? ((front.lines || []).filter(Boolean).join(' / ') || null)
    : front.kind === 'monogram' ? (front.text || null) : null;
  // `frontLabel` = the front imprint's type alone (templates that show only the
  // first personalization, e.g. Quote, use this instead of the combined label).
  return { type: deco.engine, typeLabel, frontLabel, color, colorHex: colorHex || null, detailLines, text };
};

/* proposalToEmailSource — copied verbatim from GiftCatalog.jsx (~line 3098). */
const proposalToEmailSource = (lines, name, opts = {}) => {
  const rows = []; let total = 0; let freeTotal = 0;
  for (const l of (lines || [])) {
    const p = l.product || {};
    const gs = l.decoration && l.decoration.giftSet;
    // A gift-set line is identified by the SET (name + size + the ball it wraps)
    // and shows the boxed gift-set render — not the bare ball.
    const title = gs ? (gs.name || 'Gift set') : (p.title || '');
    const subtitle = gs ? [giftSetSizeLabel(gs), p.title].filter(Boolean).join(' · ') : ((l.variant && l.variant.values && l.variant.values.style) || '');
    const img = (gs ? lineGiftImg(l) : null) || p.img || '';
    const imprint = lineImprint(l.decoration);
    const isFree = !!l.free;
    // Retail/"was" unit = the higher of MSRP, the 1-qty ladder price, and the
    // base price — used to show a red strike when the quoted price is below it
    // (a sale or a volume break).
    const brks = p.breaks || [];
    const retailUnit = Math.max(Number(p.orig) || 0, (brks[0] && Number(brks[0].p)) || 0, Number(p.price) || 0);
    for (const s of (l.splits || [])) {
      const qty = s.qty || 0;
      // HAR layout: a FREE line is shown at its FULL price (so the subtotal
      // includes it) and the promotion nets it off at the bottom. Unit comes
      // from the promotion's authoritative per-item value when present, else
      // the ladder price at that qty, else the retail unit.
      let unitPrice;
      if (isFree) {
        const fullVal = Number(l.freeValue) || 0;
        unitPrice = (qty > 0 && fullVal > 0) ? Math.round((fullVal / qty) * 100) / 100
          : (priceAtBreaks(brks, qty) ?? retailUnit ?? 0);
      } else {
        unitPrice = s.price || 0;
      }
      const lineTotal = Math.round(qty * unitPrice * 100) / 100;
      total += lineTotal;
      if (isFree) freeTotal += lineTotal;
      const origUnit = (!isFree && retailUnit > unitPrice + 0.005) ? Math.round(retailUnit * 100) / 100 : null;
      // `lineId` lets the email composer attach 3D snapshot previews back to the
      // right rows (one line can span multiple split rows). `parentLineId` ties
      // a free row to the line that earned it (Separated-theme grouping).
      // `imprint` drives the preview card's spec line.
      rows.push({ lineId: l.id, parentLineId: l.parentLineId || null, brand: (p.brand && p.brand !== 'Custom') ? p.brand : '', title, subtitle, img, qty, unitPrice, lineTotal,
        origUnit, origTotal: origUnit != null ? Math.round(qty * origUnit * 100) / 100 : null, free: isFree, imprint });
    }
  }
  const promotion = opts.promotion || null;
  const freePromo = !!(promotion && promotion.promoType === 'FREE_QUANTITY');
  const savings = promotion ? promoDiscount(promotion) : 0;
  // HAR totals: Subtotal (incl. free lines at full price) → −Promotion →
  // Total. For FREE_QUANTITY the discount = OUR summed free-line value (+ any
  // order-level $ off) so Subtotal − Promotion lands exactly on the paid sum
  // even when a ladder fallback stood in for the site's number; a monetary
  // promo keeps the site's discount as before.
  const orderOff = freePromo ? (Number(promotion.orderLevelDiscount) || 0) : 0;
  const discount = freePromo ? Math.round((freeTotal + orderOff) * 100) / 100 : savings;
  // `rawLines` carries the product + decoration so the composer can render the
  // personalization snapshots; `lines` stays the flat display rows.
  return { groupName: 'Your Custom Order', optionName: name || 'Option 1', lines: rows, rawLines: lines || [],
    total: Math.round(total * 100) / 100, discount, savings, freePromo, promoCode: (promotion && promotion.promo) || '', cartLink: opts.cartLink || null, onSubmit: opts.onSubmit || null };
};

/* cartLinkOf — mirrors GiftCatalog's cartLinkOf (~line 3160). */
const cartLinkOf = (cartId) => cartId
  ? `https://www.golfballs.com/cart?cartID=${cartId}&utm_medium=Proposal&utm_source=Proposal-${cartId}`
  : null;

/* ── Public API ───────────────────────────────────────────────── */

/**
 * Build the email `source` model from one or more saved proposal cart IDs,
 * reproducing GiftCatalog's pipeline exactly.
 *
 * @param {string[]} cartIds   One or more proposal cart IDs.
 * @param {{name?:string, optionNamesByCartId?:Record<string,string>}} baseMeta
 *        Shared cart metadata plus optional per-cart proposal names.
 * @returns Single cart → a proposalToEmailSource result.
 *          Multiple carts → the combined multi shape
 *          { sections, rawLines, lines:[], total, groupName, optionName }.
 */
export async function buildEmailSourceFromCartIds(cartIds, baseMeta = {}) {
  const ids = (cartIds || []).filter(Boolean);
  const meta = baseMeta || {};
  const optionNamesByCartId = meta.optionNamesByCartId || {};
  const sources = [];
  for (let i = 0; i < ids.length; i++) {
    const cartId = ids[i];
    const mappedName = typeof optionNamesByCartId[cartId] === 'string' ? optionNamesByCartId[cartId].trim() : '';
    const name = mappedName || meta.name || `Option ${i + 1}`;
    const entry = cartToEntry(await loadProposalCart(cartId), { ...meta, name });
    const lines = linesFromSaved(entry, rid);
    // `cartToEntry` recovers both the materialized `-PROMO` giveaway line and
    // the cart's promotion object. The line alone can render "FREE", but the
    // promotion is what supplies the code and tells proposalToEmailSource to
    // net the giveaway's full value out of the subtotal.
    sources.push(proposalToEmailSource(lines, name, {
      promotion: entry.promotion,
      cartLink: cartLinkOf(cartId),
    }));
  }
  if (sources.length === 1) return sources[0];
  // Combined multi shape — mirrors GiftCatalog's buildMultiEmailSource (~3186).
  return {
    sections: sources,
    rawLines: sources.flatMap((s) => s.rawLines || []),
    lines: [],
    total: Math.round(sources.reduce((a, s) => a + (s.total || 0), 0) * 100) / 100,
    groupName: 'Your Custom Order',
    optionName: `${sources.length} proposals`,
  };
}
