/* ───────────────────────────────────────────────────────────────────────────
   cartSerializer.js — build golfballs.com cart/proposal payloads.

   The cart is SERVER-side on the icustomize API (not localStorage):

     SAVE  PUT  https://master.api.icustomize.com/user/saveCart
                header  sitekey: golfballs        (no auth/cookie — guest)
                body    { cartData, customerID:0, salesRepID:0 }
                → { d:{ success:"Proposal Saved", cartNumber, cartID } }
     LOAD  GET  https://master.api.icustomize.com/user/getCart/<cartNumber>
                → { d:"<JSON string of cartData>" }   (parse if string)

   `cartData` is the same object the site mirrors to localStorage.shoppingCart:
     { cartStateVersion:5, stateProperty, itemsInCart:[ <line> … ],
       cartTotal, cartSubTotal, cartTotalQty, promotion, proposalID, … }

   Each <line> is the product page's __NEXT_DATA__.product, resolved to the
   chosen child + a `modificationHistory` decoration block + a per-line
   `itemGuid`. Decoration is encoded by one of THREE engines, keyed by the
   product's modificationID / FriendlyName:

     A · Modern ball   (modID 5 / 1008)  dynamicImage.{Print,Print2} →
                        icustomize.com/Item/GolfBall/r        ← implemented + verified
     B · Legacy inhouse(modID 84)        legacyICustomizeParams.LogoOverlay →
                        customizationapplications.com/render.aspx   ← TODO (needs XMLFile)
     C · Outsource     (modID 25)        logo-only placeholder          ← TODO (trivial)

   The network calls are relayed through background.js (CORS-immune, sitekey).
   This module only BUILDS the payloads — it performs no I/O.
   ─────────────────────────────────────────────────────────────────────────── */

import { giftSetLadder, buildBundleBlock } from './giftSets.js';
import { API } from './constants.js';

const ICU = API.MASTER_USER;
export const SAVE_CART_URL = `${ICU}/saveCart`;
export const getCartUrl = (cartNumber) => `${ICU}/getCart/${encodeURIComponent(cartNumber)}`;

const enc = encodeURIComponent;
const upper = (s) => (s == null ? null : String(s).toUpperCase());
const hasPoleText = (p) => !!(p && Array.isArray(p.lines) && p.lines.some((l) => l != null && String(l).trim() !== ''));

/* ── Engine A — modern golf ball ──────────────────────────────────────────── */

/* The cart thumbnail URL. Verified byte-exact against real captures
   (Pro V1 empty + Triple Track text+Print2). The nested userText JSON is
   double-encoded; empty lines are dropped FROM THE URL (but kept in the
   stored Print.userText object). */
/* The inner Print param "<decorationType>?userText=<enc>&configOverrides=<enc>"
   (empty lines dropped + UPPERCASED). Shared by the ball preview + gift-set wrapper. */
function _ballPrintVal(p) {
  const lines = (p.lines || []).map(upper).filter((l) => l != null && l !== '');
  const userText = [{ lines, font: p.font, color: p.color }];
  return `${p.decorationType}?userText=${enc(JSON.stringify(userText))}`
       + `&configOverrides=${enc(JSON.stringify(p.configOverrides || {}))}`;
}
export function ballPreviewUrl({ bc = '#FFFFFF', finish = {}, print, print2 }) {
  const top = { BC: bc, ...finish };
  const parts = [
    `configOverrides=${enc(JSON.stringify(top))}`,
    'view=',
    `Print=${enc(_ballPrintVal(print))}`,
  ];
  if (print2) parts.push(`Print2=${enc(_ballPrintVal(print2))}`);
  return `https://www.icustomize.com/Item/GolfBall/r?${parts.join('&')}`;
}

/* The ball's FRONT print as it renders ON a gift-set box. A custom-logo ball shows
   a blank Personalized print (the logo is applied server-side via interfaceState,
   not the Print param); a text (Personalized) ball carries its lines. */
function _ballFrontPrint(decoration) {
  const d = decoration || {};
  if (d.engine === 'ballText' && d.pole1) {
    return { decorationType: 'Personalized', lines: d.pole1.lines || [null, null, null], font: d.pole1.font || 'Kabel Dm BT', color: d.pole1.color || '#000000', configOverrides: {} };
  }
  return { decorationType: 'Personalized', lines: [null, null, null], font: 'Kabel Dm BT', color: '#000000', configOverrides: {} };
}

/* The gift-set box preview image. Matches golfballs.com exactly: SLEEVE sets render
   the live wrapper (the boxed render with the ball's Print/BallPrint + the ball's
   Sleeve overlay); 6-ball / wooden sets keep the static product thumbnail. Verified
   byte-exact against the cart's bundle.renderedPreviewImage for all 8 sets. */
export function giftSetPreviewUrl(gs, { decoration, sleeveImage, brand } = {}) {
  const wrapper = (gs && gs.wrapperImage) || '';
  const isSleeve = wrapper.toLowerCase().includes('sleeve');
  if (!wrapper || !isSleeve) return (gs && gs.thumbnail) || '';
  const param = enc(_ballPrintVal(_ballFrontPrint(decoration)));
  let url = `${wrapper}Print=${param}&BallPrint=${param}`;
  if (sleeveImage) url += `&Sleeve=${enc(sleeveImage)}`;
  else if (brand) url += `&Sleeve=${enc('sleeve-overlay-' + String(brand).replace(/ Golf/i, '').toLowerCase())}`;
  return url;
}

/* A bundled line keeps the ball gallery, but the website prepends the selected
   gift-set render as image zero and shifts every ball image down by one. The
   cart uses that first entry for the product thumbnail; storing the preview
   only under bundle.renderedPreviewImage leaves the ball as the visible image. */
export function buildGiftSetImages(images, renderedPreviewImage) {
  const source = Array.isArray(images) ? images : [];
  if (!renderedPreviewImage) return source;
  return [{
    URL: renderedPreviewImage,
    SortValue: 0,
    PropertyValueProduct: null,
    ProductImageConditionSpecial: null,
    productImageID: 0,
    productParentID: 0,
  }, ...source.map((entry, index) => ({
    ...entry,
    SortValue: Number.isFinite(Number(entry && entry.SortValue)) ? Number(entry.SortValue) + 1 : index + 1,
  }))];
}

/* The stored modificationHistory[].dynamicImage[0] object for a golf ball.
   `pole1` is the front imprint; `pole2` (optional) the second pole — pass
   null for single-pole or ExcludeDualPolePrinting products. Lines are kept
   as a 3-slot array (nulls preserved) but UPPERCASED, matching the site. */
export function buildBallDynamicImage({
  baseColor = '#FFFFFF', finish = {}, decorationType = 'Personalized', pole1, pole2 = null,
}) {
  const slot = (p) => ({
    userText: [{ lines: (p.lines || [null, null, null]).map(upper), font: p.font, color: p.color }],
    configOverrides: { ...finish },
    versionProperties: { versionNumber: 2, decorationType },
  });
  const img = {
    sku: 'GolfBall', clientID: 'Item',
    configOverrides: { BC: baseColor, ...finish },
    versionProperties: { versionNumber: 2 }, view: '',
    Print: slot(pole1),
  };
  // Only a TEXT second pole renders here; monogram/logo second poles are added
  // centrally by buildDecoration (they're not userText slots).
  const p2text = pole2 && (!pole2.kind || pole2.kind === 'text') ? pole2 : null;
  if (p2text) img.Print2 = slot(p2text);
  img.renderedPreviewImage = ballPreviewUrl({
    bc: baseColor, finish,
    print:  { decorationType, lines: pole1.lines, font: pole1.font, color: pole1.color, configOverrides: finish },
    print2: p2text ? { decorationType, lines: p2text.lines, font: p2text.font, color: p2text.color, configOverrides: finish } : null,
  });
  return img;
}

/* The decoration block (modificationHistory[] entry / active `modification`)
   for a golf ball: the product's matching ProductModification + the chosen
   imprint, the live preview dynamicImage, and the raw UI state. */
function buildBallDecorationBlock(product, decoration) {
  const wantedType = decoration.decorationType || 'Personalized';
  const pm = (product.ProductModification || []).find(
    (m) => (m.Modification && (m.Modification.FriendlyName === wantedType || m.Modification.Name === wantedType)),
  ) || (product.ProductModification || [])[0] || null;
  return {
    ProductModification: pm,
    interfaceState: {
      firstPoleUserText: decoration.pole1 || { lines: [null, null, null], font: '', color: '' },
      // Empty 2nd pole stores {} even though an empty Print2 still renders.
      secondPoleUserText: (() => {
        const p2 = decoration.pole2;
        return (p2 && (!p2.kind || p2.kind === 'text') && hasPoleText(p2))
          ? { lines: p2.lines, font: p2.font, color: p2.color } : {};
      })(),
      maxTextArea: 1,
    },
    dynamicImage: [buildBallDynamicImage(decoration)],
    isTemporary: false,
  };
}

/* ── Engine A — monogram (modID 6) ────────────────────────────────────────── */

const MONO_THUMB = 'https://d1tp32r8b76g0z.cloudfront.net/images/productPage/dropdown-personalization/thumb-monogram-circle.png';

/* The monogram preview URL — same double-encoded GolfBall/r form as the text
   renderer, but the print engine is MonogramPadded with a comma-joined letter
   overlay + Color1/Color2. Verified byte-exact against the real capture. */
