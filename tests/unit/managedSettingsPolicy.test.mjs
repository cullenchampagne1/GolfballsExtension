import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  developerSettingIsManaged,
  enforceManagedStorageValue,
  enforceManagedStorageWrites,
  featureIsManaged,
  normalizeRemotePolicy,
} from '../../src/lib/managedSettingsPolicy.js';
import {
  REMOTE_POLICY_SYNC_ACTION,
  requestRemoteSettingsPolicySync,
} from '../../src/lib/remoteSettingsPolicy.js';

const policy = normalizeRemotePolicy({
  schemaVersion: 1,
  adminBypass: false,
  managedFeatures: { copyIdsEnabled: false },
  managedDeveloperSettings: {
    'numberDisplay.durationMs': 400,
    'workflowManager.scale': 1.2,
  },
});

describe('managed settings policy', () => {
  it('requests an immediate effective-policy refresh from the worker', async () => {
    const previousChrome = globalThis.chrome;
    let message;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage(input, callback) {
          message = input;
          callback({ ok: true, revision: 'f'.repeat(64) });
        },
      },
    };
    try {
      const response = await requestRemoteSettingsPolicySync();
      assert.deepEqual(message, { action: REMOTE_POLICY_SYNC_ACTION });
      assert.equal(response.ok, true);
      assert.equal(response.revision, 'f'.repeat(64));
    } finally {
      if (previousChrome === undefined) delete globalThis.chrome;
      else globalThis.chrome = previousChrome;
    }
  });

  it('uses map membership as the lock state even when the managed value is false', () => {
    assert.equal(featureIsManaged(policy, 'copyIdsEnabled'), true);
    assert.equal(featureIsManaged(policy, 'workflowManagerEnabled'), false);
    assert.equal(developerSettingIsManaged(policy, 'numberDisplay.durationMs'), true);
  });

  it('preserves authoritative switch, input, and dropdown values on writes', () => {
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
  });

  it('guards legacy settings-file batch imports before they reach storage', () => {
    const writes = enforceManagedStorageWrites({
      featureFlags: { copyIdsEnabled: true },
      devSettings: { 'numberDisplay.durationMs': 5 },
      keyboardShortcuts: { taskList: 'z' },
    }, policy);
    assert.equal(writes.featureFlags.copyIdsEnabled, false);
    assert.equal(writes.devSettings['numberDisplay.durationMs'], 400);
    assert.deepEqual(writes.keyboardShortcuts, { taskList: 'z' });
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
