/* ───────────────────────────────────────────────────────────────
   catalogProposalEngine — current-catalog proposals for actions + UI.

   This is the programmatic counterpart to Gift Catalog's proposal sidebar.
   A script supplies stable SKU instructions; the engine resolves each against
   today's complete catalog, creates the exact same editable line shape as the
   modal, optionally validates a live promo, and saves through the established
   opportunity proposal writer.
─────────────────────────────────────────────────────────────── */

import { loadCatalog } from './giftCatalog.js';
import { linePriceAt } from './giftCatalogMath.js';
import { blankLogoDecoration, supportsLogo } from './giftImprints.js';
import { validateCatalogProposalItems } from './catalogProposalSchema.js';
import {
  defaultProposalExpiration,
  proposalCartUrl,
  saveProposalToOpportunity,
  validatePromo,
} from './saveProposal.js';

const str = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
const key = (value) => str(value).toLowerCase();
const round2 = (value) => Math.round(Number(value) * 100) / 100;
const DISCONTINUED = /^(?:priorgen|clearance|excludestock|discontinued)$/i;

export { validateCatalogProposalItems } from './catalogProposalSchema.js';

function currentProduct(product) {
  const tags = Array.isArray(product && product.tags) ? product.tags : [];
  if (tags.some((tag) => DISCONTINUED.test(str(tag).replace(/[\s_-]+/g, '')))) return false;
  if (product && product.customLogo) {
    if (product.hasCustomLogoPriceBreaks === false) return false;
    return (product.breaks || []).some((entry) => Number(entry && entry.p) > 0);
  }
  return Number(product && product.price) > 0
    || (product && product.breaks || []).some((entry) => Number(entry && entry.p) > 0);
}

function yearOf(product) {
  const years = str(product && product.title).match(/\b(?:19|20)\d{2}\b/g) || [];
  return years.length ? Math.max(...years.map(Number)) : 0;
}

function identityRank(product, sku) {
  const wanted = key(sku);
  const values = [product && product.sku, product && product.parentCode, product && product.sourceId, product && product.id];
  const index = values.findIndex((value) => key(value) === wanted);
  return index < 0 ? Infinity : index;
}

/** Resolve a SKU/product code to one current sellable product. When the same
 * parent has stock + commissionable documents, commissionable wins by default;
 * callers can request `customLogo:false` for the stock document explicitly. */
export function findCatalogProductBySku(catalog, sku, options = {}) {
  const wanted = str(sku);
  if (!wanted) throw new Error('Catalog proposal item needs a SKU');
  let matches = (Array.isArray(catalog) ? catalog : [])
    .map((product) => ({ product, rank: identityRank(product, wanted) }))
    .filter((entry) => Number.isFinite(entry.rank) && currentProduct(entry.product));
  if (!matches.length) throw new Error(`No current in-stock catalog product matches SKU “${wanted}”`);

  if (typeof options.customLogo === 'boolean') {
    matches = matches.filter((entry) => !!entry.product.customLogo === options.customLogo);
    if (!matches.length) {
      throw new Error(`SKU “${wanted}” has no current ${options.customLogo ? 'custom-logo' : 'stock'} catalog product`);
    }
  } else if (matches.some((entry) => entry.product.customLogo)) {
    matches = matches.filter((entry) => entry.product.customLogo);
  }

  matches.sort((left, right) => (
    (left.rank - right.rank)
    || (yearOf(right.product) - yearOf(left.product))
    || str(left.product.title).localeCompare(str(right.product.title))
    || str(left.product.urlPath || left.product.url).localeCompare(str(right.product.urlPath || right.product.url))
  ));
  return matches[0].product;
}

function positiveQuantity(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || number > 1_000_000) {
    throw new Error(`${label} quantity must be a positive whole number`);
  }
  return number;
}

function validPrice(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000) {
    throw new Error(`${label} price must be a non-negative number`);
  }
  return round2(number);
}

/** One normalized product + script instruction → the modal's editable line. */
export function proposalLineFromProduct(product, item = {}, options = {}) {
  if (!product || typeof product !== 'object') throw new Error('A current catalog product is required');
  const makeId = typeof options.idFactory === 'function'
    ? options.idFactory
    : () => Math.random().toString(36).slice(2, 9);
  const decoration = item.decoration || (supportsLogo(product) ? blankLogoDecoration(product) : null);
  const variant = item.variant || null;
  const line = {
    id: makeId(),
    productId: product.id,
    product,
    decoration,
    variant,
    splits: [],
  };
  const splitInputs = Array.isArray(item.splits) && item.splits.length ? item.splits : [item];
  line.splits = splitInputs.map((split, index) => {
    const label = `${str(product.sku || product.title) || 'Catalog item'} split ${index + 1}`;
    const qty = positiveQuantity(split.quantity ?? split.qty ?? item.quantity ?? item.qty ?? product.minQty ?? 1, label);
    const explicit = split.price != null ? split.price : item.price;
    const price = explicit == null ? round2(linePriceAt(line, qty)) : validPrice(explicit, label);
    return { id: makeId(), qty, price, ...(explicit != null ? { priceEdited: true } : {}) };
  });
  return line;
}

/** Resolve every instruction against one catalog snapshot, preserving order. */
export function buildCatalogProposalLines(items, catalog, options = {}) {
  const errors = validateCatalogProposalItems(items);
  if (errors.length) throw new Error(errors.join('; '));
  return items.map((item) => proposalLineFromProduct(
    findCatalogProductBySku(catalog, item.sku, { customLogo: item.customLogo }),
    item,
    options,
  ));
}

/** Action writer: build a proposal from SKUs and save it to an opportunity. */
export async function createCatalogProposal(input = {}, context = {}, options = {}) {
  const opportunityID = str(input.opportunityId || input.opportunityID);
  if (!opportunityID) throw new Error('createProposal needs an opportunityId');
  const catalog = Array.isArray(options.catalog) ? options.catalog : await (options.loadCatalog || loadCatalog)();
  const lines = buildCatalogProposalLines(input.items, catalog, options);
  const promoCode = str(input.promoCode);
  const promotion = promoCode
    ? await (options.validatePromo || validatePromo)(lines, promoCode)
    : null;
  const name = str(input.name) || 'Current catalog proposal';
  const saved = await (options.saveProposal || saveProposalToOpportunity)(lines, {
    opportunityID,
    customerID: input.customerId || context.contactId || 0,
    name,
    expiration: str(input.expiration) || defaultProposalExpiration(),
    promotion,
  });
  const cartID = str(saved && saved.cartID);
  if (!cartID) throw new Error('The proposal save did not return a cart id');
  const url = proposalCartUrl(opportunityID, cartID);
  return {
    ok: true,
    cartID,
    proposalId: cartID,
    proposalUrl: url,
    proposalUrlHtml: url.replace(/&/g, '&amp;').replace(/"/g, '&quot;'),
    opportunityId: opportunityID,
    name,
    lineCount: Number(saved.savedLines) || lines.reduce((count, line) => count + line.splits.length, 0),
    itemCount: lines.length,
    total: round2(lines.reduce((sum, line) => sum + line.splits.reduce((lineSum, split) => lineSum + split.qty * split.price, 0), 0)),
    skipped: Array.isArray(saved.skipped) ? saved.skipped.length : 0,
    promoCode,
  };
}
