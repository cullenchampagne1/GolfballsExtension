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
import { shapeLivePage } from '../../src/lib/codeEngine/liveActionRun.js';
import { makeSandboxRunner } from '../../src/lib/codeEngine/sandboxRunner.js';
import { simulateProgram } from '../../src/lib/codeEngine/simulate.js';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const PRIOR_YEAR_CAMPAIGN = readFileSync(
  new URL('../../docs/examples/prior-year-anniversary-campaign.js', import.meta.url),
  'utf8',
);
const QUARTERLY_REACH_OUT_ACTION = readFileSync(
  new URL('../../docs/examples/quarterly-reach-out-task-list-action.js', import.meta.url),
  'utf8',
);
const PROMOTION_RECOVERY_CAMPAIGN = readFileSync(
  new URL('../../docs/examples/promotion-task-recovery-campaign.js', import.meta.url),
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

  it('gives an Action Shelf custom action the same live order data as a campaign', async () => {
    const page = shapeLivePage({
      data: {
        ids: { contact: '771', account: '902' },
        contact: {
          id: '771',
          contactId: '771',
          firstName: 'Avery',
          lastName: 'Buyer',
          contactName: 'Avery Buyer',
        },
        account: { name: 'Northwind Golf' },
        orders: [
          {
            number: '5063056',
            summary: 'Titleist Pro V1 Personalized Golf Balls - 2025 Model',
            date: '2026-04-24',
            status: 'Complete',
          },
          {
            number: '5048594',
            summary: 'Titleist Pro V1 Personalized Golf Balls - 2025 Model',
            date: '2026-04-06',
            status: 'Complete',
          },
        ],
        items: [{ name: 'Titleist Pro V1 Personalized Golf Balls', quantity: 2 }],
        tasks: { open: [], done: [] },
      },
    });

    assert.equal(page.orders.length, 2);
    assert.equal(page.items[0].quantity, 2);
    const result = await simulateProgram(PRIOR_YEAR_CAMPAIGN, page, {
      run: makeSandboxRunner({ exec: fakeSandbox }),
    });

    assert.equal(result.ok, true);
    assert.doesNotMatch(String(result.result), /^Skipped/);
    assert.match(String(result.result), /created 4 fresh Prior Year task\(s\)/);
    assert.match(String(result.result), /created 1 brand task\(s\)/);
    assert.ok(
      result.trace.some((entry) => /Titleist Customer - Tier 2/.test(entry.summary || '')),
      'the live custom-action trace should include the derived Titleist tier task',
    );
  });

  it('creates missing quarterly tasks for every contact from one Task List snapshot', async () => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const slot = (offset) => {
      const absolute = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3) + offset;
      const year = Math.floor(absolute / 4);
      const quarter = (absolute % 4) + 1;
      const date = new Date(year, (quarter - 1) * 3 + 1, 10, 12);
      return {
        year,
        quarter,
        date: `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-10`,
      };
    };
    const slots = [0, 1, 2, 3].map(slot);
    const page = {
      entryPoint: {
        id: 'task-list',
        data: {
          contacts: [
            { contactId: '101', contactName: 'Ada Buyer', accountId: 'a1', accountName: 'Analytical Golf' },
            { contactId: '202', contactName: 'Grace Buyer', accountId: 'a2', accountName: 'Compiler Golf' },
          ],
          tasks: [
            { id: 'a-current', contactId: '101', dueDate: slots[0].date, subject: 'Prior Year #1 [2025]' },
            { id: 'g-later', contactId: '202', dueDate: slots[2].date, subject: 'Existing Grace follow-up' },
          ],
        },
      },
    };
    const createWrites = [];
    const updateWrites = [];
    const executor = makeExecutor({
      ctx: { employeeId: '7' },
      submitQuickTask: async ({ template, context }) => {
        createWrites.push({ template, context });
        return { ok: true, taskId: `quarter-${createWrites.length}` };
      },
      updateTaskById: async (id, fields) => {
        updateWrites.push({ id, fields });
        return { ok: true };
      },
    });
    const result = await simulateProgram(QUARTERLY_REACH_OUT_ACTION, page, {
      run: makeSandboxRunner({ exec: fakeSandbox }),
      executor,
    });

    assert.equal(result.ok, true);
    assert.equal(createWrites.length, 6);
    assert.equal(updateWrites.length, 7);
    assert.ok(
      !updateWrites.some((write) => write.id === 'g-later'),
      'tasks the action does not own (promotions, manual follow-ups) keep their live dates',
    );
    assert.deepEqual(
      [...new Set(createWrites.map((write) => write.context.contactId))].sort(),
      ['101', '202'],
    );
    assert.equal(
      createWrites.filter((write) => write.context.contactId === '101').length,
      3,
    );
    assert.equal(
      createWrites.filter((write) => write.context.contactId === '202').length,
      3,
    );
    assert.ok(
      !createWrites.some((write) => (
        write.context.contactId === '101'
        && write.template.subject === `Q${slots[0].quarter} Reach Out Opportunity`
      )),
      'Ada already has coverage in the current quarter',
    );
    assert.ok(
      !createWrites.some((write) => (
        write.context.contactId === '202'
        && write.template.subject === `Q${slots[2].quarter} Reach Out Opportunity`
      )),
      'Grace already has coverage in the third rolling quarter',
    );
    assert.ok(createWrites.every((write) => write.template.daysOut >= 0));
    assert.deepEqual(
      updateWrites.find((write) => write.id === 'a-current')?.fields,
      {
        liveDate: (() => {
          const date = new Date(`${slots[0].date}T12:00:00`);
          date.setDate(date.getDate() - 14);
          return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0'),
          ].join('-');
        })(),
        // The bracket year refreshes to the due-date year (the follow-up
        // cycle), and renamed tasks get the Order History Special category.
        subject: `Order Anniversary Follow Up #1 [${slots[0].year}]`,
        categoryId: 7,
      },
    );
    assert.ok(
      updateWrites
        .filter((write) => String(write.id).startsWith('quarter-'))
        .every((write) => /^\d{4}-\d{2}-\d{2}$/.test(write.fields.liveDate)),
      'every newly-created quarterly task receives an exact live date',
    );
    assert.match(String(result.result), /Updated 1 existing live date\(s\)/);
    assert.match(String(result.result), /renamed 1 anniversary task\(s\)/);
    assert.match(String(result.result), /Created 6 quarterly reach-out task\(s\)/);
  });

  it('revives hidden promotion tasks and creates missing ones without touching other flows', async () => {
    const atNoon = (offset) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() + offset);
      return date;
    };
    const isoDate = (date) => [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    const page = shapeLivePage({
      data: {
        ids: { contact: '101', account: '' },
        contact: { id: '101', contactId: '101', contactName: 'Ada Buyer' },
        orders: [],
        tasks: {
          open: [
            {
              id: 'promo-1',
              subject: '#1 Srixon Promotion Campaign Follow Up',
              dueDate: isoDate(atNoon(20)),
              liveDate: isoDate(atNoon(6)),
            },
            {
              id: 'quarter',
              subject: 'Q3 Reach Out Opportunity',
              dueDate: isoDate(atNoon(30)),
              liveDate: isoDate(atNoon(16)),
            },
            {
              id: 'anniv',
              subject: 'Order Anniversary Follow Up #1 [2026]',
              dueDate: isoDate(atNoon(40)),
              liveDate: isoDate(atNoon(26)),
            },
            {
              id: 'manual',
              subject: 'Client proof follow-up',
              dueDate: isoDate(atNoon(25)),
              liveDate: isoDate(atNoon(11)),
            },
          ],
          done: [],
        },
      },
    });
    const createWrites = [];
    const updateWrites = [];
    const result = await simulateProgram(PROMOTION_RECOVERY_CAMPAIGN, page, {
      run: makeSandboxRunner({ exec: fakeSandbox }),
      executor: makeExecutor({
        ctx: { contactId: '101', contactName: 'Ada Buyer', employeeId: '7' },
        submitQuickTask: async ({ template, context }) => {
          createWrites.push({ template, context });
          return { ok: true, taskId: `promo-new-${createWrites.length}` };
        },
        updateTaskById: async (id, fields) => {
          updateWrites.push({ id, fields });
          return { ok: true };
        },
      }),
    });

    assert.equal(result.ok, true);
    assert.deepEqual(updateWrites, [
      { id: 'promo-1', fields: { liveDate: isoDate(atNoon(0)) } },
    ]);
    assert.equal(createWrites.length, 1);
    assert.equal(createWrites[0].template.subject, '#2 Srixon Promotion Campaign Follow Up');
    assert.equal(createWrites[0].template.daysOut, 7);
    assert.equal(createWrites[0].context.contactId, '101');
    assert.match(String(result.result), /Revived 1 promotion task\(s\) to live today/);
    assert.match(String(result.result), /created 1 missing promotion task\(s\)/);
    assert.match(String(result.result), /Left 3 other non-live task\(s\) untouched/);
    assert.match(String(result.result), /Q3 Reach Out Opportunity/);
  });

  it('counts completed promotion tasks as covered and leaves live ones alone', async () => {
    const atNoon = (offset) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() + offset);
      return date;
    };
    const isoDate = (date) => [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    const page = shapeLivePage({
      data: {
        ids: { contact: '202', account: '' },
        contact: { id: '202', contactId: '202', contactName: 'Grace Buyer' },
        orders: [],
        tasks: {
          open: [
            {
              id: 'promo-live',
              subject: '#1 Srixon Promotion Campaign Follow Up',
              dueDate: isoDate(atNoon(10)),
              liveDate: isoDate(atNoon(0)),
            },
          ],
          done: [
            { id: 'promo-done', subject: '#2 Srixon Promotion Campaign Follow Up' },
          ],
        },
      },
    });
    const createWrites = [];
    const updateWrites = [];
    const result = await simulateProgram(PROMOTION_RECOVERY_CAMPAIGN, page, {
      run: makeSandboxRunner({ exec: fakeSandbox }),
      executor: makeExecutor({
        ctx: { contactId: '202', contactName: 'Grace Buyer', employeeId: '7' },
        submitQuickTask: async ({ template, context }) => {
          createWrites.push({ template, context });
          return { ok: true, taskId: 'unexpected' };
        },
        updateTaskById: async (id, fields) => {
          updateWrites.push({ id, fields });
          return { ok: true };
        },
      }),
    });

    assert.equal(result.ok, true);
    assert.deepEqual(updateWrites, []);
    assert.deepEqual(createWrites, []);
    assert.match(String(result.result), /Revived 0 promotion task\(s\)/);
    assert.match(String(result.result), /left 1 already live/);
    assert.match(String(result.result), /created 0 missing promotion task\(s\)/);
    assert.doesNotMatch(String(result.result), /untouched/);
  });

  it('edits Task List rows through the same executor used by campaigns', async () => {
    const atNoon = (offset) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() + offset);
      return date;
    };
    const isoDate = (date) => [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    const nearDue = atNoon(7);
    const farDue = atNoon(30);
    const expectedLive = new Date(farDue);
    expectedLive.setDate(expectedLive.getDate() - 7);
    const page = {
      entryPoint: {
        id: 'task-list',
        data: {
          tasks: [
            { id: 'task-near', subject: 'Near follow-up', dueDate: isoDate(nearDue), liveDate: isoDate(atNoon(0)) },
            { id: 'task-far', subject: 'Future follow-up', dueDate: isoDate(farDue), liveDate: isoDate(atNoon(0)) },
          ],
        },
      },
    };
    const writes = [];
    const source = `
      const cutoff = new Date();
      cutoff.setHours(12, 0, 0, 0);
      cutoff.setDate(cutoff.getDate() + 14);
      let changed = 0;
      for (const task of page.tasks.items) {
        const due = new Date(task.dueDate + "T12:00:00");
        if (Number.isNaN(due.getTime()) || due <= cutoff) continue;
        const live = new Date(due);
        live.setDate(live.getDate() - 7);
        task.live_date = live;
        changed++;
      }
      return "Updated " + changed + " task(s)";
    `;
    const result = await simulateProgram(source, page, {
      run: makeSandboxRunner({ exec: fakeSandbox }),
      executor: makeExecutor({
        updateTaskById: async (id, fields) => {
          writes.push({ id, fields });
          return { ok: true };
        },
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.result, 'Updated 1 task(s)');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].id, 'task-far');
    const writtenLiveDate = new Date(writes[0].fields.liveDate);
    assert.equal(Number.isNaN(writtenLiveDate.getTime()), false);
    assert.deepEqual(
      [
        writtenLiveDate.getFullYear(),
        writtenLiveDate.getMonth(),
        writtenLiveDate.getDate(),
      ],
      [expectedLive.getFullYear(), expectedLive.getMonth(), expectedLive.getDate()],
    );
  });

  it('maintains quarterly coverage in the main campaign even without orders', async () => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const existing = new Date(
      now.getFullYear(),
      Math.floor(now.getMonth() / 3) * 3 + 1,
      10,
      12,
    );
    const page = shapeLivePage({
      data: {
        ids: { contact: '303', account: '' },
        contact: {
          id: '303',
          contactId: '303',
          contactName: 'No Order Buyer',
        },
        orders: [],
        tasks: {
          open: [{
            id: 'existing-quarter',
            subject: 'Existing quarterly touch',
            dueDate: `${existing.getFullYear()}-${String(existing.getMonth() + 1).padStart(2, '0')}-10`,
          }],
          done: [],
        },
      },
    });
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
    const quarterly = writes
      .filter(([name, input]) => name === 'createTask' && /^Q[1-4] Reach Out Opportunity$/.test(input.subject))
      .map(([, input]) => input);
    assert.equal(quarterly.length, 3);
    assert.ok(quarterly.every((task) => task.daysOut >= 0));
    assert.match(String(result.result), /created 3 quarterly reach-out task\(s\)/);
    assert.match(String(result.result), /created 0 brand task\(s\)/);
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
          { number: '5063056', summary: 'Titleist Pro V1 Personalized Golf Balls - 2025 Model', date: '2026-04-24', revenue: 0.01, status: 'Complete' },
          { number: '5048594', summary: 'Titleist Pro V1 Personalized Golf Balls - 2025 Model', date: '2026-04-06', revenue: 70.94, status: 'Complete' },
          { number: '4861490', summary: 'Vice Drive Custom Logo Golf Balls', date: '2025-12-12', status: 'Complete' },
          { number: '4000001', summary: 'Callaway Chrome Soft Custom Golf Balls', date: '', status: 'Complete' },
          { number: '4000002', summary: 'Callaway Supersoft Custom Golf Balls', date: '', status: 'Complete' },
          { number: '4000003', summary: 'Callaway Warbird Custom Golf Balls', date: '', status: 'Complete' },
          { number: '4000004', summary: 'Callaway ERC Soft Custom Golf Balls', date: '', status: 'Complete' },
        ],
        tasks: {
          open: [
            { id: 'old-1', subject: 'Prior Year #1 [2023]' },
            { id: 'old-brand-1', subject: 'Titleist Customer - Tier 3' },
            { id: 'keep-1', subject: 'Normal follow up' },
          ],
          done: [],
        },
      },
    }, [sourceContact]);

    assert.equal(page.account, undefined);
    assert.equal(page.contact.contactId, '771');
    assert.equal(page.orders.length, 7);
    assert.deepEqual(
      page.tasks.open.map((task) => task.id),
      ['old-1', 'old-brand-1', 'keep-1'],
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
    // 2 completes + 12 creates, each create followed by its liveDate update.
    assert.equal(actionTrace.length, 26);
    assert.ok(functionTrace.length > 7, 'helper calls should remain visible to Simulate');
    assert.ok(
      [...new Set(functionTrace.map((entry) => entry.id))]
        .some((id) => functionTrace.filter((entry) => entry.id === id).length > 1),
      'a repeated helper should reuse its stable function block id',
    );
    assert.deepEqual(writes.map(([name]) => name), [
      'completeTask', 'completeTask',
      ...Array.from({ length: 12 }, () => ['createTask', 'updateTask']).flat(),
    ]);
    assert.equal(writes[0][1].id, 'old-1');
    assert.equal(writes[1][1].id, 'old-brand-1');
    const created = writes
      .filter(([name]) => name === 'createTask')
      .map(([, input]) => input);
    const liveUpdates = writes
      .filter(([name]) => name === 'updateTask')
      .map(([, input]) => input);
    assert.ok(
      liveUpdates.every((update) => /^\d{4}-\d{2}-\d{2}$/.test(update.fields?.liveDate)),
      'every created task receives an exact live date',
    );

    // Anniversary cycles roll to next year once their first task has passed,
    // so derive each cycle's bracket year (and the chronological creation
    // order) the same way the campaign schedules them.
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const cycleFor = (month, day, monthName) => {
      let year = now.getFullYear();
      let anniversary = new Date(year, month, day, 12);
      let first = new Date(anniversary);
      first.setDate(first.getDate() - 21);
      if (first.getTime() <= now.getTime()) {
        year += 1;
        anniversary = new Date(year, month, day, 12);
        first = new Date(anniversary);
        first.setDate(first.getDate() - 21);
      }
      return { year, monthName, firstTime: first.getTime() };
    };
    const cycles = [
      cycleFor(3, 15, 'April'),      // Titleist orders: 4/24 + 4/6 average to April 15
      cycleFor(11, 12, 'December'),  // Vice order: December 12
    ].sort((a, b) => a.firstTime - b.firstTime);
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
    assert.deepEqual(
      created.map((task) => task.subject),
      [
        ...cycles.flatMap((cycle) => [
          `Order Anniversary Follow Up #1 [${cycle.year}]`,
          `Order Anniversary Follow Up #2 [${cycle.year}]`,
          `Order Anniversary Follow Up Call - [${cycle.monthName}]`,
          `Order Anniversary Follow Up #3 [${cycle.year}]`,
        ]),
        `Q${currentQuarter} Reach Out Opportunity`,
        'Callaway Customer - Tier 1',
        'Titleist Customer - Tier 2',
        'Vice Customer - Tier 3',
      ],
    );
    assert.ok(created.every((task) => Number.isInteger(task.daysOut) && task.daysOut >= 0));
    assert.ok(
      created.slice(0, 8).every((task) => task.categoryId === 7),
      'anniversary tasks carry the Order History Special category',
    );
    assert.equal(created[8].categoryId, 14, 'quarterly reach-outs carry the Workflow Task category');
    const decemberCall = created.find((task) => task.subject === 'Order Anniversary Follow Up Call - [December]');
    const aprilCall = created.find((task) => task.subject === 'Order Anniversary Follow Up Call - [April]');
    assert.match(decemberCall.body, /Vice Drive Custom Logo/);
    assert.match(aprilCall.body, /Titleist Pro V1 Personalized/);
    assert.match(aprilCall.body, /Averaged reorder anniversary: April 15/);
    const firstCycle = created.slice(0, 4);
    assert.ok(firstCycle[2].daysOut > firstCycle[1].daysOut);
    assert.ok(firstCycle[2].daysOut < firstCycle[3].daysOut);
    assert.match(firstCycle[2].body, /Follow-up timing: 1 week before/);

    const brandTasks = created.slice(9);
    assert.deepEqual(brandTasks.map((task) => task.daysOut), [
      brandTasks[0].daysOut,
      brandTasks[0].daysOut,
      brandTasks[0].daysOut,
    ]);
    assert.match(brandTasks[0].body, /Order count: 4/);
    assert.match(brandTasks[1].body, /Order count: 2/);
    assert.match(brandTasks[1].body, /#5063056/);
    assert.match(brandTasks[1].body, /#5048594/);
    assert.match(brandTasks[2].body, /Order count: 1/);
    assert.ok(brandTasks.every((task) => /Review date: 12\/17\/2030/.test(task.body)));
    const computedBrandDue = new Date();
    computedBrandDue.setHours(12, 0, 0, 0);
    computedBrandDue.setDate(computedBrandDue.getDate() + brandTasks[0].daysOut);
    assert.deepEqual(
      [
        computedBrandDue.getFullYear(),
        computedBrandDue.getMonth() + 1,
        computedBrandDue.getDate(),
      ],
      [2030, 12, 17],
    );
    assert.match(result.result, /created 8 fresh Prior Year task\(s\) across 2 anniversary date\(s\)/);
    assert.match(result.result, /created 1 quarterly reach-out task\(s\)/);
    assert.match(result.result, /created 3 brand task\(s\)/);
  });

  it('keeps the newest source year per month and skips a different campaign within 20 days', async () => {
    const now = new Date();
    const retainedMonth = (now.getMonth() + 3) % 12;
    const competingMonth = (retainedMonth + 1) % 12;
    const recentYear = now.getFullYear() - 1;
    const olderYear = recentYear - 2;
    const competingYear = recentYear - 1;
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const dateText = (year, month, day) => (
      `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    );
    const page = shapeLivePage({
      data: {
        ids: { contact: '991', account: '' },
        contact: {
          id: '991',
          contactId: '991',
          firstName: 'Morgan',
          lastName: 'Buyer',
          contactName: 'Morgan Buyer',
        },
        orders: [
          {
            number: 'old-month',
            summary: 'Acme Legacy Product',
            date: dateText(olderYear, retainedMonth, 5),
          },
          {
            number: 'new-month-1',
            summary: 'Acme Current Product A',
            date: dateText(recentYear, retainedMonth, 10),
          },
          {
            number: 'new-month-2',
            summary: 'Acme Current Product B',
            date: dateText(recentYear, retainedMonth, 20),
          },
          {
            number: 'overlap-month',
            summary: 'Beta Adjacent Product',
            date: dateText(competingYear, competingMonth, 15),
          },
        ],
        tasks: { open: [], done: [] },
      },
    });
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
    const priorTasks = writes
      .filter(([name, input]) => name === 'createTask' && /^Order Anniversary Follow Up/.test(input.subject))
      .map(([, input]) => input);
    assert.equal(priorTasks.length, 4);
    assert.equal(
      priorTasks.filter((task) => task.subject === `Order Anniversary Follow Up Call - [${monthNames[retainedMonth]}]`).length,
      1,
    );
    assert.ok(
      priorTasks.every((task) => !task.subject.includes(`[${monthNames[competingMonth]}]`)),
      'the lower-ranked adjacent campaign should not create any tasks',
    );
    // The bracket year is the follow-up cycle year: the next occurrence of the
    // retained month (three months ahead of "now", so next year when wrapped).
    const cycleYear = retainedMonth >= now.getMonth() ? now.getFullYear() : now.getFullYear() + 1;
    assert.deepEqual(
      priorTasks.filter((task) => /^Order Anniversary Follow Up #/.test(task.subject)).map((task) => task.subject),
      [
        `Order Anniversary Follow Up #1 [${cycleYear}]`,
        `Order Anniversary Follow Up #2 [${cycleYear}]`,
        `Order Anniversary Follow Up #3 [${cycleYear}]`,
      ],
    );
    assert.match(priorTasks[0].body, new RegExp(`Source period: ${monthNames[retainedMonth]} ${recentYear}`));
    assert.match(priorTasks[0].body, /Averaged reorder anniversary: \w+ 15/);
    assert.match(priorTasks[0].body, /#new-month-1/);
    assert.match(priorTasks[0].body, /#new-month-2/);
    assert.doesNotMatch(priorTasks[0].body, /#old-month/);
    assert.match(result.result, /skipped 1 older same-month source period\(s\)/);
    assert.match(result.result, /skipped 1 overlapping Prior Year campaign\(s\)/);
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
