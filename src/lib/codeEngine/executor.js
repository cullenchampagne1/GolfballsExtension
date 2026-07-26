/* ───────────────────────────────────────────────────────────────
   codeEngine/executor — the content-side REAL writer for a live run.

   simulateProgram records a dry trace; on a live run it also hands each
   effect step to this executor, which performs the actual write via the
   PROVEN lib functions (injected as deps, so the wiring stays in
   CampaignManager and this stays unit-testable):

     sendEmail        → emailSender.sendEmail(...)       (arbitrary `to`)
     createTask       → submitQuickTask({template,context})
     logCall          → submitCallLog({template,context})
     completeTask     → crmTasks.completeTaskById(id)
     editContact      → crmUpdateContact(contactId, payload)  (grouped)

   One executor is built per contact (deps.ctx carries the contact's ids).
─────────────────────────────────────────────────────────────── */

import { APPROVED_CONTACT_FIELDS } from './contracts.js';

/** Staged schema-name edits → crmUpdateContact payload keys (only approved). */
export function mapEditFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    const key = APPROVED_CONTACT_FIELDS[k];
    if (key) out[key] = v == null ? '' : String(v);
  }
  return out;
}

export function makeExecutor(deps = {}) {
  const ctx = deps.ctx || {};
  return {
    async run(contract, input) {
      const i = input || {};
      if (contract === 'sendEmail') {
        if (!deps.sendEmail) throw new Error('email sending is not configured');
        return deps.sendEmail(i, ctx);
      }
      if (contract === 'createTask') {
        if (!deps.submitQuickTask) throw new Error('task creation is not configured');
        return deps.submitQuickTask({ template: i, context: { contactId: ctx.contactId, employeeId: ctx.employeeId, contactName: ctx.contactName, accountId: ctx.accountId } });
      }
      if (contract === 'logCall') {
        if (!deps.submitCallLog) throw new Error('call logging is not configured');
        return deps.submitCallLog({ template: i, context: { contactId: ctx.contactId, phone: ctx.phone, employeeId: ctx.employeeId, contactName: ctx.contactName } });
      }
      if (contract === 'completeTask') {
        if (!deps.completeTaskById) throw new Error('task completion is not configured');
        if (!i.id) throw new Error('completeTask needs a task id (page.tasks.open[…])');
        return deps.completeTaskById(i.id);
      }
      return null;
    },
    async commitEdits(fields) {
      const payload = mapEditFields(fields);
      if (!Object.keys(payload).length) return null;
      if (!deps.updateContact) throw new Error('contact editing is not configured');
      if (!ctx.contactId) throw new Error('no contact id — open a contact page to edit');
      return deps.updateContact(ctx.contactId, payload);
    },
  };
}
