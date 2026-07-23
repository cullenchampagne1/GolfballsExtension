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
    featureFlags: { copyIdsEnabled: false, personalUnknownFlag: true },
    devSettings: { 'numberDisplay.durationMs': 777, 'email.localPart': 'local.user' },
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
      value: rule.default, hidden: false, managed: key !== 'email.localPart',
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
  configuration.developer_settings['numberDisplay.durationMs'] = { value: 400, hidden: true, managed: true };
  configuration.custom_pages.scopes.crm = { value: true, hidden: true, managed: true };

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
    assert.equal(stored.gbRemoteSettingsPolicy.hiddenFeatures.copyIdsEnabled, true);
    assert.equal(stored.gbRemoteSettingsPolicy.hiddenDeveloperSettings['numberDisplay.durationMs'], true);
    assert.equal(stored.gbRemoteSettingsPolicy.hiddenCustomPageScopes.crm, true);
    assert.deepEqual(Array.from(stored.customPages.crm), registry.customPageScopes.crm.pageIds);
    assert.equal(Object.hasOwn(stored, 'secret_settings'), false);
    assert.equal(stored.gbRemoteSettingsBackup.featureFlags.copyIdsEnabled, false);
    assert.ok(alarms.some(({ options }) => options.periodInMinutes === 1));
  });

  it('lets a global custom-pages disable win over individually enabled scopes', async () => {
    configuration.custom_pages.value = false;
    configuration.custom_pages.hidden = true;
    setPayload({ schema_version: 1, admin_bypass: false, revision: 'c'.repeat(64), configuration });
    await context.GBRemoteSettingsPolicy.sync();
    assert.deepEqual(Array.from(stored.customPages.crm), [], 'global custom-pages disable wins over enabled scopes');
    assert.equal(stored.gbRemoteSettingsPolicy.hiddenCustomPages, true);
  });

  it('restores the pre-policy values and drops the backup on admin bypass', async () => {
    setPayload({ schema_version: 1, admin_bypass: true, revision: 'b'.repeat(64), configuration: null });
    await context.GBRemoteSettingsPolicy.sync();
    assert.equal(stored.featureFlags.copyIdsEnabled, false);
    assert.equal(stored.devSettings['numberDisplay.durationMs'], 777, 'admin bypass restores pre-policy values');
    assert.deepEqual(stored.customPages.crm, ['contact_details'], 'admin bypass restores pre-policy scope choices');
    assert.equal(stored.gbRemoteSettingsPolicy.adminBypass, true);
    assert.equal(Object.hasOwn(stored, 'gbRemoteSettingsBackup'), false);
  });
});
