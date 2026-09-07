import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_ACCOUNT_CONTEXT_NOTICE,
  CATALOG_CARD_WIDTH,
  CATALOG_MOUNT_SCALE_CATEGORY,
  CATALOG_PROPOSAL_WIDTH,
  CATALOG_SCALE_DEFAULT,
  PROPOSAL_CHECKOUT_AVAILABLE,
  canOfferProposalCheckout,
  catalogDealBadge,
  catalogSidebarLabel,
  commissionRank,
  comparePopularity,
  sortCatalogResults,
  fitCatalogScale,
  normalizeCatalogScale,
} from '../../src/lib/catalogPresentation.js';

describe('catalog presentation', () => {
  it('shows one promotional badge instead of stacking a generic sale badge', () => {
    const both = {
      orig: 39.99,
      price: 29.99,
      promo: { label: 'Buy 3, get 1' },
    };

    assert.deepEqual(catalogDealBadge(both), { kind: 'promo', label: 'Buy 3, get 1' });
    assert.deepEqual(catalogDealBadge({ orig: 39.99, price: 29.99 }), { kind: 'sale', label: 'Sale' });
    assert.equal(catalogDealBadge({ price: 29.99 }), null);
  });

  it('shortens Promotional Products only for the sidebar presentation', () => {
    assert.equal(catalogSidebarLabel('Promotional Products'), 'Promotional');
    assert.equal(catalogSidebarLabel('Golf Balls'), 'Golf Balls');
  });

  it('presents missing CRM context as concise title and supporting copy', () => {
    assert.deepEqual(CATALOG_ACCOUNT_CONTEXT_NOTICE, {
      title: 'No account in context',
      message: 'Open the catalog from a Golfballs.com CRM account or opportunity page to view its active proposals.',
    });
  });

  it('normalizes the saved preference and never magnifies past it while fitting', () => {
    assert.equal(normalizeCatalogScale('1.4'), 1.4);
    assert.equal(normalizeCatalogScale('bad'), CATALOG_SCALE_DEFAULT);
    assert.equal(normalizeCatalogScale(20), 3);

    const regular = fitCatalogScale(1.8, 1920, 1080, CATALOG_CARD_WIDTH);
    const expanded = fitCatalogScale(
      1.8,
      1920,
      1080,
      CATALOG_CARD_WIDTH + CATALOG_PROPOSAL_WIDTH,
    );
    assert.ok(regular < 1.8);
    assert.ok(expanded < regular);
    assert.equal(fitCatalogScale(1.2, 2560, 1440), 1.2);
  });

  it('owns one scale system instead of inheriting the shared modal zoom', () => {
    assert.equal(CATALOG_MOUNT_SCALE_CATEGORY, null);
  });

  it('keeps unfinished proposal checkout out of the layout without deleting its entry path', () => {
    const buildCheckoutSource = () => ({ entries: [{ id: 'line-1' }] });

    assert.equal(PROPOSAL_CHECKOUT_AVAILABLE, false);
    assert.equal(canOfferProposalCheckout(buildCheckoutSource, 1), false);
  });
});

/* ── ordering ──────────────────────────────────────────────────────────────
   A rep quotes decorated goods, so commissionable product leads every catalog
   page under every sort, and popularity orders within that group. */
const item = (over = {}) => ({
  title: 'Item', price: 10, reviews: 0, rating: null, sortDefault: 0,
  customLogo: false, hasCustomLogoPriceBreaks: false, ...over,
});
const LADDER = { customLogo: true, hasCustomLogoPriceBreaks: true };
const LOGO_ONLY = { customLogo: true, hasCustomLogoPriceBreaks: false };

describe('commissionRank', () => {
  it('ranks a real commissionable ladder first, then logo-capable, then retail', () => {
    assert.equal(commissionRank(item(LADDER)), 0);
    assert.equal(commissionRank(item(LOGO_ONLY)), 1);
    assert.equal(commissionRank(item()), 2);
  });

  it('treats a missing product as retail rather than throwing', () => {
    assert.equal(commissionRank(null), 2);
    assert.equal(commissionRank({}), 2);
  });
});

describe('comparePopularity', () => {
  it('leads with review count', () => {
    assert.ok(comparePopularity(item({ reviews: 68 }), item({ reviews: 4 })) < 0);
  });

  it('breaks a review-count tie on the star rating', () => {
    assert.ok(comparePopularity(item({ reviews: 4, rating: 4.9 }), item({ reviews: 4, rating: 3.1 })) < 0);
  });

  it('falls back to the site’s own merchandising rank for the unreviewed long tail', () => {
    // Most of the catalog has no reviews; without this everything ties and the
    // order is whatever the crawl happened to return.
    const a = item({ reviews: 0, sortDefault: 900 });
    const b = item({ reviews: 0, sortDefault: 10 });
    assert.ok(comparePopularity(a, b) < 0);
  });

  it('is total and stable — equal products fall back to the title', () => {
    assert.ok(comparePopularity(item({ title: 'Alpha' }), item({ title: 'Beta' })) < 0);
    assert.equal(comparePopularity(item({ title: 'Same' }), item({ title: 'Same' })), 0);
  });

  it('treats absent review/rating data as zero, not NaN', () => {
    // A NaN comparator result silently leaves the array unsorted.
    assert.equal(comparePopularity(item({ reviews: undefined, title: 'X' }), item({ reviews: null, title: 'X' })), 0);
  });
});

describe('sortCatalogResults', () => {
  const catalog = [
    item({ title: 'Retail popular', reviews: 500 }),
    item({ title: 'Logo capable', reviews: 1, ...LOGO_ONLY }),
    item({ title: 'Commissionable quiet', reviews: 0, sortDefault: 5, ...LADDER }),
    item({ title: 'Commissionable loved', reviews: 12, ...LADDER }),
  ];

  it('puts commissionable product on top even when retail is far more reviewed', () => {
    assert.deepEqual(sortCatalogResults(catalog, 'popular').map((p) => p.title), [
      'Commissionable loved', 'Commissionable quiet', 'Logo capable', 'Retail popular',
    ]);
  });

  it('keeps the commissionable group on top under every other sort', () => {
    for (const sort of ['priceLow', 'priceHigh', 'name']) {
      const ranks = sortCatalogResults(catalog, sort).map(commissionRank);
      assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), sort);
    }
  });

  it('orders WITHIN the commissionable group by the chosen sort', () => {
    const priced = [
      item({ title: 'Dear', price: 90, ...LADDER }),
      item({ title: 'Cheap', price: 10, ...LADDER }),
      item({ title: 'Retail', price: 1 }),
    ];
    assert.deepEqual(sortCatalogResults(priced, 'priceLow').map((p) => p.title), ['Cheap', 'Dear', 'Retail']);
    assert.deepEqual(sortCatalogResults(priced, 'priceHigh').map((p) => p.title), ['Dear', 'Cheap', 'Retail']);
  });

  it('does not mutate the caller’s list (it is a memo input)', () => {
    const input = [...catalog];
    sortCatalogResults(input, 'popular');
    assert.deepEqual(input.map((p) => p.title), catalog.map((p) => p.title));
  });

  it('falls back to popularity for an unknown sort, and tolerates no input', () => {
    assert.equal(sortCatalogResults(catalog, 'nonsense')[0].title, 'Commissionable loved');
    assert.deepEqual(sortCatalogResults(null), []);
    assert.deepEqual(sortCatalogResults([]), []);
  });
});
