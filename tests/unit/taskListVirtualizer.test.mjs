import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_LIST_ROW_HEIGHT,
  taskListVirtualWindow,
} from '../../src/lib/taskListVirtualizer.js';

describe('Task List virtualizer', () => {
  it('mounts only the viewport and overscan for a large task set', () => {
    const window = taskListVirtualWindow({
      rowCount: 10_000,
      scrollTop: TASK_LIST_ROW_HEIGHT * 4_000,
      viewportHeight: TASK_LIST_ROW_HEIGHT * 10,
      overscan: 8,
    });

    assert.equal(window.startIndex, 3_992);
    assert.equal(window.endIndex, 4_019);
    assert.equal(window.mountedCount, 27);
    assert.equal(window.totalHeight, 10_000 * TASK_LIST_ROW_HEIGHT);
  });

  it('keeps the first and last rows mounted at the scroll boundaries', () => {
    const first = taskListVirtualWindow({
      rowCount: 100,
      scrollTop: 0,
      viewportHeight: TASK_LIST_ROW_HEIGHT * 5,
      overscan: 2,
    });
    const last = taskListVirtualWindow({
      rowCount: 100,
      scrollTop: Number.MAX_SAFE_INTEGER,
      viewportHeight: TASK_LIST_ROW_HEIGHT * 5,
      overscan: 2,
    });

    assert.deepEqual(
      { start: first.startIndex, end: first.endIndex },
      { start: 0, end: 8 },
    );
    assert.equal(last.startIndex, 97);
    assert.equal(last.endIndex, 100);
  });

  it('returns an empty stable window for no rows and normalizes bad metrics', () => {
    assert.deepEqual(taskListVirtualWindow({
      rowCount: 0,
      scrollTop: Number.NaN,
      viewportHeight: Number.NaN,
    }), {
      startIndex: 0,
      endIndex: 0,
      mountedCount: 0,
      totalHeight: 0,
    });

    const normalized = taskListVirtualWindow({
      rowCount: 4,
      scrollTop: -500,
      viewportHeight: 0,
      overscan: -3,
    });
    assert.equal(normalized.startIndex, 0);
    assert.equal(normalized.endIndex, 2);
    assert.equal(normalized.totalHeight, 4 * TASK_LIST_ROW_HEIGHT);
  });
});
