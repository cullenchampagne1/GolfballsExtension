/* ───────────────────────────────────────────────────────────────
   codeEngine/sandboxRunner — the browser runner for simulateProgram.

   MV3 bans `new Function` in the content-script world, so a simulated run
   can't compile the instrumented code there. The page-engine sandbox (an
   opaque-origin iframe) is the one context that CAN. But functions can't
   cross that realm boundary, so we can't hand the sandbox the content-side
   recorder. Instead:

     1) wrap the instrumented code so it runs against SANDBOX-LOCAL action and
        function-entry recorders and returns the raw ordered trace
        (`[{ id, contract, input } | { kind:"function", id, name }]`) —
        plain serializable data,
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
    // Rebuild the user binding (functions can\'t cross the realm) from the
    // serializable id-keyed maps. Mirror of userBinding.buildUserBinding.
    'const __u = (ctx && ctx.user) || {};',
    'const __find = (map, kind) => (q) => {',
    '  const m = map || {};',
    '  const f = m[q] || Object.keys(m).map((k) => m[k]).find((r) => r && (r.id === q || r.name === q));',
    '  if (!f) throw new Error("Missing dependency: no saved " + kind + " named \\u201c" + q + "\\u201d. Create a " + kind + " with that name (or fix the reference).");',
    '  return f;',
    '};',
    'const user = { emails: __u.emails || {}, tasks: __u.tasks || {}, calls: __u.calls || {},',
    '  email: __find(__u.emails || {}, "email"), task: __find(__u.tasks || {}, "task"), call: __find(__u.calls || {}, "call") };',
    // Mirror of runtime.makeOutbound / hydrateOutbound.
    'const __hydrateOut = (data) => {',
    '  const o = Object.assign({}, data || {});',
    '  o.append = function (t) { this.body = (this.body || "") + String(t == null ? "" : t); return this; };',
    '  o.appendSubject = function (t) { this.subject = (this.subject || "") + String(t == null ? "" : t); return this; };',
    '  return o;',
    '};',
    'const __mkOut = (ref) => {',
    '  const r = ref || {}; const v = (r.versions && r.versions[0]) || r;',
    '  const o = { kind: r.kind || "email", name: r.name || null, templateId: r.id || null, variationId: v.variationId || "__original", subject: v.subject || "", body: v.body || "" };',
    '  for (const k of ["vars","toField","replyMode","senderAccount","senderRandomize","priority","daysOut","categoryId","callDirection","callCategory","callVoicemail"]) {',
    '    if (v[k] !== undefined) o[k] = v[k]; else if (r[k] !== undefined) o[k] = r[k];',
    '  }',
    '  return __hydrateOut(o);',
    '};',
    'const __gbTrace = [];',
    'const __evaluated = (ctx && ctx.evaluated) || {};',
    'page.__eval = (id, ref) => {',
    '  const out = Object.prototype.hasOwnProperty.call(__evaluated, id) ? __hydrateOut(__evaluated[id]) : __mkOut(ref);',
    '  const plain = Object.assign({}, out); delete plain.append; delete plain.appendSubject;',
    '  __gbTrace.push({ kind: "evaluate", id: id, name: ref && ref.name, ref: ref || {}, outbound: plain });',
    '  return out;',
    '};',
    // Page control (mirror of simulate.js): grouped contact/task edits and
    // completion intents. Modal entry-point task arrays use the same proxy as
    // workflow page.tasks.open/done.
    'const __approved = (ctx && ctx.approvedFields) || [];',
    'const __approvedTask = (ctx && ctx.approvedTaskFields) || {};',
    'const __approvedOpportunity = (ctx && ctx.approvedOpportunityFields) || {};',
    'const __taskEdits = Object.create(null);',
    'const __taskById = Object.create(null);',
    'const __taskId = (task) => String((task && (task.id != null ? task.id : task.taskId)) || "").trim();',
    'const __commitTask = (task) => {',
    '  const id = __taskId(task); const fields = __taskEdits[id];',
    '  if (!id || !fields || !Object.keys(fields).length) return { ok: true, changed: [] };',
    '  delete __taskEdits[id];',
    '  __gbTrace.push({ kind: "task-edit", id, subject: (task && task.subject) || "", fields: Object.assign({}, fields) });',
    '  return { ok: true, dry: true, simulated: true };',
    '};',
    'const __commitAllTaskEdits = () => { for (const id of Object.keys(__taskEdits)) __commitTask(__taskById[id] || { id }); };',
    'const __wrapTask = (tk) => {',
    '  const target = Object.assign({}, tk || {}); const id = __taskId(target); if (id) __taskById[id] = target;',
    '  return new Proxy(target, {',
    '    set: (t, p, v) => {',
    '      const canonical = typeof p === "string" ? __approvedTask[p] : null;',
    '      if (!canonical) throw new Error("task." + String(p) + " is not an editable field. Editable: " + Object.keys(__approvedTask).join(", ") + ".");',
    '      const taskId = __taskId(t); if (!taskId) throw new Error("task editing requires a task id");',
    '      const fields = __taskEdits[taskId] || (__taskEdits[taskId] = {}); fields[canonical] = v;',
    '      t[canonical] = v; if (p !== canonical) t[p] = v; __taskById[taskId] = t; return true;',
    '    },',
    '    get: (t, p) => {',
    '      if (p === "commit") return () => __commitTask(t);',
    '      if (p === "complete") return () => { __commitTask(t); __gbTrace.push({ kind: "complete", id: t.id, subject: t.subject }); return { ok: true, dry: true }; };',
    '      const canonical = typeof p === "string" ? __approvedTask[p] : null;',
    '      if (canonical && !Object.prototype.hasOwnProperty.call(t, p)) return t[canonical];',
    '      return t[p];',
    '    },',
    '  });',
    '};',
    'const __opportunityEdits = Object.create(null);',
    'const __opportunityById = Object.create(null);',
    'const __opportunityId = (opportunity) => String((opportunity && (opportunity.id != null ? opportunity.id : opportunity.opportunityId)) || "").trim();',
    'const __commitOpportunity = (opportunity) => {',
    '  const id = __opportunityId(opportunity); const fields = __opportunityEdits[id];',
    '  if (!id || !fields || !Object.keys(fields).length) return { ok: true, changed: [] };',
    '  delete __opportunityEdits[id];',
    '  __gbTrace.push({ kind: "opportunity-edit", id, subject: (opportunity && opportunity.subject) || "", fields: Object.assign({}, fields) });',
    '  return { ok: true, dry: true, simulated: true };',
    '};',
    'const __commitAllOpportunityEdits = () => { for (const id of Object.keys(__opportunityEdits)) __commitOpportunity(__opportunityById[id] || { id }); };',
    'const __wrapOpportunity = (opportunity) => {',
    '  const target = Object.assign({}, opportunity || {}); const id = __opportunityId(target); if (id) __opportunityById[id] = target;',
    '  return new Proxy(target, {',
    '    set: (t, p, v) => {',
    '      const canonical = typeof p === "string" ? __approvedOpportunity[p] : null;',
    '      if (!canonical) throw new Error("opportunity." + String(p) + " is not an editable field. Editable: " + Object.keys(__approvedOpportunity).join(", ") + ".");',
    '      const opportunityId = __opportunityId(t); if (!opportunityId) throw new Error("opportunity editing requires an opportunity id");',
    '      const fields = __opportunityEdits[opportunityId] || (__opportunityEdits[opportunityId] = {}); fields[canonical] = v;',
    '      t[canonical] = v; if (p !== canonical) t[p] = v; __opportunityById[opportunityId] = t; return true;',
    '    },',
    '    get: (t, p) => {',
    '      if (p === "commit") return () => __commitOpportunity(t);',
    '      const canonical = typeof p === "string" ? __approvedOpportunity[p] : null;',
    '      if (canonical && !Object.prototype.hasOwnProperty.call(t, p)) return t[canonical];',
    '      return t[p];',
    '    },',
    '  });',
    '};',
    'const __rawTasks = page.tasks || {};',
    'const __openTasks = (__rawTasks.open || []).map(__wrapTask);',
    'const __doneTasks = (__rawTasks.done || []).map(__wrapTask);',
    'const __primaryEntryId = page.entryPoint && page.entryPoint.id;',
    'const __entrySource = Array.isArray(page.entryPoints) && page.entryPoints.length ? page.entryPoints : (page.entryPoint ? [page.entryPoint] : []);',
    'page.entryPoints = __entrySource.map((entry) => {',
    '  const data = entry && entry.data && typeof entry.data === "object" ? Object.assign({}, entry.data) : entry && entry.data;',
    '  if (data && Array.isArray(data.tasks)) data.tasks = data.tasks.map(__wrapTask);',
    '  return Object.assign({}, entry || {}, { data });',
    '});',
    'page.entryPoint = page.entryPoints.find((entry) => entry && entry.id === __primaryEntryId) || page.entryPoints[0] || null;',
    'const __entryTasks = page.entryPoint && page.entryPoint.data && Array.isArray(page.entryPoint.data.tasks) ? page.entryPoint.data.tasks : [];',
    'page.contact = new Proxy(Object.assign({}, page.contact || {}), {',
    '  set: (t, p, v) => { if (typeof p === "string" && __approved.indexOf(p) === -1) throw new Error("page.contact." + p + " is not an editable field. Editable: " + __approved.join(", ") + "."); __gbTrace.push({ kind: "edit", prop: p, value: v }); t[p] = v; return true; },',
    '  get: (t, p) => { if (p === "commit") return () => { __gbTrace.push({ kind: "commit" }); }; return t[p]; },',
    '});',
    'page.tasks = { open: __openTasks, done: __doneTasks, items: __entryTasks.length ? __entryTasks : __openTasks.concat(__doneTasks), completeAll: () => { __openTasks.forEach((t) => t.complete()); }, completeLatest: () => { let b = null; for (const t of __openTasks) { if (!b || String(t.dueDate || "") > String(b.dueDate || "")) b = t; } if (b) b.complete(); } };',
    'page.opportunities = (Array.isArray(page.opportunities) ? page.opportunities : []).map(__wrapOpportunity);',
    // Progress API (mirror of simulate.js progressApi). Records markers into
    // the trace; the content-side replay fires the live run-modal callback and
    // turns a checkpoint into a cancel point.
    'const progress = {',
    '  total: (n, label) => { __gbTrace.push({ kind: "progress", op: "total", total: Number(n) || 0, label: label == null ? undefined : String(label) }); },',
    '  section: (label) => { __gbTrace.push({ kind: "progress", op: "section", label: String(label == null ? "" : label) }); },',
    '  label: (label) => { __gbTrace.push({ kind: "progress", op: "section", label: String(label == null ? "" : label) }); },',
    '  step: (o) => { __gbTrace.push({ kind: "progress", op: "step", label: (o && typeof o === "object") ? String(o.label == null ? "" : o.label) : String(o == null ? "" : o), status: o && o.status, error: o && o.error }); },',
    '  log: (message, level) => { __gbTrace.push({ kind: "progress", op: "log", message: String(message == null ? "" : message), level: level ? String(level) : "info" }); },',
    '  checkpoint: async () => { __gbTrace.push({ kind: "progress", op: "checkpoint" }); },',
    '  cancelled: false,',
    '};',
    'const actions = {',
    '  __function(id, name) { __gbTrace.push({ kind: "function", id, name }); },',
    '  __trace(id, name, input) {',
    '  __gbTrace.push({ id, contract: name, input: input === undefined ? null : input });',
    '  const result = { ok: true, dry: true, simulated: true };',
    '  if (name === "createTask") result.taskId = "__gb_action_result__:" + String(id) + ":taskId";',
    '  if (name === "createOpportunity") result.opportunityId = "__gb_action_result__:" + String(id) + ":opportunityId";',
    '  return result;',
    '} };',
    'const __gbRet = await (async () => {',
    String(instrumentedCode ?? ''),
    '})();',
    '__commitAllTaskEdits();',
    '__commitAllOpportunityEdits();',
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
function serializable(value) {
  if (!value || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value, (_key, item) => (
    typeof item === 'function' ? undefined : item
  )));
}

export function makeSandboxRunner({ exec, doc, evaluateRef } = {}) {
  if (typeof exec !== 'function') throw new Error('makeSandboxRunner requires an exec(body, ctx, vars, doc) sandbox executor');
  return async function sandboxRun(code, scope) {
    const u = (scope && scope.user) || {};
    // Only the serializable id-keyed maps cross the realm; the sandbox rebuilds
    // the finders + outbound helpers. Use the RAW page data (not the node Proxy /
    // task methods, which can't be structured-cloned into the realm).
    const src = (scope && scope.__pageData) || (scope && scope.page) || {};
    // Carry the full parsed record model (orders, account, items, proofs,
    // activities, etc.) into the isolated realm. `serializable` strips the
    // content-side task/edit methods; buildTraceBody installs only the
    // approved write controls again inside the sandbox.
    const pageData = serializable(src) || {};
    const user = { emails: u.emails || {}, tasks: u.tasks || {}, calls: u.calls || {} };
    const record = scope && scope.actions && scope.actions.__trace;
    const recordFunction = scope && scope.actions && scope.actions.__function;
    const recordEval = scope && scope.page && scope.page.__eval;
    const pageRec = (scope && scope.__pageRecord) || {};
    const approvedFields = (scope && scope.__approvedFields) || [];
    const approvedTaskFields = (scope && scope.__approvedTaskFields) || {};
    const approvedOpportunityFields = (scope && scope.__approvedOpportunityFields) || {};
    const evaluated = {};
    const runOnce = () => exec(
      buildTraceBody(code),
      {
        page: pageData,
        user,
        approvedFields,
        approvedTaskFields,
        approvedOpportunityFields,
        evaluated,
      },
      {},
      doc,
    );
    let raw = await runOnce();

    // The sandbox cannot call privileged/content-side resolvers directly.
    // Discover page.evaluate references in a side-effect-free pass, resolve
    // them against this contact, then rerun with those outbound values. Repeat
    // briefly in case rendered content changes a later branch.
    if (typeof evaluateRef === 'function') {
      for (let round = 0; round < 3; round += 1) {
        const discovered = Array.isArray(raw) ? raw : (raw && raw.__gbTrace) || [];
        const missing = discovered.filter(
          (entry) => entry?.kind === 'evaluate'
            && !Object.hasOwn(evaluated, entry.id),
        );
        if (!missing.length) break;
        await Promise.all(missing.map(async (entry) => {
          evaluated[entry.id] = serializable(await evaluateRef(entry.ref || {}));
        }));
        raw = await runOnce();
      }
    }

    const entries = Array.isArray(raw) ? raw : (raw && raw.__gbTrace) || [];
    for (const e of entries) {
      if (!e) continue;
      // Awaited so a live run's real writes complete in order.
      if (e.kind === 'function') {
        if (typeof recordFunction === 'function') recordFunction(e.id, e.name);
      }
      else if (e.kind === 'evaluate') {
        if (typeof recordEval === 'function') {
          await recordEval(e.id, e.ref || { name: e.name }, e.outbound);
        }
      }
      else if (e.kind === 'complete') { if (pageRec.complete) await pageRec.complete({ id: e.id, subject: e.subject }); }
      else if (e.kind === 'edit') { if (pageRec.edit) pageRec.edit(e.prop, e.value); }
      else if (e.kind === 'commit') { if (pageRec.commit) await pageRec.commit(); }
      else if (e.kind === 'task-edit') {
        if (pageRec.taskEdit) {
          await pageRec.taskEdit({ id: e.id, subject: e.subject }, e.fields || {});
        }
      }
      else if (e.kind === 'opportunity-edit') {
        if (pageRec.opportunityEdit) {
          await pageRec.opportunityEdit({ id: e.id, subject: e.subject }, e.fields || {});
        }
      }
      else if (e.kind === 'progress') { if (pageRec.progress) await pageRec.progress(e); }
      else if (typeof record === 'function') await record(e.id, e.contract, e.input);
    }
    if (pageRec.commit) await pageRec.commit(); // auto-commit any staged edits
    // Surface the program's final return value (the closing "step" summary).
    return Array.isArray(raw) ? undefined : (raw && raw.__gbRet);
  };
}
