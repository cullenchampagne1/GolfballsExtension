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
  {
    key:     'popup.ignorePageContext',
    label:   'Popup: ignore page context',
    desc:    'Show all order + account templates in the popup regardless of the current page. Variables resolve as unmatched.',
    type:    'bool',
    default: false,
  },
  {
    key:     'golfballViewer.showDebugHud',
    label:   'Golfball viewer: camera debug HUD',
    desc:    'Overlay the 3D viewer with a live camera-position / orbit-angle readout plus a copy button. Use it to dial in a default camera framing.',
    type:    'bool',
    default: false,
  },

  /* ── 3D viewer camera defaults ────────────────────────────────
     Six knobs (camera xyz + target xyz) defining where the camera
     lands on initial 3D-view open. Defaults are the user's dialed-
     in pole-down framing copied straight out of the debug HUD;
     each is editable per-installation via the dev settings table. */
  {
    key:     'golfballViewer.cameraX',
    label:   'Golfball viewer: camera X',
    desc:    'Default camera X position (world units; ball radius = 100).',
    type:    'number',
    default: 0,
    min:     -1000, max: 1000, step: 1,
  },
  {
    key:     'golfballViewer.cameraY',
    label:   'Golfball viewer: camera Y',
    desc:    'Default camera Y position (world units; ball radius = 100).',
    type:    'number',
    default: 408.9,
    min:     -1000, max: 1000, step: 1,
  },
  {
    key:     'golfballViewer.cameraZ',
    label:   'Golfball viewer: camera Z',
    desc:    'Default camera Z position (world units; ball radius = 100).',
    type:    'number',
    default: 0,
    min:     -1000, max: 1000, step: 1,
  },
  {
    key:     'golfballViewer.targetX',
    label:   'Golfball viewer: target X',
    desc:    'OrbitControls target X (the point the camera orbits around).',
    type:    'number',
    default: 0,
    min:     -500, max: 500, step: 1,
  },
  {
    key:     'golfballViewer.targetY',
    label:   'Golfball viewer: target Y',
    desc:    'OrbitControls target Y (the point the camera orbits around).',
    type:    'number',
    default: 100,
    min:     -500, max: 500, step: 1,
  },
  {
    key:     'golfballViewer.targetZ',
    label:   'Golfball viewer: target Z',
    desc:    'OrbitControls target Z (the point the camera orbits around).',
    type:    'number',
    default: 0,
    min:     -500, max: 500, step: 1,
  },
  {
    key:     'marginCalc.minAllowedMargin',
    label:   'Margin calculator: minimum allowed margin',
    desc:    'Threshold for the low-margin warning in the Margin Calculator. The warning shows when the entered margin is positive but below this value. 0 disables the warning entirely.',
    type:    'number',
    default: 30,
    min:     0,
    max:     100,
    step:    1,
  },
  {
    key:     'popup.forceMatchedCount',
    label:   'Popup: force matched count',
    desc:    'Force the first N templates in the popup dropdown to render with the matched-template styling (brand dot + Matched group). 0 = off.',
    type:    'number',
    default: 0,
    min:     0,
    max:     50,
    step:    1,
  },

  /* ── Modal playground ─────────────────────────────────────────
     An `action` row renders just a button instead of a persisted
     value. `runner` fires on click and gets `{ notify }` so it can
     surface success/failure inline via the notification system. */
  {
    key:     'playground.open',
    label:   'Modal playground',
    desc:    'Blank in-extension surface for previewing modals.',
    type:    'action',
    buttonLabel: 'Open',
    buttonIcon:  'bolt',
    runner: ({ notify } = {}) => {
      try {
        const url = chrome.runtime.getURL('playground.html');
        chrome.tabs.create({ url, active: true });
      } catch (e) {
        notify?.notify?.('Failed to open playground: ' + e.message, { tone: 'warning' });
      }
    },
  },

  /* ── Per-button context-ignore knobs ──────────────────────────
     Each one bypasses the disabled state of a specific popup button
     so it always renders enabled, regardless of page context. Clicking
     fires the same message it would on a real page — the content-script
     handler is responsible for failing softly. */
  {
    key:     'popup.ignoreContext.charge',
    label:   'Popup: ignore context — Charge Card',
    desc:    'Keeps the Charge Card button enabled even with no order context.',
    type:    'bool',
    default: false,
  },
  {
    key:     'popup.ignoreContext.orderEdit',
    label:   'Popup: ignore context — Order Edit',
    desc:    'Keeps the Order Edit button enabled even with no message id.',
    type:    'bool',
    default: false,
  },
  {
    key:     'popup.ignoreContext.watch',
    label:   'Popup: ignore context — Watch Order',
    desc:    'Keeps the Watch button enabled even with no detected entity (order / contact / account).',
    type:    'bool',
    default: false,
  },
  {
    key:     'popup.ignoreContext.submitProof',
    label:   'Popup: ignore context — Submit Proof',
    desc:    'Keeps the Submit Proof button enabled even with no order / contact / account context.',
    type:    'bool',
    default: false,
  },
];

export const STORAGE_KEY = 'devSettings';

// Skip `action` rows — they fire a runner instead of persisting a value,
// so there's no default to merge into the bag.
const DEFAULTS = Object.fromEntries(
  DEV_SETTINGS.filter((s) => s.type !== 'action').map((s) => [s.key, s.default]),
);

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
