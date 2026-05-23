import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { T, useAsyncState, sizeIcon, Spinner } from '../shared.jsx';
import { I } from '../icons.jsx';

// radius scales with height so every size keeps the same corner ratio
// (~0.25 of height) instead of a fixed value that over-rounds small buttons.
// Heights mirror inputBaseStyle (shared.jsx) — sm 28 · md 32 · lg 36 — so a
// Btn at `size="sm"` sits flush with a Dropdown/Input at `size="sm"`.
const SIZES = {
  xs: { fontSize: 10.5, padding: '0 8px',  height: 22, gap: 4, iconSize: 10, radius: 'var(--gb-r-sm)' },
  sm: { fontSize: 11,   padding: '0 10px', height: 28, gap: 5, iconSize: 11, radius: 'var(--gb-r-sm)' },
  md: { fontSize: 12,   padding: '0 12px', height: 32, gap: 6, iconSize: 12, radius: 'var(--gb-r-md)' },
  lg: { fontSize: 13,   padding: '0 16px', height: 36, gap: 7, iconSize: 13, radius: 'var(--gb-r-lg)' },
};

// All status families that any DS surface might pass. Missing a row here
// crashes any consumer that does STATUS[key].bg without a fallback (e.g.
// ActionToast forwards `status={tone}` directly when rendering its CTA).
const STATUS = {
  brand:   { bg: 'var(--gb-brand-tint-medium)',   hover: 'var(--gb-brand-tint-strong)' },
  error:   { bg: 'var(--gb-error-tint-medium)',   hover: 'var(--gb-error-tint-strong)' },
  warning: { bg: 'var(--gb-warning-tint-medium)', hover: 'var(--gb-warning-tint-strong)' },
  success: { bg: 'var(--gb-success-tint-medium)', hover: 'var(--gb-success-tint-strong)' },
  info:    { bg: 'var(--gb-info-tint-medium)',    hover: 'var(--gb-info-tint-strong)'    },
};
const STATUS_FG = {
  brand:   'var(--gb-brand-label)',
  error:   'var(--gb-error-fg)',
  warning: 'var(--gb-warning-fg)',
  success: 'var(--gb-success-fg)',
  info:    'var(--gb-info-fg)',
};
const STATUS_BD = {
  brand:   'var(--gb-brand-tint-border)',
  error:   'var(--gb-error-tint-border)',
  warning: 'var(--gb-warning-tint-border)',
  success: 'var(--gb-success-tint-border)',
  info:    'var(--gb-info-tint-border)',
};

/** Resolve variant + status into a base style and a Motion hover delta. */
function resolveVariant(variant, status) {
  // Unknown status keys fall back to 'brand' rather than crashing the
  // tinted variant's lookup. Same defensive pattern Tag/Dot/etc. use.
  const key = (status && STATUS[status]) ? status : 'brand';
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

// Badge sizing tracks button size — small buttons get a tighter pill so the
// badge stays proportional and doesn't dominate the button face.
const BADGE_SIZES = {
  xs: { height: 13, minWidth: 13, font: 8.5,  padX: 4, offsetY: -5, offsetX: -5 },
  sm: { height: 15, minWidth: 15, font: 9,    padX: 4, offsetY: -6, offsetX: -6 },
  md: { height: 17, minWidth: 17, font: 9.5,  padX: 5, offsetY: -7, offsetX: -7 },
  lg: { height: 19, minWidth: 19, font: 10,   padX: 6, offsetY: -8, offsetX: -8 },
};

const BADGE_TONES = {
  brand:   { bg: 'var(--gb-brand-label)', fg: 'var(--gb-text-on-brand)' },
  error:   { bg: 'var(--gb-error)',       fg: '#fff' },
  warning: { bg: 'var(--gb-warning)',     fg: '#1a1a1a' },
  success: { bg: 'var(--gb-success)',     fg: '#0a0a0a' },
  info:    { bg: 'var(--gb-info)',        fg: '#0a0a0a' },
  neutral: { bg: 'var(--gb-text-tertiary)', fg: 'var(--gb-surface-canvas)' },
};

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
 *   badge    number | string | ReactNode   — floating top-right tag. Numbers
 *            >99 render as "99+". 0 / null / undefined hide the badge.
 *   badgeTone 'brand'|'error'|'warning'|'success'|'info'|'neutral' (default 'brand')
 *   badgePulse  loop a soft opacity pulse — use for urgent / critical counts
 *   badgeRing   render a ring around the badge in the button's background
 *               color so it visually "lifts off" the button (default true)
 */
export function Btn({
  variant = 'secondary', size = 'md', status, state = 'idle',
  icon, iconRight, children, full, disabled, onClick, style,
  badge, badgeTone = 'brand', badgePulse, badgeRing = true,
  ...rest
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

  // Normalize the badge: numbers honor the 99+ cap, strings/nodes pass through.
  // 0 / null / undefined / '' all hide the badge.
  const badgeValue = (() => {
    if (badge === 0 || badge === null || badge === undefined || badge === '') return null;
    if (typeof badge === 'number') return badge > 99 ? '99+' : String(badge);
    return badge;
  })();

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
      {badgeValue != null && <BtnBadge value={badgeValue} size={size} tone={badgeTone} pulse={badgePulse} ring={badgeRing} />}
    </motion.button>
  );
}

/**
 * BtnBadge — floating top-right pill. Pops on mount, swaps with a pop on
 * value-change (keyed in AnimatePresence by the rendered string), opacity-
 * pulses while `pulse` is on. Opt-in `ring` paints a 2px outline in the
 * surrounding background so the badge reads as "lifted off" the button.
 */
function BtnBadge({ value, size, tone, pulse, ring }) {
  const b = BADGE_SIZES[size] || BADGE_SIZES.md;
  const t = BADGE_TONES[tone] || BADGE_TONES.brand;
  return (
    <span
      style={{
        position: 'absolute', top: b.offsetY, right: b.offsetX,
        pointerEvents: 'none', display: 'flex', zIndex: 1,
      }}
    >
      <AnimatePresence initial={true} mode="popLayout">
        <motion.span
          key={String(value)}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={pulse
            ? { opacity: [1, 0.55, 1], scale: 1 }
            : { opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.4 }}
          transition={pulse
            ? { scale: T.bounce, opacity: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } }
            : T.bounce}
          style={{
            background: t.bg,
            color: t.fg,
            height: b.height,
            minWidth: b.minWidth,
            padding: `0 ${b.padX}px`,
            borderRadius: b.height / 2,
            fontSize: b.font,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: 0.2,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: ring ? '0 0 0 2px var(--gb-surface-canvas)' : 'none',
            fontFamily: 'var(--gb-font-sans)',
          }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
