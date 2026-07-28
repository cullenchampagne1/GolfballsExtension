/* eslint-disable */
/**
 * CRM Search custom page (CRM Page 360).
 *
 * A full-page takeover of the native CRM search: the shared DetailPageFrame
 * shell (sidebar + top bar) wrapping a refined search hero, a live Solr
 * results table, and the existing Query Builder as an entrance for advanced
 * filters. Search state is mirrored to the URL (?q=&t=&fq=) so a search is
 * shareable/deep-linkable and survives reload — and so arriving from the
 * native search (which mutates the URL) carries the term across.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { crmSolrQuery, SOLR_ROWS } from '../lib/crmSolrSearch.js';
import { QueryBuilder } from '../modals/QueryBuilder.jsx';
import {
  ARMOR, Btn, Card, DASH, DataCtx, DetailErrorBoundary, I, IconBtn, ScrollArea, SectionTitle, Spinner,
  Tag, Td, Th, DASH as _DASH, EmptyRow, fmt$, fmtDate, goUrl, num, recUrl, tableStyle, trStyle, txt,
} from '../lib/detail-shared.jsx';
import { Breadcrumb, DetailPageFrame, ModalCtx, TopBar, gbToast, useDetailData, useModalHost } from '../lib/crm-detail-shared.jsx';

const TYPE_OPTS = [
  { id: 'all', label: 'All' },
  { id: 'contact', label: 'Contacts' },
  { id: 'account', label: 'Accounts' },
];

/* ── URL <-> search state ─────────────────────────────────────
   The native search puts its term in the URL; we own ?q/?t/?fq going
   forward but also read a few common native param names on first load. */
function readUrlSearch() {
  try {
    const p = new URLSearchParams(location.search);
    const q = p.get('q') || p.get('keyword') || p.get('search') || p.get('term') || '';
    const t = (p.get('t') || 'all').toLowerCase();
    const fq = p.get('fq') || '';
    return { q, type: TYPE_OPTS.some((o) => o.id === t) ? t : 'all', fq };
  } catch (e) { return { q: '', type: 'all', fq: '' }; }
}
function writeUrlSearch(q, type, solrFq) {
  try {
    const p = new URLSearchParams(location.search);
    p.set('Page', '360');
    if (q) p.set('q', q); else p.delete('q');
    if (type && type !== 'all') p.set('t', type); else p.delete('t');
    if (solrFq) p.set('fq', solrFq); else p.delete('fq');
    history.replaceState(null, '', location.pathname + '?' + p.toString());
  } catch (e) {}
}

/* Segmented type switcher (All / Contacts / Accounts). */
function TypeTabs({ value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', padding: 3, gap: 2, height: 36, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', flexShrink: 0, boxSizing: 'border-box' }}>
      {TYPE_OPTS.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)}
            style={{
              height: '100%', padding: '0 13px', border: 0, borderRadius: 'var(--gb-r-sm)', cursor: 'pointer',
              fontFamily: 'var(--gb-font-sans)', fontSize: 11.5, fontWeight: on ? 700 : 600,
              color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
              background: on ? 'var(--gb-surface-1)' : 'transparent',
              boxShadow: on ? 'var(--gb-shadow-sm, 0 1px 2px rgba(0,0,0,.14))' : 'none',
              transition: 'all var(--gb-anim)',
            }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function typeTone(t) {
  const s = (t || '').toLowerCase();
  if (s === 'contact') return 'info';
  if (s === 'account') return 'brand';
  return 'neutral';
}

/* One result row — staggered fade-in, click-through to the record. */
function ResultRow({ r, i }) {
  const url = recUrl(r);
  const isAcct = String(r.id || '').startsWith('account') || (r.recordType_s || '').toLowerCase() === 'account';
  const name = r.contactName_t || r.accountName_t || r.id;
  const email = (Array.isArray(r.emails_tps) && r.emails_tps[0]) || r.email_tp || '';
  const go = () => { if (url) goUrl(url); };
  return (
    <tr className="gb-actrow" onClick={go} title={url ? 'Open record' : undefined}
      style={{ ...trStyle, cursor: url ? 'pointer' : 'default', animation: 'gb-fade-slide var(--gb-anim) both', animationDelay: Math.min(i, 16) * 18 + 'ms' }}>
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `var(--gb-${typeTone(r.recordType_s)}-tint-medium)`, border: `1px solid var(--gb-${typeTone(r.recordType_s)}-tint-border)`, color: `var(--gb-${typeTone(r.recordType_s)}-fg)` }}>
            {isAcct ? <I.briefcase size={13} /> : <I.user size={13} />}
          </span>
          <span style={{ fontWeight: 600, color: 'var(--gb-text-primary)' }}>{name}</span>
        </div>
      </Td>
      <Td muted>{r.accountName_t || DASH}</Td>
      <Td align="center">{r.recordType_s ? <Tag tone={typeTone(r.recordType_s)} size="xs">{r.recordType_s}</Tag> : DASH}</Td>
      <Td muted>{email || DASH}</Td>
      <Td align="right" mono>{num(r.orderCount_i) != null ? r.orderCount_i : DASH}</Td>
      <Td align="right" mono>{num(r.yearToDateRevenue_f) != null ? fmt$(r.yearToDateRevenue_f) : DASH}</Td>
      <Td align="right" mono>{num(r.priorYearRevenue_f) != null ? fmt$(r.priorYearRevenue_f) : DASH}</Td>
      <Td align="right" mono muted>{r.lastOrderDate_dt ? fmtDate(r.lastOrderDate_dt) : DASH}</Td>
    </tr>
  );
}

