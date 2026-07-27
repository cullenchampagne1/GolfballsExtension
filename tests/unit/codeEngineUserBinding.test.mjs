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
  emails: [{
    id: 'e1',
    name: 'Win-back',
    subject: 'We miss you',
    vars: { firstName: { type: 'builtin', builtin: 'firstName' } },
    toField: { type: 'auto' },
    replyMode: 'reply',
    senderAccount: 'loyaltylogo',
    variations: [{ id: 'short', subject: 'Quick hello', body: 'Hi' }],
  }],
  tasks: [{
    id: 't1',
    name: 'Follow up',
    subject: 'Call them',
    priority: 2,
    daysOut: 3,
    categoryId: 9,
  }],
  calls: [{
    id: 'c1',
    name: 'Discovery',
    subject: 'Discovery call',
    callDirection: 1,
    callCategory: 39,
    callVoicemail: true,
  }],
};

describe('userBinding · shape + lookups', () => {
  it('keys emails by a PascalCase code id and finds by name/id', () => {
    const u = buildUserBinding(SAVED);
    assert.equal(Object.keys(u.emails).length, 1);
    assert.ok(u.emails.WinBack, 'user.emails.WinBack should exist');
    assert.equal(u.emails.WinBack.id, 'e1');
    assert.equal(u.email('Win-back').id, 'e1'); // by name
    assert.equal(u.email('e1').name, 'Win-back'); // by id
    assert.equal(u.task('Follow up').subject, 'Call them');
    assert.equal(u.emails.WinBack.versions[0].subject, 'We miss you');
    assert.equal(u.emails.WinBack.versions[1].subject, 'Quick hello');
    assert.equal(u.emails.WinBack.replyMode, 'reply');
    assert.equal(u.emails.WinBack.senderAccount, 'loyaltylogo');
    assert.equal(u.tasks.FollowUp.categoryId, 9);
    assert.equal(u.calls.Discovery.callCategory, 39);
    assert.equal(u.calls.Discovery.callDirection, 1);
    assert.equal(u.calls.Discovery.callVoicemail, true);
  });

  it('throws a dependency error when a named template is missing', () => {
    const u = buildUserBinding(SAVED);
    assert.throws(() => u.email('Nope'), /Missing dependency: no saved email named .Nope./);
    assert.throws(() => u.task('Ghost'), /no saved task named/);
    // The optional, non-throwing path stays available via the keyed map.
    assert.equal(Object.values(u.emails).find((e) => e.name === 'Nope'), undefined);
  });

  it('userBindingData keeps only the serializable id-keyed maps', () => {
    const d = userBindingData(SAVED);
    assert.deepEqual(Object.keys(d).sort(), ['calls', 'emails', 'tasks']);
    assert.equal(typeof d.email, 'undefined');
    assert.ok(d.emails.WinBack);
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

  it('surfaces a dependency error when the code references a missing template', async () => {
    const { ok, error, trace } = await simulateProgram(
      'await actions.sendEmail(user.email("Does Not Exist"));',
      {}, { run: makeSandboxRunner({ exec: fakeExec }), user: SAVED },
    );
    assert.equal(ok, false);
    assert.match(error, /Missing dependency: no saved email named .Does Not Exist./);
    assert.deepEqual(trace, []); // nothing sent — it stopped at the missing dependency
  });
});
