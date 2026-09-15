import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeStoredFlags } from '../../src/lib/flags.js';
import {
  loadDevSettings,
  normalizeStoredDevSettings,
  SALES_FANTASY_SETTING_KEY,
} from '../../src/lib/devSettings.js';
import {
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  loadWorkflows,
  saveWorkflow,
} from '../../src/lib/workflow/store.js';

const originalChrome = globalThis.chrome;

afterEach(() => {
  if (originalChrome === undefined) delete globalThis.chrome;
  else globalThis.chrome = originalChrome;
});

function installStorage(initial) {
  const stored = structuredClone(initial);
  globalThis.chrome = {
    storage: {
      local: {
        get(keys, callback) {
          const list = Array.isArray(keys) ? keys : [keys];
          callback(Object.fromEntries(
            list
              .filter((key) => Object.hasOwn(stored, key))
              .map((key) => [key, structuredClone(stored[key])]),
          ));
        },
        set(values, callback) {
          Object.assign(stored, structuredClone(values));
          callback?.();
        },
        remove(keys, callback) {
          for (const key of (Array.isArray(keys) ? keys : [keys])) delete stored[key];
          callback?.();
        },
      },
      onChanged: {
        addListener() {},
        removeListener() {},
      },
    },
  };
  return stored;
}

describe('settings migration · workflow namespace', () => {
  it('moves legacy workflow flag and scale values without overriding canonical values', () => {
    const migratedFlags = normalizeStoredFlags({
      campaignManagerEnabled: false,
      submitProofEnabled: false,
      copyIdsEnabled: true,
    });
    assert.equal(migratedFlags.flags.workflowManagerEnabled, false);
    assert.equal(Object.hasOwn(migratedFlags.flags, 'campaignManagerEnabled'), false);
    assert.equal(Object.hasOwn(migratedFlags.flags, 'submitProofEnabled'), false);
    assert.equal(migratedFlags.changed, true);

    const canonicalWins = normalizeStoredFlags({
      workflowManagerEnabled: true,
      campaignManagerEnabled: false,
    });
    assert.equal(canonicalWins.flags.workflowManagerEnabled, true);
    assert.equal(Object.hasOwn(canonicalWins.flags, 'campaignManagerEnabled'), false);

    const migratedDev = normalizeStoredDevSettings({
      'campaignManager.scale': 0.75,
      'pageEngine.accountId': '77',
      'numberDisplay.durationMs': 900,
    });
    assert.equal(migratedDev.settings['workflowManager.scale'], 0.75);
    assert.equal(Object.hasOwn(migratedDev.settings, 'campaignManager.scale'), false);
    assert.equal(Object.hasOwn(migratedDev.settings, 'pageEngine.accountId'), false);
    assert.equal(Object.hasOwn(migratedDev.settings, 'pageEngine.territory'), false,
      'an owner ID cannot be guessed into the unrelated Territory namespace');
  });

  it('moves the Sales Fantasy feature value into developer settings', async () => {
    const stored = installStorage({
      featureFlags: {
        copyIdsEnabled: false,
        salesFantasyEnabled: true,
      },
      devSettings: {
        'numberDisplay.durationMs': 900,
      },
    });

    const settings = await loadDevSettings();

    assert.equal(settings[SALES_FANTASY_SETTING_KEY], true);
    assert.equal(stored.devSettings[SALES_FANTASY_SETTING_KEY], true);
    assert.equal(stored.devSettings['numberDisplay.durationMs'], 900);
    assert.equal(stored.featureFlags.copyIdsEnabled, false);
    assert.equal(Object.hasOwn(stored.featureFlags, 'salesFantasyEnabled'), false);
  });

  it('keeps the canonical Sales Fantasy developer value during migration', async () => {
    const stored = installStorage({
      featureFlags: { salesFantasyEnabled: true },
      devSettings: { [SALES_FANTASY_SETTING_KEY]: false },
    });

    const settings = await loadDevSettings();

    assert.equal(settings[SALES_FANTASY_SETTING_KEY], false);
    assert.equal(stored.devSettings[SALES_FANTASY_SETTING_KEY], false);
    assert.equal(Object.hasOwn(stored.featureFlags, 'salesFantasyEnabled'), false);
  });

  it('moves saved records to workflows and never writes the legacy storage key again', async () => {
    const stored = installStorage({
      [LEGACY_STORAGE_KEY]: [{
        id: 'legacy-1',
        name: 'Account pass',
        status: 'Active',
        automation: 'return "done";',
      }],
    });

    const workflows = await loadWorkflows();
    assert.equal(workflows.length, 1);
    assert.equal(workflows[0].name, 'Account pass');
    assert.deepEqual(stored[STORAGE_KEY], workflows);
    assert.equal(Object.hasOwn(stored, LEGACY_STORAGE_KEY), false);

    await saveWorkflow({ ...workflows[0], name: 'Updated account pass' });
    assert.equal(stored[STORAGE_KEY][0].name, 'Updated account pass');
    assert.equal(Object.hasOwn(stored, LEGACY_STORAGE_KEY), false);
  });

  it('rejects direct local workflow saves when management disables local usage', async () => {
    const stored = installStorage({
      devSettings: { 'workflows.allowLocalUsage': false },
      [STORAGE_KEY]: [],
    });

    await assert.rejects(
      saveWorkflow({
        id: 'private-draft',
        name: 'Private draft',
        status: 'Draft',
        automation: 'return "done";',
      }),
      /Local workflow usage is disabled/,
    );
    assert.deepEqual(stored[STORAGE_KEY], []);
  });

  it('does not let a direct write alter a locked managed workflow mirror', async () => {
    const managed = {
      id: 'managed-row',
      name: 'Approved workflow',
      status: 'Active',
      automation: 'return "approved";',
      managedWorkflow: {
        kind: 'revstack-managed-workflow',
        bucketId: 'A'.repeat(32),
        editable: false,
      },
    };
    const stored = installStorage({
      devSettings: { 'workflows.allowLocalUsage': false },
      [STORAGE_KEY]: [managed],
    });

    await assert.rejects(
      saveWorkflow({ ...managed, automation: 'return "changed";' }),
      /Local workflow usage is disabled/,
    );
    assert.equal(stored[STORAGE_KEY][0].automation, 'return "approved";');
  });
});
