/* eslint-disable react/prop-types */
import React from 'react';
import { I, Icon } from '../icons.jsx';
import { COMPOSER_TONE } from './KeyboardComposer.jsx';
import { QT_QUICK, qtFormatTyped, qtParseTyped, qtResolveDue } from '../../lib/quickTask.js';

/* ───────────────────────────────────────────────────────────────
   DueControl — the Quick Task composer's inline due-date field.

   Renders as a labelled "Due" row inside the composer (same shape as
   the Subject / Note rows) and offers two ways to set a due date:
     • quick chips  Today · +1d · +2d · +3d · +1w  → relative daysOut
     • a typed mm/dd/yy specific date               → absolute date
   The quick chips are a ROVING RADIO GROUP: ←/→ move AND select live
   (no confirm key), so Enter stays free as "Add task". Tab steps into
   the mono date field; a typed date overrides the chips.

   State lives in the modal (so its onLog can read the due back) and is
   passed in via `due`/`setDue`. `api` carries the composer's commit /
   reset / focusSubject / focusBody callbacks for the Tab order.
   The ref exposes focus() so the composer can land here from Note.
─────────────────────────────────────────────────────────────── */

const CalIcon = (p) => <Icon {...p}><rect x="3" y="4.5" width="18" height="17" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></Icon>;

const FIELD_TAG = { width: 54, flexShrink: 0, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--gb-text-muted)', userSelect: 'none', paddingTop: 4 };

export const DueControl = React.forwardRef(function DueControl({ due, setDue, api }, ref) {
  const T = COMPOSER_TONE.brand;
  const specific = due.kind === 'specific';
  const fmtShort = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
  const [typed, setTyped]       = React.useState(specific && due.date ? fmtShort(due.date) : '');
  const [focusedIdx, setFocusI] = React.useState(-1);
  const [dateFocused, setDateF] = React.useState(false);
  const chipRefs = React.useRef([]);
  const dateRef  = React.useRef(null);

  const selIdx   = specific ? -1 : QT_QUICK.findIndex((q) => (due.days || 0) === q.days);
  const entryIdx = selIdx >= 0 ? selIdx : 0;

  React.useImperativeHandle(ref, () => ({
    focus()     { chipRefs.current[entryIdx]?.focus(); },
    focusDate() { dateRef.current?.focus(); },
  }));

  const pickQuick = (days) => { setTyped(''); setDue({ kind: 'relative', days }); };
  const onType = (raw) => {
    const fr = qtFormatTyped(raw);
    setTyped(fr);
    const parsed = qtParseTyped(fr);
    if (parsed) setDue({ kind: 'specific', date: parsed });
    else if (fr === '') setDue({ kind: 'relative', days: 0 });
  };
  const moveChip = (from, dir) => {
    const n = Math.max(0, Math.min(QT_QUICK.length - 1, from + dir));
    pickQuick(QT_QUICK[n].days);
    chipRefs.current[n]?.focus();
  };
  const onChipKey = (e, idx) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); moveChip(idx, 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); moveChip(idx, -1); }
    else if (e.key === 'Enter') { e.preventDefault(); api.commit?.(); }
    else if (e.key === ' ') { e.preventDefault(); pickQuick(QT_QUICK[idx].days); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.reset?.(); }
    else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); dateRef.current?.focus(); }
    else if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); api.focusBody?.(); }
  };
  const onDateKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); api.commit?.(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.reset?.(); }
    else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); api.focusSubject?.(); }
    else if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); chipRefs.current[entryIdx]?.focus(); }
  };
  const resolved = qtResolveDue(due);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, borderTop: '1px solid var(--gb-border-subtle)', paddingTop: 9 }}>
      <label style={FIELD_TAG}>Due</label>
      <div role="radiogroup" aria-label="Due date" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        {QT_QUICK.map((q, idx) => {
          const on = !specific && (due.days || 0) === q.days;
          const ring = focusedIdx === idx;
          return (
            <button key={q.key} type="button" role="radio" aria-checked={on}
              ref={(el) => (chipRefs.current[idx] = el)}
              tabIndex={idx === entryIdx ? 0 : -1}
              onClick={() => pickQuick(q.days)}
              onKeyDown={(e) => onChipKey(e, idx)}
              onFocus={() => setFocusI(idx)} onBlur={() => setFocusI(-1)}
              style={{
                display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 9px',
                borderRadius: 'var(--gb-r-pill)', cursor: 'pointer', fontFamily: 'var(--gb-font-sans)',
                fontSize: 11, fontWeight: 700, letterSpacing: 0.2, whiteSpace: 'nowrap', outline: 'none',
                background: on ? T.bgMed : 'var(--gb-fill-subtle)',
                border: `1px solid ${on ? T.bd : 'var(--gb-border-default)'}`,
                color: on ? T.fg : 'var(--gb-text-tertiary)',
                boxShadow: ring ? '0 0 0 2px var(--gb-brand-label), 0 0 0 5px color-mix(in srgb, var(--gb-brand-label) 16%, transparent)' : 'none',
                transition: 'all .14s ease',
              }}>{q.label}</button>
          );
        })}

        <span aria-hidden style={{ width: 1, height: 16, background: 'var(--gb-border-default)', margin: '0 2px' }} />

        {/* specific date — mm/dd/yy */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 4px 0 9px',
          borderRadius: 'var(--gb-r-pill)',
          background: specific ? T.bgMed : 'var(--gb-fill-subtle)',
          border: `1px solid ${specific ? T.bd : 'var(--gb-border-default)'}`,
          boxShadow: dateFocused ? '0 0 0 2px var(--gb-brand-label), 0 0 0 5px color-mix(in srgb, var(--gb-brand-label) 16%, transparent)' : 'none',
          transition: 'all .14s ease',
        }}>
          <CalIcon size={12} style={{ color: specific ? T.fg : 'var(--gb-text-muted)', flexShrink: 0 }} />
          <input ref={dateRef} value={typed} onChange={(e) => onType(e.target.value)} onKeyDown={onDateKey}
            onFocus={() => setDateF(true)} onBlur={() => setDateF(false)}
            inputMode="numeric" placeholder="mm/dd/yy" aria-label="Specific due date"
            name="gb-kc-due" autoComplete="off" spellCheck={false}
            style={{
              width: 64, background: 'transparent', border: 'none', outline: 'none', padding: 0,
              fontFamily: 'var(--gb-font-mono)', fontSize: 11.5, fontWeight: 600, letterSpacing: 0.3,
              color: specific ? T.fg : 'var(--gb-text-secondary)',
            }} />
          {specific && (
            <span role="button" tabIndex={-1} aria-label="Clear date" onClick={() => pickQuick(0)}
              style={{ display: 'flex', cursor: 'pointer', color: T.fg, opacity: 0.75, paddingRight: 3 }}>
              <I.close size={11} />
            </span>
          )}
        </span>

        {/* resolved read-out */}
        <span style={{ fontSize: 10.5, color: resolved.isPast ? 'var(--gb-error)' : 'var(--gb-text-muted)', fontWeight: 600, marginLeft: 2, whiteSpace: 'nowrap' }}>
          {resolved.isPast ? 'in the past' : `→ ${resolved.human}`}
        </span>
      </div>
    </div>
  );
});
