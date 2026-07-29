/* eslint-disable */
/**
 * Action Review custom page (CRM Page 286).
 *
 * The native page is a firm-wide task review: one #TableTasks with tens of
 * thousands of rows (all reps) behind filter headers (Sales Rep / date range),
 * plus per-row Subject / Category / Status / Live Date / Due Date. This
 * takeover renders it in the shared shell with a Refine sidebar (Status /
 * Category / Due bucket), search, lazy-rendered rows, and the same row
 * emphasis language as the Task List page. The Sales Rep + date-range
 * filtering happens SERVER-side on the native page (a postback) — the
 * takeover parses whatever filter state the page was loaded with.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { dueBucket, DUE_BUCKETS } from '../lib/taskListModel.js';
import { completeTaskById } from '../lib/crmTasks.js';
import { Dropdown } from '../ui/components/Dropdown.jsx';
import { DatePicker } from '../ui/components/DatePicker.jsx';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import {
  Btn, Card, DASH, DataCtx, DetailErrorBoundary, I, IconBtn, SectionTitle,
  Spinner, Tag, Td, Th, tableStyle, trStyle, txt,
} from '../lib/detail-shared.jsx';
import { Breadcrumb, DetailPageFrame, EditTaskModal, ModalCtx, TopBar, useDetailData, useModalHost } from '../lib/crm-detail-shared.jsx';

/* M/D/YYYY for the WebForms postback (native date-picker format). */
const fmtMDY = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}` : '');

const BATCH = 60;

/* Parse the review rows off a document. Cells: [Subject, Category, Status,
   Live Date, Due Date] (leading blank + trailing action cells vary). */
function parseReviewTasks(doc) {
  const out = [];
  doc.querySelectorAll('tr[id^="taskrow_"]').forEach((row) => {
    if (row.id.includes('taskrow2_')) return;
    const cells = Array.from(row.querySelectorAll('td')).map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim());
    if (cells.length < 5) return;
    // Some layouts lead with a blank icon cell — detect by the status column.
    const off = /^(new|waiting|complete)/i.test(cells[2] || '') ? 0 : 1;
    const [subject, category, status, live, due] = cells.slice(off, off + 5);
    out.push({
      id: row.id.replace('taskrow_', ''),
      subject: subject || '', category: category || '', status: status || '',
      live: live || '', due: due || '', dueDate: new Date(due || ''),
    });
  });
  return out;
}

/* ── Server-side filter (Sales Rep + date), reverse-engineered from the
   native page: the Submit button runs GetSalesRepData() →
   __doPostBack('GetSalesRep', JSON.stringify({SalesRep, DateOption,
   DateTime, SecondDateTime})) — a classic WebForms POST back to
   Default.aspx?Page=286 carrying __VIEWSTATE/__EVENTVALIDATION. We replay
   that POST with fetch and parse the returned HTML. ── */
function collectFormState(doc) {
  const state = {};
  doc.querySelectorAll('form input[name], form select[name]').forEach((el) => {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'button' || type === 'submit' || type === 'image') return;
    if ((type === 'checkbox' || type === 'radio') && !el.checked) return;
    state[el.name] = el.value ?? '';
  });
  return state;
}
function parseRepOptions(doc) {
  const out = [];
  doc.querySelectorAll('#SalesRep option').forEach((o) => {
    const v = o.getAttribute('value') || '';
    const label = (o.textContent || '').trim();
    if (label) out.push({ id: v, label });
  });
  return out;
}
async function postFilter(formState, { rep, dateOption, date1, date2 }) {
  const fields = { ...formState };
  fields.__EVENTTARGET = 'GetSalesRep';
  fields.__EVENTARGUMENT = JSON.stringify({
    SalesRep: rep, DateOption: dateOption, DateTime: date1 || '', SecondDateTime: date2 || '',
  });
  fields['ctl00$SalesRep'] = rep;
  fields['ctl00$DateOption'] = dateOption;
  fields['ctl00$DateTime'] = date1 || '';
  fields['ctl00$SecondDateTime'] = date2 || '';
  const body = new URLSearchParams(fields).toString();
  const res = await fetch(window.location.href, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const html = await res.text();
  return new DOMParser().parseFromString(html, 'text/html');
}

const SELECT_STYLE = {
  width: '100%', height: 30, padding: '0 8px', boxSizing: 'border-box',
  border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)',
  background: 'var(--gb-fill-inverse-medium)', color: 'var(--gb-text-primary)',
  fontFamily: 'var(--gb-font-sans)', fontSize: 12, outline: 'none',
};

function FacetList({ label, options, selected, onToggle }) {
  return (
    <Card>
      <div style={{ padding: '10px 12px 4px', fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{label}</div>
      <div style={{ padding: '0 8px 8px', maxHeight: 240, overflowY: 'auto' }} className="gb-scroll">
        {options.map((o) => {
          const on = selected.has(o.id);
          return (
            <button key={o.id} onClick={() => onToggle(o.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 8px', border: 0, borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', textAlign: 'left', background: on ? 'var(--gb-brand-tint-soft)' : 'transparent' }}>
              <span style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), background: on ? 'var(--gb-brand-label)' : 'transparent', color: 'var(--gb-text-on-brand)' }}>{on && <I.check size={9} sw={3} />}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: on ? 600 : 500, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
              {o.count != null && <span style={{ fontSize: 10, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>{o.count}</span>}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

const statusTone = (s) => (/complete/i.test(s) ? 'success' : /waiting/i.test(s) ? 'warning' : 'info');

function ActionReviewApp({ store }) {
  const [D] = useDetailData(store);
  const modalHost = useModalHost();
  const [tasks, setTasks] = useState(null);
  const [query, setQuery] = useState('');
  const [statusSel, setStatusSel] = useState(new Set(['New']));
  const [catSel, setCatSel] = useState(new Set());
  const [dueSel, setDueSel] = useState(new Set());
  const [count, setCount] = useState(BATCH);
  const [focused, setFocused] = useState(false);
  // Server-side filters (native GetSalesRep postback)
  const [reps, setReps] = useState([]);
  const [rep, setRep] = useState('');
  const [dateOption, setDateOption] = useState('ON');
  const [date1, setDate1] = useState(() => new Date());   // defaults to TODAY
  const [date2, setDate2] = useState(null);
  const [serverBusy, setServerBusy] = useState(false);
  const formStateRef = useRef({});
  const sentinelRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    /* The live host DOM is unreliable here: the multi-MB page streams in
       slowly, and once DataTables initializes it strips all but the current
       10-row page from the DOM. The SERVER HTML ships every row, so re-fetch
       the page (same filter state — same URL) and parse that. Falls back to
       polling the live DOM if the fetch fails. */
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(window.location.href, { credentials: 'include' });
        const html = await res.text();
        if (cancelled) return;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const parsed = parseReviewTasks(doc);
        // Stash the WebForms state (viewstate etc.) + rep options for the
        // server-side filter POST, regardless of row count.
        formStateRef.current = collectFormState(doc);
        setReps(parseRepOptions(doc));
        const sel = doc.querySelector('#SalesRep');
        if (sel && sel.value) setRep(sel.value);
        if (parsed.length) { setTasks(parsed); return; }
      } catch (e) { /* fall through */ }
      // Fallback: poll the live DOM while the host page finishes loading.
      let tries = 0;
      const attempt = () => {
        if (cancelled) return;
        const live = parseReviewTasks(document);
        if (live.length || tries >= 20) setTasks(live);
        else { tries += 1; setTimeout(attempt, 500); }
      };
      attempt();
    })();
    return () => { cancelled = true; };
  }, []);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const facets = useMemo(() => {
    const st = new Map(); const cat = new Map();
    for (const t of tasks || []) {
      if (t.status) st.set(t.status, (st.get(t.status) || 0) + 1);
      if (t.category) cat.set(t.category, (cat.get(t.category) || 0) + 1);
    }
    const opt = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ id: k, label: k, count: n }));
    return { status: opt(st), category: opt(cat) };
  }, [tasks]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tasks || []).filter((t) => {
      if (statusSel.size && !statusSel.has(t.status)) return false;
      if (catSel.size && !catSel.has(t.category)) return false;
      if (dueSel.size && !dueSel.has(dueBucket(t.dueDate, today))) return false;
      if (q && !`${t.subject} ${t.category} ${t.status}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, query, statusSel, catSel, dueSel, today]);

  useEffect(() => { setCount(BATCH); }, [query, statusSel, catSel, dueSel]);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || count >= visible.length) return undefined;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setCount((c) => Math.min(c + BATCH, visible.length));
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [count, visible.length]);

  const toggle = (setter) => (v) => setter((cur) => { const n = new Set(cur); n.has(v) ? n.delete(v) : n.add(v); return n; });

  // Per-row actions (same treatment as the Task List page): Edit opens the
  // shared task modal; Complete writes then drops the row after a brief ✓.
  const [rowStatus, setRowStatusMap] = useState({});
  const editTask = (t) => modalHost.openModal(<EditTaskModal taskId={t.id} />);
  const completeOne = async (t) => {
    setRowStatusMap((m) => ({ ...m, [t.id]: 'running' }));
    try {
      await completeTaskById(t.id);
      setRowStatusMap((m) => ({ ...m, [t.id]: 'done' }));
      setTimeout(() => {
        setTasks((cur) => (cur || []).filter((x) => x.id !== t.id));
        setRowStatusMap((m) => { const n = { ...m }; delete n[t.id]; return n; });
      }, 650);
    } catch (e) { setRowStatusMap((m) => ({ ...m, [t.id]: 'error' })); }
  };

  // Apply the server-side Sales Rep / date filter via the native postback.
  const applyServerFilter = async () => {
    if (serverBusy) return;
    setServerBusy(true);
    setTasks(null);
    try {
      const doc = await postFilter(formStateRef.current, { rep, dateOption, date1: fmtMDY(date1), date2: fmtMDY(date2) });
      formStateRef.current = collectFormState(doc);   // fresh viewstate for the next POST
      setTasks(parseReviewTasks(doc));
      setCount(BATCH);
    } catch (e) {
      setTasks([]);
    } finally { setServerBusy(false); }
  };

  return (
    <DataCtx.Provider value={D}>
    <ModalCtx.Provider value={modalHost}>
      <DetailPageFrame
        currentPage="Action Review" ready modalHost={modalHost} hideScrollbar
        topBar={<TopBar><Breadcrumb items={[{ label: 'CRM', page: 261 }]} current="Action Review" /></TopBar>}
      >
        <div className="gbcp-search-grid" style={{ display: 'grid', gridTemplateColumns: '228px minmax(0, 1fr)', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 74 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '0 2px' }}>Refine</span>
            {/* Server-side filters — replay the native GetSalesRep postback,
                rendered with the extension's own Dropdown + DatePicker. */}
            <Card style={{ overflow: 'visible' }}>
              <div style={{ padding: '10px 12px 4px', fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Sales Rep</div>
              <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Dropdown value={rep} options={reps} onChange={setRep} size="sm" searchable placeholder="Select rep…" />
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 2 }}>Due date</div>
                <Dropdown value={dateOption} onChange={setDateOption} size="sm"
                  options={[{ id: 'ON', label: 'On' }, { id: 'BETWEEN', label: 'Between' }, { id: 'BEFORE', label: 'Before' }, { id: 'AFTER', label: 'After' }]} />
                <DatePicker value={date1} onChange={setDate1} includeTime={false} placeholder="Pick a date" />
                {dateOption === 'BETWEEN' && (
                  <DatePicker value={date2} onChange={setDate2} includeTime={false} placeholder="and…" />
                )}
                <Btn variant="primary" size="sm" icon={<I.search />} onClick={applyServerFilter} disabled={serverBusy || !reps.length}>
                  {serverBusy ? 'Loading…' : 'Apply'}
                </Btn>
              </div>
            </Card>
            <FacetList label="Status" options={facets.status} selected={statusSel} onToggle={toggle(setStatusSel)} />
            <FacetList label="Due" options={DUE_BUCKETS.map((b) => ({ ...b }))} selected={dueSel} onToggle={toggle(setDueSel)} />
            <FacetList label="Category" options={facets.category} selected={catSel} onToggle={toggle(setCatSel)} />
          </div>
          {/* Same column class as the task-list/search pages (24px top padding)
              so the search bar rests at the identical height on all three. */}
          <div className="gbcp-stack gbcp-search-body" style={{ minWidth: 0 }}>
            <div style={{ position: 'sticky', top: 96, zIndex: 20, margin: '0 2px' }}>
            <Card style={{
              border: '1px solid color-mix(in srgb, var(--gb-border-strong) 72%, transparent)',
              background: 'color-mix(in srgb, var(--gb-surface-1) 82%, transparent)',
              boxShadow: '0 18px 48px rgba(0,0,0,.24), 0 3px 12px rgba(0,0,0,.14), inset 0 1px 0 color-mix(in srgb, var(--gb-text-primary) 7%, transparent)',
            }}>
              <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 9, height: 36, padding: '0 11px',
                  background: 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (focused ? 'var(--gb-border-focus)' : 'var(--gb-border-default)'),
                  borderRadius: 12, transition: 'border-color var(--gb-anim)',
                }}>
                  <I.search size={15} style={{ color: 'var(--gb-text-muted)', flexShrink: 0 }} />
                  <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                    placeholder="Search subject, category, status…"
                    style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 13 }} />
                  {query && <IconBtn size="xs" ghost icon={<I.close />} title="Clear" onClick={() => setQuery('')} />}
                </div>
              </div>
            </Card>
            </div>
            <Card style={{ marginTop: 14 }}>
              <SectionTitle icon={<I.task />} title="Actions"
                count={tasks ? `${visible.length}${visible.length !== tasks.length ? ' of ' + tasks.length : ''}` : ''} />
              {tasks == null ? <Spinner label="Parsing tasks…" /> : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                      <thead><tr>
                        <Th>Subject</Th><Th>Category</Th><Th align="center">Status</Th>
                        <Th align="right">Live</Th><Th align="right">Due</Th>
                        <Th align="center">Actions</Th>
                      </tr></thead>
                      <tbody>
                        {visible.slice(0, count).map((t) => {
                          const b = dueBucket(t.dueDate, today);
                          const accent = b === 'overdue' ? 'var(--gb-error)' : b === 'today' ? 'var(--gb-warning)' : null;
                          return (
                            <tr key={t.id} className="gb-actrow" style={{ ...trStyle, ...(accent ? { boxShadow: `inset 3px 0 0 ${accent}` } : null) }}>
                              <Td>{txt(t.subject) || DASH}</Td>
                              <Td muted>{txt(t.category) || DASH}</Td>
                              <Td align="center">{t.status ? <Tag tone={statusTone(t.status)} size="sm">{t.status}</Tag> : DASH}</Td>
                              <Td align="right" mono muted>{txt(t.live) || DASH}</Td>
                              <Td align="right" mono muted>{txt(t.due) || DASH}</Td>
                              <Td align="center" style={{ width: 84, whiteSpace: 'nowrap' }}>
                                {rowStatus[t.id] === 'running' ? (
                                  <span style={{ width: 13, height: 13, display: 'inline-block', borderRadius: '50%', border: '2px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .7s linear infinite' }} />
                                ) : rowStatus[t.id] === 'done' ? (
                                  <span style={{ color: 'var(--gb-success)', display: 'inline-flex' }}><I.check size={14} sw={3} /></span>
                                ) : rowStatus[t.id] === 'error' ? (
                                  <span style={{ color: 'var(--gb-error)', display: 'inline-flex' }} title="Failed"><I.close size={13} sw={2.6} /></span>
                                ) : (
                                  <span style={{ display: 'inline-flex', gap: 4 }}>
                                    <IconBtn size="xs" ghost icon={<I.edit />} title="Edit task" onClick={() => editTask(t)} />
                                    <IconBtn size="xs" ghost icon={<I.check />} title="Complete task" onClick={() => completeOne(t)} />
                                  </span>
                                )}
                              </Td>
                            </tr>
                          );
                        })}
                        {visible.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12 }}>No actions match.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  {count < visible.length && (
                    <div ref={sentinelRef} style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--gb-text-muted)', fontSize: 10.5 }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .7s linear infinite' }} />
                      Loading more…
                    </div>
                  )}
                  <div style={{ height: 12 }} />
                </>
              )}
            </Card>
          </div>
        </div>
      </DetailPageFrame>
    </ModalCtx.Provider>
    </DataCtx.Provider>
  );
}

/* ── Register with the custom-pages engine (Page 286 → action_review) ── */
if (!window.__gbActionReviewPageRegistered) {
  window.__gbActionReviewPageRegistered = true;
  ensureTheme();
  window.__gbCustomPages = window.__gbCustomPages || {};
  window.__gbCustomPages.action_review = {
    render(rootEl, ctx) {
      const root = createRoot(rootEl);
      root.render(
        <ToastHost installGlobal={false}>
          <DetailErrorBoundary label="Action Review page"><ActionReviewApp store={ctx.store} /></DetailErrorBoundary>
        </ToastHost>,
      );
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
