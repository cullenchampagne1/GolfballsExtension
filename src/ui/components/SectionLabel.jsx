import React from 'react';

/**
 * SectionLabel — uppercase section header with an optional hairline
 * divider and an optional action slot on the far right.
 *
 * Props: divider (default true), action (ReactElement), children.
 */
export function SectionLabel({ children, action, divider = true, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, ...style }}>
      <div style={{
        fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2,
        color: 'var(--gb-text-muted)', whiteSpace: 'nowrap',
      }}>
        {children}
      </div>
      {divider && <div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />}
      {action}
    </div>
  );
}
