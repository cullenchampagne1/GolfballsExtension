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
  ORDER_INDEX: 'order-index',
  OTHER:       'other',
});
