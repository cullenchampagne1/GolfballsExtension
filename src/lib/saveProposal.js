/* ───────────────────────────────────────────────────────────────────────────
   saveProposal.js — turn the modal's in-memory proposal into a golfballs.com
   cart/proposal and save it server-side.

   The modal proposal is an array of lines:
     { id, productId, product, splits:[{ id, qty, price }], decoration? }
   where `product` is the normalized catalog product (carries url + breaks) and
   `decoration` (optional) is the engine-agnostic descriptor CustomizeBlock
   emits (see cartSerializer.buildDecoration).

   Each split → one cart line (the site stores one totalQty/ItemPrice per line).
   For each unique product we fetch the raw __NEXT_DATA__.product (the shape the
   serializer needs) via the background, then assembleLine() + buildSaveCartBody()
   and PUT it through the giftSaveCart relay.
   ─────────────────────────────────────────────────────────────────────────── */

import { assembleLine, buildSaveCartBody } from './cartSerializer.js';

function sendBg(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      reject(new Error('Not in an extension context'));
      return;
    }
    try {
      chrome.runtime.sendMessage({ action, ...payload }, (resp) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        if (!resp || !resp.ok) { reject(new Error((resp && resp.error) || (action + ' failed'))); return; }
        resolve(resp);
      });
    } catch (e) { reject(e); }
  });
}

/* Fetch the raw product object for every unique product URL, in parallel
   (deduped). Returns Map(url → product|null). A null means the page fetch
   failed for that product — its lines are skipped + reported. */
async function fetchRawProducts(urls) {
  const uniq = [...new Set(urls.filter(Boolean))];
  const entries = await Promise.all(uniq.map(async (url) => {
    try { const r = await sendBg('fetchProductRaw', { url }); return [url, r.product]; }
    catch { return [url, null]; }
  }));
  return new Map(entries);
}

/* Build the saveCart itemsInCart[] from the proposal. Returns
   { items, skipped:[{title, reason}] }. */
export async function buildProposalLines(proposal) {
  const rawByUrl = await fetchRawProducts(proposal.map((l) => l.product && l.product.url));
  const items = [];
  const skipped = [];
  for (const line of (proposal || [])) {
    const cat = line.product || {};
    const raw = rawByUrl.get(cat.url);
    if (!raw) { skipped.push({ title: cat.title || cat.sku || 'item', reason: 'product page unavailable' }); continue; }
    const breaks = cat.breaks || [];
    for (const split of (line.splits || [])) {
      items.push(assembleLine({
        product: raw,
        pricing: { price: split.price, breaks },
        decoration: line.decoration || { engine: 'none' },
        qty: split.qty,
      }));
    }
  }
  return { items, skipped };
}

/* Save the proposal as a cart/proposal. Resolves to
   { cartNumber, cartID, message, savedLines, skipped }. Throws if nothing
   could be assembled (so the UI surfaces a real error rather than a silent
   empty save). Pass the prior cartID as `proposalID` to update in place. */
export async function saveProposalDraft(proposal, { proposalID = null, customerID = 0, salesRepID = 0 } = {}) {
  if (!proposal || !proposal.length) throw new Error('Proposal is empty');
  const { items, skipped } = await buildProposalLines(proposal);
  if (!items.length) throw new Error('Could not load product data for any line — try again');
  const body = buildSaveCartBody(items, { proposalID, customerID, salesRepID });
  const resp = await sendBg('giftSaveCart', { body });
  return {
    cartNumber: resp.cartNumber,
    cartID: resp.cartID,
    message: resp.message,
    savedLines: items.length,
    skipped,
  };
}
