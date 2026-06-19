/* eslint-disable */
/* ─────────────────────────────────────────────────────────────
   contact-details.jsx — Custom Pages UI for the CRM Contact
   Details page (Default.aspx?Page=240).

   Ported from the Claude Design handoff (a self-contained mock).
   Differences vs. the mock:
     • UMD React globals → ESM imports (bundled to IIFE by build.js).
     • All hardcoded data replaced with LIVE data read from the
       schema engine via the Custom Pages engine's store
       (window.__gbCustomPages.contact_details.render(rootEl, ctx)).
     • Added the Opportunities tab the mock was missing.
     • Sidebar / breadcrumb nav point at real Default.aspx?Page=N.
     • Empty sections show silent empty states (no toasts).

   Edit / Add note / New task / Compose / Snooze etc. are rendered
   exactly as designed but inert for now — wired in a later pass.

   Tokens (--gb-*) + Geist are injected globally by theme.js; no
   system-tokens.css import.
───────────────────────────────────────────────────────────── */

import React, { useState, useMemo, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme, THEME_VARIANTS, loadTheme, saveTheme, applyTheme } from '../lib/theme.js';
import { getAllIndexed, searchIndexed } from '../lib/crmIndex.js';
import { Field as UIField } from '../ui/components/Field.jsx';
import { Input as UIInput } from '../ui/components/Input.jsx';
import { Textarea as UITextarea } from '../ui/components/Textarea.jsx';
import { ModalHeader } from '../ui/components/ModalHeader.jsx';
import { ModalFooter } from '../ui/components/ModalFooter.jsx';
import { submitCallLog } from '../lib/submitCallLog.js';
import { submitQuickTask } from '../lib/submitQuickTask.js';
import { loadTaskTemplates } from '../lib/quickTask.js';
import { loadCallTemplates } from '../lib/callLog.js';

/* ════════════════════════════════════════════════════════════
   ICONS
════════════════════════════════════════════════════════════ */
const Icon = ({ size = 14, sw = 1.8, children, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0, ...style }}>{children}</svg>
);
const I = {
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
  chat:    (p) => <Icon {...p}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></Icon>,
  camera:  (p) => <Icon {...p}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></Icon>,
};

