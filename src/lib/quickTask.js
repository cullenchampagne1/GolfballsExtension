/* ───────────────────────────────────────────────────────────────
   quickTask.js — shared constants + helpers for the quick-task
   subsystem. Same pattern as src/lib/callLog.js: the Notes editor
   configures preset templates (subType === 'task'), the QuickTask
   modal reads them at quick-action time, and one canonical
   submitQuickTask fires the CRM POST.

   Storage contract (shared with calls + notes):
     chrome.storage.local.noteTemplates: Array<Template>

   Task template shape (the fields collectNoteTemplate stores when
   subType === 'task'):
     {
       id:         string,
       name:       string,    // shown on the preset row
       subType:    'task',
       enabled:    boolean,
       subject:    string,    // CRM task "Subject"
       body:       string,    // CRM task "Description"
       daysOut:    number|null,  // null = due today
       priority:   1 | 2 | 3, // 1=High, 2=Medium, 3=Low
       categoryId: number,    // CRM internal task category enum
       updatedAt:  number,
     }

   The submit pathway goes to Task/Create.ajax (see
   src/lib/submitQuickTask.js + legacy src/vanilla/crm-task-buttons.js).
─────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'noteTemplates';

/* Priority options — three buckets, matches the CRM enum + the
   Notes editor's TaskPanel. `tone` drives the priority chip color
   on preview rows. */
export const PRIORITY_OPTIONS = [
  { id: '1', label: 'High',   tone: 'error'   },
  { id: '2', label: 'Medium', tone: 'warning' },
  { id: '3', label: 'Low',    tone: 'muted'   },
];

/* Default priority for a new custom task — Medium matches the
   editor's default (data.priority ?? 2). */
export const DEFAULT_PRIORITY = 2;

/** Look up a priority record by its numeric or string id. Returns
 *  the Medium option as a fallback so the UI never renders a blank
 *  chip if a stored template has a garbage value. */
export function getPriority(id) {
  const sid = String(id ?? DEFAULT_PRIORITY);
  return PRIORITY_OPTIONS.find((p) => p.id === sid) || PRIORITY_OPTIONS[1];
}

/** Human "due in X days" label. `null`/`0`/undefined → "today",
 *  positive → "in Xd". Used in preset rows + the preview chip. */
export function getDueLabel(daysOut) {
  if (daysOut == null || daysOut === '') return 'today';
  const n = parseInt(daysOut, 10);
  if (!n || n <= 0) return 'today';
  return `in ${n}d`;
}

const hasChromeStorage = () => {
  try { return typeof chrome !== 'undefined' && !!chrome.storage?.local; }
  catch { return false; }
};

/** Load the user's task preset templates from storage. Filters
 *  to subType==='task' && enabled !== false so the modal only
 *  ever sees rows the rep actually wants picker-visible. */
export function loadTaskTemplates() {
  return new Promise((resolve) => {
    const filter = (raw) => {
      const all = Array.isArray(raw) ? raw : [];
      return all.filter((t) => t?.subType === 'task' && t?.enabled !== false);
    };
    if (hasChromeStorage()) {
      chrome.storage.local.get(STORAGE_KEY, (data) => resolve(filter(data?.[STORAGE_KEY])));
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      resolve(filter(raw ? JSON.parse(raw) : []));
    } catch { resolve([]); }
  });
}

/** Live-subscribe to template changes. Returns a no-op cleanup
 *  outside an extension context. */
export function subscribeToTaskTemplates(handler) {
  if (!hasChromeStorage() || !chrome.storage?.onChanged?.addListener) return () => {};
  const onChanged = (changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    const next = changes[STORAGE_KEY].newValue;
    const filtered = (Array.isArray(next) ? next : [])
      .filter((t) => t?.subType === 'task' && t?.enabled !== false);
    handler(filtered);
  };
  chrome.storage.onChanged.addListener(onChanged);
  return () => chrome.storage.onChanged.removeListener(onChanged);
}

