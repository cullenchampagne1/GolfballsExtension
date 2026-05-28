/* ───────────────────────────────────────────────────────────────
   page-engine/helpers.js — bounded registry of named extractor
   functions referenced by schema fields via `extract: { fn, args }`.

   Schemas should use `sel`/`attr` for simple element lookups. When
   the data lives in a less-regular structure (label-and-sibling
   stat tiles, irregular tables with row IDs that include the row's
   primary key, etc.) the schema falls back to a named function
   here. The registry is OURS — users don't register functions, they
   get code variables for that.

   Each function receives (doc, ...args) and returns the RAW value
   (string|null) before any type coercion. extract.js applies the
   schema's declared `type` + `transform` afterward, so functions
   here don't need to parse numbers themselves.
─────────────────────────────────────────────────────────────── */

/** Pull a value from a stat tile rendered as
 *      <tr><th>{label}</th><td>{value}</td></tr>.
 *  Search is case-insensitive and ignores surrounding whitespace.
 *  Used for both Sales Stats and Mailer Stats — the page has 11+
 *  of these and they share the exact same structure. */
export function findStat(doc, label) {
  if (!label) return null;
  const target = String(label).trim().toLowerCase();
  /* querySelectorAll('th') across the whole page is O(n) but cheap;
     stat tables are small and we only run this at extract time, so
     no need to scope or cache. */
  const ths = doc.querySelectorAll('th');
  for (const th of ths) {
    const text = (th.textContent || '').trim().toLowerCase();
    if (text === target) {
      const td = th.nextElementSibling;
      if (td && td.tagName === 'TD') return (td.textContent || '').trim();
    }
  }
  return null;
}

/** Extract text content from an element. Prefers .textContent over
 *  .innerText to dodge layout reads in headless contexts (innerText
 *  triggers a reflow). Trims by default since most labels carry
 *  surrounding whitespace. */
function readText(el, opts = {}) {
  if (!el) return null;
  const raw = (el.textContent || '');
  return opts.preserve ? raw : raw.trim();
}

/** Walk an element's descendants and concatenate text from nodes
 *  that are actually rendered — skips children with `display:none`,
 *  `visibility:hidden`, or the `hidden` attribute. Catches the
 *  common CRM pattern of stuffing a hidden sort key alongside the
 *  visible label (e.g. priority cell: `<div style="display:none;">
 *  3</div>Low`). Both browsers AND jsdom respect this approach
 *  since we check the actual style attribute / hidden flag, not
 *  computed style (which jsdom doesn't fully simulate). */
function readVisibleText(el) {
  if (!el) return null;
  let out = '';
  const walk = (n) => {
    if (!n) return;
    if (n.nodeType === 3 /* TEXT_NODE */) {
      out += n.textContent || '';
      return;
    }
    if (n.nodeType !== 1 /* ELEMENT_NODE */) return;
    /* Skip hidden via inline style or the `hidden` attribute. We
       check style.display rather than computed style so we don't
       depend on layout / jsdom support. */
    if (n.hasAttribute && n.hasAttribute('hidden')) return;
    const style = (n.getAttribute && n.getAttribute('style')) || '';
    if (/display\s*:\s*none/i.test(style)) return;
    if (/visibility\s*:\s*hidden/i.test(style)) return;
    for (const child of n.childNodes) walk(child);
  };
  walk(el);
  return out.trim();
}

/** Read a value off an element by attribute name. Supports the
 *  pseudo-attrs `innerText` / `innerHTML` / `value` (for form
 *  controls, .value beats .getAttribute('value') for live state). */
