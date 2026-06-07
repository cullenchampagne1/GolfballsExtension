/* ───────────────────────────────────────────────────────────────────────────
   giftSetsData.js — load the custom-logo gift-set options for the modal.

   Live source: background `fetchPackageUpsell` → PUT getPackageUpsellData (no body,
   public sitekey) → { bundleOptions }. We filter to the custom-logo sets and
   normalize them (see giftSets.customGiftSetsFrom). The list is ball-INDEPENDENT
   (templates); the per-ball price is computed at quote time via giftSetLadder.

   Cached in chrome.storage (the templates change rarely) and backed by a bundled
   seed (the 8 verified options) for the playground / offline / fetch failure — so
   the gift-set dropdown always has options to show.
   ─────────────────────────────────────────────────────────────────────────── */

import { customGiftSetsFrom, normalizeBundleOption } from './giftSets.js';
import seed from './giftSetsSeed.json';

/* The bundled seed is already normalized (giftSets.normalizeBundleOption shape). */
export const GIFT_SET_SEED = seed;

const CACHE_KEY = 'gbGiftSetOptions_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // re-pull daily

function getCache() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) { resolve(null); return; }
      chrome.storage.local.get(CACHE_KEY, (d) => resolve((d && d[CACHE_KEY]) || null));
    } catch { resolve(null); }
  });
}
function setCache(options) {
  try { chrome.storage.local.set({ [CACHE_KEY]: { ts: Date.now(), options } }); } catch { /* ignore */ }
}

function fetchLive() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) { resolve(null); return; }
      chrome.runtime.sendMessage({ action: 'fetchPackageUpsell' }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) { resolve(null); return; }
        const opts = customGiftSetsFrom({ bundleOptions: resp.bundleOptions || [] });
        resolve(opts.length ? opts : null);
      });
    } catch { resolve(null); }
  });
}

/* Load the custom-logo gift-set options (normalized). Served from cache when fresh;
   otherwise pulls live and re-caches; always falls back to cache → seed so the
   caller never gets an empty list. force=true bypasses the cache. */
export async function loadGiftSetOptions({ force = false } = {}) {
  const cached = await getCache();
  if (!force && cached && Array.isArray(cached.options) && cached.options.length
      && (Date.now() - (cached.ts || 0)) < CACHE_TTL_MS) {
    return cached.options;
  }
  const live = await fetchLive();
  if (live && live.length) { setCache(live); return live; }
  if (cached && Array.isArray(cached.options) && cached.options.length) return cached.options;
  // Seed may be raw OR normalized depending on how it was generated — normalize
  // defensively (a normalized option passed back through is a no-op-ish reshape,
  // so guard on the already-normalized `kit.ladder` shape).
  return (seed || []).map((o) => (o && o.kit && Array.isArray(o.kit.ladder)) ? o : normalizeBundleOption(o));
}
