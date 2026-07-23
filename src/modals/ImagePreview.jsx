import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPanel, ModalHeader, IconBtn, Btn, Callout, Spinner,
  I, T, Slider, Input, DraggablePopup, Dropdown,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import {
  PREVIEW_GRID, GLASS_BG, GLASS_BG_HVR, GLASS_BORDER, GLASS_FILTER, GLASS_SHADOW, GLASS_RADIUS,
  GlassIconBtn, DropperIcon, ResetIcon, SwapPopover, recolorImage,
} from '../ui/components/ImageColorSwap.jsx';
import { useDevSetting } from '../lib/devSettings.js';
import { GolfballViewer } from './GolfballViewer.jsx';
import {
  SIX_BALL_POKER_CHIP, SIX_BALL_LEVER, SIX_BALL_BARTENDER,
  PREMIUM_WOOD_POKER_CHIP, PREMIUM_WOOD_LEVER,
} from '../lib/giftSetLayout.js';
import { GrassMockupComposer } from './GrassMockupComposer.jsx';
import { LiquidDrawer } from '../ui/components/LiquidDrawer.jsx';
import { ColorPickerPopover } from '../ui/components/ColorPicker.jsx';
import {
  clientDeltaToLocal,
  clientPointToLocal,
  measuredAlignmentGeometry,
} from '../lib/alignmentGeometry.js';

/* ───────────────────────────────────────────────────────────────
   ImagePreview — port of content/logo-extractor.js's logo modal.

   Public contract:
     <ImagePreview url={...} itemLink={...} onClosed={...} bindClose={...} />

   `url` is OPTIONAL. When omitted the modal opens on its empty drop-zone
   view — paste a URL or drop a file. There is no bundled fallback image.
   The decode-error Callout only renders when a `url` WAS passed AND the
   image failed to load.

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
     • Submit Proof           — hands off via onLaunchSubmitProof to
                                the SubmitProof modal (content-script
                                wrappers + the playground wire this).
─────────────────────────────────────────────────────────────── */

/* Frosted-glass tokens (GLASS_*) + the graph-paper PREVIEW_GRID + the color-swap
   kit (eyedropper button, swap popover, recolorImage) now live in the shared
   ../ui/components/ImageColorSwap module so the Gift-Catalog align modal reuses
   the exact same surface. Imported at the top. */

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 8;
// Smaller per-tick deltas so the user can land precisely on the
// alignment ring. Wheel and button both feel like fine-grained
// adjustments instead of jumps. Was 0.35 / 0.12.
const ZOOM_STEP_BTN = 0.12;
const ZOOM_STEP_WHEEL = 0.05;

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

/* Eyedropper magnifier loupe. Draws a pixel-doubled crop of the live
   <img> centered on the hovered source pixel, with a center reticle marking
   the exact pixel that a click will sample and a hex readout. The crop is
   drawn straight off the <img> element (imageSmoothing off → crisp blocks),
   so it stays honest with whatever the sampler reads. Display works even on
   a CORS-tainted source — only the hex readout (a canvas read-back) is
   suppressed there. */
const LOUPE_SIZE = 104;   // loupe diameter (CSS px)
const LOUPE_SRC  = 13;    // source pixels across the loupe (odd → true center)
function EyedropperLoupe({ wrapRef, loupe }) {
  const canvasRef = useRef(null);
  const { x, y, pxX, pxY, color } = loupe;
  useEffect(() => {
    const cv = canvasRef.current;
    const img = wrapRef.current?.querySelector('img');
    if (!cv || !img) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = LOUPE_SIZE * dpr;
    cv.height = LOUPE_SIZE * dpr;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const half = LOUPE_SRC / 2;
    // Center the crop on the hovered pixel's CENTER (pxX is fractional).
    ctx.drawImage(
      img,
      Math.floor(pxX) + 0.5 - half, Math.floor(pxY) + 0.5 - half, LOUPE_SRC, LOUPE_SRC,
      0, 0, cv.width, cv.height,
    );
  }, [wrapRef, pxX, pxY]);

  // Offset the loupe up-left of the cursor, flipping to stay inside the
  // wrapper so it never spills past the preview surface.
  const wrap = wrapRef.current;
  const wrapW = wrap?.clientWidth || 0;
  const wrapH = wrap?.clientHeight || 0;
  const GAP = 18;
  let left = x - LOUPE_SIZE - GAP;
  let top  = y - LOUPE_SIZE - GAP;
  if (left < 4) left = x + GAP;
  if (top < 4)  top  = y + GAP;
  left = Math.max(4, Math.min(left, wrapW - LOUPE_SIZE - 4));
  top  = Math.max(4, Math.min(top,  wrapH - LOUPE_SIZE - 4));

  const hex = color
    ? '#' + [color.r, color.g, color.b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
    : null;
  const reticle = LOUPE_SIZE / LOUPE_SRC;   // one source pixel, in CSS px

  return (
    <div
      data-viewer-ui="true"
      style={{
        position: 'absolute', left, top,
        width: LOUPE_SIZE, height: LOUPE_SIZE,
        borderRadius: '50%', overflow: 'hidden',
        boxShadow: '0 0 0 2px var(--gb-surface-modal), 0 0 0 3px rgba(0,0,0,0.35), 0 6px 20px -6px rgba(0,0,0,0.5)',
        pointerEvents: 'none', zIndex: 30,
        background: 'var(--gb-surface-canvas)',
      }}
    >
      <canvas ref={canvasRef} style={{ width: LOUPE_SIZE, height: LOUPE_SIZE, display: 'block' }} />
      {/* center reticle — outlines the exact pixel a click samples */}
      <div style={{
        position: 'absolute',
        left: '50%', top: '50%',
        width: reticle, height: reticle,
        transform: 'translate(-50%, -50%)',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.9)',
        pointerEvents: 'none',
      }} />
      {hex && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          textAlign: 'center', padding: '2px 0',
          fontFamily: 'var(--gb-font-mono)', fontSize: 9.5, fontWeight: 700,
          letterSpacing: 0.4, color: '#fff',
          background: 'rgba(0,0,0,0.55)',
        }}>{hex}</div>
      )}
    </div>
  );
}

