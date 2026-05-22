import React from 'react';
import { motion } from 'motion/react';

const COLORS = {
  brand:   'var(--gb-brand-label)',
  error:   'var(--gb-error)',
  warning: 'var(--gb-warning)',
  success: 'var(--gb-success)',
  muted:   'var(--gb-text-muted)',
};

/**
 * Dot — small filled circle. Match indicator / live status.
 *
 * Props: tone 'brand'|'error'|'warning'|'success'|'muted',
 *   size (px, default 6), glow, pulse.
 */
export function Dot({ tone = 'brand', size = 6, glow, pulse }) {
  const c = COLORS[tone] || COLORS.brand;
  return (
    <motion.span
      animate={pulse ? { opacity: [1, 0.4, 1], scale: [1, 0.85, 1] } : undefined}
      transition={pulse ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: c, flexShrink: 0, display: 'inline-block',
        boxShadow: glow
          ? `0 0 ${size}px ${c}, 0 0 ${size * 2}px color-mix(in srgb, ${c} 20%, transparent)`
          : 'none',
      }}
    />
  );
}
