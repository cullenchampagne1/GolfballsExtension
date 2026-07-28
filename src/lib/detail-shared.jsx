/**
 * Shared CRM detail-page primitives, navigation, formatting, and activity panels.
 *
 * Contact, account, and opportunity surfaces intentionally import this module
 * so fixes to the common design system and CRM behavior stay in one place.
 */
import React, { useState, useEffect, useRef } from 'react';
import { THEME_VARIANTS, loadTheme, saveTheme, applyTheme } from '../lib/theme.js';
import { queryIndexed } from '../lib/crmIndex.js';
import { isChatTranscript } from './parseChat.js';

export const Icon = ({ size = 14, sw = 1.8, children, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0, ...style }}>{children}</svg>
);

export const I = {
  search:  (p) => <Icon {...p}><circle cx="11" cy="11" r="7.5"/><path d="M20.5 20.5L17 17"/></Icon>,
  edit:    (p) => <Icon {...p}><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>,
  phone:   (p) => <Icon {...p}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.72 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0122 16.92z"/></Icon>,
  mail:    (p) => <Icon {...p}><path d="M3 8l8.5 5.5a2 2 0 002 0L22 8"/><path d="M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></Icon>,
  pin:     (p) => <Icon {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></Icon>,
  linkedin:(p) => <Icon {...p} sw={1.6}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7.5v.01M12 17v-4.5a2.5 2.5 0 015 0V17M12 10v7"/></Icon>,
  ext:     (p) => <Icon {...p}><path d="M15 3h6v6M10 14L21 3M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5"/></Icon>,
  more:    (p) => <Icon {...p}><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></Icon>,
  chevd:   (p) => <Icon {...p} sw={2}><path d="M6 9l6 6 6-6"/></Icon>,
  chevr:   (p) => <Icon {...p} sw={2}><path d="M9 6l6 6-6 6"/></Icon>,
  plus:    (p) => <Icon {...p} sw={2.2}><path d="M12 5v14M5 12h14"/></Icon>,
  check:   (p) => <Icon {...p} sw={2.4}><path d="M20 6L9 17l-5-5"/></Icon>,
  close:   (p) => <Icon {...p} sw={2}><path d="M18 6L6 18M6 6l12 12"/></Icon>,
  send:    (p) => <Icon {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></Icon>,
  bolt:    (p) => <Icon {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></Icon>,
  refresh: (p) => <Icon {...p}><path d="M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15"/></Icon>,
  filter:  (p) => <Icon {...p}><path d="M22 3H2l8 9.5V19l4 2v-8.5z"/></Icon>,
  download:(p) => <Icon {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></Icon>,
  clock:   (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>,
  inbox:   (p) => <Icon {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13a2 2 0 011.79 1.11l3.21 6.39M.5 12.5L4 6"/></Icon>,
  cog:     (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.34 1.85l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.85-.34 1.7 1.7 0 00-1 1.55V21a2 2 0 01-4 0v-.09A1.7 1.7 0 009 19.4a1.7 1.7 0 00-1.85.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.85 1.7 1.7 0 00-1.55-1H3a2 2 0 010-4h.09A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.34-1.85l-.06-.06A2 2 0 117.03 4.26l.06.06a1.7 1.7 0 001.85.34H9a1.7 1.7 0 001-1.55V3a2 2 0 014 0v.09a1.7 1.7 0 001 1.55 1.7 1.7 0 001.85-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.85V9a1.7 1.7 0 001.55 1H21a2 2 0 010 4h-.09a1.7 1.7 0 00-1.55 1z"/></Icon>,
  user:    (p) => <Icon {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></Icon>,
  briefcase:(p)=> <Icon {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></Icon>,
  cart:    (p) => <Icon {...p}><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6"/></Icon>,
  case:    (p) => <Icon {...p}><path d="M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8v.5z"/></Icon>,
  task:    (p) => <Icon {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M9 11l3 3 5-5"/></Icon>,
  target:  (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></Icon>,
  spark:   (p) => <Icon {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></Icon>,
  fire:    (p) => <Icon {...p}><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.07-2.59.55-5 1.5-6 .25-.25 1-1 1-1l1 2c0 4 3 5 3 8a5 5 0 11-10 0c0-1.42.34-2.65 1-3.5L8.5 14.5z"/></Icon>,
  shield:  (p) => <Icon {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Icon>,
  star:    (p) => <Icon {...p}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></Icon>,
  ban:     (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/></Icon>,
  arch:    (p) => <Icon {...p}><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></Icon>,
  copy:    (p) => <Icon {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></Icon>,
  flag:    (p) => <Icon {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></Icon>,
  zap:     (p) => <Icon {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Icon>,
  history: (p) => <Icon {...p}><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 106 5.3L3 8"/><path d="M12 7v5l4 2"/></Icon>,
  note:    (p) => <Icon {...p}><path d="M14 3v4a1 1 0 001 1h4"/><path d="M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"/><path d="M9 13h6M9 17h4"/></Icon>,
  trash:   (p) => <Icon {...p}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></Icon>,
  chat:    (p) => <Icon {...p}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></Icon>,
  camera:  (p) => <Icon {...p}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></Icon>,
};

/**
 * Normalize the CRM's loose activity category and subject text into the small
 * visual taxonomy shared by all detail pages. Local-only notes are kept
 * distinct so users can tell they are not server activity records.
 */
export function activityType(activity = {}) {
  if (activity.localNote) return { key: 'note', icon: <I.note />, tone: 'warning' };
  const signal = `${activity.category || ''} ${activity.subject || ''}`.toLowerCase();
  if (/\b(image|proof|logo|art file|mockup)\b/.test(signal)) return { key: 'image', icon: <I.camera />, tone: 'error' };
  if (/\b(email|e-mail)\b|email sent|followup email/.test(signal)) return { key: 'email', icon: <I.mail />, tone: 'warning' };
  if (/\b(call|phone|voicemail|vm)\b|left a message/.test(signal)) return { key: 'call', icon: <I.phone />, tone: 'success' };
  if (/\b(chat|case|support)\b/.test(signal) || isChatTranscript(activity.subject || activity.description || '')) return { key: 'chat', icon: <I.chat />, tone: 'success' };
  if (/\bnote\b|logged a note|comment/.test(signal)) return { key: 'note', icon: <I.note />, tone: 'brand' };
  return { key: 'workflow', icon: <I.cog />, tone: 'info' };
}

/* Hover states across the detail primitives are CSS `:hover` classes (see
   UI_CSS), NOT JS mouseenter state. JS hover setState re-rendered every
   button/card/row the pointer crossed, which stuttered scrolling on older
   hardware. Inline styles win over stylesheet rules, so the hover rules in
   UI_CSS carry !important. */
export function Btn({ variant = 'secondary', size = 'md', icon, iconRight, children, full, status, disabled, style, onClick, onContextMenu, title }) {
  const tint = {
    brand:   { fg: 'var(--gb-brand-label)', bg: 'var(--gb-brand-tint-medium)', bd: 'var(--gb-brand-tint-border)' },
    error:   { fg: 'var(--gb-error-fg)',    bg: 'var(--gb-error-tint-medium)', bd: 'var(--gb-error-tint-border)' },
    warning: { fg: 'var(--gb-warning-fg)',  bg: 'var(--gb-warning-tint-medium)',bd: 'var(--gb-warning-tint-border)' },
    info:    { fg: 'var(--gb-info-fg)',     bg: 'var(--gb-info-tint-medium)',  bd: 'var(--gb-info-tint-border)' },
  }[status || 'brand'];
  const V = {
    primary:   { bg: 'linear-gradient(180deg, var(--gb-brand) 0%, var(--gb-brand-dark) 100%)', fg: 'var(--gb-text-on-brand)', bd: 'var(--gb-brand-border)' },
    secondary: { bg: 'var(--gb-fill-subtle)',  fg: 'var(--gb-text-secondary)', bd: 'var(--gb-border-default)' },
    tinted:    { bg: tint.bg, fg: tint.fg, bd: tint.bd },
    ghost:     { bg: 'transparent', fg: 'var(--gb-text-tertiary)', bd: 'transparent' },
    danger:    { bg: 'var(--gb-error-tint-medium)', fg: 'var(--gb-error-fg)', bd: 'var(--gb-error-tint-border)' },
  }[variant];
  const S = {
    xs: { h: 22, px: 8,  fs: 10.5, gap: 4, ic: 10 },
    sm: { h: 26, px: 10, fs: 11,   gap: 5, ic: 11 },
    md: { h: 30, px: 11, fs: 12,   gap: 6, ic: 12 },
    lg: { h: 36, px: 14, fs: 13,   gap: 7, ic: 13 },
  }[size];
  // primary's gradient background can't be transitioned without flashing —
  // skip background in its transition (gradient↔gradient swaps cleanly).
  const animBg = variant !== 'primary';
  const cls = 'gb-btn-' + variant + (variant === 'tinted' ? '-' + (status || 'brand') : '');
  return (
    <button onClick={onClick} disabled={disabled} onContextMenu={onContextMenu} title={title}
      className={cls}
      style={{
        ...ARMOR,
        background: V.bg, color: V.fg, border: `1px solid ${V.bd}`,
        height: S.h, padding: `0 ${S.px}px`, fontSize: S.fs, gap: S.gap,
        fontFamily: 'var(--gb-font-sans)', fontWeight: 600, letterSpacing: -.05,
        borderRadius: 'var(--gb-r-md)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? .5 : 1, whiteSpace: 'nowrap',
        width: full ? '100%' : undefined,
        transition: (animBg ? 'background-color var(--gb-anim), ' : '') + 'border-color var(--gb-anim), color var(--gb-anim), box-shadow var(--gb-anim)', flexShrink: 0,
        ...style,
      }}>
      {icon && React.cloneElement(icon, { size: S.ic })}
      {children}
      {iconRight && React.cloneElement(iconRight, { size: S.ic })}
    </button>
  );
}

export function IconBtn({ icon, size = 'md', danger, ghost, active, style, onClick, title }) {
  const px = { xs: 22, sm: 26, md: 30, lg: 36 }[size];
  const ic = { xs: 11, sm: 12, md: 14, lg: 16 }[size];
  const pal = danger
    ? { bg: 'var(--gb-error-tint-medium)', fg: 'var(--gb-error-fg)', bd: 'var(--gb-error-tint-border)' }
    : active
    ? { bg: 'var(--gb-brand-tint-medium)', fg: 'var(--gb-brand-label)', bd: 'var(--gb-brand-tint-border)' }
    : ghost
    ? { bg: 'transparent', fg: 'var(--gb-text-tertiary)', bd: 'transparent' }
    : { bg: 'var(--gb-fill-subtle)', fg: 'var(--gb-text-tertiary)', bd: 'var(--gb-border-default)' };
  const cls = danger ? 'gb-ibtn-danger' : active ? '' : ghost ? 'gb-ibtn-ghost' : 'gb-ibtn-default';
  return (
    <button title={title} onClick={onClick} className={cls}
      style={{
        ...ARMOR,
        width: px, height: px, borderRadius: 'var(--gb-r-sm)',
        background: pal.bg, color: pal.fg, border: `1px solid ${pal.bd}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0, padding: 0,
        transition: 'all var(--gb-anim)', ...style,
      }}>
      {React.cloneElement(icon, { size: ic })}
    </button>
  );
}

export function Tag({ children, tone = 'neutral', size = 'md', icon, style }) {
  const tones = {
    neutral: { fg: 'var(--gb-text-tertiary)', bg: 'var(--gb-fill-subtle)',         bd: 'var(--gb-border-default)' },
    brand:   { fg: 'var(--gb-brand-label)',   bg: 'var(--gb-brand-tint-medium)',  bd: 'var(--gb-brand-tint-border)' },
    error:   { fg: 'var(--gb-error-fg)',      bg: 'var(--gb-error-tint-medium)',  bd: 'var(--gb-error-tint-border)' },
    warning: { fg: 'var(--gb-warning-fg)',    bg: 'var(--gb-warning-tint-medium)',bd: 'var(--gb-warning-tint-border)' },
    success: { fg: 'var(--gb-success-fg)',    bg: 'var(--gb-success-tint-medium)',bd: 'var(--gb-success-tint-border)' },
    info:    { fg: 'var(--gb-info-fg)',       bg: 'var(--gb-info-tint-medium)',   bd: 'var(--gb-info-tint-border)' },
  };
  const t = tones[tone];
  const S = {
    xs: { fs: 9,    p: '1px 5px', gap: 3, ic: 8 },
    sm: { fs: 9.5,  p: '1px 6px', gap: 4, ic: 9 },
    md: { fs: 10.5, p: '2px 7px', gap: 4, ic: 10 },
    lg: { fs: 11,   p: '3px 9px', gap: 5, ic: 11 },
  }[size];
  return (
    <span style={{
      ...ARMOR,
      color: t.fg, background: t.bg, border: `1px solid ${t.bd}`,
      fontWeight: 700, letterSpacing: .3, textTransform: 'uppercase',
      fontFamily: 'var(--gb-font-sans)',
      fontSize: S.fs, padding: S.p, borderRadius: 5, gap: S.gap,
      display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', lineHeight: 1.5,
      ...style,
    }}>
      {icon && React.cloneElement(icon, { size: S.ic })}
      {children}
    </span>
  );
}

export function Dot({ tone = 'brand', size = 6, glow }) {
  const c = {
    brand: 'var(--gb-brand-label)', error: 'var(--gb-error)', warning: 'var(--gb-warning)',
    success: 'var(--gb-success)', info: 'var(--gb-info)', muted: 'var(--gb-text-muted)',
  }[tone];
  return (
    <span style={{
      ...ARMOR,
      width: size, height: size, borderRadius: '50%', background: c, flexShrink: 0,
      display: 'inline-block', boxShadow: glow ? `0 0 ${size}px ${c}` : 'none',
    }} />
  );
}

export function Card({ children, style, pad = 0, hover, onClick, className }) {
  return (
    <div onClick={onClick} className={(hover ? 'gb-card-hover ' : '') + (className || '')}
      style={{
        ...ARMOR,
        // reset boundary: re-establish inherited basics for descendants
        fontFamily: 'var(--gb-font-sans)', color: 'var(--gb-text-secondary)',
        background: 'var(--gb-surface-1)',
        border: '1px solid var(--gb-border-subtle)',
        borderRadius: 'var(--gb-r-lg)',
        padding: pad, overflow: 'hidden',
        transition: 'all var(--gb-anim)',
        ...(onClick ? { cursor: 'pointer' } : null),
        ...style,
      }}>{children}</div>
  );
}

export function SectionTitle({ icon, title, count, right, sub }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '14px 18px',
      borderBottom: '1px solid var(--gb-border-subtle)',
    }}>
      {icon && (
        <span style={{
          width: 24, height: 24, borderRadius: 6,
          background: 'var(--gb-fill-subtle)',
          color: 'var(--gb-text-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--gb-border-subtle)',
        }}>{React.cloneElement(icon, { size: 13 })}</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>{title}</span>
          {count != null && (
            <span style={{ fontSize: 11, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)', fontWeight: 500 }}>{count}</span>
          )}
        </div>
        {sub && <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function KV({ label, children, mono, copyable, link, action }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (typeof children === 'string') {
      navigator.clipboard?.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12,
      padding: '7px 0', borderBottom: '1px dashed var(--gb-border-subtle)',
      alignItems: 'center', minHeight: 28,
    }}>
      <span style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 12, color: link ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
        fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)',
        fontWeight: link ? 600 : 500,
        display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(children || children === 0) ? children : <span style={{ color: 'var(--gb-text-ghost)', fontStyle: 'italic' }}>—</span>}
        </span>
        {copyable && children && (
          <IconBtn size="xs" ghost
            icon={copied ? <I.check /> : <I.copy />}
            onClick={copy} title="Copy" />
        )}
        {action}
      </span>
    </div>
  );
}

export const DataCtx = React.createContext(null);

export const useD = () => React.useContext(DataCtx);

/**
 * Keeps a failed CRM takeover visible without logging record data or a full
 * component stack. Each entry supplies a human-readable surface label.
 */
export class DetailErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
  }

  render() {
    if (!this.state.error) return this.props.children;
    const label = this.props.label || 'CRM detail page';
    const message = String((this.state.error && this.state.error.message) || this.state.error);
    return (
      <div style={{
        padding: 24,
        height: '100%',
        overflow: 'auto',
        background: 'var(--gb-surface-deep, #0a0b0c)',
        color: 'var(--gb-error-fg, #e25a5a)',
        fontFamily: 'var(--gb-font-mono, monospace)',
        fontSize: 12,
        whiteSpace: 'pre-wrap',
      }}>
        {`${label} failed to render:\n\n${message}`}
      </div>
    );
  }
}

export const DASH = '—';

export function isEmpty(v) { return v === null || v === undefined || v === ''; }

export function txt(v) { return isEmpty(v) ? null : String(v); }

export function num(v) { return typeof v === 'number' && !isNaN(v) ? v : null; }

export function fmt$(n) {
  var v = num(n);
  if (v === null) return DASH;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function fmtDate(v) {
  var d = toDate(v);
  if (!d) return DASH;
  return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
}

export function fmtDateTime(v) {
  var d = toDate(v);
  if (!d) return DASH;
  var h = d.getHours(), m = d.getMinutes();
  var ap = h >= 12 ? 'PM' : 'AM';
  var hh = h % 12; if (hh === 0) hh = 12;
  var mm = m < 10 ? '0' + m : '' + m;
  return fmtDate(v) + ' ' + hh + ':' + mm + ' ' + ap;
}

export function fmtBytes(n) {
  var v = num(n);
  if (v === null) return DASH;
  if (v < 1024) return v + ' B';
  return Math.round(v / 1024) + ' KB';
}

export function daysAgo(v) {
  var d = toDate(v);
  if (!d) return null;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
}

export function yearsSince(v) {
  var d = toDate(v);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000));
}

export function initials(first, last) {
  var a = (first || '').trim(), b = (last || '').trim();
  var s = (a[0] || '') + (b[0] || '');
  return s ? s.toUpperCase() : '?';
}

export function fullName(c) {
  return [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
}

export const PAGE_ZOOM = 1.375;

export const ARMOR = { boxSizing: 'border-box' };

/* Page-level stylesheet injected once by DetailPageFrame (inside the shadow
   tree). Holds every rule the detail primitives rely on: themed scrollbars,
   modal keyframes, and the CSS `:hover` states that replaced JS hover state.
   Inline styles beat stylesheet rules, so hover overrides carry !important. */
export const UI_CSS =
  '.gbcp-stat:hover {' +
  '  box-shadow: inset 0 0 0 1px var(--gb-brand-tint-border),' +
  '              inset 0 0 28px -10px var(--gb-brand-label);' +
  '}' +
  /* Thin themed scrollbar for the capped-height panel scroll areas. */
  '.gb-scroll::-webkit-scrollbar { width: 9px; height: 9px; }' +
  '.gb-scroll::-webkit-scrollbar-track { background: transparent; }' +
  '.gb-scroll::-webkit-scrollbar-thumb { background: var(--gb-border-default); border-radius: 99px; border: 2px solid transparent; background-clip: padding-box; }' +
  '.gb-scroll::-webkit-scrollbar-thumb:hover { background: var(--gb-border-strong); background-clip: padding-box; }' +
  '.gb-scroll { scrollbar-width: thin; scrollbar-color: var(--gb-border-default) transparent; }' +
  /* Confirmation pulse after an optimistic save — a brief brand ring/glow. */
  '@keyframes gb-saved-pulse {' +
  '  0% { box-shadow: 0 0 0 0 var(--gb-brand-tint-strong), inset 0 0 0 1px var(--gb-brand-tint-border); }' +
  '  100% { box-shadow: 0 0 0 0 transparent, inset 0 0 0 1px transparent; }' +
  '}' +
  '.gb-saved { animation: gb-saved-pulse .7s ease-out; }' +
  '@keyframes gb-pop-in { 0% { opacity: 0; transform: translateY(8px) scale(.985); } 100% { opacity: 1; transform: none; } }' +
  '@keyframes gb-pop-out { 0% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(6px) scale(.975); } }' +
  '@keyframes gb-backdrop-out { 0% { opacity: 1; } 100% { opacity: 0; } }' +
  /* strip the native number-spinner arrows (snooze "weeks", etc.) */
  'input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }' +
  'input[type=number] { -moz-appearance: textfield; }' +
  /* CSS hover states for the primitives (formerly JS mouseenter state). */
  '.gb-btn-primary:hover:not(:disabled) { background: linear-gradient(180deg, var(--gb-brand-label) 0%, var(--gb-brand) 100%) !important; }' +
  '.gb-btn-secondary:hover:not(:disabled) { background: var(--gb-fill-soft) !important; }' +
  '.gb-btn-ghost:hover:not(:disabled) { background: var(--gb-fill-subtle) !important; }' +
  '.gb-btn-danger:hover:not(:disabled) { background: var(--gb-error-tint-strong) !important; }' +
  '.gb-btn-tinted-brand:hover:not(:disabled) { background: var(--gb-brand-tint-strong) !important; }' +
  '.gb-btn-tinted-error:hover:not(:disabled) { background: var(--gb-error-tint-strong) !important; }' +
  '.gb-btn-tinted-warning:hover:not(:disabled) { background: var(--gb-warning-tint-strong) !important; }' +
  '.gb-btn-tinted-info:hover:not(:disabled) { background: var(--gb-info-tint-strong) !important; }' +
  '.gb-ibtn-default:hover { background: var(--gb-fill-soft) !important; }' +
  '.gb-ibtn-ghost:hover { background: var(--gb-fill-subtle) !important; }' +
  '.gb-ibtn-danger:hover { background: var(--gb-error-tint-strong) !important; }' +
  '.gb-card-hover:hover { border-color: var(--gb-border-default) !important; }' +
  '.gb-proof:hover { transform: translateY(-2px); box-shadow: 0 3px 8px rgba(0,0,0,.14); border-color: var(--gb-brand-tint-border) !important; }' +
  '.gb-actrow:hover { background: var(--gb-fill-faint) !important; }' +
  '.gb-actrow-del { opacity: 0; transition: opacity var(--gb-anim); }' +
  '.gb-actrow-note:hover .gb-actrow-del { opacity: 1; }';

export function ScrollArea({ max = 380, children, style }) {
  return (
    <div className="gb-scroll" style={{ maxHeight: max, overflowY: 'auto', overflowX: 'hidden', ...style }}>
      {children}
    </div>
  );
}

export function crmHref(pageId) {
  try { return new URL('Default.aspx?Page=' + pageId, window.location.href).href; }
  catch (e) { return 'Default.aspx?Page=' + pageId; }
}

export function crmGo(pageId) { try { window.location.assign(crmHref(pageId)); } catch (e) {} }

export function goUrl(url) { try { window.location.assign(url); } catch (e) {} }

export const BACK_KEY = '__gbBackTo';

export function recordBackTo(label) {
  try { window.sessionStorage.setItem(BACK_KEY, JSON.stringify({ href: window.location.href, label: label || '' })); } catch (e) {}
}

export function readBackTo() {
  try {
    const raw = window.sessionStorage.getItem(BACK_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && v.href && v.href === document.referrer) return v;
  } catch (e) {}
  return null;
}

export const THEME_SWATCH = {
  dark:     { a: '#8fce2e', s: '#0a0b0c' },
  midnight: { a: '#a3e030', s: '#16181d' },
  light:    { a: '#4d6b14', s: '#e6e7ea' },
  cream:    { a: '#5a7a14', s: '#e6dfd0' },
  nord:     { a: '#88c0d0', s: '#242933' },
  dracula:  { a: '#bd93f9', s: '#21222c' },
  rose:     { a: '#ebbcba', s: '#16141f' },
  tokyo:    { a: '#7aa2f7', s: '#16161e' },
};

export function ThemeSwatch({ id, size = 16 }) {
  const s = THEME_SWATCH[id] || THEME_SWATCH.dark;
  const dot = Math.round(size * 0.44);
  return (
    <span style={{
      width: size, height: size, borderRadius: 5, background: s.s,
      border: '1px solid var(--gb-border-default)', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}><span style={{ width: dot, height: dot, borderRadius: '50%', background: s.a }} /></span>
  );
}

export function ThemeSelector() {
  const [variant, setVariant] = useState(() => (typeof document !== 'undefined' && document.documentElement.dataset.theme) || 'dark');
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef(null);
  useEffect(() => { loadTheme().then((t) => setVariant(t.variant || 'dark')); }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const path = (e.composedPath && e.composedPath()) || [];
      if (ref.current && path.indexOf(ref.current) === -1) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey, true); };
  }, [open]);
  const pick = (v) => {
    setVariant(v); setOpen(false);
    loadTheme().then((cur) => { const next = { ...cur, variant: v }; applyTheme(next); saveTheme(next); });
  };
  const cur = THEME_VARIANTS.find((t) => t.id === variant) || THEME_VARIANTS[0];
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen((o) => !o)} title="Theme"
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, height: 28, padding: '0 9px',
          background: (open || hover) ? 'var(--gb-fill-soft)' : 'var(--gb-fill-subtle)',
          border: '1px solid ' + (open ? 'var(--gb-border-focus)' : 'var(--gb-border-default)'),
          borderRadius: 'var(--gb-r-md)', cursor: 'pointer', color: 'var(--gb-text-secondary)',
          fontFamily: 'var(--gb-font-sans)', fontSize: 11.5, fontWeight: 600,
          transition: 'all var(--gb-anim)', outline: 'none',
        }}>
        <ThemeSwatch id={cur.id} size={15} />
        <span>{cur.name}</span>
        <I.chevd size={11} style={{ color: 'var(--gb-text-muted)', transition: 'transform var(--gb-anim)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60,
          minWidth: 184, padding: 5,
          background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-lg)', boxShadow: 'var(--gb-shadow-popover)',
          display: 'flex', flexDirection: 'column', gap: 1,
          animation: 'gb-fade-slide var(--gb-anim) both',
        }}>
          {THEME_VARIANTS.map((t) => {
            const active = t.id === variant;
            return (
              <button key={t.id} onClick={() => pick(t.id)}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--gb-fill-subtle)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                  padding: '7px 9px', borderRadius: 'var(--gb-r-sm)', border: 0, cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'var(--gb-font-sans)', fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
                  background: active ? 'var(--gb-brand-tint-soft)' : 'transparent',
                  transition: 'background var(--gb-anim)',
                }}>
                <ThemeSwatch id={t.id} />
                <span style={{ flex: 1 }}>{t.name}</span>
                {active && <I.check size={12} sw={3} style={{ color: 'var(--gb-brand-label)' }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function accountHref(accId) {
  try { return new URL('Default.aspx?Page=271&accountID=' + accId, window.location.href).href; }
  catch (e) { return 'Default.aspx?Page=271&accountID=' + accId; }
}

export function oppHref(id) {
  try { return new URL('Default.aspx?Page=280&opportunityID=' + id, window.location.href).href; }
  catch (e) { return 'Default.aspx?Page=280&opportunityID=' + id; }
}

export const CRM_CHILD_PAGE = {
  'Dashboard': 261,
  'Search': 360,
  'My Recent History': 279,
  'Task List': 349,
  'Action Review': 286,
  'Blacklisted Emails': 262,
  'Recent Calls': 243,
  'Case Index': 369,
  'Create Contact': 269,
  'Open Lead': 245,
  'Opportunity': 280,
  'Opportunity Linking': 356,
  'Adjust Leader Board': 294,
};

export const TOP_PAGE = { dashboard: 18 };

export const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: <I.spark /> },
  { id: 'site',      label: 'Site',      icon: <I.cog />, children: [
    'Cart Load', 'Downloads', 'Subscription Management', 'Search Help',
    'Manage Users', 'Cart Email', 'View Promotions', 'New Testimonial',
    'Settings Manager', 'Order Screening', 'Special Project List', 'User Tasks',
  ]},
  { id: 'crm', label: 'CRM', icon: <I.user />, active: true, open: true, children: [
    { label: 'Dashboard' },
    { label: 'Search' },
    { label: 'Custom Rep Activity' },
    { label: 'My Recent History' },
    { label: 'Task List' },
    { label: 'Action Review' },
    { label: 'Blacklisted Emails' },
    { label: 'Recent Calls' },
    { label: 'Case Index' },
    { label: 'Create Contact' },
    { label: 'Open Lead' },
    { label: 'Opportunity' },
    { label: 'Opportunity Linking' },
    { label: 'Adjust Leader Board' },
    { label: '__CURRENT__', current: true },
  ]},
  { id: 'orders',   label: 'Orders',   icon: <I.cart />, children: [
    'Index', 'Items - OOS', 'Items - Pick Pack OOS', 'Customer Search',
    'Create Personalization Barcode', 'Priority By Department', 'Create RMA', 'Returns',
  ]},
  { id: 'reports',  label: 'Reports',  icon: <I.history />, children: [
    'Sales Report', 'Items Sold', 'Sales Report List', 'Sales Trend MTD',
    'Sales Trend YTD', 'Production', 'Dashboards', 'Top Customers',
    'Dozen A Day', 'Custom Logo Orders', 'Custom User Cohorts',
  ]},
  { id: 'products', label: 'Products', icon: <I.briefcase />, children: [
    'Shipping Quote', 'Answer Questions', 'MyJoy Sku Audit', 'Create', 'Edit',
    'Image Admin', 'Markdown Clearance', 'Solr', 'Add Weight to A Sku',
    'Manage Keyword HTML', 'YouTube List', 'UsedGolfballs.com',
  ]},
  { id: 'merch',    label: 'Merchandising', icon: <I.star /> },
  { id: 'mailers',  label: 'Mailers',  icon: <I.send />, children: [
    'Mailer List', 'OneToOne List', 'Report - Campaigns', 'Report - Mailers', 'Service Control Panel',
  ]},
  { id: 'logo',     label: 'Custom Logo', icon: <I.bolt /> },
  { id: 'prod',     label: 'Production', icon: <I.fire /> },
  { id: 'is',       label: 'Information Systems', icon: <I.cog /> },
  { id: 'ship',     label: 'Shipping', icon: <I.flag /> },
  { id: 'acct',     label: 'Accounting', icon: <I.shield /> },
];

export function recUrl(rec) {
  const parts = String((rec && rec.id) || '').split('_');
  const type = parts[0], num = parts[1];
  try {
    if (type === 'contact' && num) return new URL('Default.aspx?Page=240&customerID=' + num, window.location.href).href;
    if (type === 'account' && num) return new URL('Default.aspx?Page=271&accountID=' + num, window.location.href).href;
  } catch (e) {}
  return '';
}

export function InlineSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const searchGeneration = useRef(0);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const path = (e.composedPath && e.composedPath()) || [];
      const inField = path.some((el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
      if (inField) return;
      e.preventDefault(); e.stopPropagation();
      try { inputRef.current && inputRef.current.focus(); } catch (er) {}
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { const p = (e.composedPath && e.composedPath()) || []; if (boxRef.current && p.indexOf(boxRef.current) === -1) setOpen(false); };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [open]);

  const onType = (val) => {
    setQ(val);
    const generation = ++searchGeneration.current;
    setActive(0);
    setOpen(true);
    if (!val.trim()) { setResults([]); return; }
    queryIndexed(val, { limit: 8 })
      .then((result) => {
        if (searchGeneration.current === generation) setResults(result.rows || []);
      })
      .catch(() => {
        if (searchGeneration.current === generation) setResults([]);
      });
  };
  const go = (rec) => { const u = recUrl(rec); setOpen(false); if (u) goUrl(u); };
  const openModal = () => { try { window.__gbShowCrmSearchModal && window.__gbShowCrmSearchModal(); } catch (e) {} };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[active]) go(results[active]); }
    else if (e.key === 'Escape') { setOpen(false); try { inputRef.current.blur(); } catch (er) {} }
  };

  return (
    <div ref={boxRef} style={{ position: 'relative', width: 280, flexShrink: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        background: 'var(--gb-fill-inverse-medium)',
        border: '1px solid ' + (open ? 'var(--gb-border-focus)' : 'var(--gb-border-default)'),
        borderRadius: 'var(--gb-r-md)', padding: '0 6px 0 10px', height: 28, color: 'var(--gb-text-muted)',
      }}>
        <I.search size={12} />
        <input ref={inputRef} value={q} placeholder="Search customers, accounts…"
          onChange={(e) => onType(e.target.value)} onKeyDown={onKeyDown} onFocus={() => { if (results.length) setOpen(true); }}
          style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 11.5 }} />
        {!q && <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 9.5, padding: '1px 5px', borderRadius: 3, background: 'var(--gb-fill-subtle)', color: 'var(--gb-text-tertiary)', border: '1px solid var(--gb-border-subtle)' }}>/</span>}
        <IconBtn size="xs" ghost icon={<I.ext />} title="Open full search" onClick={openModal} />
      </div>
      {open && results.length > 0 && (
        <div className="gb-scroll" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60,
          maxHeight: 360, overflowY: 'auto', padding: 5,
          background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-lg)', boxShadow: 'var(--gb-shadow-popover)',
          animation: 'gb-fade-slide var(--gb-anim) both',
        }}>
          {results.map((r, i) => {
            const isAcct = String(r.id || '').startsWith('account');
            const name = r.contactName_t || r.accountName_t || r.id;
            const sub = isAcct ? 'Account' : ['Contact', r.accountName_t, (r.emails_tps || [])[0]].filter(Boolean).join(' · ');
            return (
              <button key={r.id || i} onClick={() => go(r)} onMouseEnter={() => setActive(i)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 9px', borderRadius: 'var(--gb-r-sm)', border: 0, cursor: 'pointer', textAlign: 'left', background: i === active ? 'var(--gb-fill-subtle)' : 'transparent', transition: 'background var(--gb-anim)' }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)', color: 'var(--gb-text-tertiary)' }}>{isAcct ? <I.briefcase size={12} /> : <I.user size={12} />}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {open && q && results.length === 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60, padding: 14,
          background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-lg)', boxShadow: 'var(--gb-shadow-popover)',
          fontSize: 11.5, color: 'var(--gb-text-muted)', textAlign: 'center',
        }}>
          No indexed matches. <a href="#" onClick={(e) => { e.preventDefault(); openModal(); }} style={{ color: 'var(--gb-brand-label)', textDecoration: 'none', fontWeight: 600 }}>Full search →</a>
        </div>
      )}
    </div>
  );
}

export const AVATAR_COLOR = '#3a5f7d';

export function ContactPill({ icon, label, value, muted }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span style={{
        width: 24, height: 24, borderRadius: 6,
        background: 'var(--gb-fill-subtle)',
        border: '1px solid var(--gb-border-subtle)',
        color: 'var(--gb-text-tertiary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{React.cloneElement(icon, { size: 12 })}</span>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', textTransform: 'uppercase', letterSpacing: .7, fontWeight: 700, lineHeight: 1.3 }}>{label}</span>
        <span style={{
          fontSize: 12, color: muted ? 'var(--gb-text-ghost)' : 'var(--gb-text-secondary)',
          fontWeight: 500, lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{value}</span>
      </div>
    </div>
  );
}

/* THE stat-tile row. Every page's stat strip renders through this so new
   pages match by construction. cells: [{ label, value, sub, tone, glow, mono }]
   tone: 'brand' (tinted card) | 'success' | 'error' | 'warning' | undefined. */
export function StatCardGrid({ cells }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`, gap: 10 }}>
      {cells.map((c, i) => (
        <Card key={i} className="gbcp-stat" pad="14px 16px" style={{
          ...(c.tone === 'brand' ? { background: 'var(--gb-brand-tint-soft)', borderColor: 'var(--gb-brand-tint-border)' } : null),
        }}>
          <div style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase',
            color: c.tone === 'brand' ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
          }}>{c.label}</div>
          <div style={{
            fontSize: 20, fontWeight: 700, marginTop: 4,
            color: c.tone === 'brand' ? 'var(--gb-brand-label)' :
                   c.tone === 'success' ? 'var(--gb-success-fg)' :
                   c.tone === 'error' ? 'var(--gb-error-fg)' :
                   c.tone === 'warning' ? 'var(--gb-warning-fg)' :
                   'var(--gb-text-primary)',
            fontFamily: c.mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)',
            letterSpacing: -.5, lineHeight: 1.15,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            textShadow: c.glow ? `0 0 18px color-mix(in srgb, var(--gb-brand-label) 35%, transparent)` : 'none',
          }}>{c.value}</div>
          <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 3, fontWeight: 500 }}>{c.sub}</div>
        </Card>
      ))}
    </div>
  );
}

export function StatsStrip() {
  const D = useD();
  const s = D.stats;
  const last = daysAgo(s.lastOrderDate);
  const removed = num(s.mailerRemoved) ? true : false;
  return <StatCardGrid cells={[
    { label: 'Lifetime Revenue', value: fmt$(s.totalRevenue), sub: `${num(s.orderCount) ?? 0} orders`, tone: 'brand', glow: true },
    { label: 'Orders',           value: num(s.orderCount) ?? 0,  sub: 'avg ' + fmt$(s.avgOrderSize) },
    { label: 'YTD Revenue',      value: fmt$(s.ytdRevenue),   sub: 'this year' },
    { label: 'Prior Year',       value: fmt$(s.priorYearRevenue), sub: 'last year' },
    { label: 'Last Order',       value: fmtDate(s.lastOrderDate), sub: last != null ? `${last} days ago` : '', mono: true },
    { label: 'Mailer Status',    value: removed ? 'Removed' : 'Subscribed', sub: `${num(s.mailerPoints) ?? 0} points`, tone: removed ? undefined : 'success' },
  ]} />;
}

/* Centered spinner block — the ONE loading indicator for detail pages. */
export function Spinner({ size = 30, label = 'Loading…', pad = '90px 0' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: pad, color: 'var(--gb-text-muted)' }}>
      <span style={{ width: size, height: size, borderRadius: '50%', borderStyle: 'solid', borderWidth: 3, borderColor: 'var(--gb-border-strong)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin 0.7s linear infinite' }} />
      {label && <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>}
    </div>
  );
}

/* The 15px task check square used in open/completed task tables.
   tone 'brand' = the static filled check in Completed tables;
   tone 'success' = the just-completed green fill in OpenTaskRow. */
export function TaskCheckbox({ done, onClick, disabled, title, tone = 'brand' }) {
  const pal = tone === 'success'
    ? { bd: done ? 'var(--gb-success-fg)' : 'var(--gb-border-strong)', bg: done ? 'var(--gb-success-fg)' : 'transparent', fg: 'var(--gb-text-on-brand)' }
    : { bd: done ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)', bg: done ? 'var(--gb-brand-tint-medium)' : 'transparent', fg: 'var(--gb-brand-label)' };
  return (
    <button onClick={onClick} disabled={disabled || !onClick} title={title}
      style={{
        width: 15, height: 15, borderRadius: 4, flexShrink: 0, padding: 0,
        border: '1.5px solid ' + pal.bd, background: pal.bg, color: pal.fg,
        cursor: onClick && !disabled ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      {done && <I.check size={9} sw={3} />}
    </button>
  );
}

/* Defers layout/paint of below-the-fold sections until they scroll near the
   viewport (content-visibility). Do NOT wrap panels whose popovers must
   overflow the card (e.g. the activity filter) — paint containment clips them. */
export function LazySection({ children, minHeight = 420 }) {
  return (
    <div style={{ contentVisibility: 'auto', containIntrinsicSize: `auto ${minHeight}px` }}>
      {children}
    </div>
  );
}

/* The bolt quick-add input row (input + Add button). */
export function QuickAddInput({ value, onChange, onSubmit, placeholder = 'Quick add a task… (Enter to save)', disabled, extra }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
      <div style={{
        flex: 1, height: 30, borderRadius: 'var(--gb-r-md)',
        background: 'var(--gb-fill-inverse-medium)',
        border: '1px solid var(--gb-border-default)',
        display: 'flex', alignItems: 'center', padding: '0 10px', gap: 7,
      }}>
        <I.bolt size={11} style={{ color: 'var(--gb-text-muted)' }} />
        <input value={value} onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
          placeholder={placeholder}
          style={{
            flex: 1, border: 0, outline: 0, background: 'transparent',
            fontFamily: 'var(--gb-font-sans)', fontSize: 11.5,
            color: 'var(--gb-text-primary)',
          }} />
      </div>
      {extra}
      <Btn variant="primary" size="sm" icon={<I.check />} disabled={disabled || !String(value || '').trim()} onClick={onSubmit}>Add</Btn>
    </div>
  );
}

export function Tabs({ active, setActive }) {
  const D = useD();
  const TABS = [
    { id: 'activity', label: 'Activity',  icon: <I.history />, count: D.activities.length },
    { id: 'orders',   label: 'Orders',    icon: <I.cart />,    count: num(D.stats.orderCount) ?? D.orders.length },
    { id: 'emails',   label: 'Emails',    icon: <I.mail />,    count: D.emails.length },
    { id: 'tasks',    label: 'Tasks',     icon: <I.task />,    count: D.openTasks.length },
    { id: 'opps',     label: 'Opportunities', icon: <I.target />, count: D.opportunities.length },
    { id: 'cases',    label: 'Cases',     icon: <I.case />,    count: 0 },
  ];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      borderBottom: '1px solid var(--gb-border-subtle)',
      paddingLeft: 4, flexWrap: 'wrap',
    }}>
      {TABS.map((t) => {
        const isActive = active === t.id;
        return (
          <button key={t.id} onClick={() => setActive(t.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '11px 14px', position: 'relative',
              background: 'transparent', border: 0,
              borderBottom: '2px solid ' + (isActive ? 'var(--gb-brand-label)' : 'transparent'),
              marginBottom: -1,
              fontSize: 12, fontWeight: 600, letterSpacing: -.05,
              color: isActive ? 'var(--gb-text-primary)' : 'var(--gb-text-muted)',
              cursor: 'pointer', fontFamily: 'var(--gb-font-sans)',
              transition: 'all var(--gb-anim)',
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--gb-text-secondary)'; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--gb-text-muted)'; }}
          >
            {React.cloneElement(t.icon, { size: 13 })}
            {t.label}
            {t.count != null && (
              <span style={{
                fontSize: 10, fontFamily: 'var(--gb-font-mono)', fontWeight: 600,
                color: isActive ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
                background: isActive ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)',
                padding: '1px 6px', borderRadius: 99,
                marginLeft: 2, minWidth: 18, textAlign: 'center',
              }}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyRow({ colSpan, label }) {
  return (
    <tr><td colSpan={colSpan} style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--gb-text-muted)' }}>{label}</td></tr>
  );
}

export function openEmailRow(i) {
  try {
    const rows = document.querySelectorAll('tr[data-gb-ep="1"]');
    const r = rows[i];
    if (r && typeof r.click === 'function') r.click();
  } catch (e) {}
}

export function downloadEmailRow(i) {
  try {
    const rows = document.querySelectorAll('tr[data-gb-ep="1"]');
    const a = rows[i] && rows[i].querySelector('a[href]');
    if (a) a.click();
  } catch (e) {}
}

export const ACTIVITY_TYPES = [
  { key: 'all',      label: 'All types', icon: <I.history />, tone: 'neutral' },
  { key: 'email',    label: 'Email',     icon: <I.mail />,    tone: 'warning' },
  { key: 'call',     label: 'Call',      icon: <I.phone />,   tone: 'success' },
  { key: 'chat',     label: 'Chat',      icon: <I.chat />,    tone: 'success' },
  { key: 'note',     label: 'Note',      icon: <I.note />,    tone: 'brand' },
  { key: 'image',    label: 'Image',     icon: <I.camera />,  tone: 'error' },
  { key: 'workflow', label: 'Workflow',  icon: <I.cog />,     tone: 'info' },
];

export function typeSwatch(tone) {
  return tone === 'neutral'
    ? { bg: 'var(--gb-fill-subtle)', bd: 'var(--gb-border-default)', fg: 'var(--gb-text-tertiary)' }
    : { bg: `var(--gb-${tone}-tint-medium)`, bd: `var(--gb-${tone}-tint-border)`, fg: `var(--gb-${tone}-fg)` };
}

export function ActivityFilter({ value, onChange, counts }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { const p = (e.composedPath && e.composedPath()) || []; if (ref.current && p.indexOf(ref.current) === -1) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey, true); };
  }, [open]);
  const active = value !== 'all';
  const cur = ACTIVITY_TYPES.find((t) => t.key === value) || ACTIVITY_TYPES[0];
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Btn variant={active ? 'tinted' : 'ghost'} size="sm" icon={<I.filter />}
        iconRight={<I.chevd style={{ transition: 'transform var(--gb-anim)', transform: open ? 'rotate(180deg)' : 'none' }} />}
        onClick={() => setOpen((o) => !o)}>
        {active ? cur.label : 'Filter'}
      </Btn>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60,
          minWidth: 176, padding: 5,
          background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-lg)', boxShadow: 'var(--gb-shadow-popover)',
          display: 'flex', flexDirection: 'column', gap: 1,
          animation: 'gb-fade-slide var(--gb-anim) both',
        }}>
          {ACTIVITY_TYPES.map((t) => {
            const sel = t.key === value;
            const sw = typeSwatch(t.tone);
            return (
              <button key={t.key} onClick={() => { onChange(t.key); setOpen(false); }}
                onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = 'var(--gb-fill-subtle)'; }}
                onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '6px 9px',
                  borderRadius: 'var(--gb-r-sm)', border: 0, cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'var(--gb-font-sans)', fontSize: 12, fontWeight: sel ? 700 : 500,
                  color: sel ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
                  background: sel ? 'var(--gb-brand-tint-soft)' : 'transparent',
                  transition: 'background var(--gb-anim)',
                }}>
                <span style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: sw.bg, border: '1px solid ' + sw.bd, color: sw.fg }}>{React.cloneElement(t.icon, { size: 11 })}</span>
                <span style={{ flex: 1 }}>{t.label}</span>
                <span style={{ fontSize: 10, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>{counts[t.key] || 0}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 11.5 };

export const trStyle = { borderBottom: '1px solid var(--gb-border-subtle)' };

export function Th({ children, align = 'left', style }) {
  return <th style={{
    padding: '9px 14px', textAlign: align,
    fontSize: 9.5, fontWeight: 700, letterSpacing: .7, textTransform: 'uppercase',
    color: 'var(--gb-text-muted)',
    borderBottom: '1px solid var(--gb-border-default)',
    // opaque + sticky so the header pins while the panel body scrolls
    background: 'var(--gb-surface-2)',
    position: 'sticky', top: 0, zIndex: 3,
    whiteSpace: 'nowrap', ...style,
  }}>{children}</th>;
}

export function Td({ children, align = 'left', mono, muted, style }) {
  return <td style={{
    padding: '10px 14px', textAlign: align, verticalAlign: 'middle',
    fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)',
    fontSize: 11.5, color: muted ? 'var(--gb-text-muted)' : 'var(--gb-text-secondary)',
    fontWeight: 500, ...style,
  }}>{children}</td>;
}

export const BRANDS = [
  { m: ['titleist'],                  a: 'T',  c: '#d11f3a' },
  { m: ['taylormade', 'taylor made'], a: 'TM', c: '#8a8f97' },
  { m: ['callaway'],                  a: 'C',  c: '#2f6fd0' },
  { m: ['bridgestone'],               a: 'B',  c: '#e0533f' },
  { m: ['srixon'],                    a: 'S',  c: '#e08a2f' },
  { m: ['cleveland'],                 a: 'Cl', c: '#3f8fd0' },
  { m: ['wilson'],                    a: 'W',  c: '#c8102e' },
  { m: ['volvik'],                    a: 'Vk', c: '#d83fa0' },
  { m: ['vice'],                      a: 'Vi', c: '#7a6fd0' },
  { m: ['mizuno'],                    a: 'M',  c: '#2f5fd0' },
  { m: ['ping'],                      a: 'P',  c: '#5b6068' },
  { m: ['cobra'],                     a: 'Co', c: '#e0a030' },
  { m: ['pinnacle'],                  a: 'Pn', c: '#cbb320' },
  { m: ['maxfli'],                    a: 'Mx', c: '#d14f3a' },
  { m: ['top flite', 'topflite'],     a: 'TF', c: '#3faf7f' },
  { m: ['snell'],                     a: 'Sn', c: '#5fa0e0' },
  { m: ['kirkland'],                  a: 'K',  c: '#7a8f4f' },
  { m: ['oncore'],                    a: 'O',  c: '#3fa0a0' },
  { m: ['nike'],                      a: 'N',  c: '#7fb030' },
  { m: ['venture'],                   a: 'V',  c: '#4ec48c' },
  { m: ['bettinardi'],                a: 'Bt', c: '#9a6fd0' },
  { m: ['scotty cameron', 'cameron'], a: 'SC', c: '#c89b3c' },
  { m: ['odyssey'],                   a: 'Od', c: '#3f6fd0' },
];

export function brandFor(name) {
  const s = (name || '').toLowerCase();
  let best = null, bestLen = 0;
  for (const b of BRANDS) {
    for (const m of b.m) {
      if (m.length > bestLen && s.indexOf(m) !== -1) { best = b; bestLen = m.length; }
    }
  }
  return best;
}

export function BrandBadge({ name, size = 22 }) {
  const b = brandFor(name);
  if (!b) {
    const init = ((name || '?').trim().charAt(0) || '?').toUpperCase();
    return (
      <span style={{ width: size, height: size, borderRadius: 6, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', color: 'var(--gb-text-tertiary)', fontSize: 10, fontWeight: 700 }}>{init}</span>
    );
  }
  return (
    <span title={b.m[0]} style={{ width: size, height: size, borderRadius: 6, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: b.c, color: '#fff', fontSize: b.a.length > 1 ? 9 : 11, fontWeight: 800, letterSpacing: -.3, fontFamily: 'var(--gb-font-sans)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14)' }}>{b.a}</span>
  );
}

export function proofTone(status) {
  const s = (status || '').toLowerCase();
  if (/approv|complete|done|ready/.test(s)) return 'success';
  if (/reject|declin|fail|cancel/.test(s)) return 'error';
  if (/pend|submit|review|wait|progress/.test(s)) return 'warning';
  return 'neutral';
}

export function blobToPng(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        c.toBlob((b) => { URL.revokeObjectURL(url); b ? resolve(b) : reject(new Error('toBlob')); }, 'image/png');
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
    img.src = url;
  });
}

export function ProofCard({ p }) {
  const [imgOk, setImgOk] = useState(true);
  const [copied, setCopied] = useState(false);
  const thumb = p.logo_ball || p.logo;
  const tone = proofTone(p.status);
  const copyImage = async (e) => {
    e.stopPropagation();
    if (!thumb) return;
    try {
      const res = await fetch(thumb, { mode: 'cors' });
      let blob = await res.blob();
      if (blob.type !== 'image/png') { try { blob = await blobToPng(blob); } catch (e2) {} }
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
      setCopied(true); setTimeout(() => setCopied(false), 1300);
    } catch (err) {
      try { await navigator.clipboard.writeText(thumb); setCopied(true); setTimeout(() => setCopied(false), 1300); } catch (e3) {}
    }
  };
  return (
    <div className="gb-proof"
      onClick={() => { if (p.history) goUrl(p.history); }}
      title={p.history ? 'View proof history' : undefined}
      style={{
        width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRadius: 'var(--gb-r-md)', overflow: 'hidden',
        border: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-surface-1)',
        cursor: p.history ? 'pointer' : 'default',
        transition: 'transform .22s cubic-bezier(.34,1.4,.64,1), box-shadow .22s, border-color .22s',
      }}>
      {/* image controls its own height (show all of it), rounded corners, inset */}
      <div style={{ position: 'relative', padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {thumb && imgOk
          ? <img src={thumb} alt={p.name || 'proof'} loading="lazy" onError={() => setImgOk(false)} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 'var(--gb-r-sm)', objectFit: 'contain' }} />
          : <div style={{ width: '100%', aspectRatio: '2 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-surface-2)', borderRadius: 'var(--gb-r-sm)' }}><I.camera size={28} style={{ color: 'var(--gb-text-ghost)' }} /></div>}
        {p.status && <span style={{ position: 'absolute', top: 14, right: 14 }}><Tag tone={tone} size="xs">{p.status}</Tag></span>}
      </div>
      {/* info strip: a distinct surface (not a blend) with an inset top
          highlight + soft inner shadow for a recessed 3D feel */}
      <div style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, background: 'var(--gb-surface-2)', boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--gb-text-primary) 9%, transparent), inset 0 -12px 22px -14px rgba(0,0,0,.55)' }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.name || 'Proof'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--gb-text-muted)' }}>
          {p.kind && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.kind}</span>}
          <span style={{ fontFamily: 'var(--gb-font-mono)', marginLeft: 'auto', flexShrink: 0 }}>{fmtDate(p.date)}</span>
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 'auto', alignItems: 'center' }}>
          {p.pdf && <Btn variant="secondary" size="xs" icon={<I.download />} onClick={(e) => { e.stopPropagation(); try { window.open(p.pdf, '_blank'); } catch (er) {} }}>PDF</Btn>}
          {p.instant_mockup && <IconBtn size="xs" ghost icon={<I.target />} title="Ball mockup" onClick={(e) => { e.stopPropagation(); try { window.open(p.instant_mockup, '_blank'); } catch (er) {} }} />}
          {p.apparel_mockup && <IconBtn size="xs" ghost icon={<I.briefcase />} title="Apparel mockup" onClick={(e) => { e.stopPropagation(); try { window.open(p.apparel_mockup, '_blank'); } catch (er) {} }} />}
          {/* copy main image — always visible, lower-right of the info section, no background */}
          {thumb && imgOk && <IconBtn size="xs" ghost icon={copied ? <I.check /> : <I.copy />} title="Copy image" onClick={copyImage} style={{ marginLeft: 'auto' }} />}
        </div>
      </div>
    </div>
  );
}

