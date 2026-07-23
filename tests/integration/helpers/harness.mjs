/**
 * Integration-test harness — vm-sandboxes the extension's classic scripts
 * (security-policy.js, installation-auth.js, settings-registry.js,
 * remote-settings-policy.js, crm-index-store.js, background.js) with mocked
 * I/O boundaries only: chrome.*, fetch, and indexedDB. All product logic runs
 * unmodified inside the vm context, mirroring scripts/test-installation-auth.mjs
 * and scripts/test-remote-settings-policy.mjs.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const ROOT = new URL('../../../', import.meta.url);
export const MANIFEST = JSON.parse(readFileSync(new URL('manifest.json', ROOT), 'utf8'));
export const EXTENSION_ID = 'annoeoeiijgdgmlpefllibcilcamnjek';
export const API_ORIGIN = 'https://api.cullenchampagne.com';
export const API_KEY = `rsk_${'a'.repeat(12)}_${'B'.repeat(48)}`;
export const INSTALLATION_ID = '12345678-1234-4234-8234-123456789abc';

/** A stored credential that normalizeInstallation() accepts as-is. */
export function validInstallation(overrides = {}) {
  return {
    installationId: INSTALLATION_ID,
    apiKey: API_KEY,
    keyPrefix: 'rsk_aaaaaaaaaaaa_…',
    enrolledAt: 1_750_000_000_000,
    extensionId: EXTENSION_ID,
    extensionVersion: MANIFEST.version,
    ...overrides,
  };
}

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/**
 * Wrap a per-test route handler so every outbound request is recorded.
 * handler(url, options) may return a Response or undefined (→ 404).
 */
export function createFetchMock(handler = () => undefined) {
  const requests = [];
  const fetchMock = async (url, options = {}) => {
    const entry = {
      url: String(url && typeof url === 'object' && url.url ? url.url : url),
      method: String(options.method || 'GET').toUpperCase(),
      options,
    };
    requests.push(entry);
    const response = await handler(entry.url, options);
    return response ?? jsonResponse({ detail: 'not found' }, 404);
  };
  return { fetchMock, requests };
}

/** Chrome API mock: in-memory storage + captured listeners. */
export function createChrome({ stored = {}, extensionId = EXTENSION_ID, version = MANIFEST.version } = {}) {
  const listeners = {
    installed: [], startup: [], message: [], storageChanged: [],
    alarm: [], windowRemoved: [], tabRemoved: [],
  };
  const alarms = [];
  const registeredContentScripts = [];
  const actionState = { enabled: true };
  const toList = (keys) => (Array.isArray(keys) ? keys : [keys]);
  const chrome = {
    runtime: {
      id: extensionId,
      lastError: null,
      getManifest: () => ({ version }),
      getURL: (path) => `chrome-extension://${extensionId}/${path}`,
      onInstalled: { addListener: (fn) => listeners.installed.push(fn) },
      onStartup: { addListener: (fn) => listeners.startup.push(fn) },
      onMessage: { addListener: (fn) => listeners.message.push(fn) },
    },
    storage: {
      local: {
        get(keys, callback) {
          if (keys == null) { callback({ ...stored }); return; }
          callback(Object.fromEntries(
            toList(keys).filter((key) => Object.hasOwn(stored, key)).map((key) => [key, stored[key]]),
          ));
        },
        set(values, callback) { Object.assign(stored, values); callback?.(); },
        remove(keys, callback) { for (const key of toList(keys)) delete stored[key]; callback?.(); },
      },
      onChanged: { addListener: (fn) => listeners.storageChanged.push(fn) },
    },
    tabs: {
      query(_query, callback) {
        if (callback) { callback([]); return undefined; }
        return Promise.resolve([]);
      },
      sendMessage: async () => undefined,
      create: () => undefined,
      remove(_ids, callback) { callback?.(); },
      reload(_id, callback) { callback?.(); },
      onRemoved: { addListener: (fn) => listeners.tabRemoved.push(fn) },
    },
    scripting: {
      unregisterContentScripts({ ids } = {}, callback) {
        const selected = new Set(ids || []);
        for (let index = registeredContentScripts.length - 1; index >= 0; index -= 1) {
          if (!ids || selected.has(registeredContentScripts[index].id)) {
            registeredContentScripts.splice(index, 1);
          }
        }
        callback?.();
      },
      registerContentScripts(scripts, callback) {
        registeredContentScripts.push(...structuredClone(scripts));
        callback?.();
      },
    },
    action: {
      enable(callback) { actionState.enabled = true; callback?.(); },
      disable(callback) { actionState.enabled = false; callback?.(); },
    },
    windows: {
      onRemoved: { addListener: (fn) => listeners.windowRemoved.push(fn) },
    },
    alarms: {
      create: (name, options) => alarms.push({ name, options }),
      onAlarm: { addListener: (fn) => listeners.alarm.push(fn) },
    },
  };
  return { chrome, stored, listeners, alarms, registeredContentScripts, actionState };
}

