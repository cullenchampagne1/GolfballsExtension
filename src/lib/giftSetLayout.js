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
  sixBallPokerChip: 'assets/giftbox_model/GiftBox.obj',
};
export const TEE_MODEL = 'assets/tee_model/Tee.obj';

/* The 6-ball poker-chip presentation box. Slot centers are where each item's
   CENTER sits (ball center, chip center). Radii are the target box-local radius
   each model is scaled to fill (ball ~0.86, chip ~0.82). */
export const SIX_BALL_POKER_CHIP = {
  boxModel: BOX_MODELS.sixBallPokerChip,
  teeModel: TEE_MODEL,
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
  // Inset tee well, lower-right. The pack: long tees lying straight along the
  // well's long axis (ry ≈ ±π/2), heads alternating, 2 stacked layers. Baked
  // verbatim from Blender so the preview matches the rendered box.
  teeInstances: [
    { x: 2.4357, y: -2.90, z: -0.3282, rx: 0.01039, ry: 1.5708, rz: -0.02601 },
    { x: 2.5753, y: -2.64, z: -0.3474, rx: 0.03375, ry: -1.5708, rz: -0.09737 },
    { x: 2.4434, y: -2.39, z: -0.3406, rx: -0.00297, ry: 1.5708, rz: 0.09913 },
    { x: 2.6511, y: -2.13, z: -0.3309, rx: -0.03494, ry: -1.5708, rz: 0.02781 },
    { x: 2.5785, y: -1.87, z: -0.3153, rx: 0.02413, ry: 1.5708, rz: 0.00464 },
    { x: 2.5917, y: -1.61, z: -0.3474, rx: 0.00911, ry: -1.5708, rz: 0.05165 },
    { x: 2.4585, y: -1.36, z: -0.3488, rx: -0.00273, ry: 1.5708, rz: 0.07311 },
    { x: 2.6088, y: -1.10, z: -0.3148, rx: 0.04211, ry: -1.5708, rz: 0.04283 },
    { x: 2.4838, y: -2.77, z: -0.1300, rx: 0.04356, ry: -1.5708, rz: -0.01108 },
    { x: 2.6967, y: -2.51, z: -0.1651, rx: -0.02830, ry: 1.5708, rz: -0.07281 },
    { x: 2.7348, y: -2.26, z: -0.1482, rx: -0.01990, ry: -1.5708, rz: 0.02533 },
    { x: 2.5332, y: -2.00, z: -0.1507, rx: 0.00851, ry: 1.5708, rz: -0.02982 },
    { x: 2.5671, y: -1.74, z: -0.1248, rx: 0.04289, ry: -1.5708, rz: 0.03640 },
    { x: 2.6868, y: -1.49, z: -0.1205, rx: -0.03369, ry: 1.5708, rz: 0.03425 },
    { x: 2.6887, y: -1.23, z: -0.1218, rx: 0.00691, ry: -1.5708, rz: 0.08094 },
  ],
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
   { boxModel, teeModel, ballRadius, chipRadius, ballSlots, chipSlots, teeInstances }
   sliced to the set's actual contents, or null if unsupported (→ plain preview). */
export function giftSetLayout(option) {
  const contents = parseGiftSetContents(option);
  if (!contents) return null;
  // Only the 6-ball poker-chip box is modeled for now.
  if (contents.balls !== 6) return null;
  const L = SIX_BALL_POKER_CHIP;
  return {
    boxModel: L.boxModel,
    teeModel: L.teeModel,
    ballRadius: L.ballRadius,
    chipRadius: L.chipRadius,
    ballSlots: L.ballSlots.slice(0, contents.balls),
    chipSlots: L.chipSlots.slice(0, contents.chips),
    teeInstances: contents.tees ? L.teeInstances : [],
  };
}
