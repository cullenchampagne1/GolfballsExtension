/* ───────────────────────────────────────────────────────────────
   priorOrderEngine — historical order → current proposal.

   The background worker follows the CRM's real Duplicate Order link and returns
   a PII-free cart projection. This module owns the business decision after that:
   retain a still-current exact product, reprice it from today's catalog, or move
   a discontinued item to a high-confidence current-generation equivalent.
   Ambiguous items are never silently substituted; they remain review lines and
   block unattended action-based proposal creation.
─────────────────────────────────────────────────────────────── */

import { sendBackgroundMessage } from './backgroundMessage.js';
import { loadCatalog } from './giftCatalog.js';
import {
  cartItemToLine,
  defaultProposalExpiration,
  proposalCartUrl,
  saveProposalToOpportunity,
} from './saveProposal.js';
import { linePriceAt } from './giftCatalogMath.js';

const DISCONTINUED = /^(?:priorgen|clearance|excludestock|discontinued)$/i;
const NOISE = new Set([
  'the', 'new', 'custom', 'logo', 'personalized', 'golf', 'ball', 'balls',
  'dozen', 'pack', 'model', 'edition', 'stock', 'personalisation', 'personalization',
]);

const str = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
const lowerId = (value) => str(value).toLowerCase();
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const PRIOR_ORDER_NO_DUPLICATE_CART = 'PRIOR_ORDER_NO_DUPLICATE_CART';

export function isPriorOrderWithoutDuplicateCart(error) {
  return str(error && error.code) === PRIOR_ORDER_NO_DUPLICATE_CART
    || str(error && error.message) === 'This order does not expose a Duplicate Order cart';
}

export function orderIdOf(order) {
  const source = order && typeof order === 'object' ? order : {};
  const direct = [source.orderId, source.orderID, source.url, source.id]
    .map((value) => str(value))
    .find((value) => /^\d{1,12}$/.test(value) && Number(value) > 0);
  if (direct) return direct;
  for (const value of [source.href, source.orderUrl]) {
    try {
      const id = new URL(str(value), 'https://api.golfballs.com').searchParams.get('orderID');
      if (/^\d{1,12}$/.test(String(id || '')) && Number(id) > 0) return String(id);
    } catch { /* try the next representation */ }
  }
  const visible = str(source.number);
  return /^\d{1,12}$/.test(visible) && Number(visible) > 0 ? visible : '';
}

