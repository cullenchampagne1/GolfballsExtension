import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { I } from '../icons.jsx';

/* ───────────────────────────────────────────────────────────────
   DatePicker — themed date + time picker.

   Storage format is an ISO-ish string: `YYYY-MM-DDTHH:MM` (no
   timezone, treated as local). null/empty means "no date set".

   Two exports:
     • <DatePicker value onChange ... />
         Input-style trigger that opens a popover-anchored calendar.
     • formatHumanDate(value, opts?)
         Pure helper. Returns:
           ""               for null/empty
           "Today at 2:00 PM"
           "Tomorrow at 9 AM"
           "Yesterday at 5 PM"
           "Thursday at 2 PM"        (within next 6 days)
           "Last Thursday at 2 PM"   (within past 6 days)
           "Next Tuesday at 2 PM"    (1–2 weeks out)
           "May 5 at 5 PM"           (this year)
           "May 5, 2027 at 5 PM"     (other year)
           "May 5"                   (date-only, no time)
─────────────────────────────────────────────────────────────── */

/* ── Pure helpers — also usable elsewhere without importing the
   visual component. Export both shapes. ─────────────────────── */

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_FULL    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* Parse our ISO-ish value safely. Returns null on bad input. */
export function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;
  // Accept either "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" (no tz).
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!m) {
    // Last-ditch — try the native parser, but only accept reasonable results.
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, yy, mo, dd, hh, mi] = m;
  return new Date(+yy, +mo - 1, +dd, hh ? +hh : 0, mi ? +mi : 0, 0, 0);
}

