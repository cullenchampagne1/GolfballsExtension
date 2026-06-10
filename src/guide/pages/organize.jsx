import React from 'react';
import { I, Tag } from '../../ui/index.js';
import { LiveModal } from '../lib/live-modal.jsx';
import { WatchList } from '../../modals/WatchList.jsx';
import { TaskList } from '../../modals/TaskList.jsx';
import { QuickTask } from '../../modals/QuickTask.jsx';
import { CallLog } from '../../modals/CallLog.jsx';
import { CalendarModal } from '../../modals/CalendarModal.jsx';

/* ───────────────────────────────────────────────────────────────
   organize.jsx — Stay Organized pages. Each leads with the REAL
   modal component mounted live (contained + scaled) on sample data,
   followed by reference prose/tables from the verified articles.
─────────────────────────────────────────────────────────────── */

const demoSubmit = async () => ({ ok: true });

const TASK_CATEGORIES = ['Other', 'Order History Special', 'Proposal Follow-up', 'Order day call', 'Customer Request', 'High Priority', '15 Day Call/Email', '5 Day Follow-Up to Email', 'Workflow Task', 'Courier Claims', 'High Priority Opportunity', 'Replacement Contact'];
const CALL_CATEGORIES = ['Product Question', 'Order Status', 'Place Order', 'Transfer', 'Order Payment', 'Turnaround Time', 'Art', 'Prior Year Followup', 'Returning VoiceMail', 'Tournament Lead', 'Form Lead Followup', 'General Question', 'Order Issues', 'CSR Backup', 'Discovery', 'Opportunity', 'Returns/Reprints', 'Charge Error', 'Fraud Inquiry', 'International Orders', 'Profanity', 'Order Change', 'Cancelation', 'Website Concerns'];

function CatGrid({ items }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{items.map((c) => <Tag key={c} tone="neutral" size="xs">{c}</Tag>)}</div>;
}

function ComposerKeysTable({ submitLabel }) {
  const rows = [
    ['/', 'Open the composer / token menu (categories, priorities, …)'],
    ['word + space', 'Snap a recognized word into its chip (try “high ” in the modal above)'],
    ['1–9', 'Fire the Nth filtered template'],
    ['↑ ↓ · Enter', 'Walk the filtered list · pick'],
    ['Shift+Enter', 'Load the highlighted template into the composer to tweak first'],
    ['Tab / Shift+Tab', 'Subject → Note → Due → buttons, and back'],
    ['Enter', submitLabel],
    ['Backspace on empty Subject', 'Remove the last chip'],
    ['Esc', 'Back to filter mode'],
  ];
  return (
    <table className="spectable">
      <thead><tr><th>Key</th><th>Action</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r[0]}><td><span className="kbd">{r[0]}</span></td><td>{r[1]}</td></tr>)}</tbody>
    </table>
  );
}

/* ════════ WATCH LIST ════════ */
export function WatchListPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Stay Organized</div>
      <h1 className="title">Watch List</h1>
      <p className="lede">
        Your private, cross-session list of orders and contacts to keep an eye on. Watch something from
        the popup's TRACKING section or the shelf, and it lands here with a link back to where it came
        from. It's local to your browser — nothing reaches the CRM or teammates. Below is the real
        modal on sample data — tick items, edit them, switch the filter chips.
      </p>

      <LiveModal w={560} h={560} frameLabel="watch list · sample data"
        note="The live Watch List modal. One item is 7h old, so its stripe is red and the header tints."
        render={(box, onClosed) => <WatchList contained portalContainer={box} onClosed={onClosed} />} />

      <h2 className="sec">Reading a row</h2>
      <p>The colored stripe on the left tracks <strong>how long the item has been waiting</strong>: nothing under 1 hour, blue at 1–4h, amber at 4–6h, <strong>red at 6h+</strong> — and once anything goes red, the modal header tints red and the popup's Watch List badge starts pulsing. Each row has the priority dot + title, the context line (<em>Order #…</em>, <em>Contact #… · Name</em>, or <em>Standalone</em>) with the due date, and the item's age on the right; hovering swaps the age for Edit and Remove.</p>
      <ul>
        <li><strong>Filter chips</strong> — All / Active / High priority / Completed, each with a live count; the search box matches title, context, and due date.</li>
        <li><strong>Watch button</strong> — opens the inline editor: title, priority (High/Med/Low), optional due date, and the context picker (Standalone, or Order / Contact / Account with an ID).</li>
        <li><strong>Clear all</strong> — asks for a second click to confirm ("Click again to remove all N items").</li>
      </ul>

      <div className="docnote info">
        <span className="dn-ico"><I.eye size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Housekeeping is automatic</div>
          <p style={{ margin: 0 }}>Completed items delete themselves after 5 days (tunable in Developer Settings). Use Watch List for private follow-ups; when the <em>team</em> needs to see it, create a real CRM task with <a href="#quicktask">Quick Task</a> instead.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════ TASK LIST ════════ */
