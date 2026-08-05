/**
 * Code-first workflow flow: compact CRM Search/Task List records are hydrated
 * one at a time, then real helper adapters execute in trace order.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  workflowPageFromContext,
  hydrateWorkflowContact,
  resolveWorkflowRecordIds,
} from '../../src/lib/workflow/codeContext.js';
import { runCodeWorkflow } from '../../src/lib/workflow/codeRunner.js';
import { makeExecutor } from '../../src/lib/codeEngine/executor.js';
import { shapeLivePage } from '../../src/lib/codeEngine/liveActionRun.js';
import { instrument } from '../../src/lib/codeEngine/instrument.js';
import { buildTraceBody, makeSandboxRunner } from '../../src/lib/codeEngine/sandboxRunner.js';
import { simulateProgram } from '../../src/lib/codeEngine/simulate.js';
import { staticCheckCodeBody } from '../../src/lib/page-engine/code-precheck.js';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const RECONCILIATION_WORKFLOW = readFileSync(
  new URL('../../docs/examples/task-reconciliation-workflow.js', import.meta.url),
  'utf8',
);
const RECONCILIATION_ACTION = readFileSync(
  new URL('../../docs/examples/task-reconciliation-contact-action.js', import.meta.url),
  'utf8',
);
const QUARTERLY_REACH_OUT_ACTION = readFileSync(
  new URL('../../docs/examples/quarterly-reach-out-task-list-action.js', import.meta.url),
  'utf8',
);

/* ── Shared helpers for reconciliation expectations ──────────────
   These restate the workflow's DOCUMENTED rules (not its code) so the
   fixtures stay correct on any run date. */
const atNoonDay = (offset) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
};
const isoOf = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');
const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumOf = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
const dateOfDayNum = (dayNumber) => {
  const utc = new Date(dayNumber * DAY_MS);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 12);
};
const mondayBeforeOf = (date) => {
  const monday = new Date(date);
  const weekday = monday.getDay();
  const daysBack = weekday === 0 ? 6 : weekday === 1 ? 7 : weekday - 1;
  monday.setDate(monday.getDate() - daysBack);
  return monday;
};
/* Anniversary cycles roll to next year once their first task has passed
   (with no in-flight evidence), so derive each cycle's bracket year, task
   dates, and the chronological creation order the way the docs specify. */
const anniversaryCycleFor = (month, day, monthName) => {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  let year = now.getFullYear();
  const build = (y) => {
    const anniversary = new Date(y, month, day, 12);
    const first = new Date(anniversary);
    first.setDate(first.getDate() - 21);
    return { anniversary, first };
  };
  let cycle = build(year);
  if (cycle.first.getTime() <= now.getTime()) {
    year += 1;
    cycle = build(year);
  }
  const dates = [
    new Date(cycle.anniversary.getTime() - 21 * DAY_MS),
    new Date(cycle.anniversary.getTime() - 14 * DAY_MS),
    new Date(cycle.anniversary.getTime() - 7 * DAY_MS),
    mondayBeforeOf(cycle.anniversary),
  ];
  return { year, monthName, firstTime: cycle.first.getTime(), dates };
};
const rollingSlotOf = (offset) => {
  const now = new Date();
  const absolute = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3) + offset;
  return { year: Math.floor(absolute / 4), quarter: (absolute % 4) + 1 };
};
/* The documented gap-midpoint rule: from the last touch at/before the
   quarter window to the next touch landing by the end of the FOLLOWING
   quarter (else the start of the following quarter); touches inside split
   the window and the largest gap wins; clamp into the quarter, never in
   the past. */
const gapMidpointOf = (slotOffset, busyDayNums) => {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const todayN = dayNumOf(now);
  const slot = rollingSlotOf(slotOffset);
  const qStart = dayNumOf(new Date(slot.year, (slot.quarter - 1) * 3, 1, 12));
  const qEnd = dayNumOf(new Date(slot.year, (slot.quarter - 1) * 3 + 3, 0, 12));
  const windowStart = Math.max(qStart, todayN);
  if (windowStart > qEnd) return null;
  const followingEnd = dayNumOf(new Date(slot.year, (slot.quarter - 1) * 3 + 6, 0, 12));
  const sorted = [...busyDayNums].sort((a, b) => a - b);
  const before = sorted.filter((day) => day <= windowStart);
  const gapStart = before.length ? before[before.length - 1] : windowStart;
  const inside = sorted.filter((day) => day > windowStart && day <= qEnd);
  const after = sorted.find((day) => day > qEnd && day <= followingEnd);
  const boundaries = [gapStart, ...inside, after != null ? after : qEnd + 1];
  let best = null;
  for (let i = 0; i + 1 < boundaries.length; i += 1) {
    const span = boundaries[i + 1] - boundaries[i];
    if (!best || span > best.span) best = { span, mid: Math.round((boundaries[i] + boundaries[i + 1]) / 2) };
  }
  return Math.min(qEnd, Math.max(windowStart, best.mid));
};
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

