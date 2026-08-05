import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [searchSource, pageSource, emailRunnerSource, iconSource] = await Promise.all([
  readFile(new URL('../../src/modals/CRMSearch.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/content/crm-search-page.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/modals/EmailRunner.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/ui/icons.jsx', import.meta.url), 'utf8'),
]);

function matches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

describe('CRM Search presentation · shared icon contract', () => {
  it('defines every shared icon rendered by the modal', () => {
    const used = new Set(matches(searchSource, /<I\.([A-Za-z_][A-Za-z0-9_]*)\b/g));
    const registered = new Set(matches(iconSource, /^\s{2}([A-Za-z_][A-Za-z0-9_]*):/gm));
    const missing = [...used].filter((key) => !registered.has(key)).sort();

    assert.deepEqual(missing, []);
  });
});

describe('CRM Search presentation · Page Engine cache control', () => {
  it('gates the cache tag behind enabled indexing plus a configured territory on both surfaces', () => {
    for (const source of [searchSource, pageSource]) {
      assert.match(source, /pageEngine\.indexingEnabled/);
      assert.match(source, /pageEngine\.territory/);
      assert.match(source, /cacheOptionVisible/);
      assert.match(source, /<EngineCacheTag/);
      assert.match(source, /attachCachedPageEngineSnapshots/);
    }
  });

  it('hands an attached snapshot to the data resolver before the live fetch branch', () => {
    const cacheAt = emailRunnerSource.indexOf('cachedSnapshotForContact(c)');
    const dataResolverAt = emailRunnerSource.indexOf('__gbResolveVarsForData', cacheAt);
    const liveFetchAt = emailRunnerSource.indexOf("action: 'fetchRaw'", dataResolverAt);
    assert.ok(cacheAt > 0);
    assert.ok(dataResolverAt > cacheAt);
    assert.ok(liveFetchAt > dataResolverAt);
  });
});
