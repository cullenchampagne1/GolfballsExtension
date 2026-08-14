/* Pure nested schema for actions.createProposal({ items }). */

const str = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
const ITEM_FIELDS = new Set(['sku', 'quantity', 'qty', 'price', 'customLogo', 'decoration', 'variant', 'splits']);
const SPLIT_FIELDS = new Set(['quantity', 'qty', 'price']);

function quantityError(value, label) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 1_000_000
    ? '' : `${label} quantity must be a positive whole number`;
}

function priceError(value, label) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000
    ? '' : `${label} price must be a non-negative number`;
}

export function validateCatalogProposalItems(items) {
  const errors = [];
  if (!Array.isArray(items) || !items.length) return ['createProposal needs at least one catalog item'];
  if (items.length > 100) errors.push('createProposal supports at most 100 catalog items');
  items.slice(0, 100).forEach((item, index) => {
    const label = `createProposal item ${index + 1}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${label} must be an object`);
      return;
    }
    for (const field of Object.keys(item)) if (!ITEM_FIELDS.has(field)) errors.push(`${label} has unknown field “${field}”`);
    if (!str(item.sku)) errors.push(`${label} needs a SKU`);
    else if (str(item.sku).length > 128) errors.push(`${label} SKU is too long`);
    if (item.customLogo != null && typeof item.customLogo !== 'boolean') errors.push(`${label} customLogo must be true or false`);
    if (item.decoration != null && (typeof item.decoration !== 'object' || Array.isArray(item.decoration))) errors.push(`${label} decoration must be an object`);
    if (item.variant != null && (typeof item.variant !== 'object' || Array.isArray(item.variant))) errors.push(`${label} variant must be an object`);
    if (item.price != null) {
      const priceIssue = priceError(item.price, label);
      if (priceIssue) errors.push(priceIssue);
    }
    const splits = item.splits;
    if (splits != null) {
      if (!Array.isArray(splits) || !splits.length) errors.push(`${label} splits must be a non-empty array`);
      else if (splits.length > 20) errors.push(`${label} supports at most 20 split tiers`);
      else splits.forEach((split, splitIndex) => {
        const splitLabel = `${label} split ${splitIndex + 1}`;
        if (!split || typeof split !== 'object' || Array.isArray(split)) { errors.push(`${splitLabel} must be an object`); return; }
        for (const field of Object.keys(split)) if (!SPLIT_FIELDS.has(field)) errors.push(`${splitLabel} has unknown field “${field}”`);
        const quantityIssue = quantityError(split.quantity ?? split.qty, splitLabel);
        if (quantityIssue) errors.push(quantityIssue);
        if (split.price != null) {
          const priceIssue = priceError(split.price, splitLabel);
          if (priceIssue) errors.push(priceIssue);
        }
      });
    } else {
      if (item.quantity == null && item.qty == null) {
        errors.push(`${label} needs a quantity or splits`);
      } else {
        const quantityIssue = quantityError(item.quantity ?? item.qty, label);
        if (quantityIssue) errors.push(quantityIssue);
      }
    }
  });
  return errors;
}