describe('workflow code flow', () => {
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

    const page = workflowPageFromContext(context, [context.contact]);
    assert.equal(page.account.name, 'Northwind Golf');
    assert.equal(page.orders.length, 2);
    assert.equal(page.items[0].name, 'Venture Towel');
    assert.equal(page.relatedContacts[0].firstName, 'Avery');
    assert.equal(page.contact.contactId, '771');
    assert.equal(page.contacts.length, 1);
    assert.equal(page.tasks.open[0].id, '9');

    assert.deepEqual(
      resolveWorkflowRecordIds(
        { accountId: '902', contactUrl: 'https://crm.test/Default.aspx?Page=271&AccountID=902' },
        context.data,
      ),
      { contactId: '771', accountId: '902' },
    );
  });

  it('runs a cached CRM Search record through the workflow page model without fetching its page', async () => {
    let fetches = 0;
    const contact = {
      contactId: '42',
      contactName: 'Search Row Name',
      contactUrl: 'https://crm.test/Default.aspx?Page=240&customerID=42',
      pageEngineIdentity: { schemaId: 'contact', id: '42' },
      pageEngineSnapshot: {
        schemaId: 'contact',
        id: '42',
        sourceUrl: 'https://crm.test/Default.aspx?Page=240&customerID=42',
        data: {
          ids: { contact: '42', account: '900' },
          contact: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test' },
          account: { name: 'Analytical Engines' },
          orders: [{ number: '101', total: 825 }],
          stats: { totalRevenue: 1250 },
          tasks: { open: [], done: [] },
        },
      },
    };

    const prepared = await hydrateWorkflowContact(contact, [contact], {
      rep: { employeeId: '7' },
      dispatch: async () => { fetches += 1; throw new Error('live fetch should not run'); },
    });

    assert.equal(fetches, 0);
    assert.equal(prepared.context.dataSource, 'page_engine_cache');
    assert.equal(prepared.context.email, 'ada@example.test');
    assert.equal(await prepared.context.getValue({ source: 'schema', ref: 'stats.totalRevenue' }), 1250);
    assert.equal(prepared.page.orders[0].number, '101');
    assert.equal(prepared.page.contact.firstName, 'Ada');
    assert.equal('pageEngineSnapshot' in prepared.page.contact, false);
    assert.equal('pageEngineSnapshot' in prepared.page.contacts[0], false);
  });

  it('gives an Action Shelf custom action the same live order data as a workflow', async () => {
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
    const result = await simulateProgram(RECONCILIATION_WORKFLOW, page, {
      run: makeSandboxRunner({ exec: fakeSandbox }),
    });

    assert.equal(result.ok, true);
    assert.match(String(result.result), /Anniversary: 0 edited, 0 unchanged, 4 created/);
    assert.match(String(result.result), /brand: 0 edited, 0 unchanged, 1 created/);
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

  it('ships the contact-page action with a byte-identical reconciliation body', () => {
    const marker = '/* ── Config';
    const workflowBody = RECONCILIATION_WORKFLOW.slice(RECONCILIATION_WORKFLOW.indexOf(marker));
    const actionBody = RECONCILIATION_ACTION.slice(RECONCILIATION_ACTION.indexOf(marker));
    assert.ok(workflowBody.length > 1000, 'the workflow body marker exists');
    assert.equal(actionBody, workflowBody, 'the action file body must not drift from the workflow body');
  });

  it('ships a contact-page action accepted by the live sandbox guard', () => {
    const traceBody = buildTraceBody(instrument(RECONCILIATION_ACTION).code);
    assert.equal(staticCheckCodeBody(traceBody), null);
    assert.match(
      staticCheckCodeBody('return window.location.href;'),
      /blocked: ambient window access not allowed/,
      'real ambient window access must remain blocked',
    );
  });

  it('initiates a brand-new record from its own page through the action surface', async () => {
    // A fresh account: a contact id and nothing else — no orders, no tasks.
    const page = shapeLivePage({
      data: {
        ids: { contact: '909', account: '' },
        contact: { id: '909', contactId: '909', contactName: 'New Account Buyer' },
        orders: [],
        tasks: { open: [], done: [] },
      },
    });
    const createWrites = [];
    const updateWrites = [];
    const result = await simulateProgram(RECONCILIATION_ACTION, page, {
      run: makeSandboxRunner({ exec: fakeSandbox }),
      executor: makeExecutor({
        ctx: { contactId: '909', contactName: 'New Account Buyer', employeeId: '7' },
        submitQuickTask: async ({ template, context }) => {
          createWrites.push({ template, context });
          return { ok: true, taskId: `new-${createWrites.length}` };
        },
        updateTaskById: async (id, fields) => {
          updateWrites.push({ id, fields });
          return { ok: true };
        },
      }),
    });
    assert.equal(result.ok, true);

    // No orders and no tasks → only the four rolling quarters are initiated,
    // each placed at the documented gap midpoint (each placement becomes a
    // touch for the next quarter's gap). No promotion tasks are ever created.
    const busy = [];
    const expected = [];
    for (let offset = 0; offset < 4; offset += 1) {
      const slot = rollingSlotOf(offset);
      const mid = gapMidpointOf(offset, busy);
      if (mid == null) continue;
      busy.push(mid);
      expected.push([`Q${slot.quarter} Reach Out Opportunity`, mid - dayNumOf(atNoonDay(0))]);
    }
    assert.deepEqual(
      createWrites.map((write) => [write.template.subject, write.template.daysOut]),
      expected,
    );
    assert.ok(createWrites.every((write) => write.context.contactId === '909'));
    assert.equal(updateWrites.length, expected.length, 'each quarterly create receives its live date');
    assert.match(String(result.result), /Anniversary: 0 edited, 0 unchanged, 0 created/);
    assert.match(String(result.result), /brand: 0 edited, 0 unchanged, 0 created/);
  });

  it('skips a page that is not a readable CRM record', async () => {
    const page = shapeLivePage({ data: {} });
    const writes = [];
    const result = await simulateProgram(RECONCILIATION_ACTION, page, {
      run: makeSandboxRunner({ exec: fakeSandbox }),
      executor: {
        async run(name, input) {
          writes.push([name, input]);
          return { ok: true, taskId: 'never' };
        },
        async commitEdits() { return { ok: true }; },
      },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(writes, []);
    assert.match(String(result.result), /^Skipped — no CRM record readable on this page/);
  });

  it('skips a write that depends on a failed prior write and surfaces the real reason', async () => {
    // A createTask that fails at the CRM layer must not cascade into a
    // misleading "updateTask needs a task id"; the dependent update is SKIPPED
    // carrying the upstream reason, so one real failure reads as one failure.
    const page = shapeLivePage({
      data: {
        ids: { contact: '77', account: '' },
        contact: { id: '77', contactId: '77', contactName: 'Dep Buyer' },
        orders: [],
        tasks: { open: [], done: [] },
      },
    });
    const code = `
      const created = await actions.createTask({ subject: "New" });
      if (created?.taskId) {
        await actions.updateTask({ id: created.taskId, fields: { liveDate: "2026-08-01" } });
      }
      return "done";
    `;
    let updateCalls = 0;
    const result = await simulateProgram(code, page, {
      run: makeSandboxRunner({ exec: fakeSandbox }),
      executor: makeExecutor({
        ctx: { contactId: '77', contactName: 'Dep Buyer', employeeId: '7' },
        submitQuickTask: async () => ({ ok: false, error: 'CRM returned HTTP 500.' }),
        updateTaskById: async () => { updateCalls += 1; return { ok: true }; },
      }),
    });

    const create = result.trace.find((entry) => entry.contract === 'createTask');
    const update = result.trace.find((entry) => entry.contract === 'updateTask');
    assert.equal(create.status, 'failed');
    assert.match(create.errors[0], /CRM returned HTTP 500/);
    // The dependent update is skipped, not failed, and never hits the CRM.
    assert.equal(update.status, 'skipped');
    assert.match(update.reason, /prior step failed: CRM returned HTTP 500/);
    assert.equal(updateCalls, 0, 'a dependent of a failed create never calls the real writer');
  });

  it('leaves an existing non-owned task as read-only context and never edits it', async () => {
    // A task the workflow does not own (a manual follow-up, or a leftover
    // promotion task) is counted as a quarter-covering touch but is never
    // revived, re-dated, or recreated — the workflow only owns anniversary,
    // quarterly, and brand tasks.
    const currentSlot = rollingSlotOf(0);
    const touchDate = new Date(currentSlot.year, (currentSlot.quarter - 1) * 3 + 1, 12, 12);
    const page = shapeLivePage({
      data: {
        ids: { contact: '202', account: '' },
        contact: { id: '202', contactId: '202', contactName: 'Grace Buyer' },
        orders: [],
        tasks: {
          open: [
            {
              id: 'manual-1',
              subject: '#1 Srixon Promotion Campaign Follow Up',
              dueDate: isoOf(touchDate),
              liveDate: isoOf(atNoonDay(6)),   // future live date — left untouched
            },
          ],
          done: [],
        },
      },
    });
    const createWrites = [];
    const updateWrites = [];
    const result = await simulateProgram(RECONCILIATION_WORKFLOW, page, {
      run: makeSandboxRunner({ exec: fakeSandbox }),
      executor: makeExecutor({
        ctx: { contactId: '202', contactName: 'Grace Buyer', employeeId: '7' },
        submitQuickTask: async ({ template, context }) => {
          createWrites.push({ template, context });
          return { ok: true, taskId: `q-${createWrites.length}` };
        },
        updateTaskById: async (id, fields) => {
          updateWrites.push({ id, fields });
          return { ok: true };
        },
      }),
    });
    assert.equal(result.ok, true);

    // The non-owned task is never touched (no revive, no recreate).
    assert.ok(!updateWrites.some((write) => write.id === 'manual-1'), 'a non-owned task is never edited');
    assert.ok(
      !createWrites.some((write) => /Promotion Campaign Follow Up/.test(write.template.subject)),
      'the workflow never creates promotion tasks',
    );

    // But it counts as a touch covering its quarter; the other three quarters
    // each get one reach-out at the documented gap midpoint.
    const busy = [dayNumOf(touchDate)];
    const expected = [];
    for (let offset = 0; offset < 4; offset += 1) {
      const slot = rollingSlotOf(offset);
      const key = `${slot.year}-Q${slot.quarter}`;
      const covered = busy.some((day) => {
        const date = dateOfDayNum(day);
        return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}` === key;
      });
      if (covered) continue;
      const mid = gapMidpointOf(offset, busy);
      busy.push(mid);
      expected.push([`Q${slot.quarter} Reach Out Opportunity`, mid - dayNumOf(atNoonDay(0))]);
    }
    assert.deepEqual(
      createWrites.map((write) => [write.template.subject, write.template.daysOut]),
      expected,
    );
    assert.match(String(result.result), /quarterly: 3 created, 0 rescheduled, 0 already placed, 1 covered/);
  });

  it('reschedules existing quarterly tasks to the middle of the gap and retires duplicates', async () => {
    const currentSlot = rollingSlotOf(0);
    const nextSlot = rollingSlotOf(1);
    const nextQuarterTouch = new Date(nextSlot.year, (nextSlot.quarter - 1) * 3, 10, 12);
    const page = shapeLivePage({
      data: {
        ids: { contact: '101', account: '' },
        contact: { id: '101', contactId: '101', contactName: 'Ada Buyer' },
        orders: [],
        tasks: {
          open: [
            {
              id: 'keeper',
              subject: `Q${currentSlot.quarter} Reach Out Opportunity`,
              dueDate: isoOf(atNoonDay(3)),      // the arbitrary legacy date
              liveDate: isoOf(atNoonDay(-100)),
            },
            {
              id: 'dup',
              subject: `Q${currentSlot.quarter} Reach Out Opportunity`,
              dueDate: isoOf(atNoonDay(40)),
              liveDate: isoOf(atNoonDay(26)),
            },
            {
              id: 'manual',
              subject: 'Client check-in',
              dueDate: isoOf(nextQuarterTouch),  // the "task next quarter"
              liveDate: isoOf(atNoonDay(0)),
            },
          ],
          done: [
            { id: 'promo-1-done', subject: '#1 Srixon Promotion Campaign Follow Up', dueDate: isoOf(atNoonDay(-45)) },
            { id: 'promo-2-done', subject: '#2 Srixon Promotion Campaign Follow Up', dueDate: isoOf(atNoonDay(-40)) },
          ],
        },
      },
    });
    const createWrites = [];
    const updateWrites = [];
    const completeWrites = [];
    const result = await simulateProgram(RECONCILIATION_WORKFLOW, page, {
      run: makeSandboxRunner({ exec: fakeSandbox }),
      executor: makeExecutor({
        ctx: { contactId: '101', contactName: 'Ada Buyer', employeeId: '7' },
        submitQuickTask: async ({ template, context }) => {
          createWrites.push({ template, context });
          return { ok: true, taskId: `q-${createWrites.length}` };
        },
        updateTaskById: async (id, fields) => {
          updateWrites.push({ id, fields });
          return { ok: true };
        },
        completeTaskById: async (id) => {
          completeWrites.push(String(id));
          return { ok: true };
        },
      }),
    });
    assert.equal(result.ok, true);

    // The duplicate quarterly task for the same slot is retired.
    assert.deepEqual(completeWrites, ['dup']);

    // Busy touches: the completed promotion tasks and the next-quarter task.
    // The keeper's own arbitrary date is NOT a touch — it is being re-placed.
    const busy = [dayNumOf(atNoonDay(-45)), dayNumOf(atNoonDay(-40)), dayNumOf(nextQuarterTouch)];
    const expectedMid = gapMidpointOf(0, busy);
    const keeperEdit = updateWrites.find((write) => write.id === 'keeper');
    const expectedFields = {};
    if (isoOf(dateOfDayNum(expectedMid)) !== isoOf(atNoonDay(3))) {
      expectedFields.dueDate = isoOf(dateOfDayNum(expectedMid));
    }
    expectedFields.liveDate = isoOf(dateOfDayNum(expectedMid - 14));
    assert.equal(keeperEdit.fields.dueDate, expectedFields.dueDate);
    assert.equal(keeperEdit.fields.liveDate, expectedFields.liveDate);
    assert.match(keeperEdit.fields.description, /middle of the gap/);

    // The next quarter is covered by the manual task; the two quarters after
    // it are created at their own gap midpoints (each placement becomes a
    // touch for the next).
    busy.push(expectedMid);
    const expectedCreates = [];
    for (const offset of [2, 3]) {
      const slot = rollingSlotOf(offset);
      const mid = gapMidpointOf(offset, busy);
      busy.push(mid);
      expectedCreates.push([`Q${slot.quarter} Reach Out Opportunity`, mid - dayNumOf(atNoonDay(0))]);
    }
    const quarterlyCreates = createWrites
      .filter((write) => /^Q[1-4] Reach Out Opportunity$/.test(write.template.subject))
      .map((write) => [write.template.subject, write.template.daysOut]);
    assert.deepEqual(quarterlyCreates, expectedCreates);

    assert.match(
      String(result.result),
      /quarterly: 2 created, 1 rescheduled, 0 already placed, 1 covered, 1 duplicate\(s\) retired/,
    );
  });

  it('preserves an in-flight anniversary cycle instead of pushing it a year out', async () => {
    const anniversary = atNoonDay(10);
    const year = anniversary.getFullYear();
    const monthName = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ][anniversary.getMonth()];
    const orderDate = `${year - 1}-${String(anniversary.getMonth() + 1).padStart(2, '0')}-${String(anniversary.getDate()).padStart(2, '0')}`;
    const first = new Date(anniversary.getTime() - 21 * DAY_MS);   // passed
    const second = new Date(anniversary.getTime() - 14 * DAY_MS);  // passed
    const call = new Date(anniversary.getTime() - 7 * DAY_MS);     // upcoming
    const third = mondayBeforeOf(anniversary);                     // upcoming
    const page = shapeLivePage({
      data: {
        ids: { contact: '303', account: '' },
        contact: { id: '303', contactId: '303', contactName: 'Flow Buyer' },
        orders: [
          { number: '9001', summary: 'Acme Pro Widget Set', date: orderDate, status: 'Complete' },
        ],
        tasks: {
          open: [
            {
              id: 'inflight-2',
              subject: `Order Anniversary Follow Up #2 [${year}]`,
              dueDate: isoOf(second),
              liveDate: isoOf(new Date(second.getTime() - 14 * DAY_MS)),
            },
            {
              id: 'inflight-3',
              subject: `Order Anniversary Follow Up #3 [${year}]`,
              dueDate: isoOf(third),
              liveDate: isoOf(new Date(third.getTime() - 14 * DAY_MS)),
            },
          ],
          done: [
            {
              id: 'inflight-1-done',
              subject: `Order Anniversary Follow Up #1 [${year}]`,
              dueDate: isoOf(first),
            },
          ],
        },
      },
    });
    const writes = [];
    const result = await simulateProgram(RECONCILIATION_WORKFLOW, page, {
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

    // The in-flight cycle stays THIS year: nothing is redated or retired, and
    // no task ever carries next year's bracket.
    assert.ok(!writes.some(([name]) => name === 'completeTask'));
    assert.ok(!writes.some(([name, input]) => name === 'updateTask'
      && (input.id === 'inflight-2' || input.id === 'inflight-3')));
    assert.ok(!writes.some(([, input]) => JSON.stringify(input).includes(`[${year + 1}]`)));

    // Only the missing Call slot is created, at its original in-cycle date.
    const callCreate = writes.find(([name, input]) => name === 'createTask'
      && input.subject === `Order Anniversary Follow Up Call - [${monthName}]`);
    assert.ok(callCreate, 'the missing call slot is back-filled');
    assert.equal(callCreate[1].daysOut, Math.round(dayNumOf(call) - dayNumOf(atNoonDay(0))));
    assert.equal(callCreate[1].categoryId, 7);

    // The completed #1 fulfills its slot — it is not recreated.
    assert.ok(!writes.some(([name, input]) => name === 'createTask' && /#1 \[/.test(input.subject)
      && /Order Anniversary/.test(input.subject)));

    assert.match(
      String(result.result),
      /Anniversary: 0 edited, 2 unchanged, 1 created, 1 already completed, 0 past slot\(s\) skipped, 0 retired/,
    );
    assert.match(String(result.result), /brand: 0 edited, 0 unchanged, 1 created, 0 retired/);
  });

  it('edits Task List rows through the same executor used by workflows', async () => {
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

  it('maintains quarterly coverage in the main workflow even without orders', async () => {
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
    const result = await simulateProgram(RECONCILIATION_WORKFLOW, page, {
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
    // The existing dated touch covers the current quarter; the next three
    // quarters each get one reach-out.
    assert.equal(quarterly.length, 3);
    assert.ok(quarterly.every((task) => task.daysOut >= 0));
    assert.ok(quarterly.every((task) => task.categoryId === 14));
    assert.match(String(result.result), /quarterly: 3 created, 0 rescheduled, 0 already placed, 1 covered/);
    assert.match(String(result.result), /Anniversary: 0 edited, 0 unchanged, 0 created/);
    assert.match(String(result.result), /brand: 0 edited, 0 unchanged, 0 created/);
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
        body: "Workflow integration test",
        priority: "low",
        daysOut: 0
      });
      await actions.completeTask({ id: created.taskId });
      await actions.addNote({
        subject: "Workflow QA",
        body: "Verified " + c.contactName
      });
      await page.tasks.open[0].complete();
      c.jobTitle = "Workflow verified";
      await c.commit();
      return c.contactId;
    `;

    const output = await runCodeWorkflow({
      workflow: {
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
        return hydrateWorkflowContact(contact, ordered, {
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
      ['2', 'edit', '2', 'Workflow verified'],
      ['1', 'create', 'QA Contact 1', '1'],
      ['1', 'complete', 'new-1'],
      ['1', 'note', 'Verified Contact 1', '5550001'],
      ['1', 'complete', 'old-1'],
      ['1', 'edit', '1', 'Workflow verified'],
    ]);
    assert.equal(output.effects, 10);
    assert.deepEqual(output.results.map((row) => row.result), ['2', '1']);
    assert.ok(output.results.every((row) => row.status === 'sent'));
  });

  /* Shared fixture for the reconciliation tests: Titleist April orders,
     one Vice December order, four undated Callaway orders, plus a legacy
     Prior Year task, a stale Titleist tier task, and one unrelated task. */
  function reconciliationFixturePage() {
    const sourceContact = {
      contactId: '771',
      contactName: 'Avery Buyer',
      contactUrl: 'https://crm.test/Default.aspx?Page=240&customerID=771',
    };
    return workflowPageFromContext({
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
  }

  /* The fixture's expected desired state, restated from the docs. */
  function reconciliationFixtureExpectations() {
    const cycles = [
      anniversaryCycleFor(3, 15, 'April'),      // Titleist: 4/24 + 4/6 average to April 15
      anniversaryCycleFor(11, 12, 'December'),  // Vice: December 12
    ].sort((a, b) => a.firstTime - b.firstTime);
    const anniversarySubjects = cycles.flatMap((cycle) => [
      `Order Anniversary Follow Up #1 [${cycle.year}]`,
      `Order Anniversary Follow Up #2 [${cycle.year}]`,
      `Order Anniversary Follow Up Call - [${cycle.monthName}]`,
      `Order Anniversary Follow Up #3 [${cycle.year}]`,
    ]);
    const anniversaryDates = cycles.flatMap((cycle) => cycle.dates);
    const todayN = dayNumOf(atNoonDay(0));
    // Busy touches during quarterly placement: only the eight anniversary
    // dates (old-1 is edited onto the first one). Brand tasks are placed after
    // quarterly and their far-future 2030 due date is outside every rolling
    // quarter, so it is not a touch; the unrelated + tier tasks are undated.
    const busy = [...anniversaryDates.map(dayNumOf)];
    const coveredKeys = new Set(busy.map((day) => {
      const date = dateOfDayNum(day);
      return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
    }));
    const quarterly = [];
    for (let offset = 0; offset < 4; offset += 1) {
      const slot = rollingSlotOf(offset);
      if (coveredKeys.has(`${slot.year}-Q${slot.quarter}`)) continue;
      const mid = gapMidpointOf(offset, busy);
      if (mid == null) continue;
      busy.push(mid);
      quarterly.push({ subject: `Q${slot.quarter} Reach Out Opportunity`, mid });
    }
    return { cycles, anniversarySubjects, quarterly, todayN };
  }

  it('reconciles a contact timeline: edits tasks in place and creates only the rest', async () => {
    const page = reconciliationFixturePage();
    assert.equal(page.account, undefined);
    assert.equal(page.contact.contactId, '771');
    assert.equal(page.orders.length, 7);

    const writes = [];
    const result = await simulateProgram(RECONCILIATION_WORKFLOW, page, {
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
    const functionTrace = result.trace.filter((entry) => entry.kind === 'function');
    assert.ok(functionTrace.length > 7, 'helper calls should remain visible to Simulate');
    assert.ok(
      [...new Set(functionTrace.map((entry) => entry.id))]
        .some((id) => functionTrace.filter((entry) => entry.id === id).length > 1),
      'a repeated helper should reuse its stable function block id',
    );

    const { cycles, anniversarySubjects, quarterly } = reconciliationFixtureExpectations();

    // NOTHING is completed-and-remade: no completeTask writes at all.
    assert.ok(!writes.some(([name]) => name === 'completeTask'), 'reconciliation never retires matched tasks');

    // Write shape: 7 anniversary creates (each with its liveDate update), one
    // create+update per uncovered quarter, two brand creates with updates,
    // then the two staged in-place edits.
    assert.deepEqual(writes.map(([name]) => name), [
      ...Array.from({ length: 7 }, () => ['createTask', 'updateTask']).flat(),
      ...Array.from({ length: quarterly.length }, () => ['createTask', 'updateTask']).flat(),
      ...Array.from({ length: 2 }, () => ['createTask', 'updateTask']).flat(),
      'updateTask', 'updateTask',
    ]);

    const created = writes.filter(([name]) => name === 'createTask').map(([, input]) => input);
    assert.deepEqual(
      created.map((task) => task.subject),
      [
        // The legacy Prior Year #1 matched the first #1 slot, so only the
        // remaining seven anniversary tasks are created.
        ...anniversarySubjects.filter((_, index) => index !== 0),
        ...quarterly.map((slot) => slot.subject),
        'Callaway Customer - Tier 1',
        'Vice Customer - Tier 3',
      ],
    );
    assert.ok(created.every((task) => Number.isInteger(task.daysOut) && task.daysOut >= 0));
    assert.ok(
      created.slice(0, 7).every((task) => task.categoryId === 7),
      'anniversary tasks carry the Order History Special category',
    );

    // Quarterly reach-outs land at the documented gap midpoints.
    const quarterlyCreates = created.filter((task) => /^Q[1-4] Reach Out Opportunity$/.test(task.subject));
    assert.deepEqual(
      quarterlyCreates.map((task) => task.daysOut),
      quarterly.map((slot) => slot.mid - dayNumOf(atNoonDay(0))),
    );
    assert.ok(quarterlyCreates.every((task) => task.categoryId === 14));

    const decemberCall = created.find((task) => task.subject === 'Order Anniversary Follow Up Call - [December]');
    const aprilCall = created.find((task) => task.subject === 'Order Anniversary Follow Up Call - [April]');
    assert.match(decemberCall.body, /Vice Drive Custom Logo/);
    assert.match(decemberCall.body, /Follow-up timing: 1 week before/);
    assert.match(aprilCall.body, /Titleist Pro V1 Personalized/);
    assert.match(aprilCall.body, /Averaged reorder anniversary: April 15/);

    // The legacy Prior Year task was EDITED into the first #1 slot.
    const edits = writes.filter(([name]) => name === 'updateTask').map(([, input]) => input);
    const priorEdit = edits.find((edit) => edit.id === 'old-1');
    assert.equal(priorEdit.fields.subject, `Order Anniversary Follow Up #1 [${cycles[0].year}]`);
    assert.equal(priorEdit.fields.dueDate, isoOf(cycles[0].dates[0]));
    assert.equal(priorEdit.fields.liveDate, isoOf(new Date(cycles[0].dates[0].getTime() - 14 * DAY_MS)));
    assert.match(priorEdit.fields.description, /Prior-year reorder timeline/);

    // The stale Titleist tier task moved to Tier 2 in place. Its due date is
    // the 2030 review, but its live date is TODAY so it indexes now (it had no
    // prior live date to preserve).
    const brandEdit = edits.find((edit) => edit.id === 'old-brand-1');
    assert.equal(brandEdit.fields.subject, 'Titleist Customer - Tier 2');
    assert.equal(brandEdit.fields.dueDate, '2030-12-17');
    assert.equal(brandEdit.fields.liveDate, isoOf(atNoonDay(0)));
    assert.match(brandEdit.fields.description, /Order count: 2/);
    assert.match(brandEdit.fields.description, /#5063056/);
    assert.match(brandEdit.fields.description, /#5048594/);

    // The unrelated task was never written.
    assert.ok(!edits.some((edit) => edit.id === 'keep-1'));

    const brandCreates = created.filter((task) => / Customer - Tier /.test(task.subject));
    assert.match(brandCreates[0].body, /Order count: 4/);
    assert.match(brandCreates[1].body, /Order count: 1/);
    assert.ok(brandCreates.every((task) => /review due 12\/17\/2030/.test(task.body)));
    const computedBrandDue = atNoonDay(brandCreates[0].daysOut);
    assert.deepEqual(
      [computedBrandDue.getFullYear(), computedBrandDue.getMonth() + 1, computedBrandDue.getDate()],
      [2030, 12, 17],
    );
    // Newly created brand tasks are made live today via their liveDate update.
    const brandCreateUpdates = writes
      .filter(([name, input]) => name === 'updateTask' && String(input.id).startsWith('task-'))
      .map(([, input]) => input.fields.liveDate);
    assert.ok(brandCreateUpdates.includes(isoOf(atNoonDay(0))), 'a created brand task is set live today');

    assert.match(result.result, /Anniversary: 1 edited, 0 unchanged, 7 created, 0 already completed, 0 past slot\(s\) skipped, 0 retired/);
    assert.match(result.result, new RegExp(`quarterly: ${quarterly.length} created, 0 rescheduled, 0 already placed, ${4 - quarterly.length} covered, 0 duplicate\\(s\\) retired`));
    assert.match(result.result, /brand: 1 edited, 0 unchanged, 2 created, 0 retired/);
  });

  it('is idempotent: an immediate re-run performs zero writes', async () => {
    const page = reconciliationFixturePage();
    const writes = [];
    const executorFor = (sink) => ({
      async run(name, input) {
        sink.push([name, input]);
        return { ok: true, taskId: `task-${sink.length}` };
      },
      async commitEdits() { return { ok: true }; },
    });
    const first = await simulateProgram(RECONCILIATION_WORKFLOW, page, {
      run: makeSandboxRunner({ exec: fakeSandbox }),
      executor: executorFor(writes),
    });
    assert.equal(first.ok, true);
    assert.ok(writes.length > 0, 'the first run initiates the flows');

    // Apply the first run's writes to the raw task model the way the CRM
    // would: creates become open rows (live today unless updated), updates
    // patch fields, completes move rows to done.
    const categoryLabel = (id) => (id === 7 ? 'Order History Special' : id === 14 ? 'Workflow Task' : '');
    const openRows = [
      { id: 'old-1', subject: 'Prior Year #1 [2023]' },
      { id: 'old-brand-1', subject: 'Titleist Customer - Tier 3' },
      { id: 'keep-1', subject: 'Normal follow up' },
    ];
    const doneRows = [];
    const rowById = new Map(openRows.map((row) => [row.id, row]));
    let createdCount = 0;
    for (const [name, input] of writes) {
      createdCount += 1;
      if (name === 'createTask') {
        const row = {
          id: `task-${createdCount}`,
          subject: input.subject,
          dueDate: isoOf(atNoonDay(input.daysOut || 0)),
          liveDate: isoOf(atNoonDay(0)),
          category: categoryLabel(input.categoryId),
        };
        openRows.push(row);
        rowById.set(row.id, row);
      } else if (name === 'updateTask') {
        const row = rowById.get(String(input.id));
        assert.ok(row, `update targets a known task (${input.id})`);
        for (const [key, value] of Object.entries(input.fields || {})) {
          if (key === 'categoryId') row.category = categoryLabel(value);
          else if (key !== 'description') row[key] = value;
        }
      } else if (name === 'completeTask') {
        const index = openRows.findIndex((row) => row.id === String(input.id));
        assert.ok(index >= 0, 'completes target open tasks');
        doneRows.push(openRows[index]);
        openRows.splice(index, 1);
      }
    }

    const sourceContact = {
      contactId: '771',
      contactName: 'Avery Buyer',
      contactUrl: 'https://crm.test/Default.aspx?Page=240&customerID=771',
    };
    const convergedPage = workflowPageFromContext({
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
        tasks: { open: openRows, done: doneRows },
      },
    }, [sourceContact]);

    const secondWrites = [];
    const second = await simulateProgram(RECONCILIATION_WORKFLOW, convergedPage, {
      run: makeSandboxRunner({ exec: fakeSandbox }),
      executor: executorFor(secondWrites),
    });
    assert.equal(second.ok, true);
    assert.deepEqual(secondWrites, [], 'a converged record produces zero writes');
    assert.match(String(second.result), /Anniversary: 0 edited/);
    assert.match(String(second.result), /quarterly: 0 created, 0 rescheduled/);
  });

  it('keeps the newest source year per month and skips a different workflow within 20 days', async () => {
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
    const result = await simulateProgram(RECONCILIATION_WORKFLOW, page, {
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
      'the lower-ranked adjacent workflow should not create any tasks',
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
    assert.match(result.result, /skipped 1 overlapping anniversary workflow\(s\)/);
  });

  it('does not count function-entry animation events as workflow actions', async () => {
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
    const output = await runCodeWorkflow({
      workflow: {
        automation: code,
        paceDelay: 0,
        paceJitter: 0,
        sendCap: 0,
      },
      audience,
      dryRun: true,
      prepareContact: async (contact, ordered) => hydrateWorkflowContact(contact, ordered, {
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
    const output = await runCodeWorkflow({
      workflow: {
        automation: code,
        sendCap: 2,
        suppressDoNotContact: true,
      },
      audience,
      dryRun: false,
      prepareContact: async (contact, ordered) => hydrateWorkflowContact(contact, ordered, {
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
