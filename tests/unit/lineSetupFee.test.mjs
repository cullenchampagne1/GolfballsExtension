/**
 * Unit tests — src/lib/lineSetupFee.js
 *
 * The one-time decoration setup fee, modelled as a property of the LINE ITEM.
 * Fixtures use the real numbers from the Venture Golf Microfiber Magnetic Towel
 * (ShortCode P00W61): its "Custom Logo" modification (modificationID 84)
 * carries setupFee_priceBreakHeader [{ Quantity: 1, Price: 50 }], and
 * golfballs.com's own proposal email prints "Set Up Fee $50" under each towel
 * line — 12 × $23.99 = $287.88 + $50, twice → $675.76 estimated total.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SETUP_FEE_LABEL, setupFeeAt, lineUnits, hasEditedSetupFee, derivedSetupFee,
  lineSetupFee, setupFeeTotal, withDerivedSetupFee, editLineSetupFee,
  resetLineSetupFee, offersSetupFee, setupFeeSnapshot,
} from '../../src/lib/lineSetupFee.js';

const towelLine = (over = {}) => ({
  id: 'towel-white',
  product: { title: 'Venture Golf Microfiber Magnetic Towel', sku: 'A1234' },
  decoration: { engine: 'logoOverlay' },
  splits: [{ id: 's1', qty: 12, price: 23.99 }],
  setupFeeAuto: 50,
  ...over,
});

describe('SETUP_FEE_LABEL', () => {
  it('matches the label golfballs.com prints on the row', () => {
    assert.equal(SETUP_FEE_LABEL, 'Set Up Fee');
  });
});

describe('setupFeeAt', () => {
  it('reads the towel ladder [{1, 50}] as a flat $50 at every quantity', () => {
    assert.equal(setupFeeAt([{ q: 1, p: 50 }], 1), 50);
    assert.equal(setupFeeAt([{ q: 1, p: 50 }], 12), 50);
    assert.equal(setupFeeAt([{ q: 1, p: 50 }], 500), 50);
  });

  it('takes the largest break at or below the quantity', () => {
    const ladder = [{ q: 1, p: 60 }, { q: 48, p: 40 }, { q: 240, p: 0 }];
    assert.equal(setupFeeAt(ladder, 12), 60);
    assert.equal(setupFeeAt(ladder, 48), 40);
    assert.equal(setupFeeAt(ladder, 100), 40);
    assert.equal(setupFeeAt(ladder, 240), 0);
  });

  it('is 0 with no ladder — a product with no decoration setup charges nothing', () => {
    assert.equal(setupFeeAt(null, 12), 0);
    assert.equal(setupFeeAt([], 12), 0);
    assert.equal(setupFeeAt([{ q: 24, p: 50 }], 12), 0, 'the first break is above the qty');
  });
});

describe('lineUnits', () => {
  it('sums the quantity across every price break', () => {
    assert.equal(lineUnits(towelLine({ splits: [{ qty: 12, price: 23.99 }, { qty: 24, price: 22.99 }] })), 36);
    assert.equal(lineUnits({ splits: [] }), 0);
    assert.equal(lineUnits(null), 0);
  });
});

describe('lineSetupFee / derivedSetupFee', () => {
  it('uses the product-derived fee when the rep has not typed one', () => {
    const line = towelLine();
    assert.equal(derivedSetupFee(line), 50);
    assert.equal(lineSetupFee(line), 50);
    assert.equal(hasEditedSetupFee(line), false);
  });

  it('lets a typed fee win over the derived one', () => {
    const line = editLineSetupFee(towelLine(), 35);
    assert.equal(hasEditedSetupFee(line), true);
    assert.equal(lineSetupFee(line), 35);
    assert.equal(derivedSetupFee(line), 50, 'the derived value stays available for the reset control');
  });

  it('accepts a typed 0 as a real waiver, not a missing value', () => {
    const line = editLineSetupFee(towelLine(), 0);
    assert.equal(lineSetupFee(line), 0);
    assert.equal(hasEditedSetupFee(line), true);
  });

  it('rounds to cents and floors a negative entry at 0', () => {
    assert.equal(lineSetupFee(editLineSetupFee(towelLine(), 12.005)), 12.01);
    assert.equal(lineSetupFee(editLineSetupFee(towelLine(), -20)), 0);
    assert.equal(lineSetupFee(editLineSetupFee(towelLine(), 'abc')), 0);
  });

  it('reverts to the derived fee once the edit is reset', () => {
    const line = resetLineSetupFee(editLineSetupFee(towelLine(), 35));
    assert.equal(hasEditedSetupFee(line), false);
    assert.equal(lineSetupFee(line), 50);
    assert.equal('setupFee' in line, false, 'the override is removed, not zeroed');
  });

  it('never charges setup on a free promotional giveaway line', () => {
    assert.equal(lineSetupFee(towelLine({ free: true })), 0);
    assert.equal(lineSetupFee(editLineSetupFee(towelLine({ free: true }), 50)), 0);
  });

  it('is 0 for a line that has no fee at all', () => {
    assert.equal(lineSetupFee({ splits: [{ qty: 12, price: 4 }] }), 0);
    assert.equal(lineSetupFee(null), 0);
  });
});

describe('setupFeeTotal', () => {
  it('sums one fee per line item — the $100 in the two-colour towel proposal', () => {
    const lines = [towelLine(), towelLine({ id: 'towel-black' })];
    assert.equal(setupFeeTotal(lines), 100);
  });

  it('counts a split line ONCE, not once per price break', () => {
    const split = towelLine({ splits: [{ qty: 12, price: 23.99 }, { qty: 24, price: 22.99 }] });
    assert.equal(setupFeeTotal([split]), 50);
  });

  it('is 0 for an empty proposal', () => {
    assert.equal(setupFeeTotal([]), 0);
    assert.equal(setupFeeTotal(undefined), 0);
  });
});

describe('withDerivedSetupFee', () => {
  it('records what the product ladder derives at the line’s total quantity', () => {
    const line = { splits: [{ qty: 12, price: 23.99 }] };
    assert.equal(withDerivedSetupFee(line, [{ q: 1, p: 50 }]).setupFeeAuto, 50);
  });

  it('reads a stepping ladder at the SUM of the breaks, not one break', () => {
    const line = { splits: [{ qty: 12, price: 5 }, { qty: 36, price: 4 }] };  // 48 units
    const ladder = [{ q: 1, p: 60 }, { q: 48, p: 25 }];
    assert.equal(withDerivedSetupFee(line, ladder).setupFeeAuto, 25);
  });

  it('returns the SAME object when the derived fee has not changed', () => {
    const line = { splits: [{ qty: 12, price: 23.99 }], setupFeeAuto: 50 };
    assert.equal(withDerivedSetupFee(line, [{ q: 1, p: 50 }]), line);
  });

  it('leaves a rep’s typed fee in force while refreshing the derived one', () => {
    const edited = editLineSetupFee({ splits: [{ qty: 12, price: 23.99 }], setupFeeAuto: 50 }, 35);
    const next = withDerivedSetupFee(edited, [{ q: 1, p: 65 }]);
    assert.equal(next.setupFeeAuto, 65);
    assert.equal(lineSetupFee(next), 35, 'the quote the rep typed must survive a reprice');
  });

  it('records a zero derived fee (a product with no setup ladder)', () => {
    const next = withDerivedSetupFee({ splits: [{ qty: 12, price: 50 }] }, null);
    assert.equal(next.setupFeeAuto, 0);
  });
});

describe('offersSetupFee', () => {
  it('offers the row on any decorated line, even before the fee is known', () => {
    assert.equal(offersSetupFee({ decoration: { engine: 'ballLogo' }, splits: [{ qty: 12, price: 50 }] }), true);
  });

  it('offers the row on an undecorated line that already carries a fee', () => {
    assert.equal(offersSetupFee({ decoration: { engine: 'none' }, setupFeeAuto: 39.99, splits: [] }), true);
  });

  it('keeps a plain retail line clean', () => {
    assert.equal(offersSetupFee({ decoration: { engine: 'none' }, splits: [{ qty: 12, price: 4 }] }), false);
    assert.equal(offersSetupFee({ splits: [{ qty: 1, price: 4 }] }), false);
  });

  it('never offers it on a free giveaway line', () => {
    assert.equal(offersSetupFee({ free: true, decoration: { engine: 'ballLogo' }, setupFeeAuto: 50, splits: [] }), false);
  });
});

describe('setupFeeSnapshot', () => {
  it('persists the derived fee alone when there is no edit', () => {
    assert.deepEqual(setupFeeSnapshot(towelLine()), { setupFeeAuto: 50 });
  });

  it('persists the edit so a reloaded draft quotes the same fee', () => {
    assert.deepEqual(setupFeeSnapshot(editLineSetupFee(towelLine(), 35)),
      { setupFeeAuto: 50, setupFee: 35, setupFeeEdited: true });
  });

  it('stores nothing for a line with no fee, so drafts do not grow keys', () => {
    assert.deepEqual(setupFeeSnapshot({ splits: [{ qty: 12, price: 4 }] }), {});
    assert.deepEqual(setupFeeSnapshot(null), {});
  });
});
