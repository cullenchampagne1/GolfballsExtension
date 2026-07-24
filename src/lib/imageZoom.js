/* ───────────────────────────────────────────────────────────────
   imageZoom — pointer-anchored zoom math for the full image viewer.

   Zooming toward the CENTRE of the frame pushes whatever the user is
   looking at off to one side, so every step has to be followed by a
   pan back. Anchoring to the pointer keeps the detail under the
   cursor fixed while the rest of the image grows around it.

   The frame is measured in its own coordinates and the offset is a
   translate applied before the scale, so:

       screen = centre + offset + (point - centre) * zoom

   Solving that for a fixed screen position under the pointer gives
   the offset update in zoomToPoint().
─────────────────────────────────────────────────────────────── */

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;
/** One wheel notch / button press. */
export const ZOOM_WHEEL_STEP = 1.15;
export const ZOOM_BUTTON_STEP = 1.4;

export function clampZoom(value) {
  const zoom = Number(value);
  if (!Number.isFinite(zoom)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/**
 * Next {zoom, offset} for a zoom anchored at a point inside the frame.
 *
 * @param {object} state    { zoom, offset:{x,y} } — the current view
 * @param {number} nextZoom requested zoom, clamped internally
 * @param {object} point    pointer position in frame-local pixels, measured
 *                          from the frame's CENTRE. Omit to zoom centrally.
 */
export function zoomToPoint(state, nextZoom, point = { x: 0, y: 0 }) {
  const current = clampZoom(state?.zoom);
  const offset = state?.offset || { x: 0, y: 0 };
  const previous = {
    x: Number(offset.x) || 0,
    y: Number(offset.y) || 0,
  };
  const target = clampZoom(nextZoom);
  // Fully zoomed out always recentres — a stranded offset at 1x would leave
  // the image sitting off to one side with no way to tell why.
  if (target === ZOOM_MIN) return { zoom: ZOOM_MIN, offset: { x: 0, y: 0 } };
  if (target === current) return { zoom: current, offset: previous };
  const anchorX = Number(point?.x) || 0;
  const anchorY = Number(point?.y) || 0;
  const ratio = target / current;
  return {
    zoom: target,
    offset: {
      x: anchorX - (anchorX - previous.x) * ratio,
      y: anchorY - (anchorY - previous.y) * ratio,
    },
  };
}

/** Pointer position relative to the frame's centre, in frame pixels. */
export function framePoint(rect, clientX, clientY) {
  if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 };
  return {
    x: Number(clientX) - rect.left - rect.width / 2,
    y: Number(clientY) - rect.top - rect.height / 2,
  };
}

/** Wheel delta → the zoom it should produce. */
export function wheelZoom(current, deltaY) {
  return clampZoom(clampZoom(current) * (deltaY < 0 ? ZOOM_WHEEL_STEP : 1 / ZOOM_WHEEL_STEP));
}
