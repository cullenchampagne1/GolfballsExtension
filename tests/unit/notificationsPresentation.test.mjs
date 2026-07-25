import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../src/modals/Notifications.jsx', import.meta.url),
  'utf8',
);

describe('notification center presentation', () => {
  it('keeps one stable viewport while filter content crossfades', () => {
    assert.match(source, /height=\{620\}/);
    assert.match(source, /<AnimatePresence mode="wait" initial=\{false\}>/);
    assert.match(source, /key=\{filter\}/);
    assert.match(source, /position: 'absolute', inset: 0/);
    assert.doesNotMatch(source, /minHeight: 290/);
  });

  it('uses shared modal controls and active notification semantics', () => {
    assert.match(source, /\{ key: 'active', label: 'Active' \}/);
    assert.match(
      source,
      /active: items\.filter\(\(item\) => item\.status !== 'dismissed'\)\.length/,
    );
    assert.match(source, /<ModalFooter/);
    assert.match(source, /<IconBtn/);
    assert.doesNotMatch(source, /function IconButton/);
  });
});
