import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPauseGate, waitForPausableDelay } from '../../src/lib/emailRunControl.js';

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('bulk email run control', () => {
  it('holds a live queue at a checkpoint and resumes without replacing caller progress', async () => {
    const gate = createPauseGate();
    const progress = { sent: 2, failed: 1, queued: ['contact-4', 'contact-5'] };
    let crossedCheckpoint = false;

    gate.pause();
    const checkpoint = gate.waitUntilResumed(() => true).then((active) => {
      crossedCheckpoint = active;
    });

    await nextTurn();
    assert.equal(crossedCheckpoint, false);
    assert.deepEqual(progress, { sent: 2, failed: 1, queued: ['contact-4', 'contact-5'] });

    gate.resume();
    await checkpoint;
    assert.equal(crossedCheckpoint, true);
    assert.deepEqual(progress, { sent: 2, failed: 1, queued: ['contact-4', 'contact-5'] });
  });

  it('releases a paused checkpoint as inactive when the run is cancelled', async () => {
    const gate = createPauseGate();
    let active = true;
    gate.pause();

    const checkpoint = gate.waitUntilResumed(() => active);
    await nextTurn();
    active = false;
    gate.reset();

    assert.equal(await checkpoint, false);
    assert.equal(gate.paused, false);
  });

  it('freezes the pacing countdown until the same run resumes', async () => {
    const gate = createPauseGate();
    const updates = [];
    let settled = false;
    gate.pause();

    const pacing = waitForPausableDelay({
      durationMs: 20,
      tickMs: 5,
      pauseGate: gate,
      isActive: () => true,
      onProgress: (state) => updates.push(state),
    }).then((result) => {
      settled = true;
      return result;
    });

    await wait(12);
    assert.equal(settled, false);
    assert.deepEqual(updates, [{ remaining: 20, total: 20 }]);

    gate.resume();
    assert.equal(await pacing, true);
    assert.equal(updates.at(-1).remaining, 0);
  });
});
