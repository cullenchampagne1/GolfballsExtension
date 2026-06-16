import React, { useEffect, useRef, useState, useCallback } from 'react';
import ImageTracer from 'imagetracerjs';
import {
  FloatingPanel, ModalHeader, Btn, Segmented, Slider, Spinner, Callout, SectionLabel, Switch, ColorPicker,
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

// Twill-fabric backdrop for the woven (embroidery) treatment — diagonal weave
// lines + faint cross-grain over the chosen base color, so the satin-stitch
// logo reads as sewn onto a cap/garment rather than floating on the grid.
function fabricStyle(color) {
  return {
    backgroundColor: color,
    backgroundImage: [
      'repeating-linear-gradient(48deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 5px)',
      'repeating-linear-gradient(48deg, rgba(0,0,0,0.30) 0 2px, transparent 2px 6px)',
      'repeating-linear-gradient(-42deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 7px)',
    ].join(', '),
  };
}

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
  const [removeBg, setRemoveBg] = useState(true); // knock out the background first
  const [bgTol, setBgTol] = useState(40);         // background match tolerance
  const [numColors, setNumColors] = useState(8); // numberofcolors (color mode)
  const [threshold, setThreshold] = useState(128); // luminance cut (mono mode)
  const [smooth, setSmooth] = useState(1);        // ltres + qtres
  const [despeckle, setDespeckle] = useState(8);  // pathomit
  const [blur, setBlur] = useState(0);            // blurradius

  const [svg, setSvg] = useState(null);
  const [wovenUrl, setWovenUrl] = useState(null);   // canvas embroidery dataURL (woven mode)
  const [pathCount, setPathCount] = useState(0);

  // Woven (embroidery) tunables — exposed as sliders when fx==='woven'.
  const [wovDensity, setWovDensity] = useState(4);     // thread thinness/density
  const [wovStrand, setWovStrand] = useState(0.5);     // floss-strand amount
  const [wovBorder, setWovBorder] = useState(5);       // satin border width
  const [wovSeeThru, setWovSeeThru] = useState(0.5);   // fabric show-through in grooves
  const [wovLight, setWovLight] = useState(120);       // sheen light angle (deg)
  const [wovFabric, setWovFabric] = useState('#23262b');// fabric backdrop color
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

        // Pre-treatment: knock out the connected background so the trace
        // (and the palette) focus on the art, not the white field.
        if (removeBg) removeBackground(idata, bgTol);

        let options;
        if (mode === 'mono') {
          // Binarize to opaque black on transparent: any pixel that's
          // opaque AND darker than the threshold becomes part of the shape.
          const d = idata.data;
          for (let i = 0; i < d.length; i += 4) {
            const a = d[i + 3];
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            // Shape test: when the background was already removed, every
            // surviving (opaque) pixel is part of the silhouette — don't also
            // luminance-gate, or light-but-colored art (e.g. a teal lotus at
            // lum≈129) drops out. Without bg removal, fall back to the
            // luminance threshold to separate dark art from a light field.
            const isShape = a > 128 && (removeBg || lum < threshold);
            // Shape = opaque black; else = fully-zeroed transparent (RGB
            // zeroed too, so it maps to the transparent palette entry rather
            // than the black one — otherwise the whole canvas fills black).
            if (isShape) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 255; }
            else { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 0; }
          }
          options = {
            colorsampling: 0, colorquantcycles: 1,
            // Two entries: transparent (background) + opaque black (shape).
            pal: [{ r: 0, g: 0, b: 0, a: 0 }, { r: 0, g: 0, b: 0, a: 255 }],
            ltres: smooth, qtres: smooth, pathomit: despeckle, blurradius: blur, blurdelta: 20,
            strokewidth: 0, linefilter: true, rightangleenhance: false, scale: 1 / (scale || 1),
          };
        } else {
          // Seed the palette with the image's ACTUAL dominant colors via
          // median-cut (which averages anti-alias tones into their nearest
          // cluster) instead of ImageTracer's position-sampling — that
          // sampling wastes most slots on the white background + edge tones
          // on a logo, collapsing distinct hues (e.g. the green text) into
          // one muddy color. ImageTracer then refines this seed with k-means.
          const pal = medianCutPalette(idata, numColors);
          options = {
            pal, colorsampling: 0, colorquantcycles: 3, mincolorratio: 0,
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
  }, [mode, threshold, smooth, despeckle, blur, numColors, removeBg, bgTol]);

  // Re-trace (debounced) whenever the image or any tunable changes.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(runTrace, 220);
    return () => clearTimeout(t);
  }, [loaded, src, runTrace]);

  // Woven embroidery is generated straight from the raster (no vectorization).
  useEffect(() => {
    if (fx !== 'woven' || !loaded) { setWovenUrl(null); return; }
    const t = setTimeout(() => {
      setWovenUrl(buildEmbroidery(imgRef.current, removeBg, bgTol, {
        density: wovDensity, strand: wovStrand, border: wovBorder, seeThrough: wovSeeThru, light: wovLight,
      }));
    }, 120);
    return () => clearTimeout(t);
  }, [fx, loaded, src, removeBg, bgTol, wovDensity, wovStrand, wovBorder, wovSeeThru, wovLight]);

  /* ── export ────────────────────────────────────────────────── */
  const copySvg = async () => {
    if (!svg) return;
    try { await navigator.clipboard.writeText(svg); toast?.success?.('SVG copied'); }
    catch { toast?.error?.('Copy failed'); }
  };
  const downloadSvg = () => {
    const a = document.createElement('a');
    if (fx === 'woven') {                 // woven is a raster mockup → PNG
      if (!wovenUrl) return;
      a.href = wovenUrl; a.download = 'embroidery.png'; a.click();
      return;
    }
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    a.href = URL.createObjectURL(blob);
    a.download = 'traced.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // Woven renders as a raster embroidery mockup (buildEmbroidery); engrave/
  // emboss stay as CSS post-filters; flat is the bare trace.
  const fxStyle = (fx === 'flat' || fx === 'woven') ? undefined : { filter: `url(#fx-${fx})` };
  const hasImage = !!src;

  return (
    <FloatingPanel width={620} backdrop visible={visible} onClose={onClosed} bindClose={bindClose}>
      <ModalHeader icon={<VectorIcon />} title="Image Vectorizer" subtitle="Trace raster art to SVG, then preview decoration treatments" />

      {/* Inline filter defs powering the decoration treatments. Kept
          zero-size + absolutely positioned so they never affect layout;
          the preview references them via CSS filter:url(#fx-…). */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          {/* Woven — buildEmbroidery() draws the satin thread texture onto a
              raster canvas; this filter adds the raised, puffed-thread bevel on
              top. The woven <img> references it via filter:url(#emb-raise). */}
          <filter id="emb-raise" x="-8%" y="-8%" width="116%" height="116%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="b" />
            <feSpecularLighting in="b" surfaceScale="1.6" specularConstant="0.5" specularExponent="18" lightingColor="#ffffff" result="s">
              <feDistantLight azimuth="235" elevation="60" />
            </feSpecularLighting>
            <feComposite in="s" in2="SourceAlpha" operator="in" result="sc" />
            <feComposite in="SourceGraphic" in2="sc" operator="arithmetic" k1="0" k2="1" k3="0.4" k4="0" />
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
              // Embroidery sits on twill fabric; other treatments keep the grid.
              ...(fx === 'woven' ? fabricStyle(wovFabric) : null),
            }}>
              {tracing && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--gb-text-muted)', fontSize: 12, zIndex: 2 }}>
                  <Spinner size={18} /> Tracing…
                </div>
              )}
              {traceErr && !tracing && (
                <div style={{ color: 'var(--gb-text-muted)', fontSize: 12 }}>Trace failed — try a smaller image</div>
              )}
              {/* Woven → raster embroidery generated straight from the source
                  (no vectorization), with the raised-thread bevel filter. */}
              {fx === 'woven' && wovenUrl && (
                <img
                  src={wovenUrl}
                  alt="embroidery preview"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: 'url(#emb-raise)', opacity: tracing ? 0.4 : 1 }}
                />
              )}
              {fx !== 'woven' && svg && !traceErr && (
                <div
                  style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: tracing ? 0.4 : 1, ...fxStyle }}
                  // fitSvg adds a viewBox so the trace scales (not clips) to fit.
                  dangerouslySetInnerHTML={{ __html: fitSvg(svg) }}
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
              {fx === 'woven' ? 'embroidery' : `${pathCount} paths`}{dims ? ` · ${dims.w}×${dims.h}` : ''}
            </span>
            <Btn size="sm" variant="secondary" onClick={copySvg} disabled={fx === 'woven' || !svg}>Copy SVG</Btn>
            <Btn size="sm" variant="tinted" status="brand" onClick={downloadSvg} disabled={fx === 'woven' ? !wovenUrl : !svg}>
              {fx === 'woven' ? 'Download PNG' : 'Download'}
            </Btn>
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

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 2, borderBottom: '1px solid var(--gb-border-subtle)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gb-text-primary)' }}>Remove background</span>
                <span style={{ fontSize: 9.5, color: 'var(--gb-text-tertiary)' }}>Key out the corner/background color everywhere (incl. inside letters) before tracing</span>
              </div>
              <Switch on={removeBg} onChange={setRemoveBg} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 18px' }}>
              {removeBg && (
                <SliderRow label="BG tolerance" value={bgTol} min={0} max={120} step={1} onChange={setBgTol} hint="How close to the corner color counts as background" />
              )}
              {fx === 'woven' ? (
                <>
                  <SliderRow label="Thread density" value={wovDensity} min={1} max={10} step={1} onChange={setWovDensity} hint="Higher = thinner threads" />
                  <SliderRow label="Strands" value={wovStrand} min={0} max={1} step={0.05} onChange={setWovStrand} hint="Floss strand texture" />
                  <SliderRow label="Border width" value={wovBorder} min={0} max={12} step={1} onChange={setWovBorder} hint="Satin outline thickness" />
                  <SliderRow label="See-through" value={wovSeeThru} min={0} max={1} step={0.05} onChange={setWovSeeThru} hint="Fabric showing between stitches" />
                  <SliderRow label="Light angle" value={wovLight} min={0} max={360} step={5} onChange={setWovLight} hint="Sheen direction (°)" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>Fabric color</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ColorPicker value={wovFabric} onChange={setWovFabric} size="sm" />
                      {['#23262b', '#0f0f12', '#1b2a3a', '#3a3a3a', '#5a4632', '#f4f1ea'].map((sw) => (
                        <button key={sw} type="button" onClick={() => setWovFabric(sw)} title={sw}
                          style={{ width: 16, height: 16, borderRadius: '50%', padding: 0, cursor: 'pointer', background: sw, border: '1px solid var(--gb-border-default)' }} />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {mode === 'mono'
                    ? (!removeBg && <SliderRow label="Threshold" value={threshold} min={1} max={254} step={1} onChange={setThreshold} hint="Luminance cut for the shape" />)
                    : <SliderRow label="Colors" value={numColors} min={2} max={16} step={1} onChange={setNumColors} hint="Palette size" />}
                  <SliderRow label="Smoothing" value={smooth} min={0} max={5} step={0.25} onChange={setSmooth} hint="Curve fit tolerance" />
                  <SliderRow label="Despeckle" value={despeckle} min={0} max={40} step={1} onChange={setDespeckle} hint="Drop paths smaller than" />
                  <SliderRow label="Pre-blur" value={blur} min={0} max={5} step={1} onChange={setBlur} hint="Soften before tracing" />
                </>
              )}
            </div>
          </div>
        )}

        {hasImage && (fx === 'engrave' || fx === 'emboss') && (
          <Callout tone="info" title="Treatment is an early scaffold">
            Engrave / emboss are SVG-filter approximations applied to the traced shape — a starting point to tune.
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

/* ImageTracer emits <svg width="W" height="H" …> with NO viewBox, so the
   coordinate system is pinned 1:1 to those pixel dimensions. Shrinking the
   element with max-width then CLIPS the drawing to the top-left corner
   instead of scaling it — a centered logo with margins shows only empty
   corner (blank). Inject a viewBox (from the width/height) + responsive
   sizing so the whole drawing scales to fit the preview. */
function fitSvg(svgString) {
  const m = svgString.match(/<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/);
  const vb = m ? ` viewBox="0 0 ${m[1]} ${m[2]}"` : '';
  return svgString.replace(
    '<svg ',
    `<svg preserveAspectRatio="xMidYMid meet"${vb} style="display:block;max-width:100%;max-height:100%;width:auto;height:auto" `,
  );
}

/* Cheap deterministic value noise (hash-based, bilinear-smoothed) for the
   thread domain-warp + fiber detail. Deterministic → stable across re-renders. */
function nhash(x, y) { let h = (x | 0) * 374761393 + (y | 0) * 668265263; h = (h ^ (h >> 13)); h = Math.imul(h, 1274126177); return ((h ^ (h >> 16)) >>> 0) / 4294967295; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = nhash(xi, yi), b = nhash(xi + 1, yi), c = nhash(xi, yi + 1), e = nhash(xi + 1, yi + 1);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
}

/* Connected-component labeling of a binary mask + each component's satin fill
   angle (perpendicular to its principal axis, via PCA moments). One uniform
   direction per shape keeps the fill straight (no swirly per-pixel "curls"). */
function components(mask, w, h) {
  const lab = new Int32Array(w * h); let n = 0; const angle = [0]; const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s]) continue;
    n++; let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, cnt = 0; stack.push(s); lab[s] = n;
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; cnt++;
      if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = n; stack.push(p - 1); }
      if (x < w - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = n; stack.push(p + 1); }
      if (y > 0 && mask[p - w] && !lab[p - w]) { lab[p - w] = n; stack.push(p - w); }
      if (y < h - 1 && mask[p + w] && !lab[p + w]) { lab[p + w] = n; stack.push(p + w); }
    }
    const mx = sx / cnt, my = sy / cnt, cxx = sxx / cnt - mx * mx, cyy = syy / cnt - my * my, cxy = sxy / cnt - mx * my;
    angle.push(0.5 * Math.atan2(2 * cxy, cxx - cyy) + Math.PI / 2);   // ⟂ principal axis = across the stroke
  }
  return { lab, angle };
}

