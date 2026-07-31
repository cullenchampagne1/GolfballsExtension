/**
 * Gift catalog promo recognition (normalizeDoc → product.promo).
 *
 * tag_ss carries two classes of promo tag:
 *   - Generic managed tags (BUY12GET4FREE, EVERY12GETS6) — added/removed as a
 *     promotion goes live/ends, so their presence means the promo is ACTIVE.
 *   - Brand/bare eligibility tags (srixon12and4, srixon12and6, bluecypress2and1,
 *     bare 12and4) — PERMANENT bulk-imports from the old catalog that linger on
 *     discontinued products long after the promo ends.
 *
 * The real, live fixtures below (pulled from the icustomize feed) lock the rule
 * that discriminates them: a brand/bare "<X>and<Y>" tag counts only while the
 * product is still current — NOT when it's tagged Clearance/PriorGen. This is
 * the exact fix for the Srixon Z-Star 8, which still carries srixon12and4 /
 * srixon12and6 but is Clearance+PriorGen and shows no promo on the live site —
 * previously it surfaced a false "Buy 12 get 4" (and a stale "Buy 12 get 6" in
 * the proposal).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeDoc } from '../../src/lib/giftCatalog.js';

const promoFor = (tags) => normalizeDoc({
  parentCode_s: 'PTEST', title_s: 'Test Golf Balls', brand_s: 'Srixon', tag_ss: tags,
}).promo;

describe('gift catalog · promo recognition', () => {
  it('recognizes the generic BUY…GET…FREE tag', () => {
    assert.deepEqual(promoFor(['BUY12GET4FREE']), { code: 'BUY12GET4FREE', label: 'Buy 12 get 4 free' });
  });

  it('recognizes the generic EVERY…GETS… tag', () => {
    assert.deepEqual(promoFor(['EVERY12GETS6']), { code: 'EVERY12GETS6', label: 'Buy 12 get 6 free' });
  });

  it('honors a brand tag on a CURRENT product (live Blue Cypress Buy 2 Get 1)', () => {
    // bluecypress2and1 rides on 2025/2026 balls with no generic tag and is
    // actively merchandised — the brand tag IS the live signal here.
    assert.deepEqual(promoFor(['2025', 'bluecypress2and1']), {
      code: 'BUY2GET1FREE', label: 'Buy 2 get 1 free',
    });
  });

  it('honors a brand tag alongside the generic tag on a current Srixon', () => {
    // Z-Star 9 (P0117M): srixon12and4 + the active BUY12GET4FREE, not clearance.
    assert.equal(promoFor(['srixon12and4', 'BUY12GET4FREE', '2025']).code, 'BUY12GET4FREE');
  });

  it('SUPPRESSES a stale brand tag on a discontinued product (the real Z-Star 8 White)', () => {
    // P00WSY: still carries srixon12and4 but is Clearance+PriorGen → no live promo.
    assert.equal(promoFor([
      'srixon12and4', 'subscribable', 'Clearance', 'PromotionPRINTED',
      '2023', '2023ZStarSeries', 'PriorGen', 'zstar34',
    ]), null);
  });

  it('SUPPRESSES the stale get-6 tag on the discontinued Z-Star 8 Yellow', () => {
    // P00WT0: srixon12and6 on a Clearance+PriorGen ball — the "Buy 12 get 6"
    // that wrongly pulled up in the proposal.
    assert.equal(promoFor([
      'srixon12and6', 'Clearance', 'PromotionPRINTED', '2023', 'PriorGen', 'zstar34',
    ]), null);
  });

  it('still honors a generic tag even on a clearance product', () => {
    // A generic tag is an explicit, managed active-promo declaration — trusted
    // regardless of clearance status.
    assert.equal(promoFor(['Clearance', 'BUY12GET4FREE']).code, 'BUY12GET4FREE');
  });

  it('does not invent a promo from unrelated tags', () => {
    assert.equal(promoFor(['2025', '2025SoftFeel', 'customTrending', 'ExcludeFromABTest']), null);
    assert.equal(promoFor([]), null);
  });
});
