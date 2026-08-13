/**
 * Remote / update-channel integrity.
 *
 * Guards the self-hosted Chrome auto-update channel against drift by
 * cross-checking the in-repo sources of truth: the manifest's `update_url`, the
 * extension-id pin, and the shipped web-accessible resources.
 *
 * The RevStack project files (`revstack.project.json`, `.revstack/routes.py`)
 * and the sibling production/backend repos are LOCAL-ONLY and untracked, so the
 * checks that need them skip when they are absent rather than failing a clone.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (rel) => readFile(new URL(rel, root), 'utf8');
const present = (rel) => existsSync(new URL(rel, root));

const API_ORIGIN = 'https://api.cullenchampagne.com';
const PROJECT_ID = 'golfballs-extension';
const CHANNEL_BASE = `/projects/${PROJECT_ID}`;
const UPDATES_PATH = `${CHANNEL_BASE}/updates.xml`;
const RELEASES_GLOB = `${CHANNEL_BASE}/releases/*`;

const manifest = JSON.parse(await read('manifest.json'));

function compareChromeVersions(left, right) {
  const parts = (value) => String(value || '').split('.').map((item) => Number(item) || 0);
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  }
  return 0;
}

const derivedId = createHash('sha256')
  .update(Buffer.from(manifest.key, 'base64'))
  .digest('hex')
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (d) => 'abcdefghijklmnop'[Number.parseInt(d, 16)]);

describe('update channel · manifest', () => {
  it('points update_url at https on the API origin with no query string', () => {
    const updateUrl = new URL(manifest.update_url);
    assert.equal(updateUrl.protocol, 'https:', 'update_url must be https');
    assert.equal(updateUrl.origin, API_ORIGIN, 'update_url must live on the API origin');
    assert.equal(updateUrl.search, '', 'update_url must not carry a query string');
  });

  it('targets the project-owned channel, not the retired core route', () => {
    const updateUrl = new URL(manifest.update_url);
    assert.equal(updateUrl.pathname, UPDATES_PATH,
      `update_url must target ${UPDATES_PATH} (core /extension/updates.xml was retired)`);
    assert.ok(!updateUrl.pathname.startsWith('/extension/'),
      'update_url must not point at the removed core /extension/* channel');
  });

  it('pins the published extension id', () => {
    assert.equal(derivedId, 'annoeoeiijgdgmlpefllibcilcamnjek', 'derived extension id changed');
  });

  it('carries a sane published-looking version', () => {
    assert.match(manifest.version, /^\d+\.\d+(\.\d+)?(\.\d+)?$/, 'manifest version malformed');
  });

  it('holds host permission for the API origin', () => {
    assert.ok(manifest.host_permissions.includes(`${API_ORIGIN}/*`),
      'host_permissions must include the API origin');
  });

  it('ships every declared web-accessible resource', () => {
    const warFiles = (manifest.web_accessible_resources ?? []).flatMap((e) => e.resources ?? []);
    assert.ok(warFiles.length > 0, 'expected web_accessible_resources to be declared');
    for (const rel of warFiles) {
      assert.ok(present(rel), `web_accessible_resource missing on disk: ${rel}`);
    }
  });
});

describe('update channel · RevStack project wiring (local-only files)', () => {
  it('declares the channel routes public', { skip: !present('revstack.project.json') }, async () => {
    const project = JSON.parse(await read('revstack.project.json'));
    const publicRoutes = project.public_routes ?? [];
    const declares = (method, path) =>
      publicRoutes.some((r) => r.method === method && r.path === path);
    assert.ok(declares('GET', UPDATES_PATH), `revstack.project.json must expose GET ${UPDATES_PATH}`);
    assert.ok(declares('GET', RELEASES_GLOB), `revstack.project.json must expose GET ${RELEASES_GLOB}`);
  });

  it('pins the extension origin in cors_origins', { skip: !present('revstack.project.json') }, async () => {
    const project = JSON.parse(await read('revstack.project.json'));
    const pinnedOrigin = `chrome-extension://${derivedId}`;
    assert.ok((project.cors_origins ?? []).includes(pinnedOrigin),
      `revstack.project.json cors_origins must pin ${pinnedOrigin}`);
  });

  it('serves the channel from the project routes', { skip: !present('.revstack/routes.py') }, async () => {
    const routesSrc = await read('.revstack/routes.py');
    assert.match(routesSrc, /@router\.get\(\s*["']\/updates\.xml["']/,
      '.revstack/routes.py must serve /updates.xml');
    assert.match(routesSrc, /@router\.get\(\s*["']\/releases\/\{file_name\}["']/,
      '.revstack/routes.py must serve /releases/{file_name}');
  });
});

describe('update channel · cross-repo (skipped when siblings are absent)', () => {
  const publishedXml = '.golfballs-extension-production/public/updates.xml';
  const coreExtension = '../revstack-backend/routes/extension.py';

  it('keeps the source at or ahead of the published updates.xml and verifies its real .crx', { skip: !present(publishedXml) }, async () => {
    const xml = await read(publishedXml);
    assert.equal(xml.match(/appid=['"]([a-p]{32})['"]/)?.[1], derivedId,
      'published updates.xml appid must match the extension id');
    const publishedVersion = xml.match(/<updatecheck[^>]*\bversion=['"]([^'"]+)['"]/)?.[1];
    assert.ok(compareChromeVersions(manifest.version, publishedVersion) >= 0,
      `source version ${manifest.version} must not trail published version ${publishedVersion}`);
    const codebase = xml.match(/codebase=['"]([^'"]+)['"]/)?.[1];
    assert.ok(codebase, 'published updates.xml must carry a codebase');
    const cb = new URL(codebase);
    assert.equal(cb.origin, API_ORIGIN, 'codebase must live on the API origin');
    assert.ok(cb.pathname.startsWith(`${CHANNEL_BASE}/releases/`),
      `codebase must serve from ${CHANNEL_BASE}/releases/ (was ${cb.pathname})`);
    const crxName = cb.pathname.split('/').pop();
    assert.ok(present(`.golfballs-extension-production/public/releases/${crxName}`),
      `codebase references a missing .crx: ${crxName}`);
  });

  it('keeps core from resurrecting the retired channel', { skip: !present(coreExtension) }, async () => {
    const coreSrc = await read(coreExtension);
    assert.ok(!/@router\.(get|post)\(\s*["']\/updates\.xml/.test(coreSrc),
      'core routes/extension.py must not serve /updates.xml (channel is project-owned)');
    assert.ok(!/@router\.(get|post)\(\s*["']\/releases/.test(coreSrc),
      'core routes/extension.py must not serve /releases (channel is project-owned)');
  });
});
