/** Offline sharing regression tests: schema-validated, versioned files only. */
import assert from 'node:assert/strict';
import {
  buildSettingsTemplateFile,
  parseSettingsTemplateFile,
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
assert.deepEqual(Object.keys(settings.scopes), ['settings']);
assert.equal(settings.scopes.settings.featureFlags.powerAutomateUrl, undefined);
const parsedSettings = parseSettingsTemplateFile(JSON.stringify(settings));
assert.equal(parsedSettings.transport, 'json');
assert.deepEqual(Object.keys(parsedSettings.scopes), ['settings']);
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
