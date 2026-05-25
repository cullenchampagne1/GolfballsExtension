import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { WatchList } from '../modals/WatchList.jsx';

/* ───────────────────────────────────────────────────────────────
   watch-list.jsx — content-script entry for the Watch List modal.

   Replaces content/watchlist-modal.js. Preserves the public contract
   used by content/main.js:

     window.__gbShowWatchListModal()      — opens (or toggles) the modal
     window.__gbWatchListModalLoaded      — single-execution guard

   Wraps in <ToastHost> so the modal's own error/info toasts (no-data
   fallback, etc.) appear on pages that don't otherwise host the toast
   system. Build → react-dist/content/watch-list.js, swap manifest.
─────────────────────────────────────────────────────────────── */

if (!window.__gbWatchListModalLoaded) {
  window.__gbWatchListModalLoaded = true;
  ensureTheme();

  const HOST_ID = '__gb-wl';
  window.__gbShowWatchListModal = function () {
    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <WatchList onClosed={onClosed} bindClose={bindClose} />
      </ToastHost>
    ));
  };
}
