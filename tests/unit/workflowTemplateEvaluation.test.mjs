import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateWorkflowTemplate } from '../../src/lib/workflow/templateEvaluation.js';

describe('workflow template evaluation · hydrated record rendering', () => {
  it('renders saved variables and recipient selection for the current contact', async () => {
    const outbound = await evaluateWorkflowTemplate({
      id: 'e2',
      name: 'Personal hello',
      kind: 'email',
      subject: 'Hello {{firstName}}',
      body: '<p>{{accountName}}</p>',
      vars: {
        firstName: { type: 'builtin', builtin: 'firstName' },
        accountName: { type: 'builtin', builtin: 'accountName' },
      },
      toField: { type: 'auto' },
      replyMode: 'reply',
    }, {
      contact: { contactUrl: 'https://crm.test/contact/7' },
      html: '<html></html>',
      email: 'fallback@example.test',
    }, {
      resolveVariables: async () => ({
        resolved: { firstName: 'Ada', accountName: 'Analytical Engines' },
        toEmail: 'ada@example.test',
      }),
    });

    assert.equal(outbound.subject, 'Hello Ada');
    assert.equal(outbound.body, '<p>Analytical Engines</p>');
    assert.equal(outbound.to, 'ada@example.test');
    assert.equal(outbound.replyMode, 'reply');
    assert.equal(outbound.evaluated, true);
  });

  it('prefers explicit imported values and the imported recipient', async () => {
    const outbound = await evaluateWorkflowTemplate({
      id: 'e3',
      name: 'Imported contact',
      kind: 'email',
      subject: 'Hello {{first_name}}',
      body: '<p>{{custom_column}}</p>',
      vars: {
        first_name: { type: 'schema', path: 'contact.firstName' },
        custom_column: { type: 'literal', value: 'resolver fallback' },
      },
      toField: { type: 'literal', value: 'literal@example.test' },
    }, {
      contact: {
        imported: true,
        firstName: 'Grace',
        email: 'grace@example.test',
        importVariables: { custom_column: 'Imported value' },
      },
      email: 'grace@example.test',
      html: '',
    }, {
      resolveVariables: async () => ({
        resolved: { first_name: 'Wrong', custom_column: 'Wrong' },
        toEmail: 'resolved@example.test',
      }),
    });

    assert.equal(outbound.subject, 'Hello Grace');
    assert.equal(outbound.body, '<p>Imported value</p>');
    assert.equal(outbound.to, 'grace@example.test');
  });
});
