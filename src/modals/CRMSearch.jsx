import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPanel, ModalHeader, Btn, Input, Dropdown, Tag, I,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import { useDevSetting } from '../lib/devSettings.js';

/* ───────────────────────────────────────────────────────────────
   CRMSearch — React port of content/crm-search-modal.js.

   Replicates the core flow: query bar (text + type filter + search
   action), filter chip rail, selection summary, results table with
   checkbox selection. Layout matches the design's CRMSearchView
   (surfaces-2.jsx) — 1000×640, sticky header row, brand-tint on
   selected rows.

   Endpoint:
     POST https://api.golfballs.com/Golfballs/WebServices/Private/SolrIndexCrm.asmx/Query
     body: { str: "q=<term>&sort=lastOrderDate_dt desc&rows=200&qf=<…>&q.op=AND&sow=false&defType=edismax" }
     response: { d: jsonString }  — parse `d` then read `.response.docs`

   Failure path: toast.action with primary "Use template data"
   that fills the table with MOCK_RESULTS so the design is demo-able.

   This port is scoped to SEARCH + SELECT. The original's downstream
   campaign-run flow (PA email / Task create per selected row) is out
   of scope for now — selected IDs are surfaced via the Run-campaign
   button stub which can be wired up later.
─────────────────────────────────────────────────────────────── */

const ENDPOINT = 'https://api.golfballs.com/Golfballs/WebServices/Private/SolrIndexCrm.asmx/Query';
const QF = 'id^50 accountID_s^50 contactName_t^50 accountName_t^50 email_tp^20 emails_tps^20 phones_ss^20';
const ROWS = 200;

const TYPE_OPTS = [
  { id: 'all',     label: 'All types' },
  { id: 'contact', label: 'Contacts'  },
  { id: 'account', label: 'Accounts'  },
];

/* Extension-context detection — auto-mock when not inside the live
   extension (e.g. the playground). */
function hasExtensionContext() {
  try { return typeof chrome !== 'undefined' && !!chrome.runtime?.id; }
  catch { return false; }
}

const MOCK_RESULTS = [
  { id: 'contact_4421', recordType_s: 'contact', contactName_t: 'Marcus Chen',     accountName_t: 'Acme Industries',     emails_tps: ['marcus@acme.co'],     salesRep_s: 'Jamie Lewis',  orderCount_i: 12, yearToDateRevenue_f: 8400,  priorYearRevenue_f: 12400, lastOrderDate_dt: '2026-05-18T00:00:00Z', city_s: 'San Francisco', state_s: 'CA', tags: ['VIP', 'Net-30'] },
  { id: 'contact_4517', recordType_s: 'contact', contactName_t: 'Sarah Patel',     accountName_t: 'Pebble Beach Resort', emails_tps: ['sarah@pebble.com'],   salesRep_s: 'Ren Atelier',  orderCount_i: 7,  yearToDateRevenue_f: 18800, priorYearRevenue_f: 22150, lastOrderDate_dt: '2026-05-12T00:00:00Z', city_s: 'Pebble Beach',   state_s: 'CA', tags: ['VIP'] },
  { id: 'account_2188', recordType_s: 'account', contactName_t: '',                accountName_t: 'TaylorMade Promo',    emails_tps: ['ops@taylormade.com'], salesRep_s: 'Marco Studio', orderCount_i: 31, yearToDateRevenue_f: 22150, priorYearRevenue_f: 38900, lastOrderDate_dt: '2026-04-22T00:00:00Z', city_s: 'Carlsbad',       state_s: 'CA', tags: ['Enterprise'] },
  { id: 'contact_5223', recordType_s: 'contact', contactName_t: 'Jordan Brown',    accountName_t: 'Brown Custom Gifts',  emails_tps: ['jordan@bcg.io'],      salesRep_s: 'Priya Designs',orderCount_i: 3,  yearToDateRevenue_f: 640,   priorYearRevenue_f: 1200,  lastOrderDate_dt: '2026-05-17T00:00:00Z', city_s: 'Atlanta',        state_s: 'GA', tags: [] },
  { id: 'account_1187', recordType_s: 'account', contactName_t: '',                accountName_t: 'Acme Industries',     emails_tps: [],                     salesRep_s: 'Jamie Lewis',  orderCount_i: 41, yearToDateRevenue_f: 42100, priorYearRevenue_f: 38400, lastOrderDate_dt: '2026-05-19T00:00:00Z', city_s: 'San Francisco', state_s: 'CA', tags: ['Net-30'] },
  { id: 'contact_6612', recordType_s: 'contact', contactName_t: "Liam O'Connor",   accountName_t: 'OC Fitness',          emails_tps: ['liam@ocfitness.ie'],  salesRep_s: 'Ren Atelier',  orderCount_i: 2,  yearToDateRevenue_f: 1290,  priorYearRevenue_f: 0,     lastOrderDate_dt: '2026-05-10T00:00:00Z', city_s: 'Dublin',         state_s: 'IE', tags: ['New'] },
];

