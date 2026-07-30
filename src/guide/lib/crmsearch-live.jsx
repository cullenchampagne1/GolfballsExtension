import React, { useState, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Btn, Input, Dropdown, Tag, Checkbox, Icon, I } from '../../ui/index.js';

/* ───────────────────────────────────────────────────────────────
   crmsearch-live.jsx — a faithful port of CRMSearch.jsx for the
   guide. Same query bar, sortable results table, type tags, and
   selection bar as the real modal, on the same MOCK_RESULTS, with an
   imperative API. Reusable cutouts:
     • CRMSearchLive — the whole modal (LiveStage hero, wide)
     • ResultRow, TableHeader, Toolbar, SelectionBar
─────────────────────────────────────────────────────────────── */

export const COLS = '30px 1.3fr 1.1fr 80px 1.9fr 70px 0.9fr 0.9fr 110px';
const TYPE_OPTS = [{ id: 'all', label: 'All types' }, { id: 'contact', label: 'Contacts' }, { id: 'account', label: 'Accounts' }];
const FunnelIcon = (p) => <Icon {...p}><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></Icon>;

const fmtMoney = (n) => (n == null || n === '') ? '—' : '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtDate = (iso) => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`; };

export const MOCK_RESULTS = [
  { id: 'contact_4421', recordType_s: 'Contact', contactName_t: 'Marcus Chen', accountName_t: 'Acme Industries', emails_tps: ['marcus@acme.co'], orderCount_i: 12, yearToDateRevenue_f: 8400, priorYearRevenue_f: 12400, lastOrderDate_dt: '2026-05-18T00:00:00Z' },
  { id: 'contact_4517', recordType_s: 'Contact', contactName_t: 'Sarah Patel', accountName_t: 'Pebble Beach Resort', emails_tps: ['sarah@pebble.com'], orderCount_i: 7, yearToDateRevenue_f: 18800, priorYearRevenue_f: 22150, lastOrderDate_dt: '2026-05-12T00:00:00Z' },
  { id: 'account_2188', recordType_s: 'Account', contactName_t: '', accountName_t: 'TaylorMade Promo', emails_tps: ['ops@taylormade.com'], orderCount_i: 31, yearToDateRevenue_f: 22150, priorYearRevenue_f: 38900, lastOrderDate_dt: '2026-04-22T00:00:00Z' },
  { id: 'contact_5223', recordType_s: 'Contact', contactName_t: 'Jordan Brown', accountName_t: 'Brown Custom Gifts', emails_tps: ['jordan@bcg.io'], orderCount_i: 3, yearToDateRevenue_f: 640, priorYearRevenue_f: 1200, lastOrderDate_dt: '2026-05-17T00:00:00Z' },
  { id: 'account_1187', recordType_s: 'Account', contactName_t: '', accountName_t: 'Acme Industries', emails_tps: [], orderCount_i: 41, yearToDateRevenue_f: 42100, priorYearRevenue_f: 38400, lastOrderDate_dt: '2026-05-19T00:00:00Z' },
  { id: 'contact_6612', recordType_s: 'Contact', contactName_t: "Liam O'Connor", accountName_t: 'OC Fitness', emails_tps: ['liam@ocfitness.ie'], orderCount_i: 2, yearToDateRevenue_f: 1290, priorYearRevenue_f: 0, lastOrderDate_dt: '2026-05-10T00:00:00Z' },
];

const SORT_COLS = {
  contactName_t: 'Name', accountName_t: 'Account', recordType_s: 'Type',
  orderCount_i: 'Orders', yearToDateRevenue_f: 'YTD Rev', priorYearRevenue_f: 'PY Rev', lastOrderDate_dt: 'Last Order',
};

