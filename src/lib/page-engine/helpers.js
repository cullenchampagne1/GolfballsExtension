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

import { API } from '../constants.js';

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

/**
 * Resolve the displayed owner for a native CRM task row.
 *
 * CRM page variants do not agree on one field id, so prefer the known
 * suffixed ids and then fall back to the table column whose heading says
 * Owner or Assigned To. This keeps contact/account task schemas identical.
 */
export function taskOwner(doc, rowKey) {
  if (!doc || !rowKey) return null;
  const prefixes = [
    'owner', 'taskowner', 'taskOwner', 'assignedto', 'assignedTo',
    'assigned', 'employee', 'employeeName',
  ];
  for (const prefix of prefixes) {
    const el = doc.getElementById(`${prefix}_${rowKey}`);
    const value = readAttr(el, el?.tagName === 'SELECT' ? 'selectedText' : 'visibleText');
    if (value) return value;
  }

  const row = doc.getElementById(`taskrow_${rowKey}`);
  if (!row) return null;
  const table = row.closest?.('table');
  const headings = table ? Array.from(table.querySelectorAll('thead th')) : [];
  const ownerIndex = headings.findIndex((heading) => /\b(owner|assigned(?:\s+to)?)\b/i.test(readText(heading) || ''));
  if (ownerIndex >= 0) {
    const value = readVisibleText(row.children?.[ownerIndex]);
    if (value) return value;
  }

  for (const cell of Array.from(row.children || [])) {
    const label = [
      cell.getAttribute?.('data-title'),
      cell.getAttribute?.('aria-label'),
      cell.getAttribute?.('data-label'),
    ].filter(Boolean).join(' ');
    if (/\b(owner|assigned(?:\s+to)?)\b/i.test(label)) {
      const value = readVisibleText(cell);
      if (value) return value;
    }
  }
  return null;
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

/** Contact-page orders-table rows, found by their `…page=ViewOrder…` link in
 *  the first cell rather than the table id. The orders grid is a DataTables
 *  table with NO server-side id — DataTables assigns `#DataTables_Table_0` in
 *  the browser, so that id is ABSENT when the page is fetched as static HTML
 *  (bulk send). The rows ARE server-rendered, so we locate them by content.
 *  Works identically on the live page and a fetched document. */
export function contactOrderRows(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];
  return Array.from(doc.querySelectorAll('tr')).filter((tr) => {
    const a = tr.querySelector('td:first-child a[href]');
    if (!a) return false;
    return /[?&]page=ViewOrder\b/i.test(a.getAttribute('href') || a.href || '');
  }).slice(0, 50);
}

/** Email-history rows on the contact page's Email portlet. Found by each
 *  row's native "view message" link (Page=268 + MessageID=…) rather than
 *  the `data-gb-ep="1"` marker the email-preview content script stamps at
 *  RUNTIME on the live page. That marker is absent from freshly-fetched
 *  raw HTML, so a `tr[data-gb-ep="1"]` selector returns zero rows when the
 *  EmailRunner fetches a contact page in the background — which silently
 *  broke the "skip if emailed within N days" guard (it saw no history, so
 *  every contact looked never-emailed). The native link is in the raw HTML
 *  and covers the same rows, so this works live AND fetched. Cells match
 *  the email-preview reader: [1:from][2:to][3:subject][4:date][5:size]. */
export function contactEmailRows(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];
  return Array.from(doc.querySelectorAll('tr'))
    .filter((tr) => tr.querySelector('a[href*="Page=268" i][href*="MessageID=" i]'))
    .slice(0, 100);
}

/** Logo-proof table rows (#Table2 on contact/account pages). Keyed off each
 *  row's "View History" link (logoProofing?logoGUID=…) — not the table id —
 *  so it works on a statically-fetched page too. Sorted newest-first by the
 *  date cell (col 1) so proofs[0] is RELIABLY the most recent proof: the live
 *  page is date-desc via DataTables, but a fetched page is server order. */
export function contactProofRows(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];
  const rows = Array.from(doc.querySelectorAll('tr')).filter((tr) =>
    tr.querySelector('a[href*="logoProofing?logoGUID=" i]'));
  const dateOf = (tr) => {
    const t = ((tr.children && tr.children[1] && tr.children[1].textContent) || '').trim();
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  };
  return rows.sort((a, b) => dateOf(b) - dateOf(a)).slice(0, 50);
}

