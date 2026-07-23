import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_ACCOUNT_CONTEXT_NOTICE,
  CATALOG_CARD_WIDTH,
  CATALOG_MOUNT_SCALE_CATEGORY,
  CATALOG_PROPOSAL_WIDTH,
  CATALOG_SCALE_DEFAULT,
  catalogDealBadge,
  catalogSidebarLabel,
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
});
