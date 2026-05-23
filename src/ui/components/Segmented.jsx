import React, { useId } from 'react';
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
 */
export function Segmented({ value, onChange, options = [], size = 'md', full, style }) {
  const s = SIZES[size] || SIZES.md;
  // Unique per instance — keeps active indicators from different Segmented
  // controls from being mistaken for the same layout element.
  const groupId = useId();
  return (
    <div style={{
      display: full ? 'flex' : 'inline-flex',
      padding: s.pad, gap: s.gap,
      borderRadius: s.radius,
      background: 'var(--gb-fill-subtle)',
      border: '1px solid var(--gb-border-subtle)',
      ...style,
    }}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => { if (!active) onChange?.(o.id); }}
            style={{
              position: 'relative',
              flex: full ? 1 : '0 0 auto',
              padding: s.btnPad, borderRadius: s.innerRadius, border: 'none',
              background: 'transparent',
              color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
              fontSize: s.font, fontWeight: 600, fontFamily: 'var(--gb-font-sans)',
              cursor: active ? 'default' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              gap: 5, whiteSpace: 'nowrap',
              transition: 'color .14s',
            }}
          >
            {/* Sliding active background — shared layoutId so the brand
                pill springs between options instead of cross-fading. */}
            {active && (
              <motion.span
                layoutId={`segmented-${groupId}-bg`}
                transition={INDICATOR_SPRING}
                style={{
                  position: 'absolute', inset: 0,
                  background: 'var(--gb-brand-tint-medium)',
                  borderRadius: s.innerRadius,
                  zIndex: 0,
                }}
              />
            )}
            {/* Label/icon sit above the pill so they stay readable. */}
            <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {o.icon && React.cloneElement(o.icon, { size: s.icon })}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