/* ════════════════════════════════════════════════════════════
   PRIMITIVES — verbatim from the design
════════════════════════════════════════════════════════════ */
function Btn({ variant = 'secondary', size = 'md', icon, iconRight, children, full, status, disabled, style, onClick }) {
  const [hover, setHover] = useState(false);
  const tint = {
    brand:   { fg: 'var(--gb-brand-label)', bg: 'var(--gb-brand-tint-medium)', bd: 'var(--gb-brand-tint-border)', hov: 'var(--gb-brand-tint-strong)' },
    error:   { fg: 'var(--gb-error-fg)',    bg: 'var(--gb-error-tint-medium)', bd: 'var(--gb-error-tint-border)', hov: 'var(--gb-error-tint-strong)' },
    warning: { fg: 'var(--gb-warning-fg)',  bg: 'var(--gb-warning-tint-medium)',bd: 'var(--gb-warning-tint-border)',hov:'var(--gb-warning-tint-strong)' },
    info:    { fg: 'var(--gb-info-fg)',     bg: 'var(--gb-info-tint-medium)',  bd: 'var(--gb-info-tint-border)',  hov: 'var(--gb-info-tint-strong)' },
  }[status || 'brand'];
  const V = {
    primary:   { bg: hover ? 'linear-gradient(180deg, var(--gb-brand-label) 0%, var(--gb-brand) 100%)' : 'linear-gradient(180deg, var(--gb-brand) 0%, var(--gb-brand-dark) 100%)', fg: 'var(--gb-text-on-brand)', bd: 'var(--gb-brand-border)' },
    secondary: { bg: hover ? 'var(--gb-fill-soft)' : 'var(--gb-fill-subtle)',  fg: 'var(--gb-text-secondary)', bd: 'var(--gb-border-default)' },
    tinted:    { bg: hover ? tint.hov : tint.bg, fg: tint.fg, bd: tint.bd },
    ghost:     { bg: hover ? 'var(--gb-fill-subtle)' : 'transparent', fg: 'var(--gb-text-tertiary)', bd: 'transparent' },
    danger:    { bg: hover ? 'var(--gb-error-tint-strong)' : 'var(--gb-error-tint-medium)', fg: 'var(--gb-error-fg)', bd: 'var(--gb-error-tint-border)' },
  }[variant];
  const S = {
    xs: { h: 22, px: 8,  fs: 10.5, gap: 4, ic: 10 },
    sm: { h: 26, px: 10, fs: 11,   gap: 5, ic: 11 },
    md: { h: 30, px: 11, fs: 12,   gap: 6, ic: 12 },
    lg: { h: 36, px: 14, fs: 13,   gap: 7, ic: 13 },
  }[size];
  // primary's background is a gradient (a background-image) that can't be
  // interpolated — transitioning it flashes transparent on hover, so skip
  // background in its transition (gradient↔gradient swaps cleanly anyway).
  const animBg = variant !== 'primary';
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
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

function IconBtn({ icon, size = 'md', danger, ghost, active, style, onClick, title }) {
  const [hover, setHover] = useState(false);
  const px = { xs: 22, sm: 26, md: 30, lg: 36 }[size];
  const ic = { xs: 11, sm: 12, md: 14, lg: 16 }[size];
  const pal = danger
    ? { bg: hover ? 'var(--gb-error-tint-strong)' : 'var(--gb-error-tint-medium)', fg: 'var(--gb-error-fg)', bd: 'var(--gb-error-tint-border)' }
    : active
    ? { bg: 'var(--gb-brand-tint-medium)', fg: 'var(--gb-brand-label)', bd: 'var(--gb-brand-tint-border)' }
    : ghost
    ? { bg: hover ? 'var(--gb-fill-subtle)' : 'transparent', fg: 'var(--gb-text-tertiary)', bd: 'transparent' }
    : { bg: hover ? 'var(--gb-fill-soft)' : 'var(--gb-fill-subtle)', fg: 'var(--gb-text-tertiary)', bd: 'var(--gb-border-default)' };
  return (
    <button title={title} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
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

function Tag({ children, tone = 'neutral', size = 'md', icon, style }) {
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

function Dot({ tone = 'brand', size = 6, glow }) {
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

function Card({ children, style, pad = 0, hover, onClick, className }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={onClick} className={className}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        ...ARMOR,
        // reset boundary: re-establish inherited basics for descendants
        fontFamily: 'var(--gb-font-sans)', color: 'var(--gb-text-secondary)',
        background: 'var(--gb-surface-1)',
        border: '1px solid var(--gb-border-subtle)',
        borderRadius: 'var(--gb-r-lg)',
        padding: pad, overflow: 'hidden',
        transition: 'all var(--gb-anim)',
        ...(hover && h ? { borderColor: 'var(--gb-border-default)' } : null),
        ...(onClick ? { cursor: 'pointer' } : null),
        ...style,
      }}>{children}</div>
  );
}

function SectionTitle({ icon, title, count, right, sub }) {
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

/* Key-Value row used everywhere in profile metadata */
function KV({ label, children, mono, copyable, link, action }) {
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

/* ════════════════════════════════════════════════════════════
   DATA — live, from the schema engine via ctx.store
════════════════════════════════════════════════════════════ */
const DataCtx = React.createContext(null);
const useD = () => React.useContext(DataCtx);

/* Optimistic patch layer. Write-actions know the FINAL view state already, so
   instead of waiting for a reload we layer reducer patches on top of the
   engine's data — `patch(prev => next)`. Patches stay applied for the session
   (the host DOM never reflects a write without a reload; after a reload the
   fresh data is already correct, so patches reset cleanly). Components animate
   the change like any other React state update. */
const PatchCtx = React.createContext(() => {});
const usePatch = () => React.useContext(PatchCtx);

/* Modal host — native in-takeover modals (the CRM's own Bootstrap modals
   render UNDER the takeover, so we build our own that POST the same endpoints).
   openModal(<SomeModal/>) renders it over the page; modals call closeModal. */
const ModalCtx = React.createContext({ openModal: () => {}, closeModal: () => {} });
const useModal = () => React.useContext(ModalCtx);

function adapt(data) {
  const d = data || {};
  const tasks = d.tasks || {};
  return {
    ready: !!data,
    ids: d.ids || {},
    contact: d.contact || {},
    account: d.account || {},
    stats: d.stats || {},
    orders: Array.isArray(d.orders) ? d.orders : [],
    items: Array.isArray(d.items) ? d.items : [],
    openTasks: Array.isArray(tasks.open) ? tasks.open : [],
    doneTasks: Array.isArray(tasks.done) ? tasks.done : [],
    opportunities: Array.isArray(d.opportunities) ? d.opportunities : [],
    activities: Array.isArray(d.activities) ? d.activities : [],
    emails: Array.isArray(d.emails) ? d.emails : [],
    proofs: Array.isArray(d.proofs) ? d.proofs : [],
  };
}

/* ── formatting helpers — every "missing" path resolves to a dash ── */
const DASH = '—';
function isEmpty(v) { return v === null || v === undefined || v === ''; }
function txt(v) { return isEmpty(v) ? null : String(v); }            // KV renders dash for null
function num(v) { return typeof v === 'number' && !isNaN(v) ? v : null; }
function fmt$(n) {
  var v = num(n);
  if (v === null) return DASH;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function fmtDate(v) {
  var d = toDate(v);
  if (!d) return DASH;
  return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
}
function fmtDateTime(v) {
  var d = toDate(v);
  if (!d) return DASH;
  var h = d.getHours(), m = d.getMinutes();
  var ap = h >= 12 ? 'PM' : 'AM';
  var hh = h % 12; if (hh === 0) hh = 12;
  var mm = m < 10 ? '0' + m : '' + m;
  return fmtDate(v) + ' ' + hh + ':' + mm + ' ' + ap;
}
function fmtBytes(n) {
  var v = num(n);
  if (v === null) return DASH;
  if (v < 1024) return v + ' B';
  return Math.round(v / 1024) + ' KB';
}
function daysAgo(v) {
  var d = toDate(v);
  if (!d) return null;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
}
function yearsSince(v) {
  var d = toDate(v);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000));
}
function initials(first, last) {
  var a = (first || '').trim(), b = (last || '').trim();
  var s = (a[0] || '') + (b[0] || '');
  return s ? s.toUpperCase() : '?';
}
function fullName(c) {
  return [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
}

/* Fixed render scale for the takeover. The host CRM runs at a reduced
   browser zoom; our denser UI reads too small at that 1:1, so we paint
   at 125%. NOT tied to the extension's UI-scale sliders (scales.js) —
   this is a constant for the custom page only. */
const PAGE_ZOOM = 1.375;

/* The takeover renders inside a Shadow DOM (see custom-pages.js), which
   fully isolates it from the host page's CSS — so we no longer need the
   `all: revert-layer` host-armour the modals use. Just pin border-box. */
const ARMOR = { boxSizing: 'border-box' };

/* Stat-card hover: a soft brand inner glow + faint inner ring, driven by
   real CSS :hover (not JS onMouseEnter state, which flickered on scroll as
   cards slid under the cursor). box-shadow isn't set inline on these cards,
   so the rule applies cleanly and animates via the card's `transition:all`.
   Rendered as a <style> inside the shadow tree. */
const UI_CSS =
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
  'input[type=number] { -moz-appearance: textfield; }';

/* Capped-height scroll region with the thin themed scrollbar. Used to
   stack every panel on one screen (no tabs) without runaway height. */
function ScrollArea({ max = 380, children, style }) {
  return (
    <div className="gb-scroll" style={{ maxHeight: max, overflowY: 'auto', overflowX: 'hidden', ...style }}>
      {children}
    </div>
  );
}

/* CRM admin deep-links — absolute (resolved against the current page) so
   navigation is unambiguous regardless of host path. Page ids from the
   design handoff transcript. */
function crmHref(pageId) {
  try { return new URL('Default.aspx?Page=' + pageId, window.location.href).href; }
  catch (e) { return 'Default.aspx?Page=' + pageId; }
}
function crmGo(pageId) { try { window.location.assign(crmHref(pageId)); } catch (e) {} }
function goUrl(url) { try { window.location.assign(url); } catch (e) {} }

/* ── CRM AJAX actions ─────────────────────────────────────────────
   The takeover overlays the LIVE CRM page, so we hit the same endpoints
   the page's own jQuery does, with the page's session cookies. Endpoints
   lifted verbatim from the page's inline functions (QuickComplete /
   Add|RemoveFromDoNotCallList). No new backend, no captured HAR. */
function crmOrigin() {
  try { if (/(^|\.)golfballs\.com$/i.test(location.hostname)) return location.origin; } catch (e) {}
  return 'https://api.golfballs.com';
}
function gbToast(msg, tone = 'info') {
  try { const t = window.__gbToast; (t && (t[tone] || t.info) || function () {})(msg); } catch (e) {}
}
/* Replicates the page's QuickComplete(taskID): read the task, then re-save it
   with taskStatusID=3 (completed). */
async function crmCompleteTask(taskId) {
  const base = crmOrigin();
  const res = await fetch(`${base}/golfballs/crm/Admin/Task/Get.ajax?${taskId}`, { credentials: 'include' });
  const obj = JSON.parse(await res.text());
  const task = {
    TaskId: taskId,
    Subject: encodeURIComponent(obj.Subject || ''),
    Description: encodeURIComponent(obj.Description || ''),
    LiveDate: obj.LiveDate, DueDate: obj.DueDate,
    taskCategoryID: obj.taskCategoryID, taskStatusID: 3,
    contactID: obj.contactID, employeeID: obj.employeeID, Priority: obj.Priority,
  };
  const up = await fetch(`${base}/golfballs/crm/Admin/Task/Update.ajax?${encodeURIComponent(JSON.stringify(task))}`, { credentials: 'include' });
  if (!up.ok) throw new Error('update failed');
}
async function crmSetDnc(customerID, add) {
  const base = crmOrigin();
  const action = add ? 'AddToDoNotCallList' : 'RemoveFromDoNotCallList';
  const r = await fetch(`${base}/golfballs/crm/Admin/Contact/${action}.ajax?${customerID}`, { credentials: 'include' });
  if (!r.ok) throw new Error('dnc failed');
}
/* Edit contact: read the current record, override ONLY the edited fields
   (so unedited values are preserved verbatim), then Update. Field names match
   the Get response 1:1 (verified against the proposal HAR). */
async function crmUpdateContact(customerId, edits) {
  const base = crmOrigin();
  const res = await fetch(`${base}/golfballs/crm/Admin/Contact/Get.ajax?${customerId}`, { credentials: 'include' });
  const cur = JSON.parse(await res.text());
  const has = (k) => Object.prototype.hasOwnProperty.call(edits, k);
  const pick = (k, src) => (has(k) ? edits[k] : (src == null ? '' : src));
  const cd = cur.CustomData;
  const payload = {
    customerId: String(customerId),
    firstName: pick('firstName', cur.firstName),
    middleInit: pick('middleInit', cur.middleInit),
    lastName: pick('lastName', cur.lastName),
    companyName: pick('companyName', cur.companyName),
    jobTitle: pick('jobTitle', cur.jobTitle),
    email: pick('email', cur.email),
    phoneNumber: pick('phoneNumber', cur.phoneNumber),
    zipCode: pick('zipCode', cur.zipCode),
    UserType: String(has('UserType') ? edits.UserType : (cur.userType == null ? 1 : cur.userType)),
    userCountry: pick('userCountry', cur.userCountry) || 'US',
    CustomData: cd == null ? '' : (typeof cd === 'string' ? cd : JSON.stringify(cd)),
  };
  const up = await fetch(`${base}/golfballs/crm/Admin/Contact/Update.ajax?${encodeURIComponent(JSON.stringify(payload))}`, { credentials: 'include' });
  if (!up.ok) throw new Error('update failed');
}
async function crmGetTask(taskId) {
  const r = await fetch(`${crmOrigin()}/golfballs/crm/Admin/Task/Get.ajax?${taskId}`, { credentials: 'include' });
  return JSON.parse(await r.text());
}
/* Full task edit (subject/description/due/priority); keeps the current status
   (use crmCompleteTask to complete). Mirrors the page's Save shape — subject +
   description are themselves URL-encoded inside the JSON, like QuickComplete. */
async function crmUpdateTaskFull(taskId, e) {
  const base = crmOrigin();
  const obj = await crmGetTask(taskId);
  const has = (k) => e[k] != null;
  const task = {
    TaskId: taskId,
    Subject: encodeURIComponent(has('Subject') ? e.Subject : (obj.Subject || '')),
    Description: encodeURIComponent(has('Description') ? e.Description : (obj.Description || '')),
    LiveDate: obj.LiveDate,
    DueDate: has('DueDate') ? e.DueDate : obj.DueDate,
    taskCategoryID: obj.taskCategoryID,
    taskStatusID: obj.taskStatusID,
    contactID: obj.contactID,
    employeeID: obj.employeeID,
    Priority: has('Priority') ? Number(e.Priority) : obj.Priority,
  };
  const up = await fetch(`${base}/golfballs/crm/Admin/Task/Update.ajax?${encodeURIComponent(JSON.stringify(task))}`, { credentials: 'include' });
  if (!up.ok) throw new Error('update failed');
}
/* CRM date (M/D/YYYY or ISO) ⇄ <input type=date> (YYYY-MM-DD). */
function toDateInput(s) {
  if (!s) return '';
  const str = String(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}
function fromDateInput(v) {
  const m = (v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : v;
}
function priLabel(p) { return { 1: 'High', 2: 'Med', 3: 'Low' }[Number(p)] || String(p || ''); }
/* The logged-in rep's employee id — the host page bakes it into its inline
   QuickAddTask (`employeeID = '2370'`). Read it from the page so Create.ajax
   attributes the task correctly. */
function currentEmployeeId() {
  try {
    for (const s of Array.from(document.scripts || [])) {
      const m = (s.textContent || '').match(/employeeID\s*=\s*'(\d+)'/);
      if (m) return m[1];
    }
  } catch (e) {}
  return '0';
}
function todayMDY() {
  try { const d = new Date(); return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`; } catch (e) { return ''; }
}
let __gbTaskTmp = 0;
/* Create a task (mirrors the page's QuickAddTask shape). Returns the sent task
   + the parsed response so the caller can patch the row in optimistically. */
async function crmCreateTask(contactId, e = {}) {
  const base = crmOrigin();
  const today = todayMDY();
  const task = {
    TaskID: '',
    Subject: e.Subject || '',
    Description: e.Description || '',
    LiveDate: e.LiveDate || today,
    DueDate: e.DueDate || today,
    taskStatusID: 1,
    contactID: String(contactId),
    employeeID: currentEmployeeId(),
    Priority: Number(e.Priority || 2),
  };
  const r = await fetch(`${base}/golfballs/crm/Admin/Task/Create.ajax?${encodeURIComponent(JSON.stringify(task))}`, { credentials: 'include' });
  if (!r.ok) throw new Error('create failed');
  let resp = {};
  try { resp = JSON.parse(await r.text()); } catch (x) {}
  const id = resp.TaskId || resp.taskId || resp.TaskID || `new-${++__gbTaskTmp}`;
  return { task, id };
}
/* Opportunity stages (ddlopportunityStageId from the page). */
const OPP_STAGES = [
  { value: '1', label: 'Open' }, { value: '2', label: 'Proposed' }, { value: '3', label: 'Ordered' },
  { value: '4', label: 'Closed - Won' }, { value: '5', label: 'Closed - Lost' }, { value: '6', label: 'Automation' },
  { value: '7', label: 'Prospect' }, { value: '8', label: 'Qualified' },
];
/* <input type=date> (YYYY-MM-DD) ⇄ opportunity's MM-DD-YYYY. */
function toDateInputAny(s) {
  if (!s) return '';
  const str = String(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}
function toOppDate(v) { const m = (v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[2]}-${m[3]}-${m[1]}` : v; }
async function crmGetOpportunity(id) {
  const r = await fetch(`${crmOrigin()}/golfballs/crm/Admin/Opportunity/Get.ajax?${id}`, { credentials: 'include' });
  return JSON.parse(await r.text());
}
async function crmSaveOpportunity(contactId, o) {
  const base = crmOrigin();
  const payload = {
    opportunityId: o.opportunityId || '',
    Subject: o.Subject || '',
    Description: o.Description || '',
    EstimatedClosedDate: o.EstimatedClosedDate || '',
    EstimatedValue: o.EstimatedValue || '0',
    OpportunityStageId: String(o.OpportunityStageId || '1'),
    empAssignedId: String(o.empAssignedId || '0'),
    contactId: Number(contactId),
    LeadID: null,
  };
  const action = payload.opportunityId ? 'Update' : 'Create';
  const r = await fetch(`${base}/golfballs/crm/Admin/Opportunity/${action}.ajax?${encodeURIComponent(JSON.stringify(payload))}`, { credentials: 'include' });
  if (!r.ok) throw new Error('opp save failed');
  let resp = {}; try { resp = JSON.parse(await r.text()); } catch (x) {}
  return { payload, resp };
}
/* Snooze mailer — weeks number (page sends it as snoozePoints verbatim). */
async function crmSnooze(customerID, weeks) {
  const base = crmOrigin();
  const obj = { customerID: Number(customerID), snoozePoints: Number(weeks) || 0 };
  const r = await fetch(`${base}/golfballs/crm/Admin/Mailer/UpdateSnoozeTime.ajax?${encodeURIComponent(JSON.stringify(obj))}`, { credentials: 'include' });
  if (!r.ok) throw new Error('snooze failed');
}
async function crmGetSnoozeWeeks(customerID) {
  try {
    const r = await fetch(`${crmOrigin()}/golfballs/crm/Admin/Mailer/GetSnoozePoints.ajax?${customerID}`, { credentials: 'include' });
    const pts = Number(await r.text());
    return Number.isFinite(pts) ? Math.round(pts / 3) : '';
  } catch (e) { return ''; }
}
async function crmGetActivity(id) {
  const r = await fetch(`${crmOrigin()}/golfballs/crm/Admin/Activity/Get.ajax?${id}`, { credentials: 'include' });
  return JSON.parse(await r.text());
}
/* Alt lookup — lookupTypeId 1 = Email, 2 = Phone (from SaveLookup). */
async function crmCreateLookup(contactId, lookupTypeId, content) {
  const base = crmOrigin();
  const obj = { lookupTypeId: Number(lookupTypeId), content: String(content), contactId: Number(contactId) };
  const r = await fetch(`${base}/golfballs/crm/Admin/Lookup/Create.ajax?${encodeURIComponent(JSON.stringify(obj))}`, { credentials: 'include' });
  if (!r.ok) throw new Error('lookup failed');
}

/* Breadcrumb trail: before navigating away, stash where we are so the
   destination can offer a "back to …" crumb. sessionStorage survives the
   same-tab navigation; the destination only trusts it when document.referrer
   matches (so a stale entry never shows a wrong back-link). */
const BACK_KEY = '__gbBackTo';
function recordBackTo(label) {
  try { window.sessionStorage.setItem(BACK_KEY, JSON.stringify({ href: window.location.href, label: label || '' })); } catch (e) {}
}
function readBackTo() {
  try {
    const raw = window.sessionStorage.getItem(BACK_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && v.href && v.href === document.referrer) return v;
  } catch (e) {}
  return null;
}

/* Compact theme switcher — writes the global gbTheme (applyTheme + saveTheme),
   so it persists and syncs everywhere, no Settings trip needed. */
/* Per-variant swatch colors (accent + deep surface), pulled from theme.css.
   Hardcoded because the [data-theme] token rules live in the document, not
   in our shadow tree, so a nested data-theme element wouldn't pick them up. */
const THEME_SWATCH = {
  dark:     { a: '#8fce2e', s: '#0a0b0c' },
  midnight: { a: '#a3e030', s: '#16181d' },
  light:    { a: '#4d6b14', s: '#e6e7ea' },
  cream:    { a: '#5a7a14', s: '#e6dfd0' },
  nord:     { a: '#88c0d0', s: '#242933' },
  dracula:  { a: '#bd93f9', s: '#21222c' },
  rose:     { a: '#ebbcba', s: '#16141f' },
  tokyo:    { a: '#7aa2f7', s: '#16161e' },
};
function ThemeSwatch({ id, size = 16 }) {
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

/* Custom theme dropdown — trigger + themed popover with swatches. Writes the
   global gbTheme (applyTheme + saveTheme) so it persists + syncs, no Settings
   trip. Outside-click / Escape close; composedPath keeps it shadow-DOM-safe. */
function ThemeSelector() {
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
/* Account detail page (Page=271 & accountID=…), per the original HTML. */
function accountHref(accId) {
  try { return new URL('Default.aspx?Page=271&accountID=' + accId, window.location.href).href; }
  catch (e) { return 'Default.aspx?Page=271&accountID=' + accId; }
}
/* Opportunity detail page (Page=280 & opportunityID=…), per the source HTML. */
function oppHref(id) {
  try { return new URL('Default.aspx?Page=280&opportunityID=' + id, window.location.href).href; }
  catch (e) { return 'Default.aspx?Page=280&opportunityID=' + id; }
}

/* Real CRM sidebar Page ids, extracted from the live Contact Details HTML.
   (Custom Rep Activity has no link in the source — left inert.) */
const CRM_CHILD_PAGE = {
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
/* Childless top-level groups that are themselves a destination. */
const TOP_PAGE = { dashboard: 18 };

/* ════════════════════════════════════════════════════════════
   LEFT SIDEBAR — primary admin nav
════════════════════════════════════════════════════════════ */
const NAV = [
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

function Sidebar({ collapsed, setCollapsed }) {
  const D = useD();
  const [openIds, setOpenIds] = useState(['crm']);
  const toggle = (id) => setOpenIds((s) => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const currentLabel = 'Customer · #' + (D.ids.contact || '');

  return (
    <aside style={{
      ...ARMOR,
      fontFamily: 'var(--gb-font-sans)', color: 'var(--gb-text-tertiary)',
      width: collapsed ? 56 : 232, flexShrink: 0,
      background: 'var(--gb-surface-canvas)',
      borderRight: '1px solid var(--gb-border-subtle)',
      // Fill the flex row's height (the viewport) — NOT 100vh, which the
      // page zoom would inflate past the screen. The nav scrolls inside.
      height: '100%', alignSelf: 'stretch',
      display: 'flex', flexDirection: 'column',
      /* clearly-visible open/close slide; overflow:hidden clips content
         as the width animates so it slides rather than reflowing abruptly */
      transition: 'width 0.28s cubic-bezier(.4,0,.2,1)',
      willChange: 'width',
      overflow: 'hidden',
    }}>
      {/* Brand + collapse/expand toggle. When collapsed, the brand row
          becomes a single centered expand button so the sidebar can always
          be reopened. */}
      <div style={{
        height: 48, display: 'flex', alignItems: 'center',
        padding: collapsed ? '0' : '0 14px',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: 8, borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0,
      }}>
        {collapsed ? (
          <IconBtn size="sm" icon={<I.chevr />} onClick={() => setCollapsed(false)} title="Expand sidebar" />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 7,
                background: 'linear-gradient(135deg, var(--gb-brand) 0%, var(--gb-brand-dark) 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: 'var(--gb-text-on-brand)',
                boxShadow: '0 0 0 1px var(--gb-brand-border)', flexShrink: 0,
              }}>GB</div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1, whiteSpace: 'nowrap' }}>Golfballs Admin</span>
            </div>
            <IconBtn size="xs" ghost icon={<I.chevr style={{ transform: 'scaleX(-1)' }} />} onClick={() => setCollapsed(true)} title="Collapse sidebar" />
          </>
        )}
      </div>

      {/* Nav — scrolls inside the fixed-height sidebar */}
      <nav className="gb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
        {NAV.map((g) => {
          const isOpen = openIds.includes(g.id);
          const hasChildren = Array.isArray(g.children) && g.children.length > 0;
          return (
            <div key={g.id} style={{ marginBottom: 1 }}>
              <button onClick={() => { if (hasChildren && !collapsed) toggle(g.id); else if (TOP_PAGE[g.id]) crmGo(TOP_PAGE[g.id]); }}
                title={collapsed ? g.label : undefined}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  gap: 10, padding: collapsed ? '8px 0' : '7px 10px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  background: g.active ? 'var(--gb-brand-tint-soft)' : 'transparent',
                  border: '1px solid ' + (g.active ? 'var(--gb-brand-tint-border)' : 'transparent'),
                  borderRadius: 'var(--gb-r-sm)',
                  cursor: 'pointer', textAlign: 'left',
                  color: g.active ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
                  fontFamily: 'var(--gb-font-sans)',
                  fontSize: 12, fontWeight: g.active ? 700 : 600, letterSpacing: -.05,
                  transition: 'all var(--gb-anim)',
                }}
                onMouseEnter={(e) => { if (!g.active) e.currentTarget.style.background = 'var(--gb-fill-subtle)'; e.currentTarget.style.color = 'var(--gb-text-primary)'; }}
                onMouseLeave={(e) => { if (!g.active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--gb-text-tertiary)'; } }}
              >
                {React.cloneElement(g.icon, { size: 14 })}
                {!collapsed && <span style={{ flex: 1 }}>{g.label}</span>}
                {!collapsed && hasChildren && (
                  <I.chevd size={10} style={{
                    transform: isOpen ? 'rotate(0)' : 'rotate(-90deg)',
                    transition: 'transform var(--gb-anim)',
                    opacity: .6,
                  }} />
                )}
              </button>
              {/* Children — animated open/close (max-height + opacity)
                  instead of an instant pop. */}
              {!collapsed && hasChildren && (
                <div style={{
                  overflow: 'hidden',
                  maxHeight: isOpen ? 800 : 0,
                  opacity: isOpen ? 1 : 0,
                  transition: 'max-height .28s cubic-bezier(.4,0,.2,1), opacity .2s ease',
                }}>
                <div style={{ padding: '2px 0 6px 22px', display: 'flex', flexDirection: 'column' }}>
                  {g.children.map((c, i) => {
                    const obj = typeof c === 'string' ? { label: c } : c;
                    const label = obj.current ? currentLabel : obj.label;
                    const page = (!obj.current && CRM_CHILD_PAGE[obj.label]) || null;
                    const href = page ? crmHref(page) : '#';
                    return (
                      <a key={i} href={href}
                        onClick={(e) => { e.preventDefault(); if (page) crmGo(page); }}
                        style={{
                          display: 'block', position: 'relative',
                          padding: '5px 10px 5px 14px',
                          fontSize: 11.5, color: obj.current ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
                          textDecoration: 'none', fontWeight: obj.current ? 700 : 500,
                          borderLeft: '1px solid var(--gb-border-subtle)',
                          background: obj.current ? 'var(--gb-brand-tint-soft)' : 'transparent',
                          borderRadius: '0 4px 4px 0',
                          transition: 'all var(--gb-anim)',
                        }}
                        onMouseEnter={(e) => { if (!obj.current) e.currentTarget.style.color = 'var(--gb-text-primary)'; }}
                        onMouseLeave={(e) => { if (!obj.current) e.currentTarget.style.color = 'var(--gb-text-muted)'; }}
                      >
                        {obj.current && (
                          <span style={{
                            position: 'absolute', left: -1, top: 4, bottom: 4, width: 2,
                            background: 'var(--gb-brand-label)', borderRadius: 2,
                          }} />
                        )}
                        {label}
                      </a>
                    );
                  })}
                </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: 10, borderTop: '1px solid var(--gb-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0,
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}>
        <span style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--gb-brand), var(--gb-brand-dark))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10.5, fontWeight: 700, color: 'var(--gb-text-on-brand)', flexShrink: 0,
        }}>CU</span>
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Cullen</div>
            <div style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>BDR · P5 Territory</div>
          </div>
        )}
        {!collapsed && <IconBtn size="xs" ghost icon={<I.cog />} />}
      </div>
    </aside>
  );
}

/* ════════════════════════════════════════════════════════════
   TOP BAR
════════════════════════════════════════════════════════════ */
/* Build a custom-page URL for an indexed record (contact_<n> / account_<n>). */
function recUrl(rec) {
  const parts = String((rec && rec.id) || '').split('_');
  const type = parts[0], num = parts[1];
  try {
    if (type === 'contact' && num) return new URL('Default.aspx?Page=240&customerID=' + num, window.location.href).href;
    if (type === 'account' && num) return new URL('Default.aspx?Page=271&accountID=' + num, window.location.href).href;
  } catch (e) {}
  return '';
}

/* Inline header search — typeahead over the local CRM index (getAllIndexed),
   dropdown results, Enter/click navigates to the record's custom page. Does
   NOT open the full CRM modal; that's reachable via the full-search button.
   "/" focuses it (shadow-safe via composedPath). */
function InlineSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const records = useRef([]);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => { try { getAllIndexed().then((r) => { records.current = r || []; }).catch(() => {}); } catch (e) {} }, []);

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
    let res = [];
    try { res = val.trim() ? searchIndexed(records.current, val, { limit: 8 }) : []; } catch (e) {}
    setResults(res); setActive(0); setOpen(true);
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

function TopBar() {
  const D = useD();
  const name = fullName(D.contact) || 'Contact';
  return (
    <div style={{
      height: 48, flexShrink: 0,
      background: 'var(--gb-surface-canvas)',
      borderBottom: '1px solid var(--gb-border-subtle)',
      display: 'flex', alignItems: 'center',
      padding: '0 18px', gap: 18, position: 'sticky', top: 0, zIndex: 10,
    }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--gb-text-muted)', fontWeight: 500 }}>
        <a href={crmHref(261)} onClick={(e) => { e.preventDefault(); crmGo(261); }} style={{ color: 'inherit', textDecoration: 'none' }}>CRM</a><I.chevr size={10} />
        <a href={crmHref(360)} onClick={(e) => { e.preventDefault(); crmGo(360); }} style={{ color: 'inherit', textDecoration: 'none' }}>Customers</a><I.chevr size={10} />
        <span style={{ color: 'var(--gb-text-secondary)', fontWeight: 600 }}>{name}</span>
        {D.ids.contact && <span style={{ marginLeft: 6, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-ghost)', fontSize: 10.5 }}>#{D.ids.contact}</span>}
      </div>
      <div style={{ flex: 1 }} />
      <InlineSearch />
      <ThemeSelector />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   HERO / PROFILE CARD
════════════════════════════════════════════════════════════ */
const AVATAR_COLOR = '#3a5f7d';
function Hero() {
  const D = useD();
  const { openModal } = useModal();
  const c = D.contact, a = D.account;
  // "City, ST 71801" — city/state comma-joined, zip space-appended.
  const cityState = [a.city, c.state].filter(Boolean).join(', ');
  const loc = [cityState, c.zipCode].filter(Boolean).join(' ').trim();
  const years = yearsSince(a.createdDate);
  const territory = txt(a.territoryName);
  return (
    <Card pad={0}>
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 0 }}>
        {/* Avatar block */}
        <div style={{
          padding: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRight: '1px solid var(--gb-border-subtle)',
          background: 'radial-gradient(circle at 50% 40%, var(--gb-fill-soft), transparent 70%)',
          position: 'relative',
        }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%',
            background: `linear-gradient(135deg, ${AVATAR_COLOR}, color-mix(in srgb, ${AVATAR_COLOR} 60%, black))`,
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, fontWeight: 700, letterSpacing: -.5,
            boxShadow: '0 1px 0 var(--gb-fill-soft), inset 0 1px 0 rgba(255,255,255,.15), 0 0 0 4px var(--gb-surface-1), 0 0 0 5px var(--gb-border-subtle)',
            position: 'relative',
          }}>
            {initials(c.firstName, c.lastName)}
            <div style={{
              position: 'absolute', bottom: 2, right: 2,
              width: 18, height: 18, borderRadius: '50%',
              background: 'var(--gb-success)',
              border: '3px solid var(--gb-surface-1)',
              boxShadow: '0 0 6px var(--gb-success)',
            }} />
          </div>
        </div>

        {/* Info */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{
              margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: -.4,
              color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)',
            }}>{fullName(c) || 'Unknown Contact'}</h1>
            {territory && <Tag tone="brand" size="md" icon={<I.briefcase />}>{territory}{a.salesRep ? ' · ' + a.salesRep : ''}</Tag>}
            {a.industry && <Tag tone="info" size="md">{a.industry}</Tag>}
            {years != null && <Tag tone="neutral" size="md">Active · {years}y</Tag>}
            {D.ids.contact && <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 11, color: 'var(--gb-text-muted)', marginLeft: 'auto' }}>#{D.ids.contact}</span>}
          </div>

          {/* Account link */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            fontSize: 13, color: 'var(--gb-text-tertiary)', fontWeight: 500, flexWrap: 'wrap',
          }}>
            <I.briefcase size={13} style={{ color: 'var(--gb-text-muted)' }} />
            <span>Works at</span>
            <a href={D.ids.account ? accountHref(D.ids.account) : '#'}
              onClick={(e) => { e.preventDefault(); if (D.ids.account) { recordBackTo((fullName(c) || 'Contact') + ' · #' + (D.ids.contact || '')); goUrl(accountHref(D.ids.account)); } }}
              style={{
                color: 'var(--gb-brand-label)', fontWeight: 600, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                cursor: D.ids.account ? 'pointer' : 'default',
              }}>
              {txt(a.name) || 'Account'}
              <I.ext size={11} />
            </a>
            {c.jobTitle && (<><span style={{ color: 'var(--gb-text-ghost)' }}>·</span><span>{c.jobTitle}</span></>)}
          </div>

          {/* Contact strip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
            paddingTop: 6, borderTop: '1px dashed var(--gb-border-subtle)', marginTop: 2,
          }}>
            <ContactPill icon={<I.mail />}  label="Email" value={txt(c.email) || DASH} muted={isEmpty(c.email)} />
            <ContactPill icon={<I.phone />} label="Phone" value={txt(c.phone) || DASH} muted={isEmpty(c.phone)} />
            <ContactPill icon={<I.pin />}   label="Location" value={loc || DASH} muted={!loc} />
            <ContactPill icon={<I.linkedin />} label="LinkedIn" value={c.linkedInUrl ? 'Profile' : 'Add link'} muted={!c.linkedInUrl} />
          </div>
        </div>

        {/* Actions */}
        <div style={{
          padding: 18, display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0,
          borderLeft: '1px solid var(--gb-border-subtle)',
          background: 'var(--gb-fill-faint)',
          minWidth: 200,
        }}>
          <Btn variant="primary" icon={<I.edit />} full onClick={() => openModal(<ContactEditModal />)}>Edit Contact</Btn>
          <Btn variant="tinted" status="info" icon={<I.phone />} full onClick={() => { try { window.__gbShowCallLogModal && window.__gbShowCallLogModal(); } catch (e) {} }}>Log Call</Btn>
          <Btn variant="tinted" status="info" icon={<I.send />} full onClick={() => { try { window.__gbOpenTemplate && window.__gbOpenTemplate(); } catch (e) {} }}>Send Email</Btn>
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <DncButton />
            <IconBtn size="sm" icon={<I.more />} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function ContactPill({ icon, label, value, muted }) {
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

/* ════════════════════════════════════════════════════════════
   STATS STRIP — 6 KPI cards
════════════════════════════════════════════════════════════ */
function StatsStrip() {
  const D = useD();
  const s = D.stats;
  const last = daysAgo(s.lastOrderDate);
  const removed = num(s.mailerRemoved) ? true : false;
  const cells = [
    { label: 'Lifetime Revenue', value: fmt$(s.totalRevenue), sub: `${num(s.orderCount) ?? 0} orders`, tone: 'brand', glow: true },
    { label: 'Orders',           value: num(s.orderCount) ?? 0,  sub: 'avg ' + fmt$(s.avgOrderSize) },
    { label: 'YTD Revenue',      value: fmt$(s.ytdRevenue),   sub: 'this year' },
    { label: 'Prior Year',       value: fmt$(s.priorYearRevenue), sub: 'last year' },
    { label: 'Last Order',       value: fmtDate(s.lastOrderDate), sub: last != null ? `${last} days ago` : '', mono: true },
    { label: 'Mailer Status',    value: removed ? 'Removed' : 'Subscribed', sub: `${num(s.mailerPoints) ?? 0} points`, tone: removed ? 'neutral' : 'success' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
      {cells.map((c, i) => (
        <Card key={i} className="gbcp-stat" pad="14px 16px" style={{
          ...(c.tone === 'brand' ? { background: 'var(--gb-brand-tint-soft)', borderColor: 'var(--gb-brand-tint-border)' } : null),
        }}>
          <div style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase',
            color: c.tone === 'brand' ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
          }}>{c.label}</div>
          <div style={{
            fontSize: 22, fontWeight: 700, marginTop: 4,
            color: c.tone === 'brand' ? 'var(--gb-brand-label)' :
                   c.tone === 'success' ? 'var(--gb-success-fg)' :
                   'var(--gb-text-primary)',
            fontFamily: c.mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)',
            letterSpacing: -.5, lineHeight: 1.1,
            textShadow: c.glow ? `0 0 18px color-mix(in srgb, var(--gb-brand-label) 35%, transparent)` : 'none',
          }}>{c.value}</div>
          <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 3, fontWeight: 500 }}>{c.sub}</div>
        </Card>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TABS
════════════════════════════════════════════════════════════ */
function Tabs({ active, setActive }) {
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

/* Shared empty-state row for tables */
function EmptyRow({ colSpan, label }) {
  return (
    <tr><td colSpan={colSpan} style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--gb-text-muted)' }}>{label}</td></tr>
  );
}

/* Open our existing email viewer for the i-th email row. The email-preview
   scan stamps tr[data-gb-ep="1"] on the host rows and wires each to
   __gbOpenEmailPreview; our list is in the same DOM order, so clicking the
   matching host row opens the viewer (it mounts above the takeover). */
function openEmailRow(i) {
  try {
    const rows = document.querySelectorAll('tr[data-gb-ep="1"]');
    const r = rows[i];
    if (r && typeof r.click === 'function') r.click();
  } catch (e) {}
}
/* Download the i-th email's .eml — clicks the host row's download anchor
   (email-preview lets that native link through). */
function downloadEmailRow(i) {
  try {
    const rows = document.querySelectorAll('tr[data-gb-ep="1"]');
    const a = rows[i] && rows[i].querySelector('a[href]');
    if (a) a.click();
  } catch (e) {}
}

/* Editable key-value row — value, or an input when `editing`. UI only for
   now (uncontrolled); save wiring comes later. */
function EKV({ label, value, editing, mono, field, onEdit }) {
  if (!editing) return <KV label={label} mono={mono}>{value}</KV>;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '128px 1fr', gap: 12,
      padding: '5px 0', borderBottom: '1px dashed var(--gb-border-subtle)',
      alignItems: 'center', minHeight: 28,
    }}>
      <span style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontWeight: 500 }}>{label}</span>
      <input defaultValue={(value === 0 || value) ? String(value) : ''}
        readOnly={!(field && onEdit)}
        onChange={field && onEdit ? (e) => onEdit(field, e.target.value) : undefined}
        style={{
          width: '100%', height: 26, padding: '0 8px', boxSizing: 'border-box',
          background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-sm)', color: 'var(--gb-text-primary)',
          opacity: (field && onEdit) ? 1 : 0.55,
          fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)', fontSize: 12, outline: 'none',
        }} />
    </div>
  );
}

/* Card header edit control: Edit ↔ Save/Cancel. onSave (async) persists; when
   absent, Save just exits edit mode (cards still being wired). */
function EditToggle({ editing, setEditing, onSave }) {
  const [busy, setBusy] = useState(false);
  if (!editing) return <Btn variant="ghost" size="sm" icon={<I.edit />} onClick={() => setEditing(true)}>Edit</Btn>;
  const save = async () => {
    if (!onSave) { setEditing(false); return; }
    setBusy(true);
    try { await onSave(); setEditing(false); } catch (e) { /* toast handled in onSave */ } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <Btn variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TAB PANELS
════════════════════════════════════════════════════════════ */

/* — Activity timeline — */
/* The clean "type" the design colors by — derived from the loose category
   text PLUS the subject, since the engine gives a category (Detail / Exit /
   Starting / Email…) that's loose labeling, not a tidy enum. Machine /
   workflow events (exits, recycles, automated sends, stage changes) have no
   clearer signal, so they fall through to the blue cog. */
function activityType(a) {
  const s = ((a.category || '') + ' ' + (a.subject || '')).toLowerCase();
  if (/\b(image|proof|logo|art file|mockup)\b/.test(s)) return { key: 'image', icon: <I.camera />, tone: 'error' };
  if (/\b(email|e-mail)\b|email sent|followup email/.test(s)) return { key: 'email', icon: <I.mail />, tone: 'warning' };
  if (/\b(call|phone|voicemail|vm)\b|left a message/.test(s)) return { key: 'call', icon: <I.phone />, tone: 'success' };
  if (/\b(chat|case|support)\b/.test(s)) return { key: 'chat', icon: <I.chat />, tone: 'success' };
  if (/\bnote\b|logged a note|comment/.test(s)) return { key: 'note', icon: <I.note />, tone: 'brand' };
  return { key: 'workflow', icon: <I.cog />, tone: 'info' };
}

const ACTIVITY_TYPES = [
  { key: 'all',      label: 'All types', icon: <I.history />, tone: 'neutral' },
  { key: 'email',    label: 'Email',     icon: <I.mail />,    tone: 'warning' },
  { key: 'call',     label: 'Call',      icon: <I.phone />,   tone: 'success' },
  { key: 'chat',     label: 'Chat',      icon: <I.chat />,    tone: 'success' },
  { key: 'note',     label: 'Note',      icon: <I.note />,    tone: 'brand' },
  { key: 'image',    label: 'Image',     icon: <I.camera />,  tone: 'error' },
  { key: 'workflow', label: 'Workflow',  icon: <I.cog />,     tone: 'info' },
];
function typeSwatch(tone) {
  return tone === 'neutral'
    ? { bg: 'var(--gb-fill-subtle)', bd: 'var(--gb-border-default)', fg: 'var(--gb-text-tertiary)' }
    : { bg: `var(--gb-${tone}-tint-medium)`, bd: `var(--gb-${tone}-tint-border)`, fg: `var(--gb-${tone}-fg)` };
}
/* Animated type-filter dropdown for the activity feed. */
function ActivityFilter({ value, onChange, counts }) {
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
function ActivityRow({ a, last }) {
  const [hover, setHover] = useState(false);
  const { openModal } = useModal();
  const meta = activityType(a);
  const clickable = !!a.id;
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={clickable ? () => openModal(<ActivityDetailModal activityId={a.id} />) : undefined}
      title={clickable ? 'View activity detail' : undefined}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '11px 18px',
        cursor: clickable ? 'pointer' : 'default',
        borderBottom: last ? 'none' : '1px solid var(--gb-border-subtle)',
        background: hover ? 'var(--gb-fill-faint)' : 'transparent',
        transition: 'background var(--gb-anim)',
      }}>
      <span style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 1,
        background: `var(--gb-${meta.tone}-tint-medium)`,
        border: `1px solid var(--gb-${meta.tone}-tint-border)`,
        color: `var(--gb-${meta.tone}-fg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{React.cloneElement(meta.icon, { size: 13 })}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--gb-text-primary)', fontWeight: 500, lineHeight: 1.45 }}>
          {a.subject || <span style={{ color: 'var(--gb-text-ghost)' }}>—</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
          {a.category && <Tag tone={meta.tone} size="xs">{a.category}</Tag>}
          {a.direction && <Tag tone="neutral" size="xs">{a.direction}</Tag>}
          {a.employee && <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontWeight: 600 }}>{a.employee}</span>}
        </div>
      </div>
      <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 3 }}>{fmtDateTime(a.date)}</span>
    </div>
  );
}
function ActivityPanel() {
  const D = useD();
  const rows = D.activities;
  const [filter, setFilter] = useState('all');
  const counts = useMemo(() => {
    const c = { all: rows.length };
    rows.forEach((a) => { const k = activityType(a).key; c[k] = (c[k] || 0) + 1; });
    return c;
  }, [rows]);
  const filtered = filter === 'all' ? rows : rows.filter((a) => activityType(a).key === filter);
  return (
    // overflow:visible + raised z so the filter dropdown isn't clipped by the
    // card (or covered by the panels below) when the list is short.
    <Card style={{ overflow: 'visible', position: 'relative', zIndex: 2 }}>
      <SectionTitle
        icon={<I.history />}
        title="Activity Feed"
        count={filter === 'all' ? `${rows.length}` : `${filtered.length} of ${rows.length}`}
        sub="System, workflow, and human-logged events"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <ActivityFilter value={filter} onChange={setFilter} counts={counts} />
            <Btn variant="tinted" size="sm" icon={<I.plus />} onClick={() => { try { window.__gbOpenNote && window.__gbOpenNote({}); } catch (e) {} }}>Add note</Btn>
          </div>
        }
      />
      <ScrollArea max={460}>
        {/* key by filter → the list fades/slides in on each filter change */}
        <div key={filter} style={{ animation: 'gb-fade-slide var(--gb-anim) both' }}>
          {filtered.map((a, idx) => <ActivityRow key={idx} a={a} last={idx === filtered.length - 1} />)}
          {filtered.length === 0 && (
            <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--gb-text-muted)' }}>
              {rows.length ? 'No matching activity.' : 'No activity recorded.'}
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}

/* — Orders & Items — */
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 11.5 };
const trStyle = { borderBottom: '1px solid var(--gb-border-subtle)' };
function Th({ children, align = 'left', style }) {
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
function Td({ children, align = 'left', mono, muted, style }) {
  return <td style={{
    padding: '10px 14px', textAlign: align, verticalAlign: 'middle',
    fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)',
    fontSize: 11.5, color: muted ? 'var(--gb-text-muted)' : 'var(--gb-text-secondary)',
    fontWeight: 500, ...style,
  }}>{children}</td>;
}

/* Brand letter-badges for ordered items — NOT logos, a colored letter mark per
   brand (T = Titleist, V = Venture, B = Bridgestone…). Matched by name
   substring, longest match wins. Curated from the golf brands the corporate
   catalog carries; extend as needed. */
const BRANDS = [
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
function brandFor(name) {
  const s = (name || '').toLowerCase();
  let best = null, bestLen = 0;
  for (const b of BRANDS) {
    for (const m of b.m) {
      if (m.length > bestLen && s.indexOf(m) !== -1) { best = b; bestLen = m.length; }
    }
  }
  return best;
}
function BrandBadge({ name, size = 22 }) {
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

/* — Logo Proofs — artwork proofs + mockups extracted from the proofing
   portlet (data.proofs: name/date/kind/status + image & PDF URLs). */
function proofTone(status) {
  const s = (status || '').toLowerCase();
  if (/approv|complete|done|ready/.test(s)) return 'success';
  if (/reject|declin|fail|cancel/.test(s)) return 'error';
  if (/pend|submit|review|wait|progress/.test(s)) return 'warning';
  return 'neutral';
}
/* Re-encode a (CORS-clean) image blob to PNG via canvas — clipboard.write
   reliably accepts image/png; jpegs etc. often get rejected. */
function blobToPng(blob) {
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
function ProofCard({ p }) {
  const [imgOk, setImgOk] = useState(true);
  const [hover, setHover] = useState(false);
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
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => { if (p.history) goUrl(p.history); }}
      title={p.history ? 'View proof history' : undefined}
      style={{
        width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRadius: 'var(--gb-r-md)', overflow: 'hidden',
        border: '1px solid ' + (hover ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'),
        background: 'var(--gb-surface-1)',
        cursor: p.history ? 'pointer' : 'default',
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? '0 3px 8px rgba(0,0,0,.14)' : '0 0 0 transparent',
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
function ProofsPanel() {
  const D = useD();
  const rows = D.proofs;
  if (rows.length === 0) return null;   // only show when there are proofs
  return (
    <Card>
      <SectionTitle icon={<I.camera />} title="Logo Proofs" count={rows.length} sub="Artwork proofs & mockups" />
      {/* horizontal strip of proof cards (SubmitProof-style), custom scrollbar */}
      <div className="gb-scroll" style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: 14, overflowX: 'auto', overflowY: 'hidden' }}>
        {rows.map((p, i) => <ProofCard key={i} p={p} />)}
      </div>
    </Card>
  );
}

function OrdersPanel() {
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

/* — Emails — */
function EmailsPanel() {
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
function DirArrow({ dir }) {
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

/* — Tasks — */
const QUICK_TASK = ['F-UP', 'P F-UP', 'P F-UP #2', 'PY2', 'PY3', 'SP-C', 'SP-E', 'SP-E2'];
function priTone(p) {
  const s = (p || '').toLowerCase();
  if (s.indexOf('high') !== -1) return 'error';
  if (s.indexOf('med') !== -1) return 'warning';
  return 'neutral';
}
/* ── Native modal shell + form primitives ───────────────────────── */
const inputStyle = {
  width: '100%', height: 30, padding: '0 9px', boxSizing: 'border-box',
  background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)',
  borderRadius: 'var(--gb-r-sm)', color: 'var(--gb-text-primary)',
  fontFamily: 'var(--gb-font-sans)', fontSize: 12, outline: 'none',
  colorScheme: 'dark',   // theme the native date/number pickers to the dark UI
};
/* Use the shared component-library Field/Input/Textarea so the modal forms
   match the rest of the extension (and the native date/number controls are
   themed). TInput/TArea adapt the call sites' event-style onChange to the
   components' value-style onChange so the forms didn't need rewriting. */
function FormField({ label, children, style }) {
  return <UIField label={label} style={style}>{children}</UIField>;
}
function TInput({ onChange, ...rest }) {
  return <UIInput {...rest} onChange={(v) => onChange && onChange({ target: { value: v } })} />;
}
function TArea({ onChange, ...rest }) {
  return <UITextarea resize="vertical" {...rest} onChange={(v) => onChange && onChange({ target: { value: v } })} />;
}
/* Custom dropdown for modals — the shared Dropdown portals to document.body
   which renders UNDER the in-shadow takeover, so we roll our own. The options
   open IN-FLOW (not absolute), so they grow the modal's footprint instead of
   being clipped by its rounded overflow — exactly what was wanted. */
function MiniSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { const p = (e.composedPath && e.composedPath()) || []; if (ref.current && p.indexOf(ref.current) === -1) setOpen(false); };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [open]);
  const cur = options.find((o) => String(o.value) === String(value)) || options[0];
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
        <span>{cur ? cur.label : ''}</span>
        <I.chevd size={12} style={{ transition: 'transform var(--gb-anim)', transform: open ? 'rotate(180deg)' : 'none', color: 'var(--gb-text-muted)' }} />
      </button>
      {open && (
        <div className="gb-scroll" style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
          maxHeight: 220, overflowY: 'auto',
          padding: 4, background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-md)', boxShadow: 'var(--gb-shadow-popover)',
          display: 'flex', flexDirection: 'column', gap: 1, animation: 'gb-fade-slide var(--gb-anim) both',
        }}>
          {options.map((o) => {
            const sel = String(o.value) === String(value);
            return (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', border: 0, borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--gb-font-sans)', fontSize: 12, fontWeight: sel ? 700 : 500, background: sel ? 'var(--gb-brand-tint-soft)' : 'transparent', color: sel ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
const PRIORITY_OPTS = [{ value: '1', label: 'High' }, { value: '2', label: 'Med' }, { value: '3', label: 'Low' }];
function ModalShell({ title, icon, subtitle, children, footer, width = 460 }) {
  const { closeModal, closing } = useModal();
  return (
    <div onMouseDown={(e) => e.stopPropagation()}
      style={{
        width, maxWidth: '92%', display: 'flex', flexDirection: 'column',
        background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-lg)', boxShadow: 'var(--gb-shadow-modal, 0 24px 64px rgba(0,0,0,.5))',
        // scale the modal to match the page (the takeover renders at PAGE_ZOOM;
        // the overlay is a 1x sibling, so without this the modal looks tiny).
        // overflow visible so a MiniSelect popover floats IN FRONT of the modal
        // instead of being clipped; header/footer wrappers keep rounded corners.
        zoom: PAGE_ZOOM, overflow: 'visible',
        animation: closing ? 'gb-pop-out .19s ease both' : 'gb-pop-in .22s cubic-bezier(.34,1.4,.64,1) both',
      }}>
      <div style={{ borderRadius: 'var(--gb-r-lg) var(--gb-r-lg) 0 0', overflow: 'hidden' }}>
        <ModalHeader icon={icon} title={title} subtitle={subtitle} onClose={closeModal} />
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
      {footer && <div style={{ borderRadius: '0 0 var(--gb-r-lg) var(--gb-r-lg)', overflow: 'hidden' }}><ModalFooter>{footer}</ModalFooter></div>}
    </div>
  );
}

/* Edit Task — loads the task, edits subject/description/due/priority, saves. */
function EditTaskModal({ taskId }) {
  const { closeModal } = useModal();
  const patch = usePatch();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [t, setT] = useState({ Subject: '', Description: '', DueDate: '', Priority: '2' });
  useEffect(() => {
    let live = true;
    crmGetTask(taskId)
      .then((o) => { if (live) { setT({ Subject: o.Subject || '', Description: o.Description || '', DueDate: o.DueDate || '', Priority: String(o.Priority || 2) }); setLoading(false); } })
      .catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [taskId]);
  const save = async () => {
    setBusy(true);
    try {
      await crmUpdateTaskFull(taskId, t);
      patch((D) => ({ ...D, openTasks: (D.openTasks || []).map((x) => x.id === taskId ? { ...x, subject: t.Subject, dueDate: t.DueDate, priority: priLabel(t.Priority) } : x) }));
      closeModal();
    } catch (e) { gbToast('Could not update task', 'error'); setBusy(false); }
  };
  return (
    <ModalShell title="Edit Task" icon={<I.task />} footer={<>
      <Btn variant="ghost" size="sm" onClick={closeModal} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={busy || loading}>{busy ? 'Saving…' : 'Save'}</Btn>
    </>}>
      {loading
        ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12 }}>Loading…</div>
        : <>
          <FormField label="Subject"><TInput value={t.Subject} onChange={(e) => setT({ ...t, Subject: e.target.value })} /></FormField>
          <FormField label="Description"><TArea value={t.Description} onChange={(e) => setT({ ...t, Description: e.target.value })} rows={4} /></FormField>
          <div style={{ display: 'flex', gap: 12 }}>
            <FormField label="Due date" style={{ flex: 1 }}><TInput type="date" value={toDateInput(t.DueDate)} onChange={(e) => setT({ ...t, DueDate: fromDateInput(e.target.value) })} /></FormField>
            <FormField label="Priority" style={{ width: 130 }}>
              <MiniSelect value={t.Priority} options={PRIORITY_OPTS} onChange={(v) => setT({ ...t, Priority: v })} />
            </FormField>
          </div>
        </>}
    </ModalShell>
  );
}

/* New Task — native create, optimistically prepended to the open list. */
function AddTaskModal() {
  const { closeModal } = useModal();
  const patch = usePatch();
  const D = useD();
  const [busy, setBusy] = useState(false);
  const [t, setT] = useState({ Subject: '', Description: '', DueDate: '', Priority: '2' });
  const save = async () => {
    if (!t.Subject.trim() || busy) return;
    setBusy(true);
    try {
      const { task, id } = await crmCreateTask(D.ids.contact, t);
      patch((Dd) => ({ ...Dd, openTasks: [{ id, subject: task.Subject, category: '', priority: priLabel(task.Priority), dueDate: task.DueDate, status: 'Open' }, ...(Dd.openTasks || [])] }));
      closeModal();
    } catch (e) { gbToast('Could not create task', 'error'); setBusy(false); }
  };
  return (
    <ModalShell title="New Task" icon={<I.task />} footer={<>
      <Btn variant="ghost" size="sm" onClick={closeModal} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={busy || !t.Subject.trim()}>{busy ? 'Creating…' : 'Create'}</Btn>
    </>}>
      <FormField label="Subject"><TInput autoFocus value={t.Subject} onChange={(e) => setT({ ...t, Subject: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} /></FormField>
      <FormField label="Description"><TArea value={t.Description} onChange={(e) => setT({ ...t, Description: e.target.value })} rows={3} /></FormField>
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="Due date" style={{ flex: 1 }}><TInput type="date" value={toDateInput(t.DueDate)} onChange={(e) => setT({ ...t, DueDate: fromDateInput(e.target.value) })} /></FormField>
        <FormField label="Priority" style={{ width: 130 }}>
          <MiniSelect value={t.Priority} options={PRIORITY_OPTS} onChange={(v) => setT({ ...t, Priority: v })} />
        </FormField>
      </div>
    </ModalShell>
  );
}

/* New / Edit Opportunity — Create or Update; optimistically patches the list. */
function OpportunityModal({ opportunityId }) {
  const { closeModal } = useModal();
  const patch = usePatch();
  const D = useD();
  const editing = !!opportunityId;
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [o, setO] = useState({ opportunityId: opportunityId || '', Subject: '', Description: '', EstimatedValue: '', EstimatedClosedDate: '', OpportunityStageId: '1', empAssignedId: '0' });
  useEffect(() => {
    if (!editing) return;
    let live = true;
    crmGetOpportunity(opportunityId).then((g) => {
      if (!live) return;
      setO({
        opportunityId: String(opportunityId),
        Subject: g.Subject || '', Description: g.Description || '',
        EstimatedValue: g.EstimatedValue != null ? String(g.EstimatedValue) : '',
        EstimatedClosedDate: g.EstimatedClosedDate || g.EstimatedCloseDate || '',
        OpportunityStageId: String(g.OpportunityStageId || g.opportunityStageId || '1'),
        empAssignedId: String(g.empAssignedId || '0'),
      });
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { live = false; };
  }, [opportunityId]);
  const save = async () => {
    if (!o.Subject.trim() || busy) return;
    setBusy(true);
    try {
      const { payload, resp } = await crmSaveOpportunity(D.ids.contact, o);
      const id = payload.opportunityId || resp.opportunityId || `new-${++__gbTaskTmp}`;
      const stageLabel = (OPP_STAGES.find((s) => s.value === payload.OpportunityStageId) || {}).label || '';
      patch((Dd) => {
        const row = { id: String(id), subject: payload.Subject, stage: stageLabel, estimatedValue: Number(payload.EstimatedValue) || 0, estimatedCloseDate: payload.EstimatedClosedDate };
        const list = Dd.opportunities || [];
        const exists = list.some((x) => String(x.id) === String(id));
        return { ...Dd, opportunities: exists ? list.map((x) => String(x.id) === String(id) ? { ...x, ...row } : x) : [row, ...list] };
      });
      closeModal();
    } catch (e) { gbToast('Could not save opportunity', 'error'); setBusy(false); }
  };
  return (
    <ModalShell title={editing ? 'Edit Opportunity' : 'New Opportunity'} icon={<I.target />} width={520} footer={<>
      <Btn variant="ghost" size="sm" onClick={closeModal} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={busy || loading || !o.Subject.trim()}>{busy ? 'Saving…' : 'Save'}</Btn>
    </>}>
      {loading
        ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12 }}>Loading…</div>
        : <>
          <FormField label="Subject"><TInput autoFocus value={o.Subject} onChange={(e) => setO({ ...o, Subject: e.target.value })} /></FormField>
          <FormField label="Description"><TArea value={o.Description} onChange={(e) => setO({ ...o, Description: e.target.value })} rows={3} /></FormField>
          <div style={{ display: 'flex', gap: 12 }}>
            <FormField label="Est. value" style={{ flex: 1 }}><TInput value={o.EstimatedValue} onChange={(e) => setO({ ...o, EstimatedValue: e.target.value })} placeholder="0" /></FormField>
            <FormField label="Est. close" style={{ flex: 1 }}><TInput type="date" value={toDateInputAny(o.EstimatedClosedDate)} onChange={(e) => setO({ ...o, EstimatedClosedDate: toOppDate(e.target.value) })} /></FormField>
          </div>
          <FormField label="Stage"><MiniSelect value={o.OpportunityStageId} options={OPP_STAGES} onChange={(v) => setO({ ...o, OpportunityStageId: v })} /></FormField>
        </>}
    </ModalShell>
  );
}

/* Snooze Mailer — number of weeks (the page sends it as snoozePoints). */
function SnoozeModal() {
  const { closeModal } = useModal();
  const D = useD();
  const [weeks, setWeeks] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; crmGetSnoozeWeeks(D.ids.contact).then((w) => { if (live && w !== '') setWeeks(String(w)); }); return () => { live = false; }; }, []);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try { await crmSnooze(D.ids.contact, weeks); closeModal(); }
    catch (e) { gbToast('Could not snooze mailer', 'error'); setBusy(false); }
  };
  return (
    <ModalShell title="Snooze Mailer" icon={<I.send />} width={380} footer={<>
      <Btn variant="ghost" size="sm" onClick={closeModal} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Snooze'}</Btn>
    </>}>
      <FormField label="Weeks to snooze"><TInput type="number" min="0" autoFocus value={weeks} onChange={(e) => setWeeks(e.target.value)} placeholder="Enter number of weeks…" /></FormField>
    </ModalShell>
  );
}

/* Edit Contact (modal form) — reuses crmUpdateContact (Get → merge → Update,
   so unedited fields are preserved); optimistically patches contact + Hero. */
function ContactEditModal() {
  const { closeModal } = useModal();
  const patch = usePatch();
  const D = useD();
  const c = D.contact;
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    firstName: c.firstName || '', lastName: c.lastName || '', jobTitle: c.jobTitle || '',
    email: c.email || '', phoneNumber: c.phone || '', zipCode: c.zipCode || '', userCountry: c.country || '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await crmUpdateContact(D.ids.contact, f);
      patch((Dd) => ({ ...Dd, contact: { ...Dd.contact, firstName: f.firstName, lastName: f.lastName, jobTitle: f.jobTitle, email: f.email, phone: f.phoneNumber, zipCode: f.zipCode, country: f.userCountry } }));
      closeModal();
    } catch (e) { gbToast('Could not save contact', 'error'); setBusy(false); }
  };
  return (
    <ModalShell title="Edit Contact" icon={<I.user />} width={520} footer={<>
      <Btn variant="ghost" size="sm" onClick={closeModal} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn>
    </>}>
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="First name" style={{ flex: 1 }}><TInput autoFocus value={f.firstName} onChange={set('firstName')} /></FormField>
        <FormField label="Last name" style={{ flex: 1 }}><TInput value={f.lastName} onChange={set('lastName')} /></FormField>
      </div>
      <FormField label="Job title"><TInput value={f.jobTitle} onChange={set('jobTitle')} /></FormField>
      <FormField label="Email"><TInput value={f.email} onChange={set('email')} /></FormField>
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="Phone" style={{ flex: 1 }}><TInput value={f.phoneNumber} onChange={set('phoneNumber')} /></FormField>
        <FormField label="Zip" style={{ width: 110 }}><TInput value={f.zipCode} onChange={set('zipCode')} /></FormField>
        <FormField label="Country" style={{ width: 90 }}><TInput value={f.userCountry} onChange={set('userCountry')} /></FormField>
      </div>
    </ModalShell>
  );
}

/* Add Lookup — Phone (type 2) / Email (type 1) → Lookup/Create. */
function LookupModal() {
  const { closeModal } = useModal();
  const patch = usePatch();
  const D = useD();
  const [type, setType] = useState('2');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await crmCreateLookup(D.ids.contact, type, value.trim());
      patch((Dd) => ({ ...Dd, lookups: [{ type: type === '1' ? 'Email' : 'Phone', value: value.trim() }, ...(Dd.lookups || [])] }));
      closeModal();
    } catch (e) { gbToast('Could not add lookup', 'error'); setBusy(false); }
  };
  return (
    <ModalShell title="Add Lookup" icon={<I.plus />} width={400} footer={<>
      <Btn variant="ghost" size="sm" onClick={closeModal} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={busy || !value.trim()}>{busy ? 'Adding…' : 'Add'}</Btn>
    </>}>
      <FormField label="Type"><MiniSelect value={type} options={[{ value: '2', label: 'Phone' }, { value: '1', label: 'Email' }]} onChange={setType} /></FormField>
      <FormField label="Value"><TInput autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} /></FormField>
    </ModalShell>
  );
}

/* Activity detail — fetches the full activity (subject/description/direction/
   employee/date + parsed MetaData: phone, duration, voicemail, name, email). */
function ActivityDetailModal({ activityId }) {
  const { closeModal } = useModal();
  const [a, setA] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    crmGetActivity(activityId).then((d) => { if (live) setA(d); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [activityId]);
  let meta = {};
  try { if (a && a.MetaData) meta = JSON.parse(a.MetaData); } catch (e) {}
  const row = (label, val) => (val === 0 || val) ? (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px dashed var(--gb-border-subtle)' }}>
      <span style={{ width: 112, fontSize: 11, color: 'var(--gb-text-muted)', fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--gb-text-secondary)' }}>{String(val)}</span>
    </div>
  ) : null;
  return (
    <ModalShell title="Activity Detail" icon={<I.history />} width={480} footer={<Btn variant="ghost" size="sm" onClick={closeModal}>Close</Btn>}>
      {err
        ? <div style={{ padding: 18, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12 }}>Couldn’t load activity.</div>
        : !a
        ? <div style={{ padding: 18, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12 }}>Loading…</div>
        : <>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{a.ActivitySubject || 'Activity'}</div>
          {a.ActivityDescription && <div style={{ fontSize: 12.5, color: 'var(--gb-text-secondary)', lineHeight: 1.5, padding: '9px 11px', background: 'var(--gb-surface-2)', borderRadius: 'var(--gb-r-sm)' }}>{a.ActivityDescription}</div>}
          <div>
            {row('Direction', a.Direction)}
            {row('Employee', a.Employee)}
            {row('Date', a.CreatedDate)}
            {row('Name', [meta.FirstName, meta.LastName].filter(Boolean).join(' '))}
            {row('Phone', meta.PhoneNumber)}
            {row('Email', meta.Email)}
            {meta.Duration ? row('Duration', `${meta.Duration}s`) : null}
            {meta.LeftVoicemail != null ? row('Left voicemail', meta.LeftVoicemail ? 'Yes' : 'No') : null}
          </div>
        </>}
    </ModalShell>
  );
}

/* ── User-defined quick-action templates (persisted in chrome.storage) ──
   Quick Create (tasks) + Quick Log (calls): the rep defines labelled buttons
   that fire the action DIRECTLY — no modal — once configured. Blank initially;
   the + opens the editor; right-click a chip to edit/delete. */
const QT_KEY = 'gbCpQuickTasks';
const QL_KEY = 'gbCpQuickLogs';
function loadTpls(key) {
  return new Promise((res) => {
    try { chrome.storage.local.get(key, (d) => res(Array.isArray(d && d[key]) ? d[key] : [])); }
    catch (e) { res([]); }
  });
}
function useTemplates(key) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let live = true;
    loadTpls(key).then((l) => { if (live) setList(l); });
    const onCh = (ch, area) => { if (area === 'local' && ch[key]) setList(Array.isArray(ch[key].newValue) ? ch[key].newValue : []); };
    try { chrome.storage.onChanged.addListener(onCh); } catch (e) {}
    return () => { live = false; try { chrome.storage.onChanged.removeListener(onCh); } catch (e) {} };
  }, [key]);
  const persist = (next) => { setList(next); try { chrome.storage.local.set({ [key]: next }); } catch (e) {} };
  return {
    list,
    add: (tpl) => persist([...list, { ...tpl, id: `q${Date.now()}${Math.floor(Math.random() * 1e4)}` }]),
    update: (id, tpl) => persist(list.map((x) => (x.id === id ? { ...x, ...tpl } : x))),
    remove: (id) => persist(list.filter((x) => x.id !== id)),
  };
}
/* Pick an EXISTING saved template (your task / call_log templates) and give it
   a button label. Clicking the chip later fires that template directly. */
function loadExisting(kind) { return kind === 'call' ? loadCallTemplates() : loadTaskTemplates(); }
function TemplateModal({ kind, initial, onSave, onDelete }) {
  const { closeModal } = useModal();
  const isCall = kind === 'call';
  const [f, setF] = useState(initial || { label: '', templateId: '' });
  const [opts, setOpts] = useState(null);
  useEffect(() => {
    let live = true;
    loadExisting(kind).then((l) => { if (live) setOpts((l || []).map((t) => ({ value: String(t.id), label: t.name || t.subject || String(t.id) }))); });
    return () => { live = false; };
  }, [kind]);
  const save = () => {
    if (!f.label.trim() || !f.templateId) return;
    const opt = (opts || []).find((o) => o.value === String(f.templateId));
    onSave({ label: f.label.trim(), templateId: String(f.templateId), templateName: opt ? opt.label : '' });
    closeModal();
  };
  return (
    <ModalShell width={440} icon={isCall ? <I.phone /> : <I.task />}
      title={initial ? 'Edit Button' : isCall ? 'New Quick Log' : 'New Quick Task'}
      footer={<>
        {initial && onDelete && <Btn variant="danger" size="sm" onClick={() => { onDelete(); closeModal(); }}>Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm" onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={!f.label.trim() || !f.templateId}>Save</Btn>
      </>}>
      <FormField label="Button label"><TInput value={f.label} autoFocus placeholder={isCall ? 'e.g. Promo VM' : 'e.g. F-UP'} onChange={(e) => setF({ ...f, label: e.target.value })} /></FormField>
      <FormField label={isCall ? 'Call template' : 'Task template'}>
        {opts === null
          ? <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', padding: '6px 0' }}>Loading…</div>
          : opts.length
          ? <MiniSelect value={f.templateId} options={[{ value: '', label: 'Select a template…' }, ...opts]} onChange={(v) => setF({ ...f, templateId: v })} />
          : <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', padding: '6px 0' }}>No saved {isCall ? 'call' : 'task'} templates yet — create them in the {isCall ? 'Call Log' : 'Quick Task'} editor first.</div>}
      </FormField>
    </ModalShell>
  );
}

/* Do-Not-Call: calls the CRM RemoveFromDoNotCallList endpoint directly. */
function DncButton() {
  const D = useD();
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(false);
  const onClick = async () => {
    const id = D.ids.contact;
    if (!id || busy || removed) return;
    setBusy(true);
    try { await crmSetDnc(id, false); setRemoved(true); }   // button shows "Removed" (no toast)
    catch (e) { gbToast('Could not update Do-Not-Call', 'error'); }
    finally { setBusy(false); }
  };
  return (
    <Btn variant="secondary" size="sm" icon={<I.ban />} disabled={busy || removed} onClick={onClick}>
      {removed ? 'Removed from DNC' : busy ? 'Removing…' : 'Remove from DNC'}
    </Btn>
  );
}

/* One open-task row with a working Complete action (optimistic strike-through). */
function OpenTaskRow({ t }) {
  const patch = usePatch();
  const { openModal } = useModal();
  const [state, setState] = useState('idle'); // idle | busy | done
  const complete = async () => {
    if (!t.id || state !== 'idle') return;
    setState('busy');
    try {
      await crmCompleteTask(t.id);
      setState('done');                                       // check fills + strike (no toast)
      setTimeout(() => setState('leaving'), 280);             // then fade/slide out
      setTimeout(() => patch((D) => ({
        ...D,
        openTasks: (D.openTasks || []).filter((x) => x.id !== t.id),
        doneTasks: [{ ...t, status: 'Complete' }, ...(D.doneTasks || [])],   // appears in Completed
      })), 660);
    } catch (e) { setState('idle'); gbToast('Could not complete task', 'error'); }
  };
  const done = state === 'done' || state === 'leaving';
  const leaving = state === 'leaving';
  return (
    <tr style={{
      ...trStyle,
      opacity: leaving ? 0 : (done ? 0.75 : 1),
      transform: leaving ? 'translateX(12px)' : 'none',
      transition: 'opacity .4s ease, transform .4s ease',
    }}>
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={complete} disabled={state !== 'idle'} title="Complete task"
            style={{
              width: 15, height: 15, borderRadius: 4, flexShrink: 0, padding: 0,
              border: '1.5px solid ' + (done ? 'var(--gb-success-fg)' : 'var(--gb-border-strong)'),
              background: done ? 'var(--gb-success-fg)' : 'transparent',
              cursor: state === 'idle' ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {done && <I.check size={10} style={{ color: 'var(--gb-text-on-brand)' }} />}
          </button>
          <span style={{ color: 'var(--gb-text-primary)', fontWeight: 500, textDecoration: done ? 'line-through' : 'none' }}>{t.subject}</span>
        </div>
      </Td>
      <Td muted>{t.category}</Td>
      <Td align="center"><Tag tone={priTone(t.priority)} size="xs">{t.priority || DASH}</Tag></Td>
      <Td align="right" mono><span style={{ color: 'var(--gb-warning-fg)', fontWeight: 600 }}>{fmtDate(t.dueDate)}</span></Td>
      <Td align="right">
        <Btn variant="ghost" size="xs" icon={<I.edit />} disabled={state !== 'idle'} onClick={() => openModal(<EditTaskModal taskId={t.id} />)}>Edit</Btn>
      </Td>
    </tr>
  );
}

function TasksPanel() {
  const D = useD();
  const patch = usePatch();
  const { openModal } = useModal();
  const qt = useTemplates(QT_KEY);
  const [quickTask, setQuickTask] = useState('');
  const [adding, setAdding] = useState(false);
  // Optimistically prepend a row (after a real create) and animate it in.
  const addRow = (row) => patch((Dd) => ({ ...Dd, openTasks: [{ id: `new-${++__gbTaskTmp}`, category: '', status: 'Open', ...row }, ...(Dd.openTasks || [])] }));
  // A quick-task button: fire the referenced saved template directly, no modal.
  const runTaskTemplate = async (chip) => {
    try {
      const all = await loadTaskTemplates();
      const tpl = (all || []).find((t) => String(t.id) === String(chip.templateId));
      if (!tpl) { gbToast('Template not found', 'error'); return; }
      const r = await submitQuickTask({ template: tpl, context: { contactId: D.ids.contact, employeeId: currentEmployeeId() } });
      if (r && r.ok) addRow({ subject: tpl.subject || tpl.name || chip.label, priority: priLabel(tpl.priorityId || tpl.priority || 2), dueDate: todayMDY() });
      else gbToast((r && r.error) || 'Could not create task', 'error');
    } catch (e) { gbToast('Could not create task', 'error'); }
  };
  // Reuse the proven QuickTask composer (correct preset templates, employee
  // resolution, CRM create); animate the row in on its onCreated callback.
  const openComposer = () => {
    try {
      window.__gbShowQuickTaskModal && window.__gbShowQuickTaskModal({
        onCreated: ({ template }) => addRow({
          subject: (template && (template.subject || template.name)) || 'New task',
          priority: priLabel((template && (template.priorityId || template.priority)) || 2),
          dueDate: (template && (template.crmDate || template.dueDate)) || todayMDY(),
        }),
      });
    } catch (e) {}
  };
  // Typed quick-add: subject = exactly what was typed (correct freeform task).
  const quickCreate = async (subject) => {
    const subj = (subject || '').trim();
    if (!subj || adding) return;
    setAdding(true);
    try {
      const { task, id } = await crmCreateTask(D.ids.contact, { Subject: subj });
      addRow({ id, subject: task.Subject, priority: priLabel(task.Priority), dueDate: task.DueDate });
      setQuickTask('');
    } catch (e) { gbToast('Could not create task', 'error'); }
    finally { setAdding(false); }
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <Card>
        <SectionTitle
          icon={<I.task />} title="Open Tasks" count={D.openTasks.length}
          right={<Btn variant="tinted" size="sm" icon={<I.plus />} onClick={openComposer}>New task</Btn>}
        />
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: .7, textTransform: 'uppercase',
            color: 'var(--gb-text-muted)', marginBottom: 8,
          }}>Quick create — one click adds a task (no modal)</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            {qt.list.map((t) => (
              <Btn key={t.id} variant="secondary" size="xs" title="Click to add · right-click to edit"
                onClick={() => runTaskTemplate(t)}
                onContextMenu={(e) => { e.preventDefault(); openModal(<TemplateModal kind="task" initial={t} onSave={(tpl) => qt.update(t.id, tpl)} onDelete={() => qt.remove(t.id)} />); }}>{t.label}</Btn>
            ))}
            <IconBtn size="xs" ghost icon={<I.plus />} title="New quick task" onClick={() => openModal(<TemplateModal kind="task" onSave={qt.add} />)} />
            {qt.list.length === 0 && <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>Add a quick task with +</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <div style={{
              flex: 1, height: 30, borderRadius: 'var(--gb-r-md)',
              background: 'var(--gb-fill-inverse-medium)',
              border: '1px solid var(--gb-border-default)',
              display: 'flex', alignItems: 'center', padding: '0 10px', gap: 7,
            }}>
              <I.bolt size={11} style={{ color: 'var(--gb-text-muted)' }} />
              <input value={quickTask} onChange={(e) => setQuickTask(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') quickCreate(quickTask); }}
                placeholder="Quick add a task… (Enter to save)"
                style={{
                  flex: 1, border: 0, outline: 0, background: 'transparent',
                  fontFamily: 'var(--gb-font-sans)', fontSize: 11.5,
                  color: 'var(--gb-text-primary)',
                }} />
            </div>
            <Btn variant="primary" size="sm" icon={<I.check />} disabled={adding || !quickTask.trim()} onClick={() => quickCreate(quickTask)}>Add</Btn>
          </div>
        </div>
        <ScrollArea max={320}>
        <table style={tableStyle}>
          <thead><tr>
            <Th>Subject</Th>
            <Th>Category</Th>
            <Th align="center">Pri</Th>
            <Th align="right">Due</Th>
            <Th></Th>
          </tr></thead>
          <tbody>
            {D.openTasks.map((t, i) => <OpenTaskRow key={t.id || i} t={t} />)}
            {D.openTasks.length === 0 && <EmptyRow colSpan={5} label="No open tasks." />}
          </tbody>
        </table>
        </ScrollArea>
      </Card>

      <Card>
        <SectionTitle icon={<I.check />} title="Completed Tasks" count={D.doneTasks.length} />
        <ScrollArea max={320}>
        <table style={tableStyle}>
          <thead><tr>
            <Th>Subject</Th>
            <Th>Category</Th>
            <Th align="right">Completed</Th>
          </tr></thead>
          <tbody>
            {D.doneTasks.map((t, i) => (
              <tr key={i} style={trStyle}>
                <Td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 4,
                      background: 'var(--gb-brand-tint-medium)',
                      border: '1.5px solid var(--gb-brand-label)',
                      color: 'var(--gb-brand-label)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}><I.check size={9} sw={3} /></div>
                    <span style={{ color: 'var(--gb-text-muted)', textDecoration: 'line-through', fontWeight: 500 }}>{t.subject}</span>
                  </div>
                </Td>
                <Td muted>{t.category}</Td>
                <Td align="right" mono muted>{fmtDate(t.dueDate)}</Td>
              </tr>
            ))}
            {D.doneTasks.length === 0 && <EmptyRow colSpan={3} label="No completed tasks." />}
          </tbody>
        </table>
        </ScrollArea>
      </Card>
    </div>
  );
}

/* — Opportunities (added; the design mock omitted this) — */
function OpportunitiesPanel() {
  const D = useD();
  const { openModal } = useModal();
  return (
    <Card>
      <SectionTitle
        icon={<I.target />} title="Opportunities" count={D.opportunities.length}
        sub="Pipeline for this contact"
        right={<Btn variant="tinted" size="sm" icon={<I.plus />} onClick={() => openModal(<OpportunityModal />)}>New opportunity</Btn>}
      />
      <ScrollArea max={420}>
      <table style={tableStyle}>
        <thead><tr>
          <Th>ID</Th>
          <Th>Subject</Th>
          <Th align="right">Est. Value</Th>
          <Th align="right">Est. Close</Th>
          <Th align="center">Stage</Th>
          <Th align="right">Actions</Th>
        </tr></thead>
        <tbody>
          {D.opportunities.map((o, i) => (
            <tr key={i} style={trStyle}>
              <Td><span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)', fontWeight: 600 }}>{o.id}</span></Td>
              <Td><span style={{ color: 'var(--gb-text-primary)', fontWeight: 500 }}>{o.subject}</span></Td>
              <Td align="right"><span style={{ fontFamily: 'var(--gb-font-mono)', fontWeight: 700, color: 'var(--gb-text-primary)' }}>{fmt$(o.estimatedValue)}</span></Td>
              <Td align="right" mono muted>{fmtDate(o.estimatedCloseDate)}</Td>
              <Td align="center">{o.stage ? <Tag tone="info" size="xs">{o.stage}</Tag> : DASH}</Td>
              <Td align="right">
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Btn variant="ghost" size="xs" iconRight={<I.ext />} onClick={() => { if (o.id) goUrl(oppHref(o.id)); }}>Open</Btn>
                  <Btn variant="tinted" size="xs" icon={<I.edit />} onClick={() => openModal(<OpportunityModal opportunityId={o.id} />)}>Edit</Btn>
                </div>
              </Td>
            </tr>
          ))}
          {D.opportunities.length === 0 && <EmptyRow colSpan={6} label="No opportunities." />}
        </tbody>
      </table>
      </ScrollArea>
    </Card>
  );
}

/* — Cases (no schema collection yet — empty state) — */
function CasesPanel() {
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

/* — Account Info & Contact Info — */
function AccountInfoCard() {
  const D = useD();
  const a = D.account;
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <SectionTitle
        icon={<I.briefcase />} title="Account Information"
        sub={`#${D.ids.account || DASH} · ${txt(a.name) || DASH}`}
        right={<EditToggle editing={editing} setEditing={setEditing} />}
      />
      <div style={{ padding: '8px 18px 14px' }}>
        <EKV label="Account Name" value={txt(a.name)} editing={editing} />
        <KV label="Account ID" mono copyable>{txt(D.ids.account)}</KV>
        <EKV label="Industry" value={txt(a.industry)} editing={editing} />
        <EKV label="Web Address" value={txt(a.webAddress)} editing={editing} />
        <EKV label="City" value={txt(a.city)} editing={editing} />
        <EKV label="State" value={txt(a.state)} editing={editing} />
        {editing
          ? <EKV label="Territory" value={txt(a.territoryName)} editing />
          : (
            <KV label="Territory">
              {a.territoryName ? <Tag tone="brand" size="sm">{a.territoryName}</Tag> : DASH}
              {a.salesRep && <span style={{ marginLeft: 6, color: 'var(--gb-text-tertiary)' }}>{a.salesRep}</span>}
            </KV>
          )}
        <EKV label="User Type" value={txt(a.userType)} editing={editing} />
        <EKV label="Tax Exempt" value={a.taxExempt ? 'Yes' : 'No'} editing={editing} />
        <EKV label="Credit Approved" value={fmtDate(a.creditApproved) === DASH ? '' : fmtDate(a.creditApproved)} editing={editing} />
        <EKV label="LinkedIn URL" value={txt(a.linkedInUrl)} editing={editing} />
        <EKV label="Context" value={txt(a.contextNotes)} editing={editing} />
      </div>
    </Card>
  );
}

function ContactInfoCard() {
  const D = useD();
  const patch = usePatch();
  const c = D.contact, a = D.account;
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(0);   // bump → confirmation pulse
  const draft = useRef({});
  const onEdit = (f, v) => { draft.current[f] = v; };
  const save = async () => {
    const id = D.ids.contact;
    if (!id) { gbToast('No contact id', 'error'); throw new Error('no id'); }
    const e = draft.current;
    try {
      await crmUpdateContact(id, e);
      // Optimistically reflect the saved values everywhere (card + Hero name).
      patch((prev) => ({ ...prev, contact: { ...prev.contact,
        ...(e.firstName != null && { firstName: e.firstName }),
        ...(e.lastName != null && { lastName: e.lastName }),
        ...(e.jobTitle != null && { jobTitle: e.jobTitle }),
        ...(e.email != null && { email: e.email }),
        ...(e.phoneNumber != null && { phone: e.phoneNumber }),
        ...(e.zipCode != null && { zipCode: e.zipCode }),
        ...(e.userCountry != null && { country: e.userCountry }),
      } }));
      draft.current = {};
      setSaved((n) => n + 1);   // confirmation pulse on the card (no toast)
    } catch (err) { gbToast('Could not save contact', 'error'); throw err; }
  };
  return (
    <Card key={`cic${saved}`} className={saved ? 'gb-saved' : undefined}>
      <SectionTitle
        icon={<I.user />} title="Contact Information"
        sub={`#${D.ids.contact || DASH}`}
        right={<EditToggle editing={editing} setEditing={setEditing} onSave={save} />}
      />
      <div style={{ padding: '8px 18px 14px' }}>
        <EKV label="First Name" value={txt(c.firstName)} editing={editing} field="firstName" onEdit={onEdit} />
        <EKV label="Last Name" value={txt(c.lastName)} editing={editing} field="lastName" onEdit={onEdit} />
        <EKV label="Job Title" value={txt(c.jobTitle)} editing={editing} field="jobTitle" onEdit={onEdit} />
        <EKV label="Email" value={txt(c.email)} editing={editing} field="email" onEdit={onEdit} />
        <EKV label="Phone" value={txt(c.phone)} editing={editing} field="phoneNumber" onEdit={onEdit} />
        {/* State lives on the account, not the contact Update payload — read-only here */}
        <EKV label="State" value={txt(c.state)} editing={editing} />
        <EKV label="Zip" value={txt(c.zipCode)} editing={editing} mono field="zipCode" onEdit={onEdit} />
        <EKV label="Country" value={txt(c.country)} editing={editing} field="userCountry" onEdit={onEdit} />
        <KV label="Created By">{txt(a.createdBy)}</KV>
        <KV label="Created On" mono>{fmtDate(a.createdDate) === DASH ? null : fmtDate(a.createdDate)}</KV>
        <KV label="Last Modified" mono>{fmtDateTime(a.modifiedDate) === DASH ? null : fmtDateTime(a.modifiedDate)}</KV>
        <EKV label="Archived" value={c.archived ? 'Yes' : 'No'} editing={editing} />
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════
   RIGHT RAIL — Quick Log, Alt Lookups, Mailer, System
════════════════════════════════════════════════════════════ */
function QuickLogCard() {
  const D = useD();
  const patch = usePatch();
  const { openModal } = useModal();
  const ql = useTemplates(QL_KEY);
  const [busy, setBusy] = useState(null);
  // A quick-log button: fire the referenced saved call template directly.
  const runLog = async (chip) => {
    if (busy) return;
    setBusy(chip.id);
    try {
      const all = await loadCallTemplates();
      const tpl = (all || []).find((t) => String(t.id) === String(chip.templateId));
      if (!tpl) { gbToast('Template not found', 'error'); setBusy(null); return; }
      const ctx = {
        contactId: D.ids.contact,
        phone: String(D.contact.phone || '').replace(/\D/g, ''),
        employeeId: currentEmployeeId(),
        contactName: [D.contact.firstName, D.contact.lastName].filter(Boolean).join(' '),
      };
      const r = await submitCallLog({ template: tpl, context: ctx });
      if (r && r.ok) {
        patch((Dd) => ({ ...Dd, activities: [{ id: '', employee: 'You', category: 'Call', direction: tpl.callDirection === 1 ? 'In' : 'Out', subject: tpl.subject || tpl.name || chip.label, date: new Date().toLocaleString() }, ...(Dd.activities || [])] }));
      } else { gbToast((r && r.error) || 'Could not log call', 'error'); }
    } catch (e) { gbToast('Could not log call', 'error'); }
    finally { setBusy(null); }
  };
  return (
    <Card>
      <SectionTitle icon={<I.zap />} title="Quick Log" sub="Log a call instantly — one click"
        right={<IconBtn size="xs" ghost icon={<I.plus />} title="New quick log" onClick={() => openModal(<TemplateModal kind="call" onSave={ql.add} />)} />} />
      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {ql.list.map((t) => (
          <button key={t.id} disabled={busy === t.id}
            onClick={() => runLog(t)}
            onContextMenu={(e) => { e.preventDefault(); openModal(<TemplateModal kind="call" initial={t} onSave={(tpl) => ql.update(t.id, tpl)} onDelete={() => ql.remove(t.id)} />); }}
            title="Click to log · right-click to edit"
            style={{
              minWidth: 0,   // let the grid cell constrain width so text can wrap
              background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)',
              borderRadius: 'var(--gb-r-md)', padding: '10px 9px',
              display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start',
              cursor: busy === t.id ? 'default' : 'pointer', textAlign: 'left', opacity: busy === t.id ? 0.6 : 1,
              transition: 'all var(--gb-anim)', fontFamily: 'var(--gb-font-sans)',
            }}>
            <span style={{ color: 'var(--gb-text-tertiary)', display: 'flex' }}><I.phone size={13} /></span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)', lineHeight: 1.25, overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%' }}>{t.label}</span>
            <span style={{ fontSize: 9, letterSpacing: .5, fontWeight: 600, color: 'var(--gb-text-muted)', lineHeight: 1.3, overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%' }}>{t.templateName || ''}</span>
          </button>
        ))}
        {ql.list.length === 0 && <div style={{ gridColumn: '1 / -1', padding: 14, textAlign: 'center', fontSize: 11.5, color: 'var(--gb-text-muted)' }}>Add a quick-log button with +</div>}
      </div>
    </Card>
  );
}

function AltLookupsCard() {
  const D = useD();
  const { openModal } = useModal();
  const lookups = [];
  if (D.contact.phone) lookups.push({ type: 'Phone', value: D.contact.phone, primary: true });
  if (D.contact.email) lookups.push({ type: 'Email', value: D.contact.email, primary: true });
  (D.lookups || []).forEach((l) => lookups.push({ type: l.type || 'Lookup', value: l.value || l.content }));
  return (
    <Card>
      <SectionTitle
        icon={<I.search />} title="Alternate Lookups" count={lookups.length}
        right={<IconBtn size="xs" ghost icon={<I.plus />} title="Add lookup" onClick={() => openModal(<LookupModal />)} />}
      />
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {lookups.map((l, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '8px 10px',
            background: 'var(--gb-fill-faint)',
            border: '1px solid var(--gb-border-subtle)',
            borderRadius: 'var(--gb-r-sm)',
          }}>
            {l.type === 'Phone' ? <I.phone size={12} style={{ color: 'var(--gb-text-muted)' }}/> : <I.mail size={12} style={{ color: 'var(--gb-text-muted)' }}/>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', textTransform: 'uppercase', letterSpacing: .7, fontWeight: 700 }}>{l.type}</div>
              <div style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)', fontWeight: 500, fontFamily: 'var(--gb-font-mono)' }}>{l.value}</div>
            </div>
            {l.primary && <Tag tone="brand" size="xs">Primary</Tag>}
          </div>
        ))}
        {lookups.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 11.5, color: 'var(--gb-text-muted)' }}>No lookups.</div>
        )}
      </div>
    </Card>
  );
}

