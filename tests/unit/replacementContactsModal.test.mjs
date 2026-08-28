import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [taskListSource, replacementSource, panelSource, iconSource, manifestSource] = await Promise.all([
  readFile(new URL('../../src/modals/TaskList.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/modals/ReplacementContacts.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/ui/components/FloatingPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/ui/icons.jsx', import.meta.url), 'utf8'),
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
    const visibilityGuard = panelSource.indexOf('if (!visible || !closeOnEscape) return undefined;');
    const keyListener = panelSource.indexOf("document.addEventListener('keydown', onKey)", visibilityGuard);
    assert.ok(visibilityGuard > 0);
    assert.ok(keyListener > visibilityGuard);
    assert.match(replacementSource, /closeOnEscape=\{!reviewId\}/);
  });

  it('uses the original queue model and CRM task-completion path inside a FloatingPanel', () => {
    assert.match(replacementSource, /export function ReplacementContacts/);
    assert.match(replacementSource, /<FloatingPanel/);
    assert.match(replacementSource, /selectReplacementTasks\(taskSnapshot\)/);
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
    assert.match(replacementSource, /function AnalyzeModal[\s\S]*?backdrop=\{false\}/);
    assert.doesNotMatch(replacementSource, /visible=\{!reviewId\}/);
    assert.match(replacementSource, /className="gb-scroll"/);
    assert.match(replacementSource, /style=\{\{ width: 152 \}\}/);
    assert.doesNotMatch(replacementSource, /placeholder="Search/);
    assert.doesNotMatch(replacementSource, />Blacklist</);
    assert.doesNotMatch(replacementSource, />Export</);
  });

  it('keeps the narrower review layout compact without wrapping its bounced address', () => {
    assert.match(replacementSource, /function BouncedEmail\(\{ rec, truncate = false \}\)/);
    assert.match(replacementSource, /<BouncedEmail rec=\{rec\} truncate \/>/);
    assert.match(replacementSource, /width=\{540\}/);
    assert.match(replacementSource, /gridTemplateColumns: 'minmax\(0, 1fr\) minmax\(0, 1fr\) auto'/);
    assert.equal((replacementSource.match(/boxSizing: 'border-box', width: '100%'/g) || []).length, 2);
    assert.match(replacementSource, /\{kindLabel\(rec\.kind\)\}<\/Tag>\s*<div[^>]*>\s*<Mono[^>]*>task #\{rec\.taskId\}<\/Mono>/);
  });

  it('keeps one draggable review window in place while another row replaces its content', () => {
    assert.match(replacementSource, /function AnalyzeModal[\s\S]*?<FloatingPanel[\s\S]*?\n\s+draggable\n/);
    assert.match(replacementSource, /<AnalyzeModal\s+rec=\{reviewRecord\}/);
    assert.doesNotMatch(replacementSource, /<AnalyzeModal\s+key=/);
    assert.doesNotMatch(replacementSource, /<AnalyzeModal[\s\S]*?draggable=\{draggable\}/);
  });

  it('identifies the row shown in the review window from either open control', () => {
    assert.match(replacementSource, /active=\{reviewId === rec\.id\}/);
    assert.match(replacementSource, /aria-current=\{active \? 'true' : undefined\}/);
    assert.doesNotMatch(replacementSource, />Viewing<\/Tag>/);
    assert.match(replacementSource, /<IconBtn[^\n]*active=\{active\}[^\n]*onClick=\{\(\) => onOpen\(rec\.id\)\}/);
    assert.match(replacementSource, /<tr[^>]*onClick=\{\(\) => onOpen\(rec\.id\)\}/);
  });

  it('reuses Task List data instead of fetching and parsing Page 349 again', () => {
    assert.match(taskListSource, /<ReplacementContacts[\s\S]*?taskSnapshot=\{tasks\}/);
    assert.match(taskListSource, /<ReplacementContacts[\s\S]*?taskStatus=\{status\}/);
    assert.match(taskListSource, /<ReplacementContacts[\s\S]*?onRefresh=\{loadTasks\}/);
    assert.match(replacementSource, /selectReplacementTasks\(taskSnapshot\)/);
    assert.doesNotMatch(replacementSource, /fetch\(TASKS_ENDPOINT/);
    assert.match(replacementSource, /contactSummaryCache\.has\(contactId\)/);
    assert.match(replacementSource, /result = await loadContactSummary\(contactId\)/);
  });

  it('only renders icons that exist in the shared registry', () => {
    const names = [...replacementSource.matchAll(/<I\.([A-Za-z0-9_]+)/g)].map((match) => match[1]);
    for (const name of new Set(names)) {
      assert.match(iconSource, new RegExp(`\\b${name}:\\s*\\(`), `${name} must be a registered icon component`);
    }
  });
});
