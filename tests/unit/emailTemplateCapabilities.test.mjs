import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAIL_TEMPLATE_CAPABILITY_KEYS,
  emailTemplateIsBucketEnrolled,
  emailTemplateIsEditable,
  filterLocalEmailTemplates,
  readEmailTemplateCapabilities,
  resolveEmailTemplateCapabilities,
  setEmailTemplateBucketEnrollment,
} from '../../src/lib/emailTemplateCapabilities.js';

describe('managed email-template capabilities', () => {
  it('defaults every rollout capability on when no managed value is stored', () => {
    assert.deepEqual(resolveEmailTemplateCapabilities(), {
      allowCreation: true,
      allowLinkImport: true,
      allowBulkSending: true,
      allowLocalTemplateUsage: true,
      allowParentAccount: false,
    });
  });

  it('closes only capabilities explicitly set to false', () => {
    const settings = Object.fromEntries(
      Object.values(EMAIL_TEMPLATE_CAPABILITY_KEYS).map((key) => [key, false]),
    );
    assert.deepEqual(resolveEmailTemplateCapabilities(settings), {
      allowCreation: false,
      allowLinkImport: false,
      allowBulkSending: false,
      allowLocalTemplateUsage: false,
      allowParentAccount: false,
    });
  });

  it('projects local templates out without mutating or deleting the stored library', () => {
    const stored = [
      { id: 'welcome' },
      { id: 'direct', shareImport: { shareId: 'share' } },
      { id: 'managed', managedTemplate: { kind: 'revstack-managed-email-template', bucketId: 'bucket' } },
    ];
    const hidden = filterLocalEmailTemplates(stored, {
      'emailTemplates.allowLocalTemplateUsage': false,
    });

    assert.deepEqual(hidden.map((row) => row.id), ['direct', 'managed']);
    assert.deepEqual(stored.map((row) => row.id), ['welcome', 'direct', 'managed']);
    assert.deepEqual(filterLocalEmailTemplates(stored, {}).map((row) => row.id), ['welcome', 'direct']);
  });

  it('gives parent accounts one editable merged catalog', () => {
    const managed = {
      id: 'managed',
      managedTemplate: {
        kind: 'revstack-managed-email-template', bucketId: 'bucket', editable: true,
      },
    };
    const settings = { 'emailTemplates.allowParentAccount': true };
    assert.deepEqual(filterLocalEmailTemplates([{ id: 'local' }, managed], settings)
      .map((row) => row.id), ['local', 'managed']);
    assert.equal(emailTemplateIsEditable(managed, settings), true);
    assert.equal(emailTemplateIsEditable(managed, {}), false);
  });

  it('enrolls and detaches a local template without changing its document', () => {
    const local = { id: 'private', type: 'order', name: 'Private template' };
    const enrolled = setEmailTemplateBucketEnrollment(local, true);

    assert.equal(emailTemplateIsBucketEnrolled(local), false);
    assert.equal(emailTemplateIsBucketEnrolled(enrolled), true);
    assert.equal(local.managedTemplateEnrollment, undefined);

    const detached = setEmailTemplateBucketEnrollment({
      ...enrolled,
      managedTemplate: {
        kind: 'revstack-managed-email-template', bucketId: 'bucket-row',
      },
    }, false);
    assert.deepEqual(detached, local);
  });

  it('reads the live devSettings bag through the storage boundary', async () => {
    const storage = {
      get(key, callback) {
        assert.equal(key, 'devSettings');
        callback({ devSettings: { 'emailTemplates.allowBulkSending': false } });
      },
    };
    assert.equal((await readEmailTemplateCapabilities(storage)).allowBulkSending, false);
  });
});
