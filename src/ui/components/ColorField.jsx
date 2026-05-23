import React, { useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { inputBaseStyle } from '../shared.jsx';
import { ColorPickerPopover } from './ColorPicker.jsx';

const SWATCH = { sm: 18, md: 22, lg: 26 };
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * ColorField — a hex color control: a swatch that opens the design-system
 * ColorPicker popover, plus a typeable hex input. Compose inside <Field>
 * for a label.
 *
 * Props: value (hex string), onChange(hex), size 'sm'|'md'|'lg', disabled,
 *   swatches (optional preset palette).
 * Invalid hex shows the text in the error color; the swatch falls back safely.
 */
export function ColorField({ value = '#000000', onChange, size = 'md', disabled, swatches, style }) {
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const valid = HEX_RE.test(value);
  const swatch = SWATCH[size] || SWATCH.md;
  const anchorRef = useRef(null);

  return (
    <div
      style={{
        ...inputBaseStyle({ focused, size }),
        paddingLeft: 5,
        gap: 8,
        opacity: disabled ? 0.5 : 1,
        position: 'relative',
        ...style,
      }}
    >
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: swatch, height: swatch, flexShrink: 0, padding: 0,
          borderRadius: 'var(--gb-r-sm)', overflow: 'hidden',
          background: valid ? value : 'var(--gb-fill-subtle)',
          border: '1px solid var(--gb-border-strong)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      />
      <input
        value={value}
        disabled={disabled}
        spellCheck={false}
        maxLength={7}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1, minWidth: 0, width: '100%',
          background: 'transparent', border: 'none', outline: 'none', padding: 0, margin: 0,
          font: 'inherit', fontFamily: 'var(--gb-font-mono)', textTransform: 'uppercase',
          color: valid ? 'var(--gb-text-primary)' : 'var(--gb-error)',
        }}
      />
      <AnimatePresence>
        {open && (
          <ColorPickerPopover
            value={valid ? value : '#000000'}
            onChange={onChange}
            anchorRef={anchorRef}
            onClose={() => setOpen(false)}
            align="left"
            swatches={swatches}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
