import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const editorSource = await readFile(
  new URL('../../src/pages/CustomActionEditor.jsx', import.meta.url),
  'utf8',
);
const iconSource = await readFile(
  new URL('../../src/ui/components/IconPicker.jsx', import.meta.url),
  'utf8',
);
const customLinkSource = await readFile(
  new URL('../../src/ui/components/CustomLinkField.jsx', import.meta.url),
  'utf8',
);
const bridgeSource = await readFile(
  new URL('../../src/content/editor-bridge.jsx', import.meta.url),
  'utf8',
);
const runHostSource = await readFile(
  new URL('../../src/ui/components/CustomActionRunHost.jsx', import.meta.url),
  'utf8',
);
const newActionSource = bridgeSource.slice(
  bridgeSource.indexOf('function newAction'),
  bridgeSource.indexOf('function openAction'),
);
const closeActionSource = bridgeSource.slice(
  bridgeSource.indexOf('function closeActionEditor'),
  bridgeSource.indexOf('function newAction'),
);
const deleteActionSource = bridgeSource.slice(
  bridgeSource.indexOf('async function deleteActionById'),
  bridgeSource.indexOf('/** Explicit-save bridge'),
);
const customTargetingSource = editorSource.slice(
  editorSource.indexOf('{/* Custom targeting'),
  editorSource.indexOf('{/* Meta — name + description'),
);
const recipeLoaderSource = editorSource.slice(
  editorSource.indexOf('const loadRecipe'),
  editorSource.indexOf('const build ='),
);

describe('custom action editor presentation and lifecycle', () => {
  it('wraps the icon choices into a grid without a horizontal scroller', () => {
    assert.match(iconSource, /display: 'grid'/);
    assert.match(iconSource, /gridTemplateColumns: 'repeat\(auto-fill, 28px\)'/);
    assert.doesNotMatch(iconSource, /overflowX: 'auto'/);
    assert.doesNotMatch(iconSource, /flexWrap: 'nowrap'/);
  });

  it('uses an explicit Save Action draft instead of template-style autosave', () => {
    assert.match(editorSource, />\s*Back to Settings\s*</);
    assert.match(editorSource, />\s*Save Action\s*</);
    assert.match(editorSource, /await window\.__gbSaveAction\(record\)/);
    assert.match(editorSource, /const dirty = isNew \|\| draftSnapshot !== savedSnapshot/);
    assert.doesNotMatch(editorSource, /setTimeout\(\(\) => .*__gbSaveAction/);
  });

  it('keeps action programs out of the legacy template schema namespace', () => {
    assert.match(editorSource, /typeId=\{null\}/);
    assert.doesNotMatch(editorSource, /editorTypeIdFor/);
  });

  it('feeds generated saved-template ids into custom-action autocomplete', () => {
    assert.match(editorSource, /loadCodeTemplateLibrary\(\)/);
    assert.match(editorSource, /codeTemplateBindings\(userData, templatesLoaded\)/);
    assert.match(editorSource, /bindings=\{bindings\}/);
    assert.doesNotMatch(editorSource, /bindings=\{null\}/);
  });

  it('loads catalog automation recipes into the draft without saving or running them', () => {
    assert.match(editorSource, /CUSTOM_ACTION_RECIPES/);
    assert.match(editorSource, /customActionRecipe\(id\)/);
    assert.match(editorSource, /placeholder="Load action recipe…"/);
    assert.match(editorSource, /setSource\(recipe\.source\)/);
    assert.doesNotMatch(recipeLoaderSource, /__gbSaveAction|startSim/);
  });

  it('authors modal/provider entry points and includes them in live simulation', () => {
    assert.match(editorSource, /label="Entry points"/);
    assert.match(editorSource, /normalizeEntryPoints\(entryPointsText\)/);
    assert.match(editorSource, /samplePageFor\(pageType, \{ entryPoints:/);
    assert.match(editorSource, /\.gb-task-list-modal, modal:task-list/);
  });

  it('puts the type switcher at the top and reveals custom targeting inline', () => {
    // The Segmented type tabs render directly after the EditorHeader, before
    // the name/description meta row — the email-editor pattern.
    const headerIdx = editorSource.indexOf('<EditorHeader');
    const tabsIdx = editorSource.indexOf('<Segmented value={pageType}');
    const metaIdx = editorSource.indexOf('label="Action name"');
    assert.ok(headerIdx >= 0 && tabsIdx > headerIdx && metaIdx > tabsIdx,
      'type tabs sit between the header and the meta row');
    // No standing "Runs on" / "Custom link" sections — the link + entry-point
    // boxes animate in only while the Custom type is selected.
    assert.doesNotMatch(editorSource, /label="Runs on"/);
    assert.doesNotMatch(editorSource, /label="Custom link"/);
    assert.match(editorSource, /\{pageType === 'custom' && \(/);
    assert.match(editorSource, /AnimatePresence initial=\{false\}/);
    assert.match(editorSource, /label="Link contains"/);
    assert.match(customTargetingSource, /data-custom-target-row="link"/);
    assert.match(customTargetingSource, /data-custom-target-row="entry-points"/);
    assert.match(customTargetingSource, /alwaysOpen/);
    assert.doesNotMatch(customTargetingSource, /gridTemplateColumns: '1fr 1fr'/);
    assert.match(customTargetingSource, /Optional — show the action when the page URL contains/);
    assert.match(editorSource, /<CustomLinkField value=\{customUrl\} onChange=\{setCustomUrl\} alwaysOpen \/>/);
    assert.match(customLinkSource, /\{!alwaysOpen && \(\s*<div[^>]*>\s*Shows the shelf action/);
  });

  it('keeps new actions in memory until Save Action is clicked', () => {
    assert.match(newActionSource, /__isNew: true/);
    assert.match(newActionSource, /currentActionDraft = rec/);
    assert.doesNotMatch(newActionSource, /customActions\.push/);
    assert.doesNotMatch(newActionSource, /saveCustomActions/);
  });

  it('always returns action editing and deletion to Settings', () => {
    assert.match(closeActionSource, /show\('ed-settings'\)/);
    assert.doesNotMatch(closeActionSource, /_actionPreviousView/);
    assert.match(deleteActionSource, /show\('ed-settings'\)/);
    assert.doesNotMatch(deleteActionSource, /show\('ed-empty'\)/);
    assert.doesNotMatch(editorSource, /from the sidebar/);
  });

  it('auto-runs a single live record and announces only actionable failures', () => {
    assert.match(runHostSource, /liveActionRunPolicy\(page, plan\)/);
    assert.match(runHostSource, /if \(!policy\.confirm\)/);
    assert.match(runHostSource, /announceSuccess: policy\.announceSuccess/);
    assert.match(runHostSource, /else if \(p\.announceSuccess !== false\)/);
  });
});
