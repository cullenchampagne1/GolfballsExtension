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
const hasPoleText = (p) => !!(p && Array.isArray(p.lines) && p.lines.some((l) => l != null && String(l).trim() !== ''));

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
      secondPoleUserText: hasPoleText(decoration.pole2) ? decoration.pole2 : {},
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

const emptyPole = () => ({ fileName: '', filePath: '', userImage: null, fileSupported: false });
const logoPole = (logo) => ({
  fileName: (logo && logo.fileName) || '',
  filePath: (logo && logo.filePath) || '',
  userImage: null,
  fileSupported: !!(logo && logo.filePath),
});
const canonicalUrl = (product) => {
  const u = product.ProductUrl;
  if (Array.isArray(u)) return (u.find((x) => !x.productChildID) || u[0] || {}).URL || '';
  return product.url || product.URL || '';
};

/* Find the product's ProductModification matching a target modID / FriendlyName
   (the decoration the buyer picked). Falls back to the first modification. */
function findMod(product, { modID, friendly } = {}) {
  const mods = product.ProductModification || [];
  return mods.find((m) => m.Modification && (
    (modID != null && m.Modification.modificationID === modID)
    || (friendly && (m.Modification.FriendlyName === friendly || m.Modification.Name === friendly))
  )) || null;
}

/* ── decoration dispatcher ─────────────────────────────────────────────────────
   Build the modificationHistory[] entry + line-level customUserImage from an
   engine-agnostic decoration descriptor (what CustomizeBlock emits). Engines:
     none        → plain product, no decoration
     ballText    → modID 5  Personalized (text ± second pole)
     ballLogo    → modID 1008 custom logo on the ball (uploaded logo)
     monogram    → modID 6  Monogram
     logoOverlay → modID 84 inhouse / 25 outsource (uploaded logo overlay)
   Returns { block, customUserImage }. block === null means no decoration. */
export function buildDecoration(product, decoration = {}) {
  const engine = decoration.engine || 'none';
  const noImage = { firstPole: emptyPole(), secondPole: emptyPole() };

  if (engine === 'ballText') {
    return { block: buildBallDecorationBlock(product, { ...decoration, decorationType: 'Personalized' }), customUserImage: noImage };
  }
  if (engine === 'monogram') {
    return {
      block: {
        ProductModification: findMod(product, { modID: 6, friendly: 'Monogram' }),
        interfaceState: {},
        dynamicImage: [buildMonogramDynamicImage(decoration.monogram || decoration)],
        isTemporary: false,
      },
      customUserImage: noImage,
    };
  }
  if (engine === 'ballLogo') {
    const logo = decoration.logo || null;
    return {
      block: {
        ProductModification: findMod(product, { modID: 1008, friendly: 'Custom Logo' }),
        interfaceState: {
          GolfBallCustomLogo: {
            customLogo: {
              useCustomLogo: true,
              filePath: (logo && logo.filePath) || '',
              fileName: (logo && logo.fileName) || '',
              cropFilePath: (logo && logo.cropFilePath) || '',
            },
            expressLogo: { isUsed: false },
          },
          DoubleDigit: {},
        },
        dynamicImage: [buildBallLogoDynamicImage({ baseColor: decoration.baseColor })],
        isTemporary: false,
      },
      // The uploaded logo is referenced via filePath/cropFilePath; the real
      // site also stores a fabric.js crop object in userImage (in-browser
      // cropper render state) which we can't reproduce headlessly.
      customUserImage: { firstPole: logoPole(logo), secondPole: emptyPole() },
    };
  }
  if (engine === 'logoOverlay') {
    // Inhouse (84) vs outsource (25) is a property of the product — auto-detect
    // from its modifications when the descriptor doesn't say (it usually won't).
    const mods = product.ProductModification || [];
    const hasMod = (id) => mods.some((m) => m.Modification && m.Modification.modificationID === id);
    const outsource = decoration.outsource != null ? !!decoration.outsource : (hasMod(25) && !hasMod(84));
    const logo = decoration.logo || null;
    return {
      block: {
        ProductModification: findMod(product, { modID: outsource ? 25 : 84, friendly: 'Custom Logo' }),
        interfaceState: null,
        dynamicImage: [buildLogoOverlayDynamicImage({ outsource, logo })],
        isTemporary: false,
      },
      customUserImage: { firstPole: logoPole(logo), secondPole: emptyPole() },
    };
  }
  return { block: null, customUserImage: noImage }; // engine === 'none'
}

/* Assemble one itemsInCart line from the product page object
   (__NEXT_DATA__.props.pageProps.product), the catalog pricing ladder, the
   buyer's property selection, the decoration descriptor, and quantity. Works
   for every item type — the decoration engine is chosen by buildDecoration().
   Pricing comes from the catalog (`pricing.breaks` = [{q,p}], `pricing.price`);
   the page carries only the parent fee header. itemGuid is generated if omitted. */
export function assembleLine({ product, pricing = {}, selection = {}, decoration, qty = 1, itemGuid } = {}) {
  const children = product.ProductChild || [];
  const wantIds = new Set(selection.propertyValueIDs || []);
  const child = children.find((c) =>
    (c.PropertyValueProduct || []).some((pv) => wantIds.has(pv.propertyValueProductID)))
    || children[0] || {};
  const selectedIds = (child.PropertyValueProduct || []).map((pv) => pv.propertyValueProductID);
  const breaks = (pricing.breaks && pricing.breaks.length) ? pricing.breaks : [{ q: 1, p: pricing.price || 0 }];
  const unit = pricing.price != null ? pricing.price : (breaks[0] && breaks[0].p) || 0;
  const { block: decoBlock, customUserImage } = buildDecoration(product, decoration || { engine: 'none' });

  return {
    nameFormat: product.NameFormat || product.Name || '',
    productTitle: [product.Brand && product.Brand.Name, product.Name].filter(Boolean).join(' ').trim(),
    qtyFields: [],
    ShortCode: product.ShortCode,
    brand: (product.Brand && product.Brand.Name) || '',
    totalQty: qty,
    childList: [child],
    ModificationGroupDetail: product.ModificationGroupDetail || null,
    ItemPriceBreak: { priceBreakHeaderID: 0, PriceBreak: breaks.map((b) => ({ Quantity: b.q, Price: b.p, Cost: 0 })), ProductionTime: 0, minimumQty: 1 },
    SetupPriceBreak: { priceBreakHeaderID: 0, PriceBreak: [{ Quantity: 1, Price: 0, Cost: 0 }], ProductionTime: 0 },
    ItemPrice: unit,
    SetupPrice: 0,
    originalPrice_priceBreakHeader: null,
    originalPrice_priceBreakHeaderID: 0,
    disableGiftWrap: false,
    ignoreMinimumQty: false,
    OriginalPriceLabel: '',
    ProductParentSetupFee: product.setupFee_priceBreakHeader || null,
    ProductParentItemFee: product.itemFee_priceBreakHeader || null,
    SelectedItemPriceBreakQty: qty,
    childFilters: [null],
    widgetSelections: selectedIds.map((v) => ({ values: [v] })),
    widgetApplicationOrder: [],
    modificationHistory: decoBlock ? [decoBlock] : [],
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
    bundle: null,
    hasQtyParam: false,
    itemType: (product.ItemType && product.ItemType.Name) || (product.itemType_s || '').split('-').pop() || 'Golf Balls',
    images: product.ProductImage || product.images || [],
    itemGuid: itemGuid || (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    url: canonicalUrl(product),
    OrderQtyMultiple: null,
    dropship: { active: false, dropshipTime: 0, dropshipDate: '' },
  };
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