/* Two-pass chamfer distance transform: distance from each foreground pixel to
   the nearest background pixel. Drives contour-following satin threads. */
function distanceTransform(mask, w, h) {
  const D = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) D[i] = mask[i] ? 1e9 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!D[i]) continue; let d = D[i];
    if (x > 0) d = Math.min(d, D[i - 1] + 1); if (y > 0) d = Math.min(d, D[i - w] + 1);
    if (x > 0 && y > 0) d = Math.min(d, D[i - w - 1] + 1.4142); if (x < w - 1 && y > 0) d = Math.min(d, D[i - w + 1] + 1.4142); D[i] = d;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!D[i]) continue; let d = D[i];
    if (x < w - 1) d = Math.min(d, D[i + 1] + 1); if (y < h - 1) d = Math.min(d, D[i + w] + 1);
    if (x < w - 1 && y < h - 1) d = Math.min(d, D[i + w + 1] + 1.4142); if (x > 0 && y < h - 1) d = Math.min(d, D[i + w - 1] + 1.4142); D[i] = d;
  }
  return D;
}

/* ── embroidery (woven), raster — NO vectorization ─────────────────────────
   Key out the background → foreground mask. Then, per real digitizers:
   • FILL — each connected shape is satin-filled in ONE uniform direction
     (perpendicular to its principal axis), so the fill is straight, not a
     swirly per-pixel field.
   • BORDER — a band along each contour (where the distance transform is small)
     runs ALONG the contour tangent, reading as the raised satin border column.
   • THREAD TEXTURE — thin thread ridges ACROSS the rows + a finer "stranded"
     modulation ALONG each thread (floss strands), all biased bright so the
     interior stays lustrous (no dark bands).
   • SEE-THROUGH — the deep grooves between threads drop alpha so the dark
     fabric peeks through, like real embroidery.
   Robust on any logo. Returns a PNG dataURL. */
