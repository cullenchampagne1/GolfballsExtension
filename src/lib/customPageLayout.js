/**
 * Opportunity stages share the normal informational treatment except for an
 * actively Open opportunity, which needs to stand out in dense CRM tables.
 */
export function opportunityStageTone(stage) {
  return String(stage ?? '').trim().toLowerCase() === 'open' ? 'success' : 'info';
}

/**
 * Resolve the smart CRM Search bar's visibility from scroll intent. Small
 * trackpad noise is ignored; deliberate downward movement hides the bar and
 * upward movement brings it back. The top of the page scroller always reveals
 * it, and a focused search field may never disappear underneath the user.
 */
export function smartSearchBarVisible({
  currentTop,
  previousTop,
  visible = true,
  focused = false,
  topReveal = 18,
  intentDelta = 4,
} = {}) {
  const current = Math.max(0, Number(currentTop) || 0);
  const previous = Math.max(0, Number(previousTop) || 0);
  if (focused || current <= topReveal) return true;
  if (current <= previous - intentDelta) return true;
  if (current >= previous + intentDelta && current > topReveal) return false;
  return !!visible;
}

/**
 * The CRM Search rail is visually part of the page at rest, then becomes a
 * floating surface once the page has moved. A small threshold avoids toggling
 * the shape because of sub-pixel trackpad/bounce noise at the top.
 */
export function searchRailIsFloating({
  currentTop,
  settleThreshold = 4,
} = {}) {
  const current = Math.max(0, Number(currentTop) || 0);
  const threshold = Math.max(0, Number(settleThreshold) || 0);
  return current > threshold;
}

/**
 * Match the perceived entrance time to an exit made of an intent delay plus
 * its motion. Entrance starts immediately and spans that combined interval;
 * exit keeps its separate delay and uses only the motion interval here.
 */
export function searchRailTransitionSeconds({
  visible,
  exitDelayMs = 320,
  motionSeconds = 0.48,
} = {}) {
  const motion = Math.max(0, Number(motionSeconds) || 0);
  const delay = Math.max(0, Number(exitDelayMs) || 0) / 1000;
  return visible ? motion + delay : motion;
}

/**
 * Grow a page-backed result list in predictable DOM-sized batches. The full
 * Solr page can stay cached in memory while React mounts only what the user is
 * close to seeing.
 */
export function nextProgressiveResultCount({
  total,
  current,
  nearEnd,
  initial = 24,
  batch = 20,
} = {}) {
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
  const safeInitial = Math.max(1, Math.floor(Number(initial) || 24));
  const safeBatch = Math.max(1, Math.floor(Number(batch) || 20));
  const safeCurrent = Math.min(
    safeTotal,
    Math.max(0, Math.floor(Number(current) || Math.min(safeInitial, safeTotal))),
  );
  if (!nearEnd || safeCurrent >= safeTotal) return safeCurrent;
  return Math.min(safeTotal, safeCurrent + safeBatch);
}
