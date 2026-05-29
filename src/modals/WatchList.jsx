import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPanel, ModalHeader, Btn, Card, Input, Tag, Dot, Dropdown, Segmented,
  DatePicker, formatHumanDate, I,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import { useDevSetting } from '../lib/devSettings.js';

/* ───────────────────────────────────────────────────────────────
   WatchList — "My Watch List" modal. Visual structure mirrors
   the TaskListView from the redesign (Golfballs Extension Redesign.html
   → surfaces-2.jsx), repurposed as a watch list (Task List is a
   separate CRM module shipping later).

   Task shape:
     {
       id:        string
       title:     string                            (required)
       done:      bool                              (default false)
       doneAt:    number?                           (Date.now when marked done)
       priority:  'high' | 'med' | 'low'            (default 'med')
       due:       string?                           (free-form: 'Today 2pm', 'Apr 2', etc.)
       createdAt: number
       context:   null
                | { type: 'order',   id: string }
                | { type: 'contact', id: string, name?: string }
                | { type: 'account', id: string, name?: string }
     }

   Tasks can be standalone OR tied to an order/contact/account.
   The context renders inline as "Order #29103" / "Contact #4421 ·
   Marcus Chen" / "Account #2188 · Acme".

   Filters: All · Active · High priority · Completed.
   Each filter chip carries a live count badge.

   Storage: chrome.storage.local with `watchList` key when available;
   localStorage fallback so the playground page works without
   chrome.storage.
─────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'watchList';
const hasChromeStorage = (() => {
  try { return typeof chrome !== 'undefined' && !!chrome.storage?.local; }
  catch { return false; }
})();

function loadTasks() {
  return new Promise((resolve) => {
    if (hasChromeStorage) {
      chrome.storage.local.get(STORAGE_KEY, (data) => resolve(normalize(data?.[STORAGE_KEY] || [])));
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      resolve(normalize(raw ? JSON.parse(raw) : []));
    } catch { resolve([]); }
  });
}
function saveTasks(list) {
  if (hasChromeStorage) { chrome.storage.local.set({ [STORAGE_KEY]: list }); return; }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}
function subscribeTasks(onChange) {
  if (hasChromeStorage) {
    const fn = (changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) onChange(normalize(changes[STORAGE_KEY].newValue || []));
    };
    chrome.storage.onChanged.addListener(fn);
    return () => chrome.storage.onChanged.removeListener(fn);
  }
  const fn = (e) => {
    if (e.key === STORAGE_KEY) {
      try { onChange(normalize(e.newValue ? JSON.parse(e.newValue) : [])); } catch {}
    }
  };
  window.addEventListener('storage', fn);
  return () => window.removeEventListener('storage', fn);
}

/* Normalize legacy watch-list entries (entityType/orderId/reason
   shape) into the new task shape so old persisted data keeps working. */
function normalize(list) {
  return (list || []).map((raw) => {
    if (raw && typeof raw === 'object' && (raw.title || raw.priority !== undefined)) {
      // Already a task.
      return {
        id: raw.id || `t-${Math.random().toString(36).slice(2, 9)}`,
        title: String(raw.title || '').trim() || 'Untitled task',
        done: !!raw.done,
        doneAt: raw.doneAt || null,
        priority: raw.priority || 'med',
        due: raw.due || '',
        createdAt: raw.createdAt || Date.now(),
        context: raw.context || null,
      };
    }
    // Legacy shape from the original watchlist-modal.js: convert.
    const t = raw?.entityType || 'order';
    const ctx = raw?.orderId
      ? { type: t, id: String(raw.orderId), ...(raw.name ? { name: raw.name } : {}) }
      : null;
    return {
      id: raw?.id || `t-${Math.random().toString(36).slice(2, 9)}`,
      title: String(raw?.reason || 'Untitled task').slice(0, 120),
      done: false,
      doneAt: null,
      priority: 'med',
      due: '',
      createdAt: raw?.addedAt || Date.now(),
      context: ctx,
    };
  });
}

function newTask(partial = {}) {
  return {
    id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    done: false,
    doneAt: null,
    priority: 'med',
    due: '',
    createdAt: Date.now(),
    context: null,
    ...partial,
  };
}