/** vm context seeded with the host intrinsics the extension scripts use. */
export function createContext({ chrome, fetchImpl, extras = {} } = {}) {
  const context = vm.createContext({
    console, chrome, fetch: fetchImpl,
    URL, URLSearchParams, Headers, Response, Request, FormData, Blob, File,
    TextEncoder, TextDecoder, atob, btoa, structuredClone, queueMicrotask,
    setTimeout, clearTimeout, setInterval, clearInterval,
    crypto, CryptoKey,
    Date, Math, JSON, Promise, Object, Array, String, Number, Boolean,
    RegExp, Error, TypeError, RangeError, Map, Set, WeakMap, Symbol,
    Uint8Array, ArrayBuffer, DataView, isNaN, parseInt, parseFloat,
    ...extras,
  });
  context.globalThis = context;
  return context;
}

export function loadScript(context, file) {
  const source = readFileSync(new URL(file, ROOT), 'utf8');
  new vm.Script(source, { filename: file }).runInContext(context);
}

/** Let queued microtasks/macrotasks (enrollment, quiet syncs) drain. */
export async function settle(rounds = 12) {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Load installation-auth.js alone (enrollment + API-guard flows). */
export function loadInstallationAuth({ stored = {}, fetchImpl } = {}) {
  const parts = createChrome({ stored });
  const context = createContext({ chrome: parts.chrome, fetchImpl });
  loadScript(context, 'lib/installation-auth.js');
  return { ...parts, context, client: context.GBInstallationAuth };
}

/** In-memory IndexedDB double (same shape as scripts/test-crm-index-encryption.mjs). */
export function makeFakeIndexedDb() {
  const records = new Map();
  const keys = new Map();
  const stores = new Map();
  function requestResult(value) {
    const request = {};
    queueMicrotask(() => { request.result = value; request.onsuccess?.(); });
    return request;
  }
  function makeStore(name) {
    const values = name === 'keys' ? keys : records;
    const keyField = name === 'keys' ? 'id' : 'storageKey';
    return {
      createIndex() {},
      put(value) { values.set(value[keyField], structuredClone(value)); },
      get(key) { return requestResult(values.has(key) ? structuredClone(values.get(key)) : undefined); },
      getAll() { return requestResult([...values.values()].map((value) => structuredClone(value))); },
      delete(key) { values.delete(key); },
      clear() { values.clear(); },
    };
  }
  const db = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(name) {
      const store = makeStore(name);
      stores.set(name, store);
      return store;
    },
    transaction(name) {
      const tx = { objectStore: (storeName) => stores.get(storeName || name), oncomplete: null, onerror: null, error: null };
      setTimeout(() => tx.oncomplete?.(), 0);
      return tx;
    },
  };
  const indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => { request.result = db; request.onupgradeneeded?.(); request.onsuccess?.(); });
      return request;
    },
    deleteDatabase() {
      const request = {};
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
  return { indexedDB, records, keys };
}

/**
 * Load the full real background.js (which importScripts()-loads security
 * policy, installation auth, settings registry, remote settings policy, CRM
 * index store, and defaults). Returns a sendMessage() that drives the real
 * chrome.runtime.onMessage router exactly like a content script would.
 */
export async function loadBackground({ stored = {}, fetchImpl, indexedDb } = {}) {
  const parts = createChrome({ stored });
  const gatedFetch = (url, options) => {
    if (new URL(String(url)).pathname === '/projects/golfballs-extension/client/health') {
      return Promise.resolve(jsonResponse({
        ok: true, session_valid: true, extension_enabled: true,
        assistant_enabled: true,
      }));
    }
    return fetchImpl(url, options);
  };
  const context = createContext({
    chrome: parts.chrome,
    fetchImpl: gatedFetch,
    extras: { indexedDB: indexedDb ?? makeFakeIndexedDb().indexedDB },
  });
  context.importScripts = (...files) => { for (const file of files) loadScript(context, file); };
  loadScript(context, 'background.js');
  await settle();
  const sendMessage = (msg, sender) => new Promise((resolve) => {
    // Responses are built inside the vm realm; clone them into this realm so
    // node:assert deep equality sees ordinary Object prototypes.
    const respond = (value) => resolve(value === undefined ? undefined : structuredClone(value));
    const keepOpen = parts.listeners.message[0](
      msg,
      sender ?? { id: parts.chrome.runtime.id, tab: { id: 1 } },
      respond,
    );
    if (keepOpen !== true) respond(undefined);
  });
  return { ...parts, context, sendMessage };
}
