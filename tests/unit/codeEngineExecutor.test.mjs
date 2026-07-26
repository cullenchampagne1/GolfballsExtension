/**
 * executor — the content-side real writer. Verifies each contract routes to the
 * right injected lib call with the contact context, that edits map to the
 * crmUpdateContact payload keys, and that a live run (executor passed to
 * simulateProgram) actually fires the writes in order.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeExecutor, mapEditFields } from '../../src/lib/codeEngine/executor.js';
import { simulateProgram, asyncFunctionRunner } from '../../src/lib/codeEngine/simulate.js';

describe('executor · field mapping', () => {
  it('maps approved schema fields to crmUpdateContact payload keys', () => {
    assert.deepEqual(mapEditFields({ phone: '555', jobTitle: 'VP', ssn: 'x' }), { phoneNumber: '555', jobTitle: 'VP' });
  });
});

describe('executor · routing', () => {
  const calls = [];
  const deps = {
    ctx: { contactId: '42', contactName: 'Ada', phone: '555', employeeId: '7', accountId: '9', email: 'ada@x.com' },
    sendEmail: (i, ctx) => { calls.push(['sendEmail', i.subject, ctx.contactId]); },
    submitQuickTask: (a) => { calls.push(['task', a.template.subject, a.context.contactId]); },
    submitCallLog: (a) => { calls.push(['call', a.template.subject, a.context.phone]); },
    completeTaskById: (id) => { calls.push(['complete', id]); },
    updateContact: (id, payload) => { calls.push(['edit', id, payload]); },
  };

  it('routes each contract + commits edits', async () => {
    const ex = makeExecutor(deps);
    await ex.run('sendEmail', { subject: 'Hi' });
    await ex.run('createTask', { subject: 'Do it' });
    await ex.run('logCall', { subject: 'Called' });
    await ex.run('completeTask', { id: 't9' });
    await ex.commitEdits({ jobTitle: 'VP', phone: '999' });
    assert.deepEqual(calls, [
      ['sendEmail', 'Hi', '42'],
      ['task', 'Do it', '42'],
      ['call', 'Called', '555'],
      ['complete', 't9'],
      ['edit', '42', { jobTitle: 'VP', phoneNumber: '999' }],
    ]);
  });

  it('throws a clear error when a capability is not configured', async () => {
    const ex = makeExecutor({ ctx: {} });
    await assert.rejects(() => ex.run('sendEmail', {}), /not configured/);
  });
});

describe('executor · live run through simulateProgram', () => {
  it('fires real writes in order and reports failures on the trace', async () => {
    const fired = [];
    const executor = {
      run: async (name, input) => { if (name === 'completeTask') throw new Error('boom'); fired.push([name, input.subject]); },
      commitEdits: async (f) => { fired.push(['edit', Object.keys(f).join(',')]); },
    };
    const code = `
      await actions.sendEmail({ subject: "Hi" });
      page.tasks.open[0].complete();
      page.contact.jobTitle = "VP";
    `;
    const { trace } = await simulateProgram(code, { tasks: { open: [{ id: 't1', subject: 'Call' }] } }, { run: asyncFunctionRunner, executor });
    assert.deepEqual(fired, [['sendEmail', 'Hi'], ['edit', 'jobTitle']]);
    // the failing completeTask surfaces on its trace entry
    const ct = trace.find((t) => t.contract === 'completeTask');
    assert.equal(ct.status, 'failed');
    assert.match(ct.errors[0], /boom/);
  });
});
