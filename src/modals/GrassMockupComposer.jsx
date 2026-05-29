import React, { useEffect, useRef, useState } from 'react';

/* ───────────────────────────────────────────────────────────────
   GrassMockupComposer — photoreal product mockup of the ball
   nestled in grass, with the user's image composited onto the
   camera-facing pole of the ball.

   The hard part (grass + sky + HDRI lighting + soft Cycles
   shadow + DoF + grass blades occluding the ball) is baked
   ONCE in Blender into assets/mockup_base.png — see the bake
   script in this repo's history. The ball in that bake is a
   pure WHITE Principled-BSDF, so the rendered pixels in the
   ball region equal `white × lighting = lighting`. We can then
   recover per-pixel lighting just by reading the pixel value.

   At runtime the only work is:
     1. Load the baked PNG.
     2. For each pixel inside the ball's screen-space disc,
        spherically warp the user's image to that point and
        multiply by the base pixel — gives `logo × lighting`,
        i.e. the logo printed onto a lit, dimpled white ball.
     3. Pixels outside the logo region keep the base value, so
        the rest of the scene (grass, sky, shadow, blades in
        front of the ball) stays photoreal Cycles output.

   The ball's screen-space center + radius come from projecting
   the world-space ball through the same Blender camera that
   rendered the bake. These constants are baked in below — if
   the bake is re-rendered with a different camera, recompute
   them via Blender's bpy_extras.world_to_camera_view().

   The viewer wraps the composed canvas in the same pan/zoom
   pattern as ImagePreview's 2D image surface: wheel-zoom around
   cursor, drag-to-pan, double-click for 1× ↔ 2× toggle, zoom
   chips in the bottom-right, percent readout bottom-left.
─────────────────────────────────────────────────────────────── */

const BAKE_PATH = 'assets/mockup_base.png';
const BAKE_W = 1080;
const BAKE_H = 1080;
// Ball position in the bake — square 1080×1080 frame, ball centered.
// Camera 41mm lens on 36mm sensor, at 3.6m from ball, pitched 10°
// (fairway-level), sunset_fairway HDRI, f/2.8 DoF. Animation action
// detached during bake so transforms actually applied. Ball sits at
// world z=0.55 (slightly nestled into short grass).
const BALL_CENTER_X = 540;
const BALL_CENTER_Y = 540;
// Silhouette radius for the 3.6m distance is 231.1px (focal 1230 × R 0.665
// / sqrt(D² − R²)). 4px overscan so the warp covers a small feather.
const BALL_RADIUS_PX = 235;
// Fraction of ball diameter the logo covers. >1 means the logo source
// extends past the ball silhouette; the warp clips it to the visible
// cap. Keep at the value the user has dialed in.
const LOGO_SIZE = 1.2;

// Specular-highlight threshold. The baked ball was pure-white Principled
// BSDF, so its rendered pixels = (white × diffuse) + specular_white. Above
// this brightness the contribution is mostly specular reflection of the
// HDRI sun — we want THAT to stay near-white on a colored print, not get
// tinted with the logo. Below this it's diffuse shading that DOES pick up
// the logo's color via multiply.
const SPECULAR_THRESHOLD = 200;
// Silhouette feather radius in pixels. Smooths the boundary where the
// print region meets the unmodified base render so the logo doesn't
// terminate in a hard aliased edge at the ball's limb.
const EDGE_FEATHER_PX = 2.0;

// Pan/zoom — mirrors ImagePreview's 2D image surface so the two
// preview modes feel identical to the user.
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 8;
const ZOOM_STEP_BTN = 0.12;
const ZOOM_STEP_WHEEL = 0.05;

