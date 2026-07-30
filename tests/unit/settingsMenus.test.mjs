/**
 * Settings-surface menu regressions: the template-row action menu must stay
 * reachable with many folders, and the Workflow Manager toggle belongs to the
 * Tools section rather than a one-item Workflows group.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { FEATURE_FLAGS } = await import('../../src/lib/flags.js');

const sidebarSource = await readFile(
  new URL('../../src/content/editor-sidebar.jsx', import.meta.url),
  'utf8',
);
const actionMenuSource = sidebarSource.slice(
  sidebarSource.indexOf('function ActionMenu'),
  sidebarSource.indexOf('function MenuItem'),
);

describe('settings menus', () => {
  it('caps the template action menu height and scrolls it internally', () => {
    // With many folders the "Move to folder" list grew past the viewport and
    // pushed Share off-screen. The popover now carries a hard height cap with
    // its own scroll, and shifts up when the space under the anchor is tight.
    assert.match(actionMenuSource, /MENU_MAX_H = 320/);
    assert.match(actionMenuSource, /maxHeight: pos\.maxH/);
    assert.match(actionMenuSource, /overflowY: 'auto'/);
    assert.match(actionMenuSource, /window\.innerHeight - top - 12/);
  });

  it('keeps inner menu scrolling from closing the menu', () => {
    // The outside-scroll closer must ignore scrolls that originate inside the
    // (now scrollable) menu itself.
    assert.match(actionMenuSource, /if \(ref\.current\?\.contains\(e\.target\)\) return;/);
  });

  it('files the Workflow Manager under the Tools section', () => {
    const flag = FEATURE_FLAGS.find((f) => f.key === 'workflowManagerEnabled');
    assert.ok(flag, 'workflowManagerEnabled flag exists');
    assert.equal(flag.section, 'Tools');
    assert.ok(
      !FEATURE_FLAGS.some((f) => f.section === 'Workflows'),
      'no one-item Workflows section remains',
    );
  });
});
