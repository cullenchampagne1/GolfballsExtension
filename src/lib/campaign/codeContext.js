/* ───────────────────────────────────────────────────────────────
   campaign/codeContext — hydrate one code-campaign audience record.

   CRM Search / Task List intentionally hand the manager a compact record
   pointer.  Before code runs, fetch that record's page once and build the
   same typed page-engine model used everywhere else.  This is the boundary
   that makes page.contact, page.tasks, helper DOM reads, and executor context
   all refer to the SAME audience member.
─────────────────────────────────────────────────────────────── */

function text(value) {
  return value == null ? '' : String(value);
}

function idFromUrl(url, names) {
  const m = String(url || '').match(new RegExp(`[?&](?:${names})=(\\d+)`, 'i'));
  return m ? m[1] : '';
}

/** Resolve the concrete CRM ids used by campaign writers.
 *
 * Account audience rows intentionally have no contact id of their own. The
 * unified account schema supplies `ids.contact` from the first related
 * contact so contact-indexed CRM writes (tasks/notes) can still belong to the
 * account.
 */
export function resolveCampaignRecordIds(contact = {}, data = {}) {
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
export function campaignPageFromContext(context, audience = []) {
  const ctx = context || {};
  const source = ctx.contact || {};
  const data = ctx.data || {};
  const extracted = data.contact || {};
  const contact = {
    ...extracted,
    ...source,
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
    return sourceKey && rowKey === sourceKey ? { ...row, ...contact } : row;
  });

  // Preserve the entire parsed schema model instead of maintaining a second,
  // lossy campaign-specific field list. `contact`, `contacts`, and `tasks`
  // have campaign control semantics, so they are deliberately overlaid below;
  // an account page's own contacts table remains available as
  // `page.relatedContacts`.
  const {
    contact: _recordContact,
    contacts: relatedContacts = [],
    tasks: _recordTasks,
    ...record
  } = data;

  return {
    ...record,
    contact,
    contacts,
    count: contacts.length,
    relatedContacts: Array.isArray(relatedContacts) ? relatedContacts : [],
    tasks: data.tasks || { open: [], done: [] },
  };
}

/**
 * Fetch and parse one audience record.
 *
 * `buildContext` is injectable for integration tests. A real record URL that
 * cannot be fetched fails closed: running conditions or writes against a
 * partial/wrong record would be more dangerous than skipping it.
 */
export async function hydrateCampaignContact(contact, audience, deps = {}) {
  // Keep the heavy page-engine/browser parser behind the production path.
  // Tests and alternate hosts can inject a context builder without importing
  // browser-only schema/catalog modules into Node.
  const makeContext = deps.buildContext
    || (await import('./context.js')).buildContactContext;
  const context = await makeContext(contact, deps);
  if (contact?.contactUrl && context?.error) {
    throw new Error(`Could not load ${contact.contactName || contact.name || 'campaign record'}: ${context.error}`);
  }
  return {
    context,
    page: campaignPageFromContext(context, audience),
  };
}
