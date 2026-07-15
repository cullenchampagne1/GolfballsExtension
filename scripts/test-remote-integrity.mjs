/**
 * Remote / update-channel integrity.
 *
 * Guards the self-hosted Chrome auto-update remote against drift. Everything
 * here is deterministic and needs no live backend or CRM: it cross-checks the
 * three in-repo sources of truth for the update channel — the manifest's
 * `update_url`, the project's declared `public_routes`, and the project route
 * handlers in `.revstack/routes.py` — plus the extension-id pin and the shipped
 * web-accessible resources. When the sibling production channel / backend repos
 * are present it also verifies the published `updates.xml` and that core no
 * longer serves the retired `/extension/updates.xml`.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const read = (rel, base = root) => readFile(new URL(rel, base), 'utf8');

const API_ORIGIN = 'https://api.cullenchampagne.com';
const PROJECT_ID = 'golfballs-extension';
const CHANNEL_BASE = `/projects/${PROJECT_ID}`;
const UPDATES_PATH = `${CHANNEL_BASE}/updates.xml`;
const RELEASES_GLOB = `${CHANNEL_BASE}/releases/*`;

const manifest = JSON.parse(await read('manifest.json'));
const project = JSON.parse(await read('revstack.project.json'));

// --- 1. update_url is a well-formed URL on the API origin --------------------
const updateUrl = new URL(manifest.update_url);
assert.equal(updateUrl.protocol, 'https:', 'update_url must be https');
assert.equal(updateUrl.origin, API_ORIGIN, 'update_url must live on the API origin');
assert.equal(updateUrl.search, '', 'update_url must not carry a query string');

// --- 2. update_url points at the project-owned channel, not retired core -----
assert.equal(
  updateUrl.pathname,
  UPDATES_PATH,
  `update_url must target ${UPDATES_PATH} (core /extension/updates.xml was retired)`,
);
assert.ok(
  !updateUrl.pathname.startsWith('/extension/'),
  'update_url must not point at the removed core /extension/* channel',
);

// --- 3. the project DECLARES that channel public (unauthenticated) -----------
const publicRoutes = project.public_routes ?? [];
const declares = (method, path) =>
  publicRoutes.some((r) => r.method === method && r.path === path);
assert.ok(declares('GET', UPDATES_PATH), `revstack.project.json must expose GET ${UPDATES_PATH}`);
assert.ok(declares('GET', RELEASES_GLOB), `revstack.project.json must expose GET ${RELEASES_GLOB}`);

// --- 4. the project actually SERVES that channel -----------------------------
// Routes mount under /projects/golfballs-extension, so the handlers are the
// relative "/updates.xml" and "/releases/{file_name}" decorators.
const routesSrc = await read('.revstack/routes.py');
assert.match(
  routesSrc,
  /@router\.get\(\s*["']\/updates\.xml["']/,
  '.revstack/routes.py must serve /updates.xml',
);
assert.match(
  routesSrc,
  /@router\.get\(\s*["']\/releases\/\{file_name\}["']/,
  '.revstack/routes.py must serve /releases/{file_name}',
);

// --- 5. extension-id pin is internally consistent ----------------------------
const derivedId = createHash('sha256')
  .update(Buffer.from(manifest.key, 'base64'))
  .digest('hex')
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (d) => 'abcdefghijklmnop'[Number.parseInt(d, 16)]);
assert.equal(derivedId, 'annoeoeiijgdgmlpefllibcilcamnjek', 'derived extension id changed');
const pinnedOrigin = `chrome-extension://${derivedId}`;
assert.ok(
  (project.cors_origins ?? []).includes(pinnedOrigin),
  `revstack.project.json cors_origins must pin ${pinnedOrigin}`,
);

// --- 6. version is a sane, published-looking version -------------------------
assert.match(manifest.version, /^\d+\.\d+(\.\d+)?(\.\d+)?$/, 'manifest version malformed');

// --- 7. host_permissions cover the update + API origin -----------------------
assert.ok(
  manifest.host_permissions.includes(`${API_ORIGIN}/*`),
  'host_permissions must include the API origin',
);

// --- 8. every shipped web-accessible resource exists on disk -----------------
const warFiles = (manifest.web_accessible_resources ?? []).flatMap((e) => e.resources ?? []);
assert.ok(warFiles.length > 0, 'expected web_accessible_resources to be declared');
for (const rel of warFiles) {
  assert.ok(existsSync(new URL(rel, root)), `web_accessible_resource missing on disk: ${rel}`);
}

// --- 9. cross-repo (skipped when the monorepo siblings are absent) -----------
let crossCount = 0;

// 9a. the published updates.xml matches the manifest and links a real .crx.
const publishedXmlPath = new URL('../.golfballs-extension-production/public/updates.xml', root);
if (existsSync(publishedXmlPath)) {
  const xml = await readFile(publishedXmlPath, 'utf8');
  const appId = xml.match(/appid=['"]([a-p]{32})['"]/)?.[1];
  assert.equal(appId, derivedId, 'published updates.xml appid must match the extension id');
  const version = xml.match(/<updatecheck[^>]*\bversion=['"]([^'"]+)['"]/)?.[1];
  assert.equal(version, manifest.version, 'published updates.xml version must match the manifest');
  const codebase = xml.match(/codebase=['"]([^'"]+)['"]/)?.[1];
  assert.ok(codebase, 'published updates.xml must carry a codebase');
  const cb = new URL(codebase);
  assert.equal(cb.origin, API_ORIGIN, 'codebase must live on the API origin');
  assert.ok(
    cb.pathname.startsWith(`${CHANNEL_BASE}/releases/`),
    `codebase must serve from ${CHANNEL_BASE}/releases/ (was ${cb.pathname})`,
  );
  const crxName = cb.pathname.split('/').pop();
  const crxOnDisk = new URL(`../.golfballs-extension-production/public/releases/${crxName}`, root);
  assert.ok(existsSync(crxOnDisk), `codebase references a missing .crx: ${crxName}`);
  crossCount += 1;
} else {
  console.log('  (skip) production channel sibling not present — published updates.xml unchecked');
}

// 9b. core backend must NOT resurrect the retired /extension/updates.xml route.
const coreExtPath = new URL('../revstack-backend/routes/extension.py', root);
if (existsSync(coreExtPath)) {
  const coreSrc = await readFile(coreExtPath, 'utf8');
  assert.ok(
    !/@router\.(get|post)\(\s*["']\/updates\.xml/.test(coreSrc),
    'core routes/extension.py must not serve /updates.xml (channel is project-owned)',
  );
  assert.ok(
    !/@router\.(get|post)\(\s*["']\/releases/.test(coreSrc),
    'core routes/extension.py must not serve /releases (channel is project-owned)',
  );
  crossCount += 1;
} else {
  console.log('  (skip) backend sibling not present — core route retirement unchecked');
}

console.log(
  `remote-integrity OK — update_url→${UPDATES_PATH}, id ${derivedId}, ` +
    `${warFiles.length} resources, ${crossCount}/2 cross-repo checks (root ${rootPath})`,
);
