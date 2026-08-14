/**
 * runPlan — summarize evaluated traces and source-only live-run plans.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pipelinePlanSummary,
  planRun,
  planRunFromPipeline,
  planSummary,
} from '../../src/lib/codeEngine/runPlan.js';

const TRACE = [
  { contract: 'evaluate', status: 'ran' },
  { contract: 'sendEmail', status: 'ran' },
  { contract: 'editContact', status: 'ran' },
  { contract: 'updateTask', status: 'ran' },
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
    assert.equal(plan.counts.updateTask, 1);
    assert.equal(plan.counts.completeTask, 1);
    assert.equal(plan.counts.addNote, 1);
    assert.equal(plan.counts.createTask, 0);
    assert.equal(plan.failed, 1);
    assert.equal(plan.maxGate, 'confirm'); // outward/remote
    assert.equal(plan.perContact, 5);
    assert.equal(plan.total, 50);
    assert.equal(plan.hasEffects, true);
  });

  it('summarizes an evaluated trace', () => {
    assert.match(planSummary(planRun(TRACE)), /1 email · 1 contact edit · 1 task edit · 1 task completed · 1 activity note/);
    assert.equal(planSummary(planRun([{ contract: 'evaluate', status: 'ran' }])), 'no effects');
  });

  it('plans a large live audience from source paths without estimating per-contact writes', () => {
    const plan = planRunFromPipeline([
      { id: 'read', contract: 'evaluate' },
      { id: 'email-branch', contract: 'sendEmail' },
      { id: 'task-loop', contract: 'createTask' },
      { id: 'return', contract: null },
    ], 2_000);

    assert.equal(plan.audienceCount, 2_000);
    assert.equal(plan.effectSteps, 2);
    assert.equal(plan.counts.sendEmail, 1);
    assert.equal(plan.counts.createTask, 1);
    assert.equal(plan.hasEffects, true);
    assert.equal(plan.exact, false);
    assert.equal(Object.hasOwn(plan, 'total'), false);
    assert.equal(
      pipelinePlanSummary(plan),
      '1 email step · 1 task-create step',
    );
  });

  it('counts opportunity resolution and both proposal writers as confirmed CRM effects', () => {
    const tracePlan = planRun([
      { contract: 'ensureOpenOpportunity', status: 'ran' },
      { contract: 'createProposalFromOrder', status: 'ran' },
      { contract: 'createProposal', status: 'ran' },
    ], 1);
    assert.equal(tracePlan.perContact, 3);
    assert.equal(tracePlan.counts.ensureOpenOpportunity, 1);
    assert.equal(tracePlan.counts.createProposalFromOrder, 1);
    assert.equal(tracePlan.counts.createProposal, 1);
    assert.match(planSummary(tracePlan), /opportunity resolved/);
    assert.match(planSummary(tracePlan), /reorder proposal created/);
    assert.match(planSummary(tracePlan), /catalog proposal created/);

    const sourcePlan = planRunFromPipeline([
      { contract: 'ensureOpenOpportunity' },
      { contract: 'createProposalFromOrder' },
      { contract: 'sendEmail' },
    ], 40);
    assert.equal(sourcePlan.effectSteps, 3);
    assert.equal(
      pipelinePlanSummary(sourcePlan),
      '1 email step · 1 open-opportunity step · 1 reorder-proposal step',
    );
  });
});
