import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import {
  FloatingPanel, ModalHeader, Btn, Input, Dropdown, Tag, IconBtn, I,
  ensureMarchingAntsStyle,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import { useDevSetting } from '../lib/devSettings.js';
import { loadTaskTemplates } from '../lib/quickTask.js';
import { submitQuickTask } from '../lib/submitQuickTask.js';
import { EmailRunner } from './EmailRunner.jsx';
import { actionRegistry } from '../lib/actionRegistry.js';

/* ───────────────────────────────────────────────────────────────
   TaskList — React port of content/task-list-modal.js.

   Data shape (same as the legacy parser):
     {
       id, account, accountUrl, contact, contactUrl,
       due, dueDate (Date),
       category,
       priority (1=High, 2=Med, 3=Low),
       priorityLabel,
       subject,
       status ('New' | 'Complete'),
     }

   Layout follows CRMSearch's conventions for consistency:
     • Fixed-height FloatingPanel (1000×640)
     • Header → Toolbar (search + filters + refresh)
     • Selection summary slides in AT THE TOP when rows are checked,
       hosting the Campaign dropdown + Run Campaign (matches CRM's
       "Run campaign / Email selected / Export CSV" pattern)
     • Sticky-header sortable table
     • Footer (always visible) for the row-level Quick Task + Open
       Tabs bulk actions

   Live mode hits Page=349 and parses task rows from the rendered HTML
   (same approach the legacy modal used — no JSON endpoint for tasks).
   Outside an extension context (playground / dev) the modal auto-mocks
   from a built-in sample set so the layout is demoable.
─────────────────────────────────────────────────────────────── */

const TASKS_ENDPOINT = 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=349';
const BASE_PATH      = 'https://api.golfballs.com/golfballs/adminnew/';

const STATUS_OPTS = [
  { id: '1', label: 'New tasks' },
  { id: '3', label: 'Completed' },
  { id: '0', label: 'All statuses' },
];
const PRIORITY_OPTS = [
  { id: '',  label: 'All priorities' },
  { id: '1', label: 'High'   },
  { id: '2', label: 'Medium' },
  { id: '3', label: 'Low'    },
];

/* Sort columns — match the legacy modal's data-col IDs so muscle
   memory carries over. Click a header twice to toggle direction. */
const SORT_COLS = {
  account:  { key: 'account',     label: 'Account' },
  contact:  { key: 'contact',     label: 'Contact' },
  dueDate:  { key: 'dueDate',     label: 'Due Date' },
  category: { key: 'category',    label: 'Category' },
  priority: { key: 'priority',    label: 'Priority' },
  subject:  { key: 'subject',     label: 'Subject' },
};

function hasExtensionContext() {
  try { return typeof chrome !== 'undefined' && !!chrome.runtime?.id; }
  catch { return false; }
}

/* Mock tasks — generated relative to "today" so the modal demo doesn't
   age (overdue / due-today / future categories all populate naturally).
   Field set matches the live parser exactly. */
function buildMockTasks() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = (offset) => { const d = new Date(today); d.setDate(d.getDate() + offset); return d; };
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const make = (raw) => ({
    ...raw,
    accountUrl: '',
    contactUrl: '',
    due: fmt(raw.dueDate),
    priorityLabel: raw.priority === 1 ? 'High' : raw.priority === 3 ? 'Low' : 'Med',
  });
  return [
    make({ id: 'task_3401', account: 'Acme Industries',     contact: 'Marcus Chen',     dueDate: day(-3), category: 'Follow Up',    priority: 1, subject: 'Late proof on Q2 order',         status: 'New' }),
    make({ id: 'task_3402', account: 'Pebble Beach Resort', contact: 'Sarah Patel',     dueDate: day(0),  category: 'Outbound Call', priority: 1, subject: 'Renewal call — discuss artwork', status: 'New' }),
    make({ id: 'task_3403', account: 'TaylorMade Promo',    contact: 'Operations Team', dueDate: day(0),  category: 'Email',         priority: 2, subject: 'Send updated logo specs',         status: 'New' }),
    make({ id: 'task_3404', account: 'Brown Custom Gifts',  contact: 'Jordan Brown',    dueDate: day(2),  category: 'Quote Follow',  priority: 2, subject: 'Quote follow-up for 500 unit run',status: 'New' }),
    make({ id: 'task_3405', account: 'OC Fitness',          contact: "Liam O'Connor",   dueDate: day(5),  category: 'Outbound Call', priority: 3, subject: 'Reorder check-in',                status: 'New' }),
    make({ id: 'task_3406', account: 'Acme Industries',     contact: 'Marcus Chen',     dueDate: day(-7), category: 'Follow Up',    priority: 2, subject: 'Sample shipment confirmation',    status: 'Complete' }),
    make({ id: 'task_3407', account: 'Sunset Greens',       contact: 'Avery Wu',        dueDate: day(1),  category: 'Email',         priority: 3, subject: 'Send pricing matrix',             status: 'New' }),
    make({ id: 'task_3408', account: 'Pinehurst Country',   contact: 'Riley Stone',     dueDate: day(4),  category: 'Outbound Call', priority: 1, subject: 'Tournament merch decision deadline', status: 'New' }),
  ];
}

const fmtDate = (d) => {
  if (!d || Number.isNaN(d?.getTime?.())) return '—';
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};

/* Parse the legacy HTML response — Page=349 returns a full page with
   <tr id="taskrow_<id>"> rows. We pull the same cells as the original. */
function parseTasksFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
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
    const rawAccHref  = accountLink?.getAttribute('href') || '';
    const rawConHref  = contactLink?.getAttribute('href') || '';
    const priRaw      = priCell.textContent.trim();
    const priNum      = parseInt(priRaw, 10) || 2;
    const priLabel    = priRaw.replace(/^\d/, '') || 'Med';
    const statusInput = actionCell?.querySelector('input[id^="status_"]');
    const statusVal   = statusInput ? statusInput.value : '';
    const isDone      = statusVal.toLowerCase().includes('complete');
    tasks.push({
      id,
      account:     accountLink?.textContent.trim() || accountCell.textContent.trim(),
      accountUrl:  rawAccHref ? new URL(rawAccHref, BASE_PATH).href : '',
      contact:     contactLink?.textContent.trim() || contactCell.textContent.trim(),
      contactUrl:  rawConHref ? new URL(rawConHref, BASE_PATH).href : '',
      due:         dueCell.textContent.trim(),
      dueDate:     new Date(dueCell.textContent.trim()),
      category:    catCell.textContent.trim(),
      priority:    priNum,
      priorityLabel: priLabel.trim(),
      subject:     subjectCell.textContent.trim(),
      status:      isDone ? 'Complete' : 'New',
    });
  });
  return tasks;
}

const PRIORITY_TONE = { 1: 'error', 2: 'warning', 3: 'info' };

/* ── CRM task-update endpoints — ports of the legacy
   tlCompleteTask / tlReopenTask / tlPushTaskDate / tlSetTaskDate.
   Each fetches the task's current payload (Get.ajax), modifies
   one field, and POSTs the whole thing back via Update.ajax. */
const CRM_BASE = 'https://api.golfballs.com';

function fmtMDY(d) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

async function fetchTaskRaw(id) {
  const r = await fetch(`${CRM_BASE}/golfballs/crm/Admin/Task/Get.ajax?${id}`, { credentials: 'include' });
  return r.json();
}

async function updateTaskWith(task, overrides) {
  const params = {
    TaskID:         String(task.TaskId),
    Subject:        task.Subject,
    Description:    task.Description,
    LiveDate:       task.LiveDate,
    DueDate:        task.DueDate,
    taskCategoryID: String(task.taskCategoryID),
    taskStatusID:   String(task.taskStatusID),
    Priority:       String(task.Priority),
    contactID:      String(task.contactID),
    leadID:         task.leadID || '',
    employeeID:     String(task.employeeID),
    caseID:         task.caseID || 0,
    ...overrides,
  };
  await fetch(`${CRM_BASE}/golfballs/crm/Admin/Task/Update.ajax?${encodeURIComponent(JSON.stringify(params))}`, { credentials: 'include' });
}

/* Complete / Reopen use the legacy tlCompleteTask / tlReopenTask payload
   shape verbatim — `TaskId: Number(...)` (camelCase d, numeric), only the
   subset of fields the original modal sent, and `taskStatusID` as a
   number. The newer updateTaskWith() shape (with `TaskID`/`leadID`/
   `caseID`) round-trips fine for push/set-date but the CRM's
   Update.ajax silently ignored complete/reopen submits when we sent
   `TaskID` (capital) — task changed nothing server-side. */
