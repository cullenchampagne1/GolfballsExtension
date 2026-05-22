import React from 'react';
import { motion } from 'motion/react';
import { T, TINT, sizeIcon } from '../shared.jsx';

const SIZES = {
  sm: { fontSize: 10.5, padding: '3px 7px',  gap: 6, switchW: 22, switchH: 12, knob: 8,  iconSize: 9 },
  md: { fontSize: 11.5, padding: '4px 9px',  gap: 7, switchW: 26, switchH: 14, knob: 10, iconSize: 10 },
  lg: { fontSize: 12.5, padding: '5px 11px', gap: 8, switchW: 30, switchH: 16, knob: 12, iconSize: 11 },
};

/**
 * SwitchTag — a tag with an embedded switch. Inline feature flags,
 * per-row enable controls.
 *
 * Props: on, label, icon, size 'sm'|'md'|'lg',
 *   tone 'neutral'|'brand'|'warning'|'error' (auto: off→neutral, on→brand),
 *   onClick.
 */
export function SwitchTag({ on, label, tone, icon, size = 'md', onClick, style }) {
  const t = TINT[tone || (on ? 'brand' : 'neutral')] || TINT.neutral;
  const s = SIZES[size] || SIZES.md;
  const knobX = s.switchW - s.knob - 4;

  return (
    <motion.span
      onClick={onClick}
      animate={{ backgroundColor: t.bg, color: t.fg, borderColor: t.bd }}
      transition={T.base}
      whileTap={{ scale: 0.97 }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: s.gap,
        padding: s.padding, borderRadius: 'var(--gb-r-sm)',
        fontSize: s.fontSize, fontWeight: 600, border: '1px solid',
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        fontFamily: 'var(--gb-font-sans)', boxSizing: 'border-box',
        ...style,
      }}
    >
      {icon && sizeIcon(icon, s.iconSize)}
      {label}
      <motion.span
        animate={{ backgroundColor: on ? t.fg : 'var(--gb-surface-3)' }}
        transition={T.base}
        style={{
          position: 'relative', display: 'inline-block', flexShrink: 0,
          width: s.switchW, height: s.switchH, borderRadius: s.switchH, marginLeft: 2,
        }}
      >
        <motion.span
          animate={{
            x: on ? knobX : 0,
            backgroundColor: on ? 'var(--gb-surface-1)' : 'var(--gb-text-muted)',
          }}
          transition={T.base}
          style={{
            position: 'absolute', top: '50%', left: 2, marginTop: -s.knob / 2,
            width: s.knob, height: s.knob, borderRadius: '50%',
          }}
        />
      </motion.span>
    </motion.span>
  );
}
