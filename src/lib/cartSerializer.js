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

const ICU = 'https://master.api.icustomize.com/user';
export const SAVE_CART_URL = `${ICU}/saveCart`;
export const getCartUrl = (cartNumber) => `${ICU}/getCart/${encodeURIComponent(cartNumber)}`;

const enc = encodeURIComponent;
const upper = (s) => (s == null ? null : String(s).toUpperCase());

/* ── Engine A — modern golf ball ──────────────────────────────────────────── */

/* The cart thumbnail URL. Verified byte-exact against real captures
   (Pro V1 empty + Triple Track text+Print2). The nested userText JSON is
   double-encoded; empty lines are dropped FROM THE URL (but kept in the
   stored Print.userText object). */
export function ballPreviewUrl({ bc = '#FFFFFF', finish = {}, print, print2 }) {
  const top = { BC: bc, ...finish };
  const printVal = (p) => {
    const lines = (p.lines || []).map(upper).filter((l) => l != null && l !== '');
    const userText = [{ lines, font: p.font, color: p.color }];
    return `${p.decorationType}?userText=${enc(JSON.stringify(userText))}`
         + `&configOverrides=${enc(JSON.stringify(p.configOverrides || {}))}`;
  };
  const parts = [
    `configOverrides=${enc(JSON.stringify(top))}`,
    'view=',
    `Print=${enc(printVal(print))}`,
  ];
  if (print2) parts.push(`Print2=${enc(printVal(print2))}`);
  return `https://www.icustomize.com/Item/GolfBall/r?${parts.join('&')}`;
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
  if (pole2) img.Print2 = slot(pole2);
  img.renderedPreviewImage = ballPreviewUrl({
    bc: baseColor, finish,
    print:  { decorationType, lines: pole1.lines, font: pole1.font, color: pole1.color, configOverrides: finish },
    print2: pole2 ? { decorationType, lines: pole2.lines, font: pole2.font, color: pole2.color, configOverrides: finish } : null,
  });
  return img;
}

/* ── cart wrapper + totals ────────────────────────────────────────────────── */

const round2 = (n) => Math.round(n * 100) / 100;

/* Line total = per-unit price × units + one-time setup (decoration fees are
   already baked into ItemPrice, e.g. poker-chip dual pole 1.99+0.50=2.49). */
export function lineTotal(line) {
  return round2((line.ItemPrice || 0) * (line.totalQty || 0) + (line.SetupPrice || 0));
}

/* Assemble the cartData object (the localStorage.shoppingCart shape) from an
   array of fully-built itemsInCart lines. Totals reconcile with real captures. */
export function buildCartData(itemsInCart, { proposalID = null } = {}) {
  const subTotal = round2(itemsInCart.reduce((s, l) => s + lineTotal(l), 0));
  const totalQty = itemsInCart.reduce((s, l) => s + (l.totalQty || 0), 0);
  return {
    cartStateVersion: 5,
    stateProperty: 'test value',
    itemsInCart,
    cartTotal: subTotal,
    cartSubTotal: subTotal,
    shippingPrice: 0,
    popupType: '',
    cartTotalQty: totalQty,
    promotion: { type: 'PromotionEmpty' },
    shippingEstimate: null,
    requestInProgress: false,
    showPromoBanner: '',
    vipSignup: false,
    proposalID,
    vipSignupPrice: 16.95,
  };
}

/* The combined `cartData` blob the app actually saves: the cart slice spread
   at the top level, PLUS a nested `shoppingCart` copy, the `asCartContents`
   mirror, and `updated:true`. (Verified against the real saveCart payload.) */
export function buildSaveCartData(itemsInCart, { proposalID = null } = {}) {
  const cart = buildCartData(itemsInCart, { proposalID });
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
