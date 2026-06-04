import React, { useId, useContext } from 'react';
import { motion } from 'motion/react';
import { Dot } from './Dot.jsx';
import { PopupDragContext } from './DraggablePopup.jsx';

const UNDERLINE_SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.85 };

/**
 * Tabs — in-modal underline tab rail. Each tab shows an icon + label, with
 * an optional brand `dot` indicating "this tab has configuration set".
 *
 * Different pattern from Segmented:
 *   • Segmented (pill) — for switching modes/views at the top of a page.
 *   • Tabs (underline) — for sectioning a modal or panel body.
 *
 * Props:
 *   value    selected tab id
 *   onChange (id) => void
 *   options  Array<{ id, label, icon, dot? }>
 *   style    extra style on the outer rail
 */
export function Tabs({ value, onChange, options = [], style }) {
  // Unique per Tabs instance so the underline only animates within its
  // own rail (not across two unrelated <Tabs/> rendered on the page).
  const groupId = useId();
  // True only while the host DraggablePopup is being dragged (false
  // everywhere else — the context defaults to false). During a drag the
  // popup's left/top change every frame; a spring-driven layout underline
  // re-measures and chases the moving target, so it visibly lags behind
  // the modal. Snapping the layout transition to instant makes it ride
  // rigidly with the popup; tab-to-tab switches keep the spring.
  const dragging = useContext(PopupDragContext);
  return (
    <div style={{
      display: 'flex', padding: '0 16px', flexShrink: 0,
      background: 'var(--gb-fill-subtle)',
      borderBottom: '1px solid var(--gb-border-subtle)',
      ...style,
    }}>
      {options.map(({ id, label, icon, dot }) => {
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange?.(id)}
            style={{
              position: 'relative',
              padding: '11px 13px', background: 'transparent', border: 'none',
              cursor: 'pointer', marginBottom: -1,
              color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
              fontFamily: 'var(--gb-font-sans)', fontSize: 11.5, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              transition: 'color .14s',
            }}
          >
            {icon && React.cloneElement(icon, { size: 11 })}
            {label}
            {dot && <Dot tone="brand" glow size={4} />}
            {/* Sliding underline — shared layoutId springs between active
                tabs instead of swapping borders. */}
            {active && (
              <motion.span
                layoutId={`tabs-${groupId}-underline`}
                transition={dragging ? { duration: 0 } : UNDERLINE_SPRING}
                style={{
                  position: 'absolute', left: 0, right: 0, bottom: -1,
                  height: 2, background: 'var(--gb-brand-label)',
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