async function apiCompleteTask(id) {
  const t = await fetchTaskRaw(id);
  const params = {
    TaskId:         Number(t.TaskId),
    Subject:        t.Subject,
    Description:    t.Description,
    LiveDate:       t.LiveDate,
    DueDate:        t.DueDate,
    taskCategoryID: t.taskCategoryID,
    taskStatusID:   3,
    contactID:      t.contactID,
    employeeID:     t.employeeID,
    Priority:       t.Priority,
  };
  await fetch(`${CRM_BASE}/golfballs/crm/Admin/Task/Update.ajax?${encodeURIComponent(JSON.stringify(params))}`, { credentials: 'include' });
}
async function apiReopenTask(id) {
  const t = await fetchTaskRaw(id);
  const params = {
    TaskId:         Number(t.TaskId),
    Subject:        t.Subject,
    Description:    t.Description,
    LiveDate:       t.LiveDate,
    DueDate:        t.DueDate,
    taskCategoryID: t.taskCategoryID,
    taskStatusID:   1,
    contactID:      t.contactID,
    employeeID:     t.employeeID,
    Priority:       t.Priority,
  };
  await fetch(`${CRM_BASE}/golfballs/crm/Admin/Task/Update.ajax?${encodeURIComponent(JSON.stringify(params))}`, { credentials: 'include' });
}
async function apiPushTaskDate(id, daysOut) {
  const t = await fetchTaskRaw(id);
  const d = new Date(); d.setDate(d.getDate() + daysOut);
  await updateTaskWith(t, { DueDate: fmtMDY(d) });
  return fmtMDY(d);
}
async function apiSetTaskDate(id, dueDateStr) {
  const t = await fetchTaskRaw(id);
  await updateTaskWith(t, { DueDate: dueDateStr });
}
/* Fetches the task's contactID so we can attach a freshly-created
   task to the same contact as the source row — submitQuickTask reads
   contactId out of context, not the source task. */
async function apiGetTaskContactId(id) {
  const t = await fetchTaskRaw(id);
  return String(t.contactID || 0);
}

