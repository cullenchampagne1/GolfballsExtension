import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { T } from '../shared.jsx';
import { Switch } from './Switch.jsx';
import { Dot } from './Dot.jsx';

/**
 * ExpandableFeature — a toggle whose header reveals a collapsible
 * sub-settings body when on. For nested config (Power Automate URL,
 * Developer test console). Sized to match the design reference.
 *
 * Props: on, onChange, name, desc, icon, tone 'brand'|'warning',
 *   size 'sm'|'md'|'lg' (default 'md'), defaultExpanded, children.
 */
const SIZES = {
  sm: { pad: 11, box: 30, icon: 15, name: 12.5, desc: 10.5, gap: 11, sw: 'sm', body: 12 },
  md: { pad: 14, box: 36, icon: 17, name: 13.5, desc: 11,   gap: 12, sw: 'md', body: 14 },
  lg: { pad: 16, box: 44, icon: 20, name: 14,   desc: 11.5, gap: 14, sw: 'lg', body: 16 },
};

export function ExpandableFeature({
  on, onChange, name, desc, icon, tone = 'brand', size = 'md',
  children, defaultExpanded = true,
}) {
  const s = SIZES[size] || SIZES.md;
  const palette = tone === 'warning'
    ? { fg: 'var(--gb-warning-fg)', tint: 'var(--gb-warning-tint-soft)', tintM: 'var(--gb-warning-tint-medium)', bd: 'var(--gb-warning-tint-border)' }
    : { fg: 'var(--gb-brand-label)', tint: 'var(--gb-brand-tint-soft)', tintM: 'var(--gb-brand-tint-medium)', bd: 'var(--gb-brand-tint-border)' };

  const expanded = on && defaultExpanded !== false;

  return (
    <motion.div
      animate={{
        backgroundColor: on ? palette.tint : 'var(--gb-surface-1)',
        borderColor: on ? palette.bd : 'var(--gb-border-default)',
        boxShadow: on ? `0 0 0 4px ${palette.tint}` : 'none',
      }}
      transition={T.base}
      style={{
        border: '1px solid',
        borderRadius: 'var(--gb-r-lg)',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={() => onChange?.(!on)}
        style={{
          padding: s.pad,
          display: 'flex', alignItems: 'center', gap: s.gap,
          cursor: 'pointer',
          borderBottom: expanded ? `1px solid ${palette.bd}` : '1px solid transparent',
        }}
      >
        {icon && (
          <motion.div
            animate={{
              backgroundColor: on ? palette.tintM : 'var(--gb-fill-subtle)',
              color: on ? palette.fg : 'var(--gb-text-muted)',
              borderColor: on ? palette.bd : 'var(--gb-border-default)',
            }}
            transition={T.base}
            style={{
              width: s.box, height: s.box, borderRadius: 'var(--gb-r-md)', flexShrink: 0,
              border: '1px solid',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {React.cloneElement(icon, { size: s.icon })}
          </motion.div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <motion.span
              animate={{ color: on ? palette.fg : 'var(--gb-text-primary)' }}
              transition={T.base}
              style={{ fontSize: s.name, fontWeight: 700 }}
            >
              {name}
            </motion.span>
            {on && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 9.5, fontWeight: 700, color: palette.fg,
                textTransform: 'uppercase', letterSpacing: 0.6,
              }}>
                <Dot tone={tone} glow size={5} /> ACTIVE
              </span>
            )}
          </div>
          {desc && (
            <motion.div
              animate={{ color: on ? palette.fg : 'var(--gb-text-tertiary)', opacity: on ? 0.75 : 1 }}
              transition={T.base}
              style={{ fontSize: s.desc, marginTop: 3, lineHeight: 1.5 }}
            >
              {desc}
            </motion.div>
          )}
        </div>

        <Switch on={on} size={s.sw} tone={tone} onChange={onChange} />
      </div>

      {/* Collapsible body — real height transition (not the toast keyframe). */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={T.base}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: s.body, background: 'var(--gb-fill-inverse-soft)' }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
