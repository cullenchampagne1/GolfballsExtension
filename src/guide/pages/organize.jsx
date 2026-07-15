import React, { useState } from 'react';
import { I, Tag } from '../../ui/index.js';
import { LiveStage } from '../lib/stage.jsx';
import { TourBox, MiniFrame } from '../lib/tourbox.jsx';
import {
  WatchListLive, WatchRow, WatchEditor, FilterChips, sampleTasks, URGENCY_TINT,
} from '../lib/watchlist-live.jsx';
import {
  TaskListLive, TaskRow, TableHeader, Toolbar as TLToolbar, SelectionBar, PushDueCard,
  sampleTasks as sampleTaskRows,
} from '../lib/tasklist-live.jsx';
import {
  QuickTaskLive, QtTemplateRow, QtComposeBar, QtTokenMenu, SAMPLE_TEMPLATES,
} from '../lib/quicktask-live.jsx';
import {
  CallLogLive, ClTemplateRow, ClComposeBar, ClTokenMenu, SAMPLE_CALL_TEMPLATES,
} from '../lib/calllog-live.jsx';
import { CalendarLive, MiniCalendar, addDays } from '../lib/calendar-live.jsx';
import { QuickSendPanel } from '../lib/quicksend-live.jsx';

/* ───────────────────────────────────────────────────────────────
   organize.jsx — Stay Organized pages. Each leads with the REAL
   modal component mounted live (contained + scaled) on sample data,
   followed by reference prose/tables from the verified articles.
─────────────────────────────────────────────────────────────── */

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

const WL_CALLOUTS = [
  { n: 1, target: 'header', title: 'Title & status', text: 'The active count, and a red “N critical” flag the moment anything has waited 6+ hours.' },
  { n: 2, target: 'filters', title: 'Filter chips', text: 'All / Active / High priority / Completed, each with a live count. Sliding indicator.' },
  { n: 3, target: 'search', title: 'Search + Watch', text: 'Search matches title, context, and due date. Watch opens the inline editor.' },
  { n: 4, target: 'row', title: 'A watch row', text: 'Urgency stripe · checkbox · priority dot + title · linked record · due date · age.' },
  { n: 5, target: 'row-actions', title: 'Age / actions', text: 'Resting it shows the age; on hover it swaps to Edit and Remove in place.' },
  { n: 6, target: 'footer', title: 'Clear all', text: 'A two-tap confirm before the whole list is wiped.' },
];
const WL_STEPS = [
  { target: 'header', caption: 'Your private watch list. One item has been waiting 7 hours, so it’s flagged critical and the count turns red.', hold: 2600 },
  { target: 'filters', caption: 'Filter chips carry live counts. Switch to Completed to see resolved items…', run: (api) => api.setFilter('done'), hold: 2200 },
  { target: 'filters', caption: '…and back to Active for the live queue.', run: (api) => api.setFilter('active'), hold: 1500 },
  { target: 'row', caption: 'Each row reads at a glance: the colored urgency stripe, a checkbox, the priority dot + title, the linked record, the due date, and how long it has waited.', hold: 3200 },
  { target: 'search', caption: 'Add one — the Watch button opens the inline editor.', run: (api) => api.startNew(), hold: 1500 },
  { target: 'editor', caption: 'Title, priority, due date, and what it links to — all inline. “Add to watch list” when done.', hold: 3000 },
  { target: 'footer', caption: 'Clear all asks for a second click before wiping everything.', hold: 2400 },
];

function OneRowSnippet() {
  const [tasks] = useState(() => sampleTasks());
  return (
    <MiniFrame width={420} label="watch list · one row" pad>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <WatchRow task={tasks[0]} />
        <WatchRow task={tasks[1]} forceHover />
      </ul>
      <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 8, textAlign: 'center' }}>Top: resting (shows age). Bottom: hovered (Edit / Remove swap in).</div>
    </MiniFrame>
  );
}

