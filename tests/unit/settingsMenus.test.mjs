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
const editorBridgeSource = await readFile(
  new URL('../../src/content/editor-bridge.jsx', import.meta.url),
  'utf8',
);
const editorTemplatesSource = await readFile(
  new URL('../../src/content/editor-templates.jsx', import.meta.url),
  'utf8',
);
const settingsPanelSource = await readFile(
  new URL('../../src/pages/SettingsPanel.jsx', import.meta.url),
  'utf8',
);
const templateEditorSource = await readFile(
  new URL('../../src/pages/TemplateEditor.jsx', import.meta.url),
  'utf8',
);
const richTextEditorSource = await readFile(
  new URL('../../src/ui/components/RichTextEditor.jsx', import.meta.url),
  'utf8',
);
const draggablePopupSource = await readFile(
  new URL('../../src/ui/components/DraggablePopup.jsx', import.meta.url),
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
const importTemplatesModalSource = sidebarSource.slice(
  sidebarSource.indexOf('function ImportTemplatesModal'),
  sidebarSource.indexOf('function ShareEmailTemplateModal'),
);
const emailLinksSectionSource = settingsPanelSource.slice(
  settingsPanelSource.indexOf('function EmailLinksSection'),
  settingsPanelSource.indexOf('function ProductStoresSection'),
);
const supportTicketsSectionSource = settingsPanelSource.slice(
  settingsPanelSource.indexOf('function SupportTicketsSection'),
  settingsPanelSource.indexOf('function TrackersSection'),
);

describe('settings menus', () => {
  it('animates managed template creation/import controls while leaving notes available', () => {
    assert.match(sidebarSource, /capabilities\.allowCreation/);
    assert.match(sidebarSource, /capabilities\.allowLinkImport/);
    assert.match(sidebarSource, /visible=\{isNote \|\| \(capabilities\.allowCreation && allowLocalTemplates\)\}/);
    assert.match(sidebarSource, /const folderTakesRow = !isNote[\s\S]*!capabilities\.allowCreation;/);
    assert.match(sidebarSource, /grow=\{folderTakesRow\}/);
    assert.match(sidebarSource, /folderTakesRow \? 'Folder' : null/);
    assert.match(sidebarSource, /slotKey="email-template-link-import"/);
    assert.match(sidebarSource, /filterLocalEmailTemplates\(templates, devSettings\)/);
    assert.match(editorBridgeSource, /!emailTemplateCapabilities\.allowCreation/);
    assert.match(editorBridgeSource, /!emailTemplateCapabilities\.allowLocalTemplateUsage/);
  });

  it('renders retained email shares in the complete editor with allowlisted local overrides', () => {
    assert.match(templateEditorSource, /const imported = isImportedEmailTemplate\(tpl\)/);
    assert.match(templateEditorSource, /<EditableTemplateEditor[\s\S]*?readOnly=\{imported\}/);
    assert.doesNotMatch(templateEditorSource, /function ImportedTemplateViewer/);
    assert.match(templateEditorSource, /function LockedRegion[\s\S]*?inert=\{locked \|\| undefined\}/);
    assert.match(templateEditorSource, /onPointerDownCapture=\{stopLockedEvent\}/);
    assert.match(templateEditorSource, /onClickCapture=\{stopLockedEvent\}/);
    assert.match(templateEditorSource, /onKeyDownCapture=\{stopLockedEvent\}/);
    assert.match(templateEditorSource, /pointerEvents: locked \? 'none' : undefined/);
    assert.match(templateEditorSource, /literalOverridesOnly=\{readOnly\}/);
    assert.match(templateEditorSource, /Reply mode[\s\S]*?<LockedRegion locked=\{readOnly\}/);
    assert.match(templateEditorSource, /recipient-local[\s\S]*?__gbSaveTemplate/);
    assert.match(templateEditorSource, /deleteLabel=\{readOnly \? 'Remove' : 'Delete'\}/);
    assert.match(templateEditorSource, /Shared by \$\{ownerName\}/);
    assert.match(sidebarSource, /importedEmailShare\(tpl\)/);
    assert.match(sidebarSource, /<I\.user size=\{8\}/);
    assert.doesNotMatch(sidebarSource, />IMPORTED</);
    assert.match(editorBridgeSource, /applyImportedEmailTemplateOverrides\(templates\[idx\], tpl\)/);
    assert.match(editorBridgeSource, /pendingOwnedTemplateShareUpdates\(template, sessionId\)/);
    assert.match(editorBridgeSource, /emailTemplateShareUpdate/);
    assert.match(editorBridgeSource, /window\.addEventListener\('pagehide', leaveCurrentTemplate\)/);
    assert.match(editorBridgeSource, /currentTemplate && window\.__gbOpenTemplate/);
    assert.match(editorTemplatesSource, /tpl\.shareImport\?\.version \|\| 0/);
    assert.match(sidebarSource, /__gbTrackTemplateShare\(template\.id, response\.share, template\)/);
    assert.match(sidebarSource, /ownedTemplateShares\(tpl\)/);
    assert.match(sidebarSource, /> Revoke share/);
    assert.match(sidebarSource, /!ownerShared[\s\S]*?> Share template/);
    assert.doesNotMatch(templateEditorSource, /ownerShared|Shared by you/);
    assert.match(editorBridgeSource, /__gbRevokeTemplateShares = revokeOwnedTemplateShares/);
    assert.match(editorBridgeSource, /emailTemplateShareImportRemove/);
    assert.match(settingsPanelSource, /link\.relationship === 'imported'/);
    assert.match(settingsPanelSource, /removeRetainedEmailTemplate\([\s\S]*?link\.id/);
  });

  it('keeps subject insertion inline and opens smart options for OR expressions', () => {
    assert.match(richTextEditorSource, /range\.createContextualFragment\(html\)/);
    assert.doesNotMatch(richTextEditorSource, /execCommand\('insertHTML'/);
    assert.match(richTextEditorSource, /textContent \|\| ''\)\.replace\(\/\[\\r\\n\]\+\/g, ' '\)/);
    assert.match(templateEditorSource, /variable: \{ \.\.\.v, name \}/);
    assert.match(templateEditorSource, /variable\.name\.split\('\|'\)/);
    assert.match(draggablePopupSource, /closest\?\.\('\.gb-dd-popover'\)/);
  });

  it('uses an accessible icon-only JSON import action', () => {
    assert.match(importTemplatesModalSource, /<IconBtn[\s\S]*?icon=\{<I\.upload \/>\}/);
    assert.match(importTemplatesModalSource, /aria-label="Import JSON file"/);
    assert.doesNotMatch(importTemplatesModalSource, />Open JSON<|>Import JSON</);
  });

  it('refreshes an already-open Settings share table after a remote mutation', () => {
    assert.match(emailLinksSectionSource, /changes\.gbEmailShareRevision/);
    assert.match(emailLinksSectionSource, /if \(area === 'local'[\s\S]*load\(\)/);
    assert.match(emailLinksSectionSource, /chrome\.storage\.onChanged\.addListener\(onShareChange\)/);
    assert.match(emailLinksSectionSource, /chrome\.storage\.onChanged\.removeListener\(onShareChange\)/);
  });

  it('refreshes support tickets from live invalidations without a second poller', () => {
    assert.match(supportTicketsSectionSource, /changes\.gbSupportTicketRevision/);
    assert.match(supportTicketsSectionSource, /load\(\{ quiet: true \}\)/);
    assert.match(supportTicketsSectionSource, /chrome\.storage\.onChanged\.addListener\(onTicketChange\)/);
    assert.doesNotMatch(supportTicketsSectionSource, /setInterval/);
  });

  it('publishes settings, ticket, and email-revoke changes through typed events', {
    skip: !hasProjectRoutes,
  }, () => {
    assert.match(projectRoutesSource, /event_type="settings\.changed"/);
    assert.match(projectRoutesSource, /event_type="tickets\.changed"/);
    assert.match(projectRoutesSource, /["']event_type["']:\s*"email_templates\.changed"/);
    assert.match(projectRoutesSource, /visible=True/);
    assert.match(projectRoutesSource, /notification_service=extension_notifications/);
  });

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
