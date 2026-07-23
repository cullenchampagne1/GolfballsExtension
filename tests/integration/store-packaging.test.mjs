import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { buildStorePackage } from '../../scripts/package-store.mjs';

function writeFixture(root, path, contents = '') {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function fakePng(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function readZipEntries(zip) {
  const entries = new Map();
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = zip.toString('utf8', nameStart, nameStart + nameLength);
    const dataStart = nameStart + nameLength + extraLength;
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, method === 8 ? inflateRawSync(compressed) : compressed);
    offset = dataStart + compressedSize;
  }
  return entries;
}

function createFixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'golfballs-store-package-'));
  writeFixture(root, 'package.json', JSON.stringify({ name: 'fixture-extension', version: '1.2.3' }));
  writeFixture(root, 'manifest.json', JSON.stringify({
    manifest_version: 3,
    name: 'Store fixture',
    version: '0.0.1',
    key: 'legacy-self-hosting-key',
    update_url: 'https://example.com/updates.xml',
    permissions: ['storage', 'nativeMessaging'],
    background: { service_worker: 'background.js' },
    action: { default_popup: 'popup.html' },
    content_scripts: [{ matches: ['https://example.com/*'], js: ['src/vanilla/runtime.js'] }],
    web_accessible_resources: [{
      resources: ['assets/runtime.png'],
      matches: ['https://example.com/*'],
    }],
  }));
  writeFixture(root, 'background.js', "importScripts('lib/security-policy.js');");
  writeFixture(root, 'lib/security-policy.js', 'globalThis.fixturePolicy = true;');
  writeFixture(root, 'popup.html', '<script src="react-dist/popup/popup.js"></script>');
  writeFixture(root, 'react-dist/popup/popup.js', 'globalThis.fixturePopup = true;');
  writeFixture(root, 'src/vanilla/runtime.js', 'globalThis.fixtureRuntime = true;');
  writeFixture(root, 'assets/runtime.png', fakePng(8, 8));
  for (const size of [16, 32, 48, 128]) writeFixture(root, `icons/icon${size}.png`, fakePng(size, size));

  // Every one of these is locally useful but forbidden from a store upload.
  for (const path of [
    '.DS_Store', '.claude/settings.local.json', '.revstack/routes.py',
    'docs/private-notes.md', 'install/enterprise-force-install.reg',
    'scripts/dev-only.mjs', 'tests/fixture.test.mjs', 'themes/generate.mjs',
    'tools/release-helper', 'react-dist/popup/popup.js.map', 'local-signing-key.pem',
    'revstack.project.json', 'README.md',
  ]) writeFixture(root, path, 'must not ship');
  return root;
}

describe('store packaging', () => {
  it('creates a deterministic root-level ZIP with a store-safe manifest and runtime files only', () => {
    const root = createFixture();
    const outputDirectory = resolve(root, 'dist/store');
    try {
      const sourceManifest = readFileSync(resolve(root, 'manifest.json'));
      const first = buildStorePackage({ root, outputDirectory });
      const firstBytes = Buffer.from(first.bytes);
      const second = buildStorePackage({ root, outputDirectory });
      assert.deepEqual(second.bytes, firstBytes, 'identical input must create byte-identical ZIP output');
      assert.deepEqual(
        readFileSync(resolve(root, 'manifest.json')),
        sourceManifest,
        'the store transform must never mutate the source/self-hosted manifest',
      );

      const entries = readZipEntries(readFileSync(second.output));
      const names = [...entries.keys()];
      const manifest = JSON.parse(entries.get('manifest.json'));
      assert.equal(manifest.version, '1.2.3');
      assert.equal('key' in manifest, false);
      assert.equal('update_url' in manifest, false);
      assert.deepEqual(manifest.permissions, ['storage']);
      assert.deepEqual(manifest.icons, {
        16: 'icons/icon16.png', 32: 'icons/icon32.png',
        48: 'icons/icon48.png', 128: 'icons/icon128.png',
      });
      assert.ok(names.includes('background.js'));
      assert.ok(names.includes('src/vanilla/runtime.js'));
      assert.ok(names.includes('iframe') === false);
      assert.ok(!names.some((name) => /(?:^|\/)(?:install|themes|tools|docs|scripts|tests|\.claude|\.revstack)(?:\/|$)/.test(name)));
      assert.ok(!names.some((name) => name.endsWith('.map') || name.endsWith('.pem')));
      assert.ok(!names.includes('.DS_Store'));
      assert.ok(!names.includes('package.json'));
      assert.ok(!names.includes('revstack.project.json'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when a manifest or extension page references a missing local file', () => {
    const root = createFixture();
    try {
      rmSync(resolve(root, 'react-dist/popup/popup.js'));
      assert.throws(
        () => buildStorePackage({ root }),
        /missing local references:[\s\S]*react-dist\/popup\/popup\.js/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when a dynamically registered content script is missing', () => {
    const root = createFixture();
    try {
      writeFixture(root, 'lib/dynamic-registration.js', [
        "chrome.scripting.registerContentScripts([{",
        "  id: 'dynamic', js: ['src/vanilla/missing-dynamic.js'],",
        "}]);",
      ].join('\n'));
      assert.throws(
        () => buildStorePackage({ root }),
        /missing local references:[\s\S]*src\/vanilla\/missing-dynamic\.js/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when a declared store icon does not have the exact required dimensions', () => {
    const root = createFixture();
    try {
      writeFixture(root, 'icons/icon48.png', fakePng(64, 64));
      assert.throws(
        () => buildStorePackage({ root }),
        /icons\/icon48\.png must be exactly 48x48; found 64x64/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects private-key material even when it is hidden inside an allowed runtime path', () => {
    const root = createFixture();
    try {
      writeFixture(root, 'background.js', [
        '-----BEGIN PRIVATE KEY-----',
        'this-is-a-fixture-not-a-real-key',
        '-----END PRIVATE KEY-----',
      ].join('\n'));
      assert.throws(
        () => buildStorePackage({ root }),
        /Private key material must never ship[^]*background\.js/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
