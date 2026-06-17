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

import React, { useState, useMemo, useEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';

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
    primary:   { bg: hover ? 'var(--gb-brand)' : 'linear-gradient(180deg, var(--gb-brand) 0%, var(--gb-brand-dark) 100%)', fg: 'var(--gb-text-on-brand)', bd: 'var(--gb-brand-border)' },
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
        transition: 'all var(--gb-anim)', flexShrink: 0,
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
  '.gb-scroll { scrollbar-width: thin; scrollbar-color: var(--gb-border-default) transparent; }';

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
/* Account detail page (Page=271 & accountID=…), per the original HTML. */
function accountHref(accId) {
  try { return new URL('Default.aspx?Page=271&accountID=' + accId, window.location.href).href; }
  catch (e) { return 'Default.aspx?Page=271&accountID=' + accId; }
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
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>Golfballs</span>
                <span style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', fontWeight: 600, letterSpacing: .4, textTransform: 'uppercase' }}>Admin · v2.6</span>
              </div>
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
          background: 'linear-gradient(135deg, #6e901d, #4a6b14)',
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
      {/* Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        background: 'var(--gb-fill-inverse-medium)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-md)',
        padding: '0 10px', height: 28, width: 240,
        color: 'var(--gb-text-muted)', fontSize: 11.5,
      }}>
        <I.search size={12} />
        <span style={{ flex: 1 }}>Search customers, orders…</span>
        <span style={{
          fontFamily: 'var(--gb-font-mono)', fontSize: 9.5, padding: '1px 5px',
          borderRadius: 3, background: 'var(--gb-fill-subtle)', color: 'var(--gb-text-tertiary)',
          border: '1px solid var(--gb-border-subtle)',
        }}>⌘K</span>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '3px 10px 3px 4px',
        background: 'var(--gb-fill-subtle)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-pill)',
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6e901d, #4a6b14)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: 'var(--gb-text-on-brand)',
        }}>CU</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>Cullen</span>
        <I.chevd size={10} style={{ color: 'var(--gb-text-muted)' }} />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   HERO / PROFILE CARD
════════════════════════════════════════════════════════════ */
const AVATAR_COLOR = '#3a5f7d';
function Hero() {
  const D = useD();
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
              onClick={(e) => { e.preventDefault(); if (D.ids.account) goUrl(accountHref(D.ids.account)); }}
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
          <Btn variant="primary" icon={<I.edit />} full>Edit Contact</Btn>
          <Btn variant="tinted" status="info" icon={<I.phone />} full>Log Call</Btn>
          <Btn variant="tinted" status="info" icon={<I.send />} full>Send Email</Btn>
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <Btn variant="ghost" size="sm" icon={<I.ban />}>Remove from DNC</Btn>
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

/* ════════════════════════════════════════════════════════════
   TAB PANELS
════════════════════════════════════════════════════════════ */

/* — Activity timeline — */
function activityTone(category) {
  const c = (category || '').toLowerCase();
  if (c.indexOf('email') !== -1) return { icon: <I.mail />, tone: 'warning' };
  if (c.indexOf('call') !== -1 || c.indexOf('phone') !== -1) return { icon: <I.phone />, tone: 'success' };
  if (c.indexOf('note') !== -1) return { icon: <I.edit />, tone: 'brand' };
  return { icon: <I.cog />, tone: 'info' };
}
function ActivityPanel() {
  const D = useD();
  const [showDetails, setShowDetails] = useState(true);
  const rows = D.activities;
  return (
    <Card>
      <SectionTitle
        icon={<I.history />}
        title="Activity Feed"
        count={`${rows.length}`}
        sub="All system, workflow, and human-logged events"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn variant="ghost" size="sm" icon={<I.filter />}>Filter</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setShowDetails(!showDetails)}>
              {showDetails ? 'Hide details' : 'Show details'}
            </Btn>
            <Btn variant="tinted" size="sm" icon={<I.plus />}>Add note</Btn>
          </div>
        }
      />
      <ScrollArea max={460} style={{ position: 'relative', padding: '12px 18px 18px' }}>
        {rows.length > 0 && (
          <div style={{
            position: 'absolute', left: 36, top: 18, bottom: 18,
            width: 1, background: 'var(--gb-border-subtle)',
          }} />
        )}
        {rows.map((a, idx) => {
          const meta = activityTone(a.category);
          return (
            <div key={idx} style={{
              display: 'grid', gridTemplateColumns: '38px 1fr auto', gap: 12,
              padding: '10px 0', position: 'relative',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 8,
                background: `var(--gb-${meta.tone}-tint-medium)`,
                border: `1px solid var(--gb-${meta.tone}-tint-border)`,
                color: `var(--gb-${meta.tone}-fg)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 2, position: 'relative',
                boxShadow: '0 0 0 4px var(--gb-surface-1)',
              }}>{React.cloneElement(meta.icon, { size: 12 })}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {a.employee && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-text-secondary)' }}>{a.employee}</span>}
                  {a.category && <Tag tone={meta.tone} size="xs">{a.category}</Tag>}
                  {a.direction && <Tag tone="neutral" size="xs">{a.direction}</Tag>}
                </div>
                <div style={{
                  fontSize: 12.5, color: 'var(--gb-text-secondary)', marginTop: 3,
                  fontWeight: 500, lineHeight: 1.4,
                }}>{a.subject}</div>
              </div>
              <div style={{
                fontSize: 10.5, color: 'var(--gb-text-muted)', fontWeight: 500,
                fontFamily: 'var(--gb-font-mono)', textAlign: 'right',
                whiteSpace: 'nowrap',
              }}>{fmtDateTime(a.date)}</div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--gb-text-muted)' }}>No activity recorded.</div>
        )}
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
            {D.items.map((it, i) => (
              <tr key={i} style={trStyle}>
                <Td>
                  <div style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)', fontWeight: 500, lineHeight: 1.4 }}>{it.name}</div>
                  {num(it.orderCount) != null && (
                    <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 2, fontFamily: 'var(--gb-font-mono)' }}>
                      {it.orderCount} order{it.orderCount !== 1 ? 's' : ''}
                    </div>
                  )}
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
              <Td align="right"><IconBtn size="xs" ghost icon={<I.download />} title="Download .eml" /></Td>
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
function TasksPanel() {
  const D = useD();
  const [quickTask, setQuickTask] = useState('');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <Card>
        <SectionTitle
          icon={<I.task />} title="Open Tasks" count={D.openTasks.length}
          right={<Btn variant="tinted" size="sm" icon={<I.plus />}>New task</Btn>}
        />
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: .7, textTransform: 'uppercase',
            color: 'var(--gb-text-muted)', marginBottom: 8,
          }}>Quick create</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {QUICK_TASK.map((q) => (<Btn key={q} variant="secondary" size="xs">{q}</Btn>))}
            <Btn variant="tinted" status="error" size="xs" icon={<I.check />}>Complete open</Btn>
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
                placeholder="Quick add a task… (Enter to save)"
                style={{
                  flex: 1, border: 0, outline: 0, background: 'transparent',
                  fontFamily: 'var(--gb-font-sans)', fontSize: 11.5,
                  color: 'var(--gb-text-primary)',
                }} />
            </div>
            <Btn variant="primary" size="sm" icon={<I.check />}>Add</Btn>
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
            {D.openTasks.map((t, i) => (
              <tr key={i} style={trStyle}>
                <Td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 4, border: '1.5px solid var(--gb-border-strong)', flexShrink: 0 }} />
                    <span style={{ color: 'var(--gb-text-primary)', fontWeight: 500 }}>{t.subject}</span>
                  </div>
                </Td>
                <Td muted>{t.category}</Td>
                <Td align="center"><Tag tone={priTone(t.priority)} size="xs">{t.priority || DASH}</Tag></Td>
                <Td align="right" mono>
                  <span style={{ color: 'var(--gb-warning-fg)', fontWeight: 600 }}>{fmtDate(t.dueDate)}</span>
                </Td>
                <Td align="right"><Btn variant="ghost" size="xs" icon={<I.check />}>Complete</Btn></Td>
              </tr>
            ))}
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
  return (
    <Card>
      <SectionTitle
        icon={<I.target />} title="Opportunities" count={D.opportunities.length}
        sub="Pipeline for this contact"
        right={<Btn variant="tinted" size="sm" icon={<I.plus />}>New opportunity</Btn>}
      />
      <ScrollArea max={420}>
      <table style={tableStyle}>
        <thead><tr>
          <Th>ID</Th>
          <Th>Subject</Th>
          <Th align="right">Est. Value</Th>
          <Th align="right">Est. Close</Th>
          <Th align="center">Stage</Th>
        </tr></thead>
        <tbody>
          {D.opportunities.map((o, i) => (
            <tr key={i} style={trStyle}>
              <Td><span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)', fontWeight: 600 }}>{o.id}</span></Td>
              <Td><span style={{ color: 'var(--gb-text-primary)', fontWeight: 500 }}>{o.subject}</span></Td>
              <Td align="right"><span style={{ fontFamily: 'var(--gb-font-mono)', fontWeight: 700, color: 'var(--gb-text-primary)' }}>{fmt$(o.estimatedValue)}</span></Td>
              <Td align="right" mono muted>{fmtDate(o.estimatedCloseDate)}</Td>
              <Td align="center">{o.stage ? <Tag tone="info" size="xs">{o.stage}</Tag> : DASH}</Td>
            </tr>
          ))}
          {D.opportunities.length === 0 && <EmptyRow colSpan={5} label="No opportunities." />}
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
  return (
    <Card>
      <SectionTitle
        icon={<I.briefcase />} title="Account Information"
        sub={`#${D.ids.account || DASH} · ${txt(a.name) || DASH}`}
        right={<Btn variant="ghost" size="sm" icon={<I.edit />}>Edit</Btn>}
      />
      <div style={{ padding: '8px 18px 14px' }}>
        <KV label="Account Name" link>{txt(a.name)}</KV>
        <KV label="Account ID" mono copyable>{txt(D.ids.account)}</KV>
        <KV label="Industry">{txt(a.industry)}</KV>
        <KV label="Web Address" link>{txt(a.webAddress)}</KV>
        <KV label="City">{txt(a.city)}</KV>
        <KV label="State">{txt(a.state)}</KV>
        <KV label="Territory">
          {a.territoryName ? <Tag tone="brand" size="sm">{a.territoryName}</Tag> : DASH}
          {a.salesRep && <span style={{ marginLeft: 6, color: 'var(--gb-text-tertiary)' }}>{a.salesRep}</span>}
        </KV>
        <KV label="User Type">{txt(a.userType)}</KV>
        <KV label="Tax Exempt">{a.taxExempt ? 'Yes' : 'No'}</KV>
        <KV label="Credit Approved">{fmtDate(a.creditApproved) === DASH ? null : fmtDate(a.creditApproved)}</KV>
        <KV label="LinkedIn URL" link>{txt(a.linkedInUrl)}</KV>
        <KV label="Context">{txt(a.contextNotes)}</KV>
      </div>
    </Card>
  );
}

function ContactInfoCard() {
  const D = useD();
  const c = D.contact, a = D.account;
  return (
    <Card>
      <SectionTitle
        icon={<I.user />} title="Contact Information"
        sub={`#${D.ids.contact || DASH}`}
        right={<Btn variant="ghost" size="sm" icon={<I.edit />}>Edit</Btn>}
      />
      <div style={{ padding: '8px 18px 14px' }}>
        <KV label="First Name">{txt(c.firstName)}</KV>
        <KV label="Last Name">{txt(c.lastName)}</KV>
        <KV label="Job Title">{txt(c.jobTitle)}</KV>
        <KV label="Email" copyable>{txt(c.email)}</KV>
        <KV label="Phone" copyable>{txt(c.phone)}</KV>
        <KV label="State">{txt(c.state)}</KV>
        <KV label="Zip" mono>{txt(c.zipCode)}</KV>
        <KV label="Country">{txt(c.country)}</KV>
        <KV label="Created By">{txt(a.createdBy)}</KV>
        <KV label="Created On" mono>{fmtDate(a.createdDate) === DASH ? null : fmtDate(a.createdDate)}</KV>
        <KV label="Last Modified" mono>{fmtDateTime(a.modifiedDate) === DASH ? null : fmtDateTime(a.modifiedDate)}</KV>
        <KV label="Archived">{c.archived ? 'Yes' : 'No'}</KV>
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════
   RIGHT RAIL — Quick Log, Alt Lookups, Mailer, System
════════════════════════════════════════════════════════════ */
const QUICK_LOG = [
  { label: 'Promotion VM',  meta: 'OUT', icon: 'vm' },
  { label: 'Proposal VM',   meta: 'OUT', icon: 'vm' },
  { label: 'Promotion HU',  meta: 'OUT', icon: 'call' },
  { label: 'Promotion WP',  meta: 'OUT', icon: 'call' },
];
function QuickLogCard() {
  const [active, setActive] = useState(null);
  return (
    <Card>
      <SectionTitle icon={<I.zap />} title="Quick Log" sub="Log a touchpoint instantly" />
      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {QUICK_LOG.map((q, i) => (
          <button key={i}
            onMouseDown={() => setActive(i)}
            onMouseUp={() => setTimeout(() => setActive(null), 400)}
            onMouseLeave={() => setActive(null)}
            style={{
              background: active === i ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
              border: '1px solid ' + (active === i ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
              borderRadius: 'var(--gb-r-md)',
              padding: '10px 9px',
              display: 'flex', flexDirection: 'column', gap: 4,
              alignItems: 'flex-start',
              cursor: 'pointer', textAlign: 'left',
              transition: 'all var(--gb-anim)',
              fontFamily: 'var(--gb-font-sans)',
            }}>
            <span style={{ color: active === i ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)', display: 'flex' }}>
              {q.icon === 'vm' ? <I.inbox size={13} /> : <I.phone size={13} />}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{q.label}</span>
            <span style={{
              fontSize: 9, letterSpacing: .8, fontWeight: 700,
              color: 'var(--gb-text-muted)', textTransform: 'uppercase',
              fontFamily: 'var(--gb-font-mono)',
            }}>{q.meta}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function AltLookupsCard() {
  const D = useD();
  const lookups = [];
  if (D.contact.phone) lookups.push({ type: 'Phone', value: D.contact.phone, primary: true });
  if (D.contact.email) lookups.push({ type: 'Email', value: D.contact.email, primary: true });
  return (
    <Card>
      <SectionTitle
        icon={<I.search />} title="Alternate Lookups" count={lookups.length}
        right={<IconBtn size="xs" ghost icon={<I.plus />} />}
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
          <Btn variant="tinted" status="warning" size="sm" full>Snooze</Btn>
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
function App({ store }) {
  const data = useSyncExternalStore(store.subscribe, store.get);
  const D = useMemo(() => adapt(data), [data]);

  // Theme is owned globally by the extension (theme.js / applyTheme writes
  // data-theme + the --gb-* tokens on <html> from the user's settings). We
  // inherit it — no per-page light/dark toggle.
  const [sideCollapsed, setSideCollapsed] = useState(false);

  return (
    <DataCtx.Provider value={D}>
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
            <div style={{ padding: '14px 22px 0' }}>
              <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)' }}>Loading contact…</div>
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
                <OpportunitiesPanel />
                <OrdersPanel />
                <EmailsPanel />
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
      root.render(<App store={ctx.store} />);
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
