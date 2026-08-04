(function installUsageTelemetry(root) {
  'use strict';

  /**
   * usage-telemetry.js — the installation's own usage reporter.
   *
   * Feeds the Toolkit Console's Presence / Latency / Adoption blocks. Content
   * scripts hand surface open/close events to the worker (see
   * src/lib/usageTelemetry.js); `installation-auth` hands it the round-trip
   * time of every backend call it makes. Both are buffered here and flushed as
   * one batch, because a per-event POST from every open tab would cost more
   * than the analytics are worth.
   *
   * The wire is content-free: a surface name, a duration, a request outcome.
   * Nothing here can carry what a user typed, searched, or ordered.
   *
   * Presence is derived from the flush itself — a batch arriving IS the
   * heartbeat — so an installation with a modal open reports every minute
   * without a second timer, and a browser that is closed simply stops.
   */

  const ADDRESS = `/${['projects', 'golfballs-extension', 'client', 'telemetry'].join('/')}`;
  const ALARM = ['gb', 'usage', 'flush'].join('-');
  // A minute is chrome.alarms' practical floor and the resolution the Presence
  // card needs; anything finer would be a timer the browser ignores anyway.
  const PERIOD_MINUTES = 1;
  // Held events, oldest dropped first. 240 covers a very busy minute across
  // every open tab; past that the count of what was dropped is the honest
  // thing to report, not a buffer that grows without bound.
  const CAPACITY = 240;
  const SURFACE_KINDS = new Set(['modal', 'page', 'popup']);
  const EVENT_KINDS = new Set(['surface_open', 'surface_close', 'latency']);
  const SURFACE_MAX = 64;
  // Anything longer is a stalled request or a tab left open overnight; it would
  // drag a percentile around without describing anything a user waited for.
  const MS_MAX = 15 * 60 * 1000;

  const finite = (value, max) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) && number >= 0 ? Math.min(number, max) : null;
  };

  function normalize(event) {
    if (!event || typeof event !== 'object') return null;
    const kind = String(event.kind || '');
    if (!EVENT_KINDS.has(kind)) return null;
    const out = { kind };
    if (kind === 'latency') {
      const ms = finite(event.ms, MS_MAX);
      if (ms === null) return null;
      out.ms = ms;
      out.ok = event.ok !== false;
      return out;
    }
    const surface = String(event.surface || '').trim().slice(0, SURFACE_MAX);
    if (!surface) return null;
    out.surface = surface;
    out.surface_kind = SURFACE_KINDS.has(event.surface_kind) ? event.surface_kind : 'modal';
    if (kind === 'surface_close') {
      const ms = finite(event.ms, MS_MAX);
      if (ms === null) return null;
      out.ms = ms;
    }
    return out;
  }

  function createReporter({
    chromeApi = root.chrome,
    auth = root.GBInstallationAuth,
    clock = () => Date.now(),
    newId = () => root.crypto.randomUUID(),
  } = {}) {
    if (!chromeApi?.alarms || !auth?.apiJson) {
      throw new Error('Usage telemetry is unavailable');
    }
    // One id per worker lifetime. A service worker dying and respawning starts
    // a new session, which is the truthful reading: the presence card counts
    // live workers, and a worker that was evicted was not present.
    const sessionId = String(newId());
    const startedAt = Number(clock()) || Date.now();
    let buffer = [];
    let dropped = 0;
    let flushing = null;

    function record(event) {
      const normalized = normalize(event);
      if (!normalized) return false;
      normalized.at = Number(clock()) || Date.now();
      buffer.push(normalized);
      if (buffer.length > CAPACITY) {
        dropped += buffer.length - CAPACITY;
        buffer = buffer.slice(-CAPACITY);
      }
      return true;
    }

    /** Round-trip of one backend call, from installation-auth's own fetch. */
    function sample(ms, ok) {
      return record({ kind: 'latency', ms, ok });
    }

    async function flush() {
      if (flushing) return flushing;
      // An empty buffer still flushes: the batch IS the presence heartbeat, so
      // an idle-but-open browser has to keep saying so.
      const events = buffer;
      const missed = dropped;
      buffer = [];
      dropped = 0;
      flushing = (async () => {
        try {
          await auth.apiJson(ADDRESS, {
            method: 'POST',
            body: JSON.stringify({
              session_id: sessionId,
              started_at: startedAt,
              dropped: missed,
              events,
            }),
            responseLimit: 8 * 1024,
          });
          return true;
        } catch {
          // Usage data is not worth a retry queue that could grow across an
          // outage. The next minute's batch carries presence forward; the
          // events in this one are simply gone.
          return false;
        }
      })();
      try {
        return await flushing;
      } finally {
        flushing = null;
      }
    }

    function start() {
      try {
        chromeApi.alarms.create(ALARM, { periodInMinutes: PERIOD_MINUTES });
      } catch { /* alarms unavailable — events still flush on demand */ }
    }

    chromeApi.alarms.onAlarm?.addListener((alarm) => {
      if (alarm?.name === ALARM) flush().catch(() => {});
    });

    return Object.freeze({
      sessionId,
      record,
      sample,
      flush,
      start,
      pending: () => buffer.length,
    });
  }

  root.GBUsageTelemetry = Object.freeze({
    createReporter,
    normalize,
    ADDRESS,
    ALARM,
    CAPACITY,
  });
})(globalThis);
