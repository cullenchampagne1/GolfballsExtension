/* ───────────────────────────────────────────────────────────────
   templateFollowUpAction — one post-success custom-action pipeline
   for every executable template type.

   A saved email, order-note, task, or call-log template may reference a
   custom action through `followUpActionId`. The primary operation owns the
   success boundary; this module owns everything after it:

     1. Resolve the contact attached to the primary operation.
     2. Hydrate that contact's canonical CRM Page=240 document.
     3. Run the selected custom action against that contact page.

   The current browser page is used only as evidence for the contact ID (for
   example, an order page exposes ids.customer). It is never used as the
   custom action's execution page. A failed follow-up is returned alongside
   the successful primary result instead of rewriting that success.
─────────────────────────────────────────────────────────────── */

import { API, CRM_PAGES } from './constants.js';

export const TEMPLATE_FOLLOW_UP_ACTIONS_KEY = 'gbCustomActions';

const clean = (value) => String(value == null ? '' : value).trim();
const object = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

function numericContactId(value) {
  const id = clean(value);
  return /^\d{1,18}$/.test(id) && !/^0+$/.test(id) ? id : '';
}

function firstContactId(...values) {
  for (const value of values) {
    const id = numericContactId(value);
    if (id) return id;
  }
  return '';
}

export function templateFollowUpActionId(template = {}) {
  return clean(template?.followUpActionId);
}

export function hasTemplateFollowUpAction(template = {}) {
  return !!templateFollowUpActionId(template);
}

export function contactPageUrl(contactId) {
  const id = numericContactId(contactId);
  return id
    ? `${API.CRM_ADMIN}Default.aspx?Page=${CRM_PAGES.CONTACT_DETAIL}&customerID=${encodeURIComponent(id)}`
    : '';
}

/**
 * Resolve the contact belonging to the primary template action.
 *
 * Explicit crmContactId values win. A page-engine contact/customer id wins
 * over a generic row contactId because cached account rows historically used
 * their account id as the row key. Direct task/call contexts have no source
 * page, so their exact context.contactId remains the natural fallback.
 */
export function resolveTemplateFollowUpContact(input = {}, deps = {}) {
  const context = object(input.context);
  const contextContact = object(context.contact);
  const sourceDocument = input.document || null;
  const engine = deps.pageEngine
    || (typeof window !== 'undefined' ? window.__gbPageEngine : null);

  let extracted = input.page || input.snapshot || null;
  if (!extracted && sourceDocument && engine?.runEngine) {
    try {
      engine.clearCache?.(sourceDocument);
      extracted = engine.runEngine(sourceDocument);
    } catch {
      extracted = null;
    }
  }

  const wrapped = object(extracted);
  const data = object(wrapped.data || wrapped);
  const orderContact = object(data.order?.customer);
  const pageContact = { ...orderContact, ...object(data.contact) };
  const contactId = firstContactId(
    context.crmContactId,
    contextContact.crmContactId,
    data.ids?.contact,
    data.ids?.customer,
    data.order?.customerId,
    context.contactId,
    context.customerId,
    contextContact.contactId,
    contextContact.customerId,
    contextContact.id,
    pageContact.contactId,
    pageContact.customerId,
    pageContact.id,
  );

  if (!contactId) return null;

  const accountId = clean(
    context.accountId
    || contextContact.accountId
    || data.ids?.account
    || pageContact.accountId,
  );
  const contactName = clean(
    context.contactName
    || context.name
    || contextContact.contactName
    || contextContact.name
    || pageContact.contactName
    || pageContact.name
    || pageContact.fullName
    || [pageContact.firstName, pageContact.lastName].filter(Boolean).join(' '),
  );
  const email = clean(context.email || contextContact.email || pageContact.email);
  const phone = clean(context.phone || contextContact.phone || pageContact.phone);
  const employeeId = clean(context.employeeId || contextContact.employeeId);

  return {
    ...pageContact,
    ...contextContact,
    contactId,
    crmContactId: contactId,
    customerId: contactId,
    id: clean(contextContact.id || pageContact.id || contactId),
    contactUrl: contactPageUrl(contactId),
    ...(accountId ? { accountId } : {}),
    ...(contactName ? { contactName, name: clean(contextContact.name || pageContact.name || contactName) } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(employeeId ? { employeeId } : {}),
  };
}

export function templateFollowUpActionOptions(actions = []) {
  return [
    { id: '', label: '— none —' },
    ...(Array.isArray(actions) ? actions : [])
      .filter((action) => action && action.enabled !== false && clean(action.id))
      .map((action) => ({ id: clean(action.id), label: clean(action.name) || 'Untitled action' })),
  ];
}

export function loadTemplateFollowUpActions() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve([]);
        return;
      }
      chrome.storage.local.get(TEMPLATE_FOLLOW_UP_ACTIONS_KEY, (data) => {
        resolve(Array.isArray(data?.[TEMPLATE_FOLLOW_UP_ACTIONS_KEY])
          ? data[TEMPLATE_FOLLOW_UP_ACTIONS_KEY]
          : []);
      });
    } catch {
      resolve([]);
    }
  });
}

