/** Trackers — the service-worker engine.
 *
 * Owns the I/O the registry deliberately has none of: accepting captured
 * requests from the page bridge, sweeping poll trackers, and spending the
 * per-record refresh budget. One alarm drives the second and third; the first
 * is event-driven and costs nothing when the rep isn't working.
 *
 * TRUST BOUNDARY. A capture message arrives from a content script, which reads
 * it from the WEBSITE's main world — the least trustworthy input the extension
 * takes. So the URL is re-matched against the registry here rather than
 * believed, checked against the shared security policy, and size-capped before
 * an extractor ever sees it. The page can make us ignore a request; it cannot
 * make us store an arbitrary one.
 *
 * ONE SWEEP, BOUNDED. Every wake does at most one list poll per due tracker and
 * one refresh batch per tracker (`refresh.batchSize`), so a table of five
 * hundred stale rows drains steadily instead of firing five hundred requests
 * into the CRM the first time Chrome resumes the worker.
 */
(function installTrackerRuntime(root) {
  'use strict';
  if (root.GBTrackers) return;

  const registry = root.GBTrackerRegistry;
  const store = root.GBTrackerStore;
  if (!registry || !store) throw new Error('GBTrackers requires the registry and store');

  const ALARM_NAME = 'gbTrackerSweep';
  const SWEEP_MINUTES = 5;
  const FLAG_KEY = 'trackersEnabled';
  const MAX_BODY = 250_000;
  const REQUEST_TIMEOUT_MS = 15_000;
  /* The CRM proper is api.golfballs.com: same-origin with the search index, so
     a page there can query it with the rep's session. www pages cannot. */
  const CRM_TABS = ['https://api.golfballs.com/*'];
  const CRM_SEARCH_MESSAGE = 'gbRecentOrdersSweep';
  const CRM_SEARCH_TIMEOUT_MS = 30_000;
  const MAX_CRM_DOCS = 1_000;

  let sweeping = false;

  const getStorage = (keys) => new Promise((resolve) => {
    try { chrome.storage.local.get(keys, (value) => resolve(value || {})); }
    catch { resolve({}); }
  });

  /** Trackers are opt-in: capture is silent and polling is not free, so the
   *  rep turns this on rather than discovering it running. */
  async function enabled() {
    const bag = await getStorage('featureFlags');
    return bag.featureFlags?.[FLAG_KEY] === true;
  }

  /**
   * Whether ONE tracker is collecting: the feature flag and that tracker's own
   * switch, both of which have to be on.
   *
   * Two levels because they answer different questions. The flag is "is the
   * extension allowed to watch my work at all"; the per-tracker switch is "I
   * want opportunities but I don't want a search running every fifteen
   * minutes". A tracker turned off costs nothing at every clock: its capture
   * rules never reach the page hook, its poll never sweeps, and its rows are
   * never refreshed — while the rows it already collected stay put.
   */
  async function trackerEnabled(trackerId) {
    if (!(await enabled())) return false;
    return store.isEnabled(trackerId);
  }

  /** Which trackers are collecting right now, in one storage read. */
  async function enabledTrackers() {
    if (!(await enabled())) return [];
    const stateBag = await store.state();
    return registry.list().filter((tracker) => store.enabledIn(stateBag, tracker.id));
  }

  /** Turn one tracker on or off. Rules and alarms follow on the next read, so
   *  a rep flipping a row never has to reload a CRM tab. */
  async function setTrackerEnabled(trackerId, on) {
    if (!registry.get(trackerId)) return { ok: false, error: 'unknown tracker' };
    await store.setEnabled(trackerId, on);
    return { ok: true, trackerId, enabled: !!on };
  }

  /** The counts a settings table renders: every tracker, no records. */
  async function summaries() {
    const featureEnabled = await enabled();
    const out = [];
    for (const tracker of registry.list()) {
      const summary = await store.snapshot(tracker.id, { records: false });
      if (summary) out.push({ ...summary, featureEnabled });
    }
    return out;
  }

  /** The match rules the page hook should hold: only trackers still collecting.
   *  A tracker switched off stops costing the page a body clone, not just a
   *  storage write. */
  async function captureRules() {
    const collecting = new Set((await enabledTrackers()).map((tracker) => tracker.id));
    return registry.captureRules().filter((rule) => collecting.has(rule.trackerId));
  }

  const cap = (value) => {
    if (value == null) return null;
    const string = String(value);
    return string.length > MAX_BODY ? string.slice(0, MAX_BODY) : string;
  };

  function allowedUrl(url) {
    const security = root.GBSecurity;
    if (!security) return false;
    const parsed = security.parseHttpsUrl(url);
    return !!parsed && security.isAllowedFetchUrl(parsed.href);
  }

  /**
   * Store one request the page hook matched.
   *
   * The bridge's claim about WHICH tracker matched is a hint, not an
   * authority — `matchRequest` decides again from the URL it can see.
   */
  async function capture(message = {}) {
    if (!(await enabled())) return { stored: 0 };
    const url = String(message.url || '');
    if (!allowedUrl(url)) return { stored: 0, reason: 'url-not-allowed' };
    const at = Number(message.at) || Date.now();
    const context = {
      url,
      method: String(message.method || 'GET').toUpperCase(),
      requestBody: cap(message.requestBody),
      responseBody: cap(message.responseBody),
      status: Number(message.status) || 0,
      ok: !!message.ok,
      at,
    };
    // A failed request created nothing; storing it would put phantom rows in
    // the dashboard for proposals that were never saved.
    if (context.status && !context.ok) return { stored: 0, reason: 'request-failed' };

    const hits = registry.matchRequest(context);
    // A tab loaded before the rep switched a tracker off still holds its rules
    // and will keep posting matches, so the switch is enforced HERE too — the
    // page's copy of the rules is a performance hint, never the authority.
    const stateBag = await store.state();
    let stored = 0;
    for (const { tracker, capture: rule } of hits) {
      if (!store.enabledIn(stateBag, tracker.id)) continue;
      let raw = null;
      try { raw = rule.extract(context); } catch { raw = null; }
      const record = registry.normalizeRecord(tracker, raw, { source: 'intercept', now: at });
      if (!record) continue;
      await store.upsert(tracker.id, [record], { now: at });
      stored += 1;
    }
    return { stored };
  }

  /** Credentialed CRM read. Cookie auth is the CRM's only auth, and the worker
   *  holds host permission for it — the same path notification polling uses. */
  async function fetchJson(url, options = {}) {
    if (!allowedUrl(url)) throw new Error('tracker request blocked by policy');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        credentials: 'include',
        signal: controller.signal,
        ...(options.body ? { body: options.body } : {}),
        ...(options.headers ? { headers: options.headers } : {}),
      });
      if (!response.ok) throw new Error(`tracker request failed: ${response.status}`);
      const body = await response.text();
      try { return JSON.parse(body); } catch { return body; }
    } finally {
      clearTimeout(timer);
    }
  }

  const crmTabs = () => new Promise((resolve) => {
    try { chrome.tabs.query({ url: CRM_TABS }, (tabs) => resolve(tabs || [])); }
    catch { resolve([]); }
  });

  function askTab(tabId, payload) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CRM tab did not answer')), CRM_SEARCH_TIMEOUT_MS);
      const settle = (fn, value) => { clearTimeout(timer); fn(value); };
      try {
        chrome.tabs.sendMessage(tabId, payload, (response) => {
          // A tab mid-navigation has no listener; lastError must be read or
          // Chrome logs it as unchecked.
          const failed = chrome.runtime.lastError;
          if (failed || !response) settle(reject, new Error(failed?.message || 'no answer'));
          else settle(resolve, response);
        });
      } catch (error) { settle(reject, error); }
    });
  }

  /**
   * Run the rep's recent-orders search on an open CRM page.
   *
   * The worker cannot make this request itself: the search index is
   * cookie-authenticated and a worker fetch is cross-site, so it carries no CRM
   * session — the same constraint lib/crm-index-store.js works around. The
   * signed-in employee name whose contacts we are asking about is likewise only
   * authoritative on a CRM page. So the page runs the search and the worker
   * stays the single writer of what comes back.
   *
   * Only this one message crosses: no URL and no query are handed to the tab,
   * so a widened poll cannot turn into a general authenticated-fetch proxy.
   *
   * With no CRM tab open, this throws — the sweep then leaves its cursor where
   * it is and asks again next wake, rather than recording a gap it never read.
   */
  async function crmContacts({ since = null, now = Date.now() } = {}) {
    const tabs = await crmTabs();
    if (!tabs.length) throw new Error('no CRM tab open to search from');
    let lastError = new Error('no CRM tab answered');
    for (const tab of tabs) {
      if (tab.id == null) continue;
      let response;
      try {
        response = await askTab(tab.id, { action: CRM_SEARCH_MESSAGE, since, now });
      } catch (error) {
        lastError = error;
        continue;
      }
      // A tab that answered "I can't" (no verified identity yet, CRM error) is
      // a real answer, but another tab may be further along — keep asking.
      if (!response.ok || !Array.isArray(response.docs)) {
        lastError = new Error(String(response.error || 'CRM search failed'));
        continue;
      }
      return response.docs.slice(0, MAX_CRM_DOCS);
    }
    throw lastError;
  }

  /** One list sweep for a poll tracker; returns the rows it had not seen. */
  async function pollTracker(tracker, { now = Date.now() } = {}) {
    if (!tracker || !tracker.poll) return { added: [] };
    const since = await store.lastPolledAt(tracker.id);
    let rows = [];
    try {
      rows = await tracker.poll.collect({ fetchJson, crmContacts, since, now }) || [];
    } catch {
      // A CRM that is briefly down must not advance the cursor, or the rows it
      // would have returned are never asked for again.
      return { added: [], failed: true };
    }
    const records = rows
      .map((raw) => registry.normalizeRecord(tracker, raw, { source: 'poll', now }))
      .filter(Boolean);
    const result = await store.upsert(tracker.id, records, { now });
    await store.markPolled(tracker.id, now);
    return { added: result.added };
  }

  /** Spend one refresh batch: re-ask about the rows whose answer may have moved. */
  async function refreshTracker(tracker, { now = Date.now() } = {}) {
    if (!tracker || !tracker.refresh) return { refreshed: 0 };
    const due = registry.dueRefreshes(tracker, await store.list(tracker.id), now);
    if (!due.length) return { refreshed: 0 };
    const updated = [];
    for (const record of due) {
      let patch = null;
      let failed = false;
      try {
        const request = tracker.refresh.request(record);
        const payload = await fetchJson(request.url, request);
        patch = tracker.refresh.apply(record, payload);
        failed = patch == null;
      } catch {
        failed = true;
      }
      updated.push(registry.applyRefresh(tracker, record, { patch, failed, now }));
    }
    await store.put(tracker.id, updated, { now });
    return { refreshed: updated.length };
  }

  /**
   * One pass over every tracker: due list polls, then due record refreshes.
   *
   * Re-entrant by accident is the normal case here — an alarm can fire while a
   * slow CRM read is still outstanding — so the guard is what keeps two sweeps
   * from double-spending the same batch.
   */
  async function sweep({ now = Date.now() } = {}) {
    if (sweeping || !(await enabled())) return { polled: 0, refreshed: 0 };
    sweeping = true;
    const result = { polled: 0, refreshed: 0 };
    try {
      // Read the switches once: a sweep is a batch, and a rep flipping a row
      // mid-sweep should take effect on the next one, not halfway through this.
      for (const tracker of await enabledTrackers()) {
        if (tracker.poll && registry.pollDue(tracker, await store.lastPolledAt(tracker.id), now)) {
          const polled = await pollTracker(tracker, { now });
          if (!polled.failed) result.polled += 1;
        }
        if (tracker.refresh) {
          const refreshed = await refreshTracker(tracker, { now });
          result.refreshed += refreshed.refreshed;
        }
      }
    } finally {
      sweeping = false;
    }
    return result;
  }

  /** Everything the (future) sales dashboard reads, in one call. */
  async function snapshots() {
    const out = [];
    for (const tracker of registry.list()) {
      const snapshot = await store.snapshot(tracker.id);
      if (snapshot) out.push(snapshot);
    }
    return out;
  }

  async function reconcile() {
    const on = await enabled();
    const existing = await new Promise((resolve) => {
      try { chrome.alarms.get(ALARM_NAME, (alarm) => resolve(alarm || null)); }
      catch { resolve(null); }
    });
    if (on && !existing) {
      chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: SWEEP_MINUTES, periodInMinutes: SWEEP_MINUTES,
      });
    } else if (!on && existing) {
      try { chrome.alarms.clear(ALARM_NAME); } catch { /* ignore */ }
    }
  }

  function install() {
    const quietly = () => { reconcile().catch(() => {}); };
    try {
      chrome.runtime.onInstalled.addListener(quietly);
      chrome.runtime.onStartup.addListener(quietly);
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm?.name === ALARM_NAME) sweep().catch(() => {});
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.featureFlags) quietly();
      });
    } catch { /* not a worker context (tests) — the API surface still works */ }
    quietly();
  }

  root.GBTrackers = Object.freeze({
    ALARM_NAME,
    FLAG_KEY,
    SWEEP_MINUTES,
    CRM_SEARCH_MESSAGE,
    enabled,
    trackerEnabled,
    enabledTrackers,
    setTrackerEnabled,
    captureRules,
    summaries,
    capture,
    fetchJson,
    crmContacts,
    pollTracker,
    refreshTracker,
    sweep,
    snapshots,
    reconcile,
    install,
  });
})(globalThis);
