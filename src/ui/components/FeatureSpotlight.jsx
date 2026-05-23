import React from 'react';
import { motion } from 'motion/react';
import { T } from '../shared.jsx';
import { Switch } from './Switch.jsx';
import { Tag } from './Tag.jsx';

/**
 * FeatureSpotlight — a toggle row with icon, name, description, and switch.
 * Glows when on. `experimental` uses amber styling.
 *
 * Props: on, icon, name, desc, onChange, tone 'brand'|'warning',
 *   experimental, size 'xs'|'sm'|'md'|'lg' (default 'md').
 *
 * `xs` keeps the full-line layout (icon tile + name/desc + switch) but
 * tightens vertical rhythm — for inline use inside editors where a full
 * sm/md row would over-dominate the form.
 */
const SIZES = {
  xs: { pad: 8,  box: 24, icon: 12, name: 11.5, desc: 10,   gap: 9,  sw: 'sm', radius: 'var(--gb-r-md)' },
  sm: { pad: 11, box: 30, icon: 15, name: 12.5, desc: 10.5, gap: 11, sw: 'sm', radius: 'var(--gb-r-lg)' },
  md: { pad: 14, box: 36, icon: 17, name: 13.5, desc: 11,   gap: 12, sw: 'md', radius: 'var(--gb-r-lg)' },
  lg: { pad: 16, box: 44, icon: 20, name: 14,   desc: 11.5, gap: 14, sw: 'lg', radius: 'var(--gb-r-lg)' },
};

export function FeatureSpotlight({ on, icon, name, desc, onChange, tone, experimental, size = 'md' }) {
  const s = SIZES[size] || SIZES.md;
  const effectiveTone = tone || (experimental ? 'warning' : 'brand');
  const fg = experimental ? 'var(--gb-warning)' : 'var(--gb-brand-label)';
  const bg = experimental ? 'var(--gb-warning-tint-soft)' : 'var(--gb-brand-tint-soft)';
  const bd = experimental ? 'var(--gb-warning-tint-border)' : 'var(--gb-brand-tint-border)';
  const tintMedium = experimental ? 'var(--gb-warning-tint-medium)' : 'var(--gb-brand-tint-medium)';

  return (
    <motion.div
      onClick={() => onChange?.(!on)}
      animate={{
        backgroundColor: on ? bg : 'var(--gb-surface-1)',
        borderColor: on ? bd : 'var(--gb-border-default)',
        boxShadow: on ? `0 0 0 4px ${bg}` : 'none',
      }}
      transition={T.base}
      style={{
        padding: s.pad,
        border: '1px solid',
        borderRadius: s.radius,
        display: 'flex', alignItems: 'center', gap: s.gap,
        cursor: 'pointer',
      }}
    >
      <motion.div
        animate={{
          backgroundColor: on ? tintMedium : 'var(--gb-fill-subtle)',
          color: on ? fg : 'var(--gb-text-muted)',
          borderColor: on ? bd : 'var(--gb-border-default)',
        }}
        transition={T.base}
        style={{
          width: s.box, height: s.box, borderRadius: 'var(--gb-r-md)', flexShrink: 0,
          border: '1px solid',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {icon && React.cloneElement(icon, { size: s.icon })}
      </motion.div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span style={{ fontSize: s.name, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{name}</span>
          {experimental && <Tag tone="warning" size="xs">EXPERIMENTAL</Tag>}
        </div>
        {desc && (
          <div style={{ fontSize: s.desc, color: 'var(--gb-text-tertiary)', marginTop: 3, lineHeight: 1.5 }}>
            {desc}
          </div>
        )}
      </div>

      <Switch on={on} size={s.sw} tone={effectiveTone} onChange={onChange} />
    </motion.div>
  );
}
