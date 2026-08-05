/** Trackers — the registry that says WHAT is tracked and HOW it stays current.
 *
 * A tracker watches one kind of business record as the rep works. Adding one
 * is a definition object here; nothing in the capture path, the storage layer,
 * or the scheduler needs to learn about it.
 *
 * THREE CLOCKS, not two. A tracker is declared `intercept` or `poll` by how
 * records ARRIVE, but arrival is only half the problem:
 *
 *   1. capture   (intercept) — the rep creates an opportunity or a proposal and
 *                the CRM's own request carries the record to us. Free, instant,
 *                and impossible to miss while a CRM tab is open.
 *   2. discovery (poll)      — nobody's request announces it: recent orders
 *                exist because a customer bought something. A list endpoint is
 *                swept on a schedule and new rows become records.
 *   3. refresh   (both)      — the record we captured goes STALE in ways no
 *                request of ours will ever mention. An opportunity we opened is
 *                closed by someone else, or ages out; the only way to know is to
 *                re-ask about that one record. This is per-record and
 *                incremental: each row carries its own next-check time and stops
 *                being asked about once `settled` says the answer can't change.
 *
 * The third clock is why a tracked table doesn't rot. A record captured on
 * Monday and closed on Thursday by another rep is correct in the dashboard
 * without anyone reopening the page.
 *
 * PURE. No chrome, DOM, fetch, or storage — matching, normalization, and the
 * "what is due" arithmetic only, so the whole schedule is testable against a
 * fixed clock. lib/tracker-store.js persists; lib/tracker-runtime.js does I/O.
 *
 * Classic-script IIFE so the MV3 worker can importScripts() it and
 * src/lib/trackers.js can re-export the same instance to bundled UI.
 */
