import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FloatingPanel, ModalHeader, Btn, Icon, I } from '../ui/index.js';
import { useModalTopState } from '../lib/actionRegistry.js';

/* ───────────────────────────────────────────────────────────────
   CalendarModal — Order Date Manager (React port of the design
   handoff "Calendar Modal.html", itself ported from the legacy
   src/vanilla/calendar.js full-screen overlay).

   Two native month-grid calendars (Approval + Commitment) with a
   selected-date readout each. "Update Dates" hands the picked dates
   back via onSubmit; the caller runs the save and shows progress in
   a CENTERED step notification (see lib/submitOrderDates.js) rather
   than an in-modal loading view.

   Props
     orderID            string|number   shown in the header
     defaultApproval    Date|string?    seed the approval calendar
     defaultCommitment  Date|string?    seed the commitment calendar
     layout             'side-by-side' | 'stacked'
     onSubmit           ({approval, commitment}) => void   REQUIRED
     onClosed, bindClose  FloatingPanel close plumbing
─────────────────────────────────────────────────────────────── */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const sameDay = (a, b) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtLong = (d) => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const toDate = (v) => { if (!v) return null; if (v instanceof Date) return v; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

/* ── Mini month-grid calendar — single date select ── */
function MiniCalendar({ value, onChange }) {
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

  const navBtn = {
    width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', color: 'var(--gb-text-muted)',
    background: 'transparent', border: '1px solid transparent', transition: 'all var(--gb-anim-fast)',
  };
  const hoverNav = (e, on) => {
    e.currentTarget.style.background = on ? 'var(--gb-fill-subtle)' : 'transparent';
    e.currentTarget.style.color = on ? 'var(--gb-text-primary)' : 'var(--gb-text-muted)';
  };

  return (
    <div style={{ width: 244, userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div role="button" tabIndex={0} style={navBtn}
          onClick={() => setView(new Date(year, month - 1, 1))}
          onMouseEnter={(e) => hoverNav(e, true)} onMouseLeave={(e) => hoverNav(e, false)}>
          <Icon size={14} strokeWidth={2.4}><path d="M15 18l-6-6 6-6" /></Icon>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -0.1 }}>
          {MONTHS[month]} {year}
        </div>
        <div role="button" tabIndex={0} style={navBtn}
          onClick={() => setView(new Date(year, month + 1, 1))}
          onMouseEnter={(e) => hoverNav(e, true)} onMouseLeave={(e) => hoverNav(e, false)}>
          <Icon size={14} strokeWidth={2.4}><path d="M9 18l6-6-6-6" /></Icon>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--gb-text-ghost)', padding: '2px 0' }}>{w}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map(({ date, outside }, i) => (
          <DayCell key={i} date={date} outside={outside}
            selected={sameDay(date, value)} isToday={sameDay(date, today)}
            onClick={() => onChange(date)} />
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
  if (selected) {
    bg = 'var(--gb-brand-tint-medium)'; border = '1px solid var(--gb-brand-label)'; color = 'var(--gb-brand-label)';
    shadow = '0 0 12px var(--gb-brand-tint-strong)'; weight = 700;
  }
  return (
    <div role="button" tabIndex={0}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={onClick}
      style={{
        height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12.5, fontWeight: weight, borderRadius: 'var(--gb-r-sm)',
        background: bg, color, border, boxShadow: shadow, cursor: 'pointer', position: 'relative',
        transition: 'background var(--gb-anim-fast), border-color var(--gb-anim-fast), color var(--gb-anim-fast)',
      }}>
      {date.getDate()}
      {isToday && !selected && (
        <span style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: '50%', background: 'var(--gb-brand-label)' }} />
      )}
    </div>
  );
}

function CalColumn({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)' }}>{label}</span>
      <MiniCalendar value={value} onChange={onChange} />
      <div style={{
        fontSize: 12, fontWeight: 600, fontFamily: 'var(--gb-font-mono)',
        color: value ? 'var(--gb-brand-label)' : 'var(--gb-text-ghost)',
        background: value ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)',
        border: '1px solid ' + (value ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
        borderRadius: 'var(--gb-r-sm)', padding: '4px 10px', minWidth: 120, textAlign: 'center',
        transition: 'all var(--gb-anim-fast)',
      }}>
        {value ? fmtLong(value) : 'No date'}
      </div>
    </div>
  );
}

const CalIcon = (p) => <Icon {...p}><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></Icon>;

export function CalendarModal({
  orderID,
  defaultApproval,
  defaultCommitment,
  layout = 'side-by-side',
  onSubmit,
  onClosed,
  bindClose,
}) {
  const [approval, setApproval] = useState(() => toDate(defaultApproval) || addDays(new Date(), 5));
  const [commitment, setCommitment] = useState(() => toDate(defaultCommitment) || addDays(new Date(), 7));
  const stacked = layout === 'stacked';
  const canSave = !!(approval && commitment);

  const bindCloseRef = useRef(null);
  const handleBindClose = (fn) => { bindCloseRef.current = fn; bindClose?.(fn); };
  const animatedClose = () => bindCloseRef.current?.();

  const modalVisible = useModalTopState('order-calendar', 'Order Date Manager');

  const handleSubmit = () => {
    if (!canSave) return;
    onSubmit?.({ approval, commitment });
    animatedClose();
  };

  return (
    <FloatingPanel
      width={stacked ? 420 : 620}
      backdrop
      draggable={false}
      visible={modalVisible}
      onClose={onClosed}
      bindClose={handleBindClose}
    >
      <ModalHeader
        icon={<CalIcon />}
        title="Order Date Manager"
        subtitle={orderID ? `Order #${orderID}` : undefined}
      />

      <div style={{ padding: 28 }}>
        <div style={{
          display: stacked ? 'flex' : 'grid',
          flexDirection: stacked ? 'column' : undefined,
          gridTemplateColumns: stacked ? undefined : '1fr auto 1fr',
          gap: stacked ? 28 : 24,
          alignItems: stacked ? 'center' : 'start',
          justifyItems: 'center',
        }}>
          <CalColumn label="Approval Date" value={approval} onChange={setApproval} />
          {!stacked && <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--gb-border-subtle)' }} />}
          <CalColumn label="Commitment Date" value={commitment} onChange={setCommitment} />
        </div>
      </div>

      <div style={{
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end',
        borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-2)',
      }}>
        {commitment && approval && commitment < approval && (
          <span style={{ marginRight: 'auto', fontSize: 11, color: 'var(--gb-warning-fg)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <I.alert size={12} /> Commitment is before approval
          </span>
        )}
        <Btn size="md" variant="secondary" onClick={animatedClose}>Cancel</Btn>
        <Btn size="md" variant="primary" disabled={!canSave}
          icon={<Icon strokeWidth={2.5}><path d="M20 6L9 17l-5-5" /></Icon>}
          onClick={handleSubmit}>Update Dates</Btn>
      </div>
    </FloatingPanel>
  );
}
