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
  /* Settings → Developer Settings → "Trackers: log every sweep". The log is a
     visible, rep-facing switch rather than a constant, because a shipped
     extension narrating into a console nobody asked to read is noise — and
     because the switch is what makes the narration findable when it IS wanted. */
  const DEBUG_SETTING = 'trackers.debugLog';
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

  /* ── the log ───────────────────────────────────────────────────────
     A tracker is invisible by design: it runs on an alarm, in a worker nobody
     has open, and every failure path here is a `catch` that deliberately does
     not surface. That is right for a rep and useless for anyone asking "why is
     this table empty" — so with the Developer Setting on, every decision the
     sweep makes says so:

       note   — the decisions that could explain an empty table: the window
                asked for, rows read, rows stored, cursor moved or held.
       detail — the query itself, per-row rejections, tab ids. One line per
                record, so it stays out of the way until asked for.
       warn   — the errors the catches swallow.

     The switch is read from storage rather than held in a variable because an
     MV3 worker is killed after seconds of idle: a flag set in the console
     would be off again by the time the next alarm woke it. */
  const PREFIX = '[gb:trackers]';
  let logging = false;
  let verbose = false;
  let pinned = false;

  // eslint-disable-next-line no-console
  const say = (...args) => { try { console.log(PREFIX, ...args); } catch { /* */ } }; // SECURITY-AUDITED-DEV-SETTING-CONSOLE
  const note = (...args) => { if (logging) say(...args); };
  const detail = (...args) => { if (logging && verbose) say(...args); };
  // eslint-disable-next-line no-console
  const warn = (...args) => { if (logging) { try { console.warn(PREFIX, ...args); } catch { /* */ } } }; // SECURITY-AUDITED-DEV-SETTING-CONSOLE
  const reason = (error) => String(error?.message || error || 'unknown');

  function readSetting(bag) {
    return bag?.devSettings?.[DEBUG_SETTING] === true;
  }

  async function loadLogging() {
    // A typed console command has pinned the log open; the stored setting does
    // not get to shut it again mid-sweep.
    if (pinned) return logging;
    logging = readSetting(await getStorage('devSettings'));
    return logging;
  }

  /**
   * Turn the log on or off from the console, writing through to the same
   * Developer Setting the settings page shows — one switch, two places to
   * throw it, and it survives the worker being killed either way.
   */
  async function setLogging(on, { verbose: detailed = true } = {}) {
    logging = on !== false;
    verbose = logging && detailed !== false;
    const bag = await getStorage('devSettings');
    const settings = { ...(bag.devSettings || {}), [DEBUG_SETTING]: logging };
    await new Promise((resolve) => {
      try { chrome.storage.local.set({ devSettings: settings }, () => resolve(true)); }
      catch { resolve(false); }
    });
    say(`logging ${logging ? 'ON' : 'off'}${logging && verbose ? ' (with per-row detail)' : ''}`);
    return logging;
  }

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
   *
   * Answers with what the page READ, not just the rows: `complete` is how the
   * caller knows the window was drained rather than truncated at the page cap,
   * and it is the difference between a cursor that may safely move past this
   * window and one that must not.
   */
  async function crmContacts({ since = null, now = Date.now() } = {}) {
    const tabs = await crmTabs();
    if (!tabs.length) throw new Error('no CRM tab open to search from');
    detail('CRM tabs available:', tabs.map((tab) => `${tab.id}:${tab.url || ''}`).join(', '));
    let lastError = new Error('no CRM tab answered');
    for (const tab of tabs) {
      if (tab.id == null) continue;
      let response;
      try {
        response = await askTab(tab.id, { action: CRM_SEARCH_MESSAGE, since, now });
      } catch (error) {
        detail(`tab ${tab.id} did not answer:`, reason(error));
        lastError = error;
        continue;
      }
      // A tab that answered "I can't" (no verified identity yet, CRM error) is
      // a real answer, but another tab may be further along — keep asking.
      if (!response.ok || !Array.isArray(response.docs)) {
        detail(`tab ${tab.id} refused:`, reason(response.error));
        lastError = new Error(String(response.error || 'CRM search failed'));
        continue;
      }
      const docs = response.docs.slice(0, MAX_CRM_DOCS);
      const truncated = docs.length < response.docs.length;
      note(
        `CRM search on tab ${tab.id}: ${docs.length} row(s)`,
        `of ${response.numFound ?? '?'} found,`,
        `${response.pages ?? '?'} page(s), window from ${response.sinceDay || '?'}`,
      );
      return {
        docs,
        numFound: Number(response.numFound) || docs.length,
        pages: Number(response.pages) || 1,
        sinceDay: response.sinceDay || null,
        // The page reports whether it drained the result set; an older page
        // build that reports nothing is trusted only if it clearly did.
        complete: !truncated && (
          response.complete != null
            ? response.complete === true
            : docs.length >= (Number(response.numFound) || 0)
        ),
      };
    }
    throw lastError;
  }

  /**
   * One list sweep for a poll tracker.
   *
   * THE CURSOR RULE lives here, and it is the whole reason a poll tracker can
   * be trusted. `collect` may answer with rows alone, or with rows plus what
   * it saw (`{ rows, seen, complete }`); the cursor moves past this window
   * only when the sweep both read all of it and banked what was in it:
   *
   *   · read failed            → cursor held, nothing was seen
   *   · rows seen, none stored → cursor held, and a loud warning: the mapping
   *                              is broken, and moving on would bury it
   *   · read truncated         → cursor moves to the oldest row banked, the
   *                              floor of what this newest-first read DID
   *                              drain — never to `now`, which would skip the
   *                              unread older tail. A read that names no such
   *                              floor holds, as before.
   *   · window drained & empty → cursor advances; there was nothing to miss
   *
   * The poll CLOCK (`markPolled`) moves in every one of those cases except a
   * hard failure, because it paces the next attempt and has nothing to do with
   * what was read.
   */
  async function pollTracker(tracker, { now = Date.now() } = {}) {
    if (!tracker || !tracker.poll) return { added: [] };
    const since = await store.cursorAt(tracker.id);
    note(
      `poll ${tracker.id}: reading from`,
      since ? new Date(since).toISOString() : 'the first-run lookback',
    );
    let collected;
    try {
      collected = await tracker.poll.collect({
        fetchJson, crmContacts, since, now, log: detail,
      });
    } catch (error) {
      // A CRM that is briefly down must not advance the cursor, or the rows it
      // would have returned are never asked for again.
      warn(`poll ${tracker.id} failed:`, reason(error));
      return { added: [], failed: true, error: reason(error) };
    }
    const rows = Array.isArray(collected) ? collected : (collected?.rows || []);
    const meta = Array.isArray(collected) ? {} : (collected || {});
    const seen = Number(meta.seen ?? rows.length) || 0;
    const complete = meta.complete !== false;

    const records = rows
      .map((raw) => registry.normalizeRecord(tracker, raw, { source: 'poll', now }))
      .filter(Boolean);
    const result = await store.upsert(tracker.id, records, { now });
    if (tracker.id === 'recent-orders' && result.added.length) {
      // The subject tracker owns attribution; the generic tracker runtime only
      // hands it newly observed orders after they are durably banked.
      try { await root.GBEmailTemplateTracking?.recordOrders?.(result.added); }
      catch { /* order tracking remains healthy if attribution storage fails */ }
    }
    await store.markPolled(tracker.id, now);

    // A truncated read may still name a floor it DID drain (see below).
    const floor = Number(meta.cursorTo) || 0;

    let cursor = 'held';
    if (seen > 0 && !records.length) {
      warn(
        `poll ${tracker.id}: read ${seen} row(s) but recorded 0 —`,
        'the rows could not be mapped, so the cursor stays put rather than skipping them',
      );
    } else if (complete) {
      await store.markCursor(tracker.id, now);
      cursor = 'advanced';
    } else if (floor > since && floor <= now) {
      // Truncated, but not blind. A newest-first read that stops at the page
      // ceiling drained everything from `floor` (the oldest row it banked) to
      // now; only what is OLDER than that went unread. Advancing to the floor
      // steps over nothing that was read, and it is what keeps a big book
      // moving: hold the cursor at the first-run lookback instead and a window
      // that truncates once truncates on every sweep thereafter, because the
      // window only ever widens. What is dropped is the tail below the floor,
      // which sits behind a full page-set of newer orders.
      await store.markCursor(tracker.id, floor);
      cursor = 'advanced to the oldest row read';
      warn(
        `poll ${tracker.id}: read was truncated (${seen} row(s) of ${meta.numFound ?? '?'}) —`,
        `the window was drained back to ${new Date(floor).toISOString()} and the cursor moved there;`,
        'rows older than that in this window were passed over, being older than everything just read',
      );
    } else {
      warn(
        `poll ${tracker.id}: read was truncated (${seen} row(s) of ${meta.numFound ?? '?'}) —`,
        'holding the cursor so the rest of the window is asked for again',
      );
    }
    note(
      `poll ${tracker.id}: ${seen} row(s) read →`,
      `${records.length} record(s) (${result.added.length} new,`,
      `${result.updated.length} updated), cursor ${cursor}`,
    );
    return {
      added: result.added, updated: result.updated, seen, records: records.length, cursor,
    };
  }

  /** Spend one refresh batch: re-ask about the rows whose answer may have moved. */
  async function refreshTracker(tracker, { now = Date.now() } = {}) {
    if (!tracker || !tracker.refresh) return { refreshed: 0 };
    const due = registry.dueRefreshes(tracker, await store.list(tracker.id), now);
    if (!due.length) return { refreshed: 0 };
    const updated = [];
    let failures = 0;
    for (const record of due) {
      let patch = null;
      let failed = false;
      try {
        const request = tracker.refresh.request(record);
        const payload = await fetchJson(request.url, request);
        patch = tracker.refresh.apply(record, payload);
        failed = patch == null;
        if (failed) detail(`refresh ${record.id}: the CRM answered nothing usable`);
      } catch (error) {
        detail(`refresh ${record.id} failed:`, reason(error));
        failed = true;
      }
      if (failed) failures += 1;
      updated.push(registry.applyRefresh(tracker, record, { patch, failed, now }));
    }
    await store.put(tracker.id, updated, { now });
    note(`refresh ${tracker.id}: ${updated.length} record(s) re-asked, ${failures} failed`);
    return { refreshed: updated.length, failed: failures };
  }

  /**
   * One pass over every tracker: due list polls, then due record refreshes.
   *
   * Re-entrant by accident is the normal case here — an alarm can fire while a
   * slow CRM read is still outstanding — so the guard is what keeps two sweeps
   * from double-spending the same batch.
   *
   * `force` runs every enabled poll whether or not its cadence says it is due.
   * Only a human debugging asks for that (see the console commands at the foot
   * of this file); the alarm never does, because ignoring the cadence is how a
   * five-minute wake turns into a search a minute.
   *
   * The returned object is a REPORT, not a tally: which trackers ran, what each
   * read, and — when nothing happened — the reason, which is the question
   * anyone running this by hand is actually asking.
   */
  async function sweep({ now = Date.now(), force = false } = {}) {
    if (sweeping) {
      note('sweep skipped: one is already running');
      return { polled: 0, refreshed: 0, skipped: 'already-sweeping', trackers: [] };
    }
    await loadLogging();
    if (!(await enabled())) {
      note(`sweep skipped: the ${FLAG_KEY} feature flag is off (Settings → Tools → Trackers)`);
      return { polled: 0, refreshed: 0, skipped: 'feature-off', trackers: [] };
    }
    sweeping = true;
    const result = { polled: 0, refreshed: 0, trackers: [] };
    try {
      // Read the switches once: a sweep is a batch, and a rep flipping a row
      // mid-sweep should take effect on the next one, not halfway through this.
      const collecting = await enabledTrackers();
      note(
        `sweep${force ? ' (forced)' : ''} over ${collecting.length} enabled tracker(s):`,
        collecting.map((tracker) => tracker.id).join(', ') || 'none',
      );
      if (!collecting.length) {
        note('every tracker is switched off in Settings → Tools → Trackers');
      }
      for (const tracker of collecting) {
        const entry = { trackerId: tracker.id };
        if (tracker.poll) {
          const lastPolled = await store.lastPolledAt(tracker.id);
          const due = force || registry.pollDue(tracker, lastPolled, now);
          if (due) {
            const polled = await pollTracker(tracker, { now });
            // Counts, not the rows themselves: this report is logged and sent
            // back over the message channel, and a poll that read three hundred
            // contacts would otherwise ship all three hundred with it.
            entry.seen = polled.seen || 0;
            entry.stored = polled.records || 0;
            entry.added = polled.added?.length || 0;
            entry.cursor = polled.cursor || null;
            if (polled.failed) entry.failed = polled.error || true;
            else result.polled += 1;
          } else {
            const waited = Math.round((now - lastPolled) / 60_000);
            entry.skipped = `not due (${waited}m of ${tracker.poll.everyMinutes}m)`;
            note(`poll ${tracker.id}: ${entry.skipped} — gbTrackers.sweep() forces it`);
          }
        }
        if (tracker.refresh) {
          const refreshed = await refreshTracker(tracker, { now });
          entry.refreshed = refreshed.refreshed;
          result.refreshed += refreshed.refreshed;
        }
        result.trackers.push(entry);
      }
    } finally {
      sweeping = false;
    }
    note('sweep done:', JSON.stringify(result.trackers));
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

  const stamp = (value) => (Number(value) > 0 ? new Date(Number(value)).toISOString() : null);

  /**
   * Why is this table empty? — answered in one object.
   *
   * Every gate a record has to pass, in the order it has to pass it: the
   * feature flag, the tracker's own switch, a CRM tab to search from, the poll
   * cadence, the data cursor, and what is actually stored. A tracker showing
   * nothing is always one of those, and reading them one at a time out of
   * chrome.storage is exactly the errand this saves.
   */
  async function status({ now = Date.now() } = {}) {
    const featureEnabled = await enabled();
    const stateBag = await store.state();
    const tabs = await crmTabs();
    const alarm = await new Promise((resolve) => {
      try { chrome.alarms.get(ALARM_NAME, (found) => resolve(found || null)); }
      catch { resolve(null); }
    });
    const trackers = [];
    for (const tracker of registry.list()) {
      const records = await store.list(tracker.id);
      const cursor = Number(stateBag?.[tracker.id]?.cursorAt) || 0;
      const lastPolled = Number(stateBag?.[tracker.id]?.lastPolledAt) || 0;
      trackers.push({
        trackerId: tracker.id,
        kind: tracker.kind,
        enabled: store.enabledIn(stateBag, tracker.id),
        records: records.length,
        newestRecord: stamp(records[0]?.updatedAt),
        lastPolledAt: stamp(lastPolled),
        cursorAt: stamp(cursor) || 'unset — next poll runs the first-run lookback',
        pollDue: tracker.poll ? registry.pollDue(tracker, lastPolled, now) : null,
      });
    }
    return {
      featureEnabled,
      featureFlag: FLAG_KEY,
      logging: logging ? (verbose ? 'on (with per-row detail)' : 'on') : `off — Developer Settings → ${DEBUG_SETTING}`,
      sweepAlarm: alarm ? stamp(alarm.scheduledTime) : 'not armed',
      crmTabsOpen: tabs.length,
      trackers,
    };
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
        if (alarm?.name === ALARM_NAME) {
          sweep().catch((error) => warn('sweep threw:', reason(error)));
        }
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.featureFlags) quietly();
        if (area === 'local' && changes.devSettings) logging = readSetting(changes.devSettings.newValue ? { devSettings: changes.devSettings.newValue } : {});
      });
    } catch { /* not a worker context (tests) — the API surface still works */ }
    loadLogging().catch(() => {});
    quietly();
  }

  root.GBTrackers = Object.freeze({
    ALARM_NAME,
    FLAG_KEY,
    DEBUG_SETTING,
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
    status,
    setLogging,
    reconcile,
    install,
  });

  /* ── the console commands ──────────────────────────────────────────
     For a human with the service worker's devtools open (chrome://extensions →
     "Inspect views: service worker"). Everything above runs on an alarm, which
     is a poor thing to sit and wait for when the question is "does this work at
     all" — so the same engine is reachable by hand:

       gbTrackers.help()          what these do
       gbTrackers.status()        every gate, in the order a record passes them
       gbTrackers.sweep()         run all trackers NOW, ignoring the cadence
       gbTrackers.orders()        the recent-order rows as stored
       gbTrackers.logging(true)   keep narrating (the Developer Setting)
       gbTrackers.rewind()        re-read the first-run window (7 days back)

     `sweep()` narrates whether or not the setting is on — a human typed it,
     and going to Settings first to see the answer would be a poor trade. The
     page half logs in the CRM TAB's console rather than this one, so one sweep
     tells its story across two: the query and what the index answered there,
     what was stored here. */
  const HELP = [
    'gbTrackers.status()       — flags, switches, cursors, counts, CRM tabs',
    'gbTrackers.sweep()        — force every enabled tracker to run now',
    'gbTrackers.orders(limit)  — stored recent-order rows, newest first',
    'gbTrackers.records(id)    — stored rows for any tracker id',
    'gbTrackers.logging(on)    — narrate every sweep from now on (a Developer Setting)',
    'gbTrackers.rewind(id)     — rewind the data cursor to the first-run window',
    'gbTrackers.on() / .off()  — the trackersEnabled feature flag',
  ];

  async function setFeatureEnabled(on) {
    const bag = await getStorage('featureFlags');
    const flags = { ...(bag.featureFlags || {}), [FLAG_KEY]: on !== false };
    await new Promise((resolve) => {
      try { chrome.storage.local.set({ featureFlags: flags }, () => resolve(true)); }
      catch { resolve(false); }
    });
    await reconcile();
    note(`${FLAG_KEY} is now ${flags[FLAG_KEY] ? 'ON' : 'off'}`);
    return flags[FLAG_KEY];
  }

  /** Run something with the log fully open, whatever the setting says, and put
   *  the setting back afterwards. What every typed command wants. */
  async function outLoud(work) {
    const was = { logging, verbose, pinned };
    logging = true;
    verbose = true;
    pinned = true;
    try { return await work(); }
    finally { ({ logging, verbose, pinned } = was); }
  }

  root.gbTrackers = {
    help() { for (const line of HELP) say(line); return HELP.length; },
    status: () => outLoud(() => status().then((value) => { say('status:', value); return value; })),
    sweep: (options = {}) => outLoud(() => sweep({ force: true, ...options })),
    records: (trackerId) => store.list(trackerId),
    orders: (limit = 25) => store.list('recent-orders').then((rows) => rows.slice(0, limit)),
    logging: (on = true) => setLogging(on),
    rewind: (trackerId = 'recent-orders') => store.resetCursor(trackerId)
      .then(() => say(`${trackerId}: cursor rewound — the next sweep re-reads the first-run window`)),
    on: () => setFeatureEnabled(true),
    off: () => setFeatureEnabled(false),
  };
})(globalThis);
