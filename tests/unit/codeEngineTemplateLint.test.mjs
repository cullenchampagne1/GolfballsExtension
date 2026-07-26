/**
 * templateLint — missing saved-template dependencies surface as author-time
 * problems, so a shared campaign referencing an email the recipient doesn't
 * have shows the issue in the editor (not only at run time).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lintTemplateRefs } from '../../src/lib/codeEngine/templateLint.js';

const READY = { ready: true, emails: ['Win-back'], tasks: ['Follow up'], calls: [], emailIds: ['WinBack'], taskIds: ['FollowUp'], callIds: [] };

describe('templateLint · missing dependencies', () => {
  it('flags a user.email("X") whose name is not saved', () => {
    const src = 'await actions.sendEmail(user.email("Ghost Email"));';
    const [d] = lintTemplateRefs(src, READY);
    assert.equal(d.kind, 'email');
    assert.equal(d.name, 'Ghost Email');
    assert.equal(src.slice(d.from, d.to), 'Ghost Email');
    assert.match(d.message, /No saved email/);
  });

  it('flags a user.emails.<Id> whose code id is not saved', () => {
    const src = 'const o = await page.evaluate(user.emails.GhostPromo);';
    const [d] = lintTemplateRefs(src, READY);
    assert.equal(d.kind, 'email');
    assert.equal(d.name, 'GhostPromo');
    assert.equal(src.slice(d.from, d.to), 'GhostPromo');
  });

  it('passes a known code id', () => {
    assert.deepEqual(lintTemplateRefs('page.evaluate(user.emails.WinBack)', READY), []);
  });

  it('flags editing an unapproved contact field (even before templates load)', () => {
    const [d] = lintTemplateRefs('page.contact.ssn = "123";', { ready: false });
    assert.equal(d.kind, 'edit');
    assert.equal(d.name, 'ssn');
    assert.match(d.message, /not an editable field/);
    // an approved field is fine, and == comparisons are not edits
    assert.deepEqual(lintTemplateRefs('page.contact.jobTitle = "VP"; if (page.contact.email == "x") {}', READY).filter((x) => x.kind === 'edit'), []);
  });

  it('passes a name that IS saved', () => {
    assert.deepEqual(lintTemplateRefs('actions.sendEmail(user.email("Win-back"))', READY), []);
  });

  it('flags task/call lookups too', () => {
    const refs = lintTemplateRefs('user.task("Nope"); user.call("Nope2");', READY);
    assert.deepEqual(refs.map((r) => `${r.kind}:${r.name}`), ['task:Nope', 'call:Nope2']);
  });

  it('does not lint until the templates are loaded (ready)', () => {
    assert.deepEqual(lintTemplateRefs('user.email("anything")', { ready: false, emails: [] }), []);
    assert.deepEqual(lintTemplateRefs('user.email("anything")', null), []);
  });

  it('leaves non-literal (variable) references alone', () => {
    assert.deepEqual(lintTemplateRefs('const n = "Win-back"; user.email(n);', READY), []);
  });
});
