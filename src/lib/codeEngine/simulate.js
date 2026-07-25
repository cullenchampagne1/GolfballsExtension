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
import { validateContractInput, describeContract } from './contracts.js';
import { buildUserBinding } from './userBinding.js';

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
export async function simulateProgram(source, page = {}, { run = asyncFunctionRunner, user = {} } = {}) {
  const { code, calls } = instrument(source);
  const trace = [];

  const record = (id, name, input) => {
    const check = validateContractInput(name, input);
    trace.push({
      id,
      contract: name,
      status: check.ok ? 'ran' : 'failed',
      summary: describeContract(name, input),
      errors: check.errors,
    });
    // Return a shape a program can keep using (e.g. read a would-be result).
    return { ok: check.ok, dry: true, simulated: true };
  };

  const scope = { actions: { __trace: record }, page, user: buildUserBinding(user) };
  try {
    await run(code, scope);
    return { ok: true, trace, calls, error: null };
  } catch (error) {
    // A thrown program error stops the trace where it happened — still useful.
    return { ok: false, trace, calls, error: String(error?.message || error) };
  }
}
