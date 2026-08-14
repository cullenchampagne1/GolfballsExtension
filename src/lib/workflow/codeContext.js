/* ───────────────────────────────────────────────────────────────
   workflow/codeContext — hydrate one code-workflow audience record.

   CRM Search / Task List intentionally hand the manager a compact record
   pointer.  Before code runs, fetch that record's page once and build the
   same typed page-engine model used everywhere else.  This is the boundary
   that makes page.contact, page.tasks, helper DOM reads, and executor context
   all refer to the SAME audience member.
─────────────────────────────────────────────────────────────── */

import { shapeExtractedPage } from '../codeEngine/pageModel.js';

function text(value) {
  return value == null ? '' : String(value);
}

function idFromUrl(url, names) {
  const m = String(url || '').match(new RegExp(`[?&](?:${names})=(\\d+)`, 'i'));
  return m ? m[1] : '';
}

/** Resolve the concrete CRM ids used by workflow writers.
 *
 * Account audience rows intentionally have no contact id of their own. The
 * unified account schema supplies `ids.contact` from the first related
 * contact so contact-indexed CRM writes (tasks/notes) can still belong to the
 * account.
 */
export function resolveWorkflowRecordIds(contact = {}, data = {}) {
  return {
    contactId: text(
      contact.crmContactId
      || contact.contactId
      || data?.ids?.contact
      || idFromUrl(contact.contactUrl, 'customerID|customerId|id|contactId'),
    ).trim(),
    accountId: text(
      data?.ids?.account
      || contact.accountId
      || idFromUrl(contact.contactUrl, 'accountID|accountId'),
    ).trim(),
  };
}

/** Build the serializable page.* value consumed by the code sandbox. */
export function workflowPageFromContext(context, audience = []) {
  const ctx = context || {};
  const source = ctx.contact || {};
  const {
    pageEngineSnapshot: _pageEngineSnapshot,
    pageEngineIdentity: _pageEngineIdentity,
    ...publicSource
  } = source;
  const data = ctx.data || {};
  const extracted = data.contact || {};
  const contact = {
    ...extracted,
    ...publicSource,
    contactId: text(ctx.contactId || source.contactId || source.crmContactId || data.ids?.contact || extracted.id),
    accountId: text(ctx.accountId || source.accountId || data.ids?.account || extracted.accountId),
    contactName: text(ctx.contactName || source.contactName || source.name),
    firstName: text(ctx.firstName || source.firstName || extracted.firstName),
    lastName: text(ctx.lastName || source.lastName || extracted.lastName),
    email: text(ctx.email || source.email || extracted.email),
    phone: text(ctx.phone || source.phone || extracted.phone),
  };
  if (!contact.name) contact.name = contact.contactName;

  const sourceKey = source._key || source.contactId || source.contactUrl;
  const contacts = (Array.isArray(audience) ? audience : []).map((row) => {
    const rowKey = row?._key || row?.contactId || row?.contactUrl;
    const {
      pageEngineSnapshot: _rowSnapshot,
      pageEngineIdentity: _rowIdentity,
      ...publicRow
    } = row || {};
    return sourceKey && rowKey === sourceKey ? { ...publicRow, ...contact } : publicRow;
  });

  // Preserve the same full schema model Action Shelf custom actions receive.
  // Only the primary contact + execution audience are workflow-specific.
  return shapeExtractedPage(data, { contact, contacts });
}

/**
 * Fetch and parse one audience record.
 *
 * `buildContext` is injectable for integration tests. A real record URL that
 * cannot be fetched fails closed: running conditions or writes against a
 * partial/wrong record would be more dangerous than skipping it.
 */
export async function hydrateWorkflowContact(contact, audience, deps = {}) {
  // Keep the heavy page-engine/browser parser behind the production path.
  // Tests and alternate hosts can inject a context builder without importing
  // browser-only schema/catalog modules into Node.
  const makeContext = deps.buildContext
    || (await import('./context.js')).buildContactContext;
  const context = await makeContext(contact, deps);
  if (contact?.contactUrl && context?.error) {
    throw new Error(`Could not load ${contact.contactName || contact.name || 'workflow record'}: ${context.error}`);
  }
  const page = workflowPageFromContext(context, audience);
  if (deps.hydrateOpportunities) {
    const hydrate = deps.hydrateOpportunityRows
      || (await import('../crmOpportunities.js')).hydrateOpportunityRows;
    page.opportunities = await hydrate(
      Array.isArray(page.opportunities) ? page.opportunities : [],
      deps.opportunityOptions || {},
    );
  }
  return {
    context,
    page,
  };
}
