/**
 * Unit tests — src/lib/cartSerializer.js
 *
 * Pure payload/URL builders for the icustomize server-side cart. No I/O and
 * no DOM at import time, so the real module loads directly. Preview-URL
 * expectations are byte-exact literals hand-derived from the documented
 * encoding (the module's own captures were verified against real carts);
 * structural cases decode the URL params back out and assert the content.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SAVE_CART_URL, getCartUrl,
  ballPreviewUrl, giftSetPreviewUrl, buildGiftSetImages, buildSelectedProductImages, monogramPreviewUrl, teePreviewUrl,
  buildBallDynamicImage, buildExpressLogoDynamicImage, priceAtQ, lineTotal,
  buildDecoration, decorationFromCartItem,
  promoDiscount, freeLinesFromPromo,
  buildCartData, buildSaveCartData, buildSaveCartBody, buildSaveProposalBody, assembleLine, resolveLineName,
  parseGetCart, buildCustomItemLine, buildAsCartContents,
} from '../../src/lib/cartSerializer.js';

const CUSTOM_LOGO_PRODUCT = {
  Brand: { Name: 'Titleist' },
  ProductModification: [{
    Modification: {
      modificationID: 1008,
      FriendlyName: 'Custom Logo',
      ModificationOption: [
        { Name: 'Service Level', ModificationOptionValue: [{ Name: '6 Business Day Rush', selected: false }, { Name: 'None', selected: false }] },
        { Name: 'Second Pole', ModificationOptionValue: [{ Name: 'No Print', selected: false }, { Name: 'Logo', selected: false }, { Name: 'Text', selected: false }] },
        { Name: 'PriceTier', ModificationOptionValue: [{ Name: 'Default', selected: false }] },
        { Name: 'Express Logo', ModificationOptionValue: [{ Name: 'Yes', selected: false }, { Name: 'No', selected: false }] },
      ],
    },
  }],
};

/* Decode the Print/Print2 param of a GolfBall/r URL back to its parts:
   "<type>?userText=<enc JSON>&configOverrides=<enc JSON>". */
function decodePrintParam(url, name = 'Print') {
  const m = new RegExp(`[?&]${name}=([^&]*)`).exec(url);
  if (!m) return null;
  const inner = decodeURIComponent(m[1]);
  const [type, qs] = inner.split('?');
  const params = new URLSearchParams(qs);
  return {
    type,
    userText: JSON.parse(params.get('userText')),
    configOverrides: JSON.parse(params.get('configOverrides')),
  };
}

describe('cart endpoints', () => {
  it('SAVE_CART_URL points at the master icustomize saveCart endpoint', () => {
    assert.equal(SAVE_CART_URL, 'https://master.api.icustomize.com/user/saveCart');
  });

  it('getCartUrl appends the cart number to getCart', () => {
    assert.equal(getCartUrl('240781'), 'https://master.api.icustomize.com/user/getCart/240781');
  });

  it('getCartUrl percent-encodes unsafe cart numbers', () => {
    assert.equal(getCartUrl('123 45/6'), 'https://master.api.icustomize.com/user/getCart/123%2045%2F6');
  });
});

describe('ballPreviewUrl', () => {
  it('builds the verified double-encoded GolfBall/r URL (default white ball)', () => {
    const url = ballPreviewUrl({
      print: { decorationType: 'Personalized', lines: ['Joe', null, ''], font: 'Kabel Dm BT', color: '#FF0000', configOverrides: {} },
    });
    assert.equal(url,
      'https://www.icustomize.com/Item/GolfBall/r?configOverrides=%7B%22BC%22%3A%22%23FFFFFF%22%7D&view=&Print='
      + 'Personalized%3FuserText%3D%255B%257B%2522lines%2522%253A%255B%2522JOE%2522%255D%252C%2522font%2522%253A%2522Kabel%2520Dm%2520BT%2522%252C%2522color%2522%253A%2522%2523FF0000%2522%257D%255D%26configOverrides%3D%257B%257D');
  });

  it('uppercases lines and drops empty/null lines from the URL', () => {
    const url = ballPreviewUrl({
      print: { decorationType: 'Personalized', lines: ['go', null, ''], font: 'Block', color: '#000000' },
    });
    assert.deepEqual(decodePrintParam(url).userText, [{ lines: ['GO'], font: 'Block', color: '#000000' }]);
  });

  it('carries the base color + finish in the top-level configOverrides', () => {
    const url = ballPreviewUrl({
      bc: '#FFFF00', finish: { MFS: '372', SecondMFS: '372' },
      print: { decorationType: 'Personalized', lines: ['GO'], font: 'Block', color: '#000000' },
    });
    const top = JSON.parse(decodeURIComponent(/configOverrides=([^&]*)/.exec(url)[1]));
    assert.deepEqual(top, { BC: '#FFFF00', MFS: '372', SecondMFS: '372' });
  });

  it('adds a Print2 param only when a second pole is passed', () => {
    const print = { decorationType: 'Personalized', lines: ['GO'], font: 'Block', color: '#000000' };
    const single = ballPreviewUrl({ print });
    assert.equal(single.includes('Print2='), false);
    const dual = ballPreviewUrl({ print, print2: { decorationType: 'Personalized', lines: ['p2'], font: 'Block', color: '#0000FF' } });
    assert.deepEqual(decodePrintParam(dual, 'Print2').userText, [{ lines: ['P2'], font: 'Block', color: '#0000FF' }]);
  });
});

