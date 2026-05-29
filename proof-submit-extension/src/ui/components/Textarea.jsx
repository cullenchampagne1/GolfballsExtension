import React, { useEffect, useRef, useState } from 'react';
import { motion, useAnimate } from 'motion/react';
import { SHAKE, SHAKE_T, inputBaseStyle } from '../shared.jsx';

/**
 * Textarea — multi-line text control. Shares the input shell.
 *
 * Props: value | defaultValue, placeholder, rows (default 3),
 *   resize 'none'|'vertical' (default 'none'), error, disabled,
 *   onChange(value), onFocus, onBlur.
 */
export function Textarea({
  value, defaultValue, placeholder, rows = 3, resize = 'none', error, disabled,
  onChange, onFocus, onBlur, nativeRef, style, ...rest
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
        ...inputBaseStyle({ focused, error }),
        height: 'auto', minHeight: 32 + (rows - 1) * 20,
        padding: '8px 10px', alignItems: 'stretch',
        position: 'relative', opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {empty && placeholder && (
        <span style={{
          position: 'absolute', top: 8, left: 10, right: 10,
          color: 'var(--gb-text-ghost)', pointerEvents: 'none', lineHeight: 1.5,
        }}>{placeholder}</span>
      )}
      <textarea
        ref={nativeRef}
        rows={rows}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={(e) => { setEmpty(!e.target.value.length); onChange?.(e.target.value); }}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={{
          flex: 1, width: '100%', boxSizing: 'border-box',
          background: 'transparent', border: 'none', outline: 'none', padding: 0, margin: 0,
          color: 'var(--gb-text-primary)', font: 'inherit', lineHeight: 1.5,
          fontFamily: 'var(--gb-font-sans)', resize,
        }}
        {...rest}
      />
    </motion.div>
  );
}
