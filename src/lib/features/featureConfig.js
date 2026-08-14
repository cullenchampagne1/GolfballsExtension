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
      showInPopup: canPopup
        ? (Object.hasOwn(s, 'showInPopup') ? s.showInPopup !== false : !!f.defaultPopup)
        : false,
      showInShelf: canShelf ? (s.showInShelf !== false) : false,
      pages: canShelf ? (Array.isArray(s.pages) && s.pages.length ? s.pages.slice() : (f.surfaces.shelf.pages || ['*']).slice()) : [],
      // Extra shelf matcher: a URL substring. When set, the shelf action also
      // appears on any page whose URL contains it (OR'd with `pages`). Shelf
      // only — the popup is global.
      customUrl: canShelf ? (typeof s.customUrl === 'string' ? s.customUrl.trim() : '') : '',
    };
  }
  return out;
}

/** The pages a shelf action can target (PAGE_TYPE ids + the `*` any wildcard). */
export const SHELF_PAGES = Object.freeze([
  { id: '*', label: 'All pages', short: 'All' },
  { id: 'contact', label: 'Contact', short: 'Contact' },
  { id: 'account', label: 'Account', short: 'Account' },
  { id: 'order', label: 'Order', short: 'Order' },
  { id: 'order-index', label: 'Orders list', short: 'Orders' },
  { id: 'opportunity', label: 'Opportunity', short: 'Opp' },
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

/** Does a `pages` list cover `pageType`? '*' matches every page (incl. the
 *  null/unknown key the shelf uses for opportunity/other). Pure — shared by
 *  BOTH surfaces so popup buttons and shelf actions honor the same scope. */
export function pageApplies(pages, pageType) {
  const list = pages || [];
  return list.includes('*') || list.includes(pageType);
}

/** Does the active page URL contain the configured custom-link substring?
 *  Empty custom link never matches. Pure. */
export function urlMatches(customUrl, url) {
  const needle = String(customUrl || '').trim();
  if (!needle) return false;
  return String(url || '').includes(needle);
}

/** Should this feature's shelf action appear on `pageType` / `url`? The page
 *  chips and the custom-link matcher are OR'd — either one showing it is
 *  enough. `url` is optional (defaults to the live location). */
export function featureShowsOnPage(cfg, pageType, url) {
  if (!cfg || !cfg.showInShelf) return false;
  const href = url != null ? url : (typeof location !== 'undefined' ? location.href : '');
  return pageApplies(cfg.pages, pageType) || urlMatches(cfg.customUrl, href);
}

/** Should this feature's popup launcher appear? The popup is GLOBAL — if it's
 *  enabled it shows on every page. It is NOT gated by the shelf's page chips
 *  or custom link (those control only the action shelf). */
export function featureShowsInPopup(cfg) {
  return !!(cfg && cfg.showInPopup);
}

/** A short status label for the collapsed row ("Popup · Shelf · 2 pages"). */
export function surfaceSummary(cfg) {
  if (!cfg) return '';
  const parts = [];
  if (cfg.showInPopup) parts.push('Popup');
  if (cfg.showInShelf) {
    const pages = cfg.pages || [];
    let shelf = pages.includes('*') ? 'Shelf · all pages' : `Shelf · ${pages.length} page${pages.length === 1 ? '' : 's'}`;
    if (cfg.customUrl) shelf += ' + link';
    parts.push(shelf);
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