function buildEmbroidery(img, doRemoveBg, bgTol, opts = {}) {
  const { density = 4, strand = 0.5, border = 5, seeThrough = 0.5, light = 120 } = opts;
  const nw = img?.naturalWidth, nh = img?.naturalHeight;
  if (!nw || !nh) return null;
  const sc = Math.min(1, 1100 / Math.max(nw, nh));   // cap longest edge for perf/sharpness
  const w = Math.max(1, Math.round(nw * sc)), h = Math.max(1, Math.round(nh * sc));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  let id;
  try { id = ctx.getImageData(0, 0, w, h); } catch { return null; }   // CORS-tainted
  if (doRemoveBg) removeBackground(id, bgTol);
  const d = id.data;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = d[i * 4 + 3] > 10 ? 1 : 0;
  const D = distanceTransform(mask, w, h);
  const { lab, angle } = components(mask, w, h);
  const PI2 = Math.PI * 2;
  const ribSp = Math.max(1.6, w / (120 + density * 22));   // higher density → thinner rows
  const strandSp = Math.max(1.2, w / 470);                 // floss-strand frequency
  const borderW = Math.max(0, Math.round(w / 110 * (border / 5)));
  const lightRad = light * Math.PI / 180;
  const fallback = -52 * Math.PI / 180;
  const sA = 0.6 + strand;                                 // strand-driven warp/fiber strength
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4; if (d[o + 3] === 0) continue;
    const inBorder = borderW > 0 && D[i] <= borderW;
    let phi;
    if (inBorder) {                                  // border column runs ALONG the contour
      const gx = D[i + (x < w - 1 ? 1 : 0)] - D[i - (x > 0 ? 1 : 0)];
      const gy = D[i + (y < h - 1 ? w : 0)] - D[i - (y > 0 ? w : 0)];
      phi = Math.atan2(gy, gx) + Math.PI / 2;
    } else { phi = angle[lab[i]] || fallback; }      // fill: straight per-component direction
    const cphi = Math.cos(phi), sphi = Math.sin(phi);
    const pA = -x * sphi + y * cphi;                 // along the rows (thread separation axis)
    const pT = x * cphi + y * sphi;                  // along each thread (strand axis)
    // DOMAIN WARP — low-freq value noise wobbles the rows so threads aren't
    // dead-straight (two octaves); a second warp jitters along the thread.
    const wob = (vnoise(pT * 0.035 + 11, pA * 0.05 + 5) - 0.5) * ribSp * 1.1 * sA
              + (vnoise(pT * 0.18 + 3, pA * 0.10) - 0.5) * ribSp * 0.5 * sA;
    const pAw = pA + wob;
    const pTw = pT + (vnoise(pA * 0.09, pT * 0.03) - 0.5) * 5 * sA;
    const thick = 0.72 + 0.6 * vnoise(pT * 0.05 + 21, pA * 0.16);   // thread thickness varies
    const ridge = Math.cos(pAw / ribSp * PI2);
    const crest = Math.max(0, ridge);
    const strandWave = Math.cos((pTw / strandSp + (vnoise(pT * 0.3, pA * 0.3) - 0.5) * 0.8) * PI2);
    // FIBER noise stretched ALONG the thread → stray little strands off the rows
    const fiber = vnoise(pAw * 0.9, pTw * 0.22) * 0.6 + vnoise(pAw * 2.1, pTw * 0.5) * 0.4;
    const sheen = 0.5 + 0.5 * Math.cos(2 * (phi - lightRad));   // strokes catch light by angle
    const base = inBorder ? 1.14 : 1.04;
    const gain = base + 0.22 * crest * thick + 0.24 * sheen + 0.06 * (fiber - 0.5);
    const add = (inBorder ? 22 : 13) * crest * thick
              + strand * 6 * Math.max(0, strandWave)
              + strand * 16 * Math.max(0, fiber - 0.72) * crest;   // bright stray strands
    d[o] = Math.max(0, Math.min(255, d[o] * gain + add));
    d[o + 1] = Math.max(0, Math.min(255, d[o + 1] * gain + add));
    d[o + 2] = Math.max(0, Math.min(255, d[o + 2] * gain + add));
    // SEE-THROUGH: irregular grooves (modulated by fiber) drop alpha → fabric peeks.
    const groove = Math.max(0, -ridge) * (0.7 + 0.6 * fiber);
    if (!inBorder && groove > 0.6) d[o + 3] = Math.round(255 * (1 - seeThrough * Math.min(1, (groove - 0.6) / 0.4)));
  }
  ctx.putImageData(id, 0, 0);
  return c.toDataURL('image/png');
}

