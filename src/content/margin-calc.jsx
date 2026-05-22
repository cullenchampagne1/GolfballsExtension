import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { MarginCalc } from '../modals/MarginCalc.jsx';

/* ───────────────────────────────────────────────────────────────
   margin-calc.jsx — content-script entry for the Margin Calculator.

   Replaces content/margin-calculator-modal.js. Keeps the same public
   contract: window.__gbShowMarginCalcModal + the Ctrl+M toggle, so
   nothing else in the extension changes. Build → react-dist/content/.
─────────────────────────────────────────────────────────────── */

// Single-execution guard — Chrome re-injects content scripts on navigation.
if (!window.__gbMarginCalcLoaded) {
  window.__gbMarginCalcLoaded = true;

  ensureTheme(); // make the --gb-* design tokens available on the page

  const HOST_ID = '__gb-margin-calc';

  const open = (shortcut) => {
    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <MarginCalc shortcut={shortcut} onClosed={onClosed} bindClose={bindClose} />
    ));
  };

  // Public entry point — unchanged contract for the rest of the extension.
  window.__gbShowMarginCalcModal = function () {
    const existing = document.getElementById(HOST_ID);
    if (existing) { existing.__gbClose?.(); return; } // toggle → animated close
    chrome.storage.local.get('keyboardShortcuts', ({ keyboardShortcuts }) => {
      const key = (keyboardShortcuts?.marginCalc || 'm').toUpperCase();
      open(`Ctrl+${key}`);
    });
  };

  // Configurable Ctrl+<key> toggle (default Ctrl+M), gated on the feature flag.
  chrome.storage.local.get(['keyboardShortcuts', 'featureFlags'], ({ keyboardShortcuts, featureFlags }) => {
    const key = (keyboardShortcuts?.marginCalc || 'm').toLowerCase();
    document.addEventListener('keydown', (e) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== key) return;
      if (featureFlags?.marginCalcEnabled === false) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      e.preventDefault();
      window.__gbShowMarginCalcModal();
    });
  });
}
