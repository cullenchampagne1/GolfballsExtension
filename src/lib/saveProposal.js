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

import { assembleLine, buildSaveCartBody, buildSaveProposalBody, buildCustomItemLine, buildCartData, buildAsCartContents, decorationFromCartItem } from './cartSerializer.js';
import { runEngine } from './page-engine/index.js';
import { needsIngest, ingestImageUrl, saveCustomItem } from './customItems.js';
import { API } from './constants.js';

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
    // Price ladder that matches the line. The discriminator is the PRODUCT,
    // not the presence of art: a custom-logo product keeps its commissionable
    // ladder (+ second-pole upcharge when a pole2 imprint exists) whether or
    // not a logo is attached yet — saving an art-less custom-logo ball as a
    // retail-flat line was re-writing it as the plain golfball (wrong pricing
    // and deals, and a "duplicate" non-custom product on reload). Only a
    // genuinely retail product gets the flat price.
    const isLogoLine = !!cat.customLogo;
    const fee = (decoration && decoration.pole2 && decoration.pole2.kind) ? (SECOND_POLE_FEE[decoration.pole2.kind] || 0) : 0;
    const lineBreaks = (isLogoLine && breaks.length)
      ? breaks.map((b) => ({ q: b.q, p: Math.round((b.p + fee) * 100) / 100 }))
      : [{ q: 1, p: cat.price || 0 }];
    // Commissionable custom-logo path ("…_1") for a custom-logo product; strip
    // the "_1" slug for a retail line so it references the base product (the
    // base and "_1" pages serve the same product — only the line URL differs).
    const urlPath = cat.urlPath || '';
    const lineUrl = urlPath ? (isLogoLine ? urlPath : urlPath.replace(/_1$/, '')) : undefined;
    for (const split of (line.splits || [])) {
      items.push(assembleLine({
        product: raw,
        pricing: { price: split.price, breaks: lineBreaks },
        decoration,
        selection,
        qty: split.qty,
        url: lineUrl,
        itemGuid: split.id,        // deterministic → promotion freeItems map back to this split
      }));
    }
  }
  return { items, skipped };
}

/* The localStorage shape golfballs.com hydrates its cart from — verified live
   against a real captured cart: the cartData object spread at top level WITH a
   nested shoppingCart copy, the asCartContents mirror, AND `updated:true`. */