describe('monogramPreviewUrl', () => {
  it('builds the verified MonogramPadded render URL with comma-joined letters', () => {
    const url = monogramPreviewUrl({
      baseColor: '#FFFFFF', overlayName: 'a,b',
      printConfig: { Color1: '#000000', Color2: '#FFFFFF' }, view: 'circle2',
    });
    assert.equal(url,
      'https://www.icustomize.com/Item/GolfBall/r?configOverrides=%7B%22BC%22%3A%22%23FFFFFF%22%7D&view=&Print='
      + 'MonogramPadded%3FuserOverlay%3Da%252Cb%26configOverrides%3D%257B%2522Color1%2522%253A%2522%2523000000%2522%252C%2522Color2%2522%253A%2522%2523FFFFFF%2522%257D%26view%3Dcircle2');
  });
});

describe('teePreviewUrl', () => {
  it('builds the legacy Render.aspx tee URL with case preserved (not uppercased)', () => {
    const url = teePreviewUrl({ text: 'Go Navy', font: 'Kabel Dm BT', color: '#003366' });
    assert.equal(url,
      'https://www.icustomize.com/Render.aspx?sku=tee&overlay=&useroverlay='
      + '&usertext=%5B%7B%22lines%22%3A%5B%22Go%20Navy%22%5D%2C%22font%22%3A%22Kabel%20Dm%20BT%22%2C%22color%22%3A%22%23003366%22%7D%5D'
      + '&configoverrides=%7B%22BG%22%3A%22%22%7D&clientID=GBC');
  });
});

describe('giftSetPreviewUrl', () => {
  const sleeveSet = { wrapperImage: 'https://www.icustomize.com/Item/GiftSet/SleeveLever/r?', thumbnail: 'sleeve-thumb.png' };

  it('keeps the static thumbnail for non-sleeve (box/wooden) sets', () => {
    const boxSet = { wrapperImage: 'https://www.icustomize.com/Item/GiftSet/SixBallBox/r?', thumbnail: 'box-thumb.png' };
    assert.equal(giftSetPreviewUrl(boxSet, { decoration: {} }), 'box-thumb.png');
  });

  it('returns the thumbnail (or empty) when there is no wrapper', () => {
    assert.equal(giftSetPreviewUrl({ wrapperImage: '', thumbnail: 't.png' }, {}), 't.png');
    assert.equal(giftSetPreviewUrl(null, {}), '');
  });

  it('renders a sleeve set live with the ball text in both Print and BallPrint plus a brand sleeve', () => {
    const url = giftSetPreviewUrl(sleeveSet, {
      decoration: { engine: 'ballText', pole1: { lines: ['ACME', null, null], font: 'Kabel Dm BT', color: '#000000' } },
      brand: 'Callaway Golf',
    });
    assert.ok(url.startsWith(sleeveSet.wrapperImage + 'Print='));
    assert.deepEqual(decodePrintParam(url, 'Print').userText, [{ lines: ['ACME'], font: 'Kabel Dm BT', color: '#000000' }]);
    assert.deepEqual(decodePrintParam(url, 'BallPrint').userText, [{ lines: ['ACME'], font: 'Kabel Dm BT', color: '#000000' }]);
    assert.ok(url.endsWith('&Sleeve=sleeve-overlay-callaway'), '" Golf" stripped and lowercased in the sleeve overlay');
  });

  it('prefers an explicit sleeveImage over the brand-derived overlay', () => {
    const url = giftSetPreviewUrl(sleeveSet, { decoration: {}, sleeveImage: 'sleeve-overlay-custom', brand: 'Callaway Golf' });
    assert.ok(url.endsWith('&Sleeve=sleeve-overlay-custom'));
  });

  it('renders a custom-logo ball as a blank Personalized print on the box', () => {
    const url = giftSetPreviewUrl(sleeveSet, { decoration: { engine: 'ballLogo' } });
    assert.deepEqual(decodePrintParam(url, 'Print').userText, [{ lines: [], font: 'Kabel Dm BT', color: '#000000' }]);
  });
});

