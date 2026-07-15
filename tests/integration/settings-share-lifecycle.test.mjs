/**
 * Integration flow — settings-share lifecycle through the REAL background.js
 * message router (which importScripts()-loads the real installation auth).
 *
 * create → get → record import → revoke, driven exactly as the popup drives
 * them (chrome.runtime.onMessage), asserting the exact URLs, methods, bodies,
 * and auth headers that hit the mocked fetch, and that server payloads flow
 * back through sendResponse.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_KEY, API_ORIGIN,
  createFetchMock, jsonResponse, loadBackground, validInstallation,
} from './helpers/harness.mjs';

const SHARE_ID = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6';
const SHARE_URL = `${API_ORIGIN}/extension/settings-shares/${SHARE_ID}`;

const serverShare = {
  id: SHARE_ID,
  name: 'Team defaults',
  url: SHARE_URL,
  scopes: { templates: { items: [{ id: 't1', name: 'Follow up' }] }, flags: { copyIdsEnabled: true } },
};

let sendMessage;
let requests;

before(async () => {
  const mock = createFetchMock((url, options) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (url === `${API_ORIGIN}/extension/settings-shares` && method === 'POST') {
      return jsonResponse(serverShare, 201);
    }
    if (url === SHARE_URL && method === 'GET') return jsonResponse(serverShare);
    if (url === `${SHARE_URL}/imports` && method === 'POST') {
      return jsonResponse({ ...serverShare, imports: 1 });
    }
    if (url === `${SHARE_URL}/revoke` && method === 'POST') {
      return jsonResponse({ id: SHARE_ID, revoked: true });
    }
    return undefined;
  });
  requests = mock.requests;
  const background = await loadBackground({
    stored: { gbApiInstallation: validInstallation() },
    fetchImpl: mock.fetchMock,
  });
  sendMessage = background.sendMessage;
  requests.length = 0; // drop the load-time remote-policy configuration fetch
});

describe('settings-share lifecycle', () => {
  it('creates a share: POST /extension/settings-shares with name+scopes and Bearer auth', async () => {
    const response = await sendMessage({
      action: 'settingsShareCreate',
      name: '  Team defaults  ',
      scopes: { templates: {}, flags: {} },
    });

    assert.equal(response.ok, true);
    assert.deepEqual(response.share, serverShare, 'the server share flows back to the caller');

    const request = requests.at(-1);
    assert.equal(request.url, `${API_ORIGIN}/extension/settings-shares`);
    assert.equal(request.method, 'POST');
    assert.deepEqual(JSON.parse(request.options.body), {
      name: 'Team defaults',
      scopes: { templates: {}, flags: {} },
    });
    assert.equal(request.options.headers.get('Content-Type'), 'application/json');
    assert.equal(request.options.headers.get('Authorization'), `Bearer ${API_KEY}`);
    assert.equal(request.options.credentials, 'omit');
  });

  it('opens a pasted share URL: id extracted, GET issued, payload returned', async () => {
    const marker = requests.length;
    const response = await sendMessage({ action: 'settingsShareGet', url: SHARE_URL });

    assert.equal(response.ok, true);
    assert.equal(response.share.name, 'Team defaults');
    assert.deepEqual(response.share.scopes.templates.items, [{ id: 't1', name: 'Follow up' }]);

    const request = requests.at(-1);
    assert.equal(requests.length, marker + 1);
    assert.equal(request.url, SHARE_URL);
    assert.equal(request.method, 'GET');
    assert.equal(request.options.body, undefined, 'a GET share fetch carries no body');
    assert.equal(request.options.headers.get('Authorization'), `Bearer ${API_KEY}`);
  });

  it('records an import: POST …/imports with deduplicated scope_ids', async () => {
    const response = await sendMessage({
      action: 'settingsShareRecordImport',
      shareId: SHARE_ID,
      scopeIds: ['templates', 'templates', 'flags', 42],
    });

    assert.equal(response.ok, true);
    assert.equal(response.share.imports, 1);

    const request = requests.at(-1);
    assert.equal(request.url, `${SHARE_URL}/imports`);
    assert.equal(request.method, 'POST');
    assert.deepEqual(JSON.parse(request.options.body), { scope_ids: ['templates', 'flags'] });
  });

  it('revokes the share: POST …/revoke and echoes the share id', async () => {
    const response = await sendMessage({ action: 'settingsShareRevoke', shareId: SHARE_ID });

    assert.deepEqual(response, { ok: true, shareId: SHARE_ID });
    const request = requests.at(-1);
    assert.equal(request.url, `${SHARE_URL}/revoke`);
    assert.equal(request.method, 'POST');
  });

  it('rejects malformed ids and payloads before any network request', async () => {
    const marker = requests.length;

    const shortId = await sendMessage({ action: 'settingsShareGet', shareId: SHARE_ID.slice(0, 31) });
    assert.deepEqual(shortId, { ok: false, error: 'Enter a valid settings share URL' });

    const badCreate = await sendMessage({ action: 'settingsShareCreate', name: '', scopes: { a: {} } });
    assert.deepEqual(badCreate, { ok: false, error: 'Invalid settings share' });

    const badImport = await sendMessage({ action: 'settingsShareRecordImport', shareId: SHARE_ID, scopeIds: [] });
    assert.deepEqual(badImport, { ok: false, error: 'Invalid settings share import' });

    assert.equal(requests.length, marker, 'invalid share requests must never reach fetch');
  });

  it('ignores messages from senders other than the extension itself', async () => {
    const marker = requests.length;
    const response = await sendMessage(
      { action: 'settingsShareRevoke', shareId: SHARE_ID },
      { id: 'some-other-extension', tab: { id: 9 } },
    );
    assert.equal(response, undefined, 'foreign senders get no response');
    assert.equal(requests.length, marker);
  });
});
