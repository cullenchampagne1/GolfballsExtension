import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers/harness.mjs';

const PUBLISHER = fileURLToPath(new URL('../golfballs', ROOT));

function writeFixture(root, relative, contents = '') {
  const target = resolve(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function packageFixture(workspace, output) {
  const helper = String.raw`
import json
import runpy
import sys
import zipfile
from pathlib import Path

publisher = runpy.run_path(sys.argv[1])
build_zip = publisher["build_zip"]
build_zip.__globals__["WORKSPACE"] = Path(sys.argv[2])
build_zip.__globals__["BASE"] = Path(sys.argv[3]).parent
zip_bytes, _, missing = build_zip({"pack_exclude": []})
if missing:
    raise RuntimeError("fixture package has missing manifest references: " + repr(missing))
key = Path(sys.argv[3]).with_suffix(".pem")
publisher["run"](["openssl", "genrsa", "-out", str(key), "2048"])
Path(sys.argv[3]).write_bytes(publisher["pack_crx3"](zip_bytes, key))
with zipfile.ZipFile(sys.argv[3]) as archive:
    print(json.dumps(archive.namelist()))
`;
  const result = spawnSync('python3', ['-c', helper, PUBLISHER, workspace, output], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

describe('publisher packaging', () => {
  it('keeps agent metadata and development artifacts out of the CRX even when config exclusions are empty', () => {
    const temp = mkdtempSync(resolve(tmpdir(), 'golfballs-publisher-'));
    const workspace = resolve(temp, 'workspace');
    const crx = resolve(temp, 'fixture.crx');

    try {
      writeFixture(workspace, 'manifest.json', JSON.stringify({
        manifest_version: 3,
        name: 'Publisher fixture',
        version: '1.0.0',
        background: { service_worker: 'background.js' },
        content_scripts: [{ matches: ['https://example.com/*'], js: ['src/runtime.js'] }],
      }));
      writeFixture(workspace, 'background.js', 'globalThis.fixture = true;');
      writeFixture(workspace, 'src/runtime.js', 'globalThis.runtimeSource = true;');
      writeFixture(workspace, '.claude/settings.local.json', '{"secret":"must-not-ship"}');
      writeFixture(workspace, 'tests/unit/example.test.mjs', 'development only');
      writeFixture(workspace, '.revstack/routes.py', 'development only');

      const names = packageFixture(workspace, crx);
      assert.ok(readFileSync(crx).subarray(0, 4).equals(Buffer.from('Cr24')), 'fixture must be a CRX3 package');
      assert.ok(names.includes('background.js'), 'extension runtime files remain packaged');
      assert.ok(names.includes('src/runtime.js'), 'manifest-referenced source files remain packaged');
      assert.ok(!names.some((name) => name === '.claude' || name.startsWith('.claude/')));
      assert.ok(!names.some((name) => name.startsWith('tests/') || name.startsWith('.revstack/')));
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
