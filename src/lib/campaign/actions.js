/* ───────────────────────────────────────────────────────────────
   campaign/actions.js — the delegation layer.

   Campaign steps don't re-implement send/log/task logic; they CALL
   the headless APIs we already built. This module maps a step's kind
   to the right delegated action and normalizes the result to one
   shape: { ok, transport?, detail?, error? }.

     email  → sendEmail        (src/lib/emailSender.js)
     call   → submitCallLog    (src/lib/submitCallLog.js)
     task   → submitQuickTask  (src/lib/submitQuickTask.js)
     branch → behaves like an email send; the ENGINE owns the
              "stop + run children" semantics, not the action.

   Dry-run short-circuits BEFORE any real side-effect and returns a
   simulated success with a human-readable `detail`, so the run view
   can show exactly what WOULD happen without touching the CRM.

   Template selection (A/B split) lives here too: pickStepTemplate
   rolls one of step.templates weighted by its pct.
─────────────────────────────────────────────────────────────── */

import { sendEmail } from '../emailSender.js';
import { submitCallLog } from '../submitCallLog.js';
import { submitQuickTask } from '../submitQuickTask.js';
import { renderTemplate } from '../variableResolution.js';
import { pickFromAddress } from '../sender.js';

/* Weighted random pick — same algorithm EmailRunner's variation
   picker uses. `weightOf(item)` returns the item's weight; zero/missing
   weights are excluded. Falls back to a uniform pick when all weights
   are zero so a misconfigured split still rotates. */
export function pickWeighted(items, weightOf) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const total = items.reduce((s, it) => s + Math.max(0, weightOf(it) || 0), 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let roll = Math.random() * total;
  for (const it of items) {
    const w = Math.max(0, weightOf(it) || 0);
    if (roll < w) return it;
    roll -= w;
  }
  return items[items.length - 1];
}

/* Roll one of a step's template splits weighted by pct. Returns the
   chosen { id, templateId, pct } row (or null when the step has none). */
export function pickStepTemplate(step) {
  const rows = (step.templates || []).filter((t) => t && t.templateId);
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  return pickWeighted(rows, (t) => t.pct);
}

/* The delegated side-effect kind for a step. A branch sends like an
   email; everything else maps to itself. */
function actionKind(step) {
  return step.kind === 'branch' ? 'email' : step.kind;
}

/* Resolve template variables against the already-fetched contact HTML.
   Prefers the in-realm global (same path EmailRunner uses) and falls
   back to the background message when it isn't present. */
async function resolveVarsForHtml(ctx, vars, toField) {
  const url = ctx.contact?.contactUrl || '';
  if (typeof window !== 'undefined' && typeof window.__gbResolveVarsForHtml === 'function') {
    return window.__gbResolveVarsForHtml(ctx.html, vars, toField, url);
  }
  const r = await ctx.dispatch({ action: 'resolveVarsForHtml', html: ctx.html, vars, toField, url });
  return r || { resolved: {}, toEmail: '' };
}

async function runEmail(step, template, ctx, { dryRun }) {
  const vars = template.vars || {};
  const toField = template.toField || { type: 'auto' };

  if (dryRun) {
    // Resolve the recipient so the dry-run line is concrete, but send nothing.
    let toEmail = ctx.contact?.email || '';
    try { toEmail = (await resolveVarsForHtml(ctx, vars, toField))?.toEmail || toEmail; } catch { /* */ }
    return { ok: true, transport: 'dry', detail: `Would email ${toEmail || 'recipient'} · ${template.name || 'template'}` };
  }

  const resolved = await resolveVarsForHtml(ctx, vars, toField);
  const resolvedVars = resolved?.resolved || {};
  const toEmail = resolved?.toEmail || '';
  if (resolved?.error) return { ok: false, error: `Resolve failed: ${resolved.error}` };
  if (!toEmail) return { ok: false, error: 'No recipient email resolved' };

  const subject = renderTemplate(template.subject || '', resolvedVars, vars);
  const htmlBody = renderTemplate(template.body || '', resolvedVars, vars);
  const from = pickFromAddress(template, ctx.fromLocalPart);

  const res = await sendEmail(
    { from, to: toEmail, subject, htmlBody, replyMode: template.replyMode || 'standalone', signature: ctx.signature || '', config: ctx.emailConfig },
    { dispatch: ctx.dispatch },
  );
  if (res.state === 'sent' || res.state === 'opened') {
    return { ok: true, transport: res.transport, detail: `${res.transport === 'mailto' ? 'Opened' : 'Sent'} → ${toEmail}` };
  }
  return { ok: false, error: res.error || 'Send failed' };
}

async function runCall(step, template, ctx, { dryRun }) {
  if (dryRun) return { ok: true, transport: 'dry', detail: `Would log call · ${template.name || 'template'}` };
  const res = await submitCallLog({
    template,
    context: { contactId: ctx.contactId, phone: ctx.phone, employeeId: ctx.employeeId, contactName: ctx.contactName },
  });
  return res.ok ? { ok: true, detail: 'Call logged' } : { ok: false, error: res.error };
}

async function runTask(step, template, ctx, { dryRun }) {
  if (dryRun) return { ok: true, transport: 'dry', detail: `Would create task · ${template.name || 'template'}` };
  const res = await submitQuickTask({
    template,
    context: { contactId: ctx.contactId, employeeId: ctx.employeeId, contactName: ctx.contactName, accountId: ctx.accountId },
  });
  return res.ok ? { ok: true, detail: res.taskId ? `Task #${res.taskId}` : 'Task created' } : { ok: false, error: res.error };
}

/**
 * Run a single step's delegated action for one contact.
 *
 * @param step      the campaign step
 * @param template  the resolved template OBJECT for this run (the engine
 *                  looks it up from the right store by the rolled
 *                  pickStepTemplate().templateId)
 * @param ctx       per-contact context (see campaign/context.js): {
 *                    contact, html, contactId, employeeId, phone,
 *                    contactName, accountId, emailConfig, signature,
 *                    fromLocalPart, dispatch }
 * @param opts      { dryRun }
 * @returns {Promise<{ ok, transport?, detail?, error? }>}
 */
export async function runStepAction(step, template, ctx, opts = {}) {
  if (!template) return { ok: false, error: 'No template selected for this step' };
  const kind = actionKind(step);
  try {
    if (kind === 'email') return await runEmail(step, template, ctx, opts);
    if (kind === 'call') return await runCall(step, template, ctx, opts);
    if (kind === 'task') return await runTask(step, template, ctx, opts);
    return { ok: false, error: `Unknown step kind: ${step.kind}` };
  } catch (e) {
    return { ok: false, error: e?.message || 'Action threw' };
  }
}

/* Which template store a step's templateId resolves against, so the
   engine/UI can load the right list. */
export function templateStoreForKind(kind) {
  if (kind === 'call') return 'call';   // noteTemplates · subType call_log
  if (kind === 'task') return 'task';   // noteTemplates · subType task
  return 'email';                        // templates
}