export function monogramPreviewUrl({ baseColor = '#FFFFFF', overlayName, printConfig, view }) {
  const printVal = `MonogramPadded?userOverlay=${enc(overlayName)}`
    + `&configOverrides=${enc(JSON.stringify(printConfig))}&view=${view}`;
  return `https://www.icustomize.com/Item/GolfBall/r`
    + `?configOverrides=${enc(JSON.stringify({ BC: baseColor }))}`
    + `&view=&Print=${enc(printVal)}`;
}

/* dynamicImage[0] for a monogram ball. `text` is the 2–3 letter monogram;
   view is circle2 (2 letters) / circle3 (3) unless overridden. */
export function buildMonogramDynamicImage({
  baseColor = '#FFFFFF', text = '', color = '#000000', color2 = '#FFFFFF',
  view, key = 'Circle Monograms', imageURL = MONO_THUMB, overlay = 'circle',
  minChars = 2, maxChars = 3, legacyFont = true,
}) {
  const chars = String(text || '').split('');
  const overlayName = chars.join(',');            // "bb" → "b,b"
  const v = view || (chars.length >= 3 ? 'circle3' : 'circle2');
  const printConfig = { Color1: color, Color2: color2 };
  return {
    sku: 'GolfBall', clientID: 'Item',
    configOverrides: { BC: baseColor },
    versionProperties: { versionNumber: 2 }, view: '',
    Print: {
      view: v,
      userOverlay: [{ visible: true, fileName: overlayName }],
      configOverrides: printConfig,
      versionProperties: { versionNumber: 2, decorationType: 'MonogramPadded' },
    },
    metaData: { key, imageURL, overlay, minChars, maxChars, legacyFont, text: String(text || ''), color, color2 },
    renderedPreviewImage: monogramPreviewUrl({ baseColor, overlayName, printConfig, view: v }),
  };
}

/* ── Engine A — custom logo ON the ball (modID 1008) ──────────────────────────
   The logo is applied server-side from interfaceState.GolfBallCustomLogo; the
   dynamicImage is just a blank Personalized print (no text). */
export function buildBallLogoDynamicImage({ baseColor = '#FFFFFF' }) {
  const blank = { lines: [null, null, null], font: 'Kabel Dm BT', color: '#000000' };
  return {
    sku: 'GolfBall', clientID: 'Item',
    configOverrides: { BC: baseColor },
    versionProperties: { versionNumber: 2 }, view: '',
    Print: {
      userText: [blank],
      configOverrides: {},
      versionProperties: { versionNumber: 2, decorationType: 'Personalized' },
    },
    renderedPreviewImage: ballPreviewUrl({
      bc: baseColor, finish: {},
      print: { decorationType: 'Personalized', lines: [null, null, null], font: 'Kabel Dm BT', color: '#000000', configOverrides: {} },
    }),
  };
}

/* Express logos use the storefront's legacy renderer, not the modern GolfBall
   dynamic-image shape used by ordinary uploaded logos. Without this descriptor
   the cart retains the upload but never requests customizationapplications.com's
   rendered image, leaving the opened personalization preview blank. */
export function buildExpressLogoDynamicImage(product, cropFilePath = '') {
  const brand = String((product && product.Brand && product.Brand.Name) || product?.brand || '').trim().toLowerCase();
  return {
    imageType: 'ExpressLogo',
    legacyICustomizeParams: {
      useLegacyFormat: true,
      template: brand === 'titleist' ? 'TitleistExpress' : 'LogoExpress',
      image: String(cropFilePath || ''),
    },
    isUsed: true,
  };
}

/* ── Engine B/C — logo overlay (modID 84 inhouse / 25 outsource) ──────────────
   Towels, polos, poker chips, etc. The uploaded company logo (filePath under
   Source/CustomerUploads/CustomLogo) is referenced, not rendered into a preview
   URL. `logo` may be null (no logo yet — useCustomLogo stays true, paths empty). */
const LOGO_BASE_URL = 'https://d1tp32r8b76g0z.cloudfront.net/userlogos';
const LOGO_OVERLAY_PREVIEW = 'https://www.icustomize.com/Render.aspx?sku=undefined&overlay=&useroverlay=&usertext=%5B%5D';

export function buildLogoOverlayDynamicImage({ outsource = false, logo = null } = {}) {
  return {
    imageType: outsource ? 'Generic Outsource Custom' : 'Generic Inhouse Custom',
    condition: 'Custom Logo',
    customLogo: {
      useCustomLogo: true,
      filePath: (logo && logo.filePath) || '',
      fileName: (logo && logo.fileName) || '',
      baseUrl: LOGO_BASE_URL,
    },
    renderedPreviewImage: LOGO_OVERLAY_PREVIEW,
  };
}

/* ── Engine D — tee text (modID 15 "Tee") ─────────────────────────────────────
   A printed text imprint on golf tees. Unlike ball text it is NOT uppercased,
   is a single line, and renders through the legacy Render.aspx overlay (sku=tee,
   clientID=GBC). Verified byte-exact against a real captured tee-text cart. */
export function teePreviewUrl({ text = '', font = 'Kabel Dm BT', color = '#000000' }) {
  const userText = [{ lines: [text], font, color }];
  return 'https://www.icustomize.com/Render.aspx?sku=tee&overlay=&useroverlay='
    + `&usertext=${enc(JSON.stringify(userText))}`
    + `&configoverrides=${enc(JSON.stringify({ BG: '' }))}`
    + '&clientID=GBC';
}
export function buildTeeDynamicImage({ text = '', font = 'Kabel Dm BT', color = '#000000' }) {
  return {
    imageType: 'Tee', sku: 'tee', clientID: 'GBC',
    userText: [{ lines: [text], font, color }],
    configOverrides: { BG: '' },
    renderedPreviewImage: teePreviewUrl({ text, font, color }),
  };
}

/* ── Engine E — towel / hat embroidery (modID 23 "Golf Towel" / "Golf Hat") ────
   Embroidered Personalized text OR a Monogram on a towel/hat. The decal renders
   over the product's background color (BC = the child's backgroundHex) on a
   WaffleTowel.png ground via Render.aspx (sku MonogramTowel / PersonalizedTowel).
   Both sub-conditions are always stored in interfaceState; the active one is
   mirrored into the top-level dynamicImage. Verified against a real towel cart. */
const TOWEL_BG = 'WaffleTowel.png';
const TOWEL_MONO_FONT = 'Circle Monograms White';
const TOWEL_TEXT_FONT = 'Century';
export function towelPreviewUrl({ sku, bc = '#FFFFFF', lines = [], font, color = '#000000' }) {
  const userText = [{ lines, font, color }];
  return `https://www.icustomize.com/Render.aspx?sku=${enc(sku)}&overlay=&useroverlay=`
    + `&usertext=${enc(JSON.stringify(userText))}`
    + `&configoverrides=${enc(JSON.stringify({ BC: bc, BG: TOWEL_BG, GlossType: '' }))}`
    + '&clientID=GBC';
}
function buildTowelDynamicImage({ condition, bc, lines, font, color, withPreview = true }) {
  const sku = condition === 'Monogram' ? 'MonogramTowel' : 'PersonalizedTowel';
  const di = {
    imageType: 'Golf Towel', condition, sku, clientID: 'GBC',
    configOverrides: { BC: bc, BG: TOWEL_BG, GlossType: '' },
    userText: [{ lines, font, color }],
  };
  if (withPreview) di.renderedPreviewImage = towelPreviewUrl({ sku, bc, lines, font, color });
  return di;
}

const emptyPole = () => ({ fileName: '', filePath: '', userImage: null, fileSupported: false });
const logoPole = (logo) => ({
  fileName: (logo && logo.fileName) || '',
  filePath: (logo && logo.filePath) || '',
  userImage: (logo && logo.userImage) || null,   // fabric placement (from the upload step)
  fileSupported: !!(logo && logo.filePath),
});
const canonicalUrl = (product) => {
  const u = product.ProductUrl;
  if (Array.isArray(u)) return (u.find((x) => !x.productChildID) || u[0] || {}).URL || '';
  return product.url || product.URL || '';
};

/* ── Decorated pricing = the site's own recompute ─────────────────────────────
   golfballs.com recomputes every cart line's price on load from the product's
   live fee ladders — NOT from any cached number — so a stale/guessed price shows
   "the price has changed". We reproduce that formula exactly so our ItemPrice
   matches and no "changed" prompt appears:

     ItemPriceBreak[q] = ParentItemFee[q]
                       + the chosen modification's itemFee ladder
                         (ProductModification-level, else Modification-level)
                       + the selected PriceTier and Second Pole option fees (balls)
     SetupPrice[q]     = the chosen modification's setupFee ladder (+ option setups)

   Service Level and Express Logo option fees are NOT part of the line ladder.
   `priceAtQ` takes the largest break ≤ q. Verified byte-exact against real carts
   (tee, divot, towel, Wilson / Pro V1 / Pro V1x). */
