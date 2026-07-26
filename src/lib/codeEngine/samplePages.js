/* ───────────────────────────────────────────────────────────────
   samplePages — representative `page` fixtures for AUTHORING simulation.

   The custom-action editor runs in the Manage window, where there is no live
   CRM page. To let a rep see their blocks light up (dry) while writing, we
   feed simulateProgram a realistic sample `page` shaped like the one the
   campaign engine builds live ({ contact, contacts, count, tasks }). At real
   run time the shelf replaces this with runEngine(document) of the live page.

   Pure data — no DOM, storage, or chrome.
─────────────────────────────────────────────────────────────── */

const SAMPLE_CONTACT = Object.freeze({
  firstName: 'Jordan',
  middleInitial: '',
  lastName: 'Rivera',
  jobTitle: 'Buyer',
  companyName: 'Fairway Supply Co',
  email: 'jordan@fairwaysupply.com',
  phone: '555-0142',
  zipCode: '90210',
  state: 'CA',
  country: 'US',
});

const SAMPLE_TASKS = Object.freeze({
  open: [
    { id: 't-open-1', subject: 'Send updated quote', category: 'Sales', priority: 'High', dueDate: '2026-08-01' },
    { id: 't-open-2', subject: 'Follow up on proof approval', category: 'Sales', priority: 'Normal', dueDate: '2026-08-05' },
  ],
  done: [
    { id: 't-done-1', subject: 'Intro call', category: 'Sales', priority: 'Normal', dueDate: '2026-07-20' },
  ],
});

/** A representative `page` for the given authoring page type. */
export function samplePageFor(pageType) {
  const contact = { ...SAMPLE_CONTACT };
  const tasks = { open: SAMPLE_TASKS.open.map((t) => ({ ...t })), done: SAMPLE_TASKS.done.map((t) => ({ ...t })) };
  const base = { contact, contacts: [contact], count: 1, tasks };

  if (pageType === 'order') {
    // Order pages carry sparse contact data + no contact tasks.
    return { ...base, contact, tasks: { open: [], done: [] }, order: { id: '100245', total: 1240.5, status: 'In production' } };
  }
  if (pageType === 'account') {
    return { ...base, account: { name: 'Fairway Supply Co', type: 'Wholesale' } };
  }
  // contact + custom → the contact-shaped sample (custom actions run anywhere,
  // but the sample gives them something concrete to simulate against).
  return base;
}
