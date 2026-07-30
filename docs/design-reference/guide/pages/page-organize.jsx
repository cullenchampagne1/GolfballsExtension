/* page-organize.jsx — "Stay Organized" section: four separate pages —
   Watch List · Tasks & Quick Task · Call Log · Calendar.
   Live snippets ported from WatchList / TaskList / CallLog / CalendarModal. */
(function () {
  const { useState, useMemo } = React;
  const { I, Btn, Input, Dropdown, Tag, Dot, Field, TemplatePicker, Spinner } = window.GB;
  const TourBox = window.TourBox;
  const MiniFrame = window.MiniFrame;
  window.GBPages = window.GBPages || {};

  /* small pill segmented control */
  function Pills({ value, onChange, options }) {
    return (
      <div style={{ display: 'flex', gap: 3, background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', padding: 3 }}>
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button key={o.id} onClick={() => onChange(o.id)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 8px', borderRadius: 'var(--gb-r-sm)', border: 'none', cursor: 'pointer', background: on ? 'var(--gb-brand-tint-medium)' : 'transparent', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-sans)', fontSize: 11.5, fontWeight: 600, transition: 'background .13s, color .13s' }}>
              {o.label}{typeof o.n === 'number' && <Tag size="xs" tone={on ? 'brand' : 'neutral'}>{o.n}</Tag>}
            </button>
          );
        })}
      </div>
    );
  }

  const HOUR = 3600000;
  const relAge = (ms) => { ms = Math.max(0, ms); if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60000))}m`; if (ms < 24 * HOUR) return `${Math.round(ms / HOUR)}h`; return `${Math.round(ms / (24 * HOUR))}d`; };
  const urgency = (age) => age >= 6 * HOUR ? 'var(--gb-error)' : age >= 4 * HOUR ? 'var(--gb-warning)' : age >= HOUR ? 'var(--gb-info)' : null;

  /* ===================== WATCH LIST ===================== */
  function WatchListSnippet() {
    const now = Date.now();
    const seed = [
      { id: 'w1', title: 'Late proof on Q2 order — chase art team', priority: 'high', ctx: { t: 'order', id: '29103' }, age: 7 * HOUR, done: false },
      { id: 'w2', title: 'Wants a custom logo quote by Friday', priority: 'med', ctx: { t: 'contact', id: '4421', name: 'Marcus Chen' }, age: 2 * HOUR, done: false },
      { id: 'w3', title: 'Confirm reorder timing before month-end', priority: 'low', ctx: { t: 'account', id: '2188', name: 'Acme' }, age: 30 * 60000, done: false },
      { id: 'w4', title: 'Update the price sheet', priority: 'med', ctx: null, age: HOUR, done: false },
      { id: 'w5', title: 'Refund processed — follow up next week', priority: 'med', ctx: { t: 'order', id: '7770' }, age: 30 * HOUR, done: true },
    ];
    const [tasks, setTasks] = useState(seed);
    const [filter, setFilter] = useState('active');
    const counts = { all: tasks.length, active: tasks.filter((t) => !t.done).length, high: tasks.filter((t) => !t.done && t.priority === 'high').length, done: tasks.filter((t) => t.done).length };
    const visible = tasks.filter((t) => filter === 'all' || (filter === 'active' && !t.done) || (filter === 'high' && !t.done && t.priority === 'high') || (filter === 'done' && t.done));
    const toggle = (id) => setTasks((ts) => ts.map((t) => t.id === id ? { ...t, done: !t.done } : t));
    const ctxIcon = (t) => t === 'order' ? <I.copy size={10} /> : t === 'contact' ? <I.user size={10} /> : <I.grid size={10} />;
    const ctxLabel = (c) => c ? `#${c.id}${c.name ? ' · ' + c.name : ''}` : 'Standalone';
    const critical = tasks.filter((t) => !t.done && t.age >= 6 * HOUR).length;
    return (
      <MiniFrame width={560} label="modal · My Watch List" pad={false}>
        <div style={{ padding: '11px 13px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <span style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.eye size={14} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>My Watch List</div>
              <div style={{ fontSize: 10.5, color: critical ? 'var(--gb-error-fg)' : 'var(--gb-text-muted)', fontWeight: critical ? 600 : 500 }}>{counts.active} active{critical ? ` · ${critical} critical` : ''}</div>
            </div>
          </div>
          <Pills value={filter} onChange={setFilter} options={[{ id: 'all', label: 'All', n: counts.all }, { id: 'active', label: 'Active', n: counts.active }, { id: 'high', label: 'High', n: counts.high }, { id: 'done', label: 'Done', n: counts.done }]} />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Input size="sm" placeholder="Search title, context, or due…" leading={<I.search size={12} />} style={{ flex: 1 }} />
            <Btn size="sm" variant="secondary" icon={<I.plus size={11} />}>Watch</Btn>
          </div>
        </div>
        <div className="gb-thin-scroll" style={{ maxHeight: 270, overflowY: 'auto', padding: 7 }}>
          {visible.map((t) => {
            const u = !t.done && urgency(t.age);
            return (
              <div key={t.id} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, opacity: t.done ? 0.55 : 1 }}>
                {u && <span style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, background: u }} />}
                <button onClick={() => toggle(t.id)} style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 5, border: '1.5px solid ' + (t.done ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), background: t.done ? 'var(--gb-brand-tint-medium)' : 'transparent', color: 'var(--gb-brand-label)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.done && <I.check size={11} />}</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Dot tone={t.priority === 'high' ? 'error' : t.priority === 'med' ? 'warning' : 'muted'} size={6} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-primary)', textDecoration: t.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2, fontSize: 10.5, color: t.ctx ? 'var(--gb-text-tertiary)' : 'var(--gb-text-ghost)', fontStyle: t.ctx ? 'normal' : 'italic' }}>{ctxIcon(t.ctx?.t)}{ctxLabel(t.ctx)}</div>
                </div>
                <span style={{ fontSize: 10.5, fontFamily: 'var(--gb-font-mono)', color: u || 'var(--gb-text-muted)', fontWeight: t.age >= 6 * HOUR ? 700 : 500 }}>{t.done ? 'done' : relAge(t.age)}</span>
              </div>
            );
          })}
        </div>
      </MiniFrame>
    );
  }

  /* ===================== TASKS ===================== */
  function TasksSnippet() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = (o) => { const d = new Date(today); d.setDate(d.getDate() + o); return d; };
    const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    const seed = [
      { id: 't1', account: 'Acme Industries', contact: 'Marcus Chen', due: day(-3), cat: 'Follow Up', pri: 1, subject: 'Late proof on Q2 order', status: 'New' },
      { id: 't2', account: 'Pebble Beach Resort', contact: 'Sarah Patel', due: day(0), cat: 'Outbound Call', pri: 1, subject: 'Renewal call — discuss artwork', status: 'New' },
      { id: 't3', account: 'TaylorMade Promo', contact: 'Operations', due: day(0), cat: 'Email', pri: 2, subject: 'Send updated logo specs', status: 'New' },
      { id: 't4', account: 'Brown Custom Gifts', contact: 'Jordan Brown', due: day(2), cat: 'Quote Follow', pri: 2, subject: 'Quote follow-up, 500 units', status: 'New' },
      { id: 't5', account: 'OC Fitness', contact: "Liam O'Connor", due: day(5), cat: 'Outbound Call', pri: 3, subject: 'Reorder check-in', status: 'New' },
    ];
    const [q, setQ] = useState('');
    const [sel, setSel] = useState(() => new Set());
    const rows = seed.filter((t) => !q || `${t.account} ${t.contact} ${t.subject}`.toLowerCase().includes(q.toLowerCase()));
    const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const priTag = (p) => p === 1 ? <Tag size="xs" tone="error">HIGH</Tag> : p === 2 ? <Tag size="xs" tone="warning">MED</Tag> : <Tag size="xs" tone="info">LOW</Tag>;
    const dueColor = (d) => d < today ? 'var(--gb-error-fg)' : d.getTime() === today.getTime() ? 'var(--gb-warning-fg)' : 'var(--gb-text-tertiary)';
    const TH = { textAlign: 'left', fontSize: 9.5, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--gb-text-muted)', fontWeight: 800, padding: '8px 10px', borderBottom: '1px solid var(--gb-border-default)', whiteSpace: 'nowrap' };
    const TD = { padding: '8px 10px', whiteSpace: 'nowrap' };
    const Check = ({ on }) => <span style={{ width: 15, height: 15, borderRadius: 4, border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), background: on ? 'var(--gb-brand-label)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gb-text-on-brand)' }}>{on && <I.check size={10} />}</span>;
    return (
      <MiniFrame width={780} label="modal · My Task List" pad={false}>
        <div style={{ display: 'flex', gap: 8, padding: 11, borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)', alignItems: 'center' }}>
          <Input value={q} onChange={setQ} size="sm" placeholder="Search account, contact, subject…" leading={<I.search size={12} />} style={{ flex: 1 }} />
          <Dropdown size="sm" value="1" options={[{ id: '1', label: 'New tasks' }, { id: '3', label: 'Completed' }, { id: '0', label: 'All statuses' }]} style={{ width: 130 }} />
          <Dropdown size="sm" value="" options={[{ id: '', label: 'All priorities' }, { id: '1', label: 'High' }, { id: '2', label: 'Medium' }, { id: '3', label: 'Low' }]} style={{ width: 130 }} />
          <Btn size="sm" variant="secondary" icon={<I.refresh size={11} />}>Refresh</Btn>
        </div>
        {sel.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-brand-tint-soft)' }}>
            <span style={{ fontSize: 11.5 }}><b style={{ color: 'var(--gb-brand-label)' }}>{sel.size} selected</b></span><div style={{ flex: 1 }} />
            <Btn size="xs" variant="ghost" icon={<I.send size={10} />}>Run workflow</Btn>
            <Btn size="xs" variant="ghost" icon={<I.mail size={10} />}>Email</Btn>
            <Btn size="xs" variant="ghost" icon={<I.copy size={10} />}>Export CSV</Btn>
          </div>
        )}
        <div className="gb-thin-scroll" style={{ maxHeight: 250, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ position: 'sticky', top: 0, background: 'var(--gb-surface-1)', zIndex: 1 }}>
              <th style={{ ...TH, width: 28 }} /><th style={TH}>Account</th><th style={TH}>Contact</th><th style={TH}>Due</th><th style={TH}>Category</th><th style={TH}>Priority</th><th style={TH}>Subject</th>
            </tr></thead>
            <tbody>
              {rows.map((t) => { const on = sel.has(t.id); return (
                <tr key={t.id} onClick={() => toggle(t.id)} style={{ cursor: 'pointer', background: on ? 'var(--gb-brand-tint-soft)' : 'transparent', borderBottom: '1px solid var(--gb-border-subtle)' }}>
                  <td style={TD}><Check on={on} /></td>
                  <td style={{ ...TD, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{t.account}</td>
                  <td style={{ ...TD, color: 'var(--gb-text-tertiary)' }}>{t.contact}</td>
                  <td style={{ ...TD, fontFamily: 'var(--gb-font-mono)', fontWeight: 600, color: dueColor(t.due) }}>{fmt(t.due)}</td>
                  <td style={{ ...TD, color: 'var(--gb-text-tertiary)' }}>{t.cat}</td>
                  <td style={TD}>{priTag(t.pri)}</td>
                  <td style={{ ...TD, color: 'var(--gb-text-secondary)' }}>{t.subject}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)' }}>
          <span style={{ flex: 1, fontSize: 11, color: 'var(--gb-text-muted)' }}>{sel.size ? <>Bulk actions for <b style={{ color: 'var(--gb-text-secondary)' }}>{sel.size}</b> selected</> : 'Select rows to enable bulk actions'}</span>
          <Btn size="sm" variant="ghost" icon={<I.copy size={11} />} disabled={!sel.size}>Open Tabs</Btn>
          <Btn size="sm" variant="ghost" icon={<I.bolt size={11} />} disabled={!sel.size}>Quick Task</Btn>
        </div>
      </MiniFrame>
    );
  }

  /* Quick Task POPOVER (bulk task actions) — faithful to QuickTaskPopover.jsx */
  const PUSH_PRESETS = [['+1d', 1], ['+3d', 3], ['+1w', 7], ['+2w', 14], ['+1mo', 30]];
  function QuickTaskSnippet() {
    const [pushIdx, setPushIdx] = useState(2);
    const [custom, setCustom] = useState(10);
    const showOther = pushIdx === PUSH_PRESETS.length;
    const dueText = showOther ? `+${custom}d` : PUSH_PRESETS[pushIdx][0];
    const Cap = ({ children }) => <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>{children}</div>;
    const chip = (active, onClick, label) => <button key={label} onClick={onClick} style={{ height: 26, padding: '0 10px', background: active ? 'var(--gb-brand-tint-medium)' : 'var(--gb-surface-2)', border: '1px solid ' + (active ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), borderRadius: 'var(--gb-r-sm)', color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontSize: 11, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', cursor: 'pointer', transition: 'all .15s', transform: active ? 'scale(1.02)' : 'none' }}>{label}</button>;
    return (
      <MiniFrame width={296} label="popover · Quick Task" pad={false}>
        {/* drag header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)', cursor: 'grab' }}>
          <span style={{ color: 'var(--gb-text-ghost)', display: 'flex' }}><I.more size={13} /></span>
          <span style={{ width: 22, height: 22, borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-brand-tint-medium)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.check size={12} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Late proof on Q2 order</div>
            <div style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>Acme Industries · Marcus Chen</div>
          </div>
          <span style={{ color: 'var(--gb-text-muted)', display: 'flex', cursor: 'pointer' }}><I.close size={13} /></span>
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--gb-surface-modal)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Tag tone="error" size="xs">HIGH</Tag><span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>Follow Up</span></div>
          <Btn size="md" variant="tinted" status="success" full icon={<I.check size={13} />}>Mark complete</Btn>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><I.calendar size={11} style={{ color: 'var(--gb-info-fg)' }} /><Cap>Push due date</Cap><div style={{ flex: 1 }} /><span style={{ fontSize: 10, color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)', fontWeight: 700 }}>→ {dueText}</span></div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {PUSH_PRESETS.map((p, i) => chip(pushIdx === i, () => setPushIdx(i), p[0]))}
              {chip(showOther, () => setPushIdx(PUSH_PRESETS.length), 'Other')}
            </div>
            {showOther && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)' }}>Push by</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)', height: 28, overflow: 'hidden' }}>
                  <button onClick={() => setCustom((v) => Math.max(1, v - 1))} style={{ height: '100%', width: 26, border: 'none', borderRight: '1px solid var(--gb-border-default)', background: 'transparent', color: 'var(--gb-text-tertiary)', cursor: 'pointer' }}>–</button>
                  <span style={{ minWidth: 46, textAlign: 'center', fontFamily: 'var(--gb-font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{custom}<span style={{ color: 'var(--gb-text-muted)', fontWeight: 500 }}>d</span></span>
                  <button onClick={() => setCustom((v) => Math.min(365, v + 1))} style={{ height: '100%', width: 26, border: 'none', borderLeft: '1px solid var(--gb-border-default)', background: 'transparent', color: 'var(--gb-text-tertiary)', cursor: 'pointer' }}>+</button>
                </div>
              </div>
            )}
            <Btn size="sm" variant="tinted" full icon={<I.calendar size={11} />}>Apply push</Btn>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Btn size="sm" variant="secondary" icon={<I.calendar size={11} />}>Set date</Btn>
            <Btn size="sm" variant="secondary" icon={<I.plus size={11} />}>Add task</Btn>
          </div>
        </div>
      </MiniFrame>
    );
  }

  /* ===================== BULK EMAIL (EmailRunner) — faithful to EmailRunner.jsx ===================== */
  const RUN_TPL = [{ id: 'tpl_followup', name: 'Quote Follow-up', type: 'email', variations: [{ id: 'a', preview: 'Warmer' }, { id: 'b', preview: 'Brief' }] }, { id: 'tpl_thanks', name: 'Thank You', type: 'email', variations: [] }];
  const RUN_PEOPLE = [
    { name: 'Marcus Chen', email: 'marcus@acme.co' }, { name: 'Sarah Patel', email: 'sarah@pebble.com' },
    { name: 'Jordan Brown', email: 'jordan@bcg.io' }, { name: "Liam O'Connor", email: 'liam@ocfitness.ie' },
    { name: 'Dana Whitfield', email: 'dana@whitfield.co' }, { name: 'Priya Shah', email: 'priya@shahgolf.com' },
    { name: 'Tom Becker', email: 'tom@beckerco.com' }, { name: 'Erin Wallace', email: 'erin@wallace.io' },
  ];
  function ER_Radial({ pct, tone }) {
    const r = 22, circ = 2 * Math.PI * r, offset = circ * (1 - pct);
    const stroke = tone === 'success' ? 'var(--gb-success-fg)' : 'var(--gb-brand-label)';
    return (
      <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
        <svg width={56} height={56} viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={28} cy={28} r={r} fill="none" stroke="var(--gb-surface-2)" strokeWidth={4} />
          <circle cx={28} cy={28} r={r} fill="none" stroke={stroke} strokeWidth={4} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.4,0,.2,1)' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)' }}>{Math.round(pct * 100)}%</div>
      </div>
    );
  }
  function ER_CountChip({ tone, value, label }) {
    const t = { success: { bg: 'var(--gb-success-tint-medium)', fg: 'var(--gb-success-fg)' }, neutral: { bg: 'var(--gb-fill-subtle)', fg: 'var(--gb-text-tertiary)' }, error: { bg: 'var(--gb-error-tint-medium)', fg: 'var(--gb-error-fg)' } }[tone];
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 6px', borderRadius: 4, background: t.bg, color: t.fg, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4 }}><b style={{ fontFamily: 'var(--gb-font-mono)' }}>{value}</b>{label}</span>;
  }
  function ER_TrailIcon({ status }) {
    const ok = status === 'sent';
    return <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, background: ok ? 'var(--gb-success-tint-medium)' : 'var(--gb-error-tint-medium)', color: ok ? 'var(--gb-success-fg)' : 'var(--gb-error-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ok ? <I.check size={11} /> : <I.close size={11} />}</span>;
  }
  function EmailRunnerSnippet() {
    const [tplVal, setTplVal] = useState('tpl_followup');
    const [status, setStatus] = useState('idle'); // idle | running | done
    const [progress, setProgress] = useState({ current: 0, total: RUN_PEOPLE.length });
    const [counts, setCounts] = useState({ sent: 0, failed: 0 });
    const [trail, setTrail] = useState([]); // {seq,name,email,status}, newest at END
    const total = RUN_PEOPLE.length;
    const timerRef = React.useRef(null);
    const reset = () => { clearTimeout(timerRef.current); setStatus('idle'); setProgress({ current: 0, total }); setCounts({ sent: 0, failed: 0 }); setTrail([]); };
    const run = () => {
      clearTimeout(timerRef.current); setStatus('running'); setProgress({ current: 0, total }); setCounts({ sent: 0, failed: 0 }); setTrail([]);
      let i = 0;
      const step = () => {
        const ok = !(i === 2 || i === 5); const p = RUN_PEOPLE[i];
        setProgress({ current: i + 1, total });
        setTrail((t) => [...t, { seq: i, name: p.name, email: p.email, status: ok ? 'sent' : 'fail' }]);
        setCounts((c) => ({ sent: c.sent + (ok ? 1 : 0), failed: c.failed + (ok ? 0 : 1) }));
        i += 1;
        if (i < total) timerRef.current = setTimeout(step, 520);
        else timerRef.current = setTimeout(() => setStatus('done'), 420);
      };
      timerRef.current = setTimeout(step, 420);
    };
    React.useEffect(() => () => clearTimeout(timerRef.current), []);
    const settled = counts.sent + counts.failed;
    const pct = total > 0 ? Math.min(1, settled / total) : (status === 'done' ? 1 : 0);
    const queued = Math.max(0, total - settled);
    const isRunning = status === 'running';
    const current = trail[trail.length - 1] || null;
    const canRun = status !== 'running';
    return (
      <MiniFrame width={380} label="popover · Email selected" pad={false}>
        {/* DraggablePopup-style header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)', cursor: 'grab' }}>
          <span style={{ color: 'var(--gb-text-ghost)', display: 'flex' }}><I.more size={13} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Email selected</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>{total} contacts queued</div>
          </div>
          <span style={{ color: 'var(--gb-text-muted)', display: 'flex', cursor: 'pointer', opacity: isRunning ? 0.4 : 1 }}><I.close size={14} /></span>
        </div>
        <div className="gb-thin-scroll" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--gb-surface-modal)', maxHeight: 420, overflowY: 'auto' }}>
          {/* idle form */}
          {status === 'idle' && (
            <Field label="Template" hint={(RUN_TPL.find((t) => t.id === tplVal)?.variations?.length || 0) > 0 ? 'random variation per contact' : undefined}>
              <TemplatePicker mode="random" templates={RUN_TPL} value={tplVal} onChange={setTplVal} listMaxHeight={170} placeholder="Pick a template" />
            </Field>
          )}
          <Field label="Delay between sends" hint="15s–45s (random per contact)">
            <div style={{ height: 6, borderRadius: 3, background: 'var(--gb-fill-soft)', position: 'relative', margin: '6px 2px' }}>
              <span style={{ position: 'absolute', left: '22%', right: '36%', top: 0, bottom: 0, borderRadius: 3, background: 'var(--gb-brand-tint-strong)' }} />
              {['22%', '64%'].map((l) => <span key={l} style={{ position: 'absolute', left: l, top: '50%', width: 13, height: 13, marginTop: -7, marginLeft: -6, borderRadius: '50%', background: 'var(--gb-brand-label)', border: '2px solid var(--gb-surface-modal)', boxShadow: 'var(--gb-shadow-sm, 0 1px 3px rgba(0,0,0,.4))' }} />)}
            </div>
          </Field>
          {/* run status card */}
          {status !== 'idle' && (
            <div style={{ position: 'relative', overflow: 'hidden', padding: 14, borderRadius: 'var(--gb-r-md)', background: 'linear-gradient(180deg, var(--gb-surface-1) 0%, var(--gb-surface-modal) 100%)', border: '1px solid ' + (isRunning ? 'var(--gb-brand-tint-border)' : 'var(--gb-success-tint-border)'), display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', zIndex: 1 }}>
                <ER_Radial pct={pct} tone={isRunning ? 'brand' : 'success'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: isRunning ? 'var(--gb-brand-label)' : 'var(--gb-success-fg)' }}>{isRunning ? 'Now sending' : `Done · ${counts.sent} sent`}</div>
                  {isRunning && current ? (
                    <div key={current.seq} style={{ animation: 'gb-clr-rise .25s ease' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.email}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', marginTop: 3 }}>{counts.failed > 0 ? `${counts.sent} sent · ${counts.failed} failed` : `${counts.sent} of ${total} delivered`}</div>
                  )}
                  <div style={{ display: 'flex', gap: 5, marginTop: 7 }}>
                    <ER_CountChip tone="success" value={counts.sent} label="sent" />
                    <ER_CountChip tone="neutral" value={queued} label="queued" />
                    {counts.failed > 0 && <ER_CountChip tone="error" value={counts.failed} label="fail" />}
                  </div>
                </div>
              </div>
              {isRunning && <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent 0%, var(--gb-brand-tint-soft) 50%, transparent 100%)', mixBlendMode: 'plus-lighter', pointerEvents: 'none', animation: 'gb-er-scan 2.4s linear infinite' }} />}
              {trail.length > 0 && (
                <div style={{ background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-sm)', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
                  {trail.slice(-2).map((r, i, arr) => (
                    <div key={r.seq} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '8px 12px', borderBottom: i < arr.length - 1 ? '1px solid var(--gb-border-subtle)' : 'none', animation: (i === arr.length - 1) ? 'gb-er-trail .34s cubic-bezier(.22,1,.36,1)' : undefined }}>
                      <ER_TrailIcon status={r.status} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                        <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email}</div>
                      </div>
                      <Tag size="xs" tone={r.status === 'sent' ? 'success' : 'error'} mono>{r.status === 'sent' ? 'sent' : 'fail'}</Tag>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)' }}>
          <Btn size="sm" variant={isRunning ? 'tinted' : 'secondary'} status={isRunning ? 'error' : undefined} icon={isRunning ? <I.close size={11} /> : undefined} onClick={reset}>{isRunning ? 'Cancel run' : status === 'done' ? 'Close' : 'Cancel'}</Btn>
          <div style={{ flex: 1 }} />
          <Btn size="sm" variant="tinted" status="brand" icon={isRunning ? <Spin /> : <I.send size={11} />} onClick={run} disabled={!canRun}>{isRunning ? 'Sending…' : status === 'done' ? 'Send again' : `Run · ${total}`}</Btn>
        </div>
      </MiniFrame>
    );
  }
  function Spin() { return <Spinner size={11} />; }

  /* Standalone QUICK TASK creator (the / composer) — faithful to QuickTask.jsx */
  const TASK_CATS = [['1', 'Follow Up', 'info'], ['2', 'Outbound Call', 'brand'], ['3', 'Email', 'success'], ['4', 'Quote Follow', 'warning'], ['5', 'Research', 'neutral']];
  const PRIOS = [['1', 'High', 'error'], ['2', 'Medium', 'warning'], ['3', 'Low', 'info']];
  function QuickTaskCreateSnippet() {
    const C = window.GBComposer;
    const [due, setDue] = useState(3);
    const FlagIcon = (p) => <svg width={p.size || 12} height={p.size || 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V4M4 4h13l-2 4 2 4H4" /></svg>;
    const TagIcon = (p) => <svg width={p.size || 12} height={p.size || 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><circle cx="7" cy="7" r="1.2" /></svg>;
    const catTone = (v) => (TASK_CATS.find((c) => c[0] === v) || [])[2] || 'neutral';
    const catLabel = (v) => (TASK_CATS.find((c) => c[0] === v) || [])[1] || 'Category';
    const schema = {
      filterPlaceholder: 'Filter quick tasks…   or / to compose', subjectPlaceholder: 'What needs doing?', requiredKey: 'category',
      fromTemplate: (t) => { const o = {}; if (t._cat) o.category = t._cat; if (t._pri) o.priority = t._pri; return o; },
      tokenTypes: [
        { key: 'category', menuLabel: 'Category', options: TASK_CATS.map((c) => ({ value: c[0], label: c[1], tone: c[2] })), shorthand: (w) => (TASK_CATS.find((c) => c[1].toLowerCase().split(/[ /]/)[0] === w) || [])[0] || null, chip: (v) => ({ tone: catTone(v), label: catLabel(v), icon: <TagIcon size={12} /> }) },
        { key: 'priority', menuLabel: 'Priority', options: PRIOS.map((p) => ({ value: p[0], label: p[1], tone: p[2] })), shorthand: (w) => ({ high: '1', urgent: '1', med: '2', medium: '2', low: '3' }[w] ?? null), chip: (v) => { const p = PRIOS.find((x) => x[0] === v); return { tone: p[2], label: `${p[1]} priority`, icon: <FlagIcon size={12} /> }; } },
      ],
    };
    const templates = [
      { id: 'q1', name: 'Follow up on quote', subject: 'Follow up on quote', _cat: '4', _pri: '2', _due: '+3d' },
      { id: 'q2', name: 'Send pricing matrix', subject: 'Send pricing matrix', _cat: '3', _pri: '3', _due: '+1d' },
      { id: 'q3', name: 'Reorder check-in call', subject: 'Reorder check-in call', _cat: '2', _pri: '2', _due: '+1w' },
    ];
    const f = C.useComposerFilter(templates);
    const dueLabel = due === 0 ? 'Today' : `+${due}d`;
    const duePill = <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 'var(--gb-r-pill)', background: C.COMPOSER_TONE.brand.bg, border: `1px solid ${C.COMPOSER_TONE.brand.bd}`, color: C.COMPOSER_TONE.brand.fg, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' }}><I.calendar size={11} /> {dueLabel}</span>;
    const buildExtra = () => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, borderTop: '1px solid var(--gb-border-subtle)', paddingTop: 9 }}>
        <span style={{ width: 54, flexShrink: 0, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--gb-text-muted)' }}>Due</span>
        <div style={{ display: 'flex', gap: 4 }}>{[['Today', 0], ['+1d', 1], ['+3d', 3], ['+1w', 7], ['+2w', 14]].map(([l, d]) => <button key={l} onClick={() => setDue(d)} style={{ height: 24, padding: '0 9px', borderRadius: 'var(--gb-r-sm)', border: '1px solid ' + (due === d ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: due === d ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)', color: due === d ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', cursor: 'pointer' }}>{l}</button>)}</div>
      </div>
    );
    const renderList = (ff) => (
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '4px 4px 7px' }}>Quick tasks · {ff.results.length}</div>
        {ff.results.map((t, i) => { const T = C.COMPOSER_TONE[catTone(t._cat)]; return (
          <button key={t.id} ref={(el) => (ff.rowRefs.current[i] = el)} onMouseEnter={() => ff.setActive(i)} onFocus={() => ff.setActive(i)}
            style={{ display: 'grid', gridTemplateColumns: '22px 22px 1fr auto', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 'var(--gb-r-md)', border: '1px solid ' + (ff.active === i ? T.bd : 'transparent'), background: ff.active === i ? T.bg : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
            <span style={{ display: 'flex', justifyContent: 'center', minWidth: 17, height: 17, borderRadius: 4, fontSize: 9.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', alignItems: 'center', background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', color: 'var(--gb-text-tertiary)' }}>{i + 1}</span>
            <span style={{ display: 'flex', justifyContent: 'center', color: T.fg }}><TagIcon size={14} /></span>
            <span style={{ minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
            <span style={{ display: 'flex', gap: 5 }}>
              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', background: C.COMPOSER_TONE.brand.bg, color: C.COMPOSER_TONE.brand.fg, border: `1px solid ${C.COMPOSER_TONE.brand.bd}` }}>{t._due}</span>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', background: T.bg, color: T.fg, border: `1px solid ${T.bd}`, whiteSpace: 'nowrap' }}>{catLabel(t._cat)}</span>
            </span>
          </button>
        ); })}
      </div>
    );
    return (
      <MiniFrame width={480} label="modal · Create task" pad={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <span style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.check size={14} /></span>
          <div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Create task</div><div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>Marcus Chen · Acme Industries</div></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', height: 460 }}>
          <C.KeyboardComposer schema={schema} f={f} onLog={() => {}} onFilterEnter={() => {}} renderList={renderList} contact="Marcus Chen" composeTitle="Composing a task" subjectLabel="Task" noteLabel="Note" saveLabel="Add task" leadIcon={<I.check size={15} />} previewExtraChips={duePill} previewFooterMeta={<span style={{ fontFamily: 'var(--gb-font-mono)' }}>due {dueLabel}</span>} previewReadyLabel="ready" previewNeedLabel="needs category" previewUntitled="Untitled task" buildExtra={buildExtra} />
        </div>
      </MiniFrame>
    );
  }

  /* ===================== CALL LOG (real / composer) ===================== */
  const DirOut = (p) => <svg width={p.size || 12} height={p.size || 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></svg>;
  const DirIn = (p) => <svg width={p.size || 12} height={p.size || 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="17" y1="7" x2="7" y2="17" /><polyline points="17 17 7 17 7 7" /></svg>;
  const VmIcon = (p) => <svg width={p.size || 12} height={p.size || 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="11.5" r="4.5" /><circle cx="18.5" cy="11.5" r="4.5" /><line x1="5.5" y1="16" x2="18.5" y2="16" /></svg>;
  const CALL_CATS = [['connected', 'Connected', 'success'], ['voicemail', 'Left voicemail', 'warning'], ['noanswer', 'No answer', 'error'], ['callback', 'Callback requested', 'info'], ['order', 'Placed an order', 'brand'], ['gatekeeper', 'Spoke with gatekeeper', 'neutral']];
  function CallLogSnippet() {
    const C = window.GBComposer;
    const dot = (tone) => <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.COMPOSER_TONE[tone].solid, display: 'inline-block' }} />;
    const schema = {
      filterPlaceholder: 'Filter call logs…   or / to compose', subjectPlaceholder: 'What was this call about?', requiredKey: 'category',
      tokenTypes: [
        { key: 'category', menuLabel: 'Category', options: CALL_CATS.map((c) => ({ value: c[0], label: c[1], tone: c[2] })), shorthand: (w) => (CALL_CATS.find((c) => c[1].toLowerCase().split(' ')[0] === w) || [])[0] || null, chip: (v) => { const c = CALL_CATS.find((x) => x[0] === v); return { tone: c[2], label: c[1], icon: dot(c[2]) }; } },
        { key: 'direction', menuLabel: 'Direction', options: [{ value: '0', label: 'Outbound', tone: 'brand', icon: <DirOut size={12} /> }, { value: '1', label: 'Inbound', tone: 'brand', icon: <DirIn size={12} /> }], shorthand: (w) => ({ outbound: '0', out: '0', inbound: '1', in: '1' }[w] ?? null), chip: (v) => ({ tone: 'brand', label: v === '1' ? 'Inbound' : 'Outbound', icon: v === '1' ? <DirIn size={12} /> : <DirOut size={12} /> }) },
        { key: 'vm', menuLabel: 'Flag', options: [{ value: true, label: 'Left voicemail', tone: 'warning', icon: <VmIcon size={12} /> }], shorthand: (w) => (w === 'vm' || w === 'voicemail' ? true : null), chip: () => ({ tone: 'warning', label: 'Voicemail', icon: <VmIcon size={12} /> }) },
      ],
    };
    const templates = [
      { id: 'c1', name: 'Left voicemail', subject: 'Left voicemail', _t: 'warning', _m: 'OUT · VM' },
      { id: 'c2', name: 'Connected — discussed pricing', subject: 'Discussed pricing', _t: 'success', _m: 'OUT' },
      { id: 'c3', name: 'No answer', subject: 'No answer', _t: 'error', _m: 'OUT' },
      { id: 'c4', name: 'Inbound — order question', subject: 'Order question', _t: 'success', _m: 'IN' },
    ];
    const f = C.useComposerFilter(templates);
    const renderList = (ff) => (
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '4px 4px 7px' }}>Quick log · {ff.results.length}</div>
        {ff.results.map((t, i) => { const T = C.COMPOSER_TONE[t._t]; return (
          <button key={t.id} ref={(el) => (ff.rowRefs.current[i] = el)} onFocus={() => ff.setActive(i)} onMouseEnter={() => ff.setActive(i)}
            style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 'var(--gb-r-md)', border: '1px solid ' + (ff.active === i ? T.bd : 'transparent'), background: ff.active === i ? T.bg : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
            <span style={{ display: 'flex', justifyContent: 'center', minWidth: 17, height: 17, borderRadius: 4, fontSize: 9.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', alignItems: 'center', background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', color: 'var(--gb-text-tertiary)' }}>{i + 1}</span>
            <span style={{ minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
            <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', letterSpacing: 0.3, padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', background: T.bg, color: T.fg, border: `1px solid ${T.bd}`, whiteSpace: 'nowrap' }}>{t._m}</span>
          </button>
        ); })}
      </div>
    );
    return (
      <MiniFrame width={460} label="modal · Log call" pad={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <span style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.phone size={14} /></span>
          <div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Log call</div><div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>Marcus Chen · (512) 555-1234</div></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', height: 440 }}>
          <C.KeyboardComposer schema={schema} f={f} onLog={() => {}} onFilterEnter={() => {}} renderList={renderList} contact="Marcus Chen" composeTitle="Composing a call log" subjectLabel="Subject" noteLabel="Note" saveLabel="Log call" leadIcon={<I.phone size={15} />} previewReadyLabel="ready" previewNeedLabel="needs category" previewUntitled="Untitled call" />
        </div>
      </MiniFrame>
    );
  }

  /* ===================== CALENDAR ===================== */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  function MiniCalendar({ value, onChange, accent = 'brand' }) {
    const today = new Date();
    const [view, setView] = useState(() => new Date((value || today).getFullYear(), (value || today).getMonth(), 1));
    const year = view.getFullYear(); const month = view.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const dim = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < 42; i++) { const dn = i - firstDow + 1; const outside = dn < 1 || dn > dim; const date = new Date(year, month, dn); cells.push({ date, outside, dn }); }
    const sel = value; const isSel = (d) => sel && d.getFullYear() === sel.getFullYear() && d.getMonth() === sel.getMonth() && d.getDate() === sel.getDate();
    const isToday = (d) => d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    const nav = { width: 24, height: 24, borderRadius: 'var(--gb-r-sm)', border: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', color: 'var(--gb-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
    return (
      <div style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', padding: 11, width: 232 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button style={nav} onClick={() => setView(new Date(year, month - 1, 1))}><I.chevd size={13} style={{ transform: 'rotate(90deg)' }} /></button>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{MONTHS[month]} {year}</div>
          <button style={nav} onClick={() => setView(new Date(year, month + 1, 1))}><I.chevd size={13} style={{ transform: 'rotate(-90deg)' }} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 3 }}>{WEEKDAYS.map((w) => <div key={w} style={{ textAlign: 'center', fontSize: 9, fontWeight: 800, letterSpacing: 0.3, color: 'var(--gb-text-ghost)' }}>{w}</div>)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((c, i) => { const on = isSel(c.date); return (
            <button key={i} onClick={() => onChange(c.date)} style={{ aspectRatio: '1', borderRadius: 'var(--gb-r-sm)', border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : isToday(c.date) && !c.outside ? 'var(--gb-border-default)' : 'transparent'), background: on ? 'var(--gb-brand-tint-medium)' : 'transparent', color: c.outside ? 'var(--gb-text-ghost)' : on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontSize: 11, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.date.getDate()}</button>
          ); })}
        </div>
      </div>
    );
  }
  function CalendarSnippet() {
    const today = new Date();
    const [approval, setApproval] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2));
    const [commitment, setCommitment] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 9));
    const fmtLong = (d) => d ? `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}` : '—';
    return (
      <MiniFrame width={540} label="modal · Order Date Manager · #29103" pad>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-brand-label)', marginBottom: 7 }}>Approval date</div>
            <MiniCalendar value={approval} onChange={setApproval} />
            <div style={{ marginTop: 7, fontSize: 11.5, color: 'var(--gb-text-secondary)', textAlign: 'center' }}>Selected: <b style={{ color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)' }}>{fmtLong(approval)}</b></div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-brand-label)', marginBottom: 7 }}>Commitment date</div>
            <MiniCalendar value={commitment} onChange={setCommitment} />
            <div style={{ marginTop: 7, fontSize: 11.5, color: 'var(--gb-text-secondary)', textAlign: 'center' }}>Selected: <b style={{ color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)' }}>{fmtLong(commitment)}</b></div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--gb-border-subtle)', justifyContent: 'flex-end' }}>
          <Btn size="sm" variant="secondary">Cancel</Btn>
          <Btn size="sm" variant="primary" icon={<I.check size={11} />}>Update Dates</Btn>
        </div>
      </MiniFrame>
    );
  }

  /* ===================== PAGES ===================== */
  function WatchListPage() {
    return (
      <div className="prose">
        <div className="eyebrow">Stay Organized</div>
        <h1 className="title">Watch List</h1>
        <p className="lede">Your personal “don't drop this” list. Flag any order, contact, or account that needs follow-up — straight from the popup's <strong>Watch</strong> button — and it lands here with a priority and an aging clock. Items color-code as they sit unresolved, so nothing quietly slips.</p>
        <TourBox stack title="Everything you're keeping an eye on" live={<WatchListSnippet />} eyebrow="from the popup's Watch button">
          <p>Each item carries a <strong>priority</strong> (the colored dot), an optional <strong>link</strong> to an order/contact/account (or “Standalone”), and an <strong>age</strong>. Tick the checkbox to complete it. Filter by <strong>All / Active / High / Done</strong>, or search. Try it — toggle a few done and switch filters.</p>
        </TourBox>
        <h2 className="sec">How items age</h2>
        <p>The left stripe and the age readout warm up the longer an active item waits, so your eye goes to what's been ignored:</p>
        <table className="spectable">
          <thead><tr><th>Age</th><th>State</th></tr></thead>
          <tbody>
            <tr><td>under 1 hour</td><td>Normal — quiet</td></tr>
            <tr><td>1–4 hours</td><td><span style={{ color: 'var(--gb-info-fg)' }}>Moderate</span> (blue stripe)</td></tr>
            <tr><td>4–6 hours</td><td><span style={{ color: 'var(--gb-warning-fg)' }}>High</span> (amber stripe)</td></tr>
            <tr><td>6+ hours</td><td><span style={{ color: 'var(--gb-error-fg)' }}>Critical</span> (red stripe) — the popup's Watch List badge also turns red</td></tr>
          </tbody>
        </table>
        <div className="docnote info">
          <span className="dn-ico">{I.eye({ size: 15 })}</span>
          <div className="dn-b"><div className="dn-t">Watch List vs. Tasks</div><p style={{ margin: 0 }}>The <strong>Watch List</strong> is your private scratchpad — quick, local reminders that live in the extension. <a href="#tasks">My Tasks</a> is the shared CRM task queue your whole team sees. Use Watch for “remind me,” Tasks for the system of record.</p></div>
        </div>
      </div>
    );
  }

  function TasksPage() {
    return (
      <div className="prose">
        <div className="eyebrow">Stay Organized</div>
        <h1 className="title">Tasks</h1>
        <p className="lede">Your CRM task queue, pulled live and made fast. See every open task, search and filter it, then act on one or many at once — complete, push the due date, <strong>email the whole batch</strong>, or spin up a new task — without round-tripping through the CRM's own pages.</p>
        <TourBox stack title="Every open task, in one table" live={<TasksSnippet />} eyebrow="⌃X · My Tasks">
          <p>Columns mirror the CRM: <strong>Account, Contact, Due, Category, Priority, Subject</strong>. Overdue dates show red, due-today amber. Search or filter by status/priority, sort any column, and tick rows to reveal bulk actions — <strong>Run workflow</strong>, <strong>Email</strong>, <strong>Export CSV</strong>. Select rows in the table above to see the action bar appear.</p>
        </TourBox>
        <h2 className="sec">Quick Task — act without leaving</h2>
        <p>The <strong>Quick Task</strong> button (footer, or per row) opens a small moveable popover that writes straight back to the CRM for the selected task(s):</p>
        <TourBox title="The Quick Task popover" live={<QuickTaskSnippet />} eyebrow="bulk task actions" flip>
          <ul>
            <li><strong>Mark complete / Reopen</strong> — close a task or bring it back.</li>
            <li><strong>Push due date</strong> — bump it +1d / +3d / +1w / +2w / +1mo, or dial a custom day count with the stepper.</li>
            <li><strong>Set date</strong> — jump to a mini calendar to pick an exact due date.</li>
            <li><strong>Add task</strong> — create a follow-up from a template on the same contact.</li>
          </ul>
          <p>Run it on a single row, or select many and apply the same action across all of them at once. (Try the push-date chips above.)</p>
        </TourBox>
        <div className="docnote info">
          <span className="dn-ico">{I.plus({ size: 15 })}</span>
          <div className="dn-b"><div className="dn-t">Creating a brand-new task?</div><p style={{ margin: 0 }}>That's a different tool — the keyboard-first <a href="#quicktask">Quick Task</a> creator, which pops up on any contact/account. The popover above only acts on tasks already in your queue.</p></div>
        </div>

        <h2 className="sec">Bulk email from your tasks</h2>
        <p>The biggest time-saver here: select a batch of tasks and <strong>email every contact at once</strong>. Tick the rows, hit <strong>Email</strong> (or <strong>Run workflow</strong>), and the <strong>Email Runner</strong> pops up — a small, draggable panel that personalizes one template per recipient and sends them on a human-looking, randomized delay.</p>
        <TourBox title="The Email Runner popover" live={<EmailRunnerSnippet />} eyebrow="Email / Run workflow on a selection" flip>
          <p>Pick a <strong>template</strong> (variations send a random version per contact, so a big blast doesn't read like a form letter), set a <strong>delay range</strong> between sends, and press <strong>Run</strong>. The card then tracks the run at a glance:</p>
          <ul>
            <li>A <strong>radial progress ring</strong> with a live percentage, and a sweeping scan-light while it's in flight.</li>
            <li><strong>Now sending</strong> — the current recipient's name and email, updating per send.</li>
            <li><strong>Count chips</strong> — sent · queued · fail — plus a short <strong>trail</strong> of the last couple of recipients with mono <code>sent</code>/<code>fail</code> tags.</li>
            <li>Per-task status (Queued → Sending → Sent) also shows back on the <strong>task list rows</strong> — the popover stays compact and draggable.</li>
          </ul>
          <p>Every email resolves its <code>{'{{variables}}'}</code> against <em>that</em> contact, so names and order numbers are correct per recipient. Press <strong>Run</strong> in the popover to watch a full send; cancel anytime, or <strong>Send again</strong> when it's done.</p>
        </TourBox>
        <table className="spectable">
          <thead><tr><th>Bulk action</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><b>Email</b></td><td>Opens the Email Runner over the selected tasks — one personalized template per contact.</td></tr>
            <tr><td><b>Run workflow</b></td><td>Hands the selection to the workflow manager to sequence multiple emails / tasks over time.</td></tr>
            <tr><td><b>Export CSV</b></td><td>Download the selected tasks with every column (Excel-safe).</td></tr>
            <tr><td><b>Open Tabs</b></td><td>Open each selected task's record in its own browser tab.</td></tr>
          </tbody>
        </table>
        <div className="docnote warn">
          <span className="dn-ico">{I.alert({ size: 15 })}</span>
          <div className="dn-b"><div className="dn-t">Sends are real and spaced on purpose</div><p style={{ margin: 0 }}>The randomized delay (default 15–45s) isn't a limitation — it keeps a large blast from tripping spam heuristics and looking like a robot. A run can fail on individual rows (bad address, no resolved recipient); those show <span style={{ color: 'var(--gb-error-fg)' }}>Failed</span> so you can follow up, while the rest continue.</p></div>
        </div>
        <div className="docnote brand">
          <span className="dn-ico">{I.bolt({ size: 15 })}</span>
          <div className="dn-b"><div className="dn-t">Open it from anywhere</div><p style={{ margin: 0 }}>My Tasks has a keyboard shortcut — <span className="kbd">Ctrl</span> <span className="kbd">X</span> by default — so it's one keypress from any page. Rebind it in <a href="#settings">Settings → Keyboard Shortcuts</a>.</p></div>
        </div>
      </div>
    );
  }

  function CallsPage() {
    return (
      <div className="prose">
        <div className="eyebrow">Stay Organized</div>
        <h1 className="title">Call Log</h1>
        <p className="lede">Log a phone call to the CRM in two clicks. Open it on a contact, pick the outcome, and it's recorded — direction, category, and a voicemail flag included — without typing a thing. Need detail? Compose a custom note instead.</p>
        <TourBox title="Log a call in seconds" live={<CallLogSnippet />} eyebrow="on any contact">
          <p>It opens as a <strong>filter bar</strong> over your saved quick-log presets — type to narrow, <span className="kbd">↑↓</span> to move, <span className="kbd">1</span>–<span className="kbd">9</span> to fire one instantly. Each preset logs the call with its category, direction, and voicemail flag in one keypress.</p>
          <p>Need detail? Press <span className="kbd">/</span> and the bar grows into a composer: pick a <strong>Category</strong>, <strong>Direction</strong>, or <strong>Voicemail</strong> tag from the menu (they become colored chips), type a Subject + Note, and watch the live <strong>Preview</strong> build the entry exactly as it'll be logged. Try pressing <span className="kbd">/</span> in the panel.</p>
        </TourBox>
        <h2 className="sec">The <span className="kbd">/</span> composer</h2>
        <p>The slash input is the powerful part — and it can look complicated, so here's exactly how it works:</p>
        <ul>
          <li><strong>Type to filter</strong> the preset list; <strong>Enter</strong> fires the top match.</li>
          <li><strong><span className="kbd">/</span></strong> opens the tag menu — sections for <strong>Category</strong>, <strong>Direction</strong>, and <strong>Flag</strong>. Arrow + Enter to pick; each becomes a removable chip.</li>
          <li><strong>Shorthand</strong> — typing a recognized word + space snaps to a chip (e.g. <code>inbound</code>, <code>vm</code>, a category name).</li>
          <li><strong>Subject</strong> and <strong>Note</strong> are explicit fields; <strong>Tab</strong> walks them, <strong>Enter</strong> logs, <strong>Esc</strong> resets.</li>
          <li>A <strong>required</strong> category is enforced — the Save button nudges red until one's set.</li>
        </ul>
        <div className="docnote info">
          <span className="dn-ico">{I.phone({ size: 15 })}</span>
          <div className="dn-b"><div className="dn-t">Where it shows up</div><p style={{ margin: 0 }}>Logged calls post to the contact's activity history in the CRM, the same place a manually-entered call note lands — so reporting and follow-ups stay intact.</p></div>
        </div>
      </div>
    );
  }

  function CalendarPage() {
    return (
      <div className="prose">
        <div className="eyebrow">Stay Organized</div>
        <h1 className="title">Calendar &amp; Order Dates</h1>
        <p className="lede">Set an order's key production dates on real month grids instead of typing them into tiny fields. The <strong>Order Date Manager</strong> gives you two calendars — <strong>Approval</strong> and <strong>Commitment</strong> — so the timeline is visual and hard to fat-finger.</p>
        <TourBox stack title="Pick dates on a real calendar" live={<CalendarSnippet />} eyebrow="Order Date Manager">
          <p>Click a day on each grid to set it; the readout below confirms your pick, and <strong>Update Dates</strong> writes both back to the order. Navigate months with the arrows. Try selecting a few dates — both calendars are live.</p>
        </TourBox>
        <h2 className="sec">The two dates</h2>
        <table className="spectable">
          <thead><tr><th>Date</th><th>What it means</th></tr></thead>
          <tbody>
            <tr><td><b>Approval date</b></td><td>When artwork/proof approval is expected — the gate before production can start.</td></tr>
            <tr><td><b>Commitment date</b></td><td>The date you've committed the order will ship / be delivered.</td></tr>
          </tbody>
        </table>
        <div className="docnote brand">
          <span className="dn-ico">{I.calendar({ size: 15 })}</span>
          <div className="dn-b"><div className="dn-t">Saving is one step</div><p style={{ margin: 0 }}>“Update Dates” hands both dates back to the order and shows a centered progress note while it saves — you stay on the page. The feature is toggled by <strong>Calendar</strong> in <a href="#settings">Settings → Features</a>.</p></div>
        </div>
      </div>
    );
  }

  function QuickTaskCreatePage() {
    return (
      <div className="prose">
        <div className="eyebrow">Stay Organized</div>
        <h1 className="title">Quick Task</h1>
        <p className="lede">Spin up a CRM task on the contact or account you're looking at — fast, and without leaving the page. It's a keyboard-first creator: filter your saved task presets, or press <span className="kbd">/</span> to compose one from scratch with category, priority, and a due date.</p>
        <TourBox title="Create a task in a few keystrokes" live={<QuickTaskCreateSnippet />} eyebrow="⌃N-style · on any contact/account">
          <p>The panel opens over your <strong>saved quick-task presets</strong> — type to filter, <span className="kbd">1</span>–<span className="kbd">9</span> to fire one, or hover the edit icon to tweak before adding. Press <span className="kbd">/</span> to build a custom one: tag a <strong>Category</strong> (required) and <strong>Priority</strong>, set a <strong>Due</strong> date inline, write the task + note, and the live preview mirrors the CRM task you'll create. Try the <span className="kbd">/</span> key in the panel.</p>
        </TourBox>
        <div className="docnote brand">
          <span className="dn-ico">{I.check({ size: 15 })}</span>
          <div className="dn-b"><div className="dn-t">Two different “Quick Tasks”</div><p style={{ margin: 0 }}>This page <strong>creates a new task</strong> with the <span className="kbd">/</span> composer — it shares the exact engine as the <a href="#calls">Call Log</a>. The similarly-named popover inside <a href="#tasks">My Tasks</a> instead <strong>acts on existing tasks</strong> (complete, push dates). Same name, two jobs.</p></div>
        </div>

        <h2 className="sec">The <span className="kbd">/</span> composer</h2>
        <p>It's the same keyboard-first slash input the Call Log uses — powerful but worth a tour, since the panel changes shape as you type:</p>
        <ul>
          <li><strong>Type to filter</strong> your saved quick-task presets; <span className="kbd">1</span>–<span className="kbd">9</span> fires one straight in, <span className="kbd">↑↓</span> + Enter to choose.</li>
          <li><strong><span className="kbd">/</span></strong> grows the bar into compose mode and opens the tag menu — sections for <strong>Category</strong> (required) and <strong>Priority</strong>. Arrow + Enter to pick; each becomes a removable chip.</li>
          <li><strong>Shorthand</strong> — typing a recognized word + space snaps to a chip (e.g. <code>high</code>, <code>email</code>, a category name).</li>
          <li><strong>Task</strong> and <strong>Note</strong> are explicit fields, and an inline <strong>Due</strong> row sets the date; <span className="kbd">Tab</span> walks them, <span className="kbd">Enter</span> saves, <span className="kbd">Esc</span> resets.</li>
          <li>The live <strong>Preview</strong> card mirrors the exact CRM task you'll create, and the Save button nudges red until a Category is set.</li>
        </ul>

        <h2 className="sec">What goes into a task</h2>
        <table className="spectable">
          <thead><tr><th>Field</th><th>Notes</th></tr></thead>
          <tbody>
            <tr><td><b>Category</b> <span style={{ color: 'var(--gb-text-muted)' }}>(required)</span></td><td>The real CRM task category — Follow Up, Outbound Call, Email, Quote Follow, Research…</td></tr>
            <tr><td><b>Priority</b></td><td>High / Medium / Low — colors the task in your queue.</td></tr>
            <tr><td><b>Due</b></td><td>Relative chips (Today / +1d / +3d / +1w / +2w) or a typed date.</td></tr>
            <tr><td><b>Subject &amp; Note</b></td><td>The task title and an optional description.</td></tr>
          </tbody>
        </table>
      </div>
    );
  }

  window.GBPages['watchlist'] = { title: 'Watch List', group: 'Stay Organized', icon: 'eye', render: () => <WatchListPage /> };
  window.GBPages['tasks'] = { title: 'Tasks', group: 'Stay Organized', icon: 'check', render: () => <TasksPage /> };
  window.GBPages['quicktask'] = { title: 'Quick Task', group: 'Stay Organized', icon: 'bolt', render: () => <QuickTaskCreatePage /> };
  window.GBPages['calls'] = { title: 'Call Log', group: 'Stay Organized', icon: 'phone', render: () => <CallsPage /> };
  window.GBPages['calendar'] = { title: 'Calendar', group: 'Stay Organized', icon: 'calendar', render: () => <CalendarPage /> };
})();
