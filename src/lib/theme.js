import themeCss from '../ui/theme.css?inline';
import { startForceImportantBorderRadius } from './forceImportantBorderRadius.js';

/* ───────────────────────────────────────────────────────────────
   theme.js — the design-system theme runtime.

   A theme is { variant, colors }:
   - variant — one of 4 shells (dark/midnight/light/cream) that
     supplies surfaces, text, borders.
   - colors  — overrides for the 8 tone-driving "Theme" colors.

   Because every tint derives from these via color-mix(), applying
   a theme is just: set data-theme + ≤8 custom properties. No RGB
   vectors, no 24-token rebuild — unlike the legacy theme.js.

   Supersedes the old lib/ensureTheme.js.
─────────────────────────────────────────────────────────────── */

const SHEET_ID = '__gb-ds-theme';
const STORAGE_KEY = 'gbTheme';

/** The 4 shell variants. */
export const THEME_VARIANTS = [
  { id: 'dark', name: 'Dark' },
  { id: 'midnight', name: 'Midnight' },
  { id: 'light', name: 'Light' },
  { id: 'cream', name: 'Cream' },
];

/** The 8 adjustable Theme colors layered on top of a variant. */
export const THEME_COLORS = [
  { key: '--gb-brand-label',  name: 'Brand',         hint: 'Accent text, labels — every brand tint derives from this' },
  { key: '--gb-brand',        name: 'Action button', hint: 'Primary button gradient, top' },
  { key: '--gb-brand-dark',   name: 'Button deep',   hint: 'Primary button gradient, bottom' },
  { key: '--gb-brand-border', name: 'Button border', hint: 'Primary button border' },
  { key: '--gb-error',        name: 'Error',         hint: 'Errors and destructive actions' },
  { key: '--gb-warning',      name: 'Warning',       hint: 'Warnings, holds, cautions' },
  { key: '--gb-success',      name: 'Success',       hint: 'Confirmations and completed states' },
  { key: '--gb-info',         name: 'Info',          hint: 'Informational notes' },
];

export const DEFAULT_THEME = { variant: 'dark', colors: {} };

/** Inject the token stylesheet once. */
function injectSheet() {
  if (document.getElementById(SHEET_ID)) return;
  const el = document.createElement('style');
  el.id = SHEET_ID;
  el.textContent = themeCss;
  (document.head || document.documentElement).appendChild(el);
}

/** Apply a theme to this document — data-theme + the ≤8 color overrides. */
export function applyTheme(theme) {
  const { variant, colors } = { ...DEFAULT_THEME, ...theme };
  const root = document.documentElement;
  root.dataset.theme = variant;
  THEME_COLORS.forEach(({ key }) => {
    const value = colors && colors[key];
    if (value) root.style.setProperty(key, value);
    else root.style.removeProperty(key);
  });
}

/** Resolved value of a token on this document — for showing the current color. */
export function currentColor(key) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
    return v || '#000000';
  } catch {
    return '#000000';
  }
}

/** Read the saved theme from storage (or defaults). */
export function loadTheme() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(STORAGE_KEY, (d) =>
        resolve({ ...DEFAULT_THEME, ...(d[STORAGE_KEY] || {}) }));
    } catch {
      resolve({ ...DEFAULT_THEME });
    }
  });
}

/** Persist the theme. storage.onChanged carries it to every other context. */
export function saveTheme(theme) {
  try {
    chrome.storage.local.set({ [STORAGE_KEY]: theme });
  } catch { /* not in an extension context */ }
}

/**
 * Inject the sheet, apply the saved theme, and keep this document in sync
 * when the theme changes elsewhere. Call once per page / content script.
 */
export function ensureTheme() {
  injectSheet();
  startForceImportantBorderRadius();
  loadTheme().then(applyTheme);
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) {
        applyTheme(changes[STORAGE_KEY].newValue || DEFAULT_THEME);
      }
    });
  } catch { /* no chrome.storage — nothing to sync */ }
}
