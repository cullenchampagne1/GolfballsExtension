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
      // Neither do recent orders: the row records an order that already
      // happened, read out of the search index, and the CRM has no per-order
      // endpoint to re-ask. The next sweep is the only update.
      assert.equal(registry.get('recent-orders').refresh, null);
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

/* Recent orders are read out of the CRM SEARCH index — the only place this CRM
   admits an order happened — so the unit under test is "one contact row in, one
   order out", against rows shaped exactly like the ones CRM Search renders. */
describe('tracker definitions · recent orders', () => {
  const contactDoc = (overrides = {}) => ({
    id: 'contact_4421',
    recordType_s: 'Contact',
    contactName_t: 'Marcus Chen',
    accountName_t: 'Acme Industries',
    accountID_s: 'ACME-001',
    salesRep_s: 'Cullen Champagne',
    salesRepID_s: 'rep_22',
    podID_i: 3,
    role_s: 'AE',
    orderCount_i: 12,
    yearToDateRevenue_f: 8400,
    lastOrderDate_dt: '2026-08-04T00:00:00Z',
    nextTaskDate_dt: '2026-08-29T00:00:00Z',
    ...overrides,
  });

  const definitions = () => globalThis.GBTrackerDefinitions;

  it('reads the contact’s last order off the search row', () => {
    const raw = definitions().orderFromContactDoc(contactDoc(), { now: NOW });
    assert.equal(raw.externalId, '4421@2026-08-04');
    assert.equal(raw.at, Date.UTC(2026, 7, 4));
    assert.equal(raw.title, 'Marcus Chen · Acme Industries');
    assert.equal(raw.status, 'ordered');
    assert.equal(raw.data.contactId, '4421');
    assert.equal(raw.data.accountId, 'ACME-001');
    assert.equal(raw.data.salesRep, 'Cullen Champagne');
    assert.equal(raw.data.orderDate, '2026-08-04');
    assert.equal(raw.data.orderCount, 12);
  });

  it('leaves the order total empty, because the index does not carry one', () => {
    // yearToDateRevenue_f is on the row and is NOT this order's value; a
    // dashboard showing $8,400 for one order would be wrong, not approximate.
    const raw = definitions().orderFromContactDoc(contactDoc(), { now: NOW });
    assert.equal(raw.value, null);
  });

  it('keys an order by contact and day, so a re-listed contact is one row', () => {
    const first = definitions().orderFromContactDoc(contactDoc(), { now: NOW });
    const reListed = definitions().orderFromContactDoc(contactDoc(), { now: NOW + 3_600_000 });
    const ordersAgain = definitions().orderFromContactDoc(
      contactDoc({ lastOrderDate_dt: '2026-08-06T00:00:00Z', orderCount_i: 13 }),
      { now: NOW },
    );
    assert.equal(first.externalId, reListed.externalId);
    assert.notEqual(first.externalId, ordersAgain.externalId);
    assert.equal(ordersAgain.externalId, '4421@2026-08-06');
  });

  it('skips accounts and rows with no order date at all', () => {
    const account = contactDoc({ id: 'account_1187', recordType_s: 'Account', contactName_t: '' });
    assert.equal(definitions().orderFromContactDoc(account, { now: NOW }), null);
    assert.equal(
      definitions().orderFromContactDoc(contactDoc({ lastOrderDate_dt: null }), { now: NOW }),
      null,
    );
    assert.equal(
      definitions().orderFromContactDoc(contactDoc({ id: 'contact_' }), { now: NOW }),
      null,
    );
    assert.equal(definitions().orderFromContactDoc(null, { now: NOW }), null);
  });

  it('collects a sweep’s contact rows into order records', async () => {
    const tracker = registry.get('recent-orders');
    const asked = [];
    const collected = await tracker.poll.collect({
      since: Date.UTC(2026, 7, 1),
      now: NOW,
      crmContacts: async (request) => {
        asked.push(request);
        return {
          docs: [
            contactDoc(),
            contactDoc({ id: 'account_1187', recordType_s: 'Account' }), // dropped
            contactDoc({ id: 'contact_5223', contactName_t: 'Jordan Brown', accountName_t: '', lastOrderDate_dt: '2026-08-05T00:00:00Z' }),
          ],
          numFound: 3,
          complete: true,
        };
      },
    });
    assert.deepEqual(asked, [{ since: Date.UTC(2026, 7, 1), now: NOW }]);
    assert.deepEqual(
      collected.rows.map((row) => row.externalId),
      ['4421@2026-08-04', '5223@2026-08-05'],
    );
    assert.equal(collected.rows[1].title, 'Jordan Brown');
    // What it SAW, not just what it kept: the runtime's cursor rule is the
    // difference between "the window was empty" and "we could not read it".
    assert.equal(collected.seen, 3);
    assert.equal(collected.complete, true);
  });

  it('reports a truncated read as incomplete, so the cursor cannot step over it', async () => {
    const tracker = registry.get('recent-orders');
    const collected = await tracker.poll.collect({
      since: null,
      now: NOW,
      crmContacts: async () => ({ docs: [contactDoc()], numFound: 400, complete: false }),
    });
    assert.equal(collected.rows.length, 1);
    assert.equal(collected.seen, 1);
    assert.equal(collected.numFound, 400);
    assert.equal(collected.complete, false);
  });

  it('names why each unusable row was passed over', async () => {
    const tracker = registry.get('recent-orders');
    const said = [];
    await tracker.poll.collect({
      since: null,
      now: NOW,
      log: (...args) => said.push(args.join(' ')),
      crmContacts: async () => ({
        docs: [
          contactDoc({ id: 'account_1187', recordType_s: 'Account' }),
          contactDoc({ id: 'contact_', recordType_s: 'Contact' }),
          contactDoc({ id: 'contact_77', lastOrderDate_dt: 'not a date' }),
        ],
        numFound: 3,
        complete: true,
      }),
    });
    assert.match(said.join('\n'), /account_1187 — not-a-contact/);
    assert.match(said.join('\n'), /contact_ — no-contact-id/);
    assert.match(said.join('\n'), /contact_77 — no-last-order-date/);
    assert.match(
      said.join('\n'),
      /"not-a-contact":1.*"no-contact-id":1.*"no-last-order-date":1/,
    );
  });

  it('fails the sweep rather than search from the worker with no CRM session', async () => {
    // A worker fetch is cross-site and carries no CRM cookie, so there is no
    // fallback to take: the runtime hands over a CRM page or the sweep waits.
    const tracker = registry.get('recent-orders');
    await assert.rejects(
      () => tracker.poll.collect({ since: null, now: NOW, fetchJson: async () => ({}) }),
      /CRM page/,
    );
  });
});
