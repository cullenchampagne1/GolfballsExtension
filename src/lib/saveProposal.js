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

import { assembleLine, buildSaveCartBody, buildSaveProposalBody, buildCustomItemLine, buildCartData, buildAsCartContents } from './cartSerializer.js';
import { runEngine } from './page-engine/index.js';
import { needsIngest, ingestImageUrl, saveCustomItem } from './customItems.js';

// golfballs.com second-pole upcharge per dozen (Logo / Text), added on top of
// the custom-logo ladder for a dual-pole imprint. Mirrors the modal's pricing.
const SECOND_POLE_FEE = { logo: 6, text: 4 };

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

/* Single raw product fetch (background-cached). Used by the proposal to price its
   DISPLAY from the same fee ladders the cart uses. Returns the product or null. */
export async function fetchRawProduct(url) {
  if (!url) return null;
  try { const r = await sendBg('fetchProductRaw', { url }); return r.product || null; }
  catch { return null; }
}

/* If a line's decoration carries a locally-aligned image that hasn't been
   uploaded yet, upload it NOW (at save time) and fold the returned
   filePath/cropFilePath/userImage into the decoration so the cart references a
   real, server-rendered logo. Returns the (possibly enriched) decoration. */
async function uploadOneLogo(dataUrl, fileName) {
  const up = await sendBg('uploadCustomLogo', { dataUrl, fileName: fileName || 'logo.png' });
  return { filePath: up.filePath, fileName: up.fileName, cropFilePath: up.cropFilePath, userImage: up.userImage };
}

async function uploadDecorationImage(decoration, skipped, title) {
  let d = decoration || { engine: 'none' };
  // First-pole logo (Custom Logo / Photo / logo overlay).
  if ((d.engine === 'ballLogo' || d.engine === 'logoOverlay') && d._localImageDataUrl && !(d.logo && d.logo.filePath)) {
    try { d = { ...d, logo: await uploadOneLogo(d._localImageDataUrl, (d.logo && d.logo.fileName) || d.fileName) }; }
    catch (e) { skipped.push({ title, reason: 'logo upload failed (' + (e.message || 'error') + ')' }); }
  }
  // Second-pole logo (dual pole). Upload it too and fold into pole2.logo.
  const p2 = d.pole2;
  if (p2 && p2.kind === 'logo' && p2._localImageDataUrl && !(p2.logo && p2.logo.filePath)) {
    try { d = { ...d, pole2: { ...p2, logo: await uploadOneLogo(p2._localImageDataUrl, p2.fileName) } }; }
    catch (e) { skipped.push({ title, reason: 'second-pole logo upload failed (' + (e.message || 'error') + ')' }); }
  }
  return d;
}

/* Build the saveCart itemsInCart[] from the proposal. Returns
   { items, skipped:[{title, reason}] }. Uploads any aligned images first. */
export async function buildProposalLines(proposal) {
  const rawByUrl = await fetchRawProducts(proposal.map((l) => l.product && l.product.url));
  const items = [];
  const skipped = [];
  for (const line of (proposal || [])) {
    const cat = line.product || {};
    // Custom items (SERVICEITEM) have no product page — build the cart line
    // straight from the saved fields, one per split.
    if (cat.isCustom && cat.custom) {
      let ci = cat.custom;
      // Bulk-imported items keep the SUPPLIER image URL (we can't upload thousands
      // up front). Convert THIS item's thumbnail to our S3 now — only the few
      // items actually in the proposal — and persist it so it's not redone.
      if (ci.thumbnail && needsIngest(ci.thumbnail)) {
        try {
          const s3 = await ingestImageUrl(ci.thumbnail);
          ci = { ...ci, thumbnail: s3 };
          saveCustomItem(ci).catch(() => {});           // cache the hosted URL
          if (line.product) line.product.custom = ci;   // reflect in the live line
        } catch (e) { skipped.push({ title: ci.name || ci.sku || 'custom item', reason: 'image upload failed (' + ((e && e.message) || 'error') + ')' }); }
      }
      const style = (line.variant && line.variant.values && line.variant.values.style)
        || (Array.isArray(ci.styleOptions) && ci.styleOptions[0]) || ci.style || '';
      for (const split of (line.splits || [])) {
        items.push(buildCustomItemLine({ ci, qty: split.qty, price: split.price, style }));
      }
      continue;
    }
    const raw = rawByUrl.get(cat.url);
    if (!raw) { skipped.push({ title: cat.title || cat.sku || 'item', reason: 'product page unavailable' }); continue; }
    const breaks = cat.breaks || [];
    const decoration = await uploadDecorationImage(line.decoration, skipped, cat.title || cat.sku || 'item');
    // The buyer's base-option picks → the right child/widgetSelections. Balls
    // carry them on the decoration (__base); other products on line.variant.
    const selValues = (decoration && decoration.baseSelection) || (line.variant && line.variant.values) || null;
    const selection = selValues ? { values: selValues } : {};
    // Price ladder that matches the line: retail-flat when there's no imprint,
    // the custom-logo ladder (+ second-pole upcharge) when there is — so the
    // cart's ItemPriceBreak agrees with ItemPrice.
    const imprinted = !!(decoration && decoration.engine && decoration.engine !== 'none');
    const fee = (decoration && decoration.pole2 && decoration.pole2.kind) ? (SECOND_POLE_FEE[decoration.pole2.kind] || 0) : 0;
    const lineBreaks = (imprinted && cat.customLogo && breaks.length)
      ? breaks.map((b) => ({ q: b.q, p: Math.round((b.p + fee) * 100) / 100 }))
      : [{ q: 1, p: cat.price || 0 }];
    // Commissionable custom-logo path ("…_1") for an imprinted line; strip the
    // "_1" slug for a plain/retail line so it references the base product (the
    // base and "_1" pages serve the same product — only the line URL differs).
    const urlPath = cat.urlPath || '';
    const lineUrl = urlPath ? (imprinted ? urlPath : urlPath.replace(/_1$/, '')) : undefined;
    for (const split of (line.splits || [])) {
      items.push(assembleLine({
        product: raw,
        pricing: { price: split.price, breaks: lineBreaks },
        decoration,
        selection,
        qty: split.qty,
        url: lineUrl,
      }));
    }
  }
  return { items, skipped };
}

