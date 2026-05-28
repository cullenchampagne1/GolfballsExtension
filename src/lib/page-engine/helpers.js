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

/** Find a `.portlet` element by its visible caption text. The CRM
 *  pages stamp the same id on multiple sibling tables (the account
 *  page's Open + Completed Tasks tables share `#TableTasks`); the
 *  only stable disambiguator is the caption text in the portlet
 *  header. Search is trimmed, lowercased, and substring — "Open
 *  Tasks" matches "Open Tasks " or " Open Tasks". Returns null
 *  when no portlet matches. */
function findPortletByCaption(doc, captionText) {
  if (!captionText) return null;
  const target = String(captionText).trim().toLowerCase();
  /* `.portlet .caption` is the standard Metro template wrapping
     for portlet headers — both .portlet.box.red (open tasks) and
     .portlet.box.green (account contacts) use it. */
  const captions = doc.querySelectorAll('.portlet .caption');
  for (const cap of captions) {
    const text = (cap.textContent || '').trim().toLowerCase();
    if (text.includes(target)) {
      /* Walk up to the .portlet ancestor — we want to scope to the
         whole portlet (header + body) so subsequent table queries
         find the right one. */
      let el = cap;
      while (el && !(el.classList && el.classList.contains('portlet'))) {
        el = el.parentElement;
      }
      return el;
    }
  }
  return null;
}

/** First `<table>` inside the portlet whose caption matches. Used
 *  when the table itself has no id (Account Contacts) OR shares an
 *  id with another table on the page (Open/Completed Tasks on the
 *  account page both id="TableTasks"). */
function findTableByPortletCaption(doc, captionText) {
  const portlet = findPortletByCaption(doc, captionText);
  if (!portlet) return null;
  return portlet.querySelector('table');
}

/** All <tr> rows of the Account Contacts table on an account page.
 *  Returns [] on contact pages (no such table) — that's the
 *  fail-safe path for the unified schema's `contacts[]` array. */
export function accountContactRows(doc) {
  const table = findTableByPortletCaption(doc, 'Account Contacts');
  if (!table) return [];
  return Array.from(table.querySelectorAll('tbody tr'));
}

/** Read a single field off the FIRST row of the Account Contacts
 *  table — used by `contact.*` fields on the account page so the
 *  unified schema collapses to the "most representative contact"
 *  without templates needing to know which page they're on. Field
 *  names map to the table's columns:
 *      fullName    → cell 0 text
 *      firstName   → cell 0 text, first whitespace-separated token
 *      lastName    → cell 0 text, rest after the first token
 *      email       → cell 1 text
 *      phone       → cell 2 text
 *      contactType → cell 3 text
 *      partnerCampaign → cell 4 text
 *      detailUrl   → cell 0 first anchor's href (Page=240 link) */
export function firstAccountContactField(doc, field) {
  const rows = accountContactRows(doc);
  if (rows.length === 0) return null;
  const row = rows[0];
  const cells = row.children;
  const cellText = (idx) => {
    const c = cells[idx];
    return c ? (c.textContent || '').trim() : '';
  };
  switch (field) {
    case 'fullName':        return cellText(0) || null;
    case 'firstName': {
      const full = cellText(0);
      if (!full) return null;
      return full.split(/\s+/)[0] || null;
    }
    case 'lastName': {
      const full = cellText(0);
      if (!full) return null;
      const parts = full.split(/\s+/);
      return parts.length > 1 ? parts.slice(1).join(' ') : '';
    }
    case 'email':           return cellText(1) || null;
    case 'phone':           return cellText(2) || null;
    case 'contactType':     return cellText(3) || null;
    case 'partnerCampaign': return cellText(4) || null;
    case 'detailUrl': {
      const a = cells[0]?.querySelector?.('a[href]');
      return a ? (a.href || a.getAttribute('href')) : null;
    }
    default:                return null;
  }
}

/** Cell-level row helper for the Account Contacts table — name
 *  splitter for the firstName/lastName itemFields under the
 *  `contacts[]` array. `which` picks 'first' vs 'last' on the
 *  whitespace-split name in `cellIdx`. */
export function splitNameCell(rowEl, cellIdx, which) {
  if (!rowEl) return null;
  const cell = rowEl.children?.[cellIdx];
  if (!cell) return null;
  const full = (cell.textContent || '').trim();
  if (!full) return null;
  const parts = full.split(/\s+/);
  if (which === 'first') return parts[0] || null;
  if (which === 'last')  return parts.length > 1 ? parts.slice(1).join(' ') : '';
  return full;
}

/** Pull the href off the first <a> in a cell. Used by the
 *  contacts[] array to surface each contact's Page=240 detail link
 *  without re-parsing the cell text. */
export function firstCellHref(rowEl, cellIdx) {
  if (!rowEl) return null;
  const cell = rowEl.children?.[cellIdx];
  if (!cell) return null;
  const a = cell.querySelector('a[href]');
  return a ? (a.href || a.getAttribute('href')) : null;
}

/** Open-tasks rows on the account page. The Open Tasks AND
 *  Completed Tasks portlets BOTH render `<table id="TableTasks">`
 *  (the CRM duplicates the id — invalid HTML but real). Scope by
 *  the portlet's caption so we land on the right table. Returns
 *  `[{ el, key }, ...]` where `key` is the taskrow_<id> suffix —
 *  the extract.js array path forwards `key` as `ctx.rowKey` so the
 *  same `keyedField`-based itemFields shape used by the contact
 *  schema works unchanged. */
export function openTaskRows(doc) {
  return _taskRowsForPortlet(doc, 'Open Tasks');
}
export function completedTaskRows(doc) {
  return _taskRowsForPortlet(doc, 'Completed Tasks');
}
function _taskRowsForPortlet(doc, caption) {
  const portlet = findPortletByCaption(doc, caption);
  if (!portlet) return [];
  const table = portlet.querySelector('#TableTasks') || portlet.querySelector('table');
  if (!table) return [];
  const rows = Array.from(table.querySelectorAll('tr[id^="taskrow_"]'));
  return rows.map((el) => ({ el, key: el.id.slice('taskrow_'.length) }));
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
  accountContactRows,
  firstAccountContactField,
  splitNameCell,
  firstCellHref,
  openTaskRows,
  completedTaskRows,
};

/** Look up a named extractor. Returns null if not registered so
 *  the caller can surface a schema error rather than crashing. */
export function getFn(name) {
  return Object.prototype.hasOwnProperty.call(FN_REGISTRY, name)
    ? FN_REGISTRY[name]
    : null;
}
