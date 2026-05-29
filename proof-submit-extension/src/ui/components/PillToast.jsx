import React from 'react';
import { Dot } from './Dot.jsx';
import { I } from '../icons.jsx';

/**
 * PillToast — radical minimalism. A tiny rounded pill with a leading dot,
 * a single line of text, and a close affordance.
 *
 * Use for:  confirming a single trivial action (saved, copied, undone).
 * Avoid:    when the user needs to make a decision (use ActionToast).
 *
 * Required CSS (already in theme.css):
 *   @keyframes gb-toast-in-top
 *
 * Props
 *   tone       'info' | 'success' | 'brand' | 'warning' | 'error'   default 'success'
 *   message    string — single line, no wrap
 *   onDismiss  () => void
 *   size       'md' | 'sm'   default 'md'    ('sm' for narrow panels / sidebars)
 */
const SIZES = {
  md: { padY: 6, padR: 12, padL: 11, gap: 9, dot: 7, font: 12,   sep: 12, close: 10 },
  sm: { padY: 4, padR: 10, padL: 9,  gap: 7, dot: 6, font: 10.5, sep: 10, close: 9  },
};

const TONES = {
  info:    { fg: 'var(--gb-info-fg)',     dot: 'var(--gb-info)'        },
  success: { fg: 'var(--gb-success-fg)',  dot: 'var(--gb-success)'     },
  brand:   { fg: 'var(--gb-brand-label)', dot: 'var(--gb-brand-label)' },
  warning: { fg: 'var(--gb-warning-fg)',  dot: 'var(--gb-warning)'     },
  error:   { fg: 'var(--gb-error-fg)',    dot: 'var(--gb-error)'       },
};

export function PillToast({ tone = 'success', message, onDismiss, size = 'md' }) {
  const s = SIZES[size] || SIZES.md;
  return (
    <div style={{
      pointerEvents: 'auto',
      display: 'inline-flex', alignItems: 'center', gap: s.gap,
      padding: `${s.padY}px ${s.padR}px ${s.padY}px ${s.padL}px`,
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-pill)',
      boxShadow: 'var(--gb-shadow-popover)',
    }}>
      <Dot tone={tone} glow size={s.dot} />
      <span style={{
        fontSize: s.font, fontWeight: 500,
        color: 'var(--gb-text-secondary)', whiteSpace: 'nowrap',
      }}>{message}</span>
      <span style={{ width: 1, height: s.sep, background: 'var(--gb-border-subtle)', marginLeft: 2 }} />
      <span
        onClick={onDismiss}
        style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex', marginLeft: -2, padding: 2 }}
      >
        <I.close size={s.close} />
      </span>
    </div>
  );
}