export function OrdersPanel() {
  const D = useD();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card>
        <SectionTitle
          icon={<I.cart />} title="Orders" count={num(D.stats.orderCount) ?? D.orders.length}
          sub="Most recent purchases"
          right={<Btn variant="ghost" size="sm" iconRight={<I.chevr />}>View all</Btn>}
        />
        <ScrollArea max={420}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Order #</Th>
              <Th>Summary</Th>
              <Th align="right">Date</Th>
              <Th align="right">Revenue</Th>
              <Th align="center">Status</Th>
            </tr>
          </thead>
          <tbody>
            {D.orders.map((o, i) => (
              <tr key={i} style={trStyle}>
                <Td>
                  {o.href ? (
                    <a href={o.href} style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 11.5, color: 'var(--gb-brand-label)', fontWeight: 600, textDecoration: 'none' }}>{o.number}</a>
                  ) : (
                    <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 11.5, color: 'var(--gb-brand-label)', fontWeight: 600 }}>{o.number}</span>
                  )}
                </Td>
                <Td>
                  <div style={{
                    fontSize: 11.5, color: 'var(--gb-text-secondary)', fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    lineHeight: 1.4,
                  }}>{o.summary}</div>
                </Td>
                <Td align="right" mono muted>{fmtDate(o.date)}</Td>
                <Td align="right">
                  <span style={{ fontFamily: 'var(--gb-font-mono)', fontWeight: 700, color: 'var(--gb-text-primary)' }}>{fmt$(o.revenue)}</span>
                </Td>
                <Td align="center">{o.status ? <Tag tone="success" size="xs">{o.status}</Tag> : DASH}</Td>
              </tr>
            ))}
            {D.orders.length === 0 && <EmptyRow colSpan={5} label="No orders." />}
          </tbody>
        </table>
        </ScrollArea>
      </Card>

      <Card>
        <SectionTitle
          icon={<I.star />} title="Top Items" count={D.items.length}
          sub="By dollar amount, all-time"
        />
        <ScrollArea max={420}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th align="right">Qty</Th>
              <Th align="right">$</Th>
            </tr>
          </thead>
          <tbody>
            {[...D.items].sort((a, b) => (num(b.revenue) || 0) - (num(a.revenue) || 0)).map((it, i) => (
              <tr key={i} style={trStyle}>
                <Td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <BrandBadge name={it.name} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)', fontWeight: 500, lineHeight: 1.4 }}>{it.name}</div>
                      {num(it.orderCount) != null && (
                        <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 2, fontFamily: 'var(--gb-font-mono)' }}>
                          {it.orderCount} order{it.orderCount !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                </Td>
                <Td align="right" mono>{num(it.quantity) ?? DASH}</Td>
                <Td align="right">
                  <span style={{ fontFamily: 'var(--gb-font-mono)', fontWeight: 700, color: 'var(--gb-text-primary)' }}>{fmt$(it.revenue)}</span>
                </Td>
              </tr>
            ))}
            {D.items.length === 0 && <EmptyRow colSpan={3} label="No items." />}
          </tbody>
        </table>
        </ScrollArea>
      </Card>
    </div>
  );
}

