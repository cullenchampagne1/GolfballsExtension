/**
 * Pure builders for the `supportTicketCreate` background action, shared by the
 * Settings "Submit a Ticket" form (and available to any other surface).
 *
 * The service worker validates every field again before it hits the API, but
 * the idempotency key it demands is strict — `^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$`
 * — so a malformed key is a silent "Invalid support ticket" rejection. Keeping
 * key generation and payload shaping here makes both testable in isolation.
 */

/** The exact request-id contract the worker enforces (background.js). */
export const SUPPORT_TICKET_REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$/;

export const SUPPORT_TICKET_TITLE_MAX = 120;
export const SUPPORT_TICKET_DESCRIPTION_MAX = 2000;

/** Normalize a kind to the two the backend accepts, defaulting to 'bug'. */
export function normalizeSupportTicketKind(kind) {
  return kind === 'feature' ? 'feature' : 'bug';
}

/**
 * A fresh idempotency key guaranteed to satisfy SUPPORT_TICKET_REQUEST_ID_RE.
 * Prefers crypto.randomUUID (hyphens are allowed); falls back to time+random
 * base36 when it isn't available (older service-worker contexts).
 */
export function newSupportTicketRequestId(cryptoObj = globalThis.crypto) {
  try {
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
      return `st-${cryptoObj.randomUUID()}`;
    }
  } catch { /* fall through to the deterministic-length fallback */ }
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 12).padEnd(10, '0');
  return `st-${stamp}-${rand}`;
}

/**
 * Build the `supportTicketCreate` message payload from raw form fields. Trims
 * and length-caps the title/description exactly as the worker will, and stamps
 * a context object. Returns `{ payload, valid }` — `valid` is false when the
 * required fields are empty, so the caller can refuse to send.
 */
export function buildSupportTicketRequest({
  kind, title, description, extensionVersion = '', surface = 'settings-manage', requestId,
} = {}) {
  const cleanTitle = String(title ?? '').trim().replace(/\s+/g, ' ').slice(0, SUPPORT_TICKET_TITLE_MAX);
  const cleanDescription = String(description ?? '').trim().slice(0, SUPPORT_TICKET_DESCRIPTION_MAX);
  const payload = {
    requestId: requestId || newSupportTicketRequestId(),
    kind: normalizeSupportTicketKind(kind),
    title: cleanTitle,
    description: cleanDescription,
    context: {
      extension_version: String(extensionVersion || '').slice(0, 40),
      surface: String(surface || 'settings-manage').slice(0, 40),
    },
  };
  return { payload, valid: cleanTitle.length > 0 && cleanDescription.length > 0 };
}