export function readAttr(el, attr) {
  if (!el) return null;
  if (!attr || attr === 'innerText' || attr === 'textContent') return readText(el);
  if (attr === 'visibleText') return readVisibleText(el);
  if (attr === 'innerHTML') return el.innerHTML;
  if (attr === 'value') {
    /* For <select>, .value alone gives the selected option's value
       attribute. Often the user actually wants the displayed text
       (e.g. country dropdown — value "US", text "United States").
       Schema fields can ask for the text via `attr: 'selectedText'`
       below. */
    return el.value != null ? el.value : el.getAttribute('value');
  }
  if (attr === 'selectedText') {
    if (el.tagName === 'SELECT') {
      const opt = el.options[el.selectedIndex];
      return opt ? (opt.textContent || '').trim() : null;
    }
    return readText(el);
  }
  if (attr === 'checked') {
    return el.checked === true ? 'true' : 'false';
  }
  if (attr === 'href') return el.href || el.getAttribute('href');
  return el.getAttribute(attr);
}

/** Scrape table rows into an array of cells. Used when a schema
 *  declares `extract: { sel: 'rowSelector', kind: 'rows' }` and has
 *  per-cell `itemFields`. The schema's itemFields drive the per-row
 *  shape; this just returns the raw <tr> elements for extract.js to
 *  walk per-field. */
export function queryRows(doc, selector) {
  if (!selector) return [];
  try { return Array.from(doc.querySelectorAll(selector)); }
  catch { return []; }
}

/** Read a specific cell (by 0-indexed position) from a <tr>. Used
 *  by row-collection schemas where each cell maps to a field. */
export function readCell(rowEl, cellIdx, attr) {
  if (!rowEl) return null;
  const cells = rowEl.children;
  if (!cells || cellIdx < 0 || cellIdx >= cells.length) return null;
  return readAttr(cells[cellIdx], attr || 'innerText');
}

/** Pull task rows where the <tr> id encodes the task's primary key
 *  (`taskrow_676578`). Returns the rows AND the parsed keys —
 *  useful when the schema wants to expose `id` as a field alongside
 *  the cell-derived fields. */
export function queryKeyedRows(doc, containerSel, rowIdPrefix) {
  const rows = queryRows(doc, `${containerSel} tr[id^="${rowIdPrefix}"]`);
  return rows.map((row) => ({
    el: row,
    id: row.id.slice(rowIdPrefix.length),
  }));
}

/** Resolve a field within a keyed row by suffixed id (e.g. inside
 *  taskrow_676578, the subject cell is #subject_676578). The schema
 *  declares `extract: { fn: 'keyedField', args: ['subject'] }` and
 *  the engine passes the row's key in through `{ rowKey }` context. */
export function keyedField(doc, rowKey, prefix, attr) {
  if (!rowKey || !prefix) return null;
  const el = doc.getElementById(`${prefix}_${rowKey}`);
  return readAttr(el, attr || 'innerText');
}

/** Pull the orderID query-string parameter from an anchor inside a
 *  cell — useful for the orders table where the displayed number is
 *  the same as the URL param but with no leading zeros, and we want
 *  the canonical URL for downstream linking. */
export function readHrefParam(rowEl, cellIdx, paramName) {
  if (!rowEl) return null;
  const cell = rowEl.children?.[cellIdx];
  if (!cell) return null;
  const a = cell.querySelector('a[href]');
  if (!a) return null;
  try {
    const url = new URL(a.href, 'https://placeholder.local');
    return url.searchParams.get(paramName);
  } catch { return null; }
}

/** Registry — extract.js looks up by name when a schema field uses
 *  `extract: { fn: 'name', args: [...] }`. Order of params is
 *  always (doc, ...args). For row-scoped fns, extract.js routes via
 *  `extract: { fn: 'name', cellIdx: N }` etc. — see extract.js for
 *  the cell/row dispatch. */
export const FN_REGISTRY = {
  findStat,
  queryRows,
  queryKeyedRows,
  readHrefParam,
  keyedField,
};

/** Look up a named extractor. Returns null if not registered so
 *  the caller can surface a schema error rather than crashing. */
export function getFn(name) {
  return Object.prototype.hasOwnProperty.call(FN_REGISTRY, name)
    ? FN_REGISTRY[name]
    : null;
}
