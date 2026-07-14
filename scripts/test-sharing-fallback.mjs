/** Offline sharing regression tests: schema-validated, versioned files only. */
import assert from 'node:assert/strict';
import {
  buildSettingsTemplateFile,
  gatherScopes,
  parseSettingsTemplateFile,
  PRESET_SCOPES,
} from '../src/lib/presetScopes.js';
import {
  buildEmailTemplateFile,
  parseEmailTemplateFile,
} from '../src/lib/templateImport.js';

const settings = buildSettingsTemplateFile('Sales setup', {
  settings: {
    featureFlags: {
      powerAutomateEnabled: true,
      powerAutomateUrl: 'https://secret.invalid/never-export',
    },
  },
  unknownScope: { unsafe: true },
});
assert.deepEqual(Object.keys(settings.scopes), ['settings-preferences']);
assert.equal(settings.scopes['settings-preferences'].featureFlags.powerAutomateUrl, undefined);
const parsedSettings = parseSettingsTemplateFile(JSON.stringify(settings));
assert.equal(parsedSettings.transport, 'json');
assert.deepEqual(Object.keys(parsedSettings.scopes), ['settings-preferences']);
assert.throws(
  () => parseSettingsTemplateFile(JSON.stringify({ ...settings, kind: 'unknown' })),
  /not a supported Golfballs settings template/,
);

const largeBody = 'x'.repeat(700_000);
const migratedState = parseSettingsTemplateFile(JSON.stringify({
  kind: 'golfballs-extension-state',
  version: 1,
  exportedAt: '2026-07-14T00:00:00.000Z',
  data: {
    gbApiInstallation: { apiKey: 'must-not-import' },
    templates: [{ id: 'large-template', type: 'order', name: 'Large', body: largeBody }],
    templateFolders: [],
  },
}));
assert.equal(migratedState.scopes['tpl-order'].templates[0].body.length, 700_000);
assert.equal(JSON.stringify(migratedState).includes('must-not-import'), false);

const expectedConfigurationKeys = [
  'featureFlags', 'devSettings', 'keyboardShortcuts', 'customPages',
  'themeColors', 'gbTheme', 'uiScales', 'emailSignature',
];
const configurationScopes = PRESET_SCOPES.filter((scope) => scope.category === 'Configuration');
assert.deepEqual(
  [...new Set(configurationScopes.flatMap((scope) => scope.keys))].sort(),
  expectedConfigurationKeys.sort(),
);
assert.equal(PRESET_SCOPES.every((scope) => typeof scope.category === 'string' && scope.category), true);

const storageState = Object.fromEntries(expectedConfigurationKeys.map((key) => [key, { saved: key }]));
storageState.featureFlags = { taskListEnabled: true, powerAutomateUrl: 'must-not-export' };
globalThis.chrome = {
  storage: {
    local: {
      get(keys, callback) {
        callback(Object.fromEntries(keys.filter((key) => key in storageState).map((key) => [key, storageState[key]])));
      },
      set(_value, callback) { callback?.(); },
    },
  },
};
const completeConfiguration = await gatherScopes(configurationScopes.map((scope) => scope.id));
const exportedConfigurationKeys = Object.values(completeConfiguration).flatMap((bag) => Object.keys(bag));
assert.deepEqual([...new Set(exportedConfigurationKeys)].sort(), expectedConfigurationKeys.sort());
assert.equal(JSON.stringify(completeConfiguration).includes('must-not-export'), false);

const legacySettings = parseSettingsTemplateFile(JSON.stringify({
  ...settings,
  scopes: {
    settings: {
      featureFlags: { taskListEnabled: true },
      gbTheme: { variant: 'dark' },
      uiScales: { modals: 0.9 },
      emailSignature: '<p>Legacy</p>',
    },
  },
}));
assert.deepEqual(Object.keys(legacySettings.scopes).sort(), [
  'settings-appearance', 'settings-email', 'settings-preferences',
]);

const email = buildEmailTemplateFile({
  id: 'local-id-must-not-survive',
  folderId: 'local-folder-must-not-survive',
  type: 'order',
  name: 'Order follow-up',
  subject: 'Hello',
  body: '<p>Thanks</p>',
});
assert.equal(email.template.id === 'local-id-must-not-survive', false);
assert.equal(email.template.folderId, undefined);
const parsedEmail = parseEmailTemplateFile(JSON.stringify(email));
assert.equal(parsedEmail.name, 'Order follow-up');
assert.equal(parsedEmail.body, '<p>Thanks</p>');
assert.throws(
  () => parseEmailTemplateFile(JSON.stringify({ name: 'Legacy', body: 'Hi' })),
  /not a versioned Golfballs email template file/,
);
assert.throws(
  () => parseEmailTemplateFile(JSON.stringify({ ...email, schemaVersion: 2 })),
  /version is not supported/,
);
assert.throws(() => parseEmailTemplateFile('{bad json'), /Not valid JSON/);

console.log('sharing fallback tests passed');