const _pb = (h) => (h && h.PriceBreak) || null;
export const priceAtQ = (breaks, q) => { let p = 0; for (const b of (breaks || [])) if (b.Quantity <= q) p = b.Price; return p; };
function modFeeLadders(pm) {
  const item = [], setup = [];
  if (!pm) return { item, setup };
  const M = pm.Modification || {};
  const it = _pb(pm.itemFee_priceBreakHeader) || _pb(M.itemFee_priceBreakHeader);
  if (it) item.push(it);
  const su = _pb(pm.setupFee_priceBreakHeader) || _pb(M.setupFee_priceBreakHeader);
  if (su) setup.push(su);
  for (const opt of (M.ModificationOption || [])) {
    const inLadder = opt.Name === 'PriceTier' || opt.Name === 'Second Pole';
    for (const v of (opt.ModificationOptionValue || [])) {
      if (!v.selected) continue;
      const vit = _pb(v.itemFee_priceBreakHeader);
      if (inLadder && vit) item.push(vit);
      const vsu = _pb(v.setupFee_priceBreakHeader);
      if (vsu && vsu.some((b) => b.Price)) setup.push(vsu);
    }
  }
  return { item, setup };
}
/* Returns { breaks:[{q,p}], setupBreaks:[{q,p}]|null } computed from the product's
   ParentItemFee + the chosen ProductModification, or null if the product carries
   no fee ladder (caller then falls back to catalog pricing). */
export function computeDecoratedPricing(product, pm, child) {
  const parent = _pb(product && product.itemFee_priceBreakHeader);
  if (!parent) return null;
  const { item, setup } = modFeeLadders(pm);
  // A variant base modifier (Tee Count, iron set, …) rides on the selected child
  // ON TOP of the parent fee — the same resolution background.js uses for variants.
  const childMod = _pb(child && child.itemFeeModifier_priceBreakHeader);
  const base = childMod ? [parent, childMod] : [parent];
  // Volume breakpoints come ONLY from ladders that actually step (>1 break); a
  // single-break ladder like [{1,X}] is a flat add-on, not a tier boundary. If
  // nothing steps, the line is a single {1} tier. The value at each tier is the
  // sum of every base + fee ladder evaluated at that qty.
  const tiers = (ladders) => {
    const s = new Set();
    ladders.forEach((l) => { if (l && l.length > 1) l.forEach((b) => s.add(b.Quantity)); });
    if (!s.size) s.add(1);
    return [...s].sort((a, b) => a - b);
  };
  const all = [...base, ...item];
  const breaks = tiers(all)
    .map((q) => ({ q, p: Math.round(all.reduce((s, l) => s + priceAtQ(l, q), 0) * 100) / 100 }));
  const setupBreaks = tiers(setup)
    .map((q) => ({ q, p: Math.round(setup.reduce((s, l) => s + priceAtQ(l, q), 0) * 100) / 100 }));
  return { breaks, setupBreaks: setupBreaks.some((b) => b.p) ? setupBreaks : null };
}

/* Find the product's ProductModification matching a target modID / FriendlyName
   (the decoration the buyer picked). Falls back to the first modification. */
function findMod(product, { modID, friendly } = {}) {
  const mods = product.ProductModification || [];
  return mods.find((m) => m.Modification && (
    (modID != null && m.Modification.modificationID === modID)
    || (friendly && (m.Modification.FriendlyName === friendly || m.Modification.Name === friendly))
  )) || null;
}

/* Record the buyer's choices on a (cloned) Custom Logo ProductModification by
   flipping `selected` on the right option values. golfballs.com derives the
   decoration charge + commission tier from THESE flags (Second Pole = $0/$6/$4,
   PriceTier = the SKU's tier), not just the cached ItemPrice — without them a
   real order re-prices as an undecorated ball. Clones so the shared product
   object is never mutated. Returns the original when there's nothing to mark. */
function selectCustomLogoOptions(pm, { secondPole = 'No Print', priceTier = null, expressLogo = false } = {}) {
  if (!pm) return pm;
  const clone = JSON.parse(JSON.stringify(pm));
  const groups = (clone.Modification && clone.Modification.ModificationOption) || [];
  const choose = (groupName, match, fallbackFirst = true) => {
    const g = groups.find((o) => o.Name === groupName);
    if (!g || !Array.isArray(g.ModificationOptionValue)) return;
    let hit = false;
    g.ModificationOptionValue.forEach((v) => { v.selected = match(v); if (v.selected) hit = true; });
    if (!hit && fallbackFirst && g.ModificationOptionValue[0]) g.ModificationOptionValue[0].selected = true;
  };
  choose('Service Level', (v) => v.Name === 'None', false); // normal production, never an accidental rush
  choose('Second Pole', (v) => v.Name === secondPole);   // No Print / Logo / Text
  if (priceTier) choose('PriceTier', (v) => v.Name === priceTier); // Econ / Rec / High / Tour / Mid
  choose('Express Logo', (v) => v.Name === (expressLogo ? 'Yes' : 'No'));
  return clone;
}

/* ── decoration dispatcher ─────────────────────────────────────────────────────
   Build the modificationHistory[] entry + line-level customUserImage from an
   engine-agnostic decoration descriptor (what CustomizeBlock emits). Engines:
     none        → plain product, no decoration
     ballText    → modID 5  Personalized (text ± second pole)
     ballLogo    → modID 1008 custom logo on the ball (uploaded logo)
     monogram    → modID 6  Monogram
     logoOverlay → modID 84 inhouse / 25 outsource (uploaded logo overlay)
   Returns { block, historyBlock, customUserImage }. block === null means no decoration. */
/* The opposite-pole imprint slot for a ball, from a {kind,…} pole2 descriptor.
   Text → a Personalized userText slot; Monogram → a MonogramPadded overlay.
   (Logo on the 2nd pole needs its own upload — captured but not slotted yet.) */
function secondPrintSlot(pole2, finish = {}) {
  if (!pole2 || !pole2.kind) return null;
  if (pole2.kind === 'text') {
    return {
      userText: [{ lines: (pole2.lines || [null, null, null]).map(upper), font: pole2.font || 'Kabel Dm BT', color: pole2.color || '#000000' }],
      configOverrides: { ...finish },
      versionProperties: { versionNumber: 2, decorationType: 'Personalized' },
    };
  }
  if (pole2.kind === 'monogram') {
    const chars = String(pole2.text || '').split('');
    return {
      view: pole2.view || (chars.length >= 3 ? 'circle3' : 'circle2'),
      userOverlay: [{ visible: true, fileName: chars.join(',') }],
      configOverrides: { Color1: pole2.color || '#000000', Color2: pole2.color2 || '#FFFFFF' },
      versionProperties: { versionNumber: 2, decorationType: 'MonogramPadded' },
    };
  }
  return null;
}

/* Add the second-pole imprint to a built ball block, unless the front engine
   already placed it (ballText handles a text 2nd pole inline). */
function applySecondPole(block, decoration) {
  const pole2 = decoration && decoration.pole2;
  if (!pole2 || !block || !block.dynamicImage || !block.dynamicImage[0] || block.dynamicImage[0].Print2) return;
  const slot = secondPrintSlot(pole2, decoration.finish || {});
  if (!slot) return;
  block.dynamicImage[0].Print2 = slot;
  if (pole2.kind === 'text') {
    block.interfaceState = block.interfaceState || {};
    block.interfaceState.secondPoleUserText = { lines: pole2.lines || [null, null, null], font: pole2.font || 'Kabel Dm BT', color: pole2.color || '#000000' };
  }
}

