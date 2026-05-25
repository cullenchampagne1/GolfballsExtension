import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { CallLog } from '../modals/CallLog.jsx';
import { submitCallLog, readCallContext } from '../lib/submitCallLog.js';

/* ───────────────────────────────────────────────────────────────
   call-log.jsx — content-script entry for the Call Log modal.

   Same pattern as watch-list.jsx / task-list.jsx: a single-execution
   guard, ensureTheme, then a window-global `showModal` function the
   smart action (or any other caller) invokes.

   Public contract:
     window.__gbShowCallLogModal(overrides?)
       Opens the modal. Auto-reads contactId/phone/contactName/
       employeeId from the current CRM contact page via
       readCallContext(); `overrides` is an optional partial that
       wins over the auto-read values (used when the caller already
       knows a better phone number, e.g. picked by the user via
       findPhone before dialing).

     window.__gbCallLogModalLoaded
       Single-execution guard so re-injections (HMR, secondary
       content-script load) don't double-bind.

   The modal's `onSubmit` is wired to the shared submitCallLog —
   same fn the playground uses. That's deliberate: it means
   sandbox failures (missing contactId etc.) surface the exact
   same toast the user would see in production if smart-detection
   ever returned an incomplete context. No divergent code paths.
─────────────────────────────────────────────────────────────── */

if (!window.__gbCallLogModalLoaded) {
  window.__gbCallLogModalLoaded = true;
  ensureTheme();

  const HOST_ID = '__gb-cl-modal';

  window.__gbShowCallLogModal = async function (overrides = {}) {
    // Read context BEFORE mounting so the modal can put the right
    // phone in the subtitle from the first frame. readCallContext is
    // safe to call anywhere (returns mostly-empty outside a contact
    // page) — submitCallLog will refuse if the required fields are
    // missing, surfacing the right error to the rep.
    const pageCtx = await readCallContext();
    const ctx = { ...pageCtx, ...overrides };

    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <CallLog
          contactName={ctx.contactName || 'Contact'}
          contactType={ctx.contactType || 'contact'}
          /* Subtitle uses the raw phone if the auto-read came up
             empty AND the caller passed an already-formatted
             override. */
          phone={overrides.phone || ctx.phone || ''}
          onSubmit={(template) => submitCallLog({ template, context: ctx })}
          onClosed={onClosed}
          bindClose={bindClose}
        />
      </ToastHost>
    ));
  };
}
