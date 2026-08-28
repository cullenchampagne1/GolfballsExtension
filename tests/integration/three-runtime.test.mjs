import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const runtimeBundle = 'react-dist/vanilla/three-runtime.js';
const duplicateDiagnostic = 'Multiple instances of Three.js being imported.';

async function read(relativePath) {
  return readFile(join(root, relativePath), 'utf8');
}

async function filesUnder(relativeDir) {
  const dir = join(root, relativeDir);
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      return filesUnder(relative(root, absolute));
    }
    return [relative(root, absolute)];
  }));
  return nested.flat();
}

describe('shared Three.js production runtime', () => {
  it('loads once before every CRM content surface that can render 3D', async () => {
    const manifest = JSON.parse(await read('manifest.json'));
    const scripts = manifest.content_scripts
      .find((entry) => entry.js.includes('react-dist/content/image-preview.js'))
      .js;

    assert.equal(scripts.filter((file) => file === runtimeBundle).length, 1);
    for (const consumer of [
      'react-dist/content/image-preview.js',
      'react-dist/content/gift-catalog.js',
    ]) {
      assert.ok(
        scripts.indexOf(runtimeBundle) < scripts.indexOf(consumer),
        `${runtimeBundle} must load before ${consumer}`,
      );
    }
  });

  it('loads before the standalone guide bundle', async () => {
    const guide = await read('guide.html');
    assert.ok(
      guide.indexOf(runtimeBundle) < guide.indexOf('react-dist/guide/guide.js'),
    );
  });

  it('ships one Three core and no duplicate-instance diagnostic', async () => {
    const files = (await filesUnder('react-dist'))
      .filter((file) => file.endsWith('.js'));
    const sources = await Promise.all(files.map(async (file) => [
      file,
      await read(file),
    ]));

    const threeCoreBundles = sources
      .filter(([, source]) => source.includes('__THREE__'))
      .map(([file]) => file);

    assert.deepEqual(threeCoreBundles, [runtimeBundle]);
    assert.equal(
      sources.some(([, source]) => source.includes(duplicateDiagnostic)),
      false,
    );
  });
});
