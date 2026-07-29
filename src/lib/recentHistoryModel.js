/* ───────────────────────────────────────────────────────────────
   recentHistoryModel.js — parse the native My Recent History page
   (Page=279) into table specs for the custom takeover. The five
   DataTables carry stable CLASS names (ids are DataTables-assigned),
   so tables are found by class. Rows are generic: cell text + the
   first link's href per cell, so the page renders any column set.
─────────────────────────────────────────────────────────────── */

export const RECENT_TABLES = [
  { key: 'phone',    sel: 'table.PCHTable', title: 'Phone / Contact History', icon: 'phone' },
  { key: 'accounts', sel: 'table.AHTable',  title: 'Recent Accounts',         icon: 'briefcase' },
  { key: 'contacts', sel: 'table.CHTable',  title: 'Recent Contacts',         icon: 'user' },
  { key: 'logos',    sel: 'table.LHTable',  title: 'Recent Logos',            icon: 'camera' },
  { key: 'orders',   sel: 'table.OHTable',  title: 'Recent Orders',           icon: 'cart' },
];

/** Parse one table element → { headers: string[], rows: [{cells:[{text,href}]}] }. */
export function parseHistoryTable(table, baseHref) {
  if (!table) return { headers: [], rows: [] };
  const headers = Array.from(table.querySelectorAll('thead th'))
    .map((th) => (th.textContent || '').trim());
  const abs = (href) => { try { return href ? new URL(href, baseHref || 'https://api.golfballs.com/golfballs/adminnew/').href : ''; } catch { return ''; } };
  const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) => ({
    cells: Array.from(tr.children).map((td) => {
      let text = (td.textContent || '').replace(/\s+/g, ' ').trim();
      const href = abs(td.querySelector?.('a')?.getAttribute('href') || '');
      // The native phone-history table mislabels its contact link "View
      // Order" even though it opens the CONTACT page (Page=240). Correct
      // the label to match where the link actually goes.
      if (/^view order$/i.test(text) && /Page=240/i.test(href)) text = 'View Contact';
      return { text, href };
    }),
  })).filter((r) => r.cells.some((c) => c.text));
  return { headers, rows };
}

/** All five tables off a live document (or parsed page). */
export function parseRecentHistory(doc, baseHref) {
  const out = [];
  for (const spec of RECENT_TABLES) {
    const table = doc?.querySelector?.(spec.sel);
    if (!table) continue;
    const parsed = parseHistoryTable(table, baseHref);
    if (parsed.headers.length) out.push({ ...spec, ...parsed });
  }
  return out;
}

/** Case-insensitive substring filter across all cells. Pure. */
export function filterHistoryRows(rows, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.cells.some((c) => c.text.toLowerCase().includes(q)));
}
