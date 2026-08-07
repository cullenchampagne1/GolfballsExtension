/**
 * The Page Engine cache, as a file you can analyse.
 *
 * The index is built to be queried by the extension, not read by a person: it
 * is encrypted at rest, partitioned by territory, and every record is a nested
 * snapshot of one CRM page — a contact with its orders, activities, emails and
 * tasks hanging off it. Loading that shape into a spreadsheet or a dataframe is
 * a chore, and the chore is what stops the cache from being used.
 *
 * So an export carries the data TWICE, for two different readers:
 *
 *   · `records` — the snapshots exactly as the index holds them. Lossless, and
 *     the only thing that could ever be re-imported.
 *   · `tables`  — the same data flattened into rows: one table of records, and
 *     one table per repeating group (orders, activities, emails, tasks …),
 *     every row carrying the id of the record it came off so the tables JOIN.
 *     `pd.DataFrame(doc['tables']['orders'])` and you are analysing.
 *
 * WHICH TABLES EXIST IS DISCOVERED, NOT LISTED. Any array-of-objects in a
 * snapshot's data becomes a table named after its key, so a schema that grows a
 * new repeating group exports it without this file being touched. Nothing here
 * knows what an order is — that knowledge stays in src/lib/page-schemas/.
 *
 * PLAINTEXT, DELIBERATELY. The index is encrypted on disk with a device key;
 * an export is the rep's own cached CRM data, in the clear, in their downloads
 * folder. That is the whole point of the button, and the reason the button says
 * "Export" rather than doing it on a schedule.
 */

import { sendBackgroundMessage } from './backgroundMessage.js';

export const EXPORT_FORMAT = 'golfballs-toolkit/page-engine-cache';
export const EXPORT_VERSION = 1;

/* The index caps a single query at 500 rows (lib/page-engine-index-store.js
   MAX_QUERY_LIMIT), so the export PAGES: offset steps of 500, `scanAll` to
   lift the interactive scan bound, until the whole cache is in hand. The old
   single-query export stopped at the first 500 of a 5,324-record territory
   and shipped a tenth of the cache marked `truncated`. */
export const EXPORT_LIMIT = 500;
/* 200k records — far beyond any real territory; a backstop, not a budget. */
export const EXPORT_MAX_PAGES = 400;

const isPlainObject = (value) => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const isScalar = (value) => (
  value == null
  || typeof value === 'string'
  || typeof value === 'number'
  || typeof value === 'boolean'
);

/**
 * One nested object → one flat row of dotted keys, arrays left behind.
 *
 * `{ contact: { firstName: 'Dana' }, orders: [...] }` becomes
 * `{ 'contact.firstName': 'Dana' }`. The arrays are not dropped — they become
 * their own tables, which is the only way a repeating group survives into a
 * spreadsheet without either exploding the row or being summarised away.
 */
export function flattenScalars(value, prefix = '') {
  const row = {};
  if (!isPlainObject(value)) return row;
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isScalar(entry)) row[path] = entry ?? null;
    else if (isPlainObject(entry)) Object.assign(row, flattenScalars(entry, path));
    // Arrays: see `arrayGroups`.
  }
  return row;
}

/** The repeating groups in one snapshot's data: `{ key: [objects] }`. */
function arrayGroups(data) {
  const groups = {};
  if (!isPlainObject(data)) return groups;
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value) || !value.length) continue;
    const rows = value.filter(isPlainObject);
    if (rows.length) groups[key] = rows;
  }
  return groups;
}

/** The columns that make every table joinable back to its record. */
function recordKeys(snapshot, index) {
  return {
    recordIndex: index,
    recordId: snapshot.id ?? null,
    entityType: snapshot.entityType ?? null,
    contactId: snapshot.contactId || null,
    accountId: snapshot.accountId || null,
  };
}

const count = (value) => (Number.isFinite(Number(value)) && Number(value) > 0
  ? Math.floor(Number(value))
  : 0);

/**
 * Cached snapshots → the export document.
 *
 * Pure: the same rows always produce the same file, which is what lets the
 * shape be tested without an IndexedDB, a device key, or a CRM.
 */
