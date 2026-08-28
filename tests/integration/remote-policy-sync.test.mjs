/**
 * Integration flow — remote settings policy sync.
 *
 * Real remote-settings-policy.js wired to the REAL installation-auth.js
 * (GBInstallationAuth.fetchConfiguration does the authenticated fetch) and the
 * real settings-registry.js, in one vm context. Only chrome.* and fetch are
 * mocked. A managed configuration envelope must apply values, record hidden
 * keys under gbRemoteSettingsPolicy, and back up pre-policy state under
 * gbRemoteSettingsBackup; a later admin_bypass envelope must restore it all.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_KEY, API_ORIGIN,
  createChrome, createContext, createFetchMock, jsonResponse, loadBackground, loadScript,
  settle, validInstallation,
} from './helpers/harness.mjs';

const CONFIG_PATH = `${API_ORIGIN}/projects/golfballs-extension/client/configuration`;

let context;
let stored;
let alarms;
let requests;
let registry;
let payloadHolder; // what the mocked project configuration endpoint serves

function buildConfiguration(reg) {
  const section = (rules, managedFor = () => true) => Object.fromEntries(
    Object.entries(rules).map(([key, rule]) => [key, {
      value: rule.default, hidden: false, managed: managedFor(key),
    }]),
  );
  return {
    schema_version: reg.schemaVersion,
    refresh_minutes: 1,
    developer_section: { hidden: false },
    features: section(reg.features),
    developer_settings: section(reg.developerSettings, (key) => key !== 'email.localPart'),
  };
}

before(async () => {
  stored = {
    gbApiInstallation: validInstallation(),
    featureFlags: {
      copyIdsEnabled: true,
      personalUnknownFlag: true,
      campaignManagerEnabled: false,
      submitProofEnabled: false,
    },
    devSettings: {
      'numberDisplay.durationMs': 777,
      'email.localPart': 'local.user',
      'campaignManager.scale': 0.75,
    },
    secret_settings: { legacy: true },
  };
  const chromeParts = createChrome({ stored });
  alarms = chromeParts.alarms;
  const mock = createFetchMock((url) => {
    if (url.startsWith(`${CONFIG_PATH}?`)) return jsonResponse(payloadHolder);
    return undefined;
  });
  requests = mock.requests;

  context = createContext({ chrome: chromeParts.chrome, fetchImpl: mock.fetchMock });
  loadScript(context, 'lib/installation-auth.js');
  loadScript(context, 'settings-registry.js');
  registry = JSON.parse(JSON.stringify(context.GB_SETTINGS_REGISTRY));

  const configuration = buildConfiguration(registry);
  configuration.features.copyIdsEnabled = { value: false, hidden: true, managed: true };
  configuration.features.workflowManagerEnabled = { value: true, hidden: false, managed: false };
  configuration.developer_settings['numberDisplay.durationMs'] = { value: 400, hidden: true, managed: true };
  configuration.developer_settings['workflowManager.scale'] = { value: 1.2, hidden: false, managed: false };
  payloadHolder = {
    schema_version: 1, admin_bypass: false, revision: 'a'.repeat(64), configuration,
  };

  loadScript(context, 'lib/remote-settings-policy.js'); // fires its own quiet sync
  await settle();
});

describe('remote policy sync', () => {
  it('fetches project configuration with the installation Bearer key and dashboard cookies', async () => {
    await context.GBRemoteSettingsPolicy.sync();
    const configRequests = requests.filter(({ url }) => url.startsWith(`${CONFIG_PATH}?`));
    assert.ok(configRequests.length >= 1);
    const request = configRequests.at(-1);
    assert.equal(
      new URL(request.url).searchParams.get('extension_version'),
      context.chrome.runtime.getManifest().version,
    );
    assert.equal(request.method, 'GET');
    assert.equal(request.options.headers.Authorization, `Bearer ${API_KEY}`);
    assert.equal(request.options.credentials, 'include', 'admin bypass needs the dashboard cookie');
    assert.equal(request.options.cache, 'no-store');
  });

  it('applies managed values and stores hidden keys under gbRemoteSettingsPolicy', async () => {
    await context.GBRemoteSettingsPolicy.sync();

    assert.equal(stored.featureFlags.copyIdsEnabled, false, 'managed feature value is enforced');
    assert.equal(stored.featureFlags.personalUnknownFlag, true, 'unmanaged local flags survive');
    assert.equal(stored.devSettings['numberDisplay.durationMs'], 400);
    assert.equal(stored.devSettings['email.localPart'], 'local.user', 'unmanaged identity stays local');
    assert.equal(stored.featureFlags.workflowManagerEnabled, false, 'legacy local workflow flag is retained');
    assert.equal(stored.devSettings['workflowManager.scale'], 0.75, 'legacy local workflow scale is retained');
    assert.equal(Object.hasOwn(stored.featureFlags, 'campaignManagerEnabled'), false);
    assert.equal(Object.hasOwn(stored.featureFlags, 'submitProofEnabled'), false);
    assert.equal(Object.hasOwn(stored.devSettings, 'campaignManager.scale'), false);

    const policy = stored.gbRemoteSettingsPolicy;
    assert.equal(policy.adminBypass, false);
    assert.equal(policy.revision, 'a'.repeat(64));
    assert.equal(policy.hiddenFeatures.copyIdsEnabled, true);
    assert.equal(policy.hiddenDeveloperSettings['numberDisplay.durationMs'], true);
    assert.equal(policy.managedFeatures.copyIdsEnabled, false);
    assert.equal(Object.hasOwn(policy.managedFeatures, 'workflowManagerEnabled'), false);
    assert.equal(policy.managedDeveloperSettings['numberDisplay.durationMs'], 400);
    assert.equal(Object.hasOwn(policy.managedDeveloperSettings, 'workflowManager.scale'), false);
    assert.equal(Object.hasOwn(stored, 'secret_settings'), false, 'the legacy key is purged');
    assert.ok(alarms.some(({ name, options }) => name === 'gbRemoteSettingsSync' && options.periodInMinutes === 1));
  });

  it('backs up pre-policy values under gbRemoteSettingsBackup', () => {
    const backup = stored.gbRemoteSettingsBackup;
    assert.equal(backup.version, 1);
    assert.equal(backup.hadFeatureFlags, true);
    assert.equal(backup.featureFlags.copyIdsEnabled, true, 'the backup keeps the user value, not the policy value');
    assert.equal(backup.featureFlags.workflowManagerEnabled, false);
    assert.equal(Object.hasOwn(backup.featureFlags, 'campaignManagerEnabled'), false);
    assert.equal(backup.devSettings['numberDisplay.durationMs'], 777);
    assert.equal(backup.devSettings['workflowManager.scale'], 0.75);
  });

  it('refreshes the effective installation policy when Settings requests it', async () => {
    let configurationAvailable = false;
    const freshConfiguration = buildConfiguration(registry);
    freshConfiguration.features.powerAutomateEnabled = {
      value: false, hidden: false, managed: true,
    };
    const liveStored = {
      gbApiInstallation: validInstallation(),
      featureFlags: { powerAutomateEnabled: false },
      gbRemoteSettingsPolicy: {
        schemaVersion: 1,
        adminBypass: false,
        revision: '1'.repeat(64),
        appliedAt: 1,
        hiddenFeatures: { powerAutomateEnabled: true },
        hiddenDeveloperSettings: {},
        developerSectionHidden: false,
        managedFeatures: { powerAutomateEnabled: false },
        managedDeveloperSettings: {},
      },
    };
    const background = await loadBackground({
      stored: liveStored,
      fetchImpl: async (url) => {
        if (String(url).startsWith(`${CONFIG_PATH}?`)) {
          if (!configurationAvailable) return jsonResponse({ detail: 'temporarily unavailable' }, 503);
          return jsonResponse({
            schema_version: 1,
            admin_bypass: false,
            revision: '2'.repeat(64),
            configuration: freshConfiguration,
          });
        }
        return jsonResponse({ detail: 'not found' }, 404);
      },
    });
    assert.equal(liveStored.gbRemoteSettingsPolicy.hiddenFeatures.powerAutomateEnabled, true);

    configurationAvailable = true;
    const response = await background.sendMessage({ action: 'gbSyncRemoteSettingsPolicy' });

    assert.equal(response.ok, true);
    assert.equal(response.revision, '2'.repeat(64));
    assert.equal(
      Object.hasOwn(liveStored.gbRemoteSettingsPolicy.hiddenFeatures, 'powerAutomateEnabled'),
      false,
    );
  });

  it('rejects an invalid envelope without touching applied state', async () => {
    const applied = JSON.stringify(stored.gbRemoteSettingsPolicy);
    payloadHolder = { schema_version: 1, admin_bypass: false, revision: 'not-a-sha', configuration: null };
    await assert.rejects(context.GBRemoteSettingsPolicy.sync(), /Configuration envelope is invalid/);
    assert.equal(JSON.stringify(stored.gbRemoteSettingsPolicy), applied);
  });

  it('restores the backup when the server grants admin_bypass', async () => {
    payloadHolder = { schema_version: 1, admin_bypass: true, revision: 'b'.repeat(64), configuration: null };
    const result = await context.GBRemoteSettingsPolicy.sync();

    assert.equal(result.adminBypass, true);
    assert.equal(stored.devSettings['numberDisplay.durationMs'], 777, 'admin bypass restores pre-policy values');
    assert.equal(stored.featureFlags.copyIdsEnabled, true);
    assert.equal(stored.featureFlags.workflowManagerEnabled, false);
    assert.equal(stored.devSettings['workflowManager.scale'], 0.75);
    assert.equal(stored.gbRemoteSettingsPolicy.adminBypass, true);
    assert.equal(stored.gbRemoteSettingsPolicy.revision, 'b'.repeat(64));
    assert.deepEqual(Object.keys(stored.gbRemoteSettingsPolicy.managedFeatures), []);
    assert.equal(Object.hasOwn(stored, 'gbRemoteSettingsBackup'), false, 'the backup is consumed');
  });
});
