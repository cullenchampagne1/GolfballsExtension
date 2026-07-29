/* eslint-disable */
/**
 * Task List custom page (CRM Page 349).
 *
 * A full-page takeover of the native task list that combines the standalone
 * Task List modal with the page — mirroring the CRM Search page (Page 360):
 * the shared DetailPageFrame shell (nav sidebar + top bar), a left Refine
 * sidebar (Status / Priority / Category / Due filters), a settled search bar,
 * a selectable results table with its own internal scroll, and a per-row
 * STATUS column that
 * slides in the moment you run an email or quick-task action so you can watch
 * each row's outcome. Actions reuse the same transports as the modal
 * (crmTasks writers, submitQuickTask, EmailRunner) so behavior can't drift.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import {
  TASKS_ENDPOINT, STATUS_OPTS, PRIORITY_OPTS, DUE_BUCKETS,
  parseTasksFromHtml, parseTasksFromDoc, distinctCategories, filterTasks, sortTasks, dueBucket, looksLikeLoginShell,
} from '../lib/taskListModel.js';
import { completeTaskById, getTaskContactId, updateTaskById } from '../lib/crmTasks.js';
import { EmailRunner } from '../modals/EmailRunner.jsx';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { FULL_HEIGHT_LIST_PAGE_CSS } from '../lib/customPageLayout.js';
import {
  Btn, Card, DASH, DataCtx, DetailErrorBoundary, EmptyRow, I, IconBtn, ScrollArea, SectionTitle,
  Spinner, Tag, TaskCheckbox, Td, Th, fmtDate, goUrl, tableStyle, trStyle, txt,
} from '../lib/detail-shared.jsx';
import { Breadcrumb, DetailPageFrame, EditTaskModal, ModalCtx, TopBar, gbToast, useDetailData, useModalHost } from '../lib/crm-detail-shared.jsx';

/* Pull a numeric customer/contact id out of a native contact link. */
function contactIdFromUrl(url) {
  const m = String(url || '').match(/[?&](?:customerID|customerId|contactID|contactId)=(\d+)/i);
  return m ? m[1] : '';
}

const priTone = (p) => (p === 1 ? 'error' : p === 3 ? 'neutral' : 'warning');

