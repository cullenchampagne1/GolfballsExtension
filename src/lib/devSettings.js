import { useEffect, useState, useCallback } from 'react';

/* ───────────────────────────────────────────────────────────────
   devSettings.js — low-priority knobs that don't deserve a top-
   level feature flag. Things like animation durations, debounce
   timings, dev-mode behaviour tweaks.

   Registry-driven: add a row to DEV_SETTINGS and it appears in
   the Developer Settings table automatically. Components subscribe
   to specific keys via `useDevSetting(key)`.

   Storage shape:
     chrome.storage.local.devSettings = { [key]: value, … }
   Missing keys fall back to the registry default.
─────────────────────────────────────────────────────────────── */

export const DEV_SETTINGS = [
  {
    key:     'numberDisplay.enabled',
    label:   'Animated number displays',
    desc:    'Counts up to the value over time. Turn off for instant snap.',
    type:    'bool',
    default: true,
  },
  {
    key:     'numberDisplay.durationMs',
    label:   'Number display duration',
    desc:    'How long the count-up animation takes.',
    type:    'number',
    default: 400,
    min:     0,
    max:     5000,
    step:    50,
    unit:    'ms',
  },
];

export const STORAGE_KEY = 'devSettings';

const DEFAULTS = Object.fromEntries(DEV_SETTINGS.map((s) => [s.key, s.default]));

/** Synchronous fallback when storage isn't ready yet. */
export function defaultDevSettings() {
  return { ...DEFAULTS };
}

/** Read once, merged with defaults so callers never see undefined. */
export function loadDevSettings() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(defaultDevSettings());
      return;
    }
    chrome.storage.local.get(STORAGE_KEY, (d) => {
      resolve({ ...DEFAULTS, ...(d[STORAGE_KEY] || {}) });
    });
  });
}

/** Persist the whole bag — UI calls this on every edit. */
export function saveDevSettings(settings) {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

/**
 * Subscribe to the whole bag. Returns [settings, set(key, value)].
 * Live-updates via chrome.storage.onChanged, so flipping a knob in
 * Settings immediately reaches every consumer without a reload.
 */
export function useDevSettings() {
  const [settings, setSettings] = useState(defaultDevSettings);

  useEffect(() => {
    let alive = true;
    loadDevSettings().then((d) => { if (alive) setSettings(d); });
    function onChanged(changes) {
      if (!changes[STORAGE_KEY]) return;
      const v = changes[STORAGE_KEY].newValue || {};
      setSettings({ ...DEFAULTS, ...v });
    }
    if (chrome?.storage?.onChanged) chrome.storage.onChanged.addListener(onChanged);
    return () => {
      alive = false;
      if (chrome?.storage?.onChanged) chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const set = useCallback((key, value) => {
    setSettings((s) => {
      const next = { ...s, [key]: value };
      saveDevSettings(next);
      return next;
    });
  }, []);

  return [settings, set];
}

/** Subscribe to a single key. Common case in consumer components. */
export function useDevSetting(key) {
  const [settings] = useDevSettings();
  return settings[key];
}
