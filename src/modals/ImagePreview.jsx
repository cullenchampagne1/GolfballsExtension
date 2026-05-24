import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPanel, ModalHeader, IconBtn, Btn, Callout, Spinner,
  I, T,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';

/* ───────────────────────────────────────────────────────────────
   ImagePreview — port of content/logo-extractor.js's logo modal.

   Public contract:
     <ImagePreview url={...} itemLink={...} onClosed={...} bindClose={...} />

   `url` is OPTIONAL. When omitted the modal opens against a bundled
   fallback (icons/photo_ball.jpg) so the design + interactions are
   testable in the playground without a real logo URL to extract.
   The decode-error Callout only renders when a `url` WAS passed AND
   the image failed to load — the fallback path is its own thing.

   Inner state machine:
     loading  → spinner shown, image hidden
     ready    → image loaded, zoom/pan + actions wired
     error    → red Callout, actions still wired so Copy URL /
                Download / Submit Proof remain useful

   Zoom + pan is implemented with two refs (scale + translate) tracked
   outside React render to avoid re-rendering on every wheel event.
   Apply changes to the image wrapper's CSS transform directly.

   Wired actions in the no-URL playground build:
     • Close (X)              — FloatingPanel handles via bindClose
     • Zoom in / out / reset  — controls bottom-right of preview area
     • Wheel zoom + drag pan  — pointer events on the preview wrapper
     • Copy URL               — clipboard write of the URL (or fallback)
     • Download               — anchor click of the URL
     • Submit Proof           — stub toast (will hand off to the real
                                Submit Proof modal once that lands)
─────────────────────────────────────────────────────────────── */

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 8;
// Smaller per-tick deltas so the user can land precisely on the
// alignment ring. Wheel and button both feel like fine-grained
// adjustments instead of jumps. Was 0.35 / 0.12.
const ZOOM_STEP_BTN = 0.12;
const ZOOM_STEP_WHEEL = 0.05;

/* Preview-surface grid — mirrors the playground's two-layer graph-
   paper backdrop but at a tighter spacing since the area is only
   320px tall. Minor lines every 12px, major every 48px. Re-themes
   automatically because it uses --gb-border-* tokens. */
const PREVIEW_GRID = {
  background: 'var(--gb-surface-canvas)',
  backgroundImage: [
    'linear-gradient(to right,  var(--gb-border-default) 1px, transparent 1px)',
    'linear-gradient(to bottom, var(--gb-border-default) 1px, transparent 1px)',
    'linear-gradient(to right,  var(--gb-border-subtle)  1px, transparent 1px)',
    'linear-gradient(to bottom, var(--gb-border-subtle)  1px, transparent 1px)',
  ].join(', '),
  backgroundSize: '48px 48px, 48px 48px, 12px 12px, 12px 12px',
  backgroundPosition: '0 0',
};

/** Fallback image when no URL is provided. Resolves to a runtime-
 *  qualified URL inside the extension (web_accessible_resources
 *  exposes it so content-script callers also resolve correctly). */
function resolveFallbackUrl() {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      return chrome.runtime.getURL('icons/photo_ball.jpg');
    }
  } catch { /* not in an extension context */ }
  // Last-resort relative path — works for standalone preview pages.
  return 'icons/photo_ball.jpg';
}

/** Image-tile icon used in the header. Inlined because the design-
 *  system icon registry doesn't yet ship a generic photo glyph; if
 *  one lands later, swap to <I.image /> in place of this. */
