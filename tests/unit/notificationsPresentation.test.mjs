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

  it('gives every action its own control and runs the first on a row click', () => {
    // The chips are real buttons OUTSIDE the row button — a notification that
    // offers both its email and its contact needs two independent targets, and
    // a button cannot nest inside a button.
    assert.match(source, /function ActionChip\(\{ label, onClick \}\)/);
    assert.match(source, /onClick=\{\(\) => \(actions\.length \? onOpen\(item, 0\) : onRead\(item\)\)\}/);
    assert.match(source, /\{actions\.map\(\(action, index\) => \(/);
    assert.match(source, /onClick=\{\(\) => onOpen\(item, index\)\}/);
    assert.doesNotMatch(source, /item\.action\?\.label && !archived/);
  });

  it('reads the ordered action list, falling back to a lone action', () => {
    assert.match(source, /function rowActions\(item\)/);
    assert.match(source, /Array\.isArray\(item\?\.actions\)/);
    assert.match(source, /return item\?\.action \? \[item\.action\] : \[\]/);
    assert.match(
      source,
      /window\.__gbCanRunNotificationAction\?\.\(item, actionIndex\) !== true/,
    );
    assert.match(
      source,
      /window\.__gbRunNotificationAction\?\.\(item, \{ actionIndex \}\)/,
    );
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
