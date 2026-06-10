import React from 'react';

/**
 * EmptyState — centered "nothing here" / prompt block: an optional icon,
 * a title, an optional subtitle, and optional action(s) as children.
 * Replaces the hand-rolled centered-column divs (CallLog / QuickTask
 * BuildPrompt, search empties, etc.).
 *
 * Props: icon, title, subtitle, children (actions), style.
 */
export function EmptyState({ icon, title, subtitle, children, style }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 10, padding: '24px 16px', textAlign: 'center', ...style,
    }}>
      {icon && <span style={{ color: 'var(--gb-text-ghost)', display: 'flex' }}>{icon}</span>}
      {title && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-tertiary)' }}>{title}</div>}
      {subtitle && <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', lineHeight: 1.45 }}>{subtitle}</div>}
      {children}
    </div>
  );
}
