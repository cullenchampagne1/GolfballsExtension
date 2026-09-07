/* Template CC list — the comma-delimited addresses a template copies on every
   send.

   Stored on the template as a raw string (exactly what the rep typed) and
   parsed at the delivery boundary, so an in-progress "a@b.com, " never loses
   the trailing separator while it is being edited. Invalid entries are
   reported rather than silently dropped: a typo'd CC that vanishes without a
   word is the failure mode this module exists to prevent — the editor shows
   the rejected entries back to the rep.

   The address rule and the 320-char ceiling deliberately mirror
   gbValidateEmailPayload's `from`/`to` checks in background.js, so an address
   this module accepts is one the worker's payload validator also accepts. */

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same ceiling background.js applies to `from` and `to`. */
export const CC_ADDRESS_MAX = 320;

/** Per-email CC ceiling. The PA flow fans these into one send action, so this
 *  is a guard against a pasted contact dump, not a protocol limit. */
export const CC_MAX = 25;

/** Split on comma, semicolon, or newline — reps paste from Outlook and the CRM
 *  alike, and both use their own separator. */
function entries(raw) {
  return typeof raw === 'string' ? raw.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean) : [];
}

/**
 * Partition a raw CC string into the addresses that will actually be sent and
 * the ones that won't.
 *
 * @param {string} raw Comma/semicolon/newline delimited addresses.
 * @returns {{ valid: string[], invalid: string[], truncated: number }}
 *   `valid` is de-duplicated case-insensitively and capped at CC_MAX;
 *   `invalid` holds entries that failed the address check (shown in the
 *   editor); `truncated` counts valid addresses dropped by the cap.
 */
export function parseCcEntries(raw) {
  const valid = [];
  const invalid = [];
  const seen = new Set();
  let truncated = 0;
  for (const address of entries(raw)) {
    if (address.length > CC_ADDRESS_MAX || !ADDRESS.test(address)) {
      invalid.push(address);
      continue;
    }
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (valid.length >= CC_MAX) {
      truncated += 1;
      continue;
    }
    valid.push(address);
  }
  return { valid, invalid, truncated };
}

/** The sendable addresses only — what the delivery boundary puts on the wire. */
export function parseCcList(raw) {
  return parseCcEntries(raw).valid;
}

/** Normalize for storage: what the rep typed, trimmed. Empty → undefined so an
 *  untouched template never grows the key (and never diffs into a share). */
export function normalizeCcField(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  return text || undefined;
}
