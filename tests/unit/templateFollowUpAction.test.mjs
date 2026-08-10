import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  contactPageUrl,
  resolveTemplateFollowUpContact,
  runTemplateFollowUpAction,
  runTemplateFollowUpAfterSuccess,
  templateFollowUpActionError,
  templateFollowUpActionId,
  templateFollowUpActionOptions,
} from '../../src/lib/templateFollowUpAction.js';

describe('template follow-up action · contact identity', () => {
  it('normalizes the saved action reference and canonical contact URL', () => {
    assert.equal(templateFollowUpActionId({ followUpActionId: ' action_7 ' }), 'action_7');
    assert.equal(
      contactPageUrl('42'),
      'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=42',
    );
    assert.equal(contactPageUrl('not-an-id'), '');
  });

  it('uses an order customer instead of an unrelated generic row id', () => {
    const contact = resolveTemplateFollowUpContact({
      context: { contactId: '700', contactName: 'Ada Lovelace' },
      page: {
        data: {
          ids: { order: '5001', customer: '42' },
          order: {
            customerId: '42',
            customer: { fullName: 'Ada Lovelace', email: 'ada@example.com' },
          },
        },
      },
    });

    assert.equal(contact.contactId, '42');
    assert.equal(contact.crmContactId, '42');
    assert.equal(contact.email, 'ada@example.com');
    assert.match(contact.contactUrl, /Page=240&customerID=42$/);
  });

  it('builds dropdown options from enabled saved actions only', () => {
    assert.deepEqual(templateFollowUpActionOptions([
      { id: 'a1', name: 'Create opportunity', enabled: true },
      { id: 'a2', name: 'Disabled', enabled: false },
      { id: ' a3 ', name: '' },
    ]), [
      { id: '', label: '— none —' },
      { id: 'a1', label: 'Create opportunity' },
      { id: 'a3', label: 'Untitled action' },
    ]);
  });
});

describe('template follow-up action · contact-page execution', () => {
  it('hydrates Page=240 and runs against it instead of the source order page', async () => {
    const sourcePage = {
      ids: { order: '5001', customer: '42' },
      order: { customerId: '42', customer: { fullName: 'Ada Lovelace' } },
    };
    const contactPage = {
      ids: { contact: '42' },
      contact: { contactId: '42', firstName: 'Ada', lastName: 'Lovelace' },
      activities: [{ id: 'activity_1' }],
    };
    const contactDocument = { kind: 'hydrated-contact-document' };
    const calls = [];

    const result = await runTemplateFollowUpAction({
      template: { followUpActionId: 'action_1' },
      page: sourcePage,
    }, {
      loadActions: async () => [{ id: 'action_1', name: 'Advance contact', enabled: true, source: 'return "done";' }],
      hydrateContact: async (contact, audience) => {
        calls.push(['hydrate', contact.contactUrl, audience[0].contactId]);
        return { context: { doc: contactDocument }, page: contactPage };
      },
      runAction: async ({ action, page, document, contact }) => {
        calls.push(['run', action.id, page, document, contact.contactId]);
        return { ok: true, steps: 2 };
      },
    });

    assert.deepEqual(calls[0], [
      'hydrate',
      'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=42',
      '42',
    ]);
    assert.equal(calls[1][0], 'run');
    assert.equal(calls[1][1], 'action_1');
    assert.equal(calls[1][2], contactPage);
    assert.notEqual(calls[1][2], sourcePage);
    assert.equal(calls[1][3], contactDocument);
    assert.equal(calls[1][4], '42');
    assert.deepEqual(result, {
      ok: true,
      steps: 2,
      actionId: 'action_1',
      contactId: '42',
    });
  });

  it('passes injected context dependencies through the production hydrator', async () => {
    let contextUrl = '';
    let executedContactId = '';
    const result = await runTemplateFollowUpAction({
      template: { followUpActionId: 'action_1' },
      context: { crmContactId: '84', contactName: 'Grace Hopper' },
    }, {
      loadActions: async () => [{ id: 'action_1', enabled: true, source: '' }],
      dispatch: async () => ({ ok: true, text: '' }),
      buildContext: async (contact, deps) => {
        contextUrl = contact.contactUrl;
        assert.equal(typeof deps.dispatch, 'function');
        return {
          contact,
          contactId: '84',
          contactName: 'Grace Hopper',
          data: { ids: { contact: '84' }, contact: { firstName: 'Grace', lastName: 'Hopper' } },
          doc: { kind: 'contact-doc' },
        };
      },
      runAction: async ({ page }) => {
        executedContactId = page.contact.contactId;
        return { ok: true };
      },
    });

    assert.equal(contextUrl, 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=84');
    assert.equal(executedContactId, '84');
    assert.equal(result.ok, true);
  });

  it('fails closed when the selected action or associated contact is missing', async () => {
    const missingAction = await runTemplateFollowUpAction({
      template: { followUpActionId: 'gone' },
      context: { contactId: '42' },
    }, { loadActions: async () => [] });
    assert.equal(missingAction.ok, false);
    assert.match(missingAction.error, /disabled or no longer exists/i);

    let hydrated = false;
    const missingContact = await runTemplateFollowUpAction({
      template: { followUpActionId: 'a1' },
      context: { contactId: 'account-row-key' },
    }, {
      loadActions: async () => [{ id: 'a1', enabled: true }],
      hydrateContact: async () => { hydrated = true; },
    });
    assert.equal(missingContact.ok, false);
    assert.match(missingContact.error, /associated with the successful action/i);
    assert.equal(hydrated, false);
  });
});

describe('template follow-up action · primary success boundary', () => {
  it('never runs after a failed primary action or without a configured action', async () => {
    let loads = 0;
    const deps = { loadActions: async () => { loads += 1; return []; } };
    const failed = { ok: false, error: 'CRM rejected the note' };
    const plainSuccess = { ok: true, taskId: '90' };

    assert.equal(await runTemplateFollowUpAfterSuccess({
      result: failed,
      template: { followUpActionId: 'a1' },
      context: { contactId: '42' },
    }, deps), failed);
    assert.equal(await runTemplateFollowUpAfterSuccess({
      result: plainSuccess,
      template: {},
      context: { contactId: '42' },
    }, deps), plainSuccess);
    assert.equal(loads, 0);
  });

  it('keeps primary success and exposes a failed follow-up separately', async () => {
    const result = await runTemplateFollowUpAfterSuccess({
      result: { ok: true, taskId: '90' },
      template: { followUpActionId: 'a1' },
      context: { crmContactId: '42' },
    }, {
      loadActions: async () => [{ id: 'a1', enabled: true }],
      hydrateContact: async () => ({ page: { contact: { contactId: '42' } }, context: { doc: {} } }),
      runAction: async () => ({ ok: false, error: 'Action step failed' }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.taskId, '90');
    assert.equal(result.followUpAction.ok, false);
    assert.equal(result.followUpAction.contactId, '42');
    assert.equal(templateFollowUpActionError(result), 'Action step failed');
  });
});
