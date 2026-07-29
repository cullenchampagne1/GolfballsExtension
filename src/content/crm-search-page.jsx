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
import { AnimatePresence, motion } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import { crmSolrQuery, SOLR_ROWS, SOLR_FACETS, SOLR_DATE_FACETS, facetFilters } from '../lib/crmSolrSearch.js';
import { crmSearchResultsMax } from '../lib/customPageLayout.js';
import {
  buildCrmSelectionCsv, crmRowToCampaignContact, crmRowToEmailContact, selectedCrmRows,
} from '../lib/crmSearchSelection.js';
import { EmailRunner } from '../modals/EmailRunner.jsx';
import { QueryBuilder } from '../modals/QueryBuilder.jsx';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import {
  ARMOR, Btn, Card, DASH, DataCtx, DetailErrorBoundary, I, IconBtn, PAGE_ZOOM, ScrollArea, SectionTitle, Spinner,
  Tag, TaskCheckbox, Td, Th, DASH as _DASH, EmptyRow, fmt$, fmtDate, goUrl, num, recUrl, tableStyle, trStyle, txt,
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
              transition: 'background-color var(--gb-anim), color var(--gb-anim), box-shadow var(--gb-anim)',
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
  if (s === 'lead') return 'warning';
  return 'neutral';
}

/* Pull the numeric customer id out of a Solr id ("contact_4421" → "4421"). */
function customerIdOf(r) {
  const m = String(r.id || '').match(/(\d+)/);
  return m ? m[1] : '';
}

function SelectionBox({ checked, onChange, title }) {
  return (
    <span data-checkbox style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <TaskCheckbox
        done={checked}
        onClick={(event) => {
          event?.stopPropagation?.();
          onChange?.(event);
        }}
        title={title}
      />
    </span>
  );
}

const fmtCount = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n));

/* One selectable facet value row (label + count + check). */
/* Smoothly animates its children open/closed by transitioning the grid row
   from 0fr → 1fr (modern height-auto animation), so facet sections expand and
   collapse instead of snapping. The inner wrapper clips content mid-animation. */
function Collapse({ open, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows var(--gb-anim)' }}>
      <div style={{ overflow: 'hidden', minHeight: 0 }}>{children}</div>
    </div>
  );
}

/* Small ghost text button for the "Show N more / Show less" facet toggle. */
function MoreToggle({ label, onClick }) {
  return (
    <button onClick={onClick}
      style={{ display: 'block', width: '100%', padding: '5px 8px', marginTop: 2, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--gb-brand-label)', borderRadius: 'var(--gb-r-sm)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--gb-fill-subtle)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
      {label}
    </button>
  );
}

function FacetRow({ label, count, checked, onClick }) {
  return (
    <button onClick={onClick} title={label}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 8px', border: 0, borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', textAlign: 'left', background: checked ? 'var(--gb-brand-tint-soft)' : 'transparent', transition: 'background var(--gb-anim)' }}
      onMouseEnter={(e) => { if (!checked) e.currentTarget.style.background = 'var(--gb-fill-subtle)'; }}
      onMouseLeave={(e) => { if (!checked) e.currentTarget.style.background = 'transparent'; }}>
      <span style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid ' + (checked ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), background: checked ? 'var(--gb-brand-label)' : 'transparent', color: 'var(--gb-text-on-brand)' }}>{checked && <I.check size={9} sw={3} />}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: checked ? 600 : 500, color: checked ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {count != null && <span style={{ fontSize: 10, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)', flexShrink: 0 }}>{fmtCount(count)}</span>}
    </button>
  );
}

/* A collapsible facet section (value list). Long lists (Sales Rep) get an
   in-facet filter box. */
