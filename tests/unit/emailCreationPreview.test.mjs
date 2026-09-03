import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildEmailCreationPreview,
  ORIGINAL_EMAIL_VARIATION_ID,
  selectEmailPreviewVariation,
  templatesForEmailPreview,
} from '../../src/lib/emailCreationPreview.js';
import {
  DEV_SETTINGS,
  openEmailCreationPreview,
} from '../../src/lib/devSettings.js';

const root = new URL('../../', import.meta.url);
const [backgroundSource, previewSource, previewHtml, buildSource, packageStoreSource, developerWorkspaceSource] = await Promise.all([
  readFile(new URL('background.js', root), 'utf8'),
  readFile(new URL('src/email-creation-preview/email-creation-preview.jsx', root), 'utf8'),
  readFile(new URL('email-creation-preview.html', root), 'utf8'),
  readFile(new URL('build.js', root), 'utf8'),
  readFile(new URL('scripts/package-store.mjs', root), 'utf8'),
  readFile(new URL('src/ui/components/DeveloperWorkspace.jsx', root), 'utf8'),
]);

afterEach(() => {
  delete globalThis.chrome;
  delete globalThis.window;
});

describe('Email creation developer preview', () => {
  it('shows only templates compatible with the active page context', () => {
    const templates = [
      { id: 'order', type: 'order' },
      { id: 'legacy-email', type: 'email' },
      { id: 'legacy-empty' },
      { id: 'account', type: 'account' },
    ];
    assert.deepEqual(templatesForEmailPreview(templates, 'order').map(({ id }) => id), [
      'order', 'legacy-email', 'legacy-empty',
    ]);
    assert.deepEqual(templatesForEmailPreview(templates, 'contact').map(({ id }) => id), ['account']);
    assert.deepEqual(templatesForEmailPreview(templates, 'opportunity'), []);
  });

  it('renders a pinned variation with the production template formatter', () => {
    const template = {
      id: 'follow-up',
      name: 'Order follow-up',
      subject: 'Hello {{first}}',
      body: '<p>Base for {{first}}</p>',
      vars: { first: { type: 'text' } },
      variations: [{ id: 'direct', subject: 'Update for {{first}}', body: '<strong>Order {{order}}</strong>' }],
    };
    assert.equal(selectEmailPreviewVariation(template, 'direct')?.id, 'direct');
    assert.equal(selectEmailPreviewVariation(template, ORIGINAL_EMAIL_VARIATION_ID), null);
    assert.deepEqual(buildEmailCreationPreview(template, 'direct', { first: 'Ada', order: '10042' }, 'ada@example.test'), {
      to: 'ada@example.test',
      subject: 'Update for Ada',
      htmlBody: '<strong>Order 10042</strong>',
      templateId: 'follow-up',
      templateName: 'Order follow-up',
      variationId: 'direct',
    });
  });

  it('registers a non-persisted developer action that opens the preview window', async () => {
    const messages = [];
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          callback({ ok: true, success: true });
        },
      },
    };
    const action = DEV_SETTINGS.find((row) => row.key === 'emailTemplates.creationPreview');
    assert.equal(action?.type, 'action');
    assert.equal(action?.buttonLabel, 'Open preview');
    assert.equal(action?.runner, openEmailCreationPreview);
    assert.equal((await openEmailCreationPreview()).ok, true);
    assert.deepEqual(messages, [{ action: 'openEmailCreationPreview' }]);
  });

  it('wires active-tab resolution, formatted preview, standalone window, build, and store package', () => {
    assert.match(backgroundSource, /msg\.action === 'openEmailCreationPreview'/);
    assert.match(backgroundSource, /chrome\.runtime\.getURL\('email-creation-preview\.html'\)/);
    assert.match(previewSource, /action: 'getPageInfo'/);
    assert.match(previewSource, /name: 'gbResolveStream'/);
    assert.match(previewSource, /action: 'resolveVarsStream'/);
    assert.match(previewSource, /buildEmailCreationPreview/);
    assert.match(previewSource, /<EmailHtmlView/);
    assert.match(previewSource, /<DeveloperWorkspace/);
    assert.match(previewSource, /<DeveloperContext/);
    assert.match(previewSource, /<DeveloperMetrics/);
    assert.match(previewSource, /<DeveloperCard className="ecp-context"/);
    assert.match(previewSource, /title="Matched variables"/);
    assert.match(previewSource, /title="Matching rules"/);
    assert.match(previewSource, /pageInfo\.matchDetails\?\.\[selectedTemplate\.id\]/);
    assert.match(previewSource, /Group \{String\.fromCharCode\(65 \+ index\)\}/);
    assert.match(previewSource, /matchDetail\.outerJoiner/);
    assert.match(previewSource, /grid-template-columns:repeat\(auto-fit,minmax\(240px,1fr\)\)/);
    assert.match(developerWorkspaceSource, /\.gb-dev-context-meta \{[^}]*display:flex[^}]*flex-wrap:nowrap/);
    assert.doesNotMatch(developerWorkspaceSource, /\.gb-dev-context\{grid-template-columns:1fr/);
    assert.doesNotMatch(previewSource, /<details className="ecp-card ecp-context"/);
    assert.doesNotMatch(previewSource, /className="ecp-grid"/);
    assert.doesNotMatch(previewSource, /max-width:1060px/);
    assert.doesNotMatch(previewSource, /action:\s*'sendEmailTemplate'/);
    assert.match(previewSource, /chrome\.tabs\.onActivated\.addListener/);
    assert.match(previewSource, /chrome\.windows\.onFocusChanged\.addListener/);
    assert.match(previewHtml, /react-dist\/email-creation-preview\/email-creation-preview\.js/);
    assert.match(buildSource, /src\/email-creation-preview/);
    assert.match(packageStoreSource, /'email-creation-preview\.html'/);
  });
});
