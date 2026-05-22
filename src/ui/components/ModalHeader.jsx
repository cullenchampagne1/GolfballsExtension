import React, { useContext } from 'react';
import { sizeIcon, FloatingPanelContext } from '../shared.jsx';
import { I } from '../icons.jsx';
import { IconBtn } from './IconBtn.jsx';

/**
 * ModalHeader — icon tile + title/subtitle + optional right slot + close.
 *
 * Props: icon, title, subtitle, right, accent (default true), onClose.
 *
 * When rendered inside a FloatingPanel the header auto-wires itself: it
 * becomes the drag handle, and the close button falls back to the panel's
 * animated dismiss when no explicit `onClose` is given.
 */
export function ModalHeader({ icon, title, subtitle, right, accent = true, onClose }) {
  const panel = useContext(FloatingPanelContext);
  const handleClose = onClose || panel?.requestClose;

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
          background: accent ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
          border: '1px solid ' + (accent ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
          color: accent ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
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
