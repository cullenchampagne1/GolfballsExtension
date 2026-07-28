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

function numericId(value, label) {
  const id = String(value == null ? '' : value).trim();
  if (!/^\d{1,12}$/.test(id) || Number(id) <= 0) throw new Error(`Invalid ${label}`);
  return id;
}

function contactIdFromHref(href) {
  const m = String(href || '').match(/[?&](?:customerID|customerId|id)=(\d+)/i);
  return m ? m[1] : '';
}

/* Fetch + parse the task list, returning this contact's OPEN tasks
   (id + due date + subject). Mirrors TaskList's parseTasksFromHtml but
   trimmed to what completion needs. */
export async function fetchOpenTasksForContact(contactId) {
  const safeContactId = numericId(contactId, 'contact ID');
  const res = await fetch(TASKS_ENDPOINT, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (html.length > 5_000_000) throw new Error('Task list response exceeds 5 MB');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  doc.querySelectorAll('tr[id^="taskrow_"]').forEach((row) => {
    if (row.id.includes('taskrow2_')) return;
    const id = row.id.replace('taskrow_', '');
    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length < 6) return;
    const conHref = cells[1].querySelector('a')?.getAttribute('href') || '';
    if (String(contactIdFromHref(conHref)) !== safeContactId) return;
    const actionCell = cells[6] || cells[cells.length - 1];
    const statusVal = actionCell?.querySelector('input[id^="status_"]')?.value || '';
    if (statusVal.toLowerCase().includes('complete')) return; // already done
    if (/^\d{1,12}$/.test(id) && out.length < 500) {
      out.push({ id, dueDate: new Date((cells[2]?.textContent || '').trim()), subject: (cells[5]?.textContent || '').trim().slice(0, 500) });
    }
  });
  return out;
}

async function fetchTaskRaw(id) {
  const safeId = numericId(id, 'task ID');
  const r = await fetch(`${BASE}/golfballs/crm/Admin/Task/Get.ajax?${safeId}`, { credentials: 'include' });
  if (!r.ok) throw new Error(`Task lookup returned HTTP ${r.status}`);
  return r.json();
}

function formatTaskDate(value, label) {
  let date;
  if (value instanceof Date) {
    date = new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  } else {
    const raw = String(value ?? '').trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (iso) date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
    else if (mdy) date = new Date(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]), 12);
    else date = new Date(raw);
  }
  if (!date || Number.isNaN(date.getTime())) throw new Error(`Invalid task ${label}`);
  return [
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    date.getFullYear(),
  ].join('/');
}

function taskPriority(value) {
  const aliases = { high: 1, med: 2, medium: 2, normal: 2, low: 3 };
  const normalized = typeof value === 'string'
    ? (aliases[value.toLowerCase().trim()] ?? Number(value))
    : Number(value);
  if (![1, 2, 3].includes(normalized)) throw new Error('Invalid task priority');
  return String(normalized);
}

/**
 * Update approved mutable fields on one existing CRM task. The current task is
 * fetched first and round-tripped so fields the action did not touch survive.
 * Campaigns and custom actions share this writer through the common executor.
 */
export async function updateTaskById(id, fields = {}) {
  const safeId = numericId(id, 'task ID');
  const allowed = new Set([
    'subject', 'description', 'liveDate', 'dueDate', 'categoryId', 'priority',
  ]);
  const changes = Object.entries(fields || {})
    .filter(([key]) => allowed.has(key));
  if (!changes.length) throw new Error('Task update has no supported fields');

  const task = await fetchTaskRaw(safeId);
  const params = {
    TaskID: String(task.TaskId),
    Subject: task.Subject ?? '',
    Description: task.Description ?? '',
    LiveDate: task.LiveDate ?? '',
    DueDate: task.DueDate ?? '',
    taskCategoryID: String(task.taskCategoryID ?? 0),
    taskStatusID: String(task.taskStatusID ?? 1),
    Priority: String(task.Priority ?? 2),
    contactID: String(task.contactID ?? 0),
    leadID: task.leadID || '',
    employeeID: String(task.employeeID ?? 0),
    caseID: task.caseID || 0,
  };

  for (const [key, value] of changes) {
    if (key === 'subject') params.Subject = String(value ?? '').slice(0, 500);
    else if (key === 'description') params.Description = String(value ?? '').slice(0, 4_000);
    else if (key === 'liveDate') params.LiveDate = formatTaskDate(value, 'live date');
    else if (key === 'dueDate') params.DueDate = formatTaskDate(value, 'due date');
    else if (key === 'categoryId') {
      const categoryId = Number(value);
      if (!Number.isInteger(categoryId) || categoryId < 0 || categoryId > 999_999) {
        throw new Error('Invalid task category');
      }
      params.taskCategoryID = String(categoryId);
    } else if (key === 'priority') params.Priority = taskPriority(value);
  }

  const response = await fetch(
    `${BASE}/golfballs/crm/Admin/Task/Update.ajax?${encodeURIComponent(JSON.stringify(params))}`,
    { credentials: 'include' },
  );
  if (!response.ok) throw new Error(`Task update returned HTTP ${response.status}`);
  return { ok: true, taskId: safeId, changed: changes.map(([key]) => key) };
}

/* Mark one task complete — the legacy tlCompleteTask payload shape
   (TaskId numeric, taskStatusID 3). */
export async function completeTaskById(id) {
  const safeId = numericId(id, 'task ID');
  const t = await fetchTaskRaw(safeId);
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
  const response = await fetch(`${BASE}/golfballs/crm/Admin/Task/Update.ajax?${encodeURIComponent(JSON.stringify(params))}`, { credentials: 'include' });
  if (!response.ok) throw new Error(`Task update returned HTTP ${response.status}`);
}

/**
 * Complete a contact's open tasks.
 * @param contactId  the CRM contact id
 * @param mode       'completeAll' | 'completeLatest'  (latest = most-recent due date)
 * @returns { ok, detail? , error? }
 */
export async function completeContactTasks(contactId, { mode = 'completeAll' } = {}) {
  if (!['completeAll', 'completeLatest'].includes(mode)) return { ok: false, error: 'Invalid completion mode' };
  try { numericId(contactId, 'contact ID'); } catch { return { ok: false, error: 'Invalid contact ID' }; }
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
