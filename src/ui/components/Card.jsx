import React from 'react';
import { motion } from 'motion/react';
import { T } from '../shared.jsx';

/**
 * Card — generic surface container.
 *
 * Props: active (brand-tinted border + raised surface),
 *   hover (bg shifts on hover), padding (default 12), onClick, children.
 */
export function Card({ children, padding = 12, hover, active, onClick, style, ...rest }) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={hover ? { backgroundColor: 'var(--gb-surface-2)' } : undefined}
      transition={T.fast}
      style={{
        background: active ? 'var(--gb-surface-2)' : 'var(--gb-surface-1)',
        border: '1px solid ' + (active ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
        borderRadius: 'var(--gb-r-md)',
        padding,
        cursor: onClick ? 'pointer' : 'default',
        boxSizing: 'border-box',
        ...style,
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
