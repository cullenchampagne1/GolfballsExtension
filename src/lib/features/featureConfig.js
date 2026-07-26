/* ───────────────────────────────────────────────────────────────
   features/featureConfig — per-feature SURFACE + PAGE config.

   The master on/off stays in featureFlags (unchanged). This is a sibling
   bag `chrome.storage.local.featureConfig`:
     { [flagKey]: { showInPopup, showInShelf, pages: string[] } }
   Defaults are derived from the capability registry (a popup-only feature
   can never be shown-in-shelf, etc.). Rides the existing GB_FEATURE_FLAGS
   broadcast the shelf already watches.

   Pure normalize/query here; storage helpers are chrome-guarded.
─────────────────────────────────────────────────────────────── */

import { FEATURE_REGISTRY } from './featureRegistry.js';

export const FEATURE_CONFIG_KEY = 'featureConfig';

/** Normalize a saved config against the registry (fills defaults, clamps to
 *  what each feature actually supports). Always returns every feature. */
export function normalizeFeatureConfig(saved = {}) {
  const out = {};
  for (const f of FEATURE_REGISTRY) {
    const s = (saved && saved[f.key]) || {};
    const canPopup = !!f.surfaces.popup;
    const canShelf = !!f.surfaces.shelf;
    out[f.key] = {
      showInPopup: canPopup ? (s.showInPopup !== false) : false,
      showInShelf: canShelf ? (s.showInShelf !== false) : false,
      pages: canShelf ? (Array.isArray(s.pages) && s.pages.length ? s.pages.slice() : (f.surfaces.shelf.pages || ['*']).slice()) : [],
    };
  }
  return out;
}

/** The pages a shelf action can target (PAGE_TYPE ids + the `*` any wildcard). */
export const SHELF_PAGES = Object.freeze([
  { id: '*', label: 'All pages' },
  { id: 'contact', label: 'Contact' },
  { id: 'account', label: 'Account' },
  { id: 'order', label: 'Order' },
  { id: 'order-index', label: 'Orders list' },
  { id: 'opportunity', label: 'Opportunity' },
]);

/** Toggle a page in a pages[] list. Selecting `*` clears the rest; selecting a
 *  specific page drops `*`; emptying falls back to `*`. Pure. */
export function togglePage(pages, page) {
  if (page === '*') return ['*'];
  const cur = new Set(pages || []);
  cur.delete('*');
  if (cur.has(page)) cur.delete(page); else cur.add(page);
  const arr = SHELF_PAGES.map((p) => p.id).filter((id) => cur.has(id)); // stable order
  return arr.length ? arr : ['*'];
}

/** Should this feature's shelf action appear on `pageType`? */
export function featureShowsOnPage(cfg, pageType) {
  if (!cfg || !cfg.showInShelf) return false;
  const pages = cfg.pages || [];
  return pages.includes('*') || pages.includes(pageType);
}

/** A short status label for the collapsed row ("Popup · Shelf · 2 pages"). */
export function surfaceSummary(cfg) {
  if (!cfg) return '';
  const parts = [];
  if (cfg.showInPopup) parts.push('Popup');
  if (cfg.showInShelf) {
    const pages = cfg.pages || [];
    parts.push(pages.includes('*') ? 'Shelf · all pages' : `Shelf · ${pages.length} page${pages.length === 1 ? '' : 's'}`);
  }
  return parts.join(' · ') || 'Off on all surfaces';
}

/* ── storage (chrome-guarded; mirrors flags.js load/save + broadcast) ── */

export async function loadFeatureConfig() {
  if (typeof chrome === 'undefined' || !chrome.storage) return normalizeFeatureConfig({});
  return new Promise((resolve) => {
    try { chrome.storage.local.get(FEATURE_CONFIG_KEY, (o) => resolve(normalizeFeatureConfig(o?.[FEATURE_CONFIG_KEY] || {}))); }
    catch { resolve(normalizeFeatureConfig({})); }
  });
}

export async function saveFeatureConfig(cfg) {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  try {
    chrome.storage.local.set({ [FEATURE_CONFIG_KEY]: cfg });
    // Nudge open golfballs tabs to re-read (same channel the shelf watches).
    chrome.tabs?.query?.({ url: '*://*.golfballs.com/*' }, (tabs) => {
      (tabs || []).forEach((t) => { try { chrome.tabs.sendMessage(t.id, { action: 'GB_FEATURE_FLAGS' }, () => void chrome.runtime.lastError); } catch { /* */ } });
    });
  } catch { /* non-extension context */ }
}
