/**
 * Gift catalog promo recognition (normalizeDoc → product.promo).
 *
 * Eligibility for a buy-X-get-Y promo is NOT limited to products carrying the
 * generic BUY…GET…FREE tag: many carry only a brand-specific "<brand><X>and<Y>"
 * eligibility tag (e.g. the Srixon Z-Star 8 has `srixon12and4`, NOT
 * BUY12GET4FREE). The icustomize promotion engine resolves these to the
 * BUY{X}GET{Y}FREE code — confirmed against the live cart HAR. These tests lock
 * that mapping so the Z-Star-8 class of products reads as on-promo.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeDoc } from '../../src/lib/giftCatalog.js';

const promoFor = (tags) => normalizeDoc({
  parentCode_s: 'P00WSY', title_s: 'Z-Star 8 Golf Balls', brand_s: 'Srixon',
  tag_ss: tags,
}).promo;

describe('gift catalog · promo recognition', () => {
  it('recognizes the generic BUY…GET…FREE tag', () => {
    assert.deepEqual(promoFor(['BUY12GET4FREE']), { code: 'BUY12GET4FREE', label: 'Buy 12 get 4 free' });
  });

  it('recognizes a brand-specific eligibility tag (the Z-Star 8 case)', () => {
    // srixon12and4 → the BUY12GET4FREE code the promotion engine accepts.
    assert.deepEqual(promoFor(['srixon12and4', 'PromotionPRINTED']), {
      code: 'BUY12GET4FREE', label: 'Buy 12 get 4 free',
    });
  });

  it('derives the code from the numbers for other brand promos', () => {
    assert.deepEqual(promoFor(['srixon12and6']), { code: 'BUY12GET6FREE', label: 'Buy 12 get 6 free' });
    assert.deepEqual(promoFor(['bluecypress2and1']), { code: 'BUY2GET1FREE', label: 'Buy 2 get 1 free' });
    assert.deepEqual(promoFor(['12and4']), { code: 'BUY12GET4FREE', label: 'Buy 12 get 4 free' });
  });

  it('resolves the same promo whether the brand tag or the generic tag comes first', () => {
    // The Z-Star 9 carries both; the surfaced code must be stable.
    assert.equal(promoFor(['srixon12and4', 'BUY12GET4FREE']).code, 'BUY12GET4FREE');
    assert.equal(promoFor(['BUY12GET4FREE', 'srixon12and4']).code, 'BUY12GET4FREE');
  });

  it('does not invent a promo from unrelated tags', () => {
    assert.equal(promoFor(['2025', '2025SoftFeel', 'customTrending', 'ExcludeFromABTest']), null);
    assert.equal(promoFor([]), null);
  });
});
