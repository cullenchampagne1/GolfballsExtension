/* ───────────────────────────────────────────────────────────────
   page-engine.entry.js — IIFE bundle entry that exposes the page
   engine on `window.__gbPageEngine` so the legacy vanilla content
   scripts (notably src/vanilla/variable-resolution.js) can reach
   it without becoming ES modules.

   build.js produces react-dist/vanilla/page-engine.js from this
   file; the manifest loads that bundle BEFORE variable-
   resolution.js so the global is in place by the time templates
   resolve.

   Nothing here is engine logic — it's just the bridge.
─────────────────────────────────────────────────────────────── */

import {
  runEngine,
  clearCache,
  resolvePath,
  evaluateCode,
  evaluateCodeSync,
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
} from '../lib/page-engine/index.js';

import { contactSchema, accountSchema } from '../lib/page-schemas/contact.js';
import { listSchemas, getSchemaById } from '../lib/page-schemas/registry.js';

/* Single namespace so we can grow the API without sprawling
   globals. Frozen so accidental writes from other content scripts
   don't clobber the engine. */
const api = Object.freeze({
  /* Hot path — call this once with a Document, then resolve()
     paths against the returned { data }. The engine caches the
     extracted JSON per-doc so repeat calls are free. */
  runEngine,
  clearCache,
  resolvePath,
  evaluateCode,
  evaluateCodeSync,

  /* Lower-level — exposed for the editor UI's picker + the
     debug panel. */
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
  listSchemas,
  getSchemaById,

  /* Direct schema access for the picker UI (so it can show the
     full field tree even before a real page is loaded). */
  schemas: Object.freeze({
    contact: contactSchema,
    account: accountSchema,
  }),
});

if (typeof window !== 'undefined') {
  // Allow re-bundling without a hard reload — replace on hot
  // reload but only when the API surface has actually changed.
  window.__gbPageEngine = api;
}