/* Serialize a Date → "YYYY-MM-DDTHH:MM" (or "YYYY-MM-DD" if time omitted). */
export function serializeDateValue(date, includeTime = true) {
  if (!date) return '';
  const yy = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  if (!includeTime) return `${yy}-${mo}-${dd}`;
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yy}-${mo}-${dd}T${hh}:${mi}`;
}

/* Zero-out the time so two dates can be compared as "same day". */
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function diffDays(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / (24 * 3600 * 1000));
}

/* Format hours+minutes as "2 PM" / "2:30 PM" / "12 AM". 12-hour. */
function formatTime(d) {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  if (m === 0) return `${h12} ${ampm}`;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/* Add an ordinal suffix to a day number — "5th", "21st", "2nd". */
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * formatHumanDate(value, opts?)
 *   value:   "YYYY-MM-DDTHH:MM" | "YYYY-MM-DD" | Date | null
 *   opts.now:        anchor "now" (defaults to current time)
 *   opts.includeTime overrideable; null/undefined = auto (include if value had a time)
 *   opts.ordinalDay  use "May 5th" instead of "May 5" (defaults to false)
 *
 * Returns a short, English natural-language label.
 */
export function formatHumanDate(value, opts = {}) {
  const d = parseDateValue(value);
  if (!d) return '';
  const now = opts.now instanceof Date ? opts.now : new Date();
  // Auto includeTime: only include if the parsed value carried hours/minutes
  // that weren't both zero — or always include when the source is a Date.
  const includeTime = opts.includeTime ?? (
    value instanceof Date
      ? true
      : /T\d{2}:\d{2}$/.test(String(value)) && !(/T00:00$/.test(String(value)))
  );
  const ordinalDay = !!opts.ordinalDay;
  const timePart = includeTime ? ` at ${formatTime(d)}` : '';

  const delta = diffDays(d, now);

  if (delta === 0)  return `Today${timePart}`;
  if (delta === 1)  return `Tomorrow${timePart}`;
  if (delta === -1) return `Yesterday${timePart}`;
  if (delta >= 2 && delta <= 6) {
    // "Thursday at 2 PM" / "Next Tuesday at 2 PM" — the latter when
    // the date crosses the upcoming week boundary (Sunday).
    const dayName = DAYS_FULL[d.getDay()];
    return `${dayName}${timePart}`;
  }
  if (delta >= 7 && delta <= 13) {
    const dayName = DAYS_FULL[d.getDay()];
    return `Next ${dayName}${timePart}`;
  }
  if (delta <= -2 && delta >= -6) {
    const dayName = DAYS_FULL[d.getDay()];
    return `Last ${dayName}${timePart}`;
  }
  // Generic absolute format. Same year → "May 5"; different year → "May 5, 2027".
  const sameYear = d.getFullYear() === now.getFullYear();
  const dayLabel = ordinalDay ? ordinal(d.getDate()) : d.getDate();
  const ym = sameYear
    ? `${MONTHS_SHORT[d.getMonth()]} ${dayLabel}`
    : `${MONTHS_SHORT[d.getMonth()]} ${dayLabel}, ${d.getFullYear()}`;
  return `${ym}${timePart}`;
}

/* ── Trigger ──────────────────────────────────────────────────
   <DatePicker value onChange placeholder ... />
   Looks like the design-system Input: same border / surface / radius.
   Click anywhere on it to open the popover. */
export function DatePicker({
  value,
  onChange,
  placeholder = 'No date',
  includeTime = true,
  disabled,
  clearable = true,
  style,
}) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const label = useMemo(
    () => value ? formatHumanDate(value, { includeTime }) : '',
    [value, includeTime],
  );

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          width: '100%', minWidth: 0,
          height: 30,
          padding: '0 10px',
          background: 'var(--gb-surface-2)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-sm)',
          color: label ? 'var(--gb-text-primary)' : 'var(--gb-text-ghost)',
          fontFamily: 'inherit',
          fontSize: 12,
          fontWeight: 500,
          cursor: disabled ? 'default' : 'pointer',
          textAlign: 'left',
          outline: 'none',
          transition: 'border-color .14s',
          ...style,
        }}
        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = 'var(--gb-border-strong)'; }}
        onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.borderColor = 'var(--gb-border-default)'; }}
      >
        <CalendarIcon size={12} style={{ color: 'var(--gb-text-tertiary)', flexShrink: 0 }} />
        <span style={{
          flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label || placeholder}</span>
        {value && clearable && !disabled && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onChange?.(''); }}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 16, height: 16,
              borderRadius: 'var(--gb-r-xs)',
              color: 'var(--gb-text-tertiary)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gb-text-primary)'; e.currentTarget.style.background = 'var(--gb-fill-soft)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--gb-text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <I.close size={10} />
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <DatePickerPopover
            value={value}
            anchorRef={anchorRef}
            includeTime={includeTime}
            onChange={(v) => { onChange?.(v); }}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ── Popover ──────────────────────────────────────────────────
   Portaled to body. Animated month transitions. Time row inline. */
const POPOVER_W = 260;
function DatePickerPopover({ value, anchorRef, onChange, onClose, includeTime }) {
  const ref = useRef(null);
  const parsed = parseDateValue(value);
  // Currently-viewed month + the live edited Date (so time changes don't
  // commit until the user picks). Both initialize from `value` once.
  const [view, setView] = useState(() => {
    const base = parsed || new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  // Slide direction for month animations: 1 = forward, -1 = back, 0 = none.
  const [dir, setDir] = useState(0);
  const [time, setTime] = useState(() => ({
    h: parsed ? parsed.getHours() : 9,
    m: parsed ? parsed.getMinutes() : 0,
  }));

  // Position anchor → fixed viewport coords; recompute on resize.
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const update = () => {
      const el = anchorRef?.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const estH = includeTime ? 320 : 260;
      const flipUp = window.innerHeight - r.bottom - 6 < estH && r.top > estH + 6;
      let left = r.left;
      // Clamp inside viewport horizontally.
      if (left + POPOVER_W > window.innerWidth - 4) left = window.innerWidth - POPOVER_W - 4;
      if (left < 4) left = 4;
      setPos({
        top: flipUp ? r.top - 6 - estH : r.bottom + 6,
        left,
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [anchorRef, includeTime]);

  // Outside click + Esc close.
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose?.();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  const today = startOfDay(new Date());
  const selectedDay = parsed ? startOfDay(parsed) : null;

  // Build the 6×7 calendar grid for the current view month.
  const cells = useMemo(() => buildMonthGrid(view), [view]);

  const goMonth = (delta) => {
    setDir(delta > 0 ? 1 : -1);
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  };

  const pickDay = (date) => {
    const next = new Date(date);
    if (includeTime) next.setHours(time.h, time.m, 0, 0);
    onChange?.(serializeDateValue(next, includeTime));
    // Stay open so the user can adjust time. If they didn't want to,
    // a click outside or Esc closes — same as the color picker.
  };

  const commitTime = (h, m) => {
    setTime({ h, m });
    if (selectedDay) {
      const next = new Date(selectedDay);
      next.setHours(h, m, 0, 0);
      onChange?.(serializeDateValue(next, includeTime));
    }
  };

  if (!pos) return null;
  return createPortal(
    <motion.div
      ref={ref}
      className="gb-datepicker"
      data-gb-scale="popovers"
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: 'fixed',
        top: pos.top, left: pos.left,
        zIndex: 2147483500,
        width: POPOVER_W,
        padding: 10,
        background: 'var(--gb-surface-modal)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-md)',
        boxShadow: '0 12px 36px -10px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.05) inset',
        display: 'flex', flexDirection: 'column', gap: 8,
        fontFamily: 'var(--gb-font-sans)',
      }}
    >
      {/* Month header with prev/next + month-name */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <NavButton onClick={() => goMonth(-1)} dir="left" />
        <div style={{
          flex: 1, textAlign: 'center',
          fontSize: 12, fontWeight: 700,
          color: 'var(--gb-text-primary)',
          letterSpacing: 0.2,
        }}>
          {MONTHS_FULL[view.getMonth()]} {view.getFullYear()}
        </div>
        <NavButton onClick={() => goMonth(1)} dir="right" />
      </div>

      {/* Quick-pick row */}
      <div style={{ display: 'flex', gap: 4 }}>
        {[
          { label: 'Today',    when: () => { const d = new Date(); d.setHours(time.h, time.m, 0, 0); return d; } },
          { label: 'Tomorrow', when: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(time.h, time.m, 0, 0); return d; } },
          { label: '+1 week',  when: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(time.h, time.m, 0, 0); return d; } },
        ].map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => {
              const d = q.when();
              setView(new Date(d.getFullYear(), d.getMonth(), 1));
              onChange?.(serializeDateValue(d, includeTime));
            }}
            style={{
              flex: 1, padding: '4px 6px',
              fontSize: 10, fontWeight: 600, letterSpacing: 0.2,
              color: 'var(--gb-text-tertiary)',
              background: 'var(--gb-surface-2)',
              border: '1px solid var(--gb-border-default)',
              borderRadius: 'var(--gb-r-xs)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background-color .12s, color .12s, border-color .12s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gb-brand-label)'; e.currentTarget.style.borderColor = 'var(--gb-brand-tint-border)'; e.currentTarget.style.background = 'var(--gb-brand-tint-soft)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--gb-text-tertiary)'; e.currentTarget.style.borderColor = 'var(--gb-border-default)'; e.currentTarget.style.background = 'var(--gb-surface-2)'; }}
          >{q.label}</button>
        ))}
      </div>

      {/* Day-of-week header */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 1,
        fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: 'var(--gb-text-ghost)',
      }}>
        {DAYS_SHORT.map((d) => (
          <div key={d} style={{ textAlign: 'center', padding: '4px 0' }}>{d[0]}</div>
        ))}
      </div>

      {/* Month grid with slide animation between months */}
      <div style={{ position: 'relative', height: 6 * 32 }}>
        <AnimatePresence initial={false} mode="popLayout" custom={dir}>
          <motion.div
            key={`${view.getFullYear()}-${view.getMonth()}`}
            custom={dir}
            initial={dir === 0
              ? { opacity: 1, x: 0 }
              : { opacity: 0, x: dir > 0 ? 24 : -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={(d) => ({ opacity: 0, x: d > 0 ? -24 : 24 })}
            transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.7 }}
            style={{
              position: 'absolute', inset: 0,
              display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 1,
            }}
          >
            {cells.map((cell, i) => {
              const dDate = cell.date;
              const isOther = cell.outside;
              const isToday = diffDays(dDate, today) === 0;
              const isSelected = selectedDay && diffDays(dDate, selectedDay) === 0;
              return (
                <DayCell
                  key={i}
                  day={dDate.getDate()}
                  isToday={isToday}
                  isSelected={!!isSelected}
                  isOther={isOther}
                  onClick={() => pickDay(dDate)}
                />
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Time row */}
      {includeTime && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginTop: 2,
          paddingTop: 8,
          borderTop: '1px solid var(--gb-border-subtle)',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
            textTransform: 'uppercase',
            color: 'var(--gb-text-muted)',
          }}>Time</span>
          <TimeInput
            value={{ h: time.h, m: time.m }}
            onChange={(v) => commitTime(v.h, v.m)}
          />
          <div style={{ flex: 1 }} />
          {selectedDay && (
            <button
              type="button"
              onClick={() => { onChange?.(''); onClose?.(); }}
              style={{
                background: 'transparent', border: 'none', padding: 0,
                fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                color: 'var(--gb-text-tertiary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gb-error-fg)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--gb-text-tertiary)'; }}
            >Clear</button>
          )}
        </div>
      )}
    </motion.div>,
    document.body,
  );
}

/* Build a flat 42-cell grid (6 weeks × 7 days) for `view`. Cells
   outside the view month are still real Date objects so range
   navigation works correctly. */
function buildMonthGrid(view) {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const startOffset = first.getDay(); // 0 = Sunday
  const startDate = new Date(first);
  startDate.setDate(startDate.getDate() - startOffset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    cells.push({ date: d, outside: d.getMonth() !== view.getMonth() });
  }
  return cells;
}

function DayCell({ day, isToday, isSelected, isOther, onClick }) {
  // Three visual states: selected (brand fill), today (brand ring), normal.
  const bg = isSelected
    ? 'var(--gb-brand-label)'
    : 'transparent';
  const color = isSelected
    ? 'var(--gb-text-on-brand, #fff)'
    : isOther
      ? 'var(--gb-text-ghost)'
      : 'var(--gb-text-primary)';
  const border = isToday && !isSelected
    ? '1.5px solid var(--gb-brand-label)'
    : '1.5px solid transparent';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      style={{
        height: 30,
        background: bg,
        color,
        border,
        borderRadius: 'var(--gb-r-xs)',
        fontSize: 11.5,
        fontWeight: isSelected || isToday ? 700 : 500,
        cursor: 'pointer',
        outline: 'none',
        fontFamily: 'inherit',
        transition: 'background-color .15s, color .15s',
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--gb-fill-soft)'; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
    >
      {day}
    </motion.button>
  );
}

/* TimeInput — H : M  AM/PM segmented. Compact, theme-matched. */
function TimeInput({ value, onChange }) {
  const h = value.h ?? 9;
  const m = value.m ?? 0;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;

  const update = (next) => onChange({ h: next.h, m: next.m });

  const setHour12 = (h12Next) => {
    let h24 = h12Next % 12;
    if (ampm === 'PM') h24 += 12;
    update({ h: h24, m });
  };
  const setMinute = (mNext) => update({ h, m: Math.max(0, Math.min(59, mNext)) });
  const toggleMeridiem = () => {
    let h24 = h;
    if (ampm === 'AM') h24 += 12; else h24 -= 12;
    if (h24 < 0) h24 += 24;
    if (h24 >= 24) h24 -= 24;
    update({ h: h24, m });
  };

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 4px',
      background: 'var(--gb-surface-2)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-xs)',
    }}>
      <NumInput
        value={h12}
        min={1} max={12}
        onChange={setHour12}
        ariaLabel="Hour"
      />
      <span style={{ color: 'var(--gb-text-tertiary)', fontWeight: 700, fontSize: 11 }}>:</span>
      <NumInput
        value={m}
        min={0} max={59}
        pad2
        onChange={setMinute}
        ariaLabel="Minute"
      />
      <button
        type="button"
        onClick={toggleMeridiem}
        style={{
          padding: '2px 6px',
          background: 'transparent',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-xs)',
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
          color: 'var(--gb-text-secondary)',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >{ampm}</button>
    </div>
  );
}

function NumInput({ value, min, max, pad2, onChange, ariaLabel }) {
  const [draft, setDraft] = useState(String(value));
  // Keep draft synced when value flips from outside (quick-pick, etc).
  useEffect(() => { setDraft(pad2 ? String(value).padStart(2, '0') : String(value)); }, [value, pad2]);
  const commit = () => {
    const n = parseInt(draft.replace(/\D/g, ''), 10);
    if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
    else setDraft(pad2 ? String(value).padStart(2, '0') : String(value));
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); e.currentTarget.blur(); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); onChange(Math.min(max, value + 1)); }
        if (e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(min, value - 1)); }
      }}
      style={{
        width: 22,
        padding: '1px 0',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        textAlign: 'center',
        fontFamily: 'var(--gb-font-mono)',
        fontSize: 11, fontWeight: 700,
        color: 'var(--gb-text-primary)',
      }}
    />
  );
}

function NavButton({ onClick, dir }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      style={{
        width: 22, height: 22, padding: 0,
        background: 'transparent',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-xs)',
        color: 'var(--gb-text-tertiary)',
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        outline: 'none',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gb-text-primary)'; e.currentTarget.style.background = 'var(--gb-fill-soft)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--gb-text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}
      aria-label={dir === 'left' ? 'Previous month' : 'Next month'}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {dir === 'left' ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
      </svg>
    </motion.button>
  );
}

function CalendarIcon({ size = 14, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8"  y1="2" x2="8"  y2="6" />
      <line x1="3"  y1="10" x2="21" y2="10" />
    </svg>
  );
}
