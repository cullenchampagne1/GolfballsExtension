/** Trackers — storage and the worker engine.
 *
 * Loads the REAL classic worker modules in a vm context with chrome, fetch,
 * and the clock stubbed, so the capture path, the poll sweep, and the
 * per-record refresh are exercised exactly as the service worker runs them.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const sources = [
  'lib/tracker-registry.js',
  'lib/tracker-store.js',
  'lib/tracker-runtime.js',
].map((file) => ({ file, code: readFileSync(new URL(file, root), 'utf8') }));

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);
const MINUTE = 60_000;
const CRM = 'https://api.golfballs.com/golfballs/crm/Admin';

/**
 * A worker-shaped sandbox.
 *
 * `responses` maps a url substring to what fetch should answer with, so a test
 * says what the CRM replied without standing up a server.
 */
function harness({ flags = { trackersEnabled: true }, responses = {} } = {}) {
  const stored = { featureFlags: flags };
  const requests = [];
  const alarms = new Map();
  const chrome = {
    storage: {
      local: {
        get(keys, callback) {
          const names = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const name of names) {
            if (name in stored) out[name] = structuredClone(stored[name]);
          }
          callback(out);
        },
        set(values, callback) {
          Object.assign(stored, structuredClone(values));
          callback?.();
        },
      },
      onChanged: { addListener() {} },
    },
    alarms: {
      get(name, callback) { callback(alarms.get(name) || null); },
      create(name, options) { alarms.set(name, { name, ...options }); },
      clear(name) { alarms.delete(name); },
      onAlarm: { addListener() {} },
    },
    runtime: {
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
    },
  };

  // An HTTP failure is `{ __http: 500 }`. Deliberately NOT "the answer has a
  // status field" — a tracked record's own `status` is the most common field
  // in these payloads, and conflating the two makes a passing engine look broken.
  async function fetchStub(url) {
    requests.push(String(url));
    for (const [fragment, answer] of Object.entries(responses)) {
      if (!String(url).includes(fragment)) continue;
      if (answer instanceof Error) throw answer;
      if (answer && answer.__http) {
        return { ok: false, status: answer.__http, text: async () => '' };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify(answer) };
    }
    return { ok: false, status: 404, text: async () => '' };
  }

  const context = vm.createContext({
    chrome, console, globalThis: null, fetch: fetchStub,
    AbortController, setTimeout, clearTimeout,
    Date, Math, JSON, Promise, Object, Array, String, Number, Boolean,
    RegExp, Error, TypeError, Map, Set, structuredClone,
  });
  context.globalThis = context;
  // The security policy is a separate concern with its own suite; the engine
  // only needs its verdict, and stubbing it keeps the allowlist out of here.
  context.GBSecurity = {
    parseHttpsUrl: (url) => (String(url).startsWith('https://api.golfballs.com')
      ? { href: String(url) } : null),
    isAllowedFetchUrl: (url) => String(url).startsWith('https://api.golfballs.com'),
  };
  for (const { file, code } of sources) vm.runInContext(code, context, { filename: file });
  return {
    context, stored, requests, alarms,
    registry: context.GBTrackerRegistry,
    store: context.GBTrackerStore,
    trackers: context.GBTrackers,
  };
}

/** A tracker with a capture, a poll, and a refresh — all three clocks. */
function defineFixture(registry, overrides = {}) {
  return registry.define({
    id: 'fixture-deals',
    label: 'Fixture deals',
    kind: 'intercept',
    recordKind: 'deal',
    identify: (raw) => raw.externalId,
    captures: [{
      id: 'created',
      match: /\/Fixture\/Create\.ajax/i,
      extract: ({ url, at }) => {
        const id = new RegExp('id=([^&]+)').exec(url);
        return id ? { externalId: id[1], at, title: 'Captured deal', status: 'open' } : null;
      },
    }],
    refresh: {
      everyMinutes: 60,
      batchSize: 5,
      request: (record) => ({ url: `${CRM}/Fixture/Get.ajax?${record.externalId}` }),
      apply: (_record, payload) => (payload && payload.status ? { status: payload.status } : null),
      settled: (record) => record.status === 'closed',
    },
    ...overrides,
  });
}

