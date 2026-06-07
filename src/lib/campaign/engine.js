/* ───────────────────────────────────────────────────────────────
   campaign/engine.js — the paced, condition-gated run engine.

   Walks the audience one contact at a time (campaign-wide pacing so a
   blast stays human). For each contact it builds a live context and
   walks the steps in order:

     • A child step (parentId set) runs only if its parent branch fired.
     • A step in a `group` is skipped once another step in that group
       has fired (mutual exclusion).
     • A step runs only if its conditions tree passes (evalTree).
     • When a branch step fires it runs its children, then STOPS the
       contact's main path (matches "stops after first branch sends").

   Side-effects are delegated to actions.js; nothing here re-implements
   send/log/task. Dry-run flows through actions.js, which short-circuits
   before any real CRM call.

   Control + progress are injected so the UI (Phase 3) can drive
   pause/resume/stop and render live status. Pure logic otherwise.
─────────────────────────────────────────────────────────────── */

import { evalTree } from '../matchEngine.js';
import { buildContactContext } from './context.js';
import { runStepAction, pickStepTemplate } from './actions.js';

const noop = () => {};
const storeKindOf = (step) => (step.kind === 'branch' ? 'email' : step.kind);

function sleep(ms, control) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (control?.isStopped?.()) { resolve('stopped'); return; }
      if (Date.now() - start >= ms) { resolve('done'); return; }
      setTimeout(tick, Math.min(120, ms));
    };
    tick();
  });
}

async function waitWhilePaused(control) {
  while (control?.isPaused?.() && !control?.isStopped?.()) {
    await new Promise((r) => setTimeout(r, 120));
  }
}

function paceMs(campaign) {
  const base = Math.max(0, Number(campaign.paceDelay) || 0) * 1000;
  const jit = Math.max(0, Number(campaign.paceJitter) || 0) * 1000;
  return base + (jit ? (Math.random() * 2 - 1) * jit : 0);
}

/**
 * Run a campaign against an audience.
 *
 * @param opts.campaign   { steps, paceDelay, paceJitter, ... }
 * @param opts.audience   contact[] (each: { contactUrl, contactId?, name?, email? })
 * @param opts.lookupTemplate (storeKind:'email'|'call'|'task', templateId) => templateObj|null
 * @param opts.deps       { rep, emailConfig, signature, fromLocalPart, dispatch, dryRun?, signalScrapers? }
 * @param opts.control    { isPaused():bool, isStopped():bool }
 * @param opts.on         { contactStart, stepResult, contactDone, progress, complete }
 * @returns {Promise<{ stopped:boolean, results: object[] }>}
 */
export async function runCampaign({ campaign, audience, lookupTemplate, deps = {}, control = {}, on = {} }) {
  const steps = Array.isArray(campaign?.steps) ? campaign.steps : [];
  const onContactStart = on.contactStart || noop;
  const onStepResult = on.stepResult || noop;
  const onContactDone = on.contactDone || noop;
  const onProgress = on.progress || noop;
  const onComplete = on.complete || noop;

  // The context builder is injectable so dry-run / mock runs (and tests)
  // can supply a context without a live CRM fetch; defaults to the real one.
  const makeContext = deps.buildContext || buildContactContext;

  const results = [];
  const total = audience.length;
  let sentSomethingForPrev = false; // pace only between contacts that did work

  for (let i = 0; i < total; i++) {
    if (control.isStopped?.()) break;
    await waitWhilePaused(control);
    if (control.isStopped?.()) break;

    // Pace between contacts that actually performed a send.
    if (i > 0 && sentSomethingForPrev && !deps.dryRun) {
      const r = await sleep(paceMs(campaign), control);
      if (r === 'stopped') break;
    }

    const contact = audience[i];
    onContactStart(contact, i);
    onProgress({ done: i, total });

    const ctx = await makeContext(contact, deps);
    const firedBranches = new Set();
    const firedGroups = new Set();
    const stepLog = [];
    let stopMain = false;
    let didSend = false;

    for (const step of steps) {
      if (control.isStopped?.()) break;
      await waitWhilePaused(control);

      const isChild = !!step.parentId;
      if (stopMain && !isChild) break; // a branch fired — no more main steps

      const emit = (status, extra) => {
        const entry = { contactId: ctx.contactId || contact.contactId, stepId: step.id, kind: step.kind, label: step.label, status, ...extra };
        stepLog.push(entry);
        onStepResult({ contact, step, ...entry });
      };

      if (isChild && !firedBranches.has(step.parentId)) { emit('skipped', { reason: 'branch-not-taken' }); continue; }
      if (step.group && firedGroups.has(step.group)) { emit('skipped', { reason: 'group-already-fired' }); continue; }

      let pass = true;
      try { pass = await evalTree(step.conditions, ctx.getValue); }
      catch { pass = false; }
      if (!pass) { emit('skipped', { reason: 'conditions' }); continue; }

      const row = pickStepTemplate(step);
      const tpl = row ? lookupTemplate?.(storeKindOf(step), row.templateId) : null;
      const res = await runStepAction(step, tpl, ctx, { dryRun: deps.dryRun });

      if (res.ok) {
        emit('ran', { transport: res.transport, detail: res.detail, templateId: row?.templateId });
        if (step.group) firedGroups.add(step.group);
        if (step.branch) { firedBranches.add(step.id); stopMain = true; }
        if (!deps.dryRun) didSend = true;
      } else {
        emit('failed', { error: res.error, templateId: row?.templateId });
      }
    }

    const ran = stepLog.filter((s) => s.status === 'ran').length;
    const skipped = stepLog.filter((s) => s.status === 'skipped').length;
    const failed = stepLog.filter((s) => s.status === 'failed').length;
    const summary = { contact, contactId: ctx.contactId, ran, skipped, failed, stoppedAtBranch: stopMain, error: ctx.error, steps: stepLog };
    results.push(summary);
    onContactDone(summary);
    sentSomethingForPrev = didSend;
    onProgress({ done: i + 1, total });
  }

  const stopped = !!control.isStopped?.();
  onComplete({ stopped, results });
  return { stopped, results };
}
