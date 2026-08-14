/**
 * Settings-surface menu regressions: the template-row action menu must stay
 * reachable with many folders, and the Workflow Manager toggle belongs to the
 * Tools section rather than a one-item Workflows group.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const { FEATURE_FLAGS } = await import('../../src/lib/flags.js');

const sidebarSource = await readFile(
  new URL('../../src/content/editor-sidebar.jsx', import.meta.url),
  'utf8',
);
const settingsPanelSource = await readFile(
  new URL('../../src/pages/SettingsPanel.jsx', import.meta.url),
  'utf8',
);
const projectRoutesUrl = new URL('../../.revstack/routes.py', import.meta.url);
const hasProjectRoutes = existsSync(projectRoutesUrl);
const projectRoutesSource = hasProjectRoutes
  ? await readFile(projectRoutesUrl, 'utf8')
  : '';
const actionMenuSource = sidebarSource.slice(
  sidebarSource.indexOf('function ActionMenu'),
  sidebarSource.indexOf('function MenuItem'),
);
const statCellSource = settingsPanelSource.slice(
  settingsPanelSource.indexOf('function StatCell'),
  settingsPanelSource.indexOf('function DevSettingRow'),
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

  it('renders managed feature, input, dropdown, and custom-page controls as locked', () => {
    assert.match(settingsPanelSource, /managed=\{managedFeature\(f\.key\)\}/);
    assert.match(settingsPanelSource, /managed=\{managedDevSetting\(def\.key\)\}/);
    assert.match(settingsPanelSource, /disabled=\{managed\}/);
    assert.match(settingsPanelSource, /managed=\{managedCustomPageScope\(section\.id\)\}/);
  });

  it('keeps read-only statistics passive instead of showing a refresh button', () => {
    // The readout re-reads itself when anything it depends on changes, so a
    // refresh button would be a control for something already happening.
    assert.match(statCellSource, /useEffect\(\(\) => \{ read\(\); \}, \[read\]\)/);
    assert.doesNotMatch(statCellSource, /title="Refresh"|I\.refresh/);
  });

  it('offers an export only on the stat rows that define one', () => {
    // The one control a readout may carry: handing over what it counted. A row
    // with no `exporter` stays exactly as passive as it was.
    assert.match(statCellSource, /typeof def\.exporter === 'function' && \(/);
    assert.match(statCellSource, /icon=\{<I\.download \/>\}/);
  });

  it('keeps management explicit in global and per-key dashboard editors', {
    skip: !hasProjectRoutes && 'local-only RevStack project routes are not present',
  }, () => {
    assert.match(projectRoutesSource, /"key": "managed"[\s\S]*"Managed by RevStack"/);
    assert.match(projectRoutesSource, /"key": "managed_mode"[\s\S]*"Managed for this user"/);
    assert.match(projectRoutesSource, /"visible_when": \{"field": "value_mode", "equals": "override"\}/);
    const toggleRoute = projectRoutesSource.slice(
      projectRoutesSource.indexOf('async def toggle_configuration_value'),
      projectRoutesSource.indexOf('def _policy_value_cell'),
    );
    assert.match(toggleRoute, /hidden_marker=True, hidden=going_hidden/);
    assert.doesNotMatch(toggleRoute, /managed_marker|value_marker/);
  });
});
