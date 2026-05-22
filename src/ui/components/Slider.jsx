import React, { useCallback, useRef } from 'react';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const snap = (n, min, step) => min + Math.round((n - min) / step) * step;

/**
 * Slider — single-thumb range input.
 *
 * Props: value, min (0), max (100), step (1), unit, showValue (true),
 *   showRange (false), ticks (number[]), tone 'brand'|'warning',
 *   disabled, onChange(next).
 */
export function Slider({
  value = 0, min = 0, max = 100, step = 1, unit = '',
  showValue = true, showRange = false, ticks, tone = 'brand', disabled,
  onChange, style,
}) {
  const trackRef = useRef(null);
  const warn = tone === 'warning';
  const fill = warn ? 'var(--gb-warning)' : 'var(--gb-brand-label)';
  const pillBg = warn ? 'var(--gb-warning-tint-medium)' : 'var(--gb-brand-tint-medium)';
  const pillBd = warn ? 'var(--gb-warning-tint-border)' : 'var(--gb-brand-tint-border)';
  const pct = ((clamp(value, min, max) - min) / (max - min)) * 100;

  const valueFromX = useCallback((clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const ratio = clamp((clientX - r.left) / r.width, 0, 1);
    return clamp(snap(min + ratio * (max - min), min, step), min, max);
  }, [min, max, step]);

  const startDrag = (e) => {
    if (disabled) return;
    e.preventDefault();
    onChange?.(valueFromX(e.clientX));
    const move = (ev) => onChange?.(valueFromX(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: disabled ? 0.5 : 1, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          ref={trackRef}
          onPointerDown={startDrag}
          style={{
            flex: 1, position: 'relative', height: 18, display: 'flex', alignItems: 'center',
            cursor: disabled ? 'default' : 'pointer', touchAction: 'none',
          }}
        >
          <div style={{
            position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2,
            background: 'var(--gb-surface-3)', border: '1px solid var(--gb-border-subtle)',
          }} />
          <div style={{
            position: 'absolute', left: 0, width: `${pct}%`, height: 4, borderRadius: 2,
            background: fill, boxShadow: `0 0 8px color-mix(in srgb, ${fill} 45%, transparent)`,
          }} />
          {ticks && ticks.map((tk, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${((tk - min) / (max - min)) * 100}%`,
              width: 1, height: 8, top: 5, background: 'var(--gb-border-strong)', transform: 'translateX(-50%)',
            }} />
          ))}
          <div style={{
            position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)',
            width: 14, height: 14, borderRadius: '50%',
            background: 'var(--gb-surface-1)', border: `2px solid ${fill}`,
            boxShadow: 'var(--gb-focus-ring)', cursor: disabled ? 'default' : 'grab',
          }} />
        </div>
        {showValue && (
          <span style={{
            minWidth: 42, textAlign: 'right', fontSize: 11.5, fontWeight: 700,
            fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)',
            background: pillBg, border: `1px solid ${pillBd}`, borderRadius: 5, padding: '2px 7px',
          }}>{value}{unit}</span>
        )}
      </div>
      {showRange && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>
          <span>{min}{unit}</span>
          <span>{max}{unit}</span>
        </div>
      )}
    </div>
  );
}
