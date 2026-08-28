import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { T, FloatingPanelContext } from '../shared.jsx';
import { Throwable } from './Throwable.jsx';

/* Embed context — lets a host (the Operator's Guide) put every modal
   rendered beneath it into `contained` mode and target a portal box,
   WITHOUT each modal having to forward contained/portalContainer props
   to its FloatingPanel. A provider value of { container: el } turns on
   contained mode and portals into `el`. Explicit props still win. */
export const FloatingPanelEmbedContext = React.createContext(null);

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
    border-radius: 8px !important;
  }
  .gb-modal-card *::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--gb-text-primary) 16%, transparent);
    border-radius: 8px !important;
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

function ModalCard({ cssWidth, cssMaxHeight, cssHeight, cardStyle, cardClassName, children }) {
  // Inject the themed-scrollbar stylesheet on first mount. Safe to
  // call multiple times — the guard in injectScrollbarStyles dedupes.
  useEffect(injectScrollbarStyles, []);
  // When embedded in the guide (our own themed page), the `all:
  // revert-layer` host-CSS armor is not only unnecessary, it misfires —
  // reverting the card's own width/opacity past the styles we set here,
  // leaving it narrow + faded. Drop it in embed mode.
  const embedded = !!useContext(FloatingPanelEmbedContext)?.container;
  return (
    <motion.div
      className={['gb-modal-card', 'gb-modal', cardClassName].filter(Boolean).join(' ')}
      data-gb-scale="modals"
      data-gb-kbd-scope=""
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
        ...(embedded ? null : { all: 'revert-layer' }),
        width: cssWidth,
        maxHeight: cssMaxHeight,
        ...(cssHeight ? { height: cssHeight } : null),
        // Skin seam: --gb-modal-* reskin every modal shell (glass bg/blur/
        // border/radius) with defaults preserving the stock look.
        background: 'var(--gb-modal-bg, var(--gb-surface-canvas))',
        backdropFilter: 'var(--gb-modal-blur, none)',
        WebkitBackdropFilter: 'var(--gb-modal-blur, none)',
        border: 'var(--gb-modal-border, 1px solid var(--gb-border-default))',
        borderRadius: 'var(--gb-modal-radius, var(--gb-r-lg))',
        boxShadow: 'var(--gb-modal-shadow, var(--gb-shadow-modal))',
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
        ...cardStyle,
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
  // Optional FIXED card height — modal stays exactly this tall regardless
  // of content. Same px-or-CSS shape as maxHeight; still clamped to the
  // viewport on small screens.
  height,
  // Submodal pattern: when `visible` is false the panel stays mounted
  // (so its internal state — selections, search results, scroll —
  // survives) but animates out of view and turns off pointer events.
  // The host can flip it back to true and the panel slides back in.
  // Default true preserves existing behavior for the dozen callers that
  // don't know about this prop.
  visible = true,
  // Optional extra inline styles merged onto the modal card (after the
  // card's own styles, so the caller wins). Used e.g. to set
  // `userSelect: 'none'` on a specific modal without touching the rest.
  cardStyle,
  // Optional semantic class on the modal card. Custom-action entry points can
  // use this as a selector alias without scraping the modal's implementation.
  cardClassName,
  // Embed mode: render the modal CONTAINED inside a host element instead
  // of the full viewport. Used by the Operator's Guide to show real
  // modals scaled into a framed stage. When set:
  //   • the panel portals into `portalContainer` (not <body>)
  //   • backdrop + card switch from position:fixed → position:absolute,
  //     filling the container rather than the viewport
  //   • dragging is disabled (the modal sits centered in the box)
  //   • size clamps use 100% of the container, not 100vw/vh
  // Defaults preserve the existing full-screen behavior for every
  // production caller.
  contained = false,
  portalContainer = null,
}) {
  const [open, setOpen] = useState(true);

  // Merge explicit props with the embed context (guide). Either turns on
  // contained mode + a portal target; explicit props win.
  const _embed = useContext(FloatingPanelEmbedContext);
  const isContained = contained || !!(_embed && _embed.container);
  const resolvedPortal = portalContainer || (_embed && _embed.container) || null;

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
    // A hidden parent stays mounted while a sibling submodal is active. It
    // must not also consume that submodal's Escape key or both workspaces
    // would close at once.
    if (!visible) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose, visible]);

  // Expose `draggable` through context so inner components (chiefly
  // ModalHeader) know whether they should wire themselves as a drag
  // handle. Without this, a centered/non-draggable modal still shows
  // a grab cursor on the header — confusing because nothing happens.
  const ctx = useMemo(() => ({ dragHandleRef, requestClose, draggable: draggable && !isContained }), [requestClose, draggable, isContained]);
  // Contained mode clamps to the host box; full-screen clamps to viewport.
  const clampW = isContained ? '100%' : 'calc(100vw - 32px)';
  const clampH = isContained ? '100%' : 'calc(100vh - 32px)';
  const cssWidth = typeof width === 'number' ? `min(${width}px, ${clampW})` : width;
  const cssMaxHeight = maxHeight == null
    ? clampH
    : (typeof maxHeight === 'number'
      ? `min(${maxHeight}px, ${clampH})`
      : maxHeight);
  const cssHeight = height == null
    ? undefined
    : (typeof height === 'number'
      ? `min(${height}px, ${clampH})`
      : height);
  const phys = { ...DEFAULT_PHYSICS, ...(physics || {}) };

  // Contained mode never drags (the box is small + scaled) and anchors
  // with absolute positioning inside the host instead of fixed/viewport.
  const isDraggable = draggable && !isContained;
  const posFixed = isContained ? 'absolute' : 'fixed';

  // Portal to <body> so any ancestor `transform` (e.g. a UI-scale
  // wrapper) doesn't reframe our position:fixed coordinates.
  // A position:fixed child of a transformed ancestor anchors to that
  // ancestor — which means drag deltas come in viewport-scaled space and
  // the modal renders at a scaled size. Portaling
  // escapes both problems in one move.
  const portalTarget = resolvedPortal || (typeof document !== 'undefined' ? document.body : null);
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
            animate={{ opacity: visible ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            // In contained (guide-embed) mode the backdrop never closes —
            // the demo modal should stay put inside its box.
            onClick={!isDraggable && !isContained && visible ? requestClose : undefined}
            style={{
              position: posFixed, inset: 0, zIndex: isContained ? 5 : 999990,
              // Draggable mode = click-through so the page stays usable.
              // Centered modal mode = click-to-close: capture pointer events
              // and route any click on the backdrop to the close handler.
              pointerEvents: isDraggable ? "none" : (isContained ? "none" : "auto"),
              // Visual treatment differs too: draggable uses the soft
              // page-tint backdrop (so the page underneath stays legible),
              // centered modal uses a darker scrim + slight blur to push
              // the page back and focus attention on the modal.
              // Contained (guide-embed) mode: no scrim — the framed stage
              // already provides the surround, and a dark overlay would
              // just dim the bench + the demo modal.
              background: (backdrop && !isContained)
                ? (draggable ? 'var(--gb-backdrop)' : 'var(--gb-overlay-strong)')
                : 'transparent',
              backdropFilter: backdrop && !draggable && !isContained ? 'var(--gb-blur-subtle)' : 'none',
              WebkitBackdropFilter: backdrop && !draggable && !isContained ? 'blur(4px)' : 'none',
            }}
          />
          <FloatingPanelContext.Provider value={ctx}>
            {/* Submodal hide: when `visible` is false the wrapper fades
                + turns off pointer events but the children stay mounted
                so the modal's state survives the round trip. Used by
                CRMSearch when it surfaces the Query Builder as a child
                modal: CRMSearch hides for the duration, QB renders, on
                QB close CRMSearch fades back in with selections + search
                results still intact. */}
            <motion.div
              animate={{ opacity: visible ? 1 : 0 }}
              transition={{ duration: 0.18 }}
              style={{
                pointerEvents: visible ? 'auto' : 'none',
              }}
            >
            {isDraggable ? (
              /* Throwable owns position — physics loop integrates velocity,
                 bounces off viewport walls, decays via friction. The
                 modal's own mount/unmount animation (scale+fade) wraps
                 INSIDE Throwable so the panel pops into existence at
                 its current physics-driven position without arguing with
                 the outer translate. data-gb-scale lives on ModalCard
                 (not Throwable) — putting `zoom` on Throwable made its
                 inner offsetWidth + viewport-pixel translate coords
                 inconsistent, causing modals to bounce off invisible
                 walls. Keeping the scale on the card itself lets the
                 collision math run on the zoom-affected dimensions
                 directly. */
              <Throwable
                dragHandle={dragHandleRef}
                friction={phys.friction}
                restitution={phys.restitution}
                maxSpeed={phys.maxSpeed}
                throwScale={phys.throwScale}
                style={{ zIndex: 999999, pointerEvents: 'auto' }}
              >
                <ModalCard cssWidth={cssWidth} cssMaxHeight={cssMaxHeight} cssHeight={cssHeight} cardStyle={cardStyle} cardClassName={cardClassName}>{children}</ModalCard>
              </Throwable>
            ) : (
              /* Centered, non-draggable. Pointer events:none on the
                 wrapper so the backdrop catches outside-clicks; the
                 card itself re-enables them. */
              <div
                style={{
                  position: posFixed, inset: 0, zIndex: isContained ? 6 : 999999,
                  pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: isContained ? 0 : 16,
                }}
              >
                <div style={{ pointerEvents: 'auto' }}>
                  <ModalCard cssWidth={cssWidth} cssMaxHeight={cssMaxHeight} cssHeight={cssHeight} cardStyle={cardStyle} cardClassName={cardClassName}>{children}</ModalCard>
                </div>
              </div>
            )}
            </motion.div>
          </FloatingPanelContext.Provider>
        </>
      )}
    </AnimatePresence>,
    portalTarget,
  );
}