export const GrassMockupComposer = React.forwardRef(function GrassMockupComposer(
  { decalDataUrl, onError },
  ref,
) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const viewportRef = useRef(null);
  // Pan/zoom state mirrored in refs so the transform writer doesn't
  // pay re-render cost while the user is dragging. The percent
  // readout is the only thing that needs state.
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const dragRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [status, setStatus] = useState('loading');

  /* ── compose pipeline ──────────────────────────────────── */
  useEffect(() => {
    if (!decalDataUrl) {
      setStatus('loading');
      return undefined;
    }
    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const bakeUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
          ? chrome.runtime.getURL(BAKE_PATH)
          : BAKE_PATH;
        const [baseImg, logoImg] = await Promise.all([
          loadImage(bakeUrl),
          loadImage(decalDataUrl),
        ]);
        if (cancelled) return;
        compose(canvasRef.current, baseImg, logoImg);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        onError?.(err);
      }
    })();

    return () => { cancelled = true; };
  }, [decalDataUrl, onError]);

  /* ── pan/zoom helpers (mirror ImagePreview) ────────────── */
  function applyTransform(animate) {
    const el = viewportRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform .18s cubic-bezier(.25,.8,.25,1)' : 'none';
    el.style.transform = `translate(${txRef.current}px, ${tyRef.current}px) scale(${scaleRef.current})`;
  }
  function clampPan() {
    const c = wrapRef.current;
    if (!c) return;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    // Match the 2D image's clamp: the rendered surface's edges stay
    // inside the wrapper so the user can't drag the canvas off-screen.
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
      // Pivot around the cursor so the user's focal point stays put.
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

  /* ── wheel-zoom (passive:false so we can preventDefault) ── */
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

  /* ── drag-to-pan ─────────────────────────────────────── */
  const onPointerDown = (e) => {
    if (e.button !== 0 || status !== 'ready') return;
    if (e.target?.closest?.('button')) return;
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
    if (status !== 'ready') return;
    if (e.target?.closest?.('button')) return;
    // Toggle 1× ↔ 2× for a quick zoom-in shortcut — same as 2D view.
    if (scaleRef.current !== 1 || txRef.current !== 0 || tyRef.current !== 0) {
      resetZoom();
    } else {
      scaleRef.current = 2;
      applyTransform(true);
      setZoomLevel(200);
    }
  };

  React.useImperativeHandle(ref, () => ({
    snapshot: () => {
      const c = canvasRef.current;
      return c ? c.toDataURL('image/png') : null;
    },
  }), []);

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      style={{
        position: 'absolute', inset: 0,
        overflow: 'hidden',
        background: 'var(--gb-surface-canvas, #0e0f10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: status === 'ready' ? (dragRef.current ? 'grabbing' : 'grab') : 'default',
        userSelect: 'none', WebkitUserSelect: 'none',
        touchAction: 'none',
      }}
    >
      <div
        ref={viewportRef}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', height: '100%',
          transformOrigin: 'center center',
          willChange: 'transform',
        }}
      >
        <canvas
          ref={canvasRef}
          width={BAKE_W}
          height={BAKE_H}
          style={{
            maxWidth: '100%', maxHeight: '100%',
            width: 'auto', height: 'auto',
            objectFit: 'contain',
            display: status === 'ready' ? 'block' : 'none',
            pointerEvents: 'none',  // drag/wheel handled by wrap
          }}
        />
      </div>
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--gb-text-muted, #888)', fontSize: 13,
        }}>Composing mockup…</div>
      )}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--gb-status-danger, #f55)', fontSize: 13,
        }}>Mockup failed to load</div>
      )}

      {/* Zoom chips + percent readout — mirror the 2D image surface
          so users see the same UI when switching between modes. */}
      {status === 'ready' && (
        <>
          <ZoomReadout level={zoomLevel} />
          <ZoomChipCluster
            onMinus={() => {
              const c = wrapRef.current;
              zoom(-ZOOM_STEP_BTN, c ? c.clientWidth / 2 : 0, c ? c.clientHeight / 2 : 0);
            }}
            onReset={resetZoom}
            onPlus={() => {
              const c = wrapRef.current;
              zoom(ZOOM_STEP_BTN, c ? c.clientWidth / 2 : 0, c ? c.clientHeight / 2 : 0);
            }}
          />
        </>
      )}
    </div>
  );
});