/* The localStorage shape golfballs.com hydrates its cart from — verified live
   against a real captured cart: the cartData object spread at top level WITH a
   nested shoppingCart copy, the asCartContents mirror, AND `updated:true`. */
function buildLocalStorageCart(items, { proposalID = null } = {}) {
  const cart = buildCartData(items, { proposalID });
  return { ...cart, shoppingCart: cart, asCartContents: buildAsCartContents(items), updated: true };
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

/* ───────────────────────────────────────────────────────────────────────────
   Save to a CRM account / opportunity (PUT /user/saveProposal).

   The proposal is saved server-side AND linked to a CRM opportunity, where it
   surfaces under the opportunity's MetaData.Proposals[]. The opportunity list for
   an account is read off the account detail page (Page=271, #TableOpportunities)
   via the existing page-engine extraction — no dedicated JSON endpoint needed.
   ─────────────────────────────────────────────────────────────────────────── */
const CRM_ADMIN = 'https://api.golfballs.com/golfballs/adminnew/';

/* Account detail page URL. NOTE: the account-id query param is reverse-engineered
   (AccountID, matching the page's #AccountID field) — verify live; some CRM pages
   key off customerID instead. */
export function accountPageUrl(accountId) {
  return `${CRM_ADMIN}Default.aspx?Page=271&AccountID=${encodeURIComponent(accountId)}`;
}

/* Proposal expiration default — the cart page stamps save-date + ~45 days
   (HAR: 6/1→7/16, 6/8→7/23). Formatted M/D/YYYY like the stored MetaData. */
export function defaultProposalExpiration(days = 45) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/* Fetch + parse the opportunities for an account id. Returns
   [{ id, subject, estimatedValue, estimatedCloseDate, stage }] (the account
   schema's opportunities shape) or [] on failure. */
export async function fetchOpportunitiesForAccount(accountId) {
  if (accountId == null || accountId === '') return [];
  const url = accountPageUrl(accountId);
  let html = '';
  try { const r = await sendBg('fetchRaw', { url }); html = r.text || ''; }
  catch { return []; }
  if (!html) return [];
  let doc;
  try { doc = new DOMParser().parseFromString(html, 'text/html'); }
  catch { return []; }
  // Stamp the source URL so the engine detects the ACCOUNT schema (not the page
  // the rep is currently on — getDocUrl reads body.dataset.gbSourceUrl first).
  try { if (doc.body) doc.body.dataset.gbSourceUrl = url; } catch { /* */ }
  const ctx = runEngine(doc);
  return (ctx && ctx.data && Array.isArray(ctx.data.opportunities)) ? ctx.data.opportunities : [];
}

/* Save the proposal to a chosen opportunity. Resolves to { cartID, raw,
   savedLines, skipped }. Throws with a user-facing message on bad input. */
export async function saveProposalToOpportunity(proposal, {
  opportunityID, customerID = 0, name, expiration, proposalID = null,
} = {}) {
  if (!proposal || !proposal.length) throw new Error('Proposal is empty');
  if (opportunityID == null || opportunityID === '') throw new Error('Pick an opportunity to save to');
  if (!name || !name.trim()) throw new Error('Name the proposal');
  const { items, skipped } = await buildProposalLines(proposal);
  if (!items.length) throw new Error('Could not load product data for any line — try again');
  const body = buildSaveProposalBody(items, {
    opportunityID,
    proposalName: name.trim(),
    proposalExpiration: expiration || defaultProposalExpiration(),
    customerID,
    proposalID,
  });
  const resp = await sendBg('giftSaveProposal', { body });
  return { cartID: resp.cartID, raw: resp.raw, savedLines: items.length, skipped };
}

/* ───────────────────────────────────────────────────────────────────────────
   Saved Proposals library — named drafts persisted to chrome.storage.local.

   A saved entry snapshots each line's catalog product + its split tiers, so the
   gallery renders and a draft reloads WITHOUT a fresh catalog pull (and the
   quoted prices stay frozen at save time, which is what a saved quote should
   be). `linesFromSaved` rebuilds live proposal lines from the snapshot.
   ─────────────────────────────────────────────────────────────────────────── */
const SAVED_KEY = 'gbSavedProposals';
const _rid = () => Math.random().toString(36).slice(2, 9);

export function loadSavedProposals() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) { resolve([]); return; }
      chrome.storage.local.get(SAVED_KEY, (d) => resolve((d && Array.isArray(d[SAVED_KEY])) ? d[SAVED_KEY] : []));
    } catch { resolve([]); }
  });
}
function _writeSaved(list) {
  return new Promise((resolve) => {
    try { chrome.storage.local.set({ [SAVED_KEY]: list }, () => resolve(list)); } catch { resolve(list); }
  });
}

