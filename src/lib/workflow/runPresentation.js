/* Pure run-screen projection for code workflows.
 *
 * A source action inside a loop has one stable block id but can execute many
 * times. The run UI therefore models a pipeline of source blocks plus per-row
 * occurrence counts; repeated executions pulse the same step instead of
 * inventing a misleading line of duplicate static steps.
 */

const CONTRACT_LABELS = Object.freeze({
  sendEmail: 'Send email',
  createTask: 'Create task',
  updateTask: 'Edit task',
  completeTask: 'Complete task',
  logCall: 'Log call',
  addNote: 'Add note',
  editContact: 'Edit contact',
  evaluate: 'Evaluate template',
});

function contractForBlock(block) {
  if (block.kind === 'action') return block.contract;
  if (block.kind === 'evaluate') return 'evaluate';
  if (block.kind === 'complete') return 'completeTask';
  if (block.kind === 'edit') return 'editContact';
  return null;
}

function childLists(block) {
  const out = [];
  if (Array.isArray(block.then)) out.push(block.then);
  if (Array.isArray(block.else)) out.push(block.else);
  if (Array.isArray(block.body)) out.push(block.body);
  if (Array.isArray(block.cases)) {
    for (const c of block.cases) out.push(c.body || []);
  }
  return out;
}

function staticLabel(block, contract) {
  if (block.kind === 'return') return 'Return result';
  return CONTRACT_LABELS[contract] || contract || 'Run step';
}

/**
 * Ordered source-level steps shown before execution. Effects nested inside a
 * function remain part of the pipeline; function-local returns do not, because
 * they are implementation detail rather than the workflow's final result.
 */
export function buildRunPipeline(blocks = []) {
  const out = [];
  const seen = new Set();
  const walk = (list, functionDepth = 0) => {
    for (const block of Array.isArray(list) ? list : []) {
      const contract = contractForBlock(block);
      const includeReturn = block.kind === 'return' && functionDepth === 0;
      if ((contract || includeReturn) && !seen.has(block.id)) {
        seen.add(block.id);
        out.push({
          id: block.id,
          kind: block.kind,
          contract,
          label: staticLabel(block, contract),
          dynamic: false,
        });
      }
      const nextFunctionDepth = functionDepth + (block.kind === 'function' ? 1 : 0);
      for (const kids of childLists(block)) walk(kids, nextFunctionDepth);
    }
  };
  walk(blocks);
  return out;
}

function eventContract(event = {}) {
  return event.name || event.contract || event.entry?.contract || null;
}

function findStep(pipeline, row, event) {
  const id = event.id || event.entry?.id;
  const contract = eventContract(event);
  const exact = pipeline.find((step) => step.id === id);
  if (exact) return { step: exact, runtimeSteps: row.runtimeSteps || [] };

  const runtimeSteps = Array.isArray(row.runtimeSteps) ? row.runtimeSteps : [];
  const existingRuntime = runtimeSteps.find((step) => step.contract === contract);
  if (existingRuntime) return { step: existingRuntime, runtimeSteps };

  // Direct page-task completions and grouped edits use record-derived trace
  // ids. Pair them with an unused static step of the same contract when one is
  // available, then treat later hits as a repeat of that source step.
  const runs = row.stepRuns || {};
  const staticMatches = pipeline.filter((step) => step.contract === contract);
  const unusedStatic = staticMatches.find((step) => !runs[step.id]);
  if (unusedStatic) return { step: unusedStatic, runtimeSteps };
  if (staticMatches.length) return { step: staticMatches[staticMatches.length - 1], runtimeSteps };

  const runtimeStep = {
    id: `runtime:${contract || 'effect'}`,
    kind: 'effect',
    contract,
    label: CONTRACT_LABELS[contract] || contract || 'Runtime effect',
    dynamic: true,
  };
  return { step: runtimeStep, runtimeSteps: [...runtimeSteps, runtimeStep] };
}

