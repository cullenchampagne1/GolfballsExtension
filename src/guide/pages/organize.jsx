import React, { useState } from 'react';
import { I, Btn, Input, Tag, Switch, Segmented } from '../../ui/index.js';
import { TourBox, MiniFrame } from '../lib/tourbox.jsx';

/* ───────────────────────────────────────────────────────────────
   organize.jsx — the Stay Organized pages: Watch List, Task List,
   Quick Task, Call Log, Order Dates. Design-pattern TourBoxes;
   every list, category, and keyboard rule from the verified
   articles (watch-list, task-list, quick-task, call-log,
   order-date-manager, note-templates).
─────────────────────────────────────────────────────────────── */

/* ════════ shared bits ════════ */

const TASK_CATEGORIES = ['Other', 'Order History Special', 'Proposal Follow-up', 'Order day call', 'Customer Request', 'High Priority', '15 Day Call/Email', '5 Day Follow-Up to Email', 'Workflow Task', 'Courier Claims', 'High Priority Opportunity', 'Replacement Contact'];
const CALL_CATEGORIES = ['Product Question', 'Order Status', 'Place Order', 'Transfer', 'Order Payment', 'Turnaround Time', 'Art', 'Prior Year Followup', 'Returning VoiceMail', 'Tournament Lead', 'Form Lead Followup', 'General Question', 'Order Issues', 'CSR Backup', 'Discovery', 'Opportunity', 'Returns/Reprints', 'Charge Error', 'Fraud Inquiry', 'International Orders', 'Profanity', 'Order Change', 'Cancelation', 'Website Concerns'];

function CatGrid({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {items.map((c) => <Tag key={c} tone="neutral" size="xs">{c}</Tag>)}
    </div>
  );
}

/* The composer's word-snap, live: type a priority word + space and it
   becomes a chip — the exact behavior in Quick Task / Call Log. */
const SNAP_WORDS = { high: ['High', 'error'], medium: ['Medium', 'warning'], low: ['Low', 'info'] };
function WordSnapSnippet() {
  const [chip, setChip] = useState(null);
  const [text, setText] = useState('');
  const onChange = (v) => {
    if (v.endsWith(' ')) {
      const w = v.trim().split(/\s+/).pop().toLowerCase();
      if (SNAP_WORDS[w]) {
        setChip(SNAP_WORDS[w]);
        setText(v.trim().split(/\s+/).slice(0, -1).join(' '));
        return;
      }
    }
    setText(v);
  };
  return (
    <MiniFrame width={360} label="composer · word snap" pad>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, minHeight: 24 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--gb-text-muted)' }}>Chips</span>
        {chip
          ? <Tag tone={chip[1]} size="xs">{chip[0]} priority ×</Tag>
          : <span style={{ fontSize: 10.5, color: 'var(--gb-text-ghost)', fontStyle: 'italic' }}>none yet</span>}
        {chip && <button onClick={() => setChip(null)} style={{ border: 'none', background: 'transparent', color: 'var(--gb-text-muted)', cursor: 'pointer', fontSize: 10 }}>clear</button>}
      </div>
      <Input size="sm" value={text} onChange={onChange} placeholder='Try typing  high  (with a trailing space)…' />
      <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 8, textAlign: 'center' }}>
        Type <span className="kbd">high</span>, <span className="kbd">medium</span>, or <span className="kbd">low</span> + space — the word snaps into a chip mid-sentence.
      </div>
    </MiniFrame>
  );
}

