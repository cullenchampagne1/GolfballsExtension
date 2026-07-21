#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import {
  IS_ADMIN_BUILD, isAdminRootFile, isAdminContentScript,
  stripAdminRegions, findLeak,
} from './strip-admin.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..');

// Only runtime roots belong in a store submission. Keeping this an allowlist
// makes newly-added tests, local configuration, source maps, and agent files
// opt-in instead of silently shipping them to every extension user.
export const RUNTIME_ROOT_FILES = Object.freeze([
  'background.js',
  'calendar-form-state.js',
  'crm-index-store.js',
  'custom-pages-sandbox.html',
  'defaults.js',
  'editor.html',
  'email-relay-poll.js',
  'guide.html',
  'help-assistant.js',
  'help-chat-state.js',
  'installation-auth.js',
  'notifications-store.js',
  'playground.html',
  'popup.html',
  'remote-settings-policy.js',
  'sandbox.html',
  'security-policy.js',
  'settings-registry.js',
  'theme-init.js',
  'theme.css',
  'theme.js',
]);

export const RUNTIME_DIRECTORIES = Object.freeze([
  'assets',
  'icons',
  'iframe',
  'react-dist',
  'src/vanilla',
]);

const FORBIDDEN_PATH_PARTS = new Set([
  '.agents', '.claude', '.codex', '.git', '.github', '.revstack',
  'companion-app', 'dist', 'docs', 'install', 'node_modules', 'scripts',
  'tests', 'tools',
]);
const FORBIDDEN_BASENAMES = new Set([
  '.DS_Store', '.env', '.env.local', 'AGENTS.md', 'package-lock.json',
  'package.json', 'README.md', 'revstack.project.json',
]);
const FORBIDDEN_SUFFIXES = [
  '.map', '.pem', '.key', '.p12', '.pfx', '.crx', '.zip', '.log', '.bak', '~',
];
const ICON_SIZES = Object.freeze([16, 32, 48, 128]);
const PRIVATE_KEY_MARKER = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;

function posixPath(path) {
  return path.split(sep).join('/');
}

function isForbiddenPath(path) {
  const normalized = posixPath(path).replace(/^\.\//, '');
  const parts = normalized.split('/');
  const name = parts.at(-1) || '';
  return parts.some((part) => FORBIDDEN_PATH_PARTS.has(part))
    || FORBIDDEN_BASENAMES.has(name)
    || FORBIDDEN_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

function walkFiles(root, relativeDirectory) {
  const directory = resolve(root, relativeDirectory);
  if (!existsSync(directory)) return [];
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = posixPath(`${relativeDirectory}/${entry.name}`);
    if (isForbiddenPath(path)) continue;
    if (entry.isDirectory()) found.push(...walkFiles(root, path));
    else if (entry.isFile()) found.push(path);
    else throw new Error(`Store package cannot contain a symlink or special file: ${path}`);
  }
  return found;
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${label}: ${error.message}`);
  }
}

function chromeVersion(version) {
  const value = String(version || '');
  if (!/^\d+(?:\.\d+){0,3}$/.test(value)) {
    throw new Error(`package.json version must be 1-4 numeric components for browser stores; received ${JSON.stringify(value)}`);
  }
  for (const component of value.split('.')) {
    const number = Number(component);
    if (!Number.isSafeInteger(number) || number < 0 || number > 65535) {
      throw new Error(`Browser extension version component is out of range: ${component}`);
    }
  }
  return value;
}

export function createStoreManifest(sourceManifest, packageJson) {
  const manifest = structuredClone(sourceManifest);
  manifest.version = chromeVersion(packageJson.version);
  delete manifest.key;
  delete manifest.update_url;

  manifest.permissions = Array.isArray(manifest.permissions)
    ? manifest.permissions.filter((permission) => permission !== 'nativeMessaging')
    : [];

  const icons = Object.fromEntries(ICON_SIZES.map((size) => [String(size), `icons/icon${size}.png`]));
  manifest.icons = icons;
  manifest.action = { ...(manifest.action || {}), default_icon: { ...icons } };

  // Consumer build: drop admin-only content scripts so the served manifest
  // never references (or requires) their bundles.
  if (!IS_ADMIN_BUILD && Array.isArray(manifest.content_scripts)) {
    for (const group of manifest.content_scripts) {
      if (Array.isArray(group.js)) group.js = group.js.filter((path) => !isAdminContentScript(path));
    }
  }
  return manifest;
}

function pngDimensions(buffer, path) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)
      || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`Store icon is not a valid PNG: ${path}`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function manifestReferences(manifest) {
  const refs = new Set();
  const add = (value) => {
    if (typeof value !== 'string' || !value.trim()) return;
    const normalized = value.replace(/^\/+/, '');
    if (normalized.includes('..') || normalized.includes('\\')) {
      throw new Error(`Unsafe manifest file reference: ${value}`);
    }
    refs.add(normalized);
  };
  const addValues = (value) => {
    if (Array.isArray(value)) value.forEach(add);
    else if (value && typeof value === 'object') Object.values(value).forEach(add);
    else add(value);
  };

  add(manifest.background?.service_worker);
  add(manifest.action?.default_popup);
  addValues(manifest.action?.default_icon);
  addValues(manifest.icons);
  add(manifest.options_page);
  add(manifest.options_ui?.page);
  add(manifest.devtools_page);
  add(manifest.side_panel?.default_path);
  addValues(manifest.chrome_url_overrides);
  addValues(manifest.sandbox?.pages);
  for (const script of manifest.content_scripts || []) {
    addValues(script.js);
    addValues(script.css);
  }
  for (const group of manifest.web_accessible_resources || []) addValues(group.resources);
  return refs;
}

function wildcardRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`);
}