const ImageIcon = (p) => (
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

export function ImagePreview({ url, itemLink, onClosed, bindClose }) {
  // Resolve which image to render. A URL prop wins; otherwise we fall
  // back to the bundled sample so the modal is fully usable empty.
  const effectiveUrl = url || resolveFallbackUrl();
  const usingFallback = !url;
  const toast = useToast();

  // load-state machine for the preview area + subtitle copy
  const [status, setStatus] = useState('loading');
  const [copied, setCopied] = useState(false);
  // Natural image dimensions in px — captured at load time, displayed
  // in the top-left chip so the user has the source size at a glance
  // without inspecting devtools. Null until the image loads.
  const [imageSize, setImageSize] = useState(null);
  // Alignment overlay toggle. When on, a centered circle is overlaid
  // on the image and the surrounding chrome dims so the user can
  // position the image inside the alignment ring. Real alignment
  // logic ships later — for now this is purely visual + animated.
  const [aligning, setAligning] = useState(false);

  // Zoom + pan: tracked in refs (no re-render per wheel event) plus a
  // tiny zoomLevel state purely so the bottom-left zoom-percentage chip
  // can re-render when it changes.
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const [zoomLevel, setZoomLevel] = useState(100);

  const wrapRef = useRef(null);      // the 340px preview surface (drag + wheel target)
  const viewportRef = useRef(null);  // inner transform layer (translate + scale applied here)

  // Image load wiring. The <img>'s onLoad/onError flips status. We
  // pre-resolve URLs that are already cached so the spinner doesn't
  // flash for a sub-frame on instant loads.
  const onImgLoad = (e) => {
    setStatus('ready');
    // Capture intrinsic dimensions — naturalWidth/Height are the
    // source pixels, not the rendered ones. These feed the size chip.
    const img = e.currentTarget;
    if (img?.naturalWidth) setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
  };
  const onImgError = () => setStatus(usingFallback ? 'ready' : 'error');
  // Reset zoom + load state whenever the URL changes (reopen with a
  // different image — currently never happens in playground but
  // future implementations will swap URLs).
  useEffect(() => {
    setStatus('loading');
    setImageSize(null);
    scaleRef.current = 1; txRef.current = 0; tyRef.current = 0;
    setZoomLevel(100);
    applyTransform(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUrl]);

  function applyTransform(animate) {
    const el = viewportRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform .18s cubic-bezier(.25,.8,.25,1)' : 'none';
    el.style.transform  = `translate(${txRef.current}px, ${tyRef.current}px) scale(${scaleRef.current})`;
  }
  function clampPan() {
    const c = wrapRef.current;
    if (!c) return;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    const maxX = Math.max(0, (cw * scaleRef.current - cw) / 2);
    const maxY = Math.max(0, (ch * scaleRef.current - ch) / 2);
    txRef.current = Math.max(-maxX, Math.min(maxX, txRef.current));
    tyRef.current = Math.max(-maxY, Math.min(maxY, tyRef.current));
  }
  function zoom(delta, originX, originY) {
    const prev = scaleRef.current;
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev * (1 + delta)));
    if (next === prev) return;
    const c = wrapRef.current;
    if (c && originX != null && originY != null) {
      // Pivot zoom around the cursor so the user's focal point stays put
      const ratio = next / prev - 1;
      const cw = c.clientWidth;
      const ch = c.clientHeight;
      txRef.current -= (originX - cw / 2 - txRef.current) * ratio;
      tyRef.current -= (originY - ch / 2 - tyRef.current) * ratio;
    }
    scaleRef.current = next;
    clampPan();
    applyTransform(false);
    setZoomLevel(Math.round(next * 100));
  }
  function resetZoom() {
    scaleRef.current = 1; txRef.current = 0; tyRef.current = 0;
    applyTransform(true);
    setZoomLevel(100);
  }

  // Wheel zoom — passive:false so we can preventDefault the page scroll.
  useEffect(() => {
    const c = wrapRef.current;
    if (!c || status !== 'ready') return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const ox = e.clientX - rect.left;
      const oy = e.clientY - rect.top;
      zoom(e.deltaY < 0 ? ZOOM_STEP_WHEEL : -ZOOM_STEP_WHEEL, ox, oy);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [status]);

  // Drag-to-pan at ANY zoom level. clampPan() keeps the image's edges
  // from escaping the wrapper so the user can't drag the image fully
  // off-screen, but no gate on the zoom level — even a 1x image can
  // be nudged inside its viewport so the user always feels they have
  // tactile control over positioning.
  const dragRef = useRef(null);
  const onPointerDown = (e) => {
    if (e.button !== 0 || status !== 'ready') return;
    // Don't start a drag if the press originated on an interactive
    // overlay control (zoom buttons, 3D, align). The wrapper otherwise
    // captures the pointer via setPointerCapture below, which prevents
    // the underlying click from ever reaching those buttons. Same
    // pattern Throwable uses to keep its own drag handle from eating
    // close-button clicks.
    if (e.target?.closest?.('button, input, textarea, select, a')) return;
    dragRef.current = { x: e.clientX, y: e.clientY, tx: txRef.current, ty: tyRef.current };
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    txRef.current = dragRef.current.tx + (e.clientX - dragRef.current.x);
    tyRef.current = dragRef.current.ty + (e.clientY - dragRef.current.y);
    clampPan();
    applyTransform(false);
  };
  const onPointerUp = (e) => {
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}
  };
  const onDoubleClick = (e) => {
    // Ignore double-clicks that originated on overlay controls — two
    // rapid clicks on the zoom button were bubbling up and treating
    // the wrapper as the dblclick target, snapping zoom back to 1x.
    if (e.target?.closest?.('button, input, textarea, select, a')) return;
    // Toggle 1x ↔ 2x for a quick zoom-in shortcut.
    if (scaleRef.current !== 1 || txRef.current !== 0 || tyRef.current !== 0) {
      resetZoom();
    } else {
      scaleRef.current = 2;
      applyTransform(true);
      setZoomLevel(200);
    }
  };

  // Action handlers
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(effectiveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback for non-secure contexts: hidden textarea + execCommand
      const tmp = document.createElement('textarea');
      tmp.value = effectiveUrl;
      tmp.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(tmp); tmp.select();
      try { document.execCommand('copy'); } catch {}
      tmp.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };
  const onDownload = () => {
    const a = document.createElement('a');
    a.href = effectiveUrl;
    a.download = effectiveUrl.split('/').pop() || 'image';
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  };
  const onSubmitProof = () => {
    // Stub until the real Submit Proof modal lands. Toast keeps the
    // button click feeling responsive instead of doing nothing.
    toast?.info?.('Submit Proof — coming soon', { tone: 'info' });
  };

  // Subtitle copy reflects the active state so the user always knows
  // what they're looking at without reading code.
  const subtitle =
    usingFallback ? 'Sample preview' :
    status === 'loading' ? 'Loading image…' :
    status === 'error'   ? 'Could not load' :
                           (itemLink ? 'Original file' : 'Extracted logo');

  return (
    <FloatingPanel
      width={500}
      backdrop
      onClose={onClosed}
      bindClose={bindClose}
    >
      <ModalHeader
        icon={<ImageIcon />}
        title="Logo Extractor"
        subtitle={subtitle}
      />

      <div style={{ padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Preview surface — fixed-height dark wrapper with the image
            zoomed/panned inside. Zoom controls float bottom-right;
            zoom level chip bottom-left. Cursor swaps to grab when
            zoomed past 1x to hint at panning. */}
        <div
          ref={wrapRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          style={{
            position: 'relative',
            height: 320,
            width: '100%',
            ...PREVIEW_GRID,
            border: '1px solid var(--gb-border-default)',
            borderRadius: 'var(--gb-r-md)',
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: status === 'ready' ? (dragRef.current ? 'grabbing' : 'grab') : 'default',
            userSelect: 'none',
          }}
        >
          {/* Loading overlay — shows while the image is being decoded. */}
          {status === 'loading' && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 10, color: 'var(--gb-text-muted)', fontSize: 12,
            }}>
              <Spinner size={20} />
              <span>Resolving image…</span>
            </div>
          )}

          {/* Inner transform layer — translate + scale applied here so
              the outer wrapper's border-radius keeps clipping correctly. */}
          <div
            ref={viewportRef}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transformOrigin: 'center center',
              willChange: 'transform',
            }}
          >
            {/* The image. Hidden when the surrounding state is loading or
                error so we don't paint a half-broken icon. */}
            {status !== 'error' && (
              <img
                src={effectiveUrl}
                alt={url ? 'Extracted logo' : 'Sample preview'}
                onLoad={onImgLoad}
                onError={onImgError}
                style={{
                  maxWidth: '85%', maxHeight: '85%',
                  width: 'auto', height: 'auto',
                  display: status === 'ready' ? 'block' : 'none',
                  pointerEvents: 'none',
                  WebkitUserDrag: 'none',
                }}
              />
            )}
          </div>

          {/* Floating zoom controls — only visible once the image is
              actually viewable. Use the design-system IconBtn so the
              styling matches the rest of the modal chrome.

              Top-right slot holds a 3D-view trigger that's wired up
              later (placeholder toast for now). Bottom-left is the
              zoom-level chip; bottom-right is the −/1:1/+ control
              cluster. */}
          {status === 'ready' && (
            <>
              <div style={{
                position: 'absolute', top: 8, right: 8,
                display: 'flex', gap: 4,
              }}>
                <IconBtn
                  size="sm"
                  tooltip={aligning ? 'Exit alignment' : 'Align to circle'}
                  icon={<AlignIcon />}
                  active={aligning}
                  onClick={() => setAligning((a) => !a)}
                />
                <IconBtn
                  size="sm"
                  tooltip="View in 3D (coming soon)"
                  icon={<CubeIcon />}
                  onClick={() => toast?.info?.('3D view — coming soon', { tone: 'info' })}
                />
              </div>

              {/* Image-size readout (top-left) — natural source pixels,
                  not the rendered ones. Mirrors the zoom-level chip
                  in the bottom-left so the two readouts visually balance
                  the corners. */}
              {imageSize && (
                <div style={{
                  position: 'absolute', top: 8, left: 10,
                  fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
                  color: 'var(--gb-text-secondary)',
                  background: 'var(--gb-surface-modal)',
                  border: '1px solid var(--gb-border-default)',
                  borderRadius: 'var(--gb-r-sm)',
                  padding: '2px 6px',
                  pointerEvents: 'none',
                  fontFamily: 'var(--gb-font-mono)',
                }}>{imageSize.w}×{imageSize.h}</div>
              )}

              {/* Alignment overlay — toggled by the Align button. A
                  centered circle (60% of the wrapper's shorter side)
                  is highlighted by a massive box-shadow on the inner
                  span that dims everything OUTSIDE the circle. The
                  user positions the image inside the ring. Real
                  alignment logic ships later; this is the visual
                  scaffold + view-change animation. */}
              <AnimatePresence>
                {aligning && (
                  <AlignmentOverlay
                    onSubmit={() => {
                      setAligning(false);
                      // Real alignment ships later; for now confirm to
                      // the user that the gesture registered.
                      toast?.success?.('Alignment saved');
                    }}
                    onCancel={() => setAligning(false)}
                  />
                )}
              </AnimatePresence>

              <div style={{
                position: 'absolute', bottom: 8, left: 10,
                fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
                color: 'var(--gb-text-secondary)',
                background: 'var(--gb-surface-modal)',
                border: '1px solid var(--gb-border-default)',
                borderRadius: 'var(--gb-r-sm)',
                padding: '2px 6px',
                pointerEvents: 'none',
                fontFamily: 'var(--gb-font-mono)',
              }}>{zoomLevel}%</div>
              <div style={{
                position: 'absolute', bottom: 8, right: 8,
                display: 'flex', gap: 4,
              }}>
                <IconBtn size="sm" tooltip="Zoom out" icon={<MinusIcon />}
                  onClick={() => {
                    const c = wrapRef.current;
                    zoom(-ZOOM_STEP_BTN, c ? c.clientWidth / 2 : 0, c ? c.clientHeight / 2 : 0);
                  }} />
                <IconBtn size="sm" tooltip="Reset zoom" icon={<OneToOneIcon />} onClick={resetZoom} />
                <IconBtn size="sm" tooltip="Zoom in" icon={<I.plus />}
                  onClick={() => {
                    const c = wrapRef.current;
                    zoom(ZOOM_STEP_BTN, c ? c.clientWidth / 2 : 0, c ? c.clientHeight / 2 : 0);
                  }} />
              </div>
            </>
          )}
        </div>

        {/* Decode error — only when a real URL was passed AND it failed.
            Fallback (no URL) never shows this. */}
        <AnimatePresence initial={false}>
          {status === 'error' && !usingFallback && (
            <motion.div
              key="err"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={T.base}
              style={{ overflow: 'hidden' }}
            >
              <Callout tone="error" title="Could not load the logo">
                The extension fetched the URL but the image couldn't be decoded. Copy or
                download the file to inspect it directly.
              </Callout>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Primary action row — copy + download. Both stay enabled even
            in the error state since the URL itself is still useful. */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn
            size="sm"
            icon={copied ? <I.check /> : <I.copy />}
            variant={copied ? 'tinted' : 'secondary'}
            status="success"
            onClick={onCopy}
            style={{ flex: 1, minWidth: 0, width: 'auto' }}
          >
            {copied ? 'Copied!' : 'Copy URL'}
          </Btn>
          <Btn
            size="sm"
            variant="primary"
            icon={<DownloadIcon />}
            onClick={onDownload}
            style={{ flex: 1, minWidth: 0, width: 'auto' }}
          >
            Download
          </Btn>
        </div>

        {/* Submit Proof — full-width secondary CTA, stubbed for now. */}
        <Btn
          full
          size="sm"
          variant="tinted"
          status="brand"
          icon={<I.send />}
          onClick={onSubmitProof}
        >
          Submit Proof
        </Btn>
      </div>
    </FloatingPanel>
  );
}

