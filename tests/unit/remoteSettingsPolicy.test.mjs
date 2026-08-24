/** Complete remote-policy validation, enforcement, and admin bypass.
 *
 * The three sync phases share one vm context and mutate the same fake storage,
 * so the `it` blocks run in declaration order and build on each other.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);

let context;
let stored;
let registry;
let configuration;
let alarms;
let setPayload;

before(async () => {
  const registrySource = await readFile(new URL('settings-registry.js', root), 'utf8');
  const policySource = await readFile(new URL('lib/remote-settings-policy.js', root), 'utf8');

  stored = {
    featureFlags: {
      copyIdsEnabled: false,
      personalUnknownFlag: true,
      campaignManagerEnabled: false,
      submitProofEnabled: false,
      salesFantasyEnabled: true,
    },
    devSettings: {
      'numberDisplay.durationMs': 777,
      'email.localPart': 'local.user',
      'pageEngine.indexingEnabled': true,
      'pageEngine.territory': '15',
      'campaignManager.scale': 0.75,
    },
    customPages: { crm: ['contact_details'] },
  };
  alarms = [];

  const chrome = {
    runtime: {
      lastError: null,
      onInstalled: { addListener: () => undefined },
      onStartup: { addListener: () => undefined },
    },
    storage: {
      local: {
        get(keys, callback) {
          const list = Array.isArray(keys) ? keys : [keys];
          callback(Object.fromEntries(
            list.filter((key) => Object.hasOwn(stored, key)).map((key) => [key, stored[key]]),
          ));
        },
        set(values, callback) { Object.assign(stored, values); callback?.(); },
        remove(keys, callback) {
          for (const key of (Array.isArray(keys) ? keys : [keys])) delete stored[key];
          callback?.();
        },
      },
      onChanged: { addListener: () => undefined },
    },
    tabs: { query: async () => [], sendMessage: async () => undefined },
    alarms: {
      create: (name, options) => alarms.push({ name, options }),
      onAlarm: { addListener: () => undefined },
    },
  };

  context = vm.createContext({ chrome, console, Object, Promise, Number, String, Error, Date });
  context.globalThis = context;
  new vm.Script(registrySource, { filename: 'settings-registry.js' }).runInContext(context);
  registry = JSON.parse(JSON.stringify(context.GB_SETTINGS_REGISTRY));

  configuration = {
    schema_version: 1,
    refresh_minutes: 1,
    developer_section: { hidden: false },
    features: Object.fromEntries(Object.entries(registry.features).map(([key, rule]) => [key, {
      value: rule.default, hidden: false, managed: true,
    }])),
    developer_settings: Object.fromEntries(Object.entries(registry.developerSettings).map(([key, rule]) => [key, {
      value: rule.default, hidden: false, managed: rule.managedDefault !== false,
    }])),
    custom_pages: {
      value: true,
      hidden: false,
      managed: true,
      scopes: Object.fromEntries(Object.entries(registry.customPageScopes).map(([scope, rule]) => [scope, {
        value: rule.default, hidden: false, managed: true,
      }])),
    },
  };
  configuration.features.copyIdsEnabled = { value: false, hidden: true, managed: true };
  configuration.features.workflowManagerEnabled = { value: true, hidden: false, managed: false };
  configuration.developer_settings['numberDisplay.durationMs'] = { value: 400, hidden: true, managed: true };
  configuration.developer_settings['workflowManager.scale'] = { value: 1.2, hidden: false, managed: false };
  configuration.custom_pages.scopes.all = { value: true, hidden: true, managed: true };

  let payload = { schema_version: 1, admin_bypass: false, revision: 'a'.repeat(64), configuration };
  setPayload = (next) => { payload = next; };
  context.GBInstallationAuth = { fetchConfiguration: async () => payload };
  new vm.Script(policySource, { filename: 'remote-settings-policy.js' }).runInContext(context);
});

describe('remote settings policy', () => {
  it('applies managed values, records hidden state, and never stores secrets', async () => {
    await context.GBRemoteSettingsPolicy.sync();
    assert.equal(stored.featureFlags.copyIdsEnabled, false);
    assert.equal(stored.devSettings['numberDisplay.durationMs'], 400);
    assert.equal(stored.devSettings['email.localPart'], 'local.user', 'unmanaged identity must stay local');
    assert.equal(stored.devSettings['pageEngine.indexingEnabled'], true, 'indexing opt-in must stay local');
    assert.equal(stored.devSettings['pageEngine.territory'], '15', 'index territory must stay local');
    assert.equal(stored.featureFlags.workflowManagerEnabled, false, 'renamed unmanaged flag keeps its local value');
    assert.equal(stored.devSettings['workflowManager.scale'], 0.75, 'renamed unmanaged setting keeps its local value');
    assert.equal(Object.hasOwn(stored.featureFlags, 'campaignManagerEnabled'), false);
    assert.equal(Object.hasOwn(stored.featureFlags, 'submitProofEnabled'), false);
    assert.equal(Object.hasOwn(stored.featureFlags, 'salesFantasyEnabled'), false);
    assert.equal(Object.hasOwn(stored.devSettings, 'campaignManager.scale'), false);
    assert.equal(stored.devSettings['salesFantasy.enabled'], false);
    assert.equal(stored.gbRemoteSettingsPolicy.hiddenFeatures.copyIdsEnabled, true);
    assert.equal(stored.gbRemoteSettingsPolicy.hiddenDeveloperSettings['numberDisplay.durationMs'], true);
    assert.equal(stored.gbRemoteSettingsPolicy.hiddenCustomPageScopes.all, true);
    assert.equal(stored.gbRemoteSettingsPolicy.managedFeatures.copyIdsEnabled, false);
    assert.equal(Object.hasOwn(stored.gbRemoteSettingsPolicy.managedFeatures, 'workflowManagerEnabled'), false);
    assert.equal(stored.gbRemoteSettingsPolicy.managedDeveloperSettings['numberDisplay.durationMs'], 400);
    assert.equal(stored.gbRemoteSettingsPolicy.managedDeveloperSettings['salesFantasy.enabled'], false);
    assert.equal(Object.hasOwn(stored.gbRemoteSettingsPolicy.managedDeveloperSettings, 'workflowManager.scale'), false);
    assert.equal(stored.gbRemoteSettingsPolicy.managedCustomPages, true);
    assert.deepEqual(
      Array.from(stored.gbRemoteSettingsPolicy.managedCustomPageScopes.all),
      registry.customPageScopes.all.pageIds,
    );
    assert.deepEqual(Array.from(stored.customPages.all), registry.customPageScopes.all.pageIds);
    assert.equal(Object.hasOwn(stored.customPages, 'crm'), false);
    assert.equal(Object.hasOwn(stored, 'secret_settings'), false);
    assert.equal(stored.gbRemoteSettingsBackup.featureFlags.copyIdsEnabled, false);
    assert.equal(stored.gbRemoteSettingsBackup.featureFlags.workflowManagerEnabled, false);
    assert.equal(Object.hasOwn(stored.gbRemoteSettingsBackup.featureFlags, 'campaignManagerEnabled'), false);
    assert.equal(Object.hasOwn(stored.gbRemoteSettingsBackup.featureFlags, 'submitProofEnabled'), false);
    assert.equal(Object.hasOwn(stored.gbRemoteSettingsBackup.featureFlags, 'salesFantasyEnabled'), false);
    assert.equal(stored.gbRemoteSettingsBackup.devSettings['salesFantasy.enabled'], true);
    assert.ok(alarms.some(({ options }) => options.periodInMinutes === 1));
  });

  it('lets a global custom-pages disable win over individually enabled scopes', async () => {
    configuration.custom_pages.value = false;
    configuration.custom_pages.hidden = true;
    setPayload({ schema_version: 1, admin_bypass: false, revision: 'c'.repeat(64), configuration });
    await context.GBRemoteSettingsPolicy.sync();
    assert.deepEqual(Array.from(stored.customPages.all), [], 'global custom-pages disable wins over enabled scopes');
    assert.equal(stored.gbRemoteSettingsPolicy.hiddenCustomPages, true);
    assert.equal(stored.gbRemoteSettingsPolicy.managedCustomPages, false);
    assert.deepEqual(Array.from(stored.gbRemoteSettingsPolicy.managedCustomPageScopes.all), []);
  });

  it('clears a stale hidden feature marker on the next effective-policy sync', async () => {
    configuration.features.powerAutomateEnabled.hidden = true;
    setPayload({ schema_version: 1, admin_bypass: false, revision: 'd'.repeat(64), configuration });
    await context.GBRemoteSettingsPolicy.sync();
    assert.equal(stored.gbRemoteSettingsPolicy.hiddenFeatures.powerAutomateEnabled, true);

    configuration.features.powerAutomateEnabled.hidden = false;
    setPayload({ schema_version: 1, admin_bypass: false, revision: 'e'.repeat(64), configuration });
    const response = await context.GBRemoteSettingsPolicy.sync();

    assert.equal(response.revision, 'e'.repeat(64));
    assert.equal(Object.hasOwn(stored.gbRemoteSettingsPolicy.hiddenFeatures, 'powerAutomateEnabled'), false);
  });

  it('ignores newer server-only registry rows instead of retaining a stale policy', async () => {
    configuration.features.powerAutomateEnabled.hidden = false;
    configuration.features.futureServerFeature = {
      value: true, hidden: false, managed: true,
    };
    configuration.developer_settings['futureServer.setting'] = {
      value: 'new', hidden: false, managed: true,
    };
    configuration.custom_pages.scopes.futureServerScope = {
      value: true, hidden: false, managed: true,
    };
    stored.gbRemoteSettingsPolicy.hiddenFeatures = { powerAutomateEnabled: true };
    setPayload({
      schema_version: 1,
      admin_bypass: false,
      revision: 'f'.repeat(64),
      configuration,
    });

    await context.GBRemoteSettingsPolicy.sync();

    assert.equal(stored.gbRemoteSettingsPolicy.revision, 'f'.repeat(64));
    assert.equal(
      Object.hasOwn(stored.gbRemoteSettingsPolicy.hiddenFeatures, 'powerAutomateEnabled'),
      false,
      'a newer server registry must not strand an older hidden marker',
    );
    assert.equal(Object.hasOwn(stored.featureFlags, 'futureServerFeature'), false);
    assert.equal(Object.hasOwn(stored.devSettings, 'futureServer.setting'), false);
    assert.equal(Object.hasOwn(stored.customPages, 'futureServerScope'), false);
  });

  it('restores the pre-policy values and drops the backup on admin bypass', async () => {
    setPayload({ schema_version: 1, admin_bypass: true, revision: 'b'.repeat(64), configuration: null });
    await context.GBRemoteSettingsPolicy.sync();
    assert.equal(stored.featureFlags.copyIdsEnabled, false);
    assert.equal(stored.devSettings['numberDisplay.durationMs'], 777, 'admin bypass restores pre-policy values');
    assert.deepEqual(Array.from(stored.customPages.all), registry.customPageScopes.all.pageIds, 'admin bypass restores the canonical all-pages choice');
    assert.equal(stored.featureFlags.workflowManagerEnabled, false);
    assert.equal(stored.devSettings['workflowManager.scale'], 0.75);
    assert.equal(stored.devSettings['salesFantasy.enabled'], true);
    assert.equal(Object.hasOwn(stored.featureFlags, 'salesFantasyEnabled'), false);
    assert.equal(stored.gbRemoteSettingsPolicy.adminBypass, true);
    assert.deepEqual(Object.keys(stored.gbRemoteSettingsPolicy.managedFeatures), []);
    assert.equal(stored.gbRemoteSettingsPolicy.managedCustomPages, null);
    assert.equal(Object.hasOwn(stored, 'gbRemoteSettingsBackup'), false);
  });
});
