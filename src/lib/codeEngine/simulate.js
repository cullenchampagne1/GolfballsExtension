/* ───────────────────────────────────────────────────────────────
   codeEngine/simulate — run a program with NO side effects, produce a
   block-keyed trace for the run animation.

   Instruments the source, injects a recording `actions.__trace` that
   validates each call against its contract but never executes it, and
   runs the code through an INJECTED runner:
     • browser  → the page-engine sandbox (runInSandbox), CSP-safe
     • node/test → AsyncFunction (same shape the sandbox uses)

   The result is the ordered `{ id, contract, status }` trace the existing
   campaign run/sim animation consumes — the whole point of Phase 1's
   "write code → watch the blocks light up" with zero real effects.

   The runner is injected so this module stays pure and unit-testable; a
   real (gated) run swaps the recording __trace for the contract executor.
─────────────────────────────────────────────────────────────── */

import { instrument } from './instrument.js';
import { validateContractInput, describeContract, APPROVED_CONTACT_FIELDS } from './contracts.js';
import { buildUserBinding } from './userBinding.js';
import { hydrateOutbound, makeOutbound } from './runtime.js';

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
 *   trace — ordered `{ id, contract, status:'ran'|'failed', summary, errors }`
 *           where a `failed` entry is a contract-validation failure (bad/missing
 *           params), surfaced as a preflight without ever sending anything.
 */
/* Contracts that perform a real effect (routed to the executor on a live run). */
const EFFECT_CONTRACTS = new Set([
  'sendEmail', 'createTask', 'logCall', 'addNote', 'completeTask', 'editContact',
]);
const ACTION_RESULT_PREFIX = '__gb_action_result__:';

/** Serializable pointer returned inside the sandbox before live replay. */
export function actionResultRef(actionId, field) {
  return `${ACTION_RESULT_PREFIX}${String(actionId)}:${String(field)}`;
}

function resolveActionResults(value, results, preserveMissing) {
  if (typeof value === 'string' && value.startsWith(ACTION_RESULT_PREFIX)) {
    const rest = value.slice(ACTION_RESULT_PREFIX.length);
    const splitAt = rest.lastIndexOf(':');
    if (splitAt > 0) {
      const actionId = rest.slice(0, splitAt);
      const field = rest.slice(splitAt + 1);
      const result = results.get(actionId);
      if (result && Object.hasOwn(result, field)) return result[field];
    }
    return preserveMissing ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveActionResults(item, results, preserveMissing));
  }
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
    evaluateRef = null,
  } = {},
) {
  const { code, calls } = instrument(source);
  const trace = [];
  const actionResults = new Map();

  const record = async (id, name, input) => {
    const resolvedInput = resolveActionResults(input, actionResults, !executor);
    const check = validateContractInput(name, resolvedInput);
    const entry = {
      id,
      contract: name,
      status: check.ok ? 'ran' : 'failed',
      summary: describeContract(name, resolvedInput),
      errors: check.errors,
    };
    trace.push(entry);

    const isEffect = EFFECT_CONTRACTS.has(name);
    let result = { ok: check.ok, dry: !executor, simulated: !executor };

    if (check.ok && isEffect && typeof beforeEffect === 'function') {
      const decision = await beforeEffect({
        id, name, input: check.value || resolvedInput, entry,
      });
      if (decision === false || decision?.allow === false) {
        entry.status = 'skipped';
        entry.reason = decision?.reason || 'Skipped by campaign policy';
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

    // A sandbox executes before effects replay. Give createTask a serializable
    // future result so later code can complete that exact task in trace order.
    if (!executor && check.ok && name === 'createTask') {
      result.taskId = actionResultRef(id, 'taskId');
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

  // ── Page control: complete tasks + grouped contact edits (records only) ──
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

  // Node-path `page` — the Proxy set-trap captures `page.contact.x = y`; each
  // task carries a `.complete()`. (The sandbox mirrors this inline.)
  const nodePage = { ...page, __eval: recordEval };
  nodePage.contact = new Proxy({ ...(page.contact || {}) }, {
    set(t, p, v) { stageEdit(p, v); t[p] = v; return true; },
    get(t, p) { if (p === 'commit') return () => commitEdits(); return t[p]; },
  });
  const openTasks = ((page.tasks && page.tasks.open) || []).map((tk) => ({ ...tk, complete: () => recordComplete(tk) }));
  nodePage.tasks = {
    open: openTasks,
    done: (page.tasks && page.tasks.done) || [],
    completeAll: () => { openTasks.forEach((t) => t.complete()); },
    completeLatest: () => { const t = latestOpen(openTasks); if (t) t.complete(); },
  };

  const scope = {
    actions: { __trace: record },
    page: nodePage,
    user: buildUserBinding(user),
    // Sandbox replay hooks + the write allowlist (for the in-sandbox proxy).
    __pageRecord: { complete: (t) => recordComplete(t), edit: stageEdit, commit: commitEdits },
    __approvedFields: Object.keys(APPROVED_CONTACT_FIELDS),
    // The RAW (serializable, method-free) page data for the sandbox realm.
    __pageData: page,
  };
  try {
    // The runner returns the program's final value (the closing-step summary).
    const result = await run(code, scope);
    await commitEdits(); // auto-commit any staged edits as one grouped step
    return { ok: true, trace, calls, error: null, result: result == null ? null : result };
  } catch (error) {
    await commitEdits(); // flush whatever was staged before the error
    // A thrown program error stops the trace where it happened — still useful.
    return { ok: false, trace, calls, error: String(error?.message || error), result: null };
  }
}
