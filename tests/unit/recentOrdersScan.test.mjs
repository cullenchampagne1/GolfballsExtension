/**
 * Unit tests — src/lib/recentOrdersScan.js
 *
 * The module's only export is the chrome.storage key for the scan action's
 * last-run record. Pinning it guards persisted user data: renaming the key
 * would silently orphan every rep's stored last-run state.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SCAN_LAST_RUN_KEY } from '../../src/lib/recentOrdersScan.js';

describe('SCAN_LAST_RUN_KEY', () => {
  it('stays pinned to the persisted storage key already written to users', () => {
    assert.equal(SCAN_LAST_RUN_KEY, 'gbScanRecentOrders_lastRun');
  });
});
