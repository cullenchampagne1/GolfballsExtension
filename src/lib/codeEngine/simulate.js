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
import { makeOutbound } from './runtime.js';

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
const EFFECT_CONTRACTS = new Set(['sendEmail', 'createTask', 'logCall', 'completeTask']);

/**
 * Run a program. Records a dry trace by default; if `executor` is provided it
 * ALSO performs the real writes content-side (a live run) — the trace still
 * reflects each step for the run view. `executor.run(contract, input)` and
 * `executor.commitEdits(fields)` do the actual sends/edits.
 */
export async function simulateProgram(source, page = {}, { run = asyncFunctionRunner, user = {}, executor = null } = {}) {
  const { code, calls } = instrument(source);
  const trace = [];

  const record = async (id, name, input) => {
    const check = validateContractInput(name, input);
    const entry = {
      id,
      contract: name,
      status: check.ok ? 'ran' : 'failed',
      summary: describeContract(name, input),
      errors: check.errors,
    };
    trace.push(entry);
    // Live run: perform the real write; surface a failure on the entry.
    if (executor && check.ok && EFFECT_CONTRACTS.has(name)) {
      try { await executor.run(name, check.value || input); }
      catch (e) { entry.status = 'failed'; entry.errors = [String(e?.message || e)]; }
    }
    // Return a shape a program can keep using (e.g. read a would-be result).
    return { ok: check.ok, dry: !executor, simulated: !executor };
  };

  // page.evaluate(ref) → its own "Evaluate" step; returns the outbound object.
  const recordEval = (id, ref) => {
    const r = ref || {};
    trace.push({ id, contract: 'evaluate', kind: 'evaluate', status: 'ran', summary: `Evaluate ${r.name || (r.kind || 'template')}`, errors: [] });
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
    if (executor) {
      try { await executor.commitEdits(fields); }
      catch (e) { const last = trace[trace.length - 1]; if (last) { last.status = 'failed'; last.errors = [String(e?.message || e)]; } }
    }
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
