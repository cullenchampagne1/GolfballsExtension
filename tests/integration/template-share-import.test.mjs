/**
 * Integration flow — pasted share links → background URL parsing → import.
 *
 * Drives the REAL background.js link regexes (gbSettingsShareId /
 * gbEmailTemplateShareId) and share handlers end-to-end: a pasted URL has its
 * 32-char id extracted, an authenticated GET is issued, the payload flows back
 * to the caller, and a follow-up import is recorded — while cross-type,
 * query-carrying, and foreign-origin links are rejected before any fetch.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_KEY, API_ORIGIN,
  createFetchMock, jsonResponse, loadBackground, validInstallation,
} from './helpers/harness.mjs';

const SETTINGS_ID = 'S1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p_';
const TEMPLATE_ID = 'T1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p-';
const SETTINGS_URL = `${API_ORIGIN}/extension/settings-shares/${SETTINGS_ID}`;
const TEMPLATE_URL = `${API_ORIGIN}/extension/email-template-shares/${TEMPLATE_ID}`;

const settingsShare = {
  id: SETTINGS_ID,
  name: 'Region defaults',
  scopes: { templates: { items: [{ id: 'tpl-9', name: 'Re-order nudge', body: '<p>Hi {{first}}</p>' }] } },
};
const templateShare = {
  id: TEMPLATE_ID,
  template: { name: 'Re-order nudge', subject: 'Time to restock?', body: '<p>Hi {{first}}</p>' },
};

let sendMessage;
let requests;
let stored;

before(async () => {
  const mock = createFetchMock((url, options) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (url === SETTINGS_URL && method === 'GET') return jsonResponse(settingsShare);
    if (url === `${SETTINGS_URL}/imports` && method === 'POST') return jsonResponse({ ...settingsShare, imports: 3 });
    if (url === TEMPLATE_URL && method === 'GET') return jsonResponse(templateShare);
    if (url === `${API_ORIGIN}/extension/email-template-shares` && method === 'POST') {
      return jsonResponse({ id: TEMPLATE_ID, url: TEMPLATE_URL }, 201);
    }
    return undefined;
  });
  requests = mock.requests;
  stored = { gbApiInstallation: validInstallation() };
  const background = await loadBackground({ stored, fetchImpl: mock.fetchMock });
  sendMessage = background.sendMessage;
  requests.length = 0;
});

describe('template/settings share import', () => {
  it('extracts the id from a pasted settings-share URL and returns the share', async () => {
    const response = await sendMessage({ action: 'settingsShareGet', url: `${SETTINGS_URL}/` });

    assert.equal(response.ok, true);
    assert.equal(response.share.name, 'Region defaults');
    assert.equal(response.share.scopes.templates.items[0].body, '<p>Hi {{first}}</p>');
    const request = requests.at(-1);
    assert.equal(request.url, SETTINGS_URL, 'the trailing slash is normalized away');
    assert.equal(request.method, 'GET');
    assert.equal(request.options.headers.get('Authorization'), `Bearer ${API_KEY}`);
  });

  it('accepts a bare 32-char id and a pasted email-template link alike', async () => {
    const byId = await sendMessage({ action: 'emailTemplateShareGet', shareId: TEMPLATE_ID });
    assert.equal(byId.ok, true);
    assert.equal(byId.share.template.subject, 'Time to restock?');

    const byUrl = await sendMessage({ action: 'emailTemplateShareGet', url: TEMPLATE_URL });
    assert.equal(byUrl.ok, true);
    const last = requests.slice(-2);
    assert.deepEqual(last.map(({ url }) => url), [TEMPLATE_URL, TEMPLATE_URL]);
    assert.deepEqual(last.map(({ method }) => method), ['GET', 'GET']);
  });

  it('completes the import: recorded scope ids land on the share, payload ready for storage', async () => {
    const opened = await sendMessage({ action: 'settingsShareGet', url: SETTINGS_URL });
    const scopeIds = Object.keys(opened.share.scopes);
    const imported = await sendMessage({ action: 'settingsShareRecordImport', shareId: opened.share.id, scopeIds });

    assert.equal(imported.ok, true);
    assert.equal(imported.share.imports, 3);
    const request = requests.at(-1);
    assert.equal(request.url, `${SETTINGS_URL}/imports`);
    assert.equal(request.method, 'POST');
    assert.deepEqual(JSON.parse(request.options.body), { scope_ids: ['templates'] });

    // The popup persists the imported scopes; storage write is its code, but
    // the payload that reaches it must round-trip intact through this flow.
    assert.deepEqual(opened.share.scopes.templates.items, settingsShare.scopes.templates.items);
  });

  it('rejects cross-type links: a settings URL is not a template link and vice versa', async () => {
    const marker = requests.length;
    const crossA = await sendMessage({ action: 'emailTemplateShareGet', url: SETTINGS_URL });
    assert.deepEqual(crossA, { ok: false, error: 'Enter a valid email template link' });
    const crossB = await sendMessage({ action: 'settingsShareGet', url: TEMPLATE_URL });
    assert.deepEqual(crossB, { ok: false, error: 'Enter a valid settings share URL' });
    assert.equal(requests.length, marker, 'cross-type links never reach fetch');
  });

  it('rejects malformed links (query, foreign origin, short id, http) before any fetch', async () => {
    const marker = requests.length;
    const badLinks = [
      `${SETTINGS_URL}?utm=1`,
      `${SETTINGS_URL}#frag`,
      `https://evil.example/extension/settings-shares/${SETTINGS_ID}`,
      `http://api.cullenchampagne.com/extension/settings-shares/${SETTINGS_ID}`,
      `${API_ORIGIN}/extension/settings-shares/${SETTINGS_ID.slice(0, 31)}`,
      `${API_ORIGIN}/extension/settings-shares/${SETTINGS_ID}extra`,
    ];
    for (const url of badLinks) {
      const response = await sendMessage({ action: 'settingsShareGet', url });
      assert.equal(response.ok, false, `must reject ${url}`);
    }
    assert.equal(requests.length, marker);
  });

  it('creates a template share for a valid template object only', async () => {
    const created = await sendMessage({
      action: 'emailTemplateShareCreate',
      template: templateShare.template,
    });
    assert.equal(created.ok, true);
    assert.equal(created.share.url, TEMPLATE_URL);
    const request = requests.at(-1);
    assert.equal(request.url, `${API_ORIGIN}/extension/email-template-shares`);
    assert.equal(request.method, 'POST');
    assert.deepEqual(JSON.parse(request.options.body), { template: templateShare.template });

    const marker = requests.length;
    const invalid = await sendMessage({ action: 'emailTemplateShareCreate', template: ['not', 'an', 'object'] });
    assert.deepEqual(invalid, { ok: false, error: 'Invalid email template' });
    assert.equal(requests.length, marker);
  });
});
