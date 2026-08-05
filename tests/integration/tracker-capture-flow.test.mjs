/** Trackers — the whole capture path, wired end to end.
 *
 * The REAL main-world hook patches a real-shaped `fetch`, the entry it posts
 * crosses a real `postMessage` listener, and the REAL worker engine stores it.
 * Only the boundaries are stubbed (window, chrome, network), because those are
 * the three places this feature is allowed to touch the outside world.
 *
 * This is the flow the sales dashboard will read: a rep creates an opportunity
 * in the CRM and a row appears without anyone asking the extension to look.
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
const HOOK_SOURCE = read('src/vanilla/tracker-net-hook.js');

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);
const ORIGIN = 'https://api.golfballs.com';
const CREATE_URL = `${ORIGIN}/golfballs/crm/Admin/Opportunity/Create.ajax`;

/** The service worker: registry + definitions + store + engine. */
function worker() {
  const stored = { featureFlags: { trackersEnabled: true } };
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
        set(values, callback) { Object.assign(stored, structuredClone(values)); callback?.(); },
      },
      onChanged: { addListener() {} },
    },
    alarms: {
      get(_name, callback) { callback(null); },
      create() {}, clear() {}, onAlarm: { addListener() {} },
    },
    runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
  };
  const context = vm.createContext({
    chrome, console, globalThis: null,
    fetch: async () => ({ ok: false, status: 404, text: async () => '' }),
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
  return {
    stored,
    registry: context.GBTrackerRegistry,
    store: context.GBTrackerStore,
    trackers: context.GBTrackers,
  };
}

/** A page: the window the MAIN-world hook patches, plus the site's own fetch. */
function page({ response = '{}', ok = true, status = 200 } = {}) {
  const posted = [];
  const listeners = [];
  const siteCalls = [];
  const window = {
    location: { origin: ORIGIN },
    addEventListener: (type, handler) => { if (type === 'message') listeners.push(handler); },
    postMessage: (data, origin) => {
      posted.push(data);
      // A real page delivers its own postMessage back through the listeners.
      for (const handler of listeners) handler({ source: window, origin, data });
    },
    fetch: async (url) => {
      siteCalls.push(String(url));
      return {
        ok, status,
        clone() { return { text: async () => response }; },
        text: async () => response,
      };
    },
  };
  const context = vm.createContext({
    window, console, Date, Math, JSON, Promise, Object, Array, String, Number,
    Boolean, RegExp, Error, TypeError, Map, Set,
  });
  context.globalThis = context;
  vm.runInContext(HOOK_SOURCE, context, { filename: 'src/vanilla/tracker-net-hook.js' });
  return { window, posted, siteCalls };
}

/** Everything the bridge does, minus the chrome plumbing it is made of. */
const captured = (posted) => posted
  .filter((message) => message && message.__gbTrackerNet)
  .map((message) => message.entry);

describe('trackers · capture flow', () => {
  it('carries a created opportunity from the page hook into storage', async () => {
    const { registry, store, trackers } = worker();
    const body = JSON.stringify({
      d: JSON.stringify({ opportunityId: '90210', OpportunityStageId: 1, EstimatedValue: '4300' }),
    });
    const { window, posted } = page({ response: body });

    // 1. The bridge hands the hook the registry's rules (source + flags: a
    //    RegExp cannot survive a structured clone).
    window.postMessage({ __gbTrackerRules: true, rules: registry.captureRules() }, ORIGIN);

    // 2. The CRM makes its own request; the hook is patched over window.fetch.
    const url = `${CREATE_URL}?${encodeURIComponent(JSON.stringify({ Subject: 'Spring gift order', contactId: 4821 }))}`;
    await window.fetch(url, { method: 'GET' });
    await new Promise((resolve) => setTimeout(resolve, 0)); // response clone reads async

    const entries = captured(posted);
    assert.equal(entries.length, 1, 'the hook posted exactly one entry');
    assert.equal(entries[0].responseBody, body);
    assert.equal(entries[0].ok, true);

    // 3. The worker re-matches and stores.
    const result = await trackers.capture({ ...entries[0], at: NOW });
    assert.equal(result.stored, 1);

    const records = await store.list('opportunities');
    assert.equal(records.length, 1);
    assert.equal(records[0].externalId, '90210');
    assert.equal(records[0].title, 'Spring gift order');
    assert.equal(records[0].status, 'open');
    assert.equal(records[0].value, 4300);
    assert.equal(records[0].source, 'intercept');
    // Captured rows arm the refresh clock: this is how we learn it closed.
    assert.equal(records[0].settled, false);
    assert.ok(records[0].nextRefreshAt > NOW);
  });

  it('leaves the website’s unrelated traffic completely alone', async () => {
    const { registry } = worker();
    const { window, posted, siteCalls } = page();
    window.postMessage({ __gbTrackerRules: true, rules: registry.captureRules() }, ORIGIN);

    const response = await window.fetch(`${ORIGIN}/golfballs/adminnew/Default.aspx?Page=240`);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(captured(posted).length, 0, 'no entry posted');
    assert.equal(siteCalls.length, 1, 'the page still got its response');
    assert.equal(response.ok, true);
  });

  it('captures nothing until the bridge has delivered rules', async () => {
    const { window, posted } = page();
    await window.fetch(`${CREATE_URL}?%7B%7D`, { method: 'GET' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(captured(posted).length, 0);
  });

  it('disarms an already-watching tab when its tracker is switched off', async () => {
    // An EMPTY rules list is how a per-tracker switch reaches a CRM tab that is
    // already open — the bridge re-asks on a storage change and posts whatever
    // comes back, so the hook has to treat "no rules" as an instruction.
    const { registry } = worker();
    const { window, posted } = page({ response: '{}' });
    window.postMessage({ __gbTrackerRules: true, rules: registry.captureRules() }, ORIGIN);

    await window.fetch(`${CREATE_URL}?%7B%7D`, { method: 'GET' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(captured(posted).length, 1, 'armed before the switch');

    window.postMessage({ __gbTrackerRules: true, rules: [] }, ORIGIN);
    await window.fetch(`${CREATE_URL}?%7B%7D`, { method: 'GET' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(captured(posted).length, 1, 'and silent after it');
  });

  it('sends an empty rules list on rather than swallowing it as a non-answer', async () => {
    // The bridge is chrome plumbing this harness deliberately does not run, so
    // the guarantee is pinned at its source: only a missing/malformed reply is
    // ignored, because THAT would disarm the hook on a worker restart.
    const bridge = read('src/vanilla/tracker-bridge.js');
    assert.match(bridge, /if \(!response \|\| !Array\.isArray\(response\.rules\)\) return;/);
    assert.doesNotMatch(bridge, /!response\.rules\.length\) return;/);
    assert.match(bridge, /changes\.featureFlags \|\| changes\.gbTrackerState/);
  });

  it('refuses an entry a page forged for a url the registry does not match', async () => {
    const { trackers, store } = worker();
    const result = await trackers.capture({
      url: `${ORIGIN}/golfballs/crm/Admin/Something/Else.ajax?x`,
      method: 'GET', status: 200, ok: true, at: NOW,
      responseBody: JSON.stringify({ opportunityId: 'FORGED' }),
    });
    assert.equal(result.stored, 0);
    assert.equal((await store.list('opportunities')).length, 0);
  });

  it('reaches the dashboard read path as one snapshot per tracker', async () => {
    const { trackers, store, registry } = worker();
    const tracker = registry.get('opportunities');
    await store.upsert('opportunities', [
      registry.normalizeRecord(tracker, { externalId: '1', status: 'open' }, { now: NOW }),
    ], { now: NOW });

    const snapshots = await trackers.snapshots();
    const opportunities = snapshots.find((entry) => entry.trackerId === 'opportunities');
    assert.equal(opportunities.total, 1);
    assert.equal(opportunities.open, 1);
    assert.equal(opportunities.kind, 'intercept');
    assert.ok(snapshots.some((entry) => entry.trackerId === 'recent-orders'));
  });
});
