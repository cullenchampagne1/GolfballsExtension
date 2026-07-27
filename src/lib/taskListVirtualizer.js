/* Pure windowing math for the Task List. The CRM response remains available
 * for filtering, selection, exports, and custom-action context, while React
 * mounts only the rows intersecting the scroll viewport plus a small buffer. */

export const TASK_LIST_ROW_HEIGHT = 52;
export const TASK_LIST_OVERSCAN = 8;

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function taskListVirtualWindow({
  rowCount,
  scrollTop,
  viewportHeight,
  rowHeight = TASK_LIST_ROW_HEIGHT,
  overscan = TASK_LIST_OVERSCAN,
} = {}) {
  const count = Math.max(0, Math.floor(finiteNumber(rowCount, 0)));
  const height = Math.max(1, finiteNumber(rowHeight, TASK_LIST_ROW_HEIGHT));
  const viewport = Math.max(1, finiteNumber(viewportHeight, height));
  const top = Math.max(0, finiteNumber(scrollTop, 0));
  const buffer = Math.max(0, Math.floor(finiteNumber(overscan, TASK_LIST_OVERSCAN)));

  if (count === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      mountedCount: 0,
      totalHeight: 0,
    };
  }

  const firstVisible = Math.min(count - 1, Math.floor(top / height));
  const visibleCount = Math.max(1, Math.ceil(viewport / height) + 1);
  const startIndex = Math.max(0, firstVisible - buffer);
  const endIndex = Math.min(count, firstVisible + visibleCount + buffer);

  return {
    startIndex,
    endIndex,
    mountedCount: endIndex - startIndex,
    totalHeight: count * height,
  };
}
