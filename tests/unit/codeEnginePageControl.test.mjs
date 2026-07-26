/**
 * Page control: completing tasks + grouped contact edits via direct syntax.
 *   page.tasks.open[0].complete()   → a completeTask step
 *   page.contact.field = value      → staged, then ONE grouped editContact step
 * Records only (no CRM writes). Verified on the Node runner AND the (fake)
 * sandbox, since both must produce the same trace.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { simulateProgram, asyncFunctionRunner } from '../../src/lib/codeEngine/simulate.js';
import { makeSandboxRunner } from '../../src/lib/codeEngine/sandboxRunner.js';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
async function fakeExec(body, ctx) {
  const fn = new AsyncFunction('ctx', 'vars', 'h', `"use strict";\n${body}`);
  return fn(ctx || {}, {}, {});
}
const sandbox = makeSandboxRunner({ exec: fakeExec });

const PAGE = {
  contact: { firstName: 'Ada', jobTitle: 'Rep' },
  tasks: { open: [{ id: 't1', subject: 'Call', dueDate: '2026-01-01' }, { id: 't2', subject: 'Email', dueDate: '2026-03-01' }], done: [] },
};

for (const [label, run] of [['node', asyncFunctionRunner], ['sandbox', sandbox]]) {
  describe(`page control · ${label}`, () => {
    it('completes a task → a completeTask step', async () => {
      const { trace } = await simulateProgram('page.tasks.open[0].complete();', PAGE, { run });
      assert.deepEqual(trace.map((t) => t.contract), ['completeTask']);
      assert.match(trace[0].summary, /Call/);
    });

    it('completeAll / completeLatest', async () => {
      const all = await simulateProgram('page.tasks.completeAll();', PAGE, { run });
      assert.equal(all.trace.length, 2);
      const latest = await simulateProgram('page.tasks.completeLatest();', PAGE, { run });
      assert.deepEqual(latest.trace.map((t) => t.summary.match(/“(.+)”/)[1]), ['Email']); // t2 has the later dueDate
    });

    it('groups approved field edits into ONE editContact step', async () => {
      const { trace } = await simulateProgram('page.contact.firstName = "Bob"; page.contact.jobTitle = "VP";', PAGE, { run });
      assert.deepEqual(trace.map((t) => t.contract), ['editContact']);
      assert.match(trace[0].summary, /firstName, jobTitle/);
    });

    it('rejects an unapproved field with a clear error', async () => {
      const { ok, error, trace } = await simulateProgram('page.contact.ssn = "123";', PAGE, { run });
      assert.equal(ok, false);
      assert.match(error, /page\.contact\.ssn is not an editable field/);
      assert.deepEqual(trace, []); // nothing committed
    });

    it('an explicit commit() flushes early, then later edits group separately', async () => {
      const { trace } = await simulateProgram('page.contact.firstName = "A"; page.contact.commit(); page.contact.jobTitle = "B";', PAGE, { run });
      assert.equal(trace.length, 2);
      assert.match(trace[0].summary, /firstName/);
      assert.match(trace[1].summary, /jobTitle/);
    });
  });
}
