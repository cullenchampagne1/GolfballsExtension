import { useEffect, useState, useCallback } from 'react';
import { loadDevSettings, useDevSetting } from './devSettings.js';
import { useToast } from '../ui/components/ToastHost.jsx';

/* ───────────────────────────────────────────────────────────────
   dataSource.js — one primitive for every network-backed data read.

   A "source" declares the SHAPE of the data it returns, how to FETCH
   it live, and how to MOCK it. callSource() then guarantees the same
   three-outcome contract everywhere:

     1. OK with data         → { state:'ok',       source:'live' }  (silent)
     2. OK but EMPTY / false  → { state:'empty',    source:'live' }  (silent — the
                                empty value is returned AS DATA; never mock, never a toast)
     3. REAL failure (fetch THREW: network / HTTP / parse, a detected
        auth-redirect, or no extension context to call at all)
                             → { state:'degraded', source:'mock' }  (one specific toast)

   "Empty stays silent" is structural: isEmpty() only runs on the live
   success path, so the ONLY way to get mock + a toast is a thrown error
   from fetch(). A legitimately-empty result can never trigger template
   data. Where empty genuinely IS a failure (e.g. blank required
   dropdowns), the source's fetch() should THROW rather than return empty.

   One global "force mock" knob (devSettings 'forceMockData') plus
   the existing outside-the-extension auto-mock flips every source to its
   mock() — this replaces the old per-modal useMock flags.
─────────────────────────────────────────────────────────────── */

/* True when we're running inside the extension (so a real call is even
   possible). False in a non-extension context (e.g. tests / a bare browser),
   where we auto-mock. Mirrors the check the modals used to inline. */
export function hasExtensionContext() {
  try { return typeof chrome !== 'undefined' && !!chrome.runtime?.id; }
  catch { return false; }
}

/* Async because the global mock setting lives in chrome.storage. Outside
   the extension we can't call anything, so force mock unconditionally. */
export async function shouldForceMock() {
  if (!hasExtensionContext()) return true;
  try {
    const settings = await loadDevSettings();
    return settings['forceMockData'] === true;
  } catch { return false; }
}

/* Default "is this legitimately empty?" derived from the declared shape.
   Sources with a nuanced payload (e.g. { docs, numFound }) pass their own
   isEmpty. */
function defaultIsEmpty(schema) {
  const type = schema && schema.type;
  if (type === 'array') return (d) => !Array.isArray(d) || d.length === 0;
  if (type === 'bool')  return (d) => d === false;
  return (d) => d === null || d === undefined;
}

/**
 * Declare a data source.
 * @param {object} def
 * @param {string}   def.id        stable id, used in default toast copy
 * @param {object}   [def.schema]  shape descriptor (reuses page-engine type
 *                                  names: string|number|currency|date|bool|
 *                                  array|object) — documents the shape and
 *                                  drives the default isEmpty. Descriptor only.
 * @param {Function} def.fetch     async (input) => data; THROWS on real failure
 * @param {Function} def.mock      (input) => canned data matching schema
 * @param {Function} [def.isEmpty] (data) => boolean; legitimately-empty test
 * @param {Function} [def.errorToast] (err, input) => toastSpec | null
 */
export function defineSource(def) {
  const { id, schema, fetch, mock, isEmpty, errorToast } = def || {};
  if (!id || typeof fetch !== 'function' || typeof mock !== 'function') {
    throw new Error('defineSource requires { id, fetch, mock }');
  }
  return Object.freeze({
    id,
    schema: schema || null,
    fetch,
    mock,
    isEmpty: isEmpty || defaultIsEmpty(schema),
    errorToast: errorToast || null,
  });
}

/* Pill-style toast variants take (message, opts); the richer variants
   (action/step/tray/select) take a single opts object. */
const MESSAGE_KINDS = new Set(['pill', 'edge', 'success', 'info', 'warning', 'error', 'brand']);

function fireSourceToast(spec, toast) {
  const t = toast || (typeof window !== 'undefined' ? window.__gbToast : null);
  if (!t || !spec) return;
  const kind = spec.kind || 'error';
  const fn = t[kind];
  try {
    if (typeof fn !== 'function') { t.error && t.error(spec.message || spec.title || 'Error'); return; }
    if (MESSAGE_KINDS.has(kind)) fn(spec.message || '', spec);
    else fn(spec);
  } catch { /* a missing toast host must never break a data call */ }
}

function defaultErrorToast(source) {
  return { kind: 'warning', message: `Couldn't load ${source.id} — showing fallback data` };
}

/**
 * Run a source. Settles to { data, source, state, error } and fires at most
 * one toast (only on 'degraded'). Never throws.
 * @param {object} source  from defineSource()
 * @param {*}      [input]  passed to fetch()/mock()
 * @param {object} [opts]
 * @param {boolean} [opts.forceMock]  override the global force-mock decision
 * @param {object}  [opts.toast]      a toast API (e.g. useToast()); falls back
 *                                    to window.__gbToast
 */
export async function callSource(source, input, opts = {}) {
  const force = opts.forceMock != null ? opts.forceMock : await shouldForceMock();
  if (force) {
    return { data: source.mock(input), source: 'mock', state: 'ok', error: null };
  }
  try {
    const data = await source.fetch(input);
    const empty = !!source.isEmpty(data);
    return { data, source: 'live', state: empty ? 'empty' : 'ok', error: null };
  } catch (error) {
    const spec = source.errorToast ? source.errorToast(error, input) : defaultErrorToast(source);
    if (spec) fireSourceToast(spec, opts.toast);
    return { data: source.mock(input), source: 'mock', state: 'degraded', error };
  }
}

/**
 * React convenience around callSource. Re-runs when `deps` change (the caller
 * owns the dependency list, like a useEffect) or when the global mock toggle
 * flips. Wires the in-tree toast + the live force-mock setting automatically.
 * @returns { data, loading, state, source, error, reload }
 */
export function useSource(source, input, deps = []) {
  const forceSetting = useDevSetting('forceMockData');
  const toast = useToast();
  const [result, setResult] = useState({ data: undefined, loading: true, state: 'ok', source: 'live', error: null });
  const [reloadN, setReloadN] = useState(0);

  useEffect(() => {
    let alive = true;
    setResult((r) => ({ ...r, loading: true }));
    const forceMock = !!forceSetting || !hasExtensionContext();
    callSource(source, input, { forceMock, toast }).then((out) => {
      if (alive) setResult({ ...out, loading: false });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, forceSetting, reloadN, ...deps]);

  const reload = useCallback(() => setReloadN((n) => n + 1), []);
  return { ...result, reload };
}
