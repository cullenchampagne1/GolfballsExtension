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
import { ToastHost } from '../ui/components/ToastHost.jsx';
import {
  Card, DASH, DataCtx, DetailErrorBoundary, I, IconBtn, SectionTitle,
  Spinner, Tag, Td, Th, tableStyle, trStyle, txt,
} from '../lib/detail-shared.jsx';
import { Breadcrumb, DetailPageFrame, ModalCtx, TopBar, useDetailData, useModalHost } from '../lib/crm-detail-shared.jsx';

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

  return (
    <DataCtx.Provider value={D}>
    <ModalCtx.Provider value={modalHost}>
      <DetailPageFrame
        currentPage="Action Review" ready modalHost={modalHost} hideScrollbar
        topBar={<TopBar><Breadcrumb items={[{ label: 'CRM', page: 261 }]} current="Action Review" /></TopBar>}
      >
        <div className="gbcp-search-grid" style={{ display: 'grid', gridTemplateColumns: '228px minmax(0, 1fr)', gap: 12, alignItems: 'flex-start', paddingTop: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 74 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '0 2px' }}>Refine</span>
            <FacetList label="Status" options={facets.status} selected={statusSel} onToggle={toggle(setStatusSel)} />
            <FacetList label="Due" options={DUE_BUCKETS.map((b) => ({ ...b }))} selected={dueSel} onToggle={toggle(setDueSel)} />
            <FacetList label="Category" options={facets.category} selected={catSel} onToggle={toggle(setCatSel)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <Card style={{
              border: '1px solid color-mix(in srgb, var(--gb-border-strong) 72%, transparent)',
              background: 'color-mix(in srgb, var(--gb-surface-1) 82%, transparent)',
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
            <Card style={{ marginTop: 2 }}>
              <SectionTitle icon={<I.task />} title="Actions"
                count={tasks ? `${visible.length}${visible.length !== tasks.length ? ' of ' + tasks.length : ''}` : ''} />
              {tasks == null ? <Spinner label="Parsing tasks…" /> : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                      <thead><tr>
                        <Th>Subject</Th><Th>Category</Th><Th align="center">Status</Th>
                        <Th align="right">Live</Th><Th align="right">Due</Th>
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
                            </tr>
                          );
                        })}
                        {visible.length === 0 && <tr><Td colSpan={5} align="center" muted style={{ padding: 24 }}>No actions match.</Td></tr>}
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