export function ImagePreview({
  url, dataUrl, itemLink, onClosed, bindClose,
  // Open straight into the loading state with no image yet — the opener pops
  // the modal instantly and streams a (bg-fetched, same-origin) dataURL in via
  // __gbImagePreviewReplace. Avoids handing the crossOrigin <img> a cross-site
  // URL that would CORS-error and flash the error state before the real image.
  pending = false,
  // Resolver exhausted every method (extraction + linked + composite all
  // missed). Flip to the error view instead of spinning on "Resolving...".
  failed = false,
  // When provided, the Submit Proof button routes through this
  // callback instead of firing the stub toast — lets a content-script
  // wrapper mount the real SubmitProof modal with the current image.
  onLaunchSubmitProof,
  // Submodal hide-pattern: parent wrapper flips this to false while the
  // SubmitProof modal is up, so the preview fades out and stops eating
  // pointer events. FloatingPanel handles the actual opacity/animation.
  visible = true,
}) {
  // Resolve which image to render. A `url` prop wins. When no url is
  // provided, the user can paste one into the URL input that appears
  // above the preview surface, or drop a file directly. No bundled
  // fallback — empty = drop-zone view.
  //
  // Two pastedUrl states: `pastedUrlDraft` is what the user is typing
  // (no fetch yet), `pastedUrl` is what the image actually loads. We
  // only commit when the user blurs the field or presses Enter, so
  // partial URLs don't fire a load on every keystroke.
  const [pastedUrlDraft, setPastedUrlDraft] = useState('');
  const [pastedUrl, setPastedUrl] = useState('');
  const effectiveUrl = url || pastedUrl || '';
  const usingFallback = false;
  const commitPastedUrl = () => {
    const v = pastedUrlDraft.trim();
    if (v && v !== pastedUrl) setPastedUrl(v);
  };
  const toast = useToast();
  const draggable = useDevSetting('imageViewer.draggable') ?? false;

  // load-state machine for the preview area + subtitle copy.
  // Seed from the initial `url` so a no-url mount (popup / playground
  // Submit-Proof entry) renders straight into the drop-zone view —
  // otherwise the spinner flashes for one paint before useEffect
  // re-classifies it as 'empty'.
  const [status, setStatus] = useState(() => (url || pending ? 'loading' : 'empty'));
  // Resolver gave up (window.__gbImagePreviewReplace({ failed: true })) -> show
  // the error view immediately instead of waiting out the loading watchdog.
  useEffect(() => { if (failed) setStatus('error'); }, [failed]);
  const [copied, setCopied] = useState(false);
  // Natural image dimensions in px — captured at load time, displayed
  // in the top-left chip so the user has the source size at a glance
  // without inspecting devtools. Null until the image loads.
  const [imageSize, setImageSize] = useState(null);
  // Alignment overlay toggle. When on, a centered circle is overlaid
  // on the image and the surrounding chrome dims so the user can
  // position the image inside the alignment ring.
  const [aligning, setAligning] = useState(false);
  // Eyedropper / color-swap state.
  //   eyedropping: true while the tool is armed (cursor over image becomes
  //     crosshair; next click on the image samples a pixel).
  //   pendingPick: { color, x, y } — the just-sampled color and where to
  //     anchor the color-picker popover; user picks a replacement color,
  //     hits Apply, and we run the swap on editedDataUrl.
  //   editedDataUrl: the working image as a PNG dataURL after all swaps.
  //     null when no swaps applied yet (use the original effectiveUrl).
  //   colorSwaps: history of { from, to } for the Reset button.
  const [eyedropping, setEyedropping] = useState(false);
  // Magnifier loupe shown while the eyedropper is armed and hovering the
  // image: { x, y } wrapper-layout coords of the cursor, { pxX, pxY } the
  // source pixel under it, and the read-back color (null if CORS-tainted).
  const [loupe, setLoupe] = useState(null);
  const [pendingPick, setPendingPick] = useState(null);
  const [editedDataUrl, setEditedDataUrl] = useState(null);
  // Filename to use for Download / snapshotName when the displayed image
  // is an in-memory replacement (dropped file or pasted dataUrl). Null
  // when we're still on the original `url` prop — the stem is derived
  // from the URL in that case.
  const [replacedName, setReplacedName] = useState(null);
  const [colorSwaps, setColorSwaps] = useState([]);
  // Live preview of the pending swap — replaces displayUrl while the
  // popover is open so the user can dial in tolerance / color visually
  // before committing. Cleared on Cancel; promoted to editedDataUrl on Apply.
  const [previewDataUrl, setPreviewDataUrl] = useState(null);
  // Persisted decal — the cropped+masked PNG built from the most
  // recent Save Alignment. Null until the user saves once; cleared
  // when the source URL changes. Feeds the 3D viewer as a decal.
  const [decalDataUrl, setDecalDataUrl] = useState(null);
  // Mirror of the decal at the moment alignment was saved — i.e. BEFORE
  // any color swaps. Lets the Reset button restore the un-recolored
  // print without forcing the user to re-align. Set alongside
  // decalDataUrl on alignment-save; cleared whenever the source image
  // changes (drop, URL change, etc).
  const [originalDecalDataUrl, setOriginalDecalDataUrl] = useState(null);
  // View mode: '2d' shows the image preview + zoom controls; '3d'
  // swaps the same area for the GolfballViewer with the saved decal
  // wrapped on the model. 3D button toggles between them.
  const [view, setView] = useState('2d');

  // Drag-and-drop file replace. When the user drags any image file
  // over the preview wrapper, we light up a frosted "Drop to replace"
  // overlay and accept the drop to swap displayUrl. dragenter/leave
  // fire on every child element entered, so we count nesting depth
  // instead of toggling on each event — without the counter the
  // overlay flickers as the cursor crosses inner elements.
  const [dropActive, setDropActive] = useState(false);
  const dragDepthRef = useRef(0);

  // Zoom + pan: tracked in refs (no re-render per wheel event) plus a
  // tiny zoomLevel state purely so the bottom-left zoom-percentage chip
  // can re-render when it changes.
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  // Rotation in degrees — only meaningful while aligning. Lives as
  // state so the slider re-renders; a ref mirrors it so applyTransform
  // can read the latest value without a stale closure.
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);
  // Slider drags update rotation continuously; no transition while
  // dragging so the image tracks the slider 1:1.
  useEffect(() => { rotationRef.current = rotation; applyTransform(false); }, [rotation]);
  // Mirror of `aligning` so clampPan() (called from pointer + zoom
  // handlers) sees the live value without a stale closure. While
  // aligning, pan bounds are unlocked so the user can park ANY part
  // of the image inside the centered ring — needed for small or
  // non-square logos that otherwise can't reach the ring's center.
  const aligningRef = useRef(false);
  useEffect(() => { aligningRef.current = aligning; }, [aligning]);
  // Leaving alignment mode — animate the image back to upright instead
  // of snapping. The slider can leave us at any angle in [-180, 180];
  // CSS `rotate(deg)` is continuous, so we just kick a transitioned
  // applyTransform with the ref at the current angle, then set it to
  // 0 on the next frame to drive the transition to 0°.
  useEffect(() => {
    if (aligning) return;
    // Leaving align mode: re-clamp pan into the strict (non-align)
    // bounds so an image dragged far off-center during alignment
    // doesn't get stranded partially off-screen.
    clampPan();
    if (rotation === 0) {
      applyTransform(true);
      return;
    }
    const DURATION = 260;
    // Start the transition AT the current rotation (already in the ref).
    const el = viewportRef.current;
    if (el) {
      el.style.transition = `transform ${DURATION}ms cubic-bezier(.25,.8,.25,1)`;
      // Force a layout read so the browser commits the starting frame
      // before we overwrite the transform below.
      // eslint-disable-next-line no-unused-expressions
      el.offsetWidth;
      rotationRef.current = 0;
      el.style.transform = `translate(${txRef.current}px, ${tyRef.current}px) rotate(0deg) scale(${scaleRef.current})`;
    }
    const id = setTimeout(() => { setRotation(0); }, DURATION + 30);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aligning]);
  const [zoomLevel, setZoomLevel] = useState(100);

  const wrapRef = useRef(null);      // the 340px preview surface (drag + wheel target)
  const viewportRef = useRef(null);  // inner transform layer (translate + scale applied here)
  const alignRingRef = useRef(null); // rendered ring is the capture source of truth
  const viewerRef = useRef(null);    // GolfballViewer imperative handle — .snapshot() returns a PNG dataURL
  const mockupRef = useRef(null);    // GrassMockupComposer imperative handle — .snapshot() returns a PNG dataURL
  // True whenever we're in a viewer-style mode (3D ball OR grass mockup),
  // i.e. NOT the 2D image editor. Used by drag/pan/wheel guards so
  // 2D-only gestures don't fire on top of the active viewer.
  const inViewerMode = view !== '2d';
  // Mirrors the viewer's internal sceneKey so the fun-menu drawer can
  // hide while an HDRI scene is up (no walls = nothing for bombs to
  // bounce off, so we don't even offer the tool).
  const [viewerSceneKey, setViewerSceneKey] = useState(null);
  // Mirrors the viewer's throwMode so the fun menu is only available
  // when gravity is on — bombs only do something meaningful when
  // physics is running.
  const [viewerThrowMode, setViewerThrowMode] = useState(false);
  // 3D model shown in the viewer — switched from the model dropdown in the 3D
  // strip. Ball + chip + the metal tools + the assembled gift set. Separate ball
  // and chip tints so each keeps its colorway as you switch models.
  const [viewerShape, setViewerShape] = useState('ball');
  const [ballTint, setBallTint] = useState(null);
  const [chipTint, setChipTint] = useState(null);
  const giftSetScale = Number(useDevSetting('golfballViewer.giftSetScale') ?? 0.9) || 0.9;
  // The three assembled gift sets selectable in the model dropdown. All render via
  // shape="giftset"; only the poker-chip set has chips (the others = a divot/bartender
  // tool + empty marker spots).
  const GIFTSETS = {
    giftsetPoker: SIX_BALL_POKER_CHIP, giftsetLever: SIX_BALL_LEVER, giftsetBartender: SIX_BALL_BARTENDER,
    giftsetWoodPoker: PREMIUM_WOOD_POKER_CHIP, giftsetWoodLever: PREMIUM_WOOD_LEVER,
  };
  const viewerGiftSet = GIFTSETS[viewerShape];
  const isGiftset = !!viewerGiftSet;
  const hasChips = viewerShape === 'giftsetPoker' || viewerShape === 'giftsetWoodPoker';
  const effShape = isGiftset ? 'giftset' : viewerShape;
  // Smart color control: which body colors the active model exposes.
  //   ball → ball · chip → chip · metal tools → none · ANY gift set → ball color only
  //   (per request: gift sets expose just the golf-ball color; chips/tools keep their
  //   own fixed colorway).
  const ballCtl = { key: 'ball', label: 'Ball color', value: ballTint, set: setBallTint, def: '#f6f6f6' };
  const chipCtl = { key: 'chip', label: 'Chip color', value: chipTint, set: setChipTint, def: '#1c1c1c' };
  const TINT_CONTROLS = {
    ball: [ballCtl], chip: [chipCtl], divot: [], bartender: [], marker: [],
    giftsetPoker: [ballCtl], giftsetLever: [ballCtl], giftsetBartender: [ballCtl],
    giftsetWoodPoker: [ballCtl], giftsetWoodLever: [ballCtl],
  };
  const tintControls = TINT_CONTROLS[viewerShape] || [];
  // Viewer tint props: ball uses `tint` as its body, chip uses `tint` as its clay,
  // a gift set uses `tint` for its balls + `chipTint` for chips (poker only); metal
  // tools take no tint (fixed steel).
  const viewerTint = viewerShape === 'chip' ? chipTint
    : (viewerShape === 'ball' || isGiftset) ? ballTint : undefined;
  const viewerChipTint = hasChips ? chipTint : undefined;
  // Gravity/physics is ball-only — turn throw mode off if we switch off the ball.
  useEffect(() => { if (viewerShape !== 'ball') setViewerThrowMode(false); }, [viewerShape]);
  // Ball-&-chip-only mode (dev setting): hide the full model dropdown and offer
  // just a ball↔chip toggle next to the color swatch. Snap/export still works
  // for both models. Coerce off any other model (gift sets, metal tools) when
  // the mode is on so the toggle always has a valid pair to flip between.
  const ballChipOnly = !!useDevSetting('imageViewer.ballChipOnly');
  useEffect(() => {
    if (ballChipOnly && viewerShape !== 'ball' && viewerShape !== 'chip') setViewerShape('ball');
  }, [ballChipOnly, viewerShape]);

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

  /* Replace the visible image with a new dataURL. Resets everything
     derived from the previous image (zoom/pan, color swaps, decal,
     view mode) so the user sees the new logo fresh and on the same
     pipeline. Because editedDataUrl outranks the original url in
     `displayUrl`, we don't have to touch the prop chain — just set it. */
  const replaceImage = (dataUrl) => {
    setStatus('loading');
    setImageSize(null);
    setDecalDataUrl(null);
    setOriginalDecalDataUrl(null);
    setView('2d');
    setColorSwaps([]);
    setEyedropping(false);
    setPendingPick(null);
    setPreviewDataUrl(null);
    scaleRef.current = 1; txRef.current = 0; tyRef.current = 0;
    rotationRef.current = 0; setRotation(0);
    setZoomLevel(100);
    applyTransform(false);
    setEditedDataUrl(dataUrl);
  };

  /* dragOver — must call preventDefault to opt INTO accepting the
     drop. dataTransfer.dropEffect tells the OS what cursor to show
     (copy vs move vs none); 'copy' reads as "we'll take a copy". */
  const onWrapDragOver = (e) => {
    if (inViewerMode) return;
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onWrapDragEnter = (e) => {
    if (inViewerMode) return;
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    if (!dropActive) setDropActive(true);
  };
  const onWrapDragLeave = (e) => {
    if (inViewerMode) return;
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setDropActive(false);
    }
  };
  const onWrapDrop = (e) => {
    if (inViewerMode) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDropActive(false);
    const file = Array.from(e.dataTransfer?.files || []).find((f) => f.type.startsWith('image/'));
    if (!file) {
      toast?.warning?.('Only image files can replace the preview');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      replaceImage(String(reader.result));
      // Track the dropped filename so subsequent Download / mockup
      // snapshots are saved under the new name, not the original URL's.
      setReplacedName(file.name);
      toast?.success?.(`Replaced with ${file.name}`);
    };
    reader.onerror = () => toast?.error?.('Could not read dropped file');
    reader.readAsDataURL(file);
  };
  // Reset zoom + load state whenever the URL changes (reopen with a
  // different image — currently never happens in playground but
  // future implementations will swap URLs).
  useEffect(() => {
    // Empty URL = "empty" status → render the drop-zone view; otherwise
    // load the image normally.
    setStatus((effectiveUrl || pending) ? 'loading' : 'empty');
    setImageSize(null);
    setDecalDataUrl(null);
    setOriginalDecalDataUrl(null);
    setView('2d');
    setEditedDataUrl(null);
    setReplacedName(null);
    setColorSwaps([]);
    setEyedropping(false);
    setPendingPick(null);
    setPreviewDataUrl(null);
    scaleRef.current = 1; txRef.current = 0; tyRef.current = 0;
    rotationRef.current = 0; setRotation(0);
    setZoomLevel(100);
    applyTransform(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUrl]);

  // The image source actually shown / downloaded / used as the decal.
  // Preview (live swap in popover) > committed edits > caller-supplied
  // dataUrl (background-fetched bytes, used to dodge mixed-content on
  // http CDN URLs) > the public URL.
  const displayUrl = previewDataUrl || editedDataUrl || dataUrl || effectiveUrl;

  // Safety net for a wedged source: some render endpoints (e.g. a slow or
  // mis-stored express render) neither fire the <img>'s load NOR its error,
  // so the spinner would otherwise spin forever and look broken. Cap the
  // loading state — if it's still loading after the timeout, surface the
  // error view (which offers retry / drop-replace) instead of freezing.
  useEffect(() => {
    if (status !== 'loading') return undefined;
    const t = setTimeout(() => setStatus((s) => (s === 'loading' ? 'error' : s)), 20000);
    return () => clearTimeout(t);
  }, [status, displayUrl]);

  /* Map a viewport (clientX/clientY) point → the image's natural-pixel
     coords by going straight through the live <img>'s on-screen rect.
     getBoundingClientRect already bakes in pan + zoom, the contain-fit,
     the wrapper's 1px border AND the modal's CSS `zoom` (data-gb-scale).
     The old approach rebuilt that chain by hand (fit/tx/ty/scale vs
     clientWidth) and drifted whenever the source rendered at its natural
     size (max-width:85% only shrinks) or the modal was scaled. Returns
     null when the point is off the image. */
  function clientToSourcePx(clientX, clientY) {
    const img = wrapRef.current?.querySelector('img');
    if (!img || !imageSize) return null;
    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const natW = imageSize.w;
    const natH = imageSize.h;
    const pxX = (clientX - r.left) / r.width * natW;
    const pxY = (clientY - r.top) / r.height * natH;
    if (pxX < 0 || pxX >= natW || pxY < 0 || pxY >= natH) return null;
    return { pxX, pxY, natW, natH };
  }

  /* Read {r,g,b} at a natural-pixel coord. Backed by a one-shot read of
     the whole source into an ImageData buffer (cached, keyed by src) so
     per-frame loupe hovers don't redraw a full-size canvas each move.
     Returns null on a CORS-tainted source or an out-of-range pixel. */
  const pixelCacheRef = useRef({ src: null, data: null, w: 0, h: 0 });
  function readPixel(pxX, pxY) {
    const img = wrapRef.current?.querySelector('img');
    if (!img || !imageSize) return null;
    const cache = pixelCacheRef.current;
    if (cache.src !== img.src || !cache.data) {
      cache.src = img.src; cache.data = null;
      try {
        const natW = imageSize.w, natH = imageSize.h;
        const c = document.createElement('canvas');
        c.width = natW; c.height = natH;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, natW, natH);
        cache.data = ctx.getImageData(0, 0, natW, natH).data;
        cache.w = natW; cache.h = natH;
      } catch (e) {
        // CORS-tainted canvas — same caveat as captureAlignment.
        return null;
      }
    }
    const x = Math.floor(pxX), y = Math.floor(pxY);
    if (x < 0 || x >= cache.w || y < 0 || y >= cache.h) return null;
    const i = (y * cache.w + x) * 4;
    const d = cache.data;
    return { r: d[i], g: d[i + 1], b: d[i + 2] };
  }

  /* Sample a pixel color from the loaded <img>. Returns {r,g,b} from the
     natural-pixel space, regardless of zoom/pan. `clientX/clientY` are
     raw viewport coordinates. */
  function samplePixelAt(clientX, clientY) {
    const p = clientToSourcePx(clientX, clientY);
    if (!p) return null;
    return readPixel(p.pxX, p.pxY);
  }

  // Disarming the eyedropper (or leaving 'ready') retracts the loupe.
  useEffect(() => { if (!eyedropping) setLoupe(null); }, [eyedropping]);

  /* Run a color swap on a given source image URL and return a new
     dataURL with all matching pixels recolored. Pixels within
     `tolerance` RGB distance of `from` get replaced with `to`.
     Preserves alpha so transparent regions stay transparent. */
  // Source priority mirrors `displayUrl` — prefer any in-memory bytes
  // (committed edits, then the background-fetched dataUrl) before
  // falling back to the public URL. Without dataUrl in the chain, a
  // CDN that's unreachable from the page context (mixed-content blocked,
  // ERR_CONNECTION_TIMED_OUT, etc.) makes color swaps fail even though
  // the modal can display the image fine from the bg-fetched bytes.
  function applyColorSwap(fromRgb, toRgb, tolerance, sourceUrl = (editedDataUrl || dataUrl || effectiveUrl)) {
    return recolorImage(sourceUrl, fromRgb, toRgb, tolerance);
  }

  function applyTransform(animate) {
    const el = viewportRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform .18s cubic-bezier(.25,.8,.25,1)' : 'none';
    el.style.transform  = `translate(${txRef.current}px, ${tyRef.current}px) rotate(${rotationRef.current}deg) scale(${scaleRef.current})`;
  }
  function clampPan() {
    const c = wrapRef.current;
    if (!c) return;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    // In ALIGN mode, the user needs to drop ANY pixel of the image
    // into the centered ring. With the old "image edge stays inside
    // the wrapper" clamp, a small or non-square logo physically
    // can't reach the ring's center — its edges hit the wall first.
    // Switch to a generous rule: the rendered image's center can
    // travel up to (wrapper_dim + image_dim) / 2 in either direction,
    // minus a small margin so a thin sliver always stays on-screen
    // (otherwise the user can lose the image entirely off the canvas
    // and not know where it went).
    if (aligningRef.current) {
      const KEEP_VISIBLE = 24; // px of image kept on-screen at the extreme
      const img = c.querySelector('img');
      const iw = img?.clientWidth  || cw;
      const ih = img?.clientHeight || ch;
      const s = scaleRef.current;
      const maxX = Math.max(0, (cw + iw * s) / 2 - KEEP_VISIBLE);
      const maxY = Math.max(0, (ch + ih * s) / 2 - KEEP_VISIBLE);
      txRef.current = Math.max(-maxX, Math.min(maxX, txRef.current));
      tyRef.current = Math.max(-maxY, Math.min(maxY, tyRef.current));
      return;
    }
    // Default (non-align): image edges stay inside the wrapper so
    // the user can't drag the photo fully off-screen mid-review.
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
    if (!c || status !== 'ready' || inViewerMode) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const point = clientPointToLocal(c, e.clientX, e.clientY);
      zoom(e.deltaY < 0 ? ZOOM_STEP_WHEEL : -ZOOM_STEP_WHEEL, point.x, point.y);
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
    if (inViewerMode) return;
    // Popovers (color-swap, color picker, etc.) portal to <body> but their
    // JSX lives under this wrapper, so React synthetic events still bubble
    // here. Every popover root carries data-gb-scale="popovers" — ignore any
    // pointerdown that originates inside one so dragging in/around the popover
    // (including the color picker's S/V square + hue slider) never pans the
    // image.
    if (e.target?.closest?.('button, input, textarea, select, a, [data-viewer-ui="true"], [data-gb-scale="popovers"]')) return;
    // Eyedropper mode — clicking the image samples a pixel and opens
    // the color-picker popover instead of starting a drag.
    if (eyedropping) {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const { x: cssX, y: cssY } = clientPointToLocal(wrap, e.clientX, e.clientY);
      const sample = samplePixelAt(e.clientX, e.clientY);
      if (sample) {
        setPendingPick({ color: sample, x: cssX, y: cssY });
        setEyedropping(false);
        setLoupe(null);
      } else {
        toast?.warning?.('No pixel here — click on the image');
      }
      return;
    }
    dragRef.current = { x: e.clientX, y: e.clientY, tx: txRef.current, ty: tyRef.current };
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
  };
  const onPointerMove = (e) => {
    if (dragRef.current) {
      const delta = clientDeltaToLocal(
        wrapRef.current,
        e.clientX - dragRef.current.x,
        e.clientY - dragRef.current.y,
      );
      txRef.current = dragRef.current.tx + delta.x;
      tyRef.current = dragRef.current.ty + delta.y;
      clampPan();
      applyTransform(false);
      return;
    }
    // Eyedropper hover — drive the magnifier loupe. Map the cursor to a
    // source pixel, read its color, and place the loupe in wrapper-layout
    // coords (divide the visual offset by the modal's effective CSS zoom
    // so it lands right even when data-gb-scale shrinks/grows the modal).
    if (eyedropping && status === 'ready') {
      const wrap = wrapRef.current;
      const p = wrap && clientToSourcePx(e.clientX, e.clientY);
      if (!p) { setLoupe(null); return; }
      const point = clientPointToLocal(wrap, e.clientX, e.clientY);
      setLoupe({
        x: point.x,
        y: point.y,
        pxX: p.pxX, pxY: p.pxY,
        color: readPixel(p.pxX, p.pxY),
      });
    }
  };
  const onPointerUp = (e) => {
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}
  };
  const onDoubleClick = (e) => {
    // Same defense as onPointerDown — viewer modes own this gesture in
    // their own canvas handlers (double-click = reset zoom, etc.).
    if (inViewerMode) return;
    // Ignore double-clicks that originated on overlay controls — two
    // rapid clicks on the zoom button were bubbling up and treating
    // the wrapper as the dblclick target, snapping zoom back to 1x. The
    // same applies to popovers, whose portaled JSX still bubbles here.
    if (e.target?.closest?.('button, input, textarea, select, a, [data-viewer-ui="true"], [data-gb-scale="popovers"]')) return;
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

     The output replays the same local translate/rotate/scale pipeline using
     the rendered ring and image layout boxes as its source of truth. This is
     important because the modal and host page can each have their own scale,
     and CSS max-width/max-height shrink large images without upscaling small
     ones.
  ─────────────────────────────────────────────────────────── */
  function captureAlignment() {
    const wrap = wrapRef.current;
    if (!wrap || !imageSize) return null;
    const scale = scaleRef.current;
    const tx = txRef.current;
    const ty = tyRef.current;
    const rotRad = (rotationRef.current * Math.PI) / 180;

    const sourceImg = wrap.querySelector('img');
    if (!sourceImg) return null;
    const geometry = measuredAlignmentGeometry(wrap, sourceImg, alignRingRef.current);
    const ringDiameterWrapperPx = geometry.ringDiameter;

    // We re-create the viewport's transform pipeline on a canvas the
    // size of the ring (circle) and crop. Output capped at 1024.
    const OUT_SIZE = Math.min(1024, Math.max(256, Math.ceil(ringDiameterWrapperPx * 4)));
    const canvas = document.createElement('canvas');
    canvas.width = OUT_SIZE;
    canvas.height = OUT_SIZE;
    const ctx = canvas.getContext('2d');

    // px-per-wrapper-pixel scaling for the output canvas.
    const k = OUT_SIZE / ringDiameterWrapperPx;

    // Origin at canvas center = wrapper center. The viewport stack is:
    //   translate(tx, ty) · rotate(rot) · scale(scale)
    // applied around the wrapper center. We mirror it here.
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUT_SIZE / 2, OUT_SIZE / 2, OUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(OUT_SIZE / 2, OUT_SIZE / 2);
    ctx.scale(k, k);              // wrapper-pixel → canvas-pixel
    ctx.translate(tx, ty);
    ctx.rotate(rotRad);
    ctx.scale(scale, scale);
    // Mirror the actual untransformed image layout box. `max-width` and
    // `max-height` shrink large sources but intentionally do not upscale a
    // small source, so recomputing a contain-fit from natural dimensions
    // produces a different crop than the one visible in the alignment grid.
    ctx.drawImage(
      sourceImg,
      -geometry.imageWidth / 2, -geometry.imageHeight / 2,
      geometry.imageWidth, geometry.imageHeight,
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

  /* Mockup-button handler. Mirrors on3DToggle but flips into the
     'mockup' view, which renders a photoreal Cycles backplate of
     the ball nestled in grass with the user's logo composited
     onto the camera-facing pole. No alignment-saved guard since
     the composer wants the FULL cropped image, not the print
     area — but we still need a decal source to compose. */
  function onMockupToggle() {
    if (view === 'mockup') { setView('2d'); return; }
    if (!decalDataUrl) {
      toast?.warning?.('Align the image first to compose a mockup', { tone: 'warning' });
      return;
    }
    setView('mockup');
  }

  const onCopy = async () => {
    // Once the image has been REPLACED (drop, paste of a different file)
    // there's no longer a public URL that reflects what's on screen —
    // copying effectiveUrl would silently put the original URL on the
    // clipboard. Surface a clear toast instead so the user knows why.
    if (replacedName && !pastedUrl) {
      toast?.info?.('Local image — no public URL to copy', { duration: 2400 });
      return;
    }
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
    a.href = displayUrl;
    // Filename priority: dropped-file basename > original URL stem
    // (with `-edited` suffix when we're shipping the edited bytes) >
    // timestamped fallback.
    if (replacedName) {
      a.download = replacedName;
    } else if (editedDataUrl) {
      const stem = (() => {
        try {
          const last = effectiveUrl.split('/').pop() || '';
          const base = last.split('?')[0].split('#')[0];
          const dot = base.lastIndexOf('.');
          return dot > 0 ? base.slice(0, dot) : base;
        } catch { return ''; }
      })();
      a.download = (stem || `image-${Date.now()}`) + '-edited.png';
    } else {
      a.download = effectiveUrl.split('/').pop() || 'image';
      a.target = '_blank';
      a.rel = 'noopener';
    }
    document.body.appendChild(a); a.click(); a.remove();
  };
  const onSubmitProof = () => {
    if (onLaunchSubmitProof) {
      // Hand the parent (content-script wrapper or playground) the
      // current image — edited dataUrl if the user color-swapped,
      // else whatever URL is actually loaded, else null when the
      // user clicked Submit Proof without ever attaching one.
      let payload = null;
      if (editedDataUrl) {
        payload = { dataUrl: editedDataUrl };
      } else if (effectiveUrl) {
        payload = { url: effectiveUrl };
      }
      onLaunchSubmitProof(payload);
      return;
    }
    // Defensive: every production call site passes onLaunchSubmitProof
    // (playground, content-script wrappers). If a future caller forgets,
    // surface a console warning instead of a misleading "coming soon".
  };


  /* 3D snapshot helpers. The GolfballViewer exposes .snapshot()
     which renders the ball ONLY (no walls, transparent background)
     at the user's current rotation/scale into a square PNG dataURL.
     - Copy   → blob → clipboard.write([{ 'image/png': blob }])
     - Download → anchor click with download attribute */
  const snapshotName = () => {
    // Best-effort filename. Priority: dropped-file basename (so users
    // who replaced the image see it reflected) > source URL stem >
    // timestamped fallback for blob/data sources with no useful name.
    const stem = (() => {
      try {
        const source = replacedName || effectiveUrl;
        if (!source) return '';
        const last = source.split('/').pop() || '';
        const base = last.split('?')[0].split('#')[0];
        const dot = base.lastIndexOf('.');
        return dot > 0 ? base.slice(0, dot) : base;
      } catch { return ''; }
    })();
    const suffix = view === 'mockup' ? '-mockup.png' : '-3d.png';
    return (stem || `golfball-${Date.now()}`) + suffix;
  };
  // Pick the right snapshot source for the active view: GolfballViewer
  // returns a 1024×1024 ball-only PNG; GrassMockupComposer returns the
  // full 1920×1080 grass mockup with logo. Either can be null while
  // the viewer is still loading, which is the only failure path here.
  const getViewerSnapshot = () => {
    if (view === 'mockup') return mockupRef.current?.snapshot?.() || null;
    return viewerRef.current?.snapshot?.(1024) || null;
  };
  const onCopy3D = async () => {
    const url = getViewerSnapshot();
    if (!url) { toast?.error?.('Viewer not ready'); return; }
    try {
      const blob = await (await fetch(url)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast?.success?.('Snapshot copied');
    } catch (e) {
      toast?.error?.('Copy failed: ' + (e?.message || e));
    }
  };
  const onDownload3D = () => {
    const url = getViewerSnapshot();
    if (!url) { toast?.error?.('Viewer not ready'); return; }
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
      draggable={draggable}
      visible={visible}
      onClose={onClosed}
      bindClose={bindClose}
    >
      {/* userSelect:none on the wrapper kills the stray text-selection
          that happens when the user click-drags through controls in this
          modal (zoom buttons, color picker, alignment chips). Selection
          ranges were leaking onto the header/labels behind. Inputs the
          user actually types in (e.g. the hex field in the color picker)
          live in a portal outside this tree, so they still allow selection. */}
      <div style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
      <ModalHeader
        icon={<ImageIcon />}
        title="Logo Extractor"
        subtitle={subtitle}
      />

      <div style={{ padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* URL paste row — shown only when there's no image attached.
            Lets the user paste a link as an alternative to dropping a
            file onto the preview surface below. */}
        {/* URL paste row — fades out as soon as ANY image is loaded
            (effectiveUrl from prop/paste OR editedDataUrl from a drop).
            The previous gate only watched effectiveUrl, so dropped
            files (which set editedDataUrl) didn't trigger the fade. */}
        <AnimatePresence initial={false}>
          {!effectiveUrl && !editedDataUrl && (
            <motion.div
              key="url-paste"
              initial={{ opacity: 0, height: 0, marginBottom: -12 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: -12 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <Input
                value={pastedUrlDraft}
                onChange={setPastedUrlDraft}
                onBlur={commitPastedUrl}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitPastedUrl(); }
                }}
                placeholder="Paste an image URL and press Enter…"
                leading={<I.search size={11} />}
              />
            </motion.div>
          )}
        </AnimatePresence>

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
          onPointerLeave={() => setLoupe(null)}
          onDoubleClick={onDoubleClick}
          onDragOver={onWrapDragOver}
          onDragEnter={onWrapDragEnter}
          onDragLeave={onWrapDragLeave}
          onDrop={onWrapDrop}
          style={{
            position: 'relative',
            height: 320,
            width: '100%',
            ...PREVIEW_GRID,
            // Border thickens + recolors when a file is being dragged
            // over the wrapper so the drop affordance is obvious from
            // the outside, not just the centered overlay.
            border: dropActive
              ? '1px solid var(--gb-brand-label)'
              : '1px solid var(--gb-border-default)',
            boxShadow: dropActive
              ? '0 0 0 3px color-mix(in srgb, var(--gb-brand-label) 22%, transparent)'
              : 'none',
            transition: 'border-color .18s, box-shadow .18s',
            borderRadius: 'var(--gb-r-md)',
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: status === 'ready'
              ? (eyedropping ? 'crosshair' : (dragRef.current ? 'grabbing' : 'grab'))
              : 'default',
            userSelect: 'none',
          }}
        >
          {/* View crossfade — `mode="wait"` keeps only one view in the
              DOM at a time, so the outgoing view finishes its exit
              animation before the incoming view mounts. Without this
              we'd see both rendered simultaneously mid-transition
              (image + 3D canvas overlapping) which reads as a flash. */}
          <AnimatePresence mode="wait" initial={false}>
            {view === 'mockup' && decalDataUrl ? (
              <motion.div
                key="mockup-view"
                /* 2D → mockup entrance: matches the 3D entrance feel so
                   both viewer-style modes have the same "materializing"
                   transition. The composer paints in a single canvas
                   pass once both images load, so first frame is ~stable. */
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                style={{ position: 'absolute', inset: 0, transformOrigin: 'center' }}
              >
                <GrassMockupComposer
                  ref={mockupRef}
                  decalDataUrl={decalDataUrl}
                  onError={() => {
                    toast?.error?.('Failed to load mockup');
                    setView('2d');
                  }}
                />
              </motion.div>
            ) : view === '3d' && decalDataUrl ? (
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
                  shape={effShape}
                  tint={viewerTint}
                  chipTint={viewerChipTint}
                  giftSet={viewerGiftSet}
                  initialScale={isGiftset ? giftSetScale : undefined}
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

          {/* Empty overlay — no image was provided. The user can drop
              one onto the preview surface (wrapper already accepts
              files) or proceed straight to Submit Proof without one. */}
          {status === 'empty' && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 8,
              color: 'var(--gb-text-tertiary)',
              textAlign: 'center', padding: 24,
              pointerEvents: 'none',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <div style={{
                fontSize: 13, fontWeight: 700,
                color: 'var(--gb-text-primary)',
              }}>No image attached</div>
              <div style={{ fontSize: 11.5, maxWidth: 280, lineHeight: 1.5 }}>
                Drop an image here to extract a logo, or click <strong style={{ color: 'var(--gb-text-secondary)' }}>Submit Proof</strong> to continue without one.
              </div>
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
            {status !== 'error' && status !== 'empty' && displayUrl && (
              <img
                src={displayUrl}
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

          {/* Eyedropper magnifier loupe — a crisp, pixel-doubled crop of
              the source centered on the cursor with a 1px reticle, so the
              user can land the sample on an exact pixel even when the
              logo is rendered small. */}
          {eyedropping && loupe && (
            <EyedropperLoupe wrapRef={wrapRef} loupe={loupe} />
          )}

          {/* Floating zoom controls — only visible once the image is
              actually viewable. Use the design-system IconBtn so the
              styling matches the rest of the modal chrome.

              Top-right slot holds the 3D-view + mockup triggers
              (wired to on3DToggle / onMockupToggle). Bottom-left is
              the zoom-level chip; bottom-right is the −/1:1/+ control
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
                {/* Studio mockup — composes the user's logo onto a
                    photoreal pre-rendered ball-in-grass shot. Lives
                    next to the 3D cube since both are "preview the
                    print" modes; the camera glyph reads as "snap a
                    product photo". */}
                <GlassIconBtn
                  icon={<CameraIcon />}
                  active={view === 'mockup'}
                  onClick={onMockupToggle}
                />
              </div>

              {/* Image-size readout (top-left) — natural source pixels,
                  not the rendered ones. Mirrors the zoom-level chip
                  in the bottom-left so the two readouts visually balance
                  the corners. */}
              {imageSize && (
                <div style={{
                  position: 'absolute', top: 8, left: 10,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <div style={{
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
                  {/* Eyedropper — sample a pixel color, then a picker
                      popover lets you swap all matching pixels. Stays
                      next to the size chip so the top-left cluster
                      reads as one "info / pick" group. */}
                  <GlassIconBtn
                    icon={<DropperIcon />}
                    active={eyedropping}
                    onClick={() => {
                      if (eyedropping) {
                        setEyedropping(false);
                      } else {
                        setEyedropping(true);
                        setPendingPick(null);
                      }
                    }}
                  />
                  {/* Reset — only visible once at least one swap has
                      been applied. Reverts to the original image. */}
                  {colorSwaps.length > 0 && (
                    <GlassIconBtn
                      icon={<ResetIcon />}
                      onClick={() => {
                        setEditedDataUrl(null);
                        setColorSwaps([]);
                        setPendingPick(null);
                        setEyedropping(false);
                        // Restore the pre-swap decal snapshot so 3D +
                        // mockup snap back to the original print colors.
                        if (originalDecalDataUrl) setDecalDataUrl(originalDecalDataUrl);
                        toast?.info?.('Color swaps reset');
                      }}
                    />
                  )}
                </div>
              )}

              {/* Color picker popover — appears at the pixel the user
                  just sampled. Shows the picked swatch, the design-
                  system color picker for the replacement, a tolerance
                  slider, and Apply + Cancel. */}
              {pendingPick && (
                <SwapPopover
                  pick={pendingPick}
                  wrapRef={wrapRef}
                  swapCount={colorSwaps.length}
                  onPreview={async (newColor, tolerance) => {
                    try {
                      const url = await applyColorSwap(pendingPick.color, newColor, tolerance);
                      setPreviewDataUrl(url);
                    } catch (e) {
                      // CORS or other failure — silently skip preview update.
                    }
                  }}
                  onCancel={() => {
                    setPreviewDataUrl(null);
                    setPendingPick(null);
                  }}
                  onApply={async (newColor, tolerance) => {
                    // Preview is already the result we want — promote it.
                    if (!previewDataUrl) return;
                    setEditedDataUrl(previewDataUrl);
                    setColorSwaps((prev) => [...prev, { from: pendingPick.color, to: newColor, tolerance }]);
                    setPreviewDataUrl(null);
                    const swappedFrom = pendingPick.color;
                    setPendingPick(null);
                    toast?.success?.('Color swapped');
                    // Keep decalDataUrl in sync: apply the same swap to
                    // it so 3D + mockup show the recolored print without
                    // forcing the user to re-align. Skipped silently if
                    // no alignment was saved or the recolor fails.
                    if (decalDataUrl) {
                      try {
                        const updatedDecal = await applyColorSwap(
                          swappedFrom, newColor, tolerance, decalDataUrl,
                        );
                        setDecalDataUrl(updatedDecal);
                      } catch (e) {
                        // CORS-tainted or other failure — leave decal at
                        // its previous colors and let the user re-align
                        // manually if they care.
                      }
                    }
                  }}
                />
              )}

              {/* Alignment overlay — toggled by the Align button. A
                  centered circle (60% of the wrapper's shorter side)
                  is highlighted by a massive box-shadow on the inner
                  span that dims everything OUTSIDE the circle. The
                  user positions the image inside the ring. Real
                  alignment logic ships later; this is the visual
                  scaffold + view-change animation. */}
              <AnimatePresence>
                {aligning && <AlignmentOverlay ringRef={alignRingRef} />}
              </AnimatePresence>

              {/* Rotation slider — appears on the right edge while
                  aligning. Lets the user spin the image inside the ring
                  without using up cursor focus for a drag. Vertical
                  thin track, frosted-glass to match the rest of the
                  overlay UI. data-viewer-ui so the wrapper's drag
                  handler ignores press events on it. */}
              <AnimatePresence>
                {aligning && (
                  <RotationSlider
                    value={rotation}
                    onChange={setRotation}
                  />
                )}
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
            {view === '3d' && viewerThrowMode && !viewerSceneKey && viewerShape === 'ball' && (
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

          {/* Smart body-color controls — bottom-right, the gravity-OFF mirror of
              the fun menu. The model dropdown (in the 3D strip) picks the shape;
              this shows one color button per body the model exposes: ball → ball
              color, chip → chip color, gift set → both, metal tools → none. */}
          <AnimatePresence>
            {view === '3d' && status === 'ready' && !viewerThrowMode && (tintControls.length > 0 || ballChipOnly) && (
              <motion.div
                key="tint-controls"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.7 }}
                style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 4, zIndex: 6 }}
              >
                {/* Ball↔chip toggle — only in ball-&-chip-only mode, sitting just
                    left of the color swatch. Icon shows the CURRENT model (so it
                    reads with the swatch beside it); the tooltip names the flip. */}
                {ballChipOnly && (
                  <GlassIconBtn
                    icon={viewerShape === 'chip' ? <ChipIcon size={14} /> : <BallIcon size={14} />}
                    title={viewerShape === 'chip' ? 'Switch to golf ball' : 'Switch to poker chip'}
                    onClick={() => setViewerShape((s) => (s === 'chip' ? 'ball' : 'chip'))}
                  />
                )}
                {tintControls.map((c) => (
                  <TintControl key={c.key} label={c.label} value={c.value} defColor={c.def} onChange={c.set} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Drop-to-replace overlay — frosted scrim with a brand-tinted
              ring + label. pointerEvents:none so the wrapper's own drag
              events keep firing through it (otherwise the cursor crossing
              the overlay would trigger dragleave on the wrapper and the
              overlay would flicker). */}
          <DropOverlay active={dropActive} />
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
                      // Stash the un-recolored snapshot so Reset can
                      // restore it without forcing a re-align.
                      setOriginalDecalDataUrl(url);
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
            inside the 3D canvas) plus Copy + Download for the active
            viewer's snapshot (wired to onCopy3D / onDownload3D). */}
        <AnimatePresence initial={false}>
          {inViewerMode && (
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
                {/* Model switcher — every 3D model we support. Replaces the old
                    ball/chip icon toggle. Its menu portals to <body>, so the
                    strip's overflow:hidden doesn't clip it. Grows to fill the
                    strip between the Image and Copy buttons. In ball-&-chip-only
                    mode (dev setting) it's hidden — the ball↔chip toggle lives
                    in the floating color cluster instead — leaving a spacer so
                    Copy/Download stay right-aligned. */}
                {ballChipOnly ? (
                  <div style={{ flex: 1 }} />
                ) : (
                  <Dropdown
                    size="sm"
                    value={viewerShape}
                    options={MODEL_OPTIONS}
                    onChange={setViewerShape}
                    style={{ flex: 1, minWidth: 150 }}
                  />
                )}
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
            onClick={inViewerMode ? onDownload3D : onDownload}
            style={{ flex: 1, minWidth: 0, width: 'auto' }}
          >
            Download
          </Btn>
        </div>

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
      </div>
    </FloatingPanel>
  );
}

/* ── DropOverlay ─────────────────────────────────────────────────
   Frosted scrim that fades in over the preview wrapper while the
   user is dragging a file in. Centered capsule shows a download
   glyph + "Drop to replace" label; a dashed brand-tinted ring
   pulses subtly so the affordance reads as "this is a target."

   Animations:
     • Scrim: opacity 0 → 1 over 160ms
     • Capsule: scale 0.9 → 1 + opacity, spring (slight bounce)
     • Dashed ring: opacity ramp + a slow stroke-dash drift so it
       feels alive without spinning like a loader

   pointerEvents:'none' on the root — drag events must pass through
   to the wrapper so dragleave doesn't trigger on every overlay
   intersection. */
function DropOverlay({ active }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="drop-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'absolute', inset: 0, zIndex: 7,
            pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            // Soft brand-tinted scrim so the underlying image stays
            // visible but it's clear something is about to change.
            background: 'color-mix(in srgb, var(--gb-brand-label) 18%, color-mix(in srgb, var(--gb-surface-canvas) 55%, transparent))',
            backdropFilter: 'blur(6px) saturate(140%)',
            WebkitBackdropFilter: 'blur(6px) saturate(140%)',
          }}
        >
          {/* Animated dashed ring — sits behind the capsule, drifts
              slowly clockwise so the user reads it as "live target". */}
          <motion.svg
            width="180" height="180" viewBox="0 0 180 180"
            style={{ position: 'absolute' }}
            initial={{ rotate: 0, scale: 0.86, opacity: 0 }}
            animate={{ rotate: 360, scale: 1, opacity: 1 }}
            exit={{ scale: 0.86, opacity: 0 }}
            transition={{
              rotate: { duration: 22, ease: 'linear', repeat: Infinity },
              scale:  { type: 'spring', stiffness: 280, damping: 22 },
              opacity:{ duration: 0.22 },
            }}
          >
            <circle
              cx="90" cy="90" r="78" fill="none"
              stroke="var(--gb-brand-label)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="10 8"
              opacity="0.85"
            />
          </motion.svg>
          {/* Centered capsule — frosted glass with download arrow +
              label. Spring scale-in feels like a snap-to-target. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 4 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26, mass: 0.8 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 9,
              padding: '10px 16px',
              background: 'color-mix(in srgb, var(--gb-surface-canvas) 82%, transparent)',
              backdropFilter: 'blur(18px) saturate(160%)',
              WebkitBackdropFilter: 'blur(18px) saturate(160%)',
              border: '1px solid color-mix(in srgb, var(--gb-brand-label) 40%, transparent)',
              borderRadius: 14,
              boxShadow: '0 8px 24px -8px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset',
              color: 'var(--gb-text-primary)',
              fontFamily: 'var(--gb-font-sans)',
              fontSize: 13, fontWeight: 700, letterSpacing: 0.2,
            }}
          >
            {/* Download glyph — incoming arrow into a tray. Same icon
                vocabulary as the modal's Download button so the user
                reads "this slot accepts a file." */}
            <motion.svg
              width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="var(--gb-brand-label)" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"
              animate={{ y: [0, -2, 0] }}
              transition={{ duration: 1.2, ease: 'easeInOut', repeat: Infinity }}
            >
              <path d="M12 3v12" />
              <path d="M6 11l6 6 6-6" />
              <path d="M4 21h16" />
            </motion.svg>
            <span>Drop to replace</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
function AlignmentOverlay({ ringRef }) {
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
        ref={ringRef}
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
          boxShadow: `0 0 0 9999px var(--gb-overlay-strong)`,
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

/* ── RotationSlider ─────────────────────────────────────────────
   Vertical, minimal rotation slider for alignment mode. Lives on
   the right edge of the preview surface. Pointer-drag updates the
   value continuously; the track is a thin frosted pill, the thumb
   a small white-filled dot. Range -180° → +180°; double-click on
   the track resets to 0°. */
function RotationSlider({ value, onChange }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);

  const valueFromY = (clientY) => {
    const el = trackRef.current;
    if (!el) return value;
    const r = el.getBoundingClientRect();
    const ratio = 1 - Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    return Math.round(ratio * 360 - 180);
  };

  const onPointerDown = (e) => {
    e.stopPropagation();
    draggingRef.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    onChange(valueFromY(e.clientY));
  };
  const onPointerMove = (e) => {
    if (!draggingRef.current) return;
    onChange(valueFromY(e.clientY));
  };
  const onPointerUp = (e) => {
    draggingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };
  const onDoubleClickReset = (e) => { e.stopPropagation(); onChange(0); };

  // Thumb Y position: value -180 → bottom, +180 → top.
  const pct = (180 - value) / 360;  // 0 at top, 1 at bottom
  const TRACK_H = 130;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
      data-viewer-ui="true"
      style={{
        position: 'absolute',
        // top: 50% + translateY(-50%) would collide with framer-motion's
        // transform writes. Use marginTop on a known height instead so
        // we never need our own transform string.
        top: '50%', right: 10,
        marginTop: -((TRACK_H + 18 + 12) / 2), // half of (track + label + padding) — keeps the center on the wrapper midline
        zIndex: 6,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '8px 6px',
        background: GLASS_BG,
        backdropFilter: GLASS_FILTER,
        WebkitBackdropFilter: GLASS_FILTER,
        border: `1px solid ${GLASS_BORDER}`,
        borderRadius: GLASS_RADIUS,
        boxShadow: GLASS_SHADOW,
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
        color: 'var(--gb-text-secondary)',
        fontFamily: 'var(--gb-font-mono)',
      }}>{value > 0 ? '+' : ''}{value}°</span>
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClickReset}
        style={{
          position: 'relative',
          width: 4, height: TRACK_H,
          borderRadius: 2,
          background: 'color-mix(in srgb, var(--gb-text-primary) 18%, transparent)',
          cursor: 'ns-resize',
        }}
      >
        {/* Center tick — visual reference for the 0° middle. */}
        <div style={{
          position: 'absolute', left: -3, right: -3,
          top: '50%', height: 1,
          background: 'color-mix(in srgb, var(--gb-text-primary) 30%, transparent)',
          transform: 'translateY(-0.5px)',
          pointerEvents: 'none',
        }} />
        {/* Thumb */}
        <div style={{
          position: 'absolute',
          left: '50%', top: `${pct * 100}%`,
          width: 12, height: 12, borderRadius: '50%',
          background: '#ffffff',
          border: '1px solid color-mix(in srgb, var(--gb-text-primary) 25%, transparent)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.22) inset, 0 2px 6px -1px rgba(0,0,0,0.4)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }} />
      </div>
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
// Camera glyph — DSLR body + lens. Reads as "snap a photo" / "studio
// shot" which is exactly what the grass mockup mode produces.
const CameraIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

// Golf ball — circle with a few dimples. The "ball" state of the shape toggle.
const BallIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <circle cx="9" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="13" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="9" cy="15" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="15" cy="15" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);
// Poker chip — outer ring, inner ring + four edge spots. The "chip" state.
const ChipIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <line x1="12" y1="3" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="21" />
    <line x1="3" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="21" y2="12" />
  </svg>
);
// Filled swatch showing the current body tint (ball color / chip clay).
const ColorCircleIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" fill={p.color || '#f6f6f6'}
      stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.55" />
  </svg>
);

/* The models the 3D viewer can show — drives the model dropdown in the 3D strip. */
const MODEL_OPTIONS = [
  { id: 'ball', label: 'Golf Ball' },
  { id: 'chip', label: 'Poker Chip' },
  { id: 'divot', label: 'Divot Tool' },
  { id: 'bartender', label: 'Bartender Tool' },
  { id: 'marker', label: 'Ball Marker' },
  { id: 'giftsetPoker', label: 'Gift Set · Poker Chip' },
  { id: 'giftsetLever', label: 'Gift Set · Lever Divot' },
  { id: 'giftsetBartender', label: 'Gift Set · Bartender' },
  { id: 'giftsetWoodPoker', label: 'Premium Wood · Poker Chip' },
  { id: 'giftsetWoodLever', label: 'Premium Wood · Lever Divot' },
];

/* One body-color control: a glass swatch button that opens the design-system
   color picker. Self-contained (own open state + anchor ref) so a model can show
   zero (metal tools), one (ball / chip), or two (gift set = ball + chip) of them. */
function TintControl({ label, value, defColor, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const swatch = value || defColor;
  return (
    <div ref={ref} data-viewer-ui="true" style={{ position: 'relative', display: 'inline-flex' }}>
      <GlassIconBtn
        icon={<ColorCircleIcon size={14} color={swatch} />}
        active={open}
        title={label}
        onClick={() => setOpen((o) => !o)}
      />
      <AnimatePresence>
        {open && (
          <ColorPickerPopover
            value={swatch}
            onChange={onChange}
            anchorRef={ref}
            onClose={() => setOpen(false)}
            align="right"
          />
        )}
      </AnimatePresence>
    </div>
  );
}

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

/* Water drop / pour — teardrop shape with three falling droplets.
   Reads instantly as liquid / water. */
const WaterIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2C12 2 5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13z" />
    <path d="M8 17a3 3 0 0 0 5 0" strokeWidth="1.5" opacity="0.6" />
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

/* Explode glyph — central dot with eight outward rays. Reads
   as a burst / shatter at small sizes. */
const ExplodeIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    <path d="M12 3v3.5" />
    <path d="M12 17.5V21" />
    <path d="M3 12h3.5" />
    <path d="M17.5 12H21" />
    <path d="M5.6 5.6l2.5 2.5" />
    <path d="M15.9 15.9l2.5 2.5" />
    <path d="M18.4 5.6l-2.5 2.5" />
    <path d="M8.1 15.9l-2.5 2.5" />
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

  // On unmount (fun menu disappears because gravity flipped off OR
  // the user left 3D view), purge everything in the room except the
  // ball — same rule as closing the menu manually.
  useEffect(() => {
    const v = viewerRef;
    return () => { v.current?.clearRoomItems?.(); };
  }, [viewerRef]);

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

  // Drain water when switching away from the water tool. Also release
  // any in-flight cursor-push depression when switching INTO the water
  // tool (otherwise the last push position keeps depressing while the
  // user is also pouring — visually noisy).
  useEffect(() => {
    if (activeTool !== 'water') {
      if (viewerRef.current) viewerRef.current.waterActive = false;
    } else {
      viewerRef.current?.pushWaterAt?.(null);
    }
  }, [activeTool, viewerRef]);

  // Reassemble the ball when leaving the explode tool. Mounts a no-op
  // when activeTool flips ON; the cleanup fires on the flip OFF so any
  // shards currently in the air glide back home before the user moves
  // to a different tool.
  useEffect(() => {
    if (activeTool !== 'explode') return undefined;
    return () => { viewerRef.current?.reassembleBall?.(); };
  }, [activeTool, viewerRef]);

  // Global pointer listeners for bomb + ball + water tools.
  useEffect(() => {
    if (!activeTool || activeTool === 'confetti') return undefined;

    const onDown = (e) => {
      if (e.button !== 0) return;
      if (e.target?.closest?.('button, [data-viewer-ui="true"]')) return;
      const v = viewerRef.current;
      if (!v?.containsPoint?.({ clientX: e.clientX, clientY: e.clientY })) return;

      lastCursorRef.current = { clientX: e.clientX, clientY: e.clientY };

      if (activeTool === 'bomb') {
        v.dropBomb?.({ clientX: e.clientX, clientY: e.clientY });
      }
      if (activeTool === 'balls') {
        v.spawnBallActive = true;
        v.spawnBallAt?.(lastCursorRef.current);
        spawnIntervalRef.current = setInterval(() => {
          if (viewerRef.current?.spawnBallActive) {
            viewerRef.current.spawnBallAt?.(lastCursorRef.current);
          }
        }, 100);
      }
      if (activeTool === 'water') {
        v.waterActive = true;
        v.pourWaterAt?.({ clientX: e.clientX, clientY: e.clientY });
      }
      if (activeTool === 'explode') {
        v.explodeBallAt?.({ clientX: e.clientX, clientY: e.clientY });
      }
    };

    const onMove = (e) => {
      lastCursorRef.current = { clientX: e.clientX, clientY: e.clientY };
      if (activeTool === 'water' && viewerRef.current?.waterActive) {
        viewerRef.current.pourWaterAt?.({ clientX: e.clientX, clientY: e.clientY });
      } else if (viewerRef.current && activeTool !== 'water') {
        // Cursor-push: whenever the water tool is OFF and the cursor
        // moves over the canvas, the viewer's heightfield gets a
        // negative bump under the cursor each frame. Touch contains
        // its own bounds check (returns gracefully if pos is outside
        // the canvas), so we can fire unconditionally on every move
        // and let the viewer decide whether to act.
        viewerRef.current.pushWaterAt?.({ clientX: e.clientX, clientY: e.clientY });
      }
    };

    const onUp = () => {
      if (viewerRef.current) viewerRef.current.spawnBallActive = false;
      if (viewerRef.current) viewerRef.current.waterActive = false;
      clearInterval(spawnIntervalRef.current);
      spawnIntervalRef.current = null;
    };

    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      clearInterval(spawnIntervalRef.current);
      spawnIntervalRef.current = null;
    };
  }, [activeTool, viewerRef]);

  const handleOpenChange = (next) => {
    setOpen(next);
    if (!next) {
      if (activeTool) setActiveTool(null);
      // Closing the fun menu purges everything in the room except the
      // golf ball — same behavior as entering a scene. The user has
      // signaled they're done playing; clean slate.
      viewerRef.current?.clearRoomItems?.();
    }
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
    { key: 'water',    icon: <WaterIcon size={14} /> },
    { key: 'explode',  icon: <ExplodeIcon size={14} /> },
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
