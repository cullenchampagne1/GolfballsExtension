/* ───────────────────────────────────────────────────────────────
   codeEngine/runPlan — summarize what a REAL run will do.

   A dry simulation produces a trace of would-be steps. Before a live run
   actually sends/writes, we show the rep exactly what will happen and the
   strongest gate required, so nothing outward/irreversible fires without
   an explicit confirm. Pure: trace in, plan out.
─────────────────────────────────────────────────────────────── */

import { contractGate } from './contracts.js';

const GATE_RANK = { auto: 0, confirm: 1, hard: 2 };
const EFFECT_CONTRACTS = ['sendEmail', 'createTask', 'logCall', 'addNote', 'updateTask', 'completeTask', 'editContact'];

/**
 * @param {Array<{contract:string, status:string}>} trace  simulateProgram trace
 * @param {number} audienceCount  how many contacts a real run would sweep
 */
export function planRun(trace, audienceCount = 1) {
  const counts = Object.create(null);
  for (const c of EFFECT_CONTRACTS) counts[c] = 0;
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
    + counts.updateTask + counts.completeTask + counts.editContact;
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

/** Human one-liner for the confirm dialog (per-contact figures). */
export function planSummary(plan) {
  const c = plan.counts;
  const parts = [];
  if (c.sendEmail) parts.push(plural(c.sendEmail, 'email'));
  if (c.editContact) parts.push(plural(c.editContact, 'contact edit'));
  if (c.updateTask) parts.push(plural(c.updateTask, 'task edit'));
  if (c.completeTask) parts.push(`${plural(c.completeTask, 'task')} completed`);
  if (c.createTask) parts.push(`${plural(c.createTask, 'task')} created`);
  if (c.logCall) parts.push(plural(c.logCall, 'call log'));
  if (c.addNote) parts.push(plural(c.addNote, 'activity note'));
  return parts.join(' · ') || 'no effects';
}
