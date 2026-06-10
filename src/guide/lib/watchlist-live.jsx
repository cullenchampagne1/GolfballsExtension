import React, { useState, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn, Card, Input, Tag, Dot, Dropdown, Segmented, DatePicker, formatHumanDate, I } from '../../ui/index.js';

/* ───────────────────────────────────────────────────────────────
   watchlist-live.jsx — a faithful, runnable port of WatchList.jsx
   for the guide. Same src/ui primitives, same markup + styling as
   the real modal, but self-contained on sample data with an
   imperative API so the walkthrough engine can drive it. Built as
   reusable pieces:
     • WatchListLive  — the whole modal (LiveStage hero)
     • WatchRow       — one row (TourBox cutout: anatomy)
     • WatchEditor    — the inline editor (TourBox cutout: the
                        "settings of a line item")
     • FilterChips    — the Segmented filters (TourBox cutout)
   Mirrors WatchList.jsx exactly so it reads as the real UI.
─────────────────────────────────────────────────────────────── */

const HOUR = 3600 * 1000;

/* ── urgency (verbatim from WatchList.jsx) ── */
export const URGENCY_TINT = {
  normal: 'var(--gb-text-tertiary)', moderate: 'var(--gb-info-fg)',
  high: 'var(--gb-warning-fg)', critical: 'var(--gb-error-fg)', done: 'var(--gb-text-muted)',
};
function urgencyLevel(task, nowMs) {
  if (task?.done) return 'done';
  const age = nowMs - (task?.createdAt || nowMs);
  if (age >= 6 * HOUR) return 'critical';
  if (age >= 4 * HOUR) return 'high';
  if (age >= 1 * HOUR) return 'moderate';
  return 'normal';
}
function relAge(createdAt, nowMs) {
  const ms = Math.max(0, nowMs - (createdAt || nowMs));
  const DAY = 24 * HOUR;
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60000))}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  return `${Math.round(ms / DAY)}d`;
}
function dueLabelColor(task) {
  if (task.done) return 'var(--gb-brand-label)';
  if (!task.due) return 'var(--gb-text-tertiary)';
  const d = new Date(task.due);
  if (Number.isNaN(d.getTime())) return 'var(--gb-text-tertiary)';
  const ms = d.getTime() - Date.now();
  if (ms < 0) return 'var(--gb-error-fg)';
  if (ms < 24 * HOUR) return 'var(--gb-warning-fg)';
  return 'var(--gb-text-tertiary)';
}
function formatContext(ctx) {
  if (!ctx) return '';
  const id = ctx.id ? `#${ctx.id}` : '';
  if (ctx.name) return id ? `${id} · ${ctx.name}` : ctx.name;
  return id;
}

/* ── entity icons (verbatim) ── */
const OrderIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="14" y2="17" /></svg>;
const ContactIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
const AccountIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" /></svg>;
const StandaloneIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M12 5v2M12 17v2M5 12h2M17 12h2" /></svg>;
function ContextIcon({ type }) {
  if (type === 'order') return <OrderIcon />;
  if (type === 'contact') return <ContactIcon />;
  if (type === 'account') return <AccountIcon />;
  return null;
}

/* ── TaskCheckbox (verbatim) ── */
function TaskCheckbox({ done, onToggle }) {
  return (
    <motion.button type="button" onClick={onToggle} whileTap={{ scale: 0.88 }} aria-pressed={done}
      style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0, padding: 0, cursor: 'pointer', background: done ? 'var(--gb-brand-tint-medium)' : 'transparent', border: '1.5px solid ' + (done ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), borderRadius: 5, color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none', transition: 'background-color .15s, border-color .15s' }}>
      {done && <span style={{ display: 'flex' }}><I.check size={11} /></span>}
    </motion.button>
  );
}

function RowAction({ icon, title, onClick, danger }) {
  const [h, setH] = useState(false);
  return (
    <button type="button" title={title} onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: 26, height: 26, flexShrink: 0, padding: 0, cursor: 'pointer', borderRadius: 6, border: '1px solid transparent', background: h ? (danger ? 'var(--gb-error-tint-soft)' : 'var(--gb-fill-soft)') : 'transparent', color: h ? (danger ? 'var(--gb-error-fg)' : 'var(--gb-text-secondary)') : 'var(--gb-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s, color .12s' }}>
      {icon}
    </button>
  );
}

