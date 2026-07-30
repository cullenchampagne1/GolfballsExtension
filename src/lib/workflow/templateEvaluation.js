/* ───────────────────────────────────────────────────────────────
   workflow/templateEvaluation — evaluate a saved code-template reference
   against one hydrated audience record.

   Workflow code runs in an isolated iframe, so saved references cross that
   boundary as data. This adapter uses the same variable resolver and renderer
   as Email Runner before handing a plain outbound object back to the sandbox.
─────────────────────────────────────────────────────────────── */

import { directContactVariables } from '../contactImport.js';
import { makeOutbound } from '../codeEngine/runtime.js';
import { renderTemplate } from '../variableResolution.js';

async function resolveAgainstContext(context, vars, toField, resolveVariables) {
  if (typeof resolveVariables === 'function') {
    return resolveVariables({
      html: context?.html || '',
      vars,
      toField,
      url: context?.contact?.contactUrl || '',
      context,
    });
  }

  const html = context?.html || '';
  const url = context?.contact?.contactUrl || '';
  if (html && typeof window !== 'undefined' && typeof window.__gbResolveVarsForHtml === 'function') {
    return window.__gbResolveVarsForHtml(html, vars, toField, url);
  }
  if (html && typeof context?.dispatch === 'function') {
    return context.dispatch({
      action: 'resolveVarsForHtml',
      html,
      vars,
      toField,
      url,
    });
  }
  return { resolved: {}, toEmail: '' };
}

/**
 * Return the mutable outbound object consumed by actions.sendEmail /
 * createTask / logCall. Email variables and recipient selection are resolved
 * from the exact same fetched contact document used to build page.contact.
 */
export async function evaluateWorkflowTemplate(
  reference,
  context,
  { resolveVariables } = {},
) {
  const ref = reference || {};
  const outbound = makeOutbound(ref);
  const vars = outbound.vars || ref.vars || {};
  const toField = outbound.toField || ref.toField || { type: 'auto' };
  const contact = context?.contact || {};
  const directVars = directContactVariables({
    ...contact,
    contactName: context?.contactName ?? contact.contactName ?? contact.name,
    firstName: context?.firstName ?? contact.firstName,
    lastName: context?.lastName ?? contact.lastName,
    email: context?.email || contact.email,
    crmContactId: context?.contactId ?? contact.crmContactId ?? contact.contactId,
    accountId: context?.accountId ?? contact.accountId,
  }, vars);

  let resolved = { resolved: {}, toEmail: '' };
  try {
    resolved = await resolveAgainstContext(context, vars, toField, resolveVariables)
      || resolved;
  } catch (error) {
    // Rendering direct/imported variables can still be useful when the page
    // resolver is unavailable. Recipient validation remains the send helper's
    // responsibility, and the resolver error is retained for its message.
    resolved = { resolved: {}, toEmail: '', error: String(error?.message || error) };
  }

  const resolvedVars = contact.imported
    ? { ...(resolved.resolved || {}), ...directVars }
    : { ...directVars, ...(resolved.resolved || {}) };

  outbound.subject = renderTemplate(outbound.subject || '', resolvedVars, vars);
  outbound.body = renderTemplate(outbound.body || '', resolvedVars, vars);
  outbound.evaluated = true;

  if (outbound.kind === 'email') {
    const literal = toField?.type === 'literal' ? String(toField.value || '').trim() : '';
    outbound.to = contact.imported
      ? (contact.email || context?.email || literal || resolved.toEmail || '')
      : (literal || resolved.toEmail || context?.email || contact.email || '');
    if (resolved.error) outbound.resolveError = resolved.error;
  }

  return outbound;
}
