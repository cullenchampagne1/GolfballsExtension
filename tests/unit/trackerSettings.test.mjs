/**
 * Unit tests — src/lib/trackerSettings.js
 *
 * The Trackers settings table is the surface where a rep decides what is
 * allowed to run, so what a row CLAIMS matters: a tracker that is collecting
 * must not read as off, and a count must not imply a lifecycle the tracker
 * does not have.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRACKER_ARRIVAL,
  trackerAgo,
  trackerTableRows,
} from '../../src/lib/trackerSettings.js';

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const summary = (overrides = {}) => ({
  trackerId: 'opportunities',
  label: 'Opportunities',
  kind: 'intercept',
  recordKind: 'opportunity',
  enabled: true,
  total: 12,
  open: 9,
  updatedAt: NOW - 2 * HOUR,
  lastPolledAt: 0,
  ...overrides,
});

describe('trackerAgo', () => {
  it('answers “is this working?” at the coarseness a rep reads', () => {
    assert.equal(trackerAgo(NOW - 30_000, NOW), 'just now');
    assert.equal(trackerAgo(NOW - 8 * MINUTE, NOW), '8m ago');
    assert.equal(trackerAgo(NOW - 3 * HOUR, NOW), '3h ago');
    assert.equal(trackerAgo(NOW - 4 * 24 * HOUR, NOW), '4d ago');
  });

  it('says never rather than dating a missing timestamp to 1970', () => {
    assert.equal(trackerAgo(0, NOW), 'never');
    assert.equal(trackerAgo(null, NOW), 'never');
    assert.equal(trackerAgo(undefined, NOW), 'never');
  });
});

describe('trackerTableRows', () => {
  it('builds the row a rep reads out of one worker summary', () => {
    const [row] = trackerTableRows([summary()], { now: NOW });
    assert.deepEqual(row, {
      trackerId: 'opportunities',
      label: 'Opportunities',
      kind: 'intercept',
      arrival: TRACKER_ARRIVAL.intercept,
      enabled: true,
      total: 12,
      open: 9,
      showOpen: true,
      lastActivityAt: NOW - 2 * HOUR,
      lastLabel: '2h ago',
    });
  });

  it('reads a sweep that found nothing as activity, not silence', async () => {
    // A scheduled tracker that ran five minutes ago and returned no new rows is
    // working. Showing the age of its newest RECORD instead would say the
    // opposite — and what it found is the count's job, one column over.
    const [row] = trackerTableRows([summary({
      trackerId: 'recent-orders',
      kind: 'poll',
      updatedAt: NOW - 3 * 24 * HOUR,
      lastPolledAt: NOW - 5 * MINUTE,
    })], { now: NOW });
    assert.equal(row.lastLabel, '5m ago');
    assert.equal(row.lastActivityAt, NOW - 5 * MINUTE);
  });

  it('still reports the newest record when that is the later of the two', () => {
    const [row] = trackerTableRows([summary({
      updatedAt: NOW - 10 * MINUTE, lastPolledAt: NOW - 4 * HOUR,
    })], { now: NOW });
    assert.equal(row.lastLabel, '10m ago');
  });

  it('treats a tracker with no stored opinion as collecting', () => {
    // The store's default is on-unless-turned-off; a switch that read "off" for
    // a tracker that is in fact running would be the worst kind of wrong here.
    const [row] = trackerTableRows([summary({ enabled: undefined })], { now: NOW });
    assert.equal(row.enabled, true);
    const [off] = trackerTableRows([summary({ enabled: false })], { now: NOW });
    assert.equal(off.enabled, false);
  });

  it('hides the open count for trackers where nothing ever settles', () => {
    const [row] = trackerTableRows([
      summary({ trackerId: 'recent-orders', kind: 'poll', total: 300, open: 300 }),
    ], { now: NOW });
    assert.equal(row.showOpen, false);
    assert.equal(row.total, 300);
    assert.equal(row.arrival, TRACKER_ARRIVAL.poll);
  });

  it('describes a kind it has no wording for instead of rendering nothing', () => {
    const [row] = trackerTableRows([summary({ kind: 'webhook' })], { now: NOW });
    assert.equal(row.arrival, 'Collected in the background');
  });

  it('never lets a bad count out of the worker become a bad cell', () => {
    const [row] = trackerTableRows([
      summary({ total: null, open: 4, updatedAt: 'nonsense', lastPolledAt: -1, label: '' }),
    ], { now: NOW });
    assert.equal(row.total, 0);
    assert.equal(row.open, 0, 'open cannot exceed the total it is part of');
    assert.equal(row.showOpen, false);
    assert.equal(row.lastLabel, 'never');
    assert.equal(row.label, 'opportunities', 'falls back to the id, not an empty cell');
  });

  it('drops junk rows rather than rendering a switch with nothing behind it', () => {
    assert.deepEqual(trackerTableRows(null), []);
    assert.deepEqual(trackerTableRows([null, {}, { label: 'No id' }]), []);
  });
});
