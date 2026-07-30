import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { translateProgram } from '../../src/lib/codeEngine/translate.js';
import {
  advanceRunRow,
  buildRunPipeline,
  displayRunPipeline,
  finishRunRow,
} from '../../src/lib/workflow/runPresentation.js';

describe('workflow run presentation · source steps and repeats', () => {
  it('keeps function actions visible but excludes function-local returns', () => {
    const { blocks } = translateProgram(`
      async function createThree() {
        await actions.createTask({ subject: "Prior Year" });
        return 3;
      }
      await createThree();
      return "done";
    `);
    const pipeline = buildRunPipeline(blocks);
    assert.deepEqual(
      pipeline.map((step) => [step.kind, step.contract]),
      [['action', 'createTask'], ['return', null]],
    );
  });

  it('counts a repeated loop action on one stable dot and restarts its pulse', () => {
    const { blocks } = translateProgram(`
      for (const subject of page.subjects) {
        await actions.createTask({ subject });
      }
      return "done";
    `);
    const pipeline = buildRunPipeline(blocks);
    const action = pipeline.find((step) => step.contract === 'createTask');
    const event = {
      id: action.id,
      name: 'createTask',
      status: 'ran',
      entry: { summary: 'Create task “Prior Year”' },
    };
    const once = advanceRunRow({ status: 'sending' }, event, pipeline);
    const twice = advanceRunRow(once, event, pipeline);
    const shown = displayRunPipeline(pipeline, twice);

    assert.equal(shown.find((step) => step.id === action.id).runs, 2);
    assert.equal(twice.activeStepId, action.id);
    assert.equal(twice.pulse, 2);
    assert.deepEqual(twice.stepOrder, [action.id], 'the repeated source node owns one dot');
  });

  it('folds record-derived task ids into one runtime completion step', () => {
    const pipeline = buildRunPipeline(translateProgram(
      'await actions.createTask({ subject: "new" }); return "done";',
    ).blocks);
    const complete = (id) => ({
      id: `ct_${id}`,
      name: 'completeTask',
      status: 'ran',
      entry: { summary: `Complete task ${id}` },
    });
    const first = advanceRunRow({}, complete('1'), pipeline);
    const second = advanceRunRow(first, complete('2'), pipeline);
    const runtime = displayRunPipeline(pipeline, second)
      .find((step) => step.contract === 'completeTask');

    assert.equal(runtime.dynamic, true);
    assert.equal(runtime.runs, 2);
    assert.equal(second.runtimeSteps.length, 1);
  });

  it('marks the closing return and preserves repeat totals when a row settles', () => {
    const pipeline = buildRunPipeline(translateProgram(
      'await actions.addNote({ body: "x" }); return "finished";',
    ).blocks);
    const action = pipeline.find((step) => step.contract === 'addNote');
    const running = advanceRunRow({}, {
      id: action.id,
      name: 'addNote',
      status: 'ran',
      entry: { summary: 'Add note “x”' },
    }, pipeline);
    const done = finishRunRow(running, {
      status: 'sent',
      ran: 1,
      result: 'finished',
      trace: [{ summary: 'Add note “x”' }],
    }, pipeline);
    const shown = displayRunPipeline(pipeline, done);

    assert.equal(done.status, 'sent');
    assert.equal(done.activeStepId, null);
    assert.equal(shown.find((step) => step.kind === 'return').runs, 1);
  });
});
