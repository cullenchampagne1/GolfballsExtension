import React from 'react';

/**
 * ModalFooter — action row, pinned to the bottom of a ModalShell.
 * Typically holds a hint plus ghost + primary buttons.
 */
export function ModalFooter({ children, style }) {
  return (
    <div style={{
      padding: 12, flexShrink: 0,
      background: 'var(--gb-surface-2)',
      borderTop: '1px solid var(--gb-border-subtle)',
      display: 'flex', alignItems: 'center', gap: 8,
      ...style,
    }}>
      {children}
    </div>
  );
}
