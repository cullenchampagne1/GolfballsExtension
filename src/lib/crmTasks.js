/* ───────────────────────────────────────────────────────────────
   crmTasks.js — complete a contact's open CRM tasks.

   Used by the Workflow Manager's "Complete all open tasks" /
   "Complete latest open task" step modes. Reuses the same endpoints
   the Task List modal uses:
     • Page=349        — the rendered task list (rows id="taskrow_<id>")
     • Task/Get.ajax   — the task's current payload
     • Task/Update.ajax — write it back with taskStatusID = 3 (complete)

   Runs in the content-script realm (the workflow surface mounts on the
   CRM domain), so `fetch(..., { credentials:'include' })` carries the
   shared session cookies.
─────────────────────────────────────────────────────────────── */

import { API } from './constants.js';

const BASE = API.CRM;
const TASKS_ENDPOINT = `${BASE}/golfballs/adminnew/Default.aspx?Page=349`;

/* ── Task date rule ──────────────────────────────────────────────
   A task's Live Date sits exactly LIVE_LEAD_DAYS (2 weeks) before its
   Due Date — the reach-out goes "live" two weeks before it's due, which
   is how it gets indexed onto the Task List pull. These pure helpers
   centralize the math so every surface (the Task List quick actions and
   the custom-page task rows) pushes dates identically. */
export const LIVE_LEAD_DAYS = 14;
const MS_DAY = 86_400_000;

/* Parse a CRM date (m/d/yyyy or ISO yyyy-mm-dd[…]) or a Date into a local
   Date pinned to noon (avoids TZ/DST off-by-one). Returns null when the
   value can't be parsed. */
export function parseTaskDate(value) {
  let d;
  if (value instanceof Date) {
    d = value;
  } else {
    const raw = String(value ?? '').trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (iso) d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
    else if (mdy) d = new Date(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]), 12);
    else d = new Date(raw);
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}

/* Format a Date as the CRM's zero-padded m/d/yyyy (matches TaskList.fmtMDY). */
export function taskMDY(date) {
  return [
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    date.getFullYear(),
  ].join('/');
}

/* Due date one calendar year out from `from` (default today) — same month/day
   next year, NOT +365 days, so leap years don't drift it. Returns m/d/yyyy. */
export function pushDueOneYear(from = new Date()) {
  const d = parseTaskDate(from) || parseTaskDate(new Date());
  d.setFullYear(d.getFullYear() + 1);
  return taskMDY(d);
}

/* The live date for a given due date: LIVE_LEAD_DAYS before it. m/d/yyyy, or
   null when the due date can't be parsed. */
export function liveDateForDue(dueValue) {
  const due = parseTaskDate(dueValue);
  if (!due) return null;
  return taskMDY(new Date(due.getTime() - LIVE_LEAD_DAYS * MS_DAY));
}

/* The live date to apply when a task's due date is (re)set by a push. Only
   tracks the due date once it lands MORE than 2 weeks out; for a near-term due
   (≤ LIVE_LEAD_DAYS from today) it returns null so the caller leaves the
   existing live date alone — a live date in the past would be meaningless. */
export function liveDateOnPush(dueValue, { today = new Date() } = {}) {
  const due = parseTaskDate(dueValue);
  if (!due) return null;
  const now = parseTaskDate(today) || parseTaskDate(new Date());
  if ((due.getTime() - now.getTime()) <= LIVE_LEAD_DAYS * MS_DAY) return null;
  return taskMDY(new Date(due.getTime() - LIVE_LEAD_DAYS * MS_DAY));
}

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
 * Workflows and custom actions share this writer through the common executor.
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

/**
 * Create one task on a contact, from the content-script realm.
 *
 * submitQuickTask() covers the same endpoint for the modal, but routes through
 * the background fetchRaw bridge. This one issues the request from the page,
 * where the CRM session is unambiguous, and — unlike the modal path — treats an
 * unparseable response as a failure: the CRM answers a create with JSON, so
 * HTML coming back means a login redirect, not a task.
 *
 * `daysOut` shifts the due date from today; 0 is due today.
 */
export async function createTaskForContact({
  contactId, employeeId, subject, description = '',
  categoryId = 0, priority = 2, daysOut = 0, today = new Date(),
} = {}) {
  const safeContactId = numericId(contactId, 'contact ID');
  const safeEmployeeId = numericId(employeeId, 'employee ID');
  const title = String(subject ?? '').trim();
  if (!title) throw new Error('Task subject is required');
  const start = parseTaskDate(today) || parseTaskDate(new Date());
  const offset = Math.max(0, Math.min(Math.floor(Number(daysOut) || 0), 3_650));
  const due = new Date(start.getTime() + offset * MS_DAY);
  const category = Number(categoryId);
  if (!Number.isInteger(category) || category < 0 || category > 999_999) {
    throw new Error('Invalid task category');
  }
  const params = {
    TaskID: '',
    Subject: title.slice(0, 500),
    Description: String(description ?? '').slice(0, 4_000),
    LiveDate: taskMDY(start),
    DueDate: taskMDY(due),
    taskCategoryID: String(category),
    taskStatusID: '1',
    Priority: taskPriority(priority),
    contactID: safeContactId,
    leadID: '0',
    employeeID: safeEmployeeId,
    caseID: 0,
  };
  const url = `${BASE}/golfballs/crm/Admin/Task/Create.ajax?${encodeURIComponent(JSON.stringify(params))}`;
  if (url.length > 20_000) throw new Error('Task request exceeds the CRM URL limit');
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`Task create returned HTTP ${response.status}`);
  let payload;
  try { payload = JSON.parse(await response.text()); }
  catch { throw new Error('CRM did not return a created task'); }
  const taskId = String(payload?.TaskId ?? '').trim();
  if (!/^\d{1,12}$/.test(taskId)) throw new Error('CRM accepted the request but no TaskId came back');
  return { ok: true, taskId };
}

/* Resolve a task's real CRM contactID from its task id via Task/Get — the
   reliable source the Task List's own bulk-create uses (apiGetTaskContactId).
   Task-list rows often expose the contact only through an onclick link with no
   usable href (or a mock id), so parsing the row is unreliable; the task id is
   always the numeric taskrow_<id>. Returns '' when there is no valid contact. */
export async function getTaskContactId(id) {
  const safeId = numericId(id, 'task ID');
  const task = await fetchTaskRaw(safeId);
  const cid = String(task?.contactID ?? '').trim();
  return /^\d{1,12}$/.test(cid) && Number(cid) > 0 ? cid : '';
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