export function TaskList({ onClosed, bindClose, useMock: useMockProp }) {
  const toast      = useToast();
  const draggable  = useDevSetting('taskList.draggable') ?? false;
  const forceMock  = useDevSetting('taskList.useMock')   ?? false;
  /* Playground passes useMock={true} explicitly so the rep can drive
     the email-blast animation without an extension context. Falls
     back to the dev flag / no-ext-context check otherwise. */
  const useMock    = useMockProp ?? (forceMock || !hasExtensionContext());

  const [tasks, setTasks]         = useState([]);
  const [status, setStatus]       = useState('loading');   // 'loading' | 'ready' | 'error'
  const [query, setQuery]         = useState('');
  const [statusFilter, setStatusFilter] = useState('1');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selected, setSelected]   = useState(() => new Set());
  const [emailRunnerOpen, setEmailRunnerOpen] = useState(false);
  const [emailRunnerCursor, setEmailRunnerCursor] = useState(null);
  /* Per-row email-send status keyed by task.id. EmailRunner pumps
     this via the onRowStart / onRowDone / onResetRowStates callbacks
     wired below; TaskRow reads from the map to replace the Quick Task
     button cell with the live send state. */
  const [emailStatusByRow, setEmailStatusByRow] = useState({});
  /* "Urgent only" filter — set to 'urgent' by the modal-aware
     action in the action shelf to narrow the visible list to
     overdue + due-today tasks. Cleared via the filter chip in the
     header. */
  const [dueFilter, setDueFilter] = useState('all'); // 'all' | 'urgent'

  /* Multi-column sort chain. Primary entry = main sort; subsequent
     entries are tiebreakers in order. Plain header-click replaces the
     chain with a single entry; Shift+click appends (or toggles dir
     if the column is already in the chain). Default: due-date ascending
     so the soonest task floats to the top.
     Shape: Array<{ key: string, dir: 'asc' | 'desc' }> */
  const [sortChain, setSortChain] = useState([{ key: 'dueDate', dir: 'asc' }]);

  /* Quick Task menu state. `qt` is null when closed; otherwise:
     { mode: 'main'|'bulk'|'datePicker'|'templates', taskId, anchor, returnMode? }
     • mode 'main'        — single-task root (Complete/Reopen, Push, Set Date, Add Task)
     • mode 'bulk'        — bulk root over `selected` (Complete All, Push, Set Date, Add Task)
     • mode 'datePicker'  — sub-panel; returnMode says where Back lands
     • mode 'templates'   — sub-panel; returnMode same role */
  const [qt, setQt] = useState(null);
  const [pushDays, setPushDays] = useState(7);
  const [taskTpls, setTaskTpls] = useState([]);
  /* Per-row work-in-progress flag (Complete/Push/etc.). Lives outside
     React state so the spinner doesn't trigger a re-render of the whole
     table — Mutates on the trigger button directly via a ref. */
  const busyRowsRef = useRef(new Set());
  const [busyVersion, bumpBusy] = useState(0);
  const markBusy = (id) => { busyRowsRef.current.add(id); bumpBusy((n) => n + 1); };
  const clearBusy = (id) => { busyRowsRef.current.delete(id); bumpBusy((n) => n + 1); };

  useEffect(() => { loadTaskTemplates().then(setTaskTpls).catch(() => setTaskTpls([])); }, []);

  const bindCloseRef = useRef(null);
  const handleBindClose = useCallback((fn) => {
    bindCloseRef.current = fn;
    bindClose?.(fn);
  }, [bindClose]);

  // Generation token — kill stale loads. Same pattern as CRMSearch's
  // search guard so a fast Refresh-then-Refresh doesn't fire two toasts.
  const loadGenRef = useRef(0);

  // Fallback prompt — same surface for "fetch threw" and "fetch returned
  // nothing". Both end up looking the same to the user (empty list with
  // no way to demo the layout), so they should get the same offer to
  // drop in template data.
  const fireFallbackToast = useCallback((message) => {
    setStatus('error');
    setTasks([]);
    toast?.action?.({
      tone: 'warning',
      title: 'Tasks unavailable',
      message: message || 'Couldn’t reach the CRM tasks page.',
      primary: 'Use template data',
      secondary: 'Dismiss',
      icon: <I.alert />,
      duration: null,
      placement: 'top-center',
      onPrimary: () => {
        loadGenRef.current++;
        setTasks(buildMockTasks());
        setStatus('ready');
      },
    });
  }, [toast]);

  const loadTasks = useCallback(async () => {
    const gen = ++loadGenRef.current;
    setStatus('loading');
    try {
      let rows;
      if (useMock) {
        await new Promise((r) => setTimeout(r, 280));
        rows = buildMockTasks();
      } else {
        const html = await fetch(TASKS_ENDPOINT, { credentials: 'include' }).then((r) => r.text());
        rows = parseTasksFromHtml(html);
      }
      if (gen !== loadGenRef.current) return;

      // Live mode but parser found no task rows — the most common
      // reason is an auth redirect (the page came back as the login
      // shell, not the tasks shell). Treat as the same failure mode as
      // a thrown fetch so the user can drop in template data and keep
      // working instead of staring at an empty table.
      if (!useMock && rows.length === 0) {
        fireFallbackToast('The tasks page returned no rows — likely a session timeout. Want to see what the layout would look like?');
        return;
      }

      setTasks(rows);
      setStatus('ready');
      // Drop selections that aren't in the new result set.
      setSelected((sel) => {
        const next = new Set();
        for (const r of rows) if (sel.has(r.id)) next.add(r.id);
        return next;
      });
    } catch (err) {
      if (gen !== loadGenRef.current) return;
      fireFallbackToast(err?.message);
    }
  }, [useMock, fireFallbackToast]);

  // Initial load. No second effect this time — TaskList doesn't auto-
  // refire on filter changes (filtering is client-side over the loaded
  // set), so we don't have the CRMSearch StrictMode double-fire risk.
  useEffect(() => { loadTasks(); }, [loadTasks]);

  /* Modal-stack registration + modal-specific shelf action. Mirrors
     CRMSearch's pattern: push on mount so the shelf shows "In My
     Tasks" with relevant actions; register an "Only urgent" action
     that flips dueFilter to 'urgent' so the rep can narrow the list
     to what they need to act on RIGHT NOW from a keyboard shortcut. */
  useEffect(() => {
    actionRegistry.pushModal('task-list', 'My Tasks');
    return () => actionRegistry.popModal('task-list');
  }, []);
  useEffect(() => {
    const unsub = actionRegistry.register({
      id: 'gb-task-only-urgent',
      label: dueFilter === 'urgent' ? 'Show all tasks' : 'Only overdue + due today',
      icon: <I.bolt size={13} />,
      hint: dueFilter === 'urgent'
        ? 'Restore the full task list'
        : 'Narrow to tasks that need action right now',
      whenModalOpen: ['task-list'],
      handler: () => {
        setDueFilter((d) => (d === 'urgent' ? 'all' : 'urgent'));
      },
    });
    return unsub;
  }, [dueFilter]);

  /* Compare a single column on two rows. dueDate uses numeric Date
     subtraction; priority is already numeric; everything else is a
     case-insensitive localeCompare. Pulled out so the multi-sort
     loop reads top-to-bottom. */
  const compareOne = (a, b, key) => {
    if (key === 'dueDate')  return a.dueDate - b.dueDate;
    if (key === 'priority') return a.priority - b.priority;
    const av = (a[key] || '').toString().toLowerCase();
    const bv = (b[key] || '').toString().toLowerCase();
    return av.localeCompare(bv);
  };

  /* Filter + sort. Search ranking tiers float the strongest matches
     to the top before the user's sort chain kicks in:
       100: subject starts with the query (the "type 'ty' to see TY-
            subject tasks first" case the user flagged)
        60: subject contains the query
        30: contact starts with the query
        15: account starts with the query
         5: any of {account, contact, subject, category} contains the
            query (kept so weak matches still surface — they're just
            below all the strong ones)
     Within the same tier the multi-column sortChain orders rows; the
     chain is also the primary sort when the query is empty. */
  const visibleTasks = useMemo(() => {
    const q = query.trim().toLowerCase();

    const scoreRow = (t) => {
      if (!q) return 0;
      const subj = (t.subject || '').toLowerCase();
      if (subj.startsWith(q)) return 100;
      if (subj.includes(q))   return 60;
      const contact = (t.contact || '').toLowerCase();
      if (contact.startsWith(q)) return 30;
      const account = (t.account || '').toLowerCase();
      if (account.startsWith(q)) return 15;
      const cat = (t.category || '').toLowerCase();
      if (contact.includes(q) || account.includes(q) || cat.includes(q)) return 5;
      return 0;
    };

    /* Urgent filter: keep only overdue + due-today + still-open
       tasks. Completed tasks are never urgent — they'd just clutter
       the narrow view that the user opened to see what they need
       to act on RIGHT NOW. */
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const todayStr = today0.toDateString();
    const isUrgent = (t) => {
      if (t.status === 'Complete') return false;
      if (!t.dueDate) return false;
      if (t.dueDate < today0) return true;
      if (t.dueDate.toDateString() === todayStr) return true;
      return false;
    };

    let rows = tasks.filter((t) => {
      if (statusFilter === '1' && t.status !== 'New')      return false;
      if (statusFilter === '3' && t.status !== 'Complete') return false;
      if (priorityFilter && String(t.priority) !== priorityFilter) return false;
      if (dueFilter === 'urgent' && !isUrgent(t)) return false;
      if (q && scoreRow(t) === 0) return false;
      return true;
    });

    rows = rows.slice().sort((a, b) => {
      // Completed tasks always sink to the bottom — matches legacy.
      const aDone = a.status === 'Complete';
      const bDone = b.status === 'Complete';
      if (aDone !== bDone) return aDone ? 1 : -1;
      // Relevance score drives the primary sort whenever the user has
      // typed something. Highest score floats up.
      if (q) {
        const diff = scoreRow(b) - scoreRow(a);
        if (diff !== 0) return diff;
      }
      // User's sort chain (or default dueDate asc) breaks ties.
      for (const { key, dir } of sortChain) {
        const cmp = compareOne(a, b, key);
        if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
    return rows;
  }, [tasks, query, statusFilter, priorityFilter, dueFilter, sortChain]);

  // ── Selection ────────────────────────────────────────────────
  const toggleSel = (id, idx, shiftKey) => {
    if (shiftKey && lastIdx != null && idx != null) {
      const [a, b] = idx < lastIdx ? [idx, lastIdx] : [lastIdx, idx];
      setSelected((s) => {
        const next = new Set(s);
        for (let i = a; i <= b; i++) {
          const r = visibleTasks[i];
          if (r) next.add(r.id);
        }
        return next;
      });
    } else {
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }
    if (idx != null) setLastIdx(idx);
  };
  const allVisibleSelected = visibleTasks.length > 0 && visibleTasks.every((t) => selected.has(t.id));
  const toggleAll = () => setSelected((s) => {
    if (allVisibleSelected) {
      const next = new Set(s);
      for (const t of visibleTasks) next.delete(t.id);
      return next;
    }
    const next = new Set(s);
    for (const t of visibleTasks) next.add(t.id);
    return next;
  });
  /* Header click handler.
       - Plain click: collapse the chain to just this column. If it's
         already the only entry, toggle its direction (asc ↔ desc).
       - Shift+click: extend the chain. Toggle if the column is in it
         already; otherwise append `asc`. Lets the user combine sorts
         like "due soonest, then subject alphabetised". */
  const onSortClick = (key, e) => {
    const shift = e?.shiftKey;
    setSortChain((cur) => {
      if (shift) {
        const idx = cur.findIndex((c) => c.key === key);
        if (idx === -1) return [...cur, { key, dir: 'asc' }];
        const next = cur.slice();
        next[idx] = { key, dir: next[idx].dir === 'asc' ? 'desc' : 'asc' };
        return next;
      }
      // Plain click: single-column sort.
      if (cur.length === 1 && cur[0].key === key) {
        return [{ key, dir: cur[0].dir === 'asc' ? 'desc' : 'asc' }];
      }
      return [{ key, dir: 'asc' }];
    });
  };

  // ── Bulk actions ─────────────────────────────────────────────
  const openSelectedTabs = () => {
    const tasksToOpen = visibleTasks.filter((t) => selected.has(t.id) && t.contactUrl);
    if (!tasksToOpen.length) {
      toast?.warning?.('No contacts to open — selected rows have no contact link', { duration: 2500 });
      return;
    }
    for (const t of tasksToOpen) {
      try { window.open(t.contactUrl, '_blank', 'noopener,noreferrer'); } catch {}
    }
    toast?.success?.(`Opened ${tasksToOpen.length} contact${tasksToOpen.length === 1 ? '' : 's'}`, { duration: 2200 });
  };
  const onQuickTask = (e) => {
    // Bulk Quick Task — opens the floating menu rooted on the footer
    // button. The menu handler dispatches the action across every
    // selected row.
    const anchor = e?.currentTarget?.getBoundingClientRect?.() || null;
    setQt({ mode: 'bulk', taskId: 'bulk', anchor });
  };

  /* Mutates one task in local state so the table reflects the change
     without a full Refresh round-trip. id+patch shape matches the row
     fields the table reads (status, due, dueDate). */
  const patchTaskLocal = useCallback((id, patch) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  /* ── Quick-Task action dispatcher ────────────────────────────
     Handles the leaves of the menu state machine. The menu owns its
     own navigation (main → datePicker / templates → action); this
     fires once the user lands on an actionable item. */
  const runQuickAction = useCallback(async (action, payload = {}) => {
    const isBulk = action.startsWith('bulk-');
    const ids = isBulk ? Array.from(selected) : [payload.taskId];
    if (!ids.length) { setQt(null); return; }

    setQt(null);
    for (const id of ids) markBusy(id);

    /* Helper that pushes one task's mutation through the relevant CRM
       endpoint, then patches local state on success. Errors are caught
       per-row so a partial failure in a bulk run doesn't stop the rest. */
    const runOne = async (id) => {
      try {
        if (action === 'complete' || action === 'bulk-complete') {
          await apiCompleteTask(id);
          patchTaskLocal(id, { status: 'Complete' });
          setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
        } else if (action === 'reopen') {
          await apiReopenTask(id);
          patchTaskLocal(id, { status: 'New' });
        } else if (action === 'push' || action === 'bulk-push') {
          const dueStr = await apiPushTaskDate(id, payload.days);
          const [m, d, y] = dueStr.split('/');
          patchTaskLocal(id, { due: dueStr, dueDate: new Date(+y, +m - 1, +d) });
        } else if (action === 'set-date' || action === 'bulk-set-date') {
          await apiSetTaskDate(id, payload.date);
          const [m, d, y] = payload.date.split('/');
          patchTaskLocal(id, { due: payload.date, dueDate: new Date(+y, +m - 1, +d) });
        } else if (action === 'create-task' || action === 'bulk-create-task') {
          const contactId = await apiGetTaskContactId(id);
          const employeeId = await new Promise((resolve) => {
            try { chrome.storage.local.get('gbEmployeeId', (d) => resolve(d?.gbEmployeeId || '')); }
            catch { resolve(''); }
          });
          const res = await submitQuickTask({
            template: payload.template,
            context:  { contactId, employeeId },
          });
          if (!res?.ok) throw new Error(res?.error || 'Create task failed');
        }
      } catch (err) {
        toast?.error?.(`Task ${id}: ${err?.message || err}`, { duration: 4000 });
      } finally {
        clearBusy(id);
      }
    };

    if (isBulk) {
      // Run bulk actions sequentially — the CRM rate-limits concurrent
      // Update.ajax hits, and serialising keeps row spinners predictable.
      for (const id of ids) await runOne(id);
      const n = ids.length;
      if (action === 'bulk-complete')      toast?.success?.(`Completed ${n} task${n === 1 ? '' : 's'}`, { duration: 2400 });
      else if (action === 'bulk-push')      toast?.success?.(`Pushed ${n} task${n === 1 ? '' : 's'} ${payload.days}d out`, { duration: 2400 });
      else if (action === 'bulk-set-date')  toast?.success?.(`Set ${n} task${n === 1 ? '' : 's'} due ${payload.date}`, { duration: 2400 });
      else if (action === 'bulk-create-task') toast?.success?.(`Created ${n} task${n === 1 ? '' : 's'} from “${payload.template?.name || 'template'}”`, { duration: 2800 });
    } else {
      await runOne(ids[0]);
      if (action === 'create-task') {
        toast?.success?.(`Task “${payload.template?.name || 'template'}” created`, { duration: 2800 });
      }
    }
  }, [selected, patchTaskLocal, toast]);

  const onRunCampaign = () => {
    // Hand off to the Campaign Manager submodal which owns the picker,
    // engine, and CRM-UI control. Until that lands, surface a TODO toast.
    if (typeof window.__gbShowCampaignEditor === 'function') {
      window.__gbShowCampaignEditor();
    } else {
      toast?.info?.('Campaign manager — coming later', { duration: 2400, placement: 'top-center' });
    }
  };

  /* Export selected tasks to CSV. Mirrors the CRMSearch exporter —
     same RFC 4180 escaping, UTF-8 BOM for Excel, same blob+anchor
     download pattern. Columns reflect the row data shape (account,
     contact, due date, category, priority, subject, status). */
  const exportSelectedCSV = useCallback(() => {
    const rows = visibleTasks.filter((t) => selected.has(t.id));
    if (!rows.length) {
      toast?.warning?.('No tasks selected', { duration: 2500 });
      return;
    }
    const columns = [
      { key: 'id',            label: 'Task ID' },
      { key: 'account',       label: 'Account' },
      { key: 'accountUrl',    label: 'Account URL' },
      { key: 'contact',       label: 'Contact' },
      { key: 'contactUrl',    label: 'Contact URL' },
      { key: 'due',           label: 'Due Date' },
      { key: 'category',      label: 'Category' },
      { key: 'priorityLabel', label: 'Priority' },
      { key: 'subject',       label: 'Subject' },
      { key: 'status',        label: 'Status' },
    ];
    const esc = (v) => {
      if (v == null) return '';
      const raw = Array.isArray(v) ? v.join('; ') : String(v);
      return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
    };
    const lines = [
      columns.map((c) => esc(c.label)).join(','),
      ...rows.map((t) => columns.map((c) => esc(t[c.key])).join(',')),
    ];
    const csv = '﻿' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast?.success?.(`Exported ${rows.length} task${rows.length === 1 ? '' : 's'} to CSV`);
  }, [visibleTasks, selected, toast]);

  const [lastIdx, setLastIdx] = useState(null);

  // ── Subtitle ─────────────────────────────────────────────────
  const subtitle = useMock
    ? <span>My open tasks · <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-warning-fg)', fontWeight: 700, fontSize: 10 }}>OFFLINE / MOCK</span></span>
    : status === 'loading'
      ? 'Loading tasks…'
      : status === 'error'
        ? 'Could not load tasks'
        : `${visibleTasks.length} of ${tasks.length} task${tasks.length === 1 ? '' : 's'}`;

  const selCount = selected.size;
  const hasSelection = selCount > 0;

  /* Selected-task → contact tuples for the Email Runner side panel.
     Tasks built from a real CRM scrape carry contactUrl
     (Page=240&customerID=…). Mock tasks ship with an empty
     contactUrl, so in useMock we synthesise a `mock://…` placeholder
     — EmailRunner's mock dispatchBg returns canned HTML regardless of
     the URL, so the loop runs and the rep sees the per-row animation.
     `contactId` here is the task row id (not the underlying contact's
     customerId) — that's the key TaskRow uses to look itself up in
     emailStatusByRow when the EmailRunner pumps a row-level update. */
  const selectedContacts = useMemo(() => visibleTasks
    .filter((t) => selected.has(t.id) && (t.contactUrl || useMock))
    .map((t) => ({
      contactId:   t.id,
      contactName: t.contact || '',
      contactUrl:  t.contactUrl || (useMock ? `mock://contact/${t.id}` : ''),
    })), [visibleTasks, selected, useMock]);

  return (
    <>
    <FloatingPanel
      width={1000}
      height={640}
      backdrop
      draggable={draggable}
      onClose={onClosed}
      bindClose={handleBindClose}
    >
      <ModalHeader
        icon={<TasksIcon size={14} />}
        title="My Task List"
        subtitle={subtitle}
      />

      {/* Toolbar — search + status + priority + refresh */}
      <div style={{
        padding: 12,
        borderBottom: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-surface-1)',
        display: 'flex', gap: 8, alignItems: 'center',
        flexShrink: 0,
      }}>
        <Input
          value={query}
          onChange={setQuery}
          placeholder="Search account, contact, subject…"
          leading={<I.search size={12} />}
          style={{ flex: 1 }}
        />
        <Dropdown
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_OPTS}
          style={{ width: 150 }}
        />
        <Dropdown
          value={priorityFilter}
          onChange={setPriorityFilter}
          options={PRIORITY_OPTS}
          style={{ width: 150 }}
        />
        <Btn
          size="sm"
          variant="secondary"
          icon={<RefreshIcon />}
          onClick={loadTasks}
          disabled={status === 'loading'}
        >Refresh</Btn>
      </div>

      {/* "Urgent only" filter chip — visible whenever dueFilter is on.
          Set by the modal-aware action shelf entry ("Only overdue +
          due today"); clears via the × on the chip. Mirrors the QB
          filter bar in CRMSearch so the active narrowing is always
          surfaced inline rather than buried in a sub-menu. */}
      <AnimatePresence initial={false}>
        {dueFilter === 'urgent' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 18px',
              background: 'var(--gb-brand-tint-soft)',
              borderBottom: '1px solid var(--gb-brand-tint-border)',
              fontSize: 11, fontWeight: 600,
              color: 'var(--gb-brand-label)',
              flexShrink: 0,
            }}
          >
            <I.bolt size={11} />
            <span>Showing overdue + due today only</span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => setDueFilter('all')}
              style={{
                background: 'transparent', border: 'none', padding: 0,
                fontSize: 11, fontWeight: 600,
                color: 'var(--gb-brand-label)',
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
              }}
            >Clear</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selection summary — slides in at the TOP when rows are checked.
          Matches CRMSearch's pattern. Hosts the campaign workflow so the
          user doesn't have to scroll past the table to act on selections.
          Footer below keeps the simpler row-level actions (Quick Task,
          Open Tabs) always discoverable. */}
      <AnimatePresence initial={false}>
        {hasSelection && (
          <motion.div
            key="sel-bar"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden', flexShrink: 0 }}
          >
            <div style={{
              padding: '8px 14px',
              borderBottom: '1px solid var(--gb-border-subtle)',
              background: 'var(--gb-brand-tint-soft)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)' }}>
                <span style={{ color: 'var(--gb-brand-label)', fontWeight: 700 }}>{selCount} selected</span>
                {' '}of {visibleTasks.length} task{visibleTasks.length === 1 ? '' : 's'}
              </div>
              <div style={{ flex: 1 }} />
              {/* Same trio as CRMSearch: Run Campaign hands off to the
                  Campaign Manager submodal, Email selected to the same
                  manager when wired, Export CSV serializes the visible
                  selection. Styling intentionally mirrors CRMSearch so
                  both selection bars feel like the same control. */}
              <Btn
                size="sm"
                variant="ghost"
                icon={<MegaphoneIcon />}
                onClick={onRunCampaign}
              >Run campaign</Btn>
              <Btn
                size="sm"
                variant="ghost"
                icon={<I.mail size={11} />}
                onClick={(e) => {
                  setEmailRunnerCursor({ x: e.clientX, y: e.clientY });
                  setEmailRunnerOpen(true);
                }}
              >Email selected</Btn>
              <Btn size="sm" variant="ghost" icon={<I.copy size={11} />} onClick={exportSelectedCSV}>Export CSV</Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <TasksTable
          rows={visibleTasks}
          status={status}
          query={query}
          allChecked={allVisibleSelected}
          selected={selected}
          onToggle={toggleSel}
          onToggleAll={toggleAll}
          sortChain={sortChain}
          onSort={onSortClick}
          onQuickMenu={(id, anchor) => setQt({ mode: 'main', taskId: id, anchor })}
          busyRows={busyRowsRef.current}
          emailStatusByRow={emailStatusByRow}
        />
        {/* re-render hook — busyVersion changes force the table to repick
            up busyRowsRef without doing structural state churn */}
        <span hidden>{busyVersion}</span>
      </div>

      {/* Footer — always-on row-level bulk actions. Quick Task creates
          a templated task on each selected row; Open Tabs opens every
          selected contact in a new tab. Both gated on selection. */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-surface-1)',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>
          {hasSelection
            ? <>Bulk actions for <strong style={{ color: 'var(--gb-text-secondary)' }}>{selCount}</strong> selected</>
            : 'Select rows above to enable bulk actions'}
        </div>
        <div style={{ flex: 1 }} />
        <Btn
          size="sm"
          variant="ghost"
          icon={<OpenTabsIcon />}
          disabled={!hasSelection}
          onClick={openSelectedTabs}
        >Open Tabs</Btn>
        <Btn
          size="sm"
          variant="ghost"
          icon={<I.bolt size={11} />}
          disabled={!hasSelection}
          onClick={onQuickTask}
        >Quick Task</Btn>
      </div>

      {/* Quick-Task floating menu — portal'd so it can escape any
          overflow clipping on the modal body. Anchored to whichever
          trigger button opened it via `qt.anchor`. The pushDays
          number lives INSIDE the menu now (inline number input on
          the Push Out row) so the footer stays uncluttered. */}
      <QuickTaskMenu
        qt={qt}
        pushDays={pushDays}
        setPushDays={setPushDays}
        taskTpls={taskTpls}
        selectedCount={selCount}
        getTask={(id) => tasks.find((t) => t.id === id)}
        onClose={() => setQt(null)}
        onNavigate={(next) => setQt((cur) => cur ? { ...cur, ...next } : null)}
        onAction={runQuickAction}
      />
    </FloatingPanel>

    {/* Email Runner side panel — sits to the right with air between,
        no hide pattern (both modals stay visible at the same time). */}
    <EmailRunner
      open={emailRunnerOpen}
      anchorHostId="__gb-tl"
      cursor={emailRunnerCursor}
      useMock={useMock}
      contacts={selectedContacts}
      onClose={() => setEmailRunnerOpen(false)}
      onResetRowStates={() => setEmailStatusByRow({})}
      onRowStart={(id) => setEmailStatusByRow((m) => ({ ...m, [id]: 'sending' }))}
      onRowDone={(id, outcome) => setEmailStatusByRow((m) => ({ ...m, [id]: outcome.status }))}
    />
    </>
  );
}