/* Background knockout via color key. Detects the background color as the MOST
   COMMON opaque border color (mode, not average — averaging a border where art
   touches the edge yields a muddy blend that can match and erase most of the
   image), then removes EVERY pixel within `tol` of it — globally, so it also
   drops background enclosed by the art (the white counter inside a 'B'/'O').

   Guard: if keying would erase nearly the whole image (no real background — a
   photo, or a near-monochrome logo whose subject ≈ the border), it's skipped
   so the trace never comes back blank. Returns true if a background was keyed.

   RGB is zeroed with alpha (not alpha alone): ImageTracer's k-means assigns
   every pixel — transparent included — by rectilinear RGBA distance to the
   (0,0,0,0) transparent seed; leaving RGB at the bg color floods the field
   into the color clusters and paints a full-canvas background layer. */
function removeBackground(idata, tol) {
  const d = idata.data;
  // Normalize already-transparent pixels (they ARE background).
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 128) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 0; }
  // Background = the single most common OPAQUE color across the WHOLE image
  // (5-bit buckets). Whole-image (not border) so a NESTED background works —
  // e.g. a transparent margin around a white badge: the border is transparent
  // but white still dominates, so it's correctly detected and keyed.
  const counts = new Map();
  let opaque = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    opaque++;
    const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  if (!opaque) return false;
  let bestK = 0, best = -1;
  for (const [k, c] of counts) if (c > best) { best = c; bestK = k; }
  // Only treat it as background if it DOMINATES. Otherwise the foreground is
  // already isolated (transparent source) or there's no flat field (a photo) —
  // keying then would erase art, so leave the image intact.
  if (best < opaque * 0.40) return false;
  const br = ((bestK >> 10) & 31) * 8 + 4, bg = ((bestK >> 5) & 31) * 8 + 4, bb = (bestK & 31) * 8 + 4;
  const hits = [];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb) <= tol) hits.push(i);
  }
  if (hits.length > opaque * 0.995) return false;   // would erase everything → skip
  for (const i of hits) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0; }
  return true;
}

