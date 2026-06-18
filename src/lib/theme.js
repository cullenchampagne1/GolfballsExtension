import themeCss from '../ui/theme.css?inline';
import { startForceImportantBorderRadius } from './forceImportantBorderRadius.js';
import { ensureScales } from './scales.js';

/* ───────────────────────────────────────────────────────────────
   theme.js — the design-system theme runtime.

   A theme is { variant, colors }:
   - variant — one of eight shells (dark/midnight/light/cream/
     nord/dracula/rose/tokyo), each with its own surfaces, text,
     borders, and signature accent color.
   - colors  — overrides for the 8 tone-driving "Theme" colors.

   Because every tint derives from these via color-mix(), applying
   a theme is just: set data-theme + ≤8 custom properties. No RGB
   vectors, no 24-token rebuild — unlike the legacy theme.js.

   Supersedes the old lib/ensureTheme.js.
─────────────────────────────────────────────────────────────── */

const SHEET_ID = '__gb-ds-theme';
const STORAGE_KEY = 'gbTheme';

/** The shell variants. */
export const THEME_VARIANTS = [
  // ids kept stable (stored settings reference them); only display names changed.
  // Every shell carries its own accent (ownAccent), so each card previews
  // under its signature color rather than the user's customized brand.
  { id: 'dark', name: 'Dark', ownAccent: true },
  { id: 'midnight', name: 'Slate', ownAccent: true },
  { id: 'light', name: 'Light', ownAccent: true },
  { id: 'cream', name: 'Cream', ownAccent: true },
  { id: 'nord', name: 'Nord', ownAccent: true },
  { id: 'dracula', name: 'Dracula', ownAccent: true },
  { id: 'rose', name: 'Rosé', ownAccent: true },
  { id: 'tokyo', name: 'Tokyo Night', ownAccent: true },
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

/** The canonical golf-green brand. Used as the Reset baseline regardless of
    the active variant: Reset re-pins this green, while picking a variant
    clears these keys so the variant's own accent shows again. */
export const BRAND_KEYS = ['--gb-brand-label', '--gb-brand', '--gb-brand-dark', '--gb-brand-border'];
export const DEFAULT_BRAND = {
  '--gb-brand-label':  '#8fce2e',
  '--gb-brand':        '#6e901d',
  '--gb-brand-dark':   '#5f7d18',
  '--gb-brand-border': '#4a6b14',
};

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
  pushBrowserTheme();   // FIREFOX-only: recolor the browser chrome to match
}

/* ── FIREFOX dynamic browser theme ───────────────────────────────────
   Firefox exposes browser.theme.update() to recolor the actual browser
   chrome (frame/tabs/toolbar/omnibox) at runtime — Chrome has no such
   API, so this whole path no-ops there (`browser` is undefined). The
   theme API isn't available in content scripts and the background has no
   DOM to read tokens, so we compute the colors HERE (from the live
   --gb-* tokens, so it tracks the active variant + custom overrides) and:
     • call browser.theme.update() directly when it's available (extension
       pages), or
     • hand the colors to the background, which owns the API, via message. */
function firefoxThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (k, f) => (cs.getPropertyValue(k).trim() || f);
  const deep = v('--gb-surface-deep', '#0a0b0c');
  const s1 = v('--gb-surface-1', deep);
  const s2 = v('--gb-surface-2', s1);
  const tp = v('--gb-text-primary', '#f5f6f7');
  const ts = v('--gb-text-secondary', tp);
  const tt = v('--gb-text-tertiary', '#9ca0a6');
  return {
    frame: deep, frame_inactive: deep,
    tab_background_text: tt, tab_text: tp, tab_selected: s1, tab_line: v('--gb-brand-label', '#8fce2e'),
    toolbar: s1, toolbar_text: ts, bookmark_text: ts, icons: ts,
    toolbar_field: s2, toolbar_field_text: tp, toolbar_field_border: 'transparent',
    toolbar_field_focus: s2, toolbar_field_text_focus: tp,
    popup: s1, popup_text: tp, popup_border: v('--gb-border-default', s2),
    ntp_background: deep, ntp_text: tp,
    button_background_active: s2,
  };
}
function pushBrowserTheme() {
  if (typeof document === 'undefined' || typeof browser === 'undefined') return;   // Chrome → no-op
  try {
    const colors = firefoxThemeColors();
    if (browser.theme && browser.theme.update) browser.theme.update({ colors });
    else if (browser.runtime && browser.runtime.sendMessage) browser.runtime.sendMessage({ type: 'gbBrowserTheme', colors });
  } catch (e) { /* ignore */ }
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
  ensureScales();
  loadTheme().then(applyTheme);
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) {
        applyTheme(changes[STORAGE_KEY].newValue || DEFAULT_THEME);
      }
    });
  } catch { /* no chrome.storage — nothing to sync */ }
}
