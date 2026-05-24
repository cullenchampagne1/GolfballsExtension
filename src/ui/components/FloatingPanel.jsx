import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { T, FloatingPanelContext } from '../shared.jsx';

/**
 * FloatingPanel — a draggable, screen-positioned panel for injected tools
 * (margin calculator, call-log panel, etc.). Unlike a centered modal it
 * floats over the page: the dim backdrop is click-through, so the page
 * underneath stays usable.
 *
 * Drag it by any ModalHeader rendered inside it. Closes on Escape or the
 * header's close button — both play the exit animation.
 *
 * Props:
 *   width     intrinsic px width (clamped to the viewport)   · default 480
 *   backdrop  show the dim + blur scrim (click-through)      · default true
 *   onClose   called once the close animation finishes (unmount here)
 *   bindClose optional — receives the animated-close fn, so callers (e.g. a
 *             keyboard shortcut) can trigger a graceful close from outside
 */
export function FloatingPanel({ children, width = 480, backdrop = true, onClose, bindClose }) {
  const [open, setOpen] = useState(true);
  const wrapperRef = useRef(null);
  const dragControls = useDragControls();

  const requestClose = useCallback(() => setOpen(false), []);

  // hand the animated-close fn to the caller (keyboard-shortcut toggle, etc.)
  useEffect(() => { bindClose?.(requestClose); }, [bindClose, requestClose]);

  // Escape closes — gracefully
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const ctx = useMemo(() => ({ dragControls, requestClose }), [dragControls, requestClose]);
  const cssWidth = typeof width === 'number' ? `min(${width}px, calc(100vw - 32px))` : width;

  // Portal to <body> so any ancestor `transform` (e.g. the playground's
  // 0.74x scale wrapper) doesn't reframe our position:fixed coordinates.
  // A position:fixed child of a transformed ancestor anchors to that
  // ancestor — which means drag deltas come in viewport-scaled space and
  // the modal renders at a scaled size on the playground. Portaling
  // escapes both problems in one move.
  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) return null;
  return createPortal(
    <AnimatePresence onExitComplete={onClose}>
      {open && (
        <motion.div
          ref={wrapperRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 999990,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', // backdrop is click-through — page stays usable
            // Tint only, no blur. FloatingPanel's whole reason for existing
            // is that the page underneath stays readable (drag the panel,
            // copy/paste from the page below) — a blur defeats that.
            background: backdrop ? 'var(--gb-backdrop)' : 'transparent',
          }}
        >
          <FloatingPanelContext.Provider value={ctx}>
            <motion.div
              drag
              dragControls={dragControls}
              dragListener={false}
              /* Momentum is on (Motion default) so flicks carry inertia
                 past pointer release. dragElastic 0.2 lets the panel
                 bulge past the viewport edge briefly before snapping
                 back, giving the "walls" a tactile bounce. dragTransition
                 tunes the decay: lower power = stops sooner; higher
                 timeConstant = longer slide. The bounce* settings shape
                 the wall rebound (stiffness 320 / damping 18 ≈ a firm
                 bounce that settles in ~400ms). */
              dragElastic={0.4}
              dragConstraints={wrapperRef}
              /* Bounce-heavy inertia profile — "ice-hockey rink" feel.
                 power=0.6 gives a longer initial slide from a flick;
                 timeConstant=260 controls how quickly friction takes
                 over (higher = slides further). bounceStiffness=800
                 with near-zero bounceDamping (2) makes the wall hit
                 nearly elastic — the panel rebounds with most of its
                 speed intact instead of sticking to the boundary. Spring
                 still decays (Motion doesn't truly reverse velocity on
                 constraint hit) but with these values you get multiple
                 visible bounces per flick. */
              dragTransition={{
                power: 0.6,
                timeConstant: 260,
                bounceStiffness: 800,
                bounceDamping: 2,
              }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: T.base }}
              transition={T.bounce}
              style={{
                // `all: revert-layer` resets every inherited / browser-default
                // property to its un-styled state BEFORE our own styles paint
                // on top. Critical for content-script injection: host pages
                // like golfballs.com ship aggressive resets (e.g.
                // `* { border-radius: 0 !important }` in some legacy CSS)
                // that would otherwise flatten our rounded corners + inputs.
                // revert-layer is safer than `all: initial` because it lets
                // the user-agent default come through (font rendering, focus
                // outlines on inner controls, etc.) which we then override
                // explicitly per-property.
                all: 'revert-layer',
                pointerEvents: 'auto',
                width: cssWidth,
                maxHeight: 'calc(100vh - 32px)',
                background: 'var(--gb-surface-canvas)',
                border: '1px solid var(--gb-border-default)',
                // r-lg (10px) keeps narrow FloatingPanels (~360px) reading
                // as a tight tool window rather than the pill-rounded
                // r-xl (14px) which over-softens at smaller widths.
                borderRadius: 'var(--gb-r-lg)',
                boxShadow: 'var(--gb-shadow-modal)',
                overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                fontFamily: 'var(--gb-font-sans)',
                // Lock font metrics so the modal renders identically across
                // host pages. Without this, any unstyled text inside the
                // modal inherits the host's font-size + line-height — e.g.
                // an empty playground.html with browser-default 16px makes
                // the modal look noticeably bigger than the same modal
                // mounted on a busy site that sets body { font-size: 12px }.
                fontSize: 13,
                lineHeight: 1.4,
                color: 'var(--gb-text-secondary)',
              }}
            >
              {children}
            </motion.div>
          </FloatingPanelContext.Provider>
        </motion.div>
      )}
    </AnimatePresence>,
    portalTarget,
  );
}