/* ── AlignmentOverlay ───────────────────────────────────────────
   Visual scaffold for the future alignment workflow. Currently a
   pure-CSS spotlight: a centered circle is the "alignment ring"
   the user will position their image inside; the rest of the
   surface dims to focus attention on the ring.

   The dim is done via a giant box-shadow on the circle itself
   (no need for an SVG mask) — the shadow spreads outward from
   the circle's edges and fills the whole preview wrapper with
   semi-transparent black, while the circle itself stays
   transparent. Cleanest mask trick for a circular spotlight.

   Animations:
     • Backdrop dim fades in (.2s)
     • Ring scales from 0.85 → 1 with a slight bounce
     • Crosshair guides fade in shortly after the ring
─────────────────────────────────────────────────────────────── */
function AlignmentOverlay({ onSubmit, onCancel }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // pointerEvents:none on the outer so panning underneath still
        // works; the action bar re-enables auto on itself below.
        pointerEvents: 'none',
      }}
    >
      {/* Ring sized by HEIGHT only (the wrapper's shorter axis since
          the modal is wider than tall). Width follows aspect-ratio 1
          for a true circle. */}
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 26 }}
        style={{
          height: '70%',
          aspectRatio: '1 / 1',
          maxWidth: 240, maxHeight: 240,
          borderRadius: '50%',
          border: '2px solid var(--gb-brand-label)',
          boxShadow: `0 0 0 9999px rgba(0,0,0,.55)`,
        }}
      />
      {/* Crosshair guides — paint thin brand-tinted lines through the
          center of the wrapper to help the user dead-center the image.
          Fade in slightly after the ring so they don't compete for
          attention on entry. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ delay: 0.1, duration: 0.18 }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <div style={{
          position: 'absolute', top: '50%', left: 0, right: 0, height: 1,
          background: 'var(--gb-brand-label)', opacity: 0.4,
        }} />
        <div style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1,
          background: 'var(--gb-brand-label)', opacity: 0.4,
        }} />
      </motion.div>
      {/* Submit / Cancel — small in-frame IconBtns at the bottom-right,
          matching the zoom-control cluster's size + position language.
          pointerEvents:auto re-enables clicks on the buttons inside the
          otherwise pass-through overlay. */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ delay: 0.08, duration: 0.18 }}
        style={{
          position: 'absolute', bottom: 8, right: 8,
          display: 'flex', gap: 4,
          pointerEvents: 'auto',
        }}>
        <IconBtn size="sm" tooltip="Cancel" icon={<I.close />} danger onClick={onCancel} />
        <IconBtn size="sm" tooltip="Save alignment" icon={<I.check />} active onClick={onSubmit} />
      </motion.div>
    </motion.div>
  );
}

// Small inline icons not in the shared registry — modal-local so we
// don't pollute the global icon set with one-offs.
const MinusIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const OneToOneIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" stroke="none"
      fontFamily="'Geist Mono', monospace">1:1</text>
  </svg>
);
const DownloadIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
// Crosshair-in-box — reads as "auto-align / center". Couldn't reuse a
// shared icon (the icon registry doesn't have anything alignment-flavored
// yet) so inlined here next to the cube.
const AlignIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <line x1="12" y1="4" x2="12" y2="20" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <circle cx="12" cy="12" r="1.5" />
  </svg>
);
// Isometric cube — reads as "3D" without needing a dedicated label.
// Three-rhombus arrangement is the standard cube-corner glyph.
const CubeIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);
