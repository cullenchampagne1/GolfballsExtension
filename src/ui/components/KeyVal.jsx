import React from 'react';

const TONE_COLOR = {
  ok:    'var(--gb-brand-label)',
  error: 'var(--gb-error)',
  warn:  'var(--gb-warning-fg)',
};

/**
 * KeyVal — aligned key/value row for info readouts.
 *
 * Props: k (label, uppercased), v (value node),
 *   tone 'default'|'ok'|'error'|'warn', mono.
 */
export function KeyVal({ k, v, tone = 'default', mono, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0', minWidth: 0, ...style }}>
      <div style={{
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8,
        color: 'var(--gb-text-muted)', minWidth: 58, flexShrink: 0,
      }}>
        {k}
      </div>
      <div style={{
        flex: 1, fontSize: 12,
        color: TONE_COLOR[tone] || 'var(--gb-text-secondary)',
        fontWeight: tone === 'ok' ? 600 : 500,
        fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {v}
      </div>
    </div>
  );
}
