import React, { useState, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { Btn, Input, Dropdown, Tag, Checkbox, I } from '../../ui/index.js';
import { STATUS_OPTS as TASK_STATUS_OPTS, filterTasks } from '../../lib/taskListModel.js';

/* ───────────────────────────────────────────────────────────────
   tasklist-live.jsx — a faithful port of TaskList.jsx for the guide.
   Same src/ui primitives, same toolbar / sortable table / selection
   bar / status badges as the real modal, on sample tasks, with an
   imperative API for the walkthrough. Reusable pieces:
     • TaskListLive — the whole modal (LiveStage hero)
     • TaskRow, SortHeader, StatusBadge, Toolbar, SelectionBar,
       PushDueCard — standalone cutouts for TourBoxes
─────────────────────────────────────────────────────────────── */

const DAY = 86400000;
export const COLS = '30px 1.3fr 1fr 104px 64px 1.55fr 116px';
const PRIORITY_TONE = { 1: 'error', 2: 'warning', 3: 'info' };
export const STATUS_OPTS = TASK_STATUS_OPTS;
export const PRIORITY_OPTS = [{ id: '', label: 'All priorities' }, { id: '1', label: 'High' }, { id: '2', label: 'Medium' }, { id: '3', label: 'Low' }];
const SORT_COLS = {
  account: { key: 'account', label: 'Account' }, contact: { key: 'contact', label: 'Contact' },
  dueDate: { key: 'dueDate', label: 'Due Date' }, priority: { key: 'priority', label: 'Priority' }, subject: { key: 'subject', label: 'Subject' },
};

const fmtDate = (d) => (!d || Number.isNaN(d?.getTime?.())) ? '—' : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

/* ── sample tasks (verbatim shape from buildMockTasks) ── */
export function sampleTasks() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = (o) => { const d = new Date(today); d.setDate(d.getDate() + o); return d; };
  const make = (r) => ({ ...r, due: fmtDate(r.dueDate), priorityLabel: r.priority === 1 ? 'High' : r.priority === 3 ? 'Low' : 'Med' });
  return [
    make({ id: 'task_3401', account: 'Acme Industries', contact: 'Marcus Chen', dueDate: day(-3), category: 'Follow Up', priority: 1, subject: 'Late proof on Q2 order', status: 'New' }),
    make({ id: 'task_3402', account: 'Pebble Beach Resort', contact: 'Sarah Patel', dueDate: day(0), category: 'Outbound Call', priority: 1, subject: 'Renewal call — discuss artwork', status: 'New' }),
    make({ id: 'task_3403', account: 'TaylorMade Promo', contact: 'Operations Team', dueDate: day(0), category: 'Email', priority: 2, subject: 'Send updated logo specs', status: 'New' }),
    make({ id: 'task_3404', account: 'Brown Custom Gifts', contact: 'Jordan Brown', dueDate: day(2), category: 'Quote Follow', priority: 2, subject: 'Quote follow-up for 500 unit run', status: 'New' }),
    make({ id: 'task_3405', account: 'OC Fitness', contact: "Liam O'Connor", dueDate: day(5), category: 'Outbound Call', priority: 3, subject: 'Reorder check-in', status: 'New' }),
    make({ id: 'task_3406', account: 'Acme Industries', contact: 'Marcus Chen', dueDate: day(-7), category: 'Follow Up', priority: 2, subject: 'Sample shipment confirmation', status: 'Complete' }),
    make({ id: 'task_3407', account: 'Sunset Greens', contact: 'Avery Wu', dueDate: day(1), category: 'Email', priority: 3, subject: 'Send pricing matrix', status: 'New' }),
    make({ id: 'task_3408', account: 'Pinehurst Country', contact: 'Riley Stone', dueDate: day(4), category: 'Outbound Call', priority: 1, subject: 'Tournament merch decision deadline', status: 'New' }),
    make({ id: 'task_3409', account: 'Cypress Country Club', contact: 'Talia Landry', dueDate: day(2), category: 'Lead Follow Up', priority: 1, subject: 'Dormant - Hot · re-engage this lead', status: 'New' }),
    make({ id: 'task_3410', account: 'Delta Boosters', contact: 'Noah Guidry', dueDate: day(3), category: 'Replacement Contact', priority: 2, subject: 'Replacement contact needed - old@delta.example', status: 'New' }),
  ];
}

