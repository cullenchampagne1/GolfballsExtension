/* Focused detect → extract → cache lifecycle shared by the full Page Engine
   facade and lightweight live/background indexing callers. Keeping this layer
   free of code-variable/catalog dependencies also makes the indexing lifecycle
   independently testable. */
import { extract } from './extract.js';
import { detectSchema } from '../page-schemas/registry.js';
import { queueEngineSnapshot } from './index-client.js';

/** Per-doc memoization. Key: Document. Value:
 * `{ schemaId, data, errors, warnings }`, or null when no schema matches. */
const docCache = new WeakMap();

export function runEngine(doc, options = {}) {
  if (!doc || typeof doc.querySelector !== 'function') return null;
  if (docCache.has(doc)) return docCache.get(doc);
  const schema = detectSchema(doc);
  if (!schema) {
    docCache.set(doc, null);
    return null;
  }
  const result = extract(schema, doc);
  docCache.set(doc, result);
  /* Diagnostics need a fresh canonical extraction without turning a read into
     a write every time their live preview refreshes. Normal callers retain the
     automatic indexing behavior; only an explicit internal opt-out skips it. */
  if (options.skipIndex !== true) {
    queueEngineSnapshot(result, { doc, sourceUrl: options.sourceUrl }).catch(() => {});
  }
  return result;
}

export function clearCache(doc) {
  if (doc) docCache.delete(doc);
}
