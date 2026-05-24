import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

/* ────────────────────────────────────────────────────────────────
   ColorPicker — themed replacement for the native <input type=color>.

   Two exports:
     • <ColorPicker>          — self-contained: round swatch trigger +
                                 popover. Drop-in for "show me a swatch,
                                 give me a color back."
     • <ColorPickerPopover>   — popover-only. Attach to your own trigger
                                 via `anchorRef`. Used by ColorButton (A +
                                 underbar) and ColorField (input + swatch).

   The picker is reactive — dragging the S/V square or hue slider fires
   onChange every frame so live previews (signature editor, theme tokens,
   highlight color) update in real time.
──────────────────────────────────────────────────────────────── */

/* ── color math ────────────────────────────────────────────────── */
const HEX_RE = /^#?([0-9a-fA-F]{6})$/;

function hexToRgb(hex) {
  const m = HEX_RE.exec(hex || '');
  if (!m) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(m[1].slice(0, 2), 16),
    g: parseInt(m[1].slice(2, 4), 16),
    b: parseInt(m[1].slice(4, 6), 16),
  };
}
function rgbToHex({ r, g, b }) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}
function rgbToHsv({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r)      h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}
function hsvToRgb({ h, s, v }) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) {         g = c; b = x; }
  else if (h < 240) {         g = x; b = c; }
  else if (h < 300) { r = x;          b = c; }
  else              { r = c;          b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
const clamp01 = (n) => Math.max(0, Math.min(1, n));

/* ── trigger sizes ──────────────────────────────────────────────── */
const TRIGGER_SIZES = { sm: 20, md: 26, lg: 32 };

/* ── popover ────────────────────────────────────────────────────── */
const POPOVER_W = 212;
export function ColorPickerPopover({
  value = '#000000', onChange, swatches, anchorRef, onClose, align = 'left', offset = 6,
}) {
  const ref = useRef(null);
  // Local hex string so the user can type partial values without us
  // committing every keystroke as a color change.
  const [hexInput, setHexInput] = useState(value);
  useEffect(() => { setHexInput(value); }, [value]);

  // Position the portaled popover from the anchor's viewport rect — once
  // at open, then on window resize. We do NOT track scroll: doing so
  // recomputes pos on every keystroke-induced layout shift inside the
  // popover (focus scrolls etc.), making it twitch mid-interaction.
  // Instead, scrolling the page closes the popover (handled below).
  // Portal-to-body is required because the popover otherwise gets clipped
  // by sibling cards in the same stacking context (visible in the settings
  // page where multiple ColorSpotlights stack vertically).
  // Popover height varies with whether `swatches` is passed; estimate
  // a generous max so the flip decision below has something to compare
  // against viewport space. ~210 covers SV square + hue + hex row;
  // +30 per swatch row (≤10 per row).
  const [pos, setPos] = useState(null);
  useEffect(() => {
    function update() {
      const el = anchorRef?.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const estH = 210 + (swatches?.length ? 30 : 0);
      // Flip above the anchor when there isn't room below. Keeps the
      // popover fully on-screen for triggers near the bottom edge
      // (the GolfballViewer light chip lives at canvas bottom-left).
      const roomBelow = window.innerHeight - r.bottom - offset;
      const flipUp = roomBelow < estH && r.top > estH + offset;
      setPos({
        top:  flipUp ? r.top - offset - estH : r.bottom + offset,
        left: align === 'right' ? r.right - POPOVER_W : r.left,
      });
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [anchorRef, align, offset, swatches]);

  // Close on outside scroll (any scrollable in the editor — capture phase
  // catches nested ones). Scrolls inside the popover itself are ignored
  // so dragging picker controls doesn't auto-close.
  useEffect(() => {
    const onScroll = (e) => {
      if (ref.current?.contains(e.target)) return;
      onClose?.();
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [onClose]);

  // Outside click + Esc close. (Anchor click is part of "inside.")
  useEffect(() => {
    const onDown = (e) => {
      if (!ref.current?.contains(e.target) && !anchorRef?.current?.contains(e.target)) onClose?.();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  const hsv = useMemo(() => rgbToHsv(hexToRgb(value)), [value]);

  function commit(hex) { onChange?.(hex); setHexInput(hex); }

  /* Pointer-drag helper — keeps tracking even when the cursor leaves the
     source element, just like a native slider. */
  function trackDrag(e, update) {
    const target = e.currentTarget;
    update(e, target);
    const move = (ev) => update(ev, target);
    const up   = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup',   up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup',   up);
  }

  function pickSv(e, target) {
    const r = target.getBoundingClientRect();
    const s = clamp01((e.clientX - r.left) / r.width);
    const v = clamp01(1 - (e.clientY - r.top) / r.height);
    commit(rgbToHex(hsvToRgb({ h: hsv.h, s, v })));
  }
  function pickHue(e, target) {
    const r = target.getBoundingClientRect();
    const h = clamp01((e.clientX - r.left) / r.width) * 360;
    // When dragging hue with current sat/val = 0 the color stays black —
    // floor to a useful default so the user sees the hue land.
    commit(rgbToHex(hsvToRgb({ h, s: hsv.s || 1, v: hsv.v || 1 })));
  }

  if (!pos) return null;
  return createPortal(
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: 'fixed',
        top: pos.top, left: pos.left,
        zIndex: 2147483500,
        width: POPOVER_W, padding: 10,
        display: 'flex', flexDirection: 'column', gap: 9,
        background: 'var(--gb-surface-modal)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-md)',
        boxShadow: 'var(--gb-shadow-popover)',
        fontFamily: 'var(--gb-font-sans)',
        // Disable text selection on the popover chrome — without this,
        // dragging the SV square or hue slider painted a text-selection
        // range across the surrounding labels/inputs. The hex <input>
        // re-enables selection on itself below so the user can still
        // type/paste hex codes there.
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Saturation / Value square */}
      <div
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); trackDrag(e, pickSv); }}
        style={{
          position: 'relative', width: '100%', height: 132,
          borderRadius: 'var(--gb-r-sm)', overflow: 'hidden',
          background:
            `linear-gradient(to top, #000, transparent), ` +
            `linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`,
          cursor: 'crosshair',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{
          position: 'absolute',
          left: `calc(${hsv.s * 100}% - 7px)`,
          top:  `calc(${(1 - hsv.v) * 100}% - 7px)`,
          width: 14, height: 14, borderRadius: '50%',
          background: 'transparent',
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Hue slider */}
      <div
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); trackDrag(e, pickHue); }}
        style={{
          position: 'relative', width: '100%', height: 12,
          borderRadius: 6,
          background:
            'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
          cursor: 'pointer',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{
          position: 'absolute',
          left: `calc(${(hsv.h / 360) * 100}% - 5px)`,
          top: -2,
          width: 10, height: 16, borderRadius: 3,
          background: '#fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Hex input + live preview chip */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{
          width: 24, height: 24, borderRadius: 'var(--gb-r-sm)',
          background: value, flexShrink: 0,
          boxShadow: 'inset 0 0 0 1px var(--gb-border-default)',
        }} />
        <div style={{
          flex: 1,
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '0 8px', height: 24,
          background: 'var(--gb-surface-2)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>#</span>
          <input
            type="text"
            value={hexInput.replace(/^#/, '')}
            spellCheck={false}
            maxLength={6}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^a-fA-F0-9]/g, '').slice(0, 6);
              setHexInput('#' + raw);
              if (raw.length === 6) commit('#' + raw);
            }}
            style={{
              flex: 1, minWidth: 0, width: '100%',
              background: 'transparent', border: 'none', outline: 'none',
              padding: 0, margin: 0, font: 'inherit',
              // Re-enable selection only on this input — the popover
              // root sets userSelect:none for the chrome.
              userSelect: 'text',
              WebkitUserSelect: 'text',
              fontFamily: 'var(--gb-font-mono)', fontSize: 11.5, fontWeight: 600,
              color: 'var(--gb-text-primary)', textTransform: 'uppercase',
            }}
          />
        </div>
      </div>

      {/* Optional preset swatches */}
      {swatches && swatches.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => commit(c)}
              style={{
                width: 18, height: 18, borderRadius: '50%', padding: 0,
                background: c,
                border: value.toLowerCase() === c.toLowerCase()
                  ? '2px solid var(--gb-text-primary)'
                  : '1px solid var(--gb-border-default)',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      )}
    </motion.div>,
    document.body,
  );
}

/* ── default-trigger self-contained picker ─────────────────────── */
export function ColorPicker({
  value = '#000000', onChange, size = 'md', swatches, align = 'left', disabled, style,
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const d = TRIGGER_SIZES[size] || TRIGGER_SIZES.md;
  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }}>
      <motion.button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        whileHover={disabled ? undefined : { scale: 1.06 }}
        whileTap={disabled ? undefined : { scale: 0.94 }}
        transition={{ duration: 0.12 }}
        onClick={() => !disabled && setOpen((v) => !v)}
        style={{
          width: d, height: d, borderRadius: '50%',
          background: value,
          border: '2px solid var(--gb-surface-1)',
          boxShadow: '0 0 0 1px var(--gb-border-default), 0 1px 3px rgba(0,0,0,0.18)',
          padding: 0, cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      />
      <AnimatePresence>
        {open && (
          <ColorPickerPopover
            value={value}
            onChange={onChange}
            swatches={swatches}
            anchorRef={anchorRef}
            onClose={() => setOpen(false)}
            align={align}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
