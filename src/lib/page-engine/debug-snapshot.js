import { getPageContext } from '../pageContext.js';
import { getSchemaById } from '../page-schemas/registry.js';
import { clearCache, runEngine } from './runner.js';
import { existsAt, listPaths, resolve } from './resolve.js';

function pathKey(basePath, key) {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
    return basePath ? `${basePath}.${key}` : key;
  }
  return `${basePath}[${JSON.stringify(key)}]`;
}

function inferredType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function pageEngineDebugPreview(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'object') return `Object(${Object.keys(value).length})`;
  if (typeof value === 'string') {
    if (!value) return '(empty string)';
    return value.replace(/\s+/g, ' ').trim();
  }
  return String(value);
}

function flattenExtractedData(value, basePath = '', output = []) {
  if (basePath) output.push({ path: basePath, value, type: inferredType(value) });
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenExtractedData(item, `${basePath}[${index}]`, output));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flattenExtractedData(child, pathKey(basePath, key), output);
    }
  }
  return output;
}

function debugVariable(entry, data) {
  const value = resolve(data, entry.path, undefined);
  return {
    path: entry.path,
    label: entry.label || entry.path,
    type: entry.type || inferredType(value),
    present: existsAt(data, entry.path),
    preview: pageEngineDebugPreview(value),
    value: value === undefined ? null : value,
  };
}

/**
 * Return every schema path plus every concrete path present in an extraction.
 * The second pass is important for arrays: it exposes all live item indexes,
 * rather than only the schema picker's representative `[0]` path.
 */
export function enumeratePageEngineDebugVariables(schema, data = {}) {
  const output = [];
  const seen = new Set();
  for (const entry of listPaths(schema, data)) {
    if (!entry.path || seen.has(entry.path)) continue;
    seen.add(entry.path);
    output.push(debugVariable(entry, data));
  }
  for (const entry of flattenExtractedData(data)) {
    if (!entry.path || seen.has(entry.path)) continue;
    seen.add(entry.path);
    output.push(debugVariable({ ...entry, label: entry.path }, data));
  }
  return output;
}

function documentUrl(doc) {
  const sourceUrl = String(doc?.body?.dataset?.gbSourceUrl || '').trim();
  if (sourceUrl) return sourceUrl;
  const locationUrl = String(doc?.location?.href || '').trim();
  if (locationUrl && locationUrl !== 'about:blank') return locationUrl;
  return String(doc?.URL || '').trim();
}

/** Build a fresh, serializable view of everything the Page Engine sees. */
export function buildPageEngineDebugSnapshot(doc, { now = () => Date.now() } = {}) {
  clearCache(doc);
  /* Seed the document cache with a fresh, read-only result first. The context
     call below then reuses it and cannot enqueue an index write. */
  const result = runEngine(doc, { skipIndex: true });
  const context = getPageContext(doc);
  const schema = result ? getSchemaById(result.schemaId) : null;
  const data = result?.data || context.data || null;
  return {
    inspectedAt: now(),
    supported: Boolean(result && schema),
    page: {
      title: String(doc?.title || '').trim(),
      url: documentUrl(doc),
      pageType: context.pageType || 'unknown',
      schemaId: result?.schemaId || context.schemaId || null,
    },
    ids: context.ids || { order: null, contact: null, account: null, item: null },
    data,
    variables: result && schema ? enumeratePageEngineDebugVariables(schema, result.data) : [],
    errors: Array.isArray(result?.errors) ? result.errors : [],
    warnings: Array.isArray(result?.warnings) ? result.warnings : [],
  };
}