function StripeScale() {
  const rows = [
    ['normal', 'Under 1 hour', 'no stripe'],
    ['moderate', '1–4 hours', 'blue'],
    ['high', '4–6 hours', 'amber'],
    ['critical', '6+ hours', 'red — header tints, popup badge pulses'],
  ];
  return (
    <MiniFrame width={300} label="urgency stripe" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(([level, age, label]) => (
          <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 3, height: 26, borderRadius: 2, background: level === 'normal' ? 'transparent' : URGENCY_TINT[level], border: level === 'normal' ? '1px dashed var(--gb-border-default)' : 'none' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{age}</div>
              <div style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>
    </MiniFrame>
  );
}

function FilterChipsSnippet() {
  const [value, setValue] = useState('active');
  return (
    <MiniFrame width={360} label="watch list · filters" pad>
      <FilterChips value={value} onChange={setValue} counts={{ all: 4, active: 3, high: 1, done: 1 }} />
      <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 8, textAlign: 'center' }}>Click a chip — it's live. Counts update with the list.</div>
    </MiniFrame>
  );
}

function EditorSnippet() {
  const [draft, setDraft] = useState({ title: 'Confirm logo colors with Marcus', priority: 'med', due: '', context: { type: 'contact', id: '4421', name: 'Marcus Chen' } });
  /* Match the real modal's inner width (~520) so the Priority segmented
     and the Due field share the row without crowding. */
  return (
    <MiniFrame width={520} label="watch list · inline editor" pad>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        <WatchEditor draft={draft} onChange={setDraft} onCommit={() => {}} onCancel={() => {}} />
      </ul>
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
        from. It's local to your browser — nothing reaches the CRM or teammates. Watch it work below,
        then read each piece beside its live control.
      </p>

      <LiveStage
        width={560}
        frameKind="modal"
        frameLabel="golfballs.com · watch list"
        render={(apiRef) => <WatchListLive ref={apiRef} />}
        callouts={WL_CALLOUTS}
        steps={WL_STEPS}
        note="Live Watch List on sample data — hover the pins, press Play, or Try it yourself."
      />

      <h2 className="sec">Walk through it, piece by piece</h2>
      <p>Each block pairs the real control with what it does. The snippets are live.</p>

      <TourBox n={1} eyebrow="Anatomy" title="A single watch row" live={<OneRowSnippet />} flip>
        <p>Every row reads in one glance: a <strong>checkbox</strong> to mark it done, the <strong>priority dot</strong> + title, the <strong>linked record</strong> (<em>Order #29103</em>, <em>Contact #4421 · Marcus Chen</em>, or <em>Standalone</em>), and the <strong>due date</strong> (amber when due soon, red when overdue).</p>
        <p>The right edge shows <strong>how long it has waited</strong> at rest, and swaps to <strong>Edit</strong> and <strong>Remove</strong> on hover — so the resting list stays quiet but the actions are one mouse-move away.</p>
      </TourBox>

      <TourBox n={2} eyebrow="The signal" title="The urgency stripe" live={<StripeScale />}>
        <p>The colored bar on a row's left edge tracks <strong>how long the item has been sitting unresolved</strong>. It climbs from nothing, through blue and amber, to <strong>red at 6+ hours</strong>.</p>
        <p>When anything goes red the modal header tints red and the popup's <a href="#popup">Watch List badge</a> starts pulsing — so an aging follow-up is impossible to miss without opening the list.</p>
      </TourBox>

      <TourBox n={3} eyebrow="Filtering" title="Filter chips + search" live={<FilterChipsSnippet />} flip>
        <p><strong>All / Active / High priority / Completed</strong>, each with a live count. Active hides done items; High priority narrows to red-dot items; Completed shows what you've resolved.</p>
        <p>The search box beside them matches title, linked record, and due date — type “Acme” or “29103” to jump straight to it.</p>
      </TourBox>

      <TourBox n={4} eyebrow="The line-item settings" title="The inline editor" live={<EditorSnippet />} wide>
        <p>Watch (or Edit on a row) opens the editor right in place — no separate dialog. It carries everything a watch item needs:</p>
        <ul>
          <li><strong>Title</strong> — what you're watching for.</li>
          <li><strong>Priority</strong> — High / Med / Low, the colored dot on the row.</li>
          <li><strong>Due</strong> — an optional date; the row colors it amber/red as it approaches.</li>
          <li><strong>Linked to</strong> — Standalone, or Order / Contact / Account with an ID (and an optional name) so the row deep-links back to the record.</li>
        </ul>
        <p>The snippet is live — change the priority, pick a due date, switch what it links to.</p>
      </TourBox>

      <div className="docnote info" style={{ marginTop: 26 }}>
        <span className="dn-ico"><I.eye size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Housekeeping is automatic</div>
          <p style={{ margin: 0 }}>Completed items delete themselves after 5 days (tunable in Developer Settings → “Auto-delete completed watch items”). <strong>Clear all</strong> wipes the list but asks for a second click first. Use Watch List for private follow-ups; when the <em>team</em> needs to see it, create a real CRM task with <a href="#quicktask">Quick Task</a> instead.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════ TASK LIST ════════ */

const TL_CALLOUTS = [
  { n: 1, target: 'header', title: 'Title & count', text: 'My Task List, with the visible / total count for the current filters.' },
  { n: 2, target: 'toolbar', title: 'Search & filters', text: 'Search account/contact/subject, plus Status and Priority dropdowns and Refresh.' },
  { n: 3, target: 'sortheader', title: 'Sortable columns', text: 'Click a header to sort; click again for descending; Shift+click another to chain.' },
  { n: 4, target: 'row', title: 'A task row', text: 'Account + category, contact, due date, priority, subject, and a status badge.' },
  { n: 5, target: 'footer', title: 'Bulk actions', text: 'Open Tabs and Quick Task act on every selected row.' },
];
const TL_STEPS = [
  { target: 'toolbar', caption: 'Search by account, contact, or subject, and narrow by Status and Priority. Watch — filter to High priority…', run: (api) => api.setPriorityFilter('1'), hold: 2400 },
  { target: 'toolbar', caption: '…and clear it to see them all again.', run: (api) => api.setPriorityFilter(''), hold: 1500 },
  { target: 'sortheader', caption: 'Click a column to sort. Click Due Date to put the most overdue on top…', run: (api) => api.onSort('dueDate'), hold: 2200 },
  { target: 'sortheader', caption: '…then Shift+click Priority to chain a second sort — the 1 / 2 rank badges show the order.', run: (api) => api.onSort('priority', true), hold: 2800 },
  { target: 'row', caption: 'Each row reads across: account with its category underneath, the contact, the due date, a priority tag, the subject, and a status badge that flags Overdue or Due today.', hold: 3400 },
  { target: 'header', caption: 'Tick rows to select them…', run: (api) => api.selectN(3), hold: 1600 },
  { target: 'selbar', caption: '…and the selection bar appears with Run campaign, Email selected, and Export CSV — acting on all of them at once.', hold: 3200 },
  { target: 'footer', caption: 'The footer adds Open Tabs (each record in its own tab) and Quick Task (a follow-up on every selected row).', hold: 2800 },
];

function ToolbarSnippet() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('1');
  const [priorityFilter, setPriorityFilter] = useState('');
  return (
    <MiniFrame width={560} label="task list · toolbar" pad={false}>
      <TLToolbar {...{ query, setQuery, statusFilter, setStatusFilter, priorityFilter, setPriorityFilter }} />
    </MiniFrame>
  );
}

function TableSnippet() {
  const [rows] = useState(() => sampleTaskRows().filter((t) => t.status !== 'Complete').slice(0, 4));
  const [sel, setSel] = useState(new Set([rows[0].id]));
  const sortChain = [{ key: 'dueDate', dir: 'asc' }, { key: 'priority', dir: 'asc' }];
  return (
    <MiniFrame width={900} label="task list · table" pad={false}>
      <div style={{ background: 'var(--gb-surface-canvas)' }}>
        <TableHeader allChecked={false} onToggleAll={() => {}} sortChain={sortChain} onSort={() => {}} />
        <div style={{ padding: '4px 0' }}>
          {rows.map((t) => <TaskRow key={t.id} task={t} isSelected={sel.has(t.id)} onToggle={() => setSel((s) => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })} />)}
        </div>
      </div>
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
        once. Watch it work below, then read each piece beside its live control.
      </p>

      <LiveStage
        wide
        width={1000}
        frameKind="modal"
        frameLabel="golfballs.com · task list"
        render={(apiRef) => <TaskListLive ref={apiRef} />}
        callouts={TL_CALLOUTS}
        steps={TL_STEPS}
        note="Live Task List on sample tasks — hover the pins, press Play, or Try it yourself."
      />

      <h2 className="sec">Walk through it, piece by piece</h2>
      <p>Each block pairs the real control with what it does. The snippets are live.</p>

      <TourBox n={1} eyebrow="Find" title="Search & filters" live={<ToolbarSnippet />} flip>
        <p>Search matches <strong>account, contact, and subject</strong> at once. Two dropdowns narrow the list:</p>
        <ul>
          <li><strong>Status</strong> — New tasks (the default), Completed, or All statuses.</li>
          <li><strong>Priority</strong> — All, High, Medium, or Low.</li>
        </ul>
        <p><strong>Refresh</strong> re-pulls your tasks from the CRM. The dropdowns in the snippet are live.</p>
      </TourBox>

      <TourBox stack eyebrow="The table" title="Rows, columns & sorting" live={<TableSnippet />}>
        <p>Each row reads across: the <strong>account</strong> with its <strong>category</strong> folded underneath, the <strong>contact</strong>, the <strong>due date</strong>, a <strong>priority tag</strong>, the <strong>subject</strong>, and a <strong>status badge</strong> — which shows the urgency (<Tag tone="error" size="xs">Overdue 3d</Tag> <Tag tone="warning" size="xs">Due today</Tag> <Tag tone="neutral" size="xs">in 2d</Tag>) rather than a flat “New”.</p>
        <p>Click any column header to sort, again for descending, a third time to drop it. <strong>Shift+click a second column to chain</strong> — the snippet above is sorted by Due Date then Priority, and the small <strong>1 / 2 rank badges</strong> show the order. Tick a row's checkbox (or the header's) to select.</p>
      </TourBox>

      <TourBox n={2} eyebrow="Act on many" title="Selection & bulk actions" live={<MiniFrame width={560} label="task list · selection bar" pad={false}><SelectionBar selCount={3} total={7} /></MiniFrame>} flip>
        <p>Tick rows and a selection bar slides in at the top: <strong>Run campaign</strong>, <strong>Email selected</strong>, and <strong>Export CSV</strong> — each acting on every checked row.</p>
        <p>The footer carries two more: <strong>Open Tabs</strong> opens each selected record in its own browser tab, and <strong>Quick Task</strong> drops a follow-up task on every one.</p>
      </TourBox>

      <TourBox n={3} eyebrow="Email selected → Quick Send" title="Bulk email, with a progress ring" live={<QuickSendPanel contactCount={3} />} wide>
        <p><strong>Email selected</strong> opens the <strong>Quick Send</strong> runner over your checked rows. Press <strong>Run</strong> in the panel — it's live — and watch the three phases:</p>
        <ul>
          <li><strong>Setup</strong> — pick the email template (with weighted variation splits when it has variations) and the <strong>delay between sends</strong> (a random range, so a blast looks human).</li>
          <li><strong>Running</strong> — the ring fills to a live %, a “Now sending” card shows the current contact, and a pacing line counts down between sends; sent / queued chips track the run.</li>
          <li><strong>Done</strong> — a checkmark burst, then stat tiles (Sent, Success %, Elapsed) and a per-contact timeline. Send again or Close.</li>
        </ul>
        <p>Each contact is opened in a background tab, its variables resolve against that contact's real data, the email sends, the tab closes — so every recipient gets genuinely personalized content, not mail-merge blanks. <em>Keep Power Automate on for a real blast; off, each send opens an Outlook window instead.</em> Full detail on the <a href="#quicksend">Quick Send</a> page.</p>
      </TourBox>

      <TourBox n={3} eyebrow="The line-item settings" title="The per-task popover" live={<MiniFrame width={340} label="task · push due date" pad><PushDueCard /></MiniFrame>} wide>
        <p>Acting on a single task (or a bulk selection) opens a compact popover with three panes:</p>
        <ul>
          <li><strong>Main</strong> — Mark complete / Reopen, plus the <strong>Push due date</strong> card shown here: chips for +1d, +3d, +1w, +2w, +1mo, or <strong>Other</strong> with a day stepper, then Apply.</li>
          <li><strong>Set date</strong> — a mini calendar to pick an exact due date.</li>
          <li><strong>Add task</strong> — a quick custom task or one of your templates; in bulk mode it reads “Add to all N”.</li>
        </ul>
        <p>The push-due chips in the snippet are live — pick one, or Other for a custom number of days.</p>
      </TourBox>

      <div className="docnote brand">
        <span className="dn-ico"><I.megaphone size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Selections feed campaigns</div>
          <p style={{ margin: 0 }}>The same selection that bulk-completes tasks can launch a <a href="#quicksend">Quick Send</a> — each selected task's contact gets a personalized email. It's the fastest path from “these 30 follow-ups” to “30 sent.”</p>
        </div>
      </div>
    </div>
  );
}

