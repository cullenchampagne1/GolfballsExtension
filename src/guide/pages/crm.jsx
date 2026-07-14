import React, { useState } from 'react';
import { I, Tag, Input } from '../../ui/index.js';
import { LiveStage } from '../lib/stage.jsx';
import { TourBox, MiniFrame } from '../lib/tourbox.jsx';
import {
  CRMSearchLive, ResultRow, TableHeader, Toolbar as CSToolbar, SelectionBar, MOCK_RESULTS,
} from '../lib/crmsearch-live.jsx';
import { QuickSendPanel } from '../lib/quicksend-live.jsx';

/* ───────────────────────────────────────────────────────────────
   crm.jsx — Find People pages. Each leads with the REAL modal on
   sample data, then the reference tables (fields, operators,
   presets) from the verified articles. The design mockup's invented
   fields are deliberately absent — the live modal shows the real
   schema.
─────────────────────────────────────────────────────────────── */

/* ════════ CRM SEARCH ════════ */
const CS_CALLOUTS = [
  { n: 1, target: 'toolbar', title: 'Query bar', text: 'Type to filter the local index; the Type dropdown narrows to Contacts/Accounts. Query Builder + Search sit beside it.' },
  { n: 2, target: 'sortheader', title: 'Sortable columns', text: 'Name, Account, Type, Orders, YTD, PY, Last Order — click a header to sort.' },
  { n: 3, target: 'row', title: 'A result row', text: 'Name, account, a Contact/Account tag, email, and the revenue + order stats.' },
  { n: 4, target: 'footer', title: 'The local index', text: 'Indexed for instant typeahead; Enter falls through to a full server search.' },
];
const CS_STEPS = [
  { target: 'toolbar', caption: 'Press Ctrl+K anywhere. Type to filter your locally indexed contacts instantly — narrow to just Contacts…', run: (api) => api.setType('contact'), hold: 2600 },
  { target: 'toolbar', caption: '…or back to all types. Enter runs a full server search; Query Builder adds structured filters.', run: (api) => api.setType('all'), hold: 1800 },
  { target: 'sortheader', caption: 'Click a column to sort — YTD Revenue puts your biggest accounts on top.', run: (api) => api.onSort('yearToDateRevenue_f'), hold: 2400 },
  { target: 'row', caption: 'Each row: the name, its account, a Contact / Account tag, email, and the order + revenue stats.', hold: 2800 },
  { target: 'header', caption: 'Tick rows to select them…', run: (api) => api.selectN(3), hold: 1600 },
  { target: 'selbar', caption: '…and the selection bar gives you Run campaign, Email selected, and Export CSV across all of them.', hold: 3000 },
];

function ToolbarSnippet() {
  const [query, setQuery] = useState('');
  const [typeFilter, setType] = useState('all');
  return (
    <MiniFrame width={560} label="crm search · query bar" pad={false}>
      <CSToolbar {...{ query, setQuery, typeFilter, setType }} />
    </MiniFrame>
  );
}

