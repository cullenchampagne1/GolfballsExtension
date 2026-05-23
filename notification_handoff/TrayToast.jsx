import React, { useState } from 'react';
import { Dot } from './Dot.jsx';
import { I } from '../icons.jsx';

/**
 * TrayToast — a collapsed badge that expands into a list of notifications.
 * Lets users scan a batch without being interrupted one-by-one.
 *
 * Use for:  many notifications arriving in a short window.
 * Avoid:    a single message — collapsing one item adds friction.
 *
 * Required CSS (already in theme.css):
 *   @keyframes gb-toast-in-right
 *   @keyframes gb-pulse
 *
 * Props
 *   items      [{ tone, title, message, time }]
 *   onDismiss  () => void                    dismisses the whole tray
 *   size       'md' | 'sm'   default 'md'    ('sm' for narrow panels)
 */
const SIZES = {
  md: {
    closedPad: '7px 10px 7px 9px',
    badge: 18, badgeIcon: 11, badgeFont: 11.5,
    expWidth: 320,
    headPad: '10px 12px', headIcon: 12, headFont: 11.5,
    rowPad: '9px 12px', rowTitle: 11.5, rowMsg: 10.5, rowTime: 9.5,
    dot: 6, maxH: 220, close: 10,
  },
  sm: {
    closedPad: '5px 8px 5px 7px',
    badge: 15, badgeIcon: 9, badgeFont: 10.5,
    expWidth: 260,
    headPad: '7px 9px', headIcon: 10, headFont: 10.5,
    rowPad: '7px 9px', rowTitle: 10.5, rowMsg: 9.5, rowTime: 9,
    dot: 5, maxH: 180, close: 9,
  },
};

export function TrayToast({ items = [], onDismiss, size = 'md' }) {
  const [open, setOpen] = useState(false);
  const s = SIZES[size] || SIZES.md;

  return (
    <div style={{
      pointerEvents: 'auto',
      animation: 'gb-toast-in-right .35s cubic-bezier(.34,1.4,.64,1) both',
    }}>
      {!open ? (
        /* Collapsed pill */
        <div
          onClick={() => setOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: s.closedPad,
            background: 'var(--gb-surface-1)',
            border: '1px solid var(--gb-brand-tint-border)',
            borderRadius: 'var(--gb-r-pill)',
            boxShadow: 'var(--gb-shadow-popover)',
            cursor: 'pointer',
          }}
        >
          <div style={{
            position: 'relative',
            width: s.badge, height: s.badge, borderRadius: '50%',
            background: 'var(--gb-brand-tint-medium)',
            color: 'var(--gb-brand-label)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <I.alert size={s.badgeIcon} />
            <span style={{
              position: 'absolute', top: -2, right: -3,
              width: 5, height: 5, borderRadius: '50%',
              background: 'var(--gb-error)',
              boxShadow: '0 0 4px var(--gb-error)',
              animation: 'gb-pulse 1.2s ease-in-out infinite',
            }} />
          </div>
          <span style={{ fontSize: s.badgeFont, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>
            <b style={{ color: 'var(--gb-brand-label)' }}>{items.length}</b>{' '}new
          </span>
          <I.chevd size={s.badgeIcon} style={{ color: 'var(--gb-text-muted)' }} />
        </div>
      ) : (
        /* Expanded list */
        <div style={{
          width: s.expWidth,
          background: 'var(--gb-surface-1)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-lg)',
          boxShadow: 'var(--gb-shadow-popover)',
          overflow: 'hidden',
          animation: 'gb-toast-in-right .25s cubic-bezier(.34,1.4,.64,1) both',
        }}>
          <div style={{
            padding: s.headPad,
            display: 'flex', alignItems: 'center', gap: 9,
            borderBottom: '1px solid var(--gb-border-subtle)',
            background: 'var(--gb-fill-inverse-strong)',
          }}>
            <I.alert size={s.headIcon} style={{ color: 'var(--gb-brand-label)' }} />
            <div style={{ flex: 1, fontSize: s.headFont, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
              {items.length} notifications
            </div>
            <span onClick={() => setOpen(false)} style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex' }}>
              <I.chevd size={s.headIcon} style={{ transform: 'rotate(180deg)' }} />
            </span>
            <span onClick={onDismiss} style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex' }}>
              <I.close size={s.close} />
            </span>
          </div>
          <div style={{ maxHeight: s.maxH, overflow: 'auto' }}>
            {items.map((it, i) => (
              <div key={i} style={{
                padding: s.rowPad,
                borderBottom: i < items.length - 1 ? '1px solid var(--gb-border-subtle)' : 'none',
                display: 'flex', gap: 9, alignItems: 'flex-start',
              }}>
                <Dot tone={it.tone} glow size={s.dot} style={{ marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: s.rowTitle, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{it.title}</div>
                  <div style={{ fontSize: s.rowMsg, color: 'var(--gb-text-muted)', marginTop: 1 }}>{it.message}</div>
                </div>
                <span style={{ fontSize: s.rowTime, color: 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap' }}>{it.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
