/**
 * Unit tests — usage-surface coverage.
 *
 * "Every modal reports" is a property of the SOURCE, not of any one modal, and
 * the failure mode is silence: a new surface that skips the report doesn't
 * break, it just never appears in the console's Adoption block. So this reads
 * the shipped source and asserts the three choke points still hold —
 * mountFloating for the React overlays, `__gbReportSurface` for the vanilla
 * ones, the takeover reporter for the custom pages — and that every id they
 * report is a NAME rather than a raw `__gb-` host id.
 *
 * Conventions per findPhone.test.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const list = (dir) => readdir(new URL(`../../${dir}`, import.meta.url));

const mountFloating = await read('src/lib/mountFloating.js');
const usageSurfaces = await read('src/lib/usageSurfaces.js');
const customPages = await read('src/vanilla/custom-pages.js');

/** The `'__gb-x': 'Name'` rows of MODAL_SURFACES. */
function namedModalSurfaces(source) {
  const block = source.slice(source.indexOf('MODAL_SURFACES'), source.indexOf('export function surfaceName'));
  return new Set([...block.matchAll(/'(__gb-[a-z0-9-]+)'\s*:/g)].map((m) => m[1]));
}

/** Host ids handed to mountFloating across every content entry point. */
async function mountedHostIds() {
  const files = (await list('src/content')).filter((f) => f.endsWith('.jsx'));
  const ids = new Map();
  await Promise.all(files.map(async (file) => {
    const source = await read(`src/content/${file}`);
    if (!/mountFloating\(/.test(source)) return;
    // Either mountFloating('__gb-x', …) or a HOST_ID const above it.
    const literal = source.match(/mountFloating\(\s*'(__gb-[a-z0-9-]+)'/);
    const constant = source.match(/const HOST_ID\s*=\s*'(__gb-[a-z0-9-]+)'/);
    const id = literal?.[1] || constant?.[1];
    assert.ok(id, `${file} calls mountFloating with a host id this test can resolve`);
    ids.set(file, id);
  }));
  return ids;
}

describe('guard · usage surface coverage', () => {
  it('keeps the report inside mountFloating, where every React modal passes', () => {
    assert.match(mountFloating, /reportSurfaceOpen\(surface \|\| id, 'modal'\)/);
    // The close has to ride onClosed (post-animation unmount), not the panel's
    // close *start*, or every duration is short by the exit animation.
    assert.match(mountFloating, /const onClosed = \(\) => \{ reportClose\(\);/);
  });

  it('names every floating modal it mounts, so no row reports as a raw host id', async () => {
    const named = namedModalSurfaces(usageSurfaces);
    const mounted = await mountedHostIds();
    assert.ok(mounted.size >= 17, `expected the full modal set, saw ${mounted.size}`);
    const unnamed = [...mounted].filter(([, id]) => !named.has(id));
    assert.deepEqual(
      unnamed, [],
      'add these host ids to MODAL_SURFACES in src/lib/usageSurfaces.js',
    );
  });

  it('reports every vanilla overlay through the shared window reporter', async () => {
    const files = (await list('src/vanilla/modals')).filter(
      (f) => f.endsWith('.js') && f !== 'modal-chrome.js',
    );
    assert.ok(files.length, 'the vanilla overlays are still here');
    for (const file of files) {
      const source = await read(`src/vanilla/modals/${file}`);
      assert.match(
        source, /overlay\.__gbReportClose = window\.__gbReportSurface\?\.\('[^']+'\)/,
        `${file} hangs a usage reporter on its overlay`,
      );
    }
  });

  it('names every CRM takeover page the custom-page engine can render', () => {
    const detectors = new Set([...customPages
      .slice(customPages.indexOf('var DETECTORS'), customPages.indexOf('var PAGE_NAMES'))
      .matchAll(/^\s{4}([a-z_]+):\s*function/gm)].map((m) => m[1]));
    const names = new Set([...customPages
      .slice(customPages.indexOf('var PAGE_NAMES'), customPages.indexOf('function reportUsage'))
      .matchAll(/^\s{4}([a-z_]+):\s*'/gm)].map((m) => m[1]));
    assert.ok(detectors.size >= 7, `expected the takeover set, saw ${detectors.size}`);
    assert.deepEqual(
      [...detectors].filter((id) => !names.has(id)), [],
      'add these page ids to PAGE_NAMES in src/vanilla/custom-pages.js',
    );
  });

  it('silences the Operator\'s Guide, which mounts the real modals as demos', async () => {
    const guide = await read('src/guide/guide.jsx');
    const telemetry = await read('src/lib/usageTelemetry.js');
    assert.match(guide, /globalThis\.__gbUsageSilent = true/);
    assert.match(telemetry, /if \(globalThis\.__gbUsageSilent\) return;/);
  });
});
