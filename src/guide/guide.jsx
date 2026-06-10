import React from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { ensureScales } from '../lib/scales.js';
import guideCss from './guide.css?inline';
import { App } from './lib/app.jsx';

/* ───────────────────────────────────────────────────────────────
   guide.jsx — entry for guide.html (the standalone Operator's
   Guide page, opened from Settings). Injects the guide stylesheet,
   applies the real theme + per-surface scaling, and mounts the
   shell. Build → react-dist/guide/guide.js (see build.js surfaces).
─────────────────────────────────────────────────────────────── */

const CSS_ID = '__gb-guide-css';
function injectGuideCss() {
  if (document.getElementById(CSS_ID)) return;
  const el = document.createElement('style');
  el.id = CSS_ID;
  el.textContent = guideCss;
  document.head.appendChild(el);
}

function mount() {
  const host = document.getElementById('guide-root');
  if (!host || host.__gbGuideMounted) return;
  host.__gbGuideMounted = true;
  ensureTheme();
  ensureScales();
  injectGuideCss();
  host.setAttribute('data-gb-scale', 'editor');
  createRoot(host).render(<App />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