describe('tracker store · one writer, one row per record', () => {
  it('stores a captured record under its own tracker key', async () => {
    const { registry, store, stored } = harness();
    defineFixture(registry);
    const record = registry.normalizeRecord(
      registry.get('fixture-deals'), { externalId: 'D-1', title: 'Deal' }, { now: NOW },
    );
    const result = await store.upsert('fixture-deals', [record], { now: NOW });

    assert.equal(result.added.length, 1);
    assert.ok(stored['gbTracker:fixture-deals'], 'per-tracker key, not one shared blob');
    assert.equal(stored['gbTracker:fixture-deals'].records[0].externalId, 'D-1');
  });

  it('reports a re-listed record as updated, not added, so a poll stays quiet', async () => {
    const { registry, store } = harness();
    const tracker = defineFixture(registry);
    const first = registry.normalizeRecord(tracker, { externalId: 'D-1', title: 'Deal' }, { now: NOW });
    await store.upsert('fixture-deals', [first], { now: NOW });
    const again = registry.normalizeRecord(
      tracker, { externalId: 'D-1', data: { salesRep: 'Cullen' } },
      { source: 'poll', now: NOW + MINUTE },
    );
    const result = await store.upsert('fixture-deals', [again], { now: NOW + MINUTE });

    assert.equal(result.added.length, 0);
    assert.equal(result.updated.length, 1);
    assert.equal(result.records.length, 1, 'still one row');
    assert.equal(result.records[0].title, 'Deal');
    assert.equal(result.records[0].data.salesRep, 'Cullen');
  });

  it('does not resurrect a refreshed row that retention already dropped', async () => {
    const { registry, store } = harness();
    const tracker = defineFixture(registry, { retention: { maxRecords: 1, maxAgeDays: 30 } });
    const kept = registry.normalizeRecord(tracker, { externalId: 'KEEP' }, { now: NOW });
    await store.upsert('fixture-deals', [kept], { now: NOW });
    const evicted = registry.normalizeRecord(tracker, { externalId: 'GONE' }, { now: NOW - MINUTE });

    const records = await store.put('fixture-deals', [evicted], { now: NOW });
    assert.equal(records.length, 1);
    assert.equal(records[0].externalId, 'KEEP');
  });

  it('answers the dashboard with one snapshot per tracker', async () => {
    const { registry, store } = harness();
    const tracker = defineFixture(registry);
    await store.upsert('fixture-deals', [
      registry.normalizeRecord(tracker, { externalId: 'A', status: 'open' }, { now: NOW }),
      { ...registry.normalizeRecord(tracker, { externalId: 'B' }, { now: NOW }), settled: true },
    ], { now: NOW });

    const snapshot = await store.snapshot('fixture-deals');
    assert.equal(snapshot.total, 2);
    assert.equal(snapshot.open, 1);
    assert.equal(snapshot.label, 'Fixture deals');
  });
});

describe('tracker runtime · capture', () => {
  it('stores an intercepted CRM request as a record', async () => {
    const { registry, trackers, store } = harness();
    defineFixture(registry);
    const result = await trackers.capture({
      url: `${CRM}/Fixture/Create.ajax?id=D-77`,
      method: 'GET', status: 200, ok: true, at: NOW,
    });

    assert.equal(result.stored, 1);
    const records = await store.list('fixture-deals');
    assert.equal(records[0].externalId, 'D-77');
    assert.equal(records[0].source, 'intercept');
  });

  it('re-matches the url itself, so a forged tracker claim stores nothing', async () => {
    const { registry, trackers, store } = harness();
    defineFixture(registry);
    const result = await trackers.capture({
      url: 'https://api.golfballs.com/golfballs/crm/Admin/Unrelated.ajax?id=D-1',
      trackerId: 'fixture-deals', captureId: 'created',
      method: 'GET', status: 200, ok: true, at: NOW,
    });

    assert.equal(result.stored, 0);
    assert.equal((await store.list('fixture-deals')).length, 0);
  });

  it('refuses a url outside the extension security policy', async () => {
    const { registry, trackers } = harness();
    defineFixture(registry);
    const result = await trackers.capture({
      url: 'https://evil.example.com/Fixture/Create.ajax?id=D-1', at: NOW,
    });
    assert.equal(result.reason, 'url-not-allowed');
  });

  it('ignores a failed request, which created nothing to track', async () => {
    const { registry, trackers } = harness();
    defineFixture(registry);
    const result = await trackers.capture({
      url: `${CRM}/Fixture/Create.ajax?id=D-9`, status: 500, ok: false, at: NOW,
    });
    assert.equal(result.reason, 'request-failed');
  });

  it('captures nothing while the feature is off', async () => {
    const { registry, trackers } = harness({ flags: { trackersEnabled: false } });
    defineFixture(registry);
    const result = await trackers.capture({
      url: `${CRM}/Fixture/Create.ajax?id=D-1`, status: 200, ok: true, at: NOW,
    });
    assert.equal(result.stored, 0);
  });
});

