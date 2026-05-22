import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { T, useAsyncState, sizeIcon, Spinner } from '../shared.jsx';
import { I } from '../icons.jsx';

// radius scales with height so every size keeps the same corner ratio
// (~0.25 of height) instead of a fixed value that over-rounds small buttons.
const SIZES = {
  xs: { fontSize: 10.5, padding: '0 8px',  height: 22, gap: 4, iconSize: 10, radius: 'var(--gb-r-sm)' },
  sm: { fontSize: 11,   padding: '0 10px', height: 26, gap: 5, iconSize: 11, radius: 'var(--gb-r-sm)' },
  md: { fontSize: 12,   padding: '0 12px', height: 32, gap: 6, iconSize: 12, radius: 'var(--gb-r-md)' },
  lg: { fontSize: 13,   padding: '0 16px', height: 38, gap: 7, iconSize: 13, radius: 'var(--gb-r-lg)' },
};

const STATUS = {
  brand:   { bg: 'var(--gb-brand-tint-medium)',   hover: 'var(--gb-brand-tint-strong)' },
  error:   { bg: 'var(--gb-error-tint-medium)',   hover: 'var(--gb-error-tint-strong)' },
  warning: { bg: 'var(--gb-warning-tint-medium)', hover: 'var(--gb-warning-tint-strong)' },
};
const STATUS_FG = {
  brand: 'var(--gb-brand-label)', error: 'var(--gb-error-fg)', warning: 'var(--gb-warning-fg)',
};
const STATUS_BD = {
  brand: 'var(--gb-brand-tint-border)', error: 'var(--gb-error-tint-border)', warning: 'var(--gb-warning-tint-border)',
};

/** Resolve variant + status into a base style and a Motion hover delta. */
function resolveVariant(variant, status) {
  const key = status || 'brand';
  switch (variant) {
    case 'primary':
      return {
        base: { background: 'linear-gradient(180deg, var(--gb-brand) 0%, var(--gb-brand-dark) 100%)', color: 'var(--gb-text-on-brand)', border: '1px solid var(--gb-brand-border)' },
        hover: { filter: 'brightness(1.1)' },
      };
    case 'tinted':
      return {
        base: { background: STATUS[key].bg, color: STATUS_FG[key], border: `1px solid ${STATUS_BD[key]}` },
        hover: { backgroundColor: STATUS[key].hover },
      };
    case 'ghost':
      return {
        base: { background: 'transparent', color: 'var(--gb-text-tertiary)', border: '1px solid transparent' },
        hover: { backgroundColor: 'var(--gb-fill-subtle)' },
      };
    case 'danger':
      return {
        base: { background: 'var(--gb-error-tint-medium)', color: 'var(--gb-error-fg)', border: '1px solid var(--gb-error-tint-border)' },
        hover: { backgroundColor: 'var(--gb-error-tint-strong)' },
      };
    case 'dashed':
      return {
        base: { background: 'var(--gb-brand-tint-soft)', color: 'var(--gb-brand-label)', border: '1px dashed var(--gb-brand-tint-border)' },
        hover: { backgroundColor: 'var(--gb-brand-tint-medium)' },
      };
    case 'secondary':
    default:
      return {
        base: { background: 'var(--gb-fill-subtle)', color: 'var(--gb-text-secondary)', border: '1px solid var(--gb-border-default)' },
        hover: { backgroundColor: 'var(--gb-fill-soft)' },
      };
  }
}

/**
 * Btn — the single button primitive.
 *
 * Props:
 *   variant  'primary'|'secondary'|'tinted'|'ghost'|'danger'|'dashed'  (default 'secondary')
 *   size     'xs'|'sm'|'md'|'lg'  (default 'md')
 *   status   'brand'|'error'|'warning'  — recolors the `tinted` variant
 *   state    'idle'|'loading'|'success'|'error'  — manual async-state override
 *   icon, iconRight  ReactElement   ·  children, full, disabled
 *   onClick  sync, or async — a returned Promise drives loading → success/error → idle
 */
export function Btn({
  variant = 'secondary', size = 'md', status, state = 'idle',
  icon, iconRight, children, full, disabled, onClick, style, ...rest
}) {
  const [effState, run] = useAsyncState(state);
  const s = SIZES[size] || SIZES.md;
  const { base, hover } = resolveVariant(variant, status);
  const busy = effState === 'loading';

  // Spinner / check / alert take over the icon's slot — never both.
  const slot =
    busy ? <Spinner size={s.iconSize} />
      : effState === 'success' ? <I.check size={s.iconSize} />
        : effState === 'error' ? <I.alert size={s.iconSize} />
          : icon ? sizeIcon(icon, s.iconSize) : null;

  return (
    <motion.button
      type="button"
      disabled={disabled || busy}
      onClick={(e) => run(onClick, e)}
      animate={{ x: effState === 'error' ? [0, -4, 4, -4, 4, 0] : 0 }}
      transition={effState === 'error' ? { duration: 0.35, ease: [0.36, 0.07, 0.19, 0.97] } : T.base}
      whileHover={disabled || busy ? undefined : hover}
      whileTap={disabled || busy ? undefined : { scale: 0.97 }}
      whileFocus={{ boxShadow: 'var(--gb-focus-ring)' }}
      style={{
        ...base,
        fontFamily: 'var(--gb-font-sans)', fontWeight: 600, letterSpacing: -0.05,
        fontSize: s.fontSize, padding: s.padding, height: s.height, gap: s.gap,
        borderRadius: s.radius,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : busy ? 'progress' : 'pointer',
        opacity: disabled && !busy ? 0.5 : 1,
        whiteSpace: 'nowrap', flexShrink: 0, boxSizing: 'border-box',
        width: full ? '100%' : undefined,
        position: 'relative', outline: 'none',
        ...style,
      }}
      {...rest}
    >
      {slot != null && (
        <span style={{ position: 'relative', width: s.iconSize, height: s.iconSize, flexShrink: 0 }}>
          <AnimatePresence initial={false}>
            <motion.span
              key={effState}
              initial={{ opacity: 0, scale: effState === 'success' ? 0.4 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={effState === 'success' ? T.bounce : T.base}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {slot}
            </motion.span>
          </AnimatePresence>
        </span>
      )}
      {children}
      {iconRight && effState === 'idle' && (
        <span style={{ display: 'flex' }}>{sizeIcon(iconRight, s.iconSize)}</span>
      )}
    </motion.button>
  );
}
