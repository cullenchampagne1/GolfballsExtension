import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  customPageScopeIsManaged,
  developerSettingIsManaged,
  enforceManagedStorageValue,
  enforceManagedStorageWrites,
  featureIsManaged,
  normalizeRemotePolicy,
} from '../../src/lib/managedSettingsPolicy.js';

const policy = normalizeRemotePolicy({
  schemaVersion: 1,
  adminBypass: false,
  managedFeatures: { copyIdsEnabled: false },
  managedDeveloperSettings: {
    'numberDisplay.durationMs': 400,
    'workflowManager.scale': 1.2,
  },
  managedCustomPages: true,
  managedCustomPageScopes: { all: ['dashboard', 'search'] },
});

describe('managed settings policy', () => {
  it('uses map membership as the lock state even when the managed value is false', () => {
    assert.equal(featureIsManaged(policy, 'copyIdsEnabled'), true);
    assert.equal(featureIsManaged(policy, 'workflowManagerEnabled'), false);
    assert.equal(developerSettingIsManaged(policy, 'numberDisplay.durationMs'), true);
    assert.equal(customPageScopeIsManaged(policy, 'all'), true);
  });

  it('preserves authoritative switch, input, dropdown, and page values on writes', () => {
    assert.deepEqual(
      enforceManagedStorageValue('featureFlags', {
        copyIdsEnabled: true,
        workflowManagerEnabled: false,
      }, policy),
      { copyIdsEnabled: false, workflowManagerEnabled: false },
    );
    assert.deepEqual(
      enforceManagedStorageValue('devSettings', {
        'numberDisplay.durationMs': 999,
        'workflowManager.scale': 0.5,
        'email.localPart': 'local.user',
      }, policy),
      {
        'numberDisplay.durationMs': 400,
        'workflowManager.scale': 1.2,
        'email.localPart': 'local.user',
      },
    );
    assert.deepEqual(
      enforceManagedStorageValue('customPages', { all: [] }, policy),
      { all: ['dashboard', 'search'] },
    );
  });

  it('guards legacy settings-file batch imports before they reach storage', () => {
    const writes = enforceManagedStorageWrites({
      featureFlags: { copyIdsEnabled: true },
      devSettings: { 'numberDisplay.durationMs': 5 },
      customPages: { all: [] },
      keyboardShortcuts: { taskList: 'z' },
    }, policy);
    assert.equal(writes.featureFlags.copyIdsEnabled, false);
    assert.equal(writes.devSettings['numberDisplay.durationMs'], 400);
    assert.deepEqual(writes.customPages.all, ['dashboard', 'search']);
    assert.deepEqual(writes.keyboardShortcuts, { taskList: 'z' });
  });

  it('lets a managed global custom-pages Off lock every current and legacy scope', () => {
    const globalOff = { ...policy, managedCustomPages: false };
    assert.deepEqual(
      enforceManagedStorageValue('customPages', {
        all: ['dashboard'],
        crm: ['contact_details'],
      }, globalOff),
      { all: [], crm: [] },
    );
  });

  it('does not lock local values during administrator bypass', () => {
    const bypass = { ...policy, adminBypass: true };
    assert.equal(featureIsManaged(bypass, 'copyIdsEnabled'), false);
    assert.deepEqual(
      enforceManagedStorageValue('featureFlags', { copyIdsEnabled: true }, bypass),
      { copyIdsEnabled: true },
    );
  });
});
