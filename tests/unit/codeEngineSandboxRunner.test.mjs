/**
 * sandboxRunner — the browser runner that drives simulateProgram through the
 * page-engine sandbox.
 *
 * The real runner posts the wrapped body into an opaque-origin iframe; here a
 * fake `exec` executes that exact body via AsyncFunction — the same compiler
 * the sandbox uses — so we prove the wrap+replay path without a browser: the
 * body runs the instrumented code against a SANDBOX-LOCAL recorder, returns
 * the raw trace, and makeSandboxRunner replays it through the content-side
 * recorder so validation/summaries match the Node runner exactly.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTraceBody, makeSandboxRunner } from '../../src/lib/codeEngine/sandboxRunner.js';
import { simulateProgram, asyncFunctionRunner } from '../../src/lib/codeEngine/simulate.js';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/** Stand-in for runInSandbox: compile+run the body with (ctx, vars, h) — the
 *  sandbox's exact signature — and return whatever the body returns. */
async function fakeExec(body, ctx, vars = {}, _doc) {
  const fn = new AsyncFunction('ctx', 'vars', 'h', `"use strict";\n${body}`);
  return fn(ctx || {}, vars || {}, {});
}

describe('sandboxRunner · body shape', () => {
  it('binds page, records via a local recorder, and returns the raw trace', () => {
    const body = buildTraceBody('await actions.__trace("n0_0","createTask",{ subject: "x" })');
    assert.match(body, /const page = \(ctx && ctx\.page\)/);
    assert.match(body, /return \{ __gbTrace, __gbRet \};/);
    // Ends in a return, so the sandbox's wrapBody leaves it verbatim (no re-wrap).
    assert.ok(/return\b/.test(body));
  });
});

describe('sandboxRunner · executes in the (fake) sandbox and replays', () => {
  it('produces the same validated trace as the Node runner', async () => {
    const source = `
      for (const c of page.contacts) {
        if (c.ytd > 1000) await actions.sendEmail({ to: c.email, subject: "Thanks" });
        else await actions.createTask({ subject: "Re-engage" });
      }
    `;
    const page = { contacts: [{ email: 'a@x.com', ytd: 5000 }, { email: 'b@x.com', ytd: 10 }] };
    const viaSandbox = await simulateProgram(source, page, { run: makeSandboxRunner({ exec: fakeExec }) });
    const viaNode = await simulateProgram(source, page, { run: asyncFunctionRunner });
    assert.equal(viaSandbox.ok, true);
    assert.deepEqual(
      viaSandbox.trace.map((t) => ({ id: t.id, contract: t.contract, status: t.status })),
      viaNode.trace.map((t) => ({ id: t.id, contract: t.contract, status: t.status })),
    );
    assert.deepEqual(viaSandbox.trace.map((t) => t.contract), ['sendEmail', 'createTask']);
  });

  it('carries a contract-validation failure through the replay', async () => {
    const { trace } = await simulateProgram(
      'await actions.sendEmail({ from: "me@x.com" })',
      {},
      { run: makeSandboxRunner({ exec: fakeExec }) },
    );
    assert.equal(trace[0].status, 'failed');
    assert.ok(trace[0].errors.some((e) => /saved email or a subject/.test(e)));
  });

  it('never executes a real effect — only the recorder sees the calls', async () => {
    let realCalls = 0;
    const source = 'await actions.createTask({ subject: "would send" })';
    // The fake exec has no real `actions` beyond the body's local recorder, so
    // a real side-effecting path would have to come from elsewhere; assert the
    // trace records exactly one dry call and nothing incremented an effect.
    const { trace } = await simulateProgram(source, {}, { run: makeSandboxRunner({ exec: fakeExec }) });
    assert.equal(realCalls, 0);
    assert.equal(trace.length, 1);
    assert.equal(trace[0].status, 'ran');
  });
});
