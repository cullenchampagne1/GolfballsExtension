/** Regression test for anonymous first-install enrollment and API-key reuse. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
const source = await readFile(new URL('lib/installation-auth.js', root), 'utf8');
const expectedId = createHash('sha256')
  .update(Buffer.from(manifest.key, 'base64'))
  .digest('hex')
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (digit) => 'abcdefghijklmnop'[Number.parseInt(digit, 16)]);
assert.equal(expectedId, 'annoeoeiijgdgmlpefllibcilcamnjek');
assert.ok(manifest.host_permissions.includes('https://api.cullenchampagne.com/*'));

const stored = {};
const installedListeners = [];
const startupListeners = [];
const requests = [];
const installationId = '12345678-1234-4234-8234-123456789abc';
const apiKey = `rsk_${'a'.repeat(12)}_${'B'.repeat(48)}`;

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
      get(key, callback) {
        callback({ [key]: stored[key] });
      },
      set(values, callback) {
        Object.assign(stored, values);
        callback?.();
      },
    },
  },
};

async function mockFetch(url, options = {}) {
  requests.push({ url: String(url), options });
  if (String(url).endsWith('/auth/extension-installation')) {
    return new Response(JSON.stringify({
      installation_id: installationId,
      api_key: apiKey,
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
  chrome,
  console,
  fetch: mockFetch,
  Headers,
  Response,
  URL,
  Date,
  Error,
  Object,
  Promise,
  String,
  Number,
  JSON,
  TextDecoder,
  setTimeout,
  clearTimeout,
});
context.globalThis = context;
new vm.Script(source, { filename: 'installation-auth.js' }).runInContext(context);

assert.equal(installedListeners.length, 0, 'the runtime coordinator owns install bootstrapping');
assert.equal(startupListeners.length, 0, 'installation auth does not own worker startup');
await context.GBInstallationAuth.ensureInstallation();
for (let attempt = 0; attempt < 10 && !stored.gbApiInstallation; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const enrollmentRequest = requests.find(({ url }) => url.endsWith('/auth/extension-installation'));
assert.ok(enrollmentRequest, 'first install must enroll exactly once');
assert.equal(enrollmentRequest.url, 'https://api.cullenchampagne.com/auth/extension-installation');
assert.equal(enrollmentRequest.options.credentials, 'omit');
assert.equal(enrollmentRequest.options.redirect, 'error');
assert.equal(stored.gbApiInstallation.installationId, installationId);
assert.equal(stored.gbApiInstallation.apiKey, apiKey);
assert.equal(stored.gbApiInstallation.extensionId, expectedId);

const client = context.GBInstallationAuth;
await client.ensureInstallation();
assert.equal(
  requests.filter(({ url }) => url.endsWith('/auth/extension-installation')).length,
  1,
  'startup and repeated ensure must reuse the installation key',
);

const status = await client.getStatus();
assert.equal(status.enrolled, true);
assert.equal(status.installationId, installationId);
assert.equal(Object.hasOwn(status, 'apiKey'), false, 'status must never expose the secret');

const apiResponse = await client.apiFetch(`${client.CLIENT_BASE}/ping`, {
  method: 'POST',
  headers: { Authorization: 'Bearer caller-controlled' },
});
assert.equal(apiResponse.status, 200);
assert.equal(requests.at(-1).options.headers.get('Authorization'), `Bearer ${apiKey}`);
assert.equal(requests.at(-1).options.credentials, 'omit');

const configuration = await client.fetchConfiguration();
assert.deepEqual(configuration, { ok: true });
assert.equal(requests.at(-1).url, 'https://api.cullenchampagne.com/projects/golfballs-extension/client/configuration');
assert.equal(requests.at(-1).options.headers.Authorization, `Bearer ${apiKey}`);
assert.equal(requests.at(-1).options.credentials, 'include', 'dashboard cookie must be available for admin bypass');

const shareResponse = await client.apiJson(`${client.CLIENT_BASE}/settings-shares`, {
  method: 'POST',
  body: JSON.stringify({ name: 'Team defaults', scopes: { settings: {} } }),
});
assert.equal(shareResponse.ok, true);
assert.equal(requests.at(-1).url, 'https://api.cullenchampagne.com/projects/golfballs-extension/client/settings-shares');
assert.equal(requests.at(-1).options.headers.get('Authorization'), `Bearer ${apiKey}`);
assert.equal(requests.at(-1).options.headers.get('Content-Type'), 'application/json');
assert.equal(requests.at(-1).options.credentials, 'omit');

const assistantStatus = await client.apiJson('/projects/golfballs-extension/assistant/status', {
  responseLimit: 512 * 1024,
});
assert.equal(assistantStatus.ok, true);
assert.equal(requests.at(-1).url, 'https://api.cullenchampagne.com/projects/golfballs-extension/assistant/status');
assert.equal(requests.at(-1).options.headers.get('Authorization'), `Bearer ${apiKey}`);
assert.equal(Object.hasOwn(requests.at(-1).options, 'responseLimit'), false, 'local response guard options must not leak into fetch');

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
const largeSettingsResponse = await client.apiFetch(`${client.CLIENT_BASE}/settings-shares`, {
  method: 'POST', body: 'x'.repeat(2_000_000),
});
assert.equal(largeSettingsResponse.status, 200, 'multi-megabyte settings must reach fetch');
assert.equal(requests.at(-1).options.body.length, 2_000_000);

const revoked = await client.apiFetch(`${client.CLIENT_BASE}/revoked`);
assert.equal(revoked.status, 401);
await client.ensureInstallation();
assert.equal(
  requests.filter(({ url }) => url.endsWith('/auth/extension-installation')).length,
  1,
  'a rejected key must not silently re-enroll and evade server revocation',
);

console.log('installation enrollment tests passed');
