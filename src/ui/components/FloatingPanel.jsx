import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  return (
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
            background: backdrop ? 'var(--gb-backdrop)' : 'transparent',
            backdropFilter: backdrop ? 'var(--gb-backdrop-blur)' : 'none',
            WebkitBackdropFilter: backdrop ? 'var(--gb-backdrop-blur)' : 'none',
          }}
        >
          <FloatingPanelContext.Provider value={ctx}>
            <motion.div
              drag
              dragControls={dragControls}
              dragListener={false}
              dragMomentum={false}
              dragElastic={0.06}
              dragConstraints={wrapperRef}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: T.base }}
              transition={T.bounce}
              style={{
                pointerEvents: 'auto',
                width: cssWidth,
                maxHeight: 'calc(100vh - 32px)',
                background: 'var(--gb-surface-canvas)',
                border: '1px solid var(--gb-border-default)',
                borderRadius: 'var(--gb-r-xl)',
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
              }}
            >
              {children}
            </motion.div>
          </FloatingPanelContext.Provider>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