const TAG_TONES = {
  VIP: 'brand',
  'Net-30': 'warning',
  Enterprise: 'info',
  New: 'success',
};

/* Format helpers from the original. */
const fmtMoney = (n) => {
  if (n == null || n === '') return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};
const contactUrl = (id) => {
  const [type, num] = String(id || '').split('_');
  if (type === 'contact') return `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=239&ContactID=${num}`;
  if (type === 'account') return `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=267&AccountID=${num}`;
  return '';
};

export function CRMSearch({ onClosed, bindClose }) {
  const toast = useToast();
  const draggable = useDevSetting('crmSearch.draggable') ?? true;
  const forceMock = useDevSetting('crmSearch.useMock') ?? false;
  const useMock   = forceMock || !hasExtensionContext();

  const [query, setQuery]       = useState('');
  const [typeFilter, setType]   = useState('all');
  const [results, setResults]   = useState([]);   // current visible rows
  const [total, setTotal]       = useState(0);    // Solr numFound
  const [status, setStatus]     = useState('idle'); // 'idle' | 'loading' | 'error' | 'ready'
  const [selected, setSelected] = useState(() => new Set());
  // Filter chips (visual representation of currently-active narrowings).
  // Closing one removes it from this list AND re-runs the search.
  const [activeFilters, setActiveFilters] = useState([]);

  const bindCloseRef = useRef(null);
  const handleBindClose = useCallback((fn) => {
    bindCloseRef.current = fn;
    bindClose?.(fn);
  }, [bindClose]);

  // ── Search ────────────────────────────────────────────────────
  const runSearch = useCallback(async (q, filters = activeFilters, typeF = typeFilter) => {
    const term = q.trim();
    setStatus('loading');
    try {
      let docs;
      if (useMock) {
        await new Promise((r) => setTimeout(r, 320));
        // Mock: filter the mock dataset by term + type + active filters.
        const lower = term.toLowerCase();
        docs = MOCK_RESULTS.filter((r) => {
          if (typeF !== 'all' && r.recordType_s !== typeF) return false;
          if (lower) {
            const hay = `${r.contactName_t} ${r.accountName_t} ${r.emails_tps?.[0] || ''} ${r.salesRep_s} ${r.city_s} ${r.state_s}`.toLowerCase();
            if (!hay.includes(lower)) return false;
          }
          for (const f of filters) {
            if (f.id === 'vip-only'  && !r.tags?.includes('VIP'))      return false;
            if (f.id === 'net30'      && !r.tags?.includes('Net-30'))   return false;
            if (f.id === 'over-500'   && (r.yearToDateRevenue_f || 0) < 500) return false;
            if (f.id === 'state-ca'   && r.state_s !== 'CA')            return false;
          }
          return true;
        });
      } else {
        // Solr query: q=<term> (or *:* when blank) + sort + rows + qf.
        const qStr = `q=${encodeURIComponent(term || '*:*')}`;
        const body = `${qStr}&sort=lastOrderDate_dt desc&rows=${ROWS}&qf=${encodeURIComponent(QF)}&q.op=AND&sow=false&defType=edismax`;
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ str: body }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        const data = JSON.parse(raw.d);
        docs = data.response?.docs || [];
        // Type filter applied client-side (Solr returns mixed types).
        if (typeF !== 'all') docs = docs.filter((r) => r.recordType_s === typeF);
      }
      setResults(docs);
      setTotal(docs.length);
      setStatus('ready');
      // Drop any selections that aren't in the new result set.
      setSelected((sel) => {
        const next = new Set();
        for (const d of docs) if (sel.has(d.id)) next.add(d.id);
        return next;
      });
    } catch (err) {
      setStatus('error');
      setResults([]);
      setTotal(0);
      // Action toast — primary CTA loads MOCK_RESULTS so the design is
      // still demoable (and the user can keep selecting / previewing).
      toast?.action?.({
        tone: 'warning',
        title: 'CRM search unavailable',
        message: err?.message || 'The CRM index didn\'t respond. Want to see what the table would look like?',
        primary: 'Use template data',
        secondary: 'Dismiss',
        icon: <I.alert />,
        duration: null,
        onPrimary: () => {
          setResults(MOCK_RESULTS);
          setTotal(MOCK_RESULTS.length);
          setStatus('ready');
        },
      });
    }
  }, [useMock, activeFilters, typeFilter, toast]);

  // Fire an initial empty search on mount so the table populates with
  // the most-recent rows (mirrors the original's `loadResults()` on open).
  const ranInitial = useRef(false);
  useEffect(() => {
    if (ranInitial.current) return;
    ranInitial.current = true;
    runSearch('', [], 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run when typeFilter / activeFilters change (no need to re-type).
  useEffect(() => {
    if (!ranInitial.current) return;
    runSearch(query, activeFilters, typeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, activeFilters]);

  // ── Selection ────────────────────────────────────────────────
  const toggleSel = (id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allVisibleSelected = results.length > 0 && results.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected((s) => {
    if (allVisibleSelected) {
      const next = new Set(s);
      for (const r of results) next.delete(r.id);
      return next;
    }
    const next = new Set(s);
    for (const r of results) next.add(r.id);
    return next;
  });

  // ── Filter chip add/remove ───────────────────────────────────
  const addFilter = (chip) => setActiveFilters((arr) => {
    if (arr.find((f) => f.id === chip.id)) return arr;
    return [...arr, chip];
  });
  const removeFilter = (id) => setActiveFilters((arr) => arr.filter((f) => f.id !== id));

  // ── Render ───────────────────────────────────────────────────
  const selCount = selected.size;
  const subtitle = useMock
    ? <span>Search contacts &amp; accounts · <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-warning-fg)', fontWeight: 700, fontSize: 10 }}>OFFLINE / MOCK</span></span>
    : 'Search contacts & accounts · select · run campaigns';

  return (
    <FloatingPanel
      width={1000}
      maxHeight={640}
      backdrop
      draggable={draggable}
      onClose={onClosed}
      bindClose={handleBindClose}
    >
      <ModalHeader
        icon={<I.search size={14} />}
        title="CRM Search"
        subtitle={subtitle}
      />

      {/* Query bar */}
      <div style={{
        padding: 12,
        borderBottom: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-surface-1)',
        display: 'flex', flexDirection: 'column', gap: 8,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            value={query}
            onChange={setQuery}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(query); } }}
            placeholder="Search by name, email, account, or phone…"
            leading={<I.search size={12} />}
            style={{ flex: 1 }}
          />
          <Dropdown
            value={typeFilter}
            onChange={setType}
            options={TYPE_OPTS}
            style={{ width: 130 }}
          />
          <Btn
            size="sm"
            variant="tinted"
            status="brand"
            icon={<I.bolt size={11} />}
            onClick={() => runSearch(query)}
          >Search</Btn>
        </div>
        {/* Filter chip rail */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: 'var(--gb-text-muted)',
          }}>Quick filters:</span>
          {[
            { id: 'vip-only',  label: 'tag = VIP' },
            { id: 'net30',     label: 'tag = Net-30' },
            { id: 'over-500',  label: 'ytd > $500' },
            { id: 'state-ca',  label: 'state = CA' },
          ].map((chip) => {
            const on = !!activeFilters.find((f) => f.id === chip.id);
            return (
              <FilterChip
                key={chip.id}
                label={chip.label}
                on={on}
                onClick={() => (on ? removeFilter(chip.id) : addFilter(chip))}
              />
            );
          })}
        </div>
      </div>

      {/* Selection summary */}
      <AnimatePresence initial={false}>
        {selCount > 0 && (
          <motion.div
            key="sel-bar"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden', flexShrink: 0 }}
          >
            <div style={{
              padding: '8px 14px',
              borderBottom: '1px solid var(--gb-border-subtle)',
              background: 'var(--gb-brand-tint-soft)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)' }}>
                <span style={{ color: 'var(--gb-brand-label)', fontWeight: 700 }}>{selCount} selected</span>
                {' '}of {results.length} result{results.length === 1 ? '' : 's'}
              </div>
              <div style={{ flex: 1 }} />
              <Btn size="sm" variant="ghost" icon={<MegaphoneIcon />}>Run campaign</Btn>
              <Btn size="sm" variant="ghost" icon={<I.mail size={11} />}>Email selected</Btn>
              <Btn size="sm" variant="ghost" icon={<I.copy size={11} />}>Export CSV</Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <ResultsTable
          rows={results}
          status={status}
          query={query}
          total={total}
          selected={selected}
          allChecked={allVisibleSelected}
          onToggle={toggleSel}
          onToggleAll={toggleAll}
        />
      </div>
    </FloatingPanel>
  );
}

/* ── ResultsTable ──────────────────────────────────────────── */
const COLS = '30px 1.4fr 1.2fr 80px 1.2fr 1.4fr 0.8fr 1fr 120px';

function ResultsTable({ rows, status, query, total, selected, allChecked, onToggle, onToggleAll }) {
  return (
    <div>
      {/* Sticky header */}
      <div style={{
        display: 'grid', gridTemplateColumns: COLS,
        padding: '8px 14px', gap: 12,
        background: 'var(--gb-surface-1)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        fontSize: 9.5, fontWeight: 700, letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'var(--gb-text-muted)',
        position: 'sticky', top: 0, zIndex: 1,
      }}>
        <div>
          <Checkbox checked={allChecked} onChange={onToggleAll} />
        </div>
        <div>Name</div>
        <div>Account</div>
        <div>Type</div>
        <div>Location</div>
        <div>Email</div>
        <div>Orders</div>
        <div>Revenue (YTD)</div>
        <div>Last order</div>
      </div>

      {status === 'loading' && (
        <EmptyRow><Spinner /> Searching…</EmptyRow>
      )}
      {status === 'error' && rows.length === 0 && (
        <EmptyRow tone="error">Search failed. Try again, or use the toast’s template data option.</EmptyRow>
      )}
      {status === 'ready' && rows.length === 0 && (
        <EmptyRow>
          {query ? <>No results for <strong style={{ color: 'var(--gb-text-secondary)' }}>“{query}”</strong>.</>
                 : <>Enter a search term and press Enter.</>}
        </EmptyRow>
      )}

      {status === 'ready' && rows.map((r) => (
        <ResultRow
          key={r.id}
          row={r}
          isSelected={selected.has(r.id)}
          onToggle={() => onToggle(r.id)}
        />
      ))}
    </div>
  );
}

function ResultRow({ row, isSelected, onToggle }) {
  const isContact = (row.recordType_s || '').toLowerCase() === 'contact';
  const name  = row.contactName_t || row.accountName_t || '—';
  const acct  = (isContact ? row.accountName_t : row.contactName_t) || '—';
  const email = row.emails_tps?.[0] || row.email_tp?.[0] || '—';
  const loc   = [row.city_s, row.state_s].filter(Boolean).join(', ') || '—';
  const url   = contactUrl(row.id);
  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: COLS,
        padding: '10px 14px', gap: 12,
        alignItems: 'center',
        background: isSelected ? 'var(--gb-brand-tint-soft)' : 'transparent',
        borderBottom: '1px solid var(--gb-border-subtle)',
        fontSize: 12,
        cursor: 'pointer',
        transition: 'background-color .15s',
      }}
      onClick={(e) => {
        // Don't toggle if the user clicked the link or checkbox itself.
        if (e.target.closest('a, button, [data-checkbox]')) return;
        onToggle();
      }}
    >
      <div>
        <Checkbox checked={isSelected} onChange={onToggle} />
      </div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--gb-text-primary)',
            fontWeight: 600, textDecoration: 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gb-brand-label)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--gb-text-primary)'; }}
        >{name}</a>
      ) : (
        <span style={{
          color: 'var(--gb-text-primary)', fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{name}</span>
      )}
      <div style={{
        color: 'var(--gb-text-tertiary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{acct}</div>
      <div>
        <Tag tone={isContact ? 'info' : 'brand'} size="xs">
          {isContact ? 'Contact' : 'Account'}
        </Tag>
      </div>
      <div style={{
        color: 'var(--gb-text-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{loc}</div>
      <div style={{
        color: 'var(--gb-text-tertiary)',
        fontFamily: 'var(--gb-font-mono)', fontSize: 11,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{email}</div>
      <div style={{
        color: 'var(--gb-text-tertiary)',
        fontFamily: 'var(--gb-font-mono)', fontSize: 11,
        fontVariantNumeric: 'tabular-nums',
      }}>{row.orderCount_i ?? '—'}</div>
      <div style={{
        color: 'var(--gb-text-secondary)',
        fontFamily: 'var(--gb-font-mono)', fontSize: 11,
        fontVariantNumeric: 'tabular-nums',
      }}>{fmtMoney(row.yearToDateRevenue_f)}</div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 11, fontFamily: 'var(--gb-font-mono)',
          color: 'var(--gb-text-muted)',
          fontVariantNumeric: 'tabular-nums',
        }}>{fmtDate(row.lastOrderDate_dt)}</span>
        {row.tags?.length > 0 && row.tags.map((t) => (
          <Tag key={t} tone={TAG_TONES[t] || 'neutral'} size="xs">{t}</Tag>
        ))}
      </div>
    </div>
  );
}

/* Small checkbox styled to match the design's brand-tint version. */
function Checkbox({ checked, onChange }) {
  return (
    <button
      type="button"
      data-checkbox
      onClick={(e) => { e.stopPropagation(); onChange?.(); }}
      style={{
        width: 16, height: 16, padding: 0,
        background: checked ? 'var(--gb-brand-tint-medium)' : 'transparent',
        border: '1.5px solid ' + (checked ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'),
        borderRadius: 4,
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--gb-brand-label)',
        outline: 'none',
        transition: 'background-color .12s, border-color .12s',
      }}
    >
      <AnimatePresence initial={false}>
        {checked && (
          <motion.span
            key="ck"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.12 }}
            style={{ display: 'flex' }}
          >
            <I.check size={10} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

function FilterChip({ label, on, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      animate={{
        backgroundColor: on ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-2)',
        color:           on ? 'var(--gb-brand-label)'    : 'var(--gb-text-tertiary)',
        borderColor:     on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)',
      }}
      transition={{ duration: 0.15 }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 8px',
        fontSize: 11,
        fontFamily: 'var(--gb-font-mono)',
        border: '1px solid transparent',
        borderRadius: 'var(--gb-r-xs)',
        cursor: 'pointer',
        fontWeight: 500,
        outline: 'none',
      }}
    >
      {label}
      {on && <I.close size={9} />}
    </motion.button>
  );
}

function EmptyRow({ children, tone }) {
  return (
    <div style={{
      padding: '36px 14px',
      textAlign: 'center',
      fontSize: 12,
      color: tone === 'error' ? 'var(--gb-error-fg)' : 'var(--gb-text-tertiary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>{children}</div>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" style={{
        animation: 'gbCsmSpin 1s linear infinite', transformOrigin: 'center',
      }} />
      <style>{`@keyframes gbCsmSpin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}

const MegaphoneIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11l18-8v18l-18-8z" />
    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </svg>
);
