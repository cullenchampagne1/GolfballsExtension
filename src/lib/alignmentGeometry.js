/* Coordinate helpers for image-alignment surfaces.
 *
 * Pointer events are reported in viewport pixels, while image transforms are
 * stored in the alignment surface's local CSS pixels. Those spaces diverge
 * whenever a modal is CSS-zoomed or temporarily transform-scaled during its
 * entrance animation. Keep the conversion shared so every alignment surface
 * behaves identically at every UI/page scale.
 */

function positive(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function elementVisualScale(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect) return { x: 1, y: 1, rect: null };

  // The visual rect includes borders, so compare it with offsetWidth/Height
  // (which do too). Using clientWidth here makes a 1px border look like an
  // extra fractional zoom and slowly drifts the alignment center.
  const layoutWidth = positive(element.offsetWidth, positive(element.clientWidth, rect.width));
  const layoutHeight = positive(element.offsetHeight, positive(element.clientHeight, rect.height));
  return {
    x: positive(rect.width / layoutWidth),
    y: positive(rect.height / layoutHeight),
    rect,
  };
}

export function clientPointToLocal(element, clientX, clientY) {
  const { x: scaleX, y: scaleY, rect } = elementVisualScale(element);
  if (!rect) return { x: 0, y: 0 };
  return {
    x: (clientX - rect.left) / scaleX - (element.clientLeft || 0),
    y: (clientY - rect.top) / scaleY - (element.clientTop || 0),
  };
}

export function clientDeltaToLocal(element, deltaX, deltaY) {
  const { x: scaleX, y: scaleY } = elementVisualScale(element);
  return {
    x: deltaX / scaleX,
    y: deltaY / scaleY,
  };
}

export function localPointToClient(element, localX, localY) {
  const { x: scaleX, y: scaleY, rect } = elementVisualScale(element);
  if (!rect) return { x: localX, y: localY };
  return {
    x: rect.left + (localX + (element.clientLeft || 0)) * scaleX,
    y: rect.top + (localY + (element.clientTop || 0)) * scaleY,
  };
}

export function measuredAlignmentGeometry(surface, image, ring) {
  const surfaceWidth = positive(surface?.clientWidth);
  const surfaceHeight = positive(surface?.clientHeight);
  const imageWidth = positive(image?.clientWidth, image?.naturalWidth);
  const imageHeight = positive(image?.clientHeight, image?.naturalHeight);
  const fallbackRing = Math.min(surfaceWidth, surfaceHeight * 0.7, 240);
  const ringDiameter = positive(ring?.clientWidth, fallbackRing);

  return {
    surfaceWidth,
    surfaceHeight,
    imageWidth,
    imageHeight,
    ringDiameter,
  };
}
