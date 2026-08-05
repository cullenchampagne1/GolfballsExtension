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
async function crmPage({ identity = 'session', pages = [[contactDoc()]] } = {}) {
  const requests = [];
  const stored = {
    gbEmployeeId: '22',
    gbCurrentUser: identity === 'none' ? undefined : {
      employeeId: '22',
      employeeName: REP,
      // A directory match is a name we inferred, not one the CRM session told
      // us — the sweep must refuse to query another rep's book on it.
      source: identity === 'directory' ? 'crm_directory' : 'crm_session',
      updatedAt: Date.now(),
    },
  };

  let listener = null;
  globalThis.chrome = {
    runtime: {
      id: EXTENSION_ID,
      onMessage: { addListener: (fn) => { listener = fn; } },
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
    const numFound = pages.reduce((total, page) => total + page.length, 0);
    return {
      ok: true,
      status: 200,
      json: async () => ({ d: JSON.stringify({ response: { docs, numFound } }) }),
    };
  };

  await import(`../../src/vanilla-build/recent-orders-sweep.entry.js?reload=${requests.length}-${identity}-${pages.length}-${Math.random()}`);
  if (!listener) throw new Error('the page module registered no listener');

  /** Deliver one worker→tab message and resolve with the tab's answer. */
  const deliver = (message, sender = { id: EXTENSION_ID }) => new Promise((resolve) => {
    const handled = listener(message, sender, resolve);
    if (!handled) resolve(undefined);
  });
  return { deliver, requests, stored };
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
    assert.match(str, /fq=recordType_s%3AContact%20AND%20salesRep_s%3A%22Cullen%20Champagne%22/);
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

  it('refuses to search on a name the CRM session did not verify', async () => {
    const page = await crmPage({ identity: 'directory' });
    const { store, trackers } = worker({ deliver: page.deliver });

    const swept = await trackers.sweep({ now: NOW });

    assert.equal(swept.polled, 0);
    assert.equal(page.requests.length, 0, 'no search ran on an unverified identity');
    assert.equal((await store.list('recent-orders')).length, 0);
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
