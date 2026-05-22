import React, { useContext } from 'react';
import { sizeIcon, FloatingPanelContext } from '../shared.jsx';
import { I } from '../icons.jsx';
import { IconBtn } from './IconBtn.jsx';

/* Icon-tile tone presets. `brand` and `neutral` cover the old
   `accent: true|false` flag; `warning` is for cautionary modals (e.g.
   SmartModal's smart-options bolt). */
const TONES = {
  brand:   { bg: 'var(--gb-brand-tint-medium)',   bd: 'var(--gb-brand-tint-border)',   fg: 'var(--gb-brand-label)' },
  warning: { bg: 'var(--gb-warning-tint-medium)', bd: 'var(--gb-warning-tint-border)', fg: 'var(--gb-warning-fg)' },
  neutral: { bg: 'var(--gb-fill-subtle)',         bd: 'var(--gb-border-default)',      fg: 'var(--gb-text-tertiary)' },
};

/**
 * ModalHeader — icon tile + title/subtitle + optional right slot + close.
 *
 * Props: icon, title, subtitle, right,
 *   tone 'brand' (default) | 'warning' | 'neutral',
 *   accent (legacy, default true → 'brand'; false → 'neutral'),
 *   onClose.
 *
 * When rendered inside a FloatingPanel the header auto-wires itself: it
 * becomes the drag handle, and the close button falls back to the panel's
 * animated dismiss when no explicit `onClose` is given.
 */
export function ModalHeader({ icon, title, subtitle, right, tone, accent = true, onClose }) {
  const panel = useContext(FloatingPanelContext);
  const handleClose = onClose || panel?.requestClose;
  const t = TONES[tone || (accent ? 'brand' : 'neutral')] || TONES.brand;

  // Inside a FloatingPanel, dragging starts from the header — but not when
  // the pointer goes down on a button (the close control).
  const startDrag = panel
    ? (e) => { if (!e.target.closest('button')) panel.dragControls.start(e); }
    : undefined;

  return (
    <div
      onPointerDown={startDrag}
      style={{
        padding: '14px 16px', flexShrink: 0,
        background: 'var(--gb-surface-2)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: panel ? 'grab' : undefined,
        userSelect: panel ? 'none' : undefined,
      }}
    >
      {icon && (
        <div style={{
          width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0,
          background: t.bg, border: `1px solid ${t.bd}`, color: t.fg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {sizeIcon(icon, 15)}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)',
          letterSpacing: -0.1, lineHeight: 1.2,
        }}>{title}</div>
        {subtitle && (
          <div style={{
            fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2, fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{subtitle}</div>
        )}
      </div>
      {right}
      {handleClose && <IconBtn size="sm" icon={<I.close />} onClick={handleClose} />}
    </div>
  );
}
