/** Recent orders — the whole sweep, wired end to end.
 *
 * This is the one tracker the worker cannot run by itself. The CRM has no
 * "orders since X" endpoint; the only way to pull recent orders is to re-run
 * the CRM search for the rep's contacts whose last order moved, and that search
 * is cookie-authenticated on a page the worker is not. So the flow under test
 * is: the REAL worker engine asks → the REAL page module runs the REAL search
 * → the worker extracts the order out of each contact row and stores it.
 *
 * Only the boundaries are stubbed (chrome, the Solr response, the CRM tab
 * lookup), because those are the three places this feature touches the outside
 * world.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');

const WORKER_SOURCES = [
  'lib/tracker-registry.js',
  'lib/tracker-definitions.js',
  'lib/tracker-store.js',
  'lib/tracker-runtime.js',
];

const ORIGIN = 'https://api.golfballs.com';
const EXTENSION_ID = 'gb-extension';
const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);
const REP = 'Cullen Champagne';

/** A CRM Search index row, shaped as the real index returns them. */
const contactDoc = (overrides = {}) => ({
  id: 'contact_4421',
  recordType_s: 'Contact',
  contactName_t: 'Marcus Chen',
  accountName_t: 'Acme Industries',
  accountID_s: 'ACME-001',
  salesRep_s: REP,
  orderCount_i: 12,
  yearToDateRevenue_f: 8400,
  lastOrderDate_dt: '2026-08-04T00:00:00Z',
  ...overrides,
});

/**
 * The page half: the REAL content-script module, with the CRM session and the
 * Solr response stubbed. Globals go in before the import because the module
 * registers its listener at load, exactly as it does in a content script.
 */
async function crmPage({ identity = 'session', pages = [[contactDoc()]], numFound = null } = {}) {
  const requests = [];
  const stored = {
    // The audience is keyed by this id. `no-id` is the only state the sweep
    // cannot run in: a page that has not yet told us who is signed in.
    gbEmployeeId: identity === 'no-id' ? undefined : '22',
    gbCurrentUser: ['none', 'no-id'].includes(identity) ? undefined : {
      employeeId: '22',
      // A directory match is a name we inferred rather than one the session
      // told us. It no longer gates the sweep — the name is not queried.
      employeeName: REP,
      source: identity === 'directory' ? 'crm_directory' : 'crm_session',
      updatedAt: Date.now(),
    },
  };

  let listener = null;
  const asked = [];
  // The page half installs its console command on `window`; a content script
  // always has one, and without it here that half would silently not be tested.
  // A FRESH one per page, because identity resolution memoises the employee id
  // on it — one shared window would carry a previous tab's rep into this one.
  globalThis.window = {};
  globalThis.chrome = {
    runtime: {
      id: EXTENSION_ID,
      onMessage: { addListener: (fn) => { listener = fn; } },
      lastError: null,
      sendMessage: (message, callback) => { asked.push(message); callback({ ok: true }); },
    },
    storage: {
      local: {
        get(keys, callback) {
          const names = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const name of names) if (stored[name] !== undefined) out[name] = stored[name];
          callback(out);
        },
        set(values, callback) { Object.assign(stored, values); callback?.(); },
      },
      onChanged: { addListener() {} },
    },
  };
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url: String(url), str: body.str });
    const docs = pages[requests.length - 1] || [];
    // An index holding MORE than the stubbed pages can hand back is how a read
    // that stops at the page ceiling is expressed.
    const found = numFound ?? pages.reduce((total, page) => total + page.length, 0);
    return {
      ok: true,
      status: 200,
      json: async () => ({ d: JSON.stringify({ response: { docs, numFound: found } }) }),
    };
  };

  await import(`../../src/vanilla-build/recent-orders-sweep.entry.js?reload=${requests.length}-${identity}-${pages.length}-${Math.random()}`);
  if (!listener) throw new Error('the page module registered no listener');

  /** Deliver one worker→tab message and resolve with the tab's answer. */
  const deliver = (message, sender = { id: EXTENSION_ID }) => new Promise((resolve) => {
    const handled = listener(message, sender, resolve);
    if (!handled) resolve(undefined);
  });
  return { deliver, requests, stored, asked, console: globalThis.window.gbOrderTracking };
}

