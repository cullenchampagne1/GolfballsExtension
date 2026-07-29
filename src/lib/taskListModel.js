/* ───────────────────────────────────────────────────────────────
   taskListModel.js — pure data model for the CRM Task List, shared by
   the Task List custom PAGE (Page 349 takeover) and testable in node.

   The native Task List (Page=349) has no JSON endpoint — it returns a
   full HTML page with <tr id="taskrow_<id>"> rows. parseTasksFromHtml
   pulls the same cells the legacy modal used. filterTasks/sortTasks are
   pure so the page's Refine sidebar + search are driven by one place.
─────────────────────────────────────────────────────────────── */

export const TASKS_ENDPOINT = 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=349';
const BASE_PATH = 'https://api.golfballs.com/golfballs/adminnew/';

export const STATUS_OPTS = [
  { id: '1', label: 'New' },
  { id: '3', label: 'Completed' },
  { id: '0', label: 'All' },
];

export const PRIORITY_OPTS = [
  { id: '1', label: 'High' },
  { id: '2', label: 'Medium' },
  { id: '3', label: 'Low' },
];

/* Due-date buckets for the Refine sidebar. Each `test(dueDate, today)`. */
export const DUE_BUCKETS = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Due today' },
  { id: 'week', label: 'Next 7 days' },
  { id: 'later', label: 'Later' },
  { id: 'none', label: 'No date' },
];

/** Which bucket a due date falls in relative to `today` (a midnight Date). */
export function dueBucket(dueDate, today) {
  if (!dueDate || Number.isNaN(dueDate.getTime?.())) return 'none';
  const d = new Date(dueDate); d.setHours(0, 0, 0, 0);
  const base = new Date(today); base.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - base.getTime()) / 86400000);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 7) return 'week';
  return 'later';
}

/** Parse Page=349 HTML → task rows. Same cells the legacy modal read. */
export function parseTasksFromHtml(html) {
  if (typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  const tasks = [];
  doc.querySelectorAll('tr[id^="taskrow_"]').forEach((row) => {
    if (row.id.includes('taskrow2_')) return;     // hidden nested rows
    const id = row.id.replace('taskrow_', '');
    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length < 6) return;
    const [accountCell, contactCell, dueCell, catCell, priCell, subjectCell] = cells;
    const actionCell = cells[6] || cells[cells.length - 1];
    const accountLink = accountCell.querySelector('a');
    const contactLink = contactCell.querySelector('a');
    const rawAccHref = accountLink?.getAttribute('href') || '';
    const rawConHref = contactLink?.getAttribute('href') || '';
    const priRaw = priCell.textContent.trim();
    const priNum = parseInt(priRaw, 10) || 2;
    const priLabel = priRaw.replace(/^\d/, '').trim() || (priNum === 1 ? 'High' : priNum === 3 ? 'Low' : 'Med');
    const statusInput = actionCell?.querySelector('input[id^="status_"]');
    const statusVal = statusInput ? statusInput.value : '';
    const isDone = statusVal.toLowerCase().includes('complete');
    const abs = (href) => { try { return href ? new URL(href, BASE_PATH).href : ''; } catch { return ''; } };
    tasks.push({
      id,
      account: accountLink?.textContent.trim() || accountCell.textContent.trim(),
      accountUrl: abs(rawAccHref),
      contact: contactLink?.textContent.trim() || contactCell.textContent.trim(),
      contactUrl: abs(rawConHref),
      due: dueCell.textContent.trim(),
      dueDate: new Date(dueCell.textContent.trim()),
      category: catCell.textContent.trim(),
      priority: priNum,
      priorityLabel: priLabel,
      subject: subjectCell.textContent.trim(),
      status: isDone ? 'Complete' : 'New',
    });
  });
  return tasks;
}

/** Distinct non-empty category names, sorted — drives the Category facet. */
export function distinctCategories(tasks) {
  const set = new Set();
  for (const t of tasks || []) { const c = (t.category || '').trim(); if (c) set.add(c); }
  return [...set].sort((a, b) => a.localeCompare(b));
}

const priKey = (t) => String(t.priority);
const statusKey = (t) => (t.status === 'Complete' ? '3' : '1');

/**
 * Filter tasks by the Refine selections + free-text query. Selections are
 * Sets (empty = no constraint) except `status` which is a single id
 * ('1' new | '3' completed | '0' all). Pure.
 */
export function filterTasks(tasks, { query = '', status = '1', priority, category, due } = {}, today = new Date()) {
  const q = String(query).trim().toLowerCase();
  const pri = priority instanceof Set ? priority : new Set(priority || []);
  const cat = category instanceof Set ? category : new Set(category || []);
  const dueSel = due instanceof Set ? due : new Set(due || []);
  return (tasks || []).filter((t) => {
    if (status && status !== '0' && statusKey(t) !== status) return false;
    if (pri.size && !pri.has(priKey(t))) return false;
    if (cat.size && !cat.has((t.category || '').trim())) return false;
    if (dueSel.size && !dueSel.has(dueBucket(t.dueDate, today))) return false;
    if (q) {
      const hay = `${t.account} ${t.contact} ${t.subject} ${t.category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Stable multi-key sort. chain = [{key,dir}]; key ∈ task fields. Pure. */
export function sortTasks(tasks, chain = [{ key: 'dueDate', dir: 'asc' }]) {
  const val = (t, key) => {
    if (key === 'dueDate') { const n = t.dueDate?.getTime?.(); return Number.isFinite(n) ? n : Infinity; }
    if (key === 'priority') return t.priority;
    return String(t[key] ?? '').toLowerCase();
  };
  const rows = (tasks || []).map((t, i) => [t, i]);
  rows.sort(([a, ia], [b, ib]) => {
    for (const { key, dir } of chain) {
      const av = val(a, key); const bv = val(b, key);
      if (av < bv) return dir === 'desc' ? 1 : -1;
      if (av > bv) return dir === 'desc' ? -1 : 1;
    }
    return ia - ib; // stable
  });
  return rows.map(([t]) => t);
}

/** True when the fetched HTML is the login shell rather than the task page. */
export function looksLikeLoginShell(html) {
  const s = String(html || '');
  if (/tr[ _]?id=.?taskrow_/i.test(s)) return false;
  return /name=["']?(?:txtUsername|password)|id=["']?loginform|Log ?In to/i.test(s);
}