export function EmailsPanel() {
  const D = useD();
  const me = (D.contact.email || '').toLowerCase();
  const dirOf = (e) => {
    const from = (e.from || '').toLowerCase();
    if (me && from.indexOf(me) !== -1) return 'in';
    if (/support|service|noreply|no-reply/.test(from)) return 'auto';
    return 'out';
  };
  return (
    <Card>
      <SectionTitle
        icon={<I.mail />} title="Email History" count={`${D.emails.length} shown`}
        sub="All emails to or from this contact"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn variant="ghost" size="sm" icon={<I.filter />}>Filter</Btn>
            <Btn variant="tinted" size="sm" icon={<I.send />}>Compose</Btn>
          </div>
        }
      />
      <ScrollArea max={420}>
      <table style={tableStyle}>
        <thead><tr>
          <Th>Dir</Th>
          <Th>From</Th>
          <Th>To</Th>
          <Th>Subject</Th>
          <Th align="right">Date</Th>
          <Th align="right">Size</Th>
          <Th></Th>
        </tr></thead>
        <tbody>
          {D.emails.map((e, i) => (
            <tr key={i} style={trStyle}>
              <Td><DirArrow dir={dirOf(e)} /></Td>
              <Td><span style={{ fontWeight: 600, color: 'var(--gb-text-secondary)' }}>{e.from}</span></Td>
              <Td muted>{e.to}</Td>
              <Td><span style={{ color: 'var(--gb-text-primary)', fontWeight: 500 }}>{e.subject}</span></Td>
              <Td align="right" mono muted>{fmtDateTime(e.date)}</Td>
              <Td align="right" mono muted>{fmtBytes(e.sizeBytes)}</Td>
              <Td align="right">
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <IconBtn size="xs" ghost icon={<I.mail />} title="Open email" onClick={() => openEmailRow(i)} />
                  <IconBtn size="xs" ghost icon={<I.download />} title="Download .eml" onClick={() => downloadEmailRow(i)} />
                </div>
              </Td>
            </tr>
          ))}
          {D.emails.length === 0 && <EmptyRow colSpan={7} label="No emails." />}
        </tbody>
      </table>
      </ScrollArea>
    </Card>
  );
}

