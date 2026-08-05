import { hasPromo, onSale } from './giftCatalogMath.js';

export const CATALOG_SCALE_DEFAULT = 1.8;
export const CATALOG_SCALE_MIN = 1;
export const CATALOG_SCALE_MAX = 3;
export const CATALOG_CARD_WIDTH = 1180;
export const CATALOG_CARD_HEIGHT = 760;
export const CATALOG_PROPOSAL_WIDTH = 416;
export const CATALOG_VIEWPORT_GUTTER = 48;
export const CATALOG_MOUNT_SCALE_CATEGORY = null;
// Keep the existing checkout UI in source, but do not offer its proposal
// entry point until it submits a real order instead of a preview confirmation.
export const PROPOSAL_CHECKOUT_AVAILABLE = false;
export const CATALOG_ACCOUNT_CONTEXT_NOTICE = Object.freeze({
  title: 'No account in context',
  message: 'Open the catalog from a Golfballs.com CRM account or opportunity page to view its active proposals.',
});

export function canOfferProposalCheckout(buildCheckoutSource, itemCount) {
  return PROPOSAL_CHECKOUT_AVAILABLE
    && typeof buildCheckoutSource === 'function'
    && Number(itemCount) > 0;
}

/* The custom-item and saved-proposal transfer views share this expansion
 * contract. Interpolating `height: 0` -> `height: auto` with a spring asks
 * Motion to repeatedly re-measure dynamic nested content; a spring can then
 * overshoot that measurement and briefly make the panel extremely tall.
 * A 0fr -> 1fr grid track expands to intrinsic height without measuring an
 * `auto` endpoint, while the bounded tween cannot overshoot. */
export const STORE_TRANSFER_PANEL_MOTION = Object.freeze({
  initial: Object.freeze({ gridTemplateRows: '0fr', opacity: 0, y: -6 }),
  animate: Object.freeze({ gridTemplateRows: '1fr', opacity: 1, y: 0 }),
  exit: Object.freeze({ gridTemplateRows: '0fr', opacity: 0, y: -6 }),
  transition: Object.freeze({ duration: 0.2, ease: Object.freeze([0.32, 0.72, 0, 1]) }),
});

/* Masonry geometry for the saved-proposal galleries.
 *
 * Cards are absolutely positioned from JS-measured heights, so unlike a CSS
 * grid nothing in the browser guarantees the gap: the reservation for a card
 * has to be at least what it actually occupies or the next card in that column
 * lands on top of it. The running offset arithmetic is exact, so the only way
 * a gap can collapse is a bad measurement — hence the input guard, which is
 * what a raw `heights[id] || FALLBACK` misses for a negative value.
 */
export const MASONRY_GAP = 12;
export const MASONRY_COL_MIN = 290;
/** Reservation for a card that has not reported its height yet. */
export const MASONRY_ASSUMED_HEIGHT = 240;

/** A usable card height, or the assumed one — never something that would
 *  reserve less space than the card occupies. */
export function masonryHeight(value) {
  const height = Number(value);
  return Number.isFinite(height) && height > 0 ? height : MASONRY_ASSUMED_HEIGHT;
}

export function computeMasonry(items, width, heights) {
  const rows = Array.isArray(items) ? items : [];
  const usable = Number(width);
  if (!Number.isFinite(usable) || usable <= 0) {
    return { positions: {}, height: 0, colW: MASONRY_COL_MIN, cols: 1 };
  }
  const cols = Math.max(
    1, Math.floor((usable + MASONRY_GAP) / (MASONRY_COL_MIN + MASONRY_GAP)),
  );
  const colW = (usable - MASONRY_GAP * (cols - 1)) / cols;
  const colH = new Array(cols).fill(0);
  const positions = {};
  const measured = heights && typeof heights === 'object' ? heights : {};
  rows.forEach((item) => {
    if (!item || item.id == null) return;
    let c = 0;
    for (let i = 1; i < cols; i += 1) if (colH[i] < colH[c] - 0.5) c = i;
    positions[item.id] = { x: c * (colW + MASONRY_GAP), y: colH[c] };
    colH[c] += masonryHeight(measured[item.id]) + MASONRY_GAP;
  });
  return {
    positions,
    height: Math.max(0, Math.max(...colH, 0) - MASONRY_GAP),
    colW,
    cols,
  };
}

/* Product-grid card geometry.
 *
 * The catalog is transformed as one large surface and lives inside arbitrary
 * host-page CSS. Content-sized grid tracks are therefore too fragile: font
 * metrics can be fractional, and a host content-box rule turns height:100%
 * into 100% PLUS padding/border. Every track and its wrapper are instead pinned
 * to the same integer height, while ProductCard clips its own contents.
 *
 * Each part below is an integer, and the variable rows (brand/rating, SKU) are
 * RESERVED whether or not the product has them, so every card in every column
 * is byte-identical in height. Keep these in sync with ProductCard's styles.
 */
