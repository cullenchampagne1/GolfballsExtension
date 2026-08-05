/**
 * Unit tests — lib/bounce-queue.js (service-worker module)
 *
 * The queue exists because a bounce notification arrives when it arrives, and
 * the CRM work it asks for can only run on a CRM page. These pin the rules that
 * keep it from either losing work or doing it twice: what becomes a job at all,
 * dedup by notification and by address, the settled-address ledger, and — the
 * one that costs real work if it is wrong — that a wake with no CRM tab open
 * burns no attempts. Harness per notificationsStore.test.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const languageSource = readFileSync(new URL('lib/action-language.js', root), 'utf8');
const source = readFileSync(new URL('lib/bounce-queue.js', root), 'utf8');

const NOW = Date.parse('2026-08-05T12:00:00Z');
const DAY = 86_400_000;

function bouncePayload(overrides = {}) {
  return JSON.stringify({
    version: 1,
    command: 'flag_bounced_contact',
    target: 'jane.customer@acme.com',
    value: '5.1.1',
    options: ['hard', 'auto'],
    ...overrides,
  });
}

function notification(overrides = {}) {
  const { payload, ...rest } = overrides;
  return {
    remoteId: 12,
    topic: 'contact.email.bounced',
    kind: 'bounce',
    level: 'warning',
    title: 'Email bounced: jane.customer@acme.com',
    body: 'Recipient address rejected: User unknown.',
    action: { label: 'Flag contact', payload: payload || bouncePayload() },
    ...rest,
  };
}

/**
 * @param answers  what each CRM tab answers, in order. `null` entries mean the
 *                 tab did not answer at all (mid-navigation / no listener).
 */
function harness({ stored = {}, tabs = [], answers = [] } = {}) {
  const state = structuredClone(stored);
  const asked = [];
  const receipts = [];
  const queue = [...answers];
  const chrome = {
    storage: {
      local: {
        get(keys, callback) {
          const names = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const name of names) {
            if (Object.hasOwn(state, name)) out[name] = structuredClone(state[name]);
          }
          callback(out);
        },
        set(values, callback) {
          Object.assign(state, structuredClone(values));
          callback?.();
        },
      },
    },
    tabs: {
      query(_filter, callback) { callback(tabs.map((id) => ({ id }))); },
      sendMessage(tabId, payload, callback) {
        asked.push({ tabId, payload });
        const answer = queue.shift();
        chrome.runtime.lastError = answer ? undefined : { message: 'no answer' };
        callback(answer || undefined);
        chrome.runtime.lastError = undefined;
      },
      onUpdated: { addListener() {} },
    },
    runtime: { lastError: undefined },
  };
  const context = vm.createContext({
    chrome, console, globalThis: null, setTimeout, clearTimeout,
    Date, Math, JSON, Promise, Object, Array, String, Number, Boolean,
    RegExp, Error, TypeError, Map, Set,
  });
  context.globalThis = context;
  context.GBNotificationPoll = {
    sendReceipt(ids, receiptState) { receipts.push({ ids, state: receiptState }); },
  };
  new vm.Script(languageSource, { filename: 'action-language.js' }).runInContext(context);
  new vm.Script(source, { filename: 'bounce-queue.js' }).runInContext(context);
  return {
    queue: context.GBBounceQueue,
    state,
    asked,
    // Values built inside the vm carry that realm's prototypes, which strict
    // deep-equality treats as different types. Clone them back into this one.
    receipts: { get all() { return structuredClone(receipts); } },
  };
}