export function buildEngineCacheExport(rows, {
  territory = '',
  now = Date.now(),
  total = null,
  truncated = false,
} = {}) {
  const snapshots = (Array.isArray(rows) ? rows : []).filter(isPlainObject);
  const records = [];
  const tables = {};
  const byType = {};

  snapshots.forEach((snapshot, index) => {
    const keys = recordKeys(snapshot, index);
    byType[keys.entityType || 'unknown'] = (byType[keys.entityType || 'unknown'] || 0) + 1;
    records.push({
      ...keys,
      territory: snapshot.territory ?? null,
      sourceUrl: snapshot.sourceUrl ?? null,
      indexedAt: snapshot.indexedAt ?? null,
      indexedAtIso: count(snapshot.indexedAt)
        ? new Date(count(snapshot.indexedAt)).toISOString()
        : null,
      ...flattenScalars(snapshot.data),
    });
    for (const [group, groupRows] of Object.entries(arrayGroups(snapshot.data))) {
      tables[group] = tables[group] || [];
      groupRows.forEach((entry, ordinal) => {
        tables[group].push({ ...keys, ordinal, ...flattenScalars(entry) });
      });
    }
  });

  const counts = { records: records.length, ...byType };
  for (const [group, groupRows] of Object.entries(tables)) counts[group] = groupRows.length;

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date(now).toISOString(),
    territory: String(territory || '').trim() || null,
    // What the index holds vs what came back: an export that hit the query cap
    // is a sample, and saying so beats an analysis quietly run on part of it.
    cachedTotal: total == null ? records.length : count(total),
    truncated: !!truncated,
    counts,
    // Flat first: it is what a reader opens the file to find.
    tables: { records, ...tables },
    records: snapshots,
  };
}

/** `page-engine-cache-2026-08-06.json` — sortable, and obvious in a downloads folder. */
export function engineCacheExportFilename(now = Date.now()) {
  return `page-engine-cache-${new Date(now).toISOString().slice(0, 10)}.json`;
}

/** "4 contacts · 37 orders · 12 activities" — the toast after a click. */
export function engineCacheExportSummary(document) {
  const counts = document?.counts || {};
  const order = ['contact', 'account', 'orders', 'activities', 'emails', 'tasks', 'opportunities'];
  const label = (key) => (key === 'contact' || key === 'account'
    ? `${key}${counts[key] === 1 ? '' : 's'}`
    : key);
  const parts = order
    .filter((key) => count(counts[key]))
    .map((key) => `${counts[key].toLocaleString('en-US')} ${label(key)}`);
  return parts.length ? parts.join(' · ') : 'nothing cached yet';
}

/**
 * Read the whole cache through the worker and build the document.
 *
 * The worker is the only reader of the index — it holds the device key — so the
 * settings page asks rather than opening the database itself, exactly as the
 * count readout does.
 */
export async function exportEngineCache(settings) {
  const rows = [];
  const seen = new Set();
  let total = 0;
  let matched = null;
  for (let page = 0; page < EXPORT_MAX_PAGES; page += 1) {
    const answer = await sendBackgroundMessage('pageEngineIndexQuery', {
      query: { limit: EXPORT_LIMIT, offset: page * EXPORT_LIMIT, scanAll: true },
    });
    const batch = Array.isArray(answer?.rows) ? answer.rows : [];
    total = Number(answer?.total) || total;
    if (Number.isFinite(Number(answer?.matched))) matched = Number(answer.matched);
    // A worker from before offset support answers every page with the same
    // first 500 — deduping by identity turns that into one page and a stop,
    // instead of 400 copies of the head of the cache.
    let fresh = 0;
    for (const row of batch) {
      const key = `${row?.schemaId || ''}:${row?.id || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
      fresh += 1;
    }
    if (!fresh || batch.length < EXPORT_LIMIT) break;
    if (matched != null && rows.length >= matched) break;
  }
  const document = buildEngineCacheExport(rows, {
    territory: settings?.['pageEngine.territory'],
    total,
    // Truncated now means "the walk stopped short of what the index said it
    // holds" — a stale worker or the page backstop — not the old 500 ceiling.
    truncated: matched != null && rows.length < matched,
  });
  return {
    document,
    filename: engineCacheExportFilename(),
    summary: engineCacheExportSummary(document),
    empty: !document.counts.records,
  };
}
