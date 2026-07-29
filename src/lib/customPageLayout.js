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