/* ════════ QUICK TASK ════════ */

const QT_CALLOUTS = [
  { n: 1, target: 'compose-chips', title: 'Tag chips', text: 'Category and Priority as removable chips. The dashed “+ tag” (or /) opens the picker.' },
  { n: 2, target: 'compose-subject', title: 'Subject', text: 'What needs doing. Type a recognized word + space and it snaps into a chip.' },
  { n: 3, target: 'compose-due', title: 'Due', text: 'Quick chips — Today, +1d, +2d, +3d, +1w — or a typed date.' },
  { n: 4, target: 'footer', title: 'Keyboard legend', text: '/ to compose · ↑↓ to move the list · Enter to add.' },
];
const QT_STEPS = [
  { target: 'header', caption: 'Open Quick Task on a contact and it’s ready to compose — keyboard-first, no mouse needed.', hold: 2400 },
  { target: 'compose-chips', caption: 'Press / (or the + tag) to open the picker and tag a Category and Priority…', run: (api) => api.openMenu(), hold: 2400 },
  { target: 'compose-chips', caption: '…the chips snap in, removable with their ×.', run: (api) => api.closeMenu(), hold: 1600 },
  { target: 'compose-subject', caption: 'Type the subject. A recognized word + space (like “high ”) snaps straight into a priority chip.', hold: 2600 },
  { target: 'compose-due', caption: 'Set the due date from the quick chips — Today, +1d, +3d, +1w — or type one.', hold: 2600 },
  { target: 'footer', caption: 'Enter adds the task; a toast confirms “Task created”. The whole flow never leaves the keyboard.', hold: 2600 },
];

