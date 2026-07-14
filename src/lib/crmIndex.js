/**
 * Client facade for the zero-setup encrypted CRM index.
 *
 * Persistent IndexedDB and all cryptography live in the service worker. This
 * content-script module receives only decrypted result batches selected by a
 * plaintext name search. The former page-origin `gb-crm-index` database is
 * deleted on first use so legacy plaintext Solr rows cannot survive upgrade.
 */
import { sendBackgroundMessage } from './backgroundMessage.js';

const LEGACY_DB_NAME = 'gb-crm-index';
const PUT_BATCH_SIZE = 200;
let legacyClearPromise = null;

function clearLegacyPageIndex() {
  if (legacyClearPromise) return legacyClearPromise;
  legacyClearPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(); return; }
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    try {
      const request = indexedDB.deleteDatabase(LEGACY_DB_NAME);
      request.onsuccess = finish;
      request.onerror = finish;
      request.onblocked = () => setTimeout(finish, 1_000);
      setTimeout(finish, 2_000);
    } catch {
      finish();
    }
  });
  return legacyClearPromise;
}

async function employeeId() {
  if (typeof window !== 'undefined' && /^\d{1,12}$/.test(String(window.__gbEmployeeId || ''))) {
    return String(window.__gbEmployeeId);
  }
  const stored = await new Promise((resolve) => {
    try { chrome.storage.local.get('gbEmployeeId', (value) => resolve(value || {})); }
    catch { resolve({}); }
  });
  const id = String(stored.gbEmployeeId || '');
  if (!/^\d{1,12}$/.test(id)) throw new Error('Reload an authenticated order page before using the secure CRM index');
  return id;
}

/** Encrypt and upsert full CRM rows in bounded worker messages. */
export async function indexRecords(records) {
  await clearLegacyPageIndex();
  if (!Array.isArray(records) || records.length === 0) return { added: 0 };
  const owner = await employeeId();
  let added = 0;
  for (let offset = 0; offset < records.length; offset += PUT_BATCH_SIZE) {
    const response = await sendBackgroundMessage('crmIndexPut', {
      employeeId: owner,
      records: records.slice(offset, offset + PUT_BATCH_SIZE),
    });
    added += Number(response.added) || 0;
  }
  return { added };
}

/** Rank plaintext names in the worker and decrypt only the requested top rows. */
export async function queryIndexed(query = '', { limit = 100 } = {}) {
  await clearLegacyPageIndex();
  const response = await sendBackgroundMessage('crmIndexSearch', {
    employeeId: await employeeId(),
    query: String(query || '').slice(0, 500),
    limit: Math.max(1, Math.min(200, Number(limit) || 100)),
  });
  return {
    rows: Array.isArray(response.rows) ? response.rows : [],
    total: Number(response.total) || 0,
    matched: Number(response.matched) || 0,
    cleared: Number(response.cleared) || 0,
  };
}

/** Compatibility helper: returns the most recently indexed top rows only. */
export async function getAllIndexed() {
  return (await queryIndexed('', { limit: 200 })).rows;
}

export async function deleteIndexed(id) {
  await clearLegacyPageIndex();
  await sendBackgroundMessage('crmIndexDelete', { employeeId: await employeeId(), id: String(id || '') });
}

export async function clearIndex() {
  await clearLegacyPageIndex();
  await sendBackgroundMessage('crmIndexClear');
}

/* In-memory search remains for spreadsheet imports and mock data. Persisted
   secure-index searches use queryIndexed() so only the visible top result batch
   is ever decrypted into the content script. */
const SEARCHABLE_FIELDS = [
  'contactName_t', 'accountName_t', 'accountID_s', 'salesRep_s',
  'salesRepID_s', 'role_s', 'recordType_s', 'id',
];
const SEARCHABLE_ARRAY_FIELDS = ['emails_tps', 'phones_ss'];

function buildHaystack(record) {
  const parts = [];
  for (const field of SEARCHABLE_FIELDS) {
    const value = record[field];
    if (value != null && value !== '') parts.push(String(value));
  }
  for (const field of SEARCHABLE_ARRAY_FIELDS) {
    const values = record[field];
    if (Array.isArray(values)) for (const value of values) if (value) parts.push(String(value));
  }
  return parts.join(' ').toLowerCase();
}

function scoreRecord(haystack, tokens) {
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

export function searchIndexed(records, query, { limit = 100 } = {}) {
  if (!Array.isArray(records) || records.length === 0) return [];
  const normalized = String(query || '').toLowerCase().trim();
  if (!normalized) {
    return records.slice().sort((a, b) => (b.indexedAt || 0) - (a.indexedAt || 0)).slice(0, limit);
  }
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const record of records) {
    const score = scoreRecord(buildHaystack(record), tokens);
    if (score >= 0) scored.push({ record, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.record);
}