/* Remove completed tasks whose doneAt is older than `days`. 0 = keep
   all. Returns the same array reference if nothing changed (lets the
   caller short-circuit re-renders + storage writes). */
function pruneCompleted(list, days) {
  if (!days || days <= 0 || !Array.isArray(list)) return list;
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  const kept = list.filter((t) => !(t.done && t.doneAt && t.doneAt < cutoff));
  return kept.length === list.length ? list : kept;
}

/* Did the task get marked done in the last 24h? Used for the "1
   completed today" subtitle count. */
function isDoneToday(task, nowMs) {
  if (!task.done || !task.doneAt) return false;
  return (nowMs - task.doneAt) < 24 * 3600 * 1000;
}

/* Scrape the host page for a contact / account id + name and
   return a context object suitable for seeding a new watch item.
   Returns null on any other page so the rep can still pick a type
   manually.

   ID resolution has to cover three rendering modes because the
   ASP.NET admin doesn't render the same names everywhere:
     1) bare client id            → #lblContactFirstName
     2) WebForms `ctl00_` prefix  → #ctl00_lblContactFirstName
     3) suffix attribute match    → [id$="_lblContactFirstName"]
   smart-detection.js gets away with just the bare lookup on most
   pages, but the WatchList opener was returning empty names on a
   subset — covering all three modes here makes the auto-fill
   robust regardless of which template the page chose. */
function inferContextFromPage() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  const href = window.location.href || '';
  const findEl = (id) =>
    document.getElementById(id)
    || document.getElementById(`ctl00_${id}`)
    || document.querySelector(`[id$="_${id}"]`)
    || null;
  const text = (id) => {
    const el = findEl(id);
    if (!el) return '';
    /* Span labels render as textContent; matching input fields
       expose .value. Try both so this covers display-mode and
       edit-mode page variants. */
    return ((el.value || el.textContent || '').trim()) || '';
  };
  const contactM = href.match(/[?&]customerID=(\d+)/i);
  if (contactM) {
    const first = text('lblContactFirstName') || text('tbContactFirstName');
    const last  = text('lblContactLastName')  || text('tbContactLastName');
    const name  = [first, last].filter(Boolean).join(' ').trim();
    return { type: 'contact', id: contactM[1], name };
  }
  const accountM = href.match(/[?&]accountID=(\d+)/i);
  if (accountM) {
    /* Account display page uses the bare 'Name' input. Fall back
       to the company-name label that contact pages also expose. */
    const name = text('Name') || text('lblContactCompanyName') || '';
    return { type: 'account', id: accountM[1], name };
  }
  return null;
}

