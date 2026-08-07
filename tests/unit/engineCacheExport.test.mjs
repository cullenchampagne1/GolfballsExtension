/**
 * The Page Engine cache export — the file, not the button.
 *
 * The whole value of the export is that someone can open it and analyse it, so
 * what is pinned here is the shape a reader depends on: the tables exist, they
 * join, the repeating groups survive as rows rather than being flattened away
 * or summarised, and the snapshots are still in there untouched.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPORT_FORMAT,
  buildEngineCacheExport,
  engineCacheExportFilename,
  engineCacheExportSummary,
  flattenScalars,
} from '../../src/lib/engineCacheExport.js';
import { DEV_SETTINGS } from '../../src/lib/devSettings.js';

const NOW = Date.parse('2026-08-06T09:30:00Z');

/** A cached contact, shaped as lib/page-engine-index-store.js hands one back. */
const contactSnapshot = (overrides = {}) => ({
  schemaId: 'contact',
  entityType: 'contact',
  id: '4421',
  contactId: '4421',
  accountId: 'ACME-001',
  territory: '412',
  sourceUrl: 'https://api.golfballs.com/golfballs/crm/Admin/Contact/Details?id=4421',
  indexedAt: NOW - 3_600_000,
  data: {
    ids: { contact: '4421', account: 'ACME-001' },
    contact: { firstName: 'Dana', lastName: 'Ruiz', email: 'dana@acme.test' },
    stats: { orderCount: 12, totalRevenue: 8400.5, lastOrderDate: '2026-08-04' },
    orders: [
      { number: 'SO-1001', date: '2026-08-04', revenue: 1200.25, status: 'Shipped' },
      { number: 'SO-0990', date: '2026-06-11', revenue: 640, status: 'Shipped' },
    ],
    activities: [{ subject: 'Called about reorder', date: '2026-08-01' }],
    emails: [{ subject: 'Quote for 20 dozen', date: '2026-07-28' }],
  },
  ...overrides,
});

describe('engine cache export · the document', () => {
  it('carries the snapshots untouched alongside the flat tables', () => {
    const snapshot = contactSnapshot();
    const doc = buildEngineCacheExport([snapshot], { territory: '412', now: NOW });

    assert.equal(doc.format, EXPORT_FORMAT);
    assert.equal(doc.exportedAt, '2026-08-06T09:30:00.000Z');
    assert.equal(doc.territory, '412');
    // Lossless: re-importing has to be possible, so the nested record survives
    // exactly as stored rather than as whatever the tables made of it.
    assert.deepEqual(doc.records, [snapshot]);
  });

  it('gives every repeating group its own table of rows', () => {
    const doc = buildEngineCacheExport([contactSnapshot()], { now: NOW });

    assert.deepEqual(Object.keys(doc.tables).sort(), ['activities', 'emails', 'orders', 'records']);
    assert.equal(doc.tables.orders.length, 2);
    assert.equal(doc.tables.orders[0].number, 'SO-1001');
    assert.equal(doc.tables.orders[0].revenue, 1200.25);
    assert.equal(doc.tables.orders[1].ordinal, 1);
  });

  it('keys every table row back to the record it came off, so the tables join', () => {
    const doc = buildEngineCacheExport(
      [contactSnapshot(), contactSnapshot({ id: '5223', contactId: '5223', data: { ids: {}, orders: [{ number: 'SO-2000' }] } })],
      { now: NOW },
    );

    const [first, second] = doc.tables.records;
    assert.equal(first.recordId, '4421');
    assert.equal(second.recordId, '5223');
    assert.deepEqual(
      doc.tables.orders.map((row) => [row.recordId, row.number]),
      [['4421', 'SO-1001'], ['4421', 'SO-0990'], ['5223', 'SO-2000']],
    );
    // The record row carries the same keys, so a join needs no extra column.
    assert.equal(first.contactId, '4421');
    assert.equal(first.accountId, 'ACME-001');
  });

  it('flattens nested scalars into dotted columns a spreadsheet can hold', () => {
    const doc = buildEngineCacheExport([contactSnapshot()], { now: NOW });
    const [record] = doc.tables.records;

    assert.equal(record['contact.firstName'], 'Dana');
    assert.equal(record['contact.email'], 'dana@acme.test');
    assert.equal(record['stats.orderCount'], 12);
    assert.equal(record['stats.totalRevenue'], 8400.5);
    // The arrays are NOT flattened into the record row — they are their own
    // tables, which is the only way two orders survive as two things.
    assert.equal(Object.hasOwn(record, 'orders'), false);
    assert.equal(Object.hasOwn(record, 'orders.0.number'), false);
  });

  it('stamps each record with when it was cached, in both forms', () => {
    const [record] = buildEngineCacheExport([contactSnapshot()], { now: NOW }).tables.records;
    assert.equal(record.indexedAt, NOW - 3_600_000);
    assert.equal(record.indexedAtIso, '2026-08-06T08:30:00.000Z');
    assert.equal(record.sourceUrl.includes('Contact/Details'), true);
  });

  it('counts what is in the file, by entity and by group', () => {
    const doc = buildEngineCacheExport(
      [contactSnapshot(), contactSnapshot({ id: 'ACME-001', entityType: 'account', schemaId: 'account' })],
      { now: NOW },
    );

    assert.equal(doc.counts.records, 2);
    assert.equal(doc.counts.contact, 1);
    assert.equal(doc.counts.account, 1);
    assert.equal(doc.counts.orders, 4);
    assert.equal(doc.counts.activities, 2);
  });

  it('says when the export is only part of the cache', () => {
    // An analysis quietly run on a sample is worse than one that knows it is a
    // sample, so the cap the query hit travels with the file.
    const doc = buildEngineCacheExport([contactSnapshot()], { now: NOW, total: 512, truncated: true });
    assert.equal(doc.cachedTotal, 512);
    assert.equal(doc.truncated, true);
  });

  it('exports an empty cache as an empty document rather than throwing', () => {
    const doc = buildEngineCacheExport([], { now: NOW });
    assert.deepEqual(doc.tables.records, []);
    assert.deepEqual(doc.records, []);
    assert.equal(doc.counts.records, 0);
    assert.equal(doc.territory, null);
  });

  it('ignores rows that are not snapshots', () => {
    const doc = buildEngineCacheExport([null, 'nope', 42, contactSnapshot()], { now: NOW });
    assert.equal(doc.counts.records, 1);
  });
});