function ResultsSnippet() {
  const [rows] = useState(() => MOCK_RESULTS.slice(0, 4));
  const [sel, setSel] = useState(new Set([rows[0].id]));
  return (
    <MiniFrame width={900} label="crm search · results" pad={false}>
      <div style={{ background: 'var(--gb-surface-canvas)' }}>
        <TableHeader allChecked={false} onToggleAll={() => {}} sortKey="yearToDateRevenue_f" sortDir="desc" onSort={() => {}} />
        <div style={{ padding: '4px 0' }}>
          {rows.map((r) => <ResultRow key={r.id} row={r} isSelected={sel.has(r.id)} onToggle={() => setSel((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />)}
        </div>
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
        and it runs a full <strong>server</strong> search. Watch it work below, then read each piece beside
        its live control.
      </p>

      <LiveStage
        wide
        width={1000}
        frameKind="modal"
        frameLabel="golfballs.com · crm search"
        render={(apiRef) => <CRMSearchLive ref={apiRef} />}
        callouts={CS_CALLOUTS}
        steps={CS_STEPS}
        note="Live CRM Search on sample contacts — hover the pins, press Play, or Try it yourself."
      />

      <h2 className="sec">Walk through it, piece by piece</h2>
      <p>Each block pairs the real control with what it does. The snippets are live.</p>

      <TourBox n={1} eyebrow="Find" title="The query bar" live={<ToolbarSnippet />} flip>
        <p>As you type, the search filters your <strong>locally indexed</strong> contacts instantly (the placeholder says so). The <strong>Type</strong> dropdown narrows to Contacts or Accounts; <strong>Query Builder</strong> adds structured filters; <strong>Search</strong> (or Enter) runs a full server query.</p>
        <p>Keyboard: <span className="kbd">Tab</span> from the input drops onto the first row, Tab/Shift+Tab walk rows (wrapping), <span className="kbd">Esc</span> returns to the input, and Enter on a row opens it in a new tab.</p>
      </TourBox>

      <TourBox stack eyebrow="The results" title="Columns, sorting & selection" live={<ResultsSnippet />}>
        <p>Columns: <strong>Name</strong>, <strong>Account</strong>, a <strong>Type</strong> tag (<Tag tone="info" size="xs">Contact</Tag> / <Tag tone="brand" size="xs">Account</Tag>), <strong>Email</strong>, <strong>Orders</strong>, <strong>YTD Rev</strong>, <strong>PY Rev</strong>, and <strong>Last Order</strong>. Click any header to sort (the snippet above is sorted by YTD Revenue, descending). Server results load more as you scroll.</p>
        <p>Tick a row's checkbox (or the header's) to select. The full field set — including Account ID, Phone, Sales Rep, Role, Pod ID, and Next Task Date — is what the <a href="#crm-query">Query Builder</a> filters on.</p>
      </TourBox>

      <TourBox n={2} eyebrow="Act on many" title="Selection & bulk actions" live={<MiniFrame width={560} label="crm search · selection bar" pad={false}><SelectionBar selCount={3} total={6} /></MiniFrame>} flip>
        <p>Tick rows and the selection bar slides in: <strong>Run campaign</strong> builds the selected-contact audience and opens the Campaign Manager, <strong>Email selected</strong> opens the bulk runner, and <strong>Export CSV</strong> downloads them — each acting on every checked row.</p>
      </TourBox>

      <TourBox n={3} eyebrow="Email selected → Quick Send" title="Bulk email, with a progress ring" live={<QuickSendPanel contactCount={3} />} wide>
        <p><strong>Email selected</strong> opens the <strong>Quick Send</strong> runner over your checked contacts. Press <strong>Run</strong> in the panel — it's live — and watch the three phases:</p>
        <ul>
          <li><strong>Setup</strong> — pick the email template (with weighted variation splits when it has variations) and the <strong>delay between sends</strong> (a random range, so a blast looks human).</li>
          <li><strong>Running</strong> — the ring fills to a live %, a “Now sending” card shows the current contact, and a pacing line counts down between sends; sent / queued chips track the run.</li>
          <li><strong>Done</strong> — a checkmark burst, then stat tiles (Sent, Success %, Elapsed) and a per-contact timeline. Send again or Close.</li>
        </ul>
        <p>Each contact opens in a background tab, its variables resolve against that contact's real data, the email sends, the tab closes — so every recipient gets genuinely personalized content. <em>Keep Power Automate on for a real blast; off, each send opens an Outlook window instead.</em> The same runner powers <a href="#tasks">Task List</a>'s Email selected. Full detail on the <a href="#quicksend">Quick Send</a> page.</p>
      </TourBox>

      <div className="docnote info">
        <span className="dn-ico"><I.search size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">The local index, and missing phones</div>
          <p style={{ margin: 0 }}>After a server search, <strong>“Index all N”</strong> stores the results locally for instant typeahead (the footer notes it, with a <strong>Clear index</strong> button); records you visit index themselves too. And when a contact has no phone but does have orders, the shelf's <strong>Find phone</strong> scans their order pages for one.</p>
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

/* ── Scaled-down Query Builder: a faithful, wide reproduction of the
   grouped condition builder + presets + live previews. data-demo
   targets drive the LiveStage Tour pins + Play walkthrough. ── */
function QbToken({ children, kind }) {
  const tone = kind === 'field' ? 'var(--gb-info-tint-soft, var(--gb-fill-subtle))'
    : kind === 'op' ? 'var(--gb-fill-subtle)' : 'var(--gb-brand-tint-soft)';
  const bd = kind === 'value' ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)';
  const col = kind === 'value' ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)';
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 9px', borderRadius: 'var(--gb-r-sm)', background: tone, border: `1px solid ${bd}`, fontSize: 11, fontWeight: 600, color: col, fontFamily: kind === 'value' ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)' }}>{children}</span>;
}
function QbBuilderDemo() {
  const cond = (f, o, v) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-sm)' }}>
      <QbToken kind="field">{f}</QbToken><QbToken kind="op">{o}</QbToken><QbToken kind="value">{v}</QbToken>
      <span style={{ marginLeft: 'auto', color: 'var(--gb-text-ghost)' }}><I.trash size={12} /></span>
    </div>
  );
  return (
    <div style={{ width: 760, background: 'var(--gb-surface-modal)', borderRadius: 'var(--gb-r-md)', border: '1px solid var(--gb-border-default)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
        <span style={{ width: 22, height: 22, borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><I.filter size={12} /></span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Query Builder</span>
        <span data-demo="qb-save" style={{ fontSize: 10, fontWeight: 600, padding: '4px 9px', borderRadius: 'var(--gb-r-sm)', border: '1px solid var(--gb-border-default)', color: 'var(--gb-text-secondary)' }}>Save query</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 11px', borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)' }}>Run</span>
      </div>
      <div style={{ padding: '11px 13px' }}>
        <div data-demo="qb-presets" style={{ display: 'flex', gap: 6, marginBottom: 11, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', alignSelf: 'center' }}>Presets</span>
          {['VIP accounts', 'Stale leads', 'Recent reorder', 'Tournament prospects'].map((p, i) => (
            <span key={p} style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--gb-r-pill)', background: i === 0 ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)', border: '1px solid ' + (i === 0 ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'), color: i === 0 ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}>{p}</span>
          ))}
        </div>
        <div style={{ border: '1px dashed var(--gb-border-strong)', borderRadius: 'var(--gb-r-md)', padding: 10 }}>
          <div data-demo="qb-joiner" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            <div style={{ display: 'inline-flex', padding: 2, gap: 2, background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)' }}>
              {['AND', 'OR'].map((j) => <span key={j} style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 9px', borderRadius: 3, background: j === 'AND' ? 'var(--gb-brand-tint-medium)' : 'transparent', color: j === 'AND' ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}>{j}</span>)}
            </div>
            <span style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>match all conditions in this group</span>
            <span data-demo="qb-not" style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--gb-r-pill)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)', color: 'var(--gb-text-muted)' }}>NOT</span>
          </div>
          <div data-demo="qb-condition" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {cond('Order count', '≥', '12')}
            {cond('YTD Revenue', '≥', '$10,000')}
            {cond('Last Order Date', 'within the last', '90 days')}
          </div>
          <div data-demo="qb-addgroup" style={{ display: 'flex', gap: 8, marginTop: 9 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gb-brand-label)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><I.plus size={11} /> Add condition</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gb-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><I.plus size={11} /> Add group</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
          <div data-demo="qb-human" style={{ flex: 1, background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)', padding: '8px 10px' }}>
            <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginBottom: 5 }}>Human</div>
            <div style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--gb-text-secondary)' }}>Contacts where order count is at least 12, <b>and</b> YTD revenue is at least $10,000, <b>and</b> last order was within the last 90 days.</div>
          </div>
          <div data-demo="qb-fq" style={{ flex: 1, background: 'var(--gb-surface-deep)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)', padding: '8px 10px' }}>
            <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginBottom: 5 }}>Solr · fq</div>
            <div style={{ fontSize: 9.5, lineHeight: 1.6, color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)', wordBreak: 'break-all' }}>orderCount_i:[12 TO *] AND ytdRev_f:[10000 TO *] AND lastOrder_dt:[NOW-90DAYS TO *]</div>
          </div>
        </div>
      </div>
    </div>
  );
}
const QB_CALLOUTS = [
  { n: 1, target: 'qb-presets', title: 'Quick presets', text: 'One-click starting points (VIP accounts, Stale leads, Recent reorder, Tournament prospects). Pick one, then refine — or build from scratch.' },
  { n: 2, target: 'qb-joiner', title: 'AND / OR joiner', text: 'Each group matches ALL of its conditions (AND) or ANY of them (OR). Toggle it per group.' },
  { n: 3, target: 'qb-not', title: 'NOT', text: 'Negate the whole group — “none of these” — for exclusion filters.' },
  { n: 4, target: 'qb-condition', title: 'A condition', text: 'Field + operator + value. The operators adapt to the field type: text (is / contains / is set), number (= ≠ > between), date (within the last / before / after today).' },
  { n: 5, target: 'qb-addgroup', title: 'Add condition / group', text: 'Stack more conditions, or nest a sub-group to mix AND and OR — the same grouped logic as template rules and campaign branches.' },
  { n: 6, target: 'qb-human', title: 'Human preview', text: 'A plain-English read-out of the query so you can sanity-check it before running.' },
  { n: 7, target: 'qb-fq', title: 'Solr (fq) preview', text: 'The exact Solr filter query it compiles to — what actually runs against the index.' },
  { n: 8, target: 'qb-save', title: 'Save query', text: 'Name and save it to reuse; promote it into the presets list. A saved query is a reusable campaign audience.' },
];
const QB_STEPS = [
  { target: 'qb-presets', caption: 'Start from a preset like “VIP accounts,” or build from scratch.', hold: 2400 },
  { target: 'qb-condition', caption: 'Each condition is field + operator + value — operators adapt to the field type.', hold: 2800 },
  { target: 'qb-joiner', caption: 'The group joiner decides AND (match all) vs OR (match any)…', hold: 2200 },
  { target: 'qb-not', caption: '…and NOT negates the whole group for exclusions.', hold: 2000 },
  { target: 'qb-addgroup', caption: 'Add more conditions, or nest groups to mix AND and OR.', hold: 2200 },
  { target: 'qb-human', caption: 'The Human preview reads the query back in plain English…', hold: 2400 },
  { target: 'qb-fq', caption: '…and the Solr fq preview shows exactly what runs against the index.', hold: 2400 },
  { target: 'qb-save', caption: 'Save it to reuse — a saved query becomes a reusable campaign audience.', hold: 2400 },
];

export function QBPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Find People</div>
      <h1 className="title">Query Builder</h1>
      <p className="lede">
        Open it from CRM Search's filter button. Grouped AND/OR/NOT conditions over the CRM's real
        fields, quick presets, saved queries — with live HUMAN and Solr previews. Below is a scaled view —
        hover the numbered pins (Tour), press Play for a walkthrough, or switch to Try it.
      </p>

      <LiveStage
        width={760}
        frameKind="modal"
        legend="bottom"
        frameLabel="crm · query builder"
        render={() => <QbBuilderDemo />}
        callouts={QB_CALLOUTS}
        steps={QB_STEPS}
        note="A scaled view of the builder; the explanation sits below to give the wide builder the full row. The real builder is the same, full size."
      />

      <h2 className="sec">The fields</h2>
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
/* Every field in the real CRMCreateContact form, grouped by its four
   sections, so the whole variable set is scannable at a glance even
   though the live modal scrolls. */
const NC_CONTACT = [
  ['First name', 'Yes', 'The contact’s given name.'],
  ['Last name', 'Yes', 'The contact’s surname.'],
  ['Email', 'Yes', 'Primary email — the address your templates send to.'],
  ['Phone', 'No', 'Direct line (formats as you type).'],
  ['Job title', 'No', 'e.g. “Purchasing manager” — feeds segmentation.'],
  ['Company', 'No', 'Company name on the contact record (distinct from the linked account).'],
];
const NC_ACCOUNT = [
  ['Account', 'Yes*', 'Search and LINK an existing CRM account, or type a brand-new name to CREATE one on submit. *Required unless the require-account dev setting is off.'],
  ['Account website', 'New only', 'The web address of a NEW account — required only while you’re creating one. Auto-filled and locked (“linked — website on file”) when you link an existing account.'],
  ['LinkedIn URL', 'No', 'The contact or company LinkedIn profile.'],
  ['Address · City · Postal', 'No', 'The account’s mailing location (three fields on one row).'],
  ['Country', 'No', 'Country dropdown.'],
];
const NC_SEG = [
  ['Industry', 'No', 'Searchable dropdown — the account’s industry.'],
  ['Employee range', 'No', 'Company-size bracket.'],
  ['Est. revenue', 'No', 'Estimated annual-revenue bracket.'],
  ['Customer type', 'No', 'How the account is classified.'],
  ['Territory', 'No', 'Sales territory (searchable).'],
  ['Campaign', 'No', 'The source / marketing campaign (searchable).'],
];
const NC_SOURCE = [
  ['Source details', 'No', 'Free text — where the lead came from (e.g. “PGA Show 2026 — booth visit”).'],
  ['Flags', 'No', 'Quick-classification chips: Consumer · Custom · Rep · One-to-One · Retail · Delay.'],
];
const NC_DEV = [
  ['crmCreateContact.requireAccount', 'On', 'Blocks Create until an account is selected or typed. Creating a contact with no account is allowed by the API but is bad practice — turn this OFF to override. (When on, a new account also makes Account website required.)'],
  ['crmCreateContact.draggable', 'On', 'On = the modal is a draggable tool window you can reposition and that stays open. Off = it sits centered and closes on an outside click.'],
  ['crmCreateContact.useMock', 'Off', 'Bypasses the live CRM endpoints (account search + create) and uses canned data + fake success responses — for previews or when the API is down. The modal auto-mocks anyway when it isn’t running inside the extension.'],
];

function NcFieldTable({ rows }) {
  return (
    <table className="spectable">
      <thead><tr><th style={{ width: 168 }}>Field</th><th style={{ width: 92 }}>Required</th><th>What it is</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
    </table>
  );
}

/* Faithful account-autocomplete snippet: toggles between SEARCHING
   (live results + a "create new" footer) and LINKED (existing account
   attached, website locked) so both halves of the account flow show. */
function AccountFlowSnippet() {
  const [mode, setMode] = useState('search'); // 'search' | 'linked'
  const results = [
    ['Acme Industries', 'San Francisco, CA · 142 orders'],
    ['Acme Golf Outfitters', 'Austin, TX · 18 orders'],
  ];
  return (
    <MiniFrame width={340} label="new contact · account" pad>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {[['search', 'Type a name'], ['linked', 'Linked existing']].map(([id, lbl]) => (
          <button key={id} onClick={() => setMode(id)} style={{ flex: 1, fontSize: 10.5, fontWeight: 600, padding: '5px 8px', borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', border: '1px solid ' + (mode === id ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'), background: mode === id ? 'var(--gb-brand-tint-soft)' : 'transparent', color: mode === id ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}>{lbl}</button>
        ))}
      </div>
      {mode === 'search' ? (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gb-text-muted)', marginBottom: 4 }}>Account <span style={{ color: 'var(--gb-error-fg)' }}>*</span></div>
          <Input size="sm" value="Acme" onChange={() => {}} />
          <div style={{ marginTop: 4, border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)', overflow: 'hidden', background: 'var(--gb-surface-modal)', boxShadow: 'var(--gb-shadow-popover)' }}>
            {results.map(([n, sub], i) => (
              <div key={n} style={{ padding: '7px 9px', borderBottom: '1px solid var(--gb-border-subtle)', background: i === 0 ? 'var(--gb-fill-subtle)' : 'transparent' }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{n}</div>
                <div style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>{sub}</div>
              </div>
            ))}
            <div style={{ padding: '7px 9px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--gb-brand-label)' }}>
              <I.plus size={11} /> <span style={{ fontSize: 11, fontWeight: 600 }}>Create new account “Acme”</span>
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 8 }}>Account website <span style={{ color: 'var(--gb-error-fg)' }}>*</span></div>
          <Input size="sm" value="" onChange={() => {}} placeholder="https://acme.com" />
        </>
      ) : (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gb-text-muted)', marginBottom: 4 }}>Account · linked</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', borderRadius: 'var(--gb-r-sm)', border: '1px solid var(--gb-brand-tint-border)', background: 'var(--gb-brand-tint-soft)' }}>
            <I.check size={13} style={{ color: 'var(--gb-brand-label)' }} />
            <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>Acme Industries</span>
            <I.close size={12} style={{ color: 'var(--gb-text-muted)' }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 8 }}>Account website · linked</div>
          <div style={{ padding: '7px 9px', borderRadius: 'var(--gb-r-sm)', border: '1px solid var(--gb-border-subtle)', background: 'var(--gb-fill-subtle)', fontSize: 11, color: 'var(--gb-text-muted)', fontStyle: 'italic' }}>Linked — website on file</div>
        </>
      )}
    </MiniFrame>
  );
}

