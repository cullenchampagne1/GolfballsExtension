import React from 'react';
import { I } from '../../ui/index.js';
import { LiveModal } from '../lib/live-modal.jsx';
import { CRMSearch } from '../../modals/CRMSearch.jsx';
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
export function SearchPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Find People</div>
      <h1 className="title">CRM Search</h1>
      <p className="lede">
        Press <span className="kbd">Ctrl+K</span> anywhere. The search runs in two gears: as you type it
        filters your <strong>locally indexed</strong> contacts instantly; press <span className="kbd">Enter</span>
        and it runs a full <strong>server</strong> search. The real modal is below on sample contacts —
        type, sort columns, tick rows for the bulk bar.
      </p>

      <LiveModal w={1000} h={640} frameLabel="crm search · sample contacts"
        note="The live CRM Search modal (sample data). Tick rows to reveal Run campaign / Email selected / Export."
        render={(box, onClosed) => <CRMSearch useMock contained portalContainer={box} onClosed={onClosed} />} />

      <h2 className="sec">Results, columns, and selection</h2>
      <p>Result columns: Contact Name, Account Name, Account ID, Email, Phone, Sales Rep, Role, Order Count, YTD Revenue, Prior Year Revenue, Last Order Date, Next Task Date. Click a header to sort; server results load more as you scroll. Tick rows and the summary bar appears with <strong>Run campaign</strong>, <strong>Email selected</strong>, and <strong>Export CSV</strong>. Keyboard: <span className="kbd">Tab</span> from the input drops onto the first row; Tab/Shift+Tab walk rows (wrapping); <span className="kbd">Esc</span> returns to the input.</p>

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
