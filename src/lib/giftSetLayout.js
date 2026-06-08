/* giftSetLayout.js — gift-set 3D assembly data (pure data + parsers, no three.js).
 *
 * The catalog/Image-Viewer can preview the assembled gift set in 3D: a presentation
 * box with the customized balls + a kit (poker chips, or a divot tool) sitting in
 * its foam slots. This module supplies, per set: which box model to load, where the
 * balls sit, and a generic list of "kit items" (each = a model + a slot transform +
 * whether it takes the logo). GolfballViewer's `giftset` mode clones the already-
 * customized models into those slots.
 *
 * Coordinate space matches the exported box OBJs exactly — Blender Z-up, NO axis
 * conversion, so +Z is the box opening (up), origin = box center, units = Blender
 * model units (foam footprint x ±5.0, y ±3.37; outer shell x ±5.45, y ±3.82).
 * Coords were blob-measured from the reference product photos + verified against the
 * rendered boxes. The tee pile + its well are BAKED into each box OBJ (white-tinted
 * verts), not placed at runtime — tees are never customized.
 *
 * All three 6-ball black-box sets share the SAME box (6-ball grid + tee well); they
 * differ only in the upper-right kit: 2 poker chips, OR 1 divot tool + 2 (empty,
 * not-yet-modeled) ball-marker spots.
 */

// MODEL_URLS keys in GolfballViewer for each baked box (walls + cut foam + tees).
export const BOX_MODELS = {
  sixBallPokerChip: 'giftbox',
  sixBallLever: 'giftboxLever',
  sixBallBartender: 'giftboxBartender',
  // Premium-wood frames — SAME foam inserts + slot layout, only the outer tray
  // is a baked walnut-grain wood instead of the black box.
  premiumWoodPoker: 'giftboxWoodPoker',
  premiumWoodLever: 'giftboxWoodLever',
};

// Shared 6-ball grid (2 cols × 3 rows, left side). Order: TL, TR, ML, MR, BL, BR.
const BALL_SLOTS = [
  { x: -3.70, y: 1.93, z: 0.06 }, { x: -1.33, y: 1.93, z: 0.06 },
  { x: -3.70, y: 0.00, z: 0.06 }, { x: -1.33, y: 0.00, z: 0.06 },
  { x: -3.70, y: -1.93, z: 0.06 }, { x: -1.33, y: -1.93, z: 0.06 },
];

/* A kit item is one customized object dropped into the box's upper-right:
 *   shape   — GolfballViewer model key ('chip' | 'divot' | 'bartender')
 *   x,y,z   — slot center (box-local)
 *   radius  — for round items (chips): target box-local disc radius (model scaled to it)
 *   scale   — for irregular tools: direct box-local scale factor (matches the foam recess)
 *   rz      — in-plane angle (deg) the item is rotated to (tools lie diagonally)
 *   decal   — true → project the shared logo onto its print face / marker disc
 * (The 2 ball-marker spots in the divot/bartender sets are left empty for now —
 *  no marker model yet — so they're not listed as kit items.)
 */
export const SIX_BALL_POKER_CHIP = {
  boxModel: BOX_MODELS.sixBallPokerChip,
  ballRadius: 0.86,
  ballSlots: BALL_SLOTS,
  kitItems: [
    { shape: 'chip', x: 1.26, y: 1.84, z: -0.02, radius: 0.82, decal: true },
    { shape: 'chip', x: 3.28, y: 0.27, z: -0.02, radius: 0.82, decal: true },
  ],
};
// The 2 round recesses next to the tool hold customized chrome ball markers
// (steel rim + white center print). Positions match the MARK slots cut in the box.
// z = -0.01 so the disc sits slightly PROUD of the foam (top above the surface);
// any deeper and the near foam-rim occludes the lower half of the printed logo.
const MARKER_SLOTS = [
  { shape: 'marker', x: 1.30, y: 2.00, z: -0.01, radius: 0.40, decal: true },
  { shape: 'marker', x: 4.10, y: 0.60, z: -0.01, radius: 0.40, decal: true },
];
export const SIX_BALL_LEVER = {
  boxModel: BOX_MODELS.sixBallLever,
  ballRadius: 0.86,
  ballSlots: BALL_SLOTS,
  kitItems: [
    // Matched to the reference photo via render-overlay; the foam recess is cut with
    // the SAME viewer-frame tool at these exact params, so the tool sits in its slot.
    { shape: 'divot', x: 2.7, y: 1.3, z: -0.13, rz: -35, scale: 0.58, decal: true },
    ...MARKER_SLOTS,
  ],
};
export const SIX_BALL_BARTENDER = {
  boxModel: BOX_MODELS.sixBallBartender,
  ballRadius: 0.86,
  ballSlots: BALL_SLOTS,
  kitItems: [
    { shape: 'bartender', x: 2.7, y: 1.3, z: -0.13, rz: -35, scale: 0.62, decal: true },
    ...MARKER_SLOTS,
  ],
};

/* Premium-wood variants — byte-identical foam layout to the black-box sets above
   (same balls, tees, kit recesses), only the box model swaps to the wood-frame OBJ. */
export const PREMIUM_WOOD_POKER_CHIP = { ...SIX_BALL_POKER_CHIP, boxModel: BOX_MODELS.premiumWoodPoker };
export const PREMIUM_WOOD_LEVER = { ...SIX_BALL_LEVER, boxModel: BOX_MODELS.premiumWoodLever };

/* What's physically in the set, parsed from a normalized gift-set option (see
   normalizeBundleOption in giftSets.js). Returns the set KIND or null for sets this
   module can't lay out yet (so callers fall back to the single-item preview). */
export function parseGiftSetContents(option) {
  if (!option) return null;
  const hay = [
    option.name, option.giftSetType, option.friendly, option.wrapperImage,
    ...((option.descriptions || []).flatMap((d) => [d && d.text, ...((d && d.subtext) || [])])),
  ].filter(Boolean).join(' ').toLowerCase();
  const balls = option.ballsPerSet || Math.round((option.oiq || 0) * 12) || 0;
  const wood = /\bwood\b|premium\s*wood|walnut|wooden/.test(hay);
  let kind = null;
  if (/poker[\s-]?chip/.test(hay)) kind = 'pokerChip';
  else if (/bartender/.test(hay)) kind = 'bartender';   // bartender divot tool
  else if (/lever/.test(hay) || /divot/.test(hay)) kind = 'lever';
  if (!kind) return null;
  return { balls, kind, wood };
}

/* Resolve the 3D layout for a chosen gift-set option, or null if unsupported
   (→ plain ball preview). Only the 6-ball black-box sets are modeled today. */
export function giftSetLayout(option) {
  const c = parseGiftSetContents(option);
  if (!c || c.balls !== 6) return null;
  // Premium-wood SKUs reuse the same foam layouts with a wood-frame box. (Only
  // poker + lever/divot wood frames are modeled; a wood bartender maps to the
  // wood lever-divot frame since they share the tool recess.)
  if (c.wood) {
    if (c.kind === 'pokerChip') return PREMIUM_WOOD_POKER_CHIP;
    if (c.kind === 'lever' || c.kind === 'bartender') return PREMIUM_WOOD_LEVER;
  }
  if (c.kind === 'pokerChip') return SIX_BALL_POKER_CHIP;
  if (c.kind === 'lever') return SIX_BALL_LEVER;
  if (c.kind === 'bartender') return SIX_BALL_BARTENDER;
  return null;
}
