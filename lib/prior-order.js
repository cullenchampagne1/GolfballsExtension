/* prior-order — safe parser for CRM "Duplicate Order" checkouts.
 *
 * The legacy CheckoutObject response contains the entire historical checkout,
 * including billing, shipping, authorization, and payment state.  None of that
 * belongs in a content script.  This classic-script module is loaded by the
 * service worker and projects the response immediately into the small cart-line
 * shape the proposal engine needs.  It intentionally has no network access.
 */
(function installPriorOrder(root) {
  'use strict';

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const text = (value, max = 2_000) => String(value == null ? '' : value).slice(0, max);
  const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  function decodeXml(value) {
    return String(value || '')
      .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_m, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&');
  }

  function stripTags(value) {
    return decodeXml(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  }

  function checkoutIdFromHref(href) {
    let parsed;
    try { parsed = new URL(decodeXml(href), 'https://www.golfballs.com'); } catch { return ''; }
    if (!/^(?:www\.)?golfballs\.com$/i.test(parsed.hostname) || !/^\/cart\/?$/i.test(parsed.pathname)) return '';
    const id = String(parsed.searchParams.get('checkoutid') || '').trim();
    return UUID_RE.test(id) ? id.toLowerCase() : '';
  }

  function findDuplicateCheckoutId(html) {
    const source = String(html || '');
    const links = source.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi);
    for (const match of links) {
      const id = checkoutIdFromHref(match[2]);
      if (!id) continue;
      if (/duplicate\s+order/i.test(stripTags(match[3]))) return id;
    }
    return '';
  }

  function scalarMap(value, allowed) {
    const source = value && typeof value === 'object' ? value : {};
    const out = {};
    for (const key of allowed) {
      const item = source[key];
      if (typeof item === 'string') out[key] = text(item, 500);
      else if (typeof item === 'number' && Number.isFinite(item)) out[key] = item;
      else if (typeof item === 'boolean') out[key] = item;
    }
    return out;
  }

  function sanitizeUserText(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      lines: (Array.isArray(source.lines) ? source.lines : []).slice(0, 8).map((line) => text(line, 1_000)),
      font: text(source.font, 160),
      color: text(source.color, 64),
    };
  }

  function sanitizeLogo(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      fileName: text(source.fileName, 300),
      filePath: text(source.filePath, 2_000),
      cropFilePath: text(source.cropFilePath, 2_000),
      useCustomLogo: source.useCustomLogo === true,
    };
  }

  function sanitizePrint(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      configOverrides: scalarMap(source.configOverrides, ['BC', 'Color1', 'Color2', 'MFS', 'SecondMFS']),
      userText: (Array.isArray(source.userText) ? source.userText : []).slice(0, 4).map(sanitizeUserText),
      userOverlay: (Array.isArray(source.userOverlay) ? source.userOverlay : []).slice(0, 4).map(sanitizeLogo),
      versionProperties: scalarMap(source.versionProperties, ['decorationType', 'versionNumber']),
      view: text(source.view, 80),
    };
  }

  function sanitizeDynamicImage(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      sku: text(source.sku, 160),
      imageType: text(source.imageType, 160),
      condition: text(source.condition, 160),
      view: text(source.view, 80),
      configOverrides: scalarMap(source.configOverrides, ['BC', 'Color1', 'Color2', 'MFS', 'SecondMFS']),
      Print: sanitizePrint(source.Print),
      Print2: sanitizePrint(source.Print2),
      metaData: scalarMap(source.metaData, ['text', 'view', 'color', 'color2', 'overlay']),
    };
  }

  function sanitizeTowelState(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      userText: (Array.isArray(source.userText) ? source.userText : []).slice(0, 4).map(sanitizeUserText),
      dynamicImage: (Array.isArray(source.dynamicImage) ? source.dynamicImage : []).slice(0, 4).map(sanitizeDynamicImage),
    };
  }

  function sanitizeInterfaceState(value) {
    const source = value && typeof value === 'object' ? value : {};
    const out = {};
    if (source.GolfBallCustomLogo && typeof source.GolfBallCustomLogo === 'object') {
      const golfBall = source.GolfBallCustomLogo;
      out.GolfBallCustomLogo = {
        customLogo: sanitizeLogo(golfBall.customLogo),
        customLogoSecondPole: sanitizeLogo(golfBall.customLogoSecondPole),
        textSecondPole: scalarMap(golfBall.textSecondPole, ['useCustomLogo']),
      };
    }
    if (source.firstPoleUserText) out.firstPoleUserText = sanitizeUserText(source.firstPoleUserText);
    if (source.GolfTowelPersonalized) out.GolfTowelPersonalized = sanitizeTowelState(source.GolfTowelPersonalized);
    if (source.GolfTowelMonogram) out.GolfTowelMonogram = sanitizeTowelState(source.GolfTowelMonogram);
    return out;
  }

  function sanitizeModification(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      interfaceState: sanitizeInterfaceState(source.interfaceState),
      dynamicImage: (Array.isArray(source.dynamicImage) ? source.dynamicImage : []).slice(0, 6).map(sanitizeDynamicImage),
    };
  }

  function sanitizeChild(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      ShortCode: text(source.ShortCode, 160),
      Name: text(source.Name, 500),
      AvailableForSale: source.AvailableForSale !== false,
      productChildID: number(source.productChildID),
      PropertyValueProduct: (Array.isArray(source.PropertyValueProduct) ? source.PropertyValueProduct : [])
        .slice(0, 30)
        .map((property) => ({
          Value: text(property && property.Value, 500),
          propertyProductID: number(property && property.propertyProductID),
          propertyValueProductID: number(property && property.propertyValueProductID),
        })),
    };
  }

  function sanitizeCartItem(value, index) {
    const source = value && typeof value === 'object' ? value : {};
    const priceBreak = source.ItemPriceBreak && typeof source.ItemPriceBreak === 'object'
      ? source.ItemPriceBreak : {};
    const customData = source.CustomData && typeof source.CustomData === 'object'
      ? source.CustomData : {};
    const customImage = source.customUserImage && typeof source.customUserImage === 'object'
      ? source.customUserImage : {};
    return {
      itemGuid: text(source.itemGuid || `prior-${index}`, 180),
      ShortCode: text(source.ShortCode, 160),
      productTitle: text(source.productTitle, 1_000),
      nameFormat: text(source.nameFormat, 1_000),
      brand: text(source.brand, 300),
      itemType: text(source.itemType, 300),
      url: text(source.url, 2_000),
      totalQty: number(source.totalQty),
      ItemPrice: number(source.ItemPrice),
      CustomData: { parentSku: text(customData.parentSku, 160) },
      ItemPriceBreak: {
        PriceBreak: (Array.isArray(priceBreak.PriceBreak) ? priceBreak.PriceBreak : []).slice(0, 40).map((entry) => ({
          Quantity: number(entry && entry.Quantity),
          Price: number(entry && entry.Price),
        })),
      },
      images: (Array.isArray(source.images) ? source.images : []).slice(0, 8).map((image) => ({
        URL: text(image && image.URL, 2_000),
      })),
      childList: (Array.isArray(source.childList) ? source.childList : []).slice(0, 20).map(sanitizeChild),
      modification: sanitizeModification(source.modification),
      customUserImage: {
        firstPole: sanitizeLogo(customImage.firstPole),
        secondPole: sanitizeLogo(customImage.secondPole),
      },
    };
  }

  function parseCheckoutEnvelope(xml) {
    const source = String(xml || '').replace(/^\uFEFF/, '').trim();
    const match = /<string\b[^>]*>([\s\S]*?)<\/string>/i.exec(source);
    const payload = decodeXml(match ? match[1] : source);
    let parsed;
    try { parsed = JSON.parse(payload); } catch { throw new Error('Duplicate-order checkout returned invalid data'); }
    const cart = parsed && parsed.shoppingCart && typeof parsed.shoppingCart === 'object'
      ? parsed.shoppingCart : parsed;
    const items = cart && Array.isArray(cart.itemsInCart) ? cart.itemsInCart : [];
    if (!items.length) throw new Error('Duplicate order has no cart items');
    return {
      orderDate: text((cart && cart.orderDate) || (parsed && parsed.orderDate), 80),
      itemsInCart: items.slice(0, 100).map(sanitizeCartItem),
    };
  }

  root.GBPriorOrder = Object.freeze({
    checkoutIdFromHref,
    findDuplicateCheckoutId,
    parseCheckoutEnvelope,
    sanitizeCartItem,
  });
}(globalThis));
