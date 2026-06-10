import React, { useState } from 'react';
import { I, Btn, Input, Tag, Field, Dropdown } from '../../ui/index.js';
import { TourBox, MiniFrame } from '../lib/tourbox.jsx';

/* ───────────────────────────────────────────────────────────────
   crm.jsx — the Find People pages: CRM Search, Query Builder,
   New Contact. All fields, operators, and presets from the
   verified articles (crm-search, query-builder, new-contact,
   phone-finder) — the design mockup's invented fields (Industry,
   Employee range, LinkedIn…) are deliberately absent.
─────────────────────────────────────────────────────────────── */

/* ════════ CRM SEARCH ════════ */

const RESULTS = [
  { name: 'Marcus Chen', account: 'Acme Industries', email: 'marcus@acme.com', orders: 14, ytd: '$12,400' },
  { name: 'Dana Whitfield', account: 'Whitfield Golf Co', email: 'dana@whitfieldgolf.com', orders: 6, ytd: '$3,180' },
  { name: 'Erin Wallace', account: 'Lee Industries', email: 'erin@leeind.com', orders: 2, ytd: '$940' },
];
function SearchSnippet() {
  const [sel, setSel] = useState({ 0: true, 1: true });
  const count = Object.values(sel).filter(Boolean).length;
  return (
    <MiniFrame width={460} label="crm search · results" pad>
      <Input size="sm" placeholder="Filter indexed contacts — Enter to search server" leading={<I.search />} />
      <div style={{ marginTop: 8, border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
        {RESULTS.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderBottom: i < RESULTS.length - 1 ? '1px solid var(--gb-border-subtle)' : 'none', background: sel[i] ? 'var(--gb-brand-tint-soft)' : 'transparent' }}>
            <button onClick={() => setSel((s) => ({ ...s, [i]: !s[i] }))} style={{ width: 15, height: 15, borderRadius: 4, border: '1px solid var(--gb-border-strong)', background: sel[i] ? 'var(--gb-brand-tint-medium)' : 'transparent', color: 'var(--gb-brand-label)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{sel[i] && <I.check size={10} />}</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{r.name}</span>
              <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}> · {r.account}</span>
            </div>
            <span style={{ fontSize: 10, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-tertiary)' }}>{r.orders} orders</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)' }}>{r.ytd}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 11 }}>
        <b style={{ color: 'var(--gb-brand-label)' }}>{count} selected</b>
        <span style={{ color: 'var(--gb-text-muted)' }}>of 3 results</span>
        <span style={{ flex: 1 }} />
        <Btn size="xs" variant="ghost" icon={<I.megaphone />}>Run campaign</Btn>
        <Btn size="xs" variant="ghost" icon={<I.mail />}>Email selected</Btn>
      </div>
    </MiniFrame>
  );
}

export function SearchPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Find People</div>
      <h1 className="title">CRM Search</h1>
      <p className="lede">
        Press <span className="kbd">Ctrl+K</span> anywhere. The search runs in two gears: as you type it
        filters your <strong>locally indexed</strong> contacts instantly; press <span className="kbd">Enter</span>
        and it runs a full <strong>server</strong> search. Enter on a highlighted row opens the record in a
        new tab.
      </p>

      <TourBox n={1} eyebrow="Results & selection" title="Rich rows, bulk actions" live={<SearchSnippet />} wide>
        <p>Result columns: Contact Name, Account Name, Account ID, Email, Phone, Sales Rep, Role, Order Count, YTD Revenue, Prior Year Revenue, Last Order Date, Next Task Date. Click a header to sort; server results load more as you scroll.</p>
        <p>Tick rows and the summary bar appears with <strong>Run campaign</strong>, <strong>Email selected</strong>, and <strong>Export CSV</strong>. Keyboard: <span className="kbd">Tab</span> from the input drops onto the first row; Tab/Shift+Tab walk rows (wrapping); <span className="kbd">Esc</span> returns to the input.</p>
      </TourBox>

      <h2 className="sec">The local index</h2>
      <p>
        The index is what makes repeat searches instant. After a server search, an <strong>"Index all N"</strong> button
        stores the results locally; a footer notes "Locally indexed — instant typeahead. Falls through to
        server on Enter", with a <strong>Clear index</strong> button beside it. Records you visit also index
        themselves automatically.
      </p>

      <div className="docnote info">
        <span className="dn-ico"><I.search size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Missing phone numbers</div>
          <p style={{ margin: 0 }}>When a contact has no phone but does have orders, the shelf offers <strong>Find phone</strong> — it scans their order pages, collects every number found (labeled with the shipping name it came from), and saves your pick to the contact.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════ QUERY BUILDER ════════ */

const QB_FIELDS = [
  ['Identity', 'Record Type (Contact / Account) · Sales Rep · Role (BDR / AE / CSM / SE / Manager) · Pod ID · Contact Name · Account Name · Account ID'],
  ['Contact', 'Email · Phone'],
  ['Activity', 'Order Count · Last Order Date · Next Task Date'],
  ['Revenue', 'Prior Year Revenue · YTD Revenue'],
];
const QB_OPS = [
  ['Text', 'is (exact) · contains · starts with · is set · is not set'],
  ['Enum', 'is · is not'],
  ['Number', '= ≠ > ≥ < ≤ · between · is set · is not set'],
  ['Date', 'more than … ago · less than … ago · within next … · before/after date · after/before today · is set / is not set'],
];
const PRESETS = [
  ['VIP accounts', 'High-revenue, frequent reorderers (order count ≥ 12, YTD ≥ $10,000)'],
  ['Stale leads', 'No order in 90 days, no task pending'],
  ['Recent reorder', 'Last order in the past 30 days'],
  ['Tournament prospects', 'AEs or BDRs with no recent contact'],
];