/** The service worker: registry + definitions + store + engine, plus the tab
 *  lookup that is the only way it can reach a CRM session. */
function worker({ tabs = [{ id: 7 }], deliver = async () => ({ ok: false, error: 'no page' }) } = {}) {
  const stored = { featureFlags: { trackersEnabled: true } };
  const sent = [];
  const chrome = {
    storage: {
      local: {
        get(keys, callback) {
          const names = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const name of names) if (name in stored) out[name] = structuredClone(stored[name]);
          callback(out);
        },
        set(values, callback) { Object.assign(stored, structuredClone(values)); callback?.(); },
      },
      onChanged: { addListener() {} },
    },
    alarms: {
      get(_name, callback) { callback(null); },
      create() {}, clear() {}, onAlarm: { addListener() {} },
    },
    runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
    tabs: {
      query(_filter, callback) { callback(tabs); },
      sendMessage(tabId, message, callback) {
        sent.push({ tabId, message });
        deliver(message).then(callback);
      },
    },
  };
  const context = vm.createContext({
    chrome, console, globalThis: null,
    fetch: async () => { throw new Error('the worker must not fetch the CRM itself'); },
    AbortController, setTimeout, clearTimeout,
    Date, Math, JSON, Promise, Object, Array, String, Number, Boolean,
    RegExp, Error, TypeError, Map, Set, structuredClone,
  });
  context.globalThis = context;
  context.GBSecurity = {
    parseHttpsUrl: (url) => (String(url).startsWith(ORIGIN) ? { href: String(url) } : null),
    isAllowedFetchUrl: (url) => String(url).startsWith(ORIGIN),
  };
  for (const file of WORKER_SOURCES) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return { stored, sent, store: context.GBTrackerStore, trackers: context.GBTrackers };
}

