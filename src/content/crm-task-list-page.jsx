/* eslint-disable */
/**
 * Task List custom page (CRM Page 349).
 *
 * A full-page takeover of the native task list that combines the standalone
 * Task List modal with the page — mirroring the CRM Search page (Page 360):
 * the shared DetailPageFrame shell (nav sidebar + top bar), a left Refine
 * sidebar (Status / Priority / Category / Due filters), a sticky/floating
 * search bar, a selectable results table, and a per-row STATUS column that
 * slides in the moment you run an email or quick-task action so you can watch
 * each row's outcome. Actions reuse the same transports as the modal
 * (crmTasks writers, submitQuickTask, EmailRunner) so behavior can't drift.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import {
  TASKS_ENDPOINT, STATUS_OPTS, PRIORITY_OPTS, DUE_BUCKETS,
  parseTasksFromHtml, distinctCategories, filterTasks, sortTasks, dueBucket, looksLikeLoginShell,
} from '../lib/taskListModel.js';
import { completeTaskById, getTaskContactId } from '../lib/crmTasks.js';
import { submitQuickTask } from '../lib/submitQuickTask.js';
import { EmailRunner } from '../modals/EmailRunner.jsx';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import {
  Btn, Card, DASH, DataCtx, DetailErrorBoundary, EmptyRow, I, IconBtn, ScrollArea, SectionTitle,
  Spinner, Tag, TaskCheckbox, Td, Th, fmtDate, goUrl, tableStyle, trStyle, txt,
} from '../lib/detail-shared.jsx';
import { Breadcrumb, DetailPageFrame, ModalCtx, TopBar, gbToast, useDetailData, useModalHost } from '../lib/crm-detail-shared.jsx';

const SEARCH_RAIL_TOP = 74;

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: SEARCH_RAIL_TOP }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Refine</span>
        {anySel ? <Btn variant="ghost" size="xs" icon={<I.close />} onClick={clearAll}>Clear</Btn> : null}
      </div>
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
    </div>
  );
}

/* A per-row status pill for the sliding Status column. */
const STATUS_TONE = {
  queued: { tone: 'neutral', label: 'Queued' },
  sending: { tone: 'info', label: 'Sending…' },
  running: { tone: 'info', label: 'Running…' },
  sent: { tone: 'success', label: 'Sent' },
  done: { tone: 'success', label: 'Done' },
  skipped: { tone: 'warning', label: 'Skipped' },
  error: { tone: 'error', label: 'Failed' },
};
function StatusPill({ st }) {
  if (!st) return null;
  const meta = STATUS_TONE[st.phase] || { tone: 'neutral', label: st.phase };
  const spin = st.phase === 'sending' || st.phase === 'running';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, animation: 'gb-fade-slide var(--gb-anim) both' }} title={st.detail || meta.label}>
      {spin && <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .7s linear infinite' }} />}
      <Tag tone={meta.tone} size="sm">{st.label || meta.label}</Tag>
    </span>
  );
}

