import React from 'react';
import { motion } from 'motion/react';
import { T } from '../shared.jsx';

const SIZES = {
  sm: { w: 28, h: 16, knob: 12 },
  md: { w: 34, h: 20, knob: 16 },
  lg: { w: 40, h: 22, knob: 18 },
};

/**
 * Switch — boolean toggle ("is this enabled?"). For multi-select
 * lists use Checkbox instead.
 *
 * Props: on, size 'sm'|'md'|'lg', tone 'brand'|'warning', disabled,
 *   onChange(next).
 */
export function Switch({ on, size = 'md', tone = 'brand', disabled, onChange, style }) {
  const s = SIZES[size] || SIZES.md;
  const warn = tone === 'warning';
  const trackOn = warn ? 'var(--gb-warning-tint-medium)' : 'var(--gb-brand-tint-medium)';
  const borderOn = warn ? 'var(--gb-warning)' : 'var(--gb-brand)';
  const knobOn = warn ? 'var(--gb-warning)' : 'var(--gb-brand-label)';
  const knobX = s.w - s.knob - 4;

  return (
    <motion.span
      role="switch"
      aria-checked={!!on}
      onClick={() => !disabled && onChange?.(!on)}
      animate={{
        backgroundColor: on ? trackOn : 'var(--gb-surface-2)',
        borderColor: on ? borderOn : 'var(--gb-border-default)',
      }}
      transition={T.base}
      style={{
        position: 'relative', display: 'inline-block', flexShrink: 0,
        width: s.w, height: s.h, borderRadius: s.h, border: '1px solid',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, boxSizing: 'border-box',
        ...style,
      }}
    >
      <motion.span
        animate={{
          x: on ? knobX : 0,
          backgroundColor: on ? knobOn : 'var(--gb-text-tertiary)',
        }}
        transition={T.base}
        style={{
          position: 'absolute', top: '50%', left: 2, marginTop: -s.knob / 2,
          width: s.knob, height: s.knob, borderRadius: '50%',
        }}
      />
    </motion.span>
  );
}