/** Apply one live effect callback to a contact row. */
export function advanceRunRow(current = {}, event = {}, pipeline = []) {
  const row = current || {};
  const { step, runtimeSteps } = findStep(pipeline, row, event);
  const stepRuns = {
    ...(row.stepRuns || {}),
    [step.id]: ((row.stepRuns || {})[step.id] || 0) + 1,
  };
  const failed = event.status === 'failed' || event.entry?.status === 'failed';
  const stepFailures = failed
    ? { ...(row.stepFailures || {}), [step.id]: true }
    : (row.stepFailures || {});
  const stepOrder = Array.isArray(row.stepOrder) ? [...row.stepOrder] : [];
  if (!stepOrder.includes(step.id)) stepOrder.push(step.id);

  // Keep the FIRST real failure reason so the settled row can show WHY it
  // failed instead of just a red dot. Prefer the executor error captured on
  // the trace entry, then the effect result's error.
  const failureReason = failed
    ? (event.entry?.errors?.[0] || event.result?.error || event.entry?.reason || '')
    : '';
  const firstError = row.firstError || (failureReason || undefined);

  return {
    ...row,
    status: 'sending',
    ran: (row.ran || 0) + (event.status === 'ran' ? 1 : 0),
    label: event.entry?.summary || step.label,
    activeStepId: step.id,
    pulse: (row.pulse || 0) + 1,
    stepRuns,
    stepFailures,
    firstError,
    stepOrder,
    runtimeSteps,
  };
}

/** Settle a contact row and mark its program-level return when reached. */
export function finishRunRow(current = {}, summary = {}, pipeline = []) {
  let row = { ...(current || {}) };
  if (summary.result != null && summary.status !== 'failed') {
    const returns = pipeline.filter((step) => step.kind === 'return');
    // An effect before the return normally means the program reached its
    // closing summary; an effect-free early exit uses the first guard return.
    const returnStep = (row.stepOrder || []).length
      ? returns[returns.length - 1]
      : returns[0];
    if (returnStep) {
      const stepOrder = Array.isArray(row.stepOrder) ? [...row.stepOrder] : [];
      if (!stepOrder.includes(returnStep.id)) stepOrder.push(returnStep.id);
      row = {
        ...row,
        stepRuns: { ...(row.stepRuns || {}), [returnStep.id]: 1 },
        stepOrder,
      };
    }
  }
  const effectTrace = Array.isArray(summary.trace)
    ? summary.trace.filter((entry) => entry?.kind !== 'function')
    : [];
  const last = effectTrace.length
    ? effectTrace[effectTrace.length - 1].summary
    : '';
  // A failed run leads with the REASON (contact-level error, else the first
  // step's captured error) so the row is self-explaining; a successful run
  // keeps its normal last-step / return-value label.
  const failureReason = summary.status === 'failed'
    ? (summary.error
        || row.firstError
        || (effectTrace.find((entry) => entry?.errors?.length)?.errors?.[0])
        || '')
    : '';
  return {
    ...row,
    ran: summary.ran ?? row.ran ?? 0,
    label: failureReason
      || last
      || summary.result
      || (summary.suppressReason ? `Suppressed · ${summary.suppressReason}` : '—'),
    firstError: row.firstError || failureReason || undefined,
    status: summary.status || row.status || 'queued',
    activeStepId: null,
  };
}

/** Keep source dots stable while inserting runtime-only effects beside the
 * nearest executed source step. Dots should light up, not rearrange mid-run. */
export function displayRunPipeline(pipeline = [], row = {}) {
  const runtime = Array.isArray(row.runtimeSteps) ? row.runtimeSteps : [];
  const all = [...runtime, ...pipeline];
  const byId = new Map(all.map((step) => [step.id, step]));
  const ids = pipeline.map((step) => step.id);
  const execution = Array.isArray(row.stepOrder) ? row.stepOrder : [];
  for (const step of runtime) {
    if (ids.includes(step.id)) continue;
    const at = execution.indexOf(step.id);
    const nextStatic = at >= 0
      ? execution.slice(at + 1).find((id) => ids.includes(id))
      : null;
    const previousStatic = at >= 0
      ? [...execution.slice(0, at)].reverse().find((id) => ids.includes(id))
      : null;
    if (nextStatic) ids.splice(ids.indexOf(nextStatic), 0, step.id);
    else if (previousStatic) ids.splice(ids.indexOf(previousStatic) + 1, 0, step.id);
    else ids.unshift(step.id);
  }
  return ids.map((id) => ({
    ...byId.get(id),
    runs: (row.stepRuns || {})[id] || 0,
    failed: !!(row.stepFailures || {})[id],
  }));
}
