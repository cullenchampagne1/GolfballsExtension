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
}
