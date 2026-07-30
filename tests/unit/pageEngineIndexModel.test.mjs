import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

let Model;

before(async () => {
  await import(`../../lib/page-engine-index-model.js?test=${Date.now()}`);
  Model = globalThis.GBPageEngineIndexModel;
});

describe('Page Engine index model', () => {
  it('requires an Account/Contact schema, stable entity id, and matching territory', () => {
    const contact = {
      schemaId: 'contact',
      data: {
        ids: { contact: '42', account: '900' },
        account: { territoryId: '15', territoryName: 'P5 / BDR (Cullen)' },
      },
    };
    assert.deepEqual(Model.snapshotIdentity(contact), {
      schemaId: 'contact',
      entityType: 'contact',
      id: '42',
      accountId: '900',
      contactId: '42',
    });
    assert.equal(Model.normalizeSnapshot(contact, '15').territory, '15');
    assert.equal(
      Model.normalizeSnapshot(contact, 'p5 / bdr (cullen)').territory,
      'p5 / bdr (cullen)',
    );
    assert.throws(() => Model.normalizeSnapshot(contact, '12'), /territory does not match/i);
    assert.throws(
      () => Model.snapshotIdentity({ schemaId: 'contact', data: { ids: {} } }),
      /stable ID/i,
    );
    assert.throws(
      () => Model.snapshotIdentity({ schemaId: 'order', data: { ids: { order: '5001' } } }),
      /not indexable/i,
    );
    assert.throws(
      () => Model.snapshotIdentity({ schemaId: 'opportunity', data: { ids: { opportunity: '28042' } } }),
      /not indexable/i,
    );
  });

  it('does not admit the unassigned Territory option', () => {
    const unassigned = {
      schemaId: 'account',
      data: {
        ids: { account: '900' },
        account: { territoryId: '0', territoryName: 'Not Set' },
      },
    };
    assert.deepEqual(Model.territoryCandidates(unassigned.data), []);
    assert.throws(() => Model.normalizeSnapshot(unassigned, '0'), /territory does not match/i);
  });

  it('flattens arrays to reusable relational paths without array positions', () => {
    const rows = Model.flattenData({
      orders: [
        { number: '100', total: 400 },
        { number: '101', total: 825 },
      ],
    });
    assert.deepEqual(
      rows.filter((row) => row.path === 'orders[].total').map((row) => row.numberValue),
      [400, 825],
    );
    assert.deepEqual(
      rows.filter((row) => row.path === 'orders[].number').map((row) => row.ordinal),
      [0, 1],
    );
  });

  it('matches exact, text, range, existence, and array predicates as AND conditions', () => {
    const data = {
      contact: { companyName: 'Analytical Engines', email: 'ada@example.test' },
      stats: { totalRevenue: 1_250 },
      activities: [{ subject: 'Pricing follow up' }, { subject: 'Sample request' }],
    };
    assert.equal(Model.matchesWhere(data, [
      { path: 'contact.companyName', op: 'startsWith', value: 'analytical en' },
      { path: 'activities[].subject', op: 'contains', value: 'follow up' },
      { path: 'stats.totalRevenue', op: 'gte', value: 1_000 },
      { path: 'contact.email', op: 'exists' },
    ]), true);
    assert.equal(Model.matchesCondition(
      data,
      { path: 'contact.email', op: 'in', value: ['grace@example.test', 'ADA@EXAMPLE.TEST'] },
    ), true);
    assert.equal(Model.matchesCondition(
      data,
      { path: 'stats.totalRevenue', op: 'lt', value: 500 },
    ), false);
  });

  it('emits full-value prefixes and trigrams for fast text candidate lookup', () => {
    const pieces = Model.termPieces('Analytical Engines');
    assert.equal(pieces.includes('p:analytical en'), true);
    assert.equal(pieces.includes('g:eng'), true);
    assert.deepEqual(Model.queryTermPieces('analytical en', 'startsWith'), ['p:analytical en']);
  });
});
