/**
 * Unit tests — src/lib/submitOrderDates.js
 *
 * The approval/commitment date update posts GB_CALENDAR_SAVE (with ASP.NET
 * day offsets since 2000-01-01) down to the calendar iframe bridge and gets
 * progress back through window.__gbActiveCalendar. Offsets are verified
 * against the known-good values from iframe/date-utils.js (Apr 1 2026 → 9587,
 * Apr 12 2026 → 9598). Conventions per findPhone.test.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis; // module addresses the bridge handle via bare `window`

const { submitOrderDates, runOrderDateUpdate, ORDER_DATE_STEPS } = await import('../../src/lib/submitOrderDates.js');

const CALENDAR_URL = 'https://api.golfballs.com/golfballs/AdminNew/default.aspx?page=DeliveryDateCalendar&orderID=123';
const APPROVAL = new Date(2026, 3, 1);    // April 1, 2026
const COMMITMENT = new Date(2026, 3, 12); // April 12, 2026

function installChrome() {
  const calls = [];
  globalThis.chrome = { runtime: { sendMessage: (msg) => { calls.push(msg); } } };
  return calls;
}

describe('submitOrderDates — real iframe-bridge path', () => {
  it('requires both dates before doing anything', () => {
    const calls = installChrome();
    const errors = [];
    submitOrderDates({ calendarUrl: CALENDAR_URL, approval: APPROVAL, commitment: null, onError: (m) => errors.push(m) });
    assert.deepEqual(errors, ['Pick both dates first']);
    assert.equal(calls.length, 0);
  });

  it('broadcasts GB_CALENDAR_SAVE with ASP.NET day offsets as strings', () => {
    const calls = installChrome();
    submitOrderDates({ calendarUrl: CALENDAR_URL, approval: APPROVAL, commitment: COMMITMENT });
    assert.deepEqual(calls, [{
      action: 'broadcastToFrames',
      payload: {
        action: 'GB_CALENDAR_SAVE',
        calendarUrl: CALENDAR_URL,
        approvalOffset: '9587',
        commitmentOffset: '9598',
      },
    }]);
    window.__gbActiveCalendar = null;
  });

  it('sends no approval offset when the server rendered only commitment', () => {
    const calls = installChrome();
    submitOrderDates({
      calendarUrl: CALENDAR_URL,
      approval: null,
      commitment: COMMITMENT,
      availableCalendars: { approval: false, commitment: true },
    });
    assert.equal(calls[0].payload.approvalOffset, null);
    assert.equal(calls[0].payload.commitmentOffset, '9598');
    window.__gbActiveCalendar = null;
  });

  it('converts the bridge’s 1-based step numbers to 0-based callbacks', () => {
    installChrome();
    const steps = [];
    submitOrderDates({ calendarUrl: CALENDAR_URL, approval: APPROVAL, commitment: COMMITMENT, onStep: (i, label) => steps.push([i, label]) });
    const bridge = window.__gbActiveCalendar;
    bridge.onStep('2', 'Selecting commitment date');
    bridge.onStep(undefined, 'fallback'); // unparseable step ⇒ treated as step 1 ⇒ index 0
    assert.deepEqual(steps, [[1, 'Selecting commitment date'], [0, 'fallback']]);
    window.__gbActiveCalendar = null;
  });

  it('clears the bridge handle and fires onDone when the iframe finishes', () => {
    installChrome();
    let done = 0;
    submitOrderDates({ calendarUrl: CALENDAR_URL, approval: APPROVAL, commitment: COMMITMENT, onDone: () => { done += 1; } });
    window.__gbActiveCalendar.onDone();
    assert.equal(done, 1);
    assert.equal(window.__gbActiveCalendar, null);
  });

  it('clears the bridge handle and forwards the message on iframe error', () => {
    installChrome();
    const errors = [];
    submitOrderDates({ calendarUrl: CALENDAR_URL, approval: APPROVAL, commitment: COMMITMENT, onError: (m) => errors.push(m) });
    window.__gbActiveCalendar.onError('postback chain failed at step 2');
    assert.deepEqual(errors, ['postback chain failed at step 2']);
    assert.equal(window.__gbActiveCalendar, null);
  });

  it('reports a sendMessage throw through onError and drops the handle', () => {
    globalThis.chrome = { runtime: { sendMessage: () => { throw new Error('Extension context invalidated.'); } } };
    const errors = [];
    submitOrderDates({ calendarUrl: CALENDAR_URL, approval: APPROVAL, commitment: COMMITMENT, onError: (m) => errors.push(m) });
    assert.deepEqual(errors, ['Extension context invalidated.']);
    assert.equal(window.__gbActiveCalendar, null);
  });
});

describe('submitOrderDates — mock simulation (no calendarUrl)', () => {
  it('walks all three steps on a timer and then completes', async () => {
    installChrome();
    const steps = [];
    let done = false;
    submitOrderDates({
      approval: APPROVAL, commitment: COMMITMENT,
      onStep: (i, label) => steps.push([i, label]),
      onDone: () => { done = true; },
    });
    // First step fires synchronously.
    assert.deepEqual(steps[0], [0, 'Selecting approval date…']);
    await new Promise((r) => setTimeout(r, 2300)); // 3 × 650ms interval + margin
    assert.deepEqual(steps, [
      [0, 'Selecting approval date…'],
      [1, 'Selecting commitment date…'],
      [2, 'Saving to server…'],
    ]);
    assert.equal(done, true);
  });
});

describe('runOrderDateUpdate — step-toast driver', () => {
  it('does nothing without a step-capable toast host', () => {
    const calls = installChrome();
    runOrderDateUpdate({}, { orderID: '123', calendarUrl: CALENDAR_URL, approval: APPROVAL, commitment: COMMITMENT });
    assert.equal(calls.length, 0);
  });

  it('opens a centered step toast titled with the order number and relays progress', () => {
    installChrome();
    const events = [];
    const toast = {
      step: (opts) => { events.push(['step', opts]); return 'toast-1'; },
      update: (id, opts) => events.push(['update', id, opts]),
      dismiss: (id) => events.push(['dismiss', id]),
      error: (msg) => events.push(['error', msg]),
    };
    runOrderDateUpdate(toast, { orderID: '2820701', calendarUrl: CALENDAR_URL, approval: APPROVAL, commitment: COMMITMENT });
    assert.deepEqual(events[0], ['step', {
      steps: ORDER_DATE_STEPS,
      currentStep: 0,
      title: 'Updating order #2820701 dates…',
      placement: 'top-center',
    }]);
    window.__gbActiveCalendar.onStep('3');
    assert.deepEqual(events[1], ['update', 'toast-1', { currentStep: 2 }]);
    window.__gbActiveCalendar.onError('boom');
    assert.deepEqual(events[2], ['dismiss', 'toast-1']);
    assert.equal(events[3][0], 'error');
    assert.equal(events[3][1], 'Date update failed: boom');
  });
});