function pageReferences(path, bytes) {
  const refs = new Set();
  const text = bytes.toString('utf8');
  const base = dirname(path);
  const add = (raw) => {
    const value = raw.trim().replace(/[?#].*$/, '');
    if (!value || value.startsWith('#') || /^(?:data|https?|chrome-extension):/i.test(value)) return;
    const resolved = posixPath(resolve('/', base, value)).replace(/^\//, '');
    if (resolved.startsWith('../')) throw new Error(`Unsafe local reference ${raw} in ${path}`);
    refs.add(resolved);
  };
  if (path.endsWith('.html')) {
    for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
  }
  if (path.endsWith('.css')) {
    for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(match[1]);
  }
  if (path.endsWith('.js')) {
    for (const match of text.matchAll(/\bimportScripts\(([^)]*)\)/g)) {
      for (const quoted of match[1].matchAll(/["']([^"']+)["']/g)) add(quoted[1]);
    }
  }
  return refs;
}

export function collectStoreEntries(root, manifest, { stageRoot = null } = {}) {
  const consumer = !!stageRoot;
  // In the consumer build, react-dist comes from the stripped staging build;
  // everything else (incl. the already-stripped settings-registry.js) from the repo.
  const sourceFor = (relPath) => (
    consumer && relPath.startsWith('react-dist/') ? resolve(stageRoot, relPath) : resolve(root, relPath)
  );
  const rootFilePaths = RUNTIME_ROOT_FILES
    .filter((path) => !(consumer && isAdminRootFile(path)))
    .filter((path) => existsSync(sourceFor(path)));
  const dirPaths = RUNTIME_DIRECTORIES.flatMap((directory) => (
    directory === 'react-dist' && consumer ? walkFiles(stageRoot, directory) : walkFiles(root, directory)
  ));
  const uniquePaths = [...new Set([...rootFilePaths, ...dirPaths])].sort((a, b) => a.localeCompare(b, 'en'));
  const entries = uniquePaths.map((path) => {
    let bytes = readFileSync(sourceFor(path));
    // Strip @admin regions from every RAW shipped .js (root workers + src/vanilla
    // + iframe). react-dist bundles are already stripped by the consumer build.
    if (consumer && path.endsWith('.js') && !path.startsWith('react-dist/')) {
      bytes = Buffer.from(stripAdminRegions(bytes.toString('utf8')), 'utf8');
    }
    return { path, bytes };
  });
  entries.push({ path: 'manifest.json', bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) });
  entries.sort((a, b) => a.path.localeCompare(b.path, 'en'));

  for (const entry of entries) {
    if (isForbiddenPath(entry.path)) throw new Error(`Forbidden store-package path: ${entry.path}`);
    if (PRIVATE_KEY_MARKER.test(entry.bytes.toString('utf8', 0, Math.min(entry.bytes.length, 4096)))) {
      throw new Error(`Private key material must never ship in the store package: ${entry.path}`);
    }
  }

  const names = new Set(entries.map((entry) => entry.path));
  const refs = new Set(manifestReferences(manifest));
  for (const entry of entries) {
    for (const ref of pageReferences(entry.path, entry.bytes)) refs.add(ref);
  }
  const missing = [...refs].filter((ref) => {
    if (ref.includes('*')) {
      const matcher = wildcardRegex(ref);
      return ![...names].some((name) => matcher.test(name));
    }
    return !names.has(ref);
  });
  if (missing.length) throw new Error(`Store package has missing local references:\n- ${missing.sort().join('\n- ')}`);

  for (const size of ICON_SIZES) {
    const path = manifest.icons[String(size)];
    const entry = entries.find((candidate) => candidate.path === path);
    const dimensions = pngDimensions(entry.bytes, path);
    if (dimensions.width !== size || dimensions.height !== size) {
      throw new Error(`${path} must be exactly ${size}x${size}; found ${dimensions.width}x${dimensions.height}`);
    }
  }
  return entries;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function createDeterministicZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path, 'en'))) {
    const name = Buffer.from(entry.path, 'utf8');
    const bytes = Buffer.from(entry.bytes);
    const compressed = deflateRawSync(bytes, { level: 9 });
    const crc = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); // 1980-01-01 00:00 in DOS time/date.
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralBytes = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralBytes, end]);
}