describe('bounce queue · what becomes a job', () => {
  it('reads a hard auto-flag bounce into a job', () => {
    const { queue } = harness();
    assert.deepEqual(structuredClone(queue.jobFromNotification(notification(), NOW)), {
      remoteId: 12,
      email: 'jane.customer@acme.com',
      code: '5.1.1',
      kind: 'hard',
      note: 'Recipient address rejected: User unknown.',
      at: NOW,
      attempts: 0,
    });
  });

  it('leaves a soft or unclassified bounce for the rep to act on', () => {
    // These reach the rep as a notification either way. Writing CRM work off a
    // "the mailbox is full" report would replace a contact who is reachable.
    const { queue } = harness();
    assert.equal(queue.jobFromNotification(notification({
      payload: bouncePayload({ options: ['soft'], value: '4.2.2' }),
    }), NOW), null);
    assert.equal(queue.jobFromNotification(notification({
      payload: bouncePayload({ options: ['unknown'] }),
    }), NOW), null);
  });

  it('ignores a hard bounce the relay did not mark automatic', () => {
    const { queue } = harness();
    assert.equal(queue.jobFromNotification(notification({
      payload: bouncePayload({ options: ['hard'] }),
    }), NOW), null);
  });

  it('ignores other notifications and malformed payloads', () => {
    const { queue } = harness();
    assert.equal(queue.jobFromNotification(notification({
      payload: JSON.stringify({ version: 1, command: 'open_contact', target: 'a@b.com' }),
    }), NOW), null);
    assert.equal(queue.jobFromNotification(notification({ payload: 'not json' }), NOW), null);
    assert.equal(queue.jobFromNotification({}, NOW), null);
  });
});

describe('bounce queue · queueing', () => {
  const job = (overrides = {}) => ({
    remoteId: 1, email: 'a@acme.com', code: '5.1.1', kind: 'hard',
    note: '', at: NOW, attempts: 0, ...overrides,
  });

  it('keeps one job per address, however many bounces reported it', () => {
    const { queue } = harness();
    const merged = queue.mergeJobs(
      [job()],
      [job({ remoteId: 2 }), job({ remoteId: 3, email: 'b@acme.com' })],
      { now: NOW },
    );
    assert.deepEqual(merged.map((row) => row.email), ['a@acme.com', 'b@acme.com']);
  });

  it('drops a job the CRM was never open to work, after a week', () => {
    const { queue } = harness();
    const merged = queue.mergeJobs([job({ at: NOW - 8 * DAY })], [], { now: NOW });
    assert.deepEqual(merged, []);
  });

  it('captures new bounce notifications into storage', async () => {
    const { queue, state } = harness();
    assert.equal(await queue.capture([notification()], { now: NOW }), 1);
    assert.deepEqual(
      state.gbBounceQueue.map((row) => row.email), ['jane.customer@acme.com'],
    );
  });

  it('does not re-queue an address already settled', async () => {
    const { queue, state } = harness({
      stored: {
        gbBounceLedger: {
          'jane.customer@acme.com': { at: NOW - DAY, status: 'created', taskId: '9' },
        },
      },
    });
    assert.equal(await queue.capture([notification({ remoteId: 44 })], { now: NOW }), 0);
    assert.equal((state.gbBounceQueue || []).length, 0);
  });

  it('captures nothing while automatic flagging is switched off', async () => {
    const { queue, state } = harness({
      stored: { devSettings: { 'bounce.autoFlag': false } },
    });
    assert.equal(await queue.capture([notification()], { now: NOW }), 0);
    assert.equal((state.gbBounceQueue || []).length, 0);
  });
});

