/* eslint-disable */
/**
 * My Recent History custom page (CRM Page 279).
 *
 * Table-centric takeover: the five native history DataTables (phone/contact,
 * accounts, contacts, logos, orders) render as cards in the shared shell.
 * Each card gets its own search box and a bounded scroll view with
 * infinite-scroll behavior (rows lazy-reveal as the card scrolls, so a
 * 1000-row history doesn't mount at once). Cell links stay real <a href>s
 * (ctrl/cmd-click opens a new tab).
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { parseRecentHistory, filterHistoryRows } from '../lib/recentHistoryModel.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import {
  Card, DASH, DataCtx, DetailErrorBoundary, I, IconBtn, ScrollArea, SectionTitle,
  Spinner, Td, Th, tableStyle, trStyle,
} from '../lib/detail-shared.jsx';
import { Breadcrumb, DetailPageFrame, ModalCtx, TopBar, useDetailData, useModalHost } from '../lib/crm-detail-shared.jsx';

const BATCH = 40;
const LINK_STYLE = { color: 'var(--gb-brand-label)', fontWeight: 600, textDecoration: 'none' };

/* One history table card: search + bounded scroll + lazy reveal. */
function HistoryCard({ spec }) {
  const [q, setQ] = useState('');
  const [count, setCount] = useState(BATCH);
  const sentinelRef = useRef(null);
  const Icon = I[spec.icon] || I.history;

  const rows = useMemo(() => filterHistoryRows(spec.rows, q), [spec.rows, q]);
  useEffect(() => { setCount(BATCH); }, [q]);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || count >= rows.length) return undefined;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setCount((c) => Math.min(c + BATCH, rows.length));
    }, { rootMargin: '300px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [count, rows.length]);

  return (
    <Card>
      <SectionTitle
        icon={<Icon />} title={spec.title} count={`${rows.length}`}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 26, padding: '0 8px', background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)' }}>
            <I.search size={12} style={{ color: 'var(--gb-text-muted)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…"
              style={{ width: 140, border: 0, outline: 0, background: 'transparent', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 11.5 }} />
            {q && <IconBtn size="xs" ghost icon={<I.close />} title="Clear" onClick={() => setQ('')} />}
          </div>
        }
      />
      <ScrollArea max={420}>
        <table style={tableStyle}>
          <thead><tr>{spec.headers.map((h, i) => <Th key={i}>{h}</Th>)}</tr></thead>
          <tbody>
            {rows.slice(0, count).map((r, ri) => (
              <tr key={ri} className="gb-actrow" style={trStyle}>
                {r.cells.map((c, ci) => (
                  <Td key={ci} muted={!c.href}>
                    {c.href ? <a href={c.href} style={LINK_STYLE}>{c.text || DASH}</a> : (c.text || DASH)}
                  </Td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><Td colSpan={spec.headers.length} align="center" muted style={{ padding: 24 }}>No rows{q ? ' match your filter' : ''}.</Td></tr>
            )}
          </tbody>
        </table>
        {count < rows.length && (
          <div ref={sentinelRef} style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--gb-text-muted)', fontSize: 10.5 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .7s linear infinite' }} />
            Loading more…
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}

function RecentHistoryApp({ store }) {
  const [D] = useDetailData(store);
  const modalHost = useModalHost();
  const [tables, setTables] = useState(null);

  useEffect(() => {
    // The live host DOM only holds the CURRENT DataTables page (10 rows) —
    // the page's jQuery isn't reachable from the isolated world to expand
    // them. The server HTML, however, ships EVERY row (DataTables paginates
    // client-side after load), so re-fetch the page and parse the raw HTML.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(window.location.href, { credentials: 'include' });
        const html = await res.text();
        if (cancelled) return;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const parsed = parseRecentHistory(doc, window.location.href);
        if (parsed.length) { setTables(parsed); return; }
      } catch (e) { /* fall through to live DOM */ }
      if (!cancelled) setTables(parseRecentHistory(document, window.location.href));
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <DataCtx.Provider value={D}>
    <ModalCtx.Provider value={modalHost}>
      <DetailPageFrame
        currentPage="My Recent History" ready modalHost={modalHost} hideScrollbar
        topBar={<TopBar><Breadcrumb items={[{ label: 'CRM', page: 261 }]} current="My Recent History" /></TopBar>}
      >
        {/* Same top padding as the search/task pages so the first card doesn't
            butt against the top bar. */}
        <div className="gbcp-stack gbcp-search-body" style={{ minWidth: 0, gap: 14 }}>
          {tables == null ? (
            <Spinner label="Loading history…" />
          ) : tables.length === 0 ? (
            <Card><div style={{ padding: '44px 0', textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12.5 }}>No history tables found on this page.</div></Card>
          ) : (
            tables.map((spec) => <HistoryCard key={spec.key} spec={spec} />)
          )}
        </div>
      </DetailPageFrame>
    </ModalCtx.Provider>
    </DataCtx.Provider>
  );
}

/* ── Register with the custom-pages engine (Page 279 → my_recent_history) ── */
if (!window.__gbRecentHistoryPageRegistered) {
  window.__gbRecentHistoryPageRegistered = true;
  ensureTheme();
  window.__gbCustomPages = window.__gbCustomPages || {};
  window.__gbCustomPages.my_recent_history = {
    render(rootEl, ctx) {
      const root = createRoot(rootEl);
      root.render(
        <ToastHost installGlobal={false}>
          <DetailErrorBoundary label="My Recent History page"><RecentHistoryApp store={ctx.store} /></DetailErrorBoundary>
        </ToastHost>,
      );
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
