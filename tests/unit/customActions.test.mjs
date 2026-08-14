/**
 * Custom actions — the data layer for user-authored shelf actions.
 * Pins normalization/defaults, page-scope toggling (shared with featureConfig),
 * upsert/remove purity, and the authoring sample fixtures.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCustomAction, defaultPagesFor, toggleActionPage, upsertCustomAction,
  removeCustomActionFrom, blankCustomAction, starterSource,
} from '../../src/lib/customActions.js';
import {
  createCustomActionEntryPointRegistry,
  normalizeEntryPoints,
} from '../../src/lib/customActionEntryPoints.js';
import { buildTaskListActionContext } from '../../src/lib/taskListActionContext.js';
import { samplePageFor } from '../../src/lib/codeEngine/samplePages.js';
import {
  shapeLivePage,
  ctxFromPage,
  liveActionContextCount,
  liveActionRunPolicy,
} from '../../src/lib/codeEngine/liveActionRun.js';

describe('customActions · normalize', () => {
  it('fills defaults and clamps an unknown page type to contact', () => {
    const a = normalizeCustomAction({ name: '  Ship it  ', pageType: 'nope' });
    assert.equal(a.pageType, 'contact');
    assert.equal(a.name, 'Ship it');
    assert.equal(a.icon, 'bolt');
    assert.equal(a.enabled, true);
    assert.equal(a.showInShelf, true);
    assert.equal(a.showInPopup, false);
    assert.deepEqual(a.pages, ['contact']); // default from page type
    assert.deepEqual(a.entryPoints, []);
    assert.ok(a.id.startsWith('ca_'));
  });

  it('custom page type defaults to any-page scope', () => {
    assert.deepEqual(defaultPagesFor('custom'), ['*']);
    assert.deepEqual(defaultPagesFor('order'), ['order']);
    assert.deepEqual(normalizeCustomAction({ pageType: 'custom' }).pages, ['*']);
  });

  it('any page type is valid and scopes to every page', () => {
    assert.deepEqual(defaultPagesFor('any'), ['*']);
    const a = normalizeCustomAction({ pageType: 'any' });
    assert.equal(a.pageType, 'any');
    assert.deepEqual(a.pages, ['*']);
    assert.match(starterSource('any'), /runs on any page/);
  });

  it('preserves a saved page scope + surface flags + custom link', () => {
    const a = normalizeCustomAction({
      pageType: 'order',
      pages: ['order', 'account'],
      entryPoints: ['.gb-task-list-modal', 'modal:task-list'],
      showInPopup: true,
      enabled: false,
      customUrl: '  /Admin/Order  ',
    });
    assert.deepEqual(a.pages, ['order', 'account']);
    assert.deepEqual(a.entryPoints, ['.gb-task-list-modal', 'modal:task-list']);
    assert.equal(a.showInPopup, true);
    assert.equal(a.enabled, false);
    assert.equal(a.customUrl, '/Admin/Order');   // trimmed
  });

  it('seeds a blank action with a starter script for its type', () => {
    const b = blankCustomAction('order');
    assert.equal(b.pageType, 'order');
    assert.match(b.source, /actions\.createTask/);
    assert.match(starterSource('custom'), /Custom action/);
  });
});

describe('customActions · entry points', () => {
  it('normalizes comma/newline tokens and removes duplicates', () => {
    assert.deepEqual(
      normalizeEntryPoints(' .gb-task-list-modal, modal:task-list\n.gb-task-list-modal '),
      ['.gb-task-list-modal', 'modal:task-list'],
    );
  });

  it('resolves a mounted provider by id or CSS alias with lazy data', () => {
    const registry = createCustomActionEntryPointRegistry();
    let reads = 0;
    let refreshes = 0;
    const unregister = registry.register({
      id: 'task-list',
      aliases: ['.gb-task-list-modal'],
      modalId: 'task-list',
      getData: () => {
        reads += 1;
        return { tasks: [{ id: 't1' }] };
      },
      onRunComplete: () => {
        refreshes += 1;
      },
    });

    const visibility = registry.resolve(['.gb-task-list-modal'], null, { includeData: false });
    assert.equal(visibility[0].modalId, 'task-list');
    assert.equal(reads, 0);
    const run = registry.resolve(['task-list'], null);
    assert.equal(run[0].data.tasks[0].id, 't1');
    assert.equal(reads, 1);
    return registry.notifyRunComplete(run).then(() => {
      assert.equal(refreshes, 1);
      unregister();
      assert.deepEqual(registry.resolve(['task-list'], null), []);
    });
  });

  it('falls back to a raw CSS selector when no data provider registered it', () => {
    const registry = createCustomActionEntryPointRegistry();
    const doc = { querySelector: (selector) => (selector === '.mounted-tool' ? {} : null) };
    const matches = registry.resolve(['.mounted-tool'], doc);
    assert.equal(matches[0].id, 'selector:.mounted-tool');
    assert.equal(matches[0].data, null);
  });
});

describe('customActions · Task List context', () => {
  it('publishes every task with contact ids, dates, filters, and unique contacts', () => {
    const rows = [
      {
        id: 't1',
        account: 'Northwind',
        accountUrl: '/Default.aspx?Page=271&AccountID=90',
        contact: 'Avery Buyer',
        contactUrl: '/Default.aspx?Page=240&customerID=77',
        due: '8/15/2026',
        category: 'Follow Up',
        priority: 2,
        subject: 'Quarterly call',
        status: 'New',
      },
      {
        id: 't2',
        account: 'Northwind',
        contact: 'Avery Buyer',
        contactId: '77',
        dueDate: new Date(2026, 10, 15, 12),
        category: 'Email',
        priority: 3,
        subject: 'Holiday check-in',
        status: 'New',
      },
    ];
    const data = buildTaskListActionContext({
      rows,
      visibleRows: [rows[0]],
      selectedIds: new Set(['t1']),
      filters: { query: 'quarter', status: '1' },
    });

    assert.equal(data.totalCount, 2);
    assert.equal(data.visibleCount, 1);
    assert.equal(data.contacts.length, 1);
    assert.equal(data.contacts[0].contactId, '77');
    assert.deepEqual(data.contacts[0].taskIds, ['t1', 't2']);
    assert.equal(data.tasks[0].accountId, '90');
    assert.equal(data.tasks[0].dueDate, '2026-08-15');
    assert.equal(data.tasks[0].visible, true);
    assert.equal(data.tasks[0].selected, true);
    assert.equal(data.tasks[1].dueDate, '2026-11-15');
    assert.equal(data.filters.query, 'quarter');
  });
});

describe('customActions · list ops (pure)', () => {
  it('toggleActionPage narrows from all to a specific page', () => {
    const a = normalizeCustomAction({ pageType: 'custom' }); // pages ['*']
    const next = toggleActionPage(a, 'contact');
    assert.deepEqual(next.pages, ['contact']);
    assert.notEqual(next, a); // new object
  });

  it('upsert adds then updates by id without mutating the input', () => {
    const list = [];
    const a = normalizeCustomAction({ id: 'ca_x', name: 'One' });
    const l1 = upsertCustomAction(list, a);
    assert.equal(l1.length, 1);
    assert.equal(list.length, 0); // original untouched
    const l2 = upsertCustomAction(l1, { ...a, name: 'Two' });
    assert.equal(l2.length, 1);
    assert.equal(l2[0].name, 'Two');
  });

  it('remove drops the matching id', () => {
    const list = [normalizeCustomAction({ id: 'ca_a' }), normalizeCustomAction({ id: 'ca_b' })];
    const next = removeCustomActionFrom(list, 'ca_a');
    assert.equal(next.length, 1);
    assert.equal(next[0].id, 'ca_b');
  });
});

describe('customActions · sample pages', () => {
  it('gives a contact page real contact + open tasks', () => {
    const p = samplePageFor('contact');
    assert.equal(p.contact.firstName, 'Jordan');
    assert.ok(p.tasks.open.length >= 1);
    assert.equal(p.orders.length, 3);
    assert.equal(p.orders[0].number, '5063056');
    assert.equal(p.items[0].name, 'Titleist Pro V1 Personalized Golf Balls');
    assert.equal(p.count, 1);
  });

  it('gives an order page order data + no contact tasks', () => {
    const p = samplePageFor('order');
    assert.equal(p.order.id, '100245');
    assert.deepEqual(p.tasks.open, []);
  });

  it('supplies representative Task List entry-point data during authoring', () => {
    const p = samplePageFor('custom', { entryPoints: ['.gb-task-list-modal'] });
    assert.equal(p.entryPoint.id, 'task-list');
    assert.equal(p.entryPoint.data.kind, 'task-list');
    assert.equal(p.entryPoint.data.contacts.length, 2);
    assert.equal(p.entryPoint.data.tasks.length, 2);
  });
});

describe('customActions · live run shaping', () => {
  it('preserves the full runEngine record while overlaying code controls', () => {
    const page = shapeLivePage({
      data: {
        ids: { contact: '99', account: '7' },
        contact: { id: '99', firstName: 'Ada', email: 'ada@x.com' },
        contacts: [{ id: '99' }, { id: '100' }],
        account: { name: 'Analytical Engines' },
        orders: [{ number: '5063056', summary: 'Titleist Pro V1' }],
        items: [{ name: 'Titleist Pro V1', quantity: 2 }],
        activities: [{ id: 'a1', subject: 'Called' }],
        proofs: [{ id: 'p1' }],
        stats: { orderCount: 1 },
        tasks: { open: [{ id: 't1' }], done: [] },
      },
      errors: ['wrapper metadata must not become page data'],
    });
    assert.equal(page.count, 1);
    assert.equal(page.contacts.length, 1);
    assert.equal(page.contact.email, 'ada@x.com');
    assert.equal(page.tasks.open.length, 1);
    assert.equal(page.orders[0].number, '5063056');
    assert.equal(page.items[0].quantity, 2);
    assert.equal(page.activities[0].id, 'a1');
    assert.equal(page.proofs[0].id, 'p1');
    assert.equal(page.stats.orderCount, 1);
    assert.equal(page.account.name, 'Analytical Engines');
    assert.equal(page.ids.account, '7');
    assert.deepEqual(page.relatedContacts.map((contact) => contact.id), ['99', '100']);
    assert.equal(page.errors, undefined);
  });

  it('copies schema ids into the live contact just like workflow hydration', () => {
    const page = shapeLivePage({
      data: {
        ids: { contact: '771', account: '902' },
        contact: { firstName: 'Avery', lastName: 'Buyer', email: 'avery@example.test' },
      },
    });
    assert.equal(page.contact.contactId, '771');
    assert.equal(page.contact.accountId, '902');
    assert.equal(page.contact.contactName, 'Avery Buyer');
    assert.equal(page.contacts[0].contactId, '771');
    assert.deepEqual(ctxFromPage(page), {
      contactId: '771',
      contactName: 'Avery Buyer',
      phone: '',
      accountId: '902',
      email: 'avery@example.test',
    });
  });

  it('runs one-record shelf actions directly and keeps broad actions confirmed', () => {
    const single = shapeLivePage({
      data: { ids: { contact: '42' }, contact: { firstName: 'Ada' } },
    });
    assert.equal(liveActionContextCount(single), 1);
    assert.deepEqual(liveActionRunPolicy(single, { maxGate: 'confirm' }), {
      contextCount: 1,
      confirm: false,
      announceSuccess: false,
    });

    const broad = {
      ...single,
      entryPoints: [{ data: { contacts: [{ contactId: '42' }, { contactId: '84' }] } }],
    };
    assert.equal(liveActionContextCount(broad), 2);
    assert.equal(liveActionRunPolicy(broad, { maxGate: 'confirm' }).confirm, true);
    assert.equal(liveActionRunPolicy(single, { maxGate: 'hard' }).confirm, true);
  });

  it('empty page → no contact, empty tasks', () => {
    const page = shapeLivePage(null);
    assert.equal(page.count, 0);
    assert.deepEqual(page.contacts, []);
    assert.deepEqual(page.tasks, { open: [], done: [] });
  });

  it('derives executor ctx ids from the contact', () => {
    const ctx = ctxFromPage({ contact: { customerId: '42', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@x.com', accountId: 'a7' } });
    assert.equal(ctx.contactId, '42');
    assert.equal(ctx.contactName, 'Ada Lovelace');
    assert.equal(ctx.accountId, 'a7');
  });
});
