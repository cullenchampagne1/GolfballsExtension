import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { CRMSearch } from '../modals/CRMSearch.jsx';

/* ───────────────────────────────────────────────────────────────
   crm-search.jsx — content-script entry for the CRM Search modal.

   Replaces content/crm-search-modal.js. Preserves the public contract
   used by content/main.js:

     window.__gbShowCrmSearchModal()      — opens (or toggles) the modal
     window.__gbCrmSearchModalLoaded      — single-execution guard

   Note: the legacy vanilla crm-query-builder.js was REMOVED. It used
   to (1) act as a sub-modal for the old CRM-Search modal and (2)
   self-inject an in-page button on the CRM Search admin page
   (Page=360). The React CRMSearch.jsx renders its own QueryBuilder.jsx
   sub-modal, so (1) is gone for free; the Page=360 in-page button (2)
   went away with the file — the modal is still reachable via the
   Ctrl+<key> toggle below (and the popup / actions shelf).

   Wraps in <ToastHost> so the search-unavailable + template-data
   toasts surface even on pages without their own host.
─────────────────────────────────────────────────────────────── */

if (!window.__gbCrmSearchModalLoaded) {
  window.__gbCrmSearchModalLoaded = true;
  ensureTheme();

  const HOST_ID = '__gb-csm';
  // `initial` (payload API) pre-configures the modal: { query, type }. Absent
  // for a plain user open, so the default is unchanged.
  window.__gbShowCrmSearchModal = function (initial) {
    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <CRMSearch onClosed={onClosed} bindClose={bindClose} initial={initial} />
      </ToastHost>
    ));
  };

  /* Configurable Ctrl+<key> (or Cmd+<key>) toggle. Same pattern as
     margin-calc.jsx and task-list.jsx — cached config + capture-phase
     keydown so we beat any page-script handler that might swallow the
     chord. The legacy content/crm-search-modal.js registered this; the
     React port lost it when the vanilla file was deleted. */
  const state = { key: 'k', enabled: true };
  function applyConfig({ keyboardShortcuts, featureFlags }) {
    const raw = keyboardShortcuts?.crmSearch;
    state.key = (raw === undefined ? 'k' : raw).toLowerCase();
    state.enabled = featureFlags?.crmSearchEnabled !== false;
  }
  try {
    chrome.storage.local.get(['keyboardShortcuts', 'featureFlags'], applyConfig);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.keyboardShortcuts || changes.featureFlags) {
        chrome.storage.local.get(['keyboardShortcuts', 'featureFlags'], applyConfig);
      }
    });
  } catch { /* not in extension context */ }
  /* Returns true if the keystroke is happening inside an editable field.
     Uses composedPath so it also sees inputs INSIDE a shadow root (our
     custom-page takeover) — document.activeElement only reports the shadow
     host there, so the plain tagName check would miss them. */
  function inEditable(e) {
    const path = (e.composedPath && e.composedPath()) || [];
    for (const el of path) {
      if (!el || !el.tagName) continue;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
    }
    const a = document.activeElement;
    return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable));
  }

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.shiftKey || e.altKey) return;
    if (!state.enabled || !state.key) return;
    if (e.key.toLowerCase() !== state.key) return;
    if (inEditable(e)) return;
    e.preventDefault();
    e.stopPropagation();
    window.__gbShowCrmSearchModal();
  }, { capture: true });
  /* NOTE: "/" no longer opens this modal. On custom pages it focuses the
     in-page inline search (index-backed dropdown); the full modal is only
     opened explicitly (Ctrl+<key> or the header's full-search button). */
}
