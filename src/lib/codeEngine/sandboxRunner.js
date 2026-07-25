/* ───────────────────────────────────────────────────────────────
   codeEngine/sandboxRunner — the browser runner for simulateProgram.

   MV3 bans `new Function` in the content-script world, so a simulated run
   can't compile the instrumented code there. The page-engine sandbox (an
   opaque-origin iframe) is the one context that CAN. But functions can't
   cross that realm boundary, so we can't hand the sandbox the content-side
   recorder. Instead:

     1) wrap the instrumented code so it runs against a SANDBOX-LOCAL
        `actions.__trace` recorder and returns the raw ordered trace
        (`[{ id, contract, input }]`) — plain serializable data,
     2) run that body in the sandbox via runInSandbox (real control flow,
        real branching over `page`, zero real effects — the recorder only
        records),
     3) REPLAY each raw entry through simulateProgram's injected recorder
        content-side, where the contract registry lives, so validation and
        the human summary happen exactly as they do in the Node runner.

   This keeps simulate.js pure and identical across Node and the browser:
   the only difference is the injected `run`. `makeSandboxRunner` takes the
   sandbox executor as `exec` (the content-side component passes the real
   page-engine `runInSandbox`; tests pass a fake) so this module has no
   browser dependency and the wrap+replay path is unit-testable directly.
─────────────────────────────────────────────────────────────── */

/**
 * Wrap instrumented code into a sandbox body that records each traced call
 * locally and returns the ordered raw trace. The sandbox exposes the page
 * model as `ctx`; we bind it to `page` (the name programs and instrument.js
 * use) and isolate the user code in an async IIFE so its top-level
 * declarations can't collide with the injected names.
 *
 * The body ends in `return`, so the sandbox's wrapBody leaves it verbatim.
 */
export function buildTraceBody(instrumentedCode) {
  return [
    'const page = (ctx && ctx.page) || {};',
    // Rebuild the user binding (functions can\'t cross the realm) from raw data.
    'const __u = (ctx && ctx.user) || {};',
    'const __find = (list) => (q) => (list || []).find((t) => t && (t.id === q || t.name === q)) || null;',
    'const user = { emails: __u.emails || [], tasks: __u.tasks || [], calls: __u.calls || [],',
    '  email: __find(__u.emails || []), task: __find(__u.tasks || []), call: __find(__u.calls || []) };',
    'const __gbTrace = [];',
    'const actions = { __trace(id, name, input) {',
    '  __gbTrace.push({ id, contract: name, input: input === undefined ? null : input });',
    '  return { ok: true, dry: true, simulated: true };',
    '} };',
    'const __gbRet = await (async () => {',
    String(instrumentedCode ?? ''),
    '})();',
    'return { __gbTrace, __gbRet };',
  ].join('\n');
}

/**
 * Build a runner compatible with simulateProgram's `run(code, scope)` hook.
 *
 * @param {object} opts
 * @param {(body, ctx, vars, doc) => Promise<*>} opts.exec  sandbox executor —
 *   the content-side component passes the page-engine `runInSandbox`; returns
 *   the body's value (here, the raw trace). Required.
 * @param {Document} opts.doc  document the sandbox's read-only helpers read.
 * @returns {(code, scope) => Promise<void>}  runs the code, then replays each
 *   recorded call through `scope.actions.__trace` (the content-side recorder).
 */
export function makeSandboxRunner({ exec, doc } = {}) {
  if (typeof exec !== 'function') throw new Error('makeSandboxRunner requires an exec(body, ctx, vars, doc) sandbox executor');
  return async function sandboxRun(code, scope) {
    const page = (scope && scope.page) || {};
    const u = (scope && scope.user) || {};
    // Only the serializable arrays cross the realm; the sandbox rebuilds the finders.
    const user = { emails: u.emails || [], tasks: u.tasks || [], calls: u.calls || [] };
    const record = scope && scope.actions && scope.actions.__trace;
    const raw = await exec(buildTraceBody(code), { page, user }, {}, doc);
    const entries = Array.isArray(raw) ? raw : (raw && raw.__gbTrace) || [];
    if (typeof record === 'function') {
      for (const entry of entries) record(entry.id, entry.contract, entry.input);
    }
    // Surface the program's final return value (the closing "step" summary).
    return Array.isArray(raw) ? undefined : (raw && raw.__gbRet);
  };
}
