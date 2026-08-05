/**
 * Unit tests — src/lib/recentOrdersScan.js
 *
 * The storage key stays pinned so persisted watermarks survive updates; the
 * audience builder makes the signed-in-rep query independently testable.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildRecentOrdersConditions, SCAN_LAST_RUN_KEY } from '../../src/lib/recentOrdersScan.js';

const crmSearchSource = await readFile(
  new URL('../../src/modals/CRMSearch.jsx', import.meta.url),
  'utf8',
);

describe('SCAN_LAST_RUN_KEY', () => {
  it('stays pinned to the persisted storage key already written to users', () => {
    assert.equal(SCAN_LAST_RUN_KEY, 'gbScanRecentOrders_lastRun');
  });
});

describe('recent-order scan audience', () => {
  it('targets contacts assigned to the authenticated rep plus the scan date', () => {
    assert.deepEqual(buildRecentOrdersConditions('Cullen Champagne', '2026-08-01', 'test'), [
      { id: 'scan_type_test', fieldKey: 'recordType_s', op: 'is', val: 'Contact' },
      { id: 'scan_rep_test', fieldKey: 'salesRep_s', op: 'is', val: 'Cullen Champagne' },
      { id: 'scan_date_test', fieldKey: 'lastOrderDate_dt', op: 'after', val: '2026-08-01' },
    ]);
  });

  it('refuses an absent/unverified name or malformed scan date', () => {
    assert.throws(() => buildRecentOrdersConditions('Unknown', '2026-08-01'), /employee name/);
    assert.throws(() => buildRecentOrdersConditions('Cullen Champagne', '2026-02-31'), /scan date/);
  });

  it('resolves the authenticated user instead of requiring a saved My Clients query', () => {
    const start = crmSearchSource.indexOf('/* "Scan for recent orders"');
    const end = crmSearchSource.indexOf('\n  return (', start);
    const action = crmSearchSource.slice(start, end);
    assert.match(action, /resolveCurrentUserContext\(\)/);
    assert.match(action, /currentUser\.sessionVerified/);
    assert.match(action, /buildRecentOrdersConditions\(employeeName, sinceStr\)/);
    assert.doesNotMatch(action, /loadSavedQueries|compileGroupsToSolr|No “My Clients” filter/);
  });
});