function TaskRow({ t, selected, onToggle, showStatus, status }) {
  const open = () => { if (t.contactUrl) goUrl(t.contactUrl); };
  return (
    <tr className="gb-actrow" style={{ ...trStyle, cursor: t.contactUrl ? 'pointer' : 'default' }} onClick={open}
      title={t.contactUrl ? 'Open contact · click checkbox to select' : ''}>
      <Td align="center" style={{ cursor: 'default' }}>
        <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
          <TaskCheckbox done={selected} onClick={(e) => { e?.stopPropagation?.(); onToggle(e); }} title={selected ? 'Deselect' : 'Select'} />
        </span>
      </Td>
      <Td>{txt(t.account) || DASH}</Td>
      <Td>{txt(t.contact) || DASH}</Td>
      <Td muted>{txt(t.due) || DASH}</Td>
      <Td muted>{txt(t.category) || DASH}</Td>
      <Td><Tag tone={priTone(t.priority)} size="sm">{t.priorityLabel || 'Med'}</Tag></Td>
      <Td>{txt(t.subject) || DASH}</Td>
      {showStatus && <Td style={{ minWidth: 96 }}><StatusPill st={status} /></Td>}
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
  const [focused, setFocused] = useState(false);
  const [floating, setFloating] = useState(false);

  const [statusByRow, setStatusByRow] = useState({});   // taskId → { phase, label, detail }
  const [runActive, setRunActive] = useState(false);
  const [emailRunnerOpen, setEmailRunnerOpen] = useState(false);
  const [emailRunnerCursor, setEmailRunnerCursor] = useState(null);
  const contactToTasksRef = useRef(new Map());   // contactId → [taskId] for email callbacks
  const inputRef = useRef(null);
  const gen = useRef(0);

  const loadTasks = useCallback(async () => {
    const g = ++gen.current;
    setLoadState('loading');
    try {
      const res = await fetch(TASKS_ENDPOINT, { credentials: 'include' });
      const html = await res.text();
      if (g !== gen.current) return;
      if (looksLikeLoginShell(html)) { setLoadState('error'); return; }
      setTasks(parseTasksFromHtml(html));
      setLoadState('ready');
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

  const toggleRow = (id) => setSelected((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisibleSelected = visible.length > 0 && visible.every((t) => selected.has(t.id));
  const toggleAll = () => setSelected((cur) => {
    const n = new Set(cur);
    if (allVisibleSelected) visible.forEach((t) => n.delete(t.id));
    else visible.forEach((t) => n.add(t.id));
    return n;
  });

  const selectedTasks = useMemo(() => visible.filter((t) => selected.has(t.id)), [visible, selected]);
  const setRowStatus = (id, patch) => setStatusByRow((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } }));
  const showStatus = runActive || Object.keys(statusByRow).length > 0;

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

  // ── Complete selected ─────────────────────────────────────────
  const completeSelected = async () => {
    const ids = selectedTasks.map((t) => t.id);
    if (!ids.length) { gbToast('Select tasks first', 'info'); return; }
    setRunActive(true);
    ids.forEach((id) => setRowStatus(id, { phase: 'queued' }));
    for (const id of ids) {              // sequential — CRM rate-limits Update.ajax
      setRowStatus(id, { phase: 'running', label: 'Completing…' });
      try { await completeTaskById(id); setRowStatus(id, { phase: 'done', label: 'Completed' }); }
      catch (e) { setRowStatus(id, { phase: 'error', label: 'Failed', detail: e?.message }); }
    }
    setRunActive(false);
    loadTasks();
  };

  // ── Quick task on selected (create a follow-up per task's contact) ─
  const quickTaskSelected = async () => {
    const rows = selectedTasks;
    if (!rows.length) { gbToast('Select tasks first', 'info'); return; }
    let employeeId = '';
    try {
      employeeId = await new Promise((r) => {
        if (!chrome?.storage?.local?.get) { r(''); return; }
        chrome.storage.local.get('gbEmployeeId', (o) => r(o?.gbEmployeeId || ''));
      });
    } catch {}
    setRunActive(true);
    rows.forEach((t) => setRowStatus(t.id, { phase: 'queued' }));
    for (const t of rows) {
      setRowStatus(t.id, { phase: 'running', label: 'Adding…' });
      try {
        const contactId = contactIdFromUrl(t.contactUrl) || await getTaskContactId(t.id);
        const res = await submitQuickTask({ template: { subject: `Follow up: ${t.subject}`.slice(0, 120), body: '', daysOut: 3 }, context: { contactId, employeeId } });
        if (!res?.ok) throw new Error(res?.error || 'Create task failed');
        setRowStatus(t.id, { phase: 'done', label: 'Task added' });
      } catch (e) { setRowStatus(t.id, { phase: 'error', label: 'Failed', detail: e?.message }); }
    }
    setRunActive(false);
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

  const onScroll = useCallback((e) => { setFloating((Number(e?.currentTarget?.scrollTop) || 0) > 0); }, []);
  const selCount = selectedTasks.length;

  return (
    <DataCtx.Provider value={D}>
    <ModalCtx.Provider value={modalHost}>
      <DetailPageFrame
        currentPage="Task List" ready modalHost={modalHost} onContentScroll={onScroll}
        topBar={<TopBar><Breadcrumb items={[{ label: 'CRM', page: 261 }]} current="Task List" /></TopBar>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '228px minmax(0, 1fr)', gap: 12, alignItems: 'flex-start' }}>
          <TaskFacetSidebar
            tasks={tasks} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            prioritySel={prioritySel} categorySel={categorySel} dueSel={dueSel}
            toggle={toggleFacet} clearAll={clearAll} counts={counts}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            {/* Sticky/floating search + action bar */}
            <div style={{ position: 'sticky', top: SEARCH_RAIL_TOP, zIndex: 20, margin: '0 2px' }}>
              <Card style={{
                borderRadius: floating ? 16 : 'var(--gb-r-md)',
                boxShadow: floating ? '0 14px 40px rgba(0,0,0,.22), 0 2px 10px rgba(0,0,0,.12)' : 'none',
                transition: 'border-radius 380ms cubic-bezier(.22,1,.36,1), box-shadow var(--gb-anim)',
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
                  {/* Selection action rail — slides in when rows are checked */}
                  <div style={{ display: 'grid', gridTemplateRows: selCount > 0 ? '1fr' : '0fr', transition: 'grid-template-rows .24s cubic-bezier(.4,0,.2,1)' }}>
                    <div style={{ overflow: 'hidden', minHeight: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 2 }}>
                        <span style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)' }}>
                          <strong style={{ color: 'var(--gb-brand-label)', fontWeight: 700 }}>{selCount} selected</strong>
                        </span>
                        <div style={{ flex: 1 }} />
                        <Btn size="sm" variant="ghost" icon={<I.mail />} onClick={openEmail} disabled={runActive}>Email selected</Btn>
                        <Btn size="sm" variant="ghost" icon={<I.plus />} onClick={quickTaskSelected} disabled={runActive}>Quick task</Btn>
                        <Btn size="sm" variant="ghost" icon={<I.check />} onClick={completeSelected} disabled={runActive}>Complete</Btn>
                        <Btn size="sm" variant="ghost" icon={<I.download />} onClick={exportCsv}>Export CSV</Btn>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Results */}
            <Card>
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
                <ScrollArea max={640}>
                  <table style={tableStyle}>
                    <thead><tr>
                      <Th align="center"><TaskCheckbox done={allVisibleSelected} onClick={toggleAll} title={allVisibleSelected ? 'Deselect all' : 'Select all'} /></Th>
                      <Th align="center">Type</Th>
                      <SortTh label="Account" k="account" chain={sortChain} onSort={onSort} />
                      <SortTh label="Contact" k="contact" chain={sortChain} onSort={onSort} />
                      <SortTh label="Due" k="dueDate" chain={sortChain} onSort={onSort} align="left" />
                      <SortTh label="Category" k="category" chain={sortChain} onSort={onSort} />
                      <SortTh label="Priority" k="priority" chain={sortChain} onSort={onSort} />
                      <SortTh label="Subject" k="subject" chain={sortChain} onSort={onSort} />
                      {showStatus && <Th>Status</Th>}
                    </tr></thead>
                    <tbody>
                      {visible.map((t) => (
                        <TaskRow key={t.id} t={t} selected={selected.has(t.id)} onToggle={() => toggleRow(t.id)} showStatus={showStatus} status={statusByRow[t.id]} />
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
              <div style={{ height: 12 }} />
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
        onRunStateChange={setRunActive}
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