(function installTrackerRegistry(root) {
  'use strict';
  if (root.GBTrackerRegistry) return;

  const KINDS = new Set(['intercept', 'poll']);
  const SOURCES = new Set(['intercept', 'poll', 'refresh']);
  const ID_RE = /^[a-z][a-z0-9-]{1,39}$/;
  const MINUTE = 60_000;

  /* Storage is shared with the rest of the extension and a tracker runs
     unattended for weeks, so every bound here is deliberate rather than a
     guess: a runaway extractor fills the quota nobody is watching. */
  const LIMITS = Object.freeze({
    maxRecords: 500,        // per tracker, newest-first
    maxAgeDays: 180,
    maxDataKeys: 40,
    maxTextLength: 500,
    maxTitleLength: 160,
    maxRefreshFailures: 8,  // then the record settles unrefreshed
  });

  const text = (value, limit = LIMITS.maxTextLength) => (
    String(value == null ? '' : value).trim().slice(0, limit)
  );

  const finite = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const millis = (value, fallback = null) => {
    if (value instanceof Date) return value.getTime();
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const fn = (value) => (typeof value === 'function' ? value : null);

  /* Structural, not `instanceof`: a definition authored in one realm and
     validated in another (the worker's vm harness, a bundled page) carries a
     perfectly good RegExp whose prototype chain says otherwise. */
  const isPattern = (value) => !!value
    && typeof value.test === 'function'
    && typeof value.source === 'string';

  /** A tracked record's own field bag: primitives only, bounded both ways.
   *  Extractors read CRM responses, so this is the line between "a field we
   *  chose to track" and "whatever the endpoint happened to return". */
  function normalizeData(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out = {};
    for (const [key, raw] of Object.entries(value)) {
      if (Object.keys(out).length >= LIMITS.maxDataKeys) break;
      if (!ID_RE.test(String(key).toLowerCase()) && !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) continue;
      if (raw == null) continue;
      if (typeof raw === 'boolean' || typeof raw === 'number') {
        if (typeof raw === 'number' && !Number.isFinite(raw)) continue;
        out[key] = raw;
      } else if (typeof raw === 'string') {
        const trimmed = text(raw);
        if (trimmed) out[key] = trimmed;
      }
    }
    return out;
  }

  function assert(condition, message) {
    if (!condition) throw new Error(`tracker definition: ${message}`);
  }

  function normalizeCapture(capture, index) {
    assert(capture && typeof capture === 'object', `capture #${index} must be an object`);
    const id = text(capture.id, 40);
    assert(ID_RE.test(id), `capture #${index} needs a lowercase id`);
    assert(isPattern(capture.match), `capture "${id}" needs a RegExp match`);
    assert(fn(capture.extract), `capture "${id}" needs an extract(context) function`);
    const method = text(capture.method || '*', 10).toUpperCase() || '*';
    return Object.freeze({
      id,
      method,
      match: capture.match,
      // A capture may need the response, which costs a body clone in the page
      // hook; declaring it keeps that cost off the captures that don't.
      wantsResponse: capture.wantsResponse !== false,
      extract: capture.extract,
    });
  }

  function normalizeRefresh(refresh, trackerId) {
    if (!refresh) return null;
    assert(typeof refresh === 'object', `${trackerId}: refresh must be an object`);
    const everyMinutes = finite(refresh.everyMinutes);
    assert(everyMinutes && everyMinutes > 0, `${trackerId}: refresh.everyMinutes must be positive`);
    assert(fn(refresh.request), `${trackerId}: refresh.request(record) is required`);
    assert(fn(refresh.apply), `${trackerId}: refresh.apply(record, payload) is required`);
    assert(fn(refresh.settled), `${trackerId}: refresh.settled(record) is required`);
    return Object.freeze({
      everyMinutes,
      // Backoff caps how hard a broken endpoint is retried; a record that keeps
      // failing settles rather than being asked about forever.
      maxFailures: finite(refresh.maxFailures) || LIMITS.maxRefreshFailures,
      maxAgeDays: finite(refresh.maxAgeDays) || LIMITS.maxAgeDays,
      batchSize: Math.max(1, Math.min(finite(refresh.batchSize) || 10, 50)),
      request: refresh.request,
      apply: refresh.apply,
      settled: refresh.settled,
    });
  }

  function normalizePoll(poll, trackerId) {
    if (!poll) return null;
    assert(typeof poll === 'object', `${trackerId}: poll must be an object`);
    const everyMinutes = finite(poll.everyMinutes);
    assert(everyMinutes && everyMinutes > 0, `${trackerId}: poll.everyMinutes must be positive`);
    assert(fn(poll.collect), `${trackerId}: poll.collect(context) is required`);
    return Object.freeze({ everyMinutes, collect: poll.collect });
  }

  /** Validate one definition into its frozen, complete form. */
  function normalizeDefinition(definition) {
    assert(definition && typeof definition === 'object', 'must be an object');
    const id = text(definition.id, 40);
    assert(ID_RE.test(id), `"${id}" is not a valid tracker id`);
    const kind = text(definition.kind, 16);
    assert(KINDS.has(kind), `${id}: kind must be intercept or poll`);
    const recordKind = text(definition.recordKind || id, 40);

    const captures = (definition.captures || []).map(normalizeCapture);
    const poll = normalizePoll(definition.poll, id);
    if (kind === 'intercept') {
      assert(captures.length, `${id}: an intercept tracker needs at least one capture`);
    } else {
      assert(poll, `${id}: a poll tracker needs a poll definition`);
    }

    const retention = definition.retention || {};
    return Object.freeze({
      id,
      kind,
      recordKind,
      label: text(definition.label || id, 80),
      captures: Object.freeze(captures),
      poll,
      refresh: normalizeRefresh(definition.refresh, id),
      identify: fn(definition.identify),
      retention: Object.freeze({
        maxRecords: Math.max(1, Math.min(
          finite(retention.maxRecords) || LIMITS.maxRecords, LIMITS.maxRecords,
        )),
        maxAgeDays: Math.max(1, Math.min(
          finite(retention.maxAgeDays) || LIMITS.maxAgeDays, LIMITS.maxAgeDays,
        )),
      }),
    });
  }

  const definitions = new Map();

  function define(definition) {
    const normalized = normalizeDefinition(definition);
    definitions.set(normalized.id, normalized);
    return normalized;
  }

  const get = (id) => definitions.get(text(id, 40)) || null;
  const list = () => [...definitions.values()];
  const listByKind = (kind) => list().filter((tracker) => tracker.kind === kind);
  const clear = () => definitions.clear();

  /**
   * The match rules a page-world hook needs, and nothing else.
   *
   * The hook runs in the WEBSITE's main world where our extractors have no
   * business executing: it decides "is this request interesting", posts the
   * raw exchange to the isolated world, and stops there. Regexes cross as
   * source + flags because a structured clone would drop the RegExp itself.
   */
  function captureRules() {
    const rules = [];
    for (const tracker of listByKind('intercept')) {
      for (const capture of tracker.captures) {
        rules.push({
          trackerId: tracker.id,
          captureId: capture.id,
          method: capture.method,
          source: capture.match.source,
          flags: capture.match.flags,
          wantsResponse: capture.wantsResponse,
        });
      }
    }
    return rules;
  }

  /** Every (tracker, capture) whose rule matches one observed request. */
  function matchRequest({ url, method } = {}) {
    const href = String(url || '');
    if (!href) return [];
    const verb = text(method || 'GET', 10).toUpperCase();
    const hits = [];
    for (const tracker of listByKind('intercept')) {
      for (const capture of tracker.captures) {
        if (capture.method !== '*' && capture.method !== verb) continue;
        if (!capture.match.test(href)) continue;
        hits.push({ tracker, capture });
      }
    }
    return hits;
  }

  /**
   * One extractor's raw output as a canonical record.
   *
   * Identity is the whole game: the same opportunity captured at creation,
   * re-seen by a poll, and refreshed an hour later has to be ONE row. The
   * tracker names the external id; everything downstream keys on it.
   */
  function normalizeRecord(tracker, raw, { source = 'intercept', now = Date.now() } = {}) {
    if (!tracker || !raw || typeof raw !== 'object') return null;
    const externalId = text(
      tracker.identify ? tracker.identify(raw) : (raw.externalId ?? raw.id), 80,
    );
    if (!externalId) return null;
    const at = millis(raw.at, now) || now;
    return {
      id: `${tracker.id}:${externalId}`,
      trackerId: tracker.id,
      recordKind: tracker.recordKind,
      externalId,
      title: text(raw.title, LIMITS.maxTitleLength),
      status: text(raw.status || 'unknown', 40),
      value: finite(raw.value),
      data: normalizeData(raw.data),
      source: SOURCES.has(source) ? source : 'intercept',
      capturedAt: at,
      updatedAt: at,
      // Refresh bookkeeping travels WITH the record: the scheduler holds no
      // per-record state of its own, so a worker restart loses nothing.
      refreshedAt: null,
      refreshFailures: 0,
      settled: false,
      nextRefreshAt: tracker.refresh ? at + (tracker.refresh.everyMinutes * MINUTE) : null,
    };
  }

  /**
   * Fold a re-observation into the record already stored.
   *
   * Capture wins on first sight and never again: the poll that re-lists an
   * opportunity, or a refresh that answers about it, is newer information
   * about the SAME thing. `capturedAt` is therefore preserved — when we first
   * saw it is a fact about us, not about the record.
   */
  function mergeRecord(previous, incoming) {
    if (!previous) return incoming;
    if (!incoming) return previous;
    return {
      ...previous,
      ...incoming,
      capturedAt: previous.capturedAt || incoming.capturedAt,
      // An empty title from a thin poll row must not blank a rich captured one.
      title: incoming.title || previous.title,
      value: incoming.value == null ? previous.value : incoming.value,
      data: { ...previous.data, ...incoming.data },
      source: previous.source,
      updatedAt: Math.max(
        Number(previous.updatedAt) || 0, Number(incoming.updatedAt) || 0,
      ),
      refreshedAt: incoming.refreshedAt ?? previous.refreshedAt,
      refreshFailures: incoming.refreshFailures ?? previous.refreshFailures,
      settled: incoming.settled ?? previous.settled,
      nextRefreshAt: incoming.nextRefreshAt ?? previous.nextRefreshAt,
    };
  }

  /** Records this tracker owes an incremental update, oldest due first. */
  function dueRefreshes(tracker, records, now = Date.now()) {
    const refresh = tracker && tracker.refresh;
    if (!refresh) return [];
    const floor = now - (refresh.maxAgeDays * 86_400_000);
    return (Array.isArray(records) ? records : [])
      .filter((record) => (
        record
        && !record.settled
        && (Number(record.capturedAt) || 0) >= floor
        && (Number(record.nextRefreshAt) || 0) <= now
      ))
      .sort((a, b) => (Number(a.nextRefreshAt) || 0) - (Number(b.nextRefreshAt) || 0))
      .slice(0, refresh.batchSize);
  }

  /**
   * The record as it stands after one refresh attempt.
   *
   * Success re-asks on the tracker's cadence; failure backs off geometrically
   * so a CRM that is down for an afternoon is not hammered by every row at
   * once. Either way the record decides its OWN next check.
   */
  function applyRefresh(tracker, record, { patch = null, failed = false, now = Date.now() } = {}) {
    const refresh = tracker && tracker.refresh;
    if (!refresh || !record) return record;
    if (failed) {
      const failures = (Number(record.refreshFailures) || 0) + 1;
      const backoff = Math.min(2 ** failures, 32);
      return {
        ...record,
        refreshFailures: failures,
        // Give up asking rather than retry a permanently broken row forever.
        settled: failures >= refresh.maxFailures,
        nextRefreshAt: now + (refresh.everyMinutes * MINUTE * backoff),
      };
    }
    const merged = {
      ...record,
      refreshedAt: now,
      refreshFailures: 0,
      updatedAt: now,
    };
    if (patch && typeof patch === 'object') {
      if (patch.status != null) merged.status = text(patch.status, 40);
      if (patch.title != null) merged.title = text(patch.title, LIMITS.maxTitleLength) || merged.title;
      if (patch.value != null) merged.value = finite(patch.value);
      merged.data = { ...merged.data, ...normalizeData(patch.data) };
    }
    // Settled means "no later answer can differ" — a closed opportunity is
    // closed. The row stays in the table; it just stops costing a request.
    merged.settled = !!refresh.settled(merged);
    merged.nextRefreshAt = merged.settled
      ? null
      : now + (refresh.everyMinutes * MINUTE);
    return merged;
  }

  /** Whether this poll tracker's list sweep is due. */
  function pollDue(tracker, lastPolledAt, now = Date.now()) {
    if (!tracker || !tracker.poll) return false;
    const last = Number(lastPolledAt) || 0;
    return now - last >= tracker.poll.everyMinutes * MINUTE;
  }

  /** Newest-first, deduplicated by id, trimmed to the tracker's retention. */
  function retain(tracker, records, now = Date.now()) {
    const rows = Array.isArray(records) ? records.filter(Boolean) : [];
    const floor = now - (tracker.retention.maxAgeDays * 86_400_000);
    const byId = new Map();
    for (const record of rows) {
      const previous = byId.get(record.id);
      byId.set(record.id, previous ? mergeRecord(previous, record) : record);
    }
    return [...byId.values()]
      .filter((record) => (Number(record.updatedAt) || 0) >= floor)
      .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
      .slice(0, tracker.retention.maxRecords);
  }

  root.GBTrackerRegistry = Object.freeze({
    LIMITS,
    define,
    get,
    list,
    listByKind,
    clear,
    captureRules,
    matchRequest,
    normalizeRecord,
    mergeRecord,
    dueRefreshes,
    applyRefresh,
    pollDue,
    retain,
  });
})(globalThis);
