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
  createChrome, createContext, createFetchMock, jsonResponse, loadScript,
  settle, validInstallation,
} from './helpers/harness.mjs';

const CONFIG_URL = `${API_ORIGIN}/extension/configuration`;

let context;
let stored;
let alarms;
let requests;
let registry;
let payloadHolder; // what the mocked /extension/configuration currently serves

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
    custom_pages: {
      value: true, hidden: false, managed: true,
      scopes: section(reg.customPageScopes),
    },
  };
}

before(async () => {
  stored = {
    gbApiInstallation: validInstallation(),
    featureFlags: { copyIdsEnabled: true, personalUnknownFlag: true },
    devSettings: { 'numberDisplay.durationMs': 777, 'email.localPart': 'local.user' },
    customPages: { crm: ['contact_details'] },
    secret_settings: { legacy: true },
  };
  const chromeParts = createChrome({ stored });
  alarms = chromeParts.alarms;
  const mock = createFetchMock((url) => {
    if (url === CONFIG_URL) return jsonResponse(payloadHolder);
    return undefined;
  });
  requests = mock.requests;

  context = createContext({ chrome: chromeParts.chrome, fetchImpl: mock.fetchMock });
  loadScript(context, 'installation-auth.js');
  loadScript(context, 'settings-registry.js');
  registry = JSON.parse(JSON.stringify(context.GB_SETTINGS_REGISTRY));

  const configuration = buildConfiguration(registry);
  configuration.features.copyIdsEnabled = { value: false, hidden: true, managed: true };
  configuration.developer_settings['numberDisplay.durationMs'] = { value: 400, hidden: true, managed: true };
  configuration.custom_pages.scopes.crm = { value: true, hidden: true, managed: true };
  payloadHolder = {
    schema_version: 1, admin_bypass: false, revision: 'a'.repeat(64), configuration,
  };

  loadScript(context, 'remote-settings-policy.js'); // fires its own quiet sync
  await settle();
});

describe('remote policy sync', () => {
  it('fetches /extension/configuration with the installation Bearer key and dashboard cookies', async () => {
    await context.GBRemoteSettingsPolicy.sync();
    const configRequests = requests.filter(({ url }) => url === CONFIG_URL);
    assert.ok(configRequests.length >= 1);
    const request = configRequests.at(-1);
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

    const policy = stored.gbRemoteSettingsPolicy;
    assert.equal(policy.adminBypass, false);
    assert.equal(policy.revision, 'a'.repeat(64));
    assert.equal(policy.hiddenFeatures.copyIdsEnabled, true);
    assert.equal(policy.hiddenDeveloperSettings['numberDisplay.durationMs'], true);
    assert.equal(policy.hiddenCustomPageScopes.crm, true);
    assert.deepEqual(
      Array.from(stored.customPages.crm),
      registry.customPageScopes.crm.pageIds,
      'a managed-on scope enables the full page list',
    );
    assert.equal(Object.hasOwn(stored, 'secret_settings'), false, 'the legacy key is purged');
    assert.ok(alarms.some(({ name, options }) => name === 'gbRemoteSettingsSync' && options.periodInMinutes === 1));
  });

  it('backs up pre-policy values under gbRemoteSettingsBackup', () => {
    const backup = stored.gbRemoteSettingsBackup;
    assert.equal(backup.version, 1);
    assert.equal(backup.hadFeatureFlags, true);
    assert.equal(backup.featureFlags.copyIdsEnabled, true, 'the backup keeps the user value, not the policy value');
    assert.equal(backup.devSettings['numberDisplay.durationMs'], 777);
    assert.deepEqual(Array.from(backup.customPages.crm), ['contact_details']);
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
    assert.deepEqual(Array.from(stored.customPages.crm), ['contact_details']);
    assert.equal(stored.gbRemoteSettingsPolicy.adminBypass, true);
    assert.equal(stored.gbRemoteSettingsPolicy.revision, 'b'.repeat(64));
    assert.equal(Object.hasOwn(stored, 'gbRemoteSettingsBackup'), false, 'the backup is consumed');
  });
});