export function subscribeToTemplateFollowUpActions(handler) {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged?.addListener) return () => {};
    const onChanged = (changes, area) => {
      if (area !== 'local' || !changes[TEMPLATE_FOLLOW_UP_ACTIONS_KEY]) return;
      handler(Array.isArray(changes[TEMPLATE_FOLLOW_UP_ACTIONS_KEY].newValue)
        ? changes[TEMPLATE_FOLLOW_UP_ACTIONS_KEY].newValue
        : []);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  } catch {
    return () => {};
  }
}

async function hydrateContactPage(contact, audience = [contact], deps = {}) {
  const [{ hydrateWorkflowContact }, { dispatchBackgroundMessage }] = await Promise.all([
    import('./workflow/codeContext.js'),
    import('./backgroundMessage.js'),
  ]);
  return hydrateWorkflowContact(contact, audience, {
    ...deps,
    dispatch: deps.dispatch || dispatchBackgroundMessage,
    rep: {
      ...object(deps.rep),
      employeeId: clean(contact.employeeId || deps.rep?.employeeId),
    },
  });
}

/** Run one already-resolved custom action against one hydrated contact page. */
export async function runCustomActionAgainstPage({ action, page, document: sourceDocument } = {}) {
  const [sim, sandbox, bridge, live] = await Promise.all([
    import('./codeEngine/simulate.js'),
    import('./codeEngine/sandboxRunner.js'),
    import('./page-engine/sandbox-bridge.js'),
    import('./codeEngine/liveActionRun.js'),
  ]);

  /* Selecting a follow-up action on a template is the authorization for its
     automatic run. The sandbox and typed writer contracts remain identical
     to an Action Shelf run, but transient modal entry-point data is removed. */
  const executionPage = {
    ...object(page),
    entryPoints: [],
    entryPoint: null,
  };
  const runtime = await live.prepareLiveActionRuntime(
    executionPage,
    action?.source || '',
    { doc: sourceDocument },
  );
  const executor = await live.makeLiveExecutor(executionPage, {
    evaluateRef: runtime.evaluateRef,
  });
  const result = await sim.simulateProgram(action?.source || '', executionPage, {
    run: sandbox.makeSandboxRunner({
      exec: bridge.runInSandbox,
      doc: sourceDocument,
      evaluateRef: runtime.evaluateRef,
    }),
    user: runtime.user,
    executor,
    evaluateRef: runtime.evaluateRef,
  });
  const trace = Array.isArray(result?.trace) ? result.trace : [];
  const failed = trace.filter((entry) => entry?.contract && entry.status === 'failed');
  if (result?.cancelled) return { ok: false, error: 'Action was cancelled.' };
  if (result?.error) return { ok: false, error: clean(result.error) || 'Custom action failed.' };
  if (failed.length) {
    return {
      ok: false,
      error: clean(failed[0]?.errors?.[0]) || 'A custom-action step failed.',
      failed: failed.length,
    };
  }
  return {
    ok: true,
    steps: trace.filter((entry) => entry?.contract).length,
    result: typeof result?.result === 'string' ? result.result : null,
  };
}