function ConditionSnippet() {
  const [not, setNot] = useState(false);
  const [op, setOp] = useState('>');
  return (
    <MiniFrame width={430} label="query builder · condition row" pad>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => setNot(!not)} style={{ cursor: 'pointer', padding: '4px 9px', borderRadius: 'var(--gb-r-pill)', border: '1px solid ' + (not ? 'var(--gb-error-tint-border)' : 'var(--gb-border-default)'), background: not ? 'var(--gb-error-tint-medium)' : 'var(--gb-surface-1)', color: not ? 'var(--gb-error-fg)' : 'var(--gb-text-muted)', fontFamily: 'inherit', fontSize: 10, fontWeight: 800 }}>NOT</button>
        <Tag tone="brand" size="sm">Order Count</Tag>
        <Tag tone="neutral" size="xs">activity</Tag>
        <Dropdown size="sm" value={op} onChange={setOp} options={['=', '≠', '>', '≥', '<', '≤', 'between'].map((o) => ({ id: o, label: o }))} style={{ width: 92 }} />
        <Input size="sm" mono value="5" onChange={() => {}} style={{ width: 64 }} />
      </div>
      <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', fontSize: 11, lineHeight: 1.6 }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginBottom: 3 }}>Human</div>
        <span style={{ color: 'var(--gb-text-secondary)' }}>{not ? 'NOT ' : ''}Order count {op} 5</span>
      </div>
    </MiniFrame>
  );
}

export function QBPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Find People</div>
      <h1 className="title">Query Builder</h1>
      <p className="lede">
        Open it from CRM Search's filter button. Grouped AND/OR/NOT conditions over the CRM's real
        fields, quick presets, saved queries — and two live previews so you always know exactly what
        you're asking for.
      </p>

      <TourBox n={1} eyebrow="Building a condition" title="Field + operator + value, with NOT" live={<ConditionSnippet />}>
        <p>Each condition row: an optional <strong>NOT</strong> pill, the field with its category tag, a type-aware operator, and the value editor. Conditions stack inside lettered groups (Group A, Group B…) with an AND/OR toggle inside each group and another between groups — e.g. <em>state is TX AND (order count &gt; 5 OR YTD &gt; $2,000)</em>.</p>
        <p>Two previews update as you build: <strong>HUMAN</strong> (plain English) and <strong>FQ</strong> (the compiled Solr filter), both copyable.</p>
      </TourBox>

      <h3 className="sub">The fields</h3>
      <table className="spectable">
        <thead><tr><th>Group</th><th>Fields</th></tr></thead>
        <tbody>{QB_FIELDS.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <h3 className="sub">Operators by value type</h3>
      <table className="spectable">
        <thead><tr><th>Type</th><th>Operators</th></tr></thead>
        <tbody>{QB_OPS.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <h3 className="sub">Built-in quick presets</h3>
      <table className="spectable">
        <thead><tr><th>Preset</th><th>Audience</th></tr></thead>
        <tbody>{PRESETS.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <div className="docnote brand">
        <span className="dn-ico"><I.megaphone size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Saved queries are campaign audiences</div>
          <p style={{ margin: 0 }}>Name a query and Save to reuse it; promote it (bolt icon) into the quick-presets list. Build the audience here, <em>verify it visually</em> in the results, then select-all and Run Campaign — the cleanest path to a precise send. Same grouped-condition logic as template rules and <a href="#campaigns">campaign branches</a>: learn it once, use it everywhere.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════ NEW CONTACT ════════ */

function NewContactSnippet() {
  const [account, setAccount] = useState('Acme Industries (#2188)');
  return (
    <MiniFrame width={380} label="new contact" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Account" required hint="Search and attach — required by default">
          <Input size="sm" value={account} onChange={setAccount} leading={<I.search />} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="First name"><Input size="sm" placeholder="Marcus" /></Field>
          <Field label="Last name"><Input size="sm" placeholder="Chen" /></Field>
        </div>
        <Field label="Email"><Input size="sm" placeholder="marcus@acme.com" leading={<I.mail />} /></Field>
        <Field label="Phone"><Input size="sm" placeholder="(512) 555-1234" leading={<I.phone />} /></Field>
        <Field label="Company"><Input size="sm" placeholder="Acme Industries" /></Field>
        <Btn full size="sm" variant="tinted" status="brand" icon={<I.user />}>Create contact</Btn>
      </div>
    </MiniFrame>
  );
}

export function NewPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Find People</div>
      <h1 className="title">New Contact</h1>
      <p className="lede">
        Press <span className="kbd">Ctrl+Q</span> anywhere (or use the shelf) and quick-create a CRM
        contact without leaving the page you're on.
      </p>

      <TourBox n={1} eyebrow="The whole form" title="Five fields and an account" live={<NewContactSnippet />}>
        <p>Search for and attach the <strong>account</strong>, then first name, last name, email, phone, and company. Create posts the contact straight to the CRM.</p>
        <p>That's deliberately all — anything richer belongs on the contact record afterwards. By default a contact <strong>must</strong> be attached to an account; admins can relax that under Developer Settings → "New Contact requires an account".</p>
      </TourBox>
    </div>
  );
}
