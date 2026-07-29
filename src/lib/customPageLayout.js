/**
 * Height available to the CRM Search result scroller.
 *
 * The full-page takeover is rendered in PAGE_ZOOM coordinates. The fixed
 * chrome includes the top bar, content padding, search card, gaps, results
 * header, and the 24px desktop alignment offset above the search column.
 */
export function crmSearchResultsMax(viewportHeight, pageZoom = 1) {
  const height = Number.isFinite(Number(viewportHeight)) && Number(viewportHeight) > 0
    ? Number(viewportHeight)
    : 900;
  const zoom = Number.isFinite(Number(pageZoom)) && Number(pageZoom) > 0
    ? Number(pageZoom)
    : 1;
  return Math.max(340, Math.round(height / zoom) - 274);
}
