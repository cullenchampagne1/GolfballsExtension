import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/* Pure logic lives in crmContact.js (no JSX / DOM deps) so it imports clean. */
import { mergeContactCustomData } from '../../src/lib/crmContact.js';

describe('crm · contact CustomData merge', () => {
  const server = JSON.stringify({
    Archived: false, Context: 'old', LinkedInURL: '',
    LastConversationDate: '7/28/2026', LastOrderDate: '7/27/2026',
  });

  it('preserves server-managed keys when editing LinkedIn/Context/Archived', () => {
    const out = JSON.parse(mergeContactCustomData(server, { LinkedInURL: 'https://x', Context: 'new', Archived: true }));
    assert.equal(out.LinkedInURL, 'https://x');
    assert.equal(out.Context, 'new');
    assert.equal(out.Archived, true);
    // untouched, must survive
    assert.equal(out.LastConversationDate, '7/28/2026');
    assert.equal(out.LastOrderDate, '7/27/2026');
  });

  it('leaves a key untouched when the edit omits it (partial edit)', () => {
    const out = JSON.parse(mergeContactCustomData(server, { Context: 'only context' }));
    assert.equal(out.Context, 'only context');
    assert.equal(out.LinkedInURL, '');      // not in edits → preserved from server
    assert.equal(out.LastOrderDate, '7/27/2026');
  });

  it('coerces Archived to a real boolean', () => {
    assert.equal(JSON.parse(mergeContactCustomData(server, { Archived: 1 })).Archived, true);
    assert.equal(JSON.parse(mergeContactCustomData(server, { Archived: 0 })).Archived, false);
  });

  it('normalizes a null/blank LinkedIn edit to empty string, not undefined', () => {
    const out = JSON.parse(mergeContactCustomData(server, { LinkedInURL: undefined }));
    assert.equal(out.LinkedInURL, '');
    assert.ok(Object.prototype.hasOwnProperty.call(out, 'LinkedInURL'));
  });

  it('accepts an already-parsed object as current, without mutating it', () => {
    const cur = { Context: 'a', LastOrderDate: '1/1/2026' };
    const out = JSON.parse(mergeContactCustomData(cur, { Context: 'b' }));
    assert.equal(out.Context, 'b');
    assert.equal(out.LastOrderDate, '1/1/2026');
    assert.equal(cur.Context, 'a');   // original object untouched
  });

  it('tolerates a malformed CustomData string by starting fresh', () => {
    const out = JSON.parse(mergeContactCustomData('{not json', { Context: 'x' }));
    assert.equal(out.Context, 'x');
  });

  it('handles null current (contact with no CustomData yet)', () => {
    const out = JSON.parse(mergeContactCustomData(null, { LinkedInURL: 'https://y', Archived: false }));
    assert.equal(out.LinkedInURL, 'https://y');
    assert.equal(out.Archived, false);
  });
});
