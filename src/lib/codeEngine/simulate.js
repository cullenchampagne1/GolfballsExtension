/* ───────────────────────────────────────────────────────────────
   codeEngine/simulate — run a program with NO side effects, produce a
   block-keyed trace for the run animation.

   Instruments the source, injects recording `actions.__trace` and
   `actions.__function` hooks, validates each contract call but never executes
   it, and
   runs the code through an INJECTED runner:
     • browser  → the page-engine sandbox (runInSandbox), CSP-safe
     • node/test → AsyncFunction (same shape the sandbox uses)

   The result is the ordered `{ id, contract, status }` trace the existing
   workflow run/sim animation consumes — the whole point of Phase 1's
   "write code → watch the blocks light up" with zero real effects.

   The runner is injected so this module stays pure and unit-testable; a
   real (gated) run swaps the recording __trace for the contract executor.
─────────────────────────────────────────────────────────────── */

import { instrument } from './instrument.js';
import {
  validateContractInput,
  describeContract,
  APPROVED_CONTACT_FIELDS,
  APPROVED_TASK_FIELDS,
  APPROVED_OPPORTUNITY_FIELDS,
} from './contracts.js';
import { buildUserBinding } from './userBinding.js';
import { hydrateOutbound, makeOutbound } from './runtime.js';
import { ACTION_RESULT_FIELDS } from './actionResultFields.js';

/** A runner that executes instrumented code via AsyncFunction (Node/tests).
 *  The browser passes its own sandbox-backed runner instead. */
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
export function asyncFunctionRunner(code, scope) {
  const keys = Object.keys(scope);
  // eslint-disable-next-line no-new-func
  const fn = new AsyncFunction(...keys, `"use strict";\n${code}`);
  return fn(...keys.map((k) => scope[k]));
}

/**
 * Simulate a program.
 *
 * @param {string} source   the user's JS
 * @param {object} page     the page-engine object model (read-only) exposed as `page`
 * @param {object} opts     { run } — executes (code, scope) and returns a promise
 * @returns {Promise<{ ok, trace, calls, error }>}
 *   trace — ordered action entries plus presentation-only function entries.
 *           Function entries are `{ id, kind:'function', status:'ran', ... }`;
 *           action entries are `{ id, contract, status:'ran'|'failed', ... }`.
 *           where a `failed` entry is a contract-validation failure (bad/missing
 *           params), surfaced as a preflight without ever sending anything.
 */
/* Contracts that perform a real effect (routed to the executor on a live run). */
export const EFFECT_CONTRACTS = new Set([
  'sendEmail', 'createTask', 'logCall', 'addNote', 'updateTask', 'completeTask',
  'updateOpportunity', 'createOpportunity', 'ensureOpenOpportunity',
  'createProposalFromOrder', 'createProposal', 'editContact',
]);

/* Count the real-write steps in a trace — the denominator for the run
   progress bar (computed from the dry-run trace before the live replay). */
export function countEffectSteps(trace) {
  if (!Array.isArray(trace)) return 0;
  let n = 0;
  for (const t of trace) if (t && t.contract && EFFECT_CONTRACTS.has(t.contract)) n += 1;
  return n;
}

/* Cooperative-cancel sentinel. isCancelled() → true makes the next effect
   (or a progress.checkpoint) throw this, which unwinds the live replay so no
   further writes fire. Recognised so the caller can render "cancelled" rather
   than "failed". */
export const RUN_CANCELLED = '__gb_run_cancelled__';
function cancelledError() { const e = new Error(RUN_CANCELLED); e.__gbCancelled = true; return e; }
export function isCancelledError(error) {
  return !!(error && (error.__gbCancelled || String(error.message || error).includes(RUN_CANCELLED)));
}
const ACTION_RESULT_PREFIX = '__gb_action_result__:';

/** Serializable pointer returned inside the sandbox before live replay. */
export function actionResultRef(actionId, field) {
  return `${ACTION_RESULT_PREFIX}${String(actionId)}:${String(field)}`;
}

