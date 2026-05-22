import React from 'react';
import { motion } from 'motion/react';
import { I } from '../icons.jsx';

const TONES = {
  brand:   { fg: 'var(--gb-brand-label)',   bg: 'var(--gb-brand-tint-soft)', bd: 'var(--gb-brand-tint-border)' },
  neutral: { fg: 'var(--gb-text-tertiary)', bg: 'var(--gb-fill-subtle)',     bd: 'var(--gb-border-default)' },
};

/**
 * Chip — mixed-case label. Variables ({{order_id}}), filter
 * conditions, inline tokens.
 *
 * Props: tone 'brand'|'neutral' (default 'brand'), code (mono font),
 *   onRemove, children.
 */
export function Chip({ children, code, tone = 'brand', onRemove, style }) {
  const t = TONES[tone] || TONES.brand;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 8px',
        background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
        borderRadius: 'var(--gb-r-sm)',
        fontSize: 11, fontWeight: 500,
        fontFamily: code ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)',
        whiteSpace: 'nowrap', boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
      {onRemove && (
        <motion.span
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          whileHover={{ color: 'var(--gb-text-secondary)' }}
          transition={{ duration: 0.12 }}
          style={{ display: 'flex', cursor: 'pointer', color: 'var(--gb-text-muted)' }}
        >
          <I.close size={9} />
        </motion.span>
      )}
    </span>
  );
}
