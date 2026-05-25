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

// Mock rows — fields kept in sync with content/crm-query-builder.js's
// QB_FIELDS list so the table columns and the Query Builder match.
// Fields present here = fields the QB will let you filter on. If you
// add a QB_FIELDS entry, mirror it here so the template-data preview
// still demos correctly.
const MOCK_RESULTS = [
  { id: 'contact_4421', recordType_s: 'Contact', contactName_t: 'Marcus Chen',   accountName_t: 'Acme Industries',     accountID_s: 'ACME-001', emails_tps: ['marcus@acme.co'],     phones_ss: ['415-555-0142'], salesRep_s: 'Jamie Lewis',  salesRepID_s: 'rep_22', podID_i: 3, role_s: 'AE',  orderCount_i: 12, yearToDateRevenue_f:  8400, priorYearRevenue_f: 12400, lastOrderDate_dt: '2026-05-18T00:00:00Z', nextTaskDate_dt: '2026-05-29T00:00:00Z' },
  { id: 'contact_4517', recordType_s: 'Contact', contactName_t: 'Sarah Patel',   accountName_t: 'Pebble Beach Resort', accountID_s: 'PEB-014',  emails_tps: ['sarah@pebble.com'],   phones_ss: ['831-555-0119'], salesRep_s: 'Ren Atelier',  salesRepID_s: 'rep_14', podID_i: 1, role_s: 'CSM', orderCount_i:  7, yearToDateRevenue_f: 18800, priorYearRevenue_f: 22150, lastOrderDate_dt: '2026-05-12T00:00:00Z', nextTaskDate_dt: '2026-06-02T00:00:00Z' },
  { id: 'account_2188', recordType_s: 'Account', contactName_t: '',              accountName_t: 'TaylorMade Promo',    accountID_s: 'TM-201',   emails_tps: ['ops@taylormade.com'], phones_ss: ['760-555-0203'], salesRep_s: 'Marco Studio', salesRepID_s: 'rep_18', podID_i: 2, role_s: 'AE',  orderCount_i: 31, yearToDateRevenue_f: 22150, priorYearRevenue_f: 38900, lastOrderDate_dt: '2026-04-22T00:00:00Z', nextTaskDate_dt: '2026-05-25T00:00:00Z' },
  { id: 'contact_5223', recordType_s: 'Contact', contactName_t: 'Jordan Brown',  accountName_t: 'Brown Custom Gifts',  accountID_s: 'BCG-007',  emails_tps: ['jordan@bcg.io'],      phones_ss: ['404-555-0167'], salesRep_s: 'Priya Designs',salesRepID_s: 'rep_31', podID_i: 4, role_s: 'BDR', orderCount_i:  3, yearToDateRevenue_f:   640, priorYearRevenue_f:  1200, lastOrderDate_dt: '2026-05-17T00:00:00Z', nextTaskDate_dt: '2026-05-24T00:00:00Z' },
  { id: 'account_1187', recordType_s: 'Account', contactName_t: '',              accountName_t: 'Acme Industries',     accountID_s: 'ACME-001', emails_tps: [],                     phones_ss: ['415-555-0100'], salesRep_s: 'Jamie Lewis',  salesRepID_s: 'rep_22', podID_i: 3, role_s: 'AE',  orderCount_i: 41, yearToDateRevenue_f: 42100, priorYearRevenue_f: 38400, lastOrderDate_dt: '2026-05-19T00:00:00Z', nextTaskDate_dt: null },
  { id: 'contact_6612', recordType_s: 'Contact', contactName_t: "Liam O'Connor", accountName_t: 'OC Fitness',          accountID_s: 'OCF-053',  emails_tps: ['liam@ocfitness.ie'],  phones_ss: ['+353-1-555-019'], salesRep_s: 'Ren Atelier', salesRepID_s: 'rep_14', podID_i: 1, role_s: 'CSM', orderCount_i:  2, yearToDateRevenue_f:  1290, priorYearRevenue_f:     0, lastOrderDate_dt: '2026-05-10T00:00:00Z', nextTaskDate_dt: '2026-05-23T00:00:00Z' },
];

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
  // Query Builder state. When non-null, the QB has produced a filter
  // that's narrowing the result set; the QB bar shows above the table
  // with a clear button. The shape is intentionally opaque here — the
  // QB modal (not yet ported) hands us {label, solrFq} blocks that we
  // display + pass to Solr's fq= param. Until that lands, this stays
  // null and the bar is hidden.
  const [qbFilter, setQbFilter] = useState(null);

  const bindCloseRef = useRef(null);
  const handleBindClose = useCallback((fn) => {
    bindCloseRef.current = fn;
    bindClose?.(fn);
  }, [bindClose]);

  // Generation token — every runSearch bumps it. When a request comes
  // back we compare the gen it was issued at against the current value
  // and bail if they differ. Kills the "no data" toast firing twice on
  // mount under React StrictMode (which double-invokes effects in dev)
  // and also covers the case where filters change mid-flight.
  const searchGenRef = useRef(0);

  // ── Search ────────────────────────────────────────────────────
  const runSearch = useCallback(async (q, qb = qbFilter, typeF = typeFilter) => {
    const gen = ++searchGenRef.current;
    const term = q.trim();
    setStatus('loading');
    try {
      let docs;
      if (useMock) {
        await new Promise((r) => setTimeout(r, 320));
        const lower = term.toLowerCase();
        docs = MOCK_RESULTS.filter((r) => {
          if (typeF !== 'all' && r.recordType_s.toLowerCase() !== typeF) return false;
          if (lower) {
            const hay = `${r.contactName_t} ${r.accountName_t} ${r.emails_tps?.[0] || ''} ${r.salesRep_s} ${r.phones_ss?.[0] || ''}`.toLowerCase();
            if (!hay.includes(lower)) return false;
          }
          // QB filter is opaque in mock mode — when present we just
          // narrow to the first 3 mock rows so the bar visibly changes
          // the result set.
          if (qb) docs = docs?.slice(0, 3);
          return true;
        });
        if (qb) docs = docs.slice(0, 3);
      } else {
        const qStr = `q=${encodeURIComponent(term || '*:*')}`;
        let body = `${qStr}&sort=lastOrderDate_dt desc&rows=${ROWS}&qf=${encodeURIComponent(QF)}&q.op=AND&sow=false&defType=edismax`;
        if (qb?.solrFq) body += `&fq=${encodeURIComponent(qb.solrFq)}`;
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
        if (typeF !== 'all') docs = docs.filter((r) => (r.recordType_s || '').toLowerCase() === typeF);
      }
      if (gen !== searchGenRef.current) return;     // stale — newer search in flight
      setResults(docs);
      setTotal(docs.length);
      setStatus('ready');
      setSelected((sel) => {
        const next = new Set();
        for (const d of docs) if (sel.has(d.id)) next.add(d.id);
        return next;
      });
    } catch (err) {
      if (gen !== searchGenRef.current) return;     // stale — don't fire toast
      setStatus('error');
      setResults([]);
      setTotal(0);
      toast?.action?.({
        tone: 'warning',
        title: 'CRM search unavailable',
        message: err?.message || 'The CRM index didn\'t respond. Want to see what the table would look like?',
        primary: 'Use template data',
        secondary: 'Dismiss',
        icon: <I.alert />,
        duration: null,
        onPrimary: () => {
          // Bump the gen too so any pending stale searches don't clobber.
          searchGenRef.current++;
          setResults(MOCK_RESULTS);
          setTotal(MOCK_RESULTS.length);
          setStatus('ready');
        },
      });
    }
  }, [useMock, qbFilter, typeFilter, toast]);

  // Single effect drives all auto-searches. On first invocation it runs
  // an empty search (initial load); on subsequent invocations it re-runs
  // with the current type + QB filter. Combined into one effect so we
  // don't get the StrictMode double-fire that was producing TWO error
  // toasts on the empty CRM endpoint.
  const ranInitial = useRef(false);
  useEffect(() => {
    if (!ranInitial.current) {
      ranInitial.current = true;
      runSearch('', null, 'all');
      return;
    }
    runSearch(query, qbFilter, typeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, qbFilter]);

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

  // Query Builder open handler — stubbed until QB is ported to React.
  // The original modal hides itself, opens content/crm-query-builder.js's
  // overlay, then on confirm sets a Solr fq filter + a preview label.
  // For now we toast that it's coming and leave qbFilter null.
  const openQueryBuilder = () => {
    toast?.info?.({
      title: 'Query Builder',
      message: 'Coming soon — for now use the search input + type dropdown.',
      duration: 4000,
    });
  };

  // ── Render ───────────────────────────────────────────────────
  const selCount = selected.size;
  const subtitle = useMock
    ? <span>Search contacts &amp; accounts · <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-warning-fg)', fontWeight: 700, fontSize: 10 }}>OFFLINE / MOCK</span></span>
    : 'Search contacts & accounts · select · run campaigns';

  return (
    <FloatingPanel
      width={1000}
      height={640}
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

      {/* Query bar — search + type + Query Builder */}
      <div style={{
        padding: 12,
        borderBottom: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-surface-1)',
        display: 'flex', gap: 8, alignItems: 'center',
        flexShrink: 0,
      }}>
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
          variant="ghost"
          icon={<FunnelIcon />}
          onClick={openQueryBuilder}
        >Query Builder</Btn>
        <Btn
          size="sm"
          variant="tinted"
          status="brand"
          icon={<I.bolt size={11} />}
          onClick={() => runSearch(query)}
        >Search</Btn>
      </div>

      {/* QB filter bar — shows the block(s) produced by Query Builder.
          Hidden until the QB has output a filter (so until that's wired
          up, this stays collapsed). Lets the user see what's narrowing
          their results and clear it without re-opening the QB modal. */}
      <AnimatePresence initial={false}>
        {qbFilter && (
          <motion.div
            key="qb-bar"
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
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 11.5,
            }}>
              <FunnelIcon style={{ color: 'var(--gb-brand-label)' }} />
              <span style={{ color: 'var(--gb-brand-label)', fontWeight: 700, flexShrink: 0 }}>
                QB filter active:
              </span>
              <span style={{
                color: 'var(--gb-text-secondary)',
                fontFamily: 'var(--gb-font-mono)',
                fontSize: 11,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {qbFilter.label || '—'}
              </span>
              <Btn size="xs" variant="ghost" icon={<I.close size={10} />} onClick={() => setQbFilter(null)}>
                Clear
              </Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

/* ── ResultsTable ────────────────────────────────────────────
   Columns match the keys exposed by content/crm-query-builder.js
   (QB_FIELDS). Adding a column without a corresponding QB field
   would let users filter on something they can't see — and the
   reverse confuses people about what filters are available — so
   keep these in lock-step. */
const COLS = '30px 1.3fr 1.1fr 80px 1.3fr 0.9fr 70px 0.9fr 0.9fr 110px';

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
        <div>Email</div>
        <div>Sales Rep</div>
        <div>Orders</div>
        <div>YTD Rev</div>
        <div>PY Rev</div>
        <div>Last Order</div>
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
  const acct  = (isContact ? row.accountName_t : '—');
  const email = row.emails_tps?.[0] || row.email_tp || '—';
  const rep   = row.salesRep_s || '—';
  const url   = contactUrl(row.id);
  const mono = {
    color: 'var(--gb-text-tertiary)',
    fontFamily: 'var(--gb-font-mono)', fontSize: 11,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  };
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
      <div style={mono}>{email}</div>
      <div style={{
        color: 'var(--gb-text-tertiary)',
        fontSize: 11.5,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{rep}</div>
      <div style={mono}>{row.orderCount_i ?? '—'}</div>
      <div style={{ ...mono, color: 'var(--gb-text-secondary)' }}>{fmtMoney(row.yearToDateRevenue_f)}</div>
      <div style={mono}>{fmtMoney(row.priorYearRevenue_f)}</div>
      <div style={{ ...mono, color: 'var(--gb-text-muted)' }}>{fmtDate(row.lastOrderDate_dt)}</div>
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

/* Inline funnel icon for the Query Builder button + QB filter bar. */
function FunnelIcon({ size = 11, style }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={style}
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
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
