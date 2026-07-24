/**
 * Extension ↔ RevStack backend integration contract.
 *
 * Binds both sides of every backend call the extension makes so neither can
 * drift silently: the extension source must still call the endpoint, and — when
 * the server-side sources are present — a matching route must serve it. Also
 * locks the enrollment/configuration response shapes and the `apiFetch` security
 * guard. Reads source only; no live server or CRM context required.
 *
 * The RevStack project files (`.revstack/**`) and the sibling backend /
 * email-relay repos are LOCAL-ONLY, so their halves skip when absent.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (rel, base = root) => readFile(new URL(rel, base), 'utf8');
const present = (rel, base = root) => existsSync(new URL(rel, base));

const installationAuth = await read('lib/installation-auth.js');
const background = await read('background.js');
const remotePolicy = await read('lib/remote-settings-policy.js');
const runtimeBootstrap = await read('lib/runtime-bootstrap.js');
// The relay poller is being renamed to a notifications poller; read whichever
// is on disk and skip its assertions when neither is, so an in-flight rename
// reports as a skip rather than crashing the whole contract suite at import.
const relayPollPath = ['lib/email-relay-poll.js', 'lib/notifications-poll.js']
  .find((candidate) => present(candidate)) || '';
const relayPoll = relayPollPath ? await read(relayPollPath) : '';
const helpAssistant = await read('help/help-assistant.js');
const sources = {
  'installation-auth.js': installationAuth,
  'runtime-bootstrap.js': runtimeBootstrap,
  'background.js': background,
  'email-relay-poll.js': relayPoll,
  'help-assistant.js': helpAssistant,
};

const hasProject = present('.revstack/routes.py');
const projectRoutes = hasProject ? await read('.revstack/routes.py') : '';
const clientApi = present('.revstack/logic/client_api.py') ? await read('.revstack/logic/client_api.py') : '';

const backendRoot = new URL('../revstack-backend/', root);
const hasBackend = existsSync(backendRoot);
const extensionPy = hasBackend ? await read('routes/extension.py', backendRoot) : '';
const authPy = hasBackend ? await read('routes/auth.py', backendRoot) : '';

const relayRoot = new URL('../revstack-system-services/revstack-email-relay/', root);
const hasRelayService = existsSync(relayRoot);
const relayServicePy = hasRelayService ? await read('services/email_relay_service.py', relayRoot) : '';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const backendServes = (src, method, relPath) =>
  new RegExp(`@router\\.${method}\\(\\s*["']${esc(relPath)}["']`).test(src);

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
  { name: 'mockups:studio',         in: 'background.js',        literal: '/product-generation/studio',           method: 'get',    route: '/client/product-generation/studio' },
  { name: 'mockups:products',       in: 'background.js',        literal: '/product-generation/products',         method: 'get',    route: '/client/product-generation/products' },
  { name: 'mockups:batches:list',   in: 'background.js',        literal: '/product-generation/batches',          method: 'get',    route: '/client/product-generation/batches' },
  { name: 'mockups:batches:create', in: 'background.js',        literal: '/product-generation/batches',          method: 'post',   route: '/client/product-generation/batches' },
  { name: 'mockups:batch:read',     in: 'background.js',        literal: '/product-generation/batches/${',       method: 'get',    route: '/client/product-generation/batches/{batch_id}' },
  { name: 'mockups:batch:cancel',   in: 'background.js',        literal: '/cancel',                              method: 'post',   route: '/client/product-generation/batches/{batch_id}/cancel' },
  { name: 'mockups:batch:delete',   in: 'background.js',        literal: 'productGenerationDeleteBatch',         method: 'delete', route: '/client/product-generation/batches/{batch_id}' },
  { name: 'mockups:job:result',     in: 'background.js',        literal: '/product-generation/jobs/${jobId}/result', method: 'get',  route: '/client/product-generation/jobs/{job_id}/result' },
  // Admin-only catalog authoring. These live under /client/... rather than
  // /product-generation/admin/... because apiFetch blocks admin paths; the
  // dashboard session cookie is what actually authorizes them.
  { name: 'mockups:catalog:read',   in: 'background.js',        literal: '/product-generation/catalog',          method: 'get',    route: '/client/product-generation/catalog' },
  { name: 'mockups:catalog:write',  in: 'background.js',        literal: '/product-generation/catalog',          method: 'post',   route: '/client/product-generation/catalog' },
  { name: 'mockups:catalog:refs',   in: 'background.js',        literal: '/product-generation/catalog/references', method: 'post', route: '/client/product-generation/catalog/references' },
  { name: 'assistant:health',       in: 'help-assistant.js',    literal: '/health',                              method: 'get',  route: '/assistant/health' },
];

const RELAY_PENDING = '/services/email-relay-service/messages/pending';

describe('backend contract · enrollment', () => {
  it('enrolls through POST /auth/extension-installation', () => {
    assert.ok(installationAuth.includes('/auth/extension-installation'),
      'extension must enroll via POST /auth/extension-installation');
  });

  it('is served by the core auth route', { skip: !hasBackend }, () => {
    assert.ok(backendServes(authPy, 'post', '/extension-installation'),
      'backend routes/auth.py must serve POST /extension-installation');
  });

  it('agrees on the enrollment response fields', () => {
    for (const key of ['installation_id', 'api_key', 'key_prefix']) {
      assert.ok(installationAuth.includes(key), `extension must read enrollment field "${key}"`);
      if (hasBackend) {
        assert.ok(new RegExp(`["']${key}["']\\s*:`).test(authPy), `backend enrollment must return "${key}"`);
      }
    }
  });

  it('keeps the client-side credential validation gates', () => {
    assert.match(installationAuth, /rsk_\[a-f0-9\]\{12\}_/, 'api_key validation regex must remain');
    assert.match(installationAuth, /\[a-f0-9-\]\{32,40\}/, 'installation_id validation regex must remain');
  });
});

describe('backend contract · project client endpoints', () => {
  for (const ep of RUNTIME) {
    it(`extension still calls ${ep.name}`, () => {
      assert.ok(sources[ep.in].includes(ep.literal),
        `extension ${ep.in} must still call ${ep.name} (missing literal "${ep.literal}")`);
    });
  }

  it('every called endpoint has a matching project route', { skip: !hasProject }, () => {
    for (const ep of RUNTIME) {
      const route = ep.route.startsWith('/client/') || ep.route.startsWith('/assistant/')
        ? ep.route
        : `/client${ep.route}`;
      assert.ok(backendServes(projectRoutes, ep.method, route),
        `.revstack/routes.py must serve ${ep.method.toUpperCase()} ${route} (${ep.name})`);
    }
  });

  it('keeps the product API logic in the extension project', { skip: !clientApi }, () => {
    assert.ok(clientApi.includes('class ExtensionClientApi'),
      'product API logic must live in the extension project');
  });

  it('keeps core /extension compatibility redirect-only', { skip: !hasBackend }, () => {
    assert.ok(extensionPy.includes('deprecated_extension_forwarder'),
      'core /extension compatibility must be redirect-only');
  });
});

describe('backend contract · scoped email-relay service', () => {
  it('polls the standalone service and allows it through the API guard', {
    skip: relayPollPath !== 'lib/email-relay-poll.js'
      && 'relay poller renamed — notifications transport owns this contract now',
  }, () => {
    assert.ok(relayPoll.includes(RELAY_PENDING),
      `extension ${relayPollPath} must call ${RELAY_PENDING}`);
    assert.ok(installationAuth.includes(RELAY_PENDING),
      'installation API guard must explicitly allow the scoped email-relay poll');
  });

  it('is exposed by the service to scoped clients', { skip: !hasRelayService }, () => {
    assert.match(relayServicePy, /\(\s*["']GET["']\s*,\s*["']\/messages\/pending["']\s*\)/,
      'email-relay service must expose GET /messages/pending to scoped clients');
  });
});

describe('backend contract · apiFetch security guard', () => {
  it('confines requests to the API origin and project client path with one narrow DELETE route', () => {
    assert.ok(installationAuth.includes('url.pathname.startsWith(`${CLIENT_BASE}/`)'),
      'apiFetch must confine product requests to the project client path prefix');
    assert.ok(/url\.origin !== API_ORIGIN/.test(installationAuth),
      'apiFetch must confine requests to the API origin');
    assert.ok(/\['GET', 'POST'\]\.includes\(method\)/.test(installationAuth),
      'ordinary client routes must allow only GET/POST methods');
    assert.ok(installationAuth.includes('/product-generation/batches/batch_[a-f0-9]{32}$'),
      'DELETE must be confined to a concrete product-generation batch id');
    assert.ok(installationAuth.includes("const ENROLLMENT_URL = `${API_ORIGIN}/auth/extension-installation`"),
      'ENROLLMENT_URL must resolve against the API origin');
  });
});

describe('backend contract · configuration envelope', () => {
  it('inspects the envelope fields on the extension side', () => {
    for (const key of ['schema_version', 'admin_bypass', 'revision']) {
      assert.ok(remotePolicy.includes(key), `extension validateEnvelope must inspect "${key}"`);
    }
    assert.ok(remotePolicy.includes('payload.schema_version !== 1'),
      'extension must pin configuration schema_version to 1');
  });

  it('returns the same envelope from the project client', { skip: !clientApi }, () => {
    for (const key of ['schema_version', 'admin_bypass', 'revision']) {
      assert.ok(new RegExp(`["']${key}["']\\s*:`).test(clientApi),
        `project client configuration must return "${key}"`);
    }
    assert.ok(/["']schema_version["']\s*:\s*1\b/.test(clientApi),
      'project client configuration must emit schema_version 1');
    assert.ok(/["']configuration["']\s*:/.test(clientApi),
      'project client configuration must return the "configuration" document field');
  });
});
