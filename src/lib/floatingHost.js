/* Apply the shared UI-scale category to a floating mount root. A caller with
   its own presentation scale can explicitly pass null to avoid multiplying
   two independently managed zoom values. */
export function applyFloatingHostScale(host, scaleCategory = 'modals') {
  if (!host) return;
  if (scaleCategory) host.setAttribute('data-gb-scale', scaleCategory);
  else host.removeAttribute('data-gb-scale');
}
