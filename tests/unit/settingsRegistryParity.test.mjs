import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  FEATURE_DEFAULTS,
  FEATURE_FLAG_META,
} from '../../src/lib/flags.js';
import {
  DEV_SETTINGS,
  defaultDevSettings,
} from '../../src/lib/devSettings.js';
import { CUSTOM_PAGE_SECTIONS } from '../../src/lib/customPages.js';
import { ADMIN_ONLY } from '../../scripts/strip-admin.mjs';

const root = new URL('../../', import.meta.url);
const source = await readFile(new URL('settings-registry.js', root), 'utf8');
const match = source.match(/Object\.freeze\((\{.*\})\);\s*\}\)\(globalThis\);\s*$/s);
assert.ok(match, 'settings-registry.js must contain the generated registry');
const registry = JSON.parse(match[1]);

const adminKeys = new Set(ADMIN_ONLY.configKeys || []);
const keep = (key) => !adminKeys.has(key);
const featureMeta = Object.fromEntries(FEATURE_FLAG_META.map((row) => [row.key, row]));
const defaults = defaultDevSettings();

describe('settings registry · extension/backend parity', () => {
  it('matches every extension feature flag and its current label/default', () => {
    const expectedKeys = Object.keys(FEATURE_DEFAULTS).filter(keep).sort();
    assert.deepEqual(Object.keys(registry.features).sort(), expectedKeys);
    for (const key of expectedKeys) {
      assert.ok(featureMeta[key], `${key} must have canonical display metadata`);
      assert.deepEqual(registry.features[key], {
        type: 'bool',
        default: FEATURE_DEFAULTS[key],
        label: featureMeta[key].name,
        managedDefault: true,
      });
    }
    assert.equal(Object.hasOwn(registry.features, 'campaignManagerEnabled'), false);
    assert.equal(Object.hasOwn(registry.features, 'submitProofEnabled'), false);
  });

  it('matches every remotely manageable developer setting', () => {
    const rows = DEV_SETTINGS.filter((row) => row.type !== 'action' && keep(row.key));
    assert.deepEqual(
      Object.keys(registry.developerSettings).sort(),
      rows.map((row) => row.key).sort(),
    );
    for (const row of rows) {
      const actual = registry.developerSettings[row.key];
      assert.equal(actual.type, row.type, row.key);
      assert.equal(actual.default, defaults[row.key], row.key);
      assert.equal(actual.label, row.label, row.key);
      assert.equal(actual.managedDefault, row.key !== 'email.localPart', row.key);
      if (row.min !== undefined) assert.equal(actual.min, row.min, row.key);
      if (row.max !== undefined) assert.equal(actual.max, row.max, row.key);
      if (row.options) {
        assert.deepEqual(actual.options, row.options.map((option) => option.value), row.key);
      }
    }
    assert.equal(Object.hasOwn(registry.developerSettings, 'campaignManager.scale'), false);
  });

  it('exposes one generic Custom Pages scope with every registered page', () => {
    assert.deepEqual(Object.keys(registry.customPageScopes), ['all']);
    const section = CUSTOM_PAGE_SECTIONS[0];
    assert.equal(section.id, 'all');
    assert.equal(section.label, 'Custom Pages');
    assert.deepEqual(registry.customPageScopes.all, {
      type: 'bool',
      default: false,
      label: 'Custom Pages',
      managedDefault: true,
      pageIds: section.items.map((item) => item.id),
    });
    assert.deepEqual(registry.customPages, {
      type: 'bool',
      default: true,
      label: 'Custom pages',
      managedDefault: true,
    });
  });
});