/* ── StatusBadge (faithful — new defers to due urgency) ── */
function dueMeta(task) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((task.dueDate - today) / DAY);
  if (diff < 0) return { label: diff === -1 ? 'Overdue 1d' : `Overdue ${-diff}d`, tone: 'error' };
  if (diff === 0) return { label: 'Due today', tone: 'warning' };
  if (diff === 1) return { label: 'Tomorrow', tone: 'neutral' };
  return { label: `in ${diff}d`, tone: 'neutral' };
}
export function StatusBadge({ task }) {
  if (task.status === 'Complete') return <Tag tone="success" size="xs">Complete</Tag>;
  const m = dueMeta(task);
  return <Tag tone={m.tone} size="xs">{m.label}</Tag>;
}

/* ── SortHeader (faithful) ── */
export function SortHeader({ col, sortChain = [], onSort }) {
  const idx = sortChain.findIndex((c) => c.key === col.key);
  const active = idx !== -1;
  const dir = active ? sortChain[idx].dir : null;
  const showRank = sortChain.length > 1 && active;
  return (
    <button type="button" onClick={(e) => onSort(col.key, e.shiftKey)}
      style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', color: active ? 'var(--gb-brand-label)' : 'inherit', fontFamily: 'inherit' }}>
      {col.label}
      {active && <span style={{ fontSize: 8, lineHeight: 1 }}>{dir === 'asc' ? '▲' : '▼'}</span>}
      {showRank && <span style={{ fontSize: 8.5, fontWeight: 800, lineHeight: 1, fontFamily: 'var(--gb-font-mono)', minWidth: 12, height: 12, padding: '0 3px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-brand-tint-medium)', color: 'var(--gb-brand-label)', border: '1px solid var(--gb-brand-tint-border)', borderRadius: 999 }}>{idx + 1}</span>}
    </button>
  );
}

