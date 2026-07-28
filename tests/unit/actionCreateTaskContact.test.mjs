import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeExecutor } from '../../src/lib/codeEngine/executor.js';

/* The Task List rows often can't yield a usable numeric contactId (onclick
   contact links, or mock ids), so createTask must resolve the real contact
   from a representative task id via Task/Get — mirroring the modal's
   apiGetTaskContactId. These pin that resolution. */
function harness({ resolved = {} } = {}) {
  const submitted = [];
  const exec = makeExecutor({
    ctx: { employeeId: '77' },
    submitQuickTask: async ({ context }) => { submitted.push(context.contactId); return { ok: true, taskId: 't' + submitted.length }; },
    getTaskContactId: async (taskId) => resolved[String(taskId)] || '',
  });
  return { exec, submitted };
}

describe('custom-action · createTask contact resolution', () => {
  it('uses a real numeric contactId directly (no Task/Get lookup)', async () => {
    let lookups = 0;
    const submitted = [];
    const exec = makeExecutor({
      ctx: { employeeId: '77' },
      submitQuickTask: async ({ context }) => { submitted.push(context.contactId); return { ok: true, taskId: 't1' }; },
      getTaskContactId: async () => { lookups += 1; return '999'; },
    });
    const r = await exec.run('createTask', { contactId: '555', subject: 'Hi' });
    assert.equal(r.ok, true);
    assert.deepEqual(submitted, ['555']);
    assert.equal(lookups, 0);   // never needed the fallback
  });

  it('resolves the contact from taskId when the given id is a mock/non-numeric', async () => {
    const { exec, submitted } = harness({ resolved: { '900': '12345' } });
    const r = await exec.run('createTask', { contactId: 'mock-5', taskId: '900', subject: 'Hi' });
    assert.equal(r.ok, true);
    assert.deepEqual(submitted, ['12345']);
  });

  it('resolves from taskId when no contactId was given at all', async () => {
    const { exec, submitted } = harness({ resolved: { '901': '6789' } });
    await exec.run('createTask', { taskId: '901', subject: 'Hi' });
    assert.deepEqual(submitted, ['6789']);
  });

  it('throws (no orphan write) when neither a valid contactId nor a resolvable taskId is available', async () => {
    const { exec, submitted } = harness({ resolved: {} });
    await assert.rejects(() => exec.run('createTask', { contactId: 'mock-5', taskId: '404', subject: 'Hi' }), /no valid contact id/);
    await assert.rejects(() => exec.run('createTask', { subject: 'Hi' }), /no valid contact id/);
    assert.equal(submitted.length, 0);
  });

  it('does not leak taskId/contact fields into the task template', async () => {
    let sentTemplate = null;
    const exec = makeExecutor({
      ctx: { employeeId: '77' },
      submitQuickTask: async ({ template }) => { sentTemplate = template; return { ok: true, taskId: 't1' }; },
      getTaskContactId: async () => '12345',
    });
    await exec.run('createTask', { contactId: '555', taskId: '900', contactName: 'X', accountId: '9', subject: 'S', priority: 'med', daysOut: 3 });
    assert.ok(!('taskId' in sentTemplate));
    assert.ok(!('contactId' in sentTemplate));
    assert.equal(sentTemplate.subject, 'S');
    assert.equal(sentTemplate.priority, 2);   // 'med' → 2
  });
});