/* Build a seed palette of the image's DOMINANT colors via median-cut.
   Pixels are bucketed into one box, then the box with the widest color
   range is repeatedly split at the median of its longest channel until we
   have `maxColors` boxes; each box's average color is a palette entry. This
   averages anti-alias tones into their nearest cluster instead of letting
   each tone claim a slot. Near-duplicate entries are merged so a near-white
   background can't hog several slots. Transparent pixels are skipped and,
   if present, represented by a single transparent entry. */
function medianCutPalette(idata, maxColors) {
  const d = idata.data;
  const n = idata.width * idata.height;
  const step = Math.max(1, Math.floor(n / 24000));   // subsample for speed
  const px = [];
  let transparent = false;
  for (let i = 0; i < n; i += step) {
    const o = i * 4;
    if (d[o + 3] < 128) { transparent = true; continue; }
    px.push([d[o], d[o + 1], d[o + 2]]);
  }
  if (!px.length) return [{ r: 0, g: 0, b: 0, a: 0 }];
  const want = Math.max(1, maxColors - (transparent ? 1 : 0));

  const boxOf = (arr) => {
    let rmin = 255, gmin = 255, bmin = 255, rmax = 0, gmax = 0, bmax = 0;
    for (const [r, g, b] of arr) {
      if (r < rmin) rmin = r; if (r > rmax) rmax = r;
      if (g < gmin) gmin = g; if (g > gmax) gmax = g;
      if (b < bmin) bmin = b; if (b > bmax) bmax = b;
    }
    const rr = rmax - rmin, gr = gmax - gmin, brange = bmax - bmin;
    const range = Math.max(rr, gr, brange);
    const channel = rr >= gr && rr >= brange ? 0 : (gr >= brange ? 1 : 2);
    return { arr, range, channel };
  };

  let boxes = [boxOf(px)];
  while (boxes.length < want) {
    boxes.sort((a, b) => b.range - a.range);
    const box = boxes[0];
    if (!box || box.range === 0 || box.arr.length < 2) break;
    boxes.shift();
    const ch = box.channel;
    box.arr.sort((a, b) => a[ch] - b[ch]);
    const mid = box.arr.length >> 1;
    boxes.push(boxOf(box.arr.slice(0, mid)), boxOf(box.arr.slice(mid)));
  }

  const pal = boxes.map(({ arr }) => {
    let r = 0, g = 0, b = 0;
    for (const p of arr) { r += p[0]; g += p[1]; b += p[2]; }
    const k = arr.length || 1;
    return { r: Math.round(r / k), g: Math.round(g / k), b: Math.round(b / k), a: 255 };
  });

  const merged = [];
  for (const c of pal) {
    if (merged.some((m) => Math.abs(m.r - c.r) + Math.abs(m.g - c.g) + Math.abs(m.b - c.b) < 24)) continue;
    merged.push(c);
  }
  if (transparent) merged.unshift({ r: 0, g: 0, b: 0, a: 0 });
  return merged;
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
