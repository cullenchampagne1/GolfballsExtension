/* ───────────────────────────────────────────────────────────────
   codeEngine/executor — the content-side REAL writer for a live run.

   simulateProgram records a dry trace; on a live run it also hands each
   effect step to this executor, which performs the actual write via the
   PROVEN lib functions (injected as deps, so the wiring stays in
   CampaignManager and this stays unit-testable):

     sendEmail        → emailSender.sendEmail(...)       (arbitrary `to`)
     createTask       → submitQuickTask({template,context})
     logCall          → submitCallLog({template,context})
     updateTask       → crmTasks.updateTaskById(id, fields)
     completeTask     → crmTasks.completeTaskById(id)
     editContact      → crmUpdateContact(contactId, payload)  (grouped)

   One executor is built per contact (deps.ctx carries the contact's ids).
─────────────────────────────────────────────────────────────── */

import {
  APPROVED_CONTACT_FIELDS,
  APPROVED_TASK_FIELDS,
} from './contracts.js';

/** Staged schema-name edits → crmUpdateContact payload keys (only approved). */
export function mapEditFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    const key = APPROVED_CONTACT_FIELDS[k];
    if (key) out[key] = v == null ? '' : String(v);
  }
  return out;
}

/** User-facing aliases → the canonical field names updateTaskById accepts. */
export function mapTaskEditFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    const canonical = APPROVED_TASK_FIELDS[key];
    if (canonical) out[canonical] = value;
  }
  return out;
}

function assertHelperResult(result, fallback) {
  if (result?.ok === false) throw new Error(result.error || fallback);
  if (result?.state === 'failed') throw new Error(result.error || fallback);
  return result;
}

const isNumericId = (v) => /^\d{1,12}$/.test(String(v == null ? '' : v).trim()) && Number(v) > 0;

function taskTemplate(input) {
  const {
    contactId: _contactId,
    contactName: _contactName,
    accountId: _accountId,
    taskId: _taskId,
    ...value
  } = (input || {});
  const priorities = { high: 1, med: 2, medium: 2, low: 3 };
  if (typeof value.priority === 'string' && priorities[value.priority.toLowerCase()]) {
    value.priority = priorities[value.priority.toLowerCase()];
  }
  return value;
}

function activityTemplate(input, { note = false } = {}) {
  const value = input || {};
  const direction = value.callDirection != null
    ? Number(value.callDirection)
    : (value.direction === 'inbound' ? 1 : 0);
  return {
    ...value,
    subject: value.subject || (note ? 'Campaign note' : 'Campaign call'),
    callDirection: direction === 1 ? 1 : 0,
    callCategory: Number(value.callCategory ?? value.categoryId ?? 35) || 35,
    callVoicemail: value.callVoicemail ?? value.voicemail ?? false,
  };
}

export function makeExecutor(deps = {}) {
  const ctx = deps.ctx || {};
  // Cache Task/Get contactId lookups so a contact that gets several tasks in
  // one run (e.g. four quarterly reach-outs) only resolves its id once.
  const taskContactCache = new Map();
  const resolveContactFromTask = async (taskId) => {
    const key = String(taskId);
    if (taskContactCache.has(key)) return taskContactCache.get(key);
    let id = '';
    try { id = await deps.getTaskContactId(taskId); } catch (e) { id = ''; }
    taskContactCache.set(key, id);
    return id;
  };
  const prepare = async (contract, input) => (
    typeof deps.prepareInput === 'function'
      ? (await deps.prepareInput(contract, input || {})) || {}
      : (input || {})
  );
  const commitEdits = async (fields) => {
    const payload = mapEditFields(fields);
    if (!Object.keys(payload).length) return { ok: true, changed: [] };
    if (!deps.updateContact) throw new Error('contact editing is not configured');
    if (!ctx.contactId) throw new Error('no contact id — open a contact page to edit');
    const result = await deps.updateContact(ctx.contactId, payload);
    assertHelperResult(result, 'contact edit failed');
    return { ok: true, changed: Object.keys(payload), result };
  };

  return {
    async run(contract, input) {
      const i = await prepare(contract, input);
      if (contract === 'sendEmail') {
        if (!deps.sendEmail) throw new Error('email sending is not configured');
        return assertHelperResult(
          await deps.sendEmail(i, ctx),
          'email send failed',
        );
      }
      if (contract === 'createTask') {
        if (!deps.submitQuickTask) throw new Error('task creation is not configured');
        let contactId = i.contactId || ctx.contactId;
        // Task-list rows often can't expose a usable contact id (onclick links,
        // or mock ids). When the given id isn't a real numeric contact but a
        // representative task id was passed, resolve the real contact from the
        // task via Task/Get — the same reliable path the modal bulk-create uses.
        if (!isNumericId(contactId) && i.taskId && typeof deps.getTaskContactId === 'function') {
          contactId = await resolveContactFromTask(i.taskId);
        }
        if (!isNumericId(contactId)) {
          throw new Error('no valid contact id — pass createTask({ contactId }) or a { taskId } to resolve one');
        }
        const target = {
          contactId: String(contactId),
          employeeId: ctx.employeeId,
          contactName: i.contactName || ctx.contactName,
          accountId: i.accountId || ctx.accountId,
        };
        return assertHelperResult(
          await deps.submitQuickTask({
            template: taskTemplate(i),
            context: target,
          }),
          'task creation failed',
        );
      }
      if (contract === 'logCall') {
        if (!deps.submitCallLog) throw new Error('call logging is not configured');
        return assertHelperResult(
          await deps.submitCallLog({
            template: activityTemplate(i),
            context: {
              contactId: ctx.contactId,
              phone: ctx.phone,
              employeeId: ctx.employeeId,
              contactName: ctx.contactName,
            },
          }),
          'call logging failed',
        );
      }
      if (contract === 'addNote') {
        if (!deps.submitCallLog) throw new Error('activity note logging is not configured');
        return assertHelperResult(
          await deps.submitCallLog({
            template: activityTemplate(i, { note: true }),
            context: {
              contactId: ctx.contactId,
              phone: ctx.phone,
              employeeId: ctx.employeeId,
              contactName: ctx.contactName,
            },
          }),
          'activity note failed',
        );
      }
      if (contract === 'updateTask') {
        if (!deps.updateTaskById) throw new Error('task editing is not configured');
        if (!i.id) throw new Error('updateTask needs a task id');
        const fields = mapTaskEditFields(i.fields);
        if (!Object.keys(fields).length) throw new Error('updateTask has no supported changes');
        return assertHelperResult(
          await deps.updateTaskById(i.id, fields),
          'task update failed',
        );
      }
      if (contract === 'completeTask') {
        if (!deps.completeTaskById) throw new Error('task completion is not configured');
        if (!i.id) throw new Error('completeTask needs a task id (page.tasks.open[…])');
        const result = await deps.completeTaskById(i.id);
        assertHelperResult(result, 'task completion failed');
        return { ok: true, taskId: String(i.id), result };
      }
      if (contract === 'editContact') return commitEdits(i.fields);
      return null;
    },
    commitEdits,
  };
}
