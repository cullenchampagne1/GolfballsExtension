/** Regression tests for the zero-setup encrypted CRM index worker. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const records = new Map();
const keys = new Map();

function requestResult(value) {
  const request = {};
  queueMicrotask(() => {
    request.result = value;
    request.onsuccess?.();
  });
  return request;
}

function makeStore(name) {
  const values = name === 'keys' ? keys : records;
  const keyField = name === 'keys' ? 'id' : 'storageKey';
  return {
    createIndex() {},
    put(value) { values.set(value[keyField], structuredClone(value)); },
    get(key) { return requestResult(values.has(key) ? structuredClone(values.get(key)) : undefined); },
    getAll() { return requestResult([...values.values()].map((value) => structuredClone(value))); },
    delete(key) { values.delete(key); },
    clear() { values.clear(); },
  };
}

const stores = new Map();

const db = {
  objectStoreNames: { contains: (name) => stores.has(name) },
  createObjectStore(name) {
    const store = makeStore(name);
    stores.set(name, store);
    return store;
  },
  transaction(name) {
    const tx = { objectStore: (storeName) => stores.get(storeName || name), oncomplete: null, onerror: null, error: null };
    setTimeout(() => tx.oncomplete?.(), 0);
    return tx;
  },
};

globalThis.indexedDB = {
  open() {
    const request = {};
    queueMicrotask(() => {
      request.result = db;
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  },
};

globalThis.chrome = {
  runtime: { id: 'annoeoeiijgdgmlpefllibcilcamnjek' },
};

await import(`../lib/crm-index-store.js?test=${Date.now()}`);

const rows = [
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

assert.deepEqual(await globalThis.GBCrmIndex.indexRecords(rows, '123'), { added: 2 });
assert.equal(records.size, 2);
assert.equal(keys.size, 1);
const persistedKeys = keys.get('device-keys-v1');
assert.equal(persistedKeys.encryptionKey.extractable, false);
assert.equal(persistedKeys.lookupKey.extractable, false);
for (const stored of records.values()) {
  assert.equal(stored.schemaVersion, 3);
  assert.equal(stored.keyVersion, 1);
  assert.notEqual(stored.owner, '123');
  assert.equal(typeof stored.owner, 'string');
  assert.equal(typeof stored.ciphertext, 'string');
  assert.equal(typeof stored.iv, 'string');
  const serialized = JSON.stringify(stored);
  assert.equal(serialized.includes('@example.test'), false);
  assert.equal(serialized.includes('555-'), false);
  assert.equal(serialized.includes('yearToDateRevenue_f'), false);
  assert.equal(serialized.includes('contact_42'), false);
}

const ada = await globalThis.GBCrmIndex.search({ query: 'ada love', limit: 8, employeeId: '123' });
assert.equal(ada.total, 2);
assert.equal(ada.matched, 1);
assert.equal(ada.rows.length, 1);
assert.equal(ada.rows[0].emails_tps[0], 'ada@example.test');
assert.equal(ada.rows[0].yearToDateRevenue_f, 1000);

const otherEmployee = await globalThis.GBCrmIndex.search({ query: '', limit: 8, employeeId: '456' });
assert.equal(otherEmployee.total, 0);
assert.deepEqual(otherEmployee.rows, []);

// A service-worker restart must reopen the same non-extractable keys without setup.
await import(`../lib/crm-index-store.js?restart=${Date.now()}`);
const afterRestart = await globalThis.GBCrmIndex.search({ query: 'grace', limit: 8, employeeId: '123' });
assert.equal(afterRestart.rows[0].emails_tps[0], 'grace@example.test');

const firstStorageKey = records.keys().next().value;
await globalThis.GBCrmIndex.deleteRecord('contact_42', '123');
assert.equal(records.has(firstStorageKey), false);

records.set('legacy-record', { storageKey: 'legacy-record', schemaVersion: 2, keyVersion: 1 });
const afterLegacy = await globalThis.GBCrmIndex.search({ query: '', limit: 8, employeeId: '123' });
assert.equal(afterLegacy.cleared, 1);
assert.equal(records.has('legacy-record'), false, 'old schema records must be cleared automatically');

keys.clear();
await import(`../lib/crm-index-store.js?missing-key=${Date.now()}`);
const afterMissingKey = await globalThis.GBCrmIndex.search({ query: '', limit: 8, employeeId: '123' });
assert.deepEqual(afterMissingKey.rows, []);
assert.equal(records.size, 0, 'ciphertext must be cleared when its local key is missing');
assert.equal(keys.size, 1, 'missing keys must be regenerated without setup');

await globalThis.GBCrmIndex.clearIndex();
assert.equal(records.size, 0);
assert.equal(keys.size, 1, 'clearing CRM rows must preserve the device encryption keys');

const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.storage, undefined, 'CRM encryption must not require managed policy setup');

const clientSource = await readFile(new URL('../src/lib/crmIndex.js', import.meta.url), 'utf8');
assert.match(clientSource, /indexedDB\.deleteDatabase\(LEGACY_DB_NAME\)/);
assert.equal(/encryptionKey|lookupKey/.test(clientSource), false, 'content scripts must not request or handle encryption keys');

console.log('encrypted CRM index tests passed');