/* Scan an action's raw input for a reference to a PRIOR action that failed.
   e.g. updateTask({ id: created.taskId }) after createTask threw: the id is a
   `__gb_action_result__:<createId>:taskId` placeholder whose action stored an
   { ok:false } result. Returns that action's error string (so the dependent
   step is skipped with the REAL reason) or null when no dependency failed. */
function actionRefsIn(value) {
  const source = String(value || '');
  const pattern = /__gb_action_result__:(n\d+_\d+):([A-Za-z][A-Za-z0-9]*)/g;
  return [...source.matchAll(pattern)].map((match) => ({ token: match[0], actionId: match[1], field: match[2] }));
}

function findFailedDependency(value, results) {
  if (typeof value === 'string') {
    for (const ref of actionRefsIn(value)) {
      const upstream = results.get(ref.actionId);
      if (upstream && upstream.ok === false) return upstream.error || upstream.reason || 'a prior step failed';
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) { const found = findFailedDependency(item, results); if (found) return found; }
    return null;
  }
  if (value && typeof value === 'object' && Object.prototype.toString.call(value) !== '[object Date]') {
    for (const item of Object.values(value)) { const found = findFailedDependency(item, results); if (found) return found; }
  }
  return null;
}

function resolveActionResults(value, results, preserveMissing) {
  if (typeof value === 'string') {
    const refs = actionRefsIn(value);
    if (!refs.length) return value;
    // Preserve non-string values when the entire input is one result pointer
    // (task/opportunity ids are strings today, but the resolver is generic).
    if (refs.length === 1 && refs[0].token === value) {
      const result = results.get(refs[0].actionId);
      if (result && Object.hasOwn(result, refs[0].field)) return result[refs[0].field];
      return preserveMissing ? value : null;
    }
    let output = value;
    for (const ref of refs) {
      const result = results.get(ref.actionId);
      if (result && Object.hasOwn(result, ref.field)) output = output.split(ref.token).join(String(result[ref.field] ?? ''));
      else if (!preserveMissing) output = output.split(ref.token).join('');
    }
    return output;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveActionResults(item, results, preserveMissing));
  }
  // Date is a supported task-field value. Do not recursively flatten it into
  // an empty plain object while resolving action-result references.
  if (Object.prototype.toString.call(value) === '[object Date]') return value;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key, resolveActionResults(item, results, preserveMissing),
      ]),
    );
  }
  return value;
}

/**
 * Run a program. Records a dry trace by default; if `executor` is provided it
 * ALSO performs the real writes content-side (a live run) — the trace still
 * reflects each step for the run view. `executor.run(contract, input)` and
 * `executor.commitEdits(fields)` do the actual sends/edits.
 */
