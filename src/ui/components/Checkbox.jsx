import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { T } from '../shared.jsx';
import { I } from '../icons.jsx';

const SIZES = {
  sm: { box: 14, check: 9,  gap: 7,  font: 11.5 },
  md: { box: 17, check: 11, gap: 9,  font: 12 },
  lg: { box: 20, check: 13, gap: 10, font: 13 },
};

/**
 * Checkbox — for multi-select lists, table rows, "select all".
 * Distinct from Switch (which is for enable/disable).
 *
 * Props: checked, indeterminate, size 'sm'|'md'|'lg',
 *   tone 'brand'|'error', label, hint, disabled, onChange(next).
 */
export function Checkbox({
  checked, indeterminate, size = 'md', tone = 'brand',
  label, hint, disabled, onChange, style,
}) {
  const s = SIZES[size] || SIZES.md;
  const err = tone === 'error';
  const color = err ? 'var(--gb-error)' : 'var(--gb-brand-label)';
  const bg = err ? 'var(--gb-error-tint-medium)' : 'var(--gb-brand-tint-medium)';
  const on = checked || indeterminate;

  return (
    <label
      onClick={(e) => { if (disabled) return; e.preventDefault(); onChange?.(!checked); }}
      style={{
        display: 'inline-flex', alignItems: 'flex-start', gap: s.gap,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <motion.span
        animate={{
          backgroundColor: on ? bg : 'var(--gb-surface-2)',
          borderColor: on ? color : 'var(--gb-border-strong)',
        }}
        transition={T.base}
        style={{
          width: s.box, height: s.box, flexShrink: 0, borderRadius: 4,
          border: '1.5px solid', color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginTop: label ? 1 : 0, boxSizing: 'border-box',
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {indeterminate ? (
            <motion.span
              key="ind"
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              transition={T.base}
              style={{ width: s.check, height: 2, borderRadius: 1, background: color }}
            />
          ) : checked ? (
            <motion.span
              key="chk"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={T.bounce}
              style={{ display: 'flex' }}
            >
              <I.check size={s.check} strokeWidth={3} />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </motion.span>
      {label && (
        <span style={{ minWidth: 0 }}>
          <span style={{ fontSize: s.font, fontWeight: 500, color: 'var(--gb-text-secondary)', display: 'block', lineHeight: 1.4 }}>{label}</span>
          {hint && (
            <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', display: 'block', marginTop: 2, lineHeight: 1.45 }}>{hint}</span>
          )}
        </span>
      )}
    </label>
  );
}
