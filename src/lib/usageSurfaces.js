/**
 * usageSurfaces.js — the names the Toolkit Console's Adoption block reports.
 *
 * A surface is one thing a user OPENS. The floating-modal mount point only
 * knows an implementation id such as `__gb-csm`, so the human name lives
 * here, next to the code that owns those ids, rather than
 * in the backend where a renamed host id would silently start reporting a
 * surface nobody recognizes.
 *
 * An unknown id is NOT dropped. It reports under its raw id, which shows up in
 * the Adoption block as an obviously-unnamed row — a prompt to add it here,
 * instead of a surface that quietly never appears.
 */

/** Floating modal host element id → display name. */
export const MODAL_SURFACES = {
  '__gb-csm': 'CRM Search',
  '__gb-ccm': 'Create Contact',
  '__gb-cl-modal': 'Call Log',
  '__gb-qt-modal': 'Quick Task',
  '__gb-tl': 'Task List',
  '__gb-wl': 'Watch List',
  '__gb-spm': 'Submit Proof',
  '__gb-imp': 'Image Preview',
  '__gb-notif': 'Notifications',
  '__gb-email-preview': 'Email Preview',
  '__gb-text-preview': 'Text Preview',
  '__gb-gift-catalog': 'Gifting Catalog',
  '__gb-margin-calc': 'Margin Calculator',
  '__gb-mockup-studio': 'Mockup Studio',
  '__gb-order-calendar': 'Order Calendar',
  '__gb-workflow-manager': 'Workflow Manager',
  '__gb-quick-order-note-modal': 'Quick Order Note',
  '__gb-actions-shelf': 'Actions Shelf',
};

/**
 * Resolve one modal host id to its display name, falling back to the id.
 */
export function surfaceName(id) {
  const key = String(id || '').trim();
  if (!key) return 'Unknown';
  return MODAL_SURFACES[key] || key;
}
