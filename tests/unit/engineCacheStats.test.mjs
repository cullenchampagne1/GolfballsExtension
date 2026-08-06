import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  engineCacheStatError,
  engineCacheStatView,
} from '../../src/lib/engineCacheStats.js';
import { DEV_SETTINGS, defaultDevSettings, isValueSetting } from '../../src/lib/devSettings.js';

const NOW = Date.parse('2026-08-05T12:00:00Z');
const ON = {
  'pageEngine.indexingEnabled': true,
  'pageEngine.territory': '412',
};
const stats = (contact, account, lastIndexedAt = NOW - 5 * 60_000) => ({
  total: contact + account,
  byType: { contact, account },
  lastIndexedAt,
});

describe('engine cache stat · the cached-contacts readout', () => {
  it('reports the cached Contact count as the headline number', () => {
    const view = engineCacheStatView(stats(1284, 96), ON, { now: NOW });
    assert.equal(view.contacts, 1284);
    assert.equal(view.value, '1,284');
    assert.equal(view.tone, 'brand');
  });

  it('shows only the last write beneath the count', () => {
    const view = engineCacheStatView(stats(12, 3, NOW - 2 * 3_600_000), ON, { now: NOW });
    assert.equal(view.detail, 'updated 2h ago');
  });

  it('keeps a cached Account count off the compact update line', () => {
    const view = engineCacheStatView(stats(12, 1), ON, { now: NOW });
    assert.equal(view.detail, 'updated 5m ago');
  });

  it('drops the account clause when only Contacts are cached', () => {
    const view = engineCacheStatView(stats(7, 0), ON, { now: NOW });
    assert.equal(view.detail, 'updated 5m ago');
  });

  it('says indexing is off rather than implying an empty cache', () => {
    const off = { ...ON, 'pageEngine.indexingEnabled': false };
    const view = engineCacheStatView(stats(0, 0), off, { now: NOW });
    assert.equal(view.value, '0');
    assert.equal(view.tone, 'muted');
    assert.equal(view.detail, 'Engine Indexing is off — nothing is being cached.');
  });

  it('keeps counting records cached before indexing was turned off', () => {
    const off = { ...ON, 'pageEngine.indexingEnabled': false };
    const view = engineCacheStatView(stats(40, 2), off, { now: NOW });
    assert.equal(view.value, '40');
    assert.equal(view.detail, 'Engine Indexing is off — these were cached earlier and are kept.');
  });

  it('points at the missing territory first — it is the index partition', () => {
    const view = engineCacheStatView(stats(0, 0), { ...ON, 'pageEngine.territory': '  ' }, { now: NOW });
    assert.equal(view.tone, 'warning');
    assert.equal(view.detail, 'Set an Engine Territory to cache anything.');
  });

  it('tells the rep how to fill an enabled but empty cache', () => {
    const view = engineCacheStatView(stats(0, 0), ON, { now: NOW });
    assert.equal(view.detail, 'Nothing cached yet — open a Contact in this territory.');
  });

  it('distinguishes "accounts only" from a wholly empty cache', () => {
    const view = engineCacheStatView(stats(0, 9), ON, { now: NOW });
    assert.equal(view.value, '0');
    assert.equal(view.detail, '9 accounts cached, no Contacts yet — open a Contact in this territory.');
  });

  it('treats a never-written index as "never", not 1970', () => {
    const view = engineCacheStatView(stats(3, 0, null), ON, { now: NOW });
    assert.equal(view.detail, 'updated never');
  });

  it('shows an unknown count as — rather than a false zero', () => {
    const view = engineCacheStatError(new Error('Not in an extension context'));
    assert.equal(view.value, '—');
    assert.equal(view.tone, 'warning');
    assert.equal(view.detail, 'Not in an extension context');
  });

  it('survives a worker answer with no counts at all', () => {
    const view = engineCacheStatView(undefined, ON, { now: NOW });
    assert.equal(view.value, '0');
    assert.equal(view.contacts, 0);
    assert.equal(view.accounts, 0);
  });
});

describe('engine cache stat · registry wiring', () => {
  const row = DEV_SETTINGS.find((item) => item.key === 'pageEngine.cachedContacts');

  it('registers the readout as a stat row with a reader and watched keys', () => {
    assert.ok(row, 'pageEngine.cachedContacts must be registered in DEV_SETTINGS');
    assert.equal(row.type, 'stat');
    assert.equal(typeof row.reader, 'function');
    assert.deepEqual(row.watch, ['pageEngine.indexingEnabled', 'pageEngine.territory']);
  });

  it('keeps read-only rows out of the persisted settings bag', () => {
    const defaults = defaultDevSettings();
    assert.equal(Object.hasOwn(defaults, 'pageEngine.cachedContacts'), false);
    assert.equal(Object.hasOwn(defaults, 'pageEngine.inspectTerritory'), false);
    assert.equal(defaults['pageEngine.indexingEnabled'], false);
  });

  it('classifies every registry row as value-bearing or read-only', () => {
    assert.equal(isValueSetting({ type: 'bool' }), true);
    assert.equal(isValueSetting({ type: 'stat' }), false);
    assert.equal(isValueSetting({ type: 'action' }), false);
    for (const item of DEV_SETTINGS.filter(isValueSetting)) {
      assert.notEqual(item.default, undefined, `${item.key} must carry a default`);
    }
  });
});