export async function simulateProgram(
  source,
  page = {},
  {
    run = asyncFunctionRunner,
    user = {},
    executor = null,
    beforeEffect = null,
    onEffect = null,
    onProgress = null,
    isCancelled = null,
    evaluateRef = null,
  } = {},
) {
  const { code, calls } = instrument(source);
  const trace = [];
  const actionResults = new Map();

  // Presentation-only entry hook. It deliberately bypasses validation,
  // executors, pacing, confirmation policy, and onEffect: entering a helper is
  // not a CRM effect. Its stable source id lets Simulate pulse the same
  // function block once per invocation, including repeated loop calls.
  const recordFunction = (id, name) => {
    trace.push({
      id,
      kind: 'function',
      contract: null,
      functionName: String(name || 'anonymous'),
      status: 'ran',
      summary: `Call ${String(name || 'anonymous')}()`,
      errors: [],
    });
  };

  /* Fire the live progress callback and, on a checkpoint, honour a cancel
     request by throwing the sentinel (unwinds the run). Shared by the Node
     `progress` scope object and the browser replay's progress entries. */
  const emitProgress = (op, payload) => {
    if (typeof onProgress === 'function') { try { onProgress({ op, ...payload }); } catch (e) {} }
    if (op === 'checkpoint' && typeof isCancelled === 'function' && isCancelled()) throw cancelledError();
  };

  const record = async (id, name, input) => {
    // Cancel is checked at the single write chokepoint: on a live replay this
    // stops before any further real write fires.
    if (typeof isCancelled === 'function' && isCancelled()) throw cancelledError();
    const resolvedInput = resolveActionResults(input, actionResults, !executor);
    // On a live run, a step whose input references a FAILED prior step (e.g. an
    // updateTask that sets the live date of a createTask that just threw) is
    // skipped — not failed — carrying the upstream reason, so the real cause
    // isn't buried under a misleading "updateTask needs a task id".
    const failedDependency = executor ? findFailedDependency(input, actionResults) : null;
    const check = validateContractInput(name, resolvedInput);
    const entry = {
      id,
      contract: name,
      status: failedDependency ? 'skipped' : (check.ok ? 'ran' : 'failed'),
      summary: describeContract(name, resolvedInput),
      errors: failedDependency ? [] : check.errors,
    };
    if (failedDependency) entry.reason = `Skipped — prior step failed: ${failedDependency}`;
    trace.push(entry);

    const isEffect = EFFECT_CONTRACTS.has(name);
    let result = failedDependency
      ? { ok: false, skipped: true, reason: entry.reason, dry: !executor, simulated: !executor }
      : { ok: check.ok, dry: !executor, simulated: !executor };

    if (check.ok && isEffect && typeof beforeEffect === 'function') {
      const decision = await beforeEffect({
        id, name, input: check.value || resolvedInput, entry,
      });
      if (decision === false || decision?.allow === false) {
        entry.status = 'skipped';
        entry.reason = decision?.reason || 'Skipped by workflow policy';
        entry.errors = [];
        result = {
          ok: false,
          skipped: true,
          reason: entry.reason,
          dry: !executor,
          simulated: !executor,
        };
      }
    }

    // Live run: perform the real write; helper failures surface on the trace.
    if (executor && check.ok && isEffect && entry.status === 'ran') {
      try {
        const normalizedInput = check.value || resolvedInput;
        const raw = name === 'editContact' && typeof executor.commitEdits === 'function'
          ? await executor.commitEdits(normalizedInput.fields)
          : await executor.run(name, normalizedInput);
        if (raw?.ok === false) throw new Error(raw.error || `${name} failed`);
        result = raw && typeof raw === 'object'
          ? { ...raw, ok: true, dry: false, simulated: false }
          : { ok: true, value: raw, dry: false, simulated: false };
      } catch (error) {
        entry.status = 'failed';
        entry.errors = [String(error?.message || error)];
        result = {
          ok: false,
          error: entry.errors[0],
          dry: false,
          simulated: false,
        };
      }
    }

    // A sandbox executes before effects replay. Give result-producing actions
    // serializable future fields so later steps can reference their real ids,
    // links, and totals when the trace is replayed.
    if (!executor && check.ok && ACTION_RESULT_FIELDS[name]) {
      const resultFields = ACTION_RESULT_FIELDS[name];
      for (const resultField of resultFields) result[resultField] = actionResultRef(id, resultField);
    }
    actionResults.set(String(id), result);
    if (isEffect && typeof onEffect === 'function') {
      await onEffect({ id, name, entry, status: entry.status, result });
    }
    return result;
  };

  // page.evaluate(ref) → its own "Evaluate" step; returns the outbound object.
  const recordEval = async (id, ref, evaluated = null) => {
    const r = ref || {};
    trace.push({ id, contract: 'evaluate', kind: 'evaluate', status: 'ran', summary: `Evaluate ${r.name || (r.kind || 'template')}`, errors: [] });
    if (evaluated && typeof evaluated === 'object') return hydrateOutbound(evaluated);
    if (typeof evaluateRef === 'function') return evaluateRef(r);
    return makeOutbound(r);
  };

  // ── Page control: grouped task/contact edits + task completion ──────────
  let seq = 0;
  const edits = {};                          // staged field edits (grouped)
  const recordComplete = (task) => record(`ct_${(task && task.id) || (seq += 1)}`, 'completeTask', { id: task && task.id, subject: task && task.subject });
  const stageEdit = (prop, value) => {
    if (typeof prop !== 'string') return;
    if (!Object.hasOwn(APPROVED_CONTACT_FIELDS, prop)) {
      throw new Error(`page.contact.${prop} is not an editable field. Editable: ${Object.keys(APPROVED_CONTACT_FIELDS).join(', ')}.`);
    }
    edits[prop] = value;
  };
  const commitEdits = async () => {
    const keys = Object.keys(edits);
    if (!keys.length) return;
    const fields = { ...edits };
    await record('editContact', 'editContact', { fields });
    keys.forEach((k) => delete edits[k]);
  };
  const latestOpen = (list) => (list || []).reduce((best, t) => (!best || String(t.dueDate || '') > String(best.dueDate || '') ? t : best), null);

  // Task edits are grouped independently per task. A direct assignment updates
  // the in-run object immediately, while commit() (or the automatic flush at
  // program end) records one confirm-gated updateTask effect for that task.
  const taskEdits = new Map();
  const taskMeta = new Map();
  const pendingTaskOperations = new Set();
  const taskIdOf = (task) => String(task?.id ?? task?.taskId ?? '').trim();
  const stageTaskEdit = (task, prop, value) => {
    if (typeof prop !== 'string') return;
    const canonical = APPROVED_TASK_FIELDS[prop];
    if (!canonical) {
      throw new Error(`task.${prop} is not an editable field. Editable: ${Object.keys(APPROVED_TASK_FIELDS).join(', ')}.`);
    }
    const id = taskIdOf(task);
    if (!id) throw new Error('task editing requires a task id');
    const current = taskEdits.get(id) || {};
    current[canonical] = value;
    taskEdits.set(id, current);
    taskMeta.set(id, task);
  };
  const commitTaskEdits = async (task) => {
    const id = taskIdOf(task);
    const fields = taskEdits.get(id);
    if (!id || !fields || !Object.keys(fields).length) return { ok: true, changed: [] };
    taskEdits.delete(id);
    return record(`ut_${id}`, 'updateTask', {
      id,
      subject: task?.subject || taskMeta.get(id)?.subject || '',
      fields: { ...fields },
    });
  };
  const commitAllTaskEdits = async () => {
    for (const id of [...taskEdits.keys()]) {
      await commitTaskEdits(taskMeta.get(id) || { id });
    }
  };
  const waitForTaskOperations = async () => {
    if (pendingTaskOperations.size) {
      await Promise.allSettled([...pendingTaskOperations]);
    }
  };
  const wrapTask = (sourceTask) => {
    const target = { ...(sourceTask || {}) };
    const id = taskIdOf(target);
    if (id) taskMeta.set(id, target);
    return new Proxy(target, {
      set(t, prop, value) {
        stageTaskEdit(t, prop, value);
        const canonical = APPROVED_TASK_FIELDS[prop];
        t[canonical] = value;
        if (prop !== canonical) t[prop] = value;
        return true;
      },
      get(t, prop) {
        if (prop === 'commit') return () => commitTaskEdits(t);
        if (prop === 'complete') {
          return () => {
            const operation = (async () => {
              await commitTaskEdits(t);
              return recordComplete(t);
            })();
            pendingTaskOperations.add(operation);
            operation.finally(() => pendingTaskOperations.delete(operation));
            return operation;
          };
        }
        const canonical = typeof prop === 'string' ? APPROVED_TASK_FIELDS[prop] : null;
        if (canonical && !Object.hasOwn(t, prop)) return t[canonical];
        return t[prop];
      },
    });
  };

  // Opportunity rows use the same grouped-assignment model as tasks. The
  // production page is hydrated through Opportunity/Get before execution;
  // the proxy stages only the native editor's approved fields and emits one
  // updateOpportunity effect per changed opportunity.
  const opportunityEdits = new Map();
  const opportunityMeta = new Map();
  const opportunityIdOf = (opportunity) => String(
    opportunity?.id ?? opportunity?.opportunityId ?? '',
  ).trim();
  const stageOpportunityEdit = (opportunity, prop, value) => {
    if (typeof prop !== 'string') return;
    const canonical = APPROVED_OPPORTUNITY_FIELDS[prop];
    if (!canonical) {
      throw new Error(`opportunity.${prop} is not an editable field. Editable: ${Object.keys(APPROVED_OPPORTUNITY_FIELDS).join(', ')}.`);
    }
    const id = opportunityIdOf(opportunity);
    if (!id) throw new Error('opportunity editing requires an opportunity id');
    const current = opportunityEdits.get(id) || {};
    current[canonical] = value;
    opportunityEdits.set(id, current);
    opportunityMeta.set(id, opportunity);
  };
  const commitOpportunityEdits = async (opportunity) => {
    const id = opportunityIdOf(opportunity);
    const fields = opportunityEdits.get(id);
    if (!id || !fields || !Object.keys(fields).length) return { ok: true, changed: [] };
    opportunityEdits.delete(id);
    return record(`uo_${id}`, 'updateOpportunity', {
      id,
      subject: opportunity?.subject || opportunityMeta.get(id)?.subject || '',
      fields: { ...fields },
    });
  };
  const commitAllOpportunityEdits = async () => {
    for (const id of [...opportunityEdits.keys()]) {
      await commitOpportunityEdits(opportunityMeta.get(id) || { id });
    }
  };
  const wrapOpportunity = (sourceOpportunity) => {
    const target = { ...(sourceOpportunity || {}) };
    const id = opportunityIdOf(target);
    if (id) opportunityMeta.set(id, target);
    return new Proxy(target, {
      set(current, prop, value) {
        stageOpportunityEdit(current, prop, value);
        const canonical = APPROVED_OPPORTUNITY_FIELDS[prop];
        current[canonical] = value;
        if (prop !== canonical) current[prop] = value;
        return true;
      },
      get(current, prop) {
        if (prop === 'commit') return () => commitOpportunityEdits(current);
        const canonical = typeof prop === 'string' ? APPROVED_OPPORTUNITY_FIELDS[prop] : null;
        if (canonical && !Object.hasOwn(current, prop)) return current[canonical];
        return current[prop];
      },
    });
  };

  // Node-path `page` — the Proxy set-trap captures `page.contact.x = y`; each
  // task carries `.complete()`, `.commit()`, and approved editable fields.
  // The sandbox mirrors this inline.
  const nodePage = { ...page, __eval: recordEval };
  nodePage.contact = new Proxy({ ...(page.contact || {}) }, {
    set(t, p, v) { stageEdit(p, v); t[p] = v; return true; },
    get(t, p) { if (p === 'commit') return () => commitEdits(); return t[p]; },
  });
  const openTasks = ((page.tasks && page.tasks.open) || []).map(wrapTask);
  const doneTasks = ((page.tasks && page.tasks.done) || []).map(wrapTask);

  // Modal entry points can publish task arrays independently of the current
  // CRM page. Decorate those rows with the exact same task proxy, then expose
  // the primary collection as page.tasks.items for concise bulk actions.
  const entrySource = Array.isArray(page.entryPoints) && page.entryPoints.length
    ? page.entryPoints
    : (page.entryPoint ? [page.entryPoint] : []);
  const entryPoints = entrySource.map((entryPoint) => {
    const data = entryPoint?.data && typeof entryPoint.data === 'object'
      ? { ...entryPoint.data }
      : entryPoint?.data;
    if (data && Array.isArray(data.tasks)) data.tasks = data.tasks.map(wrapTask);
    return { ...(entryPoint || {}), data };
  });
  const primaryId = page.entryPoint?.id;
  nodePage.entryPoints = entryPoints;
  nodePage.entryPoint = entryPoints.find((entryPoint) => entryPoint.id === primaryId)
    || entryPoints[0]
    || null;
  const entryTasks = Array.isArray(nodePage.entryPoint?.data?.tasks)
    ? nodePage.entryPoint.data.tasks
    : [];
  nodePage.tasks = {
    open: openTasks,
    done: doneTasks,
    items: entryTasks.length ? entryTasks : [...openTasks, ...doneTasks],
    completeAll: () => { openTasks.forEach((t) => t.complete()); },
    completeLatest: () => { const t = latestOpen(openTasks); if (t) t.complete(); },
  };
  nodePage.opportunities = (Array.isArray(page.opportunities) ? page.opportunities : [])
    .map(wrapOpportunity);

  // The action-facing progress API. Scripts call progress.total()/section()/
  // log()/checkpoint() to drive the run modal and to yield a cancel point.
  // (Node path calls these directly; the browser sandbox records them and the
  // replay routes them here via __pageRecord.progress.)
  const progressApi = {
    total: (n, label) => emitProgress('total', { total: Number(n) || 0, label: label != null ? String(label) : undefined }),
    section: (label) => emitProgress('section', { label: String(label == null ? '' : label) }),
    label: (label) => emitProgress('section', { label: String(label == null ? '' : label) }),
    step: (o) => emitProgress('step', (o && typeof o === 'object') ? o : { label: String(o == null ? '' : o) }),
    log: (message, level) => emitProgress('log', { message: String(message == null ? '' : message), level: level ? String(level) : 'info' }),
    checkpoint: async () => { emitProgress('checkpoint', {}); },
    get cancelled() { return !!(typeof isCancelled === 'function' && isCancelled()); },
  };

  const scope = {
    actions: { __trace: record, __function: recordFunction },
    page: nodePage,
    user: buildUserBinding(user),
    progress: progressApi,
    // Sandbox replay hooks + the write allowlist (for the in-sandbox proxy).
    __pageRecord: {
      complete: (t) => recordComplete(t),
      edit: stageEdit,
      commit: commitEdits,
      taskEdit: (task, fields) => {
        for (const [prop, value] of Object.entries(fields || {})) {
          stageTaskEdit(task, prop, value);
        }
        return commitTaskEdits(task);
      },
      opportunityEdit: (opportunity, fields) => {
        for (const [prop, value] of Object.entries(fields || {})) {
          stageOpportunityEdit(opportunity, prop, value);
        }
        return commitOpportunityEdits(opportunity);
      },
      // Browser replay: a recorded progress marker → fire the live callback
      // (and throw on a checkpoint if cancelled).
      progress: (entry) => emitProgress(entry && entry.op, entry || {}),
    },
    __approvedFields: Object.keys(APPROVED_CONTACT_FIELDS),
    __approvedTaskFields: APPROVED_TASK_FIELDS,
    __approvedOpportunityFields: APPROVED_OPPORTUNITY_FIELDS,
    // The RAW (serializable, method-free) page data for the sandbox realm.
    __pageData: page,
  };
  try {
    // The runner returns the program's final value (the closing-step summary).
    const result = await run(code, scope);
    await commitEdits(); // auto-commit any staged edits as one grouped step
    await commitAllTaskEdits();
    await commitAllOpportunityEdits();
    await waitForTaskOperations();
    return { ok: true, trace, calls, error: null, result: result == null ? null : result };
  } catch (error) {
    await commitEdits(); // flush whatever was staged before the error
    await commitAllTaskEdits();
    await commitAllOpportunityEdits();
    await waitForTaskOperations();
    // A thrown program error stops the trace where it happened — still useful.
    // A cancel sentinel is flagged so the caller shows "cancelled", not "failed".
    return { ok: false, trace, calls, error: String(error?.message || error), result: null, cancelled: isCancelledError(error) };
  }
}