function FacetSection({ facet, rows, selected, onToggle, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const searching = facet.searchable && !!q.trim();
  const filtered = searching
    ? rows.filter((r) => String(r.value).toLowerCase().includes(q.trim().toLowerCase()))
    : rows;
  const selRows = filtered.filter((r) => selected.has(String(r.value)));
  const unselRows = filtered.filter((r) => !selected.has(String(r.value)));
  /* Once something is picked, collapse the unselected values out of view so
     the active picks read cleanly. The checkboxes still mean multiple-select —
     "Show N more" re-reveals the rest to add another. Searching a long list
     overrides the collapse so filtering always shows matches. */
  const collapseUnsel = selected.size > 0 && !showAll && !searching;
  const visible = collapseUnsel ? selRows : selRows.concat(unselRows);
  const label = (r) => (facet.type === 'int' ? `Pod ${r.value}` : r.value);
  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', border: 0, background: 'transparent', cursor: 'pointer' }}>
        <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>{facet.label}</span>
        {selected.size > 0 && <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', borderRadius: 99, padding: '0 6px' }}>{selected.size}</span>}
        <I.chevd size={12} style={{ color: 'var(--gb-text-muted)', transition: 'transform var(--gb-anim)', transform: open ? 'none' : 'rotate(-90deg)' }} />
      </button>
      <Collapse open={open}>
        <div style={{ padding: '0 8px 8px' }}>
          {facet.searchable && rows.length > 8 && (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${facet.label.toLowerCase()}…`}
              style={{ width: '100%', height: 26, padding: '0 8px', marginBottom: 6, boxSizing: 'border-box', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-fill-inverse-medium)', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 11, outline: 'none' }} />
          )}
          <ScrollArea max={230} style={{ paddingRight: 4 }}>
            {visible.length ? visible.slice(0, 300).map((r) => (
              <FacetRow key={r.value} label={label(r)} count={r.count}
                checked={selected.has(String(r.value))} onClick={() => onToggle(String(r.value))} />
            )) : <div style={{ padding: '8px', fontSize: 11, color: 'var(--gb-text-muted)', textAlign: 'center' }}>No values.</div>}
            {collapseUnsel && unselRows.length > 0 && (
              <MoreToggle label={`Show ${unselRows.length} more`} onClick={() => setShowAll(true)} />
            )}
            {!collapseUnsel && showAll && !searching && selected.size > 0 && unselRows.length > 0 && (
              <MoreToggle label="Show less" onClick={() => setShowAll(false)} />
            )}
          </ScrollArea>
        </div>
      </Collapse>
    </Card>
  );
}

/* A date-bucket facet section (Last Order Age / Next Task). */
function DateFacetSection({ group, queries, selected, onToggle }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', border: 0, background: 'transparent', cursor: 'pointer' }}>
        <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>{group.label}</span>
        {selected.size > 0 && <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', borderRadius: 99, padding: '0 6px' }}>{selected.size}</span>}
        <I.chevd size={12} style={{ color: 'var(--gb-text-muted)', transition: 'transform var(--gb-anim)', transform: open ? 'none' : 'rotate(-90deg)' }} />
      </button>
      <Collapse open={open}>
        <div style={{ padding: '0 8px 8px' }}>
          {group.buckets.map((b) => (
            <FacetRow key={b.key} label={b.label} count={queries[b.fq]} checked={selected.has(b.key)} onClick={() => onToggle(b.key)} />
          ))}
        </div>
      </Collapse>
    </Card>
  );
}

function FacetSidebar({ facets, selected, onToggle, onClearAll }) {
  const anySel = Object.values(selected).some((s) => s.size > 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 64 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Refine</span>
        {anySel && <Btn variant="ghost" size="xs" icon={<I.close />} onClick={onClearAll}>Clear</Btn>}
      </div>
      {SOLR_FACETS.map((f) => (
        <FacetSection key={f.field} facet={f} rows={(facets && facets.fields && facets.fields[f.field]) || []}
          selected={selected[f.field]} onToggle={(v) => onToggle(f.field, v)}
          defaultOpen={['recordType_s', 'salesRep_s', 'role_s', 'podID_i'].includes(f.field)} />
      ))}
      {SOLR_DATE_FACETS.map((g) => (
        <DateFacetSection key={g.field} group={g} queries={(facets && facets.queries) || {}}
          selected={selected[g.field]} onToggle={(k) => onToggle(g.field, k)} />
      ))}
    </div>
  );
}

/* One result row — staggered fade-in, click-through to the record. */
function ResultRow({ r, i, selected, onToggle }) {
  const url = recUrl(r);
  const isAcct = String(r.id || '').startsWith('account') || (r.recordType_s || '').toLowerCase() === 'account';
  const name = r.contactName_t || r.accountName_t || r.id;
  const email = (Array.isArray(r.emails_tps) && r.emails_tps[0]) || r.email_tp || '';
  const go = () => { if (url) goUrl(url); };
  return (
    <tr className="gb-actrow" onClick={go} title={url ? 'Open record' : undefined}
      style={{
        ...trStyle,
        cursor: url ? 'pointer' : 'default',
        background: selected ? 'var(--gb-brand-tint-soft)' : trStyle.background,
        boxShadow: selected ? 'inset 3px 0 0 var(--gb-brand-label)' : 'none',
        transition: 'background-color var(--gb-anim), box-shadow var(--gb-anim)',
        animation: 'gb-fade-slide var(--gb-anim) both',
        animationDelay: Math.min(i, 16) * 18 + 'ms',
      }}>
      <Td align="center">
        <SelectionBox checked={selected} onChange={onToggle} title={selected ? 'Deselect record' : 'Select record'} />
      </Td>
      <Td align="center">{r.recordType_s ? <Tag tone={typeTone(r.recordType_s)} size="xs">{r.recordType_s}</Tag> : DASH}</Td>
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `var(--gb-${typeTone(r.recordType_s)}-tint-medium)`, border: `1px solid var(--gb-${typeTone(r.recordType_s)}-tint-border)`, color: `var(--gb-${typeTone(r.recordType_s)}-fg)` }}>
            {isAcct ? <I.briefcase size={12} /> : <I.user size={12} />}
          </span>
          <span style={{ fontWeight: 600, color: 'var(--gb-text-primary)' }}>{name}</span>
        </div>
      </Td>
      <Td muted>{r.accountName_t || DASH}</Td>
      <Td mono muted>{r.accountID_s || DASH}</Td>
      <Td mono muted>{customerIdOf(r) || DASH}</Td>
      <Td muted>{r.salesRep_s && r.salesRep_s !== 'None' ? r.salesRep_s : DASH}</Td>
      <Td muted>{email || DASH}</Td>
      <Td align="right" mono muted>{r.lastOrderDate_dt ? fmtDate(r.lastOrderDate_dt) : DASH}</Td>
      <Td align="right" mono>{num(r.orderCount_i) != null ? r.orderCount_i : DASH}</Td>
      <Td align="right" mono muted>{r.nextTaskDate_dt ? fmtDate(r.nextTaskDate_dt) : DASH}</Td>
    </tr>
  );
}

export function CrmSearchPageApp({ store, initialSearch = null, searchClient = crmSolrQuery }) {
  const [D, patch] = useDetailData(store);
  const modalHost = useModalHost();

  const url0 = useMemo(() => initialSearch
    ? { q: initialSearch.query || '', type: initialSearch.type || 'all', fq: '' }
    : readUrlSearch(), [initialSearch]);
  const [query, setQuery] = useState(url0.q);
  const [type, setType] = useState(url0.type);
  const [qbFilter, setQbFilter] = useState(url0.fq ? { label: 'Saved filter', solrFq: url0.fq, conditions: [], state: null } : null);
  // Facet selections (Sets per field) + the facet counts from the last search.
  const emptySel = () => ({ recordType_s: new Set(), salesRep_s: new Set(), role_s: new Set(), podID_i: new Set(), lastOrderDate_dt: new Set(), nextTaskDate_dt: new Set() });
  const [selected, setSelected] = useState(emptySel);
  const [facets, setFacets] = useState(initialSearch?.facets || null);
  const selRef = useRef(selected);
  selRef.current = selected;
  const [rows, setRows] = useState(initialSearch?.docs || []);
  const [selectedRows, setSelectedRows] = useState(() => new Set());
  const [numFound, setNumFound] = useState(initialSearch?.numFound || 0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(!!initialSearch);
  const [qbOpen, setQbOpen] = useState(false);
  const [emailRunnerOpen, setEmailRunnerOpen] = useState(false);
  const [emailRunnerCursor, setEmailRunnerCursor] = useState(null);
  const [focused, setFocused] = useState(false);
  // Results list fills the leftover vertical space. The takeover renders at
  // PAGE_ZOOM, so a height in this coordinate space shows scaled — divide
  // the real viewport by the zoom, minus the top bar + hero + card chrome.
  const [listMax, setListMax] = useState(560);
  useEffect(() => {
    const calc = () => setListMax(crmSearchResultsMax(window.innerHeight, PAGE_ZOOM));
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  const inputRef = useRef(null);
  const gen = useRef(0);   // ignore stale responses

  const runSearch = useCallback(async (q, t, qb, start = 0) => {
    const g = ++gen.current;
    if (start === 0) {
      setLoading(true);
      setError(false);
      setSelectedRows(new Set());
    } else setLoadingMore(true);
    setSearched(true);
    try {
      const { docs, numFound, facets: fc } = await searchClient({
        query: q, type: t, solrFq: qb?.solrFq || '',
        filters: facetFilters(selRef.current), start,
        facet: start === 0,   // only need facet counts on the first page
      });
      if (gen.current !== g) return;
      setRows((prev) => (start === 0 ? docs : prev.concat(docs)));
      setNumFound(numFound);
      if (fc) setFacets(fc);
    } catch (e) {
      if (gen.current !== g) return;
      setError(true); if (start === 0) setRows([]);
      gbToast('CRM search is unavailable right now', 'error');
    } finally {
      if (gen.current === g) { setLoading(false); setLoadingMore(false); }
    }
  }, [searchClient]);

  // Toggle a facet value and re-run (selRef gives runSearch the fresh set).
  const toggleFacet = (field, value) => {
    setSelected((prev) => {
      const next = { ...prev, [field]: new Set(prev[field]) };
      if (next[field].has(value)) next[field].delete(value); else next[field].add(value);
      selRef.current = next;
      return next;
    });
    setTimeout(() => runSearch(query.trim(), type, qbFilter, 0), 0);
  };
  const clearFacets = () => {
    const cleared = emptySel();
    setSelected(cleared); selRef.current = cleared;
    setTimeout(() => runSearch(query.trim(), type, qbFilter, 0), 0);
  };
  const facetCount = Object.values(selected).reduce((n, s) => n + s.size, 0);

  // On mount: always run an initial search so the page opens on a populated
  // list (match-all → most-recent records) like the native page, seeded with
  // any term/filter the URL carried. Then focus the field.
  useEffect(() => {
    if (initialSearch) return undefined;
    runSearch(url0.q, url0.type, url0.fq ? { solrFq: url0.fq } : null, 0);
    setTimeout(() => { try { inputRef.current && inputRef.current.focus(); } catch (e) {} }, 60);
    return undefined;
  }, []);   // eslint-disable-line

  const submit = () => {
    writeUrlSearch(query.trim(), type, qbFilter?.solrFq || '');
    runSearch(query.trim(), type, qbFilter, 0);
  };
  const onTypeChange = (t) => { setType(t); writeUrlSearch(query.trim(), t, qbFilter?.solrFq || ''); if (searched) runSearch(query.trim(), t, qbFilter, 0); };
  const applyQb = (filter) => { setQbFilter(filter); setQbOpen(false); writeUrlSearch(query.trim(), type, filter?.solrFq || ''); runSearch(query.trim(), type, filter, 0); };
  const clearQb = () => { setQbFilter(null); writeUrlSearch(query.trim(), type, ''); runSearch(query.trim(), type, null, 0); };
  const canLoadMore = rows.length < numFound && !loading && !loadingMore;
  const selectedResults = useMemo(() => selectedCrmRows(rows, selectedRows), [rows, selectedRows]);
  const allRowsSelected = rows.length > 0 && rows.every((row) => selectedRows.has(row.id));
  const toggleResult = useCallback((id) => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const toggleAllResults = useCallback(() => {
    setSelectedRows((current) => {
      const allSelected = rows.length > 0 && rows.every((row) => current.has(row.id));
      if (allSelected) return new Set();
      return new Set(rows.map((row) => row.id).filter(Boolean));
    });
  }, [rows]);
  const openCampaign = useCallback(() => {
    const audience = selectedResults
      .map((row) => crmRowToCampaignContact(row, recUrl(row)))
      .filter((contact) => contact.contactUrl || contact.email);
    if (!audience.length) {
      gbToast('Select contacts or accounts first', 'info');
      return;
    }
    if (typeof window.__gbOpenCampaignManager === 'function') {
      window.__gbOpenCampaignManager(audience);
    } else {
      gbToast('Campaign manager is unavailable here', 'error');
    }
  }, [selectedResults]);
  const exportSelection = useCallback(() => {
    if (!selectedResults.length) {
      gbToast('Select records first', 'info');
      return;
    }
    const blob = new Blob([buildCrmSelectionCsv(selectedResults)], { type: 'text/csv;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = `crm-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    gbToast(`Exported ${selectedResults.length} record${selectedResults.length === 1 ? '' : 's'}`, 'success');
  }, [selectedResults]);

  return (
    <DataCtx.Provider value={D}>
    <ModalCtx.Provider value={modalHost}>
      <DetailPageFrame
        currentPage="Search"
        ready
        modalHost={modalHost}
        topBar={<TopBar><Breadcrumb items={[{ label: 'CRM', page: 261 }]} current="Search" /></TopBar>}
      >
        <div className="gbcp-search-grid" style={{ display: 'grid', gridTemplateColumns: '228px minmax(0, 1fr)', gap: 10, alignItems: 'flex-start' }}>
          {/* ── Facet filter sidebar (Entity Types / Sales Rep / Role / Pod / dates) ── */}
          <FacetSidebar facets={facets} selected={selected} onToggle={toggleFacet} onClearAll={clearFacets} />

          {/* ── Search + results column ─────────────────────────── */}
          <div className="gbcp-stack gbcp-search-body">
        {/* ── Search hero ─────────────────────────────────────── */}
        <Card style={{ animation: 'gb-fade-slide var(--gb-anim) both' }}>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
          <AnimatePresence initial={false}>
            {selectedResults.length > 0 && (
              <motion.div
                key="crm-search-selection-bar"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{
                  minHeight: 42,
                  padding: '7px 12px',
                  borderBottom: '1px solid var(--gb-border-subtle)',
                  background: 'var(--gb-brand-tint-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}>
                  <span style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)' }}>
                    <strong style={{ color: 'var(--gb-brand-label)', fontWeight: 700 }}>{selectedResults.length} selected</strong>
                    {' '}of {rows.length} loaded result{rows.length === 1 ? '' : 's'}
                  </span>
                  <div style={{ flex: 1 }} />
                  <Btn size="sm" variant="ghost" icon={<I.target />} onClick={openCampaign}>Run campaign</Btn>
                  <Btn
                    size="sm"
                    variant="ghost"
                    icon={<I.mail />}
                    onClick={(event) => {
                      setEmailRunnerCursor({ x: event.clientX, y: event.clientY });
                      setEmailRunnerOpen(true);
                    }}
                  >Email selected</Btn>
                  <Btn size="sm" variant="ghost" icon={<I.download />} onClick={exportSelection}>Export CSV</Btn>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {loading ? (
            <Spinner label="Searching…" />
          ) : !searched ? (
            <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--gb-text-muted)' }}>
              <I.search size={30} style={{ color: 'var(--gb-text-ghost)' }} />
              <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 10 }}>Start typing to search the CRM</div>
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '34px 0', textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12.5 }}>
              {error ? 'Search is unavailable right now.' : 'No records matched your search.'}
            </div>
          ) : (
            <>
              <ScrollArea max={listMax}>
                <table style={tableStyle}>
                  <thead><tr>
                    <Th align="center">
                      <SelectionBox
                        checked={allRowsSelected}
                        onChange={toggleAllResults}
                        title={allRowsSelected ? 'Deselect loaded records' : 'Select loaded records'}
                      />
                    </Th>
                    <Th align="center">Type</Th>
                    <Th>Contact</Th>
                    <Th>Account</Th>
                    <Th>Account ID</Th>
                    <Th>Customer ID</Th>
                    <Th>Sales Rep</Th>
                    <Th>Email</Th>
                    <Th align="right">Last Order</Th>
                    <Th align="right">Orders</Th>
                    <Th align="right">Next Task</Th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <ResultRow
                        key={(r.id || '') + i}
                        r={r}
                        i={i}
                        selected={selectedRows.has(r.id)}
                        onToggle={() => toggleResult(r.id)}
                      />
                    ))}
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
              {/* Bottom breathing room when the list ends flush (no load-more
                  footer to provide it) so the last row isn't glued to the card. */}
              {!canLoadMore && !loadingMore && <div style={{ height: 12 }} />}
            </>
          )}
        </Card>
          </div>
        </div>
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
      <EmailRunner
        open={emailRunnerOpen}
        cursor={emailRunnerCursor}
        contacts={selectedResults
          .map((row) => crmRowToEmailContact(row, recUrl(row)))
          .filter((contact) => contact.contactUrl || contact.email)}
        onClose={() => setEmailRunnerOpen(false)}
      />
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
      root.render(
        <ToastHost installGlobal={false}>
          <DetailErrorBoundary label="CRM Search page"><CrmSearchPageApp store={ctx.store} /></DetailErrorBoundary>
        </ToastHost>,
      );
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
