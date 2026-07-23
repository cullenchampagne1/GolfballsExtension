import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  updateVariableDefinition, variableEditorKinds,
} from '../../src/lib/templateVariableEditing.js';


describe('email template variable editing', () => {
  it('always offers proof attachments for every email template type', () => {
    const kinds = {
      order: ['schema', 'literal'],
      account: ['schema', 'code'],
      contact: ['schema'],
      case: ['selector', 'regex'],
    };
    for (const type of Object.keys(kinds)) {
      assert.deepEqual(
        variableEditorKinds(type, kinds),
        [...kinds[type], 'attachment'],
      );
    }
  });

  it('replaces a full variable definition while preserving smart behavior', () => {
    const original = [{
      name: 'proof', kind: 'schema', config: 'order.proof',
      smart: { conditional: true, scope: 'line' },
      resolved: 'old value', status: 'hit',
    }];
    const [updated] = updateVariableDefinition(original, 'proof', {
      name: 'proofAttachment', kind: 'attachment', config: 'order.proofUrl',
      attach: { mode: 'attach', source: 'schema', filename: 'proof.pdf' },
    });
    assert.equal(updated.name, 'proofAttachment');
    assert.equal(updated.kind, 'attachment');
    assert.deepEqual(updated.attach, {
      mode: 'attach', source: 'schema', filename: 'proof.pdf',
    });
    assert.deepEqual(updated.smart, { conditional: true, scope: 'line' });
    assert.equal(updated.resolved, null);
    assert.equal(updated.status, 'miss');
  });
});
