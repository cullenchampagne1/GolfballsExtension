import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  FULL_HEIGHT_LIST_PAGE_CSS,
  nextProgressiveResultCount,
  opportunityStageTone,
  paginateCustomPageRows,
  searchRailIsFloating,
  searchRailTransitionSeconds,
  smartSearchBarVisible,
} from '../../src/lib/customPageLayout.js';

describe('custom page layout · detail table pagination', () => {
  it('keeps every materialized task or opportunity reachable in ten-row pages', () => {
    const rows = Array.from({ length: 23 }, (_, id) => ({ id }));
    const second = paginateCustomPageRows(rows, 2);

    assert.deepEqual(second.rows.map((row) => row.id), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    assert.deepEqual(
      { page: second.page, pageCount: second.pageCount, start: second.start, end: second.end, total: second.total },
      { page: 2, pageCount: 3, start: 11, end: 20, total: 23 },
    );
  });

  it('clamps a stale page after rows shrink and handles an empty table', () => {
    const clamped = paginateCustomPageRows(Array.from({ length: 12 }, (_, id) => id), 99);
    assert.equal(clamped.page, 2);
    assert.deepEqual(clamped.rows, [10, 11]);

    const empty = paginateCustomPageRows([], 4);
    assert.deepEqual(
      { page: empty.page, pageCount: empty.pageCount, start: empty.start, end: empty.end },
      { page: 1, pageCount: 1, start: 0, end: 0 },
    );
  });
});

describe('custom page layout · full-height list pages', () => {
  it('fills the content viewport while keeping table scrolling internal', () => {
    assert.match(FULL_HEIGHT_LIST_PAGE_CSS, /\.gbcp-content\s*\{[^}]*height:\s*calc\(100% - 48px\)/s);
    assert.match(FULL_HEIGHT_LIST_PAGE_CSS, /\.gbcp-fill-results\s*\{[^}]*flex:\s*1 1 auto/s);
    assert.match(FULL_HEIGHT_LIST_PAGE_CSS, /\.gbcp-fill-table\s*\{[^}]*overflow:\s*auto/s);
  });

  it('lets the table shrink when the selection action rail grows', () => {
    assert.match(FULL_HEIGHT_LIST_PAGE_CSS, /\.gbcp-fill-main\s*\{[^}]*min-height:\s*0/s);
    assert.match(FULL_HEIGHT_LIST_PAGE_CSS, /\.gbcp-fill-table\s*\{[^}]*min-height:\s*0/s);
  });
});

describe('custom page layout · opportunity stage treatment', () => {
  it('gives only the Open stage the active opportunity tone', () => {
    assert.equal(opportunityStageTone('Open'), 'success');
    assert.equal(opportunityStageTone(' open '), 'success');
    assert.equal(opportunityStageTone('Qualified'), 'info');
    assert.equal(opportunityStageTone('Won'), 'info');
    assert.equal(opportunityStageTone(null), 'info');
  });
});

describe('custom page layout · smart CRM Search bar', () => {
  it('hides on deliberate downward scroll and returns on upward intent', () => {
    assert.equal(smartSearchBarVisible({ currentTop: 90, previousTop: 70, visible: true }), false);
    assert.equal(smartSearchBarVisible({ currentTop: 70, previousTop: 90, visible: false }), true);
  });

  it('stays visible at the top, while focused, and through trackpad noise', () => {
    assert.equal(smartSearchBarVisible({ currentTop: 8, previousTop: 40, visible: false }), true);
    assert.equal(smartSearchBarVisible({ currentTop: 100, previousTop: 80, visible: true, focused: true }), true);
    assert.equal(smartSearchBarVisible({ currentTop: 102, previousTop: 100, visible: false }), false);
  });

  it('uses the settled shape at the page top and the floating shape after movement', () => {
    assert.equal(searchRailIsFloating({ currentTop: 0 }), false);
    assert.equal(searchRailIsFloating({ currentTop: 4 }), false);
    assert.equal(searchRailIsFloating({ currentTop: 5 }), true);
    assert.equal(searchRailIsFloating({ currentTop: -12 }), false);
  });

  it('matches entrance time to the complete delayed exit time', () => {
    assert.equal(searchRailTransitionSeconds({ visible: true }), 0.8);
    assert.equal(searchRailTransitionSeconds({ visible: false }), 0.48);
    assert.equal(searchRailTransitionSeconds({
      visible: true,
      exitDelayMs: 200,
      motionSeconds: 0.4,
    }), 0.6000000000000001);
  });
});

describe('custom page layout · progressive CRM result mounting', () => {
  it('adds one bounded DOM batch near the end of the page', () => {
    assert.equal(nextProgressiveResultCount({ total: 100, current: 24, nearEnd: true }), 44);
    assert.equal(nextProgressiveResultCount({ total: 100, current: 44, nearEnd: true }), 64);
  });

  it('does not grow away from the page end and caps the final batch', () => {
    assert.equal(nextProgressiveResultCount({ total: 100, current: 24, nearEnd: false }), 24);
    assert.equal(nextProgressiveResultCount({ total: 31, current: 24, nearEnd: true }), 31);
    assert.equal(nextProgressiveResultCount({ total: 31, current: 31, nearEnd: true }), 31);
  });
});