/* ── Public component ────────────────────────────────────────── */
export function WatchList({ onClosed, bindClose }) {
  const toast = useToast();

  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('active'); // 'all' | 'active' | 'high' | 'done'
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null); // task id currently in edit mode (or '__new')
  const [draft, setDraft] = useState(null);         // { title, due, priority, context }
  const [resolvingIds, setResolvingIds] = useState(() => new Set());
  // Tick every 30s so urgency labels + the header critical-state badge
  // recompute as items age. 30s is the smallest sane interval — the
  // urgency thresholds are hour-grained so finer ticks waste CPU.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const now = nowMs; // alias: existing "static per render" references stay valid
  // Two-tap "Clear all" confirmation — first click arms, second clears.
  // Auto-disarms after 4s so a stray click doesn't sit in armed state.
  const [clearArmed, setClearArmed] = useState(false);
  useEffect(() => {
    if (!clearArmed) return undefined;
    const id = setTimeout(() => setClearArmed(false), 4000);
    return () => clearTimeout(id);
  }, [clearArmed]);

  // Auto-delete completed items after N days (0 = keep forever).
  const autoDeleteDays = Number(useDevSetting('watchList.autoDeleteCompletedDays') ?? 5);
  const draggable = useDevSetting('watchList.draggable') ?? false;

  // Load + subscribe + prune stale completed items.
  useEffect(() => {
    let alive = true;
    loadTasks().then((list) => {
      if (!alive) return;
      const pruned = pruneCompleted(list, autoDeleteDays);
      if (pruned !== list) saveTasks(pruned);
      setTasks(pruned);
      setLoaded(true);
    });
    return subscribeTasks((next) => { if (alive) setTasks(pruneCompleted(next, autoDeleteDays)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDeleteDays]);

  const persist = useCallback((next) => {
    setTasks(next);
    saveTasks(next);
  }, []);

  // Counts for the filter chips.
  const counts = useMemo(() => {
    const all = tasks.length;
    const active = tasks.filter((t) => !t.done).length;
    const high = tasks.filter((t) => !t.done && t.priority === 'high').length;
    const done = tasks.filter((t) => t.done).length;
    return { all, active, high, done };
  }, [tasks]);

  const completedToday = useMemo(
    () => tasks.filter((t) => isDoneToday(t, now)).length,
    [tasks, now],
  );

  // Derived filtered list.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = tasks.filter((t) => {
      if (filter === 'active' && t.done) return false;
      if (filter === 'high'   && (t.done || t.priority !== 'high')) return false;
      if (filter === 'done'   && !t.done) return false;
      if (!q) return true;
      const hay = [
        t.title,
        t.context?.id,
        t.context?.name,
        t.context?.type,
        t.due,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
    // Done items sink to the bottom; active sorted by priority then created.
    const pri = { high: 0, med: 1, low: 2 };
    return [...filtered].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const pa = pri[a.priority] ?? 1;
      const pb = pri[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return a.createdAt - b.createdAt;
    });
  }, [tasks, filter, search]);

  // ── Actions ────────────────────────────────────────────────
  const toggleDone = (id) => {
    setTasks((cur) => {
      const next = cur.map((t) => t.id === id
        ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : null }
        : t);
      saveTasks(next);
      return next;
    });
  };

  const deleteTask = (id) => {
    setResolvingIds((p) => { const n = new Set(p); n.add(id); return n; });
    setTimeout(() => {
      setResolvingIds((p) => { const n = new Set(p); n.delete(id); return n; });
      setTasks((cur) => {
        const next = cur.filter((t) => t.id !== id);
        saveTasks(next);
        return next;
      });
    }, 260);
  };

  const startNew = () => {
    setEditingId('__new');
    /* Pre-fill linked context when the rep is already standing on a
       contact or account page — saves them typing the id and name
       they can see right above the popup. Falls back to standalone
       (context: null) on any other page. */
    setDraft({ title: '', due: '', priority: 'med', context: inferContextFromPage() });
  };
  const startEdit = (task) => {
    setEditingId(task.id);
    setDraft({
      title: task.title,
      due: task.due || '',
      priority: task.priority || 'med',
      context: task.context || null,
    });
  };
  const cancelEdit = () => { setEditingId(null); setDraft(null); };
  const commitEdit = () => {
    if (!editingId || !draft) return;
    const title = (draft.title || '').trim();
    if (!title) {
      // Empty title → treat as cancel; for an in-progress new task, drop it.
      cancelEdit();
      return;
    }
    if (editingId === '__new') {
      const t = newTask({
        title,
        due: draft.due,
        priority: draft.priority,
        context: draft.context,
      });
      persist([...tasks, t]);
    } else {
      const next = tasks.map((t) => t.id === editingId
        ? { ...t, title, due: draft.due, priority: draft.priority, context: draft.context }
        : t);
      persist(next);
    }
    cancelEdit();
  };

  // ── Render ────────────────────────────────────────────────
  const FILTERS = [
    { key: 'all',    label: 'All',           n: counts.all    },
    { key: 'active', label: 'Active',        n: counts.active },
    { key: 'high',   label: 'High priority', n: counts.high   },
    { key: 'done',   label: 'Completed',     n: counts.done   },
  ];

  // Urgency derives from how long an active task has been on the watch
  // list — same buckets as the legacy modal. Items 6+h old are critical;
  // the header recolors when ANY active item hits that threshold so the
  // rep can see at a glance the list needs attention.
  const criticalCount = useMemo(
    () => tasks.filter((t) => !t.done && (nowMs - (t.createdAt || nowMs)) >= 6 * 3600 * 1000).length,
    [tasks, nowMs],
  );
  const subtitle = tasks.length === 0
    ? 'Nothing yet — add something to watch'
    : (
      <span>
        <span style={{ color: criticalCount ? 'var(--gb-error-fg)' : undefined, fontWeight: criticalCount ? 700 : undefined }}>
          {counts.active} active
        </span>
        {criticalCount > 0 && (
          <span style={{ color: 'var(--gb-error-fg)' }}>
            {' · '}{criticalCount} critical
          </span>
        )}
        {completedToday > 0 && ` · ${completedToday} completed today`}
      </span>
    );

  return (
    <FloatingPanel
      width={560}
      backdrop
      draggable={draggable}
      onClose={onClosed}
      bindClose={bindClose}
    >
      <ModalHeader
        accent
        icon={<I.eye size={14} />}
        title="My Watch List"
        subtitle={subtitle}
      />

      {/* Toolbar — Segmented filters on top (sliding indicator matches
          the rest of the system), search + Watch button underneath. */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: '10px 14px',
        background: 'var(--gb-surface-1)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        flexShrink: 0,
      }}>
        <Segmented
          full
          size="md"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({
            id: f.key,
            label: <FilterLabel text={f.label} count={f.n} active={filter === f.key} />,
          }))}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Input
            value={search}
            onChange={setSearch}
            placeholder="Search title, context, or due…"
            leading={<I.search size={12} />}
            style={{ flex: 1 }}
          />
          <Btn
            size="sm"
            variant="secondary"
            icon={<I.plus size={11} />}
            onClick={startNew}
            disabled={editingId === '__new'}
          >Watch</Btn>
        </div>
      </div>

      {/* Body — clamped to a fixed visible range so the modal doesn't
          bounce in height as items add / resolve. Below minHeight the
          empty state has room to breathe; above maxHeight the list
          becomes internally scrollable. */}
      <div style={{
        minHeight: 320,
        maxHeight: 'min(56vh, 480px)',
        overflowY: 'auto', overflowX: 'hidden',
        padding: 8,
      }}>
        {/* Empty state — rendered OUTSIDE the items <AnimatePresence>
            with an instant fade. Putting it inside the same presence
            caused a stall: when items first loaded, AnimatePresence
            held space for the EmptyState's exit animation before the
            items could lay in. Here it just vanishes the moment any
            visible row exists, so the items fly in immediately. */}
        <AnimatePresence mode="popLayout" initial={false}>
          {loaded && visible.length === 0 && editingId !== '__new' && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <EmptyState filter={filter} onNew={startNew} />
            </motion.div>
          )}
        </AnimatePresence>

        <motion.ul layout style={{
          margin: 0, padding: 0, listStyle: 'none',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <AnimatePresence initial={false} mode="popLayout">
            {editingId === '__new' && (
              <TaskEditor
                key="__new"
                draft={draft}
                onChange={setDraft}
                onCommit={commitEdit}
                onCancel={cancelEdit}
                isNew
              />
            )}
            {visible.map((task, i) => (
              editingId === task.id ? (
                <TaskEditor
                  key={task.id}
                  draft={draft}
                  onChange={setDraft}
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                />
              ) : (
                <TaskRow
                  key={task.id}
                  task={task}
                  index={i}
                  nowMs={nowMs}
                  isResolving={resolvingIds.has(task.id)}
                  onToggle={() => toggleDone(task.id)}
                  onEdit={() => startEdit(task)}
                  onDelete={() => deleteTask(task.id)}
                />
              )
            ))}
          </AnimatePresence>
        </motion.ul>
      </div>

      {/* Footer — Clear All (two-tap confirm). Only shown when there
          are items to clear so it stays out of the way on empty lists. */}
      {tasks.length > 0 && (
        <div style={{
          padding: '8px 14px',
          borderTop: '1px solid var(--gb-border-subtle)',
          background: 'var(--gb-surface-1)',
          flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ flex: 1, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>
            {clearArmed
              ? <span style={{ color: 'var(--gb-error-fg)', fontWeight: 600 }}>Click again to remove all {tasks.length} items</span>
              : `${tasks.length} item${tasks.length === 1 ? '' : 's'} on watch list`}
          </div>
          <Btn
            size="sm"
            variant="ghost"
            status={clearArmed ? 'error' : undefined}
            icon={<I.trash size={11} />}
            onClick={() => {
              if (!clearArmed) { setClearArmed(true); return; }
              persist([]);
              setClearArmed(false);
              toast?.success?.('Watch list cleared', { duration: 2000 });
            }}
          >
            {clearArmed ? 'Confirm clear' : 'Clear all'}
          </Btn>
        </div>
      )}

    </FloatingPanel>
  );
}

/* ── urgency helpers ─────────────────────────────────────────
   Bucket an active watch-list item by how long it's been sitting:
   normal (<1h), moderate (1–4h), high (4–6h), critical (6+h). Done
   items return 'done' so the row can render a calmer neutral. */
export function urgencyLevel(task, nowMs = Date.now()) {
  if (task?.done) return 'done';
  const age = nowMs - (task?.createdAt || nowMs);
  if (age >= 6 * 3600 * 1000) return 'critical';
  if (age >= 4 * 3600 * 1000) return 'high';
  if (age >= 1 * 3600 * 1000) return 'moderate';
  return 'normal';
}
export const URGENCY_TINT = {
  normal:   'var(--gb-text-tertiary)',
  moderate: 'var(--gb-info-fg)',
  high:     'var(--gb-warning-fg)',
  critical: 'var(--gb-error-fg)',
  done:     'var(--gb-text-muted)',
};

/* Compact age readout used on the right edge of TaskRow when it
   isn't hovered. Minutes under an hour, hours under a day, days
   beyond — tuned for an at-a-glance sense of "how long has this
   been sitting" without taking up more than a chip's worth of
   horizontal space. */
function relAge(createdAt, nowMs) {
  const ms = Math.max(0, nowMs - (createdAt || nowMs));
  const HOUR = 3600 * 1000;
  const DAY = 24 * HOUR;
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60000))}m`;
  if (ms < DAY)  return `${Math.round(ms / HOUR)}h`;
  return `${Math.round(ms / DAY)}d`;
}

/* ── FilterLabel — label + count badge composed for Segmented.
   Segmented accepts ReactNode labels and recolors them via its
   own active/inactive tints, so we just lay out text + Tag. */
function FilterLabel({ text, count, active }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
    }}>
      {text}
      <Tag tone={active ? 'brand' : 'neutral'} size="xs">{count}</Tag>
    </span>
  );
}

/* ── TaskRow — compact ~44px two-line row.
   Layout: [checkbox] · [priority dot + title] / [context + due] · [age|actions]
   The right edge swaps the relative-age readout for Edit/Remove on hover —
   keeps the resting row clean while still putting actions one mouse-move
   away. The 3px urgency stripe on the left and the priority Dot inline
   with the title carry the same priority/urgency signal the old taller
   row used a colored border + separate row to convey. */
function TaskRow({ task, index, isResolving, onToggle, onEdit, onDelete, nowMs }) {
  const [hover, setHover] = useState(false);
  const link = contextUrl(task.context);
  const dueColor = dueLabelColor(task);
  const urgency = urgencyLevel(task, nowMs);
  const urgentColor = URGENCY_TINT[urgency];
  const showStripe = urgency !== 'normal' && urgency !== 'done';
  const ctxColor = 'var(--gb-text-tertiary)';

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={isResolving
        ? { opacity: 0, x: 18, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }
        : { opacity: task.done ? 0.55 : 1, y: 0 }
      }
      exit={{ opacity: 0, x: 18, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={isResolving
        ? { duration: 0.26, ease: [0.4, 0, 0.2, 1] }
        : { duration: 0.22, delay: Math.min(index, 8) * 0.025, ease: [0.4, 0, 0.2, 1] }
      }
      style={{ overflow: 'hidden', listStyle: 'none' }}
    >
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 10px 6px 11px',
          borderRadius: 8,
          border: '1px solid ' + (hover ? 'var(--gb-border-default)' : 'transparent'),
          background: hover ? 'var(--gb-surface-1)' : 'transparent',
          transition: 'background-color .14s, border-color .14s',
        }}
      >
        {/* Urgency stripe — 3px colored bar on the left edge keyed to
            how long the item has been sitting unresolved. Stays put
            even with the borderless resting state. */}
        <span
          aria-hidden
          style={{
            position: 'absolute', left: -1, top: 7, bottom: 7, width: 3,
            background: urgentColor,
            borderRadius: 2,
            opacity: showStripe ? 1 : 0,
            transition: 'opacity .2s, background-color .2s',
          }}
        />

        <TaskCheckbox done={task.done} onToggle={onToggle} />

        {/* Two tight lines: title (with priority dot) + context/due */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <Dot
              tone={task.priority === 'high' ? 'error' : task.priority === 'med' ? 'warning' : 'muted'}
              size={6}
            />
            <span
              title={task.title}
              style={{
                fontSize: 12.5, fontWeight: 600,
                color: 'var(--gb-text-primary)',
                textDecoration: task.done ? 'line-through' : 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >{task.title}</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginTop: 2, minWidth: 0,
            fontSize: 10.5,
          }}>
            {task.context ? (
              link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={formatContext(task.context)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    color: ctxColor, textDecoration: 'none', fontWeight: 500,
                    flexShrink: 0, maxWidth: '70%',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gb-brand-label)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = ctxColor; }}
                >
                  <ContextIcon type={task.context.type} />
                  {formatContext(task.context)}
                </a>
              ) : (
                <span
                  title={formatContext(task.context)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    color: ctxColor, fontWeight: 500,
                    flexShrink: 0, maxWidth: '70%',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  <ContextIcon type={task.context.type} />
                  {formatContext(task.context)}
                </span>
              )
            ) : (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                color: 'var(--gb-text-ghost)', fontStyle: 'italic', fontWeight: 500,
                flexShrink: 0,
              }}>
                <StandaloneIcon />
                Standalone
              </span>
            )}
            {task.due && (
              <>
                <span style={{ color: 'var(--gb-text-ghost)' }}>·</span>
                <span style={{
                  fontWeight: 600, color: dueColor,
                  flexShrink: 0, whiteSpace: 'nowrap',
                }}>{formatHumanDate(task.due)}</span>
              </>
            )}
          </div>
        </div>

        {/* Right slot — fixed 56×26 so the swap between age readout
            and action buttons happens IN PLACE. Both children are
            always rendered, only opacity + pointer-events flip.
            Without this, the unmount/mount on hover changed the
            row's intrinsic width AND height by a few pixels, and
            motion.li `layout` faithfully animated every neighbor
            to absorb the shift — the "flash" the user saw. */}
        <div style={{
          position: 'relative',
          width: 56, height: 26, flexShrink: 0,
        }}>
          <motion.span
            animate={{ opacity: hover ? 0 : 1 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              fontSize: 10.5,
              color: showStripe ? urgentColor : 'var(--gb-text-muted)',
              fontFamily: 'var(--gb-font-mono)',
              fontWeight: urgency === 'critical' ? 700 : 500,
              pointerEvents: hover ? 'none' : 'auto',
            }}
          >{task.done ? 'done' : relAge(task.createdAt, nowMs)}</motion.span>
          <motion.div
            animate={{ opacity: hover ? 1 : 0 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2,
              pointerEvents: hover ? 'auto' : 'none',
            }}
          >
            <RowAction title="Edit watch item" onClick={onEdit} icon={<I.edit size={12} />} />
            <RowAction title="Remove from watch list" onClick={onDelete} icon={<I.trash size={12} />} danger />
          </motion.div>
        </div>
      </div>
    </motion.li>
  );
}

/* Compact 26×26 ghost button used in the row's hover-revealed
   actions slot. Transparent until hovered so the resting row stays
   silent, then picks up a tinted surface — danger tone for delete. */
function RowAction({ icon, title, onClick, danger }) {
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 26, height: 26, flexShrink: 0, padding: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid ' + (h ? (danger ? 'var(--gb-error-tint-border)' : 'var(--gb-border-default)') : 'transparent'),
        background: h ? (danger ? 'var(--gb-error-tint-medium)' : 'var(--gb-fill-subtle)') : 'transparent',
        color: h ? (danger ? 'var(--gb-error-fg)' : 'var(--gb-text-secondary)') : 'var(--gb-text-muted)',
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'background-color .12s, border-color .12s, color .12s',
      }}
    >{icon}</button>
  );
}

/* ── TaskCheckbox — 18×18 rounded square, brand-fill when done. */
function TaskCheckbox({ done, onToggle }) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileTap={{ scale: 0.88 }}
      aria-pressed={done}
      style={{
        width: 18, height: 18,
        marginTop: 1, flexShrink: 0,
        padding: 0, cursor: 'pointer',
        background: done ? 'var(--gb-brand-tint-medium)' : 'transparent',
        border: '1.5px solid ' + (done ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'),
        borderRadius: 5,
        color: 'var(--gb-brand-label)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        outline: 'none',
        transition: 'background-color .15s, border-color .15s',
      }}
    >
      <AnimatePresence initial={false}>
        {done && (
          <motion.span
            key="ck"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.14 }}
            style={{ display: 'flex' }}
          >
            <I.check size={11} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/* ── TaskEditor — inline editor row used for both "new" + "edit". */
function TaskEditor({ draft, onChange, onCommit, onCancel, isNew }) {
  const titleRef = useRef(null);
  useEffect(() => { titleRef.current?.focus?.(); }, []);

  const set = (patch) => onChange({ ...draft, ...patch });
  const ctx = draft.context;

  // Local context-builder state. Type picker drives the id/name fields.
  const ctxType = ctx?.type || 'none';
  const setCtxType = (type) => {
    if (type === 'none') set({ context: null });
    else set({ context: { type, id: ctx?.id || '', name: ctx?.name || '' } });
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, marginBottom: 0 }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      style={{ overflow: 'hidden', listStyle: 'none' }}
    >
      <Card padding={12} style={{
        borderColor: 'var(--gb-border-default)',
        background: 'var(--gb-surface-2)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <Input
          nativeRef={titleRef}
          value={draft.title}
          onChange={(v) => set({ title: v })}
          placeholder={isNew ? 'What do you want to watch?' : 'Watch item title'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault(); onCommit();
            } else if (e.key === 'Escape') {
              e.preventDefault(); onCancel();
            }
          }}
        />

        {/* Priority + due on one row */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FieldLabel>Priority</FieldLabel>
            <Segmented
              full
              size="md"
              value={draft.priority}
              onChange={(v) => set({ priority: v })}
              options={[
                { id: 'high', label: 'High', icon: <Dot tone="error" /> },
                { id: 'med',  label: 'Med',  icon: <Dot tone="warning" /> },
                { id: 'low',  label: 'Low',  icon: <Dot tone="muted" /> },
              ]}
            />
          </div>
          <div style={{ flex: 1.4, minWidth: 0 }}>
            <FieldLabel>Due</FieldLabel>
            <DatePicker
              value={draft.due}
              onChange={(v) => set({ due: v })}
              placeholder="No due date"
            />
          </div>
        </div>

        {/* Context — type + id (+ optional friendly name for contacts/accounts) */}
        <div>
          <FieldLabel>Linked to</FieldLabel>
          <div style={{ display: 'flex', gap: 6 }}>
            <Dropdown
              value={ctxType}
              onChange={(v) => setCtxType(v)}
              options={[
                { id: 'none',    label: 'Standalone' },
                { id: 'order',   label: 'Order'      },
                { id: 'contact', label: 'Contact'    },
                { id: 'account', label: 'Account'    },
              ]}
              style={{ width: 130 }}
            />
            {ctxType !== 'none' && (
              <Input
                value={ctx?.id || ''}
                onChange={(v) => set({ context: { ...(ctx || { type: ctxType }), id: v } })}
                placeholder={ctxType === 'order' ? 'Order # (29103)' : `${ctxType[0].toUpperCase() + ctxType.slice(1)} ID`}
                style={{ flex: 0.9 }}
              />
            )}
            {(ctxType === 'contact' || ctxType === 'account') && (
              <Input
                value={ctx?.name || ''}
                onChange={(v) => set({ context: { ...(ctx || { type: ctxType }), name: v } })}
                placeholder={ctxType === 'contact' ? 'Name (optional)' : 'Account name (optional)'}
                style={{ flex: 1 }}
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <Btn size="sm" variant="ghost" onClick={onCancel} style={{ flex: 0 }}>Cancel</Btn>
          <div style={{ flex: 1 }} />
          <Btn
            size="sm"
            variant="tinted"
            status="brand"
            icon={<I.check size={10} />}
            onClick={onCommit}
            disabled={!draft.title.trim()}
          >{isNew ? 'Add to watch list' : 'Save'}</Btn>
        </div>
      </Card>
    </motion.li>
  );
}

function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: 'var(--gb-text-muted)',
      marginBottom: 4,
    }}>{children}</div>
  );
}

function EmptyState({ filter, onNew }) {
  const map = {
    all:    { strong: 'Nothing on your watch list', hint: 'Add a watch item to get started.' },
    active: { strong: 'No active items',            hint: 'Everything is resolved or filtered out.' },
    high:   { strong: 'No high-priority items',     hint: 'Nothing urgent in your queue.' },
    done:   { strong: 'No completed items yet',     hint: 'Mark a watch item done and it shows up here.' },
  };
  const copy = map[filter] || map.all;
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        padding: '36px 20px',
        textAlign: 'center',
        color: 'var(--gb-text-tertiary)',
      }}
    >
      <div style={{
        width: 40, height: 40,
        background: 'var(--gb-surface-2)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-md)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--gb-text-secondary)',
      }}>
        <I.eye size={18} />
      </div>
      <div>
        <strong style={{
          display: 'block',
          color: 'var(--gb-text-primary)',
          fontSize: 13, fontWeight: 700,
        }}>{copy.strong}</strong>
        <p style={{ margin: '4px 0 0', fontSize: 11.5, lineHeight: 1.55, maxWidth: 280 }}>{copy.hint}</p>
      </div>
      {filter === 'all' && (
        <Btn
          size="sm"
          variant="secondary"
          icon={<I.plus size={11} />}
          onClick={onNew}
        >Watch</Btn>
      )}
    </div>
  );
}

/* ── Context helpers ─────────────────────────────────────────── */
function contextUrl(ctx) {
  if (!ctx?.id) return '';
  const id = String(ctx.id);
  if (ctx.type === 'order')   return `https://api.golfballs.com/golfballs/adminNew/default.aspx?Page=222&orderID=${id}`;
  if (ctx.type === 'contact') return `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=${id}`;
  if (ctx.type === 'account') return `https://api.golfballs.com/golfballs/adminNew/default.aspx?Page=271&accountID=${id}`;
  return '';
}
function formatContext(ctx) {
  // The icon encodes the type — just show `#ID · Name` (or `#ID`).
  if (!ctx) return '';
  const id = ctx.id ? `#${ctx.id}` : '';
  if (ctx.name) return id ? `${id} · ${ctx.name}` : ctx.name;
  return id;
}

