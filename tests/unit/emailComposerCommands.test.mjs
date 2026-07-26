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

  it('matches + labels templates by the spaceless code id (the / menu can\'t type spaces)', () => {
    const templates = [{ id: 'a9', type: 'account', name: 'Win-back Campaign (v2)' }];
    // the id is camelCase, numbers→words, no spaces
    assert.equal(accountEmailTemplates(templates)[0].codeId, 'WinBackCampaignVTwo');
    // typing "/WinBack" (no space) matches via the code id
    assert.deepEqual(searchAccountEmailTemplates(templates, 'WinBack').map((t) => t.id), ['a9']);
    // the entry shows the code id as its label (name kept as description)
    const [entry] = searchEmailComposerEntries({ templates, query: 'winback' });
    assert.equal(entry.label, 'WinBackCampaignVTwo');
    assert.equal(entry.description, 'Win-back Campaign (v2)');
  });

  it('evaluates variables through the live-page resolver before rendering the body', async () => {
    const calls = [];
    const template = {
      id: 'a1', type: 'account', subject: 'Following up with {{first}}', body: '<p>Hi {{first}}, your rep is {{rep}}.</p>',
      vars: { first: { type: 'schema', path: 'contact.firstName' }, rep: { type: 'code', body: 'return ctx.account.rep' } },
    };
    const result = await evaluateAccountEmailTemplate(template, async (vars, toField) => {
      calls.push({ vars, toField });
      return { resolved: { first: 'Pat', rep: 'Cullen' } };
    });
    assert.equal(result.htmlBody, '<p>Hi Pat, your rep is Cullen.</p>');
    assert.equal(result.subject, 'Following up with Pat');
    assert.deepEqual(calls[0], { vars: template.vars, toField: { type: 'auto' } });
  });
});
