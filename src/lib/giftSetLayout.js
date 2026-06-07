/* giftSetLayout.js — gift-set 3D assembly data (pure data + parsers, no three.js).
 *
 * The catalog previews a single customized item (ball / chip / divot / bartender)
 * in 3D. A gift set is the assembled product: a presentation box with the
 * customized balls + chips sitting in its foam slots (+ a pack of tees). This
 * module supplies (1) which box model to load and (2) where every item sits, in
 * the box model's LOCAL coordinate space, so GolfballViewer's `giftset` mode can
 * clone the already-customized ball/chip/tee models into those slots.
 *
 * Coordinate space: matches assets/giftbox_model/GiftBox.obj exactly — exported
 * from Blender with NO axis conversion (up=Z, forward=Y), so +Z is the box
 * opening (up), origin = box center, units = the Blender model units (the foam
 * footprint is x ±5.0, y ±3.37; the box outer shell is x ±5.45, y ±3.82). Every
 * coordinate below was measured by blob-detecting the reference product photo and
 * verified against the rendered box. The tee pile is the exact per-instance
 * transform set baked out of the Blender scene (loc + XYZ Euler, radians).
 *
 * Scope (today): the 6-ball poker-chip black box. `giftSetLayout()` returns null
 * for any other set, so the catalog falls back to the plain ball preview. Adding
 * a new box = model it, export the OBJ, drop another entry in BOX_LAYOUTS keyed
 * by ball count + kit type. Nothing else changes.
 */

export const BOX_MODELS = {
  // The box model bakes in the tray walls, the cut foam (ball bowls + chip
  // recesses + tee well), AND the white tee pile — so the whole container is one
  // mesh and only the customized balls/chips get placed at runtime.
  sixBallPokerChip: 'assets/giftbox_model/GiftBox.obj',
};

/* The 6-ball poker-chip presentation box. Slot centers are where each item's
   CENTER sits (ball center, chip center). Radii are the target box-local radius
   each model is scaled to fill (ball ~0.86, chip ~0.82). */
export const SIX_BALL_POKER_CHIP = {
  boxModel: BOX_MODELS.sixBallPokerChip,
  ballRadius: 0.86,
  chipRadius: 0.82,
  // 2 cols × 3 rows, left side. Order: top-left, top-right, mid-left, mid-right,
  // bottom-left, bottom-right (so slicing to fewer balls keeps the top rows).
  ballSlots: [
    { x: -3.70, y: 1.93, z: 0.06 }, { x: -1.33, y: 1.93, z: 0.06 },
    { x: -3.70, y: 0.00, z: 0.06 }, { x: -1.33, y: 0.00, z: 0.06 },
    { x: -3.70, y: -1.93, z: 0.06 }, { x: -1.33, y: -1.93, z: 0.06 },
  ],
  // Staggered diagonally (upper-left chip, lower-right chip), upper-right area.
  chipSlots: [
    { x: 1.26, y: 1.84, z: -0.02 },
    { x: 3.28, y: 0.27, z: -0.02 },
  ],
  // NOTE: the tee pile + its inset well are BAKED into GiftBox.obj (white-tinted
  // vertices), not placed at runtime — tees are never customized, so baking them
  // into the one box model is simpler and guarantees the well/holes can't go
  // missing on export. Only the balls + chips are placed into the foam holes.
};

/* What's physically in the set, parsed from a normalized gift-set option
   (see normalizeBundleOption in giftSets.js). Returns null for sets this module
   can't lay out yet (anything that isn't a poker-chip set), so callers fall back
   to the single-item preview. */
export function parseGiftSetContents(option) {
  if (!option) return null;
  const hay = [
    option.name, option.giftSetType, option.friendly, option.wrapperImage,
    ...((option.descriptions || []).flatMap((d) => [d && d.text, ...((d && d.subtext) || [])])),
  ].filter(Boolean).join(' ').toLowerCase();
  // Only poker-chip sets are modeled today.
  if (!/poker[\s-]?chip/.test(hay)) return null;
  const balls = option.ballsPerSet || Math.round((option.oiq || 0) * 12) || 0;
  // Chip count: read "<n> poker chip(s)" from the copy, else the reference's 2.
  const m = /(\d+)\s*poker[\s-]?chip/.exec(hay);
  const chips = m ? Number(m[1]) : 2;
  return { balls, chips, chipShape: 'chip', tees: true };
}

/* Resolve the 3D layout for a chosen gift-set option. Returns
   { boxModel, ballRadius, chipRadius, ballSlots, chipSlots }
   sliced to the set's actual contents, or null if unsupported (→ plain preview). */
export function giftSetLayout(option) {
  const contents = parseGiftSetContents(option);
  if (!contents) return null;
  // Only the 6-ball poker-chip box is modeled for now.
  if (contents.balls !== 6) return null;
  const L = SIX_BALL_POKER_CHIP;
  return {
    boxModel: L.boxModel,
    ballRadius: L.ballRadius,
    chipRadius: L.chipRadius,
    ballSlots: L.ballSlots.slice(0, contents.balls),
    chipSlots: L.chipSlots.slice(0, contents.chips),
  };
}
