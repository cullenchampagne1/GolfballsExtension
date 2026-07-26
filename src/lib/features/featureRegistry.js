/* ───────────────────────────────────────────────────────────────
   features/featureRegistry — the single source of truth for what each
   feature CAN do (its surfaces), replacing the popup/shelf binding that
   was hardcoded across actions-shelf.jsx (ALWAYS_ACTIONS + registerX) and
   the per-feature popup buttons.

   Per feature (keyed by the featureFlags key):
     surfaces.popup : boolean — can appear as a launcher button in the
                      browser-action popup (triggered via GB_LAUNCH_FEATURE).
     surfaces.shelf : { actions:[{id,label,icon}], pages:[…], global?, dynamic? }
                      or null.
       · actions : the quick-action rows this feature contributes.
       · pages   : PAGE_TYPE ids (order · contact · account · opportunity ·
                   order-index) or '*' for any page — the DEFAULT relevance.
       · global  : window.__gb* opened directly for STANDALONE features (a
                   safe no-arg launch); absent for `dynamic` features.
       · dynamic : true when the shelf action is registered imperatively in
                   actions-shelf.jsx (live-DOM gates: phone digits, order
                   rows, order id). Those keep their handcrafted handlers;
                   the registry only declares their surface + default pages.

   The `pages` list governs BOTH surfaces through featureConfig.pageApplies,
   so a rep can say "CRM Search on contact pages only" once and it holds for
   the popup button and the shelf action alike.

   Contextual/inline features (email preview, text preview, passive glows)
   have NO launcher — they surface inline on the page — so they get
   NO_SURFACES and render as a plain on/off toggle in Settings.

   Pure data — no DOM, storage, or chrome. The Settings rows, the popup
   launcher, and the shelf registration all read this.
─────────────────────────────────────────────────────────────── */

import { FEATURE_FLAGS } from '../flags.js';

/* one() — a standalone feature: a single shelf action whose handler is just
   "call this window global". Popup + shelf, default pages. */
const one = (id, label, icon, global, pages = ['*']) => ({
  popup: true,
  shelf: { actions: [{ id, label, icon }], pages, global },
});

/* ctx() — a page-contextual feature: its shelf action(s) are registered in
   actions-shelf.jsx with live-DOM gates, so `dynamic:true` and no global.
   Still popup-launchable (the popup messages the tab to run the action). */
const ctx = (actions, pages) => ({
  popup: true,
  shelf: { actions, pages, dynamic: true },
});

const SURFACES = {
  // ── Standalone launchers (popup + shelf, any page) ──
  crmSearchEnabled:       one('gb-open-contacts',      'CRM Search',        'search',    '__gbShowCrmSearchModal'),
  taskListEnabled:        one('gb-open-tasks',         'Task List',         'check',     '__gbShowTaskListModal'),
  giftCatalogEnabled:     one('gb-open-gift-catalog',  'Gifting Catalog',   'card',      '__gbOpenGiftCatalog'),
  mockupStudioEnabled:    one('gb-open-mockup-studio', 'Mockup Studio',     'sparkle',   '__gbOpenMockupStudio'),
  imagePreviewEnabled:    one('gb-open-image-viewer',  'Image Viewer',      'eye',       '__gbOpenImagePreview'),
  watchListEnabled:       one('gb-open-watch-list',    'Watchlist',         'eye',       '__gbShowWatchListModal'),
  notificationsEnabled:   one('gb-open-notifications', 'Notifications',     'alert',     '__gbShowNotificationsModal'),
  crmNewContactEnabled:   one('gb-open-new-contact',   'New Contact',       'user',      '__gbShowCrmCreateContactModal'),
  campaignManagerEnabled: one('gb-open-campaigns',     'Campaign Manager',  'megaphone', '__gbOpenCampaignManager'),
  // Margin calc is meaningful on order pages by default; the global works anywhere.
  marginCalcEnabled:      one('gb-open-margin-calc',   'Margin Calculator', 'bolt',      '__gbShowMarginCalcModal', ['order']),

  // ── Page-contextual launchers (popup + shelf, scoped pages) ──
  callLogEnabled:     ctx([{ id: 'gb-call-contact', label: 'Call contact', icon: 'phone' }, { id: 'gb-log-incoming-call', label: 'Log incoming call', icon: 'edit' }], ['contact', 'account']),
  quickTaskEnabled:   ctx([{ id: 'gb-quick-task', label: 'Quick task', icon: 'check' }], ['contact', 'account']),
  phoneFinderEnabled: ctx([{ id: 'gb-find-phone', label: 'Find phone', icon: 'search' }], ['contact']),
  copyIdsEnabled:     ctx([{ id: 'gb-copy-order-ids', label: 'Copy order IDs', icon: 'copy' }], ['order-index']),
  calendarEnabled:    ctx([{ id: 'gb-order-dates', label: 'Order dates', icon: 'cog' }], ['order']),
};

const NO_SURFACES = Object.freeze({ popup: false, shelf: null });

/* Inline/passive/native features that have NO launcher → plain toggle:
   emailPreview (click email rows), textPreview (hover case notes),
   signifydGlow + autoPush (passive), actionsShelf (the shelf itself),
   and the popup-native email controls (templates, charge, order edit,
   submit proof) which keep their bespoke rich buttons. Anything not in
   SURFACES falls through to NO_SURFACES automatically. */

/** Every feature's display metadata + declared surfaces. */
export const FEATURE_REGISTRY = FEATURE_FLAGS.map((f) => ({
  ...f, // key, section, name, desc, icon
  surfaces: SURFACES[f.key] || NO_SURFACES,
}));

export function featureByKey(key) {
  return FEATURE_REGISTRY.find((f) => f.key === key) || null;
}

/** Features with a shelf action — rows for the per-page grid + shelf registration. */
export function shelfFeatures() {
  return FEATURE_REGISTRY.filter((f) => f.surfaces.shelf);
}

/** Features with a popup launcher. */
export function popupFeatures() {
  return FEATURE_REGISTRY.filter((f) => f.surfaces.popup);
}

/** Features with either surface — the ones whose row gets sub-controls. */
export function surfacedFeatures() {
  return FEATURE_REGISTRY.filter((f) => f.surfaces.popup || f.surfaces.shelf);
}

/** Every declared shelf action, flattened, tagged with its owning feature key.
 *  actions-shelf.jsx reads this to register standalone actions from data. */
export function shelfActionDefs() {
  const out = [];
  for (const f of FEATURE_REGISTRY) {
    const s = f.surfaces.shelf;
    if (!s) continue;
    for (const a of s.actions) {
      out.push({ ...a, key: f.key, pages: s.pages, global: s.global || null, dynamic: !!s.dynamic });
    }
  }
  return out;
}
