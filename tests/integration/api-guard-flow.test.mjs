/**
 * Integration flow — the fixed product + project-assistant route guard in
 * GBInstallationAuth.apiFetch.
 *
 * Real installation-auth.js in a vm sandbox with a pre-enrolled credential.
 * Happy GET/POST calls must carry the installation Bearer key with
 * credentials:'omit'; anything off the fixed origin/path/method surface must
 * be rejected before fetch() is ever invoked.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_KEY, API_ORIGIN,
  createFetchMock, jsonResponse, loadInstallationAuth, validInstallation,
} from './helpers/harness.mjs';

const CLIENT_BASE = '/projects/golfballs-extension/client';

function makeSandbox() {
  const { fetchMock, requests } = createFetchMock((url) => {
    if (url.startsWith(`${API_ORIGIN}${CLIENT_BASE}/`)
        || url.startsWith(`${API_ORIGIN}/projects/golfballs-extension/assistant/`)) {
      return jsonResponse({ ok: true, path: new URL(url).pathname });
    }
    return undefined;
  });
  const sandbox = loadInstallationAuth({
    stored: { gbApiInstallation: validInstallation() },
    fetchImpl: fetchMock,
  });
  return { ...sandbox, requests };
}

describe('extension API guard', () => {
  it('sends a happy GET with the installation Bearer key and credentials omitted', async () => {
    const { client, requests } = makeSandbox();
    const response = await client.apiFetch(`${CLIENT_BASE}/settings-shares`);

    assert.equal(response.status, 200);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, `${API_ORIGIN}${CLIENT_BASE}/settings-shares`);
    assert.equal(requests[0].method, 'GET');
    assert.equal(requests[0].options.headers.get('Authorization'), `Bearer ${API_KEY}`);
    assert.equal(requests[0].options.headers.get('Accept'), 'application/json');
    assert.equal(requests[0].options.credentials, 'omit');
    assert.equal(requests[0].options.redirect, 'error');
  });

  it('sends a happy POST through apiJson with a JSON content type and parsed reply', async () => {
    const { client, requests } = makeSandbox();
    const body = JSON.stringify({ name: 'Team defaults', scopes: { settings: {} } });
    const payload = await client.apiJson(`${CLIENT_BASE}/settings-shares`, { method: 'POST', body });

    assert.deepEqual(payload, { ok: true, path: `${CLIENT_BASE}/settings-shares` });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].options.body, body);
    assert.equal(requests[0].options.headers.get('Content-Type'), 'application/json');
    assert.equal(requests[0].options.headers.get('Authorization'), `Bearer ${API_KEY}`);
    assert.equal(requests[0].options.credentials, 'omit');
  });

  it('surfaces structured FastAPI validation details instead of a generic HTTP 422', async () => {
    const { fetchMock } = createFetchMock(() => jsonResponse({
      detail: [{
        type: 'extra_forbidden',
        loc: ['body', 'context', 'page_url'],
        msg: 'Extra inputs are not permitted',
      }],
    }, 422));
    const { client } = loadInstallationAuth({
      stored: { gbApiInstallation: validInstallation() },
      fetchImpl: fetchMock,
    });

    await assert.rejects(
      client.apiJson('/projects/golfballs-extension/assistant/messages', {
        method: 'POST', body: '{"context":{"page_url":"https://example.test"}}',
      }),
      /context\.page_url: Extra inputs are not permitted/,
    );
  });

  it('preserves Retry-After metadata on bounded API errors', async () => {
    const { fetchMock } = createFetchMock(() => jsonResponse({
      detail: { code: 'assistant_rate_limited', message: 'Message quota reached' },
    }, 429, { 'Retry-After': '17' }));
    const { client } = loadInstallationAuth({
      stored: { gbApiInstallation: validInstallation() },
      fetchImpl: fetchMock,
    });

    await assert.rejects(async () => {
      try {
        await client.apiJson('/projects/golfballs-extension/assistant/messages', {
          method: 'POST', body: '{}',
        });
      } catch (error) {
        assert.equal(error.status, 429);
        assert.equal(error.retryAfterSeconds, 17);
        throw error;
      }
    }, /HTTP 429/);
  });

  it('bricks the product runtime on revoked credentials or disabled client access', async () => {
    for (const status of [401, 403]) {
      const { fetchMock } = createFetchMock(() => jsonResponse({ detail: 'Denied' }, status));
      const loaded = loadInstallationAuth({
        stored: { gbApiInstallation: validInstallation() },
        fetchImpl: fetchMock,
      });
      const disabled = [];
      loaded.context.GBExtensionAccessGateController = {
        disable: async (...args) => { disabled.push(args); },
      };

      await loaded.client.apiFetch(`${CLIENT_BASE}/health`);
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(disabled.length, 1);
      assert.equal(disabled[0][0], 'credential-or-access-disabled');
      assert.equal(disabled[0][1]?.reload, true);
    }
  });

  it('does not brick product access when only Help Companion is disabled', async () => {
    const { fetchMock } = createFetchMock(() => jsonResponse({ detail: 'Chat disabled' }, 403));
    const loaded = loadInstallationAuth({
      stored: { gbApiInstallation: validInstallation() },
      fetchImpl: fetchMock,
    });
    const disabled = [];
    loaded.context.GBExtensionAccessGateController = {
      disable: async (...args) => { disabled.push(args); },
    };
    await loaded.client.apiFetch('/projects/golfballs-extension/assistant/health');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(disabled, []);
  });

  it('overrides any caller-supplied Authorization header with the installation key', async () => {
    const { client, requests } = makeSandbox();
    await client.apiFetch(`${CLIENT_BASE}/ping`, {
      method: 'POST',
      headers: { Authorization: 'Bearer caller-controlled' },
    });
    assert.equal(requests[0].options.headers.get('Authorization'), `Bearer ${API_KEY}`);
  });

  it('allows only the declared Golfballs assistant routes with their exact methods', async () => {
    const { client, requests } = makeSandbox();
    const runId = 'run_12345678-abcd';

    await client.apiFetch('/projects/golfballs-extension/assistant/status');
    await client.apiFetch('/projects/golfballs-extension/assistant/messages', { method: 'POST', body: '{}' });
    await client.apiFetch(`/projects/golfballs-extension/assistant/runs/${runId}`);
    await client.apiFetch(`/projects/golfballs-extension/assistant/runs/${runId}/cancel`, { method: 'POST', body: '{}' });
    await client.apiFetch('/projects/golfballs-extension/assistant/feedback', { method: 'POST', body: '{}' });

    assert.equal(requests.length, 5);
    assert.ok(requests.every(({ options }) => options.headers.get('Authorization') === `Bearer ${API_KEY}`));
    assert.ok(requests.every(({ options }) => options.credentials === 'omit'));

    await assert.rejects(client.apiFetch('/projects/golfballs-extension/assistant/messages'), /Blocked non-extension API path/);
    await assert.rejects(client.apiFetch('/projects/golfballs-extension/assistant/status', { method: 'POST' }), /Blocked non-extension API path/);
    await assert.rejects(client.apiFetch('/projects/golfballs-extension/assistant/runs/short'), /Blocked non-extension API path/);
    await assert.rejects(client.apiFetch('/projects/golfballs-extension/assistant/admin/status'), /Blocked non-extension API path/);
    await assert.rejects(client.apiFetch('/projects/revstack-backend/assistant/status'), /Blocked non-extension API path/);
    await assert.rejects(client.apiFetch('/projects/golfballs-extension/assistant/status?admin=1'), /Blocked non-extension API path/);
    assert.equal(requests.length, 5, 'rejected project paths must not reach fetch');
  });

  it('rejects non-project-client paths and foreign origins without touching the network', async () => {
    const { client, requests } = makeSandbox();
    await assert.rejects(client.apiFetch('/graph/search'), /Blocked non-extension API path/);
    await assert.rejects(client.apiFetch(`https://evil.example${CLIENT_BASE}/ping`), /Blocked non-extension API path/);
    await assert.rejects(
      client.apiFetch(`${API_ORIGIN}:8443${CLIENT_BASE}/ping`),
      /Blocked non-extension API path|Blocked malformed extension API URL/,
    );
    await assert.rejects(client.apiFetch(`${CLIENT_BASE}/ping#frag`), /Blocked malformed extension API URL/);
    assert.equal(requests.length, 0, 'blocked paths must never reach fetch');
  });

  it('rejects disallowed methods and GET requests that carry a body', async () => {
    const { client, requests } = makeSandbox();
    await assert.rejects(client.apiFetch(`${CLIENT_BASE}/ping`, { method: 'PUT' }), /Blocked extension API method/);
    await assert.rejects(client.apiFetch(`${CLIENT_BASE}/ping`, { method: 'DELETE' }), /Blocked extension API method/);
    await assert.rejects(
      client.apiFetch(`${CLIENT_BASE}/ping`, { method: 'GET', body: '{"x":1}' }),
      /GET extension API requests cannot contain a body/,
    );
    await assert.rejects(
      client.apiFetch(`${CLIENT_BASE}/ping`, { method: 'POST', body: { not: 'a string' } }),
      /Extension API body must be a bounded serialized string/,
    );
    assert.equal(requests.length, 0, 'blocked methods must never reach fetch');
  });
});