function TemplateListSnippet() {
  const [active, setActive] = useState(0);
  return (
    <MiniFrame width={440} label="quick task · templates" pad={false}>
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {SAMPLE_TEMPLATES.map((tpl, i) => <QtTemplateRow key={tpl.id} tpl={tpl} hotkey={i + 1} isActive={active === i} onClick={() => setActive(i)} />)}
      </div>
    </MiniFrame>
  );
}

function ComposeSnippet() {
  const [tokens, setTokens] = useState({ category: 8, priority: '2' });
  const [subject, setSubject] = useState('Confirm artwork before reorder');
  const [note, setNote] = useState('');
  const [due, setDue] = useState({ kind: 'relative', days: 5 });
  const [menu, setMenu] = useState(false);
  return (
    <MiniFrame width={460} label="quick task · composer" pad={false}>
      <div style={{ position: 'relative' }}>
        <QtComposeBar {...{ tokens, setTokens, subject, setSubject, note, setNote, due, setDue }} onOpenMenu={() => setMenu((v) => !v)} onCommit={() => {}} onClear={() => { setSubject(''); setNote(''); setTokens({}); }} />
        {menu && <div style={{ position: 'absolute', left: 16, right: 16, top: 58, zIndex: 40 }}><QtTokenMenu tokens={tokens} onSelect={() => setMenu(false)} /></div>}
      </div>
    </MiniFrame>
  );
}

