/**
 * Gift catalog seed integrity.
 *
 * The bundled seed (giftCatalogSeed.json) is the first-paint AND the fallback
 * whenever the live Solr pull can't complete (e.g. the icustomize gateway 502s).
 * A regression once shipped a seed whose brands were parsed from titles rather
 * than the real `brand_s` field: towels landed under junk brands like
 * "Venture Golf"/"Tri-Fold" and NEVER under "Golfballs.com" — so a Golfballs.com
 * product looked "missing" from that brand whenever the fallback was in play.
 *
 * The seed is now regenerated from live docs through the real normalizeDoc, so
 * every entry carries a correct brand/dept. These tests lock that: the seed must
 * be well-formed, and the Microfiber Tri-Fold Towel (the reported proof case)
 * must sit under the Golfballs.com brand.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GIFT_CATALOG_SEED } from '../../src/lib/giftCatalog.js';

const DEPTS = new Set([
  'Golf Balls', 'Apparel', 'Accessories', 'Drinkware', 'Gift Sets',
  'Golf Bags', 'Headwear', 'Footwear', 'Promotional Products', 'Clubs', 'Other',
]);

describe('gift catalog · seed integrity', () => {
  it('every seed entry has a brand, a known department, a title and a positive price', () => {
    for (const p of GIFT_CATALOG_SEED) {
      assert.ok(p.id, `entry missing id: ${JSON.stringify(p).slice(0, 80)}`);
      assert.ok(p.brand && p.brand.trim(), `entry missing brand: ${p.title}`);
      assert.ok(p.title && p.title.trim(), `entry missing title: ${p.id}`);
      assert.ok(DEPTS.has(p.dept), `entry has unknown dept "${p.dept}": ${p.title}`);
      assert.ok(typeof p.price === 'number' && p.price > 0, `entry has bad price: ${p.title}`);
    }
  });

  it('files the Microfiber Tri-Fold Towel under the Golfballs.com brand (the proof case)', () => {
    const towel = GIFT_CATALOG_SEED.find((p) => /Microfiber Tri-Fold Towel/i.test(p.title));
    assert.ok(towel, 'the Microfiber Tri-Fold Towel is not in the seed');
    assert.equal(towel.brand, 'Golfballs.com');
    assert.equal(towel.dept, 'Accessories');
    assert.equal(towel.cat, 'Golf Towels');
  });

  it('does not park golf towels under a decoration/description-derived junk brand', () => {
    // The old bug's fingerprint: towels attributed to "Tri-Fold"/"Microfiber"
    // (words from the title) instead of the real brand_s.
    const junk = new Set(['Tri-Fold', 'Microfiber', 'Waffle']);
    const mislabeled = GIFT_CATALOG_SEED.filter(
      (p) => p.cat === 'Golf Towels' && junk.has(p.brand),
    );
    assert.equal(mislabeled.length, 0,
      `towels under junk brands: ${mislabeled.map((p) => `${p.title}→${p.brand}`).join(', ')}`);
  });

  it('spans several departments so first-paint is representative', () => {
    const depts = new Set(GIFT_CATALOG_SEED.map((p) => p.dept));
    assert.ok(depts.size >= 5, `seed only covers ${depts.size} departments`);
  });
});
