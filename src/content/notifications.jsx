import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { Notifications } from '../modals/Notifications.jsx';

/* ───────────────────────────────────────────────────────────────
   notifications.jsx — content-script entry for the Notifications modal.

   Public contract used by content/main.js:
     window.__gbShowNotificationsModal()   — opens (or toggles) the modal
     window.__gbNotificationsModalLoaded   — single-execution guard

   Wrapped in <ToastHost> so the modal's own toasts appear on pages that
   don't otherwise host the toast system. Build → react-dist/content/
   notifications.js, registered in manifest content_scripts.
─────────────────────────────────────────────────────────────── */

if (!window.__gbNotificationsModalLoaded) {
  window.__gbNotificationsModalLoaded = true;
  ensureTheme();

  const HOST_ID = '__gb-notif';
  window.__gbShowNotificationsModal = function () {
    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <Notifications onClosed={onClosed} bindClose={bindClose} />
      </ToastHost>
    ));
  };
}