/* ── TaskRow (faithful) ── */
export function TaskRow({ task, isSelected, onToggle, demo }) {
  const complete = task.status === 'Complete';
  return (
    <div data-row-id={task.id} data-demo={demo}
      style={{ position: 'relative', isolation: 'isolate', display: 'grid', gridTemplateColumns: COLS, padding: '10px 16px', gap: 12, alignItems: 'center', marginBottom: 4, fontSize: 12, cursor: 'pointer', opacity: complete ? 0.65 : 1 }}
      onClick={(e) => { if (e.target.closest('a, button, [data-checkbox]')) return; onToggle?.(e); }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: -1, background: isSelected ? 'var(--gb-brand-tint-soft)' : 'transparent', transition: 'background-color .15s' }} />
      {isSelected && <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--gb-brand-label)' }} />}
      <div style={{ display: 'flex', alignItems: 'center' }}><Checkbox checked={isSelected} onChange={(e) => onToggle?.(e)} /></div>
      <div style={{ minWidth: 0 }}>
        <span style={{ display: 'block', color: 'var(--gb-text-primary)', fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.account}</span>
        {task.category && <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.category}</div>}
      </div>
      <span style={{ color: 'var(--gb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.contact}</span>
      <div style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 11, color: 'var(--gb-text-tertiary)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(task.dueDate)}</div>
      <div><Tag tone={PRIORITY_TONE[task.priority] || 'neutral'} size="xs">{task.priorityLabel}</Tag></div>
      <div style={{ color: 'var(--gb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.subject}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><StatusBadge task={task} /></div>
    </div>
  );
}

/* ── Table header (faithful sticky header row) ── */
export function TableHeader({ allChecked, onToggleAll, sortChain, onSort, demo }) {
  return (
    <div data-demo={demo} style={{ display: 'grid', gridTemplateColumns: COLS, padding: '8px 16px', gap: 12, background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)', fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-text-muted)', position: 'sticky', top: 0, zIndex: 4 }}>
      <div><Checkbox checked={allChecked} onChange={onToggleAll} /></div>
      <SortHeader col={SORT_COLS.account} sortChain={sortChain} onSort={onSort} />
      <SortHeader col={SORT_COLS.contact} sortChain={sortChain} onSort={onSort} />
      <SortHeader col={SORT_COLS.dueDate} sortChain={sortChain} onSort={onSort} />
      <SortHeader col={SORT_COLS.priority} sortChain={sortChain} onSort={onSort} />
      <SortHeader col={SORT_COLS.subject} sortChain={sortChain} onSort={onSort} />
      <div style={{ textAlign: 'right', paddingRight: 4 }}>Status</div>
    </div>
  );
}

/* ── Toolbar (faithful) ── */
export function Toolbar({ query, setQuery, statusFilter, setStatusFilter, priorityFilter, setPriorityFilter }) {
  return (
    <div style={{ padding: 12, borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
      <Input value={query} onChange={setQuery} placeholder="Search account, contact, subject…" leading={<I.search size={12} />} style={{ flex: 1 }} />
      <Dropdown value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTS} style={{ width: 170 }} />
      <Dropdown value={priorityFilter} onChange={setPriorityFilter} options={PRIORITY_OPTS} style={{ width: 150 }} />
      <Btn size="sm" variant="secondary" icon={<I.refresh size={12} />}>Refresh</Btn>
    </div>
  );
}

/* ── SelectionBar (faithful) ── */
export function SelectionBar({ selCount, total }) {
  return (
    <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-brand-tint-soft)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)' }}><span style={{ color: 'var(--gb-brand-label)', fontWeight: 700 }}>{selCount} selected</span> of {total} tasks</div>
      <div style={{ flex: 1 }} />
      <Btn size="sm" variant="ghost" icon={<I.megaphone size={11} />}>Run workflow</Btn>
      <Btn size="sm" variant="ghost" icon={<I.mail size={11} />}>Email selected</Btn>
      <Btn size="sm" variant="ghost" icon={<I.copy size={11} />}>Export CSV</Btn>
    </div>
  );
}

/* ── PushDueCard — the per-task popover's push-due controls (cutout). */
export function PushDueCard() {
  const [picked, setPicked] = useState('+1w');
  const [other, setOther] = useState(7);
  const chips = ['+1d', '+3d', '+1w', '+2w', '+1mo', 'Other'];
  return (
    <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--gb-surface-canvas)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', padding: 14, boxShadow: 'var(--gb-shadow-modal)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}><I.clock size={13} /> Push due date</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {chips.map((c) => (
          <button key={c} onClick={() => setPicked(c)} style={{ cursor: 'pointer', padding: '5px 11px', borderRadius: 'var(--gb-r-pill)', border: '1px solid ' + (picked === c ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: picked === c ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)', color: picked === c ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600 }}>{c}</button>
        ))}
      </div>
      {picked === 'Other' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setOther((n) => Math.max(1, n - 1))} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', color: 'var(--gb-text-secondary)', cursor: 'pointer' }}>−</button>
          <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', minWidth: 40, textAlign: 'center' }}>{other}d</span>
          <button onClick={() => setOther((n) => Math.min(365, n + 1))} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', color: 'var(--gb-text-secondary)', cursor: 'pointer' }}>+</button>
        </div>
      )}
      <Btn full size="sm" variant="tinted" status="brand">Apply push</Btn>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <Btn size="sm" variant="secondary" icon={<I.clock size={11} />}>Set date</Btn>
        <Btn size="sm" variant="secondary" icon={<I.plus size={11} />}>Add task</Btn>
      </div>
    </div>
  );
}

