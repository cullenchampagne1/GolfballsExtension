import React from 'react';
import { Btn } from './Btn.jsx';
import { I } from '../icons.jsx';

/**
 * ActionToast — a card with an explicit CTA inside. Invites the user to act
 * on the success or warning the toast is reporting.
 *
 * Use for:  a success has happened and there is exactly one obvious follow-up.
 * Avoid:    when more than two actions are possible — use a modal.
 *
 * Required CSS (already in theme.css):
 *   @keyframes gb-toast-in-right
 *
 * Props
 *   tone       'brand' | 'success' | 'warning' | 'error'   default 'brand'
 *   title      string — bold headline
 *   message    string — sub-line, keep to ~12 words
 *   primary    string — CTA label
 *   secondary  string? — optional ghost button label
 *   onDismiss  () => void — also fires on either button (host overrides)
 *   size       'md' | 'sm'   default 'md'    ('sm' = 280px-wide, for narrow hosts)
 */
const SIZES = {
  md: { width: 360, padTop: '12px 12px 10px', topGap: 10, icon: 28, iconSvg: 13, padFoot: '6px 8px 8px', title: 12.5, msg: 11.5, close: 11, btn: 'sm', radius: 'var(--gb-r-lg)' },
  sm: { width: 280, padTop: '9px 9px 8px',    topGap: 8,  icon: 22, iconSvg: 11, padFoot: '5px 6px 6px', title: 11,   msg: 10.5, close: 10, btn: 'xs', radius: 'var(--gb-r-md)' },
};

const TONES = {
  brand:   { fg: 'var(--gb-brand-label)', bg: 'var(--gb-brand-tint-soft)',   bd: 'var(--gb-brand-tint-border)'   },
  success: { fg: 'var(--gb-success-fg)',  bg: 'var(--gb-success-tint-soft)', bd: 'var(--gb-success-tint-border)' },
  warning: { fg: 'var(--gb-warning-fg)',  bg: 'var(--gb-warning-tint-soft)', bd: 'var(--gb-warning-tint-border)' },
  error:   { fg: 'var(--gb-error-fg)',    bg: 'var(--gb-error-tint-soft)',   bd: 'var(--gb-error-tint-border)'   },
};

export function ActionToast({
  tone = 'brand', title, message, primary, secondary,
  // onPrimary fires when the user clicks the primary CTA; falls back
  // to onDismiss so existing call sites keep working. onSecondary
  // overrides the secondary button's default dismiss behavior.
  onPrimary, onSecondary, onDismiss,
  // icon override — pass a ReactNode (e.g. <I.bolt />, <I.alert />)
  // to swap the default check glyph. Stays inside the tone-tinted
  // icon tile so the visual rhythm matches.
  icon,
  size = 'md',
}) {
  const handlePrimary = () => {
    console.log('[ActionToast] handlePrimary called, onPrimary:', typeof onPrimary);
    if (onPrimary) onPrimary();
    onDismiss?.();
  };
  const handleSecondary = () => {
    if (onSecondary) onSecondary();
    onDismiss?.();
  };
  const s = SIZES[size] || SIZES.md;
  const t = TONES[tone] || TONES.brand;
  return (
    <div style={{
      pointerEvents: 'auto',
      width: s.width,
      background: 'var(--gb-surface-1)',
      border: `1px solid ${t.bd}`,
      borderRadius: s.radius,
      boxShadow: 'var(--gb-shadow-popover)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: s.padTop, display: 'flex', alignItems: 'flex-start', gap: s.topGap }}>
        <div style={{
          width: s.icon, height: s.icon, borderRadius: 'var(--gb-r-sm)',
          background: t.bg, color: t.fg,
          border: `1px solid ${t.bd}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{icon
          ? React.cloneElement(icon, { size: s.iconSvg })
          : <I.check size={s.iconSvg} />
        }</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: s.title, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{title}</div>
          <div style={{ fontSize: s.msg, color: 'var(--gb-text-tertiary)', marginTop: 2, lineHeight: 1.45 }}>{message}</div>
        </div>
        <span onClick={onDismiss} style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex', padding: 2 }}>
          <I.close size={s.close} />
        </span>
      </div>
      <div style={{
        display: 'flex', gap: 4, padding: s.padFoot,
        borderTop: '1px solid var(--gb-border-subtle)',
        background: t.bg,
      }}>
        {secondary && <Btn variant="ghost" size={s.btn} onClick={handleSecondary}>{secondary}</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="tinted" status={tone} size={s.btn} icon={<I.bolt />} onClick={handlePrimary}>{primary}</Btn>
      </div>
    </div>
  );
}
