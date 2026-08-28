/* ───────────────────────────────────────────────────────────────
   crmContact.js — pure contact-edit helpers + native CRM enums.

   Kept separate from the contact transport so the load-bearing,
   data-critical CustomData merge can be unit-tested with node --test.
─────────────────────────────────────────────────────────────── */

/* Native CRM enums for the contact edit modal (from the live ContactModal:
   ddlUserTypeId / ddContactUserContry option sets). */
export const CONTACT_USER_TYPE_OPTS = [
  { value: '0', label: 'Non-Customer' },
  { value: '1', label: 'Consumer' },
  { value: '2', label: 'Corporate' },
];

export const CONTACT_COUNTRY_OPTS = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'OTH', label: 'Other' },
];

/* Merge the three editable CustomData keys into the contact's existing blob,
   returning the JSON string the Contact/Update payload expects. Only
   LinkedInURL / Context / Archived are ever touched — every other key (notably
   the server-managed LastConversationDate / LastOrderDate) is preserved
   verbatim, so editing a contact can never wipe them. `current` may be the raw
   JSON string, a parsed object, or null. */
export function mergeContactCustomData(current, edits) {
  let cd = {};
  try { cd = current ? (typeof current === 'string' ? JSON.parse(current) : { ...current }) : {}; } catch (e) { cd = {}; }
  const has = (k) => Object.prototype.hasOwnProperty.call(edits || {}, k);
  if (has('LinkedInURL')) cd.LinkedInURL = edits.LinkedInURL || '';
  if (has('Context')) cd.Context = edits.Context || '';
  if (has('Archived')) cd.Archived = !!edits.Archived;
  return JSON.stringify(cd);
}