/* ── WatchRow — faithful TaskRow port. `demo` adds data-demo hooks. */
export function WatchRow({ task, nowMs = Date.now(), onToggle, onEdit, onDelete, forceHover, demo }) {
  const [hoverState, setHover] = useState(false);
  const hover = forceHover ?? hoverState;
  const dueColor = dueLabelColor(task);
  const urgency = urgencyLevel(task, nowMs);
  const urgentColor = URGENCY_TINT[urgency];
  const showStripe = urgency !== 'normal' && urgency !== 'done';
  const ctxColor = 'var(--gb-text-tertiary)';

  return (
    <li style={{ overflow: 'hidden', listStyle: 'none', opacity: task.done ? 0.55 : 1 }} data-demo={demo}>
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px 6px 11px', borderRadius: 8, border: '1px solid ' + (hover ? 'var(--gb-border-default)' : 'transparent'), background: hover ? 'var(--gb-surface-1)' : 'transparent', transition: 'background-color .14s, border-color .14s' }}>
        <span aria-hidden data-demo={demo ? `${demo}-stripe` : undefined}
          style={{ position: 'absolute', left: -1, top: 7, bottom: 7, width: 3, background: urgentColor, borderRadius: 2, opacity: showStripe ? 1 : 0, transition: 'opacity .2s, background-color .2s' }} />
        <TaskCheckbox done={task.done} onToggle={onToggle} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <Dot tone={task.priority === 'high' ? 'error' : task.priority === 'med' ? 'warning' : 'muted'} size={6} />
            <span title={task.title} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-primary)', textDecoration: task.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, minWidth: 0, fontSize: 10.5 }}>
            {task.context ? (
              <span title={formatContext(task.context)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: ctxColor, fontWeight: 500, flexShrink: 0, maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <ContextIcon type={task.context.type} />{formatContext(task.context)}
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--gb-text-ghost)', fontStyle: 'italic', fontWeight: 500, flexShrink: 0 }}>
                <StandaloneIcon />Standalone
              </span>
            )}
            {task.due && (<><span style={{ color: 'var(--gb-text-ghost)' }}>·</span><span style={{ fontWeight: 600, color: dueColor, flexShrink: 0, whiteSpace: 'nowrap' }}>{formatHumanDate(task.due)}</span></>)}
          </div>
        </div>
        <div style={{ position: 'relative', width: 56, height: 26, flexShrink: 0 }} data-demo={demo ? `${demo}-actions` : undefined}>
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 10.5, color: showStripe ? urgentColor : 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', fontWeight: urgency === 'critical' ? 700 : 500, opacity: hover ? 0 : 1, pointerEvents: hover ? 'none' : 'auto', transition: 'opacity .12s' }}>{task.done ? 'done' : relAge(task.createdAt, nowMs)}</span>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2, opacity: hover ? 1 : 0, pointerEvents: hover ? 'auto' : 'none', transition: 'opacity .12s' }}>
            <RowAction title="Edit watch item" onClick={onEdit} icon={<I.edit size={12} />} />
            <RowAction title="Remove from watch list" onClick={onDelete} icon={<I.trash size={12} />} danger />
          </div>
        </div>
      </div>
    </li>
  );
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginBottom: 4 }}>{children}</div>;
}

