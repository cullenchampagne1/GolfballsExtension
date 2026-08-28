import React from 'react';
import { motion } from 'motion/react';
import { T } from '../shared.jsx';

/**
 * Card — generic surface container.
 *
 * Props: active (brand-tinted border + raised surface),
 *   hover (bg shifts on hover), padding (default 12), onClick, children.
 */
export function Card({ children, padding = 12, hover, active, onClick, style, className, ...rest }) {
  return (
    <motion.div
      onClick={onClick}
      className={'gb-card ' + (className || '')}
      whileHover={hover ? { backgroundColor: 'var(--gb-surface-2)' } : undefined}
      transition={T.fast}
      style={{
        // Skin seam: --gb-card-* reskin every block;
        // the active state still wins its brand-tinted border.
        background: active ? 'var(--gb-surface-2)' : 'var(--gb-card-bg, var(--gb-surface-1))',
        backdropFilter: active ? 'none' : 'var(--gb-card-blur, none)',
        WebkitBackdropFilter: active ? 'none' : 'var(--gb-card-blur, none)',
        border: active ? '1px solid var(--gb-brand-tint-border)' : 'var(--gb-card-border, 1px solid var(--gb-border-default))',
        borderRadius: 'var(--gb-card-radius, var(--gb-r-md))',
        boxShadow: 'var(--gb-card-shadow, none)',
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
