import React from 'react';
import { I } from '../icons.jsx';

const PALETTE = {
  ok:       { bg: 'var(--gb-brand-tint-soft)',   bd: 'var(--gb-brand-tint-border)',   fg: 'var(--gb-brand-label)' },
  fallback: { bg: 'var(--gb-warning-tint-soft)', bd: 'var(--gb-warning-tint-border)', fg: 'var(--gb-warning-fg)' },
  miss:     { bg: 'var(--gb-error-tint-soft)',   bd: 'var(--gb-error-tint-border)',   fg: 'var(--gb-error-fg)' },
};

/* Two density presets. `md` matches the design spec for body-content
   chips; `sm` is the table-row variant — same shape, scaled down. */
const SIZES = {
  md: { namePad: '1px 7px', font: 12, boltPad: '0 5px',  boltIcon: 9 },
  sm: { namePad: '0 5px',   font: 10, boltPad: '0 3px',  boltIcon: 8 },
};

/**
 * BodyVar — inline variable chip used inside email body content and
 * the variable table. Two-part pill: variable name on the left, lightning
 * smart button on the right. Color reflects resolution state.
 *
 * Props:
 *   v           Variable object { name, status, resolved?, smart? }
 *   size        'md' (body, default) | 'sm' (table row)
 *   onOpenSmart Called when the lightning button is clicked
 */
export function BodyVar({ v, onOpenSmart, size = 'md' }) {
  const hasSmart = !!(v?.smart && (
    typeof v.smart.fallback === 'string' && v.smart.fallback.length > 0
      || v.smart.transform
      || v.smart.conditional
      || v.smart.format
  ));
  const state = v?.status === 'ok' ? 'ok' : hasSmart ? 'fallback' : 'miss';
  const p = PALETTE[state];
  const s = SIZES[size] || SIZES.md;

  if (!v) return null;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'stretch',
      verticalAlign: 'baseline', margin: '0 1px',
      borderRadius: 'var(--gb-r-sm)',
      border: `1px solid ${p.bd}`,
      background: p.bg,
      overflow: 'hidden',
      lineHeight: 1.4,
    }}>
      {/* Variable name */}
      <span style={{
        padding: s.namePad,
        fontFamily: 'var(--gb-font-mono)',
        fontSize: s.font, fontWeight: 600,
        color: p.fg,
        cursor: 'default',
      }}>
        {v.name}
      </span>

      {/* Smart button — color-mix gives a tinted background that follows
          the state's fg color (works with var(--...) refs, unlike `#fg+22`
          which produced invalid CSS in the original). */}
      <span
        onClick={(e) => { e.stopPropagation(); onOpenSmart?.(v); }}
        title={hasSmart ? 'Edit smart options' : 'Add smart options'}
        style={{
          padding: s.boltPad,
          borderLeft: `1px solid ${p.bd}`,
          background: hasSmart
            ? `color-mix(in srgb, ${p.fg} 13%, transparent)`
            : 'transparent',
          color: p.fg,
          display: 'inline-flex', alignItems: 'center',
          cursor: 'pointer',
          opacity: hasSmart ? 1 : 0.55,
          transition: 'opacity var(--gb-anim)',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = 1)}
        onMouseLeave={e => (e.currentTarget.style.opacity = hasSmart ? 1 : 0.55)}
      >
        <I.bolt size={s.boltIcon} />
      </span>
    </span>
  );
}
