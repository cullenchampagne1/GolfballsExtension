import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { I } from '../icons.jsx';
import { ColorPickerPopover } from './ColorPicker.jsx';

/**
 * ColorSpotlight — single-row swatch + name + hex input + reset.
 *
 * Compact list-row layout that matches FeatureSpotlight / CollapsibleSection
 * vertical rhythm. Older versions stacked name → desc → hex input on three
 * lines with a full-bleed swatch column; that ate too much vertical space
 * when stacking 8 theme colors. New layout: square swatch on the left, name
 * (+ optional desc) flex-filling the middle, hex input + reset pushed to
 * the right. Clicking the swatch opens the DS color picker popover.
 *
 * Props: value, defaultValue, name, desc, varName, onChange,
 *   size 'sm'|'md'|'lg' (default 'md').
 */
const SIZES = {
  sm: { sw: 28, pad: 8,  name: 11.5, varF: 9,    desc: 10,   hexW: 78,  hexH: 24, gap: 8  },
  md: { sw: 32, pad: 10, name: 12.5, varF: 9.5,  desc: 10.5, hexW: 88,  hexH: 26, gap: 10 },
  lg: { sw: 36, pad: 12, name: 13.5, varF: 10,   desc: 11,   hexW: 96,  hexH: 28, gap: 12 },
};

export function ColorSpotlight({ value, defaultValue, name, desc, varName, onChange, size = 'md' }) {
  const s = SIZES[size] || SIZES.md;
  const [inputValue, setInputValue] = useState(value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const swatchRef = useRef(null);
  const modified = value !== defaultValue;

  useEffect(() => {
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
        background: 'var(--gb-surface-1)',
        border: '1px solid ' + (modified ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
        borderRadius: 'var(--gb-r-md)',
        boxShadow: modified ? '0 0 0 3px var(--gb-brand-tint-soft)' : 'none',
        padding: s.pad,
        display: 'flex', alignItems: 'center', gap: s.gap,
        overflow: 'visible',
        transition: 'border-color var(--gb-anim), box-shadow var(--gb-anim)',
      }}
    >
      {/* Square swatch — opens the design-system color popover. */}
      <button
        ref={swatchRef}
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        style={{
          width: s.sw, height: s.sw, flexShrink: 0,
          padding: 0, cursor: 'pointer',
          background: value || 'transparent',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-sm)',
          position: 'relative',
        }}
      >
        {modified && (
          <span style={{
            position: 'absolute', bottom: -3, right: -3,
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--gb-brand-label)',
            border: '2px solid var(--gb-surface-1)',
          }} />
        )}
      </button>

      {/* Popover anchored to the swatch. */}
      <AnimatePresence>
        {pickerOpen && (
          <ColorPickerPopover
            value={value || '#000000'}
            onChange={onChange}
            anchorRef={swatchRef}
            onClose={() => setPickerOpen(false)}
            align="left"
          />
        )}
      </AnimatePresence>

      {/* Name + optional desc on a single column. flex:1 pushes the hex
          input + reset to the right edge. minWidth:0 lets the desc
          ellipsis cleanly rather than blowing out the row. */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <span style={{
            fontSize: s.name, fontWeight: 600, color: 'var(--gb-text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{name}</span>
          {varName && (
            <span style={{
              fontFamily: 'var(--gb-font-mono)', fontSize: s.varF,
              color: 'var(--gb-text-ghost)', flexShrink: 0,
            }}>{varName}</span>
          )}
        </div>
        {desc && (
          <div style={{
            fontSize: s.desc, color: 'var(--gb-text-muted)', lineHeight: 1.4,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{desc}</div>
        )}
      </div>

      {/* Hex input — pushed right by flex:1 on the body. */}
      <input
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        style={{
          width: s.hexW, height: s.hexH, padding: '0 9px', flexShrink: 0,
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
            width: s.hexH, height: s.hexH, flexShrink: 0, padding: 0,
            borderRadius: 'var(--gb-r-sm)',
            background: 'transparent', border: '1px solid var(--gb-border-default)',
            color: 'var(--gb-text-muted)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <I.refresh size={11} />
        </button>
      )}
    </div>
  );
}