describe('gift-set cart images', () => {
  it('prepends the rendered set as image zero and shifts the original product gallery', () => {
    const productImages = [
      { URL: 'assets/ball-white.webp', SortValue: 0, productImageID: 10 },
      { URL: 'assets/ball-side.webp', SortValue: 1, productImageID: 11 },
    ];
    const preview = 'https://www.icustomize.com/GiftSet/SleeveBartender/r?Print=preview';
    assert.deepEqual(buildGiftSetImages(productImages, preview), [
      {
        URL: preview,
        SortValue: 0,
        PropertyValueProduct: null,
        ProductImageConditionSpecial: null,
        productImageID: 0,
        productParentID: 0,
      },
      { URL: 'assets/ball-white.webp', SortValue: 1, productImageID: 10 },
      { URL: 'assets/ball-side.webp', SortValue: 2, productImageID: 11 },
    ]);
    assert.equal(productImages[0].SortValue, 0, 'the raw product gallery is not mutated');
  });
});

describe('selected product images', () => {
  it('moves the selected personalization image to the front of the saved gallery', () => {
    const images = [
      { URL: 'white.jpg', SortValue: 1, PropertyValueProduct: [{ propertyValueProductID: 11 }] },
      { URL: 'red.jpg', SortValue: 2, PropertyValueProduct: [{ propertyValueProductID: 22 }] },
    ];
    const selected = buildSelectedProductImages(images, {
      PropertyValueProduct: [{ propertyValueProductID: 22, Value: 'Red' }],
    });
    assert.equal(selected[0].URL, 'red.jpg');
    assert.deepEqual(selected.map((image) => image.SortValue), [1, 2]);
    assert.equal(images[0].SortValue, 1, 'the raw product gallery is not mutated');
  });
});

describe('line name formatting', () => {
  const product = {
    Name: 'Performance Polo',
    NameFormat: '{Color} {Decoration} Performance Polo',
    PropertyProduct: [{ propertyProductID: 7, Name: 'Color' }],
  };
  const whiteChild = { PropertyValueProduct: [{ propertyProductID: 7, Value: 'White' }] };

  it('replaces a Color placeholder with the selected child value', () => {
    assert.equal(resolveLineName(product, whiteChild, {}, ''), 'White Performance Polo');
  });

  it('resolves Color and Decoration together without leaving template tokens', () => {
    assert.equal(resolveLineName(product, whiteChild, {}, 'Custom Logo'), 'White Custom Logo Performance Polo');
  });

  it('appends explicit web options when NameFormat has no matching token', () => {
    assert.equal(
      resolveLineName({ Name: 'Executive Tumbler' }, {}, { values: { 'Accessories Color': 'Midnight' } }, ''),
      'Executive Tumbler — Midnight',
    );
  });

  it('stores the resolved name in the assembled cart line', () => {
    const line = assembleLine({
      product: {
        ...product,
        Brand: { Name: 'Acme' },
        ProductChild: [{ ShortCode: 'WHITE-POLO', ...whiteChild }],
      },
      selection: { values: { Color: 'White' } },
      pricing: { price: 20 },
      qty: 8,
      itemGuid: 'white-polo-line',
    });
    assert.equal(line.nameFormat, 'White Performance Polo');
    assert.equal(line.productTitle, 'Acme White Performance Polo');
    assert.equal(line.productTitle.includes('{Color}'), false);
  });
});

