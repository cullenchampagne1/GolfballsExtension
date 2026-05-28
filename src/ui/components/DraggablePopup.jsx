import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { IconBtn } from './IconBtn.jsx';
import { I } from '../icons.jsx';

/* ───────────────────────────────────────────────────────────────
   DraggablePopup — shared chrome for the secondary draggable popups
   that float over a parent modal (e.g. the EmailRunner side panel,
   the ImagePreview Color Swap controls). Consolidates:

     • drag handle (six dots) + grab cursor on the header
     • icon + title + optional subtitle in a uniform header layout
     • design-system IconBtn for the close X (centred, themed)
     • slide-in entrance with motion spring
     • portal to document.body
     • data-gb-scale="popovers" (uses CSS `scale` so JS coords stay
       in viewport pixels; drag math works without coord conversion)
     • data-gb-kbd-scope so contained controls pick up the keyboard
       focus styles from shared.jsx

   Scale-aware clamp
   -----------------
   `[data-gb-scale="popovers"]` applies `scale: var(--gb-scale-popovers)`
   from scales.js — so the rendered visual is `width × scale` viewport
   pixels wide even though the CSS box says `width`. The drag clamp
   reads the live scale at drag time and multiplies by it before
   subtracting from window.innerWidth / innerHeight, so the popup can
   travel all the way to the visible edge regardless of UI scale
   (previous EmailRunner-only implementation used the unscaled width
   and stopped early on scale < 1, which the user could not drag past).

   Usage
   -----
       <DraggablePopup
         open={isOpen}
         onClose={close}
         anchorHostId="__gb-csm"
         icon={<I.mail size={13} />}
         title="Email selected"
         subtitle="12 contacts queued"
         width={340}
         maxHeight={480}
       >
         <Body />
       </DraggablePopup>
─────────────────────────────────────────────────────────────── */

const DragHandleDots = () => (
  <svg width="9" height="13" viewBox="0 0 9 13" fill="currentColor" aria-hidden>
    <circle cx="2" cy="2"  r="1" />
    <circle cx="7" cy="2"  r="1" />
    <circle cx="2" cy="6.5" r="1" />
    <circle cx="7" cy="6.5" r="1" />
    <circle cx="2" cy="11" r="1" />
    <circle cx="7" cy="11" r="1" />
  </svg>
);

/* Resolve the CSS `zoom` chain UP from the popup's mount parent —
   we need it because the popover portals to document.body, and if
   body (or any ancestor) has a zoom != 1 the browser multiplies
   every left/top we set by that zoom before painting. We want the
   popup to land at the same VISUAL viewport pixel we computed in
   the cursor / anchor math, so dividing the CSS coord by the cumulative
   zoom before assigning it produces the right rendered position.

   Walks document.body up to documentElement, multiplying every
   non-1 zoom along the way. Settings + template editor live under
   <body data-gb-scale="editor"> which compiles to body { zoom: N },
   so that's the typical 2-level walk: body × html (html is always 1).
   The check is cheap and the chain is short. */
function readZoomChain() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 1;
  let z = 1;
  let el = document.body;
  while (el && el !== document.documentElement.parentNode) {
    try {
      const raw = getComputedStyle(el).zoom;
      const n = parseFloat(raw);
      if (Number.isFinite(n) && n > 0) z *= n;
    } catch {}
    el = el.parentElement;
  }
  return z || 1;
}

/* Resolve the popovers scale at drag/position time. Prefers reading
   the COMPUTED `scale` property off the popup element (the source of
   truth for what the browser actually rendered with) — that's robust
   to the CSS-var-on-:root not being set yet at mount, to stylesheet
   load order races, and to any future renaming of the var. Falls
   back to reading --gb-scale-popovers off documentElement if the
   element ref isn't available. */
