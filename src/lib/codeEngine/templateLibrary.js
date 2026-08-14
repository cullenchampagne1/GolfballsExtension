/* ───────────────────────────────────────────────────────────────
   codeEngine/templateLibrary — one loader for the `user.*` binding.

   Workflow Manager and Action Shelf code run through the same engine, so
   they must see the same enabled email/task/call templates. Keeping the
   storage read + projection here prevents either surface from silently
   dropping a saved-template field (variations, recipient rules, sender,
   task priority, call category, and so on).
─────────────────────────────────────────────────────────────── */

import { loadTaskTemplates } from '../quickTask.js';
import { loadCallTemplates } from '../callLog.js';

function enabledEmails(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((template) => (
      template?.enabled !== false
      && (!template.type || template.type === 'email' || template.type === 'account')
    ))
    .map((template) => ({
      id: template.id,
      name: template.name,
      kind: 'email',
      subject: template.subject || '',
      body: template.body || '',
      variations: Array.isArray(template.variations) ? template.variations : [],
      vars: template.vars || {},
      toField: template.toField || null,
      replyMode: template.replyMode || 'standalone',
      senderAccount: template.senderAccount,
      senderRandomize: !!template.senderRandomize,
    }));
}

/** Pure projection used by the real loader and unit tests. */
export function normalizeCodeTemplateLibrary({ emails = [], tasks = [], calls = [] } = {}) {
  return {
    emails: enabledEmails(emails),
    tasks: (Array.isArray(tasks) ? tasks : []).map((template) => ({
      id: template.id,
      name: template.name,
      kind: 'task',
      subject: template.subject || '',
      body: template.body || '',
      priority: template.priority,
      daysOut: template.daysOut,
      categoryId: template.categoryId,
    })),
    calls: (Array.isArray(calls) ? calls : []).map((template) => ({
      id: template.id,
      name: template.name,
      kind: 'call',
      subject: template.subject || '',
      body: template.body || '',
      callDirection: template.callDirection,
      callCategory: template.callCategory,
      callVoicemail: template.callVoicemail,
    })),
  };
}

function loadStoredEmailTemplates() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve([]);
        return;
      }
      chrome.storage.local.get('templates', (data) => {
        resolve(Array.isArray(data?.templates) ? data.templates : []);
      });
    } catch {
      resolve([]);
    }
  });
}

/**
 * Load the complete saved-template library exposed to action code.
 * Dependencies are injectable so the storage boundary stays easy to test.
 */
export async function loadCodeTemplateLibrary(deps = {}) {
  const loadEmails = deps.loadEmails || loadStoredEmailTemplates;
  const loadTasks = deps.loadTasks || loadTaskTemplates;
  const loadCalls = deps.loadCalls || loadCallTemplates;
  const [emails, tasks, calls] = await Promise.all([
    loadEmails(),
    loadTasks(),
    loadCalls(),
  ]);
  return normalizeCodeTemplateLibrary({ emails, tasks, calls });
}

export default loadCodeTemplateLibrary;