function MailerCard() {
  const D = useD();
  const { openModal } = useModal();
  const s = D.stats;
  const removed = num(s.mailerRemoved) ? true : false;
  return (
    <Card>
      <SectionTitle
        icon={<I.send />} title="Mailer"
        sub="Subscription & engagement"
        right={<IconBtn size="xs" ghost icon={<I.cog />} />}
      />
      <div style={{ padding: '4px 18px 14px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 0', borderBottom: '1px dashed var(--gb-border-subtle)',
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontWeight: 500 }}>Status</div>
            <div style={{ fontSize: 13, color: removed ? 'var(--gb-text-tertiary)' : 'var(--gb-success-fg)', fontWeight: 700, marginTop: 1 }}>
              {removed ? 'Removed' : 'Subscribed'}
            </div>
          </div>
          <Tag tone={removed ? 'neutral' : 'success'} size="md" icon={<Dot tone={removed ? 'muted' : 'success'} glow={!removed} />}>{removed ? 'Inactive' : 'Active'}</Tag>
        </div>
        <KV label="Mailer Points" mono>{txt(num(s.mailerPoints) ?? 0)}</KV>
        <KV label="Removed">{removed ? 'Yes' : 'No'}</KV>
        <KV label="Last Touch" mono>{fmtDate(s.mailerTouchDate) === DASH ? null : fmtDate(s.mailerTouchDate)}</KV>
        <KV label="Last Bounce" mono>{txt(s.lastBounceCode)}</KV>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 12 }}>
          <Btn variant="tinted" status="warning" size="sm" full onClick={() => openModal(<SnoozeModal />)}>Snooze</Btn>
          <Btn variant="tinted" status="error" size="sm" full>Remove</Btn>
        </div>
      </div>
    </Card>
  );
}

