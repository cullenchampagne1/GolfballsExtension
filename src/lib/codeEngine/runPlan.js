/* ───────────────────────────────────────────────────────────────
   codeEngine/runPlan — summarize simulations and live-run source paths.

   Trace plans describe what one completed simulation actually did. Pipeline
   plans describe which write paths exist in source without loading a CRM
   record; the live runner then evaluates every contact exactly once. Both
   projections retain the strongest explicit-confirmation gate.
─────────────────────────────────────────────────────────────── */

import { contractGate } from './contracts.js';

const GATE_RANK = { auto: 0, confirm: 1, hard: 2 };
const EFFECT_CONTRACTS = [
  'sendEmail', 'createTask', 'logCall', 'addNote', 'updateTask', 'completeTask',
  'updateOpportunity', 'createOpportunity', 'editContact',
];

function emptyCounts() {
  const counts = Object.create(null);
  for (const contract of EFFECT_CONTRACTS) counts[contract] = 0;
  return counts;
}

/**
 * @param {Array<{contract:string, status:string}>} trace  simulateProgram trace
 * @param {number} audienceCount  how many contacts a real run would sweep
 */
export function planRun(trace, audienceCount = 1) {
  const counts = emptyCounts();
  let maxGate = 'auto';
  let failed = 0;
  for (const t of Array.isArray(trace) ? trace : []) {
    if (t.status === 'failed') { failed += 1; continue; }
    if (t.status !== 'ran') continue;
    if (counts[t.contract] != null) counts[t.contract] += 1;
    const g = contractGate(t.contract);
    if (g && GATE_RANK[g] > GATE_RANK[maxGate]) maxGate = g;
  }
  const outward = counts.sendEmail;
  const writes = counts.createTask + counts.logCall + counts.addNote
    + counts.updateTask + counts.completeTask + counts.updateOpportunity
    + counts.createOpportunity + counts.editContact;
  const perContact = outward + writes;
  return {
    counts,
    maxGate,           // 'auto' | 'confirm' | 'hard'
    failed,
    perContact,        // effect steps for one contact
    audienceCount,
    total: perContact * Math.max(1, audienceCount),
    hasEffects: perContact > 0,
  };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Human one-liner for an already-evaluated trace (per-contact figures). */
export function planSummary(plan) {
  const c = plan.counts;
  const parts = [];
  if (c.sendEmail) parts.push(plural(c.sendEmail, 'email'));
  if (c.editContact) parts.push(plural(c.editContact, 'contact edit'));
  if (c.updateTask) parts.push(plural(c.updateTask, 'task edit'));
  if (c.completeTask) parts.push(`${plural(c.completeTask, 'task')} completed`);
  if (c.createTask) parts.push(`${plural(c.createTask, 'task')} created`);
  if (c.updateOpportunity) parts.push(plural(c.updateOpportunity, 'opportunity edit'));
  if (c.createOpportunity) parts.push(`${plural(c.createOpportunity, 'opportunity')} created`);
  if (c.logCall) parts.push(plural(c.logCall, 'call log'));
  if (c.addNote) parts.push(plural(c.addNote, 'activity note'));
  return parts.join(' · ') || 'no effects';
}

/**
 * Build the live-run confirmation from the already-parsed source pipeline.
 *
 * Unlike `planRun(trace)`, this never evaluates a contact. Counts describe
 * source-level write paths only: conditions may skip them and loops may run a
 * path more than once. The real runner remains the sole place records are
 * hydrated and effects are decided.
 */
export function planRunFromPipeline(pipeline, audienceCount = 1) {
  const counts = emptyCounts();
  let maxGate = 'auto';
  for (const step of Array.isArray(pipeline) ? pipeline : []) {
    const contract = step?.contract;
    if (counts[contract] == null) continue;
    counts[contract] += 1;
    const gate = contractGate(contract);
    if (gate && GATE_RANK[gate] > GATE_RANK[maxGate]) maxGate = gate;
  }
  const effectSteps = EFFECT_CONTRACTS.reduce((total, contract) => total + counts[contract], 0);
  return {
    counts,
    maxGate,
    effectSteps,
    audienceCount: Math.max(0, Math.floor(Number(audienceCount) || 0)),
    hasEffects: effectSteps > 0,
    exact: false,
  };
}

/** Human summary of source-level action paths (never an audience estimate). */
export function pipelinePlanSummary(plan) {
  const c = plan?.counts || {};
  const parts = [];
  if (c.sendEmail) parts.push(plural(c.sendEmail, 'email step'));
  if (c.editContact) parts.push(plural(c.editContact, 'contact-edit step'));
  if (c.updateTask) parts.push(plural(c.updateTask, 'task-edit step'));
  if (c.completeTask) parts.push(plural(c.completeTask, 'task-completion step'));
  if (c.createTask) parts.push(plural(c.createTask, 'task-create step'));
  if (c.updateOpportunity) parts.push(plural(c.updateOpportunity, 'opportunity-edit step'));
  if (c.createOpportunity) parts.push(plural(c.createOpportunity, 'opportunity-create step'));
  if (c.logCall) parts.push(plural(c.logCall, 'call-log step'));
  if (c.addNote) parts.push(plural(c.addNote, 'activity-note step'));
  return parts.join(' · ') || 'no CRM write paths';
}