/** One proof row → a derived asset URL. Every asset is a pure function of the
 *  row's logoGUID (verified live against the proofing flow HAR), so NO
 *  off-page fetch is needed:
 *    logo_ball      → cloudfront /logo/<id[0:2]>/<id>_1.png   (ball wearing the logo)
 *    logo           → cloudfront /logo/<id[0:2]>/<id>-150.jpg (logo thumbnail)
 *    mockup         → render.aspx LogoOverlay XMLFile=virtualproofbtn (ball mockup)
 *    apparel_mockup → render.aspx LogoOverlay XMLFile=virtualproof    (apparel mockup)
 *    pdf            → cloudfront /logo/<id[0:2]>/<id>_1.pdf   (proof PDF)
 *    id             → the bare GUID
 *  The two mockups share one render.aspx call — only the XMLFile differs. */
export function proofLogoUrl(rowEl, kind) {
  const a = rowEl && rowEl.querySelector && rowEl.querySelector('a[href*="logoGUID=" i]');
  const m = /logoGUID=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    .exec((a && (a.getAttribute('href') || a.href)) || '');
  if (!m) return '';
  const id = m[1].toLowerCase();
  const dir = id.slice(0, 2);
  const render = (xml) => `https://www.customizationapplications.com/render.aspx?template=LogoOverlay&XMLFile=${xml}&LogoID=${id}`;
  switch (kind) {
    case 'logo_ball':      return `https://d1tp32r8b76g0z.cloudfront.net/logo/${dir}/${id}_1.png`;
    case 'logo':           return `https://d1tp32r8b76g0z.cloudfront.net/logo/${dir}/${id}-150.jpg`;
    case 'mockup':         return render('virtualproofbtn');
    case 'apparel_mockup': return render('virtualproof');
    case 'pdf':            return `https://d1tp32r8b76g0z.cloudfront.net/logo/${dir}/${id}_1.pdf`;
    case 'id':             return id;
    case 'history':        return (a && a.href) || (a && a.getAttribute('href')) || '';   // the "View History" page link
    default:               return '';
  }
}

/** Activity id from a feed row — the row (or a descendant) carries an
 *  onclick="CreateActivityDetailModal(<id>)". Used to fetch the detail. */
export function activityId(rowEl) {
  if (!rowEl) return '';
  try {
    const oc = (rowEl.getAttribute && rowEl.getAttribute('onclick')) || '';
    let m = /CreateActivityDetailModal\((\d+)\)/.exec(oc);
    if (!m && rowEl.outerHTML) m = /CreateActivityDetailModal\((\d+)\)/.exec(rowEl.outerHTML);
    return m ? m[1] : '';
  } catch (e) { return ''; }
}

/** Aggregate ordered-items table rows. Same DataTables-id problem as the
 *  orders grid (#DataTables_Table_1 is assigned in the browser, absent in a
 *  fetched page) — but this one has no link to key off. Live page: use the
 *  runtime id. Static fetch: it's the id-less table whose rows have a
 *  product-name first cell + a dollar column and NO ViewOrder link (that's
 *  the orders grid). Works in both contexts. */
export function contactItemRows(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];
  const byId = Array.from(doc.querySelectorAll('#DataTables_Table_1 tbody tr'));
  if (byId.length) return byId.slice(0, 100);
  const tables = Array.from(doc.querySelectorAll('table')).filter((t) => !t.id);
  for (const t of tables) {
    if (t.querySelector('a[href*="ViewOrder" i]')) continue;                 // that's the orders grid
    const trs = Array.from(t.querySelectorAll('tbody tr')).filter((tr) => (tr.children || []).length >= 3);
    const hits = trs.filter((tr) => {
      const first = (tr.children[0]?.textContent || '').trim();
      const money = Array.from(tr.children).some((td) => /\$\s*[\d,]/.test(td.textContent || ''));
      return first && !/^[\d.$,]+$/.test(first) && money;
    });
    if (hits.length && hits.length >= trs.length * 0.5) return trs.slice(0, 100);
  }
  return [];
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

