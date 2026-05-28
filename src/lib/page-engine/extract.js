/* ───────────────────────────────────────────────────────────────
   page-engine/extract.js — schema-driven DOM → JSON.

   Walks a schema tree against a Document (live or parsed from
   fetched HTML) and produces a typed JSON object matching the
   schema's `fields` shape. Output is paired with `errors` and
   `warnings` so the editor + send-time toast can surface what
   resolved and what didn't.

   The schema is the contract; this file is the dumb interpreter.
   No page-specific logic lives here — adding a new page just means
   writing a new schema file and dropping it in the registry.

   Field kinds (from schema):
     • leaf (type: string|number|currency|date|bool)
         extract: { sel, attr?, transform? } | { regex, source?, group? }
                | { fn, args? } | { const: value }
     • object (type: 'object', fields: { ... })
         recurses into the nested schema
     • array  (type: 'array', extract: { sel, kind: 'rows' }
                              | { fn, args, kind: 'rows' },
                              itemFields: { ... })
         each row → object built from itemFields with the row el
         passed in as the cell scope.

   Empty / missing values are NORMALIZED:
     • leaf string  → ''
     • leaf number  → null
     • leaf date    → null
     • object       → still emitted (so paths like contact.firstName
                      always have a parent — undefined-vs-empty
                      ambiguity bites users in code variables)
     • array        → []  (never null — so .length / .map work)
─────────────────────────────────────────────────────────────── */

import { applyTransform, coerceType } from './transforms.js';
import { getFn, readAttr, readCell, queryRows } from './helpers.js';

/** Sanitize a CSS selector. Returns null if the selector is empty
 *  or trivially malformed (mismatched brackets). Real syntax errors
 *  are caught with try/catch around the actual query. */
function safeSelector(sel) {
  if (!sel || typeof sel !== 'string') return null;
  const trimmed = sel.trim();
  return trimmed || null;
}

/** One-shot query that doesn't throw on bad selectors. */
function safeQuery(root, sel) {
  if (!root || !sel) return null;
  try { return root.querySelector(sel); }
  catch { return null; }
}

/** Run a regex extract step against the page's text/html/scope.
 *  `source`:
 *    'body'    → root.body.innerText (or root.textContent if no body
 *                — handles parsed-HTML docs without <body>)
 *    'html'    → root.body.innerHTML / outerHTML
 *    'scope'+selector → text content of the scoped element
 *  Capture group defaults to 1, falls back to 0 (full match) when
 *  the pattern has no groups. */
function regexExtract(root, { regex, flags, source, scope, group }, ctx) {
  if (!regex) return null;
  let text = '';
  if (scope) {
    const el = safeQuery(root, scope);
    text = el ? (el.textContent || '') : '';
  } else if (source === 'html') {
    text = root?.body?.innerHTML || root?.documentElement?.outerHTML || '';
  } else {
    // 'body' (default) or 'text'
    text = root?.body?.textContent || root?.textContent || '';
  }
  let re;
  try { re = new RegExp(regex, flags || ''); }
  catch (e) { ctx?.errors?.push(`bad regex /${regex}/${flags || ''}: ${e.message}`); return null; }
  const m = re.exec(text);
  if (!m) return null;
  const g = group != null ? Number(group) : 1;
  return m[g] != null ? m[g] : m[0];
}

/** Apply a leaf field's `extract` directive against the given root
 *  (the Document for top-level fields, a row element for item
 *  fields). Returns the RAW string (or null) BEFORE coercion. */
