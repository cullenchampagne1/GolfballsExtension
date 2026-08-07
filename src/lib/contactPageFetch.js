/* ───────────────────────────────────────────────────────────────
   contactPageFetch.js — one rule for "did the contact page load?"

   A CRM row is a pointer, not a record: every template variable a send
   renders comes from the contact page fetched at run time. When that fetch
   fails, the resolver returns no values, each variable falls through to its
   smart fallback, and the email goes out looking personalized while carrying
   nothing but defaults — to a recipient address the row happened to carry.
   That is worse than not sending: a fallback blast is indistinguishable from
   a real one until the replies come back.

   So a failed fetch errors the row out instead. Both send paths ask these
   helpers rather than each deciding for themselves:
     • EmailRunner's per-contact loop (throws → the row shows the error)
     • the workflow engine's email step, via the context builder's `error`

   IMPORTED rows are the one exemption. They carry their own field values
   from the CSV and directContactVariables() renders them without a page, so
   the fetch is enrichment there, not the source of truth.
─────────────────────────────────────────────────────────────── */

/**
 * Inspect a raw `fetchRaw` reply for a contact page.
 * @returns {string} '' when the page is usable, else the reason to fail the row.
 */
export function contactPageFetchError(fetched, contact = {}) {
  if (contact?.imported) return '';
  if (!fetched) return 'Background not reachable (extension reloaded?)';
  if (!fetched.ok || typeof fetched.text !== 'string') {
    return fetched.error || `Fetch failed (HTTP ${fetched.status || '?'})`;
  }
  return '';
}

/**
 * The same rule applied to an already-built workflow contact context, whose
 * `error` field records whatever went wrong while loading the page.
 * @returns {string} '' when the send may proceed, else the reason to fail it.
 */
export function contactDataUnavailable(ctx = {}) {
  if (!ctx?.error || ctx?.contact?.imported) return '';
  return String(ctx.error);
}
