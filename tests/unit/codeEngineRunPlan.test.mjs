/**
 * runPlan — summarize what a real run will do (drives the confirm gate).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planRun, planSummary } from '../../src/lib/codeEngine/runPlan.js';

const TRACE = [
  { contract: 'evaluate', status: 'ran' },
  { contract: 'sendEmail', status: 'ran' },
  { contract: 'editContact', status: 'ran' },
  { contract: 'completeTask', status: 'ran' },
  { contract: 'addNote', status: 'ran' },
  { contract: 'createTask', status: 'skipped' },
  { contract: 'sendEmail', status: 'failed' }, // failures don't count
];

describe('runPlan', () => {
  it('counts effect steps, ignores failures, finds the strongest gate', () => {
    const plan = planRun(TRACE, 10);
    assert.equal(plan.counts.sendEmail, 1);
    assert.equal(plan.counts.editContact, 1);
    assert.equal(plan.counts.completeTask, 1);
    assert.equal(plan.counts.addNote, 1);
    assert.equal(plan.counts.createTask, 0);
    assert.equal(plan.failed, 1);
    assert.equal(plan.maxGate, 'confirm'); // outward/remote
    assert.equal(plan.perContact, 4);
    assert.equal(plan.total, 40);
    assert.equal(plan.hasEffects, true);
  });

  it('summarizes for the confirm dialog', () => {
    assert.match(planSummary(planRun(TRACE)), /1 email · 1 contact edit · 1 task completed · 1 activity note/);
    assert.equal(planSummary(planRun([{ contract: 'evaluate', status: 'ran' }])), 'no effects');
  });
});
