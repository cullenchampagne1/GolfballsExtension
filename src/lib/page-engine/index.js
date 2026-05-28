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
import { runCode, runCodeSync, compile, describeHelpers } from './code-runtime.js';
import { detectSchema } from '../page-schemas/registry.js';

/** Per-doc memoization. Key: Document. Value:
 *      { schemaId, data, errors, warnings }   (or null if no
 *      schema matched). */
const docCache = new WeakMap();

/** Detect + extract + cache. Returns the same object on repeated
 *  calls for the same Document. `null` returned when no schema
 *  matches — callers should fall back to legacy resolution. */
export function runEngine(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null;
  if (docCache.has(doc)) return docCache.get(doc);
  const schema = detectSchema(doc);
  if (!schema) {
    docCache.set(doc, null);
    return null;
  }
  const result = extract(schema, doc);
  docCache.set(doc, result);
  return result;
}

/** Re-extract on demand — clears the doc's cached result so the
 *  next runEngine() rebuilds it. Use after a DOM mutation that
 *  changed schema-touched data. */
export function clearCache(doc) {
  if (doc) docCache.delete(doc);
}

/** Convenience: detect → extract → resolve a single path. Returns
 *  the value (raw, not stringified) or defaultV. Caller decides
 *  whether to stringify for template substitution. */
export function resolvePath(doc, path, defaultV = '') {
  const ctx = runEngine(doc);
  if (!ctx) return defaultV;
  return resolve(ctx.data, path, defaultV);
}

/** Convenience: run a code var against the engine's extracted
 *  context. The body is the rep's expression/statement block. */
export async function evaluateCode(doc, body) {
  const ctx = runEngine(doc);
  return runCode(body, ctx?.data || {});
}

/** Sync variant — bypasses the timeout. Only safe for synchronous
 *  bodies (the common case). Throws on compile + runtime errors. */
export function evaluateCodeSync(doc, body) {
  const ctx = runEngine(doc);
  return runCodeSync(body, ctx?.data || {});
}

/* Re-exports — single import surface for everything the resolver
   and editor UI need. */
export {
  extract,
  resolve,
  listPaths,
  toDisplayString,
  existsAt,
  tokenizePath,
  runCode,
  runCodeSync,
  compile,
  describeHelpers,
  detectSchema,
};