export function buildDecoration(product, decoration = {}) {
  const engine = decoration.engine || 'none';
  const noImage = { firstPole: emptyPole(), secondPole: emptyPole() };
  let out;

  if (engine === 'ballText') {
    out = { block: buildBallDecorationBlock(product, { ...decoration, decorationType: 'Personalized' }), customUserImage: noImage };
  } else if (engine === 'monogram') {
    out = {
      block: {
        ProductModification: findMod(product, { modID: 6, friendly: 'Monogram' }),
        interfaceState: {},
        dynamicImage: [buildMonogramDynamicImage(decoration.monogram || decoration)],
        isTemporary: false,
      },
      customUserImage: noImage,
    };
  } else if (engine === 'ballLogo') {
    const logo = decoration.logo || null;
    const expressLogo = decoration.expressLogo === true;
    // Mark the SKU's price tier + the chosen second-pole option as selected so
    // the order bills the right custom-logo charge (and stays commissionable).
    const tier = (product.CustomData && String(product.CustomData.customPriceTier || '').trim()) || null;
    const secondPole = decoration.pole2 ? (decoration.pole2.kind === 'logo' ? 'Logo' : 'Text') : 'No Print';
    const customLogoMod = selectCustomLogoOptions(findMod(product, { modID: 1008, friendly: 'Custom Logo' }), { secondPole, priceTier: tier, expressLogo });
    const logoFields = {
      filePath: (logo && logo.filePath) || '',
      fileName: (logo && logo.fileName) || '',
      cropFilePath: (logo && logo.cropFilePath) || '',
    };
    const customLogo = { useCustomLogo: !expressLogo, ...logoFields };
    const expressState = expressLogo
      ? { useCustomLogo: false, filePath: logoFields.filePath, fileName: logoFields.fileName, isUsed: true }
      : { isUsed: false };
    const interfaceState = {
      GolfBallCustomLogo: { customLogo, expressLogo: expressState },
      DoubleDigit: {},
    };
    // The storefront duplicates the active Express-logo upload at the interface
    // root. Its cart restore/purchase path reads these fields in addition to the
    // GolfBallCustomLogo branch, so retain the captured shape.
    if (expressLogo) Object.assign(interfaceState, { useCustomLogo: false, ...logoFields });
    out = {
      block: {
        ProductModification: customLogoMod,
        interfaceState,
        dynamicImage: [buildBallLogoDynamicImage({ baseColor: decoration.baseColor })],
        isTemporary: false,
      },
      // The uploaded logo is referenced via filePath/cropFilePath; uploadCustomLogo
      // also supplies the canonical Fabric crop object stored in userImage.
      customUserImage: { firstPole: logoPole(logo), secondPole: emptyPole() },
    };
    // Dual pole — a LOGO on the opposite pole. Stored under GolfBallCustomLogo
    // (customLogoSecondPole) with a blank Personalized Print2 + MFS 201, exactly
    // as the real dual-logo cart does.
    const p2logo = decoration.pole2 && decoration.pole2.kind === 'logo' ? (decoration.pole2.logo || null) : null;
    if (p2logo) {
      const gb = out.block.interfaceState.GolfBallCustomLogo;
      gb.customLogoSecondPole = { useCustomLogo: true, filePath: p2logo.filePath || '', fileName: p2logo.fileName || '', cropFilePath: p2logo.cropFilePath || '' };
      gb.textSecondPole = { useCustomLogo: false, dynamicImage: [] };
      out.block.interfaceState.firstPoleUserText = { lines: [null, null, null], font: 'Kabel Dm BT', color: '#000000' };
      out.block.interfaceState.maxTextArea = 0;
      out.block.interfaceState.secondPoleUserText = {};
      const di = out.block.dynamicImage[0];
      di.Print.configOverrides = { MFS: '201', SecondMFS: '201' };
      di.Print2 = { userText: [{ lines: [null, null, null], font: 'Kabel Dm BT', color: '#000000' }], configOverrides: {}, versionProperties: { versionNumber: 2, decorationType: 'Personalized' } };
      out.customUserImage = { firstPole: logoPole(logo), secondPole: logoPole(p2logo) };
    }
    // Dual pole — a TEXT imprint on the opposite pole. A custom logo on one pole
    // + a Personalized text imprint on the other is stored under GolfBallCustomLogo
    // (textSecondPole) at MFS 372: the TEXT lives in the TOP Print (Print2 stays
    // blank), firstPoleUserText carries it, maxTextArea is 2 — matching the real
    // cart. (Distinct from a Personalized-front ball, which keeps text in Print2.)
    const p2text = decoration.pole2 && decoration.pole2.kind === 'text' ? decoration.pole2 : null;
    if (p2text) {
      const lines = (p2text.lines || [null, null, null]).map(upper);
      const font = p2text.font || 'Kabel Dm BT';
      const color = p2text.color || '#000000';
      const baseColor = decoration.baseColor || '#FFFFFF';
      const finish = { MFS: '372', SecondMFS: '372' };
      const textSlot = { userText: [{ lines, font, color }], configOverrides: { ...finish }, versionProperties: { versionNumber: 2, decorationType: 'Personalized' } };
      const blankSlot = { userText: [{ lines: [null, null, null], font: 'Kabel Dm BT', color: '#000000' }], configOverrides: { ...finish }, versionProperties: { versionNumber: 2, decorationType: 'Personalized' } };
      const di = {
        sku: 'GolfBall', clientID: 'Item',
        configOverrides: { BC: baseColor, ...finish },
        versionProperties: { versionNumber: 2 }, view: '',
        Print: textSlot,
        renderedPreviewImage: ballPreviewUrl({
          bc: baseColor, finish,
          print: { decorationType: 'Personalized', lines, font, color, configOverrides: finish },
          print2: { decorationType: 'Personalized', lines: [null, null, null], font: 'Kabel Dm BT', color: '#000000', configOverrides: finish },
        }),
        Print2: blankSlot,
      };
      // The nested copy's preview was rendered with the default ink (#000000)
      // before the chosen color was applied — its Print.userText still carries
      // the real color, only the thumbnail URL differs.
      const nestedPreview = ballPreviewUrl({
        bc: baseColor, finish,
        print: { decorationType: 'Personalized', lines, font, color: '#000000', configOverrides: finish },
        print2: { decorationType: 'Personalized', lines: [null, null, null], font: 'Kabel Dm BT', color: '#000000', configOverrides: finish },
      });
      out.block.dynamicImage = [di];
      const gb = out.block.interfaceState.GolfBallCustomLogo;
      gb.textSecondPole = { useCustomLogo: true, dynamicImage: [{ ...di, renderedPreviewImage: nestedPreview, userText: [] }] };
      out.block.interfaceState.firstPoleUserText = { color, font, lines };
      out.block.interfaceState.maxTextArea = 2;
      out.block.interfaceState.secondPoleUserText = {};
    }

    if (expressLogo) {
      // The website deliberately saves two different shapes. History retains
      // the ordinary blank GolfBall image and a reduced interface snapshot;
      // the active modification carries the legacy ExpressLogo render request.
      const activeInterfaceState = out.block.interfaceState;
      const historyInterfaceState = JSON.parse(JSON.stringify(activeInterfaceState));
      const historyLogo = historyInterfaceState.GolfBallCustomLogo;
      delete historyLogo.customLogo.cropFilePath;
      historyLogo.expressLogo = { isUsed: true };
      delete historyInterfaceState.useCustomLogo;
      delete historyInterfaceState.filePath;
      delete historyInterfaceState.fileName;
      delete historyInterfaceState.cropFilePath;
      out.historyBlock = {
        ProductModification: out.block.ProductModification,
        interfaceState: historyInterfaceState,
        dynamicImage: out.block.dynamicImage,
      };
      out.block = {
        ProductModification: out.block.ProductModification,
        interfaceState: activeInterfaceState,
        dynamicImage: [buildExpressLogoDynamicImage(product, logoFields.cropFilePath)],
      };
    }
  } else if (engine === 'logoOverlay') {
    // Inhouse (84) vs outsource (25) is a property of the product — auto-detect.
    const mods = product.ProductModification || [];
    const hasMod = (id) => mods.some((m) => m.Modification && m.Modification.modificationID === id);
    const outsource = decoration.outsource != null ? !!decoration.outsource : (hasMod(25) && !hasMod(84));
    const logo = decoration.logo || null;
    out = {
      block: {
        ProductModification: findMod(product, { modID: outsource ? 25 : 84, friendly: 'Custom Logo' }),
        interfaceState: null,
        dynamicImage: [buildLogoOverlayDynamicImage({ outsource, logo })],
        isTemporary: false,
      },
      customUserImage: { firstPole: logoPole(logo), secondPole: emptyPole() },
    };
  } else if (engine === 'accessoryText') {
    // Tee text (modID 15 "Tee"). Single line, case preserved, Render.aspx preview.
    const p = decoration.pole1 || {};
    const text = (p.lines || []).find((l) => l != null && String(l).trim() !== '') || '';
    const font = p.font || 'Kabel Dm BT';
    const color = p.color || '#000000';
    out = {
      block: {
        ProductModification: findMod(product, { modID: 15, friendly: 'Tee' }),
        interfaceState: {},
        dynamicImage: [buildTeeDynamicImage({ text, font, color })],
        isTemporary: false,
      },
      customUserImage: noImage,
    };
  } else if (engine === 'towelMonogram' || engine === 'towelText') {
    // Towel / hat embroidery (modID 23). BC = the selected child's backgroundHex
    // (injected by assembleLine). Both sub-conditions live in interfaceState; the
    // active one is mirrored into the top-level dynamicImage.
    const isMono = engine === 'towelMonogram';
    const bc = decoration._childBgHex || decoration.baseColor || '#FFFFFF';
    const m = decoration.monogram || {};
    const p = decoration.pole1 || {};
    const monoLines = [String(m.text || '').toUpperCase()].filter((l) => l !== '');
    const textLines = [(p.l1 != null ? p.l1 : (p.lines && p.lines[0])) || '', (p.l2 != null ? p.l2 : (p.lines && p.lines[1])) || ''];
    const monoColor = m.color || '#000000';
    const textColor = p.color || '#000000';
    const monoDI = buildTowelDynamicImage({ condition: 'Monogram', bc, lines: isMono ? monoLines : [], font: TOWEL_MONO_FONT, color: monoColor, withPreview: isMono });
    const textDI = buildTowelDynamicImage({ condition: 'Personalized', bc, lines: isMono ? ['', ''] : textLines, font: TOWEL_TEXT_FONT, color: textColor, withPreview: !isMono });
    out = {
      block: {
        ProductModification: findMod(product, { modID: 23, friendly: 'Golf Towel' }) || findMod(product, { friendly: 'Golf Hat' }),
        interfaceState: {
          GolfTowelPersonalized: { dynamicImage: [textDI], userText: [{ lines: isMono ? ['', ''] : textLines, font: TOWEL_TEXT_FONT, color: textColor }] },
          GolfTowelMonogram: { dynamicImage: [monoDI], userText: [{ lines: isMono ? monoLines : [], font: TOWEL_MONO_FONT, color: monoColor }] },
        },
        dynamicImage: [isMono ? monoDI : textDI],
        isTemporary: false,
      },
      customUserImage: noImage,
    };
  } else {
    return { block: null, customUserImage: noImage }; // engine === 'none'
  }

  // Express uses a single legacy descriptor which must not be decorated with a
  // modern Print2 member. Standard ball-logo and other ball engines retain it.
  if (!(engine === 'ballLogo' && decoration.expressLogo === true)) applySecondPole(out.block, decoration);
  return out;
}

/* ── REVERSE: a cart line's modification → the decoration descriptor ──────────
   The inverse of buildDecoration: read the imprint a saved cart stored
   (dynamicImage / interfaceState / customUserImage) back into the engine-agnostic
   decoration the modal + giftImprints.decoImprints understand, so a CRM proposal
   shows its real imprint details (type · text/logo · colour · pole). Returns null
   when the line has no detectable imprint. Covers the ball engines (logo, text,
   monogram, dual-pole) + tee + towel; mirrors the fields buildDecoration writes. */
