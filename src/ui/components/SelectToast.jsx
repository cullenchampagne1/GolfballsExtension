import React, { useState } from 'react';
import { I } from '../icons.jsx';

/**
 * SelectToast — a notification that asks the user to PICK one item
 * from a list of candidates. Same chrome as StepToast (header w/
 * title + close, body w/ rows) but each row is clickable and an
 * onPick callback fires with the picked item.
 *
 * Use for:  "we found N possibilities, which one is correct?"
 *           e.g. find-phone scanning orders → user picks the right number.
 * Avoid:    one-shot decisions (use ActionToast with primary/secondary)
 *           or pure status updates (use PillToast).
 *
 * Required CSS (already in theme.css): gb-toast-in-top, gb-spin
 *
 * Props
 *   title       string                  — header label
 *   subtitle    string?                 — small muted line under title
 *   items       Array<{ id, label, hint?, badge?, icon? }>
 *                                       — visible rows; click fires onPick(item)
 *   onPick      (item) => void          — required
 *   onDismiss   () => void
 *   size        'md' | 'sm'              default 'md'
 *   busy        boolean                 — show header spinner (e.g. still scanning)
 */
const SIZES = {
  md: { width: 340, headPad: '10px 12px', spinner: 12, head: 12,   sub: 10,  bodyPad: 6,  rowPad: '8px 10px 8px 9px', icon: 26, iconSvg: 13, label: 12.5, hint: 10.5, close: 10 },
  sm: { width: 280, headPad: '7px 9px',   spinner: 10, head: 11,   sub: 9.5, bodyPad: 5,  rowPad: '6px 8px 6px 7px',  icon: 22, iconSvg: 11, label: 11.5, hint: 9.5,  close: 9  },
};

export function SelectToast({
  title = 'Pick one',
  subtitle = '',
  items = [],
  onPick,
  onDismiss,
  size = 'md',
  busy = false,
}) {
  const s = SIZES[size] || SIZES.md;

  return (
    <div style={{
      pointerEvents: 'auto',
      width: s.width,
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-brand-tint-border)',
      borderRadius: 'var(--gb-r-lg)',
      boxShadow: 'var(--gb-shadow-popover)',
      overflow: 'hidden',
    }}>
      {/* Header — spinner (if busy) + title + subtitle + close */}
      <div style={{
        padding: s.headPad,
        display: 'flex', alignItems: 'center', gap: 9,
        borderBottom: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-brand-tint-soft)',
      }}>
        {busy && (
          <span style={{
            width: s.spinner, height: s.spinner, borderRadius: '50%',
            border: '2px solid var(--gb-brand-label)', borderTopColor: 'transparent',
            animation: 'gb-spin .8s linear infinite',
            flexShrink: 0,
          }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: s.head, fontWeight: 700, color: 'var(--gb-brand-label)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{title}</div>
          {subtitle && (
            <div style={{
              fontSize: s.sub, color: 'var(--gb-text-muted)', marginTop: 1,
              fontWeight: 500,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{subtitle}</div>
          )}
        </div>
        <span
          onClick={onDismiss}
          style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex' }}
          aria-label="Dismiss"
        >
          <I.close size={s.close} />
        </span>
      </div>

      {/* Item list. Click fires onPick(item). Each row gets a hover
          state so the click target is obvious — important since this
          IS a decision prompt, not a passive notification. */}
      <div style={{ padding: s.bodyPad, display: 'flex', flexDirection: 'column' }}>
        {items.length === 0 ? (
          <div style={{
            padding: '14px 10px',
            fontSize: 11,
            color: 'var(--gb-text-muted)',
            textAlign: 'center',
            fontStyle: 'italic',
          }}>No items to pick</div>
        ) : items.map((item) => (
          <SelectRow key={item.id} item={item} size={s} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

function SelectRow({ item, size, onPick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onPick && onPick(item)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: `${size.icon}px 1fr auto`,
        alignItems: 'center',
        gap: 9,
        padding: size.rowPad,
        background: hover ? 'var(--gb-fill-soft)' : 'transparent',
        border: '1px solid transparent',
        borderRadius: 'var(--gb-r-sm)',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--gb-font-sans)',
        color: 'var(--gb-text-secondary)',
        transition: 'background var(--gb-anim-fast)',
      }}
    >
      <span style={{
        width: size.icon, height: size.icon, borderRadius: 'var(--gb-r-sm)', flexShrink: 0,
        background: hover ? 'var(--gb-brand-tint-medium)' : 'var(--gb-brand-tint-soft)',
        border: '1px solid var(--gb-brand-tint-border)',
        color: 'var(--gb-brand-label)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background var(--gb-anim-fast)',
      }}>
        {item.icon
          ? React.cloneElement(item.icon, { size: size.iconSvg })
          : <I.check size={size.iconSvg} />}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{
          fontSize: size.label, fontWeight: 600,
          color: 'var(--gb-text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{item.label}</span>
        {item.hint && (
          <span style={{
            fontSize: size.hint, color: 'var(--gb-text-muted)',
            marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            fontWeight: 500,
          }}>{item.hint}</span>
        )}
      </span>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 5,
        color: hover ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
        transition: 'color var(--gb-anim-fast)',
      }}>
        {item.badge && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
            textTransform: 'uppercase',
            padding: '1px 6px',
            borderRadius: 999,
            background: 'var(--gb-fill-subtle)',
            border: '1px solid var(--gb-border-default)',
            color: 'var(--gb-text-tertiary)',
          }}>{item.badge}</span>
        )}
        <I.chevr size={11} />
      </span>
    </button>
  );
}
