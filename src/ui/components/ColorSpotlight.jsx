import React, { useState } from 'react';
import { I } from '../icons.jsx';

/**
 * ColorSpotlight — full-height swatch + name + hex input + reset.
 *
 * The picked color is the card's own background-image gradient (solid for the
 * swatch column, transparent past it). A background is painted across the
 * element's whole box by the browser, so the color always fills top-to-bottom
 * — no flex-stretch or percentage-height child that can leave a sliver.
 *
 * Props: value, defaultValue, name, desc, varName, onChange,
 *   size 'sm'|'md'|'lg' (default 'md').
 */
const SIZES = {
  sm: { sw: 64,  pad: 11, name: 12,   varF: 9,   desc: 10.5, hexW: 84,  hexH: 26, min: 64 },
  md: { sw: 88,  pad: 14, name: 13.5, varF: 9.5, desc: 11,   hexW: 92,  hexH: 28, min: 80 },
  lg: { sw: 108, pad: 16, name: 15,   varF: 10,  desc: 11.5, hexW: 104, hexH: 30, min: 92 },
};

export function ColorSpotlight({ value, defaultValue, name, desc, varName, onChange, size = 'md' }) {
  const s = SIZES[size] || SIZES.md;
  const [inputValue, setInputValue] = useState(value);
  const modified = value !== defaultValue;

  React.useEffect(() => {
    setInputValue(value?.toUpperCase() || '');
  }, [value]);

  const handleInputChange = (e) => {
    let val = e.target.value.trim();
    setInputValue(val);
    if (!val.startsWith('#') && val.length > 0) val = '#' + val;
    if (/^#[0-9a-fA-F]{6}$/i.test(val)) onChange?.(val);
  };
  const handleInputBlur = () => setInputValue(value?.toUpperCase() || '');

  return (
    <div
      style={{
        position: 'relative',
        backgroundColor: 'var(--gb-surface-1)',
        backgroundImage: `linear-gradient(to right, ${value || 'transparent'} ${s.sw}px, transparent ${s.sw}px)`,
        border: '1px solid ' + (modified ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
        borderRadius: 'var(--gb-r-lg)',
        boxShadow: modified ? '0 0 0 4px var(--gb-brand-tint-soft)' : 'none',
        overflow: 'hidden',
        transition: 'border-color var(--gb-anim), box-shadow var(--gb-anim)',
      }}
    >
      {/* Clickable swatch region — sits over the colored part of the gradient. */}
      <label style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: s.sw, cursor: 'pointer' }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, cursor: 'pointer', border: 'none', padding: 0,
          }}
        />
        {modified && (
          <span style={{
            position: 'absolute', bottom: 6, right: 6,
            padding: '2px 6px', borderRadius: 99,
            background: 'rgba(0,0,0,.55)', color: '#fff',
            fontSize: 8.5, fontWeight: 800, letterSpacing: 0.6,
            textTransform: 'uppercase', backdropFilter: 'blur(4px)',
          }}>EDITED</span>
        )}
      </label>

      {/* Body — offset past the swatch column. */}
      <div style={{
        marginLeft: s.sw, minHeight: s.min, padding: s.pad,
        display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: s.name, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{name}</span>
          {varName && (
            <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: s.varF, color: 'var(--gb-text-ghost)' }}>
              {varName}
            </span>
          )}
        </div>
        {desc && (
          <div style={{ fontSize: s.desc, color: 'var(--gb-text-tertiary)', lineHeight: 1.5 }}>{desc}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
          <input
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            style={{
              width: s.hexW, height: s.hexH, padding: '0 9px',
              background: 'var(--gb-surface-2)',
              border: '1px solid var(--gb-border-default)',
              borderRadius: 'var(--gb-r-sm)',
              fontFamily: 'var(--gb-font-mono)', fontSize: 11, fontWeight: 600,
              color: 'var(--gb-text-secondary)', letterSpacing: 0.5, outline: 'none',
            }}
          />
          {modified && (
            <button
              onClick={() => onChange?.(defaultValue)}
              style={{
                padding: '4px 9px', height: s.hexH, borderRadius: 'var(--gb-r-sm)',
                background: 'transparent', border: '1px solid var(--gb-border-default)',
                color: 'var(--gb-text-muted)', fontSize: 10.5, fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              <I.refresh size={10} /> Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
