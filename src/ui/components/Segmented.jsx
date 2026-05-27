import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

/* Density presets. Defaults match the spec's SidePicker
   (design_handoff_components/reference/system-page.jsx:533) — 10.5px text,
   3×9 inner padding, 2 outer padding, brand-tint active. */
const SIZES = {
  sm: { pad: 2, btnPad: '2px 7px',  font: 10,   gap: 1, radius: 'var(--gb-r-sm)', innerRadius: 3, icon: 10 },
  md: { pad: 2, btnPad: '3px 9px',  font: 10.5, gap: 1, radius: 'var(--gb-r-sm)', innerRadius: 4, icon: 11 },
  lg: { pad: 3, btnPad: '4px 11px', font: 11,   gap: 1, radius: 'var(--gb-r-md)', innerRadius: 5, icon: 12 },
};

const INDICATOR_SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.85 };

/**
 * Segmented — inline single-select pill control. Use for switching modes
 * or views (template type, side picker, tone toggle). Matches the spec's
 * SidePicker pattern.
 *
 * Props:
 *   value       currently-selected option id
 *   onChange    (id) => void
 *   options     Array<{ id, label, icon? }>
 *   size        'sm' | 'md' (default) | 'lg'
 *   full        stretch to parent width (each button flex:1)
 *   style       extra style merged onto the outer pill
 *
 * Indicator is positioned via measured x/width (NOT layoutId) so the
 * sliding pill animates correctly from any position to any other position.
 * The previous layoutId-based approach jumped to the wrong target when the
 * Segmented sat inside a moving ancestor (e.g. a draggable panel) because
 * layoutId animations key off bounding-box deltas and react to ancestor
 * transforms — making clicks during/after a drag warp the pill to random
 * spots. Measuring relative offsets sidesteps that entirely.
 */
export function Segmented({ value, onChange, options = [], size = 'md', full, style }) {
  const s = SIZES[size] || SIZES.md;
  const containerRef = useRef(null);
  const btnRefs = useRef([]);
  // Indicator geometry: { x, width } relative to the container's padding box.
  // null = "no measurement yet" (initial render) → indicator hidden so it
  // doesn't flash at 0,0 before useLayoutEffect runs.
  const [ind, setInd] = useState(null);

  // Recompute on every render so option changes (additions / label edits)
  // and zoom changes update the indicator. useLayoutEffect runs before paint
  // so the user never sees a stale frame.
  useLayoutEffect(() => {
    const idx = options.findIndex((o) => o.id === value);
    const btn = btnRefs.current[idx];
    if (!btn) { setInd(null); return; }
    setInd({ x: btn.offsetLeft, width: btn.offsetWidth });
  }, [value, options, size]);

  // ResizeObserver: parent width changes (drag-resize, responsive layout)
  // shift the button offsets without re-rendering. Re-measure on every
  // container resize so the indicator stays glued to the active option.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const idx = options.findIndex((o) => o.id === value);
      const btn = btnRefs.current[idx];
      if (!btn) return;
      setInd({ x: btn.offsetLeft, width: btn.offsetWidth });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, options]);

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      style={{
        display: full ? 'flex' : 'inline-flex',
        padding: s.pad, gap: s.gap,
        borderRadius: s.radius,
        background: 'var(--gb-fill-subtle)',
        border: '1px solid var(--gb-border-subtle)',
        position: 'relative',
        ...style,
      }}
    >
      {/* Sliding active background — absolutely positioned, animated via
          x/width. Hidden until first measurement so it doesn't flash at
          the origin. height fills the inner content via top/bottom inset. */}
      {ind && (
        <motion.span
          aria-hidden
          initial={false}
          animate={{ x: ind.x, width: ind.width }}
          transition={INDICATOR_SPRING}
          style={{
            position: 'absolute',
            top: s.pad, bottom: s.pad, left: 0,
            background: 'var(--gb-brand-tint-medium)',
            borderRadius: s.innerRadius,
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
      )}
      {options.map((o, i) => {
        const active = o.id === value;
        /* Tab walks through every option; the user's keyboard
           movement does NOT change the selection. Enter / Space
           commits the focused option. Matches the "highlight first,
           confirm on Enter" idiom the rep is asking for — different
           from a pure radio-group pattern, but reads cleaner when
           Tab is the main navigation key for the form. */
        return (
          <button
            key={o.id}
            ref={(el) => { btnRefs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={0}
            onClick={() => { if (!active) onChange?.(o.id); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!active) onChange?.(o.id);
              }
            }}
            style={{
              position: 'relative', zIndex: 1,
              flex: full ? 1 : '0 0 auto',
              padding: s.btnPad, borderRadius: s.innerRadius, border: 'none',
              background: 'transparent',
              color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
              fontSize: s.font, fontWeight: 600, fontFamily: 'var(--gb-font-sans)',
              cursor: active ? 'default' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              gap: 5, whiteSpace: 'nowrap',
              transition: 'color .14s',
              outline: 'none',
            }}
          >
            {o.icon && React.cloneElement(o.icon, { size: s.icon })}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
