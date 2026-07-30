import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  workflowActionCap,
  workflowPaceMs,
  workflowSuppressionReason,
  orderWorkflowAudience,
} from '../../src/lib/workflow/runPolicy.js';

describe('workflow run policy · audience and delivery controls', () => {
  it('orders a copy by value without mutating the selected audience', () => {
    const audience = [
      { id: 'low', value: 12 },
      { id: 'high', value: 90 },
      { id: 'middle', ytd: 45 },
    ];
    const ordered = orderWorkflowAudience(audience, 'valueDesc');

    assert.deepEqual(ordered.map((row) => row.id), ['high', 'middle', 'low']);
    assert.deepEqual(audience.map((row) => row.id), ['low', 'high', 'middle']);
  });

  it('uses the injected random source for deterministic shuffling', () => {
    const ordered = orderWorkflowAudience(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      'shuffle',
      () => 0,
    );
    assert.deepEqual(ordered.map((row) => row.id), ['b', 'c', 'a']);
  });

  it('reports the first enabled suppression reason only', () => {
    const workflow = {
      suppressDoNotContact: true,
      suppressBounced: true,
      suppressMailerRemoved: true,
    };
    assert.equal(workflowSuppressionReason(workflow, {
      doNotContact: true,
      bounceCode: '550',
      mailerRemoved: true,
    }), 'do-not-contact');
    assert.equal(workflowSuppressionReason({
      ...workflow,
      suppressDoNotContact: false,
    }, {
      bounceCode: '550',
      mailerRemoved: true,
    }), 'bounced');
  });

  it('calculates bounded jitter and normalizes the run-wide action cap', () => {
    assert.equal(workflowPaceMs({ paceDelay: 10, paceJitter: 2 }, () => 0), 8_000);
    assert.equal(workflowPaceMs({ paceDelay: 10, paceJitter: 2 }, () => 1), 12_000);
    assert.equal(workflowPaceMs({ paceDelay: 0, paceJitter: 5 }, () => 0), 0);
    assert.equal(workflowActionCap({ sendCap: 3.9 }), 3);
    assert.equal(workflowActionCap({ sendCap: -8 }), 0);
  });
});
