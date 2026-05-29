/* ───────────────────────────────────────────────────────────────
   scales.js — STUB for the proof-submit-extension client build.

   The full extension lets each surface (modals / popovers / etc.)
   be CSS-zoomed independently and persists per-category sliders to
   chrome.storage. This build has no settings UI, so every surface
   stays at 1.0 — but we still need to inject the CSS variables the
   design-system stylesheet reads so layout doesn't break.
─────────────────────────────────────────────────────────────── */

const STYLE_ID = '__gb-ui-scales-css';

const CATEGORIES = [
  'modals', 'popovers', 'toasts', 'shelf', 'popup', 'editor', 'playground',
];

function buildSheet() {
  const root = CATEGORIES.map((c) => `--gb-scale-${c}: 1;`).join(' ');
  const zoom = CATEGORIES.map(
    (c) => `[data-gb-scale="${c}"] { zoom: var(--gb-scale-${c}); }`,
  ).join('\n');
  return `:root { ${root} }\n${zoom}`;
}

export function ensureScales() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = buildSheet();
  (document.head || document.documentElement).appendChild(el);
}
