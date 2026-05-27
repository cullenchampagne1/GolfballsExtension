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

   Important: content/crm-query-builder.js stays in the manifest for
   now. The legacy QB has TWO consumers — (1) the legacy CRM-Search
   modal called into it as a sub-modal, and (2) it self-injects an
   in-page button on the CRM Search admin page (Page=360). The React
   CRMSearch.jsx renders its own QueryBuilder.jsx sub-modal, so it
   doesn't need (1) anymore, but the page injection in (2) still
   relies on the legacy file. Deferring that cleanup until the admin
   page itself migrates to React.

   Wraps in <ToastHost> so the search-unavailable + template-data
   toasts surface even on pages without their own host.
─────────────────────────────────────────────────────────────── */

if (!window.__gbCrmSearchModalLoaded) {
  window.__gbCrmSearchModalLoaded = true;
  ensureTheme();

  const HOST_ID = '__gb-csm';
  window.__gbShowCrmSearchModal = function () {
    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <CRMSearch onClosed={onClosed} bindClose={bindClose} />
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
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.shiftKey || e.altKey) return;
    if (!state.enabled || !state.key) return;
    if (e.key.toLowerCase() !== state.key) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
    e.preventDefault();
    e.stopPropagation();
    window.__gbShowCrmSearchModal();
  }, { capture: true });
}
