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
     window.__gbShowQuickTaskModal(opts?)
       Opens the modal. Auto-reads contactId/employeeId/contactName
       from the current page; extra keys on `opts` win as context
       overrides (useful for the smart action which already has the
       contact display name). Control opts:
         autoCompose  open straight into the composer / menu so
                      "add a task" lands on the builder everywhere
         returnData   hand the composed task back via a
                      { action:'quickTaskComposed', data } runtime
                      message instead of submitting to the CRM — for
                      callers with no page context (e.g. the popup)
         onComposed   same-context callback alternative to returnData
     window.__gbQuickTaskModalLoaded
       Single-execution guard.
─────────────────────────────────────────────────────────────── */

if (!window.__gbQuickTaskModalLoaded) {
  window.__gbQuickTaskModalLoaded = true;
  ensureTheme();

  const HOST_ID = '__gb-qt-modal';

  window.__gbShowQuickTaskModal = async function (opts = {}) {
    const { autoCompose = false, returnData = false, onComposed, ...overrides } = opts;
    const pageCtx = await readTaskContext();
    const ctx = { ...pageCtx, ...overrides };

    /* In return mode, post the composed task back to whoever asked
       (the popup listens for 'quickTaskComposed') instead of firing
       the CRM create — submitQuickTask would just reject for lack of
       contactId/employeeId there anyway. */
    const handleComposed = onComposed || (returnData
      ? (data) => { try { chrome.runtime?.sendMessage?.({ action: 'quickTaskComposed', data }); } catch { /* ignore */ } }
      : undefined);

    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <QuickTask
          contactName={ctx.contactName || 'Contact'}
          contactType={ctx.contactType || 'contact'}
          autoCompose={autoCompose}
          onComposed={handleComposed}
          onSubmit={(template) => submitQuickTask({ template, context: ctx })}
          onClosed={onClosed}
          bindClose={bindClose}
        />
      </ToastHost>
    ));
  };
}