function App({ store }) {
  const [D, patch] = useDetailData(store);
  const modalHost = useModalHost();

  const url0 = useMemo(() => readUrlSearch(), []);
  const [query, setQuery] = useState(url0.q);
  const [type, setType] = useState(url0.type);
  const [qbFilter, setQbFilter] = useState(url0.fq ? { label: 'Saved filter', solrFq: url0.fq, conditions: [], state: null } : null);
  const [rows, setRows] = useState([]);
  const [numFound, setNumFound] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);
  const [qbOpen, setQbOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  // Results list fills the leftover vertical space. The takeover renders at
  // PAGE_ZOOM (1.375), so a height in this coordinate space shows scaled — divide
  // the real viewport by the zoom, minus the top bar + hero + card chrome.
  const [listMax, setListMax] = useState(560);
  useEffect(() => {
    const calc = () => setListMax(Math.max(340, Math.round((window.innerHeight || 900) / 1.375) - 250));
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  const inputRef = useRef(null);
  const gen = useRef(0);   // ignore stale responses

  const runSearch = useCallback(async (q, t, qb, start = 0) => {
    const g = ++gen.current;
    if (start === 0) { setLoading(true); setError(false); } else setLoadingMore(true);
    setSearched(true);
    try {
      const { docs, numFound } = await crmSolrQuery({ query: q, type: t, solrFq: qb?.solrFq || '', start });
      if (gen.current !== g) return;
      setRows((prev) => (start === 0 ? docs : prev.concat(docs)));
      setNumFound(numFound);
    } catch (e) {
      if (gen.current !== g) return;
      setError(true); if (start === 0) setRows([]);
      gbToast('CRM search is unavailable right now', 'error');
    } finally {
      if (gen.current === g) { setLoading(false); setLoadingMore(false); }
    }
  }, []);

  // On mount: always run an initial search so the page opens on a populated
  // list (match-all → most-recent records) like the native page, seeded with
  // any term/filter the URL carried. Then focus the field.
  useEffect(() => {
    runSearch(url0.q, url0.type, url0.fq ? { solrFq: url0.fq } : null, 0);
    setTimeout(() => { try { inputRef.current && inputRef.current.focus(); } catch (e) {} }, 60);
  }, []);   // eslint-disable-line

  const submit = () => {
    writeUrlSearch(query.trim(), type, qbFilter?.solrFq || '');
    runSearch(query.trim(), type, qbFilter, 0);
  };
  const onTypeChange = (t) => { setType(t); writeUrlSearch(query.trim(), t, qbFilter?.solrFq || ''); if (searched) runSearch(query.trim(), t, qbFilter, 0); };
  const applyQb = (filter) => { setQbFilter(filter); setQbOpen(false); writeUrlSearch(query.trim(), type, filter?.solrFq || ''); runSearch(query.trim(), type, filter, 0); };
  const clearQb = () => { setQbFilter(null); writeUrlSearch(query.trim(), type, ''); runSearch(query.trim(), type, null, 0); };
  const canLoadMore = rows.length < numFound && !loading && !loadingMore;

  return (
    <DataCtx.Provider value={D}>
    <ModalCtx.Provider value={modalHost}>
      <DetailPageFrame
        currentPage="Search"
        ready
        modalHost={modalHost}
        topBar={<TopBar><Breadcrumb items={[{ label: 'CRM', page: 261 }]} current="Search" /></TopBar>}
      >
        {/* ── Search hero ─────────────────────────────────────── */}
        <Card style={{ animation: 'gb-fade-slide var(--gb-anim) both' }}>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* Search input — height matched to the buttons (36) */}
              <div style={{
                flex: 1, minWidth: 260, display: 'flex', alignItems: 'center', gap: 9, height: 36, padding: '0 11px',
                background: 'var(--gb-fill-inverse-medium)',
                border: '1px solid ' + (focused ? 'var(--gb-border-focus)' : 'var(--gb-border-default)'),
                borderRadius: 'var(--gb-r-md)',
                boxShadow: focused ? '0 0 0 3px color-mix(in srgb, var(--gb-brand-label) 18%, transparent)' : 'none',
                transition: 'box-shadow var(--gb-anim), border-color var(--gb-anim)',
              }}>
                <I.search size={15} style={{ color: 'var(--gb-text-muted)', flexShrink: 0 }} />
                <input ref={inputRef} value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                  onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                  placeholder="Search customers, accounts, emails…"
                  style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 13 }} />
                {query && <IconBtn size="xs" ghost icon={<I.close />} title="Clear" onClick={() => { setQuery(''); try { inputRef.current.focus(); } catch (e) {} }} />}
              </div>
              <TypeTabs value={type} onChange={onTypeChange} />
              <Btn variant="secondary" size="lg" icon={<I.filter />} onClick={() => setQbOpen(true)}>Query Builder</Btn>
              <Btn variant="primary" size="lg" icon={<I.search />} onClick={submit}>Search</Btn>
            </div>

            {/* Active QB filter chip */}
            {qbFilter && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Filter</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 6px 4px 10px', borderRadius: 'var(--gb-r-pill)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', fontSize: 11.5, fontWeight: 600, maxWidth: '100%' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520 }}>{qbFilter.label || 'Advanced filter'}</span>
                  <IconBtn size="xs" ghost icon={<I.close />} title="Remove filter" onClick={clearQb} />
                </span>
                <Btn variant="ghost" size="sm" icon={<I.edit />} onClick={() => setQbOpen(true)}>Edit</Btn>
              </div>
            )}
          </div>
        </Card>

        {/* ── Results ─────────────────────────────────────────── */}
        <Card>
          <SectionTitle
            icon={<I.history />}
            title="Results"
            count={searched ? (loading ? '…' : `${rows.length}${numFound > rows.length ? ' of ' + numFound : ''}`) : ''}
            sub={searched ? undefined : 'Type a query above and press Enter'}
          />
          {loading ? (
            <Spinner label="Searching…" />
          ) : !searched ? (
            <div style={{ padding: '54px 0', textAlign: 'center', color: 'var(--gb-text-muted)' }}>
              <I.search size={30} style={{ color: 'var(--gb-text-ghost)' }} />
              <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 10 }}>Start typing to search the CRM</div>
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12.5 }}>
              {error ? 'Search is unavailable right now.' : 'No records matched your search.'}
            </div>
          ) : (
            <>
              <ScrollArea max={listMax}>
                <table style={tableStyle}>
                  <thead><tr>
                    <Th>Name</Th>
                    <Th>Account</Th>
                    <Th align="center">Type</Th>
                    <Th>Email</Th>
                    <Th align="right">Orders</Th>
                    <Th align="right">YTD</Th>
                    <Th align="right">Prior Yr</Th>
                    <Th align="right">Last Order</Th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => <ResultRow key={(r.id || '') + i} r={r} i={i} />)}
                  </tbody>
                </table>
              </ScrollArea>
              {canLoadMore && (
                <div style={{ padding: 12, display: 'flex', justifyContent: 'center', borderTop: '1px solid var(--gb-border-subtle)' }}>
                  <Btn variant="secondary" size="sm" iconRight={<I.chevd />} onClick={() => runSearch(query.trim(), type, qbFilter, rows.length)}>
                    Load more ({numFound - rows.length} more)
                  </Btn>
                </div>
              )}
              {loadingMore && <div style={{ padding: 12 }}><Spinner size={20} pad="4px 0" label="" /></div>}
            </>
          )}
        </Card>
      </DetailPageFrame>

      {/* Query Builder overlay (its own FloatingPanel); applies a Solr fq. */}
      {qbOpen && (
        <QueryBuilder
          onClosed={() => setQbOpen(false)}
          bindClose={() => {}}
          initialState={qbFilter?.state || null}
          initialConditions={qbFilter?.conditions || []}
          onApply={applyQb}
        />
      )}
    </ModalCtx.Provider>
    </DataCtx.Provider>
  );
}

/* ════════════════════════════════════════════════════════════
   REGISTER with the Custom Pages engine (custom-pages.js)
════════════════════════════════════════════════════════════ */
if (!window.__gbCrmSearchPageRegistered) {
  window.__gbCrmSearchPageRegistered = true;
  ensureTheme();
  window.__gbCustomPages = window.__gbCustomPages || {};
  window.__gbCustomPages.search = {
    render(rootEl, ctx) {
      const root = createRoot(rootEl);
      root.render(<DetailErrorBoundary label="CRM Search page"><App store={ctx.store} /></DetailErrorBoundary>);
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