function runExtract(root, extract, ctx) {
  if (!extract) return null;

  // 1) Constant override (useful for testing).
  if ('const' in extract) return extract.const;

  // 1b) Row's primary key (only meaningful inside an itemFields
  //     walk over a keyedRows array). Surface the row's id as a
  //     field — schemas use `extract: { rowKey: true }`.
  if (extract.rowKey === true) {
    return ctx?.rowKey != null ? String(ctx.rowKey) : null;
  }

  // 2) Cell index inside a row context.
  if ('cell' in extract) {
    if (!ctx?.rowEl) return null;
    return readCell(ctx.rowEl, Number(extract.cell), extract.attr);
  }

  // 3) Named function dispatch — three flavors:
  //
  //    extract.fn       → (doc, ...args)        doc-scoped
  //    extract.keyedFn  → (doc, rowKey, ...args) keyed-row scoped
  //                       (the row's id-derived key is auto-fed)
  //    extract.rowFn    → (rowEl, ...args)      row-element scoped
  //                       (reads from the current <tr> directly)
  //
  // Schemas pick the right flavor per extractor — keyedField uses
  // keyedFn (needs to look up sibling cells by suffixed id),
  // readHrefParam uses rowFn (needs to walk the row's children),
  // findStat uses fn (page-global label lookup).
  if (extract.fn || extract.keyedFn || extract.rowFn) {
    const fnName = extract.fn || extract.keyedFn || extract.rowFn;
    const fn = getFn(fnName);
    if (!fn) {
      ctx?.errors?.push(`unknown extractor fn: ${fnName}`);
      return null;
    }
    const args = Array.isArray(extract.args) ? extract.args : [];
    try {
      if (extract.rowFn) {
        if (!ctx?.rowEl) {
          ctx?.errors?.push(`rowFn "${fnName}" called outside a row context`);
          return null;
        }
        return fn(ctx.rowEl, ...args);
      }
      if (extract.keyedFn) {
        if (ctx?.rowKey == null) {
          ctx?.errors?.push(`keyedFn "${fnName}" called outside a keyed-row context`);
          return null;
        }
        return fn(ctx.doc, ctx.rowKey, ...args);
      }
      return fn(ctx.doc, ...args);
    } catch (e) {
      ctx?.errors?.push(`extractor "${fnName}" threw: ${e.message}`);
      return null;
    }
  }

  // 4) Regex against page text.
  if (extract.regex) return regexExtract(ctx?.doc || root, extract, ctx);

  // 5) Selector lookup.
  const sel = safeSelector(extract.sel);
  if (!sel) return null;
  const el = safeQuery(root, sel);
  if (!el) return null;
  return readAttr(el, extract.attr);
}

/** Recursively walk a schema's fields and produce the matching
 *  output object. `root` is the DOM scope to query within (doc
 *  for top-level, row el for itemFields). ctx carries shared
 *  state across the walk:
 *    doc       — the original Document (always available even when
 *                root is a row element, so fn extractors can reach
 *                ancestor elements if needed)
 *    rowEl     — the current row element when inside an array's
 *                itemFields (drives readCell)
 *    rowKey    — the row's primary key for keyedRow arrays
 *    path      — breadcrumb (for error messages)
 *    errors    — collected per-field errors
 *    warnings  — soft notices ("required field empty", etc.) */
function walkFields(fields, root, ctx) {
  const out = {};
  for (const [name, def] of Object.entries(fields || {})) {
    const path = ctx.path ? `${ctx.path}.${name}` : name;
    const childCtx = { ...ctx, path };

    if (def.type === 'object') {
      out[name] = walkFields(def.fields || {}, root, childCtx);
      continue;
    }

    if (def.type === 'array') {
      out[name] = extractArray(def, root, childCtx);
      continue;
    }

    // Leaf field — extract + transform + coerce.
    let raw = runExtract(root, def.extract, childCtx);
    if (def.transform) raw = applyTransform(def.transform, raw);
    const value = coerceType(raw, def.type);

    /* Required + missing → warn (don't error — empty isn't a bug
       per se, downstream smart options may still set a fallback). */
    if (def.validate?.required && (value == null || value === '')) {
      ctx.warnings.push({ path, message: 'required field is empty' });
    }
    /* Pattern validation: applies only when a value is present so
       we don't double-warn (required+empty already covered above). */
    if (def.validate?.pattern && value && typeof value === 'string') {
      try {
        const re = def.validate.pattern instanceof RegExp
          ? def.validate.pattern
          : new RegExp(def.validate.pattern);
        if (!re.test(value)) {
          ctx.warnings.push({
            path,
            message: def.validate.message || `does not match expected pattern`,
          });
        }
      } catch { /* bad pattern — silently skip */ }
    }
    out[name] = value;
  }
  return out;
}

