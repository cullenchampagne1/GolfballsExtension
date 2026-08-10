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
import { API } from './constants.js';
import { resolveEmployeeId } from './employeeIdentity.js';
import { runTemplateFollowUpAfterSuccess } from './templateFollowUpAction.js';

const BASE = API.CRM;

const hasChromeRuntime = () => {
  try { return typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage; }
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
  d.setDate(d.getDate() + Math.min(n, 3_650));
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function numericId(value) {
  const id = String(value == null ? '' : value).trim();
  return /^\d{1,12}$/.test(id) && Number(id) > 0 ? id : '';
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

  /* These read the CURRENT contact/account you're viewing (URL params +
     the page's own labels). Intentionally NOT the page-engine schema: on
     an account page the engine resolves a *representative* contact, which
     would wrongly attach an account-level task to that contact. */
  // contactId — URL first, hidden form input as fallback.
  const hrefMatch = (typeof location !== 'undefined' ? location.href : '').match(/[?&]customerID=(\d+)/i);
  if (hrefMatch) {
    out.contactId = hrefMatch[1];
  } else {
    out.contactId = document.getElementById('tbContactId')?.value?.trim() || '';
  }
  /* Account pages carry #tbContactId=0 (no current contact). '0' is a
     truthy string, so callers doing `!ctx.contactId` would keep it and
     attach the task to contact 0 (silent failure). Normalize it to ''
     the same way accountId is below, so the empty check works and the
     representative-contact fallback can kick in. */
  if (out.contactId === '0') out.contactId = '';

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

  // Prefer the CRM page's own identity markup, then the validated local cache.
  // This remains reliable when the iCustomize iframe has not emitted an auth
  // request early enough for its identity broadcast.
  out.employeeId = await resolveEmployeeId();

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
export async function submitQuickTask({ template, context } = {}, followUpDeps = {}) {
  const tpl = template || {};
  const ctx = context  || {};

  /* ── 1. Template validation ─────────────────────────────── */
  const subject = String(tpl.subject || tpl.name || '').trim();
  if (!subject) {
    return { ok: false, error: 'Task needs a subject. Add one to the template or in the custom form.' };
  }
  if (subject.length > 500) return { ok: false, error: 'Task subject exceeds 500 characters.' };
  const description = String(tpl.body || '').trim();
  if (description.length > 4_000) return { ok: false, error: 'Task description exceeds 4,000 characters.' };

  /* ── 2. Context validation — the "safe in sandbox" gate ───
       contactId + employeeId are mandatory: the task table is
       indexed on contactID, and the CRM expects employeeID for
       ownership. Without them we'd create an orphan task. */
  const contactId = numericId(ctx.contactId);
  const employeeId = numericId(ctx.employeeId) || numericId(await resolveEmployeeId());
  const missing = [];
  if (!contactId)  missing.push('valid contact ID');
  if (!employeeId) missing.push('valid employee ID');
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
    Description:   description,
    LiveDate:      todayStr(),
    DueDate:       dueDateStr(tpl.daysOut),
    taskCategoryID: /^\d{1,6}$/.test(String(tpl.categoryId == null ? 0 : tpl.categoryId))
      ? String(tpl.categoryId == null ? 0 : tpl.categoryId)
      : '0',
    taskStatusID:  '1',
    Priority:      ['1', '2', '3'].includes(String(tpl.priority)) ? String(tpl.priority) : String(DEFAULT_PRIORITY),
    contactID:     contactId,
    leadID:        '0',
    employeeID:    employeeId,
    caseID:        0,
  };
  const qs = encodeURIComponent(JSON.stringify(params));
  const url = `${BASE}/golfballs/crm/Admin/Task/Create.ajax?${qs}`;
  if (url.length > 20_000) return { ok: false, error: 'Task request exceeds the CRM URL limit.' };

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

  return runTemplateFollowUpAfterSuccess({
    result: { ok: true, taskId: payload?.TaskId },
    template: tpl,
    context: {
      ...ctx,
      crmContactId: ctx.crmContactId || contactId,
      contactId,
      employeeId,
    },
    page: followUpDeps.page,
    snapshot: followUpDeps.snapshot,
  }, followUpDeps);
}