/** Order rows on the ACCOUNT page. The account Orders portlet renders
 *  a 6-column table — Order / Contact / Summary / Date / Revenue /
 *  Status — i.e. one extra "Contact" column versus the contact page's
 *  5-column Orders table. We can't reuse `contactOrderRows` cell
 *  indices (they'd be shifted by one), so the account schema points
 *  its `orders` array here and uses account-specific itemField cells.
 *
 *  Scoped by the "Orders" portlet caption (substring — also matches
 *  "Account Orders") rather than #DataTables_Table_0, whose id is
 *  assigned live by DataTables and absent on a statically-fetched
 *  page. Rows are any <tbody tr> with a linked first cell (the order
 *  #), which excludes the footer/summary row. */
export function accountOrderRows(doc) {
  const table = findTableByPortletCaption(doc, 'Orders');
  if (!table) return [];
  return Array.from(table.querySelectorAll('tbody tr'))
    .filter((tr) => tr.querySelector('td:first-child a[href]'))
    .slice(0, 50);
}

/** Account-page order totals — the "Total: N  Revenue: $X" summary the
 *  CRM prints in the Orders portlet footer. On the contact page the
 *  stat TILES (Order Count / Total Revenue) carry these numbers, but
 *  the account page has no tiles, so `findStat` resolves null and the
 *  stat blocks read zero. This reads the portlet's own realtime totals
 *  instead. `which` is 'count' | 'revenue'. Returns the raw string so
 *  the schema's currency/number coercion handles formatting. */
