#!/usr/bin/env node
/**
 * pack:safari — wrap the extension as a local Safari Web Extension from the
 * SAME codebase, no duplication.
 *
 * 1. Builds the extension (so react-dist is current).
 * 2. Stages a clean, loadable extension dir by reusing the store packager's
 *    allowlist (only runtime files ship) — admin build by default so your local
 *    Safari matches your local Chrome. `createStoreManifest` already drops the
 *    Chrome-only `update_url`/`key` that Safari rejects.
 * 3. Runs Apple's `xcrun safari-web-extension-converter` against the staged dir
 *    to generate an Xcode project. If full Xcode isn't installed yet, it stages
 *    everything and prints the exact command to run once it is.
 *
 * Distribution (App Store / signing / notarization) is intentionally out of
 * scope — this is a local build. Open dist/safari in Xcode, run it, then enable
 * it in Safari ▸ Develop ▸ Allow Unsigned Extensions.
 */

import {
  existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { collectStoreEntries, createStoreManifest } from './package-store.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const STAGE = resolve(ROOT, 'dist/safari-stage/extension');
const PROJECT = resolve(ROOT, 'dist/safari');

const APP_NAME = process.env.GB_SAFARI_APP_NAME || 'Golfballs Toolkit';
// The converter derives the APP's bundle id from the app name (rfc1034: spaces
// → hyphens, case preserved) and only applies --bundle-identifier to the
// EXTENSION (as `<id>.Extension`). For the extension id to be prefixed by the
// app id (Xcode requires it), the bundle id's last segment must equal the
// app-name derivation — so we compute it from APP_NAME instead of hardcoding a
// mismatched-case value.
const APP_ORG = process.env.GB_SAFARI_ORG || 'com.cullenchampagne';
const APP_SLUG = APP_NAME.trim().replace(/[^A-Za-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '');
const BUNDLE_ID = process.env.GB_SAFARI_BUNDLE_ID || `${APP_ORG}.${APP_SLUG}`;

function main() {
  // 1. Fresh build (prebuild regenerates help content; build.js emits react-dist).
  console.log('› building extension…');
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });

  // 2. Stage a clean loadable extension dir via the store allowlist.
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
  const sourceManifest = JSON.parse(readFileSync(resolve(ROOT, 'manifest.json'), 'utf8'));
  const manifest = createStoreManifest(sourceManifest, pkg); // drops key + update_url
  const entries = collectStoreEntries(ROOT, manifest);        // admin build, allowlist only

  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(STAGE, { recursive: true });
  for (const { path, bytes } of entries) {
    const dest = resolve(STAGE, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
  }
  console.log(`› staged ${entries.length} files → ${STAGE}`);

  // 3. Convert to a Safari Xcode project (needs full Xcode).
  const convertArgs = [
    'safari-web-extension-converter', STAGE,
    '--macos-only',
    '--app-name', APP_NAME,
    '--bundle-identifier', BUNDLE_ID,
    '--project-location', PROJECT,
    '--copy-resources',
    '--no-open',
    '--force',
  ];

  // Locate the converter. If `xcode-select` still points at Command Line Tools
  // (common right after installing Xcode), fall back to a full Xcode.app via
  // DEVELOPER_DIR — no `sudo xcode-select` needed.
  const convertEnv = { ...process.env };
  let converterFound = true;
  try {
    execFileSync('xcrun', ['--find', 'safari-web-extension-converter'], { stdio: 'ignore' });
  } catch {
    converterFound = false;
    for (const app of ['/Applications/Xcode.app', '/Applications/Xcode-beta.app']) {
      const dev = `${app}/Contents/Developer`;
      if (existsSync(`${dev}/usr/bin/safari-web-extension-converter`)) {
        convertEnv.DEVELOPER_DIR = dev;
        converterFound = true;
        console.log(`› using Xcode at ${app} (active dir is Command Line Tools)`);
        break;
      }
    }
  }

  if (!converterFound) {
    console.log('\n⚠ Full Xcode not detected (only Command Line Tools).');
    console.log('  The extension is staged and ready. After installing Xcode, run:\n');
    console.log('    xcrun ' + convertArgs.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' '));
    console.log('\n  Then open dist/safari in Xcode, Run, and enable it in');
    console.log('  Safari ▸ Settings ▸ Advanced ▸ Show Develop menu ▸ Develop ▸ Allow Unsigned Extensions.');
    return;
  }

  console.log('› converting to a Safari Xcode project…');
  rmSync(PROJECT, { recursive: true, force: true });
  execFileSync('xcrun', convertArgs, { cwd: ROOT, stdio: 'inherit', env: convertEnv });
  console.log(`\n✓ Safari project → ${PROJECT}`);
  console.log('  Open it in Xcode, Run, then enable via Safari ▸ Develop ▸ Allow Unsigned Extensions.');
}

try {
  main();
} catch (error) {
  console.error(`Safari packaging failed: ${error.message}`);
  process.exitCode = 1;
}
