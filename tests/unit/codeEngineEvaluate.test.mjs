/**
 * The evaluate → send model: a saved template is a reference; page.evaluate
 * renders it into a mutable `outbound` object (its OWN step in the trace),
 * which you then hand to actions.sendEmail. Plus the camelId code ids that
 * make user.emails.<Id> autocomplete cleanly.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { camelId, idsFor } from '../../src/lib/codeEngine/templateId.js';
import { makeOutbound } from '../../src/lib/codeEngine/runtime.js';
import { translateProgram } from '../../src/lib/codeEngine/translate.js';
import { simulateProgram, asyncFunctionRunner } from '../../src/lib/codeEngine/simulate.js';
import { makeSandboxRunner, buildTraceBody } from '../../src/lib/codeEngine/sandboxRunner.js';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
async function fakeExec(body, ctx) {
  const fn = new AsyncFunction('ctx', 'vars', 'h', `"use strict";\n${body}`);
  return fn(ctx || {}, {}, {});
}

const SAVED = { emails: [{ id: 'e1', name: '3 Taylor Made Promo Campaign', subject: 'Big sale' }] };
const CODE = `
  const outbound = await page.evaluate(user.emails.ThreeTaylorMadePromoCampaign);
  outbound.subject = "Override";
  await actions.sendEmail(outbound);
`;

describe('templateId · camelCase code ids', () => {
  it('turns numbers to words and drops punctuation', () => {
    assert.equal(camelId('3 Taylor Made Promo Campaign'), 'ThreeTaylorMadePromoCampaign');
    assert.equal(camelId('Win-back (v2)'), 'WinBackVTwo');
  });
  it('suffixes collisions', () => {
    const ids = idsFor([{ name: 'Promo' }, { name: 'Promo!' }]).map((t) => t.codeId);
    assert.deepEqual(ids, ['Promo', 'Promo2']);
  });
});

describe('runtime · outbound object', () => {
  it('exposes subject/body + append helpers, and is mutable', () => {
    const o = makeOutbound({ kind: 'email', name: 'X', id: 'e1', versions: [{ subject: 'Hi', body: 'Body' }] });
    assert.equal(o.subject, 'Hi');
    o.append(' more');
    assert.equal(o.body, 'Body more');
    o.subject = 'New';
    assert.equal(o.subject, 'New');
  });
});

describe('evaluate → send', () => {
  it('translates page.evaluate(...) into an evaluate block', () => {
    const [b] = translateProgram('const o = await page.evaluate(user.emails.Promo);').blocks;
    assert.equal(b.kind, 'evaluate');
    assert.equal(b.assignTo, 'o');
    assert.match(b.refText, /user\.emails\.Promo/);
  });

  it('records evaluate then send as two steps (Node runner)', async () => {
    const { trace } = await simulateProgram(CODE, { contact: {} }, { run: asyncFunctionRunner, user: SAVED });
    assert.deepEqual(trace.map((t) => t.contract), ['evaluate', 'sendEmail']);
    assert.equal(trace[0].kind, 'evaluate');
    assert.match(trace[0].summary, /Taylor Made Promo/);
    assert.equal(trace[1].status, 'ran');
  });

  it('records the same via the (fake) sandbox', async () => {
    const { trace } = await simulateProgram(CODE, { contact: {} }, { run: makeSandboxRunner({ exec: fakeExec }), user: SAVED });
    assert.deepEqual(trace.map((t) => t.contract), ['evaluate', 'sendEmail']);
    assert.equal(trace[1].status, 'ran');
  });

  it('the sandbox body defines page.__eval + rebuilds outbound', () => {
    const body = buildTraceBody('page.__eval("n0", user.emails.Promo)');
    assert.match(body, /page\.__eval = /);
    assert.match(body, /const __mkOut = /);
  });
});