describe('buildBallDynamicImage', () => {
  const pole1 = { lines: ['go', 'navy', null], font: 'Block', color: '#112233' };

  it('stores the 3-slot uppercased lines with nulls preserved', () => {
    const img = buildBallDynamicImage({ baseColor: '#FFFF00', finish: { GlossType: 'Metallic' }, pole1 });
    assert.equal(img.sku, 'GolfBall');
    assert.equal(img.clientID, 'Item');
    assert.deepEqual(img.configOverrides, { BC: '#FFFF00', GlossType: 'Metallic' });
    assert.deepEqual(img.Print.userText, [{ lines: ['GO', 'NAVY', null], font: 'Block', color: '#112233' }]);
    assert.deepEqual(img.Print.versionProperties, { versionNumber: 2, decorationType: 'Personalized' });
  });

  it('adds Print2 for a text second pole only', () => {
    const p2 = { kind: 'text', lines: ['b2'], font: 'Block', color: '#000000' };
    const dual = buildBallDynamicImage({ pole1, pole2: p2 });
    assert.deepEqual(dual.Print2.userText[0].lines, ['B2']);
    const mono = buildBallDynamicImage({ pole1, pole2: { kind: 'monogram', text: 'ab' } });
    assert.equal('Print2' in mono, false, 'monogram/logo second poles are slotted centrally, not here');
    const single = buildBallDynamicImage({ pole1 });
    assert.equal('Print2' in single, false);
  });

  it('embeds a rendered preview URL consistent with the imprint', () => {
    const img = buildBallDynamicImage({ baseColor: '#FFFFFF', pole1 });
    assert.ok(img.renderedPreviewImage.startsWith('https://www.icustomize.com/Item/GolfBall/r?'));
    assert.deepEqual(decodePrintParam(img.renderedPreviewImage).userText,
      [{ lines: ['GO', 'NAVY'], font: 'Block', color: '#112233' }]);
  });
});

describe('custom-logo ball Express serialization', () => {
  const logo = {
    filePath: 'Source/CustomerUploads/CustomLogo/logo.png',
    fileName: 'logo.png',
    cropFilePath: 'UserUploads/abc/crop.jpg',
  };
  const optionValues = (block, name) => block.ProductModification.Modification.ModificationOption
    .find((option) => option.Name === name).ModificationOptionValue;

  it('writes an internally consistent standard-logo state by default', () => {
    const { block } = buildDecoration(CUSTOM_LOGO_PRODUCT, { engine: 'ballLogo', logo });
    const state = block.interfaceState.GolfBallCustomLogo;
    const options = optionValues(block, 'Express Logo');
    assert.equal(state.customLogo.useCustomLogo, true);
    assert.deepEqual(state.expressLogo, { isUsed: false });
    assert.equal(options.find((option) => option.Name === 'Yes').selected, false);
    assert.equal(options.find((option) => option.Name === 'No').selected, true);
    assert.equal(optionValues(block, 'Service Level').find((option) => option.Name === 'None').selected, true);
    assert.equal(optionValues(block, 'Service Level').find((option) => option.Name === '6 Business Day Rush').selected, false);
    assert.equal(optionValues(block, 'PriceTier').some((option) => option.selected), false);
  });

  it('matches the website active Express renderer and history snapshot shapes', () => {
    const { block, historyBlock } = buildDecoration(CUSTOM_LOGO_PRODUCT, { engine: 'ballLogo', logo, expressLogo: true });
    const state = block.interfaceState;
    const logoState = state.GolfBallCustomLogo;
    const options = optionValues(block, 'Express Logo');
    assert.deepEqual(logoState.customLogo, { useCustomLogo: false, ...logo });
    assert.deepEqual(logoState.expressLogo, {
      useCustomLogo: false,
      filePath: logo.filePath,
      fileName: logo.fileName,
      isUsed: true,
    });
    assert.deepEqual({
      useCustomLogo: state.useCustomLogo,
      filePath: state.filePath,
      fileName: state.fileName,
      cropFilePath: state.cropFilePath,
    }, { useCustomLogo: false, ...logo });
    assert.deepEqual(block.dynamicImage, [{
      imageType: 'ExpressLogo',
      legacyICustomizeParams: {
        useLegacyFormat: true,
        template: 'TitleistExpress',
        image: logo.cropFilePath,
      },
      isUsed: true,
    }]);
    assert.equal('isTemporary' in block, false);
    assert.equal(historyBlock.dynamicImage[0].sku, 'GolfBall');
    assert.deepEqual(historyBlock.interfaceState.GolfBallCustomLogo.expressLogo, { isUsed: true });
    assert.equal('cropFilePath' in historyBlock.interfaceState.GolfBallCustomLogo.customLogo, false);
    assert.equal('filePath' in historyBlock.interfaceState, false);
    assert.equal('isTemporary' in historyBlock, false);
    assert.equal(options.find((option) => option.Name === 'Yes').selected, true);
    assert.equal(options.find((option) => option.Name === 'No').selected, false);
    assert.equal(optionValues(block, 'Service Level').find((option) => option.Name === 'None').selected, true);
  });

  it('uses the generic Express template for non-Titleist brands', () => {
    assert.deepEqual(buildExpressLogoDynamicImage({ Brand: { Name: 'Callaway Golf' } }, 'UserUploads/xyz/crop.jpg'), {
      imageType: 'ExpressLogo',
      legacyICustomizeParams: {
        useLegacyFormat: true,
        template: 'LogoExpress',
        image: 'UserUploads/xyz/crop.jpg',
      },
      isUsed: true,
    });
  });

  it('assembles the reduced history snapshot separately from the active Express renderer', () => {
    const line = assembleLine({
      product: { ...CUSTOM_LOGO_PRODUCT, Name: 'Pro V1', ProductChild: [], PropertyProduct: [] },
      pricing: { price: 49.99 },
      decoration: { engine: 'ballLogo', logo, expressLogo: true },
      qty: 12,
      itemGuid: 'express-line',
    });
    assert.equal(line.modification.dynamicImage[0].imageType, 'ExpressLogo');
    assert.equal(line.modification.dynamicImage[0].legacyICustomizeParams.image, logo.cropFilePath);
    assert.equal(line.modificationHistory[0].dynamicImage[0].sku, 'GolfBall');
    assert.notDeepEqual(line.modificationHistory[0], line.modification);
  });

  it('assembles a gift-set preview as the cart line primary image', () => {
    const preview = 'https://www.icustomize.com/GiftSet/SleeveBartender/r?Print=preview';
    const giftSet = {
      name: 'Bartender Divot Tool Custom Logo Sleeve Gift Set',
      oiq: 0.25,
      wrapperImage: '',
      thumbnail: preview,
      kit: { shortCode: 'GIFTSETSLEEVEKIT2', qty: 1, ladder: [{ q: 1, p: 12 }] },
    };
    const line = assembleLine({
      product: {
        ...CUSTOM_LOGO_PRODUCT,
        Name: 'Pro V1 Golf Balls',
        NameFormat: 'Pro V1 Golf Balls',
        ProductChild: [{ ShortCode: 'BALL-WHITE', PropertyValueProduct: [] }],
        PropertyProduct: [],
        ProductImage: [{ URL: 'assets/ball-white.webp', SortValue: 0, productImageID: 10 }],
        itemFee_priceBreakHeader: { PriceBreak: [{ Quantity: 1, Price: 50 }, { Quantity: 12, Price: 45 }] },
      },
      decoration: { engine: 'ballLogo', logo, giftSet },
      qty: 1,
      itemGuid: 'gift-set-line',
    });
    assert.equal(line.bundle.renderedPreviewImage, preview);
    assert.equal(line.images[0].URL, preview);
    assert.equal(line.images[0].productImageID, 0);
    assert.equal(line.images[1].URL, 'assets/ball-white.webp');
    assert.equal(line.images[1].SortValue, 1);
  });

  it('restores the Express choice when a saved cart becomes a proposal line', () => {
    const { block, customUserImage } = buildDecoration(CUSTOM_LOGO_PRODUCT, { engine: 'ballLogo', logo, expressLogo: true });
    const restored = decorationFromCartItem({ modification: block, customUserImage });
    assert.equal(restored.expressLogo, true);
    assert.equal(restored.logo.filePath, logo.filePath);
  });
});

