import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { Notifications } from '../modals/Notifications.jsx';

/* Global entry for the installation-scoped notification center.
   Wrapped in ToastHost so action feedback remains available even on pages
   where no other React surface has mounted the shared toast system. */

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
