/* ───────────────────────────────────────────────────────────────
   submitQuickTask.js — single source of truth for creating a
   task in the CRM. Port of the Task/Create.ajax flow from the
   legacy quick-task panel (src/vanilla/crm-task-buttons.js →
   ctbCreateNewTask) into a clean async API both the playground
   and the production content-script can call.

   Endpoint differs from call logs:
     • Call log → GET form, fill ASP.NET viewstate, POST it back.
     • Task    → JSON-payload GET to /golfballs/crm/Admin/Task/Create.ajax
                (yes, GET — the CRM stuffs the create payload in the
                query string. ctbFetch encodes the JSON to survive
                quote/special-char rough edges in subject/body.)

   Validation flow mirrors submitCallLog so failures are uniform:
     1. Template must exist (don't post an empty task).
     2. Context must include contactId + employeeId (without
        these we can't attach the task to anything — sandbox /
        mock data lacks these by design).
     3. chrome.runtime must be available (no fetchRaw bridge =
        no shared CRM cookies).

   Returns `{ ok: true }` on success, `{ ok: false, error: <string> }`
   on any validation OR transport failure. Never throws.
─────────────────────────────────────────────────────────────── */

import { DEFAULT_PRIORITY } from './quickTask.js';

const BASE = 'https://api.golfballs.com';

const hasChromeRuntime = () => {
  try { return typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage; }
  catch { return false; }
};

const hasChromeStorage = () => {
  try { return typeof chrome !== 'undefined' && !!chrome.storage?.local?.get; }
  catch { return false; }
};

/* CRM date format — m/d/yyyy. Matches ctbTodayStr in the legacy. */
function todayStr() {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/* daysOut offset from today, in the same m/d/yyyy format. null/0/
   undefined ⇒ today (same default the editor uses for "due today"). */
function dueDateStr(daysOut) {
  if (daysOut == null || daysOut === '') return todayStr();
  const n = parseInt(daysOut, 10);
  if (!n || n <= 0) return todayStr();
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/** Read whatever task-context the current DOM exposes. Returns
 *  an object with empty strings for fields we couldn't find. The
 *  caller validates. Safe to call from any page (returns mostly-
 *  empty outside a contact/account page).
 *
 *  Selectors mirror crm-task-buttons.js's getters so both
 *  surfaces agree on what "I'm on a contact" means. */
export async function readTaskContext() {
  const out = { contactId: '', accountId: '', contactName: '', employeeId: '' };
  if (typeof document === 'undefined') return out;

  // contactId — URL first, hidden form input as fallback.
  const hrefMatch = (typeof location !== 'undefined' ? location.href : '').match(/[?&]customerID=(\d+)/i);
  if (hrefMatch) {
    out.contactId = hrefMatch[1];
  } else {
    out.contactId = document.getElementById('tbContactId')?.value?.trim() || '';
  }

  // accountId — separate URL param + Name input on account pages.
  const acctMatch = (typeof location !== 'undefined' ? location.href : '').match(/[?&]accountID=(\d+)/i);
  if (acctMatch) {
    out.accountId = acctMatch[1];
  } else {
    out.accountId = (document.getElementById('AccountID')?.value || '').trim();
    if (out.accountId === '0') out.accountId = '';
  }

  // contactName for the modal subtitle.
  const first = (document.getElementById('lblContactFirstName')?.textContent || '').trim();
  const last  = (document.getElementById('lblContactLastName')?.textContent  || '').trim();
  const full = `${first} ${last}`.trim();
  if (full) {
    out.contactName = full;
  } else {
    out.contactName = (document.getElementById('Name')?.value || '').trim();
  }

  // employeeId — same gbEmployeeId in storage that calls use.
  if (hasChromeStorage()) {
    try {
      out.employeeId = await new Promise((resolve) => {
        chrome.storage.local.get('gbEmployeeId', (d) => resolve(d?.gbEmployeeId || ''));
      });
    } catch { /* leave empty */ }
  }

  return out;
}

/**
 * Submit a single task template (preset or custom) to the CRM.
 *
 *   template — Template object (preset from noteTemplates OR the
 *              synthetic one buildCustomTaskTemplate() produces).
 *   context  — { contactId, employeeId, contactName? }. contactId +
 *              employeeId are required; contactName is informational.
 *
 * Returns Promise<{ ok: true } | { ok: false, error: string }>.
 * Never throws — every error path resolves with a string the modal
 * pipes straight into a toast.
 */
export async function submitQuickTask({ template, context } = {}) {
  const tpl = template || {};
  const ctx = context  || {};

  /* ── 1. Template validation ─────────────────────────────── */
  const subject = (tpl.subject || tpl.name || '').trim();
  if (!subject) {
    return { ok: false, error: 'Task needs a subject. Add one to the template or in the custom form.' };
  }

  /* ── 2. Context validation — the "safe in sandbox" gate ───
       contactId + employeeId are mandatory: the task table is
       indexed on contactID, and the CRM expects employeeID for
       ownership. Without them we'd create an orphan task. */
  const missing = [];
  if (!ctx.contactId)  missing.push('contact ID');
  if (!ctx.employeeId) missing.push('employee ID');
  if (missing.length) {
    return {
      ok: false,
      error: `Missing ${missing.join(', ')}. Open from a real contact or account page first.`,
    };
  }

  /* ── 3. Runtime check — without chrome.runtime we can't
       hit the CRM at all (no shared session cookies). This is
       what keeps the playground a true "safe sandbox". */
  if (!hasChromeRuntime()) {
    return { ok: false, error: 'CRM bridge unavailable — not running in extension context.' };
  }

  /* ── 4. Build the Task/Create.ajax payload. The CRM expects
       a JSON-encoded blob in the query string; encoding-encoded
       so quotes inside Subject/Description don't break parsing. */
  const params = {
    TaskID:        '',
    Subject:       subject,
    Description:   (tpl.body || '').trim(),
    LiveDate:      todayStr(),
    DueDate:       dueDateStr(tpl.daysOut),
    taskCategoryID: String(tpl.categoryId || 0),
    taskStatusID:  '1',
    Priority:      String(tpl.priority || DEFAULT_PRIORITY),
    contactID:     String(ctx.contactId),
    leadID:        '0',
    employeeID:    String(ctx.employeeId),
    caseID:        0,
  };
  const qs = encodeURIComponent(JSON.stringify(params));
  const url = `${BASE}/golfballs/crm/Admin/Task/Create.ajax?${qs}`;

  /* ── 5. POST it via the background fetchRaw bridge. */
  let resp;
  try {
    resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'fetchRaw', url }, resolve);
    });
  } catch (err) {
    return { ok: false, error: `CRM request failed: ${err?.message || err}` };
  }
  if (!resp?.ok) {
    return { ok: false, error: `CRM returned HTTP ${resp?.status || 'error'}.` };
  }

  /* The Create endpoint returns JSON with the new TaskId. Parse
     it so callers can introspect (e.g. to insert a row into the
     TableTasks DOM) — but a parse failure isn't fatal; if the HTTP
     was 200 the task landed even if the body looks off. */
  let payload = null;
  try { payload = JSON.parse(resp.text); } catch { /* ignore */ }
  if (payload && !payload.TaskId) {
    return { ok: false, error: 'CRM accepted the request but no TaskId came back.' };
  }

  return { ok: true, taskId: payload?.TaskId };
}
