import React from 'react';
import { I } from '../icons.jsx';

/**
 * EdgeToast — an ambient strip pinned to the top edge of the viewport.
 * Quietly reports system-level, persistent state.
 *
 * Use for:  background sync state, offline mode, version mismatch.
 * Avoid:    per-action feedback — it's too quiet to register.
 *
 * Required CSS (already in theme.css):
 *   @keyframes gb-toast-in-top
 *   @keyframes gb-pulse
 *
 * Props
 *   tone       'info' | 'success' | 'brand' | 'warning' | 'error'   default 'brand'
 *   message    string — single line, ellipsis on overflow
 *   onDismiss  () => void
 *   size       'md' | 'sm'   default 'md'
 */
const SIZES = {
  md: { width: 'min(560px, calc(100vw - 80px))', pad: '6px 12px', dot: 6, font: 11.5, close: 10 },
  sm: { width: 'min(420px, calc(100vw - 60px))', pad: '4px 9px',  dot: 5, font: 10.5, close: 9  },
};

const TONES = {
  info:    'var(--gb-info)',
  success: 'var(--gb-success)',
  brand:   'var(--gb-brand-label)',
  warning: 'var(--gb-warning)',
  error:   'var(--gb-error)',
};

export function EdgeToast({ tone = 'brand', message, onDismiss, size = 'md' }) {
  const s = SIZES[size] || SIZES.md;
  const c = TONES[tone] || TONES.brand;
  return (
    <div style={{
      pointerEvents: 'auto',
      width: s.width,
      display: 'flex', alignItems: 'center', gap: 10,
      padding: s.pad,
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-subtle)',
      borderTop: `2px solid ${c}`,
      borderRadius: '0 0 var(--gb-r-md) var(--gb-r-md)',
      boxShadow: '0 6px 24px rgba(0,0,0,.3)',
      animation: 'gb-toast-in-top .25s cubic-bezier(.34,1.4,.64,1) both',
    }}>
      <span style={{
        width: s.dot, height: s.dot, borderRadius: '50%',
        background: c, boxShadow: `0 0 6px ${c}`,
        animation: 'gb-pulse 1.4s ease-in-out infinite',
      }} />
      <span style={{
        flex: 1, fontSize: s.font, fontWeight: 500,
        color: 'var(--gb-text-secondary)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{message}</span>
      <span onClick={onDismiss} style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex', padding: 2 }}>
        <I.close size={s.close} />
      </span>
    </div>
  );
}
