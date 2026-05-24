import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { CRMCreateContact } from '../modals/CRMCreateContact.jsx';

/* ───────────────────────────────────────────────────────────────
   crm-create-contact.jsx — content-script entry for the New
   Contact modal.

   Replaces content/crm-create-contact-modal.js. Preserves the public
   contract used by the rest of the extension:

     window.__gbShowCrmCreateContactModal()   — opens (or toggles closed)
                                                the modal
     window.__gbCrmCreateContactModalLoaded   — single-execution guard

   Keybinding stays in content/main.js (Ctrl+<configurable>, default Q)
   and just dispatches to the global above, so nothing else has to
   change. Build → react-dist/content/crm-create-contact.js, swap
   the manifest entry from the old file to this one.

   We wrap the modal in <ToastHost> so the in-page toast appears for
   the "Account search unavailable" / "Couldn't create contact"
   graceful-failure paths even on pages that don't otherwise host
   the toast system.
─────────────────────────────────────────────────────────────── */

if (!window.__gbCrmCreateContactModalLoaded) {
  window.__gbCrmCreateContactModalLoaded = true;

  ensureTheme();

  const HOST_ID = '__gb-ccm';

  window.__gbShowCrmCreateContactModal = function () {
    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <CRMCreateContact onClosed={onClosed} bindClose={bindClose} />
      </ToastHost>
    ));
  };
}