function pathOf(product) {
  const value = str(product && (product.urlPath || product.url));
  try { return new URL(value, 'https://www.golfballs.com').pathname.toLowerCase().replace(/\/$/, ''); }
  catch { return value.toLowerCase().replace(/[?#].*$/, '').replace(/\/$/, ''); }
}

function brandKey(value) {
  return str(value).toLowerCase().replace(/\bgolf\b/g, '').replace(/[^a-z0-9]/g, '');
}

function titleWords(value, brand = '') {
  const brandWords = new Set(str(brand).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return str(value).toLowerCase()
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !NOISE.has(word) && !brandWords.has(word));
}

function normalizedTitle(product) {
  return titleWords(product && product.title, product && product.brand).join(' ');
}

function dice(left, right) {
  const a = str(left).replace(/\s+/g, '');
  const b = str(right).replace(/\s+/g, '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const counts = new Map();
  for (let i = 0; i < a.length - 1; i += 1) {
    const pair = a.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) || 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const pair = b.slice(i, i + 2);
    const count = counts.get(pair) || 0;
    if (count > 0) { overlap += 1; counts.set(pair, count - 1); }
  }
  return (2 * overlap) / (a.length + b.length - 2);
}

function tokenOverlap(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.max(a.size, b.size);
}

export function isDiscontinuedProduct(product) {
  return (Array.isArray(product && product.tags) ? product.tags : [])
    .some((tag) => DISCONTINUED.test(str(tag).replace(/[\s_-]+/g, '')));
}

function hasCurrentPrice(product) {
  const breaks = Array.isArray(product && product.breaks) ? product.breaks : [];
  if (product && product.customLogo) {
    // A stock retail price on a logo-capable document is not enough to create a
    // commissionable proposal. Live normalized products explicitly identify the
    // ladder source; legacy bundled seed products predate that field but already
    // contain hand-verified ladders, so undefined remains backward compatible.
    if (product.hasCustomLogoPriceBreaks === false) return false;
    return breaks.some((entry) => Number(entry && entry.p) > 0);
  }
  return Number(product && product.price) > 0
    || breaks.some((entry) => Number(entry && entry.p) > 0);
}

function logoCompatible(oldProduct, candidate) {
  return !!oldProduct.customLogo === !!candidate.customLogo;
}

function identityValues(product) {
  return new Set([
    product && product.sourceId,
    product && product.parentCode,
    product && product.sku,
  ].map(lowerId).filter(Boolean));
}

function identitiesOverlap(left, right) {
  const a = identityValues(left);
  for (const value of identityValues(right)) if (a.has(value)) return true;
  return false;
}

function modelTokens(product) {
  return titleWords(product && product.title, product && product.brand)
    .filter((word) => /\d/.test(word));
}

function yearOf(product) {
  const years = str(product && product.title).match(/\b(?:19|20)\d{2}\b/g) || [];
  return years.length ? Math.max(...years.map(Number)) : 0;
}

/** Score a potential successor on a 0–100 scale. A model token containing a
 * digit (TP5, V1, Tour B X) must survive exactly, preventing TP5→TP5x and
 * Pro V1→Pro V1x guesses. */
export function replacementScore(oldProduct, candidate) {
  if (!oldProduct || !candidate || isDiscontinuedProduct(candidate) || !hasCurrentPrice(candidate)) return -Infinity;
  if (!logoCompatible(oldProduct, candidate)) return -Infinity;
  const oldBrand = brandKey(oldProduct.brand);
  const nextBrand = brandKey(candidate.brand);
  if (oldBrand && nextBrand && oldBrand !== nextBrand) return -Infinity;

  const oldWords = titleWords(oldProduct.title, oldProduct.brand);
  const nextWords = titleWords(candidate.title, candidate.brand);
  const requiredModels = modelTokens(oldProduct);
  if (requiredModels.length && !requiredModels.every((token) => nextWords.includes(token))) return -Infinity;

  const titleSimilarity = dice(normalizedTitle(oldProduct), normalizedTitle(candidate));
  const overlap = tokenOverlap(oldWords, nextWords);
  const sameFamily = oldProduct.dept && candidate.dept && oldProduct.dept === candidate.dept
    ? 5 : oldProduct.cat && candidate.cat && oldProduct.cat === candidate.cat ? 5 : 0;
  return round2(
    (oldBrand && nextBrand && oldBrand === nextBrand ? 20 : 8)
    + 20
    + titleSimilarity * 40
    + overlap * 15
    + sameFamily,
  );
}

function bestReplacement(oldProduct, catalog) {
  const ranked = (Array.isArray(catalog) ? catalog : [])
    .map((candidate) => ({ candidate, score: replacementScore(oldProduct, candidate) }))
    .filter((entry) => Number.isFinite(entry.score) && entry.score >= 72)
    .sort((a, b) => (b.score - a.score) || (yearOf(b.candidate) - yearOf(a.candidate)) || str(a.candidate.title).localeCompare(str(b.candidate.title)));
  if (!ranked.length) return null;
  if (ranked[1] && ranked[0].score - ranked[1].score < 4 && yearOf(ranked[0].candidate) === yearOf(ranked[1].candidate)) return null;
  return ranked[0];
}

function blankLogoDecoration(product) {
  const ball = product && (product.dept === 'Golf Balls' || /golf.?balls/i.test(str(product.itemType)));
  return {
    engine: ball ? 'ballLogo' : 'logoOverlay',
    baseColor: '#FFFFFF',
    finish: { MFS: '279', SecondMFS: '279' },
    dualPole: false,
    pole2: null,
    logo: null,
  };
}

function applyCurrentProduct(line, product, { replaced = false, score = 100 } = {}) {
  const oldProduct = line.product || {};
  const decoration = line.decoration || (oldProduct.customLogo ? blankLogoDecoration(product) : null);
  const next = {
    ...line,
    productId: product.id,
    product,
    decoration,
    variant: replaced ? null : line.variant,
  };
  let priceChanged = false;
  next.splits = (line.splits || []).map((split) => {
    const price = round2(linePriceAt(next, Number(split.qty) || 1));
    if (Math.abs(price - (Number(split.price) || 0)) > 0.005) priceChanged = true;
    return { ...split, price, priceEdited: false };
  });
  next.refresh = {
    status: replaced ? 'replaced' : (priceChanged ? 'repriced' : 'current'),
    previousTitle: str(oldProduct.title),
    currentTitle: str(product.title),
    previousPrice: round2(line.splits && line.splits[0] && line.splits[0].price),
    currentPrice: round2(next.splits[0] && next.splits[0].price),
    score,
    reason: replaced
      ? 'Moved to the current-generation catalog match; review variant selections.'
      : priceChanged ? 'Updated to current catalog pricing.' : 'Current catalog product and pricing confirmed.',
  };
  return next;
}

/** Convert sanitized historical cart lines and reconcile every paid item. */
export function refreshPriorOrderCart(cartData, catalog) {
  const rawItems = Array.isArray(cartData && cartData.itemsInCart) ? cartData.itemsInCart : [];
  const history = rawItems.map(cartItemToLine).filter((line) => !line.free);
  const products = Array.isArray(catalog) ? catalog : [];
  const lines = history.map((line) => {
    const oldProduct = line.product || {};
    const exact = products.filter((candidate) => (
      logoCompatible(oldProduct, candidate)
      && (identitiesOverlap(oldProduct, candidate) || (pathOf(oldProduct) && pathOf(oldProduct) === pathOf(candidate)))
    ));
    const currentExact = exact.filter((candidate) => !isDiscontinuedProduct(candidate) && hasCurrentPrice(candidate));
    if (currentExact.length) {
      const byPath = currentExact.find((candidate) => pathOf(candidate) === pathOf(oldProduct));
      return applyCurrentProduct(line, byPath || currentExact[0]);
    }

    const replacement = bestReplacement(oldProduct, products);
    if (replacement) return applyCurrentProduct(line, replacement.candidate, { replaced: true, score: replacement.score });

    return {
      ...line,
      unavailable: true,
      refresh: {
        status: 'review',
        previousTitle: str(oldProduct.title),
        currentTitle: '',
        previousPrice: round2(line.splits && line.splits[0] && line.splits[0].price),
        currentPrice: null,
        score: 0,
        reason: 'No unambiguous in-stock current-generation match was found.',
      },
    };
  });
  const counts = lines.reduce((out, line) => {
    const status = line.refresh && line.refresh.status || 'review';
    out[status] = (out[status] || 0) + 1;
    return out;
  }, { current: 0, repriced: 0, replaced: 0, review: 0 });
  return { lines, counts };
}

export async function fetchPriorOrderCart(order) {
  const orderId = orderIdOf(order);
  if (!orderId) throw new Error('The selected order has no usable CRM order id');
  const response = await sendBackgroundMessage('giftLoadPriorOrder', { orderId });
  if (!response || !response.order) throw new Error('Could not load the duplicated order');
  return response.order;
}

export async function loadPriorOrderEntry(order, options = {}) {
  const cart = await fetchPriorOrderCart(order);
  const catalog = Array.isArray(options.catalog) ? options.catalog : await loadCatalog();
  const refreshed = refreshPriorOrderCart(cart, catalog);
  const orderId = orderIdOf(order);
  return {
    id: `order-${orderId}`,
    name: `Order ${str(order && order.number) || orderId}`,
    date: str((order && order.date) || cart.orderDate),
    expiration: '',
    orderId,
    orderStatus: str(order && order.status),
    orderSummary: str(order && order.summary),
    revenue: Number(order && order.revenue) || 0,
    source: 'order',
    lines: refreshed.lines,
    refreshCounts: refreshed.counts,
  };
}

/** Load every visible order without navigating away. Concurrency stays low so
 * the authenticated CRM and legacy checkout endpoint are not stampeded. */
export async function loadPriorOrderEntries(orders, options = {}) {
  const source = (Array.isArray(orders) ? orders : []).filter((order) => orderIdOf(order));
  const catalog = Array.isArray(options.catalog) ? options.catalog : await loadCatalog();
  const loadEntry = typeof options.loadEntry === 'function' ? options.loadEntry : loadPriorOrderEntry;
  const results = new Array(source.length);
  let cursor = 0;
  let completed = 0;
  const worker = async () => {
    while (cursor < source.length) {
      const index = cursor;
      cursor += 1;
      const order = source[index];
      try { results[index] = await loadEntry(order, { catalog }); }
      catch (error) {
        if (isPriorOrderWithoutDuplicateCart(error)) {
          results[index] = null;
          completed += 1;
          if (typeof options.onProgress === 'function') options.onProgress(completed, source.length);
          continue;
        }
        const orderId = orderIdOf(order);
        results[index] = {
          id: `order-${orderId}`,
          name: `Order ${str(order.number) || orderId}`,
          date: str(order.date),
          orderId,
          orderStatus: str(order.status),
          orderSummary: str(order.summary),
          source: 'order',
          lines: [],
          loadError: str(error && error.message) || 'Could not load this order',
          refreshCounts: { current: 0, repriced: 0, replaced: 0, review: 0 },
        };
      }
      completed += 1;
      if (typeof options.onProgress === 'function') options.onProgress(completed, source.length);
    }
  };
  const concurrency = Math.max(1, Math.min(3, Number(options.concurrency) || 2, source.length || 1));
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results.filter(Boolean);
}

/** Action-engine writer: rebuild an order against today's catalog, then save it
 * directly to the newly/currently selected CRM opportunity. */
export async function createProposalFromOrder(input = {}, context = {}) {
  const order = input.order || context.order;
  const entry = await loadPriorOrderEntry(order, { catalog: input.catalog });
  const review = entry.lines.filter((line) => line.refresh && line.refresh.status === 'review');
  if (review.length) {
    throw new Error(`${review.length} prior-order item${review.length === 1 ? '' : 's'} need review before this proposal can be created`);
  }
  if (!entry.lines.length) throw new Error('The selected order has no reusable items');
  const opportunityID = str(input.opportunityId || input.opportunityID);
  const name = str(input.name) || `${entry.name} reorder`;
  const saved = await saveProposalToOpportunity(entry.lines, {
    opportunityID,
    customerID: input.customerId || context.contactId || 0,
    name,
    expiration: str(input.expiration) || defaultProposalExpiration(),
  });
  const url = proposalCartUrl(opportunityID, saved.cartID);
  return {
    ok: true,
    cartID: str(saved.cartID),
    proposalId: str(saved.cartID),
    proposalUrl: url,
    proposalUrlHtml: url.replace(/&/g, '&amp;').replace(/"/g, '&quot;'),
    opportunityId: opportunityID,
    orderId: entry.orderId,
    name,
    lineCount: saved.savedLines,
    replaced: entry.refreshCounts.replaced,
    repriced: entry.refreshCounts.repriced,
    skipped: Array.isArray(saved.skipped) ? saved.skipped.length : 0,
  };
}
