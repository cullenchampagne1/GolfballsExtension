import React, { useEffect, useRef, useState } from 'react';
import { motion, useAnimate } from 'motion/react';
import { SHAKE, SHAKE_T, inputBaseStyle } from '../shared.jsx';

/* Chrome's autofill paints a yellow background ONTO the <input> element
   (not the styled wrapper) — that's the "weird outline around the actual
   text size." Override it once on first mount so the autofill rect blends
   into the wrapper instead of standing out as an inner box. */
const AUTOFILL_STYLE_ID = '__gb-input-autofill';
function ensureAutofillStyle() {
  if (typeof document === 'undefined' || document.getElementById(AUTOFILL_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = AUTOFILL_STYLE_ID;
  el.textContent = `
    .gb-input-native:-webkit-autofill,
    .gb-input-native:-webkit-autofill:hover,
    .gb-input-native:-webkit-autofill:focus,
    .gb-input-native:-webkit-autofill:active {
      -webkit-text-fill-color: var(--gb-text-primary) !important;
      -webkit-box-shadow: 0 0 0 1000px var(--gb-surface-2) inset !important;
      caret-color: var(--gb-text-primary);
      transition: background-color 100000s ease-out 0s;
    }
    .gb-input-native {
      -webkit-appearance: none; appearance: none;
    }
  `;
  (document.head || document.documentElement).appendChild(el);
}

/**
 * Input — single-line text control.
 *
 * Props: value | defaultValue, placeholder, size 'sm'|'md'|'lg', mono,
 *   error, leading, trailing, type, disabled,
 *   onChange(value) — emits the string value directly, onFocus, onBlur.
 * Shakes once when `error` flips false → true.
 */
export function Input({
  value, defaultValue, placeholder, size = 'md', mono, error,
  leading, trailing, type = 'text', disabled, readOnly,
  onChange, onFocus, onBlur, style, ...rest
}) {
  const [focused, setFocused] = useState(false);
  const [empty, setEmpty] = useState(() => !String((value ?? defaultValue) ?? '').length);
  const [scope, animate] = useAnimate();
  const prevError = useRef(error);

  useEffect(() => { ensureAutofillStyle(); }, []);

  useEffect(() => {
    if (error && !prevError.current) animate(scope.current, { x: SHAKE }, SHAKE_T);
    prevError.current = error;
  }, [error, animate, scope]);

  useEffect(() => {
    if (value !== undefined) setEmpty(!String(value).length);
  }, [value]);

  return (
    <motion.div
      ref={scope}
      style={{
        ...inputBaseStyle({ focused, error, size }),
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {leading && <span style={{ color: 'var(--gb-text-muted)', display: 'flex', flexShrink: 0 }}>{leading}</span>}
      <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }}>
        {empty && placeholder && (
          <span style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            color: 'var(--gb-text-ghost)', pointerEvents: 'none',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            fontFamily: mono ? 'var(--gb-font-mono)' : 'inherit',
          }}>{placeholder}</span>
        )}
        <input
          className="gb-input-native"
          type={type}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          readOnly={readOnly}
          tabIndex={readOnly ? -1 : undefined}
          onChange={(e) => { setEmpty(!e.target.value.length); onChange?.(e.target.value); }}
          onFocus={(e) => { if (!readOnly) setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={{
            flex: 1, minWidth: 0, width: '100%',
            background: 'transparent', border: 'none', outline: 'none',
            boxShadow: 'none', padding: 0, margin: 0,
            color: 'var(--gb-text-primary)', font: 'inherit',
            fontFamily: mono ? 'var(--gb-font-mono)' : 'inherit',
            cursor: readOnly ? 'default' : 'text',
          }}
          {...rest}
        />
      </div>
      {trailing && <span style={{ color: 'var(--gb-text-muted)', display: 'flex', flexShrink: 0 }}>{trailing}</span>}
    </motion.div>
  );
}
