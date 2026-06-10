/* ───────────────────────────────────────────────────────────────
   mock-chrome.js — a minimal chrome.* shim for the Operator's Guide.

   The guide's live snippets mount the REAL modal components
   (WatchList, TaskList, CRMSearch, …). Those call chrome.storage and
   chrome.runtime directly. When the guide runs as a real extension
   page those APIs exist and the modals show the user's real data —
   so we DON'T touch chrome there. This shim installs ONLY when there
   is no extension context (the localhost dev preview), seeded with
   realistic sample data so the demos look populated and predictable.

   It is intentionally tiny: get/set/onChanged on a local object,
   stubbed runtime + tabs. The data-heavy modals (TaskList, CRMSearch)
   are mounted with `useMock` so they generate their own demo rows and
   never hit the network paths.
─────────────────────────────────────────────────────────────── */

const HOUR = 3600000;

/* Seed data — keyed exactly as the real storage keys. */
function seed() {
  const now = Date.now();
  return {
    featureFlags: {},          // registry defaults apply
    devSettings: {},           // registry defaults apply
    keyboardShortcuts: {},
    gbTheme: { variant: 'dark', colors: {} },

    templates: [
      { id: 'tpl_ship', name: 'Order Shipped', type: 'order', enabled: true, subject: 'Your order has shipped', body: 'Hi {{first_name}}, your order {{order_no}} is on its way.', vars: { first_name: {}, order_no: {} }, variations: [{ id: 'a', preview: 'Warmer' }] },
      { id: 'tpl_proof', name: 'Art Proof Ready', type: 'order', enabled: true, subject: 'Your proof is ready', body: 'Hi {{first_name}}, your art proof is ready to review.', vars: { first_name: {} }, variations: [] },
      { id: 'tpl_winback', name: 'Win-back Check-in', type: 'account', enabled: true, subject: "We'd love to help with your next order", body: 'Hi {{first_name}}, it has been a while…', vars: { first_name: {} }, variations: [] },
    ],
    templateFolders: [],

    noteTemplates: [
      { id: 'nt_followup', subType: 'task', name: 'Proposal Follow-up', enabled: true, label: 'Proposal Follow-up', subject: 'Follow up on quote', body: 'Check in on the proposal sent.', priority: '2', categoryId: '8', daysOut: 5 },
      { id: 'nt_15day', subType: 'task', name: '15-Day Call', enabled: true, label: '15-Day Call', subject: '15 day call/email', body: '', priority: '2', categoryId: '12', daysOut: 15 },
      { id: 'nt_vm', subType: 'call_log', name: 'Returning Voicemail', enabled: true, label: 'Left VM — follow up', direction: '0', categoryId: '27', voicemail: true, subject: 'Returning voicemail', body: '' },
      { id: 'nt_status', subType: 'call_log', name: 'Order Status', enabled: true, label: 'Order status inquiry', direction: '1', categoryId: '2', voicemail: false, subject: 'Order status', body: '' },
      { id: 'nt_note', subType: 'note', name: 'Proof Requested', enabled: true, label: 'Proof Requested', subject: 'Proof requested', body: 'Art proof requested from the customer.', daysOut: null },
    ],
    noteFolders: [],

    watchList: [
      { id: 'w1', title: 'Verify reprint shipped', done: false, priority: 'high', due: 'today', addedAt: now - 7 * HOUR, contextType: 'order', contextId: '29103' },
      { id: 'w2', title: 'Confirm logo colors with Marcus', done: false, priority: 'medium', due: '06/12/26', addedAt: now - 5 * HOUR, contextType: 'contact', contextId: '4421', contextName: 'Marcus Chen' },
      { id: 'w3', title: 'Check stock before quoting', done: false, priority: 'low', due: '', addedAt: now - 40 * 60000, contextType: 'account', contextId: '2188', contextName: 'Acme Industries' },
      { id: 'w4', title: 'Send tournament gift options', done: true, priority: 'medium', due: '', addedAt: now - 30 * HOUR, completedAt: now - 2 * HOUR, contextType: 'standalone' },
    ],

    userPresets: [],
    crmSavedQueries: [],
    crmQuickPresets: [],
  };
}

let installed = false;

export function installMockChromeIfNeeded() {
  if (installed) return true;
  if (typeof window === 'undefined') return false;
  // Real extension context — leave it alone, modals use real data.
  if (window.chrome && window.chrome.storage && window.chrome.storage.local) return false;

  const store = seed();
  const listeners = new Set();

  const pick = (keys) => {
    if (keys == null) return { ...store };
    if (typeof keys === 'string') return { [keys]: store[keys] };
    if (Array.isArray(keys)) return Object.fromEntries(keys.map((k) => [k, store[k]]));
    // object form: keys with defaults
    return Object.fromEntries(Object.keys(keys).map((k) => [k, store[k] !== undefined ? store[k] : keys[k]]));
  };

  const storageArea = {
    get(keys, cb) {
      const out = pick(keys);
      if (cb) { cb(out); return undefined; }
      return Promise.resolve(out);
    },
    set(obj, cb) {
      const changes = {};
      for (const k of Object.keys(obj)) { changes[k] = { oldValue: store[k], newValue: obj[k] }; store[k] = obj[k]; }
      listeners.forEach((fn) => { try { fn(changes, 'local'); } catch { /* ignore */ } });
      if (cb) { cb(); return undefined; }
      return Promise.resolve();
    },
    remove(keys, cb) {
      const arr = Array.isArray(keys) ? keys : [keys];
      const changes = {};
      arr.forEach((k) => { changes[k] = { oldValue: store[k], newValue: undefined }; delete store[k]; });
      listeners.forEach((fn) => { try { fn(changes, 'local'); } catch { /* ignore */ } });
      if (cb) { cb(); return undefined; }
      return Promise.resolve();
    },
  };

  installed = true;
  window.chrome = {
    storage: {
      local: storageArea,
      session: storageArea,
      onChanged: {
        addListener: (fn) => listeners.add(fn),
        removeListener: (fn) => listeners.delete(fn),
      },
    },
    runtime: {
      id: undefined,                 // left undefined so hasExtensionContext() stays false → modals auto-mock
      lastError: null,
      getManifest: () => ({ version: '3.3' }),
      getURL: (p) => p,
      sendMessage: (_msg, cb) => { const r = { success: true, mock: true }; if (cb) cb(r); return Promise.resolve(r); },
      onMessage: { addListener() {}, removeListener() {} },
    },
    tabs: {
      query: (_q, cb) => { const r = [{ id: 1, url: 'guide://demo' }]; if (cb) cb(r); return Promise.resolve(r); },
      sendMessage: (_id, _msg, cb) => { if (cb) cb(null); return Promise.resolve(null); },
      create: (_o, cb) => { if (cb) cb({ id: 2 }); return Promise.resolve({ id: 2 }); },
      get: (_id, cb) => { const r = { id: 1 }; if (cb) cb(r); return Promise.resolve(r); },
      update: (_id, _o, cb) => { if (cb) cb({ id: 1 }); return Promise.resolve({ id: 1 }); },
    },
  };
  return true;
}

/* Self-install on import. guide.jsx imports this module FIRST (before
   any modal), so the shim is in place before WatchList et al. capture
   `hasChromeStorage` at their own module-eval time. */
installMockChromeIfNeeded();
