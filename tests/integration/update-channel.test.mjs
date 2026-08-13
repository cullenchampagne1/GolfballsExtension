/**
 * Integration flow — the self-hosted update channel.
 *
 * Chains manifest.json (public key → deterministic extension id) →
 * revstack.project.json (declared public routes / CORS) → the published
 * ../.golfballs-extension-production/public/updates.xml (appid / version /
 * codebase) → the .crx artifact on disk. Publication assertions skip
 * gracefully when the production folder is not checked out.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST, ROOT } from './helpers/harness.mjs';

const PROJECT = JSON.parse(readFileSync(new URL('revstack.project.json', ROOT), 'utf8'));
const PROD_PUBLIC = new URL('../.golfballs-extension-production/public/', ROOT);
const UPDATES_URL = new URL('updates.xml', PROD_PUBLIC);
const hasProduction = existsSync(UPDATES_URL);
const PUBLISHER_PATH = fileURLToPath(new URL('golfballs', ROOT));
const PUBLISHER_SOURCE = readFileSync(PUBLISHER_PATH, 'utf8');

/** Chrome's extension id: sha256(DER public key), first 32 hex chars mapped 0-f → a-p. */
function deriveExtensionId(manifestKey) {
  return createHash('sha256')
    .update(Buffer.from(manifestKey, 'base64'))
    .digest('hex')
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) => 'abcdefghijklmnop'[Number.parseInt(digit, 16)]);
}

const extensionId = deriveExtensionId(MANIFEST.key);

