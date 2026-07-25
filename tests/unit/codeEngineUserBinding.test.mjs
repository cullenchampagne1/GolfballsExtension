/**
 * user.* binding — the rep's saved emails/tasks/calls exposed to campaign code.
 *
 * Pins that buildUserBinding gives arrays + name/id lookups, that a program can
 * drop a saved email straight into actions.sendEmail (recording it as a
 * template send, not raw content), and that the same `user` shape is available
 * whether the code runs through the Node runner or the (fake) sandbox — since
 * the sandbox rebuilds the binding from the raw arrays that cross the realm.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildUserBinding, userBindingData } from '../../src/lib/codeEngine/userBinding.js';
import { simulateProgram, asyncFunctionRunner } from '../../src/lib/codeEngine/simulate.js';
import { makeSandboxRunner, buildTraceBody } from '../../src/lib/codeEngine/sandboxRunner.js';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
async function fakeExec(body, ctx) {
  const fn = new AsyncFunction('ctx', 'vars', 'h', `"use strict";\n${body}`);
  return fn(ctx || {}, {}, {});
}

const SAVED = {
  emails: [{ id: 'e1', name: 'Win-back', subject: 'We miss you' }],
  tasks: [{ id: 't1', name: 'Follow up', subject: 'Call them', priority: 2 }],
  calls: [],
};

describe('userBinding · shape + lookups', () => {
  it('exposes arrays and name/id finders', () => {
    const u = buildUserBinding(SAVED);
    assert.equal(u.emails.length, 1);
    assert.equal(u.email('Win-back').id, 'e1');
    assert.equal(u.email('e1').name, 'Win-back');
    assert.equal(u.task('Follow up').subject, 'Call them');
    assert.equal(u.email('nope'), null);
  });

  it('userBindingData keeps only the serializable arrays', () => {
    const d = userBindingData(SAVED);
    assert.deepEqual(Object.keys(d).sort(), ['calls', 'emails', 'tasks']);
    assert.equal(typeof d.email, 'undefined');
  });
});

describe('userBinding · drops a saved email into a send (both runners)', () => {
  const source = 'await actions.sendEmail(user.email("Win-back"));';

  it('records a template send via the Node runner', async () => {
    const { trace } = await simulateProgram(source, {}, { run: asyncFunctionRunner, user: SAVED });
    assert.equal(trace.length, 1);
    assert.equal(trace[0].status, 'ran');
    assert.match(trace[0].summary, /Win-back/);
  });

  it('records the same via the (fake) sandbox — rebuilt binding', async () => {
    const { trace } = await simulateProgram(source, {}, { run: makeSandboxRunner({ exec: fakeExec }), user: SAVED });
    assert.equal(trace.length, 1);
    assert.equal(trace[0].status, 'ran');
    assert.match(trace[0].summary, /Win-back/);
  });

  it('the sandbox body reconstructs user with finders', () => {
    const body = buildTraceBody('await actions.sendEmail(user.email("Win-back"));');
    assert.match(body, /const user = \{/);
    assert.match(body, /email: __find/);
  });
});
