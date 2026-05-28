/* ───────────────────────────────────────────────────────────────
   lib/sender.js — canonical sender-account catalog.

   Power Automate's flow accepts a `from` per email. Templates store
   a slug (`senderAccount`) and a randomize flag; this module maps
   slug → domain, glues the per-rep local part on the front, and
   runs the per-send random pick.

   Two-piece address
   ──────────────────
   The DOMAIN (`golfballs.com` / `loyaltylogo.com`) is per-template
   — picked in the editor's Segmented sender pills.

   The LOCAL PART (`cullen` / `marcus` / …) is per-REP. Different
   reps run the same extension under their own mailbox, so the local
   part lives in `chrome.storage.local.devSettings['email.localPart']`
   and is glued on at send time.

     localPart + '@' + domain
     'cullen'  + '@' + 'golfballs.com'  →  cullen@golfballs.com

   One source of truth
   ────────────────────
     • TemplateEditor reads SENDER_OPTIONS for its picker UI
       (labels are the bare domain — the dev-setting local part is
       just chrome, not user-facing per template)
     • EmailRunner imports pickFromAddress() and passes the local
       part it reads via useDevSetting('email.localPart')
     • vanilla/main.js cannot import ESM — it inlines the same
       domains table and reads the local part from chrome.storage.

   Adding a sender = one entry here. The picker UI updates by
   re-render, the runtime resolution picks it up next send.
─────────────────────────────────────────────────────────────── */

/** Fallback local part when nothing is configured AND the registry
 *  default hasn't loaded yet. Matches the devSettings default at
 *  src/lib/devSettings.js → 'email.localPart'. */
export const DEFAULT_LOCAL_PART = 'cullen';

/** Per-sender domain. `id` is the slug we persist on the template;
 *  `label` shows in the editor's Segmented picker; `domain` is the
 *  right-hand side of the resulting From: address. */
export const SENDER_ACCOUNTS = [
  { id: 'golfballs',    label: 'golfballs.com',    domain: 'golfballs.com' },
  { id: 'loyaltylogo',  label: 'loyaltylogo.com',  domain: 'loyaltylogo.com'  },
];

/** Slug → domain lookup. Pre-built so the per-row pick is O(1). */
export const SENDER_DOMAIN_BY_ID = Object.fromEntries(
  SENDER_ACCOUNTS.map((s) => [s.id, s.domain]),
);

/** Default domain — used when a template carries a senderAccount
 *  slug that isn't in the catalog. Falls back to the first
 *  configured account rather than empty so the flow never gets a
 *  blank From: that the mail server would reject. */
export const DEFAULT_DOMAIN = SENDER_ACCOUNTS[0]?.domain || '';

/** Resolve a single sender id → outbound address using a local
 *  part. Unknown slugs fall through to the default domain. */
export function senderEmail(senderId, localPart) {
  const lp = (localPart && String(localPart).trim()) || DEFAULT_LOCAL_PART;
  const domain = SENDER_DOMAIN_BY_ID[senderId] || DEFAULT_DOMAIN;
  return `${lp}@${domain}`;
}

/**
 * pickFromAddress(template, localPart) → string
 *
 * Resolves the From: address for ONE outbound email. Call this
 * per-contact in a bulk blast so randomize=true varies between
 * contacts.
 *
 *   template.senderRandomize=true  → random pick from SENDER_ACCOUNTS
 *   template.senderAccount=<slug>  → look up slug in the catalog
 *   neither / unknown slug          → DEFAULT_DOMAIN
 *
 * `localPart` is the rep's mailbox name (devSetting 'email.localPart').
 * Pass the live value at the call site — passing nothing falls back
 * to the registry default. */
export function pickFromAddress(template, localPart) {
  if (!template) return senderEmail(SENDER_ACCOUNTS[0]?.id, localPart);
  if (template.senderRandomize) {
    const pool = SENDER_ACCOUNTS;
    if (!pool.length) return senderEmail(undefined, localPart);
    const idx = Math.floor(Math.random() * pool.length);
    return senderEmail(pool[idx].id, localPart);
  }
  return senderEmail(template.senderAccount, localPart);
}

/** The picker UI consumes this shape — id + label pairs only. The
 *  random pseudo-entry is added by TemplateEditor itself so the
 *  catalog stays a pure list of real senders. */
export const SENDER_OPTIONS = SENDER_ACCOUNTS.map((s) => ({ id: s.id, label: s.label }));
