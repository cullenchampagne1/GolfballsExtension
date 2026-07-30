import { runEngine } from './runner.js';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Convert a Page Engine result into the small, non-ambiguous owner diagnostic
 * used by the developer action. The numeric select value wins; the selected
 * owner name is kept separately for pages that expose only display text. */
export function ownerInfoFromResult(result) {
  if (!result?.schemaId || !result?.data) return null;
  const data = result.data;
  const account = data.account && typeof data.account === 'object' ? data.account : {};
  const order = data.order && typeof data.order === 'object' ? data.order : {};
  const ids = data.ids && typeof data.ids === 'object' ? data.ids : {};
  const schemaId = clean(result.schemaId);
  const recordId = clean({
    account: ids.account,
    contact: ids.contact,
    opportunity: ids.opportunity,
    order: ids.order,
  }[schemaId]);
  return {
    schemaId,
    recordId,
    accountId: clean(ids.account || order.customerId || ids.customer),
    ownerId: clean(account.salesRepId || order.salesRepId),
    ownerName: clean(account.salesRep || order.salesRep),
  };
}

export function inspectPageOwner(doc) {
  return ownerInfoFromResult(runEngine(doc));
}
