/* page-crm.jsx — CRM Tools as THREE separate pages (sidebar items):
   CRM Search · Query Builder · New Contact. Each shows the full live
   tool (stacked, description below) plus a detailed reference. */
(function () {
  const { useState, useMemo } = React;
  const { I, Btn, Input, Dropdown, Field, Tag, Dot } = window.GB;
  const TourBox = window.TourBox;
  const MiniFrame = window.MiniFrame;
  window.GBPages = window.GBPages || {};

  /* shared tab nav across the three CRM pages */
  const CRM_TABS = [
    { id: 'crm-search', label: 'CRM Search', icon: I.search },
    { id: 'crm-query', label: 'Query Builder', icon: I.filter },
    { id: 'crm-new', label: 'New Contact', icon: I.user },
  ];
  function CRMTabsNav({ active }) {
    return (
      <div className="tt-strip" style={{ marginBottom: 18 }}>
        {CRM_TABS.map((t) => (
          <button key={t.id} className={'tt-tab ' + (active === t.id ? 'on' : '')} onClick={() => { window.location.hash = '#' + t.id; }}>
            <span className="tt-ico">{t.icon({ size: 14 })}</span>{t.label}
          </button>
        ))}
      </div>
    );
  }

  /* ===================== CRM SEARCH ===================== */
  const ROWS = [
    { id: 'c1', type: 'Contact', name: 'Marcus Chen', account: 'Acme Industries', email: 'marcus@acme.co', rep: 'Jamie Lewis', orders: 12, ytd: 8400 },
    { id: 'c2', type: 'Contact', name: 'Sarah Patel', account: 'Pebble Beach Resort', email: 'sarah@pebble.com', rep: 'Ren Atelier', orders: 7, ytd: 18800 },
    { id: 'a1', type: 'Account', name: 'TaylorMade Promo', account: 'TaylorMade Promo', email: 'ops@taylormade.com', rep: 'Marco Studio', orders: 31, ytd: 22150 },
    { id: 'c3', type: 'Contact', name: 'Jordan Brown', account: 'Brown Custom Gifts', email: 'jordan@bcg.io', rep: 'Priya Designs', orders: 3, ytd: 640 },
    { id: 'a2', type: 'Account', name: 'Acme Industries', account: 'Acme Industries', email: 'ap@acme.co', rep: 'Jamie Lewis', orders: 41, ytd: 42100 },
    { id: 'c4', type: 'Contact', name: "Liam O'Connor", account: 'OC Fitness', email: 'liam@ocfitness.ie', rep: 'Ren Atelier', orders: 2, ytd: 1290 },
  ];
  const money = (n) => '$' + Number(n).toLocaleString('en-US');
  const TH = { textAlign: 'left', fontSize: 9.5, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--gb-text-muted)', fontWeight: 800, padding: '8px 11px', borderBottom: '1px solid var(--gb-border-default)', whiteSpace: 'nowrap' };
  const TD = { padding: '9px 11px', whiteSpace: 'nowrap' };
  function CRMSearchSnippet() {
    const [q, setQ] = useState('');
    const [type, setType] = useState('all');
    const [sel, setSel] = useState(() => new Set());
    const rows = useMemo(() => {
      const ql = q.trim().toLowerCase();
      return ROWS.filter((r) => (type === 'all' || r.type.toLowerCase() === type) && (!ql || `${r.name} ${r.account} ${r.email} ${r.rep}`.toLowerCase().includes(ql)));
    }, [q, type]);
    const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));
    const toggleAll = () => setSel((s) => { const n = new Set(s); if (allOn) rows.forEach((r) => n.delete(r.id)); else rows.forEach((r) => n.add(r.id)); return n; });
    const Check = ({ on }) => <span style={{ width: 15, height: 15, borderRadius: 4, border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), background: on ? 'var(--gb-brand-label)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gb-text-on-brand)' }}>{on && <I.check size={10} />}</span>;
    return (
      <MiniFrame width={600} label="modal · CRM Search" pad={false}>
        <div style={{ fontFamily: 'var(--gb-font-sans)' }}>
          <div style={{ display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)', alignItems: 'center' }}>
            <Input value={q} onChange={setQ} size="sm" placeholder="Search by name, email, account, or phone…" leading={<I.search size={12} />} style={{ flex: 1 }} />
            <Dropdown value={type} onChange={setType} size="sm" options={[{ id: 'all', label: 'All types' }, { id: 'contact', label: 'Contacts' }, { id: 'account', label: 'Accounts' }]} style={{ width: 120 }} />
            <Btn size="sm" variant="secondary" icon={<I.filter size={11} />}>Query Builder</Btn>
            <Btn size="sm" variant="tinted" status="brand" icon={<I.bolt size={11} />}>Search</Btn>
          </div>
          {sel.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 13px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-brand-tint-soft)' }}>
              <span style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)' }}><b style={{ color: 'var(--gb-brand-label)' }}>{sel.size} selected</b> of {rows.length}</span>
              <div style={{ flex: 1 }} />
              <Btn size="xs" variant="ghost" icon={<I.send size={10} />}>Run workflow</Btn>
              <Btn size="xs" variant="ghost" icon={<I.mail size={10} />}>Email selected</Btn>
              <Btn size="xs" variant="ghost" icon={<I.copy size={10} />}>Export CSV</Btn>
            </div>
          )}
          <div className="gb-thin-scroll" style={{ maxHeight: 280, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ position: 'sticky', top: 0, background: 'var(--gb-surface-1)', zIndex: 1 }}>
                <th style={{ ...TH, width: 30 }} onClick={toggleAll}><span style={{ cursor: 'pointer' }}><Check on={allOn} /></span></th>
                <th style={TH}>Name</th><th style={TH}>Account</th><th style={TH}>Sales Rep</th>
                <th style={{ ...TH, textAlign: 'right' }}>Orders</th><th style={{ ...TH, textAlign: 'right' }}>YTD Rev</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const on = sel.has(r.id);
                  return (
                    <tr key={r.id} onClick={() => toggle(r.id)} style={{ cursor: 'pointer', background: on ? 'var(--gb-brand-tint-soft)' : 'transparent', borderBottom: '1px solid var(--gb-border-subtle)' }}>
                      <td style={TD}><Check on={on} /></td>
                      <td style={TD}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ fontWeight: 600, color: 'var(--gb-text-primary)' }}>{r.name}</span><Tag size="xs" tone={r.type === 'Account' ? 'info' : 'neutral'}>{r.type === 'Account' ? 'ACCT' : 'CONTACT'}</Tag></span></td>
                      <td style={{ ...TD, color: 'var(--gb-text-tertiary)' }}>{r.account}</td>
                      <td style={{ ...TD, color: 'var(--gb-text-tertiary)' }}>{r.rep}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-secondary)' }}>{r.orders}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-secondary)' }}>{money(r.ytd)}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12 }}>No matches for “{q}”.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </MiniFrame>
    );
  }

  /* ===================== QUERY BUILDER ===================== */
  const QB_FIELDS = [
    { key: 'role_s', label: 'Role', type: 'enum', cat: 'Identity', options: ['BDR', 'AE', 'CSM', 'SE', 'Manager'] },
    { key: 'recordType_s', label: 'Record Type', type: 'enum', cat: 'Identity', options: ['Contact', 'Account'] },
    { key: 'salesRep_s', label: 'Sales Rep', type: 'text', cat: 'Identity' },
    { key: 'salesRepID_s', label: 'Sales Rep ID', type: 'text', cat: 'Identity' },
    { key: 'podID_i', label: 'Pod ID', type: 'int', cat: 'Identity' },
    { key: 'contactName_t', label: 'Contact Name', type: 'text', cat: 'Identity' },
    { key: 'accountName_t', label: 'Account Name', type: 'text', cat: 'Identity' },
    { key: 'accountID_s', label: 'Account ID', type: 'text', cat: 'Identity' },
    { key: 'emails_tps', label: 'Email', type: 'text', cat: 'Contact' },
    { key: 'phones_ss', label: 'Phone', type: 'text', cat: 'Contact' },
    { key: 'orderCount_i', label: 'Order Count', type: 'int', cat: 'Activity' },
    { key: 'lastOrderDate_dt', label: 'Last Order Date', type: 'date', cat: 'Activity' },
    { key: 'nextTaskDate_dt', label: 'Next Task Date', type: 'date', cat: 'Activity' },
    { key: 'priorYearRevenue_f', label: 'Prior Year Revenue', type: 'float', cat: 'Revenue' },
    { key: 'yearToDateRevenue_f', label: 'YTD Revenue', type: 'float', cat: 'Revenue' },
  ];
  const QB_OPS = {
    text: [{ id: 'is', label: 'is (exact)' }, { id: 'contains', label: 'contains' }, { id: 'starts', label: 'starts with' }, { id: 'exists', label: 'is set' }, { id: 'not_exists', label: 'is not set' }],
    enum: [{ id: 'is', label: 'is' }, { id: 'is_not', label: 'is not' }],
    int: [{ id: 'eq', label: '=' }, { id: 'ne', label: '≠' }, { id: 'gt', label: '>' }, { id: 'gte', label: '≥' }, { id: 'lt', label: '<' }, { id: 'lte', label: '≤' }, { id: 'between', label: 'between' }, { id: 'exists', label: 'is set' }, { id: 'not_exists', label: 'is not set' }],
    float: [{ id: 'eq', label: '=' }, { id: 'gt', label: '>' }, { id: 'gte', label: '≥' }, { id: 'lt', label: '<' }, { id: 'lte', label: '≤' }, { id: 'between', label: 'between' }, { id: 'exists', label: 'is set' }, { id: 'not_exists', label: 'is not set' }],
    date: [{ id: 'rel_past', label: 'more than … ago' }, { id: 'rel_recent', label: 'less than … ago' }, { id: 'rel_future', label: 'within next …' }, { id: 'before', label: 'before date' }, { id: 'after', label: 'after date' }, { id: 'after_today', label: 'after today' }, { id: 'before_today', label: 'before today' }, { id: 'exists', label: 'is set' }, { id: 'not_exists', label: 'is not set' }],
  };
  const opLabel = (type, op) => (QB_OPS[type].find((o) => o.id === op) || {}).label || op;
  const NO_VALUE = ['exists', 'not_exists', 'after_today', 'before_today'];
  function QueryBuilderSnippet() {
    const [conds, setConds] = useState([
      { id: 1, fieldKey: 'role_s', op: 'is', val: 'AE', num: '1', unit: 'years' },
      { id: 2, fieldKey: 'yearToDateRevenue_f', op: 'gt', val: '10000', num: '1', unit: 'years' },
      { id: 3, fieldKey: 'lastOrderDate_dt', op: 'rel_past', val: '', num: '6', unit: 'months' },
    ]);
    const fieldOf = (k) => QB_FIELDS.find((f) => f.key === k);
    const setC = (id, patch) => setConds((cs) => cs.map((c) => c.id === id ? { ...c, ...patch } : c));
    const onField = (id, key) => { const f = fieldOf(key); const op = QB_OPS[f.type][0].id; setC(id, { fieldKey: key, op, val: f.type === 'enum' ? f.options[0] : '' }); };
    const add = () => setConds((cs) => [...cs, { id: Date.now(), fieldKey: 'salesRep_s', op: 'contains', val: '', num: '1', unit: 'years' }]);
    const rm = (id) => setConds((cs) => cs.filter((c) => c.id !== id));
    const label = (c) => {
      const f = fieldOf(c.fieldKey);
      if (NO_VALUE.includes(c.op)) return `${f.label} ${opLabel(f.type, c.op)}`;
      if (f.type === 'date' && c.op.startsWith('rel_')) return `${f.label} ${opLabel(f.type, c.op).replace('…', `${c.num} ${c.unit}`)}`;
      return `${f.label} ${opLabel(f.type, c.op)} ${c.val || '…'}`;
    };
    const fieldOpts = useMemo(() => {
      const cats = [...new Set(QB_FIELDS.map((f) => f.cat))];
      return cats.flatMap((cat) => QB_FIELDS.filter((f) => f.cat === cat).map((f) => ({ id: f.key, label: f.label, group: cat })));
    }, []);
    return (
      <MiniFrame width={620} label="modal · Query Builder" pad>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {conds.map((c, i) => {
            const f = fieldOf(c.fieldKey);
            const isRel = f.type === 'date' && c.op.startsWith('rel_');
            return (
              <div key={c.id}>
                {i > 0 && <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--gb-brand-label)', letterSpacing: 1, margin: '2px 0 5px 2px' }}>AND</div>}
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <Dropdown value={c.fieldKey} onChange={(v) => onField(c.id, v)} size="sm" searchable options={fieldOpts} style={{ flex: 1.4 }} />
                  <Dropdown value={c.op} onChange={(v) => setC(c.id, { op: v })} size="sm" options={QB_OPS[f.type]} style={{ flex: 1.1 }} />
                  {!NO_VALUE.includes(c.op) && (isRel ? (
                    <div style={{ display: 'flex', gap: 4, flex: 1.1 }}>
                      <Input value={c.num} onChange={(v) => setC(c.id, { num: v.replace(/\D/g, '') })} size="sm" style={{ width: 46 }} />
                      <Dropdown value={c.unit} onChange={(v) => setC(c.id, { unit: v })} size="sm" options={['days', 'weeks', 'months', 'years'].map((u) => ({ id: u, label: u }))} style={{ flex: 1 }} />
                    </div>
                  ) : f.type === 'enum' ? (
                    <Dropdown value={c.val} onChange={(v) => setC(c.id, { val: v })} size="sm" options={f.options.map((o) => ({ id: o, label: o }))} style={{ flex: 1.1 }} />
                  ) : (
                    <Input value={c.val} onChange={(v) => setC(c.id, { val: v })} size="sm" placeholder="value" style={{ flex: 1.1 }} />
                  ))}
                  <button onClick={() => rm(c.id)} style={{ flexShrink: 0, width: 28, height: 28, border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-surface-1)', color: 'var(--gb-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.close size={11} /></button>
                </div>
              </div>
            );
          })}
          <Btn size="sm" variant="dashed" icon={<I.plus />} onClick={add} full>Add condition</Btn>
          <div style={{ marginTop: 4, padding: '10px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--gb-brand-label)' }}><I.filter size={12} /></span>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--gb-brand-label)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Filter:</span>
            {conds.map((c, i) => <React.Fragment key={c.id}>{i > 0 && <span style={{ fontSize: 9, color: 'var(--gb-text-muted)', fontWeight: 700 }}>AND</span>}<span style={{ fontSize: 11, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-secondary)' }}>{label(c)}</span></React.Fragment>)}
          </div>
        </div>
      </MiniFrame>
    );
  }

  /* ===================== NEW CONTACT (full form) ===================== */
  const MOCK_ACCTS = [
    { id: 'A-2188', text: 'Acme Industries', sec: 'San Francisco, CA' },
    { id: 'A-2189', text: 'Acme Hospitality Group', sec: 'San Jose, CA' },
    { id: 'A-1187', text: 'Pebble Beach Resort', sec: 'Pebble Beach, CA' },
    { id: 'A-4517', text: 'TaylorMade Promo', sec: 'Carlsbad, CA' },
  ];
  const dd = (arr) => arr.map((x) => Array.isArray(x) ? { id: x[0], label: x[1] } : { id: x, label: x });
  const INDUSTRIES = ['Select', 'Automotive', 'Business Services', 'Education', 'Financial', 'Government', 'Healthcare & Medical', 'Hospitality & Recreation', 'Industrial Manufacturing', 'Information Technology', 'Media & Entertainment', 'Software', 'Telecommunications'];
  const EMP = ['Select', '0 - 9', '10 - 19', '20 - 49', '50 - 99', '100 - 249', '250 - 499', '500 - 999', '1,000 - 4,999', '5,000 - 9,999', '10,000+'];
  const REV = ['Select', '$1 - $1M', '$1M - $5M', '$5M - $10M', '$10M - $25M', '$25M - $50M', '$50M - $100M', '$100M - $250M', '$250M - $500M', '$500M - $1B', '$1B+'];
  const CUST = [['0', 'Select'], ['1', 'Consumer'], ['2', 'Business - Buyer'], ['3', 'Business - Influencer'], ['4', 'Business - Processor']];
  const TERR = [['0', 'Not Set'], ['1', 'P1 / SR (Lorie)'], ['4', 'P2 / SR (Melanie)'], ['7', 'P3 / SR (Scott)'], ['13', 'P5 / SR (Seth)'], ['15', 'P5 / BDR (Cullen)'], ['19', 'P7 / SR (Joby)'], ['22', 'P8 / SR (Collin)']];
  const CAMP = [['0', 'Select'], ['1774', '6Sense'], ['1780', 'Google Search'], ['1834', 'LinkedIn'], ['1782', 'Phone Call'], ['1786', 'Webform'], ['1777', 'Customer Referral'], ['1784', 'Sales Person Outreach']];
  const COUNTRIES = [['US', 'United States'], ['CA', 'Canada'], ['OTH', 'Other']];
  const FLAGS = [['Consumer', 'Consumer'], ['Custom', 'Custom'], ['Rep', 'Rep'], ['OneToOne', 'One-to-One'], ['Retail', 'Retail'], ['Delay', 'Delay']];

  function Hdr({ children }) { return <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--gb-brand-label)', borderBottom: '1px solid var(--gb-border-subtle)', paddingBottom: 6, margin: '14px 0 9px' }}>{children}</div>; }
  function G3({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 4 }}>{children}</div>; }
  function CreateContactSnippet() {
    const [f, setF] = useState({ first: '', last: '', email: '', phone: '', job: '', company: '', acct: '', acctId: '', web: '', linkedin: '', address: '', city: '', postal: '', country: 'US', industry: 'Select', emp: 'Select', rev: 'Select', cust: '0', terr: '15', camp: '0', source: '' });
    const [flags, setFlags] = useState({});
    const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
    const acResults = useMemo(() => { const q = f.acct.trim().toLowerCase(); if (f.acctId || q.length < 2) return null; return MOCK_ACCTS.filter((a) => a.text.toLowerCase().includes(q)); }, [f.acct, f.acctId]);
    const ready = f.first.trim() && f.last.trim() && f.email.trim();
    return (
      <MiniFrame width={680} label="modal · New Contact" pad={false}>
        <div className="gb-thin-scroll" style={{ maxHeight: 440, overflowY: 'auto', padding: 16 }}>
          <Hdr>Contact Info</Hdr>
          <G3>
            <Field label="First name" required><Input value={f.first} onChange={(v) => set('first', v)} size="sm" placeholder="First" /></Field>
            <Field label="Last name" required><Input value={f.last} onChange={(v) => set('last', v)} size="sm" placeholder="Last" /></Field>
            <Field label="Email" required><Input value={f.email} onChange={(v) => set('email', v)} size="sm" placeholder="name@example.com" /></Field>
          </G3>
          <G3>
            <Field label="Phone"><Input value={f.phone} onChange={(v) => set('phone', v)} size="sm" placeholder="(415) 555-0100" /></Field>
            <Field label="Job title"><Input value={f.job} onChange={(v) => set('job', v)} size="sm" placeholder="Purchasing manager" /></Field>
            <Field label="Company"><Input value={f.company} onChange={(v) => set('company', v)} size="sm" placeholder="Acme Industries" /></Field>
          </G3>

          <Hdr>Account &amp; Location</Hdr>
          <G3>
            <Field label={f.acctId ? 'Account · linked' : 'Account'} required>
              <div style={{ position: 'relative' }}>
                <Input value={f.acct} onChange={(v) => { set('acct', v); set('acctId', ''); }} size="sm" placeholder="Search account…"
                  leading={f.acctId ? <I.check size={11} style={{ color: 'var(--gb-brand-label)' }} /> : <I.search size={11} />}
                  trailing={f.acctId ? <button onClick={() => { set('acct', ''); set('acctId', ''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex' }}><I.close size={10} /></button> : null} />
                {acResults && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20, background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)', boxShadow: 'var(--gb-shadow-popover)', overflow: 'hidden' }}>
                    {acResults.length === 0 ? <div style={{ padding: '9px 11px', fontSize: 11, color: 'var(--gb-text-muted)', textAlign: 'center' }}>No matching accounts</div> :
                      acResults.map((a) => <button key={a.id} onClick={() => { set('acct', a.text); set('acctId', a.id); }} style={{ width: '100%', display: 'flex', alignItems: 'baseline', gap: 8, padding: '7px 10px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--gb-border-subtle)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{a.text}</span>
                        <span style={{ fontSize: 10, color: 'var(--gb-text-tertiary)' }}>{a.sec}</span>
                        <span style={{ marginLeft: 'auto', fontFamily: 'var(--gb-font-mono)', fontSize: 9.5, color: 'var(--gb-text-muted)' }}>{a.id}</span>
                      </button>)}
                  </div>
                )}
              </div>
            </Field>
            <Field label={f.acctId ? 'Website · linked' : 'Account website'} required={!f.acctId}><Input value={f.web} onChange={(v) => set('web', v)} size="sm" placeholder="https://acme.com" disabled={!!f.acctId} /></Field>
            <Field label="LinkedIn URL"><Input value={f.linkedin} onChange={(v) => set('linkedin', v)} size="sm" placeholder="linkedin.com/in/…" /></Field>
          </G3>
          <G3>
            <Field label="Address"><Input value={f.address} onChange={(v) => set('address', v)} size="sm" placeholder="482 Brannan St" /></Field>
            <Field label="City"><Input value={f.city} onChange={(v) => set('city', v)} size="sm" placeholder="San Francisco" /></Field>
            <Field label="Postal"><Input value={f.postal} onChange={(v) => set('postal', v)} size="sm" placeholder="94107" /></Field>
          </G3>
          <div style={{ width: 'calc(33% - 6px)' }}><Field label="Country"><Dropdown value={f.country} onChange={(v) => set('country', v)} size="sm" options={dd(COUNTRIES)} /></Field></div>

          <Hdr>Segmentation &amp; Assignment</Hdr>
          <G3>
            <Field label="Industry"><Dropdown value={f.industry} onChange={(v) => set('industry', v)} size="sm" searchable options={dd(INDUSTRIES)} /></Field>
            <Field label="Employee range"><Dropdown value={f.emp} onChange={(v) => set('emp', v)} size="sm" options={dd(EMP)} /></Field>
            <Field label="Est. revenue"><Dropdown value={f.rev} onChange={(v) => set('rev', v)} size="sm" options={dd(REV)} /></Field>
          </G3>
          <G3>
            <Field label="Customer type"><Dropdown value={f.cust} onChange={(v) => set('cust', v)} size="sm" options={dd(CUST)} /></Field>
            <Field label="Territory"><Dropdown value={f.terr} onChange={(v) => set('terr', v)} size="sm" searchable options={dd(TERR)} /></Field>
            <Field label="Campaign"><Dropdown value={f.camp} onChange={(v) => set('camp', v)} size="sm" searchable options={dd(CAMP)} /></Field>
          </G3>

          <Hdr>Source &amp; Flags</Hdr>
          <Field label="Source details"><Input value={f.source} onChange={(v) => set('source', v)} size="sm" placeholder="PGA Show 2026 — booth visit" /></Field>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {FLAGS.map(([k, lbl]) => {
              const on = !!flags[k];
              return <button key={k} onClick={() => setFlags((s) => ({ ...s, [k]: !on }))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 'var(--gb-r-sm)', fontSize: 11, fontWeight: 600, background: on ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)', border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>{on && <I.check size={10} />}{lbl}</button>;
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)' }}>
          <span style={{ flex: 1, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, color: ready ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}>{ready ? <><I.check size={11} /> Required fields filled</> : <><span style={{ color: 'var(--gb-error-fg)', fontWeight: 700 }}>*</span> Fill required fields</>}</span>
          <Btn size="sm" variant="secondary">Cancel</Btn>
          <Btn size="sm" variant="tinted" status="brand" icon={<I.user size={11} />} disabled={!ready}>Create contact</Btn>
        </div>
      </MiniFrame>
    );
  }

  const LEDE = "Three tools for working with customers without leaving the page you're on. Each opens from the popup or a keyboard shortcut — and each is shown here live, on sample data.";

  /* ---------- PAGE: CRM Search ---------- */
  function SearchPage() {
    return (
      <div className="prose">
        <div className="eyebrow">Find People · CRM Tools</div>
        <h1 className="title">CRM Search</h1>
        <p className="lede">{LEDE}</p>
        <TourBox stack title="Find any contact or account" live={<CRMSearchSnippet />} eyebrow="⌃K · the daily lookup">
          <p>Search by <strong>name, email, account, or phone</strong>, filter to Contacts or Accounts, and select rows with the checkboxes. Type in the search box above — it filters live; tick a row to reveal the action bar.</p>
        </TourBox>
        <h2 className="sec">Search, in two speeds</h2>
        <table className="spectable">
          <thead><tr><th>Mode</th><th>How it works</th></tr></thead>
          <tbody>
            <tr><td><b>Indexed</b></td><td>Opens instantly over contacts you've already pulled, filtering as you type — no network. Click <b>Index these</b> on a result set to add them for next time.</td></tr>
            <tr><td><b>Server</b></td><td>Press <b>Enter</b> / <b>Search</b> to query the full Solr index — fuzzy-tolerant (one typo), name-weighted, paginated as you scroll.</td></tr>
          </tbody>
        </table>
        <h3 className="sub">What you can do with a selection</h3>
        <ul>
          <li><strong>Email selected</strong> — hand the rows to the bulk template runner (subject/body resolve per recipient, with variations).</li>
          <li><strong>Export CSV</strong> — download the chosen rows with every column (Excel-safe UTF-8).</li>
          <li><strong>Run workflow</strong> — open the workflow manager to sequence emails / tasks across the selection.</li>
        </ul>
        <p style={{ marginTop: 16 }}>Need a more precise set than keywords can give? Switch to the <a href="#crm-query">Query Builder</a>.</p>
      </div>
    );
  }

  /* ---------- PAGE: Query Builder ---------- */
  function QBPage() {
    const cats = ['Identity', 'Contact', 'Activity', 'Revenue'];
    return (
      <div className="prose">
        <div className="eyebrow">Find People · CRM Tools</div>
        <h1 className="title">Query Builder</h1>
        <p className="lede">{LEDE}</p>
        <TourBox stack title="Build a precise segment" live={<QueryBuilderSnippet />} eyebrow="⌃Q · precise segments">
          <p>Assemble <strong>field · operator · value</strong> conditions joined with AND. Operators adapt to each field's type. Build something like “Role is AE <strong>AND</strong> YTD Revenue &gt; $10,000 <strong>AND</strong> Last Order more than 6 months ago,” and it compiles to a filter the results table applies. Add, edit, or remove rows above — the filter summary updates live.</p>
        </TourBox>

        <h2 className="sec">Every field you can filter on</h2>
        <p>The same columns the results table shows, grouped by category:</p>
        <table className="spectable">
          <thead><tr><th>Category</th><th>Field</th><th>Type</th><th>Example operators</th></tr></thead>
          <tbody>
            {cats.map((cat) => QB_FIELDS.filter((f) => f.cat === cat).map((f, i) => (
              <tr key={f.key}>
                <td>{i === 0 ? <b>{cat}</b> : ''}</td>
                <td><b>{f.label}</b>{f.options ? <span style={{ color: 'var(--gb-text-muted)' }}> · {f.options.join(' / ')}</span> : ''}</td>
                <td><code>{f.type}</code></td>
                <td style={{ color: 'var(--gb-text-muted)' }}>{QB_OPS[f.type].slice(0, 4).map((o) => o.label).join(', ')}…</td>
              </tr>
            )))}
          </tbody>
        </table>

        <h2 className="sec">Operators by field type</h2>
        <table className="spectable">
          <thead><tr><th>Type</th><th>Operators</th></tr></thead>
          <tbody>
            <tr><td><b>Text</b> <span style={{ color: 'var(--gb-text-muted)' }}>(name, email, rep…)</span></td><td>is (exact) · contains · starts with · is set · is not set</td></tr>
            <tr><td><b>Choice</b> <span style={{ color: 'var(--gb-text-muted)' }}>(role, record type)</span></td><td>is · is not</td></tr>
            <tr><td><b>Number</b> <span style={{ color: 'var(--gb-text-muted)' }}>(orders, revenue)</span></td><td>= · ≠ · &gt; · ≥ · &lt; · ≤ · between · is set · is not set</td></tr>
            <tr><td><b>Date</b> <span style={{ color: 'var(--gb-text-muted)' }}>(last order, next task)</span></td><td>more than … ago · less than … ago · within next … · before date · after date · after today · before today · is set · is not set</td></tr>
          </tbody>
        </table>

        <div className="docnote info">
          <span className="dn-ico">{I.filter({ size: 15 })}</span>
          <div className="dn-b">
            <div className="dn-t">Grouping &amp; NOT</div>
            <p style={{ margin: 0 }}>Beyond a flat AND list, the full builder lets you create <strong>groups</strong> with their own AND/OR joiner and flip any group to <strong>NOT</strong> — so you can express “(Role is AE OR Role is CSM) AND NOT (Last Order within 30 days).” The compiled filter shows as removable chips on the search results.</p>
          </div>
        </div>
        <p style={{ marginTop: 16 }}>Once a filter is built, results land back in <a href="#crm-search">CRM Search</a> ready to email or export.</p>
      </div>
    );
  }

  /* ---------- PAGE: New Contact ---------- */
  function NewPage() {
    return (
      <div className="prose">
        <div className="eyebrow">Find People · CRM Tools</div>
        <h1 className="title">New Contact</h1>
        <p className="lede">{LEDE}</p>
        <TourBox stack title="Add someone to the CRM" live={<CreateContactSnippet />} eyebrow="⌃N · add someone">
          <p>The full create form, live. Fill it in, link or create an account, and submit straight to the CRM. <strong>First name, last name, and email</strong> are required (the Create button stays disabled until they're set). Start typing “Acme” in the Account field to see the live autocomplete.</p>
        </TourBox>

        <h2 className="sec">The four sections</h2>
        <table className="spectable">
          <thead><tr><th>Section</th><th>Fields</th></tr></thead>
          <tbody>
            <tr><td><b>Contact Info</b></td><td>First name*, Last name*, Email*, Phone, Job title, Company.</td></tr>
            <tr><td><b>Account &amp; Location</b></td><td>Account (autocomplete — link existing or create new), Account website (required for a new account), LinkedIn, Address, City, Postal, Country.</td></tr>
            <tr><td><b>Segmentation &amp; Assignment</b></td><td>Industry, Employee range, Est. revenue, Customer type, Territory, Campaign / source.</td></tr>
            <tr><td><b>Source &amp; Flags</b></td><td>Source details, plus quick flags: Consumer, Custom, Rep, One-to-One, Retail, Delay.</td></tr>
          </tbody>
        </table>

        <div className="docnote brand">
          <span className="dn-ico">{I.user({ size: 15 })}</span>
          <div className="dn-b">
            <div className="dn-t">Link vs. create an account</div>
            <p style={{ margin: 0 }}>Pick a result from the Account autocomplete to <strong>link</strong> an existing account (its website is already on file). Type a brand-new name and the <strong>Account website</strong> field becomes required so the new account is created with the essentials. On success you're taken straight to the new contact's page.</p>
          </div>
        </div>

        <h2 className="sec">Phone Finder</h2>
        <p>A lighter helper in the same family: <strong>Phone Finder</strong> extracts and formats phone numbers out of order/contact data so you can copy a clean, dialable number in one click — handy when a number is buried in free-text notes. Toggle it in <a href="#settings">Settings → Features</a>.</p>
      </div>
    );
  }

  window.GBPages['crm-search'] = { title: 'CRM Search', group: 'Find People', icon: 'search', render: () => <SearchPage /> };
  window.GBPages['crm-query'] = { title: 'Query Builder', group: 'Find People', icon: 'filter', render: () => <QBPage /> };
  window.GBPages['crm-new'] = { title: 'New Contact', group: 'Find People', icon: 'user', render: () => <NewPage /> };
})();
