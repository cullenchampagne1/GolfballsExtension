import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  allowLocalWorkflowUsage, filterWorkflowLibrary, reconcileWorkflowBucket,
  shareableWorkflow, workflowBucketWrite, workflowsFromShare,
} from '../../src/lib/workflow/distribution.js';

const workflow = {
  id: 'wf_local', name: 'Two-year follow-up', status: 'Active',
  paceDelay: 12, paceJitter: 4, automation: 'return "done";', steps: [],
  managedWorkflowEnrollment: true,
};

describe('workflow distribution · customer links and managed bucket', () => {
  it('removes local and managed bookkeeping from a customer share', () => {
    const shared = shareableWorkflow({
      ...workflow, lastSaved: '2026-09-15T12:00:00Z',
      managedWorkflow: { kind: 'revstack-managed-workflow', bucketId: 'secret' },
    });
    assert.equal(shared.id, undefined);
    assert.equal(shared.lastSaved, undefined);
    assert.equal(shared.managedWorkflow, undefined);
    assert.equal(shared.automation, 'return "done";');
  });

  it('validates a workflow settings link through the executable importer', () => {
    const imported = workflowsFromShare({
      scopes: { workflows: { workflows: [shareableWorkflow(workflow)] } },
    });
    assert.equal(imported.length, 1);
    assert.equal(imported[0].workflow.name, 'Two-year follow-up');
    assert.notEqual(imported[0].workflow.id, workflow.id);
    assert.throws(() => workflowsFromShare({ scopes: {} }), /does not contain a workflow/);
  });

  it('reconciles parent sources and locks customer mirrors', () => {
    const rows = reconcileWorkflowBucket([], {
      is_parent: false,
      workflows: [{
        id: 'A'.repeat(32), client_workflow_id: 'wf_local', version: 2,
        workflow: shareableWorkflow(workflow), created_by: 'Sales Ops',
        last_editor: 'Sales Ops', created_by_current: false,
        updated_at: '2026-09-15T12:00:00',
      }],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].managedWorkflow.editable, false);
    assert.equal(rows[0].managedWorkflow.version, 2);
    assert.equal(rows[0].managedWorkflow.createdBy, 'Sales Ops');
  });

  it('publishes optimistic merge metadata with the workflow document', () => {
    const write = workflowBucketWrite({
      ...workflow,
      managedWorkflow: {
        kind: 'revstack-managed-workflow', bucketId: 'B'.repeat(32),
        clientWorkflowId: 'wf_local', version: 3,
        snapshot: { name: 'Earlier', automation: 'return 1;' },
      },
    });
    assert.equal(write.bucket_id, 'B'.repeat(32));
    assert.equal(write.base_version, 3);
    assert.equal(write.base_workflow.name, 'Earlier');
    assert.equal(write.workflow.name, 'Two-year follow-up');
  });

  it('preserves private rows but hides them when local workflow usage is disabled', () => {
    const managed = reconcileWorkflowBucket([], {
      is_parent: false,
      workflows: [{
        id: 'C'.repeat(32), client_workflow_id: 'managed', version: 1,
        workflow: shareableWorkflow(workflow), created_by: 'Management',
        last_editor: 'Management', created_by_current: false,
      }],
    })[0];
    const settings = { 'workflows.allowLocalUsage': false };
    assert.equal(allowLocalWorkflowUsage(settings), false);
    assert.deepEqual(filterWorkflowLibrary([workflow, managed], settings), [managed]);
    assert.equal(allowLocalWorkflowUsage({
      ...settings, 'emailTemplates.allowParentAccount': true,
    }), true);
  });
});