/* Color the due date red when it looks "urgent today", brand
   when the task is done, tertiary otherwise. Mirrors the design's
   `due === 'Today 2pm' ? error : tertiary` rule but a little smarter. */
function dueLabelColor(task) {
  if (task.done) return 'var(--gb-brand-label)';
  if (!task.due) return 'var(--gb-text-tertiary)';
  // ISO-aware: overdue = error, due within 24h = warning, else tertiary.
  const d = new Date(task.due);
  if (Number.isNaN(d.getTime())) return 'var(--gb-text-tertiary)';
  const ms = d.getTime() - Date.now();
  if (ms < 0)                     return 'var(--gb-error-fg)';     // overdue
  if (ms < 24 * 3600 * 1000)      return 'var(--gb-warning-fg)';    // due today
  return 'var(--gb-text-tertiary)';
}

/* ── Entity icons ─────────────────────────────────────────────
   Tiny 11px glyphs that prefix the context label so the user
   can scan the row type without reading the text. Tones inherit
   currentColor so the icon color tracks the surrounding label
   (including the brand-color hover state on linked context). */
function ContextIcon({ type }) {
  if (type === 'order')   return <OrderIcon />;
  if (type === 'contact') return <ContactIcon />;
  if (type === 'account') return <AccountIcon />;
  return null;
}
const OrderIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="14" y2="17" />
  </svg>
);
const ContactIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const AccountIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="6" width="18" height="14" rx="2" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="3" y1="12" x2="21" y2="12" />
  </svg>
);
const StandaloneIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 5v2M12 17v2M5 12h2M17 12h2" />
  </svg>
);

