/* ───────────────────────────────────────────────────────────────
   crmTasks.js — complete a contact's open CRM tasks.

   Used by the Campaign Manager's "Complete all open tasks" /
   "Complete latest open task" step modes. Reuses the same endpoints
   the Task List modal uses:
     • Page=349        — the rendered task list (rows id="taskrow_<id>")
     • Task/Get.ajax   — the task's current payload
     • Task/Update.ajax — write it back with taskStatusID = 3 (complete)

   Runs in the content-script realm (the campaign surface mounts on the
   CRM domain), so `fetch(..., { credentials:'include' })` carries the
   shared session cookies.
─────────────────────────────────────────────────────────────── */

import { API } from './constants.js';

const BASE = API.CRM;
const TASKS_ENDPOINT = `${BASE}/golfballs/adminnew/Default.aspx?Page=349`;

function contactIdFromHref(href) {
  const m = String(href || '').match(/[?&](?:customerID|customerId|id)=(\d+)/i);
  return m ? m[1] : '';
}

/* Fetch + parse the task list, returning this contact's OPEN tasks
   (id + due date + subject). Mirrors TaskList's parseTasksFromHtml but
   trimmed to what completion needs. */
export async function fetchOpenTasksForContact(contactId) {
  const res = await fetch(TASKS_ENDPOINT, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  doc.querySelectorAll('tr[id^="taskrow_"]').forEach((row) => {
    if (row.id.includes('taskrow2_')) return;
    const id = row.id.replace('taskrow_', '');
    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length < 6) return;
    const conHref = cells[1].querySelector('a')?.getAttribute('href') || '';
    if (String(contactIdFromHref(conHref)) !== String(contactId)) return;
    const actionCell = cells[6] || cells[cells.length - 1];
    const statusVal = actionCell?.querySelector('input[id^="status_"]')?.value || '';
    if (statusVal.toLowerCase().includes('complete')) return; // already done
    out.push({ id, dueDate: new Date((cells[2]?.textContent || '').trim()), subject: (cells[5]?.textContent || '').trim() });
  });
  return out;
}

async function fetchTaskRaw(id) {
  const r = await fetch(`${BASE}/golfballs/crm/Admin/Task/Get.ajax?${id}`, { credentials: 'include' });
  return r.json();
}

/* Mark one task complete — the legacy tlCompleteTask payload shape
   (TaskId numeric, taskStatusID 3). */
export async function completeTaskById(id) {
  const t = await fetchTaskRaw(id);
  const params = {
    TaskId: Number(t.TaskId),
    Subject: t.Subject,
    Description: t.Description,
    LiveDate: t.LiveDate,
    DueDate: t.DueDate,
    taskCategoryID: t.taskCategoryID,
    taskStatusID: 3,
    contactID: t.contactID,
    employeeID: t.employeeID,
    Priority: t.Priority,
  };
  await fetch(`${BASE}/golfballs/crm/Admin/Task/Update.ajax?${encodeURIComponent(JSON.stringify(params))}`, { credentials: 'include' });
}

/**
 * Complete a contact's open tasks.
 * @param contactId  the CRM contact id
 * @param mode       'completeAll' | 'completeLatest'  (latest = most-recent due date)
 * @returns { ok, detail? , error? }
 */
export async function completeContactTasks(contactId, { mode = 'completeAll' } = {}) {
  if (!contactId) return { ok: false, error: 'No contact id' };
  let tasks;
  try { tasks = await fetchOpenTasksForContact(contactId); }
  catch (e) { return { ok: false, error: `Couldn't load tasks (${e?.message || 'error'})` }; }
  if (!tasks.length) return { ok: true, detail: 'No open tasks' };

  const targets = mode === 'completeLatest'
    ? [tasks.slice().sort((a, b) => (b.dueDate - a.dueDate))[0]]
    : tasks;

  let done = 0;
  for (const t of targets) {
    try { await completeTaskById(t.id); done++; } catch { /* skip, keep going */ }
  }
  if (done === 0) return { ok: false, error: 'No tasks completed' };
  return { ok: true, detail: `Completed ${done} task${done === 1 ? '' : 's'}` };
}
