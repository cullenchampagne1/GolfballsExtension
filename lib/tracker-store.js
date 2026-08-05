/** Trackers — durable storage for tracked records.
 *
 * ONE WRITER. Records arrive from three directions (a page hook's captured
 * request, a scheduled list poll, a per-record refresh) and every one of them
 * lands here, in the service worker. Content scripts and, later, the sales
 * dashboard read; they never write. That is the same rule the proposal debug
 * log and the notification cache follow, and it is what keeps two CRM tabs from
 * clobbering each other's merge.
 *
 * ONE KEY PER TRACKER (`gbTracker:<id>`), not one key for everything: a
 * fifteen-minute orders poll rewriting the opportunities table is how a
 * capture gets lost to a lost update, and per-tracker keys keep each write
 * proportional to what actually changed.
 *
 * Records are stored newest-first and trimmed on every write by the tracker's
 * own retention policy, so the table cannot grow without a bound even if the
 * dashboard is never opened.
 */
(function installTrackerStore(root) {
  'use strict';
  if (root.GBTrackerStore) return;

  const registry = root.GBTrackerRegistry;
  if (!registry) throw new Error('GBTrackerStore requires GBTrackerRegistry');

  const PREFIX = 'gbTracker:';
  const STATE_KEY = 'gbTrackerState';
  const SCHEMA = 1;

  const storageKey = (trackerId) => `${PREFIX}${trackerId}`;

  const read = (keys) => new Promise((resolve) => {
    try { chrome.storage.local.get(keys, (value) => resolve(value || {})); }
    catch { resolve({}); }
  });

  const write = (value) => new Promise((resolve) => {
    try { chrome.storage.local.set(value, () => resolve(true)); }
    catch { resolve(false); }
  });

  /** Unwrap a stored envelope, tolerating a shape written by an older build. */
  function unwrap(bag, trackerId) {
    const stored = bag && bag[storageKey(trackerId)];
    if (Array.isArray(stored)) return stored;
    if (stored && Array.isArray(stored.records)) return stored.records;
    return [];
  }

  /** Every record this tracker holds, newest-first. */
  async function list(trackerId) {
    const tracker = registry.get(trackerId);
    if (!tracker) return [];
    return unwrap(await read(storageKey(tracker.id)), tracker.id);
  }

  async function find(trackerId, externalId) {
    const id = `${trackerId}:${String(externalId || '')}`;
    return (await list(trackerId)).find((record) => record && record.id === id) || null;
  }

  /**
   * Merge normalized records into a tracker's table.
   *
   * Returns `{ added, updated, records }` — the ADDED rows matter to the
   * caller: a poll that re-lists the same forty orders every quarter hour has
   * done nothing worth reacting to, and the runtime uses that to stay quiet.
   */
  async function upsert(trackerId, incoming, { now = Date.now() } = {}) {
    const tracker = registry.get(trackerId);
    if (!tracker) return { added: [], updated: [], records: [] };
    const rows = (Array.isArray(incoming) ? incoming : [incoming]).filter(Boolean);
    if (!rows.length) return { added: [], updated: [], records: await list(trackerId) };

    const current = unwrap(await read(storageKey(tracker.id)), tracker.id);
    const byId = new Map(current.map((record) => [record.id, record]));
    const added = [];
    const updated = [];
    for (const record of rows) {
      const previous = byId.get(record.id);
      if (previous) {
        const merged = registry.mergeRecord(previous, record);
        byId.set(record.id, merged);
        updated.push(merged);
      } else {
        byId.set(record.id, record);
        added.push(record);
      }
    }
    const records = registry.retain(tracker, [...byId.values()], now);
    await write({
      [storageKey(tracker.id)]: { v: SCHEMA, updatedAt: now, records },
    });
    return { added, updated, records };
  }

  /** Replace specific records in place — the refresh sweep's write path. */
  async function put(trackerId, records, { now = Date.now() } = {}) {
    const tracker = registry.get(trackerId);
    if (!tracker) return [];
    const rows = (Array.isArray(records) ? records : [records]).filter(Boolean);
    if (!rows.length) return list(trackerId);
    const current = unwrap(await read(storageKey(tracker.id)), tracker.id);
    const byId = new Map(current.map((record) => [record.id, record]));
    for (const record of rows) {
      // A refresh result for a row that retention has since dropped is stale
      // news about something we no longer track — let it go rather than
      // resurrect it.
      if (byId.has(record.id)) byId.set(record.id, record);
    }
    const next = registry.retain(tracker, [...byId.values()], now);
    await write({ [storageKey(tracker.id)]: { v: SCHEMA, updatedAt: now, records: next } });
    return next;
  }

  async function remove(trackerId, externalIds) {
    const tracker = registry.get(trackerId);
    if (!tracker) return [];
    const ids = new Set(
      (Array.isArray(externalIds) ? externalIds : [externalIds])
        .map((value) => `${tracker.id}:${String(value || '')}`),
    );
    const next = (await list(tracker.id)).filter((record) => !ids.has(record.id));
    await write({
      [storageKey(tracker.id)]: { v: SCHEMA, updatedAt: Date.now(), records: next },
    });
    return next;
  }

  async function clear(trackerId) {
    const tracker = registry.get(trackerId);
    if (!tracker) return;
    await write({
      [storageKey(tracker.id)]: { v: SCHEMA, updatedAt: Date.now(), records: [] },
    });
  }

  /* ── scheduler state ───────────────────────────────────────────────
     When each tracker last completed a list poll. Kept apart from the
     records so a sweep that finds nothing new still writes ~50 bytes
     rather than rewriting the whole table. */

  async function state() {
    const bag = await read(STATE_KEY);
    const value = bag[STATE_KEY];
    return value && typeof value === 'object' ? value : {};
  }

  async function markPolled(trackerId, at = Date.now()) {
    const current = await state();
    const next = {
      ...current,
      [trackerId]: { ...(current[trackerId] || {}), lastPolledAt: at },
    };
    await write({ [STATE_KEY]: next });
    return next;
  }

  async function lastPolledAt(trackerId) {
    const current = await state();
    return Number(current?.[trackerId]?.lastPolledAt) || 0;
  }

  /** Everything the dashboard needs for one tracker in a single read. */
  async function snapshot(trackerId) {
    const tracker = registry.get(trackerId);
    if (!tracker) return null;
    const [records, polledAt] = await Promise.all([
      list(tracker.id), lastPolledAt(tracker.id),
    ]);
    return {
      trackerId: tracker.id,
      label: tracker.label,
      kind: tracker.kind,
      recordKind: tracker.recordKind,
      lastPolledAt: polledAt,
      total: records.length,
      open: records.filter((record) => !record.settled).length,
      records,
    };
  }

  root.GBTrackerStore = Object.freeze({
    PREFIX,
    STATE_KEY,
    SCHEMA,
    storageKey,
    list,
    find,
    upsert,
    put,
    remove,
    clear,
    state,
    markPolled,
    lastPolledAt,
    snapshot,
  });
})(globalThis);