export function TasksPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Stay Organized</div>
      <h1 className="title">Task List</h1>
      <p className="lede">
        Press <span className="kbd">Ctrl+X</span> anywhere and your CRM tasks open in a fast, sortable
        table — no navigating to the task page. Search, filter, chain sorts, and act on many tasks at
        once. The real modal is below on sample tasks.
      </p>

      <LiveModal w={1000} h={640} frameLabel="task list · sample tasks"
        note="Tick rows to reveal the selection bar; click a column header to sort, Shift+click to chain."
        render={(box, onClosed) => <TaskList useMock contained portalContainer={box} onClosed={onClosed} />} />

      <h2 className="sec">Find, select, act</h2>
      <p>The toolbar: search (account, contact, or subject), a <strong>Status</strong> filter (New tasks / Completed / All statuses), a <strong>Priority</strong> filter (All / High / Medium / Low), and Refresh. Click a column header to sort, again for descending — and <strong>Shift+click a second column to chain sorts</strong> (Due Date, then Priority).</p>
      <p>Tick rows and the selection bar slides in with <strong>Run campaign</strong>, <strong>Email selected</strong>, and <strong>Export CSV</strong>; the footer adds <strong>Open Tabs</strong> (every selected record in its own tab) and <strong>Quick Task</strong>. Acting on a task opens a compact popover with three panes: <strong>Main</strong> (Mark complete / Reopen + the Push-due card: +1d, +3d, +1w, +2w, +1mo, or Other with a day stepper), <strong>Set date</strong> (a mini calendar), and <strong>Add task</strong> (a quick custom task or a template; "Add to all N" in bulk).</p>

      <div className="docnote brand">
        <span className="dn-ico"><I.megaphone size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Selections feed campaigns</div>
          <p style={{ margin: 0 }}>The same selection that bulk-completes tasks can launch a <a href="#quicksend">Quick Send</a> — each selected task's contact gets a personalized email. It's the fastest path from "these 30 follow-ups" to "30 sent."</p>
        </div>
      </div>
    </div>
  );
}

