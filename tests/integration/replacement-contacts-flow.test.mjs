/** Replacement Contacts — the whole queue path, wired end to end.
 *
 * The REAL task-list parser reads a real-shaped Page=349 response, the REAL
 * queue model decides which rows are the bounce queue and what each one is,
 * and the REAL CRM writer completes the task behind a closed row. Only the
 * network is stubbed, because that is the one place this feature touches the
 * outside world.
 *
 * The rule under test is the money-critical one: a row says "Replaced" only
 * when the CRM task actually completed. If the write fails and the row closes
 * anyway, the rep loses the work — the bounce sits open in the CRM while this
 * page claims it is handled.
 */
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.DOMParser = dom.window.DOMParser;

const { parseTasksFromHtml } = await import('../../src/lib/taskListModel.js');
const { completeTaskById } = await import('../../src/lib/crmTasks.js');
const {
  buildReplacementRecords, closeReplacementTasks, excludeReplacementTasks,
  replacementKpis, selectReplacementTasks,
} = await import('../../src/lib/replacementContacts.js');

const TODAY = new Date(2026, 7, 5);
const mdy = (offset) => {
  const d = new Date(2026, 7, 5 + offset);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};

/* One native Page=349 row, in the shape the CRM actually renders. */
const ROW = (id, { account, contact, cust, due, subject }) => `
  <tr id="taskrow_${id}">
    <td><a href="/Default.aspx?Page=271&accountID=7${id}">${account}</a></td>
    <td><a href="/Default.aspx?Page=240&customerID=${cust}">${contact}</a></td>
    <td>${due}</td><td>Email</td><td>2Med</td><td>${subject}</td>
    <td><input id="status_${id}" value="New"></td>
  </tr>`;

const TASK_PAGE = `<table id="TableTasks"><tbody>${[
  ROW('501', { account: 'Cypress Country Club', contact: 'Renee Guidry', cust: '3201', due: mdy(-9), subject: 'Investigate bounced contact' }),
  ROW('502', { account: 'Delta Boosters', contact: 'Talia Landry', cust: '3202', due: mdy(-2), subject: 'Replacement contact needed' }),
  ROW('503', { account: 'Pelican Marine', contact: 'Kirk Savoie', cust: '3203', due: mdy(4), subject: 'Quarterly check-in' }),
  ROW('504', { account: 'Bayou Logistics', contact: 'Dax Fontenot', cust: '3204', due: mdy(1), subject: 'Investigate bounced contact' }),
].join('')}</tbody></table>`;

/* Contact/Get.ajax answers, keyed by customerID — the bounced address is here,
   not on the task row. */
const CONTACTS = {
  3201: { email: 'rguidry@cypresscc.com', jobTitle: 'Events Manager' },
  3202: { email: 'talialandry88@gmail.com', jobTitle: 'Committee Chair' },
  3204: { email: 'orders@bayoulogistics.com', jobTitle: 'Purchasing' },
};

/** A fake CRM: the task page, contact lookups, and the task write endpoints. */
function fakeCrm({ failTaskIds = new Set() } = {}) {
  const writes = [];
  const tasks = { 501: 1, 502: 1, 504: 1 };      // taskId → taskStatusID
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.includes('Page=349')) {
      return { ok: true, status: 200, text: async () => TASK_PAGE };
    }
    if (href.includes('/Contact/Get.ajax?')) {
      const id = href.split('?')[1];
      return { ok: true, status: 200, text: async () => JSON.stringify(CONTACTS[id] || { email: '' }) };
    }
    if (href.includes('/Task/Get.ajax?')) {
      const id = href.split('?')[1];
      return {
        ok: true,
        status: 200,
        json: async () => ({
          TaskId: Number(id), Subject: 'Investigate bounced contact', Description: '',
          LiveDate: mdy(-23), DueDate: mdy(-9), taskCategoryID: 4,
          taskStatusID: tasks[id] ?? 1, contactID: 3201, employeeID: 88, Priority: 2,
        }),
      };
    }
    if (href.includes('/Task/Update.ajax?')) {
      const payload = JSON.parse(decodeURIComponent(href.split('?')[1]));
      if (failTaskIds.has(String(payload.TaskId))) return { ok: false, status: 500 };
      writes.push(payload);
      tasks[payload.TaskId] = payload.taskStatusID;
      return { ok: true, status: 200, text: async () => 'ok' };
    }
    throw new Error(`unexpected request: ${href}`);
  };
  return { fetchImpl, writes, tasks };
}

/** What the page does on load: fetch, parse, keep only the bounce tasks. */
async function loadQueue() {
  const res = await fetch('https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=349', { credentials: 'include' });
  return selectReplacementTasks(parseTasksFromHtml(await res.text()));
}

