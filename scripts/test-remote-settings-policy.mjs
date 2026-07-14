/** Regression tests for complete policy validation, enforcement, and bypass. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const registrySource = await readFile(new URL('settings-registry.js', root), 'utf8');
const policySource = await readFile(new URL('remote-settings-policy.js', root), 'utf8');
const stored = {
  featureFlags: { copyIdsEnabled: false, personalUnknownFlag: true },
  devSettings: { 'numberDisplay.durationMs': 777, 'email.localPart': 'local.user' },
  customPages: { crm: ['contact_details'] },
};
const changes = [];
const alarms = [];
const installed = [];
const started = [];

const chrome = {
  runtime: {
    lastError: null,
    onInstalled: { addListener: (fn) => installed.push(fn) },
    onStartup: { addListener: (fn) => started.push(fn) },
  },
  storage: {
    local: {
      get(keys, callback) {
        const list = Array.isArray(keys) ? keys : [keys];
        callback(Object.fromEntries(list.filter((key) => Object.hasOwn(stored, key)).map((key) => [key, stored[key]])));
      },
      set(values, callback) { Object.assign(stored, values); callback?.(); },
      remove(keys, callback) {
        for (const key of (Array.isArray(keys) ? keys : [keys])) delete stored[key];
        callback?.();
      },
    },
    onChanged: { addListener: (fn) => changes.push(fn) },
  },
  tabs: {
    query: async () => [],
    sendMessage: async () => undefined,
  },
  alarms: {
    create: (name, options) => alarms.push({ name, options }),
    onAlarm: { addListener: () => undefined },
  },
};

let payload;
const context = vm.createContext({ chrome, console, Object, Promise, Number, String, Error, Date });
context.globalThis = context;
new vm.Script(registrySource, { filename: 'settings-registry.js' }).runInContext(context);
const registry = JSON.parse(JSON.stringify(context.GB_SETTINGS_REGISTRY));
const configuration = {
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
payload = {
  schema_version: 1, admin_bypass: false, revision: 'a'.repeat(64), configuration,
};
context.GBInstallationAuth = { fetchConfiguration: async () => payload };
new vm.Script(policySource, { filename: 'remote-settings-policy.js' }).runInContext(context);
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

configuration.custom_pages.value = false;
configuration.custom_pages.hidden = true;
payload = {
  schema_version: 1, admin_bypass: false, revision: 'c'.repeat(64), configuration,
};
await context.GBRemoteSettingsPolicy.sync();
assert.deepEqual(Array.from(stored.customPages.crm), [], 'global custom-pages disable wins over enabled scopes');
assert.equal(stored.gbRemoteSettingsPolicy.hiddenCustomPages, true);

payload = {
  schema_version: 1, admin_bypass: true, revision: 'b'.repeat(64), configuration: null,
};
await context.GBRemoteSettingsPolicy.sync();
assert.equal(stored.featureFlags.copyIdsEnabled, false);
assert.equal(stored.devSettings['numberDisplay.durationMs'], 777, 'admin bypass restores pre-policy values');
assert.deepEqual(stored.customPages.crm, ['contact_details'], 'admin bypass restores pre-policy scope choices');
assert.equal(stored.gbRemoteSettingsPolicy.adminBypass, true);
assert.equal(Object.hasOwn(stored, 'gbRemoteSettingsBackup'), false);
assert.ok(alarms.some(({ options }) => options.periodInMinutes === 1));

console.log('remote settings policy tests passed');
