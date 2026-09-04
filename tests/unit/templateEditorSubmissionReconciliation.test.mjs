import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* The submission-reconciliation effect in TemplateEditor.jsx lives inside a
 * component with dozens of interdependent hooks (typing, recipient DOM
 * picking, live variable resolution, ...), so this project's convention for
 * page-level React components (see customActionEditorPresentation.test.mjs)
 * is a structural assertion on the source rather than a full render harness.
 * These assertions pin the exact fix: the reconciliation effect must decide
 * "is this my own autosave echoing back" from a version number this editor
 * itself predicted, not from comparing a raw JSON string built from the
 * server-echoed template against one built earlier — a comparison that
 * silently mismatched on every autosave (any incidental reshape across the
 * server round trip broke equality) and reset the fields, and the
 * contenteditable cursor with them, while the user was still typing. */
const editorSource = await readFile(
  new URL('../../src/pages/TemplateEditor.jsx', import.meta.url), 'utf8',
);
const reconcileEffect = editorSource.slice(
  editorSource.indexOf('useEffect(() => {\n    if ((!readOnly && !submission)'),
  editorSource.indexOf("}, [importRevision, readOnly, submission, tpl]);"),
);
const saveHelper = editorSource.slice(
  editorSource.indexOf('function notePendingSubmissionSave'),
  editorSource.indexOf('const subjectTracker = useMemo'),
);

describe('template editor submission reconciliation', () => {
  it('gates the own-echo check on a predicted version, not a comparison against the incoming template', () => {
    assert.match(reconcileEffect, /importRevision <= lastKnownVersion\.current/);
    assert.match(reconcileEffect, /isOwnEcho = submission && importRevision <= ownPendingVersion\.current/);
    // The guard must not re-derive its skip decision from `tpl` (the
    // server-echoed document) — that was the fragile, reintroduced bug.
    assert.doesNotMatch(reconcileEffect, /JSON\.stringify\(submissionTemplateDocument\(tpl\)\)\s*===/);
  });

  it('predicts its own outstanding save only by comparing this editor\'s own documents, never the server echo', () => {
    // Both sides of the dirty-check must come from calls this editor made
    // itself (`next` just built, `lastSentSnapshot` from the last save this
    // editor sent) — never from `tpl`, which is why the comparison can't be
    // thrown off by how the server happens to re-serialize the round trip.
    assert.match(saveHelper, /JSON\.stringify\(submissionTemplateDocument\(next\)\)/);
    assert.doesNotMatch(saveHelper, /submissionTemplateDocument\(tpl\)/);
    assert.match(saveHelper, /ownPendingVersion\.current = Math\.max\(ownPendingVersion\.current, lastKnownVersion\.current\) \+ 1/);
  });

  it('routes both the debounced autosave and the immediate type-change save through the same prediction', () => {
    const calls = [...editorSource.matchAll(/(?<!function )notePendingSubmissionSave\(next\);/g)];
    assert.equal(calls.length, 2, 'debounced autosave and the type-change save must both register their own echo');
  });

  it('removes the fragile self-echo refs the bug lived in', () => {
    assert.doesNotMatch(editorSource, /localSubmissionSnapshot/);
    assert.doesNotMatch(editorSource, /seenImportRevision/);
  });
});
