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

/* Per-model export-photo (snapshot) framing. Each 3D model gets its own fixed
   position (x/y/z) + scale used when the Image Viewer copies/downloads a
   transparent PNG of the render — so exports are consistent regardless of the
   live viewport, and ready to drop into a proposal. Keys must match
   snapKeyForModel() in GolfballViewer.jsx (gift sets keyed by box model). */
const SNAP_MODELS = [
  { key: 'ball',                     label: 'Ball',                  scale: 1.7 },
  { key: 'chip',                     label: 'Poker chip',            scale: 1.65 },
  { key: 'divot',                    label: 'Divot tool',            scale: 1.6,  rx: -10, ry: 20, rz: 30 },
  { key: 'bartender',                label: 'Bartender tool',        scale: 1.8,  rx: -10, ry: 20, rz: 30 },
  { key: 'marker',                   label: 'Ball marker',           scale: 1.65 },
  { key: 'giftset.giftbox',          label: 'Gift set — poker chip', scale: 1.8,  rx: 22 },
  { key: 'giftset.giftboxLever',     label: 'Gift set — lever',      scale: 1.8,  rx: 22 },
  { key: 'giftset.giftboxBartender', label: 'Gift set — bartender',  scale: 1.8,  rx: 22 },
  { key: 'giftset.giftboxWoodPoker', label: 'Gift set — wood poker', scale: 1.8,  rx: 22 },
  { key: 'giftset.giftboxWoodLever', label: 'Gift set — wood lever', scale: 1.8,  rx: 22 },
];
const SNAP_SETTINGS = SNAP_MODELS.flatMap((m) => {
  const base = `golfballViewer.snap.${m.key}`;
  const axis = (ax, lbl) => ({
    key: `${base}.${ax}`,
    label: `Snapshot ${m.label}: ${lbl}`,
    desc: `Export-photo ${lbl} for the ${m.label} render (transparent copy/download). Fixed, so every export frames identically.`,
    type: 'number', default: 0, min: -300, max: 300, step: 1,
  });
  const rot = (ax, defVal, lbl) => ({
    key: `${base}.${ax}`,
    label: `Snapshot ${m.label}: ${lbl}`,
    desc: `Export-photo ${lbl} (degrees) for the ${m.label} render — layered on its initial pose.`,
    type: 'number', default: defVal || 0, min: -180, max: 180, step: 1, unit: '°',
  });
  return [
    axis('x', 'position X'),
    axis('y', 'position Y'),
    axis('z', 'position Z'),
    { key: `${base}.scale`, label: `Snapshot ${m.label}: scale`, desc: `Export-photo scale for the ${m.label} render.`, type: 'number', default: m.scale, min: 0.2, max: 12, step: 0.05, unit: '×' },
    rot('rotX', m.rx, 'rotation X'),
    rot('rotY', m.ry, 'rotation Y'),
    rot('rotZ', m.rz, 'rotation Z'),
  ];
});

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
    key:     'proposalDebug.enabled',
    label:   'Proposal Debug: intercept submit requests',
    desc:    'Records every proposal- and email-submit network request (full request + response bodies, timing) and shows them in a draggable panel on golfballs.com pages, each with a Copy button. Use it to compare our requests vs the website. Off = no interception.',
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
  {
    key:     'golfballViewer.renderDebug',
    label:   'Golfball viewer: render diagnostics',
    desc:    'Overlay a live render-debug panel — WebGL tier, GPU/driver string, decal geometry + material flags, shader-compile errors, draw calls — with a copy button. Use it to capture exactly why the print is or is not rendering on a given machine.',
    type:    'bool',
    default: false,
  },

  /* ── Outbound email account host ──────────────────────────────
     The local part (before @) used when constructing the `from`
     address for the PA flow. The configured sender accounts in
     src/lib/sender.js carry just the domain; we glue the host on
     here. Empty falls back to the registry default. Different
     reps run the same extension under their own mailbox, so this
     stays per-machine (devSettings) rather than per-template. */
  {
    key:     'email.localPart',
    label:   'Email account host',
    desc:    'Local part of the sender address (the bit before @). Combined with the chosen sender account at send time — e.g. "cullen" + "golfballs.com" → cullen@golfballs.com.',
    type:    'string',
    default: 'cullen',
    placeholder: 'cullen',
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
    key:     'golfballViewer.giftSetScale',
    label:   'Golfball viewer: default gift-set scale',
    desc:    'Initial scale of the assembled gift box (balls + chips + tees) when shown in the Image Viewer 3D mode. The box frames larger than a ball, so this defaults below 1. Wheel zoom still overrides.',
    type:    'number',
    default: 0.9,
    min:     0.3, max: 2.5, step: 0.05,
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
  {
    key:     'golfballViewer.printAreaScale',
    label:   'Golfball viewer: print area scale',
    desc:    'Size of the printed image (decal) on the ball, as a fraction of the ball radius. Higher = larger print area. Default 0.7.',
    type:    'number',
    default: 0.7,
    min:     0.2, max: 1.5, step: 0.05,
  },
  {
    key:     'golfballViewer.spinSpeed',
    label:   'Golfball viewer: auto-spin speed',
    desc:    'Radians per frame the model turns when the ↻ auto-rotate button is on (shows both poles/sides). Default 0.01 (~0.6°/frame).',
    type:    'number',
    default: 0.01,
    min:     0, max: 0.1, step: 0.005,
  },
  {
    key:     'golfballViewer.snapPreview',
    label:   'Golfball viewer: preview export pose',
    desc:    'Lock the live 3D view to the export-photo pose (the per-model Snapshot position/scale/rotation below) so you can see and dial in exactly how Copy/Download will frame each model. Disables drag/zoom/spin while on.',
    type:    'bool',
    default: false,
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
    default: false,
  },
  {
    key:     'taskList.draggable',
    label:   'Task List: draggable mode',
    desc:    'When on, the Task List modal is a draggable tool window. When off, it sits centered with a solid backdrop that closes on outside-click.',
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
    key:     'calendar.draggable',
    label:   'Order Dates: draggable mode',
    desc:    'When on, the Order Dates calendar is a draggable tool window. When off, it sits centered with a solid backdrop that closes on outside-click.',
    type:    'bool',
    default: false,
  },
  {
    key:     'callLog.draggable',
    label:   'Call Log: draggable mode',
    desc:    'When on, the Call Log modal is a draggable tool window. When off, it sits centered with a solid backdrop that closes on outside-click.',
    type:    'bool',
    default: false,
  },
  {
    key:     'emailPreview.draggable',
    label:   'Email Preview: draggable mode',
    desc:    'When on, the Email Preview modal is a draggable tool window. When off, it sits centered with a solid backdrop that closes on outside-click.',
    type:    'bool',
    default: false,
  },
  {
    key:     'quickTask.draggable',
    label:   'Quick Task: draggable mode',
    desc:    'When on, the Quick Task modal is a draggable tool window. When off, it sits centered with a solid backdrop that closes on outside-click.',
    type:    'bool',
    default: false,
  },
  {
    key:     'textPreview.draggable',
    label:   'Text Preview: draggable mode',
    desc:    'When on, the Text Preview modal is a draggable tool window. When off, it sits centered with a solid backdrop that closes on outside-click.',
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
    key:     'giftCatalog.scale',
    label:   'Gifting Catalog: zoom scale',
    desc:    'Magnification of the Corporate Gifting Catalog modal (1 = 100%). Default 1.8 reads large on screen; lower it if the modal overflows.',
    type:    'number',
    default: 1.8,
    min:     1,
    max:     3,
    step:    0.1,
    unit:    '×',
  },
  {
    key:     'campaignManager.scale',
    label:   'Campaign Manager: zoom scale',
    desc:    'Magnification of the Campaign Manager modal (1 = 100%). Default 1.2; lower it if the modal overflows on a smaller screen.',
    type:    'number',
    default: 1.2,
    min:     1,
    max:     2,
    step:    0.05,
    unit:    '×',
  },
  {
    key:     'giftCatalog.previewScale',
    label:   'Gifting Catalog: live preview ball scale',
    desc:    'Initial zoom of the ball in the catalog customization preview (separate from the Image Viewer). Wheel zoom still overrides during use.',
    type:    'number',
    default: 2,
    min:     0.5,
    max:     5,
    step:    0.25,
    unit:    '×',
  },
  {
    key:     'giftCatalog.chipPreviewScale',
    label:   'Gifting Catalog: live preview poker-chip scale',
    desc:    'Initial zoom of the poker chip in the catalog preview (chips are small ball-markers, so they frame smaller than the ball). Wheel zoom still overrides.',
    type:    'number',
    default: 1.58,
    min:     0.5,
    max:     5,
    step:    0.05,
    unit:    '×',
  },
  {
    key:     'giftCatalog.divotPreviewScale',
    label:   'Gifting Catalog: live preview divot-tool scale',
    desc:    'Initial zoom of the divot tool in the catalog preview (it is elongated, so it frames smaller than the ball/chip). Wheel zoom still overrides.',
    type:    'number',
    default: 1.0,
    min:     0.3,
    max:     5,
    step:    0.05,
    unit:    '×',
  },
  {
    key:     'giftCatalog.bartenderPreviewScale',
    label:   'Gifting Catalog: live preview bartender-tool scale',
    desc:    'Initial zoom of the bartender divot tool (with bottle opener) in the catalog preview. Wheel zoom still overrides.',
    type:    'number',
    default: 1.1,
    min:     0.3,
    max:     5,
    step:    0.05,
    unit:    '×',
  },
  {
    key:     'giftCatalog.giftSetPreviewScale',
    label:   'Gifting Catalog: live preview gift-set scale',
    desc:    'Initial zoom of the assembled gift box (balls + chips + tees in the box) in the catalog preview. Wheel zoom still overrides.',
    type:    'number',
    default: 1.0,
    min:     0.3,
    max:     5,
    step:    0.05,
    unit:    '×',
  },
  {
    key:     'giftCatalog.giftSetPreviewRotX',
    label:   'Gifting Catalog: gift-set view tilt (X)',
    desc:    'Top-down tilt of the gift box in the catalog preview — how far you look down INTO the box. 0 = straight-on (flat top view), more negative = steeper 3/4 angle.',
    type:    'number',
    default: -22,
    min:     -80,
    max:     20,
    step:    1,
    unit:    '°',
  },
  {
    key:     'giftCatalog.giftSetPreviewRotY',
    label:   'Gifting Catalog: gift-set view tilt (Y)',
    desc:    'Side tilt of the gift box in the catalog preview (turn slightly off head-on). 0 = front-on.',
    type:    'number',
    default: 0,
    min:     -45,
    max:     45,
    step:    1,
    unit:    '°',
  },
  {
    key:     'giftCatalog.cacheHours',
    label:   'Gifting Catalog: re-index interval (hours)',
    desc:    'How long the catalog (products + pricing) is cached before a fresh live pull. Lower it if prices change often; 0 = always pull fresh on open.',
    type:    'number',
    default: 24,
    min:     0,
    max:     168,
    step:    1,
    unit:    'h',
  },
  {
    key:     'giftCatalog.defaultSort',
    label:   'Gifting Catalog: default sort',
    desc:    'Which sort the catalog opens on.',
    type:    'select',
    default: 'popular',
    options: [
      { value: 'popular',   label: 'Most reviewed' },
      { value: 'priceLow',  label: 'Price: low → high' },
      { value: 'priceHigh', label: 'Price: high → low' },
      { value: 'name',      label: 'Name A–Z' },
    ],
  },
  {
    key:     'giftCatalog.density',
    label:   'Gifting Catalog: card density',
    desc:    'Comfortable shows larger product cards; compact fits more per row.',
    type:    'select',
    default: 'comfortable',
    options: [
      { value: 'comfortable', label: 'Comfortable' },
      { value: 'compact',     label: 'Compact' },
    ],
  },
  {
    key:     'submitProof.defaultOrderType',
    label:   'Submit Proof: default order type',
    desc:    'Which order type the Submit Proof modal pre-selects.',
    type:    'select',
    default: 'Live Order',
    options: [
      { value: 'Live Order',      label: 'Live' },
      { value: 'Potential Order', label: 'Potential' },
      { value: 'Jardine Order',   label: 'Jardine' },
    ],
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
    key:     'playground.forceMock',
    label:   'Playground: force mock data (all sources)',
    desc:    'One switch: every data source returns canned data and email sends become a dry-run (nothing is actually sent). Replaces the old per-modal mock flags. The extension also auto-mocks when running outside an extension context (e.g. the playground tab), so this is mainly for previewing mock data on a live page.',
    type:    'bool',
    default: false,
  },
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
  /* NOTE: the old `actionsShelf.showImageViewer/showOpenContacts/showOpenTasks`
     dev settings were retired — the shelf's always-actions now follow each
     destination feature's own flag (imagePreviewEnabled / crmSearchEnabled /
     taskListEnabled / giftCatalogEnabled) instead of a redundant toggle. */

  // Per-model export-photo framing (generated above) — 4 knobs × each model.
  ...SNAP_SETTINGS,
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
