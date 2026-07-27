/**
 * Action-call + function-entry instrumentation and end-to-end simulation trace.
 *
 * Instrumentation rewrites `actions.X(args)` → `actions.__trace(id, "X", args)`
 * with the SAME node id translate.js assigns, so a run reports which block is
 * executing. Function entry hooks use the function block's stable id so repeated
 * calls can restart that block's animation. These tests actually EXECUTE the
 * instrumented code (AsyncFunction, the same shape the sandbox uses) against
 * recording hooks and a mock `page`, proving the trace threads correctly
 * through functions, loops, and branches — with no real side effects.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { instrument } from '../../src/lib/codeEngine/instrument.js';
import { translateProgram } from '../../src/lib/codeEngine/translate.js';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/** Run instrumented code with a recording actions.__trace + a mock page.
 *  Returns the ordered trace of {id, contract, input}. No real side effects. */
async function simulate(source, page = {}) {
  const { code } = instrument(source);
  const trace = [];
  const actions = {
    __function(id, name) {
      trace.push({ id, kind: 'function', name });
    },
    __trace(id, name, input) {
      trace.push({ id, contract: name, input: input ?? null });
      return { ok: true, dry: true };
    },
  };
  const fn = new AsyncFunction('actions', 'page', `"use strict";\n${code}`);
  await fn(actions, page);
  return trace;
}

describe('instrument · rewrite shape', () => {
  it('routes a contract call through the dispatcher with its node id', () => {
    const { code, calls } = instrument('await actions.createTask({ subject: "x" })');
    assert.match(code, /actions\.__trace\("n\d+_\d+","createTask",\{ subject: "x" \}\)/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].contract, 'createTask');
  });

  it('uses the same node id the translator assigns', () => {
    const source = 'await actions.logCall({ subject: "hi" })';
    const blockId = translateProgram(source).blocks[0].id;
    const callId = instrument(source).calls[0].id;
    assert.equal(callId, blockId, 'trace id must match the block id');
  });

  it('uses the function block id for declarations and assigned arrows', () => {
    for (const source of [
      'function helper(value) { return value; }',
      'const helper = (value) => value;',
      'const helper = function (value) { return value; };',
    ]) {
      const block = translateProgram(source).blocks[0];
      const entry = instrument(source).functions[0];
      assert.equal(block.kind, 'function');
      assert.equal(entry.id, block.id);
      assert.equal(entry.name, 'helper');
    }
  });

  it('wraps an implicit arrow body without swallowing its action rewrite', () => {
    const source = 'const create = (subject) => actions.createTask({ subject });';
    const { code } = instrument(source);
    assert.match(code, /=> \(actions\.__function\("n\d+_\d+","create"\),actions\.__trace\("n\d+_\d+","createTask",\{ subject \}\)\)/);
  });

  it('handles a call with no arguments', () => {
    const { code } = instrument('actions.createTask()');
    assert.match(code, /actions\.__trace\("n\d+_\d+","createTask"\)/);
  });

  it('leaves non-contract and unrelated calls untouched', () => {
    assert.equal(instrument('actions.deleteEverything()').code, 'actions.deleteEverything()');
    assert.equal(instrument('console.log(1)').code, 'console.log(1)');
  });

  it('returns input unchanged on a parse failure', () => {
    const bad = 'if (x {';
    assert.equal(instrument(bad).code, bad);
  });
});

describe('instrument · executes and traces faithfully', () => {
  it('records a single action call', async () => {
    const trace = await simulate('await actions.createTask({ subject: "Follow up" })');
    assert.equal(trace.length, 1);
    assert.equal(trace[0].contract, 'createTask');
    assert.deepEqual(trace[0].input, { subject: 'Follow up' });
  });

  it('threads a branch — only the taken side traces', async () => {
    const code = `
      if (page.order.count > 3) {
        await actions.logCall({ subject: "VIP" })
      } else {
        await actions.createTask({ subject: "Nurture" })
      }
    `;
    const vip = await simulate(code, { order: { count: 5 } });
    assert.deepEqual(vip.map((t) => t.contract), ['logCall']);
    const nurture = await simulate(code, { order: { count: 1 } });
    assert.deepEqual(nurture.map((t) => t.contract), ['createTask']);
  });

  it('threads a for-of loop — one trace entry per iteration, ids stable', async () => {
    const code = `
      for (const c of page.contacts) {
        await actions.sendEmail({ to: c.email, subject: "Hi" })
      }
    `;
    const trace = await simulate(code, {
      contacts: [{ email: 'a@x.com' }, { email: 'b@x.com' }, { email: 'c@x.com' }],
    });
    assert.equal(trace.length, 3);
    assert.deepEqual(trace.map((t) => t.input.to), ['a@x.com', 'b@x.com', 'c@x.com']);
    // Same source node → same block id every iteration (the loop body block).
    assert.equal(new Set(trace.map((t) => t.id)).size, 1);
  });

  it('records the same function block once per invocation around its nested action', async () => {
    const source = `
      async function createOne(subject) {
        await actions.createTask({ subject });
      }
      for (const subject of ["one", "two", "three"]) await createOne(subject);
    `;
    const trace = await simulate(source);
    assert.deepEqual(
      trace.map((entry) => entry.kind === 'function' ? `call:${entry.name}` : entry.contract),
      ['call:createOne', 'createTask', 'call:createOne', 'createTask', 'call:createOne', 'createTask'],
    );
    const calls = trace.filter((entry) => entry.kind === 'function');
    assert.equal(calls.length, 3);
    assert.equal(new Set(calls.map((entry) => entry.id)).size, 1);
    assert.equal(calls[0].id, translateProgram(source).blocks[0].id);
  });

  it('threads a switch to the matching case', async () => {
    const code = `
      switch (page.contact.state) {
        case "CA": await actions.createTask({ subject: "West" }); break;
        default: await actions.createTask({ subject: "Other" });
      }
    `;
    const ca = await simulate(code, { contact: { state: 'CA' } });
    assert.deepEqual(ca.map((t) => t.input.subject), ['West']);
    const other = await simulate(code, { contact: { state: 'NY' } });
    assert.deepEqual(other.map((t) => t.input.subject), ['Other']);
  });

  it('runs a realistic multi-step program with a computed email', async () => {
    const code = `
      for (const c of page.contacts) {
        if (c.ytd > 1000) {
          const email = { to: c.email, subject: "Thanks for your business" };
          await actions.sendEmail(email);
        } else {
          await actions.createTask({ subject: "Re-engage " + c.name });
        }
      }
    `;
    const trace = await simulate(code, {
      contacts: [
        { name: 'Ada', email: 'ada@x.com', ytd: 5000 },
        { name: 'Ben', email: 'ben@x.com', ytd: 200 },
      ],
    });
    assert.deepEqual(trace.map((t) => t.contract), ['sendEmail', 'createTask']);
    assert.equal(trace[0].input.to, 'ada@x.com');
    assert.equal(trace[1].input.subject, 'Re-engage Ben');
  });
});
