/* ───────────────────────────────────────────────────────────────
   customActions — user-authored shelf actions.

   A rep writes a small script in the code-blocks engine (the same one
   campaigns use) and it becomes an Action Shelf item (and optionally a
   popup button). Each record carries its own surface config (pages /
   showInShelf / showInPopup) — that's why custom actions live in the
   Settings "Custom Actions" table while built-in features live in their
   own rows.

   Storage: chrome.storage.local['gbCustomActions'] (array of records).
   Pure helpers (normalize / CRUD-on-array / defaults) are chrome-free and
   unit-tested; load/save are chrome-guarded and mirror customItems.js.
─────────────────────────────────────────────────────────────── */

import { togglePage } from './features/featureConfig.js';

export const STORAGE_KEY = 'gbCustomActions';

/** Page types a rep can author against. order/contact/account scope `page.*`
 *  to that CRM page; `custom` gives read-only DOM access on any page. */
export const ACTION_PAGE_TYPES = Object.freeze([
  { id: 'contact', label: 'Contact' },
  { id: 'account', label: 'Account' },
  { id: 'order', label: 'Order' },
  { id: 'custom', label: 'Custom (any page)' },
]);
const PAGE_TYPE_IDS = ACTION_PAGE_TYPES.map((p) => p.id);

/** Default shelf pages for a page type: the type itself, or any page for custom. */
export function defaultPagesFor(pageType) {
  return pageType === 'custom' ? ['*'] : [pageType];
}

/** Fresh unique id. Not pure (time/random) — only called when creating. */
export function newActionId() {
  return `ca_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Clamp a saved/partial record to a complete, valid shape. Pure. */
export function normalizeCustomAction(rec = {}) {
  const pageType = PAGE_TYPE_IDS.includes(rec.pageType) ? rec.pageType : 'contact';
  const pages = Array.isArray(rec.pages) && rec.pages.length ? rec.pages.slice() : defaultPagesFor(pageType);
  return {
    id: rec.id || newActionId(),
    name: (typeof rec.name === 'string' && rec.name.trim()) ? rec.name.trim() : 'Untitled action',
    description: typeof rec.description === 'string' ? rec.description : '',
    icon: typeof rec.icon === 'string' && rec.icon ? rec.icon : 'bolt',
    pageType,
    source: typeof rec.source === 'string' ? rec.source : '',
    enabled: rec.enabled !== false,
    pages,
    showInShelf: rec.showInShelf !== false,
    showInPopup: !!rec.showInPopup,
    updatedAt: Number.isFinite(rec.updatedAt) ? rec.updatedAt : Date.now(),
  };
}

/** A brand-new action seeded for the chosen page type (starter source). */
export function blankCustomAction(pageType = 'contact') {
  const pt = PAGE_TYPE_IDS.includes(pageType) ? pageType : 'contact';
  return normalizeCustomAction({
    id: newActionId(),
    name: 'New action',
    pageType: pt,
    pages: defaultPagesFor(pt),
    source: starterSource(pt),
    updatedAt: Date.now(),
  });
}

/** A tiny, safe starter script per page type so the editor isn't blank. */
export function starterSource(pageType) {
  if (pageType === 'custom') {
    return [
      '// Custom action — runs on any page.',
      '// Use actions.* (confirm-gated writes) and page.* where available.',
      '// (Raw DOM access isn’t available yet — the script runs sandboxed.)',
      "return 'Ran custom action';",
      '',
    ].join('\n');
  }
  return [
    `// Runs against the current ${pageType} page.`,
    '// Example: create a few follow-up tasks.',
    'for (let i = 1; i <= 3; i++) {',
    '  actions.createTask({ subject: `Follow up ${i}` });',
    '}',
    "return 'Created 3 tasks';",
    '',
  ].join('\n');
}

/** Toggle a page in an action's shelf scope. Reuses the featureConfig rule
 *  ('*' clears the rest; last specific → back to '*'). Pure. */
export function toggleActionPage(action, page) {
  return { ...action, pages: togglePage(action.pages, page) };
}

/** Upsert a record into a list by id (pure — returns a new array). */
export function upsertCustomAction(list, rec) {
  const norm = normalizeCustomAction(rec);
  const idx = (list || []).findIndex((a) => a.id === norm.id);
  if (idx < 0) return [...(list || []), norm];
  const next = list.slice();
  next[idx] = norm;
  return next;
}

/** Remove a record by id (pure). */
export function removeCustomActionFrom(list, id) {
  return (list || []).filter((a) => a.id !== id);
}

/* ── storage (chrome-guarded) ── */

export function loadCustomActions() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) { resolve([]); return; }
      chrome.storage.local.get(STORAGE_KEY, (d) => {
        const list = (d && Array.isArray(d[STORAGE_KEY])) ? d[STORAGE_KEY] : [];
        resolve(list.map(normalizeCustomAction));
      });
    } catch { resolve([]); }
  });
}

export function saveCustomActions(list) {
  const clean = (list || []).map(normalizeCustomAction);
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) { resolve(clean); return; }
      chrome.storage.local.set({ [STORAGE_KEY]: clean }, () => {
        // Nudge open golfballs tabs to re-read (same channel the shelf watches).
        try {
          chrome.tabs?.query?.({ url: '*://*.golfballs.com/*' }, (tabs) => {
            (tabs || []).forEach((t) => { try { chrome.tabs.sendMessage(t.id, { action: 'GB_FEATURE_FLAGS' }, () => void chrome.runtime.lastError); } catch { /* */ } });
          });
        } catch { /* non-extension context */ }
        resolve(clean);
      });
    } catch { resolve(clean); }
  });
}
