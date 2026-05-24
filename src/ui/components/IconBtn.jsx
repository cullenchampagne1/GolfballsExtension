import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { T, useAsyncState, sizeIcon, Spinner } from '../shared.jsx';
import { I } from '../icons.jsx';

const BOX = { xs: 22, sm: 26, md: 32, lg: 38 };
const ICON = { xs: 10, sm: 11, md: 13, lg: 14 };
// radius scales with the box so corner roundness stays consistent across sizes
const RADIUS = { xs: 'var(--gb-r-sm)', sm: 'var(--gb-r-sm)', md: 'var(--gb-r-md)', lg: 'var(--gb-r-lg)' };

/**
 * IconBtn — square, icon-only button. Modal close, row actions,
 * header gear, toolbar buttons.
 *
 * Props: icon, size 'xs'|'sm'|'md'|'lg', variant 'secondary'|'ghost',
 *   danger, active, state, tooltip, disabled, onClick (sync or async).
 */
export function IconBtn({
  icon, size = 'md', variant = 'secondary',
  danger, active, state = 'idle', tooltip, disabled,
  onClick, style, ...rest
}) {
  const [effState, run] = useAsyncState(state);
  const [hovered, setHovered] = useState(false);
  // Tooltip position is computed from the button's bounding rect each
  // time the tooltip becomes visible. We portal the tooltip to <body>
  // so it can't get clipped by any ancestor `overflow:hidden` (image
  // preview wrapper, modal body, etc.) — that was the bug where IconBtn
  // tooltips inside the ImagePreview were rendering outside the visible
  // preview surface because the wrapper clipped them.
  const btnRef = useRef(null);
  const [tipPos, setTipPos] = useState(null);
  useEffect(() => {
    if (!tooltip || !hovered || disabled) { setTipPos(null); return; }
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTipPos({ centerX: r.left + r.width / 2, top: r.top });
  }, [tooltip, hovered, disabled]);

  const px = BOX[size] || BOX.md;
  const iconPx = ICON[size] || ICON.md;
  const busy = effState === 'loading';

  const palette = danger
    ? { bg: 'var(--gb-error-tint-soft)', fg: 'var(--gb-error-fg)', bd: 'var(--gb-error-tint-border)', hover: 'var(--gb-error-tint-medium)' }
    : active
      ? { bg: 'var(--gb-brand-tint-medium)', fg: 'var(--gb-brand-label)', bd: 'var(--gb-brand-tint-border)', hover: 'var(--gb-brand-tint-strong)' }
      : variant === 'ghost'
        ? { bg: 'transparent', fg: 'var(--gb-text-tertiary)', bd: 'transparent', hover: 'var(--gb-fill-subtle)' }
        : { bg: 'var(--gb-fill-subtle)', fg: 'var(--gb-text-tertiary)', bd: 'var(--gb-border-default)', hover: 'var(--gb-fill-soft)' };

  const slot =
    busy ? <Spinner size={iconPx} />
      : effState === 'success' ? <I.check size={iconPx} />
        : effState === 'error' ? <I.alert size={iconPx} />
          : sizeIcon(icon, iconPx);

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.button
        ref={btnRef}
        type="button"
        disabled={disabled || busy}
        onClick={(e) => run(onClick, e)}
        animate={{ x: effState === 'error' ? [0, -3, 3, -3, 3, 0] : 0 }}
        transition={effState === 'error' ? { duration: 0.35 } : T.fast}
        whileHover={disabled || busy ? undefined : { backgroundColor: palette.hover }}
        whileTap={disabled || busy ? undefined : { scale: 0.92 }}
        whileFocus={{ boxShadow: 'var(--gb-focus-ring)' }}
        style={{
          width: px, height: px, padding: 0,
          borderRadius: RADIUS[size] || RADIUS.md,
          background: palette.bg, color: palette.fg,
          border: `1px solid ${palette.bd}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled && !busy ? 0.5 : 1,
          flexShrink: 0, outline: 'none', boxSizing: 'border-box',
          ...style,
        }}
        {...rest}
      >
        <span style={{ position: 'relative', width: iconPx, height: iconPx }}>
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
      </motion.button>

      {/* Tooltip — portaled to body so ancestor `overflow:hidden`
          containers (e.g. the ImagePreview's preview wrapper) can't
          clip it. Positioned ABOVE the button via the cached
          bounding rect (`marginBottom: 6` offset already baked into
          translateY: -100%); if there's not enough room above, falls
          back to below. */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {tooltip && hovered && !disabled && tipPos && (() => {
            const flipBelow = tipPos.top < 28;  // not enough room above for the chip
            return (
              <motion.span
                initial={{ opacity: 0, y: flipBelow ? -3 : 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: flipBelow ? -3 : 3 }}
                transition={T.fast}
                style={{
                  position: 'fixed',
                  left: tipPos.centerX,
                  top: flipBelow ? tipPos.top + px + 6 : tipPos.top - 6,
                  transform: flipBelow ? 'translateX(-50%)' : 'translate(-50%, -100%)',
                  padding: '3px 7px', borderRadius: 'var(--gb-r-xs)',
                  background: 'var(--gb-surface-deep)', color: 'var(--gb-text-primary)',
                  border: '1px solid var(--gb-border-default)',
                  boxShadow: 'var(--gb-shadow-popover)',
                  fontSize: 10, fontWeight: 600, fontFamily: 'var(--gb-font-sans)',
                  whiteSpace: 'nowrap', pointerEvents: 'none',
                  zIndex: 2147483600,
                }}
              >
                {tooltip}
              </motion.span>
            );
          })()}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
}
