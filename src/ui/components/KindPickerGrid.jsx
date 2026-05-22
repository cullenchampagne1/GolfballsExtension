import React from 'react';

/**
 * KindPickerGrid — N-column grid of selectable source-kind cards.
 * Reusable for any "pick one card from N options" pattern.
 *
 * Props:
 *   options   Array<{ id, icon, label, desc }>
 *   value     Currently selected id
 *   onChange  (id) => void
 *   columns   number, default: options.length
 */
export function KindPickerGrid({ options = [], value, onChange, columns }) {
  const cols = columns ?? options.length;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: 6,
    }}>
      {options.map(({ id, icon, label, desc }) => {
        const active = value === id;
        return (
          <div
            key={id}
            onClick={() => onChange?.(id)}
            style={{
              padding: 10,
              borderRadius: 'var(--gb-r-md)',
              cursor: 'pointer',
              background: active ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)',
              border: '1px solid ' + (active ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
              boxShadow: active ? '0 0 0 3px var(--gb-brand-tint-soft)' : 'none',
              transition: 'all var(--gb-anim)',
            }}
          >
            <div style={{
              color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
            }}>
              {icon && React.cloneElement(icon, { size: 12 })}
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>{label}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', lineHeight: 1.45 }}>{desc}</div>
          </div>
        );
      })}
    </div>
  );
}
