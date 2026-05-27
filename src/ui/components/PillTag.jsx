import React from 'react';
import { motion } from 'motion/react';
import { T, sizeIcon } from '../shared.jsx';

/**
 * PillTag — a tag that can be on or off, for exclusive (radio-style)
 * or per-item toggle selection.
 *
 * Props: on, icon, onClick, children.
 */
export function PillTag({ on, icon, children, onClick, style }) {
  return (
    <motion.span
      role="button"
      tabIndex={0}
      aria-pressed={!!on}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(e);
        }
      }}
      animate={{
        backgroundColor: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
        color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
        borderColor: on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)',
      }}
      transition={T.base}
      whileTap={{ scale: 0.96 }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 11px', borderRadius: 'var(--gb-r-sm)',
        fontSize: 11, fontWeight: 600, border: '1px solid',
        cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
        fontFamily: 'var(--gb-font-sans)', boxSizing: 'border-box',
        outline: 'none',
        ...style,
      }}
    >
      {icon && <span style={{ display: 'flex' }}>{sizeIcon(icon, 12)}</span>}
      {children}
    </motion.span>
  );
}
