import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPanel, ModalHeader, Btn, Input, Dropdown, Tag, IconBtn, I,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import { useDevSetting } from '../lib/devSettings.js';

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

export function TaskList({ onClosed, bindClose }) {
  const toast      = useToast();
  const draggable  = useDevSetting('taskList.draggable') ?? false;
  const forceMock  = useDevSetting('taskList.useMock')   ?? false;
  const useMock    = forceMock || !hasExtensionContext();

  const [tasks, setTasks]         = useState([]);
  const [status, setStatus]       = useState('loading');   // 'loading' | 'ready' | 'error'
  const [query, setQuery]         = useState('');
  const [statusFilter, setStatusFilter] = useState('1');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selected, setSelected]   = useState(() => new Set());
  const [sortBy, setSortBy]       = useState('dueDate');
  const [sortDir, setSortDir]     = useState('asc');

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

  /* Filter + sort, memoized on the inputs the user actually changes. */
  const visibleTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = tasks.filter((t) => {
      if (statusFilter === '1' && t.status !== 'New')      return false;
      if (statusFilter === '3' && t.status !== 'Complete') return false;
      if (priorityFilter && String(t.priority) !== priorityFilter) return false;
      if (q) {
        const hay = `${t.account} ${t.contact} ${t.subject} ${t.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    rows = rows.slice().sort((a, b) => {
      if (sortBy === 'dueDate')  return dir * (a.dueDate - b.dueDate);
      if (sortBy === 'priority') return dir * (a.priority - b.priority);
      const av = (a[sortBy] || '').toLowerCase();
      const bv = (b[sortBy] || '').toLowerCase();
      return dir * av.localeCompare(bv);
    });
    return rows;
  }, [tasks, query, statusFilter, priorityFilter, sortBy, sortDir]);

  // ── Selection ────────────────────────────────────────────────
  const toggleSel = (id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
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
  const onSortClick = (key) => {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(key); setSortDir('asc'); }
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
  const onQuickTask = () => {
    // Quick Task is a bulk task-template applier — pulls from the user's
    // saved templates and creates a new task per selected row. The full
    // template picker is still TODO; until it lands we surface a toast.
    toast?.info?.('Quick Task — template picker coming soon', { duration: 2800, placement: 'top-center' });
  };
  const onRunCampaign = () => {
    // Campaign run is similarly gated on the full campaign logic port.
    // The toast keeps the action discoverable without lying about state.
    toast?.info?.('Campaign logic — coming soon', { duration: 2800, placement: 'top-center' });
  };

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

  return (
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
              {/* Campaign dropdown — empty until campaign logic lands.
                  Disabled state communicates "wired but no data yet"
                  rather than hiding the affordance. */}
              <Dropdown
                value=""
                onChange={() => {}}
                options={[{ id: '', label: '— select campaign —' }]}
                disabled
                style={{ width: 220 }}
              />
              <IconBtn
                size="sm"
                variant="ghost"
                icon={<I.plus size={11} />}
                tooltip="Create or edit campaigns (coming soon)"
                onClick={() => toast?.info?.('Campaign editor — coming soon', { duration: 2200, placement: 'top-center' })}
              />
              <Btn
                size="sm"
                variant="tinted"
                status="brand"
                icon={<MegaphoneIcon />}
                onClick={onRunCampaign}
              >Run Campaign</Btn>
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
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={onSortClick}
        />
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
    </FloatingPanel>
  );
}

/* ── TasksTable ──────────────────────────────────────────────
   Columns mirror the legacy modal's set + order: Checkbox, Account,
   Contact, Due Date, Category, Priority, Subject, Status. */
const COLS = '30px 1.3fr 1.1fr 100px 1.0fr 70px 1.5fr 90px';

function TasksTable({ rows, status, query, allChecked, selected, onToggle, onToggleAll, sortBy, sortDir, onSort }) {
  return (
    <div>
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
        <SortHeader col={SORT_COLS.account}  sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        <SortHeader col={SORT_COLS.contact}  sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        <SortHeader col={SORT_COLS.dueDate}  sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        <SortHeader col={SORT_COLS.category} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        <SortHeader col={SORT_COLS.priority} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        <SortHeader col={SORT_COLS.subject}  sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
        <div>Status</div>
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

      {status === 'ready' && rows.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          isSelected={selected.has(t.id)}
          onToggle={() => onToggle(t.id)}
        />
      ))}
    </div>
  );
}

function SortHeader({ col, sortBy, sortDir, onSort }) {
  const active = sortBy === col.key;
  return (
    <button
      type="button"
      onClick={() => onSort(col.key)}
      style={{
        background: 'transparent', border: 'none', padding: 0,
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit',
        textTransform: 'inherit',
        color: active ? 'var(--gb-text-secondary)' : 'inherit',
        fontFamily: 'inherit',
      }}
    >
      {col.label}
      {active && (
        <span style={{ fontSize: 8, lineHeight: 1 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
      )}
    </button>
  );
}

function TaskRow({ task, isSelected, onToggle }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue  = task.dueDate < today && task.status !== 'Complete';
  const dueToday = task.dueDate.toDateString() === today.toDateString();
  const complete = task.status === 'Complete';

  return (
    <div
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
        onToggle();
      }}
    >
      <div>
        <Checkbox checked={isSelected} onChange={onToggle} />
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
      onClick={(e) => { e.stopPropagation(); onChange?.(); }}
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