/* ════════ QUICK TASK ════════ */
export function QuickTaskCreatePage() {
  return (
    <div className="prose">
      <div className="eyebrow">Stay Organized</div>
      <h1 className="title">Quick Task</h1>
      <p className="lede">
        A CRM task in seconds, two ways: fire a saved template with one keystroke, or press
        <span className="kbd">/</span> and compose from scratch without touching the mouse. The real
        modal is below — type to filter, press <span className="kbd">/</span> to compose, and try typing
        <span className="kbd">high </span> (with a trailing space) to watch the word snap into a chip.
      </p>

      <LiveModal w={480} h={540} frameLabel="quick task · Marcus Chen (sample)"
        note="The live Quick Task composer. Submitting here is a sample — nothing is written to a real CRM."
        render={(box, onClosed) => (
          <QuickTask contained portalContainer={box} contactName="Marcus Chen" contactType="contact" onSubmit={demoSubmit} onClosed={onClosed} />
        )} />

      <h3 className="sub">Due dates</h3>
      <p>The Due control takes quick chips — <strong>Today, Tomorrow, In 3 days, Next week</strong> — or a typed date (<code>mm/dd/yy</code>, or shorthand like <code>+1d</code> / <code>+1w</code>). A live preview pane mirrors exactly what will be created and flags any missing required field; a toast confirms "Task created: &lt;name&gt;".</p>

      <h3 className="sub">Every key</h3>
      <ComposerKeysTable submitLabel="Save the task" />

      <h3 className="sub">Task categories (the CRM's list)</h3>
      <CatGrid items={TASK_CATEGORIES} />
      <p style={{ marginTop: 10 }}>Priorities: <Tag tone="error" size="xs">High</Tag> <Tag tone="warning" size="xs">Medium</Tag> <Tag tone="info" size="xs">Low</Tag></p>

      <div className="docnote brand" style={{ marginTop: 24 }}>
        <span className="dn-ico"><I.edit size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Templates live in the Manager's Notes tab</div>
          <p style={{ margin: 0 }}>A task template carries a button label, subject, description, priority, category, and a due-in-days offset — so your recurring follow-ups ("Proof Requested", "15-Day Call") are two keystrokes. See <a href="#templates">Email Templates</a> for the editor itself.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════ CALL LOG ════════ */
export function CallsPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Stay Organized</div>
      <h1 className="title">Call Log</h1>
      <p className="lede">
        The same keyboard-first composer as Quick Task, tuned for calls. From the shelf,
        <strong> "Call &lt;name&gt;"</strong> dials the contact and opens the logger;
        <strong> "Log incoming call"</strong> opens it without dialing. Submitting writes straight to the
        CRM activity log. The real modal is below.
      </p>

      <LiveModal w={480} h={540} frameLabel="call log · Marcus Chen (sample)"
        note="The live Call Log composer — direction, category, and a voicemail flag. Sample data only."
        render={(box, onClosed) => (
          <CallLog contained portalContainer={box} contactName="Marcus Chen" contactType="contact" phone="(415) 555-0142" onSubmit={demoSubmit} onClosed={onClosed} />
        )} />

      <h2 className="sec">Templates and the composer</h2>
      <p>The filter bar lists your call templates — each row shows its direction glyph (<span style={{ color: 'var(--gb-info-fg)', fontWeight: 700 }}>↙ inbound</span> / <span style={{ color: 'var(--gb-brand-label)', fontWeight: 700 }}>↗ outbound</span>), a VM tag when it pre-sets the voicemail flag, and its category chip. Same keys as Quick Task: <span className="kbd">1–9</span>, <span className="kbd">↑↓</span> + <span className="kbd">Enter</span>, <span className="kbd">Shift+Enter</span> to customize, <span className="kbd">/</span> to compose. In the composer the chips row holds <strong>Category, Direction, and the Voicemail flag</strong>; word-snap works here too (typing <code>inbound␣</code> or <code>out␣</code> becomes the Direction chip).</p>

      <h3 className="sub">Call categories (the CRM's list)</h3>
      <CatGrid items={CALL_CATEGORIES} />

      <div className="docnote brand" style={{ marginTop: 24 }}>
        <span className="dn-ico"><I.phone size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Build templates for outcomes, not openers</div>
          <p style={{ margin: 0 }}>Call templates (Manager → Notes tab) carry direction, category, voicemail flag, subject, description, and up to four numbered next-step actions. With templates for your recurring outcomes, logging takes under ten seconds. No phone on the contact? The shelf offers <strong>Find phone</strong>, which scans their orders for one.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════ ORDER DATES ════════ */
const CHAIN_STEPS = [
  { label: 'Load delivery calendar', state: 'done' },
  { label: 'Select approval date', state: 'done' },
  { label: 'Select commitment date', state: 'active' },
  { label: 'Submit update', state: 'todo' },
];
function StepChain() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxWidth: 360, margin: '8px 0 0' }}>
      {CHAIN_STEPS.map((s, i) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0, background: s.state === 'done' ? 'var(--gb-brand-tint-medium)' : s.state === 'active' ? 'var(--gb-warning-tint-medium)' : 'var(--gb-fill-subtle)', border: '1px solid ' + (s.state === 'done' ? 'var(--gb-brand-tint-border)' : s.state === 'active' ? 'var(--gb-warning-tint-border)' : 'var(--gb-border-default)'), color: s.state === 'done' ? 'var(--gb-brand-label)' : s.state === 'active' ? 'var(--gb-warning-fg)' : 'var(--gb-text-ghost)' }}>{s.state === 'done' ? <I.check size={11} /> : i + 1}</span>
            {i < CHAIN_STEPS.length - 1 && <span style={{ width: 2, height: 16, background: 'var(--gb-border-subtle)' }} />}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, paddingTop: 1, color: s.state === 'todo' ? 'var(--gb-text-ghost)' : 'var(--gb-text-primary)' }}>{s.label}{s.state === 'active' && <span style={{ color: 'var(--gb-warning-fg)', fontWeight: 500 }}> — running…</span>}</span>
        </div>
      ))}
    </div>
  );
}

export function CalendarPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Stay Organized</div>
      <h1 className="title">Order Dates</h1>
      <p className="lede">
        Approval and commitment dates without the form maze. On an order page, the notes-area toolbar
        gets a calendar button — it opens the Order Date Manager: two mini-calendars, approval on the
        left, commitment on the right. The real modal is below; pick a date on each.
      </p>

      <LiveModal w={560} h={460} frameLabel="order dates · #284910 (sample)"
        note="The live Order Date Manager. Pick an approval and a commitment date on the two calendars."
        render={(box, onClosed) => (
          <CalendarModal contained portalContainer={box} orderID="284910" onSubmit={demoSubmit} onClosed={onClosed} />
        )} />

      <h2 className="sec">What “Update Dates” does</h2>
      <p>Saving dates on the admin site is really a <strong>multi-step form sequence</strong>. Update Dates runs the whole chain for you and shows a step-by-step progress toast — you watch each step check off, and a confirmation lands when both dates are committed:</p>
      <StepChain />
      <p style={{ marginTop: 16 }}>If a step fails (usually an expired admin session), <strong>the toast names the failing step</strong> and the chain stops — nothing half-saves silently. Re-open the calendar and run it again; the chain restarts from the top and is safe to repeat. Repeated failure at step one means the session expired — reload the order page.</p>

      <h2 className="sec">The notes toolbar around it</h2>
      <ul>
        <li><strong>Quick note</strong> — a one-click save button for order notes, with your note templates a click away (a note template can also auto-shift dates via its "push dates forward" setting).</li>
        <li><strong>Auto Push</strong> — the Settings toggle that lets date and note updates push to the order automatically as part of the save chain.</li>
      </ul>
    </div>
  );
}