/* Glass-tag styling matched to ImagePreview's chips so the two
   preview modes are visually consistent without importing across
   modal boundaries (those constants live as locals over there). */
const GLASS_BG = 'color-mix(in srgb, var(--gb-surface-1) 70%, transparent)';
const GLASS_FILTER = 'blur(8px) saturate(1.2)';
const GLASS_BORDER = 'color-mix(in srgb, var(--gb-border-default) 60%, transparent)';
const GLASS_RADIUS = '8px';
const GLASS_SHADOW = '0 2px 8px rgba(0, 0, 0, 0.18)';

function ZoomReadout({ level }) {
  return (
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
    }}>{level}%</div>
  );
}

function ZoomChipCluster({ onMinus, onReset, onPlus }) {
  return (
    <div style={{
      position: 'absolute', bottom: 8, right: 8,
      display: 'flex', gap: 4,
    }}>
      <ZoomChip onClick={onMinus}>−</ZoomChip>
      <ZoomChip onClick={onReset}>1:1</ZoomChip>
      <ZoomChip onClick={onPlus}>+</ZoomChip>
    </div>
  );
}

function ZoomChip({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        minWidth: 24, height: 22,
        padding: '0 7px',
        fontSize: 11, fontWeight: 600,
        color: 'var(--gb-text-primary)',
        background: GLASS_BG,
        backdropFilter: GLASS_FILTER,
        WebkitBackdropFilter: GLASS_FILTER,
        border: `1px solid ${GLASS_BORDER}`,
        borderRadius: GLASS_RADIUS,
        boxShadow: GLASS_SHADOW,
        cursor: 'pointer',
        fontFamily: 'var(--gb-font-mono)',
        lineHeight: 1,
      }}
    >{children}</button>
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 60)}`));
    img.src = src;
  });
}

/* Compose the user's logo onto the baked ball.

   Lighting model:
     The baked ball was rendered as pure white Principled BSDF, so each
     base pixel = (white × diffuse_lighting) + specular_white. That means:
       - Below SPECULAR_THRESHOLD, the brightness represents DIFFUSE
         shading (dimple shadows, hemisphere fill). This SHOULD pick up
         the logo's color — a colored print darkened by dimple shadows.
       - Above SPECULAR_THRESHOLD, the brightness represents SPECULAR
         reflection (HDRI sun glint on the smooth plastic). Specular
         highlights on real white plastic stay near-white regardless of
         the ink color underneath — your printed ball still has white
         highlights on a red logo, not red highlights.

     We split each pixel into diffuse + specular components, multiply
     diffuse by the logo color, and add specular back as-is. Result reads
     as a real ink print: shading shapes the color, highlights stay clean.

   Silhouette feather:
     Within EDGE_FEATHER_PX of the ball's limb the print is alpha-blended
     so it doesn't terminate in a hard aliased edge against the grass.

   Single-pass canvas loop — ~170k pixels inside the ball disc, ~10ms
   on modern hardware. Plenty fast for a one-shot compose; could move
   to a WebGL shader later if we add per-frame effects. */
function compose(canvas, baseImg, logoImg) {
  const ctx = canvas.getContext('2d');
  ctx.drawImage(baseImg, 0, 0);
  const baseData = ctx.getImageData(0, 0, BAKE_W, BAKE_H);
  const bd = baseData.data;

  const lc = document.createElement('canvas');
  lc.width = logoImg.naturalWidth;
  lc.height = logoImg.naturalHeight;
  const lctx = lc.getContext('2d');
  lctx.drawImage(logoImg, 0, 0);
  const logoData = lctx.getImageData(0, 0, lc.width, lc.height);
  const ld = logoData.data;
  const LW = lc.width;
  const LH = lc.height;

  const cx = BALL_CENTER_X;
  const cy = BALL_CENTER_Y;
  const R = BALL_RADIUS_PX;
  const x0 = Math.max(0, Math.floor(cx - R));
  const x1 = Math.min(BAKE_W, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R));
  const y1 = Math.min(BAKE_H, Math.ceil(cy + R));

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const nx = (px - cx) / R;
      const ny = (py - cy) / R;
      const r2 = nx * nx + ny * ny;
      if (r2 > 1.0) continue;

      // Silhouette edge feather: weight ramps 0→1 from limb (r=1) to
      // EDGE_FEATHER_PX inward. Inside that band the print blends with
      // the unmodified base; full-strength once we're past the band.
      const r = Math.sqrt(r2);
      const distFromEdgePx = (1.0 - r) * R;
      const edgeWeight = Math.min(1.0, distFromEdgePx / EDGE_FEATHER_PX);
      if (edgeWeight <= 0) continue;

      // Camera-axis flat UV — for a flat sticker-style print this is
      // physically correct; a real screen print on a sphere projects
      // along the camera's optical axis with foreshortening at the limb.
      const u = nx / LOGO_SIZE + 0.5;
      const v = ny / LOGO_SIZE + 0.5;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;

      // Bilinear sample the logo at (u, v).
      const sxF = u * (LW - 1);
      const syF = v * (LH - 1);
      const sx0 = Math.floor(sxF);
      const sy0 = Math.floor(syF);
      const fx = sxF - sx0;
      const fy = syF - sy0;
      const sx1 = Math.min(sx0 + 1, LW - 1);
      const sy1 = Math.min(sy0 + 1, LH - 1);
      const i00 = (sy0 * LW + sx0) * 4;
      const i10 = (sy0 * LW + sx1) * 4;
      const i01 = (sy1 * LW + sx0) * 4;
      const i11 = (sy1 * LW + sx1) * 4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      const lr = ld[i00]     * w00 + ld[i10]     * w10 + ld[i01]     * w01 + ld[i11]     * w11;
      const lg = ld[i00 + 1] * w00 + ld[i10 + 1] * w10 + ld[i01 + 1] * w01 + ld[i11 + 1] * w11;
      const lb = ld[i00 + 2] * w00 + ld[i10 + 2] * w10 + ld[i01 + 2] * w01 + ld[i11 + 2] * w11;
      const la = ld[i00 + 3] * w00 + ld[i10 + 3] * w10 + ld[i01 + 3] * w01 + ld[i11 + 3] * w11;

      const logoAlpha = la / 255;
      if (logoAlpha < 0.005) continue;
      const printAlpha = logoAlpha * edgeWeight;
      const inv = 1 - printAlpha;

      const i = (py * BAKE_W + px) * 4;
      const baseR = bd[i];
      const baseG = bd[i + 1];
      const baseB = bd[i + 2];

      // Split per-channel: anything brighter than SPECULAR_THRESHOLD is
      // specular contribution, the rest is diffuse. The diffuse part
      // gets multiplied by the logo color (logo × lighting); the specular
      // part is added back untouched so highlights stay near-white on
      // a colored print.
      const specR = baseR > SPECULAR_THRESHOLD ? baseR - SPECULAR_THRESHOLD : 0;
      const specG = baseG > SPECULAR_THRESHOLD ? baseG - SPECULAR_THRESHOLD : 0;
      const specB = baseB > SPECULAR_THRESHOLD ? baseB - SPECULAR_THRESHOLD : 0;
      const diffR = baseR - specR;
      const diffG = baseG - specG;
      const diffB = baseB - specB;

      const printR = (diffR * lr) / 255 + specR;
      const printG = (diffG * lg) / 255 + specG;
      const printB = (diffB * lb) / 255 + specB;

      bd[i]     = baseR * inv + printR * printAlpha;
      bd[i + 1] = baseG * inv + printG * printAlpha;
      bd[i + 2] = baseB * inv + printB * printAlpha;
    }
  }

  ctx.putImageData(baseData, 0, 0);
}
