import React, { useEffect, useRef, useState, useCallback } from 'react';
import ImageTracer from 'imagetracerjs';
import {
  FloatingPanel, ModalHeader, Btn, Segmented, Slider, Spinner, Callout, SectionLabel,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import { PREVIEW_GRID } from '../ui/components/ImageColorSwap.jsx';

/* ───────────────────────────────────────────────────────────────
   ImageVectorizer — experimental playground modal for turning a
   dropped raster image into vector paths (SVG) and previewing
   "decoration" treatments on the traced shape (woven label, engrave,
   emboss …). The goal is to recreate the kind of product-mockup
   treatments seen in supplier presentations, where art is first
   reduced to a clean shape and then a material + lighting model is
   applied within that shape.

   Pipeline:
     drop image → <img> → downscaled canvas → ImageData
       → (mono) luminance threshold → black-on-transparent
       → ImageTracer.imagedataToSVG → SVG path string
     → render SVG, optionally with a CSS filter:url(#fx-…) treatment.

   ImageTracer is pure-JS (no WASM) so it bundles cleanly here and is
   great for fast iteration. For production-grade output the natural
   upgrades are Potrace (cleanest mono silhouette béziers) and VTracer
   (best full-colour), both WASM. The treatments below are SVG-filter
   approximations meant as a starting point to tune by eye.
─────────────────────────────────────────────────────────────── */

const MODE_OPTIONS = [
  { id: 'color', label: 'Color' },
  { id: 'mono',  label: 'Silhouette' },
];

// Decoration treatments. Each maps to a CSS `filter: url(#id)` against the
// inline <defs> below; `flat` is the bare trace. These are deliberately
// simple SVG-filter recipes — tune the primitives to taste.
const FX_OPTIONS = [
  { id: 'flat',    label: 'Flat' },
  { id: 'woven',   label: 'Woven' },
  { id: 'engrave', label: 'Engrave' },
  { id: 'emboss',  label: 'Emboss' },
];

const VIEW_OPTIONS = [
  { id: 'vector',   label: 'Vector' },
  { id: 'split',    label: 'Split' },
  { id: 'original', label: 'Original' },
];

const MAX_TRACE_DIM = 700;   // downscale longest edge before tracing (perf)

export function ImageVectorizer({ onClosed, bindClose, visible = true }) {
  const toast = useToast();

  const [src, setSrc] = useState(null);          // loaded image dataURL
  const [dims, setDims] = useState(null);        // { w, h } natural
  const [loaded, setLoaded] = useState(false);   // <img> decoded
  const [dropActive, setDropActive] = useState(false);

  const [mode, setMode] = useState('mono');
  const [view, setView] = useState('vector');
  const [fx, setFx] = useState('flat');

  // Trace tunables (ImageTracer option names in comments).
  const [numColors, setNumColors] = useState(8); // numberofcolors (color mode)
  const [threshold, setThreshold] = useState(128); // luminance cut (mono mode)
  const [smooth, setSmooth] = useState(1);        // ltres + qtres
  const [despeckle, setDespeckle] = useState(8);  // pathomit
  const [blur, setBlur] = useState(0);            // blurradius

  const [svg, setSvg] = useState(null);
  const [pathCount, setPathCount] = useState(0);
  const [tracing, setTracing] = useState(false);
  const [traceErr, setTraceErr] = useState(false);

  const imgRef = useRef(null);
  const fileInputRef = useRef(null);

  /* ── image loading ─────────────────────────────────────────── */
  const loadFile = useCallback((file) => {
    if (!file || !file.type?.startsWith('image/')) {
      toast?.error?.('Drop an image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setLoaded(false); setSrc(reader.result); };
    reader.onerror = () => toast?.error?.('Could not read file');
    reader.readAsDataURL(file);
  }, [toast]);

  const onWrapDragOver = (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; };
  const onWrapDragEnter = (e) => { e.preventDefault(); setDropActive(true); };
  const onWrapDragLeave = (e) => { e.preventDefault(); if (e.currentTarget === e.target) setDropActive(false); };
  const onWrapDrop = (e) => {
    e.preventDefault();
    setDropActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) loadFile(file);
  };

  // Paste an image from the clipboard anywhere in the modal.
  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith('image/'));
      if (item) loadFile(item.getAsFile());
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadFile]);

  const onImgLoad = (e) => {
    const img = e.currentTarget;
    setDims({ w: img.naturalWidth, h: img.naturalHeight });
    setLoaded(true);
  };

  /* ── trace ─────────────────────────────────────────────────── */
  const runTrace = useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    setTracing(true);
    setTraceErr(false);
    // Yield a frame so the spinner paints before the (synchronous) trace.
    const id = setTimeout(() => {
      try {
        const scale = Math.min(1, MAX_TRACE_DIM / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const idata = ctx.getImageData(0, 0, w, h);

        let options;
        if (mode === 'mono') {
          // Binarize to opaque black on transparent: any pixel that's
          // opaque AND darker than the threshold becomes part of the shape.
          const d = idata.data;
          for (let i = 0; i < d.length; i += 4) {
            const a = d[i + 3];
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            if (a > 10 && lum < threshold) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 255; }
            else { d[i + 3] = 0; }
          }
          options = {
            numberofcolors: 2, colorsampling: 0, pal: [{ r: 0, g: 0, b: 0, a: 255 }],
            ltres: smooth, qtres: smooth, pathomit: despeckle, blurradius: blur, blurdelta: 20,
            strokewidth: 0, linefilter: true, rightangleenhance: false, scale: 1 / (scale || 1),
          };
        } else {
          options = {
            numberofcolors: numColors, colorsampling: 2, colorquantcycles: 3,
            ltres: smooth, qtres: smooth, pathomit: despeckle, blurradius: blur, blurdelta: 20,
            strokewidth: 0, linefilter: true, scale: 1 / (scale || 1),
          };
        }
        const out = ImageTracer.imagedataToSVG(idata, options);
        setSvg(out);
        setPathCount((out.match(/<path/g) || []).length);
      } catch (err) {
        console.warn('[ImageVectorizer] trace failed:', err);
        setTraceErr(true);
        setSvg(null);
      } finally {
        setTracing(false);
      }
    }, 16);
    return () => clearTimeout(id);
  }, [mode, threshold, smooth, despeckle, blur, numColors]);

  // Re-trace (debounced) whenever the image or any tunable changes.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(runTrace, 220);
    return () => clearTimeout(t);
  }, [loaded, src, runTrace]);

  /* ── export ────────────────────────────────────────────────── */
  const copySvg = async () => {
    if (!svg) return;
    try { await navigator.clipboard.writeText(svg); toast?.success?.('SVG copied'); }
    catch { toast?.error?.('Copy failed'); }
  };
  const downloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'traced.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const fxStyle = fx === 'flat' ? undefined : { filter: `url(#fx-${fx})` };
  const hasImage = !!src;

  return (
    <FloatingPanel width={620} backdrop visible={visible} onClose={onClosed} bindClose={bindClose}>
      <ModalHeader icon={<VectorIcon />} title="Image Vectorizer" subtitle="Trace raster art to SVG, then preview decoration treatments" />

      {/* Inline filter defs powering the decoration treatments. Kept
          zero-size + absolutely positioned so they never affect layout;
          the preview references them via CSS filter:url(#fx-…). */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          {/* Woven — turbulence-driven displacement frays the edges into a
              threaded look, with a soft inner relief. */}
          <filter id="fx-woven">
            <feTurbulence type="turbulence" baseFrequency="0.55 0.55" numOctaves="2" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feGaussianBlur in="d" stdDeviation="0.5" result="b" />
            <feSpecularLighting in="b" surfaceScale="2" specularConstant="0.5" specularExponent="10" lightingColor="#ffffff" result="s">
              <feDistantLight azimuth="235" elevation="55" />
            </feSpecularLighting>
            <feComposite in="s" in2="d" operator="in" result="sl" />
            <feComposite in="d" in2="sl" operator="arithmetic" k1="0" k2="1" k3="0.5" k4="0" />
          </filter>
          {/* Engrave — convolution carves shadowed grooves (light top-left,
              dark bottom-right is inverted vs emboss). */}
          <filter id="fx-engrave">
            <feConvolveMatrix order="3" preserveAlpha="true" divisor="1" bias="0.5"
              kernelMatrix="2 1 0  1 1 -1  0 -1 -2" />
          </filter>
          {/* Emboss — raised relief via convolution. */}
          <filter id="fx-emboss">
            <feConvolveMatrix order="3" preserveAlpha="true" divisor="1" bias="0.5"
              kernelMatrix="-2 -1 0  -1 1 1  0 1 2" />
          </filter>
        </defs>
      </svg>

      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Preview surface */}
        <div
          onDragOver={onWrapDragOver}
          onDragEnter={onWrapDragEnter}
          onDragLeave={onWrapDragLeave}
          onDrop={onWrapDrop}
          onClick={() => { if (!hasImage) fileInputRef.current?.click(); }}
          style={{
            position: 'relative', height: 300, borderRadius: 'var(--gb-r-md)',
            border: dropActive ? '1px solid var(--gb-brand-label)' : '1px solid var(--gb-border-default)',
            boxShadow: dropActive ? '0 0 0 3px color-mix(in srgb, var(--gb-brand-label) 22%, transparent)' : 'none',
            transition: 'border-color .18s, box-shadow .18s',
            overflow: 'hidden', display: 'flex', alignItems: 'stretch', justifyContent: 'center',
            cursor: hasImage ? 'default' : 'pointer',
            ...PREVIEW_GRID,
          }}
        >
          {/* Hidden source <img> — drives natural dims + the trace canvas. */}
          {src && (
            <img
              ref={imgRef}
              src={src}
              alt=""
              crossOrigin="anonymous"
              onLoad={onImgLoad}
              style={{ display: 'none' }}
            />
          )}

          {!hasImage && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 8, color: 'var(--gb-text-tertiary)', textAlign: 'center', padding: 24, pointerEvents: 'none',
            }}>
              <VectorIcon size={30} />
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Drop an image to vectorize</div>
              <div style={{ fontSize: 11.5, maxWidth: 320, lineHeight: 1.5 }}>
                Drag a logo or art file here (or click to browse, or paste). It'll be traced to SVG paths you can style as a woven label, engraving, and more.
              </div>
            </div>
          )}

          {/* Original raster (full or left half of split) */}
          {hasImage && (view === 'original' || view === 'split') && (
            <div style={{
              position: view === 'split' ? 'absolute' : 'relative',
              inset: view === 'split' ? '0 50% 0 0' : 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
              borderRight: view === 'split' ? '1px dashed var(--gb-border-default)' : 'none',
            }}>
              <img src={src} alt="original" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          )}

          {/* Vector output (full or right half of split) */}
          {hasImage && (view === 'vector' || view === 'split') && (
            <div style={{
              position: view === 'split' ? 'absolute' : 'relative',
              inset: view === 'split' ? '0 0 0 50%' : 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
            }}>
              {tracing && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--gb-text-muted)', fontSize: 12, zIndex: 2 }}>
                  <Spinner size={18} /> Tracing…
                </div>
              )}
              {traceErr && !tracing && (
                <div style={{ color: 'var(--gb-text-muted)', fontSize: 12 }}>Trace failed — try a smaller image</div>
              )}
              {svg && !traceErr && (
                <div
                  style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: tracing ? 0.4 : 1, ...fxStyle }}
                  // ImageTracer returns a complete <svg>; size it to fit.
                  dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg style="max-width:100%;max-height:100%;height:auto;width:auto" ') }}
                />
              )}
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />
        </div>

        {/* View / treatment toggles + export */}
        {hasImage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Segmented size="sm" value={view} onChange={setView} options={VIEW_OPTIONS} />
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>
              {pathCount} paths{dims ? ` · ${dims.w}×${dims.h}` : ''}
            </span>
            <Btn size="sm" variant="secondary" onClick={copySvg} disabled={!svg}>Copy SVG</Btn>
            <Btn size="sm" variant="tinted" status="brand" onClick={downloadSvg} disabled={!svg}>Download</Btn>
          </div>
        )}

        {/* Controls */}
        {hasImage && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, background: 'var(--gb-surface-2)', borderRadius: 'var(--gb-r-md)', border: '1px solid var(--gb-border-default)' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <LabeledControl label="Trace mode">
                <Segmented size="sm" value={mode} onChange={setMode} options={MODE_OPTIONS} />
              </LabeledControl>
              <LabeledControl label="Treatment">
                <Segmented size="sm" value={fx} onChange={setFx} options={FX_OPTIONS} />
              </LabeledControl>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 18px' }}>
              {mode === 'mono' ? (
                <SliderRow label="Threshold" value={threshold} min={1} max={254} step={1} onChange={setThreshold} hint="Luminance cut for the shape" />
              ) : (
                <SliderRow label="Colors" value={numColors} min={2} max={16} step={1} onChange={setNumColors} hint="Palette size" />
              )}
              <SliderRow label="Smoothing" value={smooth} min={0} max={5} step={0.25} onChange={setSmooth} hint="Curve fit tolerance" />
              <SliderRow label="Despeckle" value={despeckle} min={0} max={40} step={1} onChange={setDespeckle} hint="Drop paths smaller than" />
              <SliderRow label="Pre-blur" value={blur} min={0} max={5} step={1} onChange={setBlur} hint="Soften before tracing" />
            </div>
          </div>
        )}

        {hasImage && fx !== 'flat' && (
          <Callout tone="info" title="Treatments are an early scaffold">
            Woven / engrave / emboss are SVG-filter approximations applied to the traced shape — a starting point to tune. The clean shape from the trace is the real foundation for material + lighting work.
          </Callout>
        )}
      </div>
    </FloatingPanel>
  );
}

/* A label + its control, stacked. */
function LabeledControl({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  );
}

/* A titled slider with a small hint + live value. */
function SliderRow({ label, value, min, max, step, onChange, hint }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>{value}</span>
      </div>
      <Slider value={value} min={min} max={max} step={step} onChange={onChange} showValue={false} />
      {hint && <span style={{ fontSize: 9.5, color: 'var(--gb-text-tertiary)' }}>{hint}</span>}
    </div>
  );
}

const VectorIcon = (p) => (
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 7c6-4 8 10 14 6" />
    <rect x="2" y="5" width="4" height="4" rx="0.6" fill="currentColor" stroke="none" />
    <rect x="18" y="11" width="4" height="4" rx="0.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="13.2" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);