/* ── TasksTable ──────────────────────────────────────────────
   Columns mirror the legacy modal's set + order: Checkbox, Account,
   Contact, Due Date, Category, Priority, Subject, Status, Action. */
const COLS = '30px 1.3fr 1.1fr 100px 1.0fr 70px 1.5fr 90px 110px';

/* Scan beam — same three-layer overlay CRMSearch uses (gradient body
   + two glowing hairlines) absolutely positioned over the active
   sending row. translateY transition slides between rows when the
   orchestrator advances. */
function ScanBeam({ top, height }) {
  const transition = 'transform .35s cubic-bezier(.3,.7,.2,1)';
  return (
    <>
      <div aria-hidden style={{
        position: 'absolute', left: 0, right: 0, top: 0,
        transform: `translateY(${top}px)`,
        height,
        background: 'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--gb-brand-label) 16%, transparent) 35%, color-mix(in srgb, var(--gb-brand-label) 28%, transparent) 50%, color-mix(in srgb, var(--gb-brand-label) 16%, transparent) 65%, transparent 100%)',
        transition,
        pointerEvents: 'none',
        zIndex: 3,
      }} />
      <div aria-hidden style={{
        position: 'absolute', left: 0, right: 0, top: 0,
        transform: `translateY(${top}px)`,
        height: 1,
        background: 'var(--gb-brand-label)',
        boxShadow: '0 0 14px 1px var(--gb-brand-label)',
        transition, pointerEvents: 'none', zIndex: 4,
      }} />
      <div aria-hidden style={{
        position: 'absolute', left: 0, right: 0, top: 0,
        transform: `translateY(${top + height}px)`,
        height: 1,
        background: 'var(--gb-brand-label)',
        boxShadow: '0 0 14px 1px var(--gb-brand-label)',
        transition, pointerEvents: 'none', zIndex: 4,
      }} />
    </>
  );
}

