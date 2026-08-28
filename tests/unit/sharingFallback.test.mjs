/** Offline sharing: schema-validated, versioned template files only. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyScopes,
  buildSettingsTemplateFile,
  gatherScopes,
  parseSettingsTemplateFile,
  PRESET_SCOPES,
} from '../../src/lib/presetScopes.js';
import {
  buildEmailTemplateFile,
  markImportedEmailTemplate,
  normalizeTemplate,
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
  'featureFlags', 'featureConfig', 'devSettings', 'keyboardShortcuts',
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

  it('round-trips Quick Task and sibling template scopes through one share', async () => {
    const storageState = {
      templates: [
        { id: 'source-order', type: 'order', name: 'Order update' },
        { id: 'source-case', type: 'case', name: 'Case update' },
      ],
      templateFolders: [{ id: 'email-folder', name: 'Shared email' }],
      noteTemplates: [
        { id: 'source-note', subType: 'note', name: 'Order note' },
        { id: 'source-task', subType: 'task', name: 'Quick Task follow-up' },
        { id: 'source-call', subType: 'call_log', name: 'Call follow-up' },
      ],
      noteFolders: [{ id: 'activity-folder', name: 'Shared activity' }],
    };
    globalThis.chrome = {
      storage: {
        local: {
          get(keys, callback) {
            const list = Array.isArray(keys) ? keys : [keys];
            callback(Object.fromEntries(
              list.filter((key) => key in storageState).map((key) => [key, storageState[key]]),
            ));
          },
          set(value, callback) { Object.assign(storageState, value); callback?.(); },
        },
      },
    };

    const shared = await gatherScopes([
      'tpl-order', 'tpl-case', 'note-quick', 'note-task', 'note-call',
    ]);
    assert.deepEqual(shared['note-task'].noteTemplates, [
      { id: 'source-task', subType: 'task', name: 'Quick Task follow-up' },
    ]);

    storageState.templates = [{ id: 'local-email', type: 'contact', name: 'Keep local email' }];
    storageState.templateFolders = [{ id: 'local-email-folder', name: 'Keep local email folder' }];
    storageState.noteTemplates = [{ id: 'local-task', subType: 'task', name: 'Keep local task' }];
    storageState.noteFolders = [{ id: 'local-note-folder', name: 'Keep local note folder' }];

    await applyScopes(shared);

    assert.deepEqual(
      storageState.noteTemplates.map((item) => item.id),
      ['local-task', 'source-note', 'source-task', 'source-call'],
      'every activity subtype must compose into the shared noteTemplates array',
    );
    assert.deepEqual(
      storageState.templates.map((item) => item.id),
      ['local-email', 'source-order', 'source-case'],
      'email subtype scopes must compose into the shared templates array too',
    );
    assert.deepEqual(
      storageState.noteFolders.map((item) => item.id),
      ['local-note-folder', 'activity-folder'],
    );
  });

  it('never re-shares or overwrites a creator-owned imported email template', async () => {
    const imported = markImportedEmailTemplate(
      normalizeTemplate({ type: 'order', name: 'Owner copy', body: '<p>Original</p>' }),
      {
        id: 'S1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p_',
        owner_name: 'Template Owner',
      },
    );
    const storageState = {
      templates: [
        { id: 'local-order', type: 'order', name: 'Local', body: '<p>Local</p>' },
        imported,
      ],
      templateFolders: [],
    };
    globalThis.chrome = {
      storage: {
        local: {
          get(keys, callback) {
            const list = Array.isArray(keys) ? keys : [keys];
            callback(Object.fromEntries(
              list.filter((key) => key in storageState).map((key) => [key, storageState[key]]),
            ));
          },
          set(value, callback) { Object.assign(storageState, value); callback?.(); },
        },
      },
    };

    const gathered = await gatherScopes(['tpl-order']);
    assert.deepEqual(gathered['tpl-order'].templates.map((item) => item.id), ['local-order']);

    await applyScopes({
      'tpl-order': {
        templates: [
          { id: imported.id, type: 'order', name: 'Attempted overwrite', body: '<p>Changed</p>' },
          markImportedEmailTemplate(
            normalizeTemplate({ type: 'order', name: 'Spoofed share', body: '<p>No</p>' }),
            { id: 'Z1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p_' },
          ),
          { id: 'new-local', type: 'order', name: 'Allowed local', body: '<p>Yes</p>' },
        ],
      },
    });

    assert.equal(storageState.templates.find((item) => item.id === imported.id).body, '<p>Original</p>');
    assert.equal(storageState.templates.some((item) => item.name === 'Spoofed share'), false);
    assert.equal(storageState.templates.some((item) => item.id === 'new-local'), true);
  });

  it('round-trips popup, shelf, page, and custom-link feature placement', async () => {
    const sourcePlacement = {
      crmSearchEnabled: {
        showInPopup: false,
        showInShelf: true,
        pages: ['contact', 'account'],
        customUrl: 'Page=240',
      },
      marginCalcEnabled: {
        showInPopup: true,
        showInShelf: false,
        pages: ['order'],
        customUrl: '',
      },
    };
    const storageState = {
      featureFlags: { crmSearchEnabled: true, marginCalcEnabled: true },
      featureConfig: sourcePlacement,
    };
    globalThis.chrome = {
      storage: {
        local: {
          get(keys, callback) {
            const list = Array.isArray(keys) ? keys : [keys];
            callback(Object.fromEntries(
              list.filter((key) => key in storageState).map((key) => [key, storageState[key]]),
            ));
          },
          set(value, callback) { Object.assign(storageState, value); callback?.(); },
        },
      },
    };

    const shared = await gatherScopes(['settings-preferences']);
    assert.deepEqual(shared['settings-preferences'].featureConfig, sourcePlacement);

    storageState.featureConfig = { crmSearchEnabled: { showInPopup: true } };
    await applyScopes(shared);
    assert.deepEqual(storageState.featureConfig, sourcePlacement);
  });

  it('keeps Page Engine indexing and Territory identity installation-local', async () => {
    const storageState = {
      devSettings: {
        'numberDisplay.durationMs': 400,
        'email.localPart': 'private-mailbox',
        'pageEngine.indexingEnabled': true,
        'pageEngine.territory': 'P5 / BDR (Cullen)',
      },
    };
    globalThis.chrome = {
      storage: {
        local: {
          get(keys, callback) {
            callback(Object.fromEntries(
              (Array.isArray(keys) ? keys : [keys])
                .filter((key) => key in storageState)
                .map((key) => [key, storageState[key]]),
            ));
          },
          set(value, callback) { Object.assign(storageState, value); callback?.(); },
        },
      },
    };

    const gathered = await gatherScopes(['settings-preferences']);
    assert.deepEqual(gathered['settings-preferences'].devSettings, {
      'numberDisplay.durationMs': 400,
    });
    assert.equal(JSON.stringify(gathered).includes('P5 / BDR (Cullen)'), false);

    await applyScopes({
      'settings-preferences': {
        devSettings: {
          'numberDisplay.durationMs': 900,
          'pageEngine.indexingEnabled': false,
          'pageEngine.territory': 'imported-territory-must-not-win',
        },
      },
    });
    assert.deepEqual(storageState.devSettings, {
      'numberDisplay.durationMs': 900,
      'email.localPart': 'private-mailbox',
      'pageEngine.indexingEnabled': true,
      'pageEngine.territory': 'P5 / BDR (Cullen)',
    });
  });

  it('cannot overwrite managed values through a current or legacy settings file', async () => {
    const storageState = {
      gbRemoteSettingsPolicy: {
        schemaVersion: 1,
        adminBypass: false,
        managedFeatures: { taskListEnabled: false },
        managedDeveloperSettings: { 'numberDisplay.durationMs': 400 },
      },
      featureFlags: { taskListEnabled: false },
      devSettings: { 'numberDisplay.durationMs': 400 },
    };
    globalThis.chrome = {
      storage: {
        local: {
          get(keys, callback) {
            const list = Array.isArray(keys) ? keys : [keys];
            callback(Object.fromEntries(
              list.filter((key) => key in storageState).map((key) => [key, storageState[key]]),
            ));
          },
          set(value, callback) { Object.assign(storageState, value); callback?.(); },
        },
      },
    };

    await applyScopes({
      'settings-preferences': {
        featureFlags: { taskListEnabled: true, marginCalcEnabled: false },
        devSettings: { 'numberDisplay.durationMs': 2_000 },
      },
    });

    assert.deepEqual(storageState.featureFlags, {
      taskListEnabled: false,
      marginCalcEnabled: false,
    });
    assert.equal(storageState.devSettings['numberDisplay.durationMs'], 400);
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
