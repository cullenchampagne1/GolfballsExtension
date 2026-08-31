import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildCatalogProposalLines,
  createCatalogProposal,
  findCatalogProductBySku,
  proposalLineFromProduct,
} from '../../src/lib/catalogProposalEngine.js';

const giftCatalogSource = await readFile(
  new URL('../../src/modals/GiftCatalog.jsx', import.meta.url),
  'utf8',
);
const backgroundSource = await readFile(
  new URL('../../background.js', import.meta.url),
  'utf8',
);

function product(overrides = {}) {
  return {
    id: 'logo-2026',
    sourceId: 'P01155-logo',
    parentCode: 'P01155',
    sku: 'B5338',
    title: 'Titleist Pro V1 Custom Logo Golf Balls 2026 Model',
    brand: 'Titleist',
    cat: 'Logo Golf Balls',
    customLogo: true,
    hasCustomLogoPriceBreaks: true,
    price: 57.99,
    minQty: 1,
    breaks: [{ q: 1, p: 67.99 }, { q: 12, p: 62.99 }, { q: 24, p: 61.99 }],
    tags: [],
    modNames: ['Custom Logo', 'Personalized'],
    url: 'https://www.golfballs.com/Golf-Balls/Titleist-Pro-V1-Golf-Balls-2026.htm',
    urlPath: '/Golf-Balls/Titleist-Pro-V1-Golf-Balls-2026.htm',
    ...overrides,
  };
}

function ids() {
  let next = 0;
  return () => `id-${++next}`;
}

describe('catalog proposal engine · current SKU resolution', () => {
  it('is the line constructor used by the interactive Gift Catalog modal', () => {
    assert.match(giftCatalogSource, /proposalLineFromProduct\(p, \{ decoration, variant \}, \{ idFactory: rid \}\)/);
    assert.match(giftCatalogSource, /<CustomizeBlock/);
    assert.match(giftCatalogSource, /<ProductOptions/);
  });

  it('refreshes image-capable variant configs and displays the selected image in the sidebar', () => {
    assert.match(backgroundSource, /GB_CONFIG_CACHE_KEY\s*=\s*['"]gbProductConfigCache_v2['"]/);
    assert.match(giftCatalogSource, /giftImg \|\| \(variant && variant\.image\) \|\| p\.img/);
    assert.match(giftCatalogSource, /onVariantChange=\{setVariant\}/);
  });

  it('prefers a current commissionable product but can explicitly select stock', () => {
    const prior = product({ id: 'prior', title: 'Titleist Pro V1 Custom Logo Golf Balls 2025 Model', tags: ['PriorGen'] });
    const stock = product({
      id: 'stock-2026', title: 'Titleist Pro V1 Golf Balls 2026 Model', customLogo: false,
      hasCustomLogoPriceBreaks: false, price: 57.99, breaks: [], modNames: [],
    });
    const logo = product();
    assert.equal(findCatalogProductBySku([prior, stock, logo], 'B5338').id, 'logo-2026');
    assert.equal(findCatalogProductBySku([prior, stock, logo], 'B5338', { customLogo: false }).id, 'stock-2026');
  });

  it('builds the same editable line shape as Gift Catalog with ladder and override prices', () => {
    const item = product();
    const ladder = proposalLineFromProduct(item, { quantity: 24 }, { idFactory: ids() });
    assert.equal(ladder.productId, 'logo-2026');
    assert.equal(ladder.decoration.engine, 'ballLogo');
    assert.deepEqual(ladder.splits, [{ id: 'id-2', qty: 24, price: 61.99 }]);

    const override = buildCatalogProposalLines([{
      sku: 'B5338',
      splits: [{ quantity: 12 }, { quantity: 24, price: 55.5 }],
    }], [item], { idFactory: ids() })[0];
    assert.equal(override.splits[0].price, 62.99);
    assert.deepEqual(override.splits[1], { id: 'id-3', qty: 24, price: 55.5, priceEdited: true });
  });
});

describe('catalog proposal engine · action save', () => {
  it('validates a promo and saves SKU instructions through the shared opportunity writer', async () => {
    const calls = [];
    const result = await createCatalogProposal({
      opportunityId: '88',
      customerId: '42',
      name: 'August proposal',
      expiration: '9/30/2026',
      promoCode: 'SAVE10',
      items: [
        { sku: 'B5338', quantity: 12 },
        { sku: 'M6428', quantity: 24, price: 29.95 },
      ],
    }, {}, {
      catalog: [product(), product({
        id: 'accessory', sku: 'M6428', parentCode: 'P-M6428', sourceId: 'P-M6428',
        title: 'Logo Poker Chip Ball Marker', cat: 'Accessories', price: 34.95,
        breaks: [{ q: 1, p: 34.95 }, { q: 24, p: 31.95 }],
      })],
      idFactory: ids(),
      validatePromo: async (lines, code) => {
        calls.push(['promo', lines.length, code]);
        return { promo: code, totalDiscount: 10 };
      },
      saveProposal: async (lines, options) => {
        calls.push(['save', lines, options]);
        return { cartID: 'cart-9', savedLines: 2, skipped: [] };
      },
    });

    assert.deepEqual(calls[0], ['promo', 2, 'SAVE10']);
    assert.equal(calls[1][0], 'save');
    assert.equal(calls[1][1][0].splits[0].price, 62.99);
    assert.equal(calls[1][1][1].splits[0].priceEdited, true);
    assert.deepEqual(calls[1][2], {
      opportunityID: '88',
      customerID: '42',
      name: 'August proposal',
      expiration: '9/30/2026',
      promotion: { promo: 'SAVE10', totalDiscount: 10 },
    });
    assert.equal(result.proposalId, 'cart-9');
    assert.match(result.proposalUrl, /opportunityID=88/);
    assert.equal(result.itemCount, 2);
    assert.equal(result.lineCount, 2);
    assert.equal(result.total, 1474.68);
  });

  it('rejects malformed nested item instructions before any save', async () => {
    await assert.rejects(
      () => createCatalogProposal({ opportunityId: '88', items: [{ sku: 'B5338', quantity: -2 }] }, {}, { catalog: [product()] }),
      /positive whole number/,
    );
    await assert.rejects(
      () => createCatalogProposal({ opportunityId: '88', items: [{ sku: 'B5338' }] }, {}, { catalog: [product()] }),
      /needs a quantity or splits/,
    );
  });
});