/** What the page does next: resolve each contact's address. */
async function hydrate(tasks) {
  const out = {};
  for (const t of tasks) {
    const id = (t.contactUrl.match(/customerID=(\d+)/) || [])[1];
    if (!id) continue;
    const res = await fetch(`https://api.golfballs.com/golfballs/crm/Admin/Contact/Get.ajax?${id}`, { credentials: 'include' });
    out[id] = JSON.parse(await res.text());
  }
  return out;
}

describe('replacement contacts flow', () => {
  let crm;
  before(() => { globalThis.DOMParser = dom.window.DOMParser; });
  beforeEach(() => { crm = fakeCrm(); globalThis.fetch = (url) => crm.fetchImpl(url); });

  it('takes the bounce tasks out of the CRM task list and leaves rep work behind', async () => {
    const all = parseTasksFromHtml(TASK_PAGE);
    assert.equal(all.length, 4);
    assert.deepEqual(selectReplacementTasks(all).map((t) => t.id), ['501', '502', '504']);
    assert.deepEqual(excludeReplacementTasks(all).map((t) => t.subject), ['Quarterly check-in']);
  });

  it('builds a triaged queue from the task rows plus the contact lookups', async () => {
    const tasks = await loadQueue();
    const records = buildReplacementRecords(tasks, { hydrated: await hydrate(tasks), today: TODAY });

    assert.deepEqual(records.map((r) => r.contact), ['Renee Guidry', 'Talia Landry', 'Dax Fontenot']);
    assert.deepEqual(records.map((r) => r.dtype), ['business', 'personal', 'role']);
    assert.deepEqual(records.map((r) => r.searchable), [true, false, true]);
    assert.equal(records[0].email, 'rguidry@cypresscc.com');
    assert.equal(records[0].domain, 'cypresscc.com');
    assert.equal(records[1].dueBucket, 'overdue');

    const k = replacementKpis(records);
    assert.equal(k.open, 3);
    assert.equal(k.searchable, 2);      // the two company domains are workable
    assert.equal(k.deadEnd, 1);         // the gmail bounce is not
    assert.equal(k.overdue, 2);
  });

  it('completes the underlying CRM task when a row is marked replaced', async () => {
    const tasks = await loadQueue();
    const { done, failed } = await closeReplacementTasks(['501'], { complete: completeTaskById });

    assert.deepEqual(done, ['501']);
    assert.deepEqual(failed, []);
    assert.equal(crm.writes.length, 1);
    assert.equal(crm.writes[0].TaskId, 501);
    assert.equal(crm.writes[0].taskStatusID, 3, 'the CRM must receive the completed status');
    // The row leaves the queue on the next load because its task is done.
    assert.equal(crm.tasks[501], 3);
    assert.equal(tasks.length, 3);
  });

  it('archiving completes the task too — a closed row never leaves one open', async () => {
    const { done } = await closeReplacementTasks(['502', '504'], { complete: completeTaskById });
    assert.deepEqual(done, ['502', '504']);
    assert.deepEqual(crm.writes.map((w) => [w.TaskId, w.taskStatusID]), [[502, 3], [504, 3]]);
  });

  it('leaves a row open when the CRM refuses the write, instead of claiming it is handled', async () => {
    crm = fakeCrm({ failTaskIds: new Set(['502']) });
    globalThis.fetch = (url) => crm.fetchImpl(url);

    const phases = [];
    const { done, failed } = await closeReplacementTasks(['501', '502', '504'], {
      complete: completeTaskById,
      onRow: (id, patch) => phases.push([id, patch.phase]),
    });

    assert.deepEqual(done, ['501', '504'], 'only the writes that landed may close');
    assert.deepEqual(failed.map((f) => f.id), ['502']);
    // The failure does not stop the rest of the batch.
    assert.deepEqual(crm.writes.map((w) => w.TaskId), [501, 504]);
    assert.equal(crm.tasks[502], 1, 'the refused task is still open in the CRM');
    assert.deepEqual(phases.filter(([id]) => id === '502').map(([, p]) => p), ['running', 'error']);
  });

  it('records only the rows that closed, so the page and the CRM agree', async () => {
    crm = fakeCrm({ failTaskIds: new Set(['502']) });
    globalThis.fetch = (url) => crm.fetchImpl(url);

    const tasks = await loadQueue();
    const hydrated = await hydrate(tasks);
    const { done } = await closeReplacementTasks(['501', '502'], { complete: completeTaskById });
    const states = Object.fromEntries(done.map((id) => [id, { status: 'complete', updatedAt: TODAY.getTime() }]));
    const records = buildReplacementRecords(tasks, { hydrated, states, today: TODAY });

    const byId = Object.fromEntries(records.map((r) => [r.id, r.status]));
    assert.equal(byId['501'], 'complete');
    assert.equal(byId['502'], 'pending', 'the refused row must still read as open work');
    assert.equal(replacementKpis(records).open, 2);
  });
});
