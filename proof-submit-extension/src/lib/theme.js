import themeCss from '../ui/theme.css?inline';
import { startForceImportantBorderRadius } from './forceImportantBorderRadius.js';
import { ensureScales } from './scales.js';

/* ───────────────────────────────────────────────────────────────
   theme.js — proof-submit-extension client build.

   The full extension exposes a theme picker (4 variants × 8 color
   knobs) and persists choices to chrome.storage. This build is
   pinned to the bright "light" variant — no picker, no storage,
   no listener. We just inject the stylesheet once and stamp
   data-theme="light" on <html>.
─────────────────────────────────────────────────────────────── */

const SHEET_ID = '__gb-ds-theme';

function injectSheet() {
  if (document.getElementById(SHEET_ID)) return;
  const el = document.createElement('style');
  el.id = SHEET_ID;
  el.textContent = themeCss;
  (document.head || document.documentElement).appendChild(el);
}

export function ensureTheme() {
  injectSheet();
  startForceImportantBorderRadius();
  ensureScales();
  document.documentElement.dataset.theme = 'light';
}
