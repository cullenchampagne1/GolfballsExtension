/** Offline sharing: schema-validated, versioned template files only. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSettingsTemplateFile,
  gatherScopes,
  parseSettingsTemplateFile,
  PRESET_SCOPES,
} from '../../src/lib/presetScopes.js';
import {
  buildEmailTemplateFile,
  parseEmailTemplateFile,
} from '../../src/lib/templateImport.js';

const settingsFile = () => buildSettingsTemplateFile('Sales setup', {
  settings: {
    featureFlags: {
      powerAutomateEnabled: true,
      powerAutomateUrl: 'https://secret.invalid/never-export',
    },
  },
  unknownScope: { unsafe: true },
});

const EXPECTED_CONFIGURATION_KEYS = [
  'featureFlags', 'devSettings', 'keyboardShortcuts', 'customPages',
  'themeColors', 'gbTheme', 'uiScales', 'emailSignature',
];

describe('sharing fallback · settings templates', () => {
  it('exports only known scopes and drops the Power Automate secret', () => {
    const settings = settingsFile();
    assert.deepEqual(Object.keys(settings.scopes), ['settings-preferences']);
    assert.equal(settings.scopes['settings-preferences'].featureFlags.powerAutomateUrl, undefined);
  });

  it('round-trips a built settings file as json', () => {
    const parsed = parseSettingsTemplateFile(JSON.stringify(settingsFile()));
    assert.equal(parsed.transport, 'json');
    assert.deepEqual(Object.keys(parsed.scopes), ['settings-preferences']);
  });

  it('rejects a file whose kind is not a Golfballs settings template', () => {
    assert.throws(
      () => parseSettingsTemplateFile(JSON.stringify({ ...settingsFile(), kind: 'unknown' })),
      /not a supported Golfballs settings template/,
    );
  });

  it('migrates legacy exported state, keeping large bodies and dropping credentials', () => {
    const largeBody = 'x'.repeat(700_000);
    const migrated = parseSettingsTemplateFile(JSON.stringify({
      kind: 'golfballs-extension-state',
      version: 1,
      exportedAt: '2026-07-14T00:00:00.000Z',
      data: {
        gbApiInstallation: { apiKey: 'must-not-import' },
        templates: [{ id: 'large-template', type: 'order', name: 'Large', body: largeBody }],
        templateFolders: [],
      },
    }));
    assert.equal(migrated.scopes['tpl-order'].templates[0].body.length, 700_000);
    assert.equal(JSON.stringify(migrated).includes('must-not-import'), false);
  });

  it('splits a legacy single "settings" scope into the modern scopes', () => {
    const legacy = parseSettingsTemplateFile(JSON.stringify({
      ...settingsFile(),
      scopes: {
        settings: {
          featureFlags: { taskListEnabled: true },
          gbTheme: { variant: 'dark' },
          uiScales: { modals: 0.9 },
          emailSignature: '<p>Legacy</p>',
        },
      },
    }));
    assert.deepEqual(Object.keys(legacy.scopes).sort(), [
      'settings-appearance', 'settings-email', 'settings-preferences',
    ]);
  });
});

describe('sharing fallback · preset scopes', () => {
  it('covers every configuration key exactly once and categorises each scope', () => {
    const configurationScopes = PRESET_SCOPES.filter((scope) => scope.category === 'Configuration');
    assert.deepEqual(
      [...new Set(configurationScopes.flatMap((scope) => scope.keys))].sort(),
      [...EXPECTED_CONFIGURATION_KEYS].sort(),
    );
    assert.equal(PRESET_SCOPES.every((scope) => typeof scope.category === 'string' && scope.category), true);
  });

  it('gathers every configuration key from storage without exporting secrets', async () => {
    const storageState = Object.fromEntries(EXPECTED_CONFIGURATION_KEYS.map((key) => [key, { saved: key }]));
    storageState.featureFlags = { taskListEnabled: true, powerAutomateUrl: 'must-not-export' };
    globalThis.chrome = {
      storage: {
        local: {
          get(keys, callback) {
            callback(Object.fromEntries(
              keys.filter((key) => key in storageState).map((key) => [key, storageState[key]]),
            ));
          },
          set(_value, callback) { callback?.(); },
        },
      },
    };
    const configurationScopes = PRESET_SCOPES.filter((scope) => scope.category === 'Configuration');
    const gathered = await gatherScopes(configurationScopes.map((scope) => scope.id));
    const exportedKeys = Object.values(gathered).flatMap((bag) => Object.keys(bag));
    assert.deepEqual([...new Set(exportedKeys)].sort(), [...EXPECTED_CONFIGURATION_KEYS].sort());
    assert.equal(JSON.stringify(gathered).includes('must-not-export'), false);
  });
});

describe('sharing fallback · email templates', () => {
  it('strips local ids and folder membership when building a shareable file', () => {
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
  });

  it('round-trips a built email template file', () => {
    const email = buildEmailTemplateFile({
      id: 'x', type: 'order', name: 'Order follow-up', subject: 'Hello', body: '<p>Thanks</p>',
    });
    const parsed = parseEmailTemplateFile(JSON.stringify(email));
    assert.equal(parsed.name, 'Order follow-up');
    assert.equal(parsed.body, '<p>Thanks</p>');
  });

  it('rejects unversioned files, unsupported versions, and invalid json', () => {
    const email = buildEmailTemplateFile({
      id: 'x', type: 'order', name: 'Order follow-up', subject: 'Hello', body: '<p>Thanks</p>',
    });
    assert.throws(
      () => parseEmailTemplateFile(JSON.stringify({ name: 'Legacy', body: 'Hi' })),
      /not a versioned Golfballs email template file/,
    );
    assert.throws(
      () => parseEmailTemplateFile(JSON.stringify({ ...email, schemaVersion: 2 })),
      /version is not supported/,
    );
    assert.throws(() => parseEmailTemplateFile('{bad json'), /Not valid JSON/);
  });
});