function TasksTable({ rows, status, query, allChecked, selected, onToggle, onToggleAll, sortChain = [], onSort, onQuickMenu, busyRows, emailStatusByRow = {} }) {
  /* Beam dwells on the last 'sending' row through the inter-send
     delay so the visual stays tied to the orchestrator's cursor.
     Mirrors CRMSearch's behaviour exactly. */
  const containerRef = useRef(null);
  const [activeRowId, setActiveRowId] = useState(null);
  useEffect(() => {
    if (Object.keys(emailStatusByRow).length === 0) {
      setActiveRowId(null);
      return;
    }
    for (const [id, st] of Object.entries(emailStatusByRow)) {
      if (st === 'sending') {
        setActiveRowId(id);
        return;
      }
    }
    // No row currently sending — keep activeRowId on the last one
    // so the beam dwells through the inter-send delay.
  }, [emailStatusByRow]);
  const [scanRect, setScanRect] = useState(null);
  useEffect(() => {
    if (!activeRowId) { setScanRect(null); return; }
    const root = containerRef.current;
    if (!root) return;
    const safeId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(activeRowId) : String(activeRowId).replace(/"/g, '\\"');
    const el = root.querySelector(`[data-row-id="${safeId}"]`);
    if (el) setScanRect({ top: el.offsetTop, height: el.offsetHeight });
  }, [activeRowId, rows]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Sticky header — sortable. Click a label to set sort; click
          again to toggle direction. The arrow next to the label
          indicates the active column. */}
      <div style={{
        display: 'grid', gridTemplateColumns: COLS,
        padding: '8px 14px', gap: 12,
        background: 'var(--gb-surface-1)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        fontSize: 9.5, fontWeight: 700, letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'var(--gb-text-muted)',
        position: 'sticky', top: 0, zIndex: 1,
      }}>
        <div>
          <Checkbox checked={allChecked} onChange={onToggleAll} />
        </div>
        <SortHeader col={SORT_COLS.account}  sortChain={sortChain} onSort={onSort} />
        <SortHeader col={SORT_COLS.contact}  sortChain={sortChain} onSort={onSort} />
        <SortHeader col={SORT_COLS.dueDate}  sortChain={sortChain} onSort={onSort} />
        <SortHeader col={SORT_COLS.category} sortChain={sortChain} onSort={onSort} />
        <SortHeader col={SORT_COLS.priority} sortChain={sortChain} onSort={onSort} />
        <SortHeader col={SORT_COLS.subject}  sortChain={sortChain} onSort={onSort} />
        <div>Status</div>
        <div style={{ textAlign: 'right' }}>Action</div>
      </div>

      {status === 'loading' && (
        <EmptyRow><Spinner /> Loading tasks…</EmptyRow>
      )}
      {status === 'error' && rows.length === 0 && (
        <EmptyRow tone="error">Couldn’t load tasks. Try Refresh, or use the toast’s template data.</EmptyRow>
      )}
      {status === 'ready' && rows.length === 0 && (
        <EmptyRow>
          {query
            ? <>No tasks match <strong style={{ color: 'var(--gb-text-secondary)' }}>“{query}”</strong>.</>
            : <>No tasks match your filters.</>}
        </EmptyRow>
      )}

      {status === 'ready' && rows.map((t, idx) => (
        <TaskRow
          key={t.id}
          task={t}
          isSelected={selected.has(t.id)}
          isBusy={busyRows?.has(t.id) || false}
          emailStatus={emailStatusByRow[t.id]}
          onToggle={(e) => onToggle(t.id, idx, e?.shiftKey)}
          onQuickMenu={onQuickMenu}
        />
      ))}
      {/* Same moving light bar CRMSearch has — sweeps over the
          currently-sending row and stays on it through the delay
          to the next send. */}
      {scanRect && <ScanBeam top={scanRect.top} height={scanRect.height} />}
    </div>
  );
}

