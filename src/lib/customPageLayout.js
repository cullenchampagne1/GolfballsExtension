/**
 * Opportunity stages share the normal informational treatment except for an
 * actively Open opportunity, which needs to stand out in dense CRM tables.
 */
export function opportunityStageTone(stage) {
  return String(stage ?? '').trim().toLowerCase() === 'open' ? 'success' : 'info';
}

/**
 * Bound the rows mounted by the shared CRM detail tables while keeping every
 * materialized native row reachable. The page is clamped after data changes so
 * completing/deleting the last row on a page cannot leave an empty view.
 */
export function paginateCustomPageRows(rows, page = 1, pageSize = 10) {
  const allRows = Array.isArray(rows) ? rows : [];
  const size = Math.max(1, Math.floor(Number(pageSize) || 10));
  const total = allRows.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(pageCount, Math.max(1, Math.floor(Number(page) || 1)));
  const offset = (currentPage - 1) * size;
  return {
    rows: allRows.slice(offset, offset + size),
    page: currentPage,
    pageCount,
    pageSize: size,
    total,
    start: total ? offset + 1 : 0,
    end: Math.min(offset + size, total),
  };
}

/**
 * CRM Search and Task List use the same viewport-filling two-column shell.
 * Keeping this CSS page-local prevents detail pages from inheriting list-only
 * height/overflow behavior.
 */
export const FULL_HEIGHT_LIST_PAGE_CSS = `
  .gbcp-content {
    height: calc(100% - 48px);
    min-height: 0;
    padding-bottom: 18px !important;
    overflow: hidden;
  }
  .gbcp-fill-grid {
    flex: 1 1 auto;
    height: 100%;
    min-height: 0;
    align-items: stretch !important;
  }
  .gbcp-fill-sidebar {
    height: 100%;
    min-height: 0;
    overflow: auto;
    padding: 0 2px 2px 0;
    position: static !important;
  }
  .gbcp-fill-main {
    height: 100%;
    min-height: 0;
    padding-top: 0 !important;
    gap: 6px !important;
  }
  .gbcp-fill-toolbar {
    flex: 0 0 auto;
    margin: 0 2px !important;
  }
  .gbcp-fill-results {
    flex: 1 1 auto;
    min-height: 0;
    margin-top: 0 !important;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .gbcp-fill-table {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }
  @media (max-width: 1060px) {
    .gbcp-content {
      height: auto;
      min-height: calc(100% - 48px);
      overflow: visible;
      padding-bottom: 44px !important;
    }
    .gbcp-fill-grid {
      flex: none;
      height: auto;
    }
    .gbcp-fill-sidebar {
      height: auto;
      overflow: visible;
      padding-right: 0;
    }
    .gbcp-fill-main {
      height: auto;
    }
    .gbcp-fill-results {
      min-height: 420px;
    }
    .gbcp-fill-table {
      flex: 0 0 auto;
      height: min(560px, calc(80vh - 200px));
      min-height: 240px;
    }
  }
`;

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
