import React, { useState } from 'react';
import { I, Tag } from '../../ui/index.js';
import { LiveModal } from '../lib/live-modal.jsx';
import { LiveStage } from '../lib/stage.jsx';
import { TourBox, MiniFrame } from '../lib/tourbox.jsx';
import {
  CRMSearchLive, ResultRow, TableHeader, Toolbar as CSToolbar, SelectionBar, MOCK_RESULTS,
} from '../lib/crmsearch-live.jsx';
import { QueryBuilder } from '../../modals/QueryBuilder.jsx';
import { CRMCreateContact } from '../../modals/CRMCreateContact.jsx';

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

export function QBPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Find People</div>
      <h1 className="title">Query Builder</h1>
      <p className="lede">
        Open it from CRM Search's filter button. Grouped AND/OR/NOT conditions over the CRM's real
        fields, quick presets, saved queries — with live HUMAN and Solr previews. The real builder is
        below: add a condition, toggle NOT, watch the previews update.
      </p>

      <LiveModal w={1080} h={620} frameLabel="query builder · live"
        note="The live Query Builder. Build a condition; the HUMAN and FQ previews compile as you go."
        render={(box, onClosed) => <QueryBuilder contained portalContainer={box} onClosed={onClosed} />} />

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
export function NewPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Find People</div>
      <h1 className="title">New Contact</h1>
      <p className="lede">
        Press <span className="kbd">Ctrl+Q</span> anywhere (or use the shelf) and quick-create a CRM
        contact without leaving the page you're on. The real form is below.
      </p>

      <LiveModal w={720} h={560} frameLabel="new contact · live"
        note="The live New Contact modal. Search an account to attach, then fill the basics."
        render={(box, onClosed) => <CRMCreateContact contained portalContainer={box} onClosed={onClosed} />} />

      <h2 className="sec">The whole form</h2>
      <p>Search for and attach the <strong>account</strong>, then first name, last name, email, phone, and company. Create posts the contact straight to the CRM. That's deliberately all — anything richer belongs on the contact record afterwards. By default a contact <strong>must</strong> be attached to an account; admins can relax that under Developer Settings → "New Contact requires an account".</p>
    </div>
  );
}
