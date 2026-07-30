import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../src/content/crm-action-review-page.jsx', import.meta.url),
  'utf8',
);

describe('Action Review · contact-page presentation', () => {
  it('reuses the shared contact activity feed and scrollable table primitives', () => {
    assert.match(source, /<ActivityRow[\s\S]*a=\{activity\}/);
    assert.match(source, /className="gbcp-list-head"/);
    assert.match(source, /<ScrollArea max=\{460\}>/);
    assert.match(source, /<ScrollArea max=\{420\}>/);
    assert.match(source, /<ScrollArea max=\{520\}>/);
    assert.match(source, /<TaskCheckbox/);
    assert.doesNotMatch(source, /className="gbar-table/);
    assert.doesNotMatch(source, /gbar-meta-chip/);
  });

  it('presents the full-width filter bar as a search', () => {
    assert.match(source, />\s*Search\s*</);
    assert.match(source, /icon=\{<I\.search \/>}/);
    assert.match(source, /\{busy \? 'Searching…' : 'Search'\}/);
    assert.doesNotMatch(source, /Review scope|Apply scope|Updating…/);
  });

  it('renders the filter-only initial response without inventing empty result tables', () => {
    assert.match(source, /!review\.searched \? <PreSearchState \/>/);
    assert.match(source, /Choose a sales rep and run Search/);
    assert.match(source, /creates the Action Review tables only after the search is submitted/);
    assert.match(source, /review\.resultTables\.activities && <ActivitySection/);
    assert.match(source, /review\.resultTables\.emails && <EmailSection/);
    assert.match(source, /review\.resultTables\.tasks && \(/);
    assert.doesNotMatch(source, /native Action Review tables did not become available/);
  });
});