export function decorationFromCartItem(it) {
  const m = it && it.modification;
  if (!m) return null;
  const di = Array.isArray(m.dynamicImage) ? m.dynamicImage : [];
  const d0 = di[0] || {};
  const is = m.interfaceState || {};
  const cui = it.customUserImage || {};
  const baseColor = (d0.configOverrides && d0.configOverrides.BC) || '#FFFFFF';
  const finish = { MFS: '279', SecondMFS: '279' };
  const nonEmpty = (lines) => (lines || []).some((l) => l != null && String(l).trim() !== '');
  const logoFrom = (poleObj, cuiPole) => {
    const fp = (poleObj && poleObj.filePath) || (cuiPole && cuiPole.filePath) || '';
    const fn = (poleObj && poleObj.fileName) || (cuiPole && cuiPole.fileName) || '';
    if (!fp && !fn) return null;
    // The uploaded logo art lives under static.golfballs.com (the same
    // Source/CustomerUploads path the cart stores). Surface it as `preview` so
    // decoImprints' logo chip has a fetchable image and OUR 3D preview pipeline
    // can render the ball from the customer's uploaded art (imprintToDecalUrl
    // proxies the cross-origin URL to a canvas-safe data URL).
    const preview = fp ? (/^https?:/i.test(fp) ? fp : 'https://static.golfballs.com/' + fp.replace(/^\//, '')) : '';
    return { filePath: fp, fileName: fn, cropFilePath: (poleObj && poleObj.cropFilePath) || '', preview };
  };

  // Tee text (modID 15)
  if (d0.sku === 'tee' || d0.imageType === 'Tee') {
    const u = (d0.userText && d0.userText[0]) || {};
    return nonEmpty(u.lines)
      ? { engine: 'accessoryText', baseColor, finish, dualPole: false, pole2: null, pole1: { lines: u.lines, font: u.font || 'Kabel Dm BT', color: u.color || '#000000' } }
      : null;
  }

  // Towel / hat embroidery (both sub-conditions live in interfaceState)
  if (is.GolfTowelPersonalized || is.GolfTowelMonogram || d0.imageType === 'Golf Towel') {
    const monoU = ((is.GolfTowelMonogram || {}).userText || [])[0] || {};
    const textU = ((is.GolfTowelPersonalized || {}).userText || [])[0] || {};
    if ((d0.condition === 'Monogram' || (nonEmpty(monoU.lines) && !nonEmpty(textU.lines))) && nonEmpty(monoU.lines)) {
      return { engine: 'towelMonogram', baseColor, finish, dualPole: false, pole2: null, monogram: { text: (monoU.lines || []).join(''), color: monoU.color || '#000000', color2: '#FFFFFF', overlay: 'circle' } };
    }
    if (nonEmpty(textU.lines)) {
      return { engine: 'towelText', baseColor, finish, dualPole: false, pole2: null, pole1: { lines: textU.lines, font: textU.font || 'Century', color: textU.color || '#000000' } };
    }
    return null;
  }

  // Monogram on a ball (decorationType MonogramPadded + metaData)
  const print = d0.Print || {};
  if ((print.versionProperties && print.versionProperties.decorationType === 'MonogramPadded') || (d0.metaData && print.userOverlay)) {
    const md = d0.metaData || {};
    const pc = print.configOverrides || {};
    const overlayName = ((print.userOverlay || [])[0] || {}).fileName || '';
    const text = md.text != null ? md.text : overlayName.replace(/,/g, '');
    if (!String(text).trim()) return null;
    return { engine: 'monogram', baseColor, finish, dualPole: false, pole2: null,
      monogram: { baseColor, text: String(text), view: print.view || md.view, color: md.color || pc.Color1 || '#000000', color2: md.color2 || pc.Color2 || '#FFFFFF', overlay: md.overlay || 'circle' } };
  }

  // Custom logo on a ball (GolfBallCustomLogo) — front logo + optional 2nd pole
  const gb = is.GolfBallCustomLogo;
  if (gb) {
    const frontLogo = logoFrom(gb.customLogo, cui.firstPole);
    let pole2 = null, dualPole = false;
    if (gb.customLogoSecondPole && (gb.customLogoSecondPole.filePath || gb.customLogoSecondPole.fileName || (cui.secondPole && cui.secondPole.filePath))) {
      pole2 = { kind: 'logo', logo: logoFrom(gb.customLogoSecondPole, cui.secondPole) || { filePath: '', fileName: '' } }; dualPole = true;
    } else if (gb.textSecondPole && gb.textSecondPole.useCustomLogo) {
      const t = is.firstPoleUserText || {};
      if (nonEmpty(t.lines)) { pole2 = { kind: 'text', lines: t.lines, font: t.font || 'Kabel Dm BT', color: t.color || '#000000' }; dualPole = true; }
    }
    if (frontLogo || pole2) return { engine: 'ballLogo', baseColor, finish, dualPole, pole2, logo: frontLogo, expressLogo: !!(gb.expressLogo && gb.expressLogo.isUsed) };
  }

  // Personalized text on a ball (Print.userText, + optional Print2 2nd pole)
  if (print.userText) {
    const u = print.userText[0] || {};
    const u2 = ((d0.Print2 || {}).userText || [])[0] || null;
    if (nonEmpty(u.lines)) {
      const second = u2 && nonEmpty(u2.lines);
      return { engine: 'ballText', baseColor, finish,
        dualPole: !!second, pole2: second ? { kind: 'text', lines: u2.lines, font: u2.font || 'Kabel Dm BT', color: u2.color || '#000000' } : null,
        pole1: { lines: u.lines, font: u.font || 'Kabel Dm BT', color: u.color || '#000000' } };
    }
  }

  return null;
}

/* Assemble one itemsInCart line from the product page object
   (__NEXT_DATA__.props.pageProps.product), the catalog pricing ladder, the
   buyer's property selection, the decoration descriptor, and quantity. Works
   for every item type — the decoration engine is chosen by buildDecoration().
   Pricing comes from the catalog (`pricing.breaks` = [{q,p}], `pricing.price`);
   the page carries only the parent fee header. itemGuid is generated if omitted. */
/* Pick the child (variant) the buyer selected — by option values
   ({ "Tee Count": "100", Color: "White" }), then by explicit propertyValueIDs,
   then the first child. Shared by assembleLine + decoratedUnitPrice. */
export function selectChild(product, selection = {}) {
  const children = product.ProductChild || [];
  const wantVals = selection.values && Object.keys(selection.values).length ? selection.values : null;
  const wantIds = new Set(selection.propertyValueIDs || []);
  let child = null;
  if (wantVals) {
    const idToLabel = {};
    (product.PropertyProduct || []).forEach((pp) => { idToLabel[pp.propertyProductID] = pp.Name || pp.FriendlyName; });
    child = children.find((c) => {
      const vals = {};
      (c.PropertyValueProduct || []).forEach((pv) => { const l = idToLabel[pv.propertyProductID]; if (l) vals[l] = String(pv.Value); });
      return Object.entries(wantVals).every(([l, v]) => String(v) === vals[l]);
    }) || null;
  }
  if (!child && wantIds.size) child = children.find((c) => (c.PropertyValueProduct || []).some((pv) => wantIds.has(pv.propertyValueProductID))) || null;
  return child || children[0] || {};
}

/* Resolve the product's NameFormat placeholders from the selected child. The
   raw product page can carry templates such as "{Color} {Decoration} …";
   cart lines must contain the concrete value (for example White), not the
   template token. */
export function resolveLineName(product, child, selection = {}, decorationName = '') {
  const values = new Map();
  const norm = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const remember = (label, value) => {
    const key = norm(label);
    if (!key || value == null || String(value).trim() === '') return;
    values.set(key, String(value).trim());
    if (key.endsWith('color')) values.set('color', String(value).trim());
  };
  remember('Decoration', decorationName);
  Object.entries((selection && selection.values) || {}).forEach(([label, value]) => remember(label, value));
  const groups = new Map();
  (product.PropertyProduct || []).forEach((group) => {
    groups.set(group.propertyProductID, group);
  });
  ((child && child.PropertyValueProduct) || []).forEach((propertyValue) => {
    const group = groups.get(propertyValue.propertyProductID) || {};
    remember(group.Name || group.FriendlyName, propertyValue.Value);
  });
  const template = String(product.NameFormat || product.Name || '');
  return template.replace(/\{([^{}]+)\}/g, (token, label) => {
    const key = norm(label);
    if (key === 'decoration') return decorationName || '';
    return values.has(key) ? values.get(key) : token;
  }).replace(/\s{2,}/g, ' ').trim();
}

/* The decorated per-unit price ladder for a line, computed from the raw product
   page exactly as assembleLine does — so the in-modal proposal DISPLAY matches the
   cart the site will load. Returns { breaks:[{q,p}], setupBreaks } or null when the
   page has no fee data. */
export function decoratedPricingForLine(product, decoration, selection) {
  const child = selectChild(product, selection);
  const deco = decoration || { engine: 'none' };
  let pm = null;
  if (deco.engine && deco.engine !== 'none') {
    const bg = child && child.CustomData && child.CustomData.backgroundHex;
    const { block } = buildDecoration(product, bg ? { ...deco, _childBgHex: bg } : deco);
    pm = block && block.ProductModification;
  }
  const computed = computeDecoratedPricing(product, pm, child);
  // Gift set: re-wrap the ball's custom-logo ladder as a per-set gift-set ladder.
  if (computed && deco.giftSet) {
    const breaks = giftSetLadder(computed.breaks, deco.giftSet);
    if (breaks) return { breaks, setupBreaks: null };
  }
  return computed;
}

export function assembleLine({ product, pricing = {}, selection = {}, decoration, qty = 1, itemGuid, url } = {}) {
  const child = selectChild(product, selection);
  const selectedIds = (child.PropertyValueProduct || []).map((pv) => pv.propertyValueProductID);
  // Towel/hat embroidery needs the chosen child's background color for the BC
  // overlay — fold it in so buildDecoration can reach it.
  const childBg = child && child.CustomData && child.CustomData.backgroundHex;
  let decoForBuild = childBg ? { ...(decoration || { engine: 'none' }), _childBgHex: childBg } : (decoration || { engine: 'none' });
  // "Custom Logo" overlay apparel (modID 25 outsource / 84 inhouse) ALWAYS carries
  // the custom-logo modification on the site — even with no uploaded artwork — which
  // is what supplies the $ setup fee + the full price ladder + marks the line
  // imprinted. A plain add gives us engine 'none', so default it to logoOverlay for
  // these products (NOT balls, modID 1008, which use the ballLogo flow).
  if (!decoForBuild.engine || decoForBuild.engine === 'none') {
    const m = product.ProductModification || [];
    const hasOverlay = m.some((x) => x.Modification && (x.Modification.modificationID === 25 || x.Modification.modificationID === 84));
    const hasBall = m.some((x) => x.Modification && x.Modification.modificationID === 1008);
    if (hasOverlay && !hasBall) decoForBuild = { ...decoForBuild, engine: 'logoOverlay' };
  }
  const { block: decoBlock, historyBlock: decoHistoryBlock, customUserImage } = buildDecoration(product, decoForBuild);

  // Price the way golfballs.com recomputes it on cart load: from the product's
  // live fee ladders + the chosen modification (ParentItemFee + the mod's itemFee
  // + selected PriceTier/Second Pole). This is what stops the "price has changed"
  // prompt. Falls back to the catalog ladder only when the page has no fee data.
  const atQ = (bks, q) => { let p = 0; for (const b of (bks || [])) if (b.q <= q) p = b.p; return p; };
  const computed = decoBlock ? computeDecoratedPricing(product, decoBlock.ProductModification, child) : null;
  // Gift set wraps the ball line: a per-set price ladder (ball custom-logo ladder
  // ×OriginalItemQty + the kit ladder) plus a `bundle` + a kit child in childList.
  const giftSet = decoForBuild.giftSet || null;
  const giftBreaks = (giftSet && computed) ? giftSetLadder(computed.breaks, giftSet) : null;
  const bundleBlock = giftBreaks ? buildBundleBlock(giftSet, {
    renderedPreviewImage: giftSetPreviewUrl(giftSet, {
      decoration: decoForBuild,
      sleeveImage: (product.CustomData && product.CustomData.giftSetSleeveImage) || null,
      brand: (product.Brand && product.Brand.Name) || '',
    }),
  }) : null;
  /* A hand-edited price is an OVERRIDE and must win over the recomputed ladder.
     The live-ladder recompute above exists to avoid the site's "the price has
     changed" prompt on an untouched line — but a proposal's whole purpose is to
     quote negotiated pricing, so when the rep types a price we send exactly that
     (flat at every qty, like a custom item) instead of silently restoring list
     price. Setup fees still come from the computed ladder: the override is the
     per-unit price, not the one-time decoration setup. */
  const overridePrice = pricing.override && pricing.price != null ? round2(pricing.price) : null;
  const breaks = overridePrice != null ? [{ q: 1, p: overridePrice }]
    : giftBreaks ? giftBreaks
    : computed ? computed.breaks
    : ((pricing.breaks && pricing.breaks.length) ? pricing.breaks : [{ q: 1, p: pricing.price || 0 }]);
  const unit = overridePrice != null ? overridePrice
    : (computed || giftBreaks) ? atQ(breaks, qty)
    : (pricing.price != null ? pricing.price : (breaks[0] && breaks[0].p) || 0);
  const setupBreaks = giftSet ? null : ((computed && computed.setupBreaks) || null);
  const setupUnit = setupBreaks ? atQ(setupBreaks, qty) : 0;
  const childList = bundleBlock ? [child, bundleBlock.kitChild] : [child];

  // Resolve the cart name the way the site does: substitute the decoration's
  // FriendlyName into NameFormat's "{Decoration}" slot (→ "… Custom Logo …";
  // plain orders collapse the slot to nothing → "… Golf Balls").
  const decoFriendly = (decoBlock && decoBlock.ProductModification && decoBlock.ProductModification.Modification
    && decoBlock.ProductModification.Modification.FriendlyName) || '';
  const baseName = resolveLineName(product, child, selection, decoFriendly);
  // A gift-set line reads "<gift set name> with <Brand> <ball name>".
  const ballTitle = [product.Brand && product.Brand.Name, baseName].filter(Boolean).join(' ').trim();
  const productTitle = giftSet ? `${giftSet.name} with ${ballTitle}` : ballTitle;

  return {
    nameFormat: baseName,
    productTitle,
    qtyFields: [],
    ShortCode: product.ShortCode,
    brand: (product.Brand && product.Brand.Name) || '',
    totalQty: qty,
    childList,
    ModificationGroupDetail: product.ModificationGroupDetail || null,
    ItemPriceBreak: { priceBreakHeaderID: 0, PriceBreak: breaks.map((b) => ({ Quantity: b.q, Price: b.p, Cost: 0 })), ProductionTime: 0, minimumQty: 1 },
    SetupPriceBreak: setupBreaks
      ? { priceBreakHeaderID: 0, PriceBreak: setupBreaks.map((b) => ({ Quantity: b.q, Price: b.p, Cost: 0 })), ProductionTime: 0 }
      : { priceBreakHeaderID: 0, PriceBreak: [{ Quantity: 1, Price: 0, Cost: 0 }], ProductionTime: 0 },
    ItemPrice: unit,
    SetupPrice: setupUnit,
    originalPrice_priceBreakHeader: null,
    originalPrice_priceBreakHeaderID: 0,
    disableGiftWrap: false,
    // Decorated/dropship lines bypass the per-product minimum-qty gate, matching
    // the site's saved cart for custom-logo items.
    ignoreMinimumQty: product.ignoreMinimumQty != null ? product.ignoreMinimumQty : !!decoBlock,
    OriginalPriceLabel: '',
    ProductParentSetupFee: product.setupFee_priceBreakHeader || null,
    ProductParentItemFee: product.itemFee_priceBreakHeader || null,
    SelectedItemPriceBreakQty: qty,
    childFilters: [null],
    widgetSelections: selectedIds.map((v) => ({ values: [v] })),
    widgetApplicationOrder: [],
    modificationHistory: decoBlock ? [decoHistoryBlock || decoBlock] : [],
    modificationTemporaryHistory: [],
    selectionWidgets: (product.PropertyProduct || []).map((_, i) => ({ WidgetType: 'TextButtonGroup', Configuration: { propertyIndex: i, maxValues: 1 } })),
    modification: decoBlock || { interfaceState: {} },
    subscription: { frequency: 1, isSubscribable: false, brand: '' },
    itemTypeID: product.itemTypeID,
    ProductTagDetail: product.ProductTagDetail || [],
    inventory: product.inventory || [],
    preorder: { show: false, date: null },
    customUserImage: customUserImage || { firstPole: emptyPole(), secondPole: emptyPole() },
    CustomData: product.CustomData || {},
    bundle: bundleBlock ? bundleBlock.bundle : null,
    hasQtyParam: false,
    itemType: (product.ItemType && product.ItemType.Name) || (product.itemType_s || '').split('-').pop() || 'Golf Balls',
    images: bundleBlock
      ? buildGiftSetImages(product.ProductImage || product.images || [], bundleBlock.bundle.renderedPreviewImage)
      : (product.ProductImage || product.images || []),
    itemGuid: itemGuid || (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    // Commissionable "_1" path for imprinted lines comes in via `url`; the page's
    // canonical (base) URL is the fallback for plain/retail lines.
    url: url || canonicalUrl(product),
    OrderQtyMultiple: null,
    // Carry the product's real dropship config when present (the page's product
    // object already has it). Fall back to the DropShipOnly tag, else inactive.
    dropship: dropshipBlock(product),
  };
}

/* Resolve a line's dropship block from the raw product. Prefers the product's own
   `dropship` object; otherwise infers from a `DropShipOnly` ProductTagDetail. */
function dropshipBlock(product) {
  const d = product && product.dropship;
  if (d && typeof d === 'object' && ('active' in d || 'dropshipTime' in d || 'dropshipDate' in d)) {
    return { active: !!d.active, dropshipTime: d.dropshipTime || 0, dropshipDate: d.dropshipDate || '' };
  }
  const tags = (product && product.ProductTagDetail) || [];
  const isDropship = tags.some((t) => t && /DropShipOnly/i.test(t.Name || ''));
  return isDropship
    ? { active: true, dropshipTime: (d && d.dropshipTime) || 20, dropshipDate: (d && d.dropshipDate) || '' }
    : { active: false, dropshipTime: 0, dropshipDate: '' };
}

/* Back-compat alias — assembleLine now handles every item type, not just balls. */
export const assembleBallLine = assembleLine;

/* ── cart wrapper + totals ────────────────────────────────────────────────── */

const round2 = (n) => Math.round(n * 100) / 100;

/* Line total = per-unit price × units + one-time setup (decoration fees are
   already baked into ItemPrice, e.g. poker-chip dual pole 1.99+0.50=2.49). */
export function lineTotal(line) {
  return round2((line.ItemPrice || 0) * (line.totalQty || 0) + (line.SetupPrice || 0));
}

/* ── custom items (ShortCode "SERVICEITEM") ──────────────────────────────────
   A sales-rep custom item has no product page; this builds the cart line
   directly from the saved fields, templated EXACTLY on a captured SERVICEITEM
   line (name/style/extraDetails/itemID/thumbnail ride in the modification
   options; price/setup/qty drive the price breaks; weight/dropship ride in the
   child). See src/lib/customItems.js for the stored shape. */
const _ciNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const _pbHeader = (price, qty) => ({
  HashValue: 0, ProductionTime: 0, priceBreakHeaderID: 0,
  PriceBreak: [{ Price: round2(price), Quantity: qty, Cost: 0, priceBreakHeaderID: 0, CostPercentage: 0 }],
  minimumQty: 1,
});
const _ciModOption = (name, value) => ({
  ModificationOptionValue: [{
    itemFee_priceBreakHeader: _pbHeader(0, 1),
    setupFee_priceBreakHeader: _pbHeader(0, 1),
    modificationOptionID: 0, modificationOptionValueID: 0, Name: value == null ? '' : String(value), selected: true,
  }],
  modificationOptionID: 0, modificationID: 0, Name: name, Description: '',
  NotAvailableToSelect: false, CustomerNote: '', setupFee_priceBreakHeaderID: 0, itemFee_priceBreakHeaderID: 0,
});

export function buildCustomItemLine({ ci = {}, qty, price, style } = {}) {
  const q = _ciNum(qty != null ? qty : ci.qty) || 1;
  const itemPrice = round2(price != null ? price : _ciNum(ci.price));
  const setup = round2(_ciNum(ci.setup));
  const name = (ci.name || 'Custom item').toString();
  // Selected style option (falls back to a legacy single style or the first option).
  const styleVal = (style != null ? style
    : (ci.style != null ? ci.style : (Array.isArray(ci.styleOptions) ? ci.styleOptions[0] : '')) || '');
  const styleStr = (styleVal || '').toString();
  const title = name + (styleStr ? ' ' + styleStr : '');
  const thumb = (ci.thumbnail || '').toString();
  return {
    nameFormat: '',
    productTitle: title,
    qtyFields: [],
    ShortCode: 'SERVICEITEM',
    totalQty: q,
    childList: [{
      ShortCode: name,
      OriginalPriceLabel: null,
      originalPrice_priceBreakHeader: null,
      itemFeeModifier_priceBreakHeaderID: 0,
      QtyPerPack: 1,
      DescriptionData: {},
      productChildID: 0,
      itemFeeModifier_priceBreakHeader: {
        HashValue: null, ProductionTime: 0, priceBreakHeaderID: 0,
        PriceBreak: [{ Price: 0, Quantity: 1, Cost: 0, priceBreakHeaderID: 0, CostPercentage: 0 }],
        Quantity: q, Price: itemPrice, Cost: 0, CostPercentage: 0,
      },
      AvailableForSale: true,
      setupFeeModifier_priceBreakHeaderID: null,
      Name: name,
      ManufacturerSku: '',
      setupFeeModifier_priceBreakHeader: null,
      originalPrice_priceBreakHeaderID: null,
      CustomData: { legacySku: (ci.legacySku || '').toString(), itemID: (ci.itemID || '').toString(), isDropship: !!ci.dropship },
      ModuleData: {},
      PropertyValueProduct: [],
      LastUpdated: '',
      ShippingData: { weight: _ciNum(ci.weight), dimensionalWeight: 0 },
      ProductTagDetail: [],
      productParentID: 0,
    }],
    ModificationGroupDetail: {},
    ItemPriceBreak: { priceBreakHeaderID: 0, PriceBreak: [{ Quantity: q, Price: itemPrice, Cost: 0 }], ProductionTime: 0, minimumQty: 1 },
    SetupPriceBreak: { priceBreakHeaderID: 0, PriceBreak: [{ Quantity: 1, Price: setup, Cost: 0 }], ProductionTime: 0 },
    ItemPrice: itemPrice,
    SetupPrice: setup,
    originalPrice_priceBreakHeader: null,
    originalPrice_priceBreakHeaderID: 0,
    disableGiftWrap: false,
    OriginalPriceLabel: '',
    ProductParentSetupFee: null,
    ProductParentItemFee: {
      HashValue: 0, ProductionTime: 0, priceBreakHeaderID: 0,
      PriceBreak: [{ Price: 0, Quantity: 0, Cost: 0, priceBreakHeaderID: 0, CostPercentage: 0 }],
      minimumQty: 1,
    },
    SelectedItemPriceBreakQty: q,
    childFilters: [],
    widgetSelections: [],
    widgetApplicationOrder: [],
    selectionWidgets: [],
    images: thumb ? [{ PropertyValueProduct: [], productImageID: 0, URL: thumb, ProductImageConditionSpecial: [], productParentID: 0, SortValue: 1 }] : [],
    inventory: [],
    subscription: {},
    customUserImage: {
      firstPole: { fileName: '', filePath: '', userImage: null, fileSupported: false },
      secondPole: { fileName: '', filePath: '', userImage: null, fileSupported: false },
    },
    itemGuid: (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)),
    modification: {
      ProductModification: {
        Modification: {
          ModificationOption: [
            _ciModOption('name', name),
            _ciModOption('style', styleStr),
            _ciModOption('extraDetails', ci.extraDetails || ''),
            _ciModOption('itemID', ci.itemID || ''),
            _ciModOption('thumbnail', thumb),
          ],
          setupFee_priceBreakHeaderID: 0,
          Description: 'Service Item',
          modificationID: 0,
          FriendlyName: 'Service Item',
          itemFee_priceBreakHeaderID: 0,
          setupFee_priceBreakHeader: _pbHeader(setup, 1),
          itemFee_priceBreakHeader: _pbHeader(itemPrice, q),
          Name: 'Service Item',
        },
        PriceAdjustment: 0,
        modificationID: 0,
        productModificationID: 0,
        productParentID: 0,
      },
    },
  };
}

/* Assemble the cartData object (the localStorage.shoppingCart shape) from an
   array of fully-built itemsInCart lines. Totals reconcile with real captures. */
/* Discount amount carried by a resolved promotion (the /user/promotion result
   uses `totalDiscount`; the cart's stored promotion block uses
   `totalPromoDiscount`). Returns 0 when there's no monetary discount (e.g. a
   FREE_QUANTITY promo's value is in freeItems, not a $ off). */
/* The MONETARY discount to subtract from revenue for display — order-level +
   item-level only. A FREE_QUANTITY promo's value is NOT counted here; it's shown
   as a $0 "free" line instead (see freeLinesFromPromo), so counting it again
   would double-discount. */
export function promoDiscount(promotion) {
  if (!promotion || typeof promotion !== 'object') return 0;
  if (promotion.promoType === 'FREE_QUANTITY') {
    const order = Number(promotion.orderLevelDiscount) || 0;
    const items = (promotion.itemLevelDiscounts || []).reduce((s, d) => s + (Number(d && (d.amount != null ? d.amount : d.discount)) || 0), 0);
    return round2(order + items);
  }
  const v = promotion.totalPromoDiscount != null ? promotion.totalPromoDiscount
    : promotion.totalDiscount != null ? promotion.totalDiscount
    : promotion.orderLevelDiscount != null ? promotion.orderLevelDiscount : 0;
  return round2(Number(v) || 0);
}

/* The FULL discount the cart stores (includes the free-quantity value) — used
   when building a cart payload so cartTotal matches the site. */
function fullPromoDiscount(promotion) {
  if (!promotion || typeof promotion !== 'object') return 0;
  const v = promotion.totalPromoDiscount != null ? promotion.totalPromoDiscount
    : promotion.totalDiscount != null ? promotion.totalDiscount
    : promotion.orderLevelDiscount != null ? promotion.orderLevelDiscount : 0;
  return round2(Number(v) || 0);
}

/* Free lines a FREE_QUANTITY promo grants: one $0 line per freeItem, cloned from
   the matching proposal line (so it carries the same product + imprint), at the
   granted quantity. `lines` are the live proposal lines (each with an `id`/splits
   whose `id` we used as the promotion itemGuid). Returns [] for non-free promos. */
export function freeLinesFromPromo(promotion, lines) {
  if (!promotion || promotion.promoType !== 'FREE_QUANTITY') return [];
  const free = promotion.freeItems || [];
  if (!free.length) return [];
  // Map promotion itemGuid → the source proposal line (we set itemGuid = split.id;
  // also accept the cart's "<guid>-PROMO" / base-guid forms).
  const byKey = new Map();
  for (const l of (lines || [])) {
    for (const s of (l.splits || [])) if (s && s.id) byKey.set(String(s.id), l);
    if (l.id) byKey.set(String(l.id), l);
    if (l.productId) byKey.set(String(l.productId), l);
  }
  // The promotion's per-item discounts carry each free item's FULL value (what
  // the site nets off at the bottom of the cart) — keyed by the same itemGuid
  // family as freeItems. Mapped here so the email can show the free line at
  // full price (HAR layout: Subtotal → −Promotion → Total).
  const valueByKey = new Map();
  for (const d of (promotion.itemLevelDiscounts || [])) {
    const g = String((d && d.itemGuid) || '').replace(/-PROMO$/i, '');
    const amt = Number(d && (d.amount != null ? d.amount : d.discount)) || 0;
    if (g) valueByKey.set(g, (valueByKey.get(g) || 0) + amt);
  }
  const out = [];
  free.forEach((f, i) => {
    const key = String(f.itemGuid || '').replace(/-PROMO$/i, '');
    // Map the granted free item back to ITS source line only. If that line is
    // gone (the rep removed the item the promo keyed off), drop the free line —
    // do NOT fall back to lines[0], which would re-attach the giveaway to an
    // unrelated product. (The promo is re-validated on every proposal change, so
    // a still-qualifying promo always has a live source line to map to.)
    const src = byKey.get(key) || byKey.get(String(f.itemGuid || ''));
    if (!src) return;
    out.push({
      id: 'free-' + (f.itemGuid || i),
      productId: (src.product && src.product.id) || src.productId,
      product: src.product,
      decoration: src.decoration || null,
      variant: src.variant || null,
      free: true,
      // `parentLineId` ties the giveaway to the line that earned it (Separated-
      // theme grouping); `freeValue` is the site's authoritative full value.
      parentLineId: src.id || null,
      freeValue: round2(valueByKey.get(key) || 0) || null,
      splits: [{ id: 'frees-' + (f.itemGuid || i), qty: Number(f.amount) || 0, price: 0 }],
    });
  });
  return out;
}

/* A FREE_QUANTITY promo (e.g. EVERY12GETS6) is stored by the site as REAL cart
   lines: a "<guid>-PROMO" twin of each qualifying paid line, at the granted
   quantity, priced from that line's OWN break ladder (qty 6 → the q1/low break,
   not the paid q12 price) with no setup re-charged — and their value is netted
   back out via the promotion's totalPromoDiscount. A `promotion` blob ALONE does
   NOT re-grant the dozens on load; without the twin lines the loaded cart shows
   no free items (the bug this fixes). Returns the paid+twin item list (twins
   interleaved after their parent), the granted-value discount, and the twin
   guids. Guards against double-materializing if a twin is already present. */
function materializeFreePromo(itemsInCart, promotion) {
  const none = { items: itemsInCart, discount: 0, twinGuids: [] };
  if (!promotion || promotion.promoType !== 'FREE_QUANTITY') return none;
  const free = promotion.freeItems || [];
  if (!free.length) return none;
  const present = new Set(itemsInCart.map((l) => String(l.itemGuid)));
  // Free amount per qualifying line, keyed by the bare itemGuid.
  const amtByGuid = new Map();
  for (const f of free) {
    const g = String((f && f.itemGuid) || '').replace(/-PROMO$/i, '');
    if (g) amtByGuid.set(g, (amtByGuid.get(g) || 0) + (Number(f.amount) || 0));
  }
  const items = [];
  const twinGuids = [];
  let discount = 0;
  for (const line of itemsInCart) {
    items.push(line);
    const baseGuid = String(line.itemGuid || '');
    const qty = amtByGuid.get(baseGuid) || 0;
    const twinGuid = baseGuid + '-PROMO';
    if (qty > 0 && !present.has(twinGuid)) {
      const breaks = (line.ItemPriceBreak && line.ItemPriceBreak.PriceBreak) || [];
      let price = (breaks[0] && breaks[0].Price) || line.ItemPrice || 0;
      for (const b of breaks) if ((b.Quantity || 0) <= qty) price = b.Price;
      // The free dozens share the paid line's one-time imprint setup — don't
      // re-charge it (twin value = price × qty, fully netted by the discount).
      items.push({ ...line, itemGuid: twinGuid, totalQty: qty, ItemPrice: price, SetupPrice: 0, SelectedItemPriceBreakQty: qty });
      twinGuids.push(twinGuid);
      discount = round2(discount + price * qty);
    }
  }
  return { items, discount, twinGuids };
}

export function buildCartData(itemsInCart, { proposalID = null, promotion = null, adminOverride = false } = {}) {
  // A resolved promo (from /user/promotion) is stored on the cart so the site
  // re-applies it on load; cartTotal nets the discount. The empty sentinel keeps
  // a no-coupon cart byte-identical to the verified capture.
  const hasPromo = promotion && promotion.promo;
  const freeQty = hasPromo && promotion.promoType === 'FREE_QUANTITY';
  // FREE_QUANTITY: materialize the granted dozens as "-PROMO" cart lines.
  const mat = freeQty ? materializeFreePromo(itemsInCart, promotion) : { items: itemsInCart, discount: 0, twinGuids: [] };
  const items = mat.items;
  const subTotal = round2(items.reduce((s, l) => s + lineTotal(l), 0));
  const totalQty = items.reduce((s, l) => s + (l.totalQty || 0), 0);
  const discount = freeQty ? mat.discount : (hasPromo ? fullPromoDiscount(promotion) : 0);
  // Stored promotion: the site marks a resolved FREE_QUANTITY promo with
  // type:"PromotionValue" + promoCodeStatus:"showResult", puts the granted value
  // in totalPromoDiscount/totalDiscount, and lists every line guid (paid +
  // "-PROMO") in eligibleItemGuids. A bare /user/promotion result stored verbatim
  // (totalDiscount 0, no type) loads as no-promo — which is what dropped the
  // coupon + free items off our saved proposals.
  let storedPromo;
  if (!hasPromo) storedPromo = { type: 'PromotionEmpty' };
  else if (freeQty) storedPromo = {
    ...promotion,
    totalPromoDiscount: discount,
    totalDiscount: discount,
    totalSubscriptionDiscount: promotion.totalSubscriptionDiscount || 0,
    type: 'PromotionValue',
    promoCodeStatus: 'showResult',
    eligibleItemGuids: Array.from(new Set([...(promotion.eligibleItemGuids || []), ...mat.twinGuids])),
  };
  else storedPromo = promotion;
  return {
    cartStateVersion: 5,
    stateProperty: 'test value',
    itemsInCart: items,
    cartTotal: round2(subTotal - discount),
    cartSubTotal: subTotal,
    shippingPrice: 0,
    popupType: '',
    cartTotalQty: totalQty,
    promotion: storedPromo,
    shippingEstimate: null,
    requestInProgress: false,
    // The site clears the input banner once the promo is resolved into lines.
    showPromoBanner: freeQty ? '' : (hasPromo ? promotion.promo : ''),
    vipSignup: false,
    proposalID,
    vipSignupPrice: 16.95,
    // Admin/CRM proposal saves carry adminOverride (matches the verified body);
    // off by default so the storefront-shaped saveCart stays byte-identical.
    ...(adminOverride ? { adminOverride: true } : {}),
  };
}

/* The combined `cartData` blob the app actually saves: the cart slice spread
   at the top level, PLUS a nested `shoppingCart` copy, the `asCartContents`
   mirror, and `updated:true`. (Verified against the real saveCart payload.) */
export function buildSaveCartData(itemsInCart, { proposalID = null, promotion = null, adminOverride = false } = {}) {
  const cart = buildCartData(itemsInCart, { proposalID, promotion, adminOverride });
  return { ...cart, shoppingCart: cart, asCartContents: buildAsCartContents(itemsInCart), updated: true };
}

/* The PUT /user/saveCart request body. CRITICAL: `cartData` must be a JSON
   STRING — the backend (Proposal.asmx/SaveCart) 500s if it's a nested object.
   Guest IDs by default. */
export function buildSaveCartBody(itemsInCart, { customerID = 0, salesRepID = 0, proposalID = null } = {}) {
  return {
    cartData: JSON.stringify(buildSaveCartData(itemsInCart, { proposalID })),
    customerID,
    salesRepID,
  };
}

/* The PUT /user/saveProposal request body — saves a cart AND links it to a CRM
   opportunity (the proposal then shows under that opportunity's
   MetaData.Proposals[]). Built on the verified saveCart shape (`cartData` MUST be
   a JSON string) plus the proposal metadata the cart page sends in proposal mode.
   NOTE: the exact wrapper field names are reverse-engineered (the real 205KB body
   was dropped from the capture) — verify live and adjust here if the backend 500s. */
export function buildSaveProposalBody(itemsInCart, {
  opportunityID, proposalName, proposalExpiration,
  customerID = 0, salesRepID = 0, proposalID = null, promotion = null,
} = {}) {
  return {
    cartData: JSON.stringify(buildSaveCartData(itemsInCart, { proposalID, promotion, adminOverride: true })),
    customerID,
    salesRepID,
    opportunityID,
    proposalName,
    proposalExpiration,
    proposalID,
  };
}

/* Parse a GET /user/getCart/<n> response → cartData (the `d` field is a JSON
   string OR an object, per the bundle: typeof d === 'string' ? JSON.parse : d). */
export function parseGetCart(resp) {
  const d = resp && resp.d !== undefined ? resp.d : resp;
  return typeof d === 'string' ? JSON.parse(d) : d;
}

/* ── analytics mirror (optional — drives abandoned-cart emails only) ───────── */

const STATIC = 'https://static.golfballs.com/C/300x300/';
const SITE = 'https://www.golfballs.com';

export function buildAsCartContents(itemsInCart) {
  return {
    contents: itemsInCart.map((l) => ({
      product_name: l.productTitle,
      image: STATIC + (((l.images || [])[0] || {}).URL || ''),
      quantity: 1,
      sku: `${SITE}/product${l.url}?itemGUID=${l.itemGuid}`,
    })),
    timestamp: Date.now(),
  };
}
