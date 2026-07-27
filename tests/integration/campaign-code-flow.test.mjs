/**
 * Code-first campaign flow: compact CRM Search/Task List records are hydrated
 * one at a time, then real helper adapters execute in trace order.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  campaignPageFromContext,
  hydrateCampaignContact,
  resolveCampaignRecordIds,
} from '../../src/lib/campaign/codeContext.js';
import { runCodeCampaign } from '../../src/lib/campaign/codeRunner.js';
import { makeExecutor } from '../../src/lib/codeEngine/executor.js';
import { makeSandboxRunner } from '../../src/lib/codeEngine/sandboxRunner.js';
import { simulateProgram } from '../../src/lib/codeEngine/simulate.js';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const PRIOR_YEAR_CAMPAIGN = readFileSync(
  new URL('../../docs/examples/prior-year-anniversary-campaign.js', import.meta.url),
  'utf8',
);
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
  it('preserves hydrated account/order data and resolves an account writer contact', async () => {
    const context = {
      contact: {
        accountId: '902',
        contactName: 'Northwind Golf',
        contactUrl: 'https://crm.test/Default.aspx?Page=271&AccountID=902',
      },
      contactId: '771',
      accountId: '902',
      data: {
        ids: { contact: '771', account: '902' },
        contact: { firstName: 'Avery', lastName: 'Buyer' },
        account: { name: 'Northwind Golf', state: 'IL' },
        orders: [
          { number: '1001', summary: 'Logo towels', date: '2024-08-04T00:00:00.000Z' },
          { number: '1002', summary: 'Logo hats', date: '2024-12-02T00:00:00.000Z' },
        ],
        items: [{ name: 'Venture Towel', orderCount: 1 }],
        contacts: [{ firstName: 'Avery', lastName: 'Buyer', detailUrl: 'https://crm.test/?customerID=771' }],
        tasks: { open: [{ id: '9', subject: 'Prior Year #1 [2023]' }], done: [] },
      },
    };

    const page = campaignPageFromContext(context, [context.contact]);
    assert.equal(page.account.name, 'Northwind Golf');
    assert.equal(page.orders.length, 2);
    assert.equal(page.items[0].name, 'Venture Towel');
    assert.equal(page.relatedContacts[0].firstName, 'Avery');
    assert.equal(page.contact.contactId, '771');
    assert.equal(page.contacts.length, 1);
    assert.equal(page.tasks.open[0].id, '9');

    assert.deepEqual(
      resolveCampaignRecordIds(
        { accountId: '902', contactUrl: 'https://crm.test/Default.aspx?Page=271&AccountID=902' },
        context.data,
      ),
      { contactId: '771', accountId: '902' },
    );
  });

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

  it('builds a contact-scoped prior-year timeline without an account', async () => {
    const sourceContact = {
      contactId: '771',
      contactName: 'Avery Buyer',
      contactUrl: 'https://crm.test/Default.aspx?Page=240&customerID=771',
    };
    const page = campaignPageFromContext({
      contact: sourceContact,
      contactId: '771',
      contactName: 'Avery Buyer',
      data: {
        ids: { contact: '771', account: '' },
        contact: { firstName: 'Avery', lastName: 'Buyer' },
        orders: [
          { number: '1001', summary: 'Blue logo towels', date: '2024-08-04' },
          { number: '1002', summary: 'White logo towels', date: '2024-08-06' },
          { number: '1003', summary: 'Embroidered hats', date: '2025-12-12' },
        ],
        tasks: {
          open: [
            { id: 'old-1', subject: 'Prior Year #1 [2023]' },
            { id: 'keep-1', subject: 'Normal follow up' },
          ],
          done: [],
        },
      },
    }, [sourceContact]);

    assert.equal(page.account, undefined);
    assert.equal(page.contact.contactId, '771');
    assert.equal(page.orders.length, 3);
    assert.deepEqual(
      page.tasks.open.map((task) => task.id),
      ['old-1', 'keep-1'],
    );
    const writes = [];
    const result = await simulateProgram(PRIOR_YEAR_CAMPAIGN, page, {
      run: makeSandboxRunner({ exec: fakeSandbox }),
      executor: {
        async run(name, input) {
          writes.push([name, input]);
          return { ok: true, taskId: `task-${writes.length}` };
        },
        async commitEdits() { return { ok: true }; },
      },
    });

    assert.equal(result.ok, true);
    const actionTrace = result.trace.filter((entry) => entry.kind !== 'function');
    const functionTrace = result.trace.filter((entry) => entry.kind === 'function');
    assert.equal(actionTrace.length, 7);
    assert.ok(functionTrace.length > 7, 'helper calls should remain visible to Simulate');
    assert.ok(
      [...new Set(functionTrace.map((entry) => entry.id))]
        .some((id) => functionTrace.filter((entry) => entry.id === id).length > 1),
      'a repeated helper should reuse its stable function block id',
    );
    assert.deepEqual(writes.map(([name]) => name), [
      'completeTask',
      'createTask', 'createTask', 'createTask',
      'createTask', 'createTask', 'createTask',
    ]);
    assert.equal(writes[0][1].id, 'old-1');
    const created = writes.slice(1).map(([, input]) => input);
    assert.deepEqual(
      created.map((task) => task.subject),
      [
        'Prior Year #1 [2024] · August 5',
        'Prior Year #2 [2024] · August 5',
        'Prior Year #3 [2024] · August 5',
        'Prior Year #1 [2025] · December 12',
        'Prior Year #2 [2025] · December 12',
        'Prior Year #3 [2025] · December 12',
      ],
    );
    assert.ok(created.every((task) => Number.isInteger(task.daysOut) && task.daysOut > 0));
    assert.match(created[0].body, /Blue logo towels/);
    assert.match(created[0].body, /White logo towels/);
    assert.match(created[3].body, /Embroidered hats/);
    assert.match(result.result, /created 6 fresh task\(s\) across 2 anniversary date\(s\)/);
  });

  it('does not count function-entry animation events as campaign actions', async () => {
    const audience = [
      { contactId: '1', contactName: 'One', contactUrl: 'https://crm.test/?customerID=1', _key: '1' },
    ];
    const code = `
      async function queue(subject) {
        await actions.createTask({ subject });
      }
      await queue("one");
      await queue("two");
    `;
    const output = await runCodeCampaign({
      campaign: {
        automation: code,
        paceDelay: 0,
        paceJitter: 0,
        sendCap: 0,
      },
      audience,
      dryRun: true,
      prepareContact: async (contact, ordered) => hydrateCampaignContact(contact, ordered, {
        buildContext: async () => contextFor(contact),
      }),
      executeProgram: async ({ prepared, beforeEffect, onEffect }) => simulateProgram(
        code,
        prepared.page,
        {
          run: makeSandboxRunner({ exec: fakeSandbox }),
          beforeEffect,
          onEffect,
        },
      ),
    });

    assert.equal(output.results[0].ran, 2);
    assert.equal(output.effects, 2);
    assert.equal(output.results[0].trace.filter((entry) => entry.kind === 'function').length, 2);
  });

  it('honors suppression and the run-wide action cap', async () => {
    const audience = [
      { contactId: '1', contactUrl: 'https://crm.test/?customerID=1', _key: '1' },
      { contactId: '2', contactUrl: 'https://crm.test/?customerID=2', _key: '2' },
      { contactId: '3', contactUrl: 'https://crm.test/?customerID=3', _key: '3' },
    ];
    const fired = [];
    const effectEvents = [];
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
      on: {
        effect: async ({ contact, event, effects }) => {
          await Promise.resolve();
          effectEvents.push([contact.contactId, event.name, event.status, effects]);
        },
      },
    });

    assert.deepEqual(fired, [
      ['2', 'createTask', 'one'],
      ['2', 'createTask', 'two'],
    ]);
    assert.equal(output.effects, 2);
    assert.equal(output.results[0].suppressReason, 'do-not-contact');
    assert.equal(output.results[1].trace[2].status, 'skipped');
    assert.equal(output.results[2].suppressReason, 'action-cap');
    assert.deepEqual(effectEvents, [
      ['2', 'createTask', 'ran', 1],
      ['2', 'createTask', 'ran', 2],
      ['2', 'createTask', 'skipped', 2],
    ]);
  });
});
