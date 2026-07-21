/**
 * Extension ↔ RevStack backend integration contract.
 *
 * Binds both sides of every backend call the extension makes so neither can
 * drift silently. For each endpoint it asserts (a) the extension source still
 * calls it and (b) — when the backend sibling repo is present — a matching
 * route serves it. It also locks the enrollment + configuration response
 * shapes and the `apiFetch` security guard (origin + /extension/ path +
 * GET/POST only). No live server or CRM context is required: this reads source.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (rel, base = root) => readFile(new URL(rel, base), 'utf8');

const installationAuth = await read('installation-auth.js');
const background = await read('background.js');
const remotePolicy = await read('remote-settings-policy.js');
const sources = { 'installation-auth.js': installationAuth, 'background.js': background };

// Backend sibling is optional (standalone extension checkouts skip its half).
const backendRoot = new URL('../revstack-backend/', root);
const hasBackend = existsSync(backendRoot);
const extensionPy = hasBackend ? await read('routes/extension.py', backendRoot) : '';
const authPy = hasBackend ? await read('routes/auth.py', backendRoot) : '';
if (!hasBackend) {
  console.log('  (skip) backend sibling absent — server-side route checks skipped');
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// extension.py routes mount under /extension, so match the RELATIVE decorator.
const backendServes = (src, method, relPath) =>
  new RegExp(`@router\\.${method}\\(\\s*["']${esc(relPath)}["']`).test(src);

// --- Enrollment: the one direct (non-apiFetch) call --------------------------
assert.ok(
  installationAuth.includes('/auth/extension-installation'),
  'extension must enroll via POST /auth/extension-installation',
);
if (hasBackend) {
  assert.ok(
    backendServes(authPy, 'post', '/extension-installation'),
    'backend routes/auth.py must serve POST /extension-installation',
  );
}

// --- Runtime /extension/* contract (each call ↔ each route) ------------------
const RUNTIME = [
  { name: 'identity:read',          in: 'installation-auth.js', literal: '/extension/identity',                 method: 'get',  route: '/identity' },
  { name: 'identity:update',        in: 'installation-auth.js', literal: '/extension/identity',                 method: 'post', route: '/identity' },
  { name: 'configuration',          in: 'installation-auth.js', literal: '/extension/configuration',            method: 'get',  route: '/configuration' },
  { name: 'settings-shares:list',   in: 'background.js',        literal: '/extension/settings-shares',          method: 'get',  route: '/settings-shares' },
  { name: 'settings-shares:create', in: 'background.js',        literal: '/extension/settings-shares',          method: 'post', route: '/settings-shares' },
  { name: 'settings-share:get',     in: 'background.js',        literal: '/extension/settings-shares/${',       method: 'get',  route: '/settings-shares/{share_id}' },
  { name: 'settings-share:import',  in: 'background.js',        literal: '/imports',                            method: 'post', route: '/settings-shares/{share_id}/imports' },
  { name: 'settings-share:revoke',  in: 'background.js',        literal: '/revoke',                             method: 'post', route: '/settings-shares/{share_id}/revoke' },
  { name: 'email-share:create',     in: 'background.js',        literal: '/extension/email-template-shares',    method: 'post', route: '/email-template-shares' },
  { name: 'email-share:get',        in: 'background.js',        literal: '/extension/email-template-shares/${', method: 'get',  route: '/email-template-shares/{share_id}' },
];

for (const ep of RUNTIME) {
  assert.ok(
    sources[ep.in].includes(ep.literal),
    `extension ${ep.in} must still call ${ep.name} (missing literal "${ep.literal}")`,
  );
  // Every runtime call goes through apiFetch/apiJson, so its path is /extension/*.
  assert.ok(
    `/extension${ep.route}`.startsWith('/extension/'),
    `${ep.name} must live under /extension/ to pass the apiFetch guard`,
  );
  if (hasBackend) {
    assert.ok(
      backendServes(extensionPy, ep.method, ep.route),
      `backend routes/extension.py must serve ${ep.method.toUpperCase()} ${ep.route} (${ep.name})`,
    );
  }
}

// --- apiFetch security guard is intact ---------------------------------------
assert.ok(
  installationAuth.includes("url.pathname.startsWith('/extension/')"),
  'apiFetch must confine requests to the /extension/ path prefix',
);
assert.ok(
  /url\.origin !== API_ORIGIN/.test(installationAuth),
  'apiFetch must confine requests to the API origin',
);
assert.ok(
  /\['GET', 'POST'\]\.includes\(method\)/.test(installationAuth),
  'apiFetch must allow only GET/POST methods',
);
assert.ok(
  installationAuth.includes("const ENROLLMENT_URL = `${API_ORIGIN}/auth/extension-installation`"),
  'ENROLLMENT_URL must resolve against the API origin',
);

// --- Enrollment response shape agreement -------------------------------------
for (const key of ['installation_id', 'api_key', 'key_prefix']) {
  assert.ok(installationAuth.includes(key), `extension must read enrollment field "${key}"`);
  if (hasBackend) {
    assert.ok(
      new RegExp(`["']${key}["']\\s*:`).test(authPy),
      `backend enrollment must return "${key}"`,
    );
  }
}
// Client-side credential validation gates must survive.
assert.match(installationAuth, /rsk_\[a-f0-9\]\{12\}_/, 'api_key validation regex must remain');
assert.match(installationAuth, /\[a-f0-9-\]\{32,40\}/, 'installation_id validation regex must remain');

// --- Configuration envelope shape agreement ----------------------------------
for (const key of ['schema_version', 'admin_bypass', 'revision']) {
  assert.ok(remotePolicy.includes(key), `extension validateEnvelope must inspect "${key}"`);
  if (hasBackend) {
    assert.ok(
      new RegExp(`["']${key}["']\\s*:`).test(extensionPy),
      `backend configuration must return "${key}"`,
    );
  }
}
assert.ok(
  remotePolicy.includes('payload.schema_version !== 1'),
  'extension must pin configuration schema_version to 1',
);
if (hasBackend) {
  assert.ok(
    /["']schema_version["']\s*:\s*1\b/.test(extensionPy),
    'backend configuration must emit schema_version 1',
  );
  assert.ok(
    /["']configuration["']\s*:/.test(extensionPy),
    'backend configuration must return the "configuration" document field',
  );
}

console.log(
  `backend-integration OK — 1 enrollment + ${RUNTIME.length} /extension/* endpoints bound, ` +
    `guard + enrollment + envelope shapes verified (backend ${hasBackend ? 'present' : 'absent'})`,
);
