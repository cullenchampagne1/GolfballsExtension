import React from 'react';

/**
 * ColorButton — toolbar swatch for text or highlight color. Two variants:
 *   • underbar — "A" with a thin colored bar at the bottom (text color)
 *   • fill     — "A" sitting in a colored background (highlight)
 *
 * Wraps a native <input type=color> covered by the button, so any click on
 * the swatch opens the OS picker. `onChange` fires on `onInput` so the
 * editor updates live as the user drags through the picker.
 *
 * Props:
 *   value       hex color
 *   onChange    (color) => void   — fires while the picker drags
 *   onMouseDown saveSelection hook (the RTE needs this to keep its caret)
 *   variant     'underbar' (default) | 'fill'
 *   letter      glyph shown on the button (default 'A')
 *   title       button tooltip
 *   width, height  px — sized to fit the parent toolbar's size preset
 */
export function ColorButton({
  value, onChange, onMouseDown,
  variant = 'underbar', letter = 'A', title,
  width = 26, height = 24,
}) {
  return (
    <label title={title} style={{
      width, height, borderRadius: 4, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--gb-text-secondary)', position: 'relative',
    }}>
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
      <input
        type="color" value={value}
        onMouseDown={onMouseDown}
        onInput={(e) => onChange?.(e.target.value)}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
      />
    </label>
  );
}