function SortHeader({ col, sortChain = [], onSort }) {
  /* Where does this column sit in the active sort chain? -1 = not in
     the chain. When chain length is 1 we only show the direction
     arrow; with 2+ entries we also show a small "1"/"2"/"3" rank
     badge so the user can see the priority order they built. */
  const idx = sortChain.findIndex((c) => c.key === col.key);
  const active = idx !== -1;
  const dir = active ? sortChain[idx].dir : null;
  const showRank = sortChain.length > 1 && active;
  return (
    <button
      type="button"
      onClick={(e) => onSort(col.key, e)}
      title={`Click to sort by ${col.label}. Shift-click to add as a secondary sort.`}
      style={{
        background: 'transparent', border: 'none', padding: 0,
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit',
        textTransform: 'inherit',
        color: active ? 'var(--gb-brand-label)' : 'inherit',
        fontFamily: 'inherit',
      }}
    >
      {col.label}
      {active && (
        <span style={{ fontSize: 8, lineHeight: 1 }}>{dir === 'asc' ? '▲' : '▼'}</span>
      )}
      {showRank && (
        <span style={{
          fontSize: 8.5, fontWeight: 800, lineHeight: 1,
          fontFamily: 'var(--gb-font-mono)',
          minWidth: 12, height: 12, padding: '0 3px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--gb-brand-tint-medium)',
          color: 'var(--gb-brand-label)',
          border: '1px solid var(--gb-brand-tint-border)',
          borderRadius: 999,
        }}>{idx + 1}</span>
      )}
    </button>
  );
}

