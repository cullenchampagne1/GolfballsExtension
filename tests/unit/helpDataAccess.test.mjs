import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createChrome, createContext, loadScript } from '../integration/helpers/harness.mjs';

function loadPolicy() {
  const { chrome } = createChrome();
  const context = createContext({ chrome, fetchImpl: async () => new Response('{}') });
  loadScript(context, 'help/help-data-access.js');
  return context.GBHelpDataAccess;
}

describe('Help Companion approved local data', () => {
  it('filters registered email metadata locally and returns a bounded safe projection', () => {
    const Data = loadPolicy();
    const result = Data.filterEmailTemplates([
      {
        id: 'tpl-order-follow-up', name: 'Order follow up', type: 'order', enabled: true,
        subject: 'Checking on your order', body: '<p>Private customer wording</p>',
      },
      { id: 'tpl-case-follow-up', name: 'Case follow up', type: 'case', enabled: true, subject: 'Case update' },
      { id: 'tpl-disabled', name: 'Order archived', type: 'order', enabled: false, subject: 'Old' },
    ], {
      type: 'request_data_access', target: 'email_templates', value: 'follow up',
      options: ['type:order', 'state:enabled', 'fields:metadata', 'limit:5'],
      label: 'Find my order follow-up template',
    });

    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].id, 'tpl-order-follow-up');
    assert.match(result.resources[0].summary, /Subject: Checking on your order/);
    assert.doesNotMatch(result.resources[0].summary, /Private customer wording/);
    assert.equal(result.truncated, false);
  });

  it('shares body text only when explicitly requested and rejects invented filters', () => {
    const Data = loadPolicy();
    const result = Data.filterEmailTemplates([
      { id: 'tpl-contact', name: 'Contact note', type: 'contact', body: '<p>Hello <b>there</b></p>' },
    ], {
      type: 'request_data_access', target: 'email_templates', value: '*',
      options: ['type:any', 'state:any', 'fields:content', 'limit:10'],
    });
    assert.match(result.resources[0].summary, /Body: Hello there/);
    assert.throws(() => Data.planRequest({
      type: 'request_data_access', target: 'email_templates', value: '*',
      options: ['fields:everything'],
    }), /unsupported filter/);
  });

  it('filters saved notes by subtype and exposes content only after content approval', () => {
    const Data = loadPolicy();
    const storage = {
      noteTemplates: [
        {
          id: 'note-proof-requested', name: 'Proof requested', subType: 'note',
          subject: 'Art update', body: 'Customer approved the revised proof.', enabled: true,
        },
        { id: 'task-proof-follow-up', name: 'Proof follow up', subType: 'task', body: 'Check tomorrow.' },
      ],
    };
    const metadata = Data.filterResources(storage, {
      type: 'request_data_access', target: 'note_templates', value: 'proof requested',
      options: ['subtype:note', 'state:enabled', 'fields:metadata', 'limit:5'],
    });
    assert.equal(metadata.resources.length, 1);
    assert.equal(metadata.resources[0].kind, 'note_template');
    assert.doesNotMatch(metadata.resources[0].summary, /Customer approved/);

    const content = Data.filterResources(storage, {
      type: 'request_data_access', target: 'note_templates', value: 'proof requested',
      options: ['subtype:note', 'state:enabled', 'fields:content', 'limit:5'],
    });
    assert.match(content.resources[0].summary, /Customer approved the revised proof/);
    assert.equal(JSON.stringify(Data.storageKeys(content.plan)), JSON.stringify(['noteTemplates']));
  });
});
