import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ensureScales } from '../lib/scales.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { GiftCatalog } from '../modals/GiftCatalog.jsx';
import { runEngine } from '../lib/page-engine/index.js';

/* Resolve the CRM page context (account/contact/order ids + opportunities) so a
   proposal can be saved straight to the right account/opportunity. The catalog
   content-script also runs on api.golfballs.com (the CRM), so when it's opened
   there the page engine already has everything; off a CRM page this is empty and
   the modal falls back to a manual account-id input. */
function resolvePageContext() {
  try {
    const ctx = runEngine(document);
    if (!ctx || !ctx.data) return {};
    const ids = ctx.data.ids || {};
    return {
      schemaId: ctx.schemaId || null,
      accountId: ids.account || null,
      contactId: ids.contact || null,
      orderId: ids.order || null,
      customerId: ids.customer || ids.contact || null,
      accountName: (ctx.data.account && ctx.data.account.name) || null,
      opportunities: Array.isArray(ctx.data.opportunities) ? ctx.data.opportunities : [],
    };
  } catch { return {}; }
}

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
    if ((window.__gbFeatureFlags || {}).giftCatalogEnabled === false) return;
    const pageContext = resolvePageContext();
    mountFloating(HOST_ID, ({ onClosed }) => (
      <ToastHost installGlobal={false}>
        <GiftCatalog onClose={onClosed} pageContext={pageContext} />
      </ToastHost>
    ));
  };
}
