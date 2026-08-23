import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../../lib/email-template-submissions.js', import.meta.url), 'utf8',
);

const submission = (patch = {}) => ({
  id: 'S'.repeat(32),
  client_submission_id: 'local-draft-1',
  version: 1,
  status: 'pending',
  template: {
    name: 'Customer follow-up', type: 'order',
    subject: 'Hello', body: '<p>Hello</p>',
  },
  submitter_name: 'Restricted Author',
  submitted_by_current: true,
  updated_at: '2026-08-23T12:00:00',
  ...patch,
});

const payload = (row, patch = {}) => ({
  revision: `revision-${row?.version || 0}-${row?.status || 'empty'}`,
  is_parent: false,
  can_submit: true,
  pending_count: row?.status === 'pending' ? 1 : 0,
  submissions: row ? [row] : [],
  ...patch,
});

function harness(responder, initial = {}) {
  const stored = structuredClone(initial);
  const requests = [];
  let managedSyncs = 0;
  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(key, callback) { callback({ [key]: structuredClone(stored[key]) }); },
        set(values, callback) {
          Object.assign(stored, structuredClone(values));
          callback?.();
        },
      },
    },
  };
  const context = vm.createContext({
    chrome, console, globalThis: null,
    Date, JSON, Promise, Object, Array, String, Number, Boolean,
    Error, TypeError, structuredClone, encodeURIComponent,
  });
  context.globalThis = context;
  context.GBInstallationAuth = {
    async apiJson(path, options = {}) {
      const request = {
        path, method: options.method || 'GET',
        body: options.body ? JSON.parse(options.body) : null,
      };
      requests.push(request);
      return structuredClone(await responder(request, requests.length));
    },
  };
  context.GBManagedEmailTemplates = {
    async sync(options) {
      assert.equal(options.force, true);
      managedSyncs += 1;
    },
  };
  new vm.Script(source, { filename: 'email-template-submissions.js' }).runInContext(context);
  return {
    api: context.GBEmailTemplateSubmissions,
    stored, requests, managedSyncs: () => managedSyncs,
  };
}

describe('email-template submission cache', () => {
  it('keeps pending drafts outside templates and refreshes authoritative state on open', async () => {
    const row = submission();
    const h = harness(() => payload(row), {
      templates: [{ id: 'approved', name: 'Approved template' }],
      gbEmailTemplateSubmissions: {
        schemaVersion: 1, revision: 'stale', submissions: [],
      },
    });

    const cache = await h.api.sync({ force: true });
    assert.equal(cache.pendingCount, 1);
    assert.equal(cache.submissions[0].template.name, 'Customer follow-up');
    assert.deepEqual(h.stored.templates, [{ id: 'approved', name: 'Approved template' }]);
    assert.equal(h.requests[0].method, 'GET');
  });

  it('serializes revisions and approves the exact reviewed document', async () => {
    const id = 'S'.repeat(32);
    const h = harness((request, index) => {
      if (index === 1) {
        assert.equal(request.body.base_version, 1);
        return payload(submission({
          version: 2, template: { ...submission().template, subject: 'Revision two' },
        }));
      }
      assert.equal(request.body.base_version, 2);
      assert.equal(request.body.template.subject, 'Parent reviewed');
      return payload(submission({
        version: 3, status: 'approved', approved_bucket_id: 'B'.repeat(32),
        template: request.body.template,
      }), { is_parent: true, can_submit: false });
    }, {
      gbEmailTemplateSubmissions: {
        schemaVersion: 1, revision: 'one', submissions: [submission()],
      },
    });

    const first = h.api.update(id, { ...submission().template, subject: 'Revision two' });
    const approved = h.api.approve(id, { ...submission().template, subject: 'Parent reviewed' });
    await first;
    const result = await approved;

    assert.equal(result.status, 'approved');
    assert.equal(h.requests[0].path, `${h.api.PATH}/${id}`);
    assert.equal(h.requests[1].path, `${h.api.PATH}/${id}/approve`);
    assert.equal(h.managedSyncs(), 1);
  });
});
