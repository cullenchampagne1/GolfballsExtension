/* ───────────────────────────────────────────────────────────────
   constants.js — small cross-extension constants that deserve a
   single source of truth instead of scattered string literals.
─────────────────────────────────────────────────────────────── */

/* The kinds of golfballs admin page the extension recognises.
   String VALUES are intentionally identical to the literals used
   historically (actions-shelf detectPageType, smart-detection
   smartPageType, popup/WatchList comparisons) so existing equality
   checks keep working as call sites migrate onto this enum. */
export const PAGE_TYPE = Object.freeze({
  ORDER:       'order',
  CONTACT:     'contact',
  ACCOUNT:     'account',
  OPPORTUNITY: 'opportunity',
  ORDER_INDEX: 'order-index',
  OTHER:       'other',
});

/* Backend hosts + the derived CRM bases that were re-declared verbatim
   across the lib layer (submit* / crmTasks BASE, saveProposal CRM_ADMIN/
   _crmBase, helpers ADMIN/ROOT, cartSerializer ICU…). ESM-only — the
   classic service worker (background.js) and vanilla content scripts
   can't import this, so they keep their own copies; keep those in sync. */
const CRM = 'https://api.golfballs.com';
const MASTER = 'https://master.api.icustomize.com';
export const API = Object.freeze({
  CRM,                                        // golfballs CRM/admin host
  MASTER,                                     // icustomize master API host
  STATIC:      'https://static.golfballs.com',
  CRM_ADMIN:   `${CRM}/golfballs/adminnew/`,  // AdminNew Default.aspx pages
  CRM_ROOT:    `${CRM}/golfballs/`,
  CRM_CRM:     `${CRM}/golfballs/crm/Admin/`, // CRM Admin .ajax endpoints
  MASTER_USER: `${MASTER}/user`,
});

/* AdminNew Default.aspx `Page=` ids — the CRM's screen identifiers, used
   when building admin deep-links. */
export const CRM_PAGES = Object.freeze({
  CONTACT_SEARCH: 128,   // customer search / proof submission
  CONTACT_DETAIL: 240,   // single-contact view (…&customerID=)
  ACCOUNT_DETAIL: 271,   // single-account view (…&AccountID=)
  PRODUCT:        253,   // item/product view (…&itemID=)
});
