/**
 * Encrypted CRM index owned by the extension service worker.
 *
 * Non-extractable WebCrypto keys are generated on first use and persisted as
 * CryptoKey objects in this extension-origin IndexedDB. No raw key material is
 * written to extension storage or returned through runtime messages.
 */
(function installCrmIndexStore(root) {
  'use strict';

  const DB_NAME = 'gb-crm-index-secure';
  const RECORD_STORE = 'records';
  const KEY_STORE = 'keys';
  const DEVICE_KEY_ID = 'device-keys-v1';
  const DB_VERSION = 2;
  const RECORD_SCHEMA_VERSION = 3;
  const KEY_VERSION = 1;
  const MAX_RECORDS_PER_CALL = 250;
  const MAX_RECORD_CHARS = 100_000;
  const MAX_TOTAL_CHARS = 10_000_000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let dbPromise = null;
  let deviceKeysPromise = null;

  function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const normalized = String(value || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }

  function normalizeEmployeeId(value) {
    const id = String(value || '').trim();
    if (!/^\d{1,12}$/.test(id)) throw new Error('A valid employee ID is required for the secure CRM index');
    return id;
  }

  function normalizeName(value) {
    return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 500);
  }

  function displayFields(record) {
    const contactName = normalizeName(record.contactName_t);
    const accountName = normalizeName(record.accountName_t);
    const explicitFirst = normalizeName(record.firstName_s);
    const explicitLast = normalizeName(record.lastName_s);
    const parts = contactName.split(' ').filter(Boolean);
    const firstName = explicitFirst || (parts.length ? parts[0] : '');
    const lastName = explicitLast || (parts.length > 1 ? parts.slice(1).join(' ') : '');
    const displayName = contactName || accountName || 'Unnamed record';
    return {
      firstName,
      lastName,
      displayName,
      nameSearch: [firstName, lastName, displayName].filter(Boolean).join(' ').toLowerCase(),
      recordType: /^account/i.test(String(record.recordType_s || record.id || '')) ? 'Account' : 'Contact',
    };
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RECORD_STORE)) {
          const store = db.createObjectStore(RECORD_STORE, { keyPath: 'storageKey' });
          store.createIndex('owner', 'owner', { unique: false });
          store.createIndex('indexedAt', 'indexedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open secure CRM index'));
    });
    return dbPromise;
  }

  async function readStoredDeviceKeys() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(KEY_STORE, 'readonly');
      const request = tx.objectStore(KEY_STORE).get(DEVICE_KEY_ID);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || tx.error);
    });
  }

  async function createAndStoreDeviceKeys() {
    const [encryptionKey, lookupKey] = await Promise.all([
      crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
      crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']),
    ]);
    const stored = { id: DEVICE_KEY_ID, keyVersion: KEY_VERSION, encryptionKey, lookupKey };
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([KEY_STORE, RECORD_STORE], 'readwrite');
      // Ciphertext is unrecoverable when its key record is missing or invalid.
      // Clear it atomically before installing replacement keys.
      tx.objectStore(RECORD_STORE).clear();
      tx.objectStore(KEY_STORE).put(stored);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return stored;
  }

  async function deviceKeys() {
    if (!deviceKeysPromise) {
      deviceKeysPromise = (async () => {
        const stored = await readStoredDeviceKeys();
        if (stored && stored.keyVersion === KEY_VERSION
            && stored.encryptionKey instanceof CryptoKey && stored.encryptionKey.extractable === false
            && stored.lookupKey instanceof CryptoKey && stored.lookupKey.extractable === false) return stored;
        return createAndStoreDeviceKeys();
      })().catch((error) => {
        deviceKeysPromise = null;
        throw error;
      });
    }
    return deviceKeysPromise;
  }

  async function deriveKeys(employeeId) {
    const employee = normalizeEmployeeId(employeeId);
    const stored = await deviceKeys();
    const ownerSignature = await crypto.subtle.sign('HMAC', stored.lookupKey, enc.encode(`crm-index-owner|${employee}`));
    return {
      encryptionKey: stored.encryptionKey,
      lookupKey: stored.lookupKey,
      owner: bytesToBase64(new Uint8Array(ownerSignature)),
      keyVersion: stored.keyVersion,
    };
  }

  async function storageKeyFor(id, keys) {
    const value = String(id || '').trim();
    if (!value || value.length > 500) throw new Error('Invalid CRM record ID');
    const signature = await crypto.subtle.sign('HMAC', keys.lookupKey, enc.encode(`crm-record|${keys.owner}|${value}`));
    return bytesToBase64(new Uint8Array(signature));
  }

  function associatedData(meta) {
    return enc.encode([
      `schema:${RECORD_SCHEMA_VERSION}`,
      `key:${meta.keyVersion}`,
      `owner:${meta.owner}`,
      `record:${meta.storageKey}`,
    ].join('|'));
  }

  async function encryptRecord(record, keys) {
    let plaintext;
    try { plaintext = JSON.stringify(record); } catch { throw new Error('CRM record is not serializable'); }
    if (plaintext.length > MAX_RECORD_CHARS) throw new Error('CRM record exceeds size limit');
    const storageKey = await storageKeyFor(record.id, keys);
    const meta = {
      storageKey,
      owner: keys.owner,
      keyVersion: keys.keyVersion,
      schemaVersion: RECORD_SCHEMA_VERSION,
      indexedAt: Date.now(),
      ...displayFields(record),
    };
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({
      name: 'AES-GCM', iv, additionalData: associatedData(meta), tagLength: 128,
    }, keys.encryptionKey, enc.encode(plaintext));
    return { ...meta, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
  }

  async function decryptRecord(stored, keys) {
    if (!stored || stored.schemaVersion !== RECORD_SCHEMA_VERSION
        || stored.keyVersion !== keys.keyVersion || stored.owner !== keys.owner
        || typeof stored.iv !== 'string' || typeof stored.ciphertext !== 'string') {
      throw new Error('Stale CRM index record');
    }
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: base64ToBytes(stored.iv),
      additionalData: associatedData(stored),
      tagLength: 128,
    }, keys.encryptionKey, base64ToBytes(stored.ciphertext));
    return JSON.parse(dec.decode(plaintext));
  }

  async function readAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(RECORD_STORE, 'readonly');
      const request = tx.objectStore(RECORD_STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || tx.error);
    });
  }

  async function deleteStorageKeys(keys) {
    if (!keys.length) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(RECORD_STORE, 'readwrite');
      const store = tx.objectStore(RECORD_STORE);
      for (const key of keys) store.delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function purgeLegacy(records, keys) {
    const stale = records.filter((record) => !record
      || record.schemaVersion !== RECORD_SCHEMA_VERSION
      || record.keyVersion !== keys.keyVersion
      || typeof record.ciphertext !== 'string'
      || typeof record.iv !== 'string').map((record) => record && record.storageKey).filter(Boolean);
    await deleteStorageKeys(stale);
    return stale.length;
  }

  async function indexRecords(records, employeeId) {
    if (!Array.isArray(records) || records.length < 1 || records.length > MAX_RECORDS_PER_CALL) {
      throw new Error(`CRM index batch must contain 1–${MAX_RECORDS_PER_CALL} records`);
    }
    let totalChars = 0;
    for (const record of records) {
      let serialized = '';
      try { serialized = JSON.stringify(record); } catch { throw new Error('CRM record is not serializable'); }
      totalChars += serialized.length;
      if (!record || typeof record !== 'object' || Array.isArray(record) || !record.id || serialized.length > MAX_RECORD_CHARS) {
        throw new Error('Invalid CRM index record');
      }
    }
    if (totalChars > MAX_TOTAL_CHARS) throw new Error('CRM index batch exceeds size limit');
    const keys = await deriveKeys(employeeId);
    const encrypted = await Promise.all(records.map((record) => encryptRecord(record, keys)));
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(RECORD_STORE, 'readwrite');
      const store = tx.objectStore(RECORD_STORE);
      for (const record of encrypted) store.put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return { added: encrypted.length };
  }

  function scoreName(record, tokens) {
    const haystack = String(record.nameSearch || '');
    let score = 0;
    for (const token of tokens) {
      const index = haystack.indexOf(token);
      if (index < 0) return -1;
      score += token.length * 2;
      if (index === 0) score += 5;
      else if (haystack[index - 1] === ' ') score += 3;
    }
    return score;
  }

  async function search({ query = '', limit = 100, employeeId } = {}) {
    const keys = await deriveKeys(employeeId);
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
    const normalizedQuery = normalizeName(query).toLowerCase();
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const all = await readAll();
    const cleared = await purgeLegacy(all, keys);
    const current = all.filter((record) => record && record.schemaVersion === RECORD_SCHEMA_VERSION
      && record.keyVersion === keys.keyVersion && record.owner === keys.owner
      && typeof record.ciphertext === 'string' && typeof record.iv === 'string');
    const ranked = current.map((record) => ({ record, score: tokens.length ? scoreName(record, tokens) : 0 }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => tokens.length
        ? (b.score - a.score || (b.record.indexedAt || 0) - (a.record.indexedAt || 0))
        : (b.record.indexedAt || 0) - (a.record.indexedAt || 0));
    const rows = [];
    const corrupt = [];
    for (const entry of ranked.slice(0, safeLimit)) {
      try { rows.push(await decryptRecord(entry.record, keys)); }
      catch { corrupt.push(entry.record.storageKey); }
    }
    await deleteStorageKeys(corrupt);
    return { rows, total: current.length, matched: ranked.length, cleared: cleared + corrupt.length };
  }

  function storedEmployeeId() {
    return new Promise((resolve) => {
      try { chrome.storage.local.get('gbEmployeeId', (d) => resolve((d && d.gbEmployeeId) || '')); }
      catch { resolve(''); }
    });
  }

  /* Resolve an email address to a contact using the ALREADY-INDEXED records.
     Each email lives inside its encrypted record (emails_tps / email_tp), so no
     re-index is required — we scan current records, decrypting until an email
     matches, and return the CRM contact id for the View link. Runs entirely in
     the worker (no network, no cookies), which is why it works from the
     background email-relay poll where a cross-site Solr fetch can't carry the
     golfballs session. employeeId is taken from the argument or chrome.storage
     so the same key that indexed the record decrypts it. */
  async function searchByEmail(input) {
    const email = String((input && input.email) || input || '').trim().toLowerCase();
    if (!email) return null;
    let employeeId = input && input.employeeId;
    if (!employeeId) employeeId = await storedEmployeeId();
    let keys;
    try { keys = await deriveKeys(employeeId); } catch { return null; }
    const all = await readAll();
    const current = all.filter((record) => record && record.schemaVersion === RECORD_SCHEMA_VERSION
      && record.keyVersion === keys.keyVersion && record.owner === keys.owner
      && typeof record.ciphertext === 'string' && typeof record.iv === 'string');
    for (const record of current) {
      let doc;
      try { doc = await decryptRecord(record, keys); } catch { continue; }
      const emails = [].concat(doc.emails_tps || [], doc.email_tp || [])
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);
      if (!emails.includes(email)) continue;
      const id = String(doc.id || '');
      const match = id.match(/^contact_(.+)$/i);
      const contactId = String((match && match[1]) || doc.importContactID_s || '').trim();
      return { id, contactId, contactName: doc.contactName_t || '', email };
    }
    return null;
  }

  async function deleteRecord(id, employeeId) {
    const keys = await deriveKeys(employeeId);
    await deleteStorageKeys([await storageKeyFor(id, keys)]);
  }

  async function clearIndex() {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(RECORD_STORE, 'readwrite');
      tx.objectStore(RECORD_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  root.GBCrmIndex = Object.freeze({
    indexRecords,
    search,
    searchByEmail,
    deleteRecord,
    clearIndex,
  });
})(globalThis);