export function DirArrow({ dir }) {
  const cfg = {
    out:  { fg: 'var(--gb-info-fg)',    bg: 'var(--gb-info-tint-medium)',    bd: 'var(--gb-info-tint-border)',    label: '↑' },
    in:   { fg: 'var(--gb-success-fg)', bg: 'var(--gb-success-tint-medium)', bd: 'var(--gb-success-tint-border)', label: '↓' },
    auto: { fg: 'var(--gb-text-muted)', bg: 'var(--gb-fill-subtle)',         bd: 'var(--gb-border-default)',      label: '⚙' },
  }[dir];
  return (
    <span style={{
      ...ARMOR,
      width: 20, height: 20, borderRadius: 5,
      background: cfg.bg, color: cfg.fg, border: `1px solid ${cfg.bd}`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700, fontFamily: 'var(--gb-font-mono)',
    }}>{cfg.label}</span>
  );
}

export function priTone(p) {
  const s = (p || '').toLowerCase();
  if (s.indexOf('high') !== -1) return 'error';
  if (s.indexOf('med') !== -1) return 'warning';
  return 'neutral';
}

export function CasesPanel() {
  return (
    <Card>
      <SectionTitle
        icon={<I.case />} title="Case History" count={0}
        right={<Btn variant="tinted" size="sm" icon={<I.plus />}>Open case</Btn>}
      />
      <div style={{ padding: 32, textAlign: 'center', fontSize: 12, color: 'var(--gb-text-muted)' }}>
        Case history isn't available on this view yet.
      </div>
    </Card>
  );
}

export function SystemCard() {
  const D = useD();
  const a = D.account;
  return (
    <Card>
      <SectionTitle icon={<I.cog />} title="System" />
      <div style={{ padding: '4px 18px 14px' }}>
        <KV label="Customer ID" mono copyable>{txt(D.ids.contact)}</KV>
        <KV label="Account ID" mono copyable>{txt(D.ids.account)}</KV>
        <KV label="Created" mono>{fmtDate(a.createdDate) === DASH ? null : fmtDate(a.createdDate)}</KV>
        <KV label="Created By">{txt(a.createdBy)}</KV>
        <KV label="Modified" mono>{fmtDateTime(a.modifiedDate) === DASH ? null : fmtDateTime(a.modifiedDate)}</KV>
      </div>
    </Card>
  );
}
