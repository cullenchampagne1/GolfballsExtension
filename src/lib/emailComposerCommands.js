import { renderTemplate } from './variableResolution.js';

/* Shared slash-command registry for the Email Preview composer. Commands
   intentionally carry only metadata; the composer supplies page-specific
   handlers, so future bundles can register commands without coupling this
   store to a particular React tree. */
function buildRegistry() {
  const commands = new Map();
  return {
    register(command) {
      if (!command?.id) throw new Error('emailComposerCommandRegistry.register: command.id required');
      commands.set(command.id, command);
      return () => commands.delete(command.id);
    },
    get(id) { return commands.get(id) || null; },
    getCommands() { return Array.from(commands.values()); },
  };
}

function sharedRegistry() {
  if (typeof window === 'undefined') return buildRegistry();
  if (!window.__gbEmailComposerCommandRegistry) {
    window.__gbEmailComposerCommandRegistry = buildRegistry();
  }
  return window.__gbEmailComposerCommandRegistry;
}

export const emailComposerCommandRegistry = sharedRegistry();

if (!emailComposerCommandRegistry.get('account-templates')) {
  emailComposerCommandRegistry.register({
    id: 'account-templates',
    label: 'Account templates',
    description: 'Search saved account templates and evaluate one against this page',
    keywords: ['account', 'template', 'saved', 'email'],
    source: 'account-templates',
  });
}

if (!emailComposerCommandRegistry.get('saved-proposals')) {
  emailComposerCommandRegistry.register({
    id: 'saved-proposals',
    label: 'Saved proposals',
    description: 'Insert a saved proposal into this email',
    keywords: ['saved', 'proposal', 'quote', 'opportunity'],
    source: 'saved-proposals',
  });
}

function searchableText(item) {
  return [item?.label, item?.name, item?.description, ...(item?.keywords || [])]
    .filter(Boolean).join(' ').toLowerCase();
}

export function searchEmailComposerCommands(query, registry = emailComposerCommandRegistry) {
  const needle = String(query || '').trim().toLowerCase();
  const commands = registry.getCommands();
  return needle ? commands.filter((command) => searchableText(command).includes(needle)) : commands;
}

export function accountEmailTemplates(templates) {
  return (Array.isArray(templates) ? templates : [])
    .filter((template) => template?.enabled !== false && template?.type === 'account');
}

export function searchAccountEmailTemplates(templates, query) {
  const needle = String(query || '').trim().toLowerCase();
  const available = accountEmailTemplates(templates);
  return needle ? available.filter((template) => searchableText(template).includes(needle)) : available;
}

export function savedProposals(proposals) {
  return (Array.isArray(proposals) ? proposals : []).filter((proposal) => proposal?.id);
}

export function searchSavedProposals(proposals, query) {
  const needle = String(query || '').trim().toLowerCase();
  const available = savedProposals(proposals);
  return needle ? available.filter((proposal) => searchableText(proposal).includes(needle)) : available;
}

export function savedProposalPlaceholder(proposal) {
  void proposal; // retained so the future opportunity/proposal handler keeps this contract
  return 'Not implemented yet.';
}

/* Flatten every registered searchable source into one autocomplete list.
   The composer never asks the rep to enter a command submenu: `/follow`
   searches the items supplied by every registry entry immediately. */
export function searchEmailComposerEntries({ templates, proposals, query, registry = emailComposerCommandRegistry }) {
  const buckets = [];
  for (const command of registry.getCommands()) {
    if (command.source === 'account-templates') {
      buckets.push(searchAccountEmailTemplates(templates, query).map((template) => ({
          id: `${command.id}:${template.id}`,
          commandId: command.id,
          label: template.name || template.subject || 'Untitled template',
          description: command.label,
          value: template,
        })));
      continue;
    }
    if (command.source === 'saved-proposals') {
      buckets.push(searchSavedProposals(proposals, query).map((proposal) => ({
        id: `${command.id}:${proposal.id}`,
        commandId: command.id,
        label: proposal.name || 'Untitled proposal',
        description: command.label,
        value: proposal,
      })));
      continue;
    }
    if (searchableText(command).includes(String(query || '').trim().toLowerCase())) {
      buckets.push([{ ...command, commandId: command.id, value: command }]);
    }
  }
  /* Round-robin providers so an empty `/` menu shows more than the first
     provider when someone has a large account-template library. */
  const entries = [];
  const longest = Math.max(0, ...buckets.map((bucket) => bucket.length));
  for (let index = 0; index < longest; index += 1) {
    for (const bucket of buckets) if (bucket[index]) entries.push(bucket[index]);
  }
  return entries;
}

/* Resolve through the live page's existing variable engine, then use the
   canonical renderer so smart conditional blocks and {{a|b}} fallbacks
   behave exactly like the popup sender. Reply subjects deliberately remain
   attached to the opened email thread; this fills only the composer body. */
export async function evaluateAccountEmailTemplate(template, resolveVariables) {
  if (!template || template.type !== 'account') throw new Error('Select an account template');
  if (typeof resolveVariables !== 'function') throw new Error('Page template resolver is unavailable');
  const vars = template.vars || {};
  const result = await resolveVariables(vars, template.toField || { type: 'auto' });
  return {
    htmlBody: renderTemplate(template.body || '', result?.resolved || {}, vars),
    resolvedVars: result?.resolved || {},
  };
}