/** Build the array output for an `array` field. Source rows come
 *  from either a selector (`extract.sel + kind:'rows'`) or a fn
 *  (`extract.fn + kind:'rows'`). The schema also supports a keyed
 *  form (`extract.keyedRows`) for tables where each <tr> id encodes
 *  the row's primary key — see contact schema's tasks/opportunities. */
function extractArray(def, root, ctx) {
  if (!def.extract) return [];

  let rows = [];
  if (def.extract.keyedRows) {
    /* keyedRows shape:
         { keyedRows: { container, rowPrefix } }
       container — CSS selector for the table/parent
       rowPrefix — id prefix that each row carries
                   (rowPrefix='taskrow_' matches <tr id="taskrow_676578">). */
    const { container, rowPrefix } = def.extract.keyedRows;
    rows = queryRows(ctx.doc || root, `${container} tr[id^="${rowPrefix}"]`).map((el) => ({
      el,
      key: el.id.slice(rowPrefix.length),
    }));
  } else if (def.extract.fn) {
    const fn = getFn(def.extract.fn);
    if (!fn) {
      ctx.errors.push(`unknown array extractor fn: ${def.extract.fn}`);
      return [];
    }
    try {
      const result = fn(ctx.doc || root, ...(def.extract.args || []));
      rows = Array.isArray(result)
        ? result.map((el) => (el && el.el ? el : { el }))
        : [];
    } catch (e) {
      ctx.errors.push(`array extractor "${def.extract.fn}" threw: ${e.message}`);
      return [];
    }
  } else if (def.extract.sel) {
    const sel = safeSelector(def.extract.sel);
    if (!sel) return [];
    try { rows = Array.from((ctx.doc || root).querySelectorAll(sel)).map((el) => ({ el })); }
    catch (e) { ctx.errors.push(`bad array selector "${sel}": ${e.message}`); return []; }
  }

  /* Trim to a sane max if the schema sets one (defends against
     pathological pages with thousands of rows). 200 is generous —
     the contact page's biggest table tops out at ~20 rows of the
     visible (first-page) DataTable. */
  const max = def.extract.max || 200;
  if (rows.length > max) rows = rows.slice(0, max);

  if (!def.itemFields) {
    // No per-row shape declared — just emit the rows' text content.
    return rows.map((r) => (r.el?.textContent || '').trim());
  }

  return rows.map(({ el, key }) =>
    walkFields(def.itemFields, el, {
      ...ctx,
      rowEl: el,
      rowKey: key,
      path: `${ctx.path}[]`,
    }));
}

/**
 * extract(schema, doc) — main entry point.
 *
 * Returns:
 *   {
 *     schemaId: string,
 *     data:     <typed JSON matching schema.fields>,
 *     errors:   Array<string>,        // schema/extractor failures
 *     warnings: Array<{ path, message }>,
 *   }
 *
 * Never throws. If the doc isn't even a Document, returns an empty
 * data object with one error.
 */
export function extract(schema, doc) {
  const result = {
    schemaId: schema?.id || '(unknown)',
    data: {},
    errors: [],
    warnings: [],
  };
  if (!schema || typeof schema !== 'object' || !schema.fields) {
    result.errors.push('invalid or missing schema');
    return result;
  }
  if (!doc || typeof doc.querySelector !== 'function') {
    result.errors.push('invalid document');
    return result;
  }
  const ctx = {
    doc,
    path: '',
    errors: result.errors,
    warnings: result.warnings,
  };
  result.data = walkFields(schema.fields, doc, ctx);
  return result;
}