/* ── Refine facet primitives (mirrors the CRM-search sidebar look) ── */
function FacetChecks({ label, options, selected, onToggle, count }) {
  const [open, setOpen] = useState(true);
  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', border: 0, background: 'transparent', cursor: 'pointer' }}>
        <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{label}</span>
        {selected.size > 0 && <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', borderRadius: 99, padding: '0 6px' }}>{selected.size}</span>}
        <I.chevd size={12} style={{ color: 'var(--gb-text-muted)', transition: 'transform var(--gb-anim)', transform: open ? 'none' : 'rotate(-90deg)' }} />
      </button>
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows var(--gb-anim)' }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ padding: '0 8px 8px' }}>
            {options.map((o) => {
              const on = selected.has(o.id);
              const n = count ? (count[o.id] || 0) : null;
              return (
                <button key={o.id} onClick={() => onToggle(o.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 8px', border: 0, borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', textAlign: 'left', background: on ? 'var(--gb-brand-tint-soft)' : 'transparent' }}>
                  <span style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), background: on ? 'var(--gb-brand-label)' : 'transparent', color: 'var(--gb-text-on-brand)' }}>{on && <I.check size={9} sw={3} />}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: on ? 600 : 500, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                  {n != null && <span style={{ fontSize: 10, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>{n}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

function TaskFacetSidebar({ tasks, statusFilter, setStatusFilter, prioritySel, categorySel, dueSel, toggle, clearAll, counts }) {
  const catOpts = useMemo(() => distinctCategories(tasks).map((c) => ({ id: c, label: c })), [tasks]);
  const anySel = prioritySel.size || categorySel.size || dueSel.size || statusFilter !== '1';
  return (
    <div className="gbcp-fill-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Status is single-select (mirrors the native New/Completed/All toggle). */}
      <Card>
        <div style={{ padding: '10px 12px 4px', fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Status</div>
        <div style={{ padding: '0 8px 8px' }}>
          {STATUS_OPTS.map((o) => {
            const on = statusFilter === o.id;
            return (
              <button key={o.id} onClick={() => setStatusFilter(o.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 8px', border: 0, borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', textAlign: 'left', background: on ? 'var(--gb-brand-tint-soft)' : 'transparent' }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, border: '1.5px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), background: on ? 'var(--gb-brand-label)' : 'transparent' }} />
                <span style={{ fontSize: 11.5, fontWeight: on ? 600 : 500, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>{o.label}</span>
              </button>
            );
          })}
        </div>
      </Card>
      <FacetChecks label="Priority" options={PRIORITY_OPTS} selected={prioritySel} onToggle={(v) => toggle('priority', v)} count={counts.priority} />
      <FacetChecks label="Due" options={DUE_BUCKETS} selected={dueSel} onToggle={(v) => toggle('due', v)} count={counts.due} />
      {catOpts.length > 0 && <FacetChecks label="Category" options={catOpts} selected={categorySel} onToggle={(v) => toggle('category', v)} count={counts.category} />}
      {anySel ? <Btn variant="ghost" size="sm" icon={<I.close />} onClick={clearAll} full>Clear filters</Btn> : null}
    </div>
  );
}

/* Compact per-row status indicator: spinner while running, a green check when
   done, a red × on failure — no laggy per-cell fade. The "moving highlight"
   is the running row's tinted background (see TaskRow), which naturally travels
   down the list as the sequential run advances. */
const RUNNING = (p) => p === 'sending' || p === 'running' || p === 'queued';
function StatusIndicator({ st }) {
  if (!st) return null;
  const p = st.phase;
  if (RUNNING(p)) {
    return <span title={st.label || 'Working…'} style={{ width: 14, height: 14, display: 'inline-block', borderRadius: '50%', border: '2px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: p === 'queued' ? 'none' : 'gb-spin .7s linear infinite', opacity: p === 'queued' ? 0.4 : 1, verticalAlign: 'middle' }} />;
  }
  if (p === 'done' || p === 'sent') return <span title={st.label || 'Done'} style={{ color: 'var(--gb-success)', display: 'inline-flex', verticalAlign: 'middle' }}><I.check size={15} sw={3} /></span>;
  if (p === 'error') return <span title={st.detail || 'Failed'} style={{ color: 'var(--gb-error)', display: 'inline-flex', verticalAlign: 'middle' }}><I.close size={14} sw={2.6} /></span>;
  if (p === 'skipped') return <span title={st.label || 'Skipped'} style={{ color: 'var(--gb-warning)', fontWeight: 700 }}>–</span>;
  return null;
}

const LINK_STYLE = { color: 'var(--gb-brand-label)', fontWeight: 600, textDecoration: 'none' };

/* Row emphasis: overdue (red) > due-today (amber) > high-priority (red).
   Returns { accent, tint } tokens or null. */
function rowEmphasis(t, today) {
  const bucket = dueBucket(t.dueDate, today);
  if (bucket === 'overdue') return { accent: 'var(--gb-error)', tint: 'color-mix(in srgb, var(--gb-error) 8%, transparent)' };
  if (bucket === 'today') return { accent: 'var(--gb-warning)', tint: 'color-mix(in srgb, var(--gb-warning) 9%, transparent)' };
  if (t.priority === 1) return { accent: 'var(--gb-error)', tint: null };
  return null;
}

function TaskRow({ t, index, selected, onToggle, status, today, onEdit, onCompleteOne, runActive }) {
  const stop = (e) => e.stopPropagation();
  const running = RUNNING(status?.phase) && status?.phase !== 'queued';
  const emph = rowEmphasis(t, today);
  const rowStyle = {
    ...trStyle,
    ...(emph?.tint ? { background: emph.tint } : null),
    ...(running ? { background: 'var(--gb-brand-tint-soft)' } : null),
    ...(emph?.accent ? { boxShadow: `inset 3px 0 0 ${emph.accent}` } : null),
    // Selection wins (same treatment as the CRM search rows).
    ...(selected ? { background: 'var(--gb-brand-tint-soft)', boxShadow: 'inset 3px 0 0 var(--gb-brand-label)' } : null),
    transition: 'background-color var(--gb-anim), box-shadow var(--gb-anim)',
  };
  return (
    <tr className="gb-actrow" style={rowStyle}>
      <Td align="center" style={{ width: 38, padding: '8px 8px' }}>
        <span onClick={stop} style={{ display: 'inline-flex' }}>
          <TaskCheckbox done={selected} onClick={(e) => { e?.stopPropagation?.(); onToggle(index, !!e?.shiftKey); }} title={selected ? 'Deselect' : 'Select (shift-click for a range)'} />
        </span>
      </Td>
      <Td>{txt(t.subject) || DASH}</Td>
      <Td>{t.accountUrl ? <a href={t.accountUrl} onClick={stop} style={LINK_STYLE}>{txt(t.account) || DASH}</a> : (txt(t.account) || DASH)}</Td>
      <Td>{t.contactUrl ? <a href={t.contactUrl} onClick={stop} style={LINK_STYLE}>{txt(t.contact) || DASH}</a> : (txt(t.contact) || DASH)}</Td>
      <Td muted>{txt(t.due) || DASH}</Td>
      <Td muted>{txt(t.category) || DASH}</Td>
      <Td><Tag tone={priTone(t.priority)} size="sm">{t.priorityLabel || 'Med'}</Tag></Td>
      {/* Actions column — Edit + Complete buttons, swapping to the live status
          indicator whenever an action is running/finished for this row. */}
      <Td align="center" style={{ width: 92, whiteSpace: 'nowrap' }}>
        {status ? (
          <StatusIndicator st={status} />
        ) : (
          <span style={{ display: 'inline-flex', gap: 4, justifyContent: 'center' }}>
            <IconBtn size="xs" ghost icon={<I.edit />} title="Edit task" disabled={runActive} onClick={() => onEdit(t)} />
            <IconBtn size="xs" ghost icon={<I.check />} title="Complete task" disabled={runActive} onClick={() => onCompleteOne(t)} />
          </span>
        )}
      </Td>
    </tr>
  );
}

function TaskListApp({ store }) {
  const [D] = useDetailData(store);
  const modalHost = useModalHost();

  const [tasks, setTasks] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('1');
  const [prioritySel, setPrioritySel] = useState(new Set());
  const [categorySel, setCategorySel] = useState(new Set());
  const [dueSel, setDueSel] = useState(new Set());
  const [sortChain, setSortChain] = useState([{ key: 'dueDate', dir: 'asc' }]);
  const [selected, setSelected] = useState(new Set());
  const [focused, setFocused] = useState(false);   // input focus ring only

  const [statusByRow, setStatusByRow] = useState({});   // taskId → { phase, label, detail }
  const [runActive, setRunActive] = useState(false);
  const [emailRunnerOpen, setEmailRunnerOpen] = useState(false);
  const [emailRunnerCursor, setEmailRunnerCursor] = useState(null);
  const [renderCount, setRenderCount] = useState(50);   // progressive/lazy DOM render
  const contactToTasksRef = useRef(new Map());   // contactId → [taskId] for email callbacks
  const inputRef = useRef(null);
  const loadMoreRef = useRef(null);
  const tableScrollRef = useRef(null);   // the table's internal scroll box
  const gen = useRef(0);

  const loadTasks = useCallback(async () => {
    const g = ++gen.current;
    // Fast path: the takeover IS on Page=349, so #TableTasks is already in the
    // host DOM (expanded by the engine). Parse it directly — instant, no multi-MB
    // re-fetch — so the shell + sidebar render immediately.
    const live = parseTasksFromDoc(document);
    if (live.length) { setTasks(live); setLoadState('ready'); return; }
    // Fallback (host table not present/ready): re-fetch and parse.
    setLoadState('loading');
    try {
      const res = await fetch(TASKS_ENDPOINT, { credentials: 'include' });
      const html = await res.text();
      if (g !== gen.current) return;
      if (looksLikeLoginShell(html)) { setLoadState('error'); return; }
      const parsed = parseTasksFromHtml(html);
      setTasks(parsed);
      setLoadState(parsed.length ? 'ready' : 'ready');
    } catch (e) {
      if (g === gen.current) setLoadState('error');
    }
  }, []);
  useEffect(() => { loadTasks(); }, [loadTasks]);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const visible = useMemo(
    () => sortTasks(filterTasks(tasks, { query, status: statusFilter, priority: prioritySel, category: categorySel, due: dueSel }, today), sortChain),
    [tasks, query, statusFilter, prioritySel, categorySel, dueSel, sortChain, today],
  );
  // Lazy DOM render — only mount `renderCount` rows and reveal more as the page
  // scroll nears the sentinel (mirrors the modal's virtualized list so 1000s of
  // task rows don't all mount at once). Reset the window when the result set
  // changes.
  const renderedTasks = useMemo(() => visible.slice(0, renderCount), [visible, renderCount]);
  useEffect(() => { setRenderCount(50); }, [query, statusFilter, prioritySel, categorySel, dueSel, sortChain, tasks]);
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || renderCount >= visible.length) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setRenderCount((c) => Math.min(c + 60, visible.length));
    }, { root: tableScrollRef.current || null, rootMargin: '700px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [renderCount, visible.length]);

  // Facet counts (computed on the status-filtered set so numbers make sense).
  const counts = useMemo(() => {
    const base = filterTasks(tasks, { status: statusFilter }, today);
    const priority = {}, category = {}, due = {};
    for (const t of base) {
      priority[String(t.priority)] = (priority[String(t.priority)] || 0) + 1;
      const c = (t.category || '').trim(); if (c) category[c] = (category[c] || 0) + 1;
    }
    for (const t of base) {
      const b = dueBucket(t.dueDate, today); due[b] = (due[b] || 0) + 1;
    }
    return { priority, category, due };
  }, [tasks, statusFilter, today]);

  const toggleFacet = (which, value) => {
    const set = which === 'priority' ? setPrioritySel : which === 'category' ? setCategorySel : setDueSel;
    set((cur) => { const next = new Set(cur); next.has(value) ? next.delete(value) : next.add(value); return next; });
  };
  const clearAll = () => { setPrioritySel(new Set()); setCategorySel(new Set()); setDueSel(new Set()); setStatusFilter('1'); setQuery(''); };
  const onSort = (key) => setSortChain((cur) => {
    const top = cur[0];
    if (top && top.key === key) return [{ key, dir: top.dir === 'asc' ? 'desc' : 'asc' }];
    return [{ key, dir: 'asc' }];
  });

  // Selection with shift-click range (against the rendered order). anchor is
  // the last plainly-clicked row index.
  const anchorRef = useRef(null);
  const toggleRow = (index, shiftKey) => setSelected((cur) => {
    const n = new Set(cur);
    if (shiftKey && anchorRef.current != null) {
      const [a, b] = index < anchorRef.current ? [index, anchorRef.current] : [anchorRef.current, index];
      for (let i = a; i <= b; i++) { const r = renderedTasks[i]; if (r) n.add(r.id); }
    } else {
      const id = renderedTasks[index]?.id;
      if (id) { n.has(id) ? n.delete(id) : n.add(id); }
      anchorRef.current = index;
    }
    return n;
  });
  const allVisibleSelected = visible.length > 0 && visible.every((t) => selected.has(t.id));
  const toggleAll = () => setSelected((cur) => {
    const n = new Set(cur);
    if (allVisibleSelected) visible.forEach((t) => n.delete(t.id));
    else visible.forEach((t) => n.add(t.id));
    return n;
  });

  const selectedTasks = useMemo(() => visible.filter((t) => selected.has(t.id)), [visible, selected]);
  const setRowStatus = (id, patch) => setStatusByRow((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } }));
  // Drop rows from the list (completed tasks — the host DOM is stale so we never
  // reload it) after a short beat so the ✓ is visible, matching the modal.
  const dropTasks = (ids) => {
    const set = new Set(ids);
    setSelected((cur) => { const n = new Set(cur); ids.forEach((id) => n.delete(id)); return n; });
    setTimeout(() => {
      setTasks((cur) => cur.filter((t) => !set.has(t.id)));
      setStatusByRow((m) => { const n = { ...m }; ids.forEach((id) => delete n[id]); return n; });
    }, 650);
  };
  const editTask = (t) => modalHost.openModal(<EditTaskModal taskId={t.id} />);

  // ── Email selected ────────────────────────────────────────────
  const emailContacts = useMemo(() => {
    const map = new Map();
    const out = [];
    for (const t of selectedTasks) {
      const cid = contactIdFromUrl(t.contactUrl) || `task:${t.id}`;
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid).push(t.id);
      out.push({ contactId: cid, contactName: t.contact, contactUrl: t.contactUrl, value: 0 });
    }
    contactToTasksRef.current = map;
    return out.filter((c) => c.contactUrl);
  }, [selectedTasks]);
  const openEmail = () => {
    if (!emailContacts.length) { gbToast('Select tasks with a contact first', 'info'); return; }
    setStatusByRow({});
    setEmailRunnerCursor({ x: 0, y: 0 });
    setEmailRunnerOpen(true);
  };
  const emailRowsFor = (cid) => contactToTasksRef.current.get(cid) || [];

  // ── Complete (selected, or one row) — remove from the list on success ──
  const completeTasks = async (ids) => {
    if (!ids.length) { gbToast('Select tasks first', 'info'); return; }
    setRunActive(true);
    ids.forEach((id) => setRowStatus(id, { phase: 'queued' }));
    const done = [];
    for (const id of ids) {              // sequential — CRM rate-limits Update.ajax
      setRowStatus(id, { phase: 'running', label: 'Completing…' });
      try { await completeTaskById(id); setRowStatus(id, { phase: 'done', label: 'Completed' }); done.push(id); }
      catch (e) { setRowStatus(id, { phase: 'error', label: 'Failed', detail: e?.message }); }
    }
    setRunActive(false);
    if (done.length) dropTasks(done);    // behave like the modal — completed rows leave the list
  };
  const completeSelected = () => completeTasks(selectedTasks.map((t) => t.id));
  const completeOne = (t) => completeTasks([t.id]);

  // ── Push due dates (quick actions, same presets as the modal popover).
  //    365 = exactly one calendar year (same month/day next year). ──
  const pushSelected = async (days) => {
    const rows = selectedTasks;
    if (!rows.length) { gbToast('Select tasks first', 'info'); return; }
    const target = new Date();
    if (Number(days) === 365) target.setFullYear(target.getFullYear() + 1);
    else target.setDate(target.getDate() + Number(days));
    const label = `${target.getMonth() + 1}/${target.getDate()}/${target.getFullYear()}`;
    setRunActive(true);
    rows.forEach((t) => setRowStatus(t.id, { phase: 'queued' }));
    for (const t of rows) {              // sequential — CRM rate-limits Update.ajax
      setRowStatus(t.id, { phase: 'running', label: 'Pushing…' });
      try {
        await updateTaskById(t.id, { dueDate: target });
        setTasks((cur) => cur.map((x) => x.id === t.id ? { ...x, due: label, dueDate: new Date(target) } : x));
        setRowStatus(t.id, { phase: 'done', label: `Due ${label}` });
      } catch (e) { setRowStatus(t.id, { phase: 'error', label: 'Failed', detail: e?.message }); }
    }
    setRunActive(false);
    // Let the ✓ linger, then bring the Edit/Complete buttons back (keep errors).
    setTimeout(() => setStatusByRow((m) => {
      const n = {}; for (const [id, st] of Object.entries(m)) if (st?.phase === 'error') n[id] = st; return n;
    }), 2200);
  };

  // ── Quick task → open the composer POPUP (push-out days, category, etc.)
  //    for the selected task's contact, instead of silently creating one. ─
  const quickTaskSelected = async () => {
    const rows = selectedTasks;
    if (!rows.length) { gbToast('Select a task first', 'info'); return; }
    if (typeof window.__gbShowQuickTaskModal !== 'function') { gbToast('Quick task composer not loaded', 'error'); return; }
    const t = rows[0];
    if (rows.length > 1) gbToast('Quick task opens for the first selected task’s contact', 'info');
    const contactId = contactIdFromUrl(t.contactUrl) || await getTaskContactId(t.id);
    if (!contactId) { gbToast('No contact on that task', 'error'); return; }
    setRowStatus(t.id, { phase: 'running', label: 'Composing…' });
    try {
      window.__gbShowQuickTaskModal({
        contactId,
        contactName: t.contact,
        autoCompose: true,   // land straight on the builder with push-out/options
        // Don't reload from the (stale) host DOM — it would undo completed-row
        // removals. Just clear the row's composing status.
        onCreated: () => { setStatusByRow((m) => { const n = { ...m }; delete n[t.id]; return n; }); },
      });
    } catch (e) { setRowStatus(t.id, { phase: 'error', label: 'Failed', detail: e?.message }); }
  };

  const exportCsv = () => {
    if (!selectedTasks.length) { gbToast('Select tasks first', 'info'); return; }
    const esc = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
    const head = ['Account', 'Contact', 'Due', 'Category', 'Priority', 'Subject', 'Status'];
    const lines = [head.join(',')].concat(selectedTasks.map((t) => [t.account, t.contact, t.due, t.category, t.priorityLabel, t.subject, t.status].map(esc).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const selCount = selectedTasks.length;

  return (
    <DataCtx.Provider value={D}>
    <ModalCtx.Provider value={modalHost}>
      <DetailPageFrame
        currentPage="Task List" ready modalHost={modalHost} hideScrollbar
        topBar={<TopBar><Breadcrumb items={[{ label: 'CRM', page: 261 }]} current="Task List" /></TopBar>}
      >
        <style>{FULL_HEIGHT_LIST_PAGE_CSS}</style>
        <div className="gbcp-search-grid gbcp-fill-grid" style={{ display: 'grid', gridTemplateColumns: '228px minmax(0, 1fr)', gap: 10 }}>
          <TaskFacetSidebar
            tasks={tasks} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            prioritySel={prioritySel} categorySel={categorySel} dueSel={dueSel}
            toggle={toggleFacet} clearAll={clearAll} counts={counts}
          />
          <div className="gbcp-stack gbcp-search-body gbcp-fill-main" style={{ minWidth: 0 }}>
            {/* Settled, static search + action bar (no sticky/floating) */}
            <div className="gbcp-fill-toolbar">
              <Card style={{
                border: '1px solid color-mix(in srgb, var(--gb-border-strong) 72%, transparent)',
                background: 'var(--gb-surface-1)',
              }}>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{
                      flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 9, height: 36, padding: '0 11px',
                      background: 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (focused ? 'var(--gb-border-focus)' : 'var(--gb-border-default)'),
                      borderRadius: 12, boxShadow: focused ? '0 0 0 3px color-mix(in srgb, var(--gb-brand-label) 18%, transparent)' : 'none',
                      transition: 'box-shadow var(--gb-anim), border-color var(--gb-anim)',
                    }}>
                      <I.search size={15} style={{ color: 'var(--gb-text-muted)', flexShrink: 0 }} />
                      <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                        placeholder="Search account, contact, subject…"
                        style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 13 }} />
                      {query && <IconBtn size="xs" ghost icon={<I.close />} title="Clear" onClick={() => { setQuery(''); try { inputRef.current.focus(); } catch {} }} />}
                    </div>
                    <Btn variant="secondary" size="lg" icon={<I.refresh />} onClick={loadTasks}>Refresh</Btn>
                  </div>
                </div>
                {/* Selection action rail — IDENTICAL treatment to the CRM search
                    page's rail: full-width tinted strip that slides open. */}
                <div style={{
                  display: 'grid',
                  gridTemplateRows: selCount > 0 ? '1fr' : '0fr',
                  opacity: selCount > 0 ? 1 : 0,
                  transition: 'grid-template-rows .24s cubic-bezier(.4,0,.2,1), opacity .16s ease',
                }}>
                  <div style={{ minHeight: 0, overflow: 'hidden' }}>
                    <div style={{
                      minHeight: 42,
                      padding: '7px 14px',
                      borderTop: '1px solid var(--gb-border-subtle)',
                      background: 'color-mix(in srgb, var(--gb-brand-tint-soft) 72%, transparent)',
                      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    }}>
                      <span style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)' }}>
                        <strong style={{ color: 'var(--gb-brand-label)', fontWeight: 700 }}>{selCount} selected</strong>
                        {' '}of {visible.length} task{visible.length === 1 ? '' : 's'}
                      </span>
                      {/* Push-date quick actions — same presets as the modal
                          popover (+1yr = exactly one calendar year). */}
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Push</span>
                      {[['+3d', 3], ['+1w', 7], ['+2w', 14], ['+1mo', 30], ['+1yr', 365]].map(([lb, d]) => (
                        <Btn key={lb} size="xs" variant="ghost" onClick={() => pushSelected(d)} disabled={runActive}>{lb}</Btn>
                      ))}
                      <div style={{ flex: 1 }} />
                      <Btn size="sm" variant="ghost" icon={<I.mail />} onClick={openEmail} disabled={runActive}>Email selected</Btn>
                      <Btn size="sm" variant="ghost" icon={<I.plus />} onClick={quickTaskSelected} disabled={runActive}>Quick task</Btn>
                      <Btn size="sm" variant="ghost" icon={<I.check />} onClick={completeSelected} disabled={runActive}>Complete</Btn>
                      <Btn size="sm" variant="ghost" icon={<I.download />} onClick={exportCsv}>Export CSV</Btn>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <Card className="gbcp-fill-results">
              <SectionTitle icon={<I.task />} title="Tasks"
                count={loadState === 'ready' ? `${visible.length}${visible.length !== tasks.length ? ' of ' + tasks.length : ''}` : ''}
                sub={loadState === 'error' ? 'Could not load tasks' : undefined} />
              {loadState === 'loading' ? (
                <Spinner label="Loading tasks…" />
              ) : loadState === 'error' ? (
                <div style={{ padding: '44px 0', textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12.5 }}>
                  Task list unavailable. <button onClick={loadTasks} style={{ background: 'none', border: 0, color: 'var(--gb-brand-label)', cursor: 'pointer', fontWeight: 600 }}>Retry</button>
                </div>
              ) : visible.length === 0 ? (
                <div style={{ padding: '44px 0', textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12.5 }}>No tasks match your filters.</div>
              ) : (
                <>
                  {/* Internal scroll: the table has its own bounded height and
                      scrolls here (sticky <thead> pins), so the settled search
                      bar and Refine sidebar never move. */}
                  <div ref={tableScrollRef} className="gb-scroll gbcp-fill-table">
                    <table style={tableStyle}>
                      <thead><tr>
                        {/* Fixed-width checkbox column so header + body line up */}
                        <Th align="center" style={{ width: 38, padding: '6px 8px' }}><TaskCheckbox done={allVisibleSelected} onClick={toggleAll} title={allVisibleSelected ? 'Deselect all' : 'Select all'} /></Th>
                        <SortTh label="Subject" k="subject" chain={sortChain} onSort={onSort} />
                        <SortTh label="Account" k="account" chain={sortChain} onSort={onSort} />
                        <SortTh label="Contact" k="contact" chain={sortChain} onSort={onSort} />
                        <SortTh label="Due" k="dueDate" chain={sortChain} onSort={onSort} align="left" />
                        <SortTh label="Category" k="category" chain={sortChain} onSort={onSort} />
                        <SortTh label="Priority" k="priority" chain={sortChain} onSort={onSort} />
                        <Th align="center">Actions</Th>
                      </tr></thead>
                      <tbody>
                        {renderedTasks.map((t, i) => (
                          <TaskRow key={t.id} t={t} index={i} selected={selected.has(t.id)} onToggle={toggleRow}
                            status={statusByRow[t.id]} today={today} onEdit={editTask} onCompleteOne={completeOne} runActive={runActive} />
                        ))}
                      </tbody>
                    </table>
                  {renderCount < visible.length && (
                    <div ref={loadMoreRef} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--gb-text-muted)', fontSize: 10.5 }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .7s linear infinite' }} />
                      Loading more tasks…
                    </div>
                  )}
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      </DetailPageFrame>

      <EmailRunner
        open={emailRunnerOpen}
        cursor={emailRunnerCursor}
        contacts={emailContacts}
        onClose={() => setEmailRunnerOpen(false)}
        onResetRowStates={() => setStatusByRow({})}
        onRowsQueued={(ids) => setStatusByRow((m) => { const n = { ...m }; (ids || []).forEach((cid) => emailRowsFor(cid).forEach((tid) => { n[tid] = { phase: 'queued' }; })); return n; })}
        onRowStart={(cid) => setStatusByRow((m) => { const n = { ...m }; emailRowsFor(cid).forEach((tid) => { n[tid] = { phase: 'sending', label: 'Emailing…' }; }); return n; })}
        onRowDone={(cid, outcome) => setStatusByRow((m) => {
          const n = { ...m };
          const phase = outcome?.status === 'sent' ? 'sent' : outcome?.status === 'skipped' ? 'skipped' : 'error';
          const label = outcome?.status === 'sent' ? 'Emailed' : outcome?.status === 'skipped' ? (outcome?.reason || 'Skipped') : 'Failed';
          emailRowsFor(cid).forEach((tid) => { n[tid] = { phase, label, detail: outcome?.error || outcome?.reason }; });
          return n;
        })}
        onRunStateChange={(active) => {
          setRunActive(active);
          // When the email run ends, let the ✓/skip outcomes linger briefly,
          // then clear them so the Edit/Complete buttons return (errors stay).
          if (!active) setTimeout(() => setStatusByRow((m) => {
            const n = {};
            for (const [id, st] of Object.entries(m)) if (st?.phase === 'error') n[id] = st;
            return n;
          }), 2600);
        }}
      />
    </ModalCtx.Provider>
    </DataCtx.Provider>
  );
}

/* Sortable header cell — arrow reflects the active sort direction. */
function SortTh({ label, k, chain, onSort, align = 'left' }) {
  const top = chain[0];
  const active = top && top.key === k;
  return (
    <Th align={align} style={{ cursor: 'pointer', userSelect: 'none' }}>
      <span onClick={() => onSort(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {label}
        <span style={{ opacity: active ? 1 : 0.25, fontSize: 8 }}>{active ? (top.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </span>
    </Th>
  );
}

/* ── Register with the custom-pages engine (Page 349 → task_list) ── */
if (!window.__gbTaskListPageRegistered) {
  window.__gbTaskListPageRegistered = true;
  ensureTheme();
  window.__gbCustomPages = window.__gbCustomPages || {};
  window.__gbCustomPages.task_list = {
    render(rootEl, ctx) {
      const root = createRoot(rootEl);
      root.render(
        <ToastHost installGlobal={false}>
          <DetailErrorBoundary label="Task List page"><TaskListApp store={ctx.store} /></DetailErrorBoundary>
        </ToastHost>,
      );
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