function loadPublisherConfig(localConfig) {
  const fixture = mkdtempSync(resolve(tmpdir(), 'golfballs-publisher-config-'));
  const configPath = resolve(fixture, 'config.json');
  if (localConfig) writeFileSync(configPath, JSON.stringify(localConfig));
  const script = String.raw`
import json, runpy, sys
from pathlib import Path
module = runpy.run_path(sys.argv[1])
module["load_config"].__globals__["CONFIG_PATH"] = Path(sys.argv[2])
print(json.dumps(module["load_config"]()))
`;
  try {
    const result = spawnSync('python3', [
      '-c', script, PUBLISHER_PATH, configPath,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || 'release manager config probe failed');
    return JSON.parse(result.stdout);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

function probeSelfHostedConsumerZip() {
  const script = String.raw`
import io, json, runpy, sys, tempfile, zipfile
from pathlib import Path
module = runpy.run_path(sys.argv[1])
with tempfile.TemporaryDirectory() as directory:
    store_path = Path(directory) / "store.zip"
    with zipfile.ZipFile(store_path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps({
            "manifest_version": 3,
            "name": "Consumer fixture",
            "version": "1.2.3",
            "permissions": ["storage"],
        }))
        archive.writestr("runtime.js", "globalThis.consumerOnly = true;")
    data, _ = module["self_hosted_consumer_zip"](
        store_path,
        {
            "version": "1.2.3",
            "key": "pinned-public-key",
            "update_url": "https://example.com/updates.xml",
        },
    )
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        print(json.dumps({
            "manifest": json.loads(archive.read("manifest.json")),
            "runtime": archive.read("runtime.js").decode(),
            "names": sorted(archive.namelist()),
        }))
`;
  const result = spawnSync('python3', ['-c', script, PUBLISHER_PATH], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || 'self-hosted package probe failed');
  return JSON.parse(result.stdout);
}

function parseUpdatesXml(xml) {
  const appid = (xml.match(/<app\s+appid='([^']*)'/) || [])[1] || '';
  const updatecheck = (xml.match(/<updatecheck\s+([^>]*)\/>/) || [])[1] || '';
  const grab = (attr) => (updatecheck.match(new RegExp(`${attr}='([^']*)'`)) || [])[1] || '';
  return { appid, version: grab('version'), codebase: grab('codebase') };
}

describe('update channel', () => {
  it('publishes from main and migrates the retired production-branch default', () => {
    assert.equal(loadPublisherConfig().branch, 'main');
    assert.equal(loadPublisherConfig({ branch: 'production' }).branch, 'main');
    assert.equal(loadPublisherConfig({ branch: 'release-candidate' }).branch, 'release-candidate');
  });

  it('makes the admin-stripped consumer target mandatory before signing either distribution', () => {
    const start = PUBLISHER_SOURCE.indexOf('def cmd_publish');
    const end = PUBLISHER_SOURCE.indexOf('\ndef cmd_releases', start);
    const publish = PUBLISHER_SOURCE.slice(start, end);
    const consumerIndex = publish.indexOf('run(["npm", "run", "pack:store"], cwd=WORKSPACE');
    const hostedIndex = publish.indexOf('self_hosted_consumer_zip(workspace_store_zip, manifest)');
    const signingIndex = publish.indexOf('pack_crx3(zip_bytes, KEY_PATH)');

    assert.ok(consumerIndex >= 0, 'publish must run the GB_ADMIN=0 consumer packager');
    assert.ok(hostedIndex > consumerIndex, 'the signed-channel ZIP must derive from that consumer package');
    assert.ok(signingIndex > hostedIndex, 'CRX signing must happen only after consumer transformation');
    assert.doesNotMatch(publish, /build_zip\(config\)/, 'the full/admin workspace must never be packed directly');
  });

  it('adds only self-hosting metadata back to the unchanged consumer runtime', () => {
    const result = probeSelfHostedConsumerZip();
    assert.deepEqual(result.names, ['manifest.json', 'runtime.js']);
    assert.equal(result.runtime, 'globalThis.consumerOnly = true;');
    assert.equal(result.manifest.version, '1.2.3');
    assert.equal(result.manifest.key, 'pinned-public-key');
    assert.equal(result.manifest.update_url, 'https://example.com/updates.xml');
    assert.deepEqual(result.manifest.permissions, ['storage']);
  });

  it('pins the manifest key to the deterministic extension id used across the project', () => {
    assert.match(extensionId, /^[a-p]{32}$/);
    assert.ok(
      PROJECT.cors_origins.includes(`chrome-extension://${extensionId}`),
      'revstack CORS allowlist must name the derived extension origin',
    );
  });

  it('declares the update endpoints as public revstack routes matching the manifest update_url', () => {
    const updateUrl = new URL(MANIFEST.update_url);
    assert.equal(updateUrl.origin, 'https://api.cullenchampagne.com');
    assert.ok(
      PROJECT.public_routes.some((route) => route.method === 'GET' && route.path === updateUrl.pathname),
      `public_routes must expose ${updateUrl.pathname}`,
    );
    assert.ok(
      PROJECT.public_routes.some((route) => route.method === 'GET' && route.path.endsWith('/releases/*')),
      'public_routes must expose the release artifacts',
    );
    assert.ok(
      MANIFEST.host_permissions.includes('https://api.cullenchampagne.com/*'),
      'the extension must be permitted to reach its own update origin',
    );
  });

  it('publishes updates.xml whose appid/version/codebase chain back to the manifest', { skip: !hasProduction && 'production folder not checked out' }, () => {
    const { appid, version, codebase } = parseUpdatesXml(readFileSync(UPDATES_URL, 'utf8'));
    assert.equal(appid, extensionId, 'updates.xml must target the derived extension id');
    assert.equal(version, MANIFEST.version, 'the published version must match the manifest');

    const codebaseUrl = new URL(codebase);
    assert.equal(codebaseUrl.origin, new URL(MANIFEST.update_url).origin, 'the crx must be served from the update origin');
    const releasesRoute = PROJECT.public_routes.find((route) => route.path.endsWith('/releases/*'));
    assert.ok(
      codebaseUrl.pathname.startsWith(releasesRoute.path.replace(/\*$/, '')),
      'the codebase path must sit under the declared public releases route',
    );
    assert.ok(codebaseUrl.pathname.includes(version), 'release artifact is versioned');
  });

  it('keeps the published .crx artifact on disk for the advertised codebase', { skip: !hasProduction && 'production folder not checked out' }, () => {
    const { codebase } = parseUpdatesXml(readFileSync(UPDATES_URL, 'utf8'));
    const fileName = new URL(codebase).pathname.split('/').at(-1);
    assert.ok(
      existsSync(new URL(`releases/${fileName}`, PROD_PUBLIC)),
      `releases/${fileName} must exist next to updates.xml`,
    );
  });
});
