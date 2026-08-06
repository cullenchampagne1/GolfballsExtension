/**
 * Unit tests — src/lib/recentOrdersScan.js
 *
 * The storage key stays pinned so persisted watermarks survive updates; the
 * audience builder makes the signed-in-rep query independently testable. The
 * `fq` form exists for the background sweep, which has no Query Builder to
 * compile through — so the interesting test is that it says the same thing.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildRecentOrdersConditions,
  buildRecentOrdersFq,
  recentOrdersSinceDay,
  RECENT_ORDERS_LOOKBACK_DAYS,
  SCAN_LAST_RUN_KEY,
} from '../../src/lib/recentOrdersScan.js';

const crmSearchSource = await readFile(
  new URL('../../src/modals/CRMSearch.jsx', import.meta.url),
  'utf8',
);
const queryBuilderSource = await readFile(
  new URL('../../src/modals/QueryBuilder.jsx', import.meta.url),
  'utf8',
);

describe('SCAN_LAST_RUN_KEY', () => {
  it('stays pinned to the persisted storage key already written to users', () => {
    assert.equal(SCAN_LAST_RUN_KEY, 'gbScanRecentOrders_lastRun');
  });
});

describe('recent-order scan audience', () => {
  it('targets contacts assigned to the authenticated rep plus the scan date', () => {
    assert.deepEqual(buildRecentOrdersConditions('22', '2026-08-01', 'test'), [
      { id: 'scan_type_test', fieldKey: 'recordType_s', op: 'is', val: 'Contact' },
      { id: 'scan_rep_test', fieldKey: 'salesRepID_s', op: 'is', val: '22' },
      { id: 'scan_date_test', fieldKey: 'lastOrderDate_dt', op: 'after', val: '2026-08-01' },
    ]);
  });

  // The bug both callers shipped with: keyed on the rep's NAME, which has to
  // match the index's spelling exactly. The name resolvable on a CRM page is
  // routinely a first name only, so the search matched no contact at all and
  // the tracker stayed empty. A name must never reach this query again.
  it('keys the rep clause on the id, never on a name', () => {
    const [, rep] = buildRecentOrdersConditions('22', '2026-08-01', 'test');
    assert.equal(rep.fieldKey, 'salesRepID_s');
    assert.throws(() => buildRecentOrdersConditions('Cullen Champagne', '2026-08-01'), /employee id/);
    assert.throws(() => buildRecentOrdersConditions('Cullen', '2026-08-01'), /employee id/);
  });

  it('refuses an absent/malformed employee id or scan date', () => {
    assert.throws(() => buildRecentOrdersConditions('', '2026-08-01'), /employee id/);
    assert.throws(() => buildRecentOrdersConditions('0', '2026-08-01'), /employee id/);
    assert.throws(() => buildRecentOrdersConditions('rep_22', '2026-08-01'), /employee id/);
    assert.throws(() => buildRecentOrdersConditions('22', '2026-02-31'), /scan date/);
  });

  it('resolves the authenticated user instead of requiring a saved My Clients query', () => {
    const start = crmSearchSource.indexOf('/* "Scan for recent orders"');
    const end = crmSearchSource.indexOf('\n  return (', start);
    const action = crmSearchSource.slice(start, end);
    assert.match(action, /resolveCurrentUserContext\(\)/);
    assert.match(action, /currentUser\.employeeId/);
    assert.match(action, /buildRecentOrdersConditions\(employeeId, sinceStr\)/);
    assert.doesNotMatch(action, /loadSavedQueries|compileGroupsToSolr|No “My Clients” filter/);
  });

  // The rep's name is still worth showing on the filter chip; it just cannot be
  // what the search is keyed by. Passing it into the builder is the regression.
  it('keeps the name for the chip label and out of the conditions', () => {
    const start = crmSearchSource.indexOf('/* "Scan for recent orders"');
    const end = crmSearchSource.indexOf('\n  return (', start);
    const action = crmSearchSource.slice(start, end);
    assert.match(action, /label: currentUser\.employeeName/);
    assert.doesNotMatch(action, /buildRecentOrdersConditions\(\s*(?:currentUser\.)?employeeName/);
  });
});

describe('recent-order audience as a Solr fq', () => {
  it('compiles the three clauses the search actually runs', () => {
    assert.equal(
      buildRecentOrdersFq('22', '2026-08-01'),
      'recordType_s:Contact AND salesRepID_s:22'
      + ' AND lastOrderDate_dt:[2026-08-01T00:00:00Z TO *]',
    );
  });

  it('renders each operator exactly as the Query Builder compiler still does', () => {
    // The modal compiles the SAME conditions through compileToSolr, so if that
    // rendering moves, the background sweep's copy has silently drifted and the
    // two callers stop searching the same audience. QueryBuilder.jsx is JSX and
    // cannot be imported here, so its source is the pin.
    assert.match(
      queryBuilderSource,
      /case 'is':\s*out = v \? `\$\{k\}:\$\{qbQuote\(v\)\}` : null;/,
    );
    assert.match(
      queryBuilderSource,
      /case 'after':\s*out = v \? `\$\{k\}:\[\$\{v\}T00:00:00Z TO \*\]` : null;/,
    );
    assert.match(
      queryBuilderSource,
      /function qbQuote\(v\) \{ return v\.includes\(' '\) \? `"\$\{v\}"` : v; \}/,
    );
  });

  it('refuses the same bad inputs the condition builder refuses', () => {
    assert.throws(() => buildRecentOrdersFq('', '2026-08-01'), /employee id/);
    assert.throws(() => buildRecentOrdersFq('22', '08/01/2026'), /scan date/);
  });
});

describe('recentOrdersSinceDay', () => {
  const now = Date.UTC(2026, 7, 5, 18, 30, 0); // 2026-08-05T18:30Z

  it('resumes from the previous run’s day, keeping a same-day overlap', () => {
    assert.equal(recentOrdersSinceDay(Date.UTC(2026, 7, 3, 9, 15, 0), now), '2026-08-03');
  });

  it('reaches back a week when there is no watermark yet', () => {
    assert.equal(recentOrdersSinceDay(null, now), '2026-07-29');
    assert.equal(recentOrdersSinceDay(0, now), '2026-07-29');
    assert.equal(RECENT_ORDERS_LOOKBACK_DAYS, 7);
  });

  it('clamps a watermark from the future to today rather than scanning nothing', () => {
    assert.equal(recentOrdersSinceDay(now + 30 * 86_400_000, now), '2026-08-05');
  });
});
