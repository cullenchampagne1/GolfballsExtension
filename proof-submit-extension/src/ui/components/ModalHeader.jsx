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
  // Only wire the drag-handle ref + show the grab cursor when the
  // hosting panel actually supports dragging. A non-draggable modal
  // (centered, click-outside-to-close) shouldn't tease a grab affordance
  // that does nothing.
  const isDraggable = !!(panel && panel.draggable);

  // Inside a FloatingPanel that's draggable, the header IS the throw
  // handle. Throwable wires its pointer listeners to whatever DOM node
  // ends up in this ref; attaching it here makes the title bar the
  // only grabbable region (clicks on inner buttons short-circuit
  // Throwable's own interactive-element guard).
  return (
    <div
      ref={isDraggable ? panel.dragHandleRef : undefined}
      style={{
        padding: '14px 16px', flexShrink: 0,
        background: 'var(--gb-surface-2)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: isDraggable ? 'grab' : undefined,
        userSelect: isDraggable ? 'none' : undefined,
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
