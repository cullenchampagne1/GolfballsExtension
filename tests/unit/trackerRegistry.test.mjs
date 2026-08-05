/** Trackers — registry contract: validation, matching, and the three clocks.
 *
 * The registry is pure on purpose, so every schedule decision here is checked
 * against a fixed clock rather than a timer.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import '../../lib/tracker-registry.js';
import '../../lib/tracker-definitions.js';

const registry = globalThis.GBTrackerRegistry;
const MINUTE = 60_000;
const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);

/** A throwaway tracker with both a refresh policy and a capture. */
function fixtureTracker(overrides = {}) {
  return registry.define({
    id: 'fixture-deals',
    label: 'Fixture deals',
    kind: 'intercept',
    recordKind: 'deal',
    identify: (raw) => raw.externalId,
    captures: [{
      id: 'created',
      method: 'GET',
      match: /\/crm\/Admin\/Fixture\/Create\.ajax/i,
      extract: ({ at }) => ({ externalId: 'D-1', at, title: 'Fixture', status: 'open' }),
    }],
    refresh: {
      everyMinutes: 60,
      batchSize: 2,
      request: (record) => ({ url: `https://api.golfballs.com/${record.externalId}` }),
      apply: (_record, payload) => payload,
      settled: (record) => record.status === 'closed',
    },
    ...overrides,
  });
}

describe('tracker registry · definitions', () => {
  beforeEach(() => {
    registry.clear();
  });

  it('rejects an intercept tracker that declares no capture', () => {
    assert.throws(
      () => registry.define({ id: 'broken', kind: 'intercept' }),
      /at least one capture/,
    );
  });

  it('rejects a poll tracker with no collect function', () => {
    assert.throws(
      () => registry.define({ id: 'broken-poll', kind: 'poll', poll: { everyMinutes: 5 } }),
      /poll\.collect/,
    );
  });

  it('rejects a refresh policy that cannot say when a record is settled', () => {
    assert.throws(
      () => fixtureTracker({
        refresh: {
          everyMinutes: 10,
          request: () => ({ url: 'https://api.golfballs.com/x' }),
          apply: () => ({}),
        },
      }),
      /refresh\.settled/,
    );
  });

  it('gives the page hook serializable rules, since a RegExp cannot cross postMessage', () => {
    fixtureTracker();
    const [rule] = registry.captureRules();
    assert.equal(rule.trackerId, 'fixture-deals');
    assert.equal(rule.captureId, 'created');
    assert.equal(rule.method, 'GET');
    assert.equal(typeof rule.source, 'string');
    assert.ok(new RegExp(rule.source, rule.flags).test(
      'https://api.golfballs.com/golfballs/crm/Admin/Fixture/Create.ajax?%7B%7D',
    ));
  });

  it('matches a request by url and method, and ignores the wrong verb', () => {
    fixtureTracker();
    const url = 'https://api.golfballs.com/golfballs/crm/Admin/Fixture/Create.ajax?1';
    assert.equal(registry.matchRequest({ url, method: 'GET' }).length, 1);
    assert.equal(registry.matchRequest({ url, method: 'POST' }).length, 0);
    assert.equal(registry.matchRequest({ url: 'https://api.golfballs.com/other' }).length, 0);
  });
});