/* ── Scaled-down New Contact form: every field of all four sections on
   one screen (no scroll), so the whole variable set reads at a glance.
   data-demo targets drive the LiveStage Tour pins + Play walkthrough. ── */
function NcSec({ children }) {
  return <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.9, textTransform: 'uppercase', color: 'var(--gb-text-tertiary)', margin: '11px 0 5px' }}>{children}</div>;
}
function NcFld({ label, val, ph, req, demo }) {
  return (
    <div data-demo={demo} style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--gb-text-muted)', marginBottom: 3 }}>{label}{req && <span style={{ color: 'var(--gb-error-fg)' }}> *</span>}</div>
      <div style={{ height: 23, borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-surface-2)', border: '1px solid ' + (req && !val ? 'var(--gb-error-tint-border, var(--gb-border-default))' : 'var(--gb-border-default)'), display: 'flex', alignItems: 'center', padding: '0 7px', fontSize: 9.5, color: val ? 'var(--gb-text-secondary)' : 'var(--gb-text-ghost)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{val || ph}</div>
    </div>
  );
}
const NcRow = ({ children }) => <div style={{ display: 'flex', gap: 6, marginBottom: 5 }}>{children}</div>;

function NcFormDemo() {
  return (
    <div style={{ width: 520, background: 'var(--gb-surface-modal)', borderRadius: 'var(--gb-r-md)', border: '1px solid var(--gb-border-default)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
        <span style={{ width: 22, height: 22, borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><I.user size={12} /></span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>New Contact</span>
        <I.close size={12} style={{ color: 'var(--gb-text-muted)' }} />
      </div>
      <div style={{ padding: '6px 13px 12px' }}>
        <NcSec>Contact</NcSec>
        <div data-demo="nc-contact">
          <NcRow><NcFld label="First name" ph="First name" req /><NcFld label="Last name" ph="Last name" req /><NcFld label="Email" ph="name@example.com" req /></NcRow>
          <NcRow><NcFld label="Phone" ph="(415) 555-0100" /><NcFld label="Job title" ph="Purchasing manager" /><NcFld label="Company" ph="Acme Industries" /></NcRow>
        </div>
        <NcSec>Account &amp; Location</NcSec>
        <NcRow><NcFld demo="nc-account" label="Account" val="Acme Industries" req /><NcFld demo="nc-website" label="Account website" ph="https://acme.com" req /><NcFld label="LinkedIn URL" ph="linkedin.com/in/…" /></NcRow>
        <NcRow><NcFld label="Address" ph="482 Brannan St #310" /><NcFld label="City" ph="San Francisco" /><NcFld label="Postal" ph="94107" /></NcRow>
        <NcRow><NcFld label="Country" val="United States" /><div style={{ flex: 2 }} /></NcRow>
        <NcSec>Segmentation &amp; Assignment</NcSec>
        <div data-demo="nc-seg">
          <NcRow><NcFld label="Industry" ph="Select…" /><NcFld label="Employee range" ph="Select…" /><NcFld label="Est. revenue" ph="Select…" /></NcRow>
          <NcRow><NcFld label="Customer type" ph="Select…" /><NcFld label="Territory" ph="Select…" /><NcFld label="Campaign" ph="Select…" /></NcRow>
        </div>
        <NcSec>Source &amp; Flags</NcSec>
        <div data-demo="nc-source">
          <NcFld label="Source details" ph="PGA Show 2026 — booth visit" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            {['Consumer', 'Custom', 'Rep', 'One-to-One', 'Retail', 'Delay'].map((f) => (
              <span key={f} style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)', color: 'var(--gb-text-muted)' }}>{f}</span>
            ))}
          </div>
        </div>
        <div data-demo="nc-create" style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 11 }}>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '5px 11px', borderRadius: 'var(--gb-r-sm)', border: '1px solid var(--gb-border-default)', color: 'var(--gb-text-muted)' }}>Cancel</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '5px 13px', borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)' }}>Create</span>
        </div>
      </div>
    </div>
  );
}

