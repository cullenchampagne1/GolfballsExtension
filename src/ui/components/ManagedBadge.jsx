import React from 'react';
import { motion } from 'motion/react';
import { I } from '../icons.jsx';

/** Small, non-interactive marker for an administrator-owned setting value. */
export function ManagedBadge({ compact = false, title = 'Managed by your RevStack administrator' }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
      title={title}
      aria-label={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: compact ? 0 : 4,
        flexShrink: 0, padding: compact ? 3 : '2px 6px',
        borderRadius: 'var(--gb-r-sm)',
        border: '1px solid var(--gb-brand-tint-border)',
        background: 'var(--gb-brand-tint-soft)',
        color: 'var(--gb-brand-label)',
        fontFamily: 'var(--gb-font-mono)', fontSize: 8.5, fontWeight: 750,
        lineHeight: 1, letterSpacing: '.035em', textTransform: 'uppercase',
      }}
    >
      <I.lock size={9} strokeWidth={2.15} />
      {!compact && <span>Managed</span>}
    </motion.span>
  );
}

export default ManagedBadge;
