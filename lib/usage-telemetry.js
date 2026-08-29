(function installUsageTelemetry(root) {
  'use strict';

  /**
   * The installation's content-free utilization reporter.
   *
   * Content scripts send fixed feature/surface events to the MV3 worker. The
   * worker coalesces high-frequency feature actions, retains the pending minute
   * in chrome.storage.session across worker eviction, and sends one periodic
   * batch through the installation credential. No typed content, CRM identity,
   * URL, subject, recipient, filename, or search query can enter this contract.
   */

  const ADDRESS = `/${['projects', 'golfballs-extension', 'client', 'telemetry'].join('/')}`;
  const ALARM = ['gb', 'usage', 'flush'].join('-');
  const STATE_KEY = 'gbUsageTelemetryStateV2';
  const PERIOD_MINUTES = 1;
  const SOON_MS = 1_500;
  const CAPACITY = 240;
  const FEATURE_CAPACITY = 96;
  const SURFACE_KINDS = new Set(['modal', 'page', 'popup']);
  const FEATURE_KINDS = new Set([
    'email_send',
    'email_preview',
    'contact_import',
    'proof_submit',
    'gift_catalog_open',
    'gift_catalog_search',
    'gift_catalog_add',
    'gift_catalog_proposal_save',
    'gift_catalog_publish',
    'gift_catalog_email',
    'gift_catalog_checkout',
  ]);
  const FEATURE_SOURCES = new Set([
    'popup', 'task_list', 'crm_search', 'email_preview', 'contact',
    'submit_proof', 'gift_catalog', 'other',
  ]);
  const TRANSPORTS = new Set(['pa', 'mailto', 'none']);
  const EVENT_KINDS = new Set(['surface_open', 'surface_close', 'latency', 'feature']);
  const SURFACE_MAX = 64;
  const MS_MAX = 15 * 60 * 1000;
  const COUNT_MAX = 1_000_000;

  const finite = (value, max, minimum = 0) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) && number >= minimum ? Math.min(number, max) : null;
  };

  function normalize(event) {
    if (!event || typeof event !== 'object') return null;
    const kind = String(event.kind || '');
    if (!EVENT_KINDS.has(kind)) return null;
    const out = { kind };
    if (kind === 'feature') {
      const feature = String(event.feature || '');
      const source = String(event.source || 'other');
      const transport = event.transport == null ? null : String(event.transport);
      const count = finite(event.count == null ? 1 : event.count, 10_000, 1);
      if (!FEATURE_KINDS.has(feature) || !FEATURE_SOURCES.has(source) || count === null) return null;
      if (transport !== null && !TRANSPORTS.has(transport)) return null;
      out.feature = feature;
      out.source = source;
      if (transport) out.transport = transport;
      out.count = count;
      out.word_count = finite(event.word_count || 0, COUNT_MAX) || 0;
      out.attachment_count = Math.min(count, finite(event.attachment_count || 0, COUNT_MAX) || 0);
      out.inline_image_count = Math.min(count, finite(event.inline_image_count || 0, COUNT_MAX) || 0);
      out.ok = event.ok !== false;
      return out;
    }
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

  function storageRead(store) {
    if (!store?.get) return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        store.get([STATE_KEY], (data) => {
          void root.chrome?.runtime?.lastError;
          resolve(data?.[STATE_KEY] || null);
        });
      } catch { resolve(null); }
    });
  }

  function storageWrite(store, value) {
    if (!store?.set) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        store.set({ [STATE_KEY]: value }, () => {
          void root.chrome?.runtime?.lastError;
          resolve();
        });
      } catch { resolve(); }
    });
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
    const store = chromeApi.storage?.session || null;
    let sessionId = String(newId());
    let startedAt = Number(clock()) || Date.now();
    let installationId = null;
    let buffer = [];
    let featureBuckets = new Map();
    let dropped = 0;
    let flushing = null;
    let soonTimer = null;
    let hydrated = false;
    let dirty = false;
    let writing = null;

    const featureKey = (event) => [
      event.feature,
      event.source,
      event.transport || '',
      event.ok === false ? '0' : '1',
    ].join('|');

    function mergeFeature(event) {
      const key = featureKey(event);
      const current = featureBuckets.get(key);
      if (current) {
        current.count = Math.min(COUNT_MAX, current.count + event.count);
        current.word_count = Math.min(COUNT_MAX, current.word_count + event.word_count);
        current.attachment_count = Math.min(current.count, current.attachment_count + event.attachment_count);
        current.inline_image_count = Math.min(current.count, current.inline_image_count + event.inline_image_count);
        current.at = Math.max(current.at || 0, event.at || 0);
        return;
      }
      featureBuckets.set(key, { ...event });
      if (featureBuckets.size > FEATURE_CAPACITY) {
        const oldest = featureBuckets.keys().next().value;
        featureBuckets.delete(oldest);
        dropped += 1;
      }
    }

    function stateSnapshot() {
      return {
        version: 2,
        installation_id: installationId,
        session_id: sessionId,
        started_at: startedAt,
        dropped,
        events: buffer,
        features: [...featureBuckets.values()],
      };
    }

    function queuePersist() {
      dirty = true;
      if (!hydrated || !store || writing) return;
      writing = (async () => {
        while (dirty) {
          dirty = false;
          await storageWrite(store, stateSnapshot());
        }
      })().finally(() => {
        writing = null;
        if (dirty) queuePersist();
      });
    }

    const ready = (async () => {
      let status = null;
      try { status = await auth.getStatus?.(); } catch { status = null; }
      installationId = status?.installationId || null;
      const saved = await storageRead(store);
      const sameInstallation = !saved?.installation_id || !installationId
        || saved.installation_id === installationId;
      if (saved && saved.version === 2 && sameInstallation) {
        sessionId = String(saved.session_id || sessionId);
        startedAt = Number(saved.started_at) || startedAt;
        dropped += finite(saved.dropped || 0, COUNT_MAX) || 0;
        const currentEvents = buffer;
        buffer = [];
        for (const item of [...(Array.isArray(saved.events) ? saved.events : []), ...currentEvents]) {
          const normalized = normalize(item);
          if (!normalized || normalized.kind === 'feature') continue;
          normalized.at = finite(item.at, Number.MAX_SAFE_INTEGER) || (Number(clock()) || Date.now());
          buffer.push(normalized);
        }
        const currentFeatures = [...featureBuckets.values()];
        featureBuckets = new Map();
        for (const item of [...(Array.isArray(saved.features) ? saved.features : []), ...currentFeatures]) {
          const normalized = normalize(item);
          if (!normalized || normalized.kind !== 'feature') continue;
          normalized.at = finite(item.at, Number.MAX_SAFE_INTEGER) || (Number(clock()) || Date.now());
          mergeFeature(normalized);
        }
      }
      if (buffer.length > CAPACITY) {
        dropped += buffer.length - CAPACITY;
        buffer = buffer.slice(-CAPACITY);
      }
      hydrated = true;
      queuePersist();
    })();

    function record(event) {
      const normalized = normalize(event);
      if (!normalized) return false;
      normalized.at = Number(clock()) || Date.now();
      if (normalized.kind === 'feature') {
        mergeFeature(normalized);
      } else {
        buffer.push(normalized);
        if (buffer.length > CAPACITY) {
          dropped += buffer.length - CAPACITY;
          buffer = buffer.slice(-CAPACITY);
        }
      }
      queuePersist();
      return true;
    }

    function sample(ms, ok) {
      return record({ kind: 'latency', ms, ok });
    }

    async function flush() {
      if (flushing) return flushing;
      flushing = (async () => {
        await ready;
        if (writing) await writing;
        const events = [...buffer, ...featureBuckets.values()];
        const missed = dropped;
        buffer = [];
        featureBuckets = new Map();
        dropped = 0;
        // Drain persistence before the request. If Chrome evicts/restarts the
        // worker mid-flight it cannot replay the same utilization aggregate.
        queuePersist();
        if (writing) await writing;
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
          // Operational analytics never blocks product work and never grows an
          // unbounded retry queue. The next batch resumes with fresh counts.
          return false;
        }
      })();
      try {
        return await flushing;
      } finally {
        flushing = null;
      }
    }

    function flushSoon() {
      if (soonTimer) return;
      soonTimer = setTimeout(() => {
        soonTimer = null;
        flush().catch(() => {});
      }, SOON_MS);
    }

    function start() {
      try {
        chromeApi.alarms.create(ALARM, { periodInMinutes: PERIOD_MINUTES });
      } catch { /* alarms unavailable — rare events may still flush soon */ }
    }

    chromeApi.alarms.onAlarm?.addListener((alarm) => {
      if (alarm?.name === ALARM) flush().catch(() => {});
    });

    return Object.freeze({
      get sessionId() { return sessionId; },
      record,
      sample,
      flush,
      flushSoon,
      start,
      ready: () => ready,
      pending: () => buffer.length + featureBuckets.size,
    });
  }

  root.GBUsageTelemetry = Object.freeze({
    createReporter,
    normalize,
    ADDRESS,
    ALARM,
    STATE_KEY,
    CAPACITY,
    FEATURE_CAPACITY,
  });
})(globalThis);
