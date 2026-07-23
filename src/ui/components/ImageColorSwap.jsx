/* ───────────────────────────────────────────────────────────────────────────
   ImageColorSwap — shared image-surface kit for the Image Viewer (ImagePreview)
   AND the Gift-Catalog alignment modal (giftCustomize.ImageAlignModal).

   Everything here is light-weight (no 3D / GolfballViewer deps) so it can be
   imported into the catalog bundle without dragging three.js along. It owns the
   bits both surfaces share so they stay byte-identical:

     • PREVIEW_GRID    — the graph-paper themed background.
     • GLASS_*         — frosted-glass tokens for the floating chips/buttons.
     • GlassIconBtn    — a frosted square icon button (eyedropper / reset).
     • DropperIcon / ResetIcon — the two tool glyphs.
     • recolorImage()  — swap every pixel within `tolerance` of `from` → `to`.
     • samplePixel()   — read an {r,g,b} from the displayed image at a CSS point.
     • SwapPopover     — the sampled-color → replacement-color picker popover.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useState, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { Btn, I, Slider, DraggablePopup } from '../index.js';
import { ColorPickerPopover as DSColorPickerPopover } from './ColorPicker.jsx';
import { localPointToClient } from '../../lib/alignmentGeometry.js';

/* Frosted-glass tokens — match the LiquidDrawer capsule aesthetic. color-mix
   provides a theme-adaptive tint; backdrop-filter does the blur. */
export const GLASS_BG     = 'color-mix(in srgb, var(--gb-surface-canvas) 62%, transparent)';
export const GLASS_BG_HVR = 'color-mix(in srgb, var(--gb-surface-canvas) 78%, transparent)';
export const GLASS_BORDER = 'color-mix(in srgb, var(--gb-text-primary) 12%, transparent)';
export const GLASS_FILTER = 'blur(18px) saturate(160%)';
export const GLASS_SHADOW = '0 4px 14px -6px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.05) inset';
export const GLASS_RADIUS = 9;

/* Preview-surface grid — a two-layer graph-paper backdrop. Minor lines every
   12px, major every 48px. Re-themes automatically via --gb-border-* tokens. */
export const PREVIEW_GRID = {
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

export function rgbToHex({ r, g, b }) {
  const h = (v) => v.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

/* Recolor an image: every pixel within `tolerance` RGB distance of `fromRgb`
   becomes `toRgb` (alpha preserved). Pass `toRgb = null` to KNOCK OUT instead —
   matching pixels fade to transparent (alpha → 0 at an exact match, ramping back
   to opaque at the tolerance edge for a clean anti-aliased cut) so e.g. a white
   logo background drops out and a colored ball/chip shows through. Returns a PNG
   dataURL. Rejects on a CORS-tainted canvas. */
export function recolorImage(sourceUrl, fromRgb, toRgb, tolerance) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      try {
        const idata = ctx.getImageData(0, 0, c.width, c.height);
        const d = idata.data;
        const tol2 = tolerance * tolerance;
        const knockout = toRgb === null;
        const tolSafe = Math.max(1, tolerance);
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue;
          const dr = d[i] - fromRgb.r, dg = d[i + 1] - fromRgb.g, db = d[i + 2] - fromRgb.b;
          const dist2 = dr * dr + dg * dg + db * db;
          if (dist2 > tol2) continue;
          if (knockout) {
            // fade alpha to 0 the closer the pixel is to the picked color
            d[i + 3] = Math.round(d[i + 3] * Math.min(1, Math.sqrt(dist2) / tolSafe));
          } else {
            d[i] = toRgb.r; d[i + 1] = toRgb.g; d[i + 2] = toRgb.b;
          }
        }
        ctx.putImageData(idata, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = sourceUrl;
  });
}

/* Read the {r,g,b} under a CSS point in the surface, mapping through the live
   pan/zoom transform back to the image's natural pixels. `fit` is the contain
   scale the <img> is rendered at. Returns null if the point is off the image or
   the canvas is CORS-tainted. (Rotation is ignored — matches the viewer.) */
export function samplePixel(img, { natW, natH, wrapperW, wrapperH, fit, scale, tx, ty, cssX, cssY }) {
  if (!img || !natW || !natH) return null;
  const pxX = (cssX - wrapperW / 2 - tx) / scale / fit + natW / 2;
  const pxY = (cssY - wrapperH / 2 - ty) / scale / fit + natH / 2;
  if (pxX < 0 || pxX >= natW || pxY < 0 || pxY >= natH) return null;
  const c = document.createElement('canvas');
  c.width = natW; c.height = natH;
  const ctx = c.getContext('2d');
  try {
    ctx.drawImage(img, 0, 0, natW, natH);
    const d = ctx.getImageData(Math.floor(pxX), Math.floor(pxY), 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  } catch { return null; }
}

/* A frosted square icon button (eyedropper / reset / etc.). */
export function GlassIconBtn({ icon, active, onClick, title }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-viewer-ui="true"
      style={{
        width: 26, height: 26, padding: 0,
        color: active ? '#ffffff' : (hovered ? 'var(--gb-text-primary)' : 'var(--gb-text-secondary)'),
        background: active ? 'rgba(255,255,255,0.20)' : (hovered ? GLASS_BG_HVR : GLASS_BG),
        backdropFilter: GLASS_FILTER, WebkitBackdropFilter: GLASS_FILTER,
        border: `1px solid ${active ? 'rgba(255,255,255,0.22)' : GLASS_BORDER}`,
        borderRadius: GLASS_RADIUS,
        boxShadow: active ? '0 0 0 1px rgba(255,255,255,0.22) inset, 0 0 14px -2px rgba(255,255,255,0.35)' : GLASS_SHADOW,
        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        outline: 'none', transition: 'color .12s, background-color .12s, border-color .12s, box-shadow .12s',
        WebkitTapHighlightColor: 'transparent',
      }}>
      {icon}
    </button>
  );
}

