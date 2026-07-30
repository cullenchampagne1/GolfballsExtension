/**
 * Integration flow — every Page Engine extraction reaches one owner-gated,
 * encrypted worker store, whether the document is already extracted in a tab
 * or parsed/fetched by a background workflow.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  createFetchMock, loadBackground, makeFakeIndexedDb, settle, validInstallation,
} from './helpers/harness.mjs';

const fakeDb = makeFakeIndexedDb();
const stored = {
  gbApiInstallation: validInstallation(),
  devSettings: {
    'pageEngine.indexingEnabled': true,
    'pageEngine.accountId': '77',
  },
};

let background;
let indexClient;
let pageEngine;

before(async () => {
  const { fetchMock } = createFetchMock();
  background = await loadBackground({ stored, fetchImpl: fetchMock, indexedDb: fakeDb.indexedDB });
  background.chrome.runtime.sendMessage = (message, callback) => {
    background.sendMessage(message).then(callback);
  };
  globalThis.chrome = background.chrome;
  indexClient = await import(`../../src/lib/page-engine/index-client.js?test=${Date.now()}`);
  pageEngine = await import(`../../src/lib/page-engine/runner.js?test=${Date.now()}`);
});

function contactSnapshot(overrides = {}) {
  return {
    schemaId: 'contact',
    data: {
      ids: { contact: '42', account: '900' },
      contact: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        companyName: 'Analytical Engines',
        email: 'ada@example.test',
      },
      account: { name: 'Analytical Engines', salesRepId: '77', salesRep: 'Cullen Champagne' },
      stats: { totalRevenue: 1_250 },
      activities: [{ subject: 'Pricing follow up' }],
      orders: [{ number: '100', total: 400 }, { number: '101', total: 825 }],
      ...overrides,
    },
  };
}

describe('Page Engine index roundtrip', () => {
  it('upserts multiple entity types and leaves identifiers and text encrypted at rest', async () => {
    await indexClient.queueEngineSnapshot(contactSnapshot(), {
      sourceUrl: 'https://crm.test/Default.aspx?Page=240&customerID=42',
    });
    await indexClient.queueEngineSnapshot({
      schemaId: 'account',
      data: {
        ids: { account: '900', contact: '42' },
        contact: { firstName: 'Ada', email: 'ada@example.test' },
        account: { name: 'Analytical Engines', salesRepId: '77' },
        stats: { totalRevenue: 4_000 },
      },
    });

    assert.equal(fakeDb.pageEntities.size, 2);
    assert.equal(fakeDb.pageKeys.size, 1, 'one non-extractable key pair protects this index');
    assert.ok(fakeDb.pageFields.size > 10, 'scalar fields are materialized for indexed queries');

    const storedJson = JSON.stringify([
      ...fakeDb.pageEntities.values(),
      ...fakeDb.pageFields.values(),
    ]);
    for (const secret of ['ada@example.test', 'Analytical Engines', 'contact.email', 'customerID=42']) {
      assert.equal(storedJson.includes(secret), false, `${secret} must not rest in plaintext`);
    }
    for (const entity of fakeDb.pageEntities.values()) {
      assert.equal(typeof entity.ciphertext, 'string');
      assert.equal(entity.storageKey.includes('42'), false);
      assert.notEqual(entity.owner, '77');
    }
  });

  it('answers exact, contains, prefix, numeric, array, and ordered queries', async () => {
    const exact = await indexClient.queryEngineIndex({
      where: [{ path: 'contact.email', op: 'eq', value: 'ADA@example.test' }],
    });
    assert.equal(exact.matched, 2);

    const advanced = await indexClient.queryEngineIndex({
      where: [
        { path: 'contact.companyName', op: 'startsWith', value: 'Analytical En' },
        { path: 'activities[].subject', op: 'contains', value: 'follow up' },
        { path: 'orders[].total', op: 'gte', value: 800 },
      ],
    });
    assert.equal(advanced.matched, 1);
    assert.equal(advanced.rows[0].id, '42');

    const shortContains = await indexClient.queryEngineIndex({
      where: [{ path: 'activities[].subject', op: 'contains', value: 'up' }],
    });
    assert.equal(shortContains.matched, 1, 'one/two-character contains scans the opaque path index');

    const ordered = await indexClient.queryEngineIndex({
      where: [{ path: 'stats.totalRevenue', op: 'gte', value: 1_000 }],
      orderBy: { path: 'stats.totalRevenue', direction: 'desc' },
    });
    assert.deepEqual(ordered.rows.map((row) => row.data.stats.totalRevenue), [4_000, 1_250]);
  });

  it('rejects mismatched owners and upserts newer data under the same entity id', async () => {
    await assert.rejects(
      indexClient.queueEngineSnapshot(contactSnapshot({
        ids: { contact: '99', account: '901' },
        account: { name: 'Other Account', salesRepId: '12' },
      })),
      /owner does not match/i,
    );
    assert.equal(fakeDb.pageEntities.size, 2);

    await indexClient.queueEngineSnapshot(contactSnapshot({
      contact: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        companyName: 'Analytical Engines',
        email: 'ada.new@example.test',
      },
    }));
    assert.equal(fakeDb.pageEntities.size, 2, 'the stable contact id is an upsert, not an append');
    assert.equal((await indexClient.queryEngineIndex({
      where: [{ path: 'contact.email', op: 'eq', value: 'ada@example.test' }],
    })).matched, 1);
    assert.equal((await indexClient.queryEngineIndex({
      where: [{ path: 'contact.email', op: 'eq', value: 'ada.new@example.test' }],
    })).matched, 1);
  });

  it('automatically submits a supported live document through runEngine', async () => {
    const doc = new JSDOM(`
      <!doctype html>
      <span id="lblContactFirstName">Grace</span>
      <span id="lblContactLastName">Hopper</span>
      <span id="lblContactEmail">grace@example.test</span>
      <input id="tbContactId" value="88">
      <input id="AccountID" value="902">
      <select id="ddlSalesRepId"><option value="77" selected>Cullen Champagne</option></select>
    `, { url: 'https://crm.test/Default.aspx?Page=240&customerID=88' }).window.document;

    const result = pageEngine.runEngine(doc);
    assert.equal(result.schemaId, 'contact');
    assert.equal(result.data.account.salesRepId, '77');
    await settle();

    const live = await indexClient.queryEngineIndex({
      where: [{ path: '__index.recordId', op: 'eq', value: '88' }],
    });
    assert.equal(live.matched, 1);
    assert.equal(live.rows[0].data.contact.firstName, 'Grace');
  });

  it('honors the disabled default for writes while retaining explicit cache maintenance', async () => {
    const oldValue = stored.devSettings;
    stored.devSettings = {
      ...stored.devSettings,
      'pageEngine.indexingEnabled': false,
    };
    for (const listener of background.listeners.storageChanged) {
      listener({ devSettings: { oldValue, newValue: stored.devSettings } }, 'local');
    }
    const before = fakeDb.pageEntities.size;
    assert.deepEqual(
      await indexClient.queueEngineSnapshot(contactSnapshot({
        ids: { contact: '111', account: '911' },
      })),
      { indexed: false, reason: 'disabled' },
    );
    assert.equal(fakeDb.pageEntities.size, before);

    const stats = await indexClient.getEngineIndexStats();
    assert.deepEqual(stats.byType, { contact: 2, account: 1 });
    const cleared = await indexClient.clearEngineIndex();
    assert.equal(cleared.cleared, 3);
    assert.equal(fakeDb.pageEntities.size, 0);
    assert.equal(fakeDb.pageFields.size, 0);
    assert.equal(fakeDb.pageKeys.size, 1, 'cache clearing keeps the device key pair');
  });
});