describe('priceAtQ', () => {
  const breaks = [{ Quantity: 1, Price: 5.99 }, { Quantity: 12, Price: 4.99 }, { Quantity: 24, Price: 3.99 }];

  it('takes the largest break at or below q', () => {
    assert.equal(priceAtQ(breaks, 1), 5.99);
    assert.equal(priceAtQ(breaks, 12), 4.99);
    assert.equal(priceAtQ(breaks, 23), 4.99);
    assert.equal(priceAtQ(breaks, 100), 3.99);
  });

  it('returns 0 below the smallest break or with no ladder', () => {
    assert.equal(priceAtQ(breaks, 0), 0);
    assert.equal(priceAtQ([], 12), 0);
    assert.equal(priceAtQ(null, 12), 0);
  });
});

describe('lineTotal', () => {
  it('is unit price × qty plus one-time setup, rounded to cents', () => {
    assert.equal(lineTotal({ ItemPrice: 2.49, totalQty: 100, SetupPrice: 39.99 }), 288.99);
  });

  it('charges no setup when absent', () => {
    assert.equal(lineTotal({ ItemPrice: 4, totalQty: 12 }), 48);
  });

  it('tolerates a bare line object', () => {
    assert.equal(lineTotal({}), 0);
  });
});

describe('promoDiscount', () => {
  it('returns 0 for no promotion', () => {
    assert.equal(promoDiscount(null), 0);
    assert.equal(promoDiscount({}), 0);
  });

  it('prefers totalPromoDiscount, then totalDiscount, then orderLevelDiscount', () => {
    assert.equal(promoDiscount({ totalPromoDiscount: 15, totalDiscount: 99 }), 15);
    assert.equal(promoDiscount({ totalDiscount: 8.5 }), 8.5);
    assert.equal(promoDiscount({ orderLevelDiscount: 4 }), 4);
  });

  it('sums order + item-level amounts for a FREE_QUANTITY promo (not the free value)', () => {
    const p = {
      promoType: 'FREE_QUANTITY', totalPromoDiscount: 999,
      orderLevelDiscount: 5, itemLevelDiscounts: [{ amount: 2 }, { discount: 3 }],
    };
    assert.equal(promoDiscount(p), 10);
  });
});