/* ── Due-date helpers ─────────────────────────────────────────
   The redesigned composer's inline Due control offers quick
   relative chips (Today / +1d / … / +1w) AND a typed mm/dd/yy
   specific date. Both collapse to the `daysOut` integer the
   template shape + submitQuickTask already speak, so the submit
   path is unchanged — qtResolveDue() turns a `due` object into
   { daysOut, crmDate, human, … } and the modal hands daysOut to
   buildCustomTaskTemplate. Shared here so the control and the
   submit math can't drift. */
const QT_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const QT_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Quick relative-due chips for the inline Due control. */
export const QT_QUICK = [
  { key: 'today', days: 0, label: 'Today' },
  { key: 'd1',    days: 1, label: '+1d' },
  { key: 'd2',    days: 2, label: '+2d' },
  { key: 'd3',    days: 3, label: '+3d' },
  { key: 'w1',    days: 7, label: '+1w' },
];

/** Relative day count → Date at local midnight (0 = today). */
export function qtDateFromDays(days) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (parseInt(days, 10) || 0));
  return d;
}
/** CRM m/d/yyyy string. */
export function qtCrmDate(d) { return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`; }
/** Human "Fri, May 30". */
export function qtHuman(d) { return `${QT_DOW[d.getDay()]}, ${QT_MON[d.getMonth()]} ${d.getDate()}`; }

/** Auto-format raw digits into mm/dd/yy as the rep types. */
export function qtFormatTyped(raw) {
  const n = String(raw).replace(/[^0-9]/g, '').slice(0, 6);
  return [n.slice(0, 2), n.slice(2, 4), n.slice(4, 6)].filter(Boolean).join('/');
}
/** Parse mm/dd/yy (or m/d/yy, 4-digit year ok) → Date | null. */
export function qtParseTyped(str) {
  const m = String(str).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const mo = +m[1]; const day = +m[2]; let yr = +m[3];
  if (yr < 100) yr += 2000;
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  const d = new Date(yr, mo - 1, day); d.setHours(0, 0, 0, 0);
  if (d.getMonth() !== mo - 1 || d.getDate() !== day) return null; // reject 02/31 etc
  return d;
}
/** Days-from-today for an absolute date (can be negative). */
export function qtDiffDays(d) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

/** Canonical due-value → { daysOut, crmDate, human, isToday, isPast, kind }.
 *  `due` is { kind:'relative', days } or { kind:'specific', date }. */
export function qtResolveDue(due) {
  if (due && due.kind === 'specific' && due.date) {
    const diff = qtDiffDays(due.date);
    return { daysOut: diff, crmDate: qtCrmDate(due.date), human: qtHuman(due.date), isToday: diff === 0, isPast: diff < 0, kind: 'specific' };
  }
  const days = due ? (due.days || 0) : 0;
  const d = qtDateFromDays(days);
  return { daysOut: days, crmDate: qtCrmDate(d), human: qtHuman(d), isToday: days === 0, isPast: false, kind: 'relative' };
}

/** Build a synthetic task template from the custom-form fields.
 *  Same shape stored templates have so the submit pipe doesn't
 *  branch on preset vs custom. */
export function buildCustomTaskTemplate({
  subject, body,
  priority = DEFAULT_PRIORITY,
  daysOut = null,
  categoryId = 0,
} = {}) {
  return {
    id: `custom-task-${Date.now()}`,
    name: (subject || '').trim() || 'Custom task',
    subType: 'task',
    enabled: true,
    subject: (subject || '').trim(),
    body: (body || '').trim(),
    priority: parseInt(priority, 10) || DEFAULT_PRIORITY,
    daysOut: daysOut == null || daysOut === '' ? null : (parseInt(daysOut, 10) >= 0 ? parseInt(daysOut, 10) : null),
    categoryId: parseInt(categoryId, 10) || 0,
  };
}
