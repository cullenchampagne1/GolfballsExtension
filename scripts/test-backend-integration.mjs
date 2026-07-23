/**
 * Extension ↔ RevStack backend integration contract.
 *
 * Binds both sides of every backend call the extension makes so neither can
 * drift silently. For each endpoint it asserts (a) the extension source still
 * calls it and (b) — when the backend sibling repo is present — a matching
 * route serves it. It also locks the enrollment + configuration response
 * shapes and the `apiFetch` security guard (origin + project client path +
 * GET/POST only). No live server or CRM context is required: this reads source.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (rel, base = root) => readFile(new URL(rel, base), 'utf8');

const installationAuth = await read('lib/installation-auth.js');
const background = await read('background.js');
const remotePolicy = await read('lib/remote-settings-policy.js');
const runtimeBootstrap = await read('lib/runtime-bootstrap.js');
const relayPoll = await read('lib/email-relay-poll.js');
const helpAssistant = await read('help/help-assistant.js');
const sources = {
  'installation-auth.js': installationAuth,
  'runtime-bootstrap.js': runtimeBootstrap,
  'background.js': background,
  'email-relay-poll.js': relayPoll,
  'help-assistant.js': helpAssistant,
};
const projectRoutes = await read('.revstack/routes.py');
const clientApi = await read('.revstack/logic/client_api.py');

// Backend sibling is optional (standalone extension checkouts skip its half).
const backendRoot = new URL('../revstack-backend/', root);
const hasBackend = existsSync(backendRoot);
const extensionPy = hasBackend ? await read('routes/extension.py', backendRoot) : '';
const authPy = hasBackend ? await read('routes/auth.py', backendRoot) : '';
const relayRoot = new URL('../revstack-system-services/revstack-email-relay/', root);
const hasRelayService = existsSync(relayRoot);
const relayServicePy = hasRelayService
  ? await read('services/email_relay_service.py', relayRoot)
  : '';
if (!hasBackend) {
  console.log('  (skip) backend sibling absent — server-side route checks skipped');
}
if (!hasRelayService) {
  console.log('  (skip) email-relay service sibling absent — service route check skipped');
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
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

// --- Runtime project-client contract (each call ↔ each project route) --------
const RUNTIME = [
  { name: 'runtime:sync',           in: 'runtime-bootstrap.js', literal: "'projects', 'golfballs-extension', 'client', 'health'", method: 'get', route: '/client/health' },
  { name: 'identity:read',          in: 'installation-auth.js', literal: '/identity',                            method: 'get',  route: '/client/identity' },
  { name: 'identity:update',        in: 'installation-auth.js', literal: '/identity',                            method: 'post', route: '/client/identity' },
  { name: 'configuration',          in: 'installation-auth.js', literal: '/configuration',                       method: 'get',  route: '/client/configuration' },
  { name: 'tickets:list',           in: 'background.js',        literal: '/tickets',                             method: 'get',  route: '/client/tickets' },
  { name: 'tickets:create',         in: 'background.js',        literal: '/tickets',                             method: 'post', route: '/client/tickets' },
  { name: 'settings-shares:list',   in: 'background.js',        literal: '/settings-shares',                     method: 'get',  route: '/client/settings-shares' },
  { name: 'settings-shares:create', in: 'background.js',        literal: '/settings-shares',                     method: 'post', route: '/client/settings-shares' },
  { name: 'settings-share:get',     in: 'background.js',        literal: '/settings-shares/${',                  method: 'get',  route: '/client/settings-shares/{share_id}' },
  { name: 'settings-share:import',  in: 'background.js',        literal: '/imports',                            method: 'post', route: '/settings-shares/{share_id}/imports' },
  { name: 'settings-share:revoke',  in: 'background.js',        literal: '/revoke',                             method: 'post', route: '/settings-shares/{share_id}/revoke' },
  { name: 'email-shares:list',      in: 'background.js',        literal: '/email-template-shares',              method: 'get',  route: '/client/email-template-shares' },
  { name: 'email-share:create',     in: 'background.js',        literal: '/email-template-shares',               method: 'post', route: '/client/email-template-shares' },
  { name: 'email-share:get',        in: 'background.js',        literal: '/email-template-shares/${',            method: 'get',  route: '/client/email-template-shares/{share_id}' },
  { name: 'email-share:revoke',     in: 'background.js',        literal: '/revoke',                              method: 'post', route: '/client/email-template-shares/{share_id}/revoke' },
  { name: 'product-stores:list',    in: 'background.js',        literal: '/product-stores',                      method: 'get',  route: '/client/product-stores' },
  { name: 'product-stores:create',  in: 'background.js',        literal: '/product-stores',                      method: 'post', route: '/client/product-stores' },
  { name: 'product-store:get',      in: 'background.js',        literal: '/product-stores/${',                   method: 'get',  route: '/client/product-stores/{store_id}' },
  { name: 'product-store:revoke',   in: 'background.js',        literal: '/revoke',                              method: 'post', route: '/client/product-stores/{store_id}/revoke' },
  { name: 'email-exchange-flow',    in: 'background.js',        literal: '/email-exchange-flow',                 method: 'get',  route: '/client/email-exchange-flow' },
  { name: 'assistant:health',       in: 'help-assistant.js',     literal: '/health',                              method: 'get',  route: '/assistant/health' },
];

for (const ep of RUNTIME) {
  assert.ok(
    sources[ep.in].includes(ep.literal),
    `extension ${ep.in} must still call ${ep.name} (missing literal "${ep.literal}")`,
  );
  const route = ep.route.startsWith('/client/') || ep.route.startsWith('/assistant/')
    ? ep.route
    : `/client${ep.route}`;
  assert.ok(
    backendServes(projectRoutes, ep.method, route),
    `.revstack/routes.py must serve ${ep.method.toUpperCase()} ${route} (${ep.name})`,
  );
}

// --- Scoped standalone-service call -----------------------------------------
const RELAY_PENDING = '/services/email-relay-service/messages/pending';
assert.ok(
  relayPoll.includes(RELAY_PENDING),
  `extension email-relay-poll.js must call ${RELAY_PENDING}`,
);
assert.ok(
  installationAuth.includes(RELAY_PENDING),
  'installation API guard must explicitly allow the scoped email-relay poll',
);
if (hasRelayService) {
  assert.match(
    relayServicePy,
    /\(\s*["']GET["']\s*,\s*["']\/messages\/pending["']\s*\)/,
    'email-relay service must expose GET /messages/pending to scoped clients',
  );
}

assert.ok(clientApi.includes('class ExtensionClientApi'), 'product API logic must live in the extension project');
if (hasBackend) {
  assert.ok(extensionPy.includes('deprecated_extension_forwarder'), 'core /extension compatibility must be redirect-only');
}

// --- apiFetch security guard is intact ---------------------------------------
assert.ok(
  installationAuth.includes('url.pathname.startsWith(`${CLIENT_BASE}/`)'),
  'apiFetch must confine product requests to the project client path prefix',
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
      new RegExp(`["']${key}["']\\s*:`).test(clientApi),
      `project client configuration must return "${key}"`,
    );
  }
}
assert.ok(
  remotePolicy.includes('payload.schema_version !== 1'),
  'extension must pin configuration schema_version to 1',
);
if (hasBackend) {
  assert.ok(
    /["']schema_version["']\s*:\s*1\b/.test(clientApi),
    'project client configuration must emit schema_version 1',
  );
  assert.ok(
    /["']configuration["']\s*:/.test(clientApi),
    'project client configuration must return the "configuration" document field',
  );
}

console.log(
  `backend-integration OK — 1 enrollment + ${RUNTIME.length} project-client endpoints + ` +
    `1 scoped service endpoint bound, ` +
    `guard + enrollment + envelope shapes verified (backend ${hasBackend ? 'present' : 'absent'})`,
);
