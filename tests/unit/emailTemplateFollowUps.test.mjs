import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildEmailFollowUpPage,
  emailTemplateFollowUpIds,
  runEmailTemplateFollowUps,
} from '../../src/lib/emailTemplateFollowUps.js';
import {
  emailDeliverySucceeded,
  sendEmailTemplateWithFollowUps,
} from '../../src/lib/emailTemplateDelivery.js';

const readSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('email template follow-ups · recipient context', () => {
  it('normalizes the two saved references', () => {
    assert.deepEqual(emailTemplateFollowUpIds({
      presetTaskId: ' task_7 ',
      followUpActionId: ' action_3 ',
    }), { taskId: 'task_7', actionId: 'action_3' });
  });

  it('uses the fetched schema contact id ahead of an account-row key', () => {
    const built = buildEmailFollowUpPage({
      page: {
        data: {
          ids: { contact: '42', account: '7' },
          contact: { firstName: 'Ada', lastName: 'Lovelace' },
          orders: [{ number: '5001' }],
        },
      },
      context: {
        contactId: '7',
        contactName: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    });

    assert.equal(built.taskContext.contactId, '42');
    assert.equal(built.taskContext.accountId, '7');
    assert.equal(built.page.contact.contactId, '42');
    assert.equal(built.page.contact.email, 'ada@example.com');
    assert.equal(built.page.orders[0].number, '5001');
  });

  it('maps an order-page customer into the follow-up contact contract', () => {
    const built = buildEmailFollowUpPage({
      page: {
        data: {
          ids: { order: '5001', customer: '84' },
          order: {
            customerId: '84',
            customer: { fullName: 'Grace Hopper', email: 'grace@example.com' },
          },
        },
      },
    });

    assert.equal(built.taskContext.contactId, '84');
    assert.equal(built.page.contact.contactId, '84');
    assert.equal(built.page.contact.contactName, 'Grace Hopper');
    assert.equal(built.page.contact.email, 'grace@example.com');
    assert.equal(built.page.ids.order, '5001');
  });
});

describe('email template follow-ups · task and custom action', () => {
  it('creates the selected task and runs the selected action for one recipient', async () => {
    const calls = [];
    const result = await runEmailTemplateFollowUps({
      template: { presetTaskId: 'task_1', followUpActionId: 'action_1' },
      page: { data: { ids: { contact: '42' }, contact: { firstName: 'Ada' } } },
      context: { contactName: 'Ada Lovelace', email: 'ada@example.com' },
    }, {
      loadResources: async () => ({
        noteTemplates: [{ id: 'task_1', subType: 'task', enabled: true, subject: 'Call Ada' }],
        customActions: [{ id: 'action_1', enabled: true, source: 'return "done";' }],
      }),
      createTask: async ({ template, context }) => {
        calls.push(['task', template.id, context.contactId]);
        return { ok: true, taskId: '900' };
      },
      runAction: async ({ action, page }) => {
        calls.push(['action', action.id, page.contact.contactId]);
        return { ok: true, steps: 1 };
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(calls, [
      ['task', 'task_1', '42'],
      ['action', 'action_1', '42'],
    ]);
  });

  it('still runs the custom action when task creation fails', async () => {
    let actionRuns = 0;
    const result = await runEmailTemplateFollowUps({
      template: { presetTaskId: 'task_1', followUpActionId: 'action_1' },
      context: { contactId: '42' },
    }, {
      loadResources: async () => ({
        noteTemplates: [{ id: 'task_1', subType: 'task', enabled: true, subject: 'Follow up' }],
        customActions: [{ id: 'action_1', enabled: true, source: '' }],
      }),
      createTask: async () => ({ ok: false, error: 'CRM rejected task' }),
      runAction: async () => { actionRuns += 1; return { ok: true }; },
    });

    assert.equal(actionRuns, 1);
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, ['Task: CRM rejected task']);
  });

  it('fails closed when a selected saved resource is disabled or deleted', async () => {
    const result = await runEmailTemplateFollowUps({
      template: { presetTaskId: 'gone_task', followUpActionId: 'disabled_action' },
      context: { contactId: '42' },
    }, {
      loadResources: async () => ({
        noteTemplates: [],
        customActions: [{ id: 'disabled_action', enabled: false, source: '' }],
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 2);
    assert.match(result.errors[0], /task is disabled or no longer exists/i);
    assert.match(result.errors[1], /action is disabled or no longer exists/i);
  });
});

describe('email template delivery · success boundary', () => {
  it('recognizes only sent and Outlook-opened delivery states', () => {
    assert.equal(emailDeliverySucceeded({ state: 'sent' }), true);
    assert.equal(emailDeliverySucceeded({ state: 'opened' }), true);
    assert.equal(emailDeliverySucceeded({ state: 'failed' }), false);
    assert.equal(emailDeliverySucceeded({ state: 'skipped' }), false);
  });

  it('runs follow-ups after each successful transport, never after failure', async () => {
    const followed = [];
    for (const state of ['sent', 'opened', 'failed']) {
      const result = await sendEmailTemplateWithFollowUps({
        email: { to: `${state}@example.com` },
        template: { id: 'tpl_1', presetTaskId: 'task_1' },
        followUpContext: { context: { contactId: '42' } },
      }, {
        send: async () => ({ state, transport: state === 'opened' ? 'mailto' : 'pa', error: state === 'failed' ? 'nope' : null }),
        runFollowUps: async (input) => {
          followed.push([state, input.template.id, input.context.contactId]);
          return { ok: true, task: { ok: true }, action: null, errors: [] };
        },
      });
      assert.equal(result.state, state);
    }

    assert.deepEqual(followed, [
      ['sent', 'tpl_1', '42'],
      ['opened', 'tpl_1', '42'],
    ]);
  });

  it('keeps a delivered email successful when its follow-up throws', async () => {
    const result = await sendEmailTemplateWithFollowUps({
      email: { to: 'ada@example.com' },
      template: { followUpActionId: 'action_1' },
    }, {
      send: async () => ({ state: 'sent', transport: 'pa', error: null }),
      runFollowUps: async () => { throw new Error('action exploded'); },
    });

    assert.equal(result.state, 'sent');
    assert.equal(result.followUps.ok, false);
    assert.match(result.followUps.errors[0], /action exploded/);
  });
});

describe('email template follow-ups · send-surface wiring', () => {
  it('routes popup and bulk sends through the post-success delivery boundary', async () => {
    const [popup, runner, vanilla] = await Promise.all([
      readSource('src/popup/popup.jsx'),
      readSource('src/modals/EmailRunner.jsx'),
      readSource('src/vanilla/main.js'),
    ]);

    assert.match(popup, /action:\s*'sendEmailTemplate'/);
    assert.match(popup, /followUpActionId:\s*tpl\.followUpActionId/);
    assert.doesNotMatch(popup, /action:\s*'executePresetTask'/);
    assert.match(runner, /sendEmailTemplateWithFollowUps\s*\(/);
    assert.match(vanilla, /msg\.action === 'sendEmailTemplate'/);
  });
});
