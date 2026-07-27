/**
 * code → block IR translation.
 *
 * The block view is a projection of the user's JS via the same Lezer parser the
 * editor highlights with. These pin that action calls become typed action
 * blocks (keyed by a stable source-span id), control flow becomes branch/loop/
 * cases, unknown JS degrades to a code block rather than breaking the view, and
 * the id is stable across a re-parse of unchanged code (so the run trace lines
 * up with the blocks).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translateProgram, flattenBlocks } from '../../src/lib/codeEngine/translate.js';

describe('translate · action calls', () => {
  it('turns an awaited actions call into a typed action block', () => {
    const { blocks, actions } = translateProgram(
      'await actions.createTask({ subject: "Follow up" })',
    );
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].kind, 'action');
    assert.equal(blocks[0].contract, 'createTask');
    assert.match(blocks[0].argText, /subject/);
    assert.deepEqual(actions, ['createTask']);
  });

  it('captures an assignment target', () => {
    const { blocks } = translateProgram('const r = await actions.sendEmail(email)');
    assert.equal(blocks[0].kind, 'action');
    assert.equal(blocks[0].contract, 'sendEmail');
    assert.equal(blocks[0].assignTo, 'r');
  });

  it('treats a non-contract call as a code block, not an action', () => {
    const { blocks, actions } = translateProgram('await actions.deleteEverything()');
    assert.equal(blocks[0].kind, 'code');
    assert.deepEqual(actions, []);
  });

  it('treats an unrelated call as a code block', () => {
    const { blocks } = translateProgram('console.log("hi")');
    assert.equal(blocks[0].kind, 'code');
  });
});

describe('translate · control flow', () => {
  it('maps if/else to a branch with then/else children', () => {
    const { blocks } = translateProgram(`
      if (page.order.count > 3) {
        await actions.logCall({ subject: "VIP" })
      } else {
        await actions.createTask({ subject: "Nurture" })
      }
    `);
    assert.equal(blocks.length, 1);
    const branch = blocks[0];
    assert.equal(branch.kind, 'branch');
    assert.match(branch.condText, /page\.order\.count > 3/);
    assert.equal(branch.then[0].contract, 'logCall');
    assert.equal(branch.else[0].contract, 'createTask');
  });

  it('maps a bare if (no else) to an empty else', () => {
    const { blocks } = translateProgram('if (x) { await actions.createTask({subject:"a"}) }');
    assert.equal(blocks[0].kind, 'branch');
    assert.equal(blocks[0].then.length, 1);
    assert.deepEqual(blocks[0].else, []);
  });

  it('maps for-of to a loop with a body', () => {
    const { blocks } = translateProgram(`
      for (const c of page.contacts) {
        await actions.sendEmail({ to: c.email, subject: "Hi" })
      }
    `);
    assert.equal(blocks[0].kind, 'loop');
    assert.equal(blocks[0].loopKind, 'forEach');
    assert.match(blocks[0].headText, /of page\.contacts/);
    assert.equal(blocks[0].body[0].contract, 'sendEmail');
  });

  it('maps switch to cases against a value', () => {
    const { blocks } = translateProgram(`
      switch (page.contact.state) {
        case "CA": await actions.createTask({subject:"West"}); break;
        default: await actions.createTask({subject:"Other"});
      }
    `);
    assert.equal(blocks[0].kind, 'cases');
    assert.match(blocks[0].onText, /page\.contact\.state/);
    const labels = blocks[0].cases.map((c) => c.test);
    assert.ok(labels.includes('"CA"'));
    assert.ok(labels.includes(null), 'default case has a null test');
  });
});

describe('translate · functions', () => {
  it('projects a function declaration as a container with its individual steps', () => {
    const { blocks, actions } = translateProgram(`
      async function followUp(contact) {
        const subject = "Call " + contact.name;
        await actions.createTask({ subject });
        return subject;
      }
    `);
    const [fn] = blocks;
    assert.equal(fn.kind, 'function');
    assert.equal(fn.name, 'followUp');
    assert.equal(fn.paramsText, 'contact');
    assert.equal(fn.async, true);
    assert.deepEqual(fn.body.map((block) => block.kind), ['setVar', 'action', 'return']);
    assert.equal(fn.body[1].contract, 'createTask');
    assert.deepEqual(actions, ['createTask']);
    assert.deepEqual(
      flattenBlocks(blocks).map((block) => block.kind),
      ['function', 'setVar', 'action', 'return'],
    );
  });

  it('projects an assigned arrow function and its implicit return', () => {
    const [fn] = translateProgram('const month = (order) => order.date.slice(0, 7);').blocks;
    assert.equal(fn.kind, 'function');
    assert.equal(fn.functionKind, 'arrow');
    assert.equal(fn.name, 'month');
    assert.equal(fn.paramsText, 'order');
    assert.equal(fn.body[0].kind, 'return');
    assert.equal(fn.body[0].implicit, true);
    assert.equal(fn.body[0].valueText, 'order.date.slice(0, 7)');
  });

  it('recognizes completion on a task alias inside a loop', () => {
    const [loop] = translateProgram(
      'for (const task of page.tasks.open) { await task.complete(); }',
    ).blocks;
    assert.equal(loop.body[0].kind, 'complete');
    assert.equal(loop.body[0].method, 'complete');
    assert.equal(loop.body[0].refText, 'task.complete');
  });
});

describe('translate · robustness & ids', () => {
  it('keeps a stable id across a re-parse of unchanged code', () => {
    const code = 'await actions.createTask({ subject: "x" })';
    assert.equal(translateProgram(code).blocks[0].id, translateProgram(code).blocks[0].id);
  });

  it('reports a syntax error span without throwing', () => {
    const { errors } = translateProgram('if (x {');
    assert.ok(errors.length > 0);
    assert.ok(Number.isInteger(errors[0].from));
  });

  it('handles an empty program', () => {
    const { blocks, actions, errors } = translateProgram('');
    assert.deepEqual(blocks, []);
    assert.deepEqual(actions, []);
    assert.deepEqual(errors, []);
  });

  it('flattens nested blocks to a trace-key list', () => {
    const { blocks } = translateProgram(`
      for (const c of page.contacts) {
        if (c.vip) { await actions.sendEmail({to:c.email,subject:"Hi"}) }
      }
    `);
    const flat = flattenBlocks(blocks);
    const kinds = flat.map((b) => b.kind);
    assert.deepEqual(kinds, ['loop', 'branch', 'action']);
    assert.equal(flat.at(-1).contract, 'sendEmail');
    // Every id is unique so a trace can address each block.
    assert.equal(new Set(flat.map((b) => b.id)).size, flat.length);
  });

  it('collects the distinct contract set for preflight gating', () => {
    const { actions } = translateProgram(`
      await actions.createTask({subject:"a"});
      await actions.sendEmail({to:"x@y.z",subject:"b"});
      await actions.createTask({subject:"c"});
    `);
    assert.deepEqual(actions.sort(), ['createTask', 'sendEmail']);
  });
});
