import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadPriorOrderEntries,
  orderIdOf,
  PRIOR_ORDER_NO_DUPLICATE_CART,
  refreshPriorOrderCart,
  replacementScore,
} from '../../src/lib/priorOrderEngine.js';
import { normalizeCatalogDocs } from '../../src/lib/giftCatalog.js';

function cartItem(overrides = {}) {
  return {
    itemGuid: 'old-line',
    ShortCode: 'P-OLD',
    productTitle: 'TaylorMade TP5 Custom Logo Golf Balls 2024 Model',
    brand: 'TaylorMade',
    itemType: 'Golf Balls',
    url: '/Golf-Balls/TaylorMade-TP5-Custom-Logo-Golf-Balls-2024-Model.htm',
    totalQty: 12,
    ItemPrice: 51,
    ItemPriceBreak: { PriceBreak: [{ Quantity: 1, Price: 59 }, { Quantity: 12, Price: 51 }] },
    CustomData: { parentSku: 'TM-TP5-OLD' },
    images: [{ URL: 'old.jpg' }],
    childList: [{ PropertyValueProduct: [{ propertyValueProductID: 44 }] }],
    modification: { interfaceState: { GolfBallCustomLogo: { customLogo: { fileName: 'logo.png', filePath: 'Source/logo.png' } } }, dynamicImage: [] },
    customUserImage: { firstPole: { fileName: 'logo.png', filePath: 'Source/logo.png' } },
    ...overrides,
  };
}

function product(overrides = {}) {
  return {
    id: 'current-tp5-logo',
    sourceId: 'current-tp5',
    parentCode: 'P-CURRENT',
    sku: 'TM-TP5-2026',
    title: 'TaylorMade TP5 Custom Logo Golf Balls 2026 Model',
    brand: 'TaylorMade',
    customLogo: true,
    dept: 'Golf Balls',
    cat: 'Logo Golf Balls',
    itemType: 'Golf Balls',
    url: 'https://www.golfballs.com/Golf-Balls/TaylorMade-TP5-Custom-Logo-Golf-Balls-2026-Model.htm',
    urlPath: '/Golf-Balls/TaylorMade-TP5-Custom-Logo-Golf-Balls-2026-Model.htm',
    price: 57.99,
    breaks: [{ q: 1, p: 58 }, { q: 12, p: 48 }],
    tags: [],
    ...overrides,
  };
}

describe('prior order engine · order identity', () => {
  it('uses the CRM orderID query parameter rather than the visible order label', () => {
    assert.equal(orderIdOf({ number: 'GB-100', href: 'https://api.golfballs.com/default.aspx?page=ViewOrder&orderID=9182' }), '9182');
  });

  it('omits orders without a Duplicate Order cart but retains real load failures', async () => {
    const orders = [
      { orderId: '101', number: 'GB-101' },
      { orderId: '102', number: 'GB-102' },
      { orderId: '103', number: 'GB-103' },
    ];
    const progress = [];
    const entries = await loadPriorOrderEntries(orders, {
      catalog: [],
      concurrency: 1,
      onProgress: (completed, total) => progress.push([completed, total]),
      loadEntry: async (order) => {
        if (order.orderId === '101') {
          const error = new Error('This order does not expose a Duplicate Order cart');
          error.code = PRIOR_ORDER_NO_DUPLICATE_CART;
          throw error;
        }
        if (order.orderId === '102') throw new Error('Order page returned HTTP 401');
        return { id: 'order-103', orderId: '103', name: 'Order GB-103', lines: [{}] };
      },
    });

    assert.deepEqual(entries.map((entry) => entry.orderId), ['102', '103']);
    assert.equal(entries[0].loadError, 'Order page returned HTTP 401');
    assert.equal(entries[1].loadError, undefined);
    assert.deepEqual(progress.at(-1), [3, 3]);
  });
});

describe('prior order engine · current generation and pricing', () => {
  it('moves a prior-generation TP5 custom-logo line to TP5—not the stock or TP5x variant—and reprices it', () => {
    const oldCatalog = product({
      id: 'old', sourceId: 'P-OLD', parentCode: 'P-OLD', sku: 'TM-TP5-OLD',
      title: 'TaylorMade TP5 Custom Logo Golf Balls 2024 Model', tags: ['PriorGen'],
    });
    const stock = product({ id: 'stock', customLogo: false, title: 'TaylorMade TP5 Golf Balls 2026 Model' });
    const tp5x = product({ id: 'tp5x', title: 'TaylorMade TP5x Custom Logo Golf Balls 2026 Model' });
    const current = product();
    const result = refreshPriorOrderCart({ itemsInCart: [cartItem()] }, [oldCatalog, stock, tp5x, current]);

    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0].product.id, 'current-tp5-logo');
    assert.equal(result.lines[0].splits[0].price, 48);
    assert.equal(result.lines[0].variant, null, 'variant ids do not cross parent generations');
    assert.equal(result.lines[0].refresh.status, 'replaced');
    assert.equal(result.counts.replaced, 1);
    assert.equal(replacementScore(result.lines[0].product, tp5x), -Infinity);
  });

  it('keeps an exact current product, updates its price, and preserves its selected variant ids', () => {
    const exact = product({
      id: 'exact', sourceId: 'P-OLD', parentCode: 'P-OLD', sku: 'TM-TP5-OLD',
      title: 'TaylorMade TP5 Custom Logo Golf Balls 2024 Model',
    });
    const result = refreshPriorOrderCart({ itemsInCart: [cartItem()] }, [exact]);
    assert.equal(result.lines[0].product.id, 'exact');
    assert.equal(result.lines[0].splits[0].price, 48);
    assert.deepEqual(result.lines[0].variant.propertyValueIDs, [44]);
    assert.equal(result.lines[0].refresh.status, 'repriced');
  });

  it('marks an unmatched line for review instead of inventing a replacement', () => {
    const unrelated = product({
      id: 'unrelated', title: 'TaylorMade Distance Plus Custom Logo Golf Balls 2026 Model',
    });
    const result = refreshPriorOrderCart({ itemsInCart: [cartItem()] }, [unrelated]);
    assert.equal(result.lines[0].product.parentCode, 'P-OLD');
    assert.equal(result.lines[0].unavailable, true);
    assert.equal(result.lines[0].refresh.status, 'review');
    assert.equal(result.counts.review, 1);
  });

  it('does not treat a stock-only price as a usable custom-logo price ladder', () => {
    const [incompleteLogoProduct] = normalizeCatalogDocs([{
      id: 'P-OLD',
      parentCode_s: 'P-OLD',
      title_s: 'TaylorMade TP5 Custom Logo Golf Balls 2024 Model',
      brand_s: 'TaylorMade',
      product_url_s: '/Golf-Balls/TaylorMade-TP5-Custom-Logo-Golf-Balls-2024-Model',
      price_d: 57.99,
      modificationName_ss: ['Custom Logo'],
      customData_s: JSON.stringify({ parentSku: 'TM-TP5-OLD' }),
      customLogoPriceBreak_s: '{}',
      itemType_ss: ['Consumer-Golf_Ball'],
    }]);
    const result = refreshPriorOrderCart({ itemsInCart: [cartItem()] }, [incompleteLogoProduct]);

    assert.equal(incompleteLogoProduct.breaks[0].p, 57.99, 'the card may retain its retail fallback');
    assert.equal(incompleteLogoProduct.hasCustomLogoPriceBreaks, false);
    assert.equal(result.lines[0].refresh.status, 'review');
    assert.equal(result.lines[0].unavailable, true);
  });
});
