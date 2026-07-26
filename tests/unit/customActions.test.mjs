/**
 * Custom actions — the data layer for user-authored shelf actions.
 * Pins normalization/defaults, page-scope toggling (shared with featureConfig),
 * upsert/remove purity, and the authoring sample fixtures.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCustomAction, defaultPagesFor, toggleActionPage, upsertCustomAction,
  removeCustomActionFrom, blankCustomAction, editorTypeIdFor, starterSource,
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

  it('maps page type to the editor ctx typeId', () => {
    assert.equal(editorTypeIdFor('order'), 'order');
    assert.equal(editorTypeIdFor('contact'), 'account');
    assert.equal(editorTypeIdFor('account'), 'account');
    assert.equal(editorTypeIdFor('custom'), 'order');
  });

  it('seeds a blank action with a starter script for its type', () => {
    const b = blankCustomAction('order');
    assert.equal(b.pageType, 'order');
    assert.match(b.source, /actions\.createTask/);
    assert.match(starterSource('custom'), /page\.dom/);
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
    assert.equal(p.count, 1);
  });

  it('gives an order page order data + no contact tasks', () => {
    const p = samplePageFor('order');
    assert.equal(p.order.id, '100245');
    assert.deepEqual(p.tasks.open, []);
  });
});

describe('customActions · live run shaping', () => {
  it('shapes runEngine output (data wrapper) into the page model', () => {
    const page = shapeLivePage({ data: { contact: { id: '99', firstName: 'Ada', email: 'ada@x.com' }, tasks: { open: [{ id: 't1' }], done: [] } } });
    assert.equal(page.count, 1);
    assert.equal(page.contacts.length, 1);
    assert.equal(page.contact.email, 'ada@x.com');
    assert.equal(page.tasks.open.length, 1);
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