/* ── WatchEditor — faithful TaskEditor port (the per-item settings). */
export function WatchEditor({ draft, onChange, onCommit, onCancel, isNew, demo }) {
  const set = (patch) => onChange({ ...draft, ...patch });
  const ctx = draft.context;
  const ctxType = ctx?.type || 'none';
  const setCtxType = (type) => { if (type === 'none') set({ context: null }); else set({ context: { type, id: ctx?.id || '', name: ctx?.name || '' } }); };
  return (
    <li style={{ overflow: 'hidden', listStyle: 'none' }} data-demo={demo}>
      <Card padding={12} style={{ borderColor: 'var(--gb-border-default)', background: 'var(--gb-surface-2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Input value={draft.title} onChange={(v) => set({ title: v })} placeholder={isNew ? 'What do you want to watch?' : 'Watch item title'} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FieldLabel>Priority</FieldLabel>
            <Segmented full size="md" value={draft.priority} onChange={(v) => set({ priority: v })}
              options={[{ id: 'high', label: 'High', icon: <Dot tone="error" /> }, { id: 'med', label: 'Med', icon: <Dot tone="warning" /> }, { id: 'low', label: 'Low', icon: <Dot tone="muted" /> }]} />
          </div>
          <div style={{ flex: 1.4, minWidth: 0 }}>
            <FieldLabel>Due</FieldLabel>
            <DatePicker value={draft.due} onChange={(v) => set({ due: v })} placeholder="No due date" />
          </div>
        </div>
        <div>
          <FieldLabel>Linked to</FieldLabel>
          <div style={{ display: 'flex', gap: 6 }}>
            <Dropdown value={ctxType} onChange={setCtxType}
              options={[{ id: 'none', label: 'Standalone' }, { id: 'order', label: 'Order' }, { id: 'contact', label: 'Contact' }, { id: 'account', label: 'Account' }]} style={{ width: 130 }} />
            {ctxType !== 'none' && (
              <Input value={ctx?.id || ''} onChange={(v) => set({ context: { ...(ctx || { type: ctxType }), id: v } })} placeholder={ctxType === 'order' ? 'Order # (29103)' : `${ctxType[0].toUpperCase() + ctxType.slice(1)} ID`} style={{ flex: 0.9 }} />
            )}
            {(ctxType === 'contact' || ctxType === 'account') && (
              <Input value={ctx?.name || ''} onChange={(v) => set({ context: { ...(ctx || { type: ctxType }), name: v } })} placeholder={ctxType === 'contact' ? 'Name (optional)' : 'Account name (optional)'} style={{ flex: 1 }} />
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <Btn size="sm" variant="ghost" onClick={onCancel} style={{ flex: 0 }}>Cancel</Btn>
          <div style={{ flex: 1 }} />
          <Btn size="sm" variant="tinted" status="brand" icon={<I.check size={10} />} onClick={onCommit} disabled={!draft.title.trim()}>{isNew ? 'Add to watch list' : 'Save'}</Btn>
        </div>
      </Card>
    </li>
  );
}

/* ── FilterChips — the Segmented filter row (cutout). */
function FilterLabel({ text, count, active }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{text}<Tag tone={active ? 'brand' : 'neutral'} size="xs">{count}</Tag></span>;
}
export function FilterChips({ value, onChange, counts }) {
  const FILTERS = [
    { key: 'all', label: 'All', n: counts.all },
    { key: 'active', label: 'Active', n: counts.active },
    { key: 'high', label: 'High priority', n: counts.high },
    { key: 'done', label: 'Completed', n: counts.done },
  ];
  return (
    <Segmented full size="md" value={value} onChange={onChange}
      options={FILTERS.map((f) => ({ id: f.key, label: <FilterLabel text={f.label} count={f.n} active={value === f.key} /> }))} />
  );
}

/* ── sample data ── */
export function sampleTasks(now = Date.now()) {
  return [
    { id: 'w1', title: 'Verify reprint shipped', done: false, priority: 'high', due: new Date(now).toISOString(), createdAt: now - 7 * HOUR, context: { type: 'order', id: '29103' } },
    { id: 'w2', title: 'Confirm logo colors with Marcus', done: false, priority: 'med', due: new Date(now + 2 * 24 * HOUR).toISOString(), createdAt: now - 5 * HOUR, context: { type: 'contact', id: '4421', name: 'Marcus Chen' } },
    { id: 'w3', title: 'Check stock before quoting', done: false, priority: 'low', due: '', createdAt: now - 40 * 60000, context: { type: 'account', id: '2188', name: 'Acme Industries' } },
    { id: 'w4', title: 'Send tournament gift options', done: true, priority: 'med', due: '', createdAt: now - 30 * HOUR, doneAt: now - 2 * HOUR, context: null },
  ];
}

/* ── WatchListLive — the whole modal, faithful, with an imperative API. */
export const WatchListLive = forwardRef(function WatchListLive(_props, ref) {
  const now = Date.now();
  const [tasks, setTasks] = useState(() => sampleTasks(now));
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);

  const counts = useMemo(() => ({
    all: tasks.length,
    active: tasks.filter((t) => !t.done).length,
    high: tasks.filter((t) => !t.done && t.priority === 'high').length,
    done: tasks.filter((t) => t.done).length,
  }), [tasks]);
  const criticalCount = tasks.filter((t) => !t.done && (now - t.createdAt) >= 6 * HOUR).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pri = { high: 0, med: 1, low: 2 };
    return tasks.filter((t) => {
      if (filter === 'active' && t.done) return false;
      if (filter === 'high' && (t.done || t.priority !== 'high')) return false;
      if (filter === 'done' && !t.done) return false;
      if (!q) return true;
      return [t.title, t.context?.id, t.context?.name, t.due].filter(Boolean).join(' ').toLowerCase().includes(q);
    }).sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const d = (pri[a.priority] ?? 1) - (pri[b.priority] ?? 1);
      return d !== 0 ? d : a.createdAt - b.createdAt;
    });
  }, [tasks, filter, search]);

  const toggleDone = (id) => setTasks((c) => c.map((t) => t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : null } : t));
  const deleteTask = (id) => setTasks((c) => c.filter((t) => t.id !== id));
  const startNew = () => { setEditingId('__new'); setDraft({ title: '', due: '', priority: 'med', context: null }); };
  const startEdit = (t) => { setEditingId(t.id); setDraft({ title: t.title, due: t.due || '', priority: t.priority || 'med', context: t.context || null }); };
  const cancelEdit = () => { setEditingId(null); setDraft(null); };
  const commitEdit = () => {
    const title = (draft?.title || '').trim();
    if (!title) { cancelEdit(); return; }
    if (editingId === '__new') setTasks((c) => [{ id: 'w' + (c.length + 1), done: false, createdAt: Date.now(), ...draft, title }, ...c]);
    else setTasks((c) => c.map((t) => t.id === editingId ? { ...t, ...draft, title } : t));
    cancelEdit();
  };

  useImperativeHandle(ref, () => ({
    setFilter, startNew, editFirst: () => { const t = visible[0]; if (t) startEdit(t); },
    toggleFirst: () => { const t = visible[0]; if (t) toggleDone(t.id); },
  }), [visible]);

  return (
    <div style={{ width: 560, display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-canvas)', color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-sans)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', boxShadow: 'var(--gb-shadow-modal)', overflow: 'hidden' }}>
      {/* Header (accent) */}
      <div data-demo="header" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)', borderTop: '2px solid var(--gb-brand-label)' }}>
        <div style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.eye size={14} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>My Watch List</div>
          <div style={{ fontSize: 10.5, marginTop: 1, color: criticalCount ? 'var(--gb-error-fg)' : 'var(--gb-text-muted)', fontWeight: criticalCount ? 700 : 500 }}>
            {counts.active} active{criticalCount > 0 ? ` · ${criticalCount} critical` : ''}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
        <div data-demo="filters"><FilterChips value={filter} onChange={setFilter} counts={counts} /></div>
        <div data-demo="search" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Input value={search} onChange={setSearch} placeholder="Search title, context, or due…" leading={<I.search size={12} />} style={{ flex: 1 }} />
          <Btn size="sm" variant="secondary" icon={<I.plus size={11} />} onClick={startNew} disabled={editingId === '__new'}>Watch</Btn>
        </div>
      </div>

      {/* Body */}
      <div style={{ minHeight: 232, maxHeight: 300, overflowY: 'auto', overflowX: 'hidden', padding: 8 }}>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {editingId === '__new' && <WatchEditor key="__new" demo="editor" draft={draft} onChange={setDraft} onCommit={commitEdit} onCancel={cancelEdit} isNew />}
          {visible.map((task, i) => (
            editingId === task.id
              ? <WatchEditor key={task.id} demo="editor" draft={draft} onChange={setDraft} onCommit={commitEdit} onCancel={cancelEdit} />
              : <WatchRow key={task.id} task={task} nowMs={now} demo={i === 0 ? 'row' : undefined} onToggle={() => toggleDone(task.id)} onEdit={() => startEdit(task)} onDelete={() => deleteTask(task.id)} />
          ))}
          {visible.length === 0 && editingId !== '__new' && (
            <li style={{ listStyle: 'none', padding: '40px 12px', textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12 }}>Nothing here — switch filters or add a watch item.</li>
          )}
        </ul>
      </div>

      {/* Footer */}
      {tasks.length > 0 && (
        <div data-demo="footer" style={{ padding: '8px 14px', borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>{tasks.length} item{tasks.length === 1 ? '' : 's'} on watch list</div>
          <Btn size="sm" variant="ghost" icon={<I.trash size={11} />} onClick={() => setTasks([])}>Clear all</Btn>
        </div>
      )}
    </div>
  );
});
