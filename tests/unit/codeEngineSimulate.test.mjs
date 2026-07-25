/**
 * simulateProgram — the no-side-effect run that feeds the block animation.
 *
 * Pins that simulation produces the block-keyed trace the run UI consumes,
 * validates each call against its contract as a preflight (a bad param shows as
 * `failed` without ever sending), threads real control flow, and reports a
 * program error without losing the trace so far — all with zero real effects.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { simulateProgram } from '../../src/lib/codeEngine/simulate.js';

describe('simulate · trace for the animation', () => {
  it('produces a block-keyed, ordered trace', async () => {
    const { ok, trace } = await simulateProgram(`
      await actions.createTask({ subject: "Follow up" });
      await actions.logCall({ subject: "Called" });
    `);
    assert.equal(ok, true);
    assert.deepEqual(trace.map((t) => t.contract), ['createTask', 'logCall']);
    assert.ok(trace.every((t) => typeof t.id === 'string' && t.id.startsWith('n')));
    assert.equal(trace[0].status, 'ran');
    assert.match(trace[0].summary, /Follow up/);
  });

  it('flags a contract-validation failure as preflight, not a send', async () => {
    // Neither a saved email nor a subject → invalid, surfaced as a preflight.
    const { trace } = await simulateProgram('await actions.sendEmail({ from: "me@x.com" })');
    assert.equal(trace[0].status, 'failed');
    assert.ok(trace[0].errors.some((e) => /saved email or a subject/.test(e)));
  });

  it('threads a loop with a per-contact branch', async () => {
    const { trace } = await simulateProgram(`
      for (const c of page.contacts) {
        if (c.ytd > 1000) await actions.sendEmail({ to: c.email, subject: "Thanks" });
        else await actions.createTask({ subject: "Re-engage" });
      }
    `, { contacts: [{ email: 'a@x.com', ytd: 5000 }, { email: 'b@x.com', ytd: 10 }] });
    assert.deepEqual(trace.map((t) => t.contract), ['sendEmail', 'createTask']);
    assert.equal(trace[0].status, 'ran');
  });

  it('keeps the trace up to a thrown program error', async () => {
    const { ok, trace, error } = await simulateProgram(`
      await actions.createTask({ subject: "one" });
      throw new Error("boom");
    `);
    assert.equal(ok, false);
    assert.match(error, /boom/);
    assert.equal(trace.length, 1);
    assert.equal(trace[0].contract, 'createTask');
  });

  it('reports the distinct contracts a program calls (preflight gating input)', async () => {
    const { calls } = await simulateProgram(`
      await actions.createTask({ subject: "a" });
      await actions.sendEmail({ to: "x@y.z", subject: "b" });
    `);
    assert.deepEqual([...new Set(calls.map((c) => c.contract))].sort(),
      ['createTask', 'sendEmail']);
  });

  it('runs an empty program cleanly', async () => {
    const { ok, trace } = await simulateProgram('');
    assert.equal(ok, true);
    assert.deepEqual(trace, []);
  });
});