describe('tracker runtime · poll and refresh sweeps', () => {
  const pollTracker = (registry) => registry.define({
    id: 'fixture-orders',
    label: 'Fixture orders',
    kind: 'poll',
    recordKind: 'order',
    identify: (raw) => raw.externalId,
    poll: {
      everyMinutes: 15,
      collect: async ({ fetchJson }) => {
        const payload = await fetchJson(`${CRM}/Order/Recent.ajax?x`);
        return (payload.orders || []).map((order) => ({
          externalId: String(order.id), title: order.name, status: order.status,
        }));
      },
    },
  });

  it('turns a list sweep into records and advances the cursor', async () => {
    const { registry, trackers, store } = harness({
      responses: { 'Order/Recent': { orders: [{ id: 5001, name: 'Acme', status: 'open' }] } },
    });
    pollTracker(registry);

    const result = await trackers.pollTracker(registry.get('fixture-orders'), { now: NOW });
    assert.equal(result.added.length, 1);
    const records = await store.list('fixture-orders');
    assert.equal(records[0].externalId, '5001');
    assert.equal(records[0].source, 'poll');
    assert.equal(await store.lastPolledAt('fixture-orders'), NOW);
  });

  it('leaves the cursor alone when the CRM is down, so those rows are asked for again', async () => {
    const { registry, trackers, store } = harness({
      responses: { 'Order/Recent': new Error('network down') },
    });
    pollTracker(registry);

    const result = await trackers.pollTracker(registry.get('fixture-orders'), { now: NOW });
    assert.equal(result.failed, true);
    assert.equal(await store.lastPolledAt('fixture-orders'), 0);
  });

  it('closes a tracked opportunity that someone else closed', async () => {
    // The whole point of the third clock: we never closed it, and no request of
    // ours would ever have mentioned it.
    const { registry, trackers, store } = harness({
      responses: { 'Fixture/Get': { status: 'closed' } },
    });
    const tracker = defineFixture(registry);
    await store.upsert('fixture-deals', [
      registry.normalizeRecord(tracker, { externalId: 'D-1', status: 'open' }, { now: NOW }),
    ], { now: NOW });

    const later = NOW + 61 * MINUTE;
    const result = await trackers.refreshTracker(tracker, { now: later });

    assert.equal(result.refreshed, 1);
    const [record] = await store.list('fixture-deals');
    assert.equal(record.status, 'closed');
    assert.equal(record.settled, true);
    assert.equal(record.nextRefreshAt, null);
  });

  it('spends no requests on records that are not due yet', async () => {
    const { registry, trackers, store, requests } = harness({
      responses: { 'Fixture/Get': { status: 'closed' } },
    });
    const tracker = defineFixture(registry);
    await store.upsert('fixture-deals', [
      registry.normalizeRecord(tracker, { externalId: 'D-1' }, { now: NOW }),
    ], { now: NOW });

    await trackers.refreshTracker(tracker, { now: NOW + 10 * MINUTE });
    assert.equal(requests.length, 0);
  });

  it('runs both clocks in one sweep and does nothing while the flag is off', async () => {
    const on = harness({
      responses: {
        'Order/Recent': { orders: [{ id: 7, name: 'Acme', status: 'open' }] },
        'Fixture/Get': { status: 'open' },
      },
    });
    const tracker = defineFixture(on.registry);
    pollTracker(on.registry);
    await on.store.upsert('fixture-deals', [
      on.registry.normalizeRecord(tracker, { externalId: 'D-1', status: 'open' }, { now: NOW }),
    ], { now: NOW });

    const result = await on.trackers.sweep({ now: NOW + 61 * MINUTE });
    assert.equal(result.polled, 1);
    assert.equal(result.refreshed, 1);

    const off = harness({ flags: { trackersEnabled: false } });
    defineFixture(off.registry);
    pollTracker(off.registry);
    // Field-by-field: the sweep's result object is built inside the vm realm,
    // so a deep-equal against a host literal fails on the prototype, not the data.
    const idle = await off.trackers.sweep({ now: NOW });
    assert.equal(idle.polled, 0);
    assert.equal(idle.refreshed, 0);
    assert.equal(off.requests.length, 0);
  });

  it('arms its sweep alarm only while the feature is on', async () => {
    const on = harness();
    await on.trackers.reconcile();
    assert.ok(on.alarms.get('gbTrackerSweep'));

    const off = harness({ flags: { trackersEnabled: false } });
    off.alarms.set('gbTrackerSweep', { name: 'gbTrackerSweep' });
    await off.trackers.reconcile();
    assert.equal(off.alarms.get('gbTrackerSweep'), undefined);
  });
});