function ComposerKeysTable({ submitLabel }) {
  const rows = [
    ['/', 'Open the composer / token menu (categories, priorities, …)'],
    ['word + space', 'Snap a recognized word into its chip'],
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

const WATCH_ROWS = [
  { id: 1, title: 'Verify reprint shipped', ctx: 'Order #29103', due: 'today', age: '7h', urgency: 'var(--gb-error-fg)', prio: 'var(--gb-error-fg)' },
  { id: 2, title: 'Confirm logo colors with Marcus', ctx: 'Contact #4421 · Marcus Chen', due: 'Jun 12', age: '5h', urgency: 'var(--gb-warning-fg)', prio: 'var(--gb-warning-fg)' },
  { id: 3, title: 'Check stock before quoting', ctx: 'Account #2188 · Acme Industries', due: '—', age: '40m', urgency: 'transparent', prio: 'var(--gb-info-fg)' },
];
function WatchRowsSnippet() {
  const [done, setDone] = useState({});
  return (
    <MiniFrame width={420} label="watch list · rows" pad={false}>
      <div style={{ padding: 6 }}>
        {WATCH_ROWS.map((r) => (
          <div key={r.id} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 8px 16px', borderRadius: 'var(--gb-r-sm)', opacity: done[r.id] ? 0.55 : 1 }}>
            <span style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 3, borderRadius: 2, background: done[r.id] ? 'transparent' : r.urgency }} />
            <button onClick={() => setDone((d) => ({ ...d, [r.id]: !d[r.id] }))} style={{ width: 18, height: 18, borderRadius: 5, border: '1px solid var(--gb-border-strong)', background: done[r.id] ? 'var(--gb-brand-tint-medium)' : 'transparent', color: 'var(--gb-brand-label)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{done[r.id] && <I.check size={11} />}</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.prio, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)', textDecoration: done[r.id] ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 1 }}>{r.ctx} · due {r.due}</div>
            </div>
            <span style={{ fontSize: 10, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)', flexShrink: 0 }}>{done[r.id] ? 'done' : r.age}</span>
          </div>
        ))}
      </div>
    </MiniFrame>
  );
}

export function WatchListPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Stay Organized</div>
      <h1 className="title">Watch List</h1>
      <p className="lede">
        Your private, cross-session list of orders and contacts to keep an eye on. Watch something from
        the popup's TRACKING section or the shelf, and it lands here with a link back to where it came
        from. It's local to your browser — nothing reaches the CRM or teammates.
      </p>

      <TourBox n={1} eyebrow="Reading a row" title="The urgency stripe ages in real time" live={<WatchRowsSnippet />} wide>
        <p>Each row: a checkbox, the priority dot + title, the context line (<em>Order #29103</em>, <em>Contact #4421 · Marcus Chen</em>, or <em>Standalone</em>) with the due date, and the item's age on the right — hovering swaps the age for Edit and Remove.</p>
        <p>The colored stripe on the left tracks <strong>how long the item has been waiting</strong>: nothing under 1 hour, blue at 1–4h, amber at 4–6h, <strong>red at 6h+</strong> — and once anything goes red, the modal header tints red and the popup's Watch List badge starts pulsing. Tick the checkboxes — the rows are live.</p>
      </TourBox>

      <h2 className="sec">The rest of the modal</h2>
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

function TaskToolbarSnippet() {
  const [status, setStatus] = useState('new');
  const [prio, setPrio] = useState('all');
  return (
    <MiniFrame width={430} label="task list · toolbar" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Input size="sm" placeholder="Search account, contact, subject…" leading={<I.search />} />
        <div style={{ display: 'flex', gap: 6 }}>
          <Segmented value={status} onChange={setStatus} options={[{ id: 'new', label: 'New tasks' }, { id: 'done', label: 'Completed' }, { id: 'all', label: 'All' }]} />
          <Segmented value={prio} onChange={setPrio} options={[{ id: 'all', label: 'All' }, { id: 'hi', label: 'High' }, { id: 'med', label: 'Med' }, { id: 'lo', label: 'Low' }]} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', fontSize: 11 }}>
          <b style={{ color: 'var(--gb-brand-label)' }}>3 selected</b>
          <span style={{ color: 'var(--gb-text-muted)' }}>of 41 tasks</span>
          <span style={{ flex: 1 }} />
          <Btn size="xs" variant="ghost" icon={<I.megaphone />}>Run campaign</Btn>
          <Btn size="xs" variant="ghost" icon={<I.mail />}>Email selected</Btn>
          <Btn size="xs" variant="ghost" icon={<I.copy />}>Export CSV</Btn>
        </div>
      </div>
    </MiniFrame>
  );
}

function PushDueSnippet() {
  const [picked, setPicked] = useState('+1w');
  const chips = ['+1d', '+3d', '+1w', '+2w', '+1mo', 'Other'];
  return (
    <MiniFrame width={330} label="task popover · push due date" pad>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><I.clock size={12} /> Push due date</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {chips.map((c) => (
          <button key={c} onClick={() => setPicked(c)} style={{ cursor: 'pointer', padding: '5px 10px', borderRadius: 'var(--gb-r-pill)', border: '1px solid ' + (picked === c ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: picked === c ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)', color: picked === c ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontFamily: 'inherit', fontSize: 11, fontWeight: 600 }}>{c}</button>
        ))}
      </div>
      <div style={{ marginTop: 10 }}><Btn full size="sm" variant="tinted" status="brand">Apply push</Btn></div>
    </MiniFrame>
  );
}

export function TasksPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Stay Organized</div>
      <h1 className="title">Task List</h1>
      <p className="lede">
        Press <span className="kbd">Ctrl+X</span> anywhere and your CRM tasks open in a fast, sortable
        table — no navigating to the task page. Search, filter, chain sorts, and act on many tasks at
        once.
      </p>

      <TourBox n={1} eyebrow="Find & select" title="Toolbar, filters, and the selection bar" live={<TaskToolbarSnippet />} wide>
        <p>The toolbar: search (account, contact, or subject), a <strong>Status</strong> filter (New tasks / Completed / All statuses), a <strong>Priority</strong> filter (All / High / Medium / Low), and Refresh.</p>
        <p>Click a column header to sort, again for descending — and <strong>Shift+click a second column to chain sorts</strong> (Due Date, then Priority). Tick rows and the selection bar slides in with <strong>Run campaign</strong>, <strong>Email selected</strong>, and <strong>Export CSV</strong>; the footer adds <strong>Open Tabs</strong> (every selected record in its own tab) and <strong>Quick Task</strong>.</p>
      </TourBox>

      <TourBox n={2} eyebrow="Acting on a task" title="The task popover" live={<PushDueSnippet />} flip>
        <p>Acting on a task (or a bulk selection) opens a compact popover with three panes:</p>
        <ul>
          <li><strong>Main</strong> — Mark complete / Reopen, plus the <em>Push due date</em> card: +1d, +3d, +1w, +2w, +1mo, or Other with a day stepper, then Apply push.</li>
          <li><strong>Set date</strong> — a mini calendar (today outlined, pick a day, "Save · Jun 12").</li>
          <li><strong>Add task</strong> — a quick custom task or one of your templates; in bulk mode the button reads "Add to all N".</li>
        </ul>
        <p>Bulk runs show progress ("Completing 14 tasks…" → checkmark) with a Try-again on failures.</p>
      </TourBox>

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
        <span className="kbd">/</span> and compose from scratch without touching the mouse. Opens from
        the shelf ("Quick task for &lt;name&gt;") on contact, account, and order pages.
      </p>

      <TourBox n={1} eyebrow="The grammar" title="Words become chips" live={<WordSnapSnippet />} wide>
        <p>The modal opens in <strong>filter mode</strong> — type to filter your task templates, press <span className="kbd">1–9</span> to fire one, or <span className="kbd">Shift+Enter</span> to load it into the composer for tweaking.</p>
        <p>Press <span className="kbd">/</span> for the composer: a chips row (Category, Priority), Subject ("What needs doing?"), Note, and Due. The trick that makes it fast: <strong>type a recognized word + space and it snaps into a chip</strong> — try it in the live input. The <span className="kbd">/</span> menu also lists every category and priority for arrow-key picking.</p>
      </TourBox>

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

function CallRowSnippet() {
  const rows = [
    { dir: '↗', name: 'Left VM — promo follow-up', cat: 'Returning VoiceMail', vm: true },
    { dir: '↙', name: 'Order status inquiry', cat: 'Order Status', vm: false },
    { dir: '↗', name: 'Discovery call — tournament', cat: 'Discovery', vm: false },
  ];
  return (
    <MiniFrame width={380} label="call log · templates" pad={false}>
      <div style={{ padding: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 'var(--gb-r-sm)' }}>
            <span className="kbd" style={{ fontSize: 9.5 }}>{i + 1}</span>
            <span style={{ fontSize: 13, color: r.dir === '↙' ? 'var(--gb-info-fg)' : 'var(--gb-brand-label)', fontWeight: 700 }}>{r.dir}</span>
            <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{r.name}</span>
            {r.vm && <Tag tone="warning" size="xs">VM</Tag>}
            <Tag tone="neutral" size="xs">{r.cat}</Tag>
          </div>
        ))}
      </div>
    </MiniFrame>
  );
}

export function CallsPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Stay Organized</div>
      <h1 className="title">Call Log</h1>
      <p className="lede">
        The same keyboard-first composer as Quick Task, tuned for calls. From the shelf,
        <strong> "Call &lt;name&gt;"</strong> dials the contact (the row hints the exact number) and opens
        the logger; <strong>"Log incoming call"</strong> opens it without dialing. Submitting writes
        straight to the CRM activity log.
      </p>

      <TourBox n={1} eyebrow="Templates first" title="One keystroke per common call" live={<CallRowSnippet />}>
        <p>The filter bar lists your call templates — each row shows its direction glyph (<span style={{ color: 'var(--gb-info-fg)', fontWeight: 700 }}>↙ inbound</span> / <span style={{ color: 'var(--gb-brand-label)', fontWeight: 700 }}>↗ outbound</span>), a VM tag when it pre-sets the voicemail flag, and its category chip. Same keys as Quick Task: <span className="kbd">1–9</span>, <span className="kbd">↑↓</span> + <span className="kbd">Enter</span>, <span className="kbd">Shift+Enter</span> to customize, <span className="kbd">/</span> to compose.</p>
        <p>In the composer the chips row holds <strong>Category, Direction, and the Voicemail flag</strong> — and word-snap works here too: typing <code>inbound␣</code> or <code>out␣</code> becomes the Direction chip. Subject placeholder: "What was the call about?".</p>
      </TourBox>

      <h3 className="sub">Call categories (the CRM's list)</h3>
      <CatGrid items={CALL_CATEGORIES} />

      <div className="docnote brand" style={{ marginTop: 24 }}>
        <span className="dn-ico"><I.phone size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Build templates for outcomes, not openers</div>
          <p style={{ margin: 0 }}>Call templates (Manager → Notes tab) carry direction, category, voicemail flag, subject, description, and up to four numbered next-step actions. With templates for your recurring outcomes, logging takes under ten seconds — you only type the note. No phone on the contact? The shelf offers <strong>Find phone</strong>, which scans their orders for one.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════ ORDER DATES (calendar) ════════ */

const CHAIN_STEPS = [
  { label: 'Load delivery calendar', state: 'done' },
  { label: 'Select approval date', state: 'done' },
  { label: 'Select commitment date', state: 'active' },
  { label: 'Submit update', state: 'todo' },
];
function StepChainSnippet() {
  return (
    <MiniFrame width={340} label="order dates · save progress" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {CHAIN_STEPS.map((s, i) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0, background: s.state === 'done' ? 'var(--gb-brand-tint-medium)' : s.state === 'active' ? 'var(--gb-warning-tint-medium)' : 'var(--gb-fill-subtle)', border: '1px solid ' + (s.state === 'done' ? 'var(--gb-brand-tint-border)' : s.state === 'active' ? 'var(--gb-warning-tint-border)' : 'var(--gb-border-default)'), color: s.state === 'done' ? 'var(--gb-brand-label)' : s.state === 'active' ? 'var(--gb-warning-fg)' : 'var(--gb-text-ghost)' }}>{s.state === 'done' ? <I.check size={11} /> : i + 1}</span>
              {i < CHAIN_STEPS.length - 1 && <span style={{ width: 2, height: 16, background: 'var(--gb-border-subtle)' }} />}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, paddingTop: 2, color: s.state === 'todo' ? 'var(--gb-text-ghost)' : 'var(--gb-text-primary)' }}>{s.label}{s.state === 'active' && <span style={{ color: 'var(--gb-warning-fg)', fontWeight: 500 }}> — running…</span>}</span>
          </div>
        ))}
      </div>
    </MiniFrame>
  );
}

