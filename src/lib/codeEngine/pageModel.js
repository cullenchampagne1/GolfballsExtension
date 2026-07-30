/* ───────────────────────────────────────────────────────────────
   codeEngine/pageModel — one page.* contract for every code surface.

   The page engine extracts a rich record model (orders, items, activities,
   proofs, stats, account, ids, and more). Workflows and Action Shelf custom
   actions both consume that same model, with three controlled overlays:
     • `contact` is the writable primary-record view,
     • `contacts` is the current execution audience,
     • `tasks` receives the code engine's completion controls at run time.

   Everything else must pass through untouched. Keeping that rule here avoids
   another lossy surface-specific whitelist silently dropping page.orders.
─────────────────────────────────────────────────────────────── */

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Shape a page-engine result or its `.data` payload into the serializable
 * page.* model consumed by simulateProgram.
 *
 * @param {object} extracted  runEngine(document) result OR extracted data
 * @param {object} overrides  optional `{ contact, contacts }`
 */
export function shapeExtractedPage(extracted, overrides = {}) {
  const wrapped = object(extracted);
  const data = object(wrapped.data || wrapped);
  const recordContact = object(data.contact);
  const contactOverride = object(overrides.contact);
  const contact = { ...recordContact, ...contactOverride };
  const hasContact = Object.keys(contact).length > 0;
  const relatedContacts = Array.isArray(data.contacts) ? data.contacts : [];
  const contacts = Array.isArray(overrides.contacts)
    ? overrides.contacts
    : (hasContact ? [contact] : []);

  const {
    contact: _recordContact,
    contacts: _recordContacts,
    tasks: _recordTasks,
    ...record
  } = data;

  return {
    ...record,
    contact,
    contacts,
    count: contacts.length,
    relatedContacts,
    tasks: data.tasks || { open: [], done: [] },
  };
}

export default shapeExtractedPage;
