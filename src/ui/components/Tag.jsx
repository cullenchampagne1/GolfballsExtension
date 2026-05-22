import React from 'react';
import { motion } from 'motion/react';
import { T, TINT, sizeIcon } from '../shared.jsx';
import { I } from '../icons.jsx';

const SIZES = {
  xs: { fontSize: 9,    padding: '1px 5px', borderRadius: 3, gap: 3, iconSize: 8 },
  sm: { fontSize: 9.5,  padding: '1px 6px', borderRadius: 4, gap: 4, iconSize: 9 },
  md: { fontSize: 10.5, padding: '2px 7px', borderRadius: 5, gap: 4, iconSize: 10 },
  lg: { fontSize: 11.5, padding: '3px 9px', borderRadius: 5, gap: 5, iconSize: 11 },
};

/**
 * Tag — uppercase status badge. Match labels, counts, role chips.
 *
 * Props: tone 'neutral'|'brand'|'error'|'warning'|'success'|'info',
 *   size 'xs'|'sm'|'md'|'lg', mono, icon, onRemove, pulse, children.
 * Always uppercase + .3px letter-spacing. Enters with a bounce pop.
 */
export function Tag({
  children, tone = 'neutral', size = 'md', mono, icon, onRemove, pulse, style,
}) {
  const t = TINT[tone] || TINT.neutral;
  const s = SIZES[size] || SIZES.md;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.6 }}
      animate={pulse ? { opacity: [1, 0.5, 1], scale: 1 } : { opacity: 1, scale: 1 }}
      transition={pulse
        ? { scale: T.bounce, opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut' } }
        : T.bounce}
      style={{
        fontSize: s.fontSize, padding: s.padding, borderRadius: s.borderRadius, gap: s.gap,
        color: t.fg, background: t.bg, border: `1px solid ${t.bd}`,
        fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
        fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)',
        display: 'inline-flex', alignItems: 'center', lineHeight: 1.5,
        whiteSpace: 'nowrap', boxSizing: 'border-box',
        ...style,
      }}
    >
      {icon && sizeIcon(icon, s.iconSize)}
      {children}
      {onRemove && (
        <span
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ cursor: 'pointer', display: 'flex', marginLeft: 1 }}
        >
          <I.close size={s.iconSize - 1} />
        </span>
      )}
    </motion.span>
  );
}