export function CalendarPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Stay Organized</div>
      <h1 className="title">Order Dates</h1>
      <p className="lede">
        Approval and commitment dates without the form maze. On an order page, the notes-area toolbar
        gets a calendar button — it opens the Order Date Manager: two mini-calendars side by side,
        approval on the left, commitment on the right, with readouts under each.
      </p>

      <TourBox n={1} eyebrow="What Update Dates does" title="A multi-step save, narrated" live={<StepChainSnippet />}>
        <p>Saving dates on the admin site is really a <strong>multi-step form sequence</strong>. Update Dates runs the whole chain for you and shows a step-by-step progress toast — you watch each step check off, and a confirmation lands when both dates are committed.</p>
        <p>If a step fails (usually an expired admin session), <strong>the toast names the failing step</strong> and the chain stops — nothing half-saves silently. Re-open the calendar and run it again; the chain restarts from the top and is safe to repeat. Repeated failure at step one means the session expired — reload the order page.</p>
      </TourBox>

      <h2 className="sec">The notes toolbar around it</h2>
      <ul>
        <li><strong>Quick note</strong> — a one-click save button for order notes, with your note templates a click away (a note template can also auto-shift dates via its "push dates forward" setting).</li>
        <li><strong>Auto Push</strong> — the Settings toggle that lets date and note updates push to the order automatically as part of the save chain.</li>
      </ul>
    </div>
  );
}
