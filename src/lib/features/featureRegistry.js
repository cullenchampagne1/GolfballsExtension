/* ───────────────────────────────────────────────────────────────
   features/featureRegistry — the single source of truth for what each
   feature CAN do (its surfaces), replacing the popup/shelf binding that
   was hardcoded across actions-shelf.jsx (ALWAYS_ACTIONS + registerX) and
   the per-feature __gbShow* popup globals.

   Per feature (keyed by the featureFlags key):
     surfaces.popup : the __gbShow… / __gbOpen… global it opens, or null
     surfaces.shelf : { actions:[{id,label,icon}], pages:[…] } or null
   `pages` are PAGE_TYPE ids (constants.js): order · contact · account ·
   opportunity · order-index, or '*' for any page.

   Pure data — no DOM, storage, or chrome. The Settings rows + the shelf
   registration both read this.
─────────────────────────────────────────────────────────────── */

import { FEATURE_FLAGS } from '../flags.js';

const SURFACES = {
  crmSearchEnabled:    { popup: '__gbShowCrmSearchModal', shelf: { actions: [{ id: 'gb-open-contacts', label: 'CRM Search', icon: 'search' }], pages: ['*'] } },
  taskListEnabled:     { popup: '__gbShowTaskListModal', shelf: { actions: [{ id: 'gb-open-tasks', label: 'Task List', icon: 'check' }], pages: ['*'] } },
  giftCatalogEnabled:  { popup: '__gbOpenGiftCatalog', shelf: { actions: [{ id: 'gb-open-gift-catalog', label: 'Gifting Catalog', icon: 'card' }], pages: ['*'] } },
  mockupStudioEnabled: { popup: '__gbOpenMockupStudio', shelf: { actions: [{ id: 'gb-open-mockup-studio', label: 'Mockup Studio', icon: 'eye' }], pages: ['*'] } },
  imagePreviewEnabled: { popup: '__gbOpenImagePreview', shelf: { actions: [{ id: 'gb-open-image-viewer', label: 'Image Viewer', icon: 'eye' }], pages: ['*'] } },
  callLogEnabled:      { popup: '__gbShowCallLogModal', shelf: { actions: [{ id: 'gb-call-contact', label: 'Call contact', icon: 'phone' }, { id: 'gb-log-incoming-call', label: 'Log incoming call', icon: 'phone' }], pages: ['contact', 'account'] } },
  quickTaskEnabled:    { popup: '__gbShowQuickTaskModal', shelf: { actions: [{ id: 'gb-quick-task', label: 'Quick task', icon: 'check' }], pages: ['contact', 'account'] } },
  phoneFinderEnabled:  { popup: null, shelf: { actions: [{ id: 'gb-find-phone', label: 'Find phone', icon: 'search' }], pages: ['contact'] } },
  copyIdsEnabled:      { popup: null, shelf: { actions: [{ id: 'gb-copy-order-ids', label: 'Copy order IDs', icon: 'copy' }], pages: ['order-index'] } },
  calendarEnabled:     { popup: '__gbOpenOrderCalendar', shelf: { actions: [{ id: 'gb-order-dates', label: 'Order dates', icon: 'cog' }], pages: ['order'] } },
  // popup-only features (no shelf action today)
  marginCalcEnabled:      { popup: '__gbShowMarginCalcModal', shelf: null },
  watchListEnabled:       { popup: '__gbShowWatchListModal', shelf: null },
  emailPreviewEnabled:    { popup: '__gbOpenEmailPreview', shelf: null },
  textPreviewEnabled:     { popup: '__gbOpenTextPreview', shelf: null },
  submitProofEnabled:     { popup: '__gbOpenSubmitProof', shelf: null },
  crmNewContactEnabled:   { popup: '__gbShowCrmCreateContactModal', shelf: null },
  campaignManagerEnabled: { popup: '__gbOpenCampaignManager', shelf: null },
  notificationsEnabled:   { popup: '__gbShowNotificationsModal', shelf: null },
};

const NO_SURFACES = Object.freeze({ popup: null, shelf: null });

/** Every feature's display metadata + declared surfaces. */
export const FEATURE_REGISTRY = FEATURE_FLAGS.map((f) => ({
  ...f, // key, section, name, desc, icon
  surfaces: SURFACES[f.key] || NO_SURFACES,
}));

export function featureByKey(key) {
  return FEATURE_REGISTRY.find((f) => f.key === key) || null;
}

/** Features with a shelf action — rows for the per-page grid. */
export function shelfFeatures() {
  return FEATURE_REGISTRY.filter((f) => f.surfaces.shelf);
}

/** Features with either surface — the ones whose row gets sub-controls. */
export function surfacedFeatures() {
  return FEATURE_REGISTRY.filter((f) => f.surfaces.popup || f.surfaces.shelf);
}