describe('freeLinesFromPromo', () => {
  const lines = [{ id: 'l1', product: { id: 'p1' }, decoration: { engine: 'ballLogo' }, splits: [{ id: 's1', qty: 12, price: 4 }] }];
  const promo = {
    promoType: 'FREE_QUANTITY',
    freeItems: [{ itemGuid: 's1-PROMO', amount: 6 }],
    itemLevelDiscounts: [{ itemGuid: 's1-PROMO', amount: 24 }],
  };

  it('clones the source line as a $0 free line at the granted quantity', () => {
    const out = freeLinesFromPromo(promo, lines);
    assert.equal(out.length, 1);
    const f = out[0];
    assert.equal(f.free, true);
    assert.equal(f.parentLineId, 'l1');
    assert.equal(f.productId, 'p1');
    assert.equal(f.product, lines[0].product);
    assert.equal(f.freeValue, 24);
    assert.deepEqual(f.splits, [{ id: 'frees-s1-PROMO', qty: 6, price: 0 }]);
  });

  it('drops the free line when its source line is gone (never re-attaches elsewhere)', () => {
    const other = [{ id: 'lX', product: { id: 'pX' }, splits: [{ id: 'sX', qty: 12, price: 4 }] }];
    assert.deepEqual(freeLinesFromPromo(promo, other), []);
  });

  it('returns [] for non-free promos', () => {
    assert.deepEqual(freeLinesFromPromo({ promoType: 'VALUE', promo: 'SAVE10' }, lines), []);
    assert.deepEqual(freeLinesFromPromo(null, lines), []);
  });
});

describe('buildCartData', () => {
  const l1 = { ItemPrice: 10, totalQty: 2, SetupPrice: 5, itemGuid: 'g1' };   // 25
  const l2 = { ItemPrice: 3, totalQty: 1, SetupPrice: 0, itemGuid: 'g2' };    // 3

  it('totals the lines into the verified cart shape', () => {
    const cart = buildCartData([l1, l2]);
    assert.equal(cart.cartStateVersion, 5);
    assert.equal(cart.cartSubTotal, 28);
    assert.equal(cart.cartTotal, 28);
    assert.equal(cart.cartTotalQty, 3);
    assert.equal(cart.proposalID, null);
    assert.equal(cart.itemsInCart.length, 2);
    assert.deepEqual(cart.promotion, { type: 'PromotionEmpty' }, 'no-coupon sentinel');
    assert.equal('adminOverride' in cart, false, 'storefront saves omit adminOverride');
  });

  it('nets a monetary promo off cartTotal and shows the code banner', () => {
    const promo = { promo: 'SAVE10', totalPromoDiscount: 10 };
    const cart = buildCartData([l1, l2], { promotion: promo });
    assert.equal(cart.cartSubTotal, 28);
    assert.equal(cart.cartTotal, 18);
    assert.equal(cart.showPromoBanner, 'SAVE10');
    assert.equal(cart.promotion, promo);
  });

  it('carries proposalID and adminOverride for CRM saves', () => {
    const cart = buildCartData([l1], { proposalID: 42, adminOverride: true });
    assert.equal(cart.proposalID, 42);
    assert.equal(cart.adminOverride, true);
  });

  it('materializes FREE_QUANTITY grants as -PROMO twin lines netted by the discount', () => {
    const paid = {
      itemGuid: 'g1', totalQty: 12, ItemPrice: 4, SetupPrice: 10,
      ItemPriceBreak: { PriceBreak: [{ Quantity: 1, Price: 5 }, { Quantity: 12, Price: 4 }] },
    };
    const promo = { promo: 'EVERY12GETS6', promoType: 'FREE_QUANTITY', freeItems: [{ itemGuid: 'g1-PROMO', amount: 6 }] };
    const cart = buildCartData([paid], { promotion: promo });

    assert.equal(cart.itemsInCart.length, 2);
    const twin = cart.itemsInCart[1];
    assert.equal(twin.itemGuid, 'g1-PROMO');
    assert.equal(twin.totalQty, 6);
    assert.equal(twin.ItemPrice, 5, 'free dozens price from the low (qty 6) break, not the paid tier');
    assert.equal(twin.SetupPrice, 0, 'imprint setup is not re-charged on the twin');

    assert.equal(cart.cartSubTotal, 88);              // 4×12+10 paid + 5×6 twin
    assert.equal(cart.cartTotal, 58);                 // twin value netted back out
    assert.equal(cart.cartTotalQty, 18);
    assert.equal(cart.promotion.type, 'PromotionValue');
    assert.equal(cart.promotion.promoCodeStatus, 'showResult');
    assert.equal(cart.promotion.totalPromoDiscount, 30);
    assert.ok(cart.promotion.eligibleItemGuids.includes('g1-PROMO'));
    assert.equal(cart.showPromoBanner, '', 'banner clears once the promo is resolved into lines');
  });
});

