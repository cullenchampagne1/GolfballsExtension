/* ───────────────────────────────────────────────────────────────
   scales.js — independent zoom per extension UI surface.

   Use case: the rep runs the host CRM at 75% browser zoom (their
   preferred reading scale for the dense order pages) but wants the
   extension's modals/popovers at a different scale because they
   already use their own typography. CSS `zoom` on each mount root
   (driven by a CSS variable per category) lets us scale surfaces
   independently without rewriting any component sizes.

   Why `zoom` and not `transform: scale()`:
     `transform` doesn't recalculate layout — the modal still
     reserves the un-scaled box for positioning, so centred modals
     drift off-centre when scaled. `zoom` is a real layout operator
     in Chrome (and we ship a Chrome extension), so child widths,
     positions, and event coordinates all just work.

   Storage contract:
     chrome.storage.local.uiScales: { [category]: number }
   where category is one of SCALE_CATEGORIES[].id and the value is
   the zoom factor (1 = 100%). Out-of-range or missing categories
   fall back to 1.

   To opt a mount root in: add `data-gb-scale="<categoryId>"` to the
   outermost element. The injected stylesheet from applyScales then
   picks it up automatically.
─────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'uiScales';
const STYLE_ID    = '__gb-ui-scales-css';

/** Each entry surfaces in the Settings panel as one labelled slider. */
export const SCALE_CATEGORIES = [
  { id: 'modals',     label: 'Modals',                hint: 'Image viewer, charge, call log, watch list, task list, etc.' },
  { id: 'popovers',   label: 'Popovers',              hint: 'Dropdowns, date picker, color picker, quick task menu' },
  { id: 'toasts',     label: 'Notifications',         hint: 'Toast notifications across the app' },
  { id: 'shelf',      label: 'Smart Actions Shelf',   hint: 'Floating quick-action pill in the bottom corner' },
  { id: 'popup',      label: 'Toolbar Popup',         hint: 'The Chrome toolbar popup window' },
  { id: 'editor',     label: 'Templates Editor',      hint: 'The full-page template & note editor' },
  { id: 'playground', label: 'Design Playground',     hint: 'The design-system playground (mostly internal)' },
];

export const DEFAULT_SCALES = Object.fromEntries(
  SCALE_CATEGORIES.map((c) => [c.id, 1]),
);

/** Clamp + sanitise an incoming scales blob. Anything out of range
 *  collapses to the default for that category — bad data shouldn't
 *  freeze the UI at 5x zoom. */
function sanitize(raw) {
  const out = { ...DEFAULT_SCALES };
  if (raw && typeof raw === 'object') {
    for (const c of SCALE_CATEGORIES) {
      const v = Number(raw[c.id]);
      if (Number.isFinite(v) && v >= 0.5 && v <= 1.5) out[c.id] = v;
    }
  }
  return out;
}

const hasChromeStorage = () => {
  try { return typeof chrome !== 'undefined' && !!chrome.storage?.local; }
  catch { return false; }
};

export function loadScales() {
  return new Promise((resolve) => {
    if (!hasChromeStorage()) { resolve({ ...DEFAULT_SCALES }); return; }
    try {
      chrome.storage.local.get(STORAGE_KEY, (d) => resolve(sanitize(d?.[STORAGE_KEY])));
    } catch {
      resolve({ ...DEFAULT_SCALES });
    }
  });
}

export function saveScales(scales) {
  if (!hasChromeStorage()) return;
  try { chrome.storage.local.set({ [STORAGE_KEY]: sanitize(scales) }); }
  catch { /* not in extension context */ }
}

/** Inject (or refresh) the stylesheet that drives the data-attribute
 *  → zoom mapping. Idempotent. Calling with the same scales is a no-op
 *  if the textContent already matches. */
export function applyScales(scales) {
  if (typeof document === 'undefined') return;
  const sane = sanitize(scales);
  const lines = [':root {'];
  for (const c of SCALE_CATEGORIES) lines.push(`  --gb-scale-${c.id}: ${sane[c.id]};`);
  lines.push('}');
  for (const c of SCALE_CATEGORIES) {
    lines.push(`[data-gb-scale="${c.id}"] { zoom: var(--gb-scale-${c.id}, 1) !important; }`);
  }
  const css = lines.join('\n');

  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

/** Inject + apply the saved scales, and keep this document in sync
 *  when scales change elsewhere. Mirrors theme.js's ensureTheme(). */
export function ensureScales() {
  loadScales().then(applyScales);
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) {
        applyScales(changes[STORAGE_KEY].newValue || DEFAULT_SCALES);
      }
    });
  } catch { /* no chrome.storage — single-shot */ }
}