/* The data cursor, which is NOT the poll clock.
 *
 * `lastPolledAt` paces the next attempt and moves on every one; `cursorAt`
 * says how far the data has actually been read and may only move over a
 * window that was both fully read and banked. They were one field once, and a
 * sweep that reached the CRM but stored nothing still stamped it — so the next
 * sweep asked for a narrower window and the orders in the gap were never asked
 * about again. Every case below is one way that used to happen. */
describe('tracker runtime · the data cursor', () => {
  /** A poll tracker whose collect answers exactly what the test dictates. */
  const definePoll = (registry, collect) => registry.define({
    id: 'fixture-orders',
    label: 'Fixture orders',
    kind: 'poll',
    recordKind: 'order',
    identify: (raw) => raw.externalId,
    poll: { everyMinutes: 15, collect },
  });

  const oneRow = [{ externalId: 'O-1', title: 'Acme', status: 'ordered' }];

  it('reads from its own cursor, not from when it last ran', async () => {
    const { registry, trackers, store } = harness();
    const windows = [];
    definePoll(registry, async ({ since }) => {
      windows.push(since);
      return { rows: oneRow, seen: 1, complete: true };
    });
    const tracker = registry.get('fixture-orders');

    await trackers.pollTracker(tracker, { now: NOW });
    await trackers.pollTracker(tracker, { now: NOW + 20 * MINUTE });

    // First run has no cursor at all (the tracker's own first-run lookback
    // decides how far back that reaches); the second resumes from the first.
    assert.deepEqual(windows, [0, NOW]);
    assert.equal(await store.cursorAt('fixture-orders'), NOW + 20 * MINUTE);
  });

  it('holds the cursor when rows were read but none could be stored', async () => {
    // The exact shape of the bug: the CRM answered, the sweep saw forty
    // contacts, and not one of them mapped to a record. Advancing here is what
    // made those orders unreachable — the next window starts after them.
    const { registry, trackers, store } = harness();
    definePoll(registry, async () => ({ rows: [], seen: 40, numFound: 40, complete: true }));

    const result = await trackers.pollTracker(registry.get('fixture-orders'), { now: NOW });

    assert.equal(result.seen, 40);
    assert.equal(result.records, 0);
    assert.equal(result.cursor, 'held');
    assert.equal(await store.cursorAt('fixture-orders'), 0);
    // The poll CLOCK still moves: the attempt happened, and it paces the next.
    assert.equal(await store.lastPolledAt('fixture-orders'), NOW);
  });

  it('holds the cursor when a truncated read cannot say how far it got', async () => {
    // Newest-first paging means a truncated read leaves the OLDER rows unread,
    // which are exactly the ones a step to `now` would skip. A read that names
    // no floor for what it did drain gets the conservative answer.
    const { registry, trackers, store } = harness();
    definePoll(registry, async () => ({
      rows: oneRow, seen: 500, numFound: 900, complete: false,
    }));

    const result = await trackers.pollTracker(registry.get('fixture-orders'), { now: NOW });

    assert.equal(result.cursor, 'held');
    assert.equal((await store.list('fixture-orders')).length, 1, 'what it did read is still stored');
    assert.equal(await store.cursorAt('fixture-orders'), 0);
  });

  it('moves a truncated read to the oldest row it banked, not to now', async () => {
    // A rep with a few thousand indexed contacts overflows the page ceiling on
    // every sweep. Holding the cursor for that is not caution, it is a stall:
    // the window only widens, so it truncates again, forever. The read still
    // drained everything from its oldest row forward — that is where it goes.
    const { registry, trackers, store } = harness();
    const floor = NOW - 2 * 24 * 60 * MINUTE;
    definePoll(registry, async () => ({
      rows: [{ externalId: 'O-1', at: NOW - 60 * MINUTE }, { externalId: 'O-2', at: floor }],
      seen: 500, numFound: 4_200, complete: false, cursorTo: floor,
    }));

    const result = await trackers.pollTracker(registry.get('fixture-orders'), { now: NOW });

    assert.equal(result.cursor, 'advanced to the oldest row read');
    assert.equal(await store.cursorAt('fixture-orders'), floor);
    // Not to now: the rows between the window's start and the floor were never
    // read, and a step to now is what would bury them.
    assert.notEqual(await store.cursorAt('fixture-orders'), NOW);
  });

  it('holds a truncated read that banked nothing, floor or no floor', async () => {
    // Nothing mapped means the floor is a claim about rows we never proved we
    // could read. The mapping check comes first, and it wins.
    const { registry, trackers, store } = harness();
    definePoll(registry, async () => ({
      rows: [], seen: 500, numFound: 4_200, complete: false, cursorTo: NOW - 60 * MINUTE,
    }));

    const result = await trackers.pollTracker(registry.get('fixture-orders'), { now: NOW });

    assert.equal(result.cursor, 'held');
    assert.equal(await store.cursorAt('fixture-orders'), 0);
  });

  it('ignores a floor that would move the cursor backwards or into the future', async () => {
    const { registry, trackers, store } = harness();
    let floor = NOW + 60 * MINUTE;     // a row stamped ahead of the sweep
    definePoll(registry, async () => ({
      rows: oneRow, seen: 500, numFound: 4_200, complete: false, cursorTo: floor,
    }));
    const tracker = registry.get('fixture-orders');

    assert.equal((await trackers.pollTracker(tracker, { now: NOW })).cursor, 'held');
    assert.equal(await store.cursorAt('fixture-orders'), 0);

    // And once the cursor is somewhere, a floor behind it is not a rewind.
    await store.markCursor('fixture-orders', NOW - 30 * MINUTE);
    floor = NOW - 90 * MINUTE;
    assert.equal((await trackers.pollTracker(tracker, { now: NOW })).cursor, 'held');
    assert.equal(await store.cursorAt('fixture-orders'), NOW - 30 * MINUTE);
  });

  it('advances over a window that was read in full and was simply empty', async () => {
    const { registry, trackers, store } = harness();
    definePoll(registry, async () => ({ rows: [], seen: 0, numFound: 0, complete: true }));

    const result = await trackers.pollTracker(registry.get('fixture-orders'), { now: NOW });

    assert.equal(result.cursor, 'advanced');
    assert.equal(await store.cursorAt('fixture-orders'), NOW);
  });

  it('never moves the cursor backwards, whatever order sweeps finish in', async () => {
    const { registry, trackers, store } = harness();
    definePoll(registry, async () => ({ rows: oneRow, seen: 1, complete: true }));
    const tracker = registry.get('fixture-orders');

    await trackers.pollTracker(tracker, { now: NOW });
    await trackers.pollTracker(tracker, { now: NOW - 60 * MINUTE });

    assert.equal(await store.cursorAt('fixture-orders'), NOW);
  });

  it('rewinds on request, to re-read a window it swept over blind', async () => {
    const { registry, trackers, store } = harness();
    definePoll(registry, async () => ({ rows: oneRow, seen: 1, complete: true }));
    await trackers.pollTracker(registry.get('fixture-orders'), { now: NOW });
    assert.equal(await store.cursorAt('fixture-orders'), NOW);

    await store.resetCursor('fixture-orders');
    assert.equal(await store.cursorAt('fixture-orders'), 0);
  });

  it('leaves the cursor to the runtime: a manual CRM scan cannot touch it', async () => {
    // The "Scan for recent orders" quick action keeps its own watermark under
    // gbScanRecentOrders_lastRun. A rep running that scan all morning must not
    // consume the tracker's window — the two are separate keys on purpose.
    const { registry, trackers, store, stored } = harness();
    definePoll(registry, async () => ({ rows: oneRow, seen: 1, complete: true }));
    await trackers.pollTracker(registry.get('fixture-orders'), { now: NOW });

    stored.gbScanRecentOrders_lastRun = NOW + 6 * 60 * MINUTE;

    assert.equal(await store.cursorAt('fixture-orders'), NOW);
    assert.equal(
      Object.keys(stored.gbTrackerState['fixture-orders']).sort().join(),
      'cursorAt,lastPolledAt',
    );
  });
});

