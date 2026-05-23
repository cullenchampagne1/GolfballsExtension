import React, { useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { ColorPickerPopover } from './ColorPicker.jsx';

/**
 * ColorButton — toolbar swatch for text or highlight color. Two variants:
 *   • underbar — "A" with a thin colored bar at the bottom (text color)
 *   • fill     — "A" sitting in a colored background (highlight)
 *
 * Clicking opens the design-system ColorPicker popover (no more native OS
 * picker). `onChange` fires while the user drags through the popover so
 * the editor updates live.
 *
 * Props:
 *   value       hex color
 *   onChange    (color) => void
 *   onMouseDown saveSelection hook (the RTE needs this to keep its caret)
 *   variant     'underbar' (default) | 'fill'
 *   letter      glyph shown on the button (default 'A')
 *   title       button tooltip
 *   width, height  px — sized to the parent toolbar's size preset
 *   align       'left' (default) | 'right' — popover side
 *   swatches    optional preset palette passed through to the popover
 */
export function ColorButton({
  value, onChange, onMouseDown,
  variant = 'underbar', letter = 'A', title,
  width = 26, height = 24,
  align = 'left', swatches,
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={anchorRef}
        type="button"
        title={title}
        onMouseDown={(e) => { onMouseDown?.(e); }}
        onClick={() => setOpen((v) => !v)}
        style={{
          width, height, borderRadius: 4, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--gb-text-secondary)', position: 'relative',
          background: 'transparent', border: 'none', padding: 0,
        }}
      >
        {variant === 'fill' ? (
          <span style={{
            fontSize: 10.5, fontWeight: 800, lineHeight: 1,
            padding: '1px 3px', borderRadius: 2,
            background: value, color: '#1a1a1a',
          }}>{letter}</span>
        ) : (
          <>
            <span style={{ fontSize: 11, fontWeight: 800, lineHeight: 1 }}>{letter}</span>
            <span style={{
              position: 'absolute', bottom: 3, left: 5, right: 5, height: 3,
              borderRadius: 1, background: value,
            }} />
          </>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <ColorPickerPopover
            value={value}
            onChange={onChange}
            anchorRef={anchorRef}
            onClose={() => setOpen(false)}
            align={align}
            swatches={swatches}
          />
        )}
      </AnimatePresence>
    </span>
  );
}
