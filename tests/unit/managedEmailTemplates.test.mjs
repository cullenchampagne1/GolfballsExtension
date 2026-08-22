import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../../lib/managed-email-templates.js', import.meta.url), 'utf8',
);

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

function syncHarness() {
  const stored = {
    templates: [],
    devSettings: { 'emailTemplates.allowLocalTemplateUsage': false },
  };
  const requests = [];
  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(_keys, callback) { callback(structuredClone(stored)); },
        set(values, callback) {
          Object.assign(stored, structuredClone(values));
          callback?.();
        },
      },
      onChanged: { addListener() {} },
    },
  };
  const context = vm.createContext({
    chrome, console, globalThis: null,
    Date, JSON, Promise, Object, Array, String, Number, Boolean,
    RegExp, Error, TypeError, Set, Map, structuredClone,
    setTimeout, clearTimeout,
  });
  context.globalThis = context;
  context.GBInstallationAuth = {
    apiJson() {
      return new Promise((resolve) => requests.push(resolve));
    },
  };
  new vm.Script(source, { filename: 'managed-email-templates.js' }).runInContext(context);
  return { bucket: context.GBManagedEmailTemplates, requests, stored };
}

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

  it('publishes only explicitly enrolled local templates', () => {
    const privateTemplate = {
      id: 'private', type: 'order', name: 'Private', subject: 'Local only', body: '<p>Hi</p>',
    };
    const enrolledTemplate = {
      id: 'approved', type: 'order', name: 'Approved', subject: 'Shared', body: '<p>Hi</p>',
      managedTemplateEnrollment: { kind: 'revstack-managed-email-template' },
    };
    const update = bucket.writes([privateTemplate, enrolledTemplate], { templates: [] });

    assert.deepEqual(update.templates.map((row) => row.client_template_id), ['approved']);
    assert.equal(update.templates[0].template.managedTemplateEnrollment, undefined);
    assert.equal(bucket.needsPublish([privateTemplate], { templates: [] }), false);
    assert.equal(bucket.needsPublish([privateTemplate, enrolledTemplate], { templates: [] }), true);
  });

  it('does not adopt an identical private template from another parent', () => {
    const privateTemplate = {
      id: 'private-welcome',
      ...item().template,
    };
    const result = bucket.reconcile([privateTemplate], {
      templates: [item({ created_by_current: false })],
    }, { 'emailTemplates.allowParentAccount': true });

    assert.equal(result.length, 2);
    assert.equal(result[0], privateTemplate);
    assert.equal(result[1].managedTemplate.editable, true);
    assert.notEqual(result[1].id, privateTemplate.id);
  });

  it('keeps a contributor local copy when its bucket row is cleared', () => {
    const [contributed] = bucket.reconcile([], {
      templates: [item({ created_by_current: true })],
    }, { 'emailTemplates.allowParentAccount': true });
    const detached = bucket.reconcile([contributed], { templates: [] }, {});

    assert.equal(detached.length, 1);
    assert.equal(detached[0].id, 'welcome');
    assert.equal(detached[0].name, 'Welcome');
    assert.equal(detached[0].managedTemplate, undefined);

    const [mirrored] = bucket.reconcile([], { templates: [item()] }, {});
    assert.deepEqual(bucket.reconcile([mirrored], { templates: [] }, {}), []);
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

  it('runs a forced refresh after an overlapping startup sync', async () => {
    const h = syncHarness();
    const startup = h.bucket.sync();
    for (let turn = 0; turn < 5 && h.requests.length < 1; turn += 1) {
      await Promise.resolve();
    }
    assert.equal(h.requests.length, 1);

    const invalidation = h.bucket.sync({ force: true });
    h.requests[0]({ revision: 'first', is_parent: false, templates: [] });
    await startup;
    for (let turn = 0; turn < 5 && h.requests.length < 2; turn += 1) {
      await Promise.resolve();
    }
    assert.equal(h.requests.length, 2, 'the invalidation must not reuse a stale in-flight fetch');

    h.requests[1]({ revision: 'second', is_parent: false, templates: [] });
    await invalidation;
    assert.equal(h.stored.gbManagedEmailTemplateBucket.revision, 'second');
  });
});
