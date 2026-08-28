/**
 * Task date rule (crmTasks.js): a task's Live Date sits 2 weeks before its Due
 * Date. These helpers back both the task-list "push out a year" button and
 * the Task List Push / Set-Date quick actions, so the two surfaces reschedule
 * identically. Dates are the CRM's zero-padded m/d/yyyy.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LIVE_LEAD_DAYS, parseTaskDate, taskMDY, pushDueOneYear, liveDateForDue, liveDateOnPush,
} from '../../src/lib/crmTasks.js';

describe('crm task dates · rule', () => {
  it('keeps the 2-week lead constant', () => {
    assert.equal(LIVE_LEAD_DAYS, 14);
  });

  it('parses both m/d/yyyy and ISO into the same day', () => {
    assert.equal(taskMDY(parseTaskDate('7/31/2026')), '07/31/2026');
    assert.equal(taskMDY(parseTaskDate('2026-07-31')), '07/31/2026');
    assert.equal(taskMDY(parseTaskDate('2026-07-31T09:15:00')), '07/31/2026');
    assert.equal(parseTaskDate('not a date'), null);
  });

  it('liveDateForDue is exactly 14 days before the due date', () => {
    assert.equal(liveDateForDue('07/31/2026'), '07/17/2026');
    assert.equal(liveDateForDue('2026-07-31'), '07/17/2026');
    // crosses a month boundary
    assert.equal(liveDateForDue('03/10/2026'), '02/24/2026');
    assert.equal(liveDateForDue('bad'), null);
  });

  it('pushDueOneYear moves the same month/day to next year', () => {
    assert.equal(pushDueOneYear('07/31/2026'), '07/31/2027');
    assert.equal(pushDueOneYear('2026-01-15'), '01/15/2027');
  });
});

describe('crm task dates · liveDateOnPush (quick-action rule)', () => {
  const today = '07/31/2026';

  it('adjusts the live date to due−14 when the due lands MORE than 2 weeks out', () => {
    // +1yr push
    assert.equal(liveDateOnPush('07/31/2027', { today }), '07/17/2027');
    // 20 days out
    assert.equal(liveDateOnPush('08/20/2026', { today }), '08/06/2026');
    // 15 days out — just over two weeks
    assert.equal(liveDateOnPush('08/15/2026', { today }), '08/01/2026');
  });

  it('leaves the live date alone for a near-term or past due (≤ 2 weeks out)', () => {
    assert.equal(liveDateOnPush('08/14/2026', { today }), null); // exactly 14 days → not over 2 weeks
    assert.equal(liveDateOnPush('08/10/2026', { today }), null); // 10 days
    assert.equal(liveDateOnPush('07/31/2026', { today }), null); // today
    assert.equal(liveDateOnPush('07/10/2026', { today }), null); // already past
  });
});