// Consumer build: produce a stripped react-dist + settings-registry in a
// staging dir so the committed full artifacts are never touched.
function runConsumerStaging(root) {
  const stageRoot = resolve(root, 'dist/store-stage');
  rmSync(stageRoot, { recursive: true, force: true });
  mkdirSync(stageRoot, { recursive: true });
  // The committed helpContent.js carries the full (admin) doc set, including the
  // notification-feature articles. Regenerate a consumer copy over it — admin
  // articles, tutorials, and nav entries pruned — for the duration of the
  // stripped build only, then restore the admin version. This keeps the
  // notification docs out of the served guide bundle without a second committed
  // file. (settings-registry.js already excludes admin keys permanently.)
  const helpFile = resolve(root, 'src/lib/helpContent.js');
  const helpBackup = readFileSync(helpFile);
  try {
    execFileSync('node', ['scripts/build-help-content.mjs'], {
      cwd: root, stdio: 'inherit',
      env: { ...process.env, GB_ADMIN: '0', GB_HELP_OUT: helpFile },
    });
    // Stripped vite build (admin entries skipped, __ADMIN__ DCE'd) → staging.
    execFileSync('node', ['build.js'], {
      cwd: root, stdio: 'inherit',
      env: { ...process.env, GB_ADMIN: '0', GB_OUT_BASE: 'dist/store-stage/react-dist' },
    });
  } finally {
    writeFileSync(helpFile, helpBackup); // restore the committed admin doc set
  }
  return stageRoot;
}

export function buildStorePackage({ root = DEFAULT_ROOT, outputDirectory = resolve(root, 'dist/store') } = {}) {
  const packageJson = readJson(resolve(root, 'package.json'), 'package.json');
  const sourceManifest = readJson(resolve(root, 'manifest.json'), 'manifest.json');
  const manifest = createStoreManifest(sourceManifest, packageJson);
  const stageRoot = IS_ADMIN_BUILD ? null : runConsumerStaging(root);
  const entries = collectStoreEntries(root, manifest, { stageRoot });
  // The proof of "completely excluded": no admin token may survive into the
  // served package. A miss fails the build rather than silently shipping.
  if (!IS_ADMIN_BUILD) {
    for (const entry of entries) {
      const leak = findLeak(entry.path, entry.bytes);
      if (leak) throw new Error(`Admin leak in consumer package: token "${leak.token}" in ${leak.path}`);
    }
  }
  const bytes = createDeterministicZip(entries);
  mkdirSync(outputDirectory, { recursive: true });
  const output = resolve(outputDirectory, `${packageJson.name}-${manifest.version}.zip`);
  if (existsSync(output)) rmSync(output);
  writeFileSync(output, bytes);
  return { output, bytes, entries, manifest };
}

function main() {
  const root = DEFAULT_ROOT;
  const result = buildStorePackage({ root });
  const sizeMb = (statSync(result.output).size / 1024 / 1024).toFixed(1);
  console.log(`Store ZIP ready: ${result.output}`);
  console.log(`Version ${result.manifest.version} · ${result.entries.length} files · ${sizeMb} MB`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`Store packaging failed: ${error.message}`);
    process.exitCode = 1;
  }
}
