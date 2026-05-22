import React, { useEffect, useRef, useState } from 'react';
import { motion, useAnimate } from 'motion/react';
import { SHAKE, SHAKE_T, inputBaseStyle } from '../shared.jsx';

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
            background: 'transparent', border: 'none', outline: 'none', padding: 0, margin: 0,
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
