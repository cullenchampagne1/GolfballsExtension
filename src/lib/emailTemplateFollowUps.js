/* ──────────────────────────────────────────────────────────────
   emailTemplateFollowUps — post-delivery automation for email templates.

   A template may select one saved task preset (`presetTaskId`) and one saved
   custom action (`followUpActionId`). This module resolves those references,
   builds the same recipient-scoped page model the code engine uses elsewhere,
   and runs both follow-ups independently. Callers invoke it ONLY after the
   email transport reports `sent` or `opened`; see emailTemplateDelivery.js.

   Follow-up actions intentionally hydrate the recipient's canonical contact
   page, not transient modal entry-point data or the order/account document the
   email originated from. That keeps one action run attached to one recipient.
────────────────────────────────────────────────────────────── */

import { shapeExtractedPage } from './codeEngine/pageModel.js';
import { runTemplateFollowUpAction } from './templateFollowUpAction.js';

const clean = (value) => String(value == null ? '' : value).trim();
const object = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

export function emailTemplateFollowUpIds(template = {}) {
  return {
    taskId: clean(template.presetTaskId),
    actionId: clean(template.followUpActionId),
  };
}

export function hasEmailTemplateFollowUps(template = {}) {
  const ids = emailTemplateFollowUpIds(template);
  return !!(ids.taskId || ids.actionId);
}

function parseSourceDocument(sourceHtml, sourceUrl, parseHtml) {
  if (!sourceHtml) return null;
  if (typeof parseHtml === 'function') return parseHtml(sourceHtml, sourceUrl);
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(String(sourceHtml), 'text/html');
  if (sourceUrl && doc?.body) {
    doc.body.dataset.gbSourceUrl = String(sourceUrl);
    if (!doc.querySelector('base')) {
      const base = doc.createElement('base');
      base.href = String(sourceUrl);
      doc.head?.prepend(base);
    }
  }
  return doc;
}

/** Build one recipient-scoped page model for a task and/or custom action. */
export function buildEmailFollowUpPage(input = {}, deps = {}) {
  const context = object(input.context);
  const sourceContact = object(context.contact);
  const sourceDocument = input.document
    || parseSourceDocument(input.sourceHtml, input.sourceUrl, deps.parseHtml);
  const engine = deps.pageEngine
    || (typeof window !== 'undefined' ? window.__gbPageEngine : null);

  let extracted = input.page || input.snapshot || null;
  if (!extracted && sourceDocument && engine?.runEngine) {
    try {
      engine.clearCache?.(sourceDocument);
      extracted = engine.runEngine(sourceDocument);
    } catch { extracted = null; }
  }

  const wrapped = object(extracted);
  const data = object(wrapped.data || wrapped);
  /* Order pages expose the recipient under order.customer and ids.customer;
     contact/account pages expose contact + ids.contact. Collapse both into
     the writable page.contact contract used by task/custom-action writers. */
  const orderCustomer = object(data.order?.customer);
  const extractedContact = { ...orderCustomer, ...object(data.contact) };

  /* The schema's ids.contact wins over a generic audience row contactId.
     Account rows often use their account id as the row key, while the fetched
     account document exposes the representative contact required by CRM task
     and custom-action writers under data.ids.contact. */
  const contactId = clean(
    context.crmContactId
    || data.ids?.contact
    || data.ids?.customer
    || data.order?.customerId
    || sourceContact.crmContactId
    || sourceContact.contactId
    || context.contactId
    || extractedContact.contactId
    || extractedContact.customerId
    || extractedContact.id,
  );
  const accountId = clean(
    data.ids?.account
    || context.accountId
    || sourceContact.accountId
    || extractedContact.accountId,
  );
  const contactName = clean(
    context.contactName
    || context.name
    || sourceContact.contactName
    || sourceContact.name
    || extractedContact.contactName
    || extractedContact.name
    || extractedContact.fullName
    || [extractedContact.firstName, extractedContact.lastName].filter(Boolean).join(' '),
  );
  const email = clean(
    context.email
    || sourceContact.email
    || extractedContact.email,
  );

  const contact = {
    ...extractedContact,
    ...sourceContact,
    ...(contactId ? {
      contactId,
      id: clean(sourceContact.id || extractedContact.id || contactId),
      customerId: clean(sourceContact.customerId || extractedContact.customerId || contactId),
    } : {}),
    ...(accountId ? { accountId } : {}),
    ...(contactName ? { contactName, name: clean(sourceContact.name || extractedContact.name || contactName) } : {}),
    ...(email ? { email } : {}),
  };
  const contacts = Object.keys(contact).length ? [contact] : [];

  return {
    page: shapeExtractedPage(data, { contact, contacts }),
    document: sourceDocument,
    taskContext: {
      contactId,
      accountId,
      contactName,
      employeeId: clean(context.employeeId),
    },
  };
}

