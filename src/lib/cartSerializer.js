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
function selectCustomLogoOptions(pm, { secondPole = 'No Print', priceTier = 'Default' } = {}) {
  if (!pm) return pm;
  const clone = JSON.parse(JSON.stringify(pm));
  const groups = (clone.Modification && clone.Modification.ModificationOption) || [];
  const choose = (groupName, match) => {
    const g = groups.find((o) => o.Name === groupName);
    if (!g || !Array.isArray(g.ModificationOptionValue)) return;
    let hit = false;
    g.ModificationOptionValue.forEach((v) => { v.selected = match(v); if (v.selected) hit = true; });
    if (!hit && g.ModificationOptionValue[0]) g.ModificationOptionValue[0].selected = true; // default = first
  };
  choose('Service Level', () => false);                  // → first (default standard production)
  choose('Second Pole', (v) => v.Name === secondPole);   // No Print / Logo / Text
  choose('PriceTier', (v) => v.Name === priceTier);      // Econ / Rec / High / Tour / Mid
  choose('Express Logo', (v) => v.Name === 'Yes');
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
   Returns { block, customUserImage }. block === null means no decoration. */
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
    // Mark the SKU's price tier + the chosen second-pole option as selected so
    // the order bills the right custom-logo charge (and stays commissionable).
    const tier = (product.CustomData && String(product.CustomData.customPriceTier || '').trim()) || 'Default';
    const secondPole = decoration.pole2 ? (decoration.pole2.kind === 'logo' ? 'Logo' : 'Text') : 'No Print';
    const customLogoMod = selectCustomLogoOptions(findMod(product, { modID: 1008, friendly: 'Custom Logo' }), { secondPole, priceTier: tier });
    out = {
      block: {
        ProductModification: customLogoMod,
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
      // The uploaded logo is referenced via filePath/cropFilePath; the real site
      // also stores a fabric.js crop object in userImage we can't reproduce.
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

  applySecondPole(out.block, decoration); // opposite-pole imprint (dual pole)
  return out;
}

/* Assemble one itemsInCart line from the product page object
   (__NEXT_DATA__.props.pageProps.product), the catalog pricing ladder, the
   buyer's property selection, the decoration descriptor, and quantity. Works
   for every item type — the decoration engine is chosen by buildDecoration().
   Pricing comes from the catalog (`pricing.breaks` = [{q,p}], `pricing.price`);
   the page carries only the parent fee header. itemGuid is generated if omitted. */
export function assembleLine({ product, pricing = {}, selection = {}, decoration, qty = 1, itemGuid, url } = {}) {
  const children = product.ProductChild || [];
  // Pick the child the buyer actually selected. Prefer matching by option values
  // ({ "Tee Count": "100", Color: "White" } — what the modal captures), then by
  // explicit propertyValueIDs, then fall back to the first child.
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
  child = child || children[0] || {};
  const selectedIds = (child.PropertyValueProduct || []).map((pv) => pv.propertyValueProductID);
  const breaks = (pricing.breaks && pricing.breaks.length) ? pricing.breaks : [{ q: 1, p: pricing.price || 0 }];
  const unit = pricing.price != null ? pricing.price : (breaks[0] && breaks[0].p) || 0;
  // Towel/hat embroidery needs the chosen child's background color for the BC
  // overlay — fold it in so buildDecoration can reach it.
  const childBg = child && child.CustomData && child.CustomData.backgroundHex;
  const decoForBuild = childBg ? { ...(decoration || { engine: 'none' }), _childBgHex: childBg } : (decoration || { engine: 'none' });
  const { block: decoBlock, customUserImage } = buildDecoration(product, decoForBuild);

  // Resolve the cart name the way the site does: substitute the decoration's
  // FriendlyName into NameFormat's "{Decoration}" slot (→ "… Custom Logo …";
  // plain orders collapse the slot to nothing → "… Golf Balls").
  const decoFriendly = (decoBlock && decoBlock.ProductModification && decoBlock.ProductModification.Modification
    && decoBlock.ProductModification.Modification.FriendlyName) || '';
  const nameFmt = product.NameFormat || product.Name || '';
  const baseName = nameFmt.includes('{Decoration}')
    ? nameFmt.replace('{Decoration}', decoFriendly).replace(/\s{2,}/g, ' ').trim()
    : (product.Name || '');

  return {
    nameFormat: product.NameFormat || product.Name || '',
    productTitle: [product.Brand && product.Brand.Name, baseName].filter(Boolean).join(' ').trim(),
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
    // Commissionable "_1" path for imprinted lines comes in via `url`; the page's
    // canonical (base) URL is the fallback for plain/retail lines.
    url: url || canonicalUrl(product),
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