function buildLocalStorageCart(items, { proposalID = null, promotion = null } = {}) {
  const cart = buildCartData(items, { proposalID, promotion });
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
export async function buildProposalDraft(proposal, { proposalID = null, promotion = null } = {}) {
  if (!proposal || !proposal.length) throw new Error('Proposal is empty');
  const { items, skipped } = await buildProposalLines(proposal);
  if (!items.length) throw new Error('Could not load product data for any line — try again');
  const json = JSON.stringify(buildLocalStorageCart(items, { proposalID, promotion }));
  return { command: buildCartConsoleCommand(json), json, itemCount: items.length, skipped };
}

/* Validate / resolve a promo code against the proposal's items via the icustomize
   promotion engine — the same PUT /user/promotion the cart page makes. Returns
   the resolved promotion object ({ promo, promoType, totalDiscount, freeItems,
   unmetRequirements, promoDescription, … }) or throws on a bad/empty code.
   Pass the result back into buildProposalDraft/saveProposalToOpportunity as
   `promotion` so the loaded/saved cart carries the coupon. */
export async function validatePromo(proposal, promoCode, { country = null } = {}) {
  const code = (promoCode || '').trim();
  if (!code) throw new Error('Enter a promo code');
  if (!proposal || !proposal.length) throw new Error('Proposal is empty');
  const { items } = await buildProposalLines(proposal);
  if (!items.length) throw new Error('Could not load product data — try again');
  const body = { cartItems: items, country, promoCode: code, shippingMethods: [], isVip: false, vipSignup: false };
  const resp = await sendBg('applyPromotion', { body });
  const promotion = resp && resp.promotion;
  if (!promotion || (!promotion.promo && !(promotion.unmetRequirements || []).length)) {
    throw new Error('“' + code + '” isn’t a valid promo code for this cart');
  }
  return promotion;
}

/* Server save (PUT /user/saveCart) — kept for the future "Send proposal" flow.
   NOTE: drafts already persist to chrome.storage via saveProposalDraft/
   loadSavedProposals/updateSavedProposal; this server save is separate and
   currently only used by the opportunity-save path. Resolves to
   { cartNumber, cartID, … }. */
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
const CRM_ADMIN = API.CRM_ADMIN;

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

/* ── Current proposals (live, from the CRM) ─────────────────────────────────
   The opportunity page (Page=280) renders a "Proposals" table: each row is a
   saved cart with a name, cartID, date, and expiration. We parse it so the
   modal can list the proposals already attached to an account's opportunities,
   distinct from local saved drafts. ── */
const OPP_PAGE = (id) => `${CRM_ADMIN}Default.aspx?Page=280&opportunityID=${encodeURIComponent(id)}`;

/* Build the customer-facing proposal-mode cart URL for a saved cart. */
export function proposalCartUrl(opportunityID, cartID) {
  return `https://www.golfballs.com/cart?proposalMode=true&opportunityID=${encodeURIComponent(opportunityID)}&cartID=${encodeURIComponent(cartID)}`;
}

/* Parse the opportunity page's Proposals table → [{ cartID, name, date,
   expiration }]. Each proposal row carries id="<cartID>row" with a
   "<cartID>_Name" span and a "<cartID>_Exp" span; the cart link holds the
   cartID. Resilient to the surrounding admin markup. */
export function parseProposalsHtml(html) {
  const out = [];
  if (!html) return out;
  let doc; try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch { return out; }
  const seen = new Set();
  for (const a of Array.from(doc.querySelectorAll('a[href*="cartID="]'))) {
    const m = /cartID=([0-9a-f-]{8,})/i.exec(a.getAttribute('href') || '');
    if (!m) continue;
    const cartID = m[1];
    if (seen.has(cartID)) continue;
    seen.add(cartID);
    const nameEl = doc.getElementById(cartID + '_Name');
    const expEl = doc.getElementById(cartID + '_Exp');
    let date = '';
    const tr = a.closest('tr');
    if (tr) {
      for (const td of Array.from(tr.querySelectorAll('td'))) {
        if (td.id) continue;                                 // skip name/exp cells
        const dm = /\d{1,2}\/\d{1,2}\/\d{4}[^()<]*/.exec(td.textContent || '');
        if (dm) { date = dm[0].trim(); break; }
      }
    }
    out.push({
      cartID,
      name: (nameEl ? nameEl.textContent.trim() : '') || 'Proposal',
      expiration: expEl ? expEl.textContent.trim() : '',
      date,
    });
  }
  return out;
}

/* Fetch + parse the proposals attached to one opportunity. Also scrapes the
   page's server-injected AdminID + ContactId (needed to TRACK a proposal email
   exactly like the web flow) and tags every row with them. */
export async function fetchProposalsForOpportunity(opportunityID) {
  if (opportunityID == null || opportunityID === '') return [];
  let html = '';
  try { const r = await sendBg('fetchRaw', { url: OPP_PAGE(opportunityID) }); html = r.text || ''; }
  catch { return []; }
  const adminId = (html.match(/AdminID\s*=\s*['"]?(\d+)/) || [])[1] || '';
  const contactId = (html.match(/[Cc]ontact[Ii][dD]\s*[:=]\s*['"](\d+)['"]/) || [])[1] || '';
  return parseProposalsHtml(html).map((p) => ({ ...p, opportunityID: String(opportunityID), adminId, contactId }));
}

/* All current proposals for an account: each ACTIVE (non-closed) opportunity's
   proposals, flattened and tagged with the opportunity subject. `opportunities`
   may be passed (from the page engine) to skip the account-page fetch.
   Returns [{ cartID, name, date, expiration, opportunityID, opportunitySubject,
   stage, url }]. */
export async function fetchActiveProposals({ accountId, opportunities } = {}) {
  let opps = (Array.isArray(opportunities) && opportunities.length)
    ? opportunities
    : (accountId ? await fetchOpportunitiesForAccount(accountId) : []);
  const active = opps.filter((o) => o && o.id && !/closed/i.test(o.stage || ''));
  const lists = await Promise.all(active.map(async (o) => {
    const props = await fetchProposalsForOpportunity(o.id);
    return props.map((p) => ({
      ...p,
      opportunityID: String(o.id),
      opportunitySubject: o.subject || '',
      stage: o.stage || '',
      url: proposalCartUrl(o.id, p.cartID),
    }));
  }));
  return lists.flat();
}

/* Load a saved cart's contents by cartID (GET /user/getCart/<id>). */
export async function loadProposalCart(cartID) {
  const resp = await sendBg('giftLoadCart', { cartNumber: cartID });
  return resp && resp.cartData;
}

/* Absolute product page URL from a cart line's path (mirrors giftCatalog's
   absoluteProductUrl) so a reloaded line can be re-fetched/re-priced. */
function _absProductUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith('/') ? path : '/' + path;
  return 'https://www.golfballs.com' + p + (/\.html?$/i.test(p) ? '' : '.htm');
}
const _PROD_IMG = 'https://static.golfballs.com/C/300x300/';

/* One cart line (itemsInCart[i]) → a proposal/saved line { product, decoration,
   variant, splits }. The cart carries the real qty + price, so margin/totals are
   exact; the imprint decoration isn't reverse-mapped (shown as a plain line). */
function cartItemToLine(it, i) {
  const breaks = (((it.ItemPriceBreak && it.ItemPriceBreak.PriceBreak) || [])
    .map((b) => ({ q: Number(b.Quantity) || 0, p: Number(b.Price) || 0 })).filter((b) => b.q > 0));
  const cd = it.CustomData || {};
  const img0 = ((it.images || [])[0] || {}).URL || '';
  const qty = Number(it.totalQty) || (breaks[0] && breaks[0].q) || 1;
  let price = it.ItemPrice;
  if (price == null) { let p = breaks[0] ? breaks[0].p : 0; for (const b of breaks) if (b.q <= qty) p = b.p; price = p; }
  const decoration = decorationFromCartItem(it);     // read the saved imprint back
  // Custom-logo identity comes from the PRODUCT, not the attached art. A cart
  // saved on the custom-logo product with NO logo uploaded yet has no logo
  // decoration to reverse-map — but it must still reload as the custom-logo
  // item (commissionable ladder + deals), not its retail twin, or re-saving
  // duplicates it as a plain golfball at the wrong pricing. Signals, any of:
  //   • the custom-logo configurator namespace on the modification state
  //     (present whether or not art was uploaded),
  //   • "Custom Logo" in the product title / nameFormat (the site's own
  //     naming for the commissionable products),
  //   • a custom-logo product URL,
  //   • a reverse-mapped logo imprint (the old signal — art attached).
  const _is = (it.modification && it.modification.interfaceState) || {};
  const _title = String(it.productTitle || it.nameFormat || '');
  const isLogo = !!_is.GolfBallCustomLogo
    || /custom\s*logo/i.test(_title)
    || /custom-?logo/i.test(String(it.url || ''))
    || !!(decoration && (decoration.engine === 'ballLogo' || decoration.engine === 'logoOverlay'));
  // FREE_QUANTITY promos add the free dozens as a separate line whose guid ends
  // "-PROMO" (billed at full price in the cart, then zeroed by the promotion
  // discount). We surface it as a $0 "free" line so the proposal reads like the
  // site: a free giveaway line, no separate discount to reconcile.
  const free = /-PROMO$/i.test(String(it.itemGuid || ''));
  if (free) price = 0;
  return {
    id: 'crmln-' + (it.itemGuid || i),
    productId: it.itemGuid || ('p' + i),
    free,
    product: {
      id: 'crmp-' + (it.ShortCode || it.itemGuid || i),
      title: it.productTitle || it.nameFormat || 'Item',
      brand: it.brand || '',
      img: img0 ? (/^https?:/i.test(img0) ? img0 : _PROD_IMG + img0) : '',
      url: it.url ? _absProductUrl(it.url) : '',
      urlPath: it.url || '',
      sku: cd.parentSku || it.ShortCode || '',
      parentCode: it.ShortCode || '',
      breaks: breaks.length ? breaks : [{ q: qty, p: price }],
      customLogo: !!isLogo,
      cat: (it.itemType === 'Golf Balls') ? 'Logo Golf Balls' : undefined,
      price,
      minQty: (breaks[0] && breaks[0].q) || qty,
    },
    decoration,
    variant: null,
    // CRITICAL: keep the cart's ORIGINAL itemGuid as the split id. On re-save the
    // saved itemGuid IS this id (buildProposalLines → assembleLine), and a
    // FREE_QUANTITY promotion references items by that exact guid
    // (eligibleItemGuids / freeItems[].itemGuid). Prefixing it (the old
    // "crms-"+guid) made the re-saved items' guids diverge from the promotion's
    // references, so the server couldn't grant the free quantity and the proposal
    // email wouldn't generate until the cart was re-saved in the storefront.
    splits: [{ id: String(it.itemGuid || ('crms-' + i)), qty, price }],
  };
}

/* A loaded cart → a saved-entry-shaped object so the Current Proposals view can
   reuse the saved-proposal card, breakdown, load, copy, and email machinery. */
export function cartToEntry(cartData, meta = {}) {
  const items = (cartData && (cartData.itemsInCart || (cartData.shoppingCart && cartData.shoppingCart.itemsInCart))) || [];
  const promotion = (cartData && cartData.promotion && cartData.promotion.promo) ? cartData.promotion : null;
  return {
    id: 'crm-' + (meta.cartID || _rid()),
    name: meta.name || (cartData && cartData.proposalName) || 'Proposal',
    date: meta.date || '',
    expiration: meta.expiration || '',
    cartID: meta.cartID || '',
    opportunityID: meta.opportunityID || '',
    opportunitySubject: meta.opportunitySubject || '',
    adminId: meta.adminId || '',
    contactId: meta.contactId || '',
    promotion,
    source: 'crm',
    lines: items.map(cartItemToLine),
  };
}

/* Submit a proposal email exactly like the web flow: generate/register it
   (CreateProposalEmail), TRACK it against the opportunity (TrackProposal), and
   update the opportunity's estimated value (Opportunity Get→Update, preserving
   subject/description/lead/stage). All credentialed via the CRM relay. Throws if
   the track step fails; the opp-value update is best-effort. */
const _crmBase = API.CRM_CRM;
function _crmAjax(url, opts = {}) { return sendBg('crmAjax', { url, method: opts.method || 'GET', body: opts.body, contentType: opts.contentType }); }
function _toISODate(s) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || ''));
  if (!m) return '';
  return `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
}

export async function submitProposalEmail(p = {}) {
  if (!p.opportunityID || !p.cartID) throw new Error('Missing opportunity / cart');
  if (!p.adminId) throw new Error('Couldn’t read the rep AdminID from the opportunity page');
  // 1) Generate/register the proposal email (server returns the HTML).
  const createObj = {
    ProposalGroupName: p.groupName || 'Custom Order',
    ContactEmail: p.contactEmail || '', ContactName: p.contactName || '', EmailCC: '',
    ProposalMessage: p.message || '',
    CartIds: [p.cartID], ProposalNames: [p.name || 'Proposal'], ProposalExpirations: [p.expiration || ''],
    ContactId: String(p.contactId || ''), OpportunityID: String(p.opportunityID), OpportunityStatus: String(p.stageId || ''),
  };
  await _crmAjax(_crmBase + 'ProposalEmailNewSite/CreateProposalEmail.ajax?' + encodeURIComponent(JSON.stringify(createObj)));
  // 2) Track it against the opportunity (the explicit "proposal sent" log).
  await _crmAjax(_crmBase + 'ProposalEmailNewSite/TrackProposal.ajax', {
    method: 'POST', contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
    body: JSON.stringify({ OpportunityID: String(p.opportunityID), AdminID: Number(p.adminId), ProposalsIncluded: [p.cartID] }),
  });
  // 3) Update the opportunity's estimated value — best-effort, preserving the
  //    existing subject/description/lead/stage (read via Get) so we don't clobber.
  try {
    let cur = {};
    try { const g = await _crmAjax(_crmBase + 'Opportunity/Get.ajax?' + encodeURIComponent(String(p.opportunityID))); cur = JSON.parse(g.text || '{}') || {}; } catch { cur = {}; }
    const upd = {
      OpportunityID: String(p.opportunityID),
      Subject: cur.Subject != null ? cur.Subject : (p.subject || ''),
      Description: cur.Description != null ? cur.Description : '',
      EstimatedClosedDate: _toISODate(p.expiration) || cur.EstimatedClosedDate || '',
      EstimatedValue: Math.round(Number(p.total) || 0),
      OpportunityStageId: cur.OpportunityStageId || cur.OpportunityStageID || cur.Stage || 2,
      LeadID: cur.LeadID != null ? cur.LeadID : null,
    };
    await _crmAjax(_crmBase + 'Opportunity/Update.ajax?' + encodeURIComponent(JSON.stringify(upd)));
  } catch { /* value update is best-effort */ }
  return { ok: true };
}

/* Full Current Proposals pull: list each active opportunity's proposals, load
   each cart, and convert to saved-entry shape. Carts load in parallel; a cart
   that fails to load still yields a (line-less) entry so the card shows. */
export async function fetchActiveProposalEntries(opts = {}) {
  const list = await fetchActiveProposals(opts);
  return Promise.all(list.map(async (p) => {
    const meta = { cartID: p.cartID, name: p.name, date: p.date, expiration: p.expiration, opportunityID: p.opportunityID, opportunitySubject: p.opportunitySubject, adminId: p.adminId, contactId: p.contactId };
    try { return cartToEntry(await loadProposalCart(p.cartID), meta); }
    catch { return cartToEntry(null, meta); }
  }));
}

/* ── Known promo codes (rep-curated, persisted) ─────────────────────────────
   There's no "list all promos" endpoint, so we keep the codes the rep uses in
   storage (seeded with the known site promo) and validate each against the cart
   to show which currently apply. ── */
const PROMO_KEY = 'gbKnownPromos';
const SEED_PROMOS = ['EVERY12GETS6'];

export function loadKnownPromos() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) { resolve(SEED_PROMOS.slice()); return; }
      chrome.storage.local.get(PROMO_KEY, (d) => {
        const stored = (d && Array.isArray(d[PROMO_KEY])) ? d[PROMO_KEY] : [];
        resolve(Array.from(new Set([...stored, ...SEED_PROMOS].map((s) => String(s).toUpperCase().trim()).filter(Boolean))));
      });
    } catch { resolve(SEED_PROMOS.slice()); }
  });
}
export async function addKnownPromo(code) {
  const c = String(code || '').toUpperCase().trim();
  if (!c) return loadKnownPromos();
  const list = await loadKnownPromos();
  if (!list.includes(c)) list.unshift(c);
  try { chrome.storage.local.set({ [PROMO_KEY]: list }); } catch { /* */ }
  return list;
}

/* Save the proposal to a chosen opportunity. Resolves to { cartID, raw,
   savedLines, skipped }. Throws with a user-facing message on bad input. */
export async function saveProposalToOpportunity(proposal, {
  opportunityID, customerID = 0, name, expiration, proposalID = null, promotion = null,
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
    promotion,
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

/* Snapshot the current proposal as a named draft; prepend to the library.
   `promotion` is the resolved /user/promotion object (from validatePromo) when a
   coupon is applied — persisted so reloading the draft restores the promo (the
   load path reads entry.promotion). The per-line `free` flag is preserved too,
   so free giveaway lines reload as free, not as ordinary $0 lines. */
export async function saveProposalDraft(name, proposal, promotion = null) {
  if (!proposal || !proposal.length) throw new Error('Proposal is empty');
  const list = await loadSavedProposals();
  const entry = {
    id: 'prop-' + _rid(),
    name: (name && name.trim()) || 'Untitled draft',
    date: new Date().toISOString().slice(0, 10),
    promotion: (promotion && promotion.promo) ? promotion : null,
    lines: proposal.map((l) => ({
      product: l.product,
      decoration: l.decoration || null,
      variant: l.variant || null,
      free: !!l.free,
      // The site-authoritative full value of a free dozen, kept so the email's
      // HAR totals net it off at the right amount on reload. (The parent link is
      // rebuilt from product identity in linesFromSaved — see there.)
      freeValue: l.freeValue != null ? l.freeValue : null,
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
    free: !!l.free,
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
  const out = (entry.lines || []).map((l) => ({
    id: mk(),
    productId: l.product && l.product.id,
    product: l.product,
    decoration: l.decoration || undefined,
    variant: l.variant || undefined,
    free: !!l.free,
    freeValue: l.freeValue != null ? l.freeValue : undefined,
    splits: (l.splits || []).map((s) => ({ id: mk(), qty: s.qty, price: s.price })),
  }));
  // Re-link each free giveaway to the paid line that earned it (same product) so
  // the email's Separated-theme grouping survives a reload. Stored ids are
  // regenerated above, so we rebuild the relationship from product identity —
  // the free dozen is always the same product as its qualifying line.
  const paidByProduct = new Map();
  for (const l of out) if (!l.free && l.productId != null) { const k = String(l.productId); if (!paidByProduct.has(k)) paidByProduct.set(k, l.id); }
  for (const l of out) if (l.free && l.productId != null) { const pid = paidByProduct.get(String(l.productId)); if (pid) l.parentLineId = pid; }
  return out;
}