export const DropperIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 4.5l5 5" />
    <path d="M17 2l5 5-3 3-5-5z" />
    <path d="M14 6l-9 9v4h4l9-9" />
  </svg>
);

export const ResetIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <polyline points="3 4 3 9 8 9" />
  </svg>
);

/* SwapPopover — a tooltip-style popover anchored at the user's last sample
   point. Shows the sampled color, a clickable swatch that opens the DS color
   picker for the replacement, a tolerance slider, and Apply / Cancel. */
// Checkerboard fill for the "transparent" target swatch.
const CHECKER = 'conic-gradient(#cfcfcf 25%, #fff 0 50%, #cfcfcf 0 75%, #fff 0)';

export function SwapPopover({ pick, wrapRef, swapCount, onPreview, onCancel, onApply }) {
  const [newColor, setNewColor] = useState(rgbToHex(pick.color));
  const [tolerance, setTolerance] = useState(30);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [strip, setStrip] = useState(false);   // strip → transparent (knockout)
  const newSwatchRef = useRef(null);
  React.useEffect(() => { setNewColor(rgbToHex(pick.color)); }, [pick.color]);

  const pickedHex = rgbToHex(pick.color);
  const toRgb = hexToRgb(newColor);
  const target = strip ? null : toRgb;   // null = knock out to transparent

  // Debounced live preview as color / tolerance / mode change.
  React.useEffect(() => {
    const id = setTimeout(() => { onPreview?.(target, tolerance); }, 90);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newColor, tolerance, strip]);

  const cursor = wrapRef?.current
    ? localPointToClient(wrapRef.current, pick?.x ?? 0, pick?.y ?? 0)
    : null;

  return (
    <DraggablePopup
      open={true}
      onClose={onCancel}
      cursorAnchor={cursor}
      width={226}
      maxHeight={230}
      icon={<I.eye size={12} />}
      title={swapCount > 0 ? `Swap color · #${swapCount + 1}` : 'Swap color'}
      enterFrom="bottom"
      style={{}}>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div title="Picked color" style={{ width: 26, height: 26, borderRadius: 'var(--gb-r-sm)', background: pickedHex, border: '1px solid var(--gb-border-default)' }} />
          <I.chevr size={11} style={{ color: 'var(--gb-text-tertiary)' }} />
          <button ref={newSwatchRef} type="button" onClick={() => { if (strip) setStrip(false); setPickerOpen((v) => !v); }}
            title={strip ? 'Transparent (click to pick a color instead)' : 'Replacement color'}
            style={{ width: 26, height: 26, padding: 0, cursor: 'pointer', borderRadius: 'var(--gb-r-sm)', border: '1px solid var(--gb-border-default)',
              ...(strip ? { background: CHECKER, backgroundSize: '10px 10px' } : { background: newColor }) }} />
          <span style={{ flex: 1, textAlign: 'right', fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, color: 'var(--gb-text-secondary)', letterSpacing: 0.4 }}>{strip ? 'STRIP' : newColor.toUpperCase()}</span>
        </div>
        <button type="button" onClick={() => setStrip((s) => !s)}
          title="Drop the picked color out to transparent so the surface color shows through"
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10.5, fontWeight: 600,
            background: strip ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)',
            border: '1px solid ' + (strip ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'),
            color: strip ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>
          <span style={{ width: 13, height: 13, borderRadius: 3, background: CHECKER, backgroundSize: '7px 7px', border: '1px solid var(--gb-border-default)', flexShrink: 0 }} />
          Strip to transparent
        </button>
        <AnimatePresence>
          {pickerOpen && (
            <DSColorPickerPopover value={newColor} onChange={(hex) => setNewColor(hex)} anchorRef={newSwatchRef} onClose={() => setPickerOpen(false)} align="left" />
          )}
        </AnimatePresence>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, fontWeight: 600, color: 'var(--gb-text-muted)', letterSpacing: 0.3 }}>
            <span>Tolerance</span>
          </div>
          <Slider value={tolerance} min={0} max={120} step={1} onChange={setTolerance} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn size="sm" variant="secondary" onClick={onCancel} style={{ flex: 1 }}>Cancel</Btn>
          <Btn size="sm" variant="tinted" status="brand" onClick={() => onApply(target, tolerance)} style={{ flex: 1 }}>Apply</Btn>
        </div>
      </div>
    </DraggablePopup>
  );
}
