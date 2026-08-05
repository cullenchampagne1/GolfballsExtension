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
  inspectPageTerritory,
  resolvePath,
  evaluateCode,
  evaluateCodeData,
  extract,
  resolve,
  listPaths,
  toDisplayString,
  existsAt,
  tokenizePath,
  describeHelpers,
  detectSchema,
  getEngineIndexConfig,
  queryEngineIndex,
  getEngineIndexStats,
  clearEngineIndex,
} from '../lib/page-engine/index.js';

import { contactSchema, accountSchema, opportunitySchema } from '../lib/page-schemas/contact.js';
import { orderSchema } from '../lib/page-schemas/order.js';
import { listSchemas, getSchemaById } from '../lib/page-schemas/registry.js';
import { evalTree, treeUsesVars, varsReferenced, isGroupedTree, applyOp, arrayQuantifier } from '../lib/matchEngine.js';
import { getPageContext, detectPageType } from '../lib/pageContext.js';
import { PAGE_TYPE } from '../lib/constants.js';

/* Single namespace so we can grow the API without sprawling
   globals. Frozen so accidental writes from other content scripts
   don't clobber the engine. */
const api = Object.freeze({
  /* Hot path — call this once with a Document, then resolve()
     paths against the returned { data }. The engine caches the
     extracted JSON per-doc so repeat calls are free. */
  runEngine,
  clearCache,
  inspectTerritory: inspectPageTerritory,
  resolvePath,
  evaluateCode,
  evaluateCodeData,

  /* "Which page am I on + what's on it" — the single page-type
     detector (superset of the old shelf/smart-detection copies) plus
     the engine-extracted data, and the frozen PAGE_TYPE enum. Exposed
     here so the vanilla content scripts share one source of truth. */
  getPageContext,
  detectPageType,
  PAGE_TYPE,

  /* Lower-level — exposed for the editor UI's picker + the
     debug panel. */
  extract,
  resolve,
  listPaths,
  toDisplayString,
  existsAt,
  tokenizePath,
  describeHelpers,
  detectSchema,
  listSchemas,
  getSchemaById,

  /* Durable, territory-gated local cache. Writes happen automatically on
     extraction; these are the internal query/maintenance boundaries for
     future features. */
  engineIndex: Object.freeze({
    query: queryEngineIndex,
    stats: getEngineIndexStats,
    clear: clearEngineIndex,
  }),

  /* Grouped AND/OR rule matching (matchEngine). evalTree(tree,
     getValue) evaluates a rule tree against a caller-supplied value
     resolver; the rest let the matcher split var-free vs var-driven
     conditions and detect grouped (vs legacy flat) rules. */
  evalTree,
  treeUsesVars,
  varsReferenced,
  isGroupedTree,
  applyOp,
  arrayQuantifier,

  /* Direct schema access for the picker UI (so it can show the
     full field tree even before a real page is loaded). */
  schemas: Object.freeze({
    contact: contactSchema,
    account: accountSchema,
    opportunity: opportunitySchema,
    order: orderSchema,
  }),
});

if (typeof window !== 'undefined') {
  // Allow re-bundling without a hard reload — replace on hot
  // reload but only when the API surface has actually changed.
  window.__gbPageEngine = api;

  /* Live CRM pages enter the same extraction/index path as parsed background
     documents. Wait for the page load event so server-rendered portlets and
     their dependent resources have settled before the engine memoizes them.
     With indexing disabled (the default), this adds no extraction work. */
  const indexLoadedPage = () => {
    getEngineIndexConfig()
      .then((config) => {
        if (config.enabled && config.territory
            && ['account', 'contact'].includes(detectSchema(document)?.id)) {
          clearCache(document);
          runEngine(document);
        }
      })
      .catch(() => {});
  };
  if (document.readyState === 'complete') queueMicrotask(indexLoadedPage);
  else window.addEventListener('load', indexLoadedPage, { once: true });
}