function TokenMenuSnippet() {
  const [tokens, setTokens] = useState({ category: 8 });
  return (
    <MiniFrame width={300} label="quick task · / menu" pad>
      <QtTokenMenu tokens={tokens} onSelect={() => {}} />
    </MiniFrame>
  );
}

export function QuickTaskCreatePage() {
  return (
    <div className="prose">
      <div className="eyebrow">Stay Organized</div>
      <h1 className="title">Quick Task</h1>
      <p className="lede">
        A CRM task in seconds, two ways: fire a saved template with one keystroke, or compose from
        scratch without touching the mouse. Opens from the shelf (“Quick task for &lt;name&gt;”) on
        contact, account, and order pages. Watch it work below, then read each piece beside its live
        control.
      </p>

      <LiveStage
        width={480}
        frameKind="modal"
        frameLabel="golfballs.com · quick task"
        render={(apiRef) => <QuickTaskLive ref={apiRef} contact="Marcus Chen" />}
        callouts={QT_CALLOUTS}
        steps={QT_STEPS}
        note="Live Quick Task composer on sample data — hover the pins, press Play, or Try it yourself."
      />

      <h2 className="sec">Walk through it, piece by piece</h2>
      <p>Each block pairs the real control with what it does. The snippets are live.</p>

      <TourBox n={1} eyebrow="One keystroke" title="The template list" live={<TemplateListSnippet />} flip>
        <p>The modal opens in filter mode — type to narrow your task templates, then press <span className="kbd">1–9</span> to fire the Nth one, <span className="kbd">↑↓</span> + <span className="kbd">Enter</span> to pick, or <span className="kbd">Shift+Enter</span> to load it into the composer to tweak first.</p>
        <p>Each row shows its <strong>hotkey</strong>, name, the due offset (<span className="kbd">+5d</span>), and its <strong>category</strong> — so the whole list scans at a glance. Hover reveals a customise button.</p>
      </TourBox>

      <TourBox stack eyebrow="From scratch" title="The composer" live={<ComposeSnippet />}>
        <p>Press <span className="kbd">/</span> and the bar grows into the composer. A <strong>chips row</strong> holds the Category and Priority (each removable with its <span className="kbd">×</span>); below it the <strong>Subject</strong> and <strong>Note</strong> fields, then the <strong>Due</strong> control.</p>
        <p>The trick that makes it fast: <strong>type a recognized word + space and it snaps into a chip</strong> — typing “high ” mid-subject becomes the High-priority chip. The dashed <strong>“+ tag”</strong> button (or <span className="kbd">/</span>) opens the picker for the rest. Everything here is live — try it.</p>
      </TourBox>

      <TourBox n={2} eyebrow="The / picker" title="Tagging category & priority" live={<TokenMenuSnippet />} flip>
        <p>The <span className="kbd">/</span> menu lists every <strong>Category</strong> and <strong>Priority</strong> token, colour-coded by tone. Arrow keys move, Enter selects (a check marks the active one), and the chip appears in the bar.</p>
        <p>Categories are the CRM's real task list — the full set is below.</p>
      </TourBox>

      <h3 className="sub">Due dates</h3>
      <p>The Due control takes quick chips — <strong>Today, +1d, +2d, +3d, +1w</strong> — or a typed relative value. A live preview pane (in the modal above) mirrors exactly what will be created and flags a missing category; a toast confirms “Task created”.</p>

      <h3 className="sub">Every key</h3>
      <ComposerKeysTable submitLabel="Save the task" />

      <h3 className="sub">Task categories (the CRM's list)</h3>
      <CatGrid items={TASK_CATEGORIES} />
      <p style={{ marginTop: 10 }}>Priorities: <Tag tone="error" size="xs">High</Tag> <Tag tone="warning" size="xs">Medium</Tag> <Tag tone="info" size="xs">Low</Tag></p>

      <div className="docnote brand" style={{ marginTop: 24 }}>
        <span className="dn-ico"><I.edit size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Templates live in the Manager's Notes tab</div>
          <p style={{ margin: 0 }}>A task template carries a button label, subject, description, priority, category, and a due-in-days offset — so your recurring follow-ups (“Proof Requested”, “15-Day Call”) are two keystrokes. See <a href="#templates">Email Templates</a> for the editor itself.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════ CALL LOG ════════ */

const CL_CALLOUTS = [
  { n: 1, target: 'header', title: 'Who you’re logging', text: 'Log call, with the contact and the number that was dialed.' },
  { n: 2, target: 'compose-chips', title: 'Tag chips', text: 'Category, Direction (Inbound/Outbound), and a Voicemail flag. / or “+ tag” to add.' },
  { n: 3, target: 'compose-subject', title: 'Subject', text: 'What the call was about — word-snap turns “inbound” / “out” into the Direction chip.' },
  { n: 4, target: 'footer', title: 'Keyboard legend', text: 'Dialed via tel: · / to compose · ↑↓ move · Enter logs.' },
];
const CL_STEPS = [
  { target: 'header', caption: 'From the shelf, “Call Marcus” dials the number and opens the logger — keyboard-first, ready to compose.', hold: 2400 },
  { target: 'compose-chips', caption: 'Press / (or + tag) to tag the Category, Direction, and a Voicemail flag…', run: (api) => api.openMenu(), hold: 2600 },
  { target: 'compose-chips', caption: '…the coloured chips snap in, each removable with its ×.', run: (api) => api.closeMenu(), hold: 1600 },
  { target: 'compose-subject', caption: 'Type what the call was about. A word like “inbound” + space snaps straight into the Direction chip.', hold: 2600 },
  { target: 'footer', caption: 'Enter writes it to the CRM activity log. The whole flow takes under ten seconds without leaving the keyboard.', hold: 2600 },
];

function CallTemplateListSnippet() {
  const [active, setActive] = useState(0);
  return (
    <MiniFrame width={440} label="call log · templates" pad={false}>
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {SAMPLE_CALL_TEMPLATES.map((tpl, i) => <ClTemplateRow key={tpl.id} tpl={tpl} hotkey={i + 1} isActive={active === i} onClick={() => setActive(i)} />)}
      </div>
    </MiniFrame>
  );
}

function CallComposeSnippet() {
  const [tokens, setTokens] = useState({ category: '27', direction: '0', vm: true });
  const [subject, setSubject] = useState('Left VM — returning their call');
  const [note, setNote] = useState('');
  const [menu, setMenu] = useState(false);
  return (
    <MiniFrame width={460} label="call log · composer" pad={false}>
      <div style={{ position: 'relative' }}>
        <ClComposeBar {...{ tokens, setTokens, subject, setSubject, note, setNote }} onOpenMenu={() => setMenu((v) => !v)} onCommit={() => {}} onClear={() => { setSubject(''); setNote(''); setTokens({}); }} />
        {menu && <div style={{ position: 'absolute', left: 16, right: 16, top: 58, zIndex: 40 }}><ClTokenMenu tokens={tokens} onSelect={() => setMenu(false)} /></div>}
      </div>
    </MiniFrame>
  );
}

function CallTokenMenuSnippet() {
  const [tokens] = useState({ category: '2', direction: '1' });
  return (
    <MiniFrame width={300} label="call log · / menu" pad>
      <ClTokenMenu tokens={tokens} onSelect={() => {}} />
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
        <strong> “Call &lt;name&gt;”</strong> dials the contact (the row hints the number) and opens the
        logger; <strong>“Log incoming call”</strong> opens it without dialing. Submitting writes straight
        to the CRM activity log. Watch it work below, then read each piece beside its live control.
      </p>

      <LiveStage
        width={480}
        frameKind="modal"
        frameLabel="golfballs.com · call log"
        render={(apiRef) => <CallLogLive ref={apiRef} contact="Marcus Chen" phone="(415) 555-0142" />}
        callouts={CL_CALLOUTS}
        steps={CL_STEPS}
        note="Live Call Log composer on sample data — hover the pins, press Play, or Try it yourself."
      />

      <h2 className="sec">Walk through it, piece by piece</h2>
      <p>Each block pairs the real control with what it does. The snippets are live.</p>

      <TourBox n={1} eyebrow="One keystroke" title="The template list" live={<CallTemplateListSnippet />} flip>
        <p>The logger opens in filter mode — type to narrow your call templates, then <span className="kbd">1–9</span> to fire the Nth, <span className="kbd">↑↓</span> + <span className="kbd">Enter</span> to pick, or <span className="kbd">Shift+Enter</span> to customize first.</p>
        <p>Each row shows its <strong>hotkey</strong>, a <strong>direction glyph</strong> (<span style={{ color: 'var(--gb-brand-label)', fontWeight: 700 }}>↗ outbound</span> / <span style={{ color: 'var(--gb-brand-label)', fontWeight: 700 }}>↙ inbound</span> / a voicemail icon), the name, and its <strong>category</strong> chip — so a template's whole shape scans at a glance.</p>
      </TourBox>

      <TourBox stack eyebrow="From scratch" title="The composer" live={<CallComposeSnippet />}>
        <p>Press <span className="kbd">/</span> and the bar grows into the composer. The <strong>chips row</strong> holds three call-specific tokens — <strong>Category</strong>, <strong>Direction</strong> (Inbound/Outbound), and a <strong>Voicemail</strong> flag — each removable with its <span className="kbd">×</span>. Below sit the <strong>Subject</strong> (“What was the call about?”) and <strong>Note</strong> fields.</p>
        <p>Word-snap works here too: typing <code>inbound␣</code> or <code>out␣</code> mid-subject becomes the Direction chip, and <code>vm␣</code> sets the voicemail flag. The dashed <strong>“+ tag”</strong> (or <span className="kbd">/</span>) opens the picker for the rest. It's live — try it.</p>
      </TourBox>

      <TourBox n={2} eyebrow="The / picker" title="Category, Direction & Flag" live={<CallTokenMenuSnippet />} flip>
        <p>The <span className="kbd">/</span> menu groups the tokens: the full <strong>Category</strong> enum, the two <strong>Directions</strong>, and the <strong>Left voicemail</strong> flag — colour-coded, arrow-key navigable, with a check on the active one.</p>
        <p>Categories are the CRM's real call list — the full set is below.</p>
      </TourBox>

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

const OD_CALLOUTS = [
  { n: 1, target: 'approval', title: 'Approval date', text: 'A full month grid — today is dotted, the picked day glows; the readout shows it spelled out.' },
  { n: 2, target: 'commitment', title: 'Commitment date', text: 'The second calendar. A warning appears if you set it before the approval date.' },
  { n: 3, target: 'footer', title: 'Update Dates', text: 'Hands both dates to the multi-step save chain; disabled until both are picked.' },
];
const OD_STEPS = [
  { target: 'header', caption: 'On an order page, Manage order dates in the Actions Shelf opens the Order Date Manager for that order.', hold: 2400 },
  { target: 'approval', caption: 'Pick the approval date on the left calendar. Today is dotted; the chosen day glows and the readout fills in.', run: (api) => api.pickApproval(4), hold: 2800 },
  { target: 'commitment', caption: 'Then the commitment date on the right — set it before approval and a warning flags it.', run: (api) => api.pickCommitment(9), hold: 2800 },
  { target: 'footer', caption: 'Update Dates runs the save. It lights up only once both dates are picked.', hold: 2600 },
];

function CalendarSnippet() {
  const [value, setValue] = useState(() => addDays(new Date(), 4));
  return (
    <MiniFrame width={280} label="order dates · one calendar" pad>
      <div style={{ display: 'flex', justifyContent: 'center' }}><MiniCalendar value={value} onChange={setValue} /></div>
      <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 8, textAlign: 'center' }}>Today is dotted; pick a day and it glows. The arrows page months.</div>
    </MiniFrame>
  );
}

export function CalendarPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Stay Organized</div>
      <h1 className="title">Order Dates</h1>
      <p className="lede">
        Approval and commitment dates without the form maze. On an order page the notes-area toolbar
        gets a smart action — it opens the Order Date Manager: two mini-calendars, approval on the
        left, commitment on the right. Watch it work below, then read each piece beside its live control.
      </p>

      <LiveStage
        width={620}
        frameKind="modal"
        frameLabel="golfballs.com · order #284910"
        render={(apiRef) => <CalendarLive ref={apiRef} orderID="284910" />}
        callouts={OD_CALLOUTS}
        steps={OD_STEPS}
        note="Live Order Date Manager on a sample order — hover the pins, press Play, or pick dates yourself."
      />

      <h2 className="sec">Walk through it, piece by piece</h2>
      <p>Each block pairs the real control with what it does. The snippets are live.</p>

      <TourBox n={1} eyebrow="The picker" title="A month calendar" live={<CalendarSnippet />} flip>
        <p>Each side is a full month grid. <strong>Today</strong> carries a small dot; the <strong>selected day</strong> glows brand-green with its readout spelled out below (“Jun 14, 2026”). The chevrons page through months, and days from adjacent months sit greyed at the edges.</p>
        <p>The two readouts — Approval and Commitment — are what get written to the order.</p>
      </TourBox>

      <TourBox stack eyebrow="What Update Dates does" title="A narrated multi-step save" live={<MiniFrame width={360} label="order dates · save progress" pad><StepChain /></MiniFrame>}>
        <p>Saving dates on the admin site is really a <strong>multi-step form sequence</strong>. Update Dates runs the whole chain for you and shows a <strong>step-by-step progress toast</strong> — you watch each step check off, and a confirmation lands when both dates are committed.</p>
        <p>If a step fails (usually an expired admin session) <strong>the toast names the failing step</strong> and the chain stops — nothing half-saves silently. Re-open the calendar and run it again; the chain restarts from the top and is safe to repeat. Repeated failure at step one means your session expired — reload the order page.</p>
      </TourBox>

      <h2 className="sec">The order actions around it</h2>
      <ul>
        <li><strong>Quick Order Note</strong> — a keyboard-first picker and custom composer for saved order-note templates. <strong>Apply last note</strong> repeats the last saved template you used.</li>
        <li><strong>Auto Push</strong> — the Settings toggle that lets date and note updates push to the order automatically as part of the save chain.</li>
      </ul>
    </div>
  );
}
