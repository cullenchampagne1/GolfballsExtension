import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('note template follow-up action · editor presentation', () => {
  it('shows one persisted selector shared by note, task, and call-log panels', async () => {
    const source = await readSource('src/pages/NoteEditor.jsx');

    assert.match(source, /followUpActionId:\s*String\(tpl\.followUpActionId\s*\|\|\s*''\)\.trim\(\)/);
    assert.match(source, /followUpActionId:\s*String\(data\.followUpActionId\s*\|\|\s*''\)\.trim\(\)/);
    assert.match(source, /label="Follow-up action"/);
    assert.match(source, /associated contact page after this/);
    assert.match(source, /loadTemplateFollowUpActions\(\)/);
    assert.match(source, /subscribeToTemplateFollowUpActions\(update\)/);

    const panelIndex = source.indexOf('<Panel data={data} set={set} />');
    const selectorIndex = source.indexOf('label="Follow-up action"');
    assert.ok(panelIndex >= 0 && selectorIndex > panelIndex, 'shared selector must sit outside every subtype panel');
  });

  it('wires every activity submitter through the shared success boundary', async () => {
    const [note, task, call] = await Promise.all([
      readSource('src/lib/submitOrderNote.js'),
      readSource('src/lib/submitQuickTask.js'),
      readSource('src/lib/submitCallLog.js'),
    ]);

    for (const source of [note, task, call]) {
      assert.match(source, /runTemplateFollowUpAfterSuccess\s*\(/);
    }
    assert.match(note, /GB_QUICK_NOTE_DONE/);
    assert.ok(
      note.lastIndexOf('runTemplateFollowUpAfterSuccess') > note.indexOf("message.action === 'GB_QUICK_NOTE_DONE'"),
      'order-note follow-up must remain downstream of frame-confirmed success',
    );
  });
});