/* ── TaskListLive — the whole modal, faithful, with imperative API. */
export const TaskListLive = forwardRef(function TaskListLive(_props, ref) {
  const [all] = useState(() => sampleTasks());
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('1');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortChain, setSortChain] = useState([]);
  const [selected, setSelected] = useState(new Set());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = filterTasks(all, { status: statusFilter }).filter((t) => {
      if (priorityFilter && String(t.priority) !== priorityFilter) return false;
      if (!q) return true;
      return [t.account, t.contact, t.subject].join(' ').toLowerCase().includes(q);
    });
    if (sortChain.length) {
      rows = [...rows].sort((a, b) => {
        for (const { key, dir } of sortChain) {
          let av = a[key], bv = b[key];
          if (key === 'dueDate') { av = a.dueDate.getTime(); bv = b.dueDate.getTime(); }
          if (av < bv) return dir === 'asc' ? -1 : 1;
          if (av > bv) return dir === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return rows;
  }, [all, query, statusFilter, priorityFilter, sortChain]);

  const onSort = (key, append) => setSortChain((chain) => {
    const idx = chain.findIndex((c) => c.key === key);
    if (idx === -1) return append ? [...chain, { key, dir: 'asc' }] : [{ key, dir: 'asc' }];
    const cur = chain[idx];
    if (cur.dir === 'asc') { const n = [...chain]; n[idx] = { key, dir: 'desc' }; return n; }
    return chain.filter((c) => c.key !== key); // third click removes
  });

  const toggleSel = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => s.size === visible.length ? new Set() : new Set(visible.map((t) => t.id)));

  useImperativeHandle(ref, () => ({
    setStatusFilter, setPriorityFilter, onSort,
    selectN: (n) => setSelected(new Set(visible.slice(0, n).map((t) => t.id))),
    clearSel: () => setSelected(new Set()),
  }), [visible]);

  const selCount = selected.size;

  return (
    <div style={{ width: '100%', maxWidth: 1000, height: 600, display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-canvas)', color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-sans)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', boxShadow: 'var(--gb-shadow-modal)', overflow: 'hidden', userSelect: 'none', margin: '0 auto' }}>
      {/* Header */}
      <div data-demo="header" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)' }}>
        <div style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.check size={14} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>My Task List</div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>{visible.length} of {all.length} tasks</div>
        </div>
      </div>

      <div data-demo="toolbar"><Toolbar {...{ query, setQuery, statusFilter, setStatusFilter, priorityFilter, setPriorityFilter }} /></div>

      {selCount > 0 && <div data-demo="selbar"><SelectionBar selCount={selCount} total={visible.length} /></div>}

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <TableHeader demo="sortheader" allChecked={selCount > 0 && selCount === visible.length} onToggleAll={toggleAll} sortChain={sortChain} onSort={onSort} />
        {visible.map((t, i) => <TaskRow key={t.id} task={t} isSelected={selected.has(t.id)} onToggle={() => toggleSel(t.id)} demo={i === 0 ? 'row' : undefined} />)}
        {visible.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12 }}>No tasks match your filters.</div>}
      </div>

      {/* Footer */}
      <div data-demo="footer" style={{ padding: '10px 14px', borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>{selCount > 0 ? <>Bulk actions for <strong style={{ color: 'var(--gb-text-secondary)' }}>{selCount}</strong> selected</> : 'Select rows above to enable bulk actions'}</div>
        <div style={{ flex: 1 }} />
        <Btn size="sm" variant="ghost" icon={<I.copy size={11} />} disabled={selCount === 0}>Open Tabs</Btn>
        <Btn size="sm" variant="ghost" icon={<I.bolt size={11} />} disabled={selCount === 0}>Quick Task</Btn>
      </div>
    </div>
  );
});

export { SORT_COLS };
