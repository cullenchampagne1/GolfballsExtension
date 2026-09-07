/**
 * Unit tests — src/lib/lineAttributes.js
 *
 * Where a base-product attribute renders: folded into the product identity
 * (next to the title) or listed as a customization option. Fixtures use the
 * REAL PropertyProduct names from the live product pages, because the whole
 * bug was that the site names the same attribute differently per department:
 *
 *   Venture Microfiber Magnetic Towel (P00W61) → "Accessories Color"
 *   TP5 Custom Logo Golf Balls (P012Y9)        → "Ball Color"
 *   apparel                                    → "Apparel Color" / "Apparel Size"
 *
 * The proposal line hid a value only when its key was exactly "Color", so a
 * t-shirt's colour showed up as a customization chip while a towel's did not.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanAttributeLabel, isIdentityAttribute, identityAttributeValues,
  optionAttributePills, optionAttributeValues, identitySuffix, lineAttributeSubtitle,
} from '../../src/lib/lineAttributes.js';

describe('cleanAttributeLabel', () => {
  it('strips the department prefix the site puts on a shared property name', () => {
    assert.equal(cleanAttributeLabel('Accessories Color'), 'Color');
    assert.equal(cleanAttributeLabel('Apparel Color'), 'Color');
    assert.equal(cleanAttributeLabel('Ball Color'), 'Color');
    assert.equal(cleanAttributeLabel('Apparel Size'), 'Size');
  });

  it('leaves an unprefixed label alone', () => {
    assert.equal(cleanAttributeLabel('Color'), 'Color');
    assert.equal(cleanAttributeLabel('Tee Count'), 'Tee Count');
    assert.equal(cleanAttributeLabel('Metal Finish'), 'Metal Finish');
  });

  it('never strips a label down to nothing', () => {
    assert.equal(cleanAttributeLabel('Apparel'), 'Apparel');
    assert.equal(cleanAttributeLabel(''), '');
    assert.equal(cleanAttributeLabel(null), '');
  });
});

describe('isIdentityAttribute', () => {
  it('treats colour as identity whatever the department calls it', () => {
    for (const label of ['Color', 'Colour', 'Colors', 'Accessories Color', 'Apparel Color', 'Ball Color', 'Towel Color']) {
      assert.equal(isIdentityAttribute(label), true, label);
    }
  });

  it('treats size as identity too — the site folds it into the child name', () => {
    assert.equal(isIdentityAttribute('Size'), true);
    assert.equal(isIdentityAttribute('Apparel Size'), true);
  });

  it('treats everything the buyer configures as a customization option', () => {
    for (const label of ['Tee Count', 'Set Makeup', 'Shaft', 'Metal Finish', 'Colors in Logo', 'Imprint side', 'style']) {
      assert.equal(isIdentityAttribute(label), false, label);
    }
  });

  it('is false for an empty label', () => {
    assert.equal(isIdentityAttribute(''), false);
    assert.equal(isIdentityAttribute(undefined), false);
  });
});

describe('identityAttributeValues / optionAttributePills', () => {
  const shirt = { values: { 'Apparel Color': 'Red', 'Apparel Size': 'L', 'Imprint side': 'Left chest' } };
  const towel = { values: { Color: 'White' } };
  const ball = { values: { 'Ball Color': 'White' } };

  it('keeps a t-shirt colour OUT of the customization options', () => {
    assert.deepEqual(optionAttributePills(shirt), ['Imprint side: Left chest']);
  });

  it('keeps a towel colour out too — the same rule, a different label', () => {
    assert.deepEqual(optionAttributePills(towel), []);
    assert.deepEqual(identityAttributeValues(towel), ['White']);
  });

  it('classifies the ball-colour label identically', () => {
    assert.deepEqual(optionAttributePills(ball), []);
    assert.deepEqual(identityAttributeValues(ball), ['White']);
  });

  it('orders identity values colour-first, matching the site’s own names', () => {
    assert.deepEqual(identityAttributeValues(shirt), ['Red', 'L']);
  });

  it('labels option pills with the cleaned name', () => {
    assert.deepEqual(optionAttributePills({ values: { 'Apparel Fit': 'Slim', 'Tee Count': '100' } }),
      ['Fit: Slim', 'Tee Count: 100']);
  });

  it('drops blank values so an unselected option is not shown', () => {
    assert.deepEqual(optionAttributePills({ values: { 'Tee Count': '', Shaft: null, 'Metal Finish': 'Satin' } }),
      ['Metal Finish: Satin']);
    assert.deepEqual(identityAttributeValues({ values: { Color: '  ' } }), []);
  });

  it('handles a missing variant', () => {
    assert.deepEqual(identityAttributeValues(null), []);
    assert.deepEqual(optionAttributePills(undefined), []);
    assert.deepEqual(optionAttributeValues(null), []);
  });
});

describe('identitySuffix', () => {
  it('appends the colour the way the site names its child product', () => {
    assert.equal(
      identitySuffix({ values: { 'Accessories Color': 'White' } }, 'Venture Golf Microfiber Magnetic Towel'),
      ' - White',
    );
  });

  it('appends colour then size for apparel', () => {
    assert.equal(identitySuffix({ values: { 'Apparel Color': 'Red', 'Apparel Size': 'L' } }, 'Performance Polo'), ' - Red - L');
  });

  it('does not repeat a value the catalog title already spells out', () => {
    assert.equal(identitySuffix({ values: { Color: 'White' } }, 'Magnetic Towel - White'), '');
    assert.equal(identitySuffix({ values: { Color: 'white' } }, 'Magnetic Towel - White'), '', 'case-insensitive');
    assert.equal(identitySuffix({ values: { Color: 'Royal Blue' } }, 'Magnetic Towel - Royal Blue'), '');
  });

  it('matches whole words, so a one-letter size is not eaten by the title', () => {
    // "L" is a substring of "Polo"; a substring test dropped the size entirely.
    assert.equal(identitySuffix({ values: { 'Apparel Size': 'L' } }, 'Performance Polo'), ' - L');
    assert.equal(identitySuffix({ values: { 'Apparel Size': 'S' } }, 'Sport Shirt'), ' - S');
  });

  it('is empty when there is no identity attribute', () => {
    assert.equal(identitySuffix({ values: { 'Tee Count': '100' } }, 'Custom Logo Tees'), '');
    assert.equal(identitySuffix(null, 'Anything'), '');
  });
});

describe('lineAttributeSubtitle', () => {
  it('reads identity first, then options, then the free-text detail', () => {
    assert.equal(
      lineAttributeSubtitle({ values: { 'Tee Count': '100', 'Apparel Color': 'Red' }, details: '3.25 inch' }),
      'Red · 100 · 3.25 inch',
    );
  });

  it('emits values only, so email copy stays prose', () => {
    assert.equal(lineAttributeSubtitle({ values: { style: 'White' } }), 'White');
  });

  it('de-duplicates a value repeated across attributes', () => {
    assert.equal(lineAttributeSubtitle({ values: { Color: 'Black', Shaft: 'Black' } }), 'Black');
  });

  it('is empty for a line with no attributes', () => {
    assert.equal(lineAttributeSubtitle(null), '');
    assert.equal(lineAttributeSubtitle({ values: {} }), '');
  });
});
