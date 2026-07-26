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

/** Shape runEngine(document) output into the code engine's `page` model
 *  ({ contact, contacts, count, tasks }). Pure. */
export function shapeLivePage(engineOut) {
  const l = (engineOut && (engineOut.data || engineOut)) || {};
  const contact = l.contact || {};
  const hasContact = !!(contact && Object.keys(contact).length);
  return {
    contact,
    contacts: hasContact ? [contact] : [],
    count: hasContact ? 1 : 0,
    tasks: l.tasks || { open: [], done: [] },
    order: l.order || undefined,
    account: l.account || undefined,
  };
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
    { completeTaskById },
    { crmUpdateContact },
    { sendBackgroundMessage },
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
        from: outbound.from || pickFromAddress({}, ec.localPart),
        signature: ec.signature || '',
        config: ec,
      }, { dispatch: sendBackgroundMessage });
    },
    submitQuickTask,
    submitCallLog,
    completeTaskById,
    updateContact: crmUpdateContact,
  });
}
