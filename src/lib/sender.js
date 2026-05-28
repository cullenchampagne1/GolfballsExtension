/* ───────────────────────────────────────────────────────────────
   lib/sender.js — canonical sender-account catalog.

   The Power Automate flow accepts a `from` per email in its
   payload (see the JSON schema the user shared). Templates store
   only the sender SLUG (`senderAccount`) plus a `senderRandomize`
   flag; this module maps slug → address and runs the per-send
   random pick when randomize is on.

   One source of truth:
     • TemplateEditor reads SENDER_OPTIONS for its picker UI
     • EmailRunner imports pickFromAddress() to inject `from`
       into each per-contact payload (random pick fires anew per
       contact, so a 50-row blast with randomize=true varies)
     • vanilla/main.js cannot import ESM, so it carries an inlined
       copy of the same map — keep both in sync when adding senders

   Adding a sender = one entry here. The picker UI updates by
   re-render, the runtime resolution picks it up next send.
─────────────────────────────────────────────────────────────── */

/** Slug + label + outbound address. `id` is the slug we persist on
 *  the template; `label` shows in the editor's Segmented picker;
 *  `email` is the actual From: address the flow needs. */
export const SENDER_ACCOUNTS = [
  { id: 'golfballs',    label: 'golfballs.com',    email: 'orders@golfballs.com' },
  { id: 'prioritylogo', label: 'prioritylogo.com', email: 'orders@prioritylogo.com' },
];

/** Slug → address lookup. Pre-built so the per-row pick is O(1). */
export const SENDER_EMAIL_BY_ID = Object.fromEntries(
  SENDER_ACCOUNTS.map((s) => [s.id, s.email]),
);

/** Default address — used when a template carries a senderAccount
 *  slug that isn't in the catalog (e.g. someone deleted a sender
 *  but a template still references it). Falls back to the first
 *  configured account rather than empty so the flow never gets a
 *  blank From: that the mail server would reject. */
export const DEFAULT_SENDER_EMAIL = SENDER_ACCOUNTS[0]?.email || '';

/**
 * pickFromAddress(template) → string
 *
 * Resolves the From: address for ONE outbound email. Call this
 * per-contact in a bulk blast so randomize=true varies between
 * contacts.
 *
 *   template.senderRandomize=true  → random pick from SENDER_ACCOUNTS
 *   template.senderAccount=<slug>  → look up slug in the catalog
 *   neither / unknown slug          → DEFAULT_SENDER_EMAIL
 */
export function pickFromAddress(template) {
  if (!template) return DEFAULT_SENDER_EMAIL;
  if (template.senderRandomize) {
    const pool = SENDER_ACCOUNTS;
    if (!pool.length) return DEFAULT_SENDER_EMAIL;
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx].email;
  }
  return SENDER_EMAIL_BY_ID[template.senderAccount] || DEFAULT_SENDER_EMAIL;
}

/** The picker UI consumes this shape — id + label pairs only. The
 *  random pseudo-entry is added by TemplateEditor itself so the
 *  catalog stays a pure list of real senders. */
export const SENDER_OPTIONS = SENDER_ACCOUNTS.map((s) => ({ id: s.id, label: s.label }));
