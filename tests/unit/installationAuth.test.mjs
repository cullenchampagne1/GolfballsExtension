/** Anonymous first-install enrollment, API-key reuse, and request guardrails.
 *
 * One vm context and one fake storage are shared, so these `it` blocks run in
 * declaration order (enroll once → reuse → guarded calls → revocation).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const INSTALLATION_ID = '12345678-1234-4234-8234-123456789abc';
const API_KEY = `rsk_${'a'.repeat(12)}_${'B'.repeat(48)}`;

let manifest;
let expectedId;
let stored;
let requests;
let installedListeners;
let startupListeners;
let client;

before(async () => {
  manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const source = await readFile(new URL('lib/installation-auth.js', root), 'utf8');
  expectedId = createHash('sha256')
    .update(Buffer.from(manifest.key, 'base64'))
    .digest('hex')
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) => 'abcdefghijklmnop'[Number.parseInt(digit, 16)]);

  stored = {};
  requests = [];
  installedListeners = [];
  startupListeners = [];

  const chrome = {
    runtime: {
      id: expectedId,
      lastError: null,
      getManifest: () => ({ version: manifest.version }),
      onInstalled: { addListener: (listener) => installedListeners.push(listener) },
      onStartup: { addListener: (listener) => startupListeners.push(listener) },
    },
    storage: {
      local: {
        get(key, callback) { callback({ [key]: stored[key] }); },
        set(values, callback) { Object.assign(stored, values); callback?.(); },
      },
    },
  };

  async function mockFetch(url, options = {}) {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/auth/extension-installation')) {
      return new Response(JSON.stringify({
        installation_id: INSTALLATION_ID,
        api_key: API_KEY,
        key_prefix: 'rsk_aaaaaaaaaaaa_…',
        rate_limit: { requests: 30, window_seconds: 60 },
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: String(url).endsWith('/projects/golfballs-extension/client/revoked') ? 401 : 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const context = vm.createContext({
    chrome, console, fetch: mockFetch, Headers, Response, URL, Date, Error,
    Object, Promise, String, Number, JSON, TextDecoder, setTimeout, clearTimeout,
  });
  context.globalThis = context;
  new vm.Script(source, { filename: 'installation-auth.js' }).runInContext(context);
  client = context.GBInstallationAuth;
});

describe('installation auth · identity', () => {
  it('derives the published extension id from the manifest key', () => {
    assert.equal(expectedId, 'annoeoeiijgdgmlpefllibcilcamnjek');
  });

  it('holds host permission for the backend origin', () => {
    assert.ok(manifest.host_permissions.includes('https://api.cullenchampagne.com/*'));
  });

  it('does not claim install or startup lifecycle listeners', () => {
    assert.equal(installedListeners.length, 0, 'the runtime coordinator owns install bootstrapping');
    assert.equal(startupListeners.length, 0, 'installation auth does not own worker startup');
  });
});

describe('installation auth · enrollment', () => {
  it('enrolls exactly once on first install and stores the credential', async () => {
    await client.ensureInstallation();
    for (let attempt = 0; attempt < 10 && !stored.gbApiInstallation; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const enrollment = requests.find(({ url }) => url.endsWith('/auth/extension-installation'));
    assert.ok(enrollment, 'first install must enroll exactly once');
    assert.equal(enrollment.url, 'https://api.cullenchampagne.com/auth/extension-installation');
    assert.equal(enrollment.options.credentials, 'omit');
    assert.equal(enrollment.options.redirect, 'error');
    assert.equal(stored.gbApiInstallation.installationId, INSTALLATION_ID);
    assert.equal(stored.gbApiInstallation.apiKey, API_KEY);
    assert.equal(stored.gbApiInstallation.extensionId, expectedId);
  });

  it('reuses the stored key instead of re-enrolling', async () => {
    await client.ensureInstallation();
    assert.equal(
      requests.filter(({ url }) => url.endsWith('/auth/extension-installation')).length, 1,
      'startup and repeated ensure must reuse the installation key',
    );
  });

  it('reports enrollment status without exposing the secret', async () => {
    const status = await client.getStatus();
    assert.equal(status.enrolled, true);
    assert.equal(status.installationId, INSTALLATION_ID);
    assert.equal(Object.hasOwn(status, 'apiKey'), false, 'status must never expose the secret');
  });
});

describe('installation auth · authenticated requests', () => {
  it('overrides a caller-supplied Authorization header with the installation key', async () => {
    const response = await client.apiFetch(`${client.CLIENT_BASE}/ping`, {
      method: 'POST',
      headers: { Authorization: 'Bearer caller-controlled' },
    });
    assert.equal(response.status, 200);
    assert.equal(requests.at(-1).options.headers.get('Authorization'), `Bearer ${API_KEY}`);
    assert.equal(requests.at(-1).options.credentials, 'omit');
  });

  it('sends the dashboard cookie only for the configuration bridge', async () => {
    const configuration = await client.fetchConfiguration();
    assert.deepEqual(configuration, { ok: true });
    assert.equal(requests.at(-1).url, 'https://api.cullenchampagne.com/projects/golfballs-extension/client/configuration');
    assert.equal(requests.at(-1).options.headers.Authorization, `Bearer ${API_KEY}`);
    assert.equal(requests.at(-1).options.credentials, 'include',
      'dashboard cookie must be available for admin bypass');
  });

  it('posts json to a client endpoint with the installation key', async () => {
    const share = await client.apiJson(`${client.CLIENT_BASE}/settings-shares`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Team defaults', scopes: { settings: {} } }),
    });
    assert.equal(share.ok, true);
    assert.equal(requests.at(-1).url, 'https://api.cullenchampagne.com/projects/golfballs-extension/client/settings-shares');
    assert.equal(requests.at(-1).options.headers.get('Authorization'), `Bearer ${API_KEY}`);
    assert.equal(requests.at(-1).options.headers.get('Content-Type'), 'application/json');
    assert.equal(requests.at(-1).options.credentials, 'omit');
  });

  it('keeps local response-guard options out of the fetch call', async () => {
    const status = await client.apiJson('/projects/golfballs-extension/assistant/status', {
      responseLimit: 512 * 1024,
    });
    assert.equal(status.ok, true);
    assert.equal(requests.at(-1).url, 'https://api.cullenchampagne.com/projects/golfballs-extension/assistant/status');
    assert.equal(requests.at(-1).options.headers.get('Authorization'), `Bearer ${API_KEY}`);
    assert.equal(Object.hasOwn(requests.at(-1).options, 'responseLimit'), false,
      'local response guard options must not leak into fetch');
  });

  it('allows a multi-megabyte settings body through to fetch', async () => {
    const large = await client.apiFetch(`${client.CLIENT_BASE}/settings-shares`, {
      method: 'POST', body: 'x'.repeat(2_000_000),
    });
    assert.equal(large.status, 200, 'multi-megabyte settings must reach fetch');
    assert.equal(requests.at(-1).options.body.length, 2_000_000);
  });
});

describe('installation auth · guardrails', () => {
  it('blocks foreign origins, non-project paths, admin routes, and unsupported methods', async () => {
    await assert.rejects(
      client.apiFetch('https://evil.example/projects/golfballs-extension/client/ping'),
      /Blocked non-extension API path/,
    );
    await assert.rejects(client.apiFetch('/graph/search'), /Blocked non-extension API path/);
    await assert.rejects(
      client.apiFetch('/projects/golfballs-extension/assistant/admin/status'),
      /Blocked non-extension API path/,
    );
    await assert.rejects(
      client.apiFetch(`${client.CLIENT_BASE}/ping`, { method: 'DELETE' }),
      /Blocked extension API method/,
    );
  });

  it('does not silently re-enroll after the server rejects the key', async () => {
    const revoked = await client.apiFetch(`${client.CLIENT_BASE}/revoked`);
    assert.equal(revoked.status, 401);
    await client.ensureInstallation();
    assert.equal(
      requests.filter(({ url }) => url.endsWith('/auth/extension-installation')).length, 1,
      'a rejected key must not silently re-enroll and evade server revocation',
    );
  });
});
