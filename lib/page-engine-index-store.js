/**
 * Encrypted, relational-style Page Engine index owned by the service worker.
 *
 * Full snapshots are AES-GCM encrypted. Field paths, exact values, and text
 * search pieces are HMAC-blinded before IndexedDB sees them. Numeric/date
 * values remain sortable beside an opaque path token; without the local
 * non-extractable key they have no field name, record id, or territory.
 */
(function installPageEngineIndexStore(root) {
  'use strict';

  const Model = root.GBPageEngineIndexModel;
  if (!Model) throw new Error('Page Engine index model failed to initialize');

  const DB_NAME = 'gb-page-engine-index-secure';
  const DB_VERSION = 2;
  const RECORD_SCHEMA_VERSION = 1;
  const KEY_VERSION = 1;
  const RECORD_STORE = 'entities';
  const FIELD_STORE = 'fields';
  const KEY_STORE = 'keys';
  const DEVICE_KEY_ID = 'page-engine-device-keys-v1';
  const MAX_RECORD_CHARS = 2_000_000;
  const MAX_FIELD_ROWS = 20_000;
  const MAX_TERMS_PER_FIELD = 512;
  const MAX_QUERY_LIMIT = 500;
  const MAX_QUERY_SCAN = 2_000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let dbPromise = null;
  let deviceKeysPromise = null;
  let writeTail = Promise.resolve();

  function bytesToBase64(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const normalized = String(value || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
    return out;
  }

  function requestValue(request, fallback) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result ?? fallback);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RECORD_STORE)) {
          const records = db.createObjectStore(RECORD_STORE, { keyPath: 'storageKey' });
          records.createIndex('owner', 'owner', { unique: false });
          records.createIndex('updatedAt', 'updatedAt', { unique: false });
          records.createIndex('entityType', 'entityType', { unique: false });
        }
        if (!db.objectStoreNames.contains(FIELD_STORE)) {
          const fields = db.createObjectStore(FIELD_STORE, { keyPath: 'fieldKey' });
          fields.createIndex('recordKey', 'recordKey', { unique: false });
          fields.createIndex('pathToken', 'pathToken', { unique: false });
          fields.createIndex('exactToken', 'exactToken', { unique: false });
          fields.createIndex('termTokens', 'termTokens', { unique: false, multiEntry: true });
        }
        if (!db.objectStoreNames.contains(KEY_STORE)) {
          db.createObjectStore(KEY_STORE, { keyPath: 'id' });
        }
        /* Version 1 was partitioned by sales-rep/owner and admitted standalone
           Opportunity/Order snapshots. Territory is not a compatible
           partition, so discard those cache rows once instead of exposing
           stale data under the new policy. Device keys remain local/reusable. */
        if (event.oldVersion > 0 && event.oldVersion < 2 && request.transaction) {
          request.transaction.objectStore(RECORD_STORE).clear();
          request.transaction.objectStore(FIELD_STORE).clear();
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open Page Engine index'));
    });
    return dbPromise;
  }

  async function readStoredDeviceKeys() {
    const db = await openDb();
    const tx = db.transaction(KEY_STORE, 'readonly');
    return requestValue(tx.objectStore(KEY_STORE).get(DEVICE_KEY_ID), null);
  }

  async function createAndStoreDeviceKeys() {
    const [encryptionKey, lookupKey] = await Promise.all([
      crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
      crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']),
    ]);
    const stored = { id: DEVICE_KEY_ID, keyVersion: KEY_VERSION, encryptionKey, lookupKey };
    const db = await openDb();
    const tx = db.transaction([KEY_STORE, RECORD_STORE, FIELD_STORE], 'readwrite');
    tx.objectStore(RECORD_STORE).clear();
    tx.objectStore(FIELD_STORE).clear();
    tx.objectStore(KEY_STORE).put(stored);
    await transactionDone(tx);
    return stored;
  }

  async function deviceKeys() {
    if (!deviceKeysPromise) {
      deviceKeysPromise = (async () => {
        const stored = await readStoredDeviceKeys();
        if (stored && stored.keyVersion === KEY_VERSION
            && stored.encryptionKey instanceof CryptoKey && stored.encryptionKey.extractable === false
            && stored.lookupKey instanceof CryptoKey && stored.lookupKey.extractable === false) {
          return stored;
        }
        return createAndStoreDeviceKeys();
      })().catch((error) => {
        deviceKeysPromise = null;
        throw error;
      });
    }
    return deviceKeysPromise;
  }

  async function hmac(lookupKey, material) {
    const signature = await crypto.subtle.sign('HMAC', lookupKey, enc.encode(material));
    return bytesToBase64(new Uint8Array(signature));
  }

  async function deriveKeys(territory) {
    const territoryPartition = Model.normalizeTerritory(territory);
    const stored = await deviceKeys();
    return {
      encryptionKey: stored.encryptionKey,
      lookupKey: stored.lookupKey,
      keyVersion: stored.keyVersion,
      owner: await hmac(stored.lookupKey, `engine-territory|${territoryPartition}`),
    };
  }

  async function currentConfig() {
    const result = await new Promise((resolve) => {
      try { chrome.storage.local.get('devSettings', (value) => resolve(value || {})); }
      catch { resolve({}); }
    });
    const settings = result.devSettings && typeof result.devSettings === 'object'
      ? result.devSettings
      : {};
    return {
      enabled: settings['pageEngine.indexingEnabled'] === true,
      territory: Model.normalizeText(settings['pageEngine.territory'], 200),
    };
  }

  async function storageKeyFor(snapshot, keys) {
    return hmac(
      keys.lookupKey,
      `engine-record|${keys.owner}|${snapshot.entityType}|${snapshot.id}`,
    );
  }

  function associatedData(meta) {
    return enc.encode([
      `schema:${RECORD_SCHEMA_VERSION}`,
      `key:${meta.keyVersion}`,
      `owner:${meta.owner}`,
      `record:${meta.storageKey}`,
      `entity:${meta.entityType}`,
    ].join('|'));
  }

  async function encryptSnapshot(snapshot, keys, storageKey) {
    let plaintext;
    try { plaintext = JSON.stringify(snapshot); }
    catch { throw new Error('Page Engine snapshot is not serializable'); }
    if (plaintext.length > MAX_RECORD_CHARS) throw new Error('Page Engine snapshot exceeds size limit');
    const meta = {
      storageKey,
      owner: keys.owner,
      keyVersion: keys.keyVersion,
      schemaVersion: RECORD_SCHEMA_VERSION,
      schemaId: snapshot.schemaId,
      entityType: snapshot.entityType,
      updatedAt: Date.now(),
    };
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({
      name: 'AES-GCM',
      iv,
      additionalData: associatedData(meta),
      tagLength: 128,
    }, keys.encryptionKey, enc.encode(plaintext));
    return {
      ...meta,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    };
  }

  async function decryptSnapshot(stored, keys) {
    if (!stored || stored.schemaVersion !== RECORD_SCHEMA_VERSION
        || stored.keyVersion !== keys.keyVersion || stored.owner !== keys.owner
        || typeof stored.iv !== 'string' || typeof stored.ciphertext !== 'string') {
      throw new Error('Stale Page Engine index record');
    }
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: base64ToBytes(stored.iv),
      additionalData: associatedData(stored),
      tagLength: 128,
    }, keys.encryptionKey, base64ToBytes(stored.ciphertext));
    return JSON.parse(dec.decode(plaintext));
  }

  function exactMaterial(row) {
    if (row.type === 'number') return `number:${row.numberValue}`;
    if (row.type === 'bool') return `bool:${row.boolValue ? '1' : '0'}`;
    if (row.type === 'date') return `date:${row.dateValue}`;
    return `string:${row.normalizedString}`;
  }

  function queryExactMaterial(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return `number:${value}`;
    if (typeof value === 'boolean') return `bool:${value ? '1' : '0'}`;
    const text = Model.normalizeText(value);
    const dateValue = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text) ? Date.parse(text) : NaN;
    if (Number.isFinite(dateValue)) return `date:${dateValue}`;
    return `string:${Model.normalizeSearchText(text)}`;
  }

  async function buildFieldRows(snapshot, keys, storageKey) {
    const synthetic = {
      ...snapshot.data,
      __index: {
        schemaId: snapshot.schemaId,
        entityType: snapshot.entityType,
        recordId: snapshot.id,
        accountId: snapshot.accountId,
        contactId: snapshot.contactId,
      },
    };
    const flat = Model.flattenData(synthetic, MAX_FIELD_ROWS + 1);
    if (flat.length > MAX_FIELD_ROWS) throw new Error('Page Engine snapshot has too many indexable fields');
    return Promise.all(flat.map(async (row) => {
      const pathToken = await hmac(keys.lookupKey, `engine-path|${keys.owner}|${row.path}`);
      const exactToken = await hmac(
        keys.lookupKey,
        `engine-exact|${keys.owner}|${row.path}|${exactMaterial(row)}`,
      );
      const termTokens = row.normalizedString
        ? await Promise.all(Model.termPieces(row.normalizedString).slice(0, MAX_TERMS_PER_FIELD).map(
          (piece) => hmac(keys.lookupKey, `engine-term|${keys.owner}|${row.path}|${piece}`),
        ))
        : [];
      const fieldKey = await hmac(
        keys.lookupKey,
        `engine-field|${storageKey}|${row.path}|${row.ordinal}`,
      );
      return {
        fieldKey,
        recordKey: storageKey,
        owner: keys.owner,
        pathToken,
        exactToken,
        termTokens,
        ...(row.type === 'number' ? { numberValue: row.numberValue } : {}),
        ...(row.type === 'date' ? { dateValue: row.dateValue } : {}),
      };
    }));
  }

  async function indexSnapshotInternal(input) {
    const config = await currentConfig();
    if (!config.enabled) return { indexed: false, reason: 'disabled' };
    if (!config.territory) return { indexed: false, reason: 'missing-territory' };
    const snapshot = Model.normalizeSnapshot(input, config.territory);
    const keys = await deriveKeys(config.territory);
    const storageKey = await storageKeyFor(snapshot, keys);
    const [record, fields] = await Promise.all([
      encryptSnapshot(snapshot, keys, storageKey),
      buildFieldRows(snapshot, keys, storageKey),
    ]);
    const db = await openDb();
    const readTx = db.transaction(FIELD_STORE, 'readonly');
    const oldFields = await requestValue(
      readTx.objectStore(FIELD_STORE).index('recordKey').getAll(storageKey),
      [],
    );
    const tx = db.transaction([RECORD_STORE, FIELD_STORE], 'readwrite');
    const entityStore = tx.objectStore(RECORD_STORE);
    const fieldStore = tx.objectStore(FIELD_STORE);
    entityStore.put(record);
    for (const old of oldFields) fieldStore.delete(old.fieldKey);
    for (const field of fields) fieldStore.put(field);
    await transactionDone(tx);
    return {
      indexed: true,
      entityType: snapshot.entityType,
      id: snapshot.id,
      fields: fields.length,
    };
  }

  function indexSnapshot(input) {
    const run = writeTail.then(() => indexSnapshotInternal(input));
    writeTail = run.catch(() => {});
    return run;
  }

  async function allByIndex(storeName, indexName, key) {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readonly');
    return requestValue(tx.objectStore(storeName).index(indexName).getAll(key), []);
  }

  async function allOwnerRecords(keys) {
    return allByIndex(RECORD_STORE, 'owner', keys.owner);
  }

  function setOf(rows) {
    return new Set((rows || []).map((row) => row.recordKey || row.storageKey).filter(Boolean));
  }

  function intersect(left, right) {
    if (!left) return new Set(right);
    return new Set([...left].filter((key) => right.has(key)));
  }

  function subtract(left, right) {
    return new Set([...left].filter((key) => !right.has(key)));
  }

  async function pathToken(keys, path) {
    return hmac(keys.lookupKey, `engine-path|${keys.owner}|${Model.normalizeText(path, 500)}`);
  }

  async function exactToken(keys, path, value) {
    return hmac(
      keys.lookupKey,
      `engine-exact|${keys.owner}|${Model.normalizeText(path, 500)}|${queryExactMaterial(value)}`,
    );
  }

  async function termToken(keys, path, piece) {
    return hmac(
      keys.lookupKey,
      `engine-term|${keys.owner}|${Model.normalizeText(path, 500)}|${piece}`,
    );
  }

  async function positiveCandidates(keys, condition) {
    const cond = condition && typeof condition === 'object' ? condition : {};
    const op = String(cond.op || 'eq');
    if (op === 'exists' || op === 'notExists') {
      return setOf(await allByIndex(FIELD_STORE, 'pathToken', await pathToken(keys, cond.path)));
    }
    if (op === 'eq' || op === 'neq') {
      return setOf(await allByIndex(FIELD_STORE, 'exactToken', await exactToken(keys, cond.path, cond.value)));
    }
    if (op === 'in') {
      const combined = new Set();
      for (const value of (Array.isArray(cond.value) ? cond.value : [])) {
        const rows = await allByIndex(FIELD_STORE, 'exactToken', await exactToken(keys, cond.path, value));
        for (const key of setOf(rows)) combined.add(key);
      }
      return combined;
    }
    if (op === 'contains' || op === 'startsWith') {
      if (op === 'contains' && Model.normalizeSearchText(cond.value).length < 3) {
        return setOf(await allByIndex(FIELD_STORE, 'pathToken', await pathToken(keys, cond.path)));
      }
      let candidates = null;
      const pieces = Model.queryTermPieces(cond.value, op);
      for (const piece of pieces) {
        const rows = await allByIndex(FIELD_STORE, 'termTokens', await termToken(keys, cond.path, piece));
        candidates = intersect(candidates, setOf(rows));
      }
      return candidates || new Set();
    }
    if (['lt', 'lte', 'gt', 'gte'].includes(op)) {
      const rows = await allByIndex(FIELD_STORE, 'pathToken', await pathToken(keys, cond.path));
      const targetDate = typeof cond.value === 'string' ? Date.parse(cond.value) : NaN;
      const target = Number.isFinite(Number(cond.value)) ? Number(cond.value)
        : (Number.isFinite(targetDate) ? targetDate : NaN);
      if (!Number.isFinite(target)) return new Set();
      return setOf(rows.filter((row) => {
        const actual = Number.isFinite(row.numberValue) ? row.numberValue : row.dateValue;
        if (!Number.isFinite(actual)) return false;
        if (op === 'lt') return actual < target;
        if (op === 'lte') return actual <= target;
        if (op === 'gt') return actual > target;
        return actual >= target;
      }));
    }
    return new Set();
  }

  async function deleteRecordKeys(recordKeys) {
    if (!recordKeys.length) return;
    const db = await openDb();
    const fieldGroups = await Promise.all(recordKeys.map((recordKey) => {
      const tx = db.transaction(FIELD_STORE, 'readonly');
      return requestValue(tx.objectStore(FIELD_STORE).index('recordKey').getAll(recordKey), []);
    }));
    const tx = db.transaction([RECORD_STORE, FIELD_STORE], 'readwrite');
    const records = tx.objectStore(RECORD_STORE);
    const fields = tx.objectStore(FIELD_STORE);
    for (const key of recordKeys) records.delete(key);
    for (const row of fieldGroups.flat()) fields.delete(row.fieldKey);
    await transactionDone(tx);
  }

  async function query(input = {}) {
    const config = await currentConfig();
    if (!config.territory) return { rows: [], total: 0, matched: 0, scanned: 0 };
    const keys = await deriveKeys(config.territory);
    const records = await allOwnerRecords(keys);
    const byKey = new Map(records.map((record) => [record.storageKey, record]));
    let candidates = new Set(byKey.keys());
    const where = Array.isArray(input.where) ? input.where.slice(0, 20) : [];
    for (const condition of where) {
      const positive = await positiveCandidates(keys, condition);
      const op = String(condition?.op || 'eq');
      candidates = op === 'neq' || op === 'notExists'
        ? subtract(candidates, positive)
        : intersect(candidates, positive);
    }
    /* `scanAll` is the bulk path for the cache export: an interactive query
       stops decrypting at MAX_QUERY_SCAN because nobody reads 2,000 rows in a
       panel, but an export that silently stopped there would claim to be the
       cache while holding a third of it. */
    const allKeys = [...candidates]
      .sort((a, b) => (byKey.get(b)?.updatedAt || 0) - (byKey.get(a)?.updatedAt || 0));
    const orderedKeys = input.scanAll === true ? allKeys : allKeys.slice(0, MAX_QUERY_SCAN);
    const offset = Math.max(0, Math.trunc(Number(input.offset) || 0));
    const limit = Math.max(1, Math.min(MAX_QUERY_LIMIT, Number(input.limit) || 100));
    /* With no filters every candidate matches, so only the requested window
       needs decrypting — that is what keeps a paged export at 500 decrypts per
       page instead of the whole cache, every page. */
    const decryptKeys = where.length ? orderedKeys : orderedKeys.slice(offset, offset + limit);
    const rows = [];
    const corrupt = [];
    for (const key of decryptKeys) {
      try {
        const snapshot = await decryptSnapshot(byKey.get(key), keys);
        const queryData = {
          ...snapshot.data,
          __index: {
            schemaId: snapshot.schemaId,
            entityType: snapshot.entityType,
            recordId: snapshot.id,
            accountId: snapshot.accountId,
            contactId: snapshot.contactId,
          },
        };
        if (Model.matchesWhere(queryData, where)) rows.push(snapshot);
      } catch {
        corrupt.push(key);
      }
    }
    if (corrupt.length) await deleteRecordKeys(corrupt);
    const orderBy = input.orderBy && typeof input.orderBy === 'object' ? input.orderBy : null;
    if (orderBy?.path) {
      const direction = String(orderBy.direction || 'asc').toLowerCase() === 'desc' ? -1 : 1;
      rows.sort((left, right) => {
        const a = Model.valuesForPath(left.data, orderBy.path)[0];
        const b = Model.valuesForPath(right.data, orderBy.path)[0];
        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        return (a < b ? -1 : a > b ? 1 : 0) * direction;
      });
    }
    return {
      /* Filtered queries match after decrypting, so offset/limit slice here;
         the unfiltered window was already cut before decryption. */
      rows: where.length ? rows.slice(offset, offset + limit) : rows,
      total: records.length,
      /* How many rows this query matches in full — the number a paged caller
         walks toward. Unfiltered, that is every ordered candidate. */
      matched: where.length ? rows.length : orderedKeys.length,
      scanned: decryptKeys.length,
      cleared: corrupt.length,
    };
  }

  async function stats() {
    const config = await currentConfig();
    if (!config.territory) return { total: 0, byType: {}, lastIndexedAt: null };
    const keys = await deriveKeys(config.territory);
    const records = await allOwnerRecords(keys);
    const byType = {};
    let lastIndexedAt = null;
    for (const record of records) {
      byType[record.entityType] = (byType[record.entityType] || 0) + 1;
      if (!lastIndexedAt || record.updatedAt > lastIndexedAt) lastIndexedAt = record.updatedAt;
    }
    return { total: records.length, byType, lastIndexedAt };
  }

  async function clearInternal() {
    const db = await openDb();
    const tx = db.transaction([RECORD_STORE, FIELD_STORE], 'readwrite');
    const records = tx.objectStore(RECORD_STORE);
    const fields = tx.objectStore(FIELD_STORE);
    const done = transactionDone(tx);
    const countPromise = requestValue(records.count(), 0);

    /* This action promises to delete the whole local cache, not just the
       currently configured territory. Store-level clears stay constant in
       transaction count even with thousands of contacts and avoid loading
       every record's field rows into memory first. Device keys live in their
       own store and deliberately survive. */
    records.clear();
    fields.clear();
    const [cleared] = await Promise.all([countPromise, done]);
    return { cleared: Number(cleared) || 0 };
  }

  function clear() {
    /* Serialize maintenance with snapshot upserts. A write already in flight
       finishes before the clear; a write queued afterward starts after it. */
    const run = writeTail.then(clearInternal);
    writeTail = run.catch(() => {});
    return run;
  }

  root.GBPageEngineIndex = Object.freeze({
    indexSnapshot,
    query,
    stats,
    clear,
  });
})(globalThis);
