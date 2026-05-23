/**
 * @file theme.js
 * Injects a :root CSS custom-property block into the host page (or iframe).
 * Loaded first in every content_scripts array so all extension UI inherits
 * the correct colours before any other script runs.
 */
(function () {
  'use strict';

  var STYLE_ID = '__gb-theme';

  function rgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m
      ? parseInt(m[1],16)+', '+parseInt(m[2],16)+', '+parseInt(m[3],16)
      : '0, 0, 0';
  }

  function buildCss(ov) {
    ov = ov || {};
    function v(k, d) { return ov[k] || d; }

    var brand      = v('--gb-brand',          '#6e901d');
    var brandLabel = v('--gb-brand-label',     '#7db82a');
    var error      = v('--gb-error',           '#c86060');
    var success    = v('--gb-success',         '#38b000');
    var adminBtn   = v('--gb-admin-btn',       '#008000');
    var pagePrimary = v('--gb-page-btn',       '#008000');
    var pageSaved   = v('--gb-page-btn-saved',  '#004b23');
    var pageSaving  = v('--gb-page-btn-saving', '#2a2a2a');

    var adminSaved = v('--gb-admin-btn-saved', '#004b23');
    var errSurf    = v('--gb-error-surface',   '#1f0a0a');
    var sucSurf    = v('--gb-success-surface', '#0a1f0e');

    return ':root {\n'
      + '  --gb-brand:              ' + brand + ';\n'
      + '  --gb-brand-dark:         ' + v('--gb-brand-dark',    '#5f7d18') + ';\n'
      + '  --gb-brand-border:       ' + v('--gb-brand-border',  '#4a6b14') + ';\n'
      + '  --gb-brand-surface:      ' + v('--gb-brand-surface', '#131f0a') + ';\n'
      + '  --gb-brand-text:         ' + v('--gb-brand-text',    '#d8eeaa') + ';\n'
      + '  --gb-brand-label:        ' + brandLabel + ';\n'
      + '  --gb-brand-accent:       ' + v('--gb-brand-accent',  '#a4ce52') + ';\n'
      + '  --gb-brand-rgb:          ' + rgb(brand) + ';\n'
      + '  --gb-brand-label-rgb:    ' + rgb(brandLabel) + ';\n'
      + '  --gb-surface-deep:       ' + v('--gb-surface-deep',     '#0d0d0d') + ';\n'
      + '  --gb-surface-base:       ' + v('--gb-surface-base',     '#111111') + ';\n'
      + '  --gb-surface-raised:     ' + v('--gb-surface-raised',   '#1a1a1a') + ';\n'
      + '  --gb-surface-hover:      ' + v('--gb-surface-hover',    '#1e1e1e') + ';\n'
      + '  --gb-surface-float:      ' + v('--gb-surface-float',    '#222222') + ';\n'
      + '  --gb-surface-elevated:   ' + v('--gb-surface-elevated', '#171717') + ';\n'
      + '  --gb-border-subtle:      ' + v('--gb-border-subtle',   '#1c1c1c') + ';\n'
      + '  --gb-border-standard:    ' + v('--gb-border-standard', '#333333') + ';\n'
      + '  --gb-border-strong:      ' + v('--gb-border-strong',   '#444444') + ';\n'
      + '  --gb-text-primary:       ' + v('--gb-text-primary',   '#ffffff') + ';\n'
      + '  --gb-text-secondary:     ' + v('--gb-text-secondary', '#cccccc') + ';\n'
      + '  --gb-text-muted:         ' + v('--gb-text-muted',     '#888888') + ';\n'
      + '  --gb-text-ghost:         ' + v('--gb-text-ghost',     '#555555') + ';\n'
      + '  --gb-error:              ' + error + ';\n'
      + '  --gb-error-surface:      ' + errSurf + ';\n'
      + '  --gb-error-rgb:          ' + rgb(error) + ';\n'
      + '  --gb-success:            ' + success + ';\n'
      + '  --gb-success-surface:    ' + sucSurf + ';\n'
      + '  --gb-success-rgb:        ' + rgb(success) + ';\n'
      + '  --gb-warning:            ' + v('--gb-warning', '#e0a030') + ';\n'
      + '  --gb-admin-btn:          ' + adminBtn + ';\n'
      + '  --gb-admin-btn-saved:    ' + adminSaved + ';\n'
      + '  --gb-admin-rgb:          ' + rgb(adminBtn) + ';\n'
      + '  --gb-admin-saved-rgb:    ' + rgb(adminSaved) + ';\n'
      + '  --gb-page-btn:          ' + pagePrimary + ';\n'
      + '  --gb-page-btn-dark:      ' + pageSaved + ';\n'
      + '  --gb-page-btn-saved:     ' + pageSaved + ';\n'
      + '  --gb-page-btn-saving:    ' + pageSaving + ';\n'
      + '  --gb-page-btn-text:      ' + v('--gb-page-btn-text', '#d4ffdc') + ';\n'
      + '  --gb-page-btn-border:    ' + v('--gb-page-btn-border','#026e23') + ';\n'
      + '  --gb-page-btn-rgb:       ' + rgb(pagePrimary) + ';\n'
      + '  --gb-page-btn-saved-rgb: ' + rgb(pageSaved) + ';\n'
      + '  --gb-backdrop:           rgba(0,0,0,0.85);\n'
      + '  --gb-backdrop-heavy:     rgba(0,0,0,0.95);\n'
      + '  --gb-tooltip-bg:         rgba(10,10,10,0.93);\n'
      + '  --gb-fraud-rgb:          220, 38, 38;\n'
      /* legacy aliases */
      + '  --gb-brand-text-active:  ' + v('--gb-brand-text',     '#d8eeaa') + ';\n'
      + '  --gb-surface-void:       ' + v('--gb-surface-deep',   '#0d0d0d') + ';\n'
      + '  --gb-surface-mid:        ' + v('--gb-surface-base',   '#111111') + ';\n'
      + '  --gb-border-base:        ' + v('--gb-border-subtle',  '#1c1c1c') + ';\n'
      + '  --gb-border-muted:       ' + v('--gb-border-standard','#333333') + ';\n'
      + '  --gb-text-tertiary:      ' + v('--gb-text-secondary', '#cccccc') + ';\n'
      + '  --gb-text-faint:         ' + v('--gb-text-ghost',     '#555555') + ';\n'
      + '  --gb-error-icon-bg:      ' + errSurf + ';\n'
      + '  --gb-error-border:       ' + errSurf + ';\n'
      + '  --gb-success-bright:     ' + success + ';\n'
      + '  --gb-success-icon-bg:    ' + sucSurf + ';\n'
      + '  --gb-success-border:     ' + sucSurf + ';\n'
      + '  --gb-admin-btn-border:   ' + adminSaved + ';\n'
      + '}';
  }

  function applyStyleText(cssText) {
    var el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = cssText;
  }

  // Two storage keys exist:
  //   gbTheme = { variant, colors } — the React Settings panel writes here
  //   themeColors = flat colors object — the legacy settings panel wrote
  //                 here; nothing writes it any more but old user data
  //                 may still carry it.
  // Read both; gbTheme.colors wins if present.
  function pickColors(d) {
    if (d && d.gbTheme && d.gbTheme.colors && Object.keys(d.gbTheme.colors).length > 0) return d.gbTheme.colors;
    if (d && d.themeColors && Object.keys(d.themeColors).length > 0) return d.themeColors;
    return {};
  }

  // 1. Apply defaults synchronously — no FOUC.
  applyStyleText(buildCss({}));

  // 2. Re-apply with saved overrides.
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['gbTheme', 'themeColors'], function (data) {
      var ov = pickColors(data);
      if (Object.keys(ov).length > 0) applyStyleText(buildCss(ov));
    });
  }

  // 3. Live-update from settings panel broadcasts (content scripts).
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (msg.action === 'GB_APPLY_THEME' && msg.colors) {
        applyStyleText(buildCss(msg.colors));
      }
    });
  }

  // 4. Live-update for extension pages (popup, editor) via storage change.
  //    Watches BOTH keys so flipping the theme in React Settings (gbTheme)
  //    or any leftover legacy writer (themeColors) reaches us.
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      if (!changes.gbTheme && !changes.themeColors) return;
      chrome.storage.local.get(['gbTheme', 'themeColors'], function (data) {
        applyStyleText(buildCss(pickColors(data)));
      });
    });
  }
})();
