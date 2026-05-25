import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { QuickTask } from '../modals/QuickTask.jsx';
import { submitQuickTask, readTaskContext } from '../lib/submitQuickTask.js';

/* ───────────────────────────────────────────────────────────────
   quick-task.jsx — content-script entry for the Quick Task modal.

   Sibling of src/content/call-log.jsx. Same patterns, different
   payload.

   Public contract:
     window.__gbShowQuickTaskModal(overrides?)
       Opens the modal. Auto-reads contactId/employeeId/contactName
       from the current page; `overrides` lets the caller stuff
       a partial that wins (useful for the smart action which
       already has the contact display name).
     window.__gbQuickTaskModalLoaded
       Single-execution guard.
─────────────────────────────────────────────────────────────── */

if (!window.__gbQuickTaskModalLoaded) {
  window.__gbQuickTaskModalLoaded = true;
  ensureTheme();

  const HOST_ID = '__gb-qt-modal';

  window.__gbShowQuickTaskModal = async function (overrides = {}) {
    const pageCtx = await readTaskContext();
    const ctx = { ...pageCtx, ...overrides };

    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <QuickTask
          contactName={ctx.contactName || 'Contact'}
          contactType={ctx.contactType || 'contact'}
          onSubmit={(template) => submitQuickTask({ template, context: ctx })}
          onClosed={onClosed}
          bindClose={bindClose}
        />
      </ToastHost>
    ));
  };
}
