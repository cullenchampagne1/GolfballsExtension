/* ───────────────────────────────────────────────────────────────
   mockupPrintBox.js — pure print-box math for the 2D grass-mockup
   composer (GrassMockupComposer). Kept out of the JSX so the imprint
   spec is unit-testable.

   The composer works in ball-radius units: nx,ny ∈ [-1, 1] across the
   ball's DIAMETER. The print box is square, spanning `logoSize` radius
   units — so the print covers logoSize/2 of the visible face. To honor
   the imprint spec (0.875" on a regulation 1.680" ball = 52.08% of the
   face — the same golfballViewer.printAreaScale the 3D viewer obeys):

       logoSize = 2 × printAreaScale
─────────────────────────────────────────────────────────────── */

export const PRINT_AREA_SCALE_DEFAULT = 0.875 / 1.680;   // ≈ 0.5208

/** Print-box size in radius units for a given face fraction. */
export function printBoxSize(printAreaScale) {
  const s = Number(printAreaScale);
  return (Number.isFinite(s) && s > 0 ? s : PRINT_AREA_SCALE_DEFAULT) * 2;
}

/** Aspect-fit (contain) fractions for a LW×LH logo inside the square
 *  print box — the logo keeps its native proportions; the shorter axis
 *  occupies only its share of the box. */
export function containFractions(LW, LH) {
  const aspect = (LW > 0 && LH > 0) ? LW / LH : 1;
  return {
    fw: aspect >= 1 ? 1 : aspect,
    fh: aspect >= 1 ? 1 / aspect : 1,
  };
}

/** Map ball-space (nx, ny) → logo UV under a given box size + fit.
 *  Returns null when the point falls outside the (aspect-fitted) logo. */
export function logoUV(nx, ny, logoSize, LW, LH) {
  const { fw, fh } = containFractions(LW, LH);
  const u = (nx / logoSize) / fw + 0.5;
  const v = (ny / logoSize) / fh + 0.5;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
  return { u, v };
}
