import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { T, FloatingPanelContext } from '../shared.jsx';
import { Throwable } from './Throwable.jsx';

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
/**
 * Physics knobs forwarded straight to Throwable. Exposed on FloatingPanel
 * so callers (and the playground) can tune the feel per-modal — a
 * margin calculator might want a heavy puck, a tiny info modal something
 * snappier. See <Throwable> for what each value does.
 */
const DEFAULT_PHYSICS = {
  friction: 0.97,
  restitution: 0.82,
  maxSpeed: 3000,
  throwScale: 0.55,
};

export function FloatingPanel({
  children, width = 480, backdrop = true, onClose, bindClose,
  // Per-modal physics override. Merged over DEFAULT_PHYSICS so the
  // caller only has to set what they want to change.
  physics,
}) {
  const [open, setOpen] = useState(true);
  // dragHandleRef is published via context so ModalHeader (or any inner
  // component) can attach itself as the throw handle by setting this
  // ref on its DOM node. Throwable wires its pointer listeners to
  // whatever element is currently in the ref.
  const dragHandleRef = useRef(null);

  const requestClose = useCallback(() => setOpen(false), []);

  // hand the animated-close fn to the caller (keyboard-shortcut toggle, etc.)
  useEffect(() => { bindClose?.(requestClose); }, [bindClose, requestClose]);

  // Escape closes — gracefully
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const ctx = useMemo(() => ({ dragHandleRef, requestClose }), [requestClose]);
  const cssWidth = typeof width === 'number' ? `min(${width}px, calc(100vw - 32px))` : width;
  const phys = { ...DEFAULT_PHYSICS, ...(physics || {}) };

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
        <>
          {/* Backdrop — its own fixed full-viewport layer so the
              physics-driven Throwable above it doesn't have to compete
              with a positioning ancestor. pointerEvents:none keeps it
              click-through so the page underneath stays usable. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 999989,
              pointerEvents: 'none',
              // Tint only, no blur. FloatingPanel's whole reason for existing
              // is that the page underneath stays readable.
              background: backdrop ? 'var(--gb-backdrop)' : 'transparent',
            }}
          />
          <FloatingPanelContext.Provider value={ctx}>
            {/* Throwable owns position — physics loop integrates velocity,
                bounces off viewport walls, decays via friction. The
                modal's own mount/unmount animation (scale+fade) wraps
                INSIDE Throwable so the panel pops into existence at
                its current physics-driven position without arguing with
                the outer translate. */}
            <Throwable
              dragHandle={dragHandleRef}
              friction={phys.friction}
              restitution={phys.restitution}
              maxSpeed={phys.maxSpeed}
              throwScale={phys.throwScale}
              style={{ zIndex: 999990, pointerEvents: 'auto' }}
            >
              <motion.div
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
            </Throwable>
          </FloatingPanelContext.Provider>
        </>
      )}
    </AnimatePresence>,
    portalTarget,
  );
}
