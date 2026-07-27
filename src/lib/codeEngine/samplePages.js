/* ───────────────────────────────────────────────────────────────
   samplePages — representative `page` fixtures for AUTHORING simulation.

   The custom-action editor runs in the Manage window, where there is no live
   CRM page. To let a rep see their blocks light up (dry) while writing, we
   feed simulateProgram a realistic sample `page` shaped like the one the
   campaign engine builds live ({ contact, contacts, count, tasks }). At real
   run time the shelf replaces this with runEngine(document) of the live page.

   Pure data — no DOM, storage, or chrome.
─────────────────────────────────────────────────────────────── */

import { normalizeEntryPoints } from '../customActionEntryPoints.js';
import { buildTaskListActionContext } from '../taskListActionContext.js';

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

const SAMPLE_ORDERS = Object.freeze([
  { number: '5063056', summary: 'Titleist Pro V1 Personalized Golf Balls - 2025 Model', date: '2026-04-24', revenue: 0.01, status: 'Complete' },
  { number: '5048594', summary: 'Titleist Pro V1 Personalized Golf Balls - 2025 Model', date: '2026-04-06', revenue: 70.94, status: 'Complete' },
  { number: '4861490', summary: 'Vice Drive Custom Logo Golf Balls', date: '2025-12-12', revenue: 234.5, status: 'Complete' },
]);

const SAMPLE_ITEMS = Object.freeze([
  { name: 'Titleist Pro V1 Personalized Golf Balls', quantity: 2, revenue: 70.95 },
  { name: 'Vice Drive Custom Logo Golf Balls', quantity: 1, revenue: 234.5 },
]);

const TASK_LIST_ENTRY_ALIASES = new Set([
  'task-list',
  'modal:task-list',
  '.gb-task-list-modal',
]);

function sampleTaskListData() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const future = (days) => {
    const date = new Date(today);
    date.setDate(date.getDate() + days);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  };
  const rows = [
    {
      id: 'sample-task-1',
      contact: 'Jordan Rivera',
      contactId: 'sample-contact-1',
      account: 'Fairway Supply Co',
      accountId: 'sample-account-1',
      due: future(20),
      dueDate: future(20),
      category: 'Follow Up',
      priority: 2,
      priorityLabel: 'Med',
      subject: 'Review seasonal order',
      status: 'New',
    },
    {
      id: 'sample-task-2',
      contact: 'Avery Buyer',
      contactId: 'sample-contact-2',
      account: 'Northwind Golf',
      accountId: 'sample-account-2',
      due: future(110),
      dueDate: future(110),
      category: 'Outbound Call',
      priority: 2,
      priorityLabel: 'Med',
      subject: 'Reorder check-in',
      status: 'New',
    },
  ];
  return buildTaskListActionContext({ rows, visibleRows: rows });
}

function withSampleEntryPoints(page, entryPoints) {
  const tokens = normalizeEntryPoints(entryPoints);
  if (!tokens.length) return page;
  const entries = [];
  const taskListToken = tokens.find((token) => TASK_LIST_ENTRY_ALIASES.has(token));
  if (taskListToken) {
    entries.push({
      id: 'task-list',
      label: 'My Tasks',
      token: taskListToken,
      data: sampleTaskListData(),
    });
  }
  for (const token of tokens) {
    if (TASK_LIST_ENTRY_ALIASES.has(token)) continue;
    entries.push({ id: `sample:${token}`, label: token, token, data: null });
  }
  return {
    ...page,
    entryPoints: entries,
    entryPoint: entries[0] || null,
  };
}

/** A representative `page` for the given authoring page type. */
export function samplePageFor(pageType, { entryPoints = [] } = {}) {
  const contact = { ...SAMPLE_CONTACT };
  const tasks = { open: SAMPLE_TASKS.open.map((t) => ({ ...t })), done: SAMPLE_TASKS.done.map((t) => ({ ...t })) };
  const orders = SAMPLE_ORDERS.map((order) => ({ ...order }));
  const items = SAMPLE_ITEMS.map((item) => ({ ...item }));
  const base = {
    contact,
    contacts: [contact],
    count: 1,
    tasks,
    account: { name: 'Fairway Supply Co', type: 'Wholesale' },
    orders,
    items,
  };

  let page = base;
  if (pageType === 'order') {
    // Order pages carry sparse contact data + no contact tasks.
    page = { ...base, contact, tasks: { open: [], done: [] }, order: { id: '100245', total: 1240.5, status: 'In production' } };
  } else if (pageType === 'account') {
    page = { ...base, account: { name: 'Fairway Supply Co', type: 'Wholesale' } };
  }
  // contact + custom → the contact-shaped sample (custom actions run anywhere,
  // but the sample gives them something concrete to simulate against).
  return withSampleEntryPoints(page, entryPoints);
}
