/* ───────────────────────────────────────────────────────────────
   codeEngine/liveActionRun — run a custom action against the LIVE page.

   A custom action authored in the editor runs, from the Action Shelf, on
   whatever CRM page the rep is on. This shapes the live page-engine output
   into the `page` model the code engine expects, and builds the real,
   confirm-gated executor from the same proven writer libs the campaign
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
  return {
    contactId: c.contactId || c.id || c.customerId || '',
    contactName: c.contactName || c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || '',
    phone: c.phone || '',
    accountId: c.accountId || '',
    email: c.email || '',
  };
}

/** Build the real, gated executor for a live custom-action run. Mirrors the
 *  campaign runner's makeContactExecutor, but resolves its own email config +
 *  employee id and pulls the contact ctx from the live page. */
export async function makeLiveExecutor(page) {
  const [
    { makeExecutor },
    { readEmailConfig, sendEmail },
    { pickFromAddress },
    { submitQuickTask },
    { submitCallLog },
    { completeTaskById, updateTaskById },
    { crmUpdateContact },
    { dispatchBackgroundMessage },
  ] = await Promise.all([
    import('./executor.js'),
    import('../emailSender.js'),
    import('../sender.js'),
    import('../submitQuickTask.js'),
    import('../submitCallLog.js'),
    import('../crmTasks.js'),
    import('../contact-detail-shared.jsx'),
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
      }, { dispatch: dispatchBackgroundMessage });
    },
    submitQuickTask,
    submitCallLog,
    updateTaskById,
    completeTaskById,
    updateContact: crmUpdateContact,
  });
}
