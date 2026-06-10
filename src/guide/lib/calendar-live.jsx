import React, { useState, useMemo, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Btn, IconBtn, Icon, I } from '../../ui/index.js';

/* ───────────────────────────────────────────────────────────────
   calendar-live.jsx — a faithful port of CalendarModal.jsx (Order
   Date Manager) for the guide. The real modal is self-contained
   (two month-grid calendars + readouts), so this is a near-verbatim
   copy minus the FloatingPanel chrome, with an imperative API for
   the walkthrough. Reusable pieces:
     • CalendarLive — the whole modal (LiveStage hero)
     • MiniCalendar — one month grid (TourBox cutout)
─────────────────────────────────────────────────────────────── */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtLong = (d) => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

/* ── MiniCalendar — month grid, single date select (verbatim port). */
export function MiniCalendar({ value, onChange }) {
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState(() => new Date((value || today).getFullYear(), (value || today).getMonth(), 1));
  useEffect(() => {
    if (value && (value.getMonth() !== view.getMonth() || value.getFullYear() !== view.getFullYear())) {
      setView(new Date(value.getFullYear(), value.getMonth(), 1));
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - firstDow + 1;
    let date; let outside = false;
    if (dayNum < 1) { date = new Date(year, month - 1, daysInPrev + dayNum); outside = true; }
    else if (dayNum > daysInMonth) { date = new Date(year, month + 1, dayNum - daysInMonth); outside = true; }
    else { date = new Date(year, month, dayNum); }
    cells.push({ date, outside });
  }

  return (
    <div style={{ width: 244, userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <IconBtn size="sm" variant="ghost" onClick={() => setView(new Date(year, month - 1, 1))} icon={<Icon strokeWidth={2.4}><path d="M15 18l-6-6 6-6" /></Icon>} />
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -0.1 }}>{MONTHS[month]} {year}</div>
        <IconBtn size="sm" variant="ghost" onClick={() => setView(new Date(year, month + 1, 1))} icon={<Icon strokeWidth={2.4}><path d="M9 18l6-6-6-6" /></Icon>} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {WEEKDAYS.map((w) => <div key={w} style={{ textAlign: 'center', fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--gb-text-ghost)', padding: '2px 0' }}>{w}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map(({ date, outside }, i) => (
          <DayCell key={i} date={date} outside={outside} selected={sameDay(date, value)} isToday={sameDay(date, today)} onClick={() => onChange(date)} />
        ))}
      </div>
    </div>
  );
}

function DayCell({ date, outside, selected, isToday, onClick }) {
  const [hover, setHover] = useState(false);
  let bg = 'transparent'; let color = 'var(--gb-text-secondary)'; let border = '1px solid transparent'; let shadow = 'none'; let weight = 500;
  if (outside) color = 'var(--gb-text-ghost)';
  if (isToday && !selected) { color = 'var(--gb-brand-label)'; weight = 800; }
  if (hover && !selected) { bg = 'var(--gb-fill-subtle)'; border = '1px solid var(--gb-border-default)'; color = 'var(--gb-text-primary)'; }
  if (selected) { bg = 'var(--gb-brand-tint-medium)'; border = '1px solid var(--gb-brand-label)'; color = 'var(--gb-brand-label)'; shadow = '0 0 12px var(--gb-brand-tint-strong)'; weight = 700; }
  return (
    <button type="button" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={onClick}
      style={{ width: '100%', padding: 0, boxSizing: 'border-box', font: 'inherit', height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: weight, borderRadius: 'var(--gb-r-sm)', background: bg, color, border, boxShadow: shadow, cursor: 'pointer', position: 'relative', transition: 'background var(--gb-anim-fast), border-color var(--gb-anim-fast), color var(--gb-anim-fast)' }}>
      {date.getDate()}
      {isToday && !selected && <span style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: '50%', background: 'var(--gb-brand-label)' }} />}
    </button>
  );
}

export function CalColumn({ label, value, onChange, demo }) {
  return (
    <div data-demo={demo} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)' }}>{label}</span>
      <MiniCalendar value={value} onChange={onChange} />
      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--gb-font-mono)', color: value ? 'var(--gb-brand-label)' : 'var(--gb-text-ghost)', background: value ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)', border: '1px solid ' + (value ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), borderRadius: 'var(--gb-r-sm)', padding: '4px 10px', minWidth: 120, textAlign: 'center', transition: 'all var(--gb-anim-fast)' }}>
        {value ? fmtLong(value) : 'No date'}
      </div>
    </div>
  );
}

const CalIcon = (p) => <Icon {...p}><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></Icon>;

/* ── CalendarLive — the whole modal, faithful, with imperative API. */
export const CalendarLive = forwardRef(function CalendarLive({ orderID = '284910' }, ref) {
  const [approval, setApproval] = useState(() => addDays(new Date(), 5));
  const [commitment, setCommitment] = useState(() => addDays(new Date(), 7));
  const canSave = !!(approval && commitment);

  useImperativeHandle(ref, () => ({
    pickApproval: (n = 4) => setApproval(addDays(new Date(), n)),
    pickCommitment: (n = 9) => setCommitment(addDays(new Date(), n)),
    setApproval, setCommitment,
  }), []);

  return (
    <div style={{ width: 620, display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-canvas)', color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-sans)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', boxShadow: 'var(--gb-shadow-modal)', overflow: 'hidden' }}>
      {/* header */}
      <div data-demo="header" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)' }}>
        <div style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><CalIcon size={15} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Order Date Manager</div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>Order #{orderID}</div>
        </div>
      </div>

      {/* two calendars */}
      <div style={{ padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 20, alignItems: 'start', justifyItems: 'center' }}>
          <CalColumn demo="approval" label="Approval Date" value={approval} onChange={setApproval} />
          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--gb-border-subtle)' }} />
          <CalColumn demo="commitment" label="Commitment Date" value={commitment} onChange={setCommitment} />
        </div>
      </div>

      {/* footer */}
      <div data-demo="footer" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-2)' }}>
        {commitment && approval && commitment < approval && (
          <span style={{ marginRight: 'auto', fontSize: 11, color: 'var(--gb-warning-fg)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><I.alert size={12} /> Commitment is before approval</span>
        )}
        <Btn size="md" variant="secondary">Cancel</Btn>
        <Btn size="md" variant="primary" disabled={!canSave} icon={<Icon strokeWidth={2.5}><path d="M20 6L9 17l-5-5" /></Icon>}>Update Dates</Btn>
      </div>
    </div>
  );
});
