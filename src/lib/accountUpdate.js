/* ───────────────────────────────────────────────────────────────
   accountUpdate.js — pure payload/response helpers for the CRM
   Account/UpdateFromContactPage write.

   The CRM has no working Account/Get.ajax, so the account editor
   can't read-merge the way the contact editor does. Instead the full
   DTO is reconstructed from the live account form (every key is a
   readable host input — verified live, missing:[]) and the user's
   edits are overlaid on top. This is a FULL-replacement payload:
   every key is sent every save, captured from a real native save in
   generate_proposal.har.

   Kept here (a plain module, no JSX) so the payload construction and
   the CRM's HasError/ErrorFields response contract are unit-testable
   without importing the React detail bundle.
─────────────────────────────────────────────────────────────── */

/** DTO keys, in the order the native page sends them. */
export const ACCOUNT_DTO_KEYS = [
  'AccountID', 'Name', 'AccountWebAddress', 'MainAddress', 'MainCity',
  'MainPostal', 'MainState', 'MainCountry', 'ApprovedDate', 'CreditRequirements',
  'LinkedInURL', 'Context', 'CreatedByAsName', 'CreatedDate', 'TerritoryID',
  'ModifiedDate', 'PartnerCampaignID', 'SalesTaxExempt1', 'Industry',
  'SubIndustry', 'EmployeeRange', 'EstimatedRevenue',
];

/** DTO key → host input id where they differ. The account context
 *  textarea is #AccountContext but the payload key is `Context`. */
export const ACCOUNT_DTO_ID_ALIAS = { Context: 'AccountContext' };

/**
 * Build the full account payload. `edits` is a partial map keyed by
 * DTO name; `readEl(id)` returns the current value of a host field by
 * id (returning '' when absent). Un-edited keys are read back from the
 * form so nothing is blanked; edited keys win. `null`/`undefined` edit
 * values are coerced to '' to match the native empty-string convention.
 */
export function buildAccountPayload(edits = {}, readEl = () => '') {
  const has = (k) => Object.prototype.hasOwnProperty.call(edits, k);
  const payload = {};
  for (const key of ACCOUNT_DTO_KEYS) {
    if (has(key)) {
      payload[key] = edits[key] == null ? '' : String(edits[key]);
    } else {
      const id = ACCOUNT_DTO_ID_ALIAS[key] || key;
      const v = readEl(id);
      payload[key] = v == null ? '' : String(v);
    }
  }
  return payload;
}

/** Absolute URL for the update call (JSON arg in the query string). */
export function accountUpdateUrl(origin, payload) {
  return `${origin}/golfballs/crm/Admin/Account/UpdateFromContactPage.ajax?${encodeURIComponent(JSON.stringify(payload))}`;
}

/**
 * Interpret the CRM's JSON response. Returns the parsed object on
 * success (or null for an empty body). Throws an Error carrying the
 * CRM's own ErrorMessage — with the offending ErrorFields appended —
 * when HasError is set, so the caller can toast exactly what the CRM
 * rejected (e.g. "Web Address is required. (AccountWebAddress)").
 */
export function checkAccountResponse(text) {
  let data = null;
  try { data = JSON.parse(text); } catch { return null; }  // empty/non-JSON body ⇒ treat as success
  if (data && data.HasError) {
    const fields = Array.isArray(data.ErrorFields) && data.ErrorFields.length
      ? ` (${data.ErrorFields.join(', ')})` : '';
    throw new Error(`${data.ErrorMessage || 'Account update failed'}${fields}`);
  }
  return data;
}
