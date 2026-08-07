/**
 * Integration flow — Account/Contact Page Engine extractions reach one
 * territory-gated encrypted worker store, whether the document is already
 * extracted in a tab or parsed/fetched by a background workflow.
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
    'pageEngine.territory': '15',
  },
};

let background;
let indexClient;
let pageEngine;
let cacheActions;

async function seedRetiredOwnerIndex() {
  await new Promise((resolve, reject) => {
    const request = fakeDb.indexedDB.open('gb-page-engine-index-secure', 1);
    request.onupgradeneeded = () => {
      const records = request.result.createObjectStore('entities', { keyPath: 'storageKey' });
      records.createIndex('owner', 'owner', { unique: false });
      records.createIndex('updatedAt', 'updatedAt', { unique: false });
      records.createIndex('entityType', 'entityType', { unique: false });
      const fields = request.result.createObjectStore('fields', { keyPath: 'fieldKey' });
      fields.createIndex('recordKey', 'recordKey', { unique: false });
      fields.createIndex('pathToken', 'pathToken', { unique: false });
      fields.createIndex('exactToken', 'exactToken', { unique: false });
      fields.createIndex('termTokens', 'termTokens', { unique: false, multiEntry: true });
      request.result.createObjectStore('keys', { keyPath: 'id' });
    };
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error || new Error('Unable to seed retired index'));
  });
  const [encryptionKey, lookupKey] = await Promise.all([
    crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']),
  ]);
  fakeDb.pageKeys.set('page-engine-device-keys-v1', {
    id: 'page-engine-device-keys-v1',
    keyVersion: 1,
    encryptionKey,
    lookupKey,
  });
  fakeDb.pageEntities.set('legacy-order', {
    storageKey: 'legacy-order',
    owner: 'legacy-owner-partition',
    entityType: 'order',
    updatedAt: 1,
  });
  fakeDb.pageFields.set('legacy-order-field', {
    fieldKey: 'legacy-order-field',
    recordKey: 'legacy-order',
  });
}

before(async () => {
  await seedRetiredOwnerIndex();
  const { fetchMock } = createFetchMock();
  background = await loadBackground({ stored, fetchImpl: fetchMock, indexedDb: fakeDb.indexedDB });
  background.chrome.runtime.sendMessage = (message, callback) => {
    background.sendMessage(message).then(callback);
  };
  globalThis.chrome = background.chrome;
  indexClient = await import(`../../src/lib/page-engine/index-client.js?test=${Date.now()}`);
  pageEngine = await import(`../../src/lib/page-engine/runner.js?test=${Date.now()}`);
  cacheActions = await import(`../../src/lib/page-engine/cache-actions.js?test=${Date.now()}`);
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
      account: {
        name: 'Analytical Engines',
        territoryId: '15',
        territoryName: 'P5 / BDR (Cullen)',
      },
      stats: { totalRevenue: 1_250 },
      activities: [{ subject: 'Pricing follow up' }],
      orders: [{ number: '100', total: 400 }, { number: '101', total: 825 }],
      ...overrides,
    },
  };
}

describe('Page Engine index roundtrip', () => {
  it('clears the retired owner-partitioned cache before Territory indexing begins', async () => {
    assert.equal(fakeDb.pageEntities.size, 1);
    assert.equal(fakeDb.pageFields.size, 1);
    assert.deepEqual(await indexClient.getEngineIndexStats(), {
      ok: true,
      total: 0,
      byType: {},
      lastIndexedAt: null,
    });
    assert.equal(fakeDb.pageEntities.size, 0);
    assert.equal(fakeDb.pageFields.size, 0);
    assert.equal(fakeDb.pageKeys.size, 1, 'the non-extractable device key pair remains reusable');
  });

  it('upserts multiple entity types and leaves identifiers and text encrypted at rest', async () => {
    await indexClient.queueEngineSnapshot(contactSnapshot(), {
      sourceUrl: 'https://crm.test/Default.aspx?Page=240&customerID=42',
    });
    await indexClient.queueEngineSnapshot({
      schemaId: 'account',
      data: {
        ids: { account: '900', contact: '42' },
        contact: { firstName: 'Ada', email: 'ada@example.test' },
        account: {
          name: 'Analytical Engines',
          territoryId: '15',
          territoryName: 'P5 / BDR (Cullen)',
        },
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
      assert.notEqual(entity.owner, '15');
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

  it('rejects mismatched territories and upserts newer data under the same entity id', async () => {
    await assert.rejects(
      indexClient.queueEngineSnapshot(contactSnapshot({
        ids: { contact: '99', account: '901' },
        account: {
          name: 'Other Account',
          territoryId: '12',
          territoryName: 'P4 / BDR (Joshua)',
        },
      })),
      /territory does not match/i,
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
      <select id="TerritoryID"><option value="15" selected>P5 / BDR (Cullen)</option></select>
    `, { url: 'https://crm.test/Default.aspx?Page=240&customerID=88' }).window.document;

    const result = pageEngine.runEngine(doc);
    assert.equal(result.schemaId, 'contact');
    assert.equal(result.data.account.territoryId, '15');
    await settle();

    const live = await indexClient.queryEngineIndex({
      where: [{ path: '__index.recordId', op: 'eq', value: '88' }],
    });
    assert.equal(live.matched, 1);
    assert.equal(live.rows[0].data.contact.firstName, 'Grace');
  });

  it('hydrates a mixed CRM Search audience from exact encrypted-index snapshots', async () => {
    const audience = [
      { contactId: 'contact_42', pageEngineIdentity: { schemaId: 'contact', id: '42' } },
      { contactId: 'account_900', pageEngineIdentity: { schemaId: 'account', id: '900' } },
      { contactId: 'contact_missing', pageEngineIdentity: { schemaId: 'contact', id: '404' } },
    ];

    const hydrated = await cacheActions.attachCachedPageEngineSnapshots(audience);

    assert.equal(hydrated.available, 2);
    assert.equal(hydrated.requested, 3);
    assert.equal(hydrated.contacts[0].pageEngineSnapshot.data.contact.email, 'ada.new@example.test');
    assert.equal(hydrated.contacts[1].pageEngineSnapshot.data.account.name, 'Analytical Engines');
    assert.equal('pageEngineSnapshot' in hydrated.contacts[2], false, 'missing rows retain live-fetch fallback');
  });

  it('routes the developer territory inspection to the page that opened the manager', async () => {
    stored.orderTabId = 37;
    background.chrome.tabs.get = (tabId, callback) => callback({
      id: tabId,
      url: 'https://api.golfballs.com/Golfballs/AdminNew/Default.aspx?Page=240&customerID=88',
      active: true,
      lastAccessed: 100,
    });
    background.chrome.tabs.sendMessage = (tabId, message, callback) => {
      assert.equal(tabId, 37);
      assert.equal(message.action, 'pageEngineTerritoryInfo');
      callback({
        ok: true,
        schemaId: 'contact',
        recordId: '88',
        accountId: '902',
        territoryId: '15',
        territoryName: 'P5 / BDR (Cullen)',
      });
    };

    const inspected = await background.sendMessage({ action: 'pageEngineInspectTerritory' });
    assert.equal(inspected.ok, true, inspected.error);
    assert.equal(inspected.tabId, 37);
    assert.equal(inspected.territoryId, '15');
    assert.equal(inspected.territoryName, 'P5 / BDR (Cullen)');
  });

  it('never stores standalone Order or Opportunity page snapshots', async () => {
    const before = fakeDb.pageEntities.size;
    assert.deepEqual(
      await indexClient.queueEngineSnapshot({
        schemaId: 'order',
        data: {
          ids: { order: '5001', account: '900' },
          account: { territoryId: '15', territoryName: 'P5 / BDR (Cullen)' },
        },
      }),
      { indexed: false, reason: 'unsupported-schema' },
    );
    assert.deepEqual(
      await indexClient.queueEngineSnapshot({
        schemaId: 'opportunity',
        data: {
          ids: { opportunity: '28042', account: '900' },
          account: { territoryId: '15', territoryName: 'P5 / BDR (Cullen)' },
        },
      }),
      { indexed: false, reason: 'unsupported-schema' },
    );
    assert.equal(fakeDb.pageEntities.size, before);
  });

  it('pages an unfiltered walk by offset without overlap, for the cache export', async () => {
    // The export reads the whole cache in MAX_QUERY_LIMIT steps. What it needs
    // from the store: a stable `matched` to walk toward, windows that never
    // overlap, and a union that is the entire cache — here, all three records,
    // one per page.
    const seen = [];
    let matched = null;
    for (let offset = 0; ; offset += 1) {
      const page = await indexClient.queryEngineIndex({ limit: 1, offset, scanAll: true });
      if (matched == null) matched = page.matched;
      assert.equal(page.matched, matched, 'matched holds still while the walk advances');
      if (!page.rows.length) break;
      assert.equal(page.rows.length, 1);
      seen.push(`${page.rows[0].schemaId}:${page.rows[0].id}`);
      if (seen.length > matched) assert.fail('walked past matched — offset is not windowing');
    }
    assert.equal(matched, 3);
    assert.equal(new Set(seen).size, 3, 'every record exactly once across the pages');
    // A filtered query slices the same way, after matching: offset 1 hands
    // back the match the first window skipped, never a repeat of it.
    const where = [{ path: 'ids.contact', op: 'exists' }];
    const full = await indexClient.queryEngineIndex({ where, limit: 10 });
    assert.ok(full.matched >= 2, 'needs at least two matches to window over');
    const windowed = await indexClient.queryEngineIndex({ where, limit: 1, offset: 1 });
    assert.equal(windowed.matched, full.matched, 'offset never changes what matches');
    assert.equal(windowed.rows.length, 1);
    assert.equal(
      `${windowed.rows[0].schemaId}:${windowed.rows[0].id}`,
      `${full.rows[1].schemaId}:${full.rows[1].id}`,
      'offset 1 is the second match of the same ordered walk',
    );
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
