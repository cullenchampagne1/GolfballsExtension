import React, { useEffect, useRef, useState } from 'react';

/* ───────────────────────────────────────────────────────────────
   GrassMockupComposer — photoreal product mockup of the ball
   nestled in grass, with the user's image composited onto the
   camera-facing pole of the ball.

   The hard part (grass + sky + HDRI lighting + soft Cycles
   shadow + DoF + grass blades occluding the ball) is baked
   ONCE in Blender into icons/mockup_base.png — see the bake
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
─────────────────────────────────────────────────────────────── */

const BAKE_PATH = 'icons/mockup_base.png';
const BAKE_W = 1080;
const BAKE_H = 1080;
// Ball position in the bake — square 1080×1080 frame, ball centered.
// Camera 41mm lens on 36mm sensor, at 3.2m from ball, pitched 35°
// below horizontal, f/2.8 DoF, animation action detached during the
// bake so transforms actually applied.
const BALL_CENTER_X = 540;
const BALL_CENTER_Y = 540;
const BALL_RADIUS_PX = 268;       // ~3px overscan vs the 261.3 silhouette so the warp covers a small feather
// Fraction of ball diameter the logo covers. Bumped from 0.7 → 0.85
// so the print reads bigger on the mockup; at 0.85 the curvature
// foreshortening at the logo edge is still <5%, visually
// indistinguishable from a geodesic warp.
const LOGO_SIZE = 0.85;

export const GrassMockupComposer = React.forwardRef(function GrassMockupComposer(
  { decalDataUrl, onError },
  ref,
) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading');

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

  React.useImperativeHandle(ref, () => ({
    snapshot: () => {
      const c = canvasRef.current;
      return c ? c.toDataURL('image/png') : null;
    },
  }), []);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--gb-surface-canvas, #0e0f10)',
    }}>
      <canvas
        ref={canvasRef}
        width={BAKE_W}
        height={BAKE_H}
        style={{
          maxWidth: '100%', maxHeight: '100%',
          width: 'auto', height: 'auto',
          objectFit: 'contain',
          display: status === 'ready' ? 'block' : 'none',
        }}
      />
      {status === 'loading' && (
        <div style={{
          color: 'var(--gb-text-muted, #888)', fontSize: 13,
          letterSpacing: 0.2,
        }}>Composing mockup…</div>
      )}
      {status === 'error' && (
        <div style={{
          color: 'var(--gb-status-danger, #f55)', fontSize: 13,
        }}>Mockup failed to load</div>
      )}
    </div>
  );
});

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // crossOrigin only matters when the source is a remote URL — for
    // chrome.runtime.getURL() and data: URLs it's a no-op but harmless.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 60)}`));
    img.src = src;
  });
}

/* The single-pass composite. Single-threaded canvas pixel loop —
   ~600k pixels inside the ball disc at the bake resolution, so
   ~25ms on modern hardware. Plenty fast for a one-shot compose;
   if needed we could move this to a WebGL shader later. */
function compose(canvas, baseImg, logoImg) {
  const ctx = canvas.getContext('2d');
  ctx.drawImage(baseImg, 0, 0);
  const baseData = ctx.getImageData(0, 0, BAKE_W, BAKE_H);
  const bd = baseData.data;

  // Rasterize the logo to an offscreen canvas so we can sample its
  // pixels directly. Bilinear sampling below assumes 8-bit RGBA.
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
      if (r2 > 1.0) continue;  // outside ball silhouette

      // Camera-axis flat projection — for logos ≤70% of the ball
      // diameter the curvature foreshortening is <3% at the edge,
      // visually indistinguishable from a geodesic warp.
      const u = nx / LOGO_SIZE + 0.5;
      const v = ny / LOGO_SIZE + 0.5;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;

      // Bilinear sample the logo at (u, v)
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

      // Multiply blend: base pixel is `white × lighting = lighting`,
      // logo color is the print's hue/saturation. base × logo / 255
      // gives `logo × lighting` — i.e. the logo shaded by the same
      // light + dimple shadows as the underlying white ball.
      // Honor the logo's alpha so PNGs with transparent edges blend
      // smoothly into the surrounding white-ball region.
      const alpha = la / 255;
      const inv = 1 - alpha;
      const i = (py * BAKE_W + px) * 4;
      const baseR = bd[i];
      const baseG = bd[i + 1];
      const baseB = bd[i + 2];
      bd[i]     = baseR * inv + (baseR * lr / 255) * alpha;
      bd[i + 1] = baseG * inv + (baseG * lg / 255) * alpha;
      bd[i + 2] = baseB * inv + (baseB * lb / 255) * alpha;
      // alpha channel of the base render is opaque — leave it.
    }
  }

  ctx.putImageData(baseData, 0, 0);
}
