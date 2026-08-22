import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = {
  storage: { local: {}, onChanged: { addListener() {} } },
  runtime: {},
};
await import(`../../lib/managed-email-templates.js?test=${Date.now()}`);
const bucket = globalThis.GBManagedEmailTemplates;

const item = (patch = {}) => ({
  id: '0123456789abcdefghijklmnopqrstuv',
  client_template_id: 'welcome',
  version: 1,
  template: {
    type: 'order', name: 'Welcome', subject: 'Hello', body: '<p>Hi</p>',
    vars: { salutation: { type: 'literal', value: 'Hello' } },
  },
  created_by: 'Parent One',
  last_editor: 'Parent One',
  created_by_current: false,
  conflict_with: [],
  ...patch,
});

describe('managed email-template bucket cache', () => {
  it('mirrors managed rows without deleting preserved local templates', () => {
    const local = { id: 'private', type: 'order', name: 'Private' };
    const direct = { id: 'direct', type: 'order', name: 'Direct', shareImport: { shareId: 'x' } };
    const result = bucket.reconcile([local, direct], { templates: [item()] }, {
      'emailTemplates.allowLocalTemplateUsage': false,
    });

    assert.equal(result.some((row) => row === local), true);
    assert.equal(result.some((row) => row === direct), true);
    const managed = result.find((row) => row.managedTemplate);
    assert.equal(managed.name, 'Welcome');
    assert.equal(managed.managedTemplate.editable, false);
    assert.equal(managed.managedTemplate.lastEditor, 'Parent One');
  });

  it('adopts a parent local row and publishes it as an editable versioned document', () => {
    const local = { id: 'welcome', folderId: 'sales', type: 'order', name: 'Welcome', subject: 'Hello', body: '<p>Hi</p>' };
    const result = bucket.reconcile([local], {
      templates: [item({ created_by_current: true })],
    }, { 'emailTemplates.allowParentAccount': true });

    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'welcome');
    assert.equal(result[0].folderId, 'sales');
    assert.equal(result[0].managedTemplate.editable, true);
    const update = bucket.writes(result, { templates: [item({ created_by_current: true })] });
    assert.equal(update.templates[0].bucket_id, item().id);
    assert.equal(update.templates[0].base_version, 1);
    assert.equal(Object.hasOwn(update.templates[0].template, 'managedTemplate'), false);
    assert.equal(bucket.needsPublish(result, { templates: [item({ created_by_current: true })] }), false);
    result[0].subject = 'Pending local edit';
    assert.equal(bucket.needsPublish(result, { templates: [item({ created_by_current: true })] }), true);
  });

  it('keeps child follow-up, sender, and literal overrides across server refreshes', () => {
    const [first] = bucket.reconcile([], { templates: [item()] }, {});
    first.presetTaskId = 'task-local';
    first.senderAccount = 'alternate';
    first.vars.salutation.value = 'Howdy';
    first.managedTemplate.overrides = {
      presetTaskId: 'task-local', senderAccount: 'alternate',
      literalVariables: { salutation: 'Howdy' },
    };
    const [refreshed] = bucket.reconcile([first], {
      templates: [item({ version: 2, template: { ...item().template, subject: 'Updated' } })],
    }, {});

    assert.equal(refreshed.subject, 'Updated');
    assert.equal(refreshed.presetTaskId, 'task-local');
    assert.equal(refreshed.senderAccount, 'alternate');
    assert.equal(refreshed.vars.salutation.value, 'Howdy');
  });

  it('preserves an unsent parent edit when a newer remote revision arrives', () => {
    const [parent] = bucket.reconcile([], { templates: [item()] }, {
      'emailTemplates.allowParentAccount': true,
    });
    parent.subject = 'My pending subject';
    const [merged] = bucket.reconcile([parent], {
      templates: [item({ version: 2, last_editor: 'Parent Two', template: { ...item().template, body: '<p>Remote</p>' } })],
    }, { 'emailTemplates.allowParentAccount': true });

    assert.equal(merged.subject, 'My pending subject');
    assert.equal(merged.managedTemplate.remoteVersion, 2);
    assert.deepEqual(merged.managedTemplate.conflictWith, ['Parent Two']);

    const [acknowledged] = bucket.reconcile([merged], {
      templates: [item({
        version: 3, last_editor: 'This parent',
        template: { ...item().template, subject: 'My pending subject', body: '<p>Remote</p>' },
      })],
    }, { 'emailTemplates.allowParentAccount': true }, { acceptRemote: true });
    assert.equal(acknowledged.body, '<p>Remote</p>');
    assert.equal(acknowledged.managedTemplate.remoteVersion, undefined);
  });
});
