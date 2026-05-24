import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPanel, ModalHeader, IconBtn, Btn, Callout, Spinner,
  I, T,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import { GolfballViewer } from './GolfballViewer.jsx';
import { LiquidDrawer } from '../ui/components/LiquidDrawer.jsx';

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

/* Frosted-glass tokens — match the LiquidDrawer capsule aesthetic.
   background uses color-mix directly (NOT backgroundImage — color-mix
   is a <color>, not an <image>, so backgroundImage silently discards it).
   backdrop-filter provides the blur; color-mix provides the tint that
   adapts across all 4 themes automatically. */
const GLASS_BG     = 'color-mix(in srgb, var(--gb-surface-canvas) 62%, transparent)';
const GLASS_BG_HVR = 'color-mix(in srgb, var(--gb-surface-canvas) 78%, transparent)';
const GLASS_BORDER = 'color-mix(in srgb, var(--gb-text-primary) 12%, transparent)';
const GLASS_FILTER = 'blur(18px) saturate(160%)';
const GLASS_SHADOW = '0 4px 14px -6px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.05) inset';
const GLASS_RADIUS = 9; // px — slightly tighter than the capsule's 14

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
  // position the image inside the alignment ring.
  const [aligning, setAligning] = useState(false);
  // Persisted decal — the cropped+masked PNG built from the most
  // recent Save Alignment. Null until the user saves once; cleared
  // when the source URL changes. Feeds the 3D viewer as a decal.
  const [decalDataUrl, setDecalDataUrl] = useState(null);
  // View mode: '2d' shows the image preview + zoom controls; '3d'
  // swaps the same area for the GolfballViewer with the saved decal
  // wrapped on the model. 3D button toggles between them.
  const [view, setView] = useState('2d');

  // Zoom + pan: tracked in refs (no re-render per wheel event) plus a
  // tiny zoomLevel state purely so the bottom-left zoom-percentage chip
  // can re-render when it changes.
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const [zoomLevel, setZoomLevel] = useState(100);

  const wrapRef = useRef(null);      // the 340px preview surface (drag + wheel target)
  const viewportRef = useRef(null);  // inner transform layer (translate + scale applied here)
  const viewerRef = useRef(null);    // GolfballViewer imperative handle — .snapshot() returns a PNG dataURL
  // Mirrors the viewer's internal sceneKey so the fun-menu drawer can
  // hide while an HDRI scene is up (no walls = nothing for bombs to
  // bounce off, so we don't even offer the tool).
  const [viewerSceneKey, setViewerSceneKey] = useState(null);
  // Mirrors the viewer's throwMode so the fun menu is only available
  // when gravity is on — bombs only do something meaningful when
  // physics is running.
  const [viewerThrowMode, setViewerThrowMode] = useState(false);

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
    setDecalDataUrl(null);
    setView('2d');
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
  // Skipped entirely in 3D mode so the GolfballViewer's own wheel
  // handler (ball scale) receives events without competition.
  useEffect(() => {
    const c = wrapRef.current;
    if (!c || status !== 'ready' || view === '3d') return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const ox = e.clientX - rect.left;
      const oy = e.clientY - rect.top;
      zoom(e.deltaY < 0 ? ZOOM_STEP_WHEEL : -ZOOM_STEP_WHEEL, ox, oy);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [status, view]);

  // Drag-to-pan at ANY zoom level. clampPan() keeps the image's edges
  // from escaping the wrapper so the user can't drag the image fully
  // off-screen, but no gate on the zoom level — even a 1x image can
  // be nudged inside its viewport so the user always feels they have
  // tactile control over positioning.
  const dragRef = useRef(null);
  const onPointerDown = (e) => {
    if (e.button !== 0 || status !== 'ready') return;
    // 3D view owns its own input pipeline (drag = rotate or throw the
    // ball, wheel = scale). If we capture pointer here in 3D mode the
    // event never bubbles back to the canvas → the 3D handlers never
    // get pointermove/pointerup → ball gets stuck under the cursor.
    if (view === '3d') return;
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
    // Same defense as onPointerDown — 3D view owns this gesture in
    // its own canvas handlers (double-click = reset zoom, etc.).
    if (view === '3d') return;
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
  /* ── Alignment → decal capture ──────────────────────────────
     Compute the crop the user has currently positioned inside the
     ring, render it onto a square canvas with a circular alpha mask
     so the decal projection later only paints inside the ring,
     and stash the result as `decalDataUrl`. Called from the Save
     button in the alignment action strip.

     Coordinate math (wrapper space → image natural pixel space):
       inner viewport transform = translate(tx, ty) scale(scale)
       around the wrapper's center; image inside is centered via
       flexbox at its rendered (post-fit) size where
         fit = min(0.85 * wrapperW/natW, 0.85 * wrapperH/natH)
       To go from a point P in wrapper coords to image natural coords:
         P' = (P - wrapperCenter - {tx,ty}) / scale / fit + natCenter
     Ring center is wrapperCenter, so its image-space position is:
         ringCenterImage = (-{tx,ty} / scale) / fit + natCenter
     Ring radius in wrapper px = ringRadiusWrapperPx.
     Ring radius in image px = ringRadiusWrapperPx / scale / fit.
  ─────────────────────────────────────────────────────────── */
  function captureAlignment() {
    const wrap = wrapRef.current;
    if (!wrap || !imageSize) return null;
    const wrapperH = wrap.clientHeight;
    const wrapperW = wrap.clientWidth;
    const natW = imageSize.w;
    const natH = imageSize.h;
    // Match the ring's actual rendered size in AlignmentOverlay:
    //   height: 70% of wrapper, aspect-ratio 1, max 240
    const ringDiameterWrapperPx = Math.min(wrapperH * 0.70, 240);
    const ringRadiusWrapperPx = ringDiameterWrapperPx / 2;

    // fit = the px-per-natural-pixel ratio at scale=1
    const fit = Math.min(0.85 * wrapperW / natW, 0.85 * wrapperH / natH);
    const scale = scaleRef.current;
    const tx = txRef.current;
    const ty = tyRef.current;

    // Image-space center of the ring (wrapper center, inverse-transformed)
    const cx = (-tx) / scale / fit + natW / 2;
    const cy = (-ty) / scale / fit + natH / 2;
    const r  = ringRadiusWrapperPx / scale / fit;

    // Crop rect in image natural pixels (square bounding the ring)
    const cropX = cx - r;
    const cropY = cy - r;
    const cropSize = r * 2;

    // Render the source image to an offscreen canvas, then extract the
    // crop with a circular alpha mask. Decal output dimension capped at
    // 1024 to keep texture upload + projection fast.
    const OUT_SIZE = Math.min(1024, Math.max(256, Math.ceil(cropSize)));
    const canvas = document.createElement('canvas');
    canvas.width = OUT_SIZE;
    canvas.height = OUT_SIZE;
    const ctx = canvas.getContext('2d');

    // We draw the source image scaled+translated so the crop region
    // lands at (0,0) → (OUT_SIZE, OUT_SIZE) of the canvas. Use the
    // already-loaded <img> element rather than a fresh fetch.
    const sourceImg = wrap.querySelector('img');
    if (!sourceImg) return null;

    // Circular clip so the decal alpha matches the ring shape.
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUT_SIZE / 2, OUT_SIZE / 2, OUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    // drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh) — extracts a
    // sub-rect of the source and stretches it into the canvas.
    ctx.drawImage(
      sourceImg,
      cropX, cropY, cropSize, cropSize,
      0, 0, OUT_SIZE, OUT_SIZE,
    );
    ctx.restore();

    // Knock out near-white pixels so the underlying ball texture bleeds
    // through (mimicking a real ink print where white = no ink = ball
    // surface). Threshold is generous — anything with all three RGB
    // channels above WHITE_CUTOFF AND low saturation is treated as
    // background. Tuned by eye against the photo_ball.jpg fallback so
    // off-white scanned backgrounds don't paint as visible ink.
    const WHITE_CUTOFF = 235;
    const MAX_CHROMA   = 18;  // max(R,G,B) − min(R,G,B): smaller = closer to gray/white
    try {
      const imgData = ctx.getImageData(0, 0, OUT_SIZE, OUT_SIZE);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (r >= WHITE_CUTOFF && g >= WHITE_CUTOFF && b >= WHITE_CUTOFF) {
          // Pure-ish white → fully transparent
          d[i + 3] = 0;
        } else {
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const chroma = max - min;
          // Off-white / cream: still bright AND low chroma → soft fade
          // out via a linear ramp so the edge between print and ball
          // doesn't read as a hard alpha cliff.
          if (max >= WHITE_CUTOFF - 30 && chroma <= MAX_CHROMA) {
            const ramp = (max - (WHITE_CUTOFF - 30)) / 30;   // 0 at floor, 1 at cutoff
            d[i + 3] = Math.round(d[i + 3] * (1 - ramp));
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (e) {
      // CORS-tainted canvases throw on getImageData. Fall back to the
      // unmodified crop; the 3D decal will look opaque-white but the
      // shape will still be correct.
      console.warn('[ImagePreview] white-knockout skipped:', e);
    }

    return canvas.toDataURL('image/png');
  }

  /* 3D-button handler. Three states:
     • No alignment saved yet  → toast "Align first" and bail.
     • Currently in 3D view    → flip back to 2D.
     • Crop saved, in 2D       → flip into 3D using the cached decal. */
  function on3DToggle() {
    if (view === '3d') { setView('2d'); return; }
    if (!decalDataUrl) {
      toast?.warning?.('Align the image first to set the print area', { tone: 'warning' });
      return;
    }
    setView('3d');
  }

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

  /* 3D snapshot helpers. The GolfballViewer exposes .snapshot()
     which renders the ball ONLY (no walls, transparent background)
     at the user's current rotation/scale into a square PNG dataURL.
     - Copy   → blob → clipboard.write([{ 'image/png': blob }])
     - Download → anchor click with download attribute */
  const snapshotName = () => {
    // Best-effort filename: <stem>-3d.png from the source URL, or
    // a timestamped fallback for blob/data sources.
    const stem = (() => {
      try {
        const last = effectiveUrl.split('/').pop() || '';
        const base = last.split('?')[0].split('#')[0];
        const dot = base.lastIndexOf('.');
        return dot > 0 ? base.slice(0, dot) : base;
      } catch { return ''; }
    })();
    return (stem || `golfball-${Date.now()}`) + '-3d.png';
  };
  const onCopy3D = async () => {
    const url = viewerRef.current?.snapshot?.(1024);
    if (!url) { toast?.error?.('3D viewer not ready'); return; }
    try {
      const blob = await (await fetch(url)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast?.success?.('Snapshot copied');
    } catch (e) {
      toast?.error?.('Copy failed: ' + (e?.message || e));
    }
  };
  const onDownload3D = () => {
    const url = viewerRef.current?.snapshot?.(1024);
    if (!url) { toast?.error?.('3D viewer not ready'); return; }
    const a = document.createElement('a');
    a.href = url;
    a.download = snapshotName();
    document.body.appendChild(a); a.click(); a.remove();
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
          {/* View crossfade — `mode="wait"` keeps only one view in the
              DOM at a time, so the outgoing view finishes its exit
              animation before the incoming view mounts. Without this
              we'd see both rendered simultaneously mid-transition
              (image + 3D canvas overlapping) which reads as a flash. */}
          <AnimatePresence mode="wait" initial={false}>
            {view === '3d' && decalDataUrl ? (
              <motion.div
                key="threed-view"
                /* 2D → 3D entrance: a soft scale-up + opacity ramp.
                   650ms is long enough to feel like the 3D scene is
                   "materializing" rather than snap-cutting in. The
                   loading splash inside the GolfballViewer paints
                   immediately so the user sees motion even while the
                   model + textures finish resolving in the background. */
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                style={{ position: 'absolute', inset: 0, transformOrigin: 'center' }}
              >
                <GolfballViewer
                  ref={viewerRef}
                  decalDataUrl={decalDataUrl}
                  onSceneChange={setViewerSceneKey}
                  onThrowChange={setViewerThrowMode}
                  onError={() => {
                    toast?.error?.('Failed to load 3D viewer');
                    setView('2d');
                  }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="twod-view"
                /* 3D → 2D return: slow, generous fade so the ball
                   gracefully dissolves back to the source image
                   instead of snap-cutting. Longer than the entrance
                   on purpose — the user has typically just been in
                   the 3D scene admiring it; the slow return reads as
                   a thoughtful exit, not a yank back to the editor. */
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.85, ease: [0.4, 0, 0.2, 1] }}
                style={{ position: 'absolute', inset: 0 }}
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
                /* crossOrigin lets us read the loaded image back via
                   canvas getImageData (needed for the white-knockout
                   step in captureAlignment). For same-origin sources
                   like our bundled fallback this is a no-op; for
                   cross-origin URLs the server must respond with
                   Access-Control-Allow-Origin or the image fails to
                   load — which is fine, we just keep the opaque
                   alignment crop. */
                crossOrigin="anonymous"
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
                <GlassIconBtn
                  icon={<AlignIcon />}
                  active={aligning}
                  onClick={() => setAligning((a) => !a)}
                />
                <GlassIconBtn
                  icon={<CubeIcon />}
                  active={view === '3d'}
                  onClick={on3DToggle}
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
                  background: GLASS_BG,
                  backdropFilter: GLASS_FILTER,
                  WebkitBackdropFilter: GLASS_FILTER,
                  border: `1px solid ${GLASS_BORDER}`,
                  borderRadius: GLASS_RADIUS,
                  boxShadow: GLASS_SHADOW,
                  padding: '2px 7px',
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
                {aligning && <AlignmentOverlay />}
              </AnimatePresence>

              {/* Zoom readout + cluster are only meaningful in 2D
                  mode. In 3D the viewer owns wheel scaling and the
                  toolbox (bottom-right) takes over the slot. */}
              {view === '2d' && (
                <>
                  <div style={{
                    position: 'absolute', bottom: 8, left: 10,
                    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
                    color: 'var(--gb-text-secondary)',
                    background: GLASS_BG,
                    backdropFilter: GLASS_FILTER,
                    WebkitBackdropFilter: GLASS_FILTER,
                    border: `1px solid ${GLASS_BORDER}`,
                    borderRadius: GLASS_RADIUS,
                    boxShadow: GLASS_SHADOW,
                    padding: '2px 7px',
                    pointerEvents: 'none',
                    fontFamily: 'var(--gb-font-mono)',
                  }}>{zoomLevel}%</div>
                  <div style={{
                    position: 'absolute', bottom: 8, right: 8,
                    display: 'flex', gap: 4,
                  }}>
                    <ZoomChipBtn
                      tooltip="Zoom out"
                      onClick={() => {
                        const c = wrapRef.current;
                        zoom(-ZOOM_STEP_BTN, c ? c.clientWidth / 2 : 0, c ? c.clientHeight / 2 : 0);
                      }}
                    >−</ZoomChipBtn>
                    <ZoomChipBtn tooltip="Reset zoom" onClick={resetZoom}>1:1</ZoomChipBtn>
                    <ZoomChipBtn
                      tooltip="Zoom in"
                      onClick={() => {
                        const c = wrapRef.current;
                        zoom(ZOOM_STEP_BTN, c ? c.clientWidth / 2 : 0, c ? c.clientHeight / 2 : 0);
                      }}
                    >+</ZoomChipBtn>
                  </div>
                </>
              )}
            </>
          )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 3D-mode toolbox — bottom-right collapsible drawer. Lives
              OUTSIDE both the `status === 'ready'` gate AND the view-
              crossfade AnimatePresence. The crossfade only renders ONE
              of the two motion.divs at a time, so putting the toolbox
              inside the 2D branch (the previous bug) means it never
              shows in 3D. Anchoring it directly to the wrapRef div
              also keeps it stable across view transitions. */}
          {/* Fun menu — only available when gravity is on AND no
              HDRI scene is up. Bombs are meaningless without physics
              and have nothing to bounce off in a skybox. The
              AnimatePresence gives the drawer a soft fade+slide on
              entry/exit so it doesn't pop in/out when the user
              toggles gravity. */}
          <AnimatePresence>
            {view === '3d' && viewerThrowMode && !viewerSceneKey && (
              <motion.div
                key="fun-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.7 }}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}
              >
                <ViewerToolbox viewerRef={viewerRef} />
              </motion.div>
            )}
          </AnimatePresence>
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

        {/* Alignment action strip — slides down ABOVE the primary
            action row whenever the user enters align mode. Lives
            inline (not floated over the buttons below) so the modal's
            height expands naturally; AnimatePresence handles the
            height+opacity collapse on enter/exit. */}
        <AnimatePresence initial={false}>
          {aligning && (
            <motion.div
              key="align-strip"
              initial={{ height: 0, opacity: 0, marginBottom: -8 }}
              animate={{ height: 'auto', opacity: 1, marginBottom: 0 }}
              exit={{ height: 0, opacity: 0, marginBottom: -8 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{
                /* Two-tone "inset" look: surface-2 base with a dashed
                   brand-border, padded just enough to feel like a
                   distinct strip while still mixing with the modal's
                   canvas (matches the settings-page callout cards). */
                padding: 8,
                background: 'var(--gb-surface-2)',
                border: '1px dashed var(--gb-brand-tint-border)',
                borderRadius: 'var(--gb-r-md)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  flex: 1,
                  fontSize: 10.5, fontWeight: 600, letterSpacing: 0.2,
                  color: 'var(--gb-text-tertiary)',
                }}>
                  Position image inside the alignment ring
                </span>
                <Btn
                  size="sm"
                  variant="secondary"
                  onClick={() => setAligning(false)}
                >
                  Cancel
                </Btn>
                <Btn
                  size="sm"
                  variant="tinted"
                  status="brand"
                  icon={<I.check />}
                  onClick={() => {
                    // Snapshot the crop NOW (before we close align mode
                    // and the overlay unmounts) and stash it for the 3D
                    // viewer to consume on next press of the 3D button.
                    const url = captureAlignment();
                    setAligning(false);
                    if (url) {
                      setDecalDataUrl(url);
                      toast?.success?.('Alignment saved — open 3D to preview');
                    } else {
                      toast?.warning?.('Could not capture alignment crop', { tone: 'warning' });
                    }
                  }}
                >
                  Save
                </Btn>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3D-view action strip — same slide-in pattern as the alignment
            strip. Lives above the primary action row whenever the user
            is in 3D mode. Hosts a non-intrusive "back to image" exit
            (so the user doesn't have to find the small cube IconBtn
            inside the 3D canvas) plus copy + download stubs for the
            future 3D-screenshot feature. */}
        <AnimatePresence initial={false}>
          {view === '3d' && (
            <motion.div
              key="three-strip"
              initial={{ height: 0, opacity: 0, marginBottom: -8 }}
              animate={{ height: 'auto', opacity: 1, marginBottom: 0 }}
              exit={{ height: 0, opacity: 0, marginBottom: -8 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{
                padding: 8,
                background: 'var(--gb-surface-2)',
                border: '1px dashed var(--gb-brand-tint-border)',
                borderRadius: 'var(--gb-r-md)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Btn
                  size="sm"
                  variant="secondary"
                  icon={<ChevLeftIcon />}
                  onClick={() => setView('2d')}
                >
                  Image
                </Btn>
                <span style={{ flex: 1 }} />
                <Btn
                  size="sm"
                  variant="secondary"
                  icon={<I.copy />}
                  onClick={onCopy3D}
                >
                  Copy
                </Btn>
                <Btn
                  size="sm"
                  variant="tinted"
                  status="brand"
                  icon={<DownloadIcon />}
                  onClick={onDownload3D}
                >
                  Download
                </Btn>
              </div>
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
function AlignmentOverlay() {
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
      {/* Submit / Cancel live OUTSIDE the overlay now — in a dashed
          action strip slid in above the Copy/Download row when align
          mode is active. See AlignmentActionStrip below. */}
    </motion.div>
  );
}

/* ── ZoomChipBtn ────────────────────────────────────────────────
   Frosted-glass zoom button — matches the LiquidDrawer capsule
   aesthetic so all overlay chrome reads as one family. */
function ZoomChipBtn({ children, tooltip: _tooltip, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minWidth: 22, height: 22, padding: '0 7px',
        fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
        fontFamily: 'var(--gb-font-mono)',
        color: hovered ? 'var(--gb-text-primary)' : 'var(--gb-text-secondary)',
        background: hovered ? GLASS_BG_HVR : GLASS_BG,
        backdropFilter: GLASS_FILTER,
        WebkitBackdropFilter: GLASS_FILTER,
        border: `1px solid ${GLASS_BORDER}`,
        borderRadius: GLASS_RADIUS,
        boxShadow: GLASS_SHADOW,
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1,
        outline: 'none',
        transition: 'color .12s, background-color .12s',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {children}
    </button>
  );
}

/* ── GlassIconBtn ───────────────────────────────────────────────
   Frosted-glass square icon button for the top-right overlay
   controls (align, 3D toggle). Replaces IconBtn inside the
   preview surface so all glass elements share the same aesthetic.
   `active` applies a white pip highlight identical to the
   LiquidDrawer's active pip. */
function GlassIconBtn({ icon, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-viewer-ui="true"
      style={{
        width: 26, height: 26, padding: 0,
        color: active ? '#ffffff' : (hovered ? 'var(--gb-text-primary)' : 'var(--gb-text-secondary)'),
        background: active
          ? 'rgba(255,255,255,0.20)'
          : (hovered ? GLASS_BG_HVR : GLASS_BG),
        backdropFilter: GLASS_FILTER,
        WebkitBackdropFilter: GLASS_FILTER,
        border: `1px solid ${active ? 'rgba(255,255,255,0.22)' : GLASS_BORDER}`,
        borderRadius: GLASS_RADIUS,
        boxShadow: active
          ? '0 0 0 1px rgba(255,255,255,0.22) inset, 0 0 14px -2px rgba(255,255,255,0.35)'
          : GLASS_SHADOW,
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        outline: 'none',
        transition: 'color .12s, background-color .12s, border-color .12s, box-shadow .12s',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {icon}
    </button>
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
// Left-pointing chevron — pairs with the "Image" label in the 3D
// action strip's "back to image" button. Mirrors the design system's
// I.chevr (right) which we don't want to flip via transform because
// the transform would also flip any adjacent text glyphs.
const ChevLeftIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 6l-6 6 6 6" />
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

/* Toolbox glyph for the 3D-mode drawer toggle. A simple briefcase
   shape with a handle reads instantly as "tools / stuff to play
   with". Same stroke weight + line style as the other modal icons
   so it sits cleanly next to the zoom chips. */
const ToolboxIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="12" rx="2" />
    <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    <line x1="3" y1="13" x2="21" y2="13" />
  </svg>
);

/* Bomb glyph — circle body, short fuse, spark dot. */
const BombIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="15" r="6" />
    <path d="M15 9l3-3" />
    <path d="M17 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="currentColor" stroke="none" />
  </svg>
);

/* Ball spawner — three overlapping circles suggesting a pile of
   colorful balls. Hold-to-spawn; matches the ball-pit concept. */
const BallSpawnerIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8"  cy="15" r="5" />
    <circle cx="16" cy="15" r="5" />
    <circle cx="12" cy="8"  r="5" />
  </svg>
);

/* Confetti — four diagonal rectangles at different angles, like
   pieces caught mid-fall. Simple and reads instantly. */
const ConfettiIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3"  y="4"  width="4" height="7" rx="1" transform="rotate(-20 3 4)" />
    <rect x="10" y="2"  width="4" height="6" rx="1" transform="rotate(10 10 2)" />
    <rect x="16" y="5"  width="3" height="6" rx="1" transform="rotate(-35 16 5)" />
    <rect x="5"  y="14" width="4" height="6" rx="1" transform="rotate(25 5 14)" />
    <rect x="14" y="13" width="3" height="5" rx="1" transform="rotate(-15 14 13)" />
  </svg>
);

/* ── ViewerToolbox ──────────────────────────────────────────────
   Bottom-right frosted-glass dropup built on <LiquidDrawer>.

   Tools:
     bomb     — click anywhere on the canvas to place a bomb
     balls    — hold anywhere to rain colored physics balls (1/s)
     confetti — toggle: rain confetti that piles up + scatters in blasts
*/
function ViewerToolbox({ viewerRef }) {
  const [open, setOpen] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  // Track whether the balls tool hold-interval is running.
  const spawnIntervalRef = useRef(null);
  const lastCursorRef = useRef({ clientX: 0, clientY: 0 });

  // Clean up spawner if the tool is deactivated while held.
  useEffect(() => {
    if (activeTool !== 'balls') {
      clearInterval(spawnIntervalRef.current);
      spawnIntervalRef.current = null;
      if (viewerRef.current) viewerRef.current.spawnBallActive = false;
    }
  }, [activeTool, viewerRef]);

  // Deactivate confetti when switching away.
  useEffect(() => {
    if (activeTool !== 'confetti') {
      viewerRef.current?.setConfetti?.(false);
    } else {
      viewerRef.current?.setConfetti?.(true);
    }
  }, [activeTool, viewerRef]);

  // Global pointer listeners for bomb + ball tools.
  useEffect(() => {
    if (!activeTool || activeTool === 'confetti') return undefined;

    const onDown = (e) => {
      if (e.button !== 0) return;
      if (e.target?.closest?.('button, [data-viewer-ui="true"]')) return;
      const v = viewerRef.current;
      if (!v?.containsPoint?.({ clientX: e.clientX, clientY: e.clientY })) return;

      if (activeTool === 'bomb') {
        v.dropBomb?.({ clientX: e.clientX, clientY: e.clientY });
      }
      if (activeTool === 'balls') {
        lastCursorRef.current = { clientX: e.clientX, clientY: e.clientY };
        v.spawnBallActive = true;
        // Spawn immediately on press, then every 100ms while held.
        v.spawnBallAt?.(lastCursorRef.current);
        spawnIntervalRef.current = setInterval(() => {
          if (viewerRef.current?.spawnBallActive) {
            viewerRef.current.spawnBallAt?.(lastCursorRef.current);
          }
        }, 100);
      }
    };

    const onMove = (e) => {
      // Always track cursor so spawn follows it even while held.
      lastCursorRef.current = { clientX: e.clientX, clientY: e.clientY };
    };

    const stopSpawning = () => {
      if (viewerRef.current) viewerRef.current.spawnBallActive = false;
      clearInterval(spawnIntervalRef.current);
      spawnIntervalRef.current = null;
    };

    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stopSpawning);
    window.addEventListener('pointercancel', stopSpawning);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stopSpawning);
      window.removeEventListener('pointercancel', stopSpawning);
      clearInterval(spawnIntervalRef.current);
      spawnIntervalRef.current = null;
    };
  }, [activeTool, viewerRef]);

  const handleOpenChange = (next) => {
    setOpen(next);
    if (!next && activeTool) setActiveTool(null);
  };
  const handlePick = (key) => {
    if (key === activeTool) {
      setActiveTool(null);
      setOpen(false);
    } else {
      setActiveTool(key);
    }
  };

  const tools = [
    { key: 'bomb',     icon: <BombIcon size={14} /> },
    { key: 'balls',    icon: <BallSpawnerIcon size={14} /> },
    { key: 'confetti', icon: <ConfettiIcon size={14} /> },
  ];

  return (
    <LiquidDrawer
      anchor="bottom-right"
      open={open}
      onOpenChange={handleOpenChange}
      toggleIcon={<ToolboxIcon size={14} />}
      items={tools}
      activeKey={activeTool}
      onPick={handlePick}
      ariaLabel="Fun tools"
    />
  );
}