describe('save bodies + parseGetCart', () => {
  const line = { ItemPrice: 10, totalQty: 2, SetupPrice: 5, itemGuid: 'g1', productTitle: 'T', images: [], url: '/x' };

  it('buildSaveCartData nests a shoppingCart mirror and marks updated', () => {
    const d = buildSaveCartData([line]);
    assert.equal(d.updated, true);
    assert.equal(d.cartTotal, 25);
    assert.deepEqual(d.shoppingCart.itemsInCart, d.itemsInCart);
    assert.ok(Array.isArray(d.asCartContents.contents));
  });

  it('buildSaveCartBody stringifies cartData (the backend 500s on an object)', () => {
    const body = buildSaveCartBody([line]);
    assert.equal(typeof body.cartData, 'string');
    assert.equal(body.customerID, 0);
    assert.equal(body.salesRepID, 0);
    const parsed = JSON.parse(body.cartData);
    assert.equal(parsed.cartStateVersion, 5);
    assert.equal(parsed.cartTotal, 25);
  });

  it('buildSaveProposalBody adds the opportunity wrapper and admin override', () => {
    const body = buildSaveProposalBody([line], { opportunityID: 'opp-9', proposalName: 'Q3 balls', proposalExpiration: '2026-08-01', proposalID: 7 });
    assert.equal(body.opportunityID, 'opp-9');
    assert.equal(body.proposalName, 'Q3 balls');
    assert.equal(body.proposalID, 7);
    const parsed = JSON.parse(body.cartData);
    assert.equal(parsed.adminOverride, true);
    assert.equal(parsed.proposalID, 7);
  });

  it('parseGetCart parses a string d, passes an object d through, and accepts a bare payload', () => {
    assert.deepEqual(parseGetCart({ d: '{"cartTotal":58}' }), { cartTotal: 58 });
    const obj = { cartTotal: 58 };
    assert.equal(parseGetCart({ d: obj }), obj);
    assert.equal(parseGetCart(obj), obj);
  });
});

describe('buildCustomItemLine', () => {
  const ci = { name: 'Stainless Tumbler', price: 12.5, setup: 20, qty: 24, style: 'Matte Blue', weight: '2', itemID: 'IT-9' };

  it('builds a SERVICEITEM line from the saved fields', () => {
    const l = buildCustomItemLine({ ci });
    assert.equal(l.ShortCode, 'SERVICEITEM');
    assert.equal(l.productTitle, 'Stainless Tumbler Matte Blue');
    assert.equal(l.ItemPrice, 12.5);
    assert.equal(l.SetupPrice, 20);
    assert.equal(l.totalQty, 24);
    assert.deepEqual(l.ItemPriceBreak.PriceBreak, [{ Quantity: 24, Price: 12.5, Cost: 0 }]);
    assert.equal(l.childList[0].ShippingData.weight, 2);
    assert.equal(l.childList[0].CustomData.itemID, 'IT-9');
    assert.equal(lineTotal(l), 320);   // 12.50 × 24 + 20
  });

  it('lets explicit qty/price/style params override the stored item', () => {
    const l = buildCustomItemLine({ ci, qty: 48, price: 11, style: 'Gloss Red' });
    assert.equal(l.totalQty, 48);
    assert.equal(l.ItemPrice, 11);
    assert.equal(l.productTitle, 'Stainless Tumbler Gloss Red');
  });

  it('uses the selected personalization photo and details in the saved line', () => {
    const l = buildCustomItemLine({
      ci: {
        ...ci,
        thumbnail: 'base.jpg',
        personalizationOptions: [{ name: 'Gloss Red', image: 'red.jpg', details: 'Laser engraved' }],
      },
      style: 'Gloss Red',
    });
    assert.equal(l.productTitle, 'Stainless Tumbler Gloss Red Laser engraved');
    assert.equal(l.images[0].URL, 'red.jpg');
    const options = l.modification.ProductModification.Modification.ModificationOption;
    assert.equal(options.find((option) => option.Name === 'thumbnail').ModificationOptionValue[0].Name, 'red.jpg');
  });

  it('defaults to qty 1 and a generic name for an empty item', () => {
    const l = buildCustomItemLine({});
    assert.equal(l.totalQty, 1);
    assert.equal(l.ItemPrice, 0);
    assert.equal(l.productTitle, 'Custom item');
  });
});

