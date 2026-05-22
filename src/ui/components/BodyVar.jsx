import React from 'react';
import { Icon } from '../icons.jsx';

const BoltIcon = (p) => (
  <Icon {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></Icon>
);

const PALETTE = {
  ok:       { bg: 'var(--gb-brand-tint-soft)',   bd: 'var(--gb-brand-tint-border)',   fg: 'var(--gb-brand-label)' },
  fallback: { bg: 'var(--gb-warning-tint-soft)', bd: 'var(--gb-warning-tint-border)', fg: 'var(--gb-warning-fg)' },
  miss:     { bg: 'var(--gb-error-tint-soft)',   bd: 'var(--gb-error-tint-border)',   fg: 'var(--gb-error-fg)' },
};

/**
 * BodyVar — inline variable chip used inside email body content.
 * Two-part pill: variable name on the left, lightning smart button on the right.
 *
 * Props:
 *   v           Variable object { name, status, resolved?, smart? }
 *   onOpenSmart Called when the lightning button is clicked
 */
export function BodyVar({ v, onOpenSmart }) {
  const hasSmart = !!(v?.smart && (
    typeof v.smart.fallback === 'string' && v.smart.fallback.length > 0
      || v.smart.transform
      || v.smart.conditional
      || v.smart.format
  ));
  const state = v?.status === 'ok' ? 'ok' : hasSmart ? 'fallback' : 'miss';
  const p = PALETTE[state];

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
        padding: '1px 7px',
        fontFamily: 'var(--gb-font-mono)',
        fontSize: 12, fontWeight: 600,
        color: p.fg,
        cursor: 'default',
      }}>
        {v.name}
      </span>

      {/* Smart button */}
      <span
        onClick={(e) => { e.stopPropagation(); onOpenSmart?.(v); }}
        title={hasSmart ? 'Edit smart options' : 'Add smart options'}
        style={{
          padding: '0 5px',
          borderLeft: `1px solid ${p.bd}`,
          background: hasSmart ? `${p.fg}22` : 'transparent',
          color: p.fg,
          display: 'inline-flex', alignItems: 'center',
          cursor: 'pointer',
          opacity: hasSmart ? 1 : 0.55,
          transition: 'opacity var(--gb-anim)',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = 1)}
        onMouseLeave={e => (e.currentTarget.style.opacity = hasSmart ? 1 : 0.55)}
      >
        <BoltIcon size={9} />
      </span>
    </span>
  );
}