function readPopoverScale(el) {
  try {
    if (el) {
      const v = getComputedStyle(el).scale;
      const n = parseFloat(String(v || '1'));
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {}
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--gb-scale-popovers');
    const n = parseFloat(String(v || '').trim());
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch { /* fallthrough */ }
  return 1;
}

export function DraggablePopup({
  open,
  onClose,
  /* Optional: a `mountFloating` host id (e.g. "__gb-csm"). When set,
     the popup opens just to the right of that host's .gb-modal-card
     with a 16px gap. Falls back to a viewport-centre + half-modal-
     width estimate. */
  anchorHostId,
  /* Optional: { x, y } viewport coordinates (typically from a click
     event's clientX / clientY). When set, the popup spawns slightly
     below and to the right of the cursor — no anchor element
     management required. Wins over anchorHostId when both are set:
     a cursor anchor is always a more deliberate "open right here"
     intent than a parent-modal fallback. */
  cursorAnchor,
  /* CSS width of the unscaled box. The popup's rendered size in
     viewport pixels is width × scale and the clamp accounts for it. */
  width = 340,
  /* maxHeight is applied to the panel's outer box (clipping body
     overflow). Drag clamping uses this as the height ceiling so the
     popup stays visible regardless of how much body content there is. */
  maxHeight = 480,
  title,
  subtitle,
  icon,
  showClose = true,
  closeDisabled = false,
  closeOnOutside = false,
  zIndex = 2147483400,
  className,
  enterFrom = 'right',  // 'right' | 'bottom'
  /* Custom inline styles passed to the panel root. Useful for
     test fixtures / playground demos. */
  style,
  children,
}) {
  const W = width;
  const H = maxHeight;

  const rootRef = useRef(null);

  const computeInitialPos = () => {
    const scale = readPopoverScale(rootRef.current);
    const Wv = W * scale;        // rendered width in viewport px
    const Hv = H * scale;        // rendered height in viewport px
    let left;
    let top;
    if (cursorAnchor && typeof cursorAnchor.x === 'number' && typeof cursorAnchor.y === 'number') {
      /* Cursor-anchored spawn — sits 12px to the right and 8px below
         the click point. Lets callers (BodyVar bolt, RichTextEditor
         chip, etc.) pop a popup right where the user is looking
         without managing an anchor element. The viewport clamp below
         pulls it back in-bounds when the click was near an edge. */
      left = cursorAnchor.x + 12;
      top  = cursorAnchor.y + 8;
    } else {
      let rect = null;
      if (anchorHostId) {
        const host = document.getElementById(anchorHostId);
        rect = host?.querySelector('.gb-modal-card')?.getBoundingClientRect() || null;
      }
      if (rect) {
        /* First choice: anchor 16px outside the parent modal's right
           edge — fits on wide viewports.
           Fallback (narrow viewport): right-align the popup with the
           parent's right edge so the popup overlays the parent's
           right portion BUT the right edges line up. Reads as "popup
           attached to the parent's right side" instead of the previous
           "shifted way to the left of the parent's right edge". */
        const rightOf = rect.right + 16;
        if (rightOf + Wv > window.innerWidth - 8) {
          left = rect.right - Wv;
        } else {
          left = rightOf;
        }
        top = rect.top;
      } else {
        // No anchor at all → centre.
        left = Math.max(8, (window.innerWidth  - Wv) / 2);
        top  = Math.max(40, (window.innerHeight - Hv) / 2);
      }
    }
    // Final viewport clamp using rendered (scaled) dimensions.
    const maxLeft = Math.max(0, window.innerWidth  - Wv - 8);
    const maxTop  = Math.max(0, window.innerHeight - Math.min(Hv, 80));
    if (left > maxLeft) left = maxLeft;
    if (top < 8) top = 8;
    if (top > maxTop) top = maxTop;
    /* Compensate for ancestor CSS zoom (editor scale, etc.) so a
       coord we computed in true viewport pixels lands at that
       viewport pixel after the browser multiplies by zoom. */
    const z = readZoomChain();
    return { left: Math.max(8, left) / z, top: top / z };
  };

  const [pos, setPos] = useState(computeInitialPos);
  useEffect(() => {
    if (open) setPos(computeInitialPos());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Pointer-drag the popup. transform-origin on data-gb-scale="popovers"
     is `top left`, so the CSS top-left coords align with viewport
     coords (no delta conversion needed). The clamp uses the LIVE scale
     so the popup can travel all the way to the viewport edge at any
     scale — the user-reported bug was that a smaller scale popup
     couldn't be dragged to the bottom because the clamp assumed the
     unscaled height. */
  const dragRef = useRef(null);
  const onDragStart = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = { px: e.clientX, py: e.clientY, left: pos.left, top: pos.top };
    dragRef.current = start;
    const onMove = (ev) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      const scale = readPopoverScale(rootRef.current);
      const z = readZoomChain();
      /* Use the popup's ACTUAL rendered height when possible — the
         element's offsetHeight gives the real content height (which
         caps at maxHeight), so the clamp respects content collapses
         and growth. The clamp is against viewport pixels so multiply
         the popup's CSS box by the ancestor zoom chain to compare
         against window.innerWidth/innerHeight which are in viewport
         pixels. */
      const realW = (rootRef.current?.offsetWidth  || W) * scale * z;
      const realH = (rootRef.current?.offsetHeight || H) * scale * z;
      const maxLeft = Math.max(0, window.innerWidth  - realW);
      const maxTop  = Math.max(0, window.innerHeight - realH);
      /* Mouse delta is in viewport pixels; the popup's CSS left/top
         live in zoom-pre-multiplied space, so divide the delta by the
         ancestor zoom so the popup follows the cursor 1:1 visually. */
      setPos({
        left: Math.max(0, Math.min(maxLeft / z, start.left + dx / z)),
        top:  Math.max(0, Math.min(maxTop  / z, start.top  + dy / z)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  useEffect(() => {
    if (!open || !closeOnOutside) return undefined;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) onClose?.();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, closeOnOutside, onClose]);

  const animProps = enterFrom === 'right'
    ? { initial: { x: 20, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 20, opacity: 0, transition: { duration: 0.15 } } }
    : { initial: { y: 30, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: 30, opacity: 0, transition: { duration: 0.15 } } };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={rootRef}
          /* Always carry the `gb-draggable-popup` class so the
             forceImportantBorderRadius helper (theme.js) recognises
             this subtree as extension-owned and patches every inline
             border-radius below to !important. Without that, host
             pages like golfballs.com flatten our rounded corners
             via their global `* { border-radius: 0 !important }`
             resets. The portal targets document.body so there's no
             extension ancestor to inherit recognition from — the
             class must live ON the popup itself. */
          className={['gb-draggable-popup', className].filter(Boolean).join(' ')}
          data-gb-scale="popovers"
          data-gb-kbd-scope=""
          {...animProps}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          style={{
            position: 'fixed',
            left: pos.left, top: pos.top,
            width: W,
            maxHeight: H,
            background: 'var(--gb-surface-modal)',
            border: '1px solid var(--gb-border-default)',
            borderRadius: 'var(--gb-r-md)',
            zIndex,
            boxShadow: '0 12px 32px -8px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.06) inset',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'var(--gb-font-sans)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            ...style,
          }}
        >
          {/* Header — drag grip + icon + title/subtitle + close X. */}
          <div
            onPointerDown={onDragStart}
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--gb-border-subtle)',
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--gb-surface-1)',
              cursor: dragRef.current ? 'grabbing' : 'grab',
              touchAction: 'none',
              flexShrink: 0,
            }}
          >
            <span style={{ color: 'var(--gb-text-muted)', display: 'flex' }}>
              <DragHandleDots />
            </span>
            {icon && (
              <span style={{ display: 'flex', alignItems: 'center', color: 'var(--gb-text-secondary)' }}>
                {icon}
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {title && (
                <div style={{
                  fontSize: 12, fontWeight: 700,
                  color: 'var(--gb-text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{title}</div>
              )}
              {subtitle && (
                <div style={{
                  fontSize: 10.5, color: 'var(--gb-text-tertiary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{subtitle}</div>
              )}
            </div>
            {showClose && (
              /* stopPropagation on pointerdown so clicking the X doesn't
                 also fire the drag-start on the header behind it. */
              <span onPointerDown={(e) => e.stopPropagation()}>
                <IconBtn
                  size="xs"
                  variant="ghost"
                  icon={<I.close />}
                  onClick={onClose}
                  disabled={closeDisabled}
                  aria-label="Close"
                />
              </span>
            )}
          </div>

          {/* Body — caller-owned. */}
          <div style={{
            flex: 1, minHeight: 0,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
