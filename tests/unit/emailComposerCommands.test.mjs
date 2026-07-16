import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  accountEmailTemplates,
  emailComposerCommandRegistry,
  evaluateAccountEmailTemplate,
  searchAccountEmailTemplates,
  searchEmailComposerEntries,
  savedProposalPlaceholder,
  searchSavedProposals,
  searchEmailComposerCommands,
} = await import('../../src/lib/emailComposerCommands.js');

describe('email composer slash commands', () => {
  it('registers and searches the account-template command', () => {
    assert.equal(emailComposerCommandRegistry.get('account-templates')?.label, 'Account templates');
    assert.deepEqual(searchEmailComposerCommands('saved').map((item) => item.id), ['account-templates', 'saved-proposals']);
    assert.equal(emailComposerCommandRegistry.get('saved-proposals')?.label, 'Saved proposals');
  });

  it('searches saved proposals and builds the temporary insertion text', () => {
    const proposals = [
      { id: 'p1', name: 'Titleist Event Quote' },
      { id: 'p2', name: 'Srixon Reorder' },
    ];
    assert.deepEqual(searchSavedProposals(proposals, 'event').map((item) => item.id), ['p1']);
    assert.equal(savedProposalPlaceholder(proposals[0]), 'Not implemented yet.');
    assert.deepEqual(
      searchEmailComposerEntries({ templates: [], proposals, query: 'srixon' }).map((item) => item.commandId),
      ['saved-proposals'],
    );
  });

  it('searches only enabled account templates', () => {
    const templates = [
      { id: 'a1', type: 'account', name: 'Re-order follow-up' },
      { id: 'a2', type: 'account', name: 'Disabled', enabled: false },
      { id: 'o1', type: 'order', name: 'Order update' },
    ];
    assert.deepEqual(accountEmailTemplates(templates).map((item) => item.id), ['a1']);
    assert.deepEqual(searchAccountEmailTemplates(templates, 'follow').map((item) => item.id), ['a1']);
    assert.deepEqual(
      searchEmailComposerEntries({ templates, query: 'follow' }).map((item) => [item.commandId, item.value.id]),
      [['account-templates', 'a1']],
    );
  });

  it('evaluates variables through the live-page resolver before rendering the body', async () => {
    const calls = [];
    const template = {
      id: 'a1', type: 'account', body: '<p>Hi {{first}}, your rep is {{rep}}.</p>',
      vars: { first: { type: 'schema', path: 'contact.firstName' }, rep: { type: 'code', body: 'return ctx.account.rep' } },
    };
    const result = await evaluateAccountEmailTemplate(template, async (vars, toField) => {
      calls.push({ vars, toField });
      return { resolved: { first: 'Pat', rep: 'Cullen' } };
    });
    assert.equal(result.htmlBody, '<p>Hi Pat, your rep is Cullen.</p>');
    assert.deepEqual(calls[0], { vars: template.vars, toField: { type: 'auto' } });
  });
});
