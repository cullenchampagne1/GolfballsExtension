import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeImportedWorkflow,
  parseWorkflowBlob,
} from '../../src/lib/workflow/workflowImport.js';

describe('workflow import · code-first executable source', () => {
  it('keeps automation and delivery policy on an imported workflow', () => {
    const { workflow, warnings } = normalizeImportedWorkflow({
      name: 'CRM verification',
      automation: 'await actions.createTask({ subject: "Verify" });',
      paceDelay: 3,
      paceJitter: 1,
      sendCap: 25,
      audienceOrder: 'valueDesc',
    });

    assert.equal(workflow.name, 'CRM verification');
    assert.equal(workflow.automation, 'await actions.createTask({ subject: "Verify" });');
    assert.equal(workflow.paceDelay, 3);
    assert.equal(workflow.paceJitter, 1);
    assert.equal(workflow.sendCap, 25);
    assert.equal(workflow.audienceOrder, 'valueDesc');
    assert.deepEqual(warnings, []);
  });

  it('rejects a legacy steps-only blob instead of importing an empty workflow', () => {
    assert.throws(() => normalizeImportedWorkflow({
      name: 'Legacy only',
      steps: [{ kind: 'task', useCustom: true, custom: { subject: 'Never wired' } }],
    }), /missing executable "automation" JavaScript/);
  });

  it('rejects malformed automation before it reaches saved storage', () => {
    assert.throws(() => normalizeImportedWorkflow({
      name: 'Broken',
      automation: 'if (',
    }), /invalid automation JavaScript/);
  });

  it('parses a wrapped list and accepts code as the automation alias', () => {
    const parsed = parseWorkflowBlob(JSON.stringify({
      workflows: [{ name: 'Alias', code: 'await actions.addNote({ body: "QA" });' }],
    }));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].workflow.automation, 'await actions.addNote({ body: "QA" });');
  });

  it('does not reserve the campaigns wrapper for the workflow domain', () => {
    assert.throws(() => parseWorkflowBlob(JSON.stringify({
      campaigns: [{ name: 'Future campaign', automation: 'return "later";' }],
    })), /Workflow #1 is missing "name"/);
  });
});