export const CARD_METRICS = Object.freeze({
  compact: Object.freeze({
    pad: 9, image: 132, contentTop: 8, gap: 4, brand: 14, title: 32, sku: 13, price: 32,
  }),
  normal: Object.freeze({
    pad: 11, image: 156, contentTop: 10, gap: 5, brand: 15, title: 34, sku: 14, price: 36,
  }),
});
export const CARD_BORDER = 2;      // 1px top + 1px bottom
export const CARD_STACK_GAPS = 4;  // brand, title, SKU, spacer, price = 4 gaps
/* Text rows are measured from font metrics, which differ slightly by platform,
   DPI and zoom level — the reason this only ever bit on SOME displays. The
   track must never be SHORTER than the card's content (cards clip at
   overflow:hidden), so carry a couple of px of headroom; the card's flex
   spacer absorbs it, keeping the price row bottom-aligned. */
export const CARD_SAFETY = 4;

/** Exact integer height of one product-grid row for the given density. */
export function catalogRowHeight(compact = false) {
  const m = compact ? CARD_METRICS.compact : CARD_METRICS.normal;
  return CARD_BORDER
    + m.pad * 2                    // card padding, top + bottom
    + m.image                      // fixed image box
    + m.contentTop                 // content block's padding-top
    + m.brand                      // brand / rating row
    + m.title                      // fixed 2-line title
    + m.sku                        // SKU row (reserved even when absent)
    + m.gap * CARD_STACK_GAPS      // gaps include the flexible spacer
    + m.price                      // price + Add button row
    + CARD_SAFETY;
}

/** A hard grid-area boundary for every product-card wrapper. Grid items have
 *  an automatic min-height based on their contents; without minHeight:0, an
 *  animated wrapper can exceed a fixed track even when its child says 100%. */
export function catalogGridItemStyle(compact = false) {
  const height = catalogRowHeight(compact);
  return {
    height,
    minHeight: 0,
    maxHeight: height,
    minWidth: 0,
    boxSizing: 'border-box',
  };
}

/* Identity of "what the user is looking at" in the product grid.
 *
 * The grid resets its render window and scrolls to top when this changes. It
 * deliberately covers only the BROWSING CRITERIA — never the result array or
 * anything favourite-related: `results` is rebuilt on every dependent memo run,
 * and favoriting produces a fresh Set each toggle, so keying the reset on the
 * array made starring a card in a department view snap the grid back to the top.
 */
export function catalogGridResetKey({
  sel = 'all', query = '', sort = '', special = null,
  searchingAll = false, brands = [],
} = {}) {
  const list = Array.from(brands || []).map((b) => String(b)).sort();
  return JSON.stringify([sel, query, sort, special, !!searchingAll, list]);
}

export function normalizeCatalogScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return CATALOG_SCALE_DEFAULT;
  return Math.max(CATALOG_SCALE_MIN, Math.min(CATALOG_SCALE_MAX, numeric));
}

/* Preserve the fixed catalog composition while uniformly fitting it inside the
   live CSS viewport. The preferred scale remains the ceiling; a smaller
   browser/page viewport can only shrink the surface, never magnify it. */
export function fitCatalogScale(preferred, viewportWidth, viewportHeight, contentWidth = CATALOG_CARD_WIDTH) {
  const requested = normalizeCatalogScale(preferred);
  const width = Number(viewportWidth);
  const height = Number(viewportHeight);
  const layoutWidth = Number(contentWidth);
  if (
    !Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(layoutWidth)
    || width <= 0 || height <= 0 || layoutWidth <= 0
  ) return requested;
  const fit = Math.min(
    (width - CATALOG_VIEWPORT_GUTTER) / layoutWidth,
    (height - CATALOG_VIEWPORT_GUTTER) / CATALOG_CARD_HEIGHT,
  );
  return Math.min(requested, Math.max(0.1, fit));
}

/* Promotional feeds sometimes also carry a normal orig > price markdown.
   Both flags describe the same card-level deal, so the richer promotion wins
   and only one badge is rendered. */
export function catalogDealBadge(product) {
  if (hasPromo(product)) {
    const raw = typeof product.promo === 'object' ? product.promo?.label : product.promo;
    return { kind: 'promo', label: String(raw || 'Promo') };
  }
  if (onSale(product)) return { kind: 'sale', label: 'Sale' };
  return null;
}

export function catalogSidebarLabel(label) {
  return label === 'Promotional Products' ? 'Promotional' : label;
}