/* Snapshot the current proposal as a named draft; prepend to the library. */
export async function saveProposalDraft(name, proposal) {
  if (!proposal || !proposal.length) throw new Error('Proposal is empty');
  const list = await loadSavedProposals();
  const entry = {
    id: 'prop-' + _rid(),
    name: (name && name.trim()) || 'Untitled draft',
    date: new Date().toISOString().slice(0, 10),
    lines: proposal.map((l) => ({
      product: l.product,
      decoration: l.decoration || null,
      variant: l.variant || null,
      splits: (l.splits || []).map((s) => ({ qty: s.qty, price: s.price })),
    })),
  };
  const next = [entry, ...list];
  await _writeSaved(next);
  return { entry, list: next };
}

export async function removeSavedProposal(id) {
  const list = await loadSavedProposals();
  const next = list.filter((p) => p.id !== id);
  await _writeSaved(next);
  return next;
}

/* Replace a saved draft (matched by id) with an edited copy — used when a price
   is hand-edited in the breakdown. Persists + returns the new list. */
export async function updateSavedProposal(entry) {
  if (!entry || !entry.id) throw new Error('No proposal id');
  const list = await loadSavedProposals();
  const next = list.map((p) => (p.id === entry.id ? entry : p));
  await _writeSaved(next);
  return next;
}

/* ───────────────────────────────────────────────────────────────────────────
   Working proposal — the rep's live, unsaved draft. Persisted to its own key so
   it survives closing the catalog, navigating, and restarting the browser. It is
   only wiped when the rep clears it manually (Clear → setProposal([]) → []).
   Snapshots id + product + decoration + variant + splits, the shape the live
   proposal operations read, so restoring it == the in-memory state.
   ─────────────────────────────────────────────────────────────────────────── */
const CURRENT_KEY = 'gbCurrentProposal';

export function loadCurrentProposal() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) { resolve([]); return; }
      chrome.storage.local.get(CURRENT_KEY, (d) => resolve((d && Array.isArray(d[CURRENT_KEY])) ? d[CURRENT_KEY] : []));
    } catch { resolve([]); }
  });
}

export function saveCurrentProposal(lines) {
  const snap = (Array.isArray(lines) ? lines : []).map((l) => ({
    id: l.id,
    product: l.product,
    decoration: l.decoration || null,
    variant: l.variant || null,
    splits: (l.splits || []).map((s) => ({ ...s })),
  }));
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) { resolve(); return; }
      chrome.storage.local.set({ [CURRENT_KEY]: snap }, () => resolve());
    } catch { resolve(); }
  });
}

/* Rebuild live proposal lines (with fresh ids) from a saved entry's snapshot. */
export function linesFromSaved(entry, ridFn) {
  const mk = ridFn || _rid;
  return (entry.lines || []).map((l) => ({
    id: mk(),
    productId: l.product && l.product.id,
    product: l.product,
    decoration: l.decoration || undefined,
    variant: l.variant || undefined,
    splits: (l.splits || []).map((s) => ({ id: mk(), qty: s.qty, price: s.price })),
  }));
}
