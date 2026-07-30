import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeStoredFlags } from '../../src/lib/flags.js';
import { normalizeStoredDevSettings } from '../../src/lib/devSettings.js';
import {
  CUSTOM_PAGE_SECTIONS,
  normalizeStoredCustomPages,
} from '../../src/lib/customPages.js';
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

describe('settings migration · workflow and Custom Pages namespaces', () => {
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
      'numberDisplay.durationMs': 900,
    });
    assert.equal(migratedDev.settings['workflowManager.scale'], 0.75);
    assert.equal(Object.hasOwn(migratedDev.settings, 'campaignManager.scale'), false);
  });

  it('turns the old CRM page scope into one all-pages setting', () => {
    const { pages, changed } = normalizeStoredCustomPages({
      crm: ['contact_details'],
    });
    assert.equal(changed, true);
    assert.deepEqual(
      pages,
      { all: CUSTOM_PAGE_SECTIONS[0].items.map((item) => item.id) },
    );
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
});
