/**
 * 2D grass-mockup print-box math: the imprint spec (52.08% of the ball face)
 * must be enforced in the composited mockup exactly like the 3D viewer, and a
 * non-square logo must aspect-fit (no stretch → no "uneven" decal).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRINT_AREA_SCALE_DEFAULT, printBoxSize, containFractions, logoUV,
} from '../../src/lib/mockupPrintBox.js';

describe('printBoxSize — spec enforcement', () => {
  it('spec default is 0.875" / 1.680" ≈ 52.08% of the face', () => {
    assert.ok(Math.abs(PRINT_AREA_SCALE_DEFAULT - 0.5208) < 0.001);
  });

  it('box size = 2 × printAreaScale (radius units), NOT the old 1.2 constant', () => {
    // Regression: the composer hardcoded LOGO_SIZE=1.2 → 60% of the face.
    // At the spec scale the box must be ≈1.0416 — smaller than 1.2.
    const box = printBoxSize(PRINT_AREA_SCALE_DEFAULT);
    assert.ok(Math.abs(box - 1.0416) < 0.001);
    assert.ok(box < 1.2, 'spec box is smaller than the old hardcoded 60%-of-face box');
    // The face fraction the box spans is box/2 = printAreaScale exactly.
    assert.ok(Math.abs(box / 2 - PRINT_AREA_SCALE_DEFAULT) < 1e-12);
  });

  it('tracks the devSettings knob and falls back to spec on junk', () => {
    assert.equal(printBoxSize(0.4), 0.8);
    assert.equal(printBoxSize('nope'), PRINT_AREA_SCALE_DEFAULT * 2);
    assert.equal(printBoxSize(0), PRINT_AREA_SCALE_DEFAULT * 2);
  });
});

describe('containFractions — aspect-fit, no stretch', () => {
  it('square fills the box; wide/tall occupy only their share', () => {
    assert.deepEqual(containFractions(500, 500), { fw: 1, fh: 1 });
    assert.deepEqual(containFractions(1000, 500), { fw: 1, fh: 0.5 });   // wide → half-height
    assert.deepEqual(containFractions(500, 1000), { fw: 0.5, fh: 1 });   // tall → half-width
  });
});

describe('logoUV — sampling window', () => {
  const box = printBoxSize(PRINT_AREA_SCALE_DEFAULT);   // ≈ 1.0416

  it('ball center maps to the logo center', () => {
    assert.deepEqual(logoUV(0, 0, box, 400, 400), { u: 0.5, v: 0.5 });
  });

  it('points beyond the print box are outside the logo (spec-bounded)', () => {
    // nx at 60% of the face (the OLD box edge) must now fall outside.
    const nxOld = 1.2 / 2;
    assert.equal(logoUV(nxOld, 0, box, 400, 400), null);
    // Just inside the spec box edge is still inside.
    const nxSpec = (box / 2) * 0.99;
    assert.ok(logoUV(nxSpec, 0, box, 400, 400));
  });

  it('a 2:1 wide logo is transparent above/below its fitted band (no stretch)', () => {
    // At ny = 40% of the box, a 2:1 logo (fh=0.5, band ±25% of the box) has
    // no pixels — stretching would have sampled the logo there.
    const ny = box * 0.4;
    assert.equal(logoUV(0, ny, box, 1000, 500), null);
    // Same point on a square logo is inside.
    assert.ok(logoUV(0, ny, box, 500, 500));
  });
});
