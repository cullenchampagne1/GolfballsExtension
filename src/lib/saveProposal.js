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

import { assembleLine, buildSaveCartBody, buildCartData, buildAsCartContents } from './cartSerializer.js';

/* Copy text to the clipboard. Tries the async Clipboard API, then falls back to
   a hidden-textarea execCommand (which survives the loss of transient
   activation after our async product fetches, as long as the doc is focused). */
export function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy command rejected'));
      } catch (e) { reject(e); }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(resolve, fallback);
      else fallback();
    } catch { fallback(); }
  });
}

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

/* The localStorage shape golfballs.com hydrates its cart from — verified live:
   localStorage.shoppingCart === the cartData object WITH a nested shoppingCart
   copy + asCartContents mirror (no `updated` flag, unlike the saveCart PUT). */
function buildLocalStorageCart(items, { proposalID = null } = {}) {
  const cart = buildCartData(items, { proposalID });
  return { ...cart, shoppingCart: cart, asCartContents: buildAsCartContents(items) };
}

/* A paste-and-run console snippet for the golfballs.com tab: writes the cart to
   localStorage.shoppingCart (the key the site reads) and reloads so the cart
   shows. `cartJson` is the already-stringified cart; JSON.stringify wraps it as
   a safe JS string literal. */
function buildCartConsoleCommand(cartJson) {
  return `(function(){try{`
    + `localStorage.setItem('shoppingCart', ${JSON.stringify(cartJson)});`
    + `var n=(JSON.parse(localStorage.getItem('shoppingCart')).itemsInCart||[]).length;`
    + `console.log('%c[GB] Proposal loaded — '+n+' item(s). Reloading cart…','color:#2e9e5b;font-weight:bold');`
    + `location.reload();`
    + `}catch(e){console.error('[GB] proposal load failed:',e);}})();`;
}

/* Build a Save-draft payload: serialize the proposal into the golfballs.com
   cart shape and wrap it in a console command. Returns { command, json,
   itemCount, skipped }. No network — the caller copies `command` to the
   clipboard so the rep can paste it into the site console to preview the cart.
   (A future version persists `json` to extension storage as a preset proposal.) */
export async function buildProposalDraft(proposal, { proposalID = null } = {}) {
  if (!proposal || !proposal.length) throw new Error('Proposal is empty');
  const { items, skipped } = await buildProposalLines(proposal);
  if (!items.length) throw new Error('Could not load product data for any line — try again');
  const json = JSON.stringify(buildLocalStorageCart(items, { proposalID }));
  return { command: buildCartConsoleCommand(json), json, itemCount: items.length, skipped };
}

/* Server save (PUT /user/saveCart) — kept for the future "Send proposal" flow;
   Save draft is clipboard-only for now. Resolves to { cartNumber, cartID, … }. */
export async function saveProposalToServer(proposal, { proposalID = null, customerID = 0, salesRepID = 0 } = {}) {
  if (!proposal || !proposal.length) throw new Error('Proposal is empty');
  const { items, skipped } = await buildProposalLines(proposal);
  if (!items.length) throw new Error('Could not load product data for any line — try again');
  const body = buildSaveCartBody(items, { proposalID, customerID, salesRepID });
  const resp = await sendBg('giftSaveCart', { body });
  return { cartNumber: resp.cartNumber, cartID: resp.cartID, message: resp.message, savedLines: items.length, skipped };
}