function SystemCard() {
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

/* ════════════════════════════════════════════════════════════
   ROOT
════════════════════════════════════════════════════════════ */
/* Error boundary — a render crash must NOT blank the takeover (which would
   reveal the raw CRM page underneath). Show the error instead so it's visible
   and the rest of the page chrome stays put. */
class GBBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { try { console.error('[gb custom contact] render error', err, info); } catch (e) {} }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 24, margin: 24, fontFamily: 'var(--gb-font-mono)', fontSize: 12, color: 'var(--gb-error-fg)', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-error-tint-border)', borderRadius: 'var(--gb-r-md)', whiteSpace: 'pre-wrap' }}>
          Custom contact page hit a render error:{'\n\n'}{String(this.state.err && (this.state.err.stack || this.state.err.message || this.state.err))}
        </div>
      );
    }
    return this.props.children;
  }
}
function App({ store }) {
  const data = useSyncExternalStore(store.subscribe, store.get);
  const [patches, setPatches] = useState([]);
  const patch = useCallback((fn) => setPatches((p) => [...p, fn]), []);
  const D = useMemo(
    () => patches.reduce((acc, fn) => { try { return fn(acc) || acc; } catch (e) { return acc; } }, adapt(data)),
    [data, patches],
  );

  // Theme is owned globally by the extension (theme.js / applyTheme writes
  // data-theme + the --gb-* tokens on <html> from the user's settings). We
  // inherit it — no per-page light/dark toggle.
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [modal, setModal] = useState(null);
  const [modalClosing, setModalClosing] = useState(false);
  const openModal = useCallback((node) => { setModalClosing(false); setModal(node); }, []);
  const closeModal = useCallback(() => { setModalClosing(true); setTimeout(() => { setModal(null); setModalClosing(false); }, 190); }, []);
  const modalApi = { openModal, closeModal, closing: modalClosing };   // closing drives the exit animation

  return (
    <DataCtx.Provider value={D}>
    <PatchCtx.Provider value={patch}>
    <ModalCtx.Provider value={modalApi}>
      {/* data-gb-scale="custom-page" is intentionally NOT one of
          scales.js's SCALE_CATEGORIES, so applyScales() emits no zoom rule
          for it — the takeover renders at the host website's own scale,
          unaffected by the extension's UI-scale sliders. The bare
          [data-gb-scale] selector still applies the host-CSS reset
          (box-sizing / line-height / font). height:100% + own scroll so it
          fills the fixed root the engine mounts. */}
      <div data-gb-scale="custom-page" style={{
        ...ARMOR,
        zoom: PAGE_ZOOM,                 // fixed scale — not slider-driven
        // No PAGE scroll — the sidebar and content column each scroll
        // themselves. This also kills the page-scrollbar appear/disappear
        // that was flickering a scrollbar onto the quick-actions menu.
        height: '100%', overflow: 'hidden',
        background: 'var(--gb-surface-deep)',
        color: 'var(--gb-text-secondary)',
        fontFamily: 'var(--gb-font-sans)',
        display: 'flex', alignItems: 'stretch',
      }}>
        <style>{UI_CSS}</style>
        <Sidebar collapsed={sideCollapsed} setCollapsed={setSideCollapsed} />
        <div className="gb-scroll" style={{ flex: 1, minWidth: 0, height: '100%', overflowY: 'auto' }}>
          <TopBar />
          {!D.ready && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '90px 0', color: 'var(--gb-text-muted)' }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', borderStyle: 'solid', borderWidth: 3, borderColor: 'var(--gb-border-strong)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin 0.7s linear infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Loading…</span>
            </div>
          )}
          <div style={{
            maxWidth: 2200, margin: '0 auto',
            padding: '20px 28px 60px',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <Hero />

            {/* Account Info + Contact Info side-by-side, always visible */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <AccountInfoCard />
              <ContactInfoCard />
            </div>

            <StatsStrip />

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14, alignItems: 'flex-start' }}>
              {/* No tabs — every section stacked on one screen, each
                  capped to a custom-scroll area (see panels). */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                <ActivityPanel />
                <EmailsPanel />
                <OpportunitiesPanel />
                <OrdersPanel />
                <ProofsPanel />
                <TasksPanel />
                <CasesPanel />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 64 }}>
                <QuickLogCard />
                <AltLookupsCard />
                <MailerCard />
                <SystemCard />
              </div>
            </div>
          </div>
        </div>
      </div>
      {modal && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) modalApi.closeModal(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 400,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,.55)', padding: 20,
            animation: modalClosing ? 'gb-backdrop-out .19s ease both' : 'gb-fade-slide var(--gb-anim) both',
          }}>
          {modal}
        </div>
      )}
    </ModalCtx.Provider>
    </PatchCtx.Provider>
    </DataCtx.Provider>
  );
}

/* ════════════════════════════════════════════════════════════
   REGISTER with the Custom Pages engine (custom-pages.js)
════════════════════════════════════════════════════════════ */
if (!window.__gbContactDetailsRegistered) {
  window.__gbContactDetailsRegistered = true;
  ensureTheme();
  window.__gbCustomPages = window.__gbCustomPages || {};
  window.__gbCustomPages.contact_details = {
    render(rootEl, ctx) {
      const root = createRoot(rootEl);
      root.render(<GBBoundary><App store={ctx.store} /></GBBoundary>);
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
