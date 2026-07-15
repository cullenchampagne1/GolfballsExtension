/**
 * Integration flow — encrypted CRM index roundtrip.
 *
 * The REAL content-script facade (src/lib/crmIndex.js → backgroundMessage.js)
 * sends chrome.runtime messages that are routed into the REAL background.js
 * onMessage handler, which drives the REAL crm-index-store.js (WebCrypto,
 * AES-GCM + HMAC lookup keys) over a fake in-memory IndexedDB. Records must
 * be ciphertext at rest, decrypt only for the owning employee, feed the
 * in-memory searchIndexed ranker, and fail closed on tampering.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFetchMock, loadBackground, makeFakeIndexedDb, validInstallation,
} from './helpers/harness.mjs';

const fakeDb = makeFakeIndexedDb();
const stored = { gbApiInstallation: validInstallation(), gbEmployeeId: '123' };

let crmIndex;

before(async () => {
  const { fetchMock } = createFetchMock();
  const background = await loadBackground({ stored, fetchImpl: fetchMock, indexedDb: fakeDb.indexedDB });

  // Content-script side of the boundary: chrome.runtime.sendMessage routes
  // into the background's real onMessage listener; a stub deleteDatabase
  // satisfies the legacy page-index cleanup.
  background.chrome.runtime.sendMessage = (msg, callback) => {
    background.sendMessage(msg).then(callback);
  };
  globalThis.chrome = background.chrome;
  globalThis.indexedDB = {
    deleteDatabase() {
      const request = {};
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
  crmIndex = await import('../../src/lib/crmIndex.js');
});

const ROWS = [
  {
    id: 'contact_42', recordType_s: 'Contact', contactName_t: 'Ada Lovelace',
    accountName_t: 'Analytical Engines', emails_tps: ['ada@example.test'],
    phones_ss: ['555-0100'], yearToDateRevenue_f: 1000,
  },
  {
    id: 'contact_99', recordType_s: 'Contact', contactName_t: 'Grace Hopper',
    accountName_t: 'Compilers Inc', emails_tps: ['grace@example.test'],
    phones_ss: ['555-0199'], yearToDateRevenue_f: 2000,
  },
];

describe('CRM index roundtrip', () => {
  it('indexes records through the message boundary and stores only ciphertext', async () => {
    const result = await crmIndex.indexRecords(ROWS);
    assert.deepEqual(result, { added: 2 });
    assert.equal(fakeDb.records.size, 2);
    assert.equal(fakeDb.keys.size, 1, 'one non-extractable device key record');

    for (const record of fakeDb.records.values()) {
      assert.equal(typeof record.ciphertext, 'string');
      assert.equal(typeof record.iv, 'string');
      assert.notEqual(record.owner, '123', 'the employee id is HMAC-blinded, never stored raw');
      const serialized = JSON.stringify(record);
      assert.equal(serialized.includes('@example.test'), false, 'emails never rest in plaintext');
      assert.equal(serialized.includes('555-'), false, 'phones never rest in plaintext');
      assert.equal(serialized.includes('contact_42'), false, 'record ids are HMAC storage keys');
    }
  });

  it('reads back and ranks: queryIndexed decrypts matches, searchIndexed refines them', async () => {
    const ada = await crmIndex.queryIndexed('ada love', { limit: 8 });
    assert.equal(ada.total, 2);
    assert.equal(ada.matched, 1);
    assert.equal(ada.rows[0].emails_tps[0], 'ada@example.test');
    assert.equal(ada.rows[0].yearToDateRevenue_f, 1000, 'full plaintext row is restored');

    // Chain the decrypted batch into the pure in-memory ranker.
    const everyone = await crmIndex.getAllIndexed();
    assert.equal(everyone.length, 2);
    const grace = crmIndex.searchIndexed(everyone, 'grace');
    assert.equal(grace.length, 1);
    assert.equal(grace[0].contactName_t, 'Grace Hopper');
    const byPhone = crmIndex.searchIndexed(everyone, '555-0100');
    assert.equal(byPhone[0].contactName_t, 'Ada Lovelace');
  });

  it('fails closed for a different employee: their derived key sees no records', async () => {
    stored.gbEmployeeId = '456';
    const other = await crmIndex.queryIndexed('', { limit: 8 });
    assert.equal(other.total, 0);
    assert.deepEqual(other.rows, []);
    stored.gbEmployeeId = '123';
  });

  it('purges tampered ciphertext instead of returning corrupted plaintext', async () => {
    const [storageKey, record] = [...fakeDb.records.entries()][0];
    fakeDb.records.set(storageKey, { ...record, ciphertext: `AAAAAAAA${record.ciphertext.slice(8)}` });

    const result = await crmIndex.queryIndexed('', { limit: 8 });
    assert.equal(result.cleared, 1, 'the tampered record is counted as cleared');
    assert.equal(result.rows.length, 1, 'only the intact record decrypts');
    assert.equal(fakeDb.records.has(storageKey), false, 'tampered ciphertext is deleted');
  });

  it('deletes by id and clears the index while preserving the device keys', async () => {
    await crmIndex.indexRecords([ROWS[0]]); // restore Ada next to Grace
    assert.equal(fakeDb.records.size, 2);

    await crmIndex.deleteIndexed('contact_42');
    assert.equal(fakeDb.records.size, 1);

    await crmIndex.clearIndex();
    assert.equal(fakeDb.records.size, 0);
    assert.equal(fakeDb.keys.size, 1, 'clearing rows must not destroy the encryption keys');
  });
});
