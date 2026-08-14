/* ───────────────────────────────────────────────────────────────
   codeEngine/liveActionRun — run a custom action against the LIVE page.

   A custom action authored in the editor runs, from the Action Shelf, on
   whatever CRM page the rep is on. This shapes the live page-engine output
   into the `page` model the code engine expects, and builds the real,
   confirm-gated executor from the same proven writer libs the workflow
   runner uses.

   shapeLivePage is pure (unit-tested). makeLiveExecutor dynamic-imports the
   heavy writer libs so the always-loaded shelf bundle stays lean — they load
   only when a custom action is actually run.
─────────────────────────────────────────────────────────────── */

import { shapeExtractedPage } from './pageModel.js';

/** Shape runEngine(document) output into the full code-engine `page` model.
 *  Orders, items, activities, proofs, stats, ids, and future schema fields
 *  pass through; pageModel overlays only the controlled contact/task views. */
export function shapeLivePage(engineOut) {
  return shapeExtractedPage(engineOut);
}

/** The executor ctx ids pulled off the shaped page's contact. Pure. */
export function ctxFromPage(page) {
  const c = (page && page.contact) || {};
  const ids = (page && page.ids) || {};
  return {
    contactId: c.contactId || c.id || c.customerId || ids.contact || '',
    contactName: c.contactName || c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || '',
    phone: c.phone || '',
    accountId: c.accountId || ids.account || '',
    email: c.email || '',
  };
}

/** Number of records exposed by the live action's context. A contact/account
 * page is one record; modal entry points can expose a broader contact set. */
export function liveActionContextCount(page) {
  const model = page && typeof page === 'object' ? page : {};
  let count = Array.isArray(model.contacts) ? model.contacts.length : 0;
  const entryPoints = Array.isArray(model.entryPoints)
    ? model.entryPoints
    : (model.entryPoint ? [model.entryPoint] : []);
  for (const entryPoint of entryPoints) {
    const contacts = entryPoint?.data?.contacts;
    if (Array.isArray(contacts)) count = Math.max(count, contacts.length);
  }
  if (count > 0) return count;

  const ids = model.ids && typeof model.ids === 'object' ? model.ids : {};
  const hasSingleRecord = Object.keys(model.contact || {}).length > 0
    || Object.keys(model.account || {}).length > 0
    || Object.keys(model.order || {}).length > 0
    || !!(ids.contact || ids.account || ids.order || ids.opportunity);
  return hasSingleRecord ? 1 : 0;
}

/** A shelf click is the explicit approval for a normal single-record action.
 * Broad/modal actions retain the plan confirmation, as do future hard-gated
 * effects. Successful one-record runs stay silent; errors still surface. */
export function liveActionRunPolicy(page, plan = {}) {
  const contextCount = liveActionContextCount(page);
  const singleContext = contextCount === 1;
  const mustConfirm = plan.maxGate === 'hard' || !singleContext;
  return {
    contextCount,
    confirm: mustConfirm,
    announceSuccess: mustConfirm,
  };
}

/** Build the real, gated executor for a live custom-action run. Mirrors the
 *  workflow runner's makeContactExecutor, but resolves its own email config +
 *  employee id and pulls the contact ctx from the live page. */
export async function makeLiveExecutor(page) {
  const [
    { makeExecutor },
    { readEmailConfig, sendEmail },
    { pickFromAddress },
    { submitQuickTask },
    { submitCallLog },
    { completeTaskById, updateTaskById, getTaskContactId },
    { crmUpdateContact },
    { dispatchBackgroundMessage },
  ] = await Promise.all([
    import('./executor.js'),
    import('../emailSender.js'),
    import('../sender.js'),
    import('../submitQuickTask.js'),
    import('../submitCallLog.js'),
    import('../crmTasks.js'),
    import('../crm-detail-shared.jsx'),
    import('../backgroundMessage.js'),
  ]);

  const ec = (await readEmailConfig()) || {};
  const employeeId = await new Promise((res) => {
    try { chrome.storage.local.get('gbEmployeeId', (d) => res(d?.gbEmployeeId || '')); } catch { res(''); }
  });
  const base = ctxFromPage(page);

  return makeExecutor({
    ctx: { ...base, employeeId },
    sendEmail: async (outbound, ctx) => {
      const to = outbound.to || ctx.email;
      if (!to) throw new Error('no email address on this page for send');
      return sendEmail({
        to,
        subject: outbound.subject || '',
        htmlBody: outbound.body || '',
        from: outbound.from || pickFromAddress(outbound, ec.localPart),
        replyMode: outbound.replyMode || 'standalone',
        signature: ec.signature || '',
        config: ec,
        templateId: outbound.templateId || '',
        templateName: outbound.name || '',
        variationId: outbound.variationId || '__original',
        trackingContext: { contactId: ctx.crmContactId || ctx.contactId || '', accountId: ctx.accountId || '' },
      }, { dispatch: dispatchBackgroundMessage });
    },
    submitQuickTask,
    submitCallLog,
    updateTaskById,
    completeTaskById,
    getTaskContactId,
    updateContact: crmUpdateContact,
  });
}
