import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

let Model;

before(async () => {
  await import(`../../lib/page-engine-index-model.js?test=${Date.now()}`);
  Model = globalThis.GBPageEngineIndexModel;
});

describe('Page Engine index model', () => {
  it('requires a supported schema, stable entity id, and matching owner', () => {
    const contact = {
      schemaId: 'contact',
      data: {
        ids: { contact: '42', account: '900' },
        account: { salesRepId: '77', salesRep: 'Cullen Champagne' },
      },
    };
    assert.deepEqual(Model.snapshotIdentity(contact), {
      schemaId: 'contact',
      entityType: 'contact',
      id: '42',
      accountId: '900',
      contactId: '42',
    });
    assert.equal(Model.normalizeSnapshot(contact, '77').ownerId, '77');
    assert.equal(Model.normalizeSnapshot(contact, 'cullen champagne').ownerId, 'cullen champagne');
    assert.throws(() => Model.normalizeSnapshot(contact, '12'), /owner does not match/i);
    assert.throws(
      () => Model.snapshotIdentity({ schemaId: 'contact', data: { ids: {} } }),
      /stable ID/i,
    );
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
