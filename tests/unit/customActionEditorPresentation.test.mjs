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
const bridgeSource = await readFile(
  new URL('../../src/content/editor-bridge.jsx', import.meta.url),
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
});
