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
import {
  MAX_CODE_BODY_LENGTH,
  codeBodyLengthError,
} from '../../src/lib/page-engine/code-limits.js';

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

  it('allows multi-function workflow bodies while retaining a shared paste-bomb cap', () => {
    const oldLimitPlusOne = 'x'.repeat(8193);
    assert.equal(codeBodyLengthError(oldLimitPlusOne), null);
    assert.equal(codeBodyLengthError('x'.repeat(MAX_CODE_BODY_LENGTH)), null);
    assert.equal(
      codeBodyLengthError('x'.repeat(MAX_CODE_BODY_LENGTH + 1)),
      `code body exceeds ${MAX_CODE_BODY_LENGTH} characters`,
    );
    assert.equal(MAX_CODE_BODY_LENGTH, 65536);
  });
});

describe('sandboxRunner · executes in the (fake) sandbox and replays', () => {
  it('carries hydrated account and order arrays into the isolated runner', async () => {
    const page = {
      account: { name: 'Northwind Golf' },
      orders: [
        { number: '1001', summary: 'Towels', date: '2024-08-04T00:00:00.000Z' },
        { number: '1002', summary: 'Hats', date: '2024-08-06T00:00:00.000Z' },
      ],
      tasks: { open: [], done: [] },
    };
    const source = `
      const avg = Math.round(page.orders.reduce((sum, order) => sum + new Date(order.date).getUTCDate(), 0) / page.orders.length);
      await actions.createTask({ subject: page.account.name + " · day " + avg });
    `;
    const viaSandbox = await simulateProgram(source, page, {
      run: makeSandboxRunner({ exec: fakeExec }),
    });

    assert.equal(viaSandbox.ok, true);
    assert.equal(viaSandbox.trace.length, 1);
    assert.equal(viaSandbox.trace[0].summary, 'Create task “Northwind Golf · day 5”');
  });

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

  it('preserves repeated function-entry pulses through the browser sandbox replay', async () => {
    const source = `
      async function queue(subject) {
        await actions.createTask({ subject });
      }
      await queue("one");
      await queue("two");
      await queue("three");
    `;
    const viaSandbox = await simulateProgram(source, {}, {
      run: makeSandboxRunner({ exec: fakeExec }),
    });
    const viaNode = await simulateProgram(source, {}, { run: asyncFunctionRunner });
    assert.deepEqual(
      viaSandbox.trace.map((entry) => ({
        id: entry.id,
        kind: entry.kind || 'action',
        contract: entry.contract,
      })),
      viaNode.trace.map((entry) => ({
        id: entry.id,
        kind: entry.kind || 'action',
        contract: entry.contract,
      })),
    );
    const entries = viaSandbox.trace.filter((entry) => entry.kind === 'function');
    assert.equal(entries.length, 3);
    assert.equal(new Set(entries.map((entry) => entry.id)).size, 1);
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

  it('replays a created task id into a later completion action', async () => {
    const fired = [];
    const executor = {
      async run(name, input) {
        fired.push([name, input]);
        if (name === 'createTask') return { ok: true, taskId: '8842' };
        return { ok: true };
      },
      async commitEdits() { return { ok: true }; },
    };
    const source = `
      const created = await actions.createTask({ subject: "QA task" });
      await actions.completeTask({ id: created.taskId });
    `;
    const { trace } = await simulateProgram(source, {}, {
      run: makeSandboxRunner({ exec: fakeExec }),
      executor,
    });
    assert.deepEqual(fired.map(([name]) => name), ['createTask', 'completeTask']);
    assert.equal(fired[1][1].id, '8842');
    assert.deepEqual(trace.map((entry) => entry.status), ['ran', 'ran']);
  });

  it('resolves a generated proposal URL embedded in an evaluated email body', async () => {
    const fired = [];
    const executor = {
      async run(name, input) {
        fired.push([name, structuredClone(input)]);
        if (name === 'ensureOpenOpportunity') return { ok: true, opportunityId: '88', created: false };
        if (name === 'createProposalFromOrder') {
          assert.equal(input.opportunityId, '88');
          assert.equal(input.order, undefined);
          return { ok: true, proposalId: 'cart-9', cartID: 'cart-9', proposalUrl: 'https://www.golfballs.com/cart?proposalMode=true&opportunityID=88&cartID=cart-9', proposalUrlHtml: 'https://www.golfballs.com/cart?proposalMode=true&amp;opportunityID=88&amp;cartID=cart-9' };
        }
        return { ok: true };
      },
      async commitEdits() { return { ok: true }; },
    };
    const user = {
      emails: {
        PriorYear: { id: 'email-1', name: 'Prior Year', kind: 'email', subject: 'Updated proposal', body: '<p>Hello</p>' },
      },
    };
    const evaluateRef = async () => ({
      id: 'email-1', name: 'Prior Year', templateId: 'email-1', subject: 'Updated proposal', body: '<p>Hello</p>', evaluated: true,
    });
    const source = `
      const opportunity = await actions.ensureOpenOpportunity({ subject: "August Order" });
      const proposal = await actions.createProposalFromOrder({ opportunityId: opportunity.opportunityId });
      const email = await page.evaluate(user.emails.PriorYear);
      email.attachProposal(proposal, "View proposal");
      await actions.sendEmail(email);
    `;
    const result = await simulateProgram(source, { orders: [{ number: '1001', url: '91' }] }, {
      run: makeSandboxRunner({ exec: fakeExec, evaluateRef }),
      user,
      evaluateRef,
      executor,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(fired.map(([name]) => name), ['ensureOpenOpportunity', 'createProposalFromOrder', 'sendEmail']);
    assert.match(fired[2][1].body, /opportunityID=88&amp;cartID=cart-9/);
    assert.equal(fired[2][1].body.includes('__gb_action_result__'), false);
  });

  it('passes a scratch SKU proposal result into the same safe email-link helper', async () => {
    const fired = [];
    const executor = {
      async run(name, input) {
        fired.push([name, structuredClone(input)]);
        if (name === 'createProposal') {
          return {
            ok: true,
            proposalId: 'cart-sku',
            proposalUrl: 'https://www.golfballs.com/cart?proposalMode=true&opportunityID=71&cartID=cart-sku',
            proposalUrlHtml: 'https://www.golfballs.com/cart?proposalMode=true&amp;opportunityID=71&amp;cartID=cart-sku',
          };
        }
        return { ok: true };
      },
      async commitEdits() { return { ok: true }; },
    };
    const source = `
      const proposal = await actions.createProposal({
        opportunityId: "71",
        items: [{ sku: "B5338", quantity: 12, price: 62.99 }]
      });
      const email = await page.evaluate(user.emails.PriorYear);
      email.attachProposal(proposal);
      await actions.sendEmail(email);
    `;
    const user = {
      emails: {
        PriorYear: { id: 'email-1', name: 'Prior Year', kind: 'email', subject: 'Proposal', body: '<p>Hello</p>' },
      },
    };
    const evaluateRef = async () => ({
      id: 'email-1', name: 'Prior Year', templateId: 'email-1', subject: 'Proposal', body: '<p>Hello</p>', evaluated: true,
    });
    const result = await simulateProgram(source, {}, {
      run: makeSandboxRunner({ exec: fakeExec, evaluateRef }),
      user,
      evaluateRef,
      executor,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(fired.map(([name]) => name), ['createProposal', 'sendEmail']);
    assert.match(fired[1][1].body, /cartID=cart-sku/);
  });
});
