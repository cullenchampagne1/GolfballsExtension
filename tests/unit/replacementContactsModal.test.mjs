import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [taskListSource, replacementSource, panelSource, manifestSource] = await Promise.all([
  readFile(new URL('../../src/modals/TaskList.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/modals/ReplacementContacts.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/ui/components/FloatingPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../manifest.json', import.meta.url), 'utf8'),
]);

describe('Replacement Contacts modal handoff', () => {
  it('launches from the empty-selection Task List footer as a sibling modal', () => {
    assert.match(taskListSource, /<Btn[\s\S]*?>Replacement Contacts<\/Btn>/);
    assert.match(taskListSource, /visible=\{!replacementContactsOpen\}/);
    assert.match(taskListSource, /replacementContactsOpen && \([\s\S]*?<ReplacementContacts/);
    assert.match(taskListSource, /onClosed=\{\(\) => setReplacementContactsOpen\(false\)\}/);
    assert.doesNotMatch(taskListSource, /Select rows above to enable bulk actions/);
  });

  it('keeps the parent mounted without letting its Escape handler close underneath the child', () => {
    const visibilityGuard = panelSource.indexOf('if (!visible) return undefined;');
    const keyListener = panelSource.indexOf("document.addEventListener('keydown', onKey)", visibilityGuard);
    assert.ok(visibilityGuard > 0);
    assert.ok(keyListener > visibilityGuard);
  });

  it('uses the original queue model and CRM task-completion path inside a FloatingPanel', () => {
    assert.match(replacementSource, /export function ReplacementContacts/);
    assert.match(replacementSource, /<FloatingPanel/);
    assert.match(replacementSource, /selectReplacementTasks\(parseTasksFromHtml\(html\)\)/);
    assert.match(replacementSource, /closeReplacementTasks\(ids, \{/);
    assert.match(replacementSource, /complete: completeTaskById/);
  });

  it('ships no custom-page engine or takeover bundles', () => {
    assert.doesNotMatch(manifestSource, /custom-page/);
    assert.doesNotMatch(manifestSource, /(?:contact|account|opportunity)-details\.js/);
    assert.doesNotMatch(manifestSource, /crm-(?:search|task-list|recent-history|action-review)-page\.js/);
  });

  it('uses the standard animated modal scale and leaves the queue unclipped by filters', () => {
    assert.match(replacementSource, /function AnalyzeModal[\s\S]*?<FloatingPanel/);
    assert.match(replacementSource, /bindClose=\{bindClose\}/);
    assert.match(replacementSource, /className="gb-scroll"/);
    assert.match(replacementSource, /style=\{\{ width: 152 \}\}/);
    assert.doesNotMatch(replacementSource, /placeholder="Search/);
    assert.doesNotMatch(replacementSource, />Blacklist</);
    assert.doesNotMatch(replacementSource, />Export</);
  });
});