describe('engine cache export · naming and the summary', () => {
  it('names the file by the day it was taken', () => {
    assert.equal(engineCacheExportFilename(NOW), 'page-engine-cache-2026-08-06.json');
  });

  it('summarises what was exported in the rep’s terms', () => {
    const doc = buildEngineCacheExport([contactSnapshot(), contactSnapshot({ id: '5223' })], { now: NOW });
    assert.equal(engineCacheExportSummary(doc), '2 contacts · 4 orders · 2 activities · 2 emails');
  });

  it('says one contact, not 1 contacts', () => {
    const doc = buildEngineCacheExport([contactSnapshot({ data: { ids: {} } })], { now: NOW });
    assert.equal(engineCacheExportSummary(doc), '1 contact');
  });

  it('has something to say about an empty cache', () => {
    assert.equal(engineCacheExportSummary(buildEngineCacheExport([], {})), 'nothing cached yet');
  });
});

describe('engine cache export · the settings row', () => {
  it('hangs the export off the cached-contacts stat row', () => {
    const row = DEV_SETTINGS.find((entry) => entry.key === 'pageEngine.cachedContacts');
    assert.equal(row.type, 'stat');
    assert.equal(typeof row.exporter, 'function');
    assert.ok(row.exportTitle, 'the icon needs a title — it has no label of its own');
  });
});

describe('engine cache export · flattenScalars', () => {
  it('keeps a null as a column rather than dropping it', () => {
    // A missing column and an empty one are different facts about a contact,
    // and a dataframe built from rows with different keys is a mess.
    assert.deepEqual(flattenScalars({ a: null, b: 'x' }), { a: null, b: 'x' });
  });

  it('refuses anything that is not an object', () => {
    assert.deepEqual(flattenScalars(null), {});
    assert.deepEqual(flattenScalars([1, 2]), {});
  });
});

describe('engine cache export · the paged walk', () => {
  /* exportEngineCache pulls the cache through the worker in EXPORT_LIMIT
     windows. These stub the worker boundary (chrome.runtime.sendMessage —
     the only I/O) and pin the walk itself: every record once, and a stop —
     not a runaway — when the worker is from before offset support. */
  const snapshotNo = (n) => ({
    schemaId: 'contact', entityType: 'contact', id: String(n),
    contactId: String(n), territory: '412', indexedAt: 1,
    data: { ids: { contact: String(n) }, contact: { firstName: 'C' + n } },
  });

  const workerWith = (answer) => {
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (message, callback) => callback(answer(message)),
      },
    };
  };

  it('walks offset windows until it holds every record the index reports', async () => {
    const TOTAL = 1_150;
    const all = Array.from({ length: TOTAL }, (unused, i) => snapshotNo(i));
    const queries = [];
    workerWith((message) => {
      queries.push(message.query);
      const { offset = 0, limit } = message.query;
      return { ok: true, rows: all.slice(offset, offset + limit), total: TOTAL, matched: TOTAL };
    });
    const { exportEngineCache, EXPORT_LIMIT } = await import('../../src/lib/engineCacheExport.js?paged=1');

    const result = await exportEngineCache({ 'pageEngine.territory': '412' });

    assert.deepEqual(queries.map((q) => q.offset), [0, 500, 1000]);
    assert.ok(queries.every((q) => q.scanAll === true && q.limit === EXPORT_LIMIT));
    assert.equal(result.document.counts.records, TOTAL);
    assert.equal(result.document.cachedTotal, TOTAL);
    assert.equal(result.document.truncated, false, 'a complete walk is not truncated');
    assert.equal(new Set(result.document.records.map((r) => r.id)).size, TOTAL);
  });

  it('stops on a worker that ignores offset, and says the export is short', async () => {
    // A stale service worker answers every window with the same first page.
    const first = Array.from({ length: 500 }, (unused, i) => snapshotNo(i));
    let asks = 0;
    workerWith(() => {
      asks += 1;
      return { ok: true, rows: first, total: 5_324, matched: 5_324 };
    });
    const { exportEngineCache } = await import('../../src/lib/engineCacheExport.js?paged=2');

    const result = await exportEngineCache({ 'pageEngine.territory': '412' });

    assert.equal(asks, 2, 'one page of duplicates is the stop signal');
    assert.equal(result.document.counts.records, 500, 'each record once, not 400 copies');
    assert.equal(result.document.truncated, true, 'short of matched means truncated');
  });
});
