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
import { samplePageFor } from '../../src/lib/codeEngine/samplePages.js';
import { shapeLivePage, ctxFromPage } from '../../src/lib/codeEngine/liveActionRun.js';

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
    assert.ok(a.id.startsWith('ca_'));
  });

  it('custom page type defaults to any-page scope', () => {
    assert.deepEqual(defaultPagesFor('custom'), ['*']);
    assert.deepEqual(defaultPagesFor('order'), ['order']);
    assert.deepEqual(normalizeCustomAction({ pageType: 'custom' }).pages, ['*']);
  });

  it('preserves a saved page scope + surface flags', () => {
    const a = normalizeCustomAction({ pageType: 'order', pages: ['order', 'account'], showInPopup: true, enabled: false });
    assert.deepEqual(a.pages, ['order', 'account']);
    assert.equal(a.showInPopup, true);
    assert.equal(a.enabled, false);
  });

  it('seeds a blank action with a starter script for its type', () => {
    const b = blankCustomAction('order');
    assert.equal(b.pageType, 'order');
    assert.match(b.source, /actions\.createTask/);
    assert.match(starterSource('custom'), /Custom action/);
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
