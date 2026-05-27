import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { TaskList } from '../modals/TaskList.jsx';

/* ───────────────────────────────────────────────────────────────
   task-list.jsx — content-script entry for the Task List modal.

   Replaces content/task-list-modal.js. Preserves the public contract
   used by content/main.js:

     window.__gbShowTaskListModal()       — opens (or toggles) the modal
     window.__gbTaskListModalLoaded       — single-execution guard

   Wraps in <ToastHost> so the no-data + template-data toasts surface
   on pages that don't otherwise mount one.
─────────────────────────────────────────────────────────────── */

if (!window.__gbTaskListModalLoaded) {
  window.__gbTaskListModalLoaded = true;
  ensureTheme();

  const HOST_ID = '__gb-tl';
  window.__gbShowTaskListModal = function () {
    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <TaskList onClosed={onClosed} bindClose={bindClose} />
      </ToastHost>
    ));
  };

  // Configurable Ctrl+<key> (Cmd on macOS) shortcut. Same pattern as
  // margin-calc.jsx / crm-search.jsx. Capture-phase so we beat any page
  // handler that might swallow the chord. Cached config so the keydown
  // handler runs synchronously (preventDefault needs to happen before
  // the host page's cut handler swallows Ctrl+X).
  const state = { key: 'x', enabled: true };
  function applyConfig({ keyboardShortcuts, featureFlags }) {
    const raw = keyboardShortcuts?.taskList;
    state.key = (raw === undefined ? 'x' : raw).toLowerCase();
    state.enabled = featureFlags?.taskListEnabled !== false;
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
    window.__gbShowTaskListModal();
  }, { capture: true });
}
