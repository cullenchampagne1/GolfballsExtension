import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ensureScales } from '../lib/scales.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { GiftCatalog } from '../modals/GiftCatalog.jsx';

/* ───────────────────────────────────────────────────────────────
   gift-catalog.jsx — content-script entry for the Corporate Gifting
   Catalog modal.

   Exposes:
     window.__gbOpenGiftCatalog()
       Mounts the catalog over the page. It loads the gifting/events
       product feed live (seed-first paint, then the full Solr pull).
─────────────────────────────────────────────────────────────── */

if (!window.__gbGiftCatalogLoaded) {
  window.__gbGiftCatalogLoaded = true;
  ensureTheme();
  ensureScales();

  const HOST_ID = '__gb-gift-catalog';

  window.__gbOpenGiftCatalog = function () {
    mountFloating(HOST_ID, ({ onClosed }) => (
      <ToastHost installGlobal={false}>
        <GiftCatalog onClose={onClosed} />
      </ToastHost>
    ));
  };
}
