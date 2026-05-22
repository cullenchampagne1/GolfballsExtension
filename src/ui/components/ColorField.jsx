import React, { useState } from 'react';
import { inputBaseStyle } from '../shared.jsx';

const SWATCH = { sm: 18, md: 22, lg: 26 };
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * ColorField — a hex color control: a swatch that opens the native color
 * picker, plus a typeable hex input. Compose inside <Field> for a label.
 *
 * Props: value (hex string), onChange(hex), size 'sm'|'md'|'lg', disabled.
 * Invalid hex shows the text in the error color; the swatch falls back safely.
 */
export function ColorField({ value = '#000000', onChange, size = 'md', disabled, style }) {
  const [focused, setFocused] = useState(false);
  const valid = HEX_RE.test(value);
  const swatch = SWATCH[size] || SWATCH.md;

  return (
    <div
      style={{
        ...inputBaseStyle({ focused, size }),
        paddingLeft: 5,
        gap: 8,
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <label
        style={{
          width: swatch, height: swatch, flexShrink: 0,
          borderRadius: 'var(--gb-r-sm)', position: 'relative', overflow: 'hidden',
          background: valid ? value : 'var(--gb-fill-subtle)',
          border: '1px solid var(--gb-border-strong)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <input
          type="color"
          disabled={disabled}
          value={valid ? value : '#000000'}
          onChange={(e) => onChange?.(e.target.value)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, padding: 0, border: 'none', cursor: 'inherit',
          }}
        />
      </label>
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
    </div>
  );
}
