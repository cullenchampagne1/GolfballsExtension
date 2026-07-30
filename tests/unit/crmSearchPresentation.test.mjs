import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [searchSource, iconSource] = await Promise.all([
  readFile(new URL('../../src/modals/CRMSearch.jsx', import.meta.url), 'utf8'),
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
    assert.equal(used.has('ext'), true, 'the full-page action exercises the external-link icon');
  });
});
