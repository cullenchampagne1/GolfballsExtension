/**
 * Unit tests — src/lib/bundleCost.js
 *
 * Multipack → single-sibling resolution. Pure module (the catalog index is
 * module-level state seeded via setBundleCatalog — tests seed a small,
 * realistic catalog before exercising bundleSingle).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  packMultiple, isBall, ballModelKey, setBundleCatalog, bundleSingle,
} from '../../src/lib/bundleCost.js';

describe('packMultiple', () => {
  it('reads Double/Two Dozen as 2', () => {
    assert.equal(packMultiple('Titleist Pro V1 Golf Balls - Double Dozen'), 2);
    assert.equal(packMultiple('Callaway Supersoft Golf Balls Two Dozen'), 2);
  });

  it('reads Triple Dozen as 3', () => {
    assert.equal(packMultiple('TaylorMade Distance+ Golf Balls - Triple Dozen'), 3);
  });

  it('reads "Buy N DZ Get M DZ Free" as the N paid dozens', () => {
    assert.equal(packMultiple('Srixon Soft Feel Golf Balls - Buy 2 DZ Get 1 DZ Free'), 2);
    assert.equal(packMultiple('Velocity Golf Balls - Buy 3 Dozen Get 1 Dozen Free'), 3);
  });

  it('returns 1 for a plain single dozen and for null', () => {
    assert.equal(packMultiple('Titleist Pro V1 Golf Balls'), 1);
    assert.equal(packMultiple(null), 1);
    assert.equal(packMultiple(''), 1);
  });
});

describe('isBall', () => {
  it('trusts itemType when it names a golf ball', () => {
    assert.equal(isBall({ itemType: 'gbc-golf_ball', title: 'anything' }), true);
  });

  it('falls back to a "golf ball" title match', () => {
    assert.equal(isBall({ title: 'Callaway Supersoft Golf Balls' }), true);
  });

  it('rejects apparel/gift products and null', () => {
    assert.equal(isBall({ itemType: 'gbc-apparel', title: 'Nike Tour Polo' }), false);
    assert.equal(isBall(null), false);
  });
});

describe('ballModelKey', () => {
  it('strips the pack phrase and {Decoration} qualifier', () => {
    assert.equal(ballModelKey('Pro V1 Golf Balls - Double Dozen {Custom Logo}'), 'pro v1 golf balls');
  });

  it('strips model-year markers (leading year and "- YYYY Model")', () => {
    assert.equal(ballModelKey('2024 Soft Feel Golf Balls - 2026 Model'), 'soft feel golf balls');
  });

  it('collapses Logo Overrun onto the regular model key', () => {
    assert.equal(ballModelKey('Chrome Soft Logo Overrun Golf Balls'), 'chrome soft golf balls');
  });

  it('strips a BOGO pack phrase', () => {
    assert.equal(ballModelKey('Velocity Golf Balls - Buy 2 DZ Get 1 DZ Free'), 'velocity golf balls');
  });

  it('keeps the "+" in model names like Distance+', () => {
    assert.equal(ballModelKey('e6 Distance+ Golf Balls'), 'e6 distance+ golf balls');
  });

  it('drops Fan Pack / Box marketing words', () => {
    assert.equal(ballModelKey('Tour B RX Golf Balls Fan Pack'), 'tour b rx golf balls');
  });
});

describe('setBundleCatalog + bundleSingle', () => {
  // Catalog shape: brand in its own field, title WITHOUT the brand (title_s).
  const catalog = [
    { sku: 'B5871', brand: 'Titleist', title: 'Pro V1 Golf Balls', itemType: 'gbc-golf_ball' },
    { sku: 'B4001', brand: 'Titleist', title: 'Pro V1 Golf Balls - 2024 Model', itemType: 'gbc-golf_ball' },
    { sku: 'B3273', brand: 'Srixon', title: 'Soft Feel Golf Balls', itemType: 'gbc-golf_ball' },
    // A bundle in the catalog must NOT index itself as a single.
    { sku: 'B9999', brand: 'Titleist', title: 'Pro V1 Golf Balls - Double Dozen', itemType: 'gbc-golf_ball' },
    // Non-ball noise.
    { sku: 'A1000', brand: 'Nike', title: 'Tour Polo', itemType: 'gbc-apparel' },
    // parentCode-only single (no sku field).
    { parentCode: 'B2200', brand: 'Wilson', title: 'Duo Soft Golf Balls', itemType: 'gbc-golf_ball' },
  ];

  beforeEach(() => setBundleCatalog(catalog));

  it('resolves a Double Dozen to its single sibling at 2× (brand baked into the title)', () => {
    const b = bundleSingle({ brand: 'Titleist', title: 'Titleist Pro V1 Golf Balls - Double Dozen', itemType: 'gbc-golf_ball' });
    assert.deepEqual(b, { sku: 'B5871', multiple: 2 });
  });

  it('picks the current season single (highest parentSku number) among model-year siblings', () => {
    // B5871 (current) beats B4001 (2024 model) under the same (brand, model) key.
    const b = bundleSingle({ brand: 'Titleist', title: 'Pro V1 Golf Balls Double Dozen', itemType: 'gbc-golf_ball' });
    assert.equal(b.sku, 'B5871');
  });

  it('resolves a "Buy 2 DZ Get 1 DZ Free" deal as 2 paid dozens of the single', () => {
    const b = bundleSingle({ brand: 'Srixon', title: 'Srixon Soft Feel Golf Balls - Buy 2 DZ Get 1 DZ Free', itemType: 'gbc-golf_ball' });
    assert.deepEqual(b, { sku: 'B3273', multiple: 2 });
  });

  it('indexes a single by parentCode when it has no sku', () => {
    const b = bundleSingle({ brand: 'Wilson', title: 'Wilson Duo Soft Golf Balls Two Dozen', itemType: 'gbc-golf_ball' });
    assert.deepEqual(b, { sku: 'B2200', multiple: 2 });
  });

  it('returns null for a single dozen (not a multipack)', () => {
    assert.equal(bundleSingle({ brand: 'Titleist', title: 'Titleist Pro V1 Golf Balls', itemType: 'gbc-golf_ball' }), null);
  });

  it('returns null for a custom item even when the title looks like a pack', () => {
    assert.equal(bundleSingle({ isCustom: true, brand: 'Titleist', title: 'Pro V1 Golf Balls Double Dozen', itemType: 'gbc-golf_ball' }), null);
  });

  it('returns null when no single sibling exists in the catalog', () => {
    assert.equal(bundleSingle({ brand: 'Vice', title: 'Vice Pro Golf Balls Double Dozen', itemType: 'gbc-golf_ball' }), null);
  });

  it('returns null for a non-ball multipack (apparel sets are not decomposed)', () => {
    assert.equal(bundleSingle({ brand: 'Nike', title: 'Nike Tour Polo Double Dozen', itemType: 'gbc-apparel' }), null);
  });

  it('an emptied catalog resolves nothing', () => {
    setBundleCatalog([]);
    assert.equal(bundleSingle({ brand: 'Titleist', title: 'Titleist Pro V1 Golf Balls - Double Dozen', itemType: 'gbc-golf_ball' }), null);
  });
});