function resultError(result, fallback) {
  return clean(
    result?.error
    || result?.reason
    || result?.message
    || (typeof result === 'string' ? result : '')
    || fallback,
  );
}

/** Resolve, hydrate, and execute the action selected on one template. */
export async function runTemplateFollowUpAction(input = {}, deps = {}) {
  const template = object(input.template);
  const actionId = templateFollowUpActionId(template);
  if (!actionId) return { ok: true, skipped: true, actionId: '', contactId: '' };

  let selected = input.action || null;
  if (!selected) {
    try {
      const loadActions = deps.loadActions || loadTemplateFollowUpActions;
      const loaded = await loadActions();
      const actions = Array.isArray(loaded) ? loaded : loaded?.customActions;
      selected = (Array.isArray(actions) ? actions : []).find((action) => (
        clean(action?.id) === actionId && action?.enabled !== false
      )) || null;
    } catch (error) {
      return {
        ok: false,
        actionId,
        contactId: '',
        error: resultError(error, 'Could not load follow-up actions.'),
      };
    }
  }

  if (!selected || clean(selected.id) !== actionId || selected.enabled === false) {
    return {
      ok: false,
      actionId,
      contactId: '',
      error: 'Selected follow-up action is disabled or no longer exists.',
    };
  }

  const contact = resolveTemplateFollowUpContact(input, deps);
  if (!contact) {
    return {
      ok: false,
      actionId,
      contactId: '',
      error: 'Could not determine the contact associated with the successful action.',
    };
  }

  let hydrated;
  try {
    const hydrate = deps.hydrateContact || hydrateContactPage;
    hydrated = await hydrate(contact, [contact], deps);
  } catch (error) {
    return {
      ok: false,
      actionId,
      contactId: contact.contactId,
      error: resultError(error, 'Could not load the associated contact page.'),
    };
  }

  if (!hydrated?.page) {
    return {
      ok: false,
      actionId,
      contactId: contact.contactId,
      error: 'Could not load the associated contact page.',
    };
  }

  let actionResult;
  try {
    const runAction = deps.runAction || runCustomActionAgainstPage;
    actionResult = await runAction({
      action: selected,
      page: hydrated.page,
      document: hydrated.context?.doc || hydrated.document || null,
      context: hydrated.context || null,
      contact,
    });
  } catch (error) {
    actionResult = { ok: false, error: resultError(error, 'Custom action failed.') };
  }

  if (!actionResult || actionResult.ok !== true) {
    return {
      ...(actionResult || {}),
      ok: false,
      actionId,
      contactId: contact.contactId,
      error: resultError(actionResult, 'Custom action failed.'),
    };
  }
  return {
    ...actionResult,
    ok: true,
    actionId,
    contactId: contact.contactId,
  };
}

/** Attach a follow-up outcome without changing the primary success result. */
export async function runTemplateFollowUpAfterSuccess(input = {}, deps = {}) {
  const primary = input.result;
  if (!primary || primary.ok !== true || !hasTemplateFollowUpAction(input.template)) return primary;

  let followUpAction;
  try {
    followUpAction = await runTemplateFollowUpAction(input, deps);
  } catch (error) {
    followUpAction = { ok: false, error: resultError(error, 'Custom action failed.') };
  }
  return { ...primary, followUpAction };
}

export function templateFollowUpActionError(result = {}) {
  return result?.followUpAction?.ok === false
    ? resultError(result.followUpAction, 'Custom action failed.')
    : '';
}
