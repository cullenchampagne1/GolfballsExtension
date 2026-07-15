/**
 * Unit tests — src/lib/crmIndex.js (searchIndexed)
 *
 * searchIndexed is the pure in-memory ranker used for spreadsheet imports and
 * mock data; the persisted secure-index path goes through the service worker
 * and is not exercised here. The module has no import-time DOM/chrome needs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { searchIndexed } from '../../src/lib/crmIndex.js';

const records = [
  { id: 'a1', contactName_t: 'Smith Supply Co', indexedAt: 100 },
  { id: 'b2', contactName_t: 'John Smith', accountName_t: 'Acme Golf', indexedAt: 300 },
  { id: 'c3', contactName_t: 'Blacksmith Tools', indexedAt: 200 },
  { id: 'd4', contactName_t: 'Dana Fields', emails_tps: ['dana@puttersedge.com'], phones_ss: ['6103748344'], indexedAt: 400 },
];

describe('searchIndexed', () => {
  it('ranks haystack-start matches above word-boundary matches above mid-word hits', () => {
    const ids = searchIndexed(records, 'smith').map((r) => r.id);
    assert.deepEqual(ids, ['a1', 'b2', 'c3']);
  });

  it('requires every token of a multi-term query to be present', () => {
    const ids = searchIndexed(records, 'john acme').map((r) => r.id);
    assert.deepEqual(ids, ['b2']); // a1/c3 match "smith"-less tokens nowhere
  });

  it('is case-insensitive on both the query and the record fields', () => {
    const ids = searchIndexed(records, 'ACME golf').map((r) => r.id);
    assert.deepEqual(ids, ['b2']);
  });

  it('searches array fields (emails, phones) as well as scalar fields', () => {
    assert.deepEqual(searchIndexed(records, 'puttersedge').map((r) => r.id), ['d4']);
    assert.deepEqual(searchIndexed(records, '6103748344').map((r) => r.id), ['d4']);
  });

  it('returns [] when no record contains the query', () => {
    assert.deepEqual(searchIndexed(records, 'zebra'), []);
  });

  it('honors the limit option on scored results', () => {
    const ids = searchIndexed(records, 'smith', { limit: 2 }).map((r) => r.id);
    assert.deepEqual(ids, ['a1', 'b2']);
  });

  it('an empty query lists records newest-first by indexedAt, limited', () => {
    const ids = searchIndexed(records, '', { limit: 3 }).map((r) => r.id);
    assert.deepEqual(ids, ['d4', 'b2', 'c3']);
  });

  it('returns [] for a missing or empty record set', () => {
    assert.deepEqual(searchIndexed(null, 'smith'), []);
    assert.deepEqual(searchIndexed([], 'smith'), []);
  });
});
