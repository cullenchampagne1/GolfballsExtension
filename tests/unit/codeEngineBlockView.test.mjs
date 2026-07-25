/**
 * blockView — the pure presentation view-model for the block IR.
 *
 * Pins that the trace indexes by block id, that a container block folds its
 * descendants' run status (a branch whose taken side ran shows "ran"; a
 * failed leaf propagates up as "failed"; an untouched block stays "pending"),
 * and that each block yields a stable, JSX-free descriptor the row renders
 * from — including the richer per-run summary once a trace exists.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translateProgram } from '../../src/lib/codeEngine/translate.js';
import { simulateProgram } from '../../src/lib/codeEngine/simulate.js';
import { indexTrace, blockStatus, describeBlock } from '../../src/lib/codeEngine/blockView.js';

describe('blockView · trace indexing + status', () => {
  it('indexes an ordered trace by block id, grouping repeats', () => {
    const by = indexTrace([
      { id: 'n1_2', contract: 'sendEmail', status: 'ran' },
      { id: 'n1_2', contract: 'sendEmail', status: 'ran' },
      { id: 'n5_6', contract: 'createTask', status: 'failed' },
    ]);
    assert.equal(by.n1_2.length, 2);
    assert.equal(by.n5_6.length, 1);
  });

  it('reports pending for a never-reached action', () => {
    const block = translateProgram('await actions.createTask({ subject: "x" })').blocks[0];
    assert.equal(blockStatus(block, {}), 'pending');
  });

  it('folds a branch to "ran" when only the taken side fired', async () => {
    const source = `
      if (page.n > 3) await actions.logCall({ subject: "VIP" });
      else await actions.createTask({ subject: "Nurture" });
    `;
    const branch = translateProgram(source).blocks[0];
    const { trace } = await simulateProgram(source, { n: 5 });
    const by = indexTrace(trace);
    assert.equal(branch.kind, 'branch');
    assert.equal(blockStatus(branch, by), 'ran');
    // The taken action ran; the untaken one stays pending.
    assert.equal(blockStatus(branch.then[0], by), 'ran');
    assert.equal(blockStatus(branch.else[0], by), 'pending');
  });

  it('propagates a contract-validation failure up through its loop', async () => {
    const source = 'for (const c of page.c) { await actions.sendEmail({ subject: "no recipient" }); }';
    const loop = translateProgram(source).blocks[0];
    const { trace } = await simulateProgram(source, { c: [1] });
    assert.equal(blockStatus(loop, indexTrace(trace)), 'failed');
  });
});

describe('blockView · block descriptors', () => {
  it('labels an action with its contract summary and gate before any run', () => {
    const block = translateProgram('await actions.sendEmail({ to: "a@x.com", subject: "Hi" })').blocks[0];
    const d = describeBlock(block, {});
    assert.equal(d.kind, 'action');
    assert.equal(d.icon, 'mail');
    assert.equal(d.title, 'Send an email');
    assert.equal(d.effect, 'outward');
    assert.equal(d.gate, 'confirm');
    assert.equal(d.status, 'pending');
    assert.equal(d.runs, 0);
  });

  it('swaps in the value-filled summary + run count once traced', async () => {
    const source = 'await actions.createTask({ subject: "Follow up with Ada" })';
    const block = translateProgram(source).blocks[0];
    const { trace } = await simulateProgram(source);
    const d = describeBlock(block, indexTrace(trace));
    assert.match(d.title, /Follow up with Ada/);
    assert.equal(d.runs, 1);
    assert.equal(d.status, 'ran');
  });

  it('surfaces contract errors on a failed action', async () => {
    const source = 'await actions.sendEmail({ subject: "no recipient" })';
    const block = translateProgram(source).blocks[0];
    const { trace } = await simulateProgram(source);
    const d = describeBlock(block, indexTrace(trace));
    assert.equal(d.status, 'failed');
    assert.ok(d.errors.some((e) => e.includes('"to"')));
  });

  it('titles control-flow blocks readably', () => {
    const [branch] = translateProgram('if (page.n > 3) { await actions.logCall({ subject: "x" }); }').blocks;
    assert.equal(describeBlock(branch).title, 'If page.n > 3');
    const [loop] = translateProgram('for (const c of page.contacts) { await actions.logCall({ subject: "x" }); }').blocks;
    assert.match(describeBlock(loop).title, /^For each/);
    const [sw] = translateProgram('switch (page.state) { case "CA": await actions.logCall({ subject: "x" }); }').blocks;
    assert.equal(describeBlock(sw).title, 'Switch on page.state');
  });
});
