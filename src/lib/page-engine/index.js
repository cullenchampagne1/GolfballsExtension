/* ───────────────────────────────────────────────────────────────
   page-engine/index.js — public surface + one-shot runner with
   per-document caching.

   The engine is the new resolution layer:
     1. Detect which page schema matches the doc (via the registry)
     2. Run extract() against that schema → typed JSON ("context")
     3. Templates reference the context by path (`{{contact.first}}`)
        or run a code-var body against it.

   Caching
   ───────
   On a given Document, extract() is deterministic. The result is
   cached on the doc via a WeakMap so multiple variables in the
   same template don't each re-run extraction.

   The cache is invalidated on:
     • the document being garbage-collected (WeakMap semantics)
     • an explicit clearCache(doc) call (after a DOM mutation that
       changed schema-touched regions)

   EmailRunner's bulk path parses a fresh Document per contact via
   DOMParser — each parsed doc is a different WeakMap key, so no
   stale data crosses contacts.
─────────────────────────────────────────────────────────────── */

import { extract } from './extract.js';
import { resolve, listPaths, toDisplayString, existsAt, tokenizePath } from './resolve.js';
import { runCode, runCodeSync, compile, compileAsync, describeHelpers } from './code-runtime.js';
import { runInSandbox } from './sandbox-bridge.js';
import { detectSchema } from '../page-schemas/registry.js';
import { runEngine, clearCache } from './runner.js';
import { inspectPageOwner, ownerInfoFromResult } from './owner.js';
import {
  getEngineIndexConfig,
  queryEngineIndex,
  getEngineIndexStats,
  clearEngineIndex,
} from './index-client.js';

/** Convenience: detect → extract → resolve a single path. Returns
 *  the value (raw, not stringified) or defaultV. Caller decides
 *  whether to stringify for template substitution. */
export function resolvePath(doc, path, defaultV = '') {
  const ctx = runEngine(doc);
  if (!ctx) return defaultV;
  return resolve(ctx.data, path, defaultV);
}

/** Convenience: run a code var against the engine's extracted
 *  context. The body is the rep's expression/statement block. `vars`
 *  is the map of variables resolved before this one (by varOrder) so
 *  a code var can build on earlier results. Async path — supports
 *  `await h.fetchJson(...)`. */
export async function evaluateCode(doc, body, vars = {}) {
  const ctx = runEngine(doc);
  /* MV3 blocks `new Function` in the content-script world, so the body is
     compiled + run in a sandboxed iframe (sandbox-bridge.js). Privileged
     approved helpers it calls (h.fetch* / h.catalog.* / h.domText) are
     serviced back here against this doc. runCode (direct new Function) is
     kept only for non-MV3 / test contexts. */
  return runInSandbox(body, ctx?.data || {}, vars, doc);
}

/** Sync variant — bypasses the timeout. Only safe for synchronous
 *  bodies (the common case). Throws on compile + runtime errors. */
export function evaluateCodeSync(doc, body, vars = {}) {
  const ctx = runEngine(doc);
  return runCodeSync(body, ctx?.data || {}, vars, { doc });
}

/* Re-exports — single import surface for everything the resolver
   and editor UI need. */
export {
  extract,
  runEngine,
  clearCache,
  inspectPageOwner,
  ownerInfoFromResult,
  resolve,
  listPaths,
  toDisplayString,
  existsAt,
  tokenizePath,
  runCode,
  runCodeSync,
  compile,
  compileAsync,
  describeHelpers,
  detectSchema,
  getEngineIndexConfig,
  queryEngineIndex,
  getEngineIndexStats,
  clearEngineIndex,
};