const NC_CALLOUTS = [
  { n: 1, target: 'nc-contact', title: 'Contact basics', text: 'First name, Last name, and Email are required. Phone, Job title, and Company are optional but feed segmentation.' },
  { n: 2, target: 'nc-account', title: 'Account — link OR create', text: 'Type to search existing accounts and pick one to LINK; type a brand-new name and leave it unpicked to CREATE a new account on Create.' },
  { n: 3, target: 'nc-website', title: 'Account website', text: 'Required only when you’re creating a NEW account. Auto-filled and locked (“linked — website on file”) when you link an existing account.' },
  { n: 4, target: 'nc-seg', title: 'Segmentation & assignment', text: 'Industry, employee range, est. revenue, customer type, territory, and campaign — all optional, used to filter and target later.' },
  { n: 5, target: 'nc-source', title: 'Source & flags', text: 'Free-text source (where the lead came from) plus quick classification chips: Consumer · Custom · Rep · One-to-One · Retail · Delay.' },
  { n: 6, target: 'nc-create', title: 'Create', text: 'Posts the contact — and any brand-new account — straight to the CRM. Account is required by default (a dev setting can relax it).' },
];
const NC_STEPS = [
  { target: 'nc-contact', caption: 'Start with the basics — First name, Last name, and Email are the only always-required fields.', hold: 2400 },
  { target: 'nc-account', caption: 'The Account field does double duty: search to LINK an existing account, or type a new name to CREATE one.', hold: 2800 },
  { target: 'nc-website', caption: 'Creating a new account? Its website is required (it locks to “linked” when you attach an existing account instead).', hold: 2600 },
  { target: 'nc-seg', caption: 'Segmentation is all optional — industry, size, revenue, type, territory, campaign — but it makes the record filterable.', hold: 2600 },
  { target: 'nc-source', caption: 'Note where the lead came from and tag it with the quick flag chips.', hold: 2200 },
  { target: 'nc-create', caption: 'Create posts the contact (and any new account) to the CRM — no page reload, no lost place.', hold: 2400 },
];

