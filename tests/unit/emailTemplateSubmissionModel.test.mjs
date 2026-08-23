import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  emailTemplateSubmission,
  submissionEditorTemplate,
  submissionTemplateDocument,
} from '../../src/lib/emailTemplateSubmission.js';

describe('email-template submission editor model', () => {
  it('wraps a server draft for the full editor without making it a normal template', () => {
    const editor = submissionEditorTemplate({
      id: 'submission-server-id', version: 4, status: 'pending',
      submitter_name: 'Restricted Author', submitted_by_current: false,
      template: {
        name: 'Review me', type: 'account', subject: 'Hello', body: '<p>Hi</p>',
      },
    }, true);

    assert.equal(editor.id, 'submission_submission-server-id');
    assert.equal(editor.name, 'Review me');
    assert.deepEqual(emailTemplateSubmission(editor), {
      kind: 'revstack-email-template-submission',
      submissionId: 'submission-server-id', version: 4, status: 'pending',
      submitterName: 'Restricted Author', lastEditor: '', approvedBucketId: '',
      isParent: true, submittedByCurrent: false, updatedAt: '',
    });
  });

  it('strips editor and management metadata before autosave or approval', () => {
    const editor = submissionEditorTemplate({
      id: 'submission-server-id', version: 1, status: 'approved',
      template: { name: 'Approved', type: 'order', subject: 'Hi', body: '<p>Hi</p>' },
    });
    editor.folderId = 'local-only';
    editor.managedTemplate = { kind: 'revstack-managed-email-template' };

    assert.deepEqual(submissionTemplateDocument(editor), {
      name: 'Approved', type: 'order', subject: 'Hi', body: '<p>Hi</p>',
    });
  });
});