describe('recent orders · sweep flow', () => {
  it('turns the rep’s own contact rows into stored orders', async () => {
    const page = await crmPage({
      pages: [[
        contactDoc(),
        contactDoc({ id: 'account_1187', recordType_s: 'Account' }),
        contactDoc({ id: 'contact_5223', contactName_t: 'Jordan Brown', accountName_t: '', lastOrderDate_dt: '2026-08-05T00:00:00Z' }),
      ]],
    });
    const { store, trackers } = worker({ deliver: page.deliver });

    const swept = await trackers.sweep({ now: NOW });
    assert.equal(swept.polled, 1);

    // The search that ran is the quick action's audience, not a guess.
    assert.equal(page.requests.length, 1);
    const { str } = page.requests[0];
    // Keyed by the rep's employee id. A name clause is what left this empty:
    // it has to match the index's spelling, and the name a CRM page gives us
    // is routinely a first name only.
    assert.match(str, /fq=recordType_s%3AContact%20AND%20salesRepID_s%3A22/);
    assert.doesNotMatch(str, /salesRep_s/);
    assert.match(str, /lastOrderDate_dt%3A%5B2026-07-29T00%3A00%3A00Z%20TO%20\*%5D/);

    const records = await store.list('recent-orders');
    assert.deepEqual(records.map((record) => record.externalId).sort(), [
      '4421@2026-08-04', '5223@2026-08-05',
    ]);
    const marcus = records.find((record) => record.externalId === '4421@2026-08-04');
    assert.equal(marcus.title, 'Marcus Chen · Acme Industries');
    assert.equal(marcus.status, 'ordered');
    assert.equal(marcus.source, 'poll');
    assert.equal(marcus.data.contactId, '4421');
    assert.equal(marcus.data.orderDate, '2026-08-04');
    // Nothing to re-ask about: the row records an order that already happened.
    assert.equal(marcus.nextRefreshAt, null);
  });

  it('resumes from the last sweep instead of re-reading the whole week', async () => {
    const first = await crmPage();
    const engine = worker({ deliver: first.deliver });
    await engine.trackers.sweep({ now: NOW });

    // Fifteen minutes later the poll is due again; the same contact is still
    // in range (day granularity keeps a deliberate one-day overlap) and must
    // not become a second row.
    const later = NOW + 20 * 60_000;
    const second = await crmPage();
    const resumed = worker({ deliver: second.deliver });
    Object.assign(resumed.stored, engine.stored);
    await resumed.trackers.sweep({ now: later });

    assert.match(second.requests[0].str, /lastOrderDate_dt%3A%5B2026-08-05T00%3A00%3A00Z%20TO%20\*%5D/);
    assert.equal((await resumed.store.list('recent-orders')).length, 1);
  });

  it('pages until the index has no more of the rep’s contacts', async () => {
    const many = Array.from({ length: 100 }, (_, index) => contactDoc({
      id: `contact_${5000 + index}`, contactName_t: `Rep Contact ${index}`,
    }));
    const page = await crmPage({ pages: [many, [contactDoc({ id: 'contact_9999' })]] });
    const { store, trackers } = worker({ deliver: page.deliver });

    await trackers.sweep({ now: NOW });

    assert.equal(page.requests.length, 2, 'a full page means there may be more');
    assert.match(page.requests[1].str, /&start=100&/);
    assert.equal((await store.list('recent-orders')).length, 101);
  });

  it('waits for a CRM tab rather than recording a gap it never read', async () => {
    const { store, trackers, sent } = worker({ tabs: [] });

    const swept = await trackers.sweep({ now: NOW });

    assert.equal(swept.polled, 0);
    assert.equal(sent.length, 0);
    assert.equal((await store.list('recent-orders')).length, 0);
    // The cursor must not move: the sweep that did not happen is still owed,
    // so the next wake asks for the same window rather than skipping it.
    assert.equal(await store.lastPolledAt('recent-orders'), 0);
    await assert.rejects(
      () => trackers.crmContacts({ since: null, now: NOW }),
      /no CRM tab open/,
    );
  });

  it('refuses to search before the page has told it who is signed in', async () => {
    const page = await crmPage({ identity: 'no-id' });
    const { store, trackers } = worker({ deliver: page.deliver });

    const swept = await trackers.sweep({ now: NOW });

    assert.equal(swept.polled, 0);
    assert.equal(page.requests.length, 0, 'no search ran without an employee id');
    assert.equal((await store.list('recent-orders')).length, 0);
  });

  // The old gate demanded a session-verified NAME and refused a directory one.
  // Keyed by id, that distinction is about a value the query never uses — and
  // it was blocking real sweeps for reps whose page only exposes a first name.
  it('sweeps on the employee id even when the name came from the directory', async () => {
    const page = await crmPage({ identity: 'directory' });
    const { store, trackers } = worker({ deliver: page.deliver });

    await trackers.sweep({ now: NOW });

    assert.equal(page.requests.length, 1);
    assert.match(page.requests[0].str, /salesRepID_s%3A22/);
    assert.equal((await store.list('recent-orders')).length, 1);
  });

  /* The reported failure, end to end: the quick action lists contacts with
     recent orders, you can open those contacts and see the orders — and the
     tracker's table says none. Whatever stopped the rows from being read, the
     thing that made it PERMANENT was the cursor moving anyway: the next sweep
     asked for a narrower window, and those orders were never in range again. */
  it('does not step over a window whose rows it failed to read', async () => {
    // Rows the reader cannot turn into an order (no last-order date on them).
    const unreadable = await crmPage({
      pages: [[contactDoc({ lastOrderDate_dt: null }), contactDoc({ id: 'contact_x', lastOrderDate_dt: '' })]],
    });
    const engine = worker({ deliver: unreadable.deliver });

    await engine.trackers.sweep({ now: NOW });
    assert.equal((await engine.store.list('recent-orders')).length, 0);
    // Nothing was banked, so nothing may be skipped: the cursor is untouched
    // and the poll clock — which only paces the next attempt — has moved.
    assert.equal(await engine.store.cursorAt('recent-orders'), 0);
    assert.equal(await engine.store.lastPolledAt('recent-orders'), NOW);

    // A quarter of an hour later the same window is asked for again, and this
    // time the rows are readable. The orders are still in range.
    const later = NOW + 20 * 60_000;
    const readable = await crmPage();
    const resumed = worker({ deliver: readable.deliver });
    Object.assign(resumed.stored, engine.stored);
    await resumed.trackers.sweep({ now: later });

    assert.match(readable.requests[0].str, /lastOrderDate_dt%3A%5B2026-07-29T00%3A00%3A00Z/);
    assert.equal((await resumed.store.list('recent-orders')).length, 1);
    assert.equal(await resumed.store.cursorAt('recent-orders'), later);
  });

  it('keeps moving when the index holds more rows than five pages can read', async () => {
    // A rep with a few thousand indexed contacts: five full pages, Solr still
    // reporting thousands. The sort is newest-first, so what went unread is the
    // OLD end — the cursor may not step to now. But it may not stay put either:
    // the window only widens from a fixed first-run lookback, so a sweep that
    // stalls here truncates again on every sweep after it, forever.
    // One page per day, newest first: 08-04 back to 07-31.
    const dayOf = (page) => new Date(Date.UTC(2026, 7, 4 - page)).toISOString();
    const pages = Array.from({ length: 5 }, (_, page) => Array.from(
      { length: 100 },
      (unused, row) => contactDoc({
        id: `contact_${6000 + page * 100 + row}`,
        lastOrderDate_dt: dayOf(page),
      }),
    ));
    const first = await crmPage({ pages, numFound: 4_200 });
    const engine = worker({ deliver: first.deliver });

    await engine.trackers.sweep({ now: NOW });

    assert.equal(first.requests.length, 5, 'stopped at the page ceiling');
    assert.match(first.requests[0].str, /lastOrderDate_dt%3A%5B2026-07-29T00%3A00%3A00Z/);
    assert.equal((await engine.store.list('recent-orders')).length, 300, 'read 500, retains 300');
    // The floor of what it DID drain: the oldest row on the last page it read.
    // Not `now` — the rows below this were never seen.
    assert.equal(
      await engine.store.cursorAt('recent-orders'),
      Date.parse('2026-07-31T00:00:00Z'),
    );
    assert.equal(await engine.store.lastPolledAt('recent-orders'), NOW);

    // And the next sweep asks a NARROWER window, which is the whole point: the
    // cursor stalling at the lookback is what made a big book re-read the same
    // five pages every quarter hour and never get past them.
    const second = await crmPage({ pages: [[contactDoc({ id: 'contact_9001' })]] });
    const resumed = worker({ deliver: second.deliver });
    Object.assign(resumed.stored, engine.stored);

    await resumed.trackers.sweep({ now: NOW + 20 * 60_000 });

    assert.match(second.requests[0].str, /lastOrderDate_dt%3A%5B2026-07-31T00%3A00%3A00Z/);
    assert.equal(await resumed.store.cursorAt('recent-orders'), NOW + 20 * 60_000);
  });

  it('lets a rep run the search by hand from the CRM page console', async () => {
    const page = await crmPage({
      pages: [[
        contactDoc(),
        contactDoc({ id: 'account_1187', recordType_s: 'Account' }),
      ]],
    });
    assert.ok(page.console, 'the page installs its console command');

    const result = await page.console.search({ since: null, now: NOW });

    // Reads only — the answer says what the worker WOULD store and why each
    // row was kept or passed over, which is the half this command isolates.
    assert.equal(result.docs.length, 2);
    assert.equal(result.complete, true);
    assert.deepEqual(result.rows, [
      { id: 'contact_4421', order: '4421@2026-08-04', title: 'Marcus Chen · Acme Industries', kept: true },
      { id: 'account_1187', kept: false, skipped: 'not-a-contact' },
    ]);

    await page.console.sweep();
    assert.deepEqual(page.asked, [{ action: 'gbTrackerSweep', force: true }]);
  });

  it('answers nothing to a message that did not come from our worker', async () => {
    const page = await crmPage();
    const fromPage = await page.deliver(
      { action: 'gbRecentOrdersSweep', since: null, now: NOW },
      { id: EXTENSION_ID, tab: { id: 3 } },
    );
    const fromOther = await page.deliver(
      { action: 'gbRecentOrdersSweep', since: null, now: NOW },
      { id: 'some-other-extension' },
    );
    assert.deepEqual(fromPage, { ok: false, error: 'unauthorized' });
    assert.deepEqual(fromOther, { ok: false, error: 'unauthorized' });
    assert.equal(page.requests.length, 0);
  });
});
