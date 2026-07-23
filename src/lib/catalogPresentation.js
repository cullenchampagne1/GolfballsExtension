import { hasPromo, onSale } from './giftCatalogMath.js';

export const CATALOG_SCALE_DEFAULT = 1.8;
export const CATALOG_SCALE_MIN = 1;
export const CATALOG_SCALE_MAX = 3;
export const CATALOG_CARD_WIDTH = 1180;
export const CATALOG_CARD_HEIGHT = 760;
export const CATALOG_PROPOSAL_WIDTH = 416;
export const CATALOG_VIEWPORT_GUTTER = 48;
export const CATALOG_MOUNT_SCALE_CATEGORY = null;
export const CATALOG_ACCOUNT_CONTEXT_NOTICE = Object.freeze({
  title: 'No account in context',
  message: 'Open the catalog from a Golfballs.com CRM account or opportunity page to view its active proposals.',
});

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