/* The console commands. Trackers are invisible by design — an alarm, a worker
 * nobody has open, and catches that deliberately swallow — so the way anyone
 * ever answers "why is this table empty" is by hand, here. */
describe('tracker runtime · console commands', () => {
  it('answers every gate a record passes, in order', async () => {
    const { registry, trackers, store, context } = harness();
    registry.define({
      id: 'fixture-orders',
      label: 'Fixture orders',
      kind: 'poll',
      recordKind: 'order',
      identify: (raw) => raw.externalId,
      poll: { everyMinutes: 15, collect: async () => ({ rows: [], seen: 0, complete: true }) },
    });
    await store.markCursor('fixture-orders', NOW);

    const status = await trackers.status({ now: NOW + 20 * MINUTE });

    assert.equal(status.featureEnabled, true);
    assert.equal(status.crmTabsOpen, 0, 'no chrome.tabs in this sandbox is zero tabs, not a throw');
    const row = status.trackers.find((entry) => entry.trackerId === 'fixture-orders');
    assert.equal(row.enabled, true);
    assert.equal(row.records, 0);
    assert.equal(row.cursorAt, new Date(NOW).toISOString());
    assert.equal(row.pollDue, true);
    assert.ok(context.gbTrackers, 'the console surface is installed on the worker global');
  });

  it('forces a poll the cadence would otherwise skip', async () => {
    const { registry, trackers, store } = harness();
    let polls = 0;
    registry.define({
      id: 'fixture-orders',
      label: 'Fixture orders',
      kind: 'poll',
      recordKind: 'order',
      identify: (raw) => raw.externalId,
      poll: {
        everyMinutes: 15,
        collect: async () => { polls += 1; return { rows: [], seen: 0, complete: true }; },
      },
    });
    await store.markPolled('fixture-orders', NOW);

    const soon = NOW + 2 * MINUTE;
    const skipped = await trackers.sweep({ now: soon });
    assert.equal(polls, 0);
    assert.match(skipped.trackers[0].skipped, /not due/);

    const forced = await trackers.sweep({ now: soon, force: true });
    assert.equal(polls, 1);
    assert.equal(forced.polled, 1);
  });

  it('says why it did nothing rather than answering with zeroes', async () => {
    const off = harness({ flags: { trackersEnabled: false } });
    const idle = await off.trackers.sweep({ now: NOW });
    assert.equal(idle.skipped, 'feature-off');
  });
});