describe('tracker registry · records', () => {
  beforeEach(() => {
    registry.clear();
  });

  it('keys a record by tracker and external id so three sources make one row', () => {
    const tracker = fixtureTracker();
    const record = registry.normalizeRecord(
      tracker, { externalId: 'OPP-9', title: 'Spring order', status: 'open', value: '1250.5' },
      { now: NOW },
    );
    assert.equal(record.id, 'fixture-deals:OPP-9');
    assert.equal(record.externalId, 'OPP-9');
    assert.equal(record.value, 1250.5);
    assert.equal(record.capturedAt, NOW);
    assert.equal(record.nextRefreshAt, NOW + 60 * MINUTE);
    assert.equal(record.settled, false);
  });

  it('drops a record with no external id rather than storing an anonymous row', () => {
    const tracker = fixtureTracker();
    assert.equal(registry.normalizeRecord(tracker, { title: 'No id' }, { now: NOW }), null);
  });

  it('bounds the field bag so an extractor cannot spill a whole CRM response into storage', () => {
    const tracker = fixtureTracker();
    const data = { keep: 'yes', long: 'x'.repeat(4_000), nested: { no: 1 }, bad: null };
    for (let i = 0; i < 60; i += 1) data[`field${i}`] = i;
    const record = registry.normalizeRecord(tracker, { externalId: 'A', data }, { now: NOW });
    assert.equal(record.data.long.length, registry.LIMITS.maxTextLength);
    assert.equal(record.data.nested, undefined);
    assert.equal(record.data.bad, undefined);
    assert.ok(Object.keys(record.data).length <= registry.LIMITS.maxDataKeys);
  });

  it('keeps the first-seen time and the richer title when a poll re-sees a captured row', () => {
    const tracker = fixtureTracker();
    const captured = registry.normalizeRecord(
      tracker, { externalId: 'OPP-9', title: 'Spring order', data: { stage: '1' } },
      { source: 'intercept', now: NOW },
    );
    const polled = registry.normalizeRecord(
      tracker, { externalId: 'OPP-9', title: '', data: { salesRep: 'Cullen' } },
      { source: 'poll', now: NOW + MINUTE },
    );
    const merged = registry.mergeRecord(captured, polled);
    assert.equal(merged.capturedAt, NOW);
    assert.equal(merged.updatedAt, NOW + MINUTE);
    assert.equal(merged.title, 'Spring order');
    assert.equal(merged.source, 'intercept');
    assert.deepEqual(merged.data, { stage: '1', salesRep: 'Cullen' });
  });
});

describe('tracker registry · the refresh clock', () => {
  beforeEach(() => {
    registry.clear();
  });

  it('asks about a record only once its own next-check time has passed', () => {
    const tracker = fixtureTracker();
    const record = registry.normalizeRecord(tracker, { externalId: 'A' }, { now: NOW });
    assert.deepEqual(registry.dueRefreshes(tracker, [record], NOW + 59 * MINUTE), []);
    assert.equal(registry.dueRefreshes(tracker, [record], NOW + 61 * MINUTE).length, 1);
  });

  it('spends at most one batch per sweep, oldest due first', () => {
    const tracker = fixtureTracker();
    const records = ['A', 'B', 'C', 'D'].map((id, index) => ({
      ...registry.normalizeRecord(tracker, { externalId: id }, { now: NOW }),
      nextRefreshAt: NOW + index,
    }));
    const due = registry.dueRefreshes(tracker, records, NOW + 10 * MINUTE);
    assert.equal(due.length, 2, 'batchSize bounds the sweep');
    assert.deepEqual(due.map((record) => record.externalId), ['A', 'B']);
  });

  it('stops asking about an opportunity once someone else closed it', () => {
    // The case this whole clock exists for: we never close it ourselves, so no
    // request of ours would ever tell us.
    const tracker = fixtureTracker();
    const record = registry.normalizeRecord(tracker, { externalId: 'OPP-9', status: 'open' }, { now: NOW });
    const refreshed = registry.applyRefresh(tracker, record, {
      patch: { status: 'closed' }, now: NOW + 61 * MINUTE,
    });
    assert.equal(refreshed.status, 'closed');
    assert.equal(refreshed.settled, true);
    assert.equal(refreshed.nextRefreshAt, null);
    assert.deepEqual(registry.dueRefreshes(tracker, [refreshed], NOW + 999 * MINUTE), []);
  });

  it('re-arms an unsettled record for one more cadence after a good answer', () => {
    const tracker = fixtureTracker();
    const record = registry.normalizeRecord(tracker, { externalId: 'A', status: 'open' }, { now: NOW });
    const at = NOW + 61 * MINUTE;
    const refreshed = registry.applyRefresh(tracker, record, { patch: { status: 'open' }, now: at });
    assert.equal(refreshed.settled, false);
    assert.equal(refreshed.nextRefreshAt, at + 60 * MINUTE);
    assert.equal(refreshed.refreshedAt, at);
    assert.equal(refreshed.refreshFailures, 0);
  });

  it('backs off geometrically while the CRM is failing, then gives the record up', () => {
    const tracker = fixtureTracker({
      refresh: {
        everyMinutes: 60,
        maxFailures: 3,
        request: () => ({ url: 'https://api.golfballs.com/x' }),
        apply: () => null,
        settled: (record) => record.status === 'closed',
      },
    });
    let record = registry.normalizeRecord(tracker, { externalId: 'A' }, { now: NOW });
    record = registry.applyRefresh(tracker, record, { failed: true, now: NOW });
    assert.equal(record.nextRefreshAt, NOW + 60 * MINUTE * 2);
    record = registry.applyRefresh(tracker, record, { failed: true, now: NOW });
    assert.equal(record.nextRefreshAt, NOW + 60 * MINUTE * 4);
    assert.equal(record.settled, false);
    record = registry.applyRefresh(tracker, record, { failed: true, now: NOW });
    assert.equal(record.settled, true, 'a permanently broken row stops costing requests');
  });

  it('holds a poll sweep until its interval has elapsed', () => {
    const tracker = registry.define({
      id: 'fixture-orders',
      kind: 'poll',
      poll: { everyMinutes: 15, collect: async () => [] },
    });
    assert.equal(registry.pollDue(tracker, NOW, NOW + 14 * MINUTE), false);
    assert.equal(registry.pollDue(tracker, NOW, NOW + 15 * MINUTE), true);
    assert.equal(registry.pollDue(tracker, 0, NOW), true, 'never polled is always due');
  });
});