function storageResources() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve({ noteTemplates: [], customActions: [] });
        return;
      }
      chrome.storage.local.get(['noteTemplates', 'gbCustomActions'], (data) => {
        resolve({
          noteTemplates: Array.isArray(data?.noteTemplates) ? data.noteTemplates : [],
          customActions: Array.isArray(data?.gbCustomActions) ? data.gbCustomActions : [],
        });
      });
    } catch {
      resolve({ noteTemplates: [], customActions: [] });
    }
  });
}

async function createTask({ template, context }) {
  const { submitQuickTask } = await import('./submitQuickTask.js');
  return submitQuickTask({ template, context });
}

function resultError(result, fallback) {
  return clean(result?.error || result?.reason || fallback);
}

/**
 * Run all follow-ups selected on one email template. Task/action failures are
 * independent: a failed task does not prevent the custom action from running.
 */
export async function runEmailTemplateFollowUps(input = {}, deps = {}) {
  const template = object(input.template);
  const ids = emailTemplateFollowUpIds(template);
  if (!ids.taskId && !ids.actionId) {
    return { ok: true, task: null, action: null, errors: [] };
  }

  const loadResources = deps.loadResources || storageResources;
  const resources = await loadResources();
  const noteTemplates = Array.isArray(resources?.noteTemplates) ? resources.noteTemplates : [];
  const customActions = Array.isArray(resources?.customActions) ? resources.customActions : [];
  const built = buildEmailFollowUpPage(input, deps);
  const errors = [];
  let task = null;
  let action = null;

  if (ids.taskId) {
    const selected = noteTemplates.find((item) => (
      clean(item?.id) === ids.taskId
      && item?.subType === 'task'
      && item?.enabled !== false
    ));
    if (!selected) {
      task = { ok: false, error: 'Selected follow-up task is disabled or no longer exists.' };
    } else {
      try {
        task = await (deps.createTask || createTask)({
          template: selected,
          context: built.taskContext,
        });
      } catch (error) {
        task = { ok: false, error: clean(error?.message || error) || 'Task creation failed.' };
      }
      if (!task || task.ok !== true) {
        task = { ...(task || {}), ok: false, error: resultError(task, 'Task creation failed.') };
      }
    }
    if (!task.ok) errors.push(`Task: ${task.error}`);
  }

  if (ids.actionId) {
    const selected = customActions.find((item) => (
      clean(item?.id) === ids.actionId && item?.enabled !== false
    ));
    if (!selected) {
      action = { ok: false, error: 'Selected follow-up action is disabled or no longer exists.' };
    } else {
      try {
        /* Preserve the lightweight runAction injection used by unit hosts.
           Production always goes through the shared Page=240 hydrator, so an
           email sent from an order/account row cannot execute against that
           source page by accident. */
        action = deps.runAction
          ? await deps.runAction({
              action: selected,
              page: built.page,
              document: built.document,
            })
          : await runTemplateFollowUpAction({
              template,
              action: selected,
              context: {
                ...object(input.context),
                crmContactId: built.taskContext.contactId,
                contactId: built.taskContext.contactId,
                accountId: built.taskContext.accountId,
                contactName: built.taskContext.contactName,
                employeeId: built.taskContext.employeeId,
              },
              page: built.page,
              document: built.document,
            }, deps);
      } catch (error) {
        action = { ok: false, error: clean(error?.message || error) || 'Custom action failed.' };
      }
      if (!action || action.ok !== true) {
        action = { ...(action || {}), ok: false, error: resultError(action, 'Custom action failed.') };
      }
    }
    if (!action.ok) errors.push(`Action: ${action.error}`);
  }

  return { ok: errors.length === 0, task, action, errors };
}
