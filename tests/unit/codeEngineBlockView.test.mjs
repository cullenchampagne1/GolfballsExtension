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
import {
  indexTrace,
  blockStatus,
  describeBlock,
  runStatus,
  subtreeRan,
} from '../../src/lib/codeEngine/blockView.js';

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
    const source = 'for (const c of page.c) { await actions.sendEmail({ from: "me@x.com" }); }';
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
    const source = 'await actions.sendEmail({ from: "me@x.com" })';
    const block = translateProgram(source).blocks[0];
    const { trace } = await simulateProgram(source);
    const d = describeBlock(block, indexTrace(trace));
    assert.equal(d.status, 'failed');
    assert.ok(d.errors.some((e) => /saved email or a subject/.test(e)));
  });

  it('renders a comment as its own block kind, stripped of the // marker', () => {
    const [c] = translateProgram('// re-engage cold contacts').blocks;
    assert.equal(c.kind, 'comment');
    assert.equal(describeBlock(c).title, 're-engage cold contacts');
  });

  it('gives a comment clean lines (block comment → multiple lines)', () => {
    const [c] = translateProgram('/* first line\n   * second line */').blocks;
    assert.deepEqual(describeBlock(c).lines, ['first line', 'second line']);
  });

  it('renders a non-action declaration as a setVar block with name + value', () => {
    const [v] = translateProgram('const daysCold = 30;').blocks;
    assert.equal(v.kind, 'setVar');
    const d = describeBlock(v);
    assert.equal(d.kind, 'setVar');
    assert.equal(d.title, 'daysCold');
    assert.equal(d.detail, '30');
  });

  it('detects an email-shaped object literal as a compose block with a preview', () => {
    const [c] = translateProgram('const welcome = { subject: "Hi there", body: "Thanks!" };').blocks;
    assert.equal(c.kind, 'compose');
    assert.equal(c.objType, 'email');
    const d = describeBlock(c);
    assert.equal(d.title, 'welcome');
    assert.equal(d.subject, 'Hi there');
    assert.equal(d.body, 'Thanks!');
  });

  it('detects a task-shaped object literal as a compose block', () => {
    const [c] = translateProgram('const t = { subject: "Call", priority: "high", daysOut: 2 };').blocks;
    assert.equal(c.kind, 'compose');
    assert.equal(c.objType, 'task');
  });

  it('still treats an assigned action call as an action, not a setVar', () => {
    const [a] = translateProgram('const r = await actions.createTask({ subject: "x" });').blocks;
    assert.equal(a.kind, 'action');
    assert.equal(a.contract, 'createTask');
  });

  it('parses a return statement as its own step block', () => {
    const [b] = translateProgram('return "done";').blocks;
    assert.equal(b.kind, 'return');
    assert.equal(describeBlock(b).title, 'Return "done"');
  });

  it('flattens a switch case { … } block and drops the break', () => {
    const src = 'switch (x) { case "a": { await actions.logCall({ subject: "y" }); break; } }';
    const [sw] = translateProgram(src).blocks;
    assert.equal(sw.kind, 'cases');
    const body = sw.cases[0].body;
    assert.equal(body.length, 1, 'case body should be just the action, not a wrapping code block + break');
    assert.equal(body[0].kind, 'action');
    assert.equal(body[0].contract, 'logCall');
  });

  it('recognizes page.contact edits + task completes as their own blocks', () => {
    const blocks = translateProgram('page.contact.jobTitle = "VP"; page.tasks.open[0].complete(); page.tasks.completeAll();').blocks;
    assert.deepEqual(blocks.map((b) => b.kind), ['edit', 'complete', 'complete']);
    assert.equal(blocks[0].field, 'jobTitle');
    assert.equal(describeBlock(blocks[0]).title, 'jobTitle');
    assert.equal(describeBlock(blocks[1]).title, 'Complete task');
    assert.equal(describeBlock(blocks[2]).title, 'Complete all open tasks');
  });

  it('titles control-flow blocks readably', () => {
    const [branch] = translateProgram('if (page.n > 3) { await actions.logCall({ subject: "x" }); }').blocks;
    assert.equal(describeBlock(branch).title, 'If page.n > 3');
    const [loop] = translateProgram('for (const c of page.contacts) { await actions.logCall({ subject: "x" }); }').blocks;
    assert.match(describeBlock(loop).title, /^For each/);
    const [sw] = translateProgram('switch (page.state) { case "CA": await actions.logCall({ subject: "x" }); }').blocks;
    assert.equal(describeBlock(sw).title, 'Switch on page.state');
  });

  it('labels functions separately while preserving their nested action status', async () => {
    const source = `
      async function followUp(name) {
        await actions.createTask({ subject: "Call " + name });
        return name;
      }
      await followUp("Ada");
    `;
    const [fn] = translateProgram(source).blocks;
    const descriptor = describeBlock(fn);
    assert.equal(descriptor.kind, 'function');
    assert.equal(descriptor.title, 'followUp(name)');
    assert.match(descriptor.detail, /async function · 2 blocks/);

    const { trace } = await simulateProgram(source);
    assert.equal(blockStatus(fn, indexTrace(trace)), 'ran');
    assert.equal(describeBlock(fn, indexTrace(trace)).runs, 1);
    assert.equal(describeBlock(fn.body[0], indexTrace(trace)).runs, 1);
  });

  it('counts repeated pure-helper calls and makes the function itself runnable', async () => {
    const source = `
      const normalize = (value) => value.trim().toLowerCase();
      normalize(" One ");
      normalize(" Two ");
      normalize(" Three ");
    `;
    const [fn] = translateProgram(source).blocks;
    const { trace } = await simulateProgram(source);
    const by = indexTrace(trace);
    assert.equal(blockStatus(fn, by), 'ran');
    assert.equal(subtreeRan(fn, by), true);
    assert.equal(describeBlock(fn, by).runs, 3);
    assert.equal(runStatus(fn, by, { runningId: fn.id }), 'running');
  });
});
