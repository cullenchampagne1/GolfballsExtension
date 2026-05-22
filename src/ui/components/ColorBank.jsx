import React from 'react';
import { motion } from 'motion/react';
import { T } from '../shared.jsx';
import { Btn } from './Btn.jsx';
import { I } from '../icons.jsx';

/**
 * ColorBank — A group of related colors with master reset.
 *
 * Props:
 *   title: string
 *   palette: { [key: string]: string } — current color values
 *   defaults: { [key: string]: string } — default color values
 *   onChange: (newPalette: { [key: string]: string }) => void
 */
export function ColorBank({ title, palette, defaults, onChange }) {
  const items = Object.entries(palette);
  const modifiedCount = items.filter(([k, v]) => v !== defaults[k]).length;

  return (
    <div style={{
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-lg)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <motion.div
        animate={{
          backgroundColor: modifiedCount > 0 ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-2)',
        }}
        transition={T.base}
        style={{
          padding: '13px 14px',
          borderBottom: '1px solid var(--gb-border-subtle)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -0.1 }}>
            {title}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 2, fontFamily: 'var(--gb-font-mono)' }}>
            {items.length} colors
            {modifiedCount > 0 && (
              <span style={{ marginLeft: 6, color: 'var(--gb-brand-label)' }}>
                · {modifiedCount} edited
              </span>
            )}
          </div>
        </div>

        {/* Stacked mini swatches */}
        <div style={{ display: 'flex', marginRight: 6 }}>
          {items.slice(0, 5).map(([k, v], i) => (
            <div
              key={k}
              style={{
                width: 18, height: 18, borderRadius: '50%',
                background: v,
                border: '2px solid var(--gb-surface-1)',
                marginLeft: i === 0 ? 0 : -7,
                zIndex: items.length - i,
              }}
            />
          ))}
        </div>

        {modifiedCount > 0 && (
          <Btn
            variant="ghost"
            size="sm"
            icon={<I.refresh />}
            onClick={() => onChange?.(defaults)}
          >
            Reset all
          </Btn>
        )}
      </motion.div>

      {/* Color rows */}
      <div style={{ padding: 4 }}>
        {items.map(([k, v], i) => {
          const def = defaults[k];
          const mod = v !== def;

          return (
            <div
              key={k}
              style={{
                display: 'flex', alignItems: 'center', gap: 11,
                padding: '8px 10px',
                borderBottom: i < items.length - 1 ? '1px solid var(--gb-border-subtle)' : 'none',
                borderRadius: 'var(--gb-r-sm)',
              }}
            >
              {/* Swatch */}
              <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 'var(--gb-r-sm)',
                  background: v, border: '1px solid var(--gb-border-default)',
                }} />
                <input
                  type="color"
                  value={v}
                  onChange={(e) => onChange?.({ ...palette, [k]: e.target.value })}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                />
              </label>

              {/* Name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{k}</div>
              </div>

              {/* Hex value */}
              <span style={{
                fontFamily: 'var(--gb-font-mono)',
                fontSize: 10.5,
                color: 'var(--gb-text-tertiary)',
                letterSpacing: 0.4,
              }}>
                {v.toUpperCase()}
              </span>

              {/* Reset button */}
              {mod ? (
                <button
                  onClick={() => onChange?.({ ...palette, [k]: def })}
                  style={{
                    width: 22, height: 22, borderRadius: 5,
                    background: 'transparent', border: 'none',
                    color: 'var(--gb-text-muted)', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    padding: 0,
                  }}
                >
                  <I.refresh size={10} />
                </button>
              ) : (
                <span style={{ width: 22 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