describe('bounce queue · draining to a CRM page', () => {
  const queued = (overrides = {}) => ({
    gbBounceQueue: [{
      remoteId: 12, email: 'jane.customer@acme.com', code: '5.1.1',
      kind: 'hard', note: '', at: NOW, attempts: 0, ...overrides,
    }],
  });

  it('keeps the job and burns no attempt when no CRM tab is open', async () => {
    const { queue, state, asked } = harness({ stored: queued(), tabs: [] });
    const result = await queue.drain({ now: NOW });
    assert.deepEqual(asked, []);
    assert.equal(result.pending, 1);
    assert.equal(state.gbBounceQueue[0].attempts, 0);
  });

  it('settles a created task, records it, and acknowledges the notification', async () => {
    const { queue, state, asked, receipts } = harness({
      stored: queued(),
      tabs: [7],
      answers: [{ ok: true, status: 'created', taskId: '4242', contactId: '555' }],
    });
    const result = await queue.drain({ now: NOW });
    assert.equal(asked[0].payload.action, 'gbBounceFlagContact');
    assert.equal(asked[0].payload.email, 'jane.customer@acme.com');
    assert.equal(result.done, 1);
    assert.deepEqual(state.gbBounceQueue, []);
    assert.deepEqual(state.gbBounceLedger['jane.customer@acme.com'], {
      at: NOW, status: 'created', taskId: '4242', contactId: '555',
    });
    assert.deepEqual(receipts.all, [{ ids: [12], state: 'acted' }]);
  });

  it('treats an existing CRM bounce task as done — the work is already queued', async () => {
    const { queue, state, receipts } = harness({
      stored: queued(),
      tabs: [7],
      answers: [{ ok: true, status: 'existing', taskId: '99' }],
    });
    await queue.drain({ now: NOW });
    assert.deepEqual(state.gbBounceQueue, []);
    assert.equal(state.gbBounceLedger['jane.customer@acme.com'].status, 'existing');
    assert.deepEqual(receipts.all, [{ ids: [12], state: 'acted' }]);
  });

  it('stops asking about an address with no contact, but leaves it unread', async () => {
    // Nothing was written, so the notification stays for the rep to look at.
    const { queue, state, receipts } = harness({
      stored: queued(),
      tabs: [7],
      answers: [{ ok: true, status: 'unresolved' }],
    });
    await queue.drain({ now: NOW });
    assert.deepEqual(state.gbBounceQueue, []);
    assert.equal(state.gbBounceLedger['jane.customer@acme.com'].status, 'unresolved');
    assert.deepEqual(receipts.all, []);
  });

  it('retries a CRM failure and gives up only after the attempt limit', async () => {
    const failure = { ok: false, error: 'no signed-in CRM employee on this page yet' };
    const first = harness({ stored: queued(), tabs: [7], answers: [failure] });
    const firstResult = await first.queue.drain({ now: NOW });
    assert.equal(firstResult.failed, 1);
    assert.equal(first.state.gbBounceQueue[0].attempts, 1);

    const last = harness({
      stored: queued({ attempts: first.queue.MAX_ATTEMPTS - 1 }),
      tabs: [7],
      answers: [failure],
    });
    await last.queue.drain({ now: NOW });
    assert.deepEqual(last.state.gbBounceQueue, []);
    assert.equal(last.state.gbBounceLedger['jane.customer@acme.com'].status, 'failed');
  });

  it('asks the next tab when the first one cannot answer', async () => {
    const { queue, state, asked } = harness({
      stored: queued(),
      tabs: [7, 8],
      answers: [null, { ok: true, status: 'created', taskId: '1' }],
    });
    await queue.drain({ now: NOW });
    assert.deepEqual(asked.map((row) => row.tabId), [7, 8]);
    assert.deepEqual(state.gbBounceQueue, []);
  });

  it('clears queued work when automatic flagging is switched off', async () => {
    const { queue, state, asked } = harness({
      stored: { ...queued(), devSettings: { 'bounce.autoFlag': false } },
      tabs: [7],
      answers: [{ ok: true, status: 'created' }],
    });
    await queue.drain({ now: NOW });
    assert.deepEqual(asked, []);
    assert.deepEqual(state.gbBounceQueue, []);
  });

  it('forgets a settled address after thirty days so a new bounce works again', async () => {
    const { queue } = harness();
    const stale = { 'jane@acme.com': { at: NOW - 31 * DAY, status: 'created' } };
    assert.equal(queue.ledgerHas(stale, 'jane@acme.com', NOW), false);
    assert.deepEqual(queue.pruneLedger(stale, NOW), {});
    const fresh = { 'jane@acme.com': { at: NOW - DAY, status: 'created' } };
    assert.equal(queue.ledgerHas(fresh, 'JANE@acme.com', NOW), true);
  });
});
