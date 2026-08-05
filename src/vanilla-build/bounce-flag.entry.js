/* ───────────────────────────────────────────────────────────────
   bounce-flag.entry.js — the CRM-page half of bounced-contact
   flagging.

   The email relay recognizes a delivery-failure report the moment
   it lands and sends the installation a bounce notification naming
   the address that failed. Turning that into CRM work has to happen
   HERE: resolving the address needs the cookie-authenticated search
   index, reading the contact's open tasks and writing a new one need
   the same session, and the signed-in employee the task belongs to
   is only authoritative on a CRM page. A worker fetch is cross-site
   and carries none of that — the same constraint the recent-orders
   sweep works around.

   So the worker holds the queue and the clock, and a CRM page does
   the three CRM things: find the contact, check it does not already
   have an open bounce task, create one.

   build.js produces react-dist/vanilla/bounce-flag.js from this
   file; the manifest loads it on api.golfballs.com pages only.

   It answers ONE message, only from our own worker, and it takes an
   ADDRESS — not a URL, a task id, or a payload to write. The page
   can be asked to flag a bounced contact and nothing else.

   Admin-only: excluded from the served consumer build.
─────────────────────────────────────────────────────────────── */

import { crmSolrQuery } from '../lib/crmSolrSearch.js';
import { createTaskForContact, fetchOpenTasksForContact } from '../lib/crmTasks.js';
import { resolveEmployeeId } from '../lib/employeeIdentity.js';
import {
  bounceJobFromAction,
  bounceOutcomeMessage,
  bounceTaskTemplate,
  findOpenBounceTask,
  normalizeBounceEmail,
} from '../lib/bouncedContacts.js';

const MESSAGE = 'gbBounceFlagContact';
const ROWS = 5;

function contactIdFromDoc(doc) {
  const id = String(doc?.id || '');
  const match = id.match(/^contact_(.+)$/i);
  const contactId = String(match?.[1] || doc?.importContactID_s || '').trim();
  return /^\d{1,12}$/.test(contactId) ? contactId : '';
}

function docEmails(doc) {
  return [].concat(doc?.emails_tps || [], doc?.email_tp || [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The contact that owns this address.
 *
 * The search is fuzzy by design (typo tolerance for a human typing a name), so
 * a near-miss must never be accepted here: flagging the wrong contact writes a
 * "replace this person" task against someone perfectly reachable. Only an
 * exact address match counts.
 */
async function findContact(email) {
  const result = await crmSolrQuery({ query: email, type: 'contact', rows: ROWS });
  for (const doc of result.docs || []) {
    const contactId = contactIdFromDoc(doc);
    if (!contactId || !docEmails(doc).includes(email)) continue;
    return { contactId, contactName: String(doc.contactName_t || '').trim() };
  }
  return null;
}

/**
 * Flag one bounced address.
 *
 * Returns a status rather than throwing for the two outcomes that are answers,
 * not failures: the address matches no contact, and the contact already has an
 * open bounce task. Both mean "nothing to write", and the worker records them
 * so it stops asking.
 */
export async function flagBouncedContact(job = {}) {
  const email = normalizeBounceEmail(job.email);
  if (!email) throw new Error('no bounced address to flag');

  const match = await findContact(email);
  if (!match) return { status: 'unresolved', email };

  // Ask the CRM what this contact already has BEFORE writing. The CRM raises
  // its own bounce tasks on a schedule, so by the time a rep opens the browser
  // the task may already exist — a second one puts the same contact in the
  // Replacement Contacts queue twice.
  const existing = findOpenBounceTask(await fetchOpenTasksForContact(match.contactId));
  if (existing) return { status: 'existing', email, taskId: String(existing.id), ...match };

  const employeeId = await resolveEmployeeId();
  if (!employeeId) throw new Error('no signed-in CRM employee on this page yet');

  const template = bounceTaskTemplate({
    email,
    code: job.code,
    kind: job.kind,
    note: job.note,
    when: job.when,
  });
  const created = await createTaskForContact({
    contactId: match.contactId,
    employeeId,
    subject: template.subject,
    description: template.body,
    categoryId: template.categoryId,
    priority: template.priority,
    daysOut: template.daysOut,
  });
  return { status: 'created', email, taskId: created.taskId, ...match };
}

function announce(result) {
  const toast = globalThis.window?.__gbToast;
  if (!toast) return;
  const message = bounceOutcomeMessage(result);
  const tone = result.status === 'created' ? 'success'
    : result.status === 'failed' ? 'error' : 'info';
  try { toast[tone]?.(message, { duration: 5_000, placement: 'top-right' }); }
  catch { /* the host page is unloading */ }
}

/* The notification's own action button runs the same flow, from the page it
   was clicked on — so a bounce is never stuck waiting for the worker's turn.
   It hands over the Action Language envelope it was clicked with; the worker
   hands over a job it already read. Both describe the same address. */
try {
  globalThis.window.__gbFlagBouncedContact = async (input) => {
    const job = input?.command ? bounceJobFromAction(input) : input;
    try {
      if (!job) throw new Error('not a bounced-contact action');
      const result = await flagBouncedContact(job);
      announce(result);
      return result;
    } catch (error) {
      const failure = { status: 'failed', email: job?.email, error: String(error?.message || error) };
      announce(failure);
      return failure;
    }
  };
} catch { /* no writable window */ }

try {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.action !== MESSAGE) return undefined;
    // Our own worker, not another extension and not a content script speaking
    // for the page: a message from a tab has a `sender.tab`; ours does not.
    if (sender.id !== chrome.runtime.id || sender.tab) {
      sendResponse({ ok: false, error: 'unauthorized' });
      return true;
    }
    flagBouncedContact(message)
      .then((result) => { announce(result); sendResponse({ ok: true, ...result }); })
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });
} catch { /* no extension messaging here — nothing to answer */ }
