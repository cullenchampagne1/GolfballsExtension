/* ───────────────────────────────────────────────────────────────
   secretSettings.js — per-setting "hide from the settings UI" flags.

   A separate storage object so it can be imported/exported on its own
   (see presetScopes.js → the `secret` scope). The map is:

     chrome.storage.local.secret_settings = { [settingKey]: true, … }

   A key present with `true` means that setting (a feature flag OR a dev
   setting) is HIDDEN from the settings screen. Its VALUE is untouched —
   it keeps whatever it is (features stay on by default). This lets an
   admin lock a feature on/off and remove its switch so reps can't change
   (or even see) it.

   Default: empty object → every setting is visible. "All on by default"
   means nothing is secret out of the box.
─────────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react';

export const STORAGE_KEY = 'secret_settings';

const hasChromeStorage = () =>
  typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

/** Async load of the secret map. Always resolves to a plain object. */
export function loadSecretSettings() {
  return new Promise((resolve) => {
    if (!hasChromeStorage()) { resolve({}); return; }
    try {
      chrome.storage.local.get(STORAGE_KEY, (d) => resolve((d && d[STORAGE_KEY]) || {}));
    } catch { resolve({}); }
  });
}

/** Persist the whole secret map. */
export function saveSecretSettings(map) {
  if (!hasChromeStorage()) return;
  try { chrome.storage.local.set({ [STORAGE_KEY]: map || {} }); } catch { /* ignore */ }
}

/** Is this setting key hidden? */
export function isSecret(map, key) {
  return !!(map && map[key]);
}

/**
 * React hook. Returns `[secret, setSecret, ready]`:
 *   secret           — the current { [key]: true } map
 *   setSecret(k, on) — mark/unmark a key as hidden (persists immediately)
 *   ready            — false until the first storage read resolves
 * Live-syncs across contexts via chrome.storage.onChanged.
 */
export function useSecretSettings() {
  const [secret, setSecretMap] = useState({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadSecretSettings().then((m) => { if (alive) { setSecretMap(m); setReady(true); } });
    const onCh = (changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) {
        setSecretMap(changes[STORAGE_KEY].newValue || {});
      }
    };
    try { chrome.storage.onChanged.addListener(onCh); } catch { /* */ }
    return () => { alive = false; try { chrome.storage.onChanged.removeListener(onCh); } catch { /* */ } };
  }, []);

  const setSecret = (key, on) => {
    setSecretMap((prev) => {
      const next = { ...prev };
      if (on) next[key] = true; else delete next[key];
      saveSecretSettings(next);
      return next;
    });
  };

  return [secret, setSecret, ready];
}