/* One switch per tracker, on top of the feature flag. The rule being tested is
   that switching one OFF costs nothing at every clock — no capture, no sweep,
   no refresh, and no rules for the page hook to match against — while the rows
   it already collected stay exactly where they are. */
describe('tracker runtime · per-tracker switches', () => {
  const pollFixture = (registry) => registry.define({
    id: 'fixture-orders',
    label: 'Fixture orders',
    kind: 'poll',
    recordKind: 'order',
    identify: (raw) => raw.externalId,
    poll: {
      everyMinutes: 15,
      collect: async ({ fetchJson }) => {
        const payload = await fetchJson(`${CRM}/Order/Recent.ajax?x`);
        return (payload.orders || []).map((order) => ({ externalId: String(order.id) }));
      },
    },
  });

  it('is on until the rep turns it off, for trackers that ship later too', async () => {
    const { registry, trackers, store } = harness();
    defineFixture(registry);

    assert.equal(await store.isEnabled('fixture-deals'), true);
    assert.equal(await trackers.trackerEnabled('fixture-deals'), true);

    await trackers.setTrackerEnabled('fixture-deals', false);
    assert.equal(await trackers.trackerEnabled('fixture-deals'), false);

    await trackers.setTrackerEnabled('fixture-deals', true);
    assert.equal(await trackers.trackerEnabled('fixture-deals'), true);
  });

  it('refuses to store a switched-off tracker’s captures', async () => {
    // A CRM tab opened before the switch was flipped still holds the old rules
    // and keeps posting matches, so the worker has to enforce this itself.
    const { registry, trackers, store } = harness();
    defineFixture(registry);
    await trackers.setTrackerEnabled('fixture-deals', false);

    const result = await trackers.capture({
      url: `${CRM}/Fixture/Create.ajax?id=D-77`,
      method: 'GET', status: 200, ok: true, at: NOW,
    });

    assert.equal(result.stored, 0);
    assert.equal((await store.list('fixture-deals')).length, 0);
  });

  it('stops handing the page hook rules it no longer needs to match', async () => {
    const { registry, trackers } = harness();
    defineFixture(registry);
    assert.equal((await trackers.captureRules()).length, 1);

    await trackers.setTrackerEnabled('fixture-deals', false);
    // Length, not deep-equal: the array is built inside the vm realm, so a
    // strict comparison against a host [] fails on the prototype, not the data.
    assert.equal((await trackers.captureRules()).length, 0);

    // The feature flag still trumps every individual switch.
    const off = harness({ flags: { trackersEnabled: false } });
    defineFixture(off.registry);
    assert.equal((await off.trackers.captureRules()).length, 0);
  });

  it('spends no request on a switched-off tracker’s poll or refresh', async () => {
    const { registry, trackers, store, requests } = harness({
      responses: {
        'Order/Recent': { orders: [{ id: 7 }] },
        'Fixture/Get': { status: 'closed' },
      },
    });
    const tracker = defineFixture(registry);
    pollFixture(registry);
    await store.upsert('fixture-deals', [
      registry.normalizeRecord(tracker, { externalId: 'D-1', status: 'open' }, { now: NOW }),
    ], { now: NOW });

    await trackers.setTrackerEnabled('fixture-deals', false);
    await trackers.setTrackerEnabled('fixture-orders', false);
    const idle = await trackers.sweep({ now: NOW + 61 * MINUTE });

    assert.equal(idle.polled, 0);
    assert.equal(idle.refreshed, 0);
    assert.equal(requests.length, 0);

    // Turning one back on resumes it, and only it.
    await trackers.setTrackerEnabled('fixture-orders', true);
    const partial = await trackers.sweep({ now: NOW + 62 * MINUTE });
    assert.equal(partial.polled, 1);
    assert.equal(partial.refreshed, 0, 'the switched-off tracker is still not refreshed');
  });

  it('keeps the rows a switched-off tracker already collected', async () => {
    // Off means "collect nothing further", not "forget what you saw" — a rep
    // pausing a tracker must not lose the table they paused it to stop growing.
    const { registry, trackers, store } = harness();
    const tracker = defineFixture(registry);
    await store.upsert('fixture-deals', [
      registry.normalizeRecord(tracker, { externalId: 'D-1', status: 'open' }, { now: NOW }),
    ], { now: NOW });

    await trackers.setTrackerEnabled('fixture-deals', false);

    const records = await store.list('fixture-deals');
    assert.equal(records.length, 1);
    assert.equal(records[0].externalId, 'D-1');
  });

  it('refuses to switch a tracker that does not exist', async () => {
    const { trackers } = harness();
    const result = await trackers.setTrackerEnabled('not-a-tracker', false);
    assert.equal(result.ok, false);
  });

  it('summarises every tracker for the settings table, without the records', async () => {
    const { registry, trackers, store } = harness();
    const tracker = defineFixture(registry);
    pollFixture(registry);
    await store.upsert('fixture-deals', [
      registry.normalizeRecord(tracker, { externalId: 'D-1', status: 'open' }, { now: NOW }),
      { ...registry.normalizeRecord(tracker, { externalId: 'D-2' }, { now: NOW - MINUTE }), settled: true },
    ], { now: NOW });
    await trackers.setTrackerEnabled('fixture-orders', false);

    const summaries = await trackers.summaries();
    const deals = summaries.find((row) => row.trackerId === 'fixture-deals');
    const orders = summaries.find((row) => row.trackerId === 'fixture-orders');

    assert.equal(summaries.length, 2);
    assert.equal(deals.total, 2);
    assert.equal(deals.open, 1, 'a settled row is not open');
    assert.equal(deals.enabled, true);
    assert.equal(deals.featureEnabled, true);
    assert.equal(deals.updatedAt, NOW);
    assert.equal(deals.label, 'Fixture deals');
    assert.equal('records' in deals, false, 'the table renders counts, not rows');
    assert.equal(orders.enabled, false);
    assert.equal(orders.total, 0);
  });
});