export function accountOrdersSummary(doc, which) {
  const portlet = findPortletByCaption(doc, 'Orders');
  const text = ((portlet || (doc && doc.body) || {}).textContent || '').replace(/\s+/g, ' ');
  const m = text.match(/Total:\s*(\d+)[\s\S]*?Revenue:\s*\$?([\d,]+(?:\.\d+)?)/i);
  if (!m) return null;
  if (which === 'count') return m[1];
  if (which === 'revenue') return m[2];
  return null;
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
 *      contactId   → customerID from cell 0's Page=240 link
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
    case 'contactId':
    case 'detailUrl': {
      const a = cells[0]?.querySelector?.('a[href]');
      if (!a) return null;
      const href = a.href || a.getAttribute('href') || '';
      if (field === 'detailUrl') return href || null;
      const match = href.match(/[?&](?:customerID|customerId|contactID|contactId)=(\d+)/i);
      return match ? match[1] : null;
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

/* ── Order page (ViewOrder) helpers ───────────────────────────────
   The ViewOrder summary is a rendered confirmation email — most of it
   has no ids, so these read by text-landmark / structural position. */

/** First anchor on the page carrying ?<param>=<value> → the value. The
 *  ViewOrder page has no reliable id for orderID/customerID, but both ride
 *  in dozens of action hrefs, so this is the robust source. */
export function anyHrefParam(doc, paramName) {
  if (!paramName) return null;
  let re;
  try { re = new RegExp('[?&]' + paramName + '=([^&#"]+)', 'i'); }
  catch { return null; }
  const anchors = doc.querySelectorAll('a[href]');
  for (const a of anchors) {
    const m = (a.getAttribute('href') || '').match(re);
    if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  }
  return null;
}

/** Parse the "Order #{orderID}-{customerID}" header text. `which`:
 *    'order'       → orderID (digits before the dash)
 *    'orderString' → "{orderID}-{customerID}" incl. a revision letter
 *    'customer'    → customerID (digits after dash, trailing letter dropped) */
export function orderHeaderField(doc, which) {
  const text = (doc && doc.body ? doc.body.textContent : '') || '';
  const m = text.match(/Order #(\d+)-(\d+[A-Za-z]?)/);
  if (!m) {
    // Fall back to the URL params carried in action hrefs.
    if (which === 'order') return anyHrefParam(doc, 'orderID');
    if (which === 'customer') return anyHrefParam(doc, 'customerID');
    return null;
  }
  if (which === 'order') return m[1];
  if (which === 'orderString') return orderStringField(doc);
  if (which === 'customer') return m[2].replace(/[A-Za-z]+$/, '');
  return null;
}

/** The canonical order string ("{orderID}-{customerID}", possibly with a
 *  revision letter). Read from the print/tracking links — the header text
 *  can't be used directly because textContent glues the following
 *  "Customer #…" onto the number (a spurious trailing "C"). Falls back to
 *  rebuilding from the (letter-stripped) order + customer ids. */
export function orderStringField(doc) {
  const a = doc.querySelector('a[href*="printOrder.aspx"], a[href*="page=orderTracking"]');
  if (a) {
    const href = a.getAttribute('href') || '';
    let m = href.match(/[?&]orderString=(\d+-\d+[A-Za-z]?)/i);
    if (m) return m[1];
    m = href.match(/printOrder\.aspx\?orderID=(\d+-\d+[A-Za-z]?)/i);
    if (m) return m[1];
  }
  const order = orderHeaderField(doc, 'order');
  const customer = orderHeaderField(doc, 'customer');
  return (order && customer) ? `${order}-${customer}` : null;
}

/** The order status — prefer the change-status dropdown's selected option,
 *  fall back to the "Order Status: <b>X</b>" header in the red portlet. */
export function orderStatusText(doc) {
  const sel = doc.querySelector('#ctl00_allowedOrderStatuses');
  if (sel && sel.tagName === 'SELECT' && sel.selectedIndex >= 0) {
    const opt = sel.options[sel.selectedIndex];
    const t = opt ? (opt.textContent || '').trim() : '';
    if (t) return t;
  }
  for (const th of doc.querySelectorAll('th')) {
    const t = (th.textContent || '').trim();
    if (/^Order Status:/i.test(t)) {
      const b = th.querySelector('b');
      return b ? (b.textContent || '').trim() : t.replace(/^Order Status:\s*/i, '');
    }
  }
  return null;
}

/** The order date — the first text node of the header `td.date` (before the
 *  customer-email <a>). textContent alone would glue the email on. */
export function orderDateText(doc) {
  const td = doc.querySelector('td.date');
  if (!td) return null;
  for (const n of td.childNodes) {
    if (n.nodeType === 3) { const t = (n.textContent || '').trim(); if (t) return t; }
  }
  return (td.textContent || '').trim() || null;
}

/** A row of `table.totals` whose label matches → its value cell text
 *  ($amount). Generic so the variable label set (Sales Tax / Promotion /
 *  Standard|Economy Shipping) all read off one helper. */
export function totalsRow(doc, labelPattern) {
  const table = doc.querySelector('table.totals');
  if (!table || !labelPattern) return null;
  let re; try { re = new RegExp(labelPattern, 'i'); } catch { return null; }
  for (const tr of table.querySelectorAll('tr')) {
    const cells = tr.children;
    if (cells.length < 2) continue;
    if (re.test((cells[0].textContent || '').trim())) {
      return (cells[cells.length - 1].textContent || '').trim() || null;
    }
  }
  return null;
}

/** A labelled address block inside #customerInfo ("Shipped To:" /
 *  "Billed To:" / "Billing Address:") → its lines joined by newlines. */
export function addressBlock(doc, headerText) {
  const info = doc.querySelector('#customerInfo');
  if (!info || !headerText) return null;
  const target = String(headerText).trim().toLowerCase();
  for (const h of info.querySelectorAll('.header')) {
    if ((h.textContent || '').trim().toLowerCase().includes(target)) {
      let tbl = h.nextElementSibling;
      while (tbl && tbl.tagName !== 'TABLE') tbl = tbl.nextElementSibling;
      if (!tbl) return null;
      const lines = Array.from(tbl.querySelectorAll('td'))
        .map((td) => (td.textContent || '').trim()).filter(Boolean);
      return lines.join('\n') || null;
    }
  }
  return null;
}

/** Per-product rows of the line-items table — one <tr> per product (the row
 *  carrying the product's <a class="nodes"> name link). */
export function orderLineItemRows(doc) {
  const table = doc.querySelector('#ctl00_ctl02_cartTable');
  if (!table) return [];
  return Array.from(table.querySelectorAll('tr')).filter((tr) => tr.querySelector('a.nodes'));
}

/** Read one field off a line-item <tr> (rowFn). */
export function orderItemField(rowEl, which) {
  if (!rowEl) return null;
  const txt = (el) => (el ? (el.textContent || '').trim() : null);
  if (which === 'name') return txt(rowEl.querySelector('a.nodes'));
  if (which === 'url') { const a = rowEl.querySelector('a.nodes'); return a ? (a.href || a.getAttribute('href')) : null; }
  if (which === 'sku') {
    const span = rowEl.querySelector('span[style*="font-size:10pt"]');
    if (!span) return null;
    const parts = (span.innerHTML || '').split(/<br\s*\/?>/i)
      .map((s) => s.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : null;
  }
  const price = rowEl.querySelector('table.itemPriceTable');
  if (which === 'qty') { const c = price && price.querySelector('tr') ? price.querySelector('tr').children[0] : null; return txt(c); }
  if (which === 'unitPrice') { const s = price ? price.querySelectorAll('span') : null; return s && s[0] ? txt(s[0]) : null; }
  if (which === 'lineTotal') { const s = price ? price.querySelectorAll('span') : null; return s && s[1] ? txt(s[1]) : null; }
  if (which === 'itemId') { const b = rowEl.querySelector('[id^="btnItemException"]'); return b ? b.id.replace('btnItemException', '') : null; }
  if (which === 'checkPrint') { const el = rowEl.querySelector('[id^="txtCheckPrint"]'); return el ? (el.value || '') : null; }
  if (which === 'packerNote') { const el = rowEl.querySelector('[id^="txtPackerNote"]'); return el ? (el.value || '') : null; }
  return null;
}

/** The "Shipped To:" address block's rows (the most reliable customer
 *  name/phone on a ViewOrder page). Returns the row texts. */
function shipToRows(doc) {
  const block = addressBlock(doc, 'Shipped To:');
  return block ? block.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

/** Customer name off the order (the Shipped-To recipient). `which`:
 *  'first' | 'last' | 'full'. Collapses the double-spaces the CRM emits. */
export function orderCustomerName(doc, which) {
  const rows = shipToRows(doc);
  const full = (rows[0] || '').replace(/\s+/g, ' ').trim();
  if (!full) return null;
  if (which === 'full') return full;
  const parts = full.split(' ');
  if (which === 'first') return parts[0] || null;
  if (which === 'last')  return parts.length > 1 ? parts.slice(1).join(' ') : '';
  return full;
}

/** Customer phone off the order — the Shipped-To block's phone row. */
export function orderCustomerPhone(doc) {
  const rows = shipToRows(doc);
  for (const r of rows) {
    if (/\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/.test(r)) return r;
  }
  return null;
}

/** Applied order tags — the active chips in #CurrentTag (NOT the full
 *  checkbox modal, which renders everything unchecked). Returns a
 *  comma-joined string ("HoldShipment, DoNotShipUSPS, …") so templates can
 *  print it and match rules can `contains` a tag name. */
export function orderTags(doc) {
  const out = [];
  for (const s of doc.querySelectorAll('#CurrentTag span[id^="CurrentTag-"]')) {
    const t = (s.textContent || '').trim();
    if (t) out.push(t);
  }
  return out.join(', ');
}

/** The order's credit-card "Total Charge" (in the yellow Order Charges
 *  portlet). Null when the order has no charges table. */
export function orderChargeTotal(doc) {
  const scope = doc.querySelector('.portlet.box.yellow') || doc;
  for (const b of scope.querySelectorAll('b')) {
    if ((b.textContent || '').trim().toLowerCase() === 'total charge') {
      const td = b.closest('td');
      const next = td && td.nextElementSibling;
      if (!next) return null;
      const vb = next.querySelector('b') || next;
      return (vb.textContent || '').trim() || null;
    }
  }
  return null;
}

/** Whether the order has credit-card charges (vs the "No credit cards on
 *  order to charge." placeholder). Returns 'true'/'false' for the bool type. */
export function orderHasCharges(doc) {
  const yellow = doc.querySelector('.portlet.box.yellow');
  if (!yellow) return 'false';
  return /no credit cards on order/i.test(yellow.textContent || '') ? 'false' : 'true';
}

/** The Order Assembly / fulfillment status URL (the iframe target the
 *  portlet's tools onclick points at), built from the orderID as a
 *  fallback. The live status itself renders inside that iframe, so the URL
 *  is the actionable thing we can surface. */
export function orderFulfillmentUrl(doc) {
  const tools = doc.querySelector('[onclick*="OrderStatus.html"]');
  if (tools) {
    const m = (tools.getAttribute('onclick') || '').match(/(https?:\/\/[^'"]*OrderStatus\.html[^'"]*)/i);
    if (m) return m[1];
  }
  const orderID = orderHeaderField(doc, 'order');
  return orderID ? `https://operations.gbcadmin.com/fulfillment/OrderStatus.html?orderID=${orderID}` : null;
}

/** The order's "Add Payment" link, if the order carries one. Mirrors the
 *  legacy smartPaymentLink builtin: the anchor whose text mentions adding/
 *  updating payment. Null when there's no payment link on the order. */
export function orderPaymentLink(doc) {
  for (const a of doc.querySelectorAll('a[href]')) {
    const t = (a.textContent || '').toLowerCase();
    if (t.includes('add payment') || t.includes('payment to order') || t.includes('update payment')) {
      return a.getAttribute('href') || a.href || null;
    }
  }
  return null;
}

/** Build a ViewOrder action URL from the order's ids. Templates verified
 *  across the sample orders. Returns null when the ids can't be resolved. */
export function orderActionUrl(doc, name) {
  const orderID = orderHeaderField(doc, 'order');
  const orderString = orderStringField(doc);
  const customerID = orderHeaderField(doc, 'customer');
  if (!orderID) return null;
  const ADMIN = API.CRM_ADMIN;
  const ROOT = API.CRM_ROOT;
  switch (name) {
    case 'tracking':            return orderString ? `${ROOT}account.aspx?page=orderTracking&orderString=${orderString}` : null;
    case 'printInvoice':        return orderString ? `${ROOT}printOrder.aspx?orderID=${orderString}&invoice=true` : null;
    case 'emailCustomer':       return `${ADMIN}default.aspx?Page=37&orderID=${orderID}&emailCustomer=true`;
    case 'addTracking':         return `${ADMIN}default.aspx?popup=1&folder=Orders&page=AddTracking&orderID=${orderID}`;
    case 'createInvoice':       return `${ADMIN}Default.aspx?Folder=GreatPlains&Page=CreateInvoice&order=${orderID}`;
    case 'updateShipping':      return `${ADMIN}default.aspx?Folder=orders%5Cviewordercontrols&Page=UpdateSelectedShipping&orderID=${orderID}`;
    case 'addressValidation':   return `${ADMIN}default.aspx?Folder=orders&Page=AddressValidation&orderID=${orderID}`;
    case 'editShippingAddress': return `${ADMIN}UpdateShippingAddress.aspx?orderID=${orderID}`;
    case 'dropShip':            return `${ADMIN}default.aspx?page=DropShipOrder&folder=DropShip&orderID=${orderID}`;
    case 'returnDoc':           return `${ADMIN}default.aspx?sop=${orderID}&Page=37&return=1`;
    case 'reorder':             return `${ADMIN}default.aspx?orderID=${orderID}&Page=37&incorder=true`;
    case 'econnectLog':         return `${ADMIN}default.aspx?Page=304&orderID=${orderID}`;
    case 'itemPriority':        return `${ADMIN}Default.aspx?Page=200&orderID=${orderID}`;
    case 'contactPage':         return customerID ? `${ADMIN}Default.aspx?Page=240&customerID=${customerID}` : null;
    default: return null;
  }
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
  contactOrderRows,
  contactEmailRows,
  contactItemRows,
  contactProofRows,
  proofLogoUrl,
  activityId,
  keyedField,
  taskOwner,
  accountContactRows,
  firstAccountContactField,
  accountOrderRows,
  accountOrdersSummary,
  splitNameCell,
  firstCellHref,
  openTaskRows,
  completedTaskRows,
  // order page
  anyHrefParam,
  orderHeaderField,
  orderStringField,
  orderStatusText,
  orderDateText,
  totalsRow,
  addressBlock,
  orderLineItemRows,
  orderItemField,
  orderCustomerName,
  orderCustomerPhone,
  orderTags,
  orderChargeTotal,
  orderHasCharges,
  orderFulfillmentUrl,
  orderPaymentLink,
  orderActionUrl,
};

/** Look up a named extractor. Returns null if not registered so
 *  the caller can surface a schema error rather than crashing. */
export function getFn(name) {
  return Object.prototype.hasOwnProperty.call(FN_REGISTRY, name)
    ? FN_REGISTRY[name]
    : null;
}
