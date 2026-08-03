/* Mark every floating host as an extension-owned UI boundary, then optionally
   apply the shared scale category. The root marker is deliberately independent
   of `data-gb-scale`: self-scaled surfaces (the gift catalog and Workflow
   Manager) still need the theme's host-CSS armor even though they must not
   inherit the shared modal zoom. */
export function applyFloatingHostScale(host, scaleCategory = 'modals') {
  if (!host) return;
  host.setAttribute('data-gb-ui-root', '');
  if (scaleCategory) host.setAttribute('data-gb-scale', scaleCategory);
  else host.removeAttribute('data-gb-scale');
}