function TaskRow({ task, isSelected, isBusy, emailStatus, onToggle, onQuickMenu }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue  = task.dueDate < today && task.status !== 'Complete';
  const dueToday = task.dueDate.toDateString() === today.toDateString();
  const complete = task.status === 'Complete';

  return (
    <div
      data-row-id={task.id}
      style={{
        display: 'grid', gridTemplateColumns: COLS,
        padding: '10px 14px', gap: 12,
        alignItems: 'center',
        background: isSelected ? 'var(--gb-brand-tint-soft)' : 'transparent',
        borderBottom: '1px solid var(--gb-border-subtle)',
        fontSize: 12,
        cursor: 'pointer',
        transition: 'background-color .15s',
        opacity: complete ? 0.65 : 1,
      }}
      onClick={(e) => {
        if (e.target.closest('a, button, [data-checkbox]')) return;
        onToggle(e);
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Checkbox checked={isSelected} onChange={(e) => onToggle(e)} />
        {/* Tiny status dot — red for overdue, amber for due today.
            Only shown on incomplete tasks; the row's date column is
            also color-coded but the dot is a faster visual scan. */}
        {overdue && (
          <span
            title="Overdue"
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--gb-error)',
              boxShadow: '0 0 4px color-mix(in srgb, var(--gb-error) 60%, transparent)',
              flexShrink: 0,
            }}
          />
        )}
        {!overdue && dueToday && (
          <span
            title="Due today"
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--gb-warning)',
              boxShadow: '0 0 4px color-mix(in srgb, var(--gb-warning) 60%, transparent)',
              flexShrink: 0,
            }}
          />
        )}
      </div>
      {task.accountUrl ? (
        <a
          href={task.accountUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--gb-text-primary)',
            fontWeight: 600, textDecoration: 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gb-brand-label)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--gb-text-primary)'; }}
        >{task.account}</a>
      ) : (
        <span style={{
          color: 'var(--gb-text-primary)', fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{task.account}</span>
      )}
      {task.contactUrl ? (
        <a
          href={task.contactUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--gb-text-secondary)',
            textDecoration: 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gb-brand-label)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--gb-text-secondary)'; }}
        >{task.contact}</a>
      ) : (
        <span style={{
          color: 'var(--gb-text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{task.contact}</span>
      )}
      <div style={{
        fontFamily: 'var(--gb-font-mono)', fontSize: 11,
        color: overdue ? 'var(--gb-error-fg)' : dueToday ? 'var(--gb-warning-fg)' : 'var(--gb-text-tertiary)',
        fontWeight: (overdue || dueToday) ? 600 : 500,
        fontVariantNumeric: 'tabular-nums',
      }}>{fmtDate(task.dueDate)}</div>
      <div style={{
        color: 'var(--gb-text-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{task.category || '—'}</div>
      <div>
        <Tag tone={PRIORITY_TONE[task.priority] || 'neutral'} size="xs">
          {task.priorityLabel || (task.priority === 1 ? 'High' : task.priority === 3 ? 'Low' : 'Med')}
        </Tag>
      </div>
      <div style={{
        color: 'var(--gb-text-secondary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{task.subject}</div>
      <div>
        <Tag tone={complete ? 'success' : 'info'} size="xs">
          {complete ? 'Complete' : 'New'}
        </Tag>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {/* Quick Task button swaps to the live email-send status while
            a blast is touching this row. Same cell, no layout shift —
            matches the Quick Actions row-spinner pattern. AnimatePresence
            cross-fades the content so the swap reads as one motion. */}
        <AnimatePresence mode="wait" initial={false}>
          {emailStatus ? (
            <motion.div
              key={`email-${emailStatus}`}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              style={{
                height: 26, padding: '0 10px',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: emailStatus === 'error'
                  ? 'var(--gb-error-tint-soft, var(--gb-surface-2))'
                  : emailStatus === 'sent'
                    ? 'var(--gb-brand-tint-soft)'
                    : 'var(--gb-surface-2)',
                border: '1px solid ' + (
                  emailStatus === 'error' ? 'var(--gb-error-tint-border, var(--gb-border-default))'
                  : emailStatus === 'sent' ? 'var(--gb-brand-tint-border)'
                  : 'var(--gb-border-default)'
                ),
                borderRadius: 'var(--gb-r-sm)',
                color: emailStatus === 'error'
                  ? 'var(--gb-error-fg)'
                  : emailStatus === 'sent'
                    ? 'var(--gb-brand-label)'
                    : 'var(--gb-text-tertiary)',
                fontSize: 10.5, fontWeight: 700,
                letterSpacing: 0.5, textTransform: 'uppercase',
                userSelect: 'none',
              }}
            >
              {emailStatus === 'sending' && <><Spinner size={11} /> Sending</>}
              {emailStatus === 'sent'    && <><CheckIcon size={11} /> Sent</>}
              {emailStatus === 'error'   && <>Failed</>}
            </motion.div>
          ) : (
            <motion.button
              key="qt-btn"
              type="button"
              data-checkbox /* reuses TaskRow's "don't toggle on click" sentinel */
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                onQuickMenu?.(task.id, rect);
              }}
              disabled={isBusy}
          style={{
            height: 26, padding: '0 8px',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'var(--gb-surface-2)',
            border: '1px solid var(--gb-border-default)',
            borderRadius: 'var(--gb-r-sm)',
            color: 'var(--gb-text-secondary)',
            fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
            cursor: isBusy ? 'wait' : 'pointer',
            opacity: isBusy ? 0.6 : 1,
            transition: 'background-color .12s, color .12s, border-color .12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--gb-surface-3)'; e.currentTarget.style.color = 'var(--gb-text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--gb-surface-2)'; e.currentTarget.style.color = 'var(--gb-text-secondary)'; }}
        >
          {isBusy ? (
            <Spinner />
          ) : (
            <>
              Quick Task
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </>
          )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* Same checkbox shape as CRMSearch's, kept inline so the modal stays
   self-contained. When we add the per-row campaign-run spinner this is
   the slot it'll occupy. */
function Checkbox({ checked, onChange }) {
  return (
    <button
      type="button"
      data-checkbox
      onClick={(e) => { e.stopPropagation(); onChange?.(e); }}
      style={{
        width: 16, height: 16, padding: 0,
        background: checked ? 'var(--gb-brand-tint-medium)' : 'transparent',
        border: '1.5px solid ' + (checked ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'),
        borderRadius: 4,
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--gb-brand-label)',
        outline: 'none',
        transition: 'background-color .12s, border-color .12s',
      }}
    >
      <AnimatePresence initial={false}>
        {checked && (
          <motion.span
            key="ck"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.12 }}
            style={{ display: 'flex' }}
          >
            <I.check size={10} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

function EmptyRow({ children, tone }) {
  return (
    <div style={{
      padding: '36px 14px',
      textAlign: 'center',
      fontSize: 12,
      color: tone === 'error' ? 'var(--gb-error-fg)' : 'var(--gb-text-tertiary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>{children}</div>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" style={{
        animation: 'gbTlSpin 1s linear infinite', transformOrigin: 'center',
      }} />
      <style>{`@keyframes gbTlSpin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}

const TasksIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);
const RefreshIcon = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 .49-4.49" />
  </svg>
);
const OpenTabsIcon = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);
const MegaphoneIcon = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11l18-8v18l-18-8z" />
    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </svg>
);

/* ── QuickTaskMenu ───────────────────────────────────────────
   Floating menu used by both the per-row Quick Task button and
   the bulk Quick Task button in the footer. Portal'd to body so
   it can escape the modal's overflow:hidden clipping. */
const CalIcon = ({ size = 13 }) => (
  <svg width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const CheckIcon = ({ size = 13 }) => (
  <svg width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const PlusIcon = ({ size = 13 }) => (
  <svg width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);
const ChevRight = ({ size = 11 }) => (
  <svg width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const ChevLeft = ({ size = 11 }) => (
  <svg width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

function todayInput() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dateInputToApi(val) {
  if (!val) return null;
  const [y, m, d] = val.split('-');
  return `${m}/${d}/${y}`;
}

/* Hide the native number-input spinner buttons. Injected once at first
   QuickTaskMenu mount — the rules use ::-webkit-… and -moz-appearance so
   both engines drop the arrows. Applied via the gb-no-spin class on the
   PushRow input so we don't leak this into any other number field. */
const GB_NO_SPIN_STYLE_ID = '__gb-no-spin-style';
function ensureNoSpinStyle() {
  if (typeof document === 'undefined' || document.getElementById(GB_NO_SPIN_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = GB_NO_SPIN_STYLE_ID;
  el.textContent = `
    .gb-no-spin::-webkit-outer-spin-button,
    .gb-no-spin::-webkit-inner-spin-button {
      -webkit-appearance: none !important;
      margin: 0 !important;
      display: none !important;
    }
    .gb-no-spin { -moz-appearance: textfield !important; appearance: textfield !important; }
  `;
  document.head.appendChild(el);
}

function QuickTaskMenu({ qt, pushDays, setPushDays, taskTpls, selectedCount, getTask, onClose, onNavigate, onAction }) {
  const ref = useRef(null);
  const dateRef = useRef(null);
  const [dateVal, setDateVal] = useState(todayInput);

  useEffect(() => { ensureNoSpinStyle(); ensureMarchingAntsStyle(); }, []);

  /* Keyboard nav for the menu's actionable rows. Same pattern as
     CallLog's Quick log: -1 = idle (menu just opened), first Tab
     highlights the top row, subsequent Tabs walk forward, Shift+Tab
     walks back. Enter fires the active row's onClick. The visible
     row components register their onActivate into rowsRef during
     render so the registry stays in source / DOM order. */
  const [activeRowIdx, setActiveRowIdx] = useState(-1);
  const rowsRef = useRef([]);
  rowsRef.current = []; // reset at the start of every render — items push back below
  // Reset highlight on mode change so a fresh pane starts idle.
  useEffect(() => { setActiveRowIdx(-1); }, [qt?.mode]);

  /* Scroll the active row into view inside the menu container —
     mainly for the templates pane which scrolls when there are
     more than ~6 templates. We find the row via data-qt-row so we
     don't need a per-row ref (which would force every Item rerun
     to keep the same identity, and the inline definitions don't). */
  useEffect(() => {
    if (activeRowIdx < 0) return;
    const root = ref.current;
    if (!root) return;
    const el = root.querySelector(`[data-qt-row="${activeRowIdx}"]`);
    if (el) {
      try { el.scrollIntoView({ block: 'nearest' }); } catch {}
    }
  }, [activeRowIdx]);
  useEffect(() => {
    if (!qt) return undefined;
    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName && el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || el.isContentEditable;
    };
    const onKey = (e) => {
      // Esc handled by the existing outside-click close (mousedown
      // only) — we add explicit support here so the keyboard nav
      // user can dismiss without reaching for the mouse.
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Enter' && activeRowIdx >= 0) {
        const onActivate = rowsRef.current[activeRowIdx];
        if (typeof onActivate === 'function') {
          e.preventDefault();
          onActivate();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      // Typing into the date input / number input shouldn't be
      // hijacked — let those fields handle Tab normally so the user
      // can move out of them.
      if (isTypingTarget(e.target)) return;
      const total = rowsRef.current.length;
      if (total === 0) return;
      e.preventDefault();
      try { document.activeElement?.blur?.(); } catch {}
      setActiveRowIdx((i) => {
        if (e.shiftKey) {
          if (i <= 0) return total - 1;
          return i - 1;
        }
        if (i < 0) return 0;
        return (i + 1) % total;
      });
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [qt, activeRowIdx, onClose]);

  /* Click-outside dismiss. Captures on capture phase so a click on the
     same trigger that opened us doesn't immediately reopen + close in
     the same gesture (the trigger calls setQt → we'd close, then the
     trigger's own onClick fires and reopens — unless we ignore clicks
     that originate inside .qt-trigger / data-qt-trigger). */
  useEffect(() => {
    if (!qt) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    // Use a microtask so the same click that opened the menu doesn't immediately close it
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', onDown); };
  }, [qt, onClose]);

  // Reset the date input each time we enter the datePicker pane.
  useEffect(() => {
    if (qt?.mode === 'datePicker') {
      setDateVal(todayInput());
      setTimeout(() => dateRef.current?.focus(), 30);
    }
  }, [qt?.mode]);

  if (!qt || !qt.anchor) return null;

  // Position: below the anchor by default. Flip above if the menu
  // would clip the viewport.
  const MENU_W = 190;
  const MENU_H_EST = qt.mode === 'templates' ? 260 : 200;
  const anchor = qt.anchor;
  const spaceBelow = window.innerHeight - anchor.bottom;
  const placeAbove = spaceBelow < MENU_H_EST + 12;
  const top = placeAbove ? Math.max(8, anchor.top - MENU_H_EST - 6) : anchor.bottom + 6;
  const left = Math.min(
    Math.max(8, anchor.right - MENU_W),
    window.innerWidth - MENU_W - 8
  );

  const task = qt.taskId && qt.taskId !== 'bulk' ? getTask(qt.taskId) : null;
  const isComplete = task?.status === 'Complete';
  const isBulk = qt.taskId === 'bulk';

  const itemStyle = {
    padding: '8px 10px',
    fontSize: 12, fontWeight: 500,
    color: 'var(--gb-text-secondary)',
    cursor: 'pointer',
    borderRadius: 'var(--gb-r-sm)',
    display: 'flex', alignItems: 'center', gap: 8,
    transition: 'background-color .1s, color .1s',
    whiteSpace: 'nowrap',
    background: 'transparent',
    border: 'none',
    width: '100%',
    fontFamily: 'inherit',
    textAlign: 'left',
  };
  /* Item registers itself into rowsRef during render so the menu's
     keyboard nav can find it by index. data-qt-row carries the same
     index in the DOM so the parent-side scroll effect (below) can
     find the active row's <button> without needing per-item refs
     — important because Item is redefined every render, so a hook
     inside it would re-fire continuously. */
  const Item = ({ icon, label, accent, onClick, trailing }) => {
    const idx = rowsRef.current.length;
    rowsRef.current.push(onClick);
    const isActive = idx === activeRowIdx;
    return (
      <button
        type="button"
        data-qt-row={idx}
        className={isActive ? 'gb-kbd-active' : undefined}
        onClick={onClick}
        style={{
          ...itemStyle,
          color: accent || itemStyle.color,
          background: 'transparent',
        }}
        onMouseEnter={(e) => {
          if (isActive) return;
          e.currentTarget.style.background = 'var(--gb-fill-hover)';
          e.currentTarget.style.color = accent ? accent : 'var(--gb-text-primary)';
        }}
        onMouseLeave={(e) => {
          if (isActive) return;
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = accent || 'var(--gb-text-secondary)';
        }}
      >
        {icon}
        <span style={{ flex: 1 }}>{label}</span>
        {trailing}
      </button>
    );
  };

  const Header = ({ children }) => (
    <div style={{
      padding: '6px 10px 5px',
      fontSize: 9.5, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: 0.6,
      color: 'var(--gb-text-muted)',
      display: 'flex', alignItems: 'center', gap: 6,
      borderBottom: '1px solid var(--gb-border-subtle)',
      marginBottom: 3,
    }}>{children}</div>
  );

  const Back = ({ onClick }) => {
    const idx = rowsRef.current.length;
    rowsRef.current.push(onClick);
    const isActive = idx === activeRowIdx;
    return (
      <button
        type="button"
        data-qt-row={idx}
        className={isActive ? 'gb-kbd-active' : undefined}
        onClick={onClick}
        style={{
          ...itemStyle,
          color: 'var(--gb-text-muted)',
          fontWeight: 600,
          fontSize: 11.5,
          borderBottom: '1px solid var(--gb-border-subtle)',
          marginBottom: 3,
          borderRadius: 0,
          background: 'transparent',
        }}
        onMouseEnter={(e) => {
          if (isActive) return;
          e.currentTarget.style.background = 'var(--gb-fill-hover)';
          e.currentTarget.style.color = 'var(--gb-text-primary)';
        }}
        onMouseLeave={(e) => {
          if (isActive) return;
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--gb-text-muted)';
        }}
      >
        <ChevLeft />
        Back
      </button>
    );
  };

  /* Push-Out row with an inline day-count input. The whole row is a
     click target that fires the push action with the current days
     value; the input gets pointer + key events isolated so typing in
     it doesn't trigger the action or the menu's outside-click close. */
  const PushRow = ({ pushDays, setPushDays, onClick }) => {
    const idx = rowsRef.current.length;
    rowsRef.current.push(onClick);
    const isActive = idx === activeRowIdx;
    return (
    <div
      onClick={onClick}
      data-qt-row={idx}
      className={isActive ? 'gb-kbd-active' : undefined}
      style={{
        ...itemStyle,
        color: 'var(--gb-info-fg)',
        cursor: 'pointer',
        background: 'transparent',
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--gb-fill-hover)'; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <CalIcon />
      <span>Push Out</span>
      <input
        type="number"
        min="1"
        value={pushDays}
        onChange={(e) => setPushDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onFocus={(e) => e.target.select()}
        // gb-no-spin hides the native up/down spinner buttons (the global
        // CSS rule is injected once below in QuickTaskMenu's effect). The
        // arrows otherwise sit on the right edge of the input and push
        // the digits off-centre, which the user flagged as looking ugly.
        className="gb-no-spin"
        style={{
          width: 38, height: 22, padding: '0 4px',
          background: 'var(--gb-surface-2)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-sm)',
          color: 'var(--gb-text-primary)',
          fontSize: 11, fontWeight: 700, fontFamily: 'var(--gb-font-mono)',
          outline: 'none',
          textAlign: 'center',
          MozAppearance: 'textfield',
        }}
      />
      <span style={{ flex: 1, fontSize: 12, color: 'var(--gb-info-fg)' }}>
        {pushDays === 1 ? 'day' : 'days'}
      </span>
    </div>
    );
  };

  let body = null;
  if (qt.mode === 'main' && task) {
    body = (
      <>
        <Header><CheckIcon size={10} /> Quick Task</Header>
        {isComplete ? (
          <Item
            icon={<svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.49"/></svg>}
            label="Reopen"
            onClick={() => onAction('reopen', { taskId: task.id })}
          />
        ) : (
          <Item
            icon={<CheckIcon />}
            label="Complete"
            accent="var(--gb-success-fg)"
            onClick={() => onAction('complete', { taskId: task.id })}
          />
        )}
        <PushRow
          pushDays={pushDays}
          setPushDays={setPushDays}
          onClick={() => onAction('push', { taskId: task.id, days: pushDays })}
        />
        <Item
          icon={<CalIcon />}
          label="Set Date"
          accent="var(--gb-info-fg)"
          trailing={<ChevRight />}
          onClick={() => onNavigate({ mode: 'datePicker', returnMode: 'main' })}
        />
        <Item
          icon={<PlusIcon />}
          label="Add Task"
          trailing={<ChevRight />}
          onClick={() => onNavigate({ mode: 'templates', returnMode: 'main' })}
        />
      </>
    );
  } else if (qt.mode === 'bulk') {
    body = (
      <>
        <Header><CheckIcon size={10} /> Quick Task — {selectedCount} selected</Header>
        <Item
          icon={<CheckIcon />}
          label="Complete All"
          accent="var(--gb-success-fg)"
          onClick={() => onAction('bulk-complete')}
        />
        <PushRow
          pushDays={pushDays}
          setPushDays={setPushDays}
          onClick={() => onAction('bulk-push', { days: pushDays })}
        />
        <Item
          icon={<CalIcon />}
          label="Set Date"
          accent="var(--gb-info-fg)"
          trailing={<ChevRight />}
          onClick={() => onNavigate({ mode: 'datePicker', returnMode: 'bulk' })}
        />
        <Item
          icon={<PlusIcon />}
          label="Add Task to All"
          trailing={<ChevRight />}
          onClick={() => onNavigate({ mode: 'templates', returnMode: 'bulk' })}
        />
      </>
    );
  } else if (qt.mode === 'datePicker') {
    const setDateAction = qt.returnMode === 'bulk' ? 'bulk-set-date' : 'set-date';
    body = (
      <>
        <Back onClick={() => onNavigate({ mode: qt.returnMode || 'main' })} />
        <Header>Set due date</Header>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 8px',
        }}>
          <input
            ref={dateRef}
            type="date"
            value={dateVal}
            onChange={(e) => setDateVal(e.target.value)}
            style={{
              flex: 1, height: 28,
              padding: '0 7px',
              borderRadius: 'var(--gb-r-sm)',
              border: '1px solid var(--gb-border-default)',
              background: 'var(--gb-surface-2)',
              color: 'var(--gb-text-primary)',
              fontSize: 11.5, fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            onClick={() => {
              const api = dateInputToApi(dateVal);
              if (!api) return;
              onAction(setDateAction, { taskId: qt.taskId, date: api });
            }}
            style={{
              height: 28, padding: '0 10px',
              borderRadius: 'var(--gb-r-sm)',
              background: 'var(--gb-brand)',
              border: '1px solid var(--gb-brand-border)',
              color: 'var(--gb-brand-text)',
              fontSize: 11.5, fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >Set</button>
        </div>
      </>
    );
  } else if (qt.mode === 'templates') {
    const tplAction = qt.returnMode === 'bulk' ? 'bulk-create-task' : 'create-task';
    body = (
      <>
        <Back onClick={() => onNavigate({ mode: qt.returnMode || 'main' })} />
        <Header>Pick a task template</Header>
        <div style={{
          maxHeight: 220, overflowY: 'auto',
          scrollbarWidth: 'thin',
        }}>
          {taskTpls.length ? (
            taskTpls.map((tpl) => (
              <Item
                key={tpl.id}
                label={tpl.name || tpl.subject || 'Untitled'}
                onClick={() => onAction(tplAction, { taskId: qt.taskId, template: tpl })}
              />
            ))
          ) : (
            <div style={{
              padding: 12, textAlign: 'center',
              fontSize: 11.5, color: 'var(--gb-text-muted)',
            }}>
              No task templates found.<br />
              Add some in the Notes editor.
            </div>
          )}
        </div>
      </>
    );
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={ref}
        key="qt-menu"
        className="gb-qtm"
        data-gb-scale="popovers"
        data-gb-kbd-scope=""
        initial={{ opacity: 0, y: placeAbove ? 4 : -4, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
        style={{
          position: 'fixed',
          top, left,
          width: MENU_W,
          zIndex: 999999,
          background: 'var(--gb-surface-elevated)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-md)',
          boxShadow: 'var(--gb-shadow-popover)',
          padding: 4,
          fontFamily: 'var(--gb-font-sans)',
        }}
      >
        {body}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
