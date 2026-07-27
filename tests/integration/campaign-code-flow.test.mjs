/**
 * Code-first campaign flow: compact CRM Search/Task List records are hydrated
 * one at a time, then real helper adapters execute in trace order.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hydrateCampaignContact } from '../../src/lib/campaign/codeContext.js';
import { runCodeCampaign } from '../../src/lib/campaign/codeRunner.js';
import { makeExecutor } from '../../src/lib/codeEngine/executor.js';
import { makeSandboxRunner } from '../../src/lib/codeEngine/sandboxRunner.js';
import { simulateProgram } from '../../src/lib/codeEngine/simulate.js';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
async function fakeSandbox(body, ctx, vars = {}, _doc) {
  const fn = new AsyncFunction('ctx', 'vars', 'h', `"use strict";\n${body}`);
  return fn(ctx || {}, vars || {}, {});
}

function contextFor(contact) {
  const id = String(contact.contactId);
  return {
    contact,
    contactId: id,
    accountId: `account-${id}`,
    contactName: `Contact ${id}`,
    firstName: 'Contact',
    lastName: id,
    email: `contact-${id}@example.test`,
    phone: `555000${id}`,
    bounceCode: '',
    mailerRemoved: false,
    doNotContact: false,
    error: null,
    doc: { id: `doc-${id}` },
    data: {
      contact: {
        id,
        firstName: 'Contact',
        lastName: id,
        jobTitle: 'Buyer',
      },
      tasks: {
        open: [{ id: `old-${id}`, subject: `Existing ${id}`, dueDate: '2026-07-27' }],
        done: [],
      },
    },
  };
}

describe('campaign code flow', () => {
  it('hydrates and executes every non-email write against each ordered record', async () => {
    const audience = [
      { contactId: '1', contactName: 'One', contactUrl: 'https://crm.test/?customerID=1', value: 10, _key: '1' },
      { contactId: '2', contactName: 'Two', contactUrl: 'https://crm.test/?customerID=2', value: 20, _key: '2' },
    ];
    const writes = [];
    const preparedIds = [];
    const code = `
      const c = page.contact;
      const created = await actions.createTask({
        subject: "QA " + c.contactName,
        body: "Campaign integration test",
        priority: "low",
        daysOut: 0
      });
      await actions.completeTask({ id: created.taskId });
      await actions.addNote({
        subject: "Campaign QA",
        body: "Verified " + c.contactName
      });
      await page.tasks.open[0].complete();
      c.jobTitle = "Campaign verified";
      await c.commit();
      return c.contactId;
    `;

    const output = await runCodeCampaign({
      campaign: {
        automation: code,
        audienceOrder: 'valueDesc',
        paceDelay: 0,
        paceJitter: 0,
        sendCap: 0,
        suppressDoNotContact: true,
        suppressBounced: true,
        suppressMailerRemoved: true,
      },
      audience,
      prepareContact: async (contact, ordered) => {
        preparedIds.push(contact.contactId);
        return hydrateCampaignContact(contact, ordered, {
          buildContext: async () => contextFor(contact),
        });
      },
      executeProgram: async ({ prepared, beforeEffect, onEffect }) => {
        const id = prepared.context.contactId;
        const executor = makeExecutor({
          ctx: {
            contactId: id,
            contactName: prepared.context.contactName,
            phone: prepared.context.phone,
            employeeId: '7',
            accountId: prepared.context.accountId,
            email: prepared.context.email,
          },
          submitQuickTask: async ({ template, context }) => {
            writes.push([id, 'create', template.subject, context.contactId]);
            return { ok: true, taskId: `new-${id}` };
          },
          completeTaskById: async (taskId) => {
            writes.push([id, 'complete', taskId]);
          },
          submitCallLog: async ({ template, context }) => {
            writes.push([id, 'note', template.body, context.phone]);
            return { ok: true };
          },
          updateContact: async (contactId, fields) => {
            writes.push([id, 'edit', contactId, fields.jobTitle]);
            return { ok: true };
          },
        });
        return simulateProgram(code, prepared.page, {
          run: makeSandboxRunner({ exec: fakeSandbox, doc: prepared.context.doc }),
          executor,
          beforeEffect,
          onEffect,
        });
      },
    });

    assert.deepEqual(preparedIds, ['2', '1']);
    assert.deepEqual(writes, [
      ['2', 'create', 'QA Contact 2', '2'],
      ['2', 'complete', 'new-2'],
      ['2', 'note', 'Verified Contact 2', '5550002'],
      ['2', 'complete', 'old-2'],
      ['2', 'edit', '2', 'Campaign verified'],
      ['1', 'create', 'QA Contact 1', '1'],
      ['1', 'complete', 'new-1'],
      ['1', 'note', 'Verified Contact 1', '5550001'],
      ['1', 'complete', 'old-1'],
      ['1', 'edit', '1', 'Campaign verified'],
    ]);
    assert.equal(output.effects, 10);
    assert.deepEqual(output.results.map((row) => row.result), ['2', '1']);
    assert.ok(output.results.every((row) => row.status === 'sent'));
  });

  it('honors suppression and the run-wide action cap', async () => {
    const audience = [
      { contactId: '1', contactUrl: 'https://crm.test/?customerID=1', _key: '1' },
      { contactId: '2', contactUrl: 'https://crm.test/?customerID=2', _key: '2' },
      { contactId: '3', contactUrl: 'https://crm.test/?customerID=3', _key: '3' },
    ];
    const fired = [];
    const code = `
      await actions.createTask({ subject: "one" });
      await actions.createTask({ subject: "two" });
      await actions.createTask({ subject: "three" });
    `;
    const output = await runCodeCampaign({
      campaign: {
        automation: code,
        sendCap: 2,
        suppressDoNotContact: true,
      },
      audience,
      dryRun: false,
      prepareContact: async (contact, ordered) => hydrateCampaignContact(contact, ordered, {
        buildContext: async () => ({
          ...contextFor(contact),
          doNotContact: contact.contactId === '1',
        }),
      }),
      executeProgram: async ({ prepared, beforeEffect, onEffect }) => simulateProgram(
        code,
        prepared.page,
        {
          run: makeSandboxRunner({ exec: fakeSandbox }),
          executor: {
            async run(name, input) {
              fired.push([prepared.context.contactId, name, input.subject]);
              return { ok: true, taskId: `task-${fired.length}` };
            },
            async commitEdits() { return { ok: true }; },
          },
          beforeEffect,
          onEffect,
        },
      ),
    });

    assert.deepEqual(fired, [
      ['2', 'createTask', 'one'],
      ['2', 'createTask', 'two'],
    ]);
    assert.equal(output.effects, 2);
    assert.equal(output.results[0].suppressReason, 'do-not-contact');
    assert.equal(output.results[1].trace[2].status, 'skipped');
    assert.equal(output.results[2].suppressReason, 'action-cap');
  });
});