export function NewPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Find People</div>
      <h1 className="title">New Contact</h1>
      <p className="lede">
        Press <span className="kbd">Ctrl+Q</span> anywhere (or use the shelf) to quick-create a CRM contact
        without leaving the page you’re on — and, in the same step, <strong>link it to an existing account or
        create a brand-new one</strong>. Below is a scaled view of the whole form with every field on one screen —
        hover the numbered pins (Tour), press Play for a walkthrough, or switch to Try it.
      </p>

      <LiveStage
        width={520}
        frameKind="modal"
        legend="left"
        frameLabel="crm · new contact"
        render={() => <NcFormDemo />}
        callouts={NC_CALLOUTS}
        steps={NC_STEPS}
        note="A scaled view so all four sections fit without scrolling — the real form is the same fields, full size."
      />

      <h2 className="sec">It creates two things: a contact AND an account</h2>
      <p>
        The <strong>Account</strong> field (top of the second section) is the heart of the form, and it does double duty.
        As you type, it runs a <strong>live autocomplete</strong> against the CRM’s accounts:
      </p>
      <ul>
        <li><strong>Pick a match</strong> to <strong>link</strong> the contact to that existing account. The field flips to “Account · linked,” and <strong>Account website</strong> locks to “linked — website on file” (the CRM already has it).</li>
        <li><strong>Type a name nobody matches</strong> and leave it un-picked — on Create, the CRM <strong>makes a new account</strong> with that name. Because a new account needs a web address, <strong>Account website becomes required</strong> (red outline until filled).</li>
      </ul>
      <p>
        So one Create can spin up a fresh account <em>and</em> its first contact together, or attach a contact to an account you already do business with. If account search ever fails (server hiccup), it falls back to a plain text field and still lets you submit — you just type the name by hand.
      </p>

      <TourBox n={1} eyebrow="The account field" title="Link existing · or create new" live={<AccountFlowSnippet />} flip>
        <p>Toggle the snippet between the two states. <strong>Type a name</strong> shows the live results dropdown — each row is a real account (name + city + order count); the last row is always <strong>“Create new account …”</strong>. Pick a result and you <strong>link</strong>; ignore them and you <strong>create</strong>.</p>
        <p><strong>Linked existing</strong> shows the resolved state: a green “Account · linked” chip (with an × to unlink) and the website field greyed to “linked — website on file.” Only a <em>new</em> account requires you to enter a website.</p>
      </TourBox>

      <h2 className="sec">Every field, by section</h2>
      <p>The form is four sections. The three Contact fields and the Account field are the only required ones (account is gated by a dev setting — see below); everything else is optional segmentation that makes the record richer for later filtering and campaigns.</p>

      <h3 className="sub">1 · Contact</h3>
      <NcFieldTable rows={NC_CONTACT} />
      <h3 className="sub">2 · Account &amp; Location</h3>
      <NcFieldTable rows={NC_ACCOUNT} />
      <h3 className="sub">3 · Segmentation &amp; Assignment</h3>
      <NcFieldTable rows={NC_SEG} />
      <h3 className="sub">4 · Source &amp; Flags</h3>
      <NcFieldTable rows={NC_SOURCE} />

      <h2 className="sec">Developer settings for New Contact</h2>
      <p>Three registry knobs change how this modal behaves. They live in <a href="#settings">Settings</a> → Developer settings and may be centrally managed by the authenticated administrator policy.</p>
      <table className="spectable">
        <thead><tr><th style={{ width: 250 }}>Setting</th><th style={{ width: 70 }}>Default</th><th>What it does</th></tr></thead>
        <tbody>{NC_DEV.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
      </table>

      <div className="docnote info" style={{ marginTop: 18 }}>
        <span className="dn-ico"><I.user size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Why account is required by default</div>
          <p style={{ margin: 0 }}>A contact with no account floats free in the CRM — it won’t roll up under a company, show on an account’s contact list, or inherit territory/rep. That’s why <strong>require account</strong> ships <strong>on</strong>. Turn it off (Developer settings) only for deliberate one-off contacts; you can always attach an account on the record afterwards.</p>
        </div>
      </div>
    </div>
  );
}
