import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { T, FloatingPanelContext } from '../shared.jsx';
import { Throwable } from './Throwable.jsx';

/**
 * FloatingPanel — a screen-positioned modal with two behavior modes.
 *
 *   draggable = true  (default, the original "tool window" mode)
 *     • Drag by any ModalHeader rendered inside (via Throwable physics)
 *     • Click-through backdrop tint — page underneath stays usable
 *     • Closes on Escape or the header close button
 *
 *   draggable = false (classic centered modal)
 *     • Centered in the viewport, NOT draggable
 *     • Solid backdrop captures pointer events — click anywhere outside
 *       the modal to close (animated)
 *     • Closes on Escape or backdrop click
 *
 * Props:
 *   width      intrinsic px width (clamped to the viewport)   · default 480
 *   backdrop   show the dim scrim                              · default true
 *   draggable  enables drag-anywhere + click-through backdrop  · default true
 *   onClose    called once the close animation finishes (unmount here)
 *   bindClose  optional — receives the animated-close fn so callers can
 *              trigger a graceful close from outside (keyboard shortcuts etc.)
 *   physics    optional Throwable-knob overrides (ignored when !draggable)
 */
const DEFAULT_PHYSICS = {
  friction: 0.97,
  restitution: 0.82,
  maxSpeed: 3000,
  throwScale: 0.55,
};

/* Shared modal-card visual — same surface, border, radius, and
   font lockdown whether we're inside Throwable or a centered wrapper. */
/* Inject themed-scrollbar rules once. Any scrollable descendant of
   `.gb-modal-card` inherits a thin, theme-aware track + thumb so we
   never see the OS-default scrollbar (which fights light/dark modes
   and looks out of place in the modal chrome). */
const SCROLLBAR_CSS = `
  .gb-modal-card *::-webkit-scrollbar { width: 8px; height: 8px; }
  .gb-modal-card *::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 8px;
  }
  .gb-modal-card *::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--gb-text-primary) 16%, transparent);
    border-radius: 8px;
    border: 2px solid transparent;
    background-clip: padding-box;
    transition: background .15s;
  }
  .gb-modal-card *::-webkit-scrollbar-thumb:hover {
    background: color-mix(in srgb, var(--gb-text-primary) 32%, transparent);
    background-clip: padding-box;
  }
  .gb-modal-card *::-webkit-scrollbar-corner { background: transparent; }
  .gb-modal-card * { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--gb-text-primary) 18%, transparent) transparent; }
`;
function injectScrollbarStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('gb-modal-scroll-css')) return;
  const el = document.createElement('style');
  el.id = 'gb-modal-scroll-css';
  el.textContent = SCROLLBAR_CSS;
  document.head.appendChild(el);
}

function ModalCard({ cssWidth, cssMaxHeight, children }) {
  // Inject the themed-scrollbar stylesheet on first mount. Safe to
  // call multiple times — the guard in injectScrollbarStyles dedupes.
  useEffect(injectScrollbarStyles, []);
  return (
    <motion.div
      className="gb-modal-card"
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
        all: 'revert-layer',
        width: cssWidth,
        maxHeight: cssMaxHeight,
        background: 'var(--gb-surface-canvas)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-lg)',
        boxShadow: 'var(--gb-shadow-modal)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'var(--gb-font-sans)',
        fontSize: 13,
        lineHeight: 1.4,
        color: 'var(--gb-text-secondary)',
        // Animate width changes so modals that grow a sidebar (e.g.
        // SubmitProof when the previous-proofs gallery loads) glide
        // open instead of snapping. The mount/unmount opacity+scale
        // animation above is unaffected — it uses transform.
        transition: 'width 0.28s cubic-bezier(.4, 0, .2, 1)',
      }}
    >
      {children}
    </motion.div>
  );
}

export function FloatingPanel({
  children, width = 480, backdrop = true, draggable = true, onClose, bindClose,
  // Per-modal physics override. Merged over DEFAULT_PHYSICS so the
  // caller only has to set what they want to change.
  physics,
  // Optional ceiling on the card height. Accepts any CSS value; pass
  // a px number to get the standard "min(Npx, calc(100vh - 32px))"
  // viewport clamp so the modal never spills off-screen on small
  // displays. Defaults to the viewport clamp alone.
  maxHeight,
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
  const cssMaxHeight = maxHeight == null
    ? 'calc(100vh - 32px)'
    : (typeof maxHeight === 'number'
      ? `min(${maxHeight}px, calc(100vh - 32px))`
      : maxHeight);
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
              click-through so the page underneath stays usable.
              Z-order: backdrop sits at 999990, the modal Throwable sits
              at 999999. Large gap because the page may already have
              other extension overlays at this depth — we want the modal
              unmistakably above any sibling fixed-position decoration. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={!draggable ? requestClose : undefined}
            style={{
              position: 'fixed', inset: 0, zIndex: 999990,
              // Draggable mode = click-through so the page stays usable.
              // Centered modal mode = click-to-close: capture pointer events
              // and route any click on the backdrop to the close handler.
              pointerEvents: draggable ? 'none' : 'auto',
              // Visual treatment differs too: draggable uses the soft
              // page-tint backdrop (so the page underneath stays legible),
              // centered modal uses a darker scrim + slight blur to push
              // the page back and focus attention on the modal.
              background: backdrop
                ? (draggable ? 'var(--gb-backdrop)' : 'rgba(0, 0, 0, 0.55)')
                : 'transparent',
              backdropFilter: backdrop && !draggable ? 'blur(4px)' : 'none',
              WebkitBackdropFilter: backdrop && !draggable ? 'blur(4px)' : 'none',
            }}
          />
          <FloatingPanelContext.Provider value={ctx}>
            {draggable ? (
              /* Throwable owns position — physics loop integrates velocity,
                 bounces off viewport walls, decays via friction. The
                 modal's own mount/unmount animation (scale+fade) wraps
                 INSIDE Throwable so the panel pops into existence at
                 its current physics-driven position without arguing with
                 the outer translate. */
              <Throwable
                dragHandle={dragHandleRef}
                friction={phys.friction}
                restitution={phys.restitution}
                maxSpeed={phys.maxSpeed}
                throwScale={phys.throwScale}
                style={{ zIndex: 999999, pointerEvents: 'auto' }}
              >
                <ModalCard cssWidth={cssWidth} cssMaxHeight={cssMaxHeight}>{children}</ModalCard>
              </Throwable>
            ) : (
              /* Centered, non-draggable. Pointer events:none on the
                 wrapper so the backdrop catches outside-clicks; the
                 card itself re-enables them. */
              <div
                style={{
                  position: 'fixed', inset: 0, zIndex: 999999,
                  pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 16,
                }}
              >
                <div style={{ pointerEvents: 'auto' }}>
                  <ModalCard cssWidth={cssWidth} cssMaxHeight={cssMaxHeight}>{children}</ModalCard>
                </div>
              </div>
            )}
          </FloatingPanelContext.Provider>
        </>
      )}
    </AnimatePresence>,
    portalTarget,
  );
}