describe('buildAsCartContents', () => {
  it('mirrors each line into the abandoned-cart analytics shape', () => {
    const out = buildAsCartContents([{
      productTitle: 'Titleist Pro V1 Custom Logo Golf Balls',
      images: [{ URL: 'Products/V1.jpg' }],
      url: '/titleist-pro-v1_1',
      itemGuid: 'guid-1',
    }]);
    assert.deepEqual(out.contents, [{
      product_name: 'Titleist Pro V1 Custom Logo Golf Balls',
      image: 'https://static.golfballs.com/C/300x300/Products/V1.jpg',
      quantity: 1,
      sku: 'https://www.golfballs.com/product/titleist-pro-v1_1?itemGUID=guid-1',
    }]);
    assert.equal(typeof out.timestamp, 'number');
  });
});

/* ── Hand-edited price overrides ──────────────────────────────────────────────
   assembleLine normally recomputes each line's price from the product's live fee
   ladders (so an untouched line never trips the site's "the price has changed"
   prompt). But a proposal quotes NEGOTIATED pricing: when the rep hand-edits a
   split's price the modal marks it `priceEdited`, saveProposal passes
   `pricing.override`, and that price must reach the cart verbatim. Before this,
   `computed` won unconditionally and every edited price silently reverted to
   list price on save. */
describe('assembleLine · price override', () => {
  // A product WITH a fee ladder — so the recompute path is live and would
  // otherwise overwrite the quoted price.
  const PRODUCT = {
    ShortCode: 'P0117H',
    Name: 'Z-Star Diamond 3 Golf Balls',
    NameFormat: 'Z-Star Diamond 3 Golf Balls',
    Brand: { Name: 'Srixon' },
    ProductChild: [{ ShortCode: 'C001', productChildID: 1, PropertyValueProduct: [] }],
    ProductModification: [],
    itemFee_priceBreakHeader: {
      priceBreakHeaderID: 7857,
      PriceBreak: [{ Quantity: 1, Price: 64.99, Cost: 0 }, { Quantity: 12, Price: 61.99, Cost: 0 }],
    },
  };

  it('sends the hand-edited price verbatim when override is set', () => {
    const line = assembleLine({
      product: PRODUCT,
      pricing: { price: 57.99, breaks: [{ q: 1, p: 64.99 }], override: true },
      qty: 16,
    });
    assert.equal(line.ItemPrice, 57.99, 'quoted price must survive to ItemPrice');
    assert.deepEqual(line.ItemPriceBreak.PriceBreak, [{ Quantity: 1, Price: 57.99, Cost: 0 }],
      'the ladder must be flat at the quoted price so every qty prices the same');
    assert.equal(line.totalQty, 16);
    // lineTotal reflects the quote, not list price.
    assert.equal(lineTotal(line), 57.99 * 16);
  });

  it('rounds an override to cents', () => {
    const line = assembleLine({
      product: PRODUCT, pricing: { price: 57.9949, override: true }, qty: 1,
    });
    assert.equal(line.ItemPrice, 57.99);
  });

  it('does NOT flatten the ladder when nothing was hand-edited', () => {
    // Without an override the multi-tier ladder survives (the override path is
    // what collapses it to a single quoted break) — so an untouched line still
    // carries its real qty breaks.
    const line = assembleLine({
      product: PRODUCT,
      pricing: { price: 57.99, breaks: [{ q: 1, p: 64.99 }, { q: 12, p: 61.99 }] },
      qty: 16,
    });
    assert.deepEqual(line.ItemPriceBreak.PriceBreak, [
      { Quantity: 1, Price: 64.99, Cost: 0 },
      { Quantity: 12, Price: 61.99, Cost: 0 },
    ]);
  });

  it('ignores an override with no price', () => {
    const line = assembleLine({
      product: PRODUCT, pricing: { breaks: [{ q: 1, p: 64.99 }], override: true }, qty: 1,
    });
    assert.ok(line.ItemPrice != null);
  });
});
