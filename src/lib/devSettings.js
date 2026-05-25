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

  /* ── 3D viewer ball defaults ──────────────────────────────────
     Camera is fixed now (straight-on, floor aligns with the panel
     bottom). The remaining tunables are the BALL — initial scale +
     a starting orientation so the team can dial in how the print
     sits at first open without touching code. */
  {
    key:     'golfballViewer.ballScale',
    label:   'Golfball viewer: default ball scale',
    desc:    'Initial scale of the ball when 3D opens (1 = native size). Wheel zoom still overrides during use.',
    type:    'number',
    default: 1,
    min:     0.4, max: 2.5, step: 0.05,
  },
  {
    key:     'golfballViewer.ballRotX',
    label:   'Golfball viewer: default ball rotation X (deg)',
    desc:    'Initial pitch rotation of the ball around the X axis at first 3D open. Drag-to-rotate still overrides during use.',
    type:    'number',
    default: 0,
    min:     -180, max: 180, step: 1,
  },
  {
    key:     'golfballViewer.ballRotY',
    label:   'Golfball viewer: default ball rotation Y (deg)',
    desc:    'Initial yaw rotation of the ball around the Y axis at first 3D open.',
    type:    'number',
    default: 0,
    min:     -180, max: 180, step: 1,
  },
  {
    key:     'golfballViewer.ballRotZ',
    label:   'Golfball viewer: default ball rotation Z (deg)',
    desc:    'Initial roll rotation of the ball around the Z axis at first 3D open.',
    type:    'number',
    default: 0,
    min:     -180, max: 180, step: 1,
  },
  /* ── Per-modal draggable mode ─────────────────────────────────
     Each wired modal exposes a `<name>.draggable` flag. When ON, the
     modal is a click-through tool window the user can fling around
     with physics. When OFF, it's a centered classic modal with a
     solid backdrop — click outside to close. */
  {
    key:     'marginCalc.draggable',
    label:   'Margin Calculator: draggable mode',
    desc:    'When on, the Margin Calculator is a draggable tool window with a click-through backdrop. When off, it sits centered with a solid backdrop that closes on outside-click.',
    type:    'bool',
    default: true,
  },
  {
    key:     'imageViewer.draggable',
    label:   'Image Viewer: draggable mode',
    desc:    'When on, the Image Viewer is a draggable tool window. When off, it sits centered and closes on outside-click.',
    type:    'bool',
    default: false,
  },
  {
    key:     'watchList.draggable',
    label:   'Watch List: draggable mode',
    desc:    'When on, the Watch List is a draggable tool window. When off, it sits centered and closes on outside-click.',
    type:    'bool',
    default: false,
  },
  {
    key:     'crmCreateContact.draggable',
    label:   'CRM New Contact: draggable mode',
    desc:    'When on, the New Contact modal is a draggable tool window. When off, it sits centered and closes on outside-click.',
    type:    'bool',
    default: true,
  },
  {
    key:     'crmCreateContact.useMock',
    label:   'CRM New Contact: force mock mode',
    desc:    'Bypass the live CRM endpoints (account search + create) and use canned data + fake success responses. Useful for playground previews or when the API is down. The modal auto-mocks when not in an extension context.',
    type:    'bool',
    default: false,
  },
  {
    key:     'crmSearch.draggable',
    label:   'CRM Search: draggable mode',
    desc:    'When on, the CRM Search modal is a draggable tool window. When off, it sits centered with a solid backdrop that closes on outside-click.',
    type:    'bool',
    default: true,
  },
  {
    key:     'crmSearch.useMock',
    label:   'CRM Search: force mock mode',
    desc:    'Bypass the live Solr endpoint and use canned results. Useful for playground previews or when the API is down. Auto-mocks when not in an extension context.',
    type:    'bool',
    default: false,
  },
  {
    key:     'submitProof.draggable',
    label:   'Submit Proof: draggable mode',
    desc:    'When on, the Submit Proof modal is a draggable tool window. When off, it sits centered with a solid backdrop that closes on outside-click.',
    type:    'bool',
    default: true,
  },
  {
    key:     'submitProof.useMock',
    label:   'Submit Proof: force mock mode',
    desc:    'Use canned reps/artists/gallery + fake submit responses. Useful for playground previews or when the CRM is down. Auto-mocks when not in an extension context.',
    type:    'bool',
    default: false,
  },
  {
    key:     'crmCreateContact.requireAccount',
    label:   'CRM New Contact: require account',
    desc:    'When on, the New Contact modal blocks submit until an account is selected (or typed). Creating a contact without an account is allowed by the API but is bad practice. Turn off to override.',
    type:    'bool',
    default: true,
  },

  /* ── Watch list housekeeping ──────────────────────────────────
     Completed items auto-purge after N days so the "Completed"
     filter doesn't grow forever. Counted from each item's doneAt
     timestamp. 0 disables auto-delete entirely. */
  {
    key:     'watchList.autoDeleteCompletedDays',
    label:   'Watch list: auto-delete completed items after (days)',
    desc:    'Completed watch-list items are quietly purged after this many days. Counted from when the item was marked done. 0 disables auto-delete (keep forever).',
    type:    'number',
    default: 5,
    min:     0, max: 365, step: 1,
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