describe('tracker registry · retention', () => {
  beforeEach(() => {
    registry.clear();
  });

  it('keeps the newest rows, drops the aged-out ones, and never duplicates an id', () => {
    const tracker = fixtureTracker({ retention: { maxRecords: 2, maxAgeDays: 30 } });
    const make = (externalId, updatedAt) => ({
      ...registry.normalizeRecord(tracker, { externalId }, { now: NOW }), updatedAt,
    });
    const kept = registry.retain(tracker, [
      make('A', NOW - MINUTE),
      make('B', NOW - 2 * MINUTE),
      make('C', NOW - 31 * 86_400_000),
      make('A', NOW),
    ], NOW);
    assert.deepEqual(kept.map((record) => record.externalId), ['A', 'B']);
    assert.equal(kept[0].updatedAt, NOW);
  });
});

describe('tracker definitions · shipped trackers', () => {
  it('registers opportunities, proposals, and recent orders', () => {
    registry.clear();
    delete globalThis.GBTrackerDefinitions;
    return import(`../../lib/tracker-definitions.js?reload=${Date.now()}`).then(() => {
      assert.deepEqual(
        registry.list().map((tracker) => tracker.id).sort(),
        ['opportunities', 'proposals', 'recent-orders'],
      );
      assert.equal(registry.get('opportunities').kind, 'intercept');
      assert.equal(registry.get('recent-orders').kind, 'poll');
      // Proposals are documents, not lifecycles — nothing changes behind our
      // back, so they carry no refresh clock.
      assert.equal(registry.get('proposals').refresh, null);
    });
  });

  it('reads an opportunity id and stage out of the CRM create exchange', () => {
    const tracker = registry.get('opportunities');
    const [created] = tracker.captures;
    const raw = created.extract({
      url: `https://api.golfballs.com/golfballs/crm/Admin/Opportunity/Create.ajax?${encodeURIComponent(JSON.stringify({ Subject: 'Spring gift order', contactId: 4821 }))}`,
      responseBody: JSON.stringify({ d: JSON.stringify({ opportunityId: '90210', OpportunityStageId: 1, EstimatedValue: '4300' }) }),
      at: NOW,
    });
    assert.equal(raw.externalId, '90210');
    assert.equal(raw.title, 'Spring gift order');
    assert.equal(raw.status, 'open');
    assert.equal(raw.value, 4300);
    assert.equal(raw.data.contactId, '4821');
  });

  it('treats a terminal stage as closed, which is what settles the row', () => {
    const tracker = registry.get('opportunities');
    const record = registry.normalizeRecord(tracker, { externalId: '90210', status: 'open' }, { now: NOW });
    const patch = tracker.refresh.apply(record, { d: { OpportunityStageId: 5, Subject: 'Spring gift order' } });
    assert.equal(patch.status, 'closed');
    assert.equal(tracker.refresh.settled({ ...record, ...patch }), true);
  });
});