export function SortHead({ k, label, sortKey, sortDir, onSort }) {
  const active = sortKey === k;
  return (
    <button type="button" onClick={() => onSort(k)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', color: active ? 'var(--gb-brand-label)' : 'inherit', fontFamily: 'inherit' }}>
      {label}{active && <span style={{ fontSize: 8 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  );
}

export function TableHeader({ allChecked, onToggleAll, sortKey, sortDir, onSort, demo }) {
  return (
    <div data-demo={demo} style={{ display: 'grid', gridTemplateColumns: COLS, padding: '8px 14px', gap: 12, background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)', fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-text-muted)', position: 'sticky', top: 0, zIndex: 4 }}>
      <div><Checkbox checked={allChecked} onChange={onToggleAll} /></div>
      <SortHead k="contactName_t" label="Name" {...{ sortKey, sortDir, onSort }} />
      <SortHead k="accountName_t" label="Account" {...{ sortKey, sortDir, onSort }} />
      <SortHead k="recordType_s" label="Type" {...{ sortKey, sortDir, onSort }} />
      <div>Email</div>
      <SortHead k="orderCount_i" label="Orders" {...{ sortKey, sortDir, onSort }} />
      <SortHead k="yearToDateRevenue_f" label="YTD Rev" {...{ sortKey, sortDir, onSort }} />
      <SortHead k="priorYearRevenue_f" label="PY Rev" {...{ sortKey, sortDir, onSort }} />
      <SortHead k="lastOrderDate_dt" label="Last Order" {...{ sortKey, sortDir, onSort }} />
    </div>
  );
}

export function ResultRow({ row, isSelected, onToggle, demo }) {
  const isContact = row.recordType_s === 'Contact';
  const name = isContact ? row.contactName_t : row.accountName_t;
  const email = (row.emails_tps && row.emails_tps[0]) || '—';
  const mono = { color: 'var(--gb-text-tertiary)', fontFamily: 'var(--gb-font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  return (
    <div data-row-id={row.id} data-demo={demo}
      style={{ position: 'relative', display: 'grid', gridTemplateColumns: COLS, padding: '10px 14px', gap: 12, alignItems: 'center', marginBottom: 4, fontSize: 12, cursor: 'pointer' }}
      onClick={(e) => { if (e.target.closest('a, button, [data-checkbox]')) return; onToggle?.(e); }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: -1, background: isSelected ? 'var(--gb-brand-tint-soft)' : 'transparent', boxShadow: isSelected ? 'inset 3px 0 0 0 var(--gb-brand-label)' : 'none', transition: 'background-color .15s, box-shadow .15s' }} />
      <div style={{ display: 'flex', alignItems: 'center' }}><Checkbox checked={isSelected} onChange={(e) => onToggle?.(e)} /></div>
      <span style={{ color: 'var(--gb-text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <div style={{ color: 'var(--gb-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.accountName_t}</div>
      <div><Tag tone={isContact ? 'info' : 'brand'} size="xs">{isContact ? 'Contact' : 'Account'}</Tag></div>
      <div style={mono}>{email}</div>
      <div style={mono}>{row.orderCount_i ?? '—'}</div>
      <div style={{ ...mono, color: 'var(--gb-text-secondary)' }}>{fmtMoney(row.yearToDateRevenue_f)}</div>
      <div style={mono}>{fmtMoney(row.priorYearRevenue_f)}</div>
      <div style={{ ...mono, color: 'var(--gb-text-muted)' }}>{fmtDate(row.lastOrderDate_dt)}</div>
    </div>
  );
}

export function Toolbar({ query, setQuery, typeFilter, setType }) {
  return (
    <div style={{ padding: 12, borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
      <Input value={query} onChange={setQuery} placeholder="Filter indexed contacts — Enter to search server" leading={<I.search size={12} />} style={{ flex: 1 }} />
      <Dropdown value={typeFilter} onChange={setType} options={TYPE_OPTS} style={{ width: 130 }} />
      <Btn size="sm" variant="secondary" icon={<FunnelIcon />}>Query Builder</Btn>
      <Btn size="sm" variant="tinted" status="brand" icon={<I.bolt size={11} />}>Search</Btn>
    </div>
  );
}

export function SelectionBar({ selCount, total }) {
  return (
    <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-brand-tint-soft)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)' }}><span style={{ color: 'var(--gb-brand-label)', fontWeight: 700 }}>{selCount} selected</span> of {total} results</div>
      <div style={{ flex: 1 }} />
      <Btn size="sm" variant="ghost" icon={<I.megaphone size={11} />}>Run workflow</Btn>
      <Btn size="sm" variant="ghost" icon={<I.mail size={11} />}>Email selected</Btn>
      <Btn size="sm" variant="ghost" icon={<I.copy size={11} />}>Export CSV</Btn>
    </div>
  );
}

export const CRMSearchLive = forwardRef(function CRMSearchLive(_props, ref) {
  const [all] = useState(() => MOCK_RESULTS);
  const [query, setQuery] = useState('');
  const [typeFilter, setType] = useState('all');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [selected, setSelected] = useState(new Set());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = all.filter((r) => {
      if (typeFilter === 'contact' && r.recordType_s !== 'Contact') return false;
      if (typeFilter === 'account' && r.recordType_s !== 'Account') return false;
      if (!q) return true;
      return [r.contactName_t, r.accountName_t, (r.emails_tps || []).join(' ')].join(' ').toLowerCase().includes(q);
    });
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        let av = a[sortKey], bv = b[sortKey];
        if (sortKey === 'lastOrderDate_dt') { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return rows;
  }, [all, query, typeFilter, sortKey, sortDir]);

  const onSort = (k) => { if (sortKey === k) setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('asc'); } };
  const toggleSel = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => s.size === visible.length ? new Set() : new Set(visible.map((r) => r.id)));

  useImperativeHandle(ref, () => ({
    setType, onSort, selectN: (n) => setSelected(new Set(visible.slice(0, n).map((r) => r.id))), clearSel: () => setSelected(new Set()),
  }), [visible]);

  const selCount = selected.size;
  return (
    <div style={{ width: '100%', maxWidth: 1000, height: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-canvas)', color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-sans)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', boxShadow: 'var(--gb-shadow-modal)', overflow: 'hidden', userSelect: 'none' }}>
      <div data-demo="header" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)' }}>
        <div style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.search size={15} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>CRM Search</div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>Search contacts &amp; accounts · <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-warning-fg)', fontWeight: 700, fontSize: 10 }}>OFFLINE / MOCK</span></div>
        </div>
      </div>

      <div data-demo="toolbar"><Toolbar {...{ query, setQuery, typeFilter, setType }} /></div>
      {selCount > 0 && <div data-demo="selbar"><SelectionBar selCount={selCount} total={visible.length} /></div>}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <TableHeader demo="sortheader" allChecked={selCount > 0 && selCount === visible.length} onToggleAll={toggleAll} {...{ sortKey, sortDir, onSort }} />
        {visible.map((r, i) => <ResultRow key={r.id} row={r} isSelected={selected.has(r.id)} onToggle={() => toggleSel(r.id)} demo={i === 0 ? 'row' : undefined} />)}
        {visible.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12 }}>No results match your filters.</div>}
      </div>

      <div data-demo="footer" style={{ padding: '8px 14px', borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>Locally indexed — instant typeahead. Falls through to server on Enter.</div>
        <Btn size="sm" variant="ghost" icon={<I.trash size={11} />}>Clear index</Btn>
      </div>
    </div>
  );
});
