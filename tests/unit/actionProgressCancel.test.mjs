import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { simulateProgram, countEffectSteps, isCancelledError } from '../../src/lib/codeEngine/simulate.js';

/* simulateProgram's default runner is the in-process asyncFunctionRunner, so
   these exercise the real progress API + cancel path without the browser
   sandbox. `progress` is injected into the script scope alongside `actions`. */

describe('custom-action · progress API', () => {
  it('fires onProgress for total / section / log markers in order', async () => {
    const events = [];
    const src = `
      progress.total(3, "Making things");
      progress.section("phase one");
      progress.log("hello", "info");
      progress.log("oops", "error");
      return "ok";
    `;
    const res = await simulateProgram(src, {}, { onProgress: (e) => events.push(e) });
    assert.equal(res.ok, true);
    assert.equal(res.result, 'ok');
    assert.deepEqual(events.map((e) => e.op), ['total', 'section', 'log', 'log']);
    assert.equal(events[0].total, 3);
    assert.equal(events[1].label, 'phase one');
    assert.equal(events[3].level, 'error');
  });

  it('countEffectSteps counts only real-write contracts in a trace', async () => {
    const src = `
      progress.section("x");
      await actions.createTask({ contactId: "100", subject: "A" });
      await actions.createTask({ contactId: "100", subject: "B" });
      return "done";
    `;
    // dry run (no executor) — still records the trace
    const dry = await simulateProgram(src, {});
    assert.equal(countEffectSteps(dry.trace), 2);
  });

  it('runs effects through the executor and reports each via onEffect', async () => {
    let created = 0;
    const executor = { run: async () => ({ ok: true, taskId: 't' + (++created) }) };
    const effects = [];
    const src = `
      for (let i = 0; i < 3; i++) {
        await progress.checkpoint();
        await actions.createTask({ contactId: "100", subject: "T" + i });
      }
      return "made";
    `;
    const res = await simulateProgram(src, {}, { executor, onEffect: (e) => effects.push(e.name) });
    assert.equal(res.ok, true);
    assert.equal(created, 3);
    assert.equal(effects.filter((n) => n === 'createTask').length, 3);
  });
});

describe('custom-action · cancellation', () => {
  it('a checkpoint throws the cancel sentinel once cancelled, stopping the loop', async () => {
    let checkpoints = 0;
    let cancelled = false;
    const src = `
      for (let i = 0; i < 20; i++) {
        await progress.checkpoint();
        progress.log("iter " + i);
      }
      return "looped all";
    `;
    const res = await simulateProgram(src, {}, {
      onProgress: (e) => { if (e.op === 'checkpoint') { checkpoints += 1; if (checkpoints >= 3) cancelled = true; } },
      isCancelled: () => cancelled,
    });
    assert.equal(res.ok, false);
    assert.equal(res.cancelled, true);
    assert.ok(isCancelledError(res.error));
    assert.notEqual(res.result, 'looped all');   // did not finish the loop
    assert.ok(checkpoints < 20, `stopped early (${checkpoints} checkpoints)`);
  });

  it('cancel stops further writes at the effect chokepoint', async () => {
    let created = 0;
    let cancelled = false;
    const executor = { run: async () => ({ ok: true, taskId: 't' + (++created) }) };
    const src = `
      for (let i = 0; i < 10; i++) {
        await actions.createTask({ contactId: "100", subject: "T" + i });
      }
      return "all";
    `;
    const res = await simulateProgram(src, {}, {
      executor,
      onEffect: () => { if (created >= 2) cancelled = true; },   // cancel after 2 writes
      isCancelled: () => cancelled,
    });
    assert.equal(res.cancelled, true);
    assert.ok(created < 10, `stopped before all writes (${created})`);
  });
});
