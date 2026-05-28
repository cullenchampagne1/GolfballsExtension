/* ───────────────────────────────────────────────────────────────
   page-schemas/registry.js — schema catalog + detection.

   Each schema declares a `detect` block:
     • url     RegExp matched against location.href (or the doc's
               original URL when called from EmailRunner)
     • dom     CSS selector that must resolve on the doc — used as
               either a fallback when url is silent, or a confirmer
               when url alone matches multiple candidates

   detectSchema(doc) walks the list in order and returns the FIRST
   match. Add new schemas by importing them here and pushing onto
   the registry. Order matters when two schemas could share a URL
   pattern; more-specific schemas should come first.
─────────────────────────────────────────────────────────────── */

import { contactSchema } from './contact.js';

/** All registered schemas, in detection priority order. Specific
 *  → general so a Page=240 with #tbContactId matches contact even
 *  if some future "generic CRM" schema also wants Page=240. */
const SCHEMAS = [
  contactSchema,
];

/** Match a doc's URL against a schema's detect.url. We accept three
 *  inputs:
 *    1. document.location.href (live tab)
 *    2. doc.URL                (parsed via DOMParser — empty in some
 *                               browsers; falls through to dom)
 *    3. document.body.dataset.gbSourceUrl (an explicit hint that
 *       EmailRunner's fetched-doc path sets on the parsed doc) */
function getDocUrl(doc) {
  try {
    if (doc?.body?.dataset?.gbSourceUrl) return doc.body.dataset.gbSourceUrl;
  } catch {}
  try {
    if (doc?.URL && doc.URL !== 'about:blank') return doc.URL;
  } catch {}
  try {
    if (typeof window !== 'undefined' && window.location) return window.location.href;
  } catch {}
  return '';
}

/** Detect the schema for a document. Returns the schema object or
 *  null if nothing matches. Pure: doesn't extract, doesn't mutate. */
export function detectSchema(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null;
  const url = getDocUrl(doc);
  for (const schema of SCHEMAS) {
    const d = schema.detect;
    if (!d) continue;
    const urlOk = d.url ? (typeof d.url === 'string' ? d.url === url : d.url.test(url)) : true;
    const domOk = d.dom ? !!safeQuery(doc, d.dom) : true;
    /* `mode` decides how the two predicates combine:
       'all' (default): both must pass — strictest.
       'any':           either passes — useful for pages whose URL
                        changes between environments but DOM is stable. */
    const mode = d.mode || 'all';
    const pass = mode === 'any' ? (urlOk || domOk) : (urlOk && domOk);
    if (pass) return schema;
  }
  return null;
}

function safeQuery(doc, sel) {
  try { return doc.querySelector(sel); }
  catch { return null; }
}

/** Get a schema by id (for the editor UI when the user is editing
 *  a template against a specific page type before having that page
 *  loaded). Returns null if the id isn't registered. */
export function getSchemaById(id) {
  return SCHEMAS.find((s) => s.id === id) || null;
}

/** Enumerate registered schemas for the template-type picker. */
export function listSchemas() {
  return SCHEMAS.map((s) => ({ id: s.id, label: s.label || s.id }));
}
