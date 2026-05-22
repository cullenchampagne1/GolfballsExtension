/* eslint-disable react/prop-types */
/* ─────────────────────────────────────────────────────────────
   Golfballs Design System — Primitives
   Every component reads from --gb-* tokens only. NO literal
   rgba(255,255,255,.x) anywhere. Drop into any [data-theme] and
   it works.
───────────────────────────────────────────────────────────── */

const { useState } = React;

/* ════════════════════════════════════════════════════════════
   ICONS — single shared library
════════════════════════════════════════════════════════════ */
const Icon = ({ size = 14, strokeWidth = 2, children, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0, ...style }}>
    {children}
  </svg>
);
const I = {
  mail:    (p) => <Icon {...p}><path d="M3 8l8.5 5.5a2 2 0 002 0L22 8"/><path d="M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></Icon>,
  cog:     (p) => <Icon {...p}><path d="M10.3 4.3c.4-1.7 2.9-1.7 3.3 0a1.7 1.7 0 002.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 001 2.5c1.8.5 1.8 3 0 3.4a1.7 1.7 0 00-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 00-2.6 1c-.4 1.8-2.9 1.8-3.3 0a1.7 1.7 0 00-2.6-1c-1.5.9-3.3-.8-2.4-2.4a1.7 1.7 0 00-1-2.6c-1.8-.4-1.8-2.9 0-3.4a1.7 1.7 0 001-2.5c-.9-1.6.9-3.3 2.4-2.4 1 .6 2.3.1 2.6-1.1z"/><circle cx="12" cy="12" r="3"/></Icon>,
  card:    (p) => <Icon {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M7 16h2"/></Icon>,
  edit:    (p) => <Icon {...p}><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>,
  eye:     (p) => <Icon {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></Icon>,
  check:   (p) => <Icon {...p} strokeWidth={2.4}><path d="M20 6L9 17l-5-5"/></Icon>,
  send:    (p) => <Icon {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></Icon>,
  search:  (p) => <Icon {...p}><circle cx="11" cy="11" r="7.5"/><path d="M20.5 20.5L17 17"/></Icon>,
  close:   (p) => <Icon {...p} strokeWidth={2.2}><path d="M18 6L6 18M6 6l12 12"/></Icon>,
  plus:    (p) => <Icon {...p} strokeWidth={2.4}><path d="M12 5v14M5 12h14"/></Icon>,
  chevd:   (p) => <Icon {...p} strokeWidth={2.2}><path d="M6 9l6 6 6-6"/></Icon>,
  chevr:   (p) => <Icon {...p} strokeWidth={2.2}><path d="M9 6l6 6-6 6"/></Icon>,
  trash:   (p) => <Icon {...p}><path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></Icon>,
  alert:   (p) => <Icon {...p}><path d="M10.3 3.86L1.82 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.86a2 2 0 00-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></Icon>,
  bolt:    (p) => <Icon {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></Icon>,
  copy:    (p) => <Icon {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></Icon>,
  user:    (p) => <Icon {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></Icon>,
  filter:  (p) => <Icon {...p}><path d="M22 3H2l8 9.5V19l4 2v-8.5z"/></Icon>,
  more:    (p) => <Icon {...p}><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></Icon>,
  sun:     (p) => <Icon {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></Icon>,
  moon:    (p) => <Icon {...p}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></Icon>,
  refresh: (p) => <Icon {...p}><path d="M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15"/></Icon>,
};

/* ════════════════════════════════════════════════════════════
   BUTTON — one component, six variants × four sizes × all states
════════════════════════════════════════════════════════════ */
function Btn({
  variant = 'secondary',   // primary | secondary | tinted | ghost | danger | dashed
  size = 'md',             // xs | sm | md | lg
  icon, children, full,
  disabled, loading,
  status,                  // null | 'brand' | 'error' | 'warning'  → recolors tinted/danger
  style, ...rest
}) {
  // Map "status" onto tint colors so the same Btn variant works
  // for the .btn-charge.ready (brand) vs .btn-charge.refund (error) split.
  const tintMap = {
    brand:   { fg: 'var(--gb-brand-label)', bg: 'var(--gb-brand-tint-medium)', bd: 'var(--gb-brand-tint-border)', bgHover: 'var(--gb-brand-tint-strong)' },
    error:   { fg: 'var(--gb-error-fg)',    bg: 'var(--gb-error-tint-medium)',  bd: 'var(--gb-error-tint-border)',  bgHover: 'var(--gb-error-tint-strong)' },
    warning: { fg: 'var(--gb-warning-fg)',  bg: 'var(--gb-warning-tint-medium)',bd: 'var(--gb-warning-tint-border)',bgHover: 'var(--gb-warning-tint-strong)' },
  };
  const t = tintMap[status] || tintMap.brand;

  const variants = {
    primary: {
      background: 'linear-gradient(180deg, var(--gb-brand) 0%, var(--gb-brand-dark) 100%)',
      color:      'var(--gb-text-on-brand)',
      border:     '1px solid var(--gb-brand-border)',
    },
    secondary: {
      background: 'var(--gb-fill-subtle)',
      color:      'var(--gb-text-secondary)',
      border:     '1px solid var(--gb-border-default)',
    },
    tinted: {
      background: t.bg,
      color:      t.fg,
      border:     `1px solid ${t.bd}`,
    },
    ghost: {
      background: 'transparent',
      color:      'var(--gb-text-tertiary)',
      border:     '1px solid transparent',
    },
    danger: {
      background: 'var(--gb-error-tint-medium)',
      color:      'var(--gb-error-fg)',
      border:     '1px solid var(--gb-error-tint-border)',
    },
    dashed: {
      background: 'var(--gb-brand-tint-soft)',
      color:      'var(--gb-brand-label)',
      border:     '1px dashed var(--gb-brand-tint-border)',
    },
  };

  const sizes = {
    xs: { fontSize: 10.5, padding: '0 8px',   height: 22, gap: 4,  iconSize: 10 },
    sm: { fontSize: 11,   padding: '0 10px',  height: 26, gap: 5,  iconSize: 11 },
    md: { fontSize: 12,   padding: '0 12px',  height: 32, gap: 6,  iconSize: 12 },
    lg: { fontSize: 13,   padding: '0 16px',  height: 38, gap: 7,  iconSize: 13 },
  };
  const s = sizes[size];

  return (
    <button
      disabled={disabled || loading}
      style={{
        ...variants[variant],
        fontSize: s.fontSize, padding: s.padding, height: s.height, gap: s.gap,
        fontFamily: 'var(--gb-font-sans)',
        fontWeight: 600, letterSpacing: -.05,
        borderRadius: 'var(--gb-r-md)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
        opacity: (disabled && !loading) ? .5 : 1,
        whiteSpace: 'nowrap', flexShrink: 0,
        width: full ? '100%' : undefined,
        transition: 'all var(--gb-anim)',
        position: 'relative',
        ...style,
      }}
      {...rest}
    >
      {loading && (
        <span style={{
          width: s.iconSize, height: s.iconSize, borderRadius: '50%',
          border: '2px solid currentColor', borderTopColor: 'transparent',
          animation: 'gb-spin .8s linear infinite', flexShrink: 0,
        }} />
      )}
      {!loading && icon && (
        <span style={{ display: 'flex' }}>
          {React.isValidElement(icon) ? React.cloneElement(icon, { size: s.iconSize }) : icon}
        </span>
      )}
      {children}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════
   ICON BUTTON — square, just an icon. Used everywhere as Close,
   row-actions, header gear, etc.
════════════════════════════════════════════════════════════ */
function IconBtn({ icon, size = 'md', variant = 'secondary', danger, style, ...rest }) {
  const sizes = { xs: 22, sm: 26, md: 32, lg: 38 };
  const iconSizes = { xs: 10, sm: 11, md: 13, lg: 14 };
  const px = sizes[size];

  const palette = danger
    ? { bg: 'var(--gb-error-tint-soft)', fg: 'var(--gb-error-fg)', bd: 'var(--gb-error-tint-border)' }
    : variant === 'ghost'
      ? { bg: 'transparent', fg: 'var(--gb-text-tertiary)', bd: 'transparent' }
      : { bg: 'var(--gb-fill-subtle)', fg: 'var(--gb-text-tertiary)', bd: 'var(--gb-border-default)' };

  return (
    <button
      style={{
        width: px, height: px, borderRadius: 'var(--gb-r-sm)',
        background: palette.bg, color: palette.fg,
        border: `1px solid ${palette.bd}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0,
        transition: 'all var(--gb-anim)',
        padding: 0,
        ...style,
      }}
      {...rest}
    >
      {React.isValidElement(icon) ? React.cloneElement(icon, { size: iconSizes[size] }) : icon}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════
   TAG / BADGE / CHIP / DOT
════════════════════════════════════════════════════════════ */
function Tag({ children, tone = 'neutral', size = 'md', mono, icon, onRemove, style }) {
  const tones = {
    neutral: { fg: 'var(--gb-text-tertiary)', bg: 'var(--gb-fill-subtle)',         bd: 'var(--gb-border-default)' },
    brand:   { fg: 'var(--gb-brand-label)',   bg: 'var(--gb-brand-tint-medium)',  bd: 'var(--gb-brand-tint-border)' },
    error:   { fg: 'var(--gb-error-fg)',      bg: 'var(--gb-error-tint-medium)',  bd: 'var(--gb-error-tint-border)' },
    warning: { fg: 'var(--gb-warning-fg)',    bg: 'var(--gb-warning-tint-medium)',bd: 'var(--gb-warning-tint-border)' },
    success: { fg: 'var(--gb-success-fg)',    bg: 'var(--gb-success-tint-medium)',bd: 'var(--gb-success-tint-border)' },
  };
  const t = tones[tone];
  const sizes = {
    xs: { fontSize: 9,    padding: '1px 5px',  borderRadius: 3, gap: 3,  iconSize: 8 },
    sm: { fontSize: 9.5,  padding: '1px 6px',  borderRadius: 4, gap: 4,  iconSize: 9 },
    md: { fontSize: 10.5, padding: '2px 7px',  borderRadius: 5, gap: 4,  iconSize: 10 },
    lg: { fontSize: 11.5, padding: '3px 9px',  borderRadius: 5, gap: 5,  iconSize: 11 },
  };
  const s = sizes[size];
  return (
    <span style={{
      ...s,
      color: t.fg, background: t.bg, border: `1px solid ${t.bd}`,
      fontWeight: 700, letterSpacing: .3, textTransform: 'uppercase',
      fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)',
      display: 'inline-flex', alignItems: 'center',
      whiteSpace: 'nowrap', lineHeight: 1.5,
      ...style,
    }}>
      {icon && (React.isValidElement(icon) ? React.cloneElement(icon, { size: s.iconSize }) : icon)}
      {children}
      {onRemove && (
        <span onClick={onRemove} style={{ cursor: 'pointer', display: 'flex', marginLeft: 1 }}>
          <I.close size={s.iconSize - 1} />
        </span>
      )}
    </span>
  );
}

function Chip({ children, code, tone = 'brand', onRemove, style }) {
  // Lower-case, not uppercase — for variables / filter conditions
  const tones = {
    brand:   { fg: 'var(--gb-brand-label)',  bg: 'var(--gb-brand-tint-soft)',  bd: 'var(--gb-brand-tint-border)' },
    neutral: { fg: 'var(--gb-text-tertiary)', bg: 'var(--gb-fill-subtle)',      bd: 'var(--gb-border-default)' },
  };
  const t = tones[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px',
      background: t.bg, color: t.fg,
      border: `1px solid ${t.bd}`,
      borderRadius: 'var(--gb-r-sm)',
      fontSize: 11, fontWeight: 500,
      fontFamily: code ? 'var(--gb-font-mono)' : 'inherit',
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {children}
      {onRemove && <I.close size={9} style={{ color: 'var(--gb-text-muted)', cursor: 'pointer' }} />}
    </span>
  );
}

function Dot({ tone = 'brand', size = 6, glow }) {
  const colors = {
    brand:   'var(--gb-brand-label)',
    error:   'var(--gb-error)',
    warning: 'var(--gb-warning)',
    success: 'var(--gb-success)',
    muted:   'var(--gb-text-muted)',
  };
  const c = colors[tone];
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: c, flexShrink: 0, display: 'inline-block',
      boxShadow: glow ? `0 0 ${size}px ${c}, 0 0 ${size * 2}px ${c}33` : 'none',
    }} />
  );
}

/* ════════════════════════════════════════════════════════════
   INPUT, TEXTAREA, DROPDOWN — same shell, three modes
════════════════════════════════════════════════════════════ */
function inputBaseStyle({ focused, error, size = 'md' }) {
  const heights = { sm: 28, md: 32, lg: 36 };
  const fontSizes = { sm: 11.5, md: 12, lg: 13 };
  return {
    background: 'var(--gb-fill-inverse-medium)',   /* recess effect both themes */
    border: '1px solid ' + (focused
      ? 'var(--gb-brand-label)'
      : error
        ? 'var(--gb-error)'
        : 'var(--gb-border-default)'),
    borderRadius: 'var(--gb-r-md)',
    boxShadow: focused ? 'var(--gb-focus-ring)' : 'none',
    height: heights[size],
    fontSize: fontSizes[size],
    fontFamily: 'var(--gb-font-sans)',
    fontWeight: 500,
    color: 'var(--gb-text-primary)',
    transition: 'all var(--gb-anim)',
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '0 10px',
  };
}

function Input({ value, placeholder, focused, error, leading, trailing, size = 'md', mono, style }) {
  return (
    <div style={{ ...inputBaseStyle({ focused, error, size }), ...style }}>
      {leading && <span style={{ color: 'var(--gb-text-muted)', display: 'flex' }}>{leading}</span>}
      <span style={{
        flex: 1,
        color: value ? 'var(--gb-text-primary)' : 'var(--gb-text-ghost)',
        fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value || placeholder}</span>
      {trailing && <span style={{ color: 'var(--gb-text-muted)', display: 'flex' }}>{trailing}</span>}
    </div>
  );
}

function Textarea({ value, placeholder, rows = 3, style }) {
  return (
    <div style={{
      ...inputBaseStyle({ size: 'md' }),
      height: 'auto', minHeight: 32 + (rows - 1) * 20,
      padding: '8px 10px',
      alignItems: 'flex-start',
      lineHeight: 1.5,
      ...style,
    }}>
      <span style={{
        flex: 1, whiteSpace: 'pre-wrap',
        color: value ? 'var(--gb-text-primary)' : 'var(--gb-text-ghost)',
      }}>{value || placeholder}</span>
    </div>
  );
}

function Dropdown({ value, placeholder, open, leading, size = 'md', style }) {
  return (
    <div style={{
      ...inputBaseStyle({ focused: open, size }),
      cursor: 'pointer',
      ...style,
    }}>
      {leading && <span style={{ display: 'flex' }}>{leading}</span>}
      <span style={{
        flex: 1,
        color: value ? 'var(--gb-text-primary)' : 'var(--gb-text-ghost)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value || placeholder}</span>
      <I.chevd size={11} style={{
        color: open ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
        transform: open ? 'rotate(180deg)' : 'none',
        transition: 'transform var(--gb-anim)',
      }} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SWITCH — three variants from the codebase
════════════════════════════════════════════════════════════ */
function Switch({ on, size = 'md', tone = 'brand' }) {
  const sizes = { sm: { w: 28, h: 16, knob: 12 }, md: { w: 34, h: 20, knob: 16 }, lg: { w: 40, h: 22, knob: 18 } };
  const s = sizes[size];
  const toneBg = tone === 'warning' ? 'var(--gb-warning-tint-medium)' : 'var(--gb-brand-tint-medium)';
  const toneBd = tone === 'warning' ? 'rgba(224,160,48,.5)' : 'var(--gb-brand)';
  const toneKnob = tone === 'warning' ? 'var(--gb-warning)' : 'var(--gb-brand-label)';
  return (
    <span style={{
      position: 'relative', display: 'inline-block', flexShrink: 0,
      width: s.w, height: s.h, borderRadius: s.h,
      background: on ? toneBg : 'var(--gb-fill-inverse-medium)',
      border: '1px solid ' + (on ? toneBd : 'var(--gb-border-default)'),
      transition: 'all var(--gb-anim)', cursor: 'pointer',
    }}>
      <span style={{
        position: 'absolute', top: '50%',
        left: on ? `${s.w - s.knob - 4}px` : '2px',
        transform: 'translateY(-50%)',
        width: s.knob, height: s.knob, borderRadius: '50%',
        background: on ? toneKnob : 'var(--gb-text-tertiary)',
        transition: 'all var(--gb-anim)',
      }} />
    </span>
  );
}

/* ════════════════════════════════════════════════════════════
   EXCLUSIVE / TOGGLE TAGS (used in proof modal)
   Same shape, different selection logic
════════════════════════════════════════════════════════════ */
function PillTag({ on, icon, children, onClick, style }) {
  return (
    <span onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 11px', borderRadius: 'var(--gb-r-sm)',
      fontSize: 11, fontWeight: 600,
      background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
      color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
      border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
      cursor: 'pointer', whiteSpace: 'nowrap',
      transition: 'all var(--gb-anim)',
      ...style,
    }}>
      {icon && <span style={{ display: 'flex' }}>{icon}</span>}
      {children}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════
   FIELD — labelled wrapper
════════════════════════════════════════════════════════════ */
function Field({ label, hint, required, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      {label && (
        <label style={{
          fontSize: 10, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: .8,
          color: 'var(--gb-text-muted)',
        }}>
          {label}
          {required && <span style={{ color: 'var(--gb-error)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      {children}
      {hint && (
        <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.4 }}>{hint}</div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MODAL — header / body / footer pattern
════════════════════════════════════════════════════════════ */
function ModalShell({ children, width, height, style }) {
  return (
    <div style={{
      width, height,
      background: 'var(--gb-surface-canvas)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-xl)',
      overflow: 'hidden',
      boxShadow: 'var(--gb-shadow-modal)',
      display: 'flex', flexDirection: 'column',
      ...style,
    }}>{children}</div>
  );
}

function ModalHeader({ icon, title, subtitle, right, accent = true, onClose }) {
  return (
    <div style={{
      padding: '14px 16px',
      background: 'var(--gb-fill-inverse-strong)',
      borderBottom: '1px solid var(--gb-border-subtle)',
      display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
    }}>
      {icon && (
        <div style={{
          width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0,
          background: accent ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
          border: '1px solid ' + (accent ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
          color: accent ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1, lineHeight: 1.2 }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>
        )}
      </div>
      {right}
      <IconBtn size="sm" icon={<I.close />} onClick={onClose} />
    </div>
  );
}

function ModalFooter({ children, style }) {
  return (
    <div style={{
      padding: 12, flexShrink: 0,
      background: 'var(--gb-fill-inverse-strong)',
      borderTop: '1px solid var(--gb-border-subtle)',
      display: 'flex', alignItems: 'center', gap: 8,
      ...style,
    }}>{children}</div>
  );
}

/* ════════════════════════════════════════════════════════════
   CALLOUT / INFO BOX — 4 tones
   Replaces .note-callout. The left-border accent stays — it's
   the load-bearing signal in the existing UI.
════════════════════════════════════════════════════════════ */
function Callout({ tone = 'info', icon, title, children, dismissable, style }) {
  const tones = {
    info:    { fg: 'var(--gb-info)',       bg: 'var(--gb-info-tint-soft)',    bd: 'var(--gb-info-tint-border)' },
    brand:   { fg: 'var(--gb-brand-label)',bg: 'var(--gb-brand-tint-soft)',   bd: 'var(--gb-brand-tint-border)' },
    success: { fg: 'var(--gb-success-fg)', bg: 'var(--gb-success-tint-soft)', bd: 'var(--gb-success-tint-border)' },
    warning: { fg: 'var(--gb-warning-fg)', bg: 'var(--gb-warning-tint-soft)', bd: 'var(--gb-warning-tint-border)' },
    error:   { fg: 'var(--gb-error-fg)',   bg: 'var(--gb-error-tint-soft)',   bd: 'var(--gb-error-tint-border)' },
    neutral: { fg: 'var(--gb-text-tertiary)', bg: 'var(--gb-fill-subtle)',    bd: 'var(--gb-border-default)' },
  };
  const t = tones[tone];
  const defaultIcons = {
    info: <I.alert />, brand: <I.bolt />, success: <I.check />,
    warning: <I.alert />, error: <I.alert />, neutral: <I.alert />,
  };
  const shownIcon = icon === false ? null : (icon || defaultIcons[tone]);
  return (
    <div style={{
      padding: '11px 14px',
      background: t.bg,
      border: `1px solid ${t.bd}`,
      borderLeft: `3px solid ${t.fg}`,
      borderRadius: 'var(--gb-r-sm)',
      display: 'flex', gap: 10, alignItems: 'flex-start',
      fontSize: 11.5, lineHeight: 1.55, color: 'var(--gb-text-tertiary)',
      ...style,
    }}>
      {shownIcon && (
        <span style={{ color: t.fg, display: 'flex', flexShrink: 0, marginTop: 1 }}>
          {React.isValidElement(shownIcon) ? React.cloneElement(shownIcon, { size: 13 }) : shownIcon}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-secondary)', marginBottom: children ? 2 : 0 }}>{title}</div>}
        {children}
      </div>
      {dismissable && <IconBtn size="xs" icon={<I.close />} variant="ghost" />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   CHECKBOX — the real one (not the switch)
   For multi-select lists, table row selection, "select all".
════════════════════════════════════════════════════════════ */
function Checkbox({ checked, indeterminate, size = 'md', tone = 'brand', label, hint, disabled, style }) {
  const sizes = {
    sm: { box: 14, check: 9, gap: 7, font: 11.5 },
    md: { box: 17, check: 11, gap: 9, font: 12 },
    lg: { box: 20, check: 13, gap: 10, font: 13 },
  };
  const s = sizes[size];
  const toneColor = tone === 'error' ? 'var(--gb-error)' : 'var(--gb-brand-label)';
  const toneBg    = tone === 'error' ? 'var(--gb-error-tint-medium)' : 'var(--gb-brand-tint-medium)';
  const isOn = checked || indeterminate;
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'flex-start', gap: s.gap,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      ...style,
    }}>
      <span style={{
        width: s.box, height: s.box, flexShrink: 0,
        borderRadius: 4,
        background: isOn ? toneBg : 'var(--gb-fill-inverse-medium)',
        border: '1.5px solid ' + (isOn ? toneColor : 'var(--gb-border-strong)'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: toneColor,
        transition: 'all var(--gb-anim)',
        marginTop: label ? 1 : 0,
      }}>
        {checked && !indeterminate && <I.check size={s.check} strokeWidth={3} />}
        {indeterminate && (
          <span style={{
            width: s.check, height: 2, borderRadius: 1, background: toneColor,
          }} />
        )}
      </span>
      {label && (
        <span style={{ minWidth: 0 }}>
          <span style={{ fontSize: s.font, fontWeight: 500, color: 'var(--gb-text-secondary)', display: 'block', lineHeight: 1.4 }}>{label}</span>
          {hint && (
            <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', display: 'block', marginTop: 2, lineHeight: 1.45 }}>{hint}</span>
          )}
        </span>
      )}
    </label>
  );
}

/* ════════════════════════════════════════════════════════════
   SLIDER — range input
   Variants: standalone · with-value · with-ticks · range
════════════════════════════════════════════════════════════ */
function Slider({
  value = 50, min = 0, max = 100,
  showValue = true,            // show the current value pill on the right
  showRange = false,           // show min/max labels under the track
  ticks,                       // array of tick positions to render under the track
  tone = 'brand',
  unit = '',
  style,
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const fillColor = tone === 'warning' ? 'var(--gb-warning)' : 'var(--gb-brand-label)';
  const fillBg    = tone === 'warning' ? 'var(--gb-warning-tint-medium)' : 'var(--gb-brand-tint-medium)';
  return (
    <div style={{ ...style, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, position: 'relative', height: 18, display: 'flex', alignItems: 'center' }}>
          {/* Track */}
          <div style={{
            position: 'absolute', left: 0, right: 0,
            height: 4, borderRadius: 2,
            background: 'var(--gb-fill-inverse-medium)',
            border: '1px solid var(--gb-border-subtle)',
          }} />
          {/* Fill */}
          <div style={{
            position: 'absolute', left: 0,
            width: `${pct}%`, height: 4, borderRadius: 2,
            background: fillColor,
            boxShadow: `0 0 8px ${tone === 'warning' ? 'rgba(224,160,48,.4)' : 'rgba(143,206,46,.45)'}`,
          }} />
          {/* Ticks */}
          {ticks && ticks.map((t, i) => {
            const tp = ((t - min) / (max - min)) * 100;
            return (
              <div key={i} style={{
                position: 'absolute', left: `${tp}%`,
                width: 1, height: 8, top: 5,
                background: 'var(--gb-border-strong)',
                transform: 'translateX(-50%)',
              }} />
            );
          })}
          {/* Thumb */}
          <div style={{
            position: 'absolute', left: `${pct}%`,
            transform: 'translateX(-50%)',
            width: 14, height: 14, borderRadius: '50%',
            background: 'var(--gb-surface-1)',
            border: `2px solid ${fillColor}`,
            boxShadow: '0 1px 4px rgba(0,0,0,.4), var(--gb-focus-ring)',
            cursor: 'grab',
          }} />
        </div>
        {showValue && (
          <span style={{
            minWidth: 42, textAlign: 'right',
            fontSize: 11.5, fontWeight: 700,
            fontFamily: 'var(--gb-font-mono)',
            color: 'var(--gb-text-primary)',
            background: fillBg,
            border: `1px solid var(--gb-${tone}-tint-border)`,
            borderRadius: 5, padding: '2px 7px',
          }}>{value}{unit}</span>
        )}
      </div>
      {showRange && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>
          <span>{min}{unit}</span>
          <span>{max}{unit}</span>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   RANGE SLIDER — two thumbs, min/max
════════════════════════════════════════════════════════════ */
function RangeSlider({
  values = [25, 75],     // [low, high]
  min = 0, max = 100,
  tone = 'brand',
  unit = '',
  showValues = true,
  showRange = false,
  ticks,
  style,
}) {
  const [low, high] = values;
  const lowPct  = ((low  - min) / (max - min)) * 100;
  const highPct = ((high - min) / (max - min)) * 100;
  const fillColor = tone === 'warning' ? 'var(--gb-warning)' : 'var(--gb-brand-label)';
  const fillBg    = tone === 'warning' ? 'var(--gb-warning-tint-medium)' : 'var(--gb-brand-tint-medium)';
  const borderToken = `var(--gb-${tone}-tint-border)`;

  const ValuePill = ({ children }) => (
    <span style={{
      minWidth: 42, textAlign: 'center',
      fontSize: 11.5, fontWeight: 700,
      fontFamily: 'var(--gb-font-mono)',
      color: 'var(--gb-text-primary)',
      background: fillBg,
      border: `1px solid ${borderToken}`,
      borderRadius: 5, padding: '2px 7px',
      whiteSpace: 'nowrap',
    }}>{children}</span>
  );

  return (
    <div style={{ ...style, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {showValues && <ValuePill>{low}{unit}</ValuePill>}
        <div style={{ flex: 1, position: 'relative', height: 18, display: 'flex', alignItems: 'center' }}>
          {/* Track */}
          <div style={{
            position: 'absolute', left: 0, right: 0,
            height: 4, borderRadius: 2,
            background: 'var(--gb-fill-inverse-medium)',
            border: '1px solid var(--gb-border-subtle)',
          }} />
          {/* Selected range fill */}
          <div style={{
            position: 'absolute', left: `${lowPct}%`,
            width: `${highPct - lowPct}%`,
            height: 4, borderRadius: 2,
            background: fillColor,
            boxShadow: `0 0 8px ${tone === 'warning' ? 'rgba(224,160,48,.4)' : 'rgba(143,206,46,.45)'}`,
          }} />
          {/* Ticks */}
          {ticks && ticks.map((t, i) => {
            const tp = ((t - min) / (max - min)) * 100;
            return (
              <div key={i} style={{
                position: 'absolute', left: `${tp}%`,
                width: 1, height: 8, top: 5,
                background: 'var(--gb-border-strong)',
                transform: 'translateX(-50%)',
              }} />
            );
          })}
          {/* Low thumb */}
          <div style={{
            position: 'absolute', left: `${lowPct}%`,
            transform: 'translateX(-50%)',
            width: 14, height: 14, borderRadius: '50%',
            background: 'var(--gb-surface-1)',
            border: `2px solid ${fillColor}`,
            boxShadow: '0 1px 4px rgba(0,0,0,.4), var(--gb-focus-ring)',
            cursor: 'grab',
            zIndex: 2,
          }} />
          {/* High thumb */}
          <div style={{
            position: 'absolute', left: `${highPct}%`,
            transform: 'translateX(-50%)',
            width: 14, height: 14, borderRadius: '50%',
            background: 'var(--gb-surface-1)',
            border: `2px solid ${fillColor}`,
            boxShadow: '0 1px 4px rgba(0,0,0,.4), var(--gb-focus-ring)',
            cursor: 'grab',
            zIndex: 2,
          }} />
        </div>
        {showValues && <ValuePill>{high}{unit}</ValuePill>}
      </div>
      {showRange && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>
          <span>{min}{unit}</span>
          <span>{max}{unit}</span>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SWITCH-TAG — switch inside a tag chrome
   Combines label + state in one compact control.
   Used for inline feature toggles, "Enabled" badges that flip,
   per-row enable controls in a list.
════════════════════════════════════════════════════════════ */
function SwitchTag({ on, label, tone, icon, size = 'md', onClick, style }) {
  // Auto-tone: switch ON glows brand, OFF goes neutral
  const activeTone = tone || (on ? 'brand' : 'neutral');
  const tones = {
    neutral: { fg: 'var(--gb-text-muted)',    bg: 'var(--gb-fill-subtle)',         bd: 'var(--gb-border-default)' },
    brand:   { fg: 'var(--gb-brand-label)',   bg: 'var(--gb-brand-tint-medium)',  bd: 'var(--gb-brand-tint-border)' },
    warning: { fg: 'var(--gb-warning-fg)',    bg: 'var(--gb-warning-tint-medium)',bd: 'var(--gb-warning-tint-border)' },
    error:   { fg: 'var(--gb-error-fg)',      bg: 'var(--gb-error-tint-medium)',  bd: 'var(--gb-error-tint-border)' },
  };
  const t = tones[activeTone];
  const sizes = {
    sm: { fontSize: 10.5, padding: '3px 7px',  gap: 6, switchW: 22, switchH: 12, knob: 8,  iconSize: 9 },
    md: { fontSize: 11.5, padding: '4px 9px',  gap: 7, switchW: 26, switchH: 14, knob: 10, iconSize: 10 },
    lg: { fontSize: 12.5, padding: '5px 11px', gap: 8, switchW: 30, switchH: 16, knob: 12, iconSize: 11 },
  };
  const s = sizes[size];

  return (
    <span onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: s.gap,
      padding: s.padding, borderRadius: 'var(--gb-r-sm)',
      fontSize: s.fontSize, fontWeight: 600,
      background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
      cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
      transition: 'all var(--gb-anim)',
      ...style,
    }}>
      {icon && (React.isValidElement(icon) ? React.cloneElement(icon, { size: s.iconSize }) : icon)}
      {label}
      <span style={{
        position: 'relative', display: 'inline-block', flexShrink: 0,
        width: s.switchW, height: s.switchH, borderRadius: s.switchH,
        background: on ? t.fg : 'var(--gb-fill-inverse-strong)',
        transition: 'all var(--gb-anim)',
        marginLeft: 2,
      }}>
        <span style={{
          position: 'absolute', top: '50%',
          left: on ? `${s.switchW - s.knob - 2}px` : '2px',
          transform: 'translateY(-50%)',
          width: s.knob, height: s.knob, borderRadius: '50%',
          background: on ? 'var(--gb-surface-1)' : 'var(--gb-text-muted)',
          transition: 'all var(--gb-anim)',
        }} />
      </span>
    </span>
  );
}

/* ════════════════════════════════════════════════════════════
   TOAST · NOTIFICATION
   Self-contained: <Toast /> renders one card; <ToastHost
   position={...} /> manages a stack; useToasts() exposes a
   push() function.
════════════════════════════════════════════════════════════ */
const ToastContext = React.createContext(null);

function useToasts() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToasts must be used inside <ToastProvider>');
  return ctx;
}

function ToastProvider({ children, position = 'top-center' }) {
  const [toasts, setToasts] = useState([]);
  const [pos, setPos] = useState(position);
  const push = React.useCallback((toast) => {
    const id = Math.random().toString(36).slice(2);
    const t = { id, tone: 'info', duration: 4000, ...toast };
    setToasts(prev => [...prev, t]);
    if (t.duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== id));
      }, t.duration);
    }
    return id;
  }, []);
  const dismiss = React.useCallback((id) => {
    setToasts(prev => prev.filter(x => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ push, dismiss, position: pos, setPosition: setPos }}>
      {children}
      <ToastHost toasts={toasts} position={pos} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastHost({ toasts, position, onDismiss }) {
  // Position presets — anchor + slide direction
  const anchors = {
    'top-center':   { top: 20,    left: '50%', transform: 'translateX(-50%)', alignItems: 'center',     direction: 'column'         },
    'top-right':    { top: 20,    right: 20,                                  alignItems: 'flex-end',   direction: 'column'         },
    'top-left':     { top: 20,    left: 20,                                   alignItems: 'flex-start', direction: 'column'         },
    'bottom-right': { bottom: 20, right: 20,                                  alignItems: 'flex-end',   direction: 'column-reverse' },
    'bottom-left':  { bottom: 20, left: 20,                                   alignItems: 'flex-start', direction: 'column-reverse' },
  };
  const a = anchors[position];
  return (
    <div style={{
      position: 'fixed',
      top: a.top, bottom: a.bottom, left: a.left, right: a.right,
      transform: a.transform,
      display: 'flex', flexDirection: a.direction,
      alignItems: a.alignItems,
      gap: 8, zIndex: 99999,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <Toast key={t.id} {...t} position={position} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function Toast({ tone = 'info', title, message, duration = 4000, position = 'top-center', onDismiss }) {
  // Map tone → tokens
  const tones = {
    info:    { fg: 'var(--gb-info-fg)',     bg: 'var(--gb-info-tint-soft)',    bd: 'var(--gb-info-tint-border)',    stripe: 'var(--gb-info)',          icon: <I.alert /> },
    brand:   { fg: 'var(--gb-brand-label)', bg: 'var(--gb-brand-tint-soft)',   bd: 'var(--gb-brand-tint-border)',   stripe: 'var(--gb-brand-label)',   icon: <I.bolt /> },
    success: { fg: 'var(--gb-success-fg)',  bg: 'var(--gb-success-tint-soft)', bd: 'var(--gb-success-tint-border)', stripe: 'var(--gb-success)',       icon: <I.check /> },
    warning: { fg: 'var(--gb-warning-fg)',  bg: 'var(--gb-warning-tint-soft)', bd: 'var(--gb-warning-tint-border)', stripe: 'var(--gb-warning)',       icon: <I.alert /> },
    error:   { fg: 'var(--gb-error-fg)',    bg: 'var(--gb-error-tint-soft)',   bd: 'var(--gb-error-tint-border)',   stripe: 'var(--gb-error)',         icon: <I.alert /> },
    loading: { fg: 'var(--gb-brand-label)', bg: 'var(--gb-brand-tint-soft)',   bd: 'var(--gb-brand-tint-border)',   stripe: 'var(--gb-brand-label)',   icon: 'spinner' },
  };
  const t = tones[tone];

  // Animation map: which way to slide in
  const animName =
    position === 'top-center' ? 'gb-toast-in-top'
    : position === 'top-right' || position === 'bottom-right' ? 'gb-toast-in-right'
    : 'gb-toast-in-left';

  return (
    <div style={{
      pointerEvents: 'auto',
      minWidth: 320, maxWidth: 440,
      background: 'var(--gb-surface-1)',
      border: `1px solid ${t.bd}`,
      borderRadius: 'var(--gb-r-lg)',
      boxShadow: 'var(--gb-shadow-popover)',
      overflow: 'hidden',
      display: 'flex',
      animation: `${animName} .35s cubic-bezier(.34,1.4,.64,1) both`,
      position: 'relative',
    }}>
      {/* Stripe */}
      <div style={{
        width: 4, flexShrink: 0,
        background: t.stripe,
        boxShadow: `0 0 8px ${t.stripe}`,
      }} />
      {/* Icon */}
      <div style={{
        width: 38, flexShrink: 0,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '12px 0',
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 'var(--gb-r-sm)',
          background: t.bg, color: t.fg,
          border: `1px solid ${t.bd}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {t.icon === 'spinner'
            ? <span style={{
                width: 12, height: 12, borderRadius: '50%',
                border: '2px solid currentColor', borderTopColor: 'transparent',
                animation: 'gb-spin .8s linear infinite',
              }} />
            : React.cloneElement(t.icon, { size: 13 })}
        </div>
      </div>
      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, padding: '11px 12px 11px 0' }}>
        {title && (
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8,
            color: t.fg, marginBottom: 3,
          }}>{title}</div>
        )}
        <div style={{
          fontSize: 12, color: 'var(--gb-text-secondary)',
          fontWeight: 500, lineHeight: 1.45,
        }}>{message}</div>
      </div>
      {/* Close */}
      <div style={{ padding: '10px 10px 0 0', flexShrink: 0 }}>
        <IconBtn size="xs" variant="ghost" icon={<I.close />} onClick={onDismiss} />
      </div>
      {/* Progress */}
      {duration > 0 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 2, background: 'var(--gb-fill-subtle)',
        }}>
          <div style={{
            height: '100%', background: t.stripe,
            boxShadow: `0 0 6px ${t.stripe}`,
            animation: `gb-toast-progress ${duration}ms linear forwards`,
          }} />
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ALTERNATIVE TOAST VARIANTS
   Different shapes, different intents — beyond the classic
   stripe+icon+message card.
════════════════════════════════════════════════════════════ */

/* ── A. The Pill — radical minimalism */
function PillToast({ tone = 'success', message, onDismiss }) {
  const tones = {
    info:    { fg: 'var(--gb-info-fg)',     dot: 'var(--gb-info)' },
    success: { fg: 'var(--gb-success-fg)',  dot: 'var(--gb-success)' },
    brand:   { fg: 'var(--gb-brand-label)', dot: 'var(--gb-brand-label)' },
    warning: { fg: 'var(--gb-warning-fg)',  dot: 'var(--gb-warning)' },
    error:   { fg: 'var(--gb-error-fg)',    dot: 'var(--gb-error)' },
  };
  const t = tones[tone];
  return (
    <div style={{
      pointerEvents: 'auto',
      display: 'inline-flex', alignItems: 'center', gap: 9,
      padding: '6px 12px 6px 11px',
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-pill)',
      boxShadow: 'var(--gb-shadow-popover)',
      animation: 'gb-toast-in-top .35s cubic-bezier(.34,1.4,.64,1) both',
    }}>
      <Dot tone={tone} glow size={7} />
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--gb-text-secondary)', whiteSpace: 'nowrap' }}>
        {message}
      </span>
      <span style={{ width: 1, height: 12, background: 'var(--gb-border-subtle)', marginLeft: 2 }} />
      <span onClick={onDismiss} style={{
        cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex',
        marginLeft: -2, padding: 2,
      }}><I.close size={10} /></span>
    </div>
  );
}

/* ── B. The Action Card — explicit CTA inside */
function ActionToast({ tone = 'brand', title, message, primary, secondary, onDismiss }) {
  const tones = {
    brand:   { fg: 'var(--gb-brand-label)', bg: 'var(--gb-brand-tint-soft)',   bd: 'var(--gb-brand-tint-border)' },
    success: { fg: 'var(--gb-success-fg)',  bg: 'var(--gb-success-tint-soft)', bd: 'var(--gb-success-tint-border)' },
    warning: { fg: 'var(--gb-warning-fg)',  bg: 'var(--gb-warning-tint-soft)', bd: 'var(--gb-warning-tint-border)' },
    error:   { fg: 'var(--gb-error-fg)',    bg: 'var(--gb-error-tint-soft)',   bd: 'var(--gb-error-tint-border)' },
  };
  const t = tones[tone];
  return (
    <div style={{
      pointerEvents: 'auto',
      width: 360,
      background: 'var(--gb-surface-1)',
      border: `1px solid ${t.bd}`,
      borderRadius: 'var(--gb-r-lg)',
      boxShadow: 'var(--gb-shadow-popover)',
      overflow: 'hidden',
      animation: 'gb-toast-in-right .35s cubic-bezier(.34,1.4,.64,1) both',
    }}>
      <div style={{ padding: '12px 12px 10px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 'var(--gb-r-sm)',
          background: t.bg, color: t.fg,
          border: `1px solid ${t.bd}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}><I.check size={13} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{title}</div>
          <div style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', marginTop: 2, lineHeight: 1.45 }}>{message}</div>
        </div>
        <span onClick={onDismiss} style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex', padding: 2 }}>
          <I.close size={11} />
        </span>
      </div>
      <div style={{
        display: 'flex', gap: 4, padding: '6px 8px 8px',
        borderTop: '1px solid var(--gb-border-subtle)',
        background: t.bg,
      }}>
        {secondary && <Btn variant="ghost" size="sm" onClick={onDismiss}>{secondary}</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="tinted" status={tone} size="sm" icon={<I.bolt />} onClick={onDismiss}>{primary}</Btn>
      </div>
    </div>
  );
}

/* ── C. The Step Tracker — multi-step operation feedback */
function StepToast({ steps, currentStep, onDismiss }) {
  return (
    <div style={{
      pointerEvents: 'auto',
      width: 340,
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-brand-tint-border)',
      borderRadius: 'var(--gb-r-lg)',
      boxShadow: 'var(--gb-shadow-popover)',
      overflow: 'hidden',
      animation: 'gb-toast-in-top .35s cubic-bezier(.34,1.4,.64,1) both',
    }}>
      <div style={{
        padding: '10px 12px',
        display: 'flex', alignItems: 'center', gap: 9,
        borderBottom: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-brand-tint-soft)',
      }}>
        <span style={{
          width: 12, height: 12, borderRadius: '50%',
          border: '2px solid var(--gb-brand-label)', borderTopColor: 'transparent',
          animation: 'gb-spin .8s linear infinite',
        }} />
        <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--gb-brand-label)' }}>Submitting proof…</div>
        <span onClick={onDismiss} style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex' }}><I.close size={10} /></span>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((s, i) => {
          const state = i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending';
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                background: state === 'done' ? 'var(--gb-brand-label)'
                         : state === 'active' ? 'var(--gb-brand-tint-medium)'
                         : 'var(--gb-fill-subtle)',
                border: '1.5px solid ' + (state === 'pending' ? 'var(--gb-border-strong)' : 'var(--gb-brand-label)'),
                color: state === 'done' ? '#0a0b0c' : 'var(--gb-brand-label)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {state === 'done' && <I.check size={9} strokeWidth={3} />}
                {state === 'active' && <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'var(--gb-brand-label)',
                  animation: 'gb-pulse 1.2s ease-in-out infinite',
                }} />}
              </div>
              <span style={{
                fontSize: 11.5,
                color: state === 'pending' ? 'var(--gb-text-muted)' :
                       state === 'done' ? 'var(--gb-text-tertiary)' :
                       'var(--gb-text-primary)',
                fontWeight: state === 'active' ? 600 : 500,
                textDecoration: state === 'done' ? 'line-through' : 'none',
                textDecorationColor: 'var(--gb-text-ghost)',
              }}>{s}</span>
              {state === 'done' && <span style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', marginLeft: 'auto' }}>0.8s</span>}
              {state === 'active' && <span style={{ fontSize: 9.5, color: 'var(--gb-brand-label)', marginLeft: 'auto' }}>…</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── D. The Notification Tray — collapsed badge that expands */
function TrayToast({ items, onDismiss }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      pointerEvents: 'auto',
      animation: 'gb-toast-in-right .35s cubic-bezier(.34,1.4,.64,1) both',
    }}>
      {!open ? (
        <div onClick={() => setOpen(true)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '7px 10px 7px 9px',
          background: 'var(--gb-surface-1)',
          border: '1px solid var(--gb-brand-tint-border)',
          borderRadius: 'var(--gb-r-pill)',
          boxShadow: 'var(--gb-shadow-popover)',
          cursor: 'pointer',
        }}>
          <div style={{
            position: 'relative',
            width: 18, height: 18, borderRadius: '50%',
            background: 'var(--gb-brand-tint-medium)',
            color: 'var(--gb-brand-label)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <I.alert size={11} />
            <span style={{
              position: 'absolute', top: -2, right: -3,
              width: 5, height: 5, borderRadius: '50%',
              background: 'var(--gb-error)',
              boxShadow: '0 0 4px var(--gb-error)',
              animation: 'gb-pulse 1.2s ease-in-out infinite',
            }} />
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>
            <b style={{ color: 'var(--gb-brand-label)' }}>{items.length}</b>{' '}new
          </span>
          <I.chevd size={11} style={{ color: 'var(--gb-text-muted)' }} />
        </div>
      ) : (
        <div style={{
          width: 320,
          background: 'var(--gb-surface-1)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-lg)',
          boxShadow: 'var(--gb-shadow-popover)',
          overflow: 'hidden',
          animation: 'gb-toast-in-right .25s cubic-bezier(.34,1.4,.64,1) both',
        }}>
          <div style={{
            padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: 9,
            borderBottom: '1px solid var(--gb-border-subtle)',
            background: 'var(--gb-fill-inverse-strong)',
          }}>
            <I.alert size={12} style={{ color: 'var(--gb-brand-label)' }} />
            <div style={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
              {items.length} notifications
            </div>
            <span onClick={() => setOpen(false)} style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex' }}>
              <I.chevd size={11} style={{ transform: 'rotate(180deg)' }} />
            </span>
            <span onClick={onDismiss} style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex' }}>
              <I.close size={10} />
            </span>
          </div>
          <div style={{ maxHeight: 220, overflow: 'auto' }}>
            {items.map((it, i) => (
              <div key={i} style={{
                padding: '9px 12px',
                borderBottom: i < items.length - 1 ? '1px solid var(--gb-border-subtle)' : 'none',
                display: 'flex', gap: 9, alignItems: 'flex-start',
              }}>
                <Dot tone={it.tone} glow size={6} style={{ marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{it.title}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>{it.message}</div>
                </div>
                <span style={{ fontSize: 9.5, color: 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap' }}>{it.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── E. The Edge Strip — ambient, sits along the screen edge */
function EdgeToast({ tone = 'brand', message, onDismiss }) {
  const tones = {
    info:    'var(--gb-info)',
    success: 'var(--gb-success)',
    brand:   'var(--gb-brand-label)',
    warning: 'var(--gb-warning)',
    error:   'var(--gb-error)',
  };
  const c = tones[tone];
  return (
    <div style={{
      pointerEvents: 'auto',
      width: 'min(560px, calc(100vw - 80px))',
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 12px',
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-subtle)',
      borderTop: `2px solid ${c}`,
      borderRadius: '0 0 var(--gb-r-md) var(--gb-r-md)',
      boxShadow: '0 6px 24px rgba(0,0,0,.3)',
      animation: 'gb-toast-in-top .25s cubic-bezier(.34,1.4,.64,1) both',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: c, boxShadow: `0 0 6px ${c}`,
        animation: 'gb-pulse 1.4s ease-in-out infinite',
      }} />
      <span style={{ flex: 1, fontSize: 11.5, fontWeight: 500, color: 'var(--gb-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {message}
      </span>
      <span onClick={onDismiss} style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex', padding: 2 }}>
        <I.close size={10} />
      </span>
    </div>
  );
}

Object.assign(window, { PillToast, ActionToast, StepToast, TrayToast, EdgeToast });

/* ── F. The Floating Banner — informative, mid-width */
function BannerToast({ tone = 'info', title, message, side = 'center', onDismiss }) {
  const tones = {
    info:    { fg: 'var(--gb-info-fg)',     bg: 'var(--gb-info-tint-soft)',    bd: 'var(--gb-info-tint-border)',    icon: <I.alert /> },
    brand:   { fg: 'var(--gb-brand-label)', bg: 'var(--gb-brand-tint-soft)',   bd: 'var(--gb-brand-tint-border)',   icon: <I.bolt /> },
    success: { fg: 'var(--gb-success-fg)',  bg: 'var(--gb-success-tint-soft)', bd: 'var(--gb-success-tint-border)', icon: <I.check /> },
    warning: { fg: 'var(--gb-warning-fg)',  bg: 'var(--gb-warning-tint-soft)', bd: 'var(--gb-warning-tint-border)', icon: <I.alert /> },
    error:   { fg: 'var(--gb-error-fg)',    bg: 'var(--gb-error-tint-soft)',   bd: 'var(--gb-error-tint-border)',   icon: <I.alert /> },
  };
  const t = tones[tone];
  return (
    <div style={{
      pointerEvents: 'auto',
      width: 'min(480px, calc(100vw - 80px))',
      display: 'flex', alignItems: 'center', gap: 11,
      padding: '10px 12px',
      background: 'var(--gb-surface-1)',
      border: `1px solid ${t.bd}`,
      borderLeft: `3px solid ${t.fg}`,
      borderRadius: 'var(--gb-r-md)',
      boxShadow: 'var(--gb-shadow-popover)',
      animation: `gb-toast-in-${side === 'center' ? 'top' : side === 'left' ? 'left' : 'right'} .3s cubic-bezier(.34,1.4,.64,1) both`,
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 'var(--gb-r-sm)', flexShrink: 0,
        background: t.bg, color: t.fg,
        border: `1px solid ${t.bd}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{React.cloneElement(t.icon, { size: 12 })}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)', lineHeight: 1.3 }}>
            {title}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--gb-text-tertiary)', marginTop: title ? 1 : 0, lineHeight: 1.4 }}>
          {message}
        </div>
      </div>
      <span onClick={onDismiss} style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex', padding: 3, flexShrink: 0 }}>
        <I.close size={11} />
      </span>
    </div>
  );
}

Object.assign(window, { BannerToast });

/* ════════════════════════════════════════════════════════════
   FEATURE TOGGLE — 5 variations when the toggle deserves attention
════════════════════════════════════════════════════════════ */

/* ── A. Spotlight — icon · name · desc · big switch, glows when on */
function FeatureSpotlight({ on, icon, name, desc, onChange, tone = 'brand', experimental }) {
  const fg  = experimental ? 'var(--gb-warning)'        : 'var(--gb-brand-label)';
  const bg  = experimental ? 'var(--gb-warning-tint-soft)' : 'var(--gb-brand-tint-soft)';
  const bd  = experimental ? 'var(--gb-warning-tint-border)' : 'var(--gb-brand-tint-border)';
  return (
    <div onClick={() => onChange?.(!on)} style={{
      padding: 16,
      background: on ? bg : 'var(--gb-surface-1)',
      border: `1px solid ${on ? bd : 'var(--gb-border-default)'}`,
      borderRadius: 'var(--gb-r-lg)',
      display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: on ? `0 0 0 4px ${experimental ? 'var(--gb-warning-tint-soft)' : 'var(--gb-brand-tint-soft)'}` : 'none',
      cursor: 'pointer',
      transition: 'all var(--gb-anim)',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 'var(--gb-r-md)', flexShrink: 0,
        background: on ? (experimental ? 'var(--gb-warning-tint-medium)' : 'var(--gb-brand-tint-medium)') : 'var(--gb-fill-subtle)',
        color: on ? fg : 'var(--gb-text-muted)',
        border: `1px solid ${on ? bd : 'var(--gb-border-default)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all var(--gb-anim)',
      }}>{React.cloneElement(icon, { size: 20 })}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{name}</span>
          {experimental && <Tag tone="warning" size="xs">EXPERIMENTAL</Tag>}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', marginTop: 3, lineHeight: 1.5 }}>{desc}</div>
      </div>
      <Switch on={on} size="lg" tone={experimental ? 'warning' : 'brand'} />
    </div>
  );
}

/* ── B. Hero — full-bleed gradient when on, large name, side-by-side switch */
function FeatureHero({ on, icon, name, desc, onChange }) {
  return (
    <div onClick={() => onChange?.(!on)} style={{
      padding: '18px 20px',
      background: on
        ? 'linear-gradient(135deg, var(--gb-brand-tint-medium) 0%, var(--gb-brand-tint-soft) 100%)'
        : 'var(--gb-surface-1)',
      border: `1px solid ${on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}`,
      borderRadius: 'var(--gb-r-lg)',
      display: 'flex', alignItems: 'center', gap: 16,
      cursor: 'pointer', position: 'relative', overflow: 'hidden',
      transition: 'all var(--gb-anim)',
    }}>
      {/* Decorative glow when on */}
      {on && (
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 140, height: 140, borderRadius: '50%',
          background: 'radial-gradient(circle, var(--gb-brand-tint-strong), transparent 70%)',
          pointerEvents: 'none',
        }} />
      )}
      <div style={{
        width: 38, height: 38, borderRadius: 'var(--gb-r-md)', flexShrink: 0, zIndex: 1,
        background: on ? 'var(--gb-surface-1)' : 'var(--gb-fill-subtle)',
        color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
        border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: on ? '0 4px 14px var(--gb-brand-tint-medium)' : 'none',
      }}>{React.cloneElement(icon, { size: 17 })}</div>
      <div style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: -.2, color: 'var(--gb-text-primary)' }}>{name}</span>
          <Tag tone={on ? 'brand' : 'neutral'} size="xs">{on ? 'ACTIVE' : 'OFF'}</Tag>
        </div>
        <div style={{ fontSize: 11.5, color: on ? 'var(--gb-text-secondary)' : 'var(--gb-text-tertiary)', marginTop: 3, lineHeight: 1.5 }}>{desc}</div>
      </div>
      <Switch on={on} size="lg" />
    </div>
  );
}

/* ── C. Preview card — toggle WITH a live preview of what it controls */
function FeaturePreview({ on, icon, name, desc, onChange, preview }) {
  return (
    <div style={{
      background: 'var(--gb-surface-1)',
      border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
      borderRadius: 'var(--gb-r-lg)', overflow: 'hidden',
      transition: 'all var(--gb-anim)',
    }}>
      <div onClick={() => onChange?.(!on)} style={{
        padding: 14, display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer',
        borderBottom: '1px solid var(--gb-border-subtle)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 'var(--gb-r-sm)', flexShrink: 0,
          background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
          color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
          border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{React.cloneElement(icon, { size: 14 })}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{name}</div>
          <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2 }}>{desc}</div>
        </div>
        <Switch on={on} size="md" />
      </div>
      <div style={{
        padding: 14,
        background: 'var(--gb-fill-inverse-soft)',
        opacity: on ? 1 : .35,
        filter: on ? 'none' : 'grayscale(.7)',
        transition: 'all var(--gb-anim)',
        position: 'relative',
      }}>
        <div style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8,
          color: 'var(--gb-text-muted)', marginBottom: 8,
        }}>Preview · {on ? 'visible' : 'hidden when off'}</div>
        {preview}
      </div>
    </div>
  );
}

/* ── D. Bank — grouped toggles with a master "all on/off/mixed" switch */
function FeatureBank({ title, items, onChange }) {
  const allOn  = items.every(it => it.on);
  const anyOn  = items.some(it => it.on);
  const masterOn = allOn;
  const indeterminate = anyOn && !allOn;

  return (
    <div style={{
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-lg)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '13px 14px',
        background: anyOn ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-inverse-soft)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>{title}</div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 2, fontFamily: 'var(--gb-font-mono)' }}>
            {items.filter(i => i.on).length}/{items.length} enabled
            {indeterminate && <span style={{ marginLeft: 6, color: 'var(--gb-warning-fg)' }}>· mixed</span>}
          </div>
        </div>
        <Btn variant="ghost" size="sm" onClick={() => onChange?.(items.map(it => ({ ...it, on: !masterOn })))}>
          {allOn ? 'Disable all' : 'Enable all'}
        </Btn>
        <Switch on={masterOn} size="md" tone={indeterminate ? 'warning' : 'brand'} />
      </div>
      <div style={{ padding: '4px 6px' }}>
        {items.map((it, i) => (
          <div key={it.id} onClick={() => onChange?.(items.map((x, j) => i === j ? { ...x, on: !x.on } : x))} style={{
            padding: '10px 10px',
            display: 'flex', alignItems: 'center', gap: 10,
            cursor: 'pointer',
            borderBottom: i < items.length - 1 ? '1px solid var(--gb-border-subtle)' : 'none',
            borderRadius: 'var(--gb-r-sm)',
            transition: 'background var(--gb-anim)',
          }}>
            {it.icon && (
              <div style={{
                width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                background: it.on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
                color: it.on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
                border: '1px solid ' + (it.on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{React.cloneElement(it.icon, { size: 10 })}</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{it.name}</div>
              {it.desc && <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1, lineHeight: 1.45 }}>{it.desc}</div>}
            </div>
            <Switch on={it.on} size="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── E. Status — toggle + live stats column */
function FeatureStatus({ on, icon, name, desc, stats, onChange }) {
  return (
    <div onClick={() => onChange?.(!on)} style={{
      padding: 14,
      background: 'var(--gb-surface-1)',
      border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
      borderRadius: 'var(--gb-r-lg)',
      display: 'flex', alignItems: 'center', gap: 14,
      cursor: 'pointer',
      transition: 'all var(--gb-anim)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 'var(--gb-r-sm)', flexShrink: 0,
        background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
        color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
        border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{React.cloneElement(icon, { size: 16 })}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{name}</span>
          <Dot tone={on ? 'brand' : 'muted'} glow={on} size={6} />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}>
            {on ? 'Live' : 'Idle'}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--gb-text-tertiary)', marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{
        display: 'flex', gap: 14,
        paddingRight: 14,
        borderRight: '1px solid var(--gb-border-subtle)',
        opacity: on ? 1 : .35,
        transition: 'opacity var(--gb-anim)',
      }}>
        {stats.map(s => (
          <div key={s.label} style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .7, color: 'var(--gb-text-muted)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <Switch on={on} size="lg" />
    </div>
  );
}

Object.assign(window, { FeatureSpotlight, FeatureHero, FeaturePreview, FeatureBank, FeatureStatus });

/* ════════════════════════════════════════════════════════════
   COLOR SPOTLIGHT — 5 variations for putting colors front-and-center
   Mirrors the feature toggle variants (Spotlight / Hero / Preview /
   Bank / Status) but for color tokens.
════════════════════════════════════════════════════════════ */

/* ── A. Spotlight — full-height swatch + name + hex + reset */
function ColorSpotlight({ value, defaultValue, name, desc, varName, onChange }) {
  const modified = value !== defaultValue;
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      background: 'var(--gb-surface-1)',
      border: '1px solid ' + (modified ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
      borderRadius: 'var(--gb-r-lg)',
      overflow: 'hidden',
      boxShadow: modified ? '0 0 0 4px var(--gb-brand-tint-soft)' : 'none',
      transition: 'all var(--gb-anim)',
    }}>
      {/* Big swatch */}
      <label style={{ width: 88, position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
        <div style={{ width: '100%', height: '100%', background: value }} />
        <input type="color" value={value} onChange={e => onChange?.(e.target.value)} style={{
          position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer',
        }} />
        {modified && (
          <div style={{
            position: 'absolute', bottom: 6, right: 6,
            padding: '2px 6px', borderRadius: 99,
            background: 'rgba(0,0,0,.55)',
            color: '#fff', fontSize: 8.5, fontWeight: 800,
            letterSpacing: .6, textTransform: 'uppercase',
            backdropFilter: 'blur(4px)',
          }}>EDITED</div>
        )}
      </label>
      {/* Right body */}
      <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{name}</span>
          <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 9.5, color: 'var(--gb-text-ghost)' }}>{varName}</span>
        </div>
        {desc && <div style={{ fontSize: 11, color: 'var(--gb-text-tertiary)', lineHeight: 1.5 }}>{desc}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
          <input
            value={value.toUpperCase()}
            onChange={e => onChange?.(e.target.value)}
            style={{
              width: 92, height: 28, padding: '0 9px',
              background: 'var(--gb-fill-inverse-medium)',
              border: '1px solid var(--gb-border-default)',
              borderRadius: 'var(--gb-r-sm)',
              fontFamily: 'var(--gb-font-mono)',
              fontSize: 11, fontWeight: 600,
              color: 'var(--gb-text-secondary)',
              letterSpacing: .5,
              outline: 'none',
            }}
          />
          {modified && (
            <button onClick={() => onChange?.(defaultValue)} style={{
              padding: '4px 9px', height: 28, borderRadius: 'var(--gb-r-sm)',
              background: 'transparent',
              border: '1px solid var(--gb-border-default)',
              color: 'var(--gb-text-muted)',
              fontSize: 10.5, fontWeight: 600, fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              <I.refresh size={10} /> Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── B. Hero — the color IS the background */
function ColorHero({ value, defaultValue, name, desc, varName, onChange }) {
  const modified = value !== defaultValue;
  // Compute readable text color
  const isLight = (() => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
    if (!m) return false;
    const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16));
    return (r * 299 + g * 587 + b * 114) / 1000 > 145;
  })();
  const fg = isLight ? 'rgba(0,0,0,.85)' : 'rgba(255,255,255,.95)';
  const subFg = isLight ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.7)';
  return (
    <div style={{
      padding: '20px 22px',
      background: value,
      border: `1px solid ${modified ? 'var(--gb-brand-tint-border)' : 'transparent'}`,
      borderRadius: 'var(--gb-r-lg)',
      display: 'flex', alignItems: 'center', gap: 18,
      boxShadow: modified ? '0 0 0 4px var(--gb-brand-tint-soft)' : '0 4px 18px rgba(0,0,0,.25)',
      position: 'relative', overflow: 'hidden',
      transition: 'all var(--gb-anim)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -.3, color: fg }}>{name}</span>
          {modified && (
            <span style={{
              padding: '2px 7px', borderRadius: 4,
              background: 'rgba(255,255,255,.18)',
              color: fg, fontSize: 8.5, fontWeight: 800, letterSpacing: .8, textTransform: 'uppercase',
              backdropFilter: 'blur(4px)',
            }}>EDITED</span>
          )}
        </div>
        {desc && <div style={{ fontSize: 12, color: subFg, marginTop: 4, lineHeight: 1.5 }}>{desc}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <label style={{ position: 'relative', cursor: 'pointer' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 'var(--gb-r-sm)',
              background: 'rgba(255,255,255,.18)',
              color: fg, fontFamily: 'var(--gb-font-mono)', fontSize: 12, fontWeight: 700,
              letterSpacing: .5, backdropFilter: 'blur(4px)',
            }}>
              {value.toUpperCase()}
              <I.edit size={10} />
            </span>
            <input type="color" value={value} onChange={e => onChange?.(e.target.value)} style={{
              position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer',
            }} />
          </label>
          <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 10, color: subFg }}>{varName}</span>
          {modified && (
            <button onClick={() => onChange?.(defaultValue)} style={{
              marginLeft: 'auto',
              padding: '4px 10px', borderRadius: 'var(--gb-r-sm)',
              background: 'rgba(255,255,255,.18)',
              border: 'none', color: fg,
              fontSize: 10.5, fontWeight: 600, fontFamily: 'inherit',
              cursor: 'pointer', backdropFilter: 'blur(4px)',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              <I.refresh size={10} /> Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── C. Preview — color choice with a live preview of where it's used */
function ColorPreview({ value, defaultValue, name, desc, varName, onChange, preview }) {
  const modified = value !== defaultValue;
  return (
    <div style={{
      background: 'var(--gb-surface-1)',
      border: '1px solid ' + (modified ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
      borderRadius: 'var(--gb-r-lg)', overflow: 'hidden',
      transition: 'all var(--gb-anim)',
    }}>
      <div style={{
        padding: 14, display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: '1px solid var(--gb-border-subtle)',
      }}>
        <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--gb-r-md)',
            background: value,
            border: '1px solid var(--gb-border-default)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06)',
          }} />
          <input type="color" value={value} onChange={e => onChange?.(e.target.value)} style={{
            position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer',
          }} />
        </label>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{name}</span>
            <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 9.5, color: 'var(--gb-text-ghost)' }}>{varName}</span>
          </div>
          {desc && <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2, lineHeight: 1.45 }}>{desc}</div>}
        </div>
        <input
          value={value.toUpperCase()}
          onChange={e => onChange?.(e.target.value)}
          style={{
            width: 86, height: 28, padding: '0 9px',
            background: 'var(--gb-fill-inverse-medium)',
            border: '1px solid var(--gb-border-default)',
            borderRadius: 'var(--gb-r-sm)',
            fontFamily: 'var(--gb-font-mono)',
            fontSize: 11, fontWeight: 600,
            color: 'var(--gb-text-secondary)', outline: 'none',
          }}
        />
        {modified && (
          <button onClick={() => onChange?.(defaultValue)} style={{
            width: 28, height: 28, borderRadius: 'var(--gb-r-sm)',
            background: 'transparent',
            border: '1px solid var(--gb-border-default)',
            color: 'var(--gb-text-muted)',
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <I.refresh size={11} />
          </button>
        )}
      </div>
      <div style={{
        padding: 14,
        background: 'var(--gb-fill-inverse-soft)',
      }}>
        <div style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8,
          color: 'var(--gb-text-muted)', marginBottom: 9,
        }}>Live preview</div>
        {typeof preview === 'function' ? preview(value) : preview}
      </div>
    </div>
  );
}

/* ── D. Bank — group of related colors with master reset */
function ColorBank({ title, palette, defaults, onChange }) {
  const items = Object.entries(palette);
  const modifiedCount = items.filter(([k, v]) => v !== defaults[k]).length;
  return (
    <div style={{
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-lg)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '13px 14px',
        background: modifiedCount > 0 ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-inverse-soft)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>{title}</div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 2, fontFamily: 'var(--gb-font-mono)' }}>
            {items.length} colors
            {modifiedCount > 0 && <span style={{ marginLeft: 6, color: 'var(--gb-brand-label)' }}>· {modifiedCount} edited</span>}
          </div>
        </div>
        {/* Stacked mini swatches */}
        <div style={{ display: 'flex', marginRight: 6 }}>
          {items.slice(0, 5).map(([k, v], i) => (
            <div key={k} style={{
              width: 18, height: 18, borderRadius: '50%',
              background: v,
              border: '2px solid var(--gb-surface-1)',
              marginLeft: i === 0 ? 0 : -7,
              zIndex: items.length - i,
            }} />
          ))}
        </div>
        {modifiedCount > 0 && (
          <Btn variant="ghost" size="sm" icon={<I.refresh />} onClick={() => onChange?.(defaults)}>Reset all</Btn>
        )}
      </div>
      <div style={{ padding: 4 }}>
        {items.map(([k, v], i) => {
          const def = defaults[k];
          const mod = v !== def;
          return (
            <div key={k} style={{
              display: 'flex', alignItems: 'center', gap: 11,
              padding: '8px 10px',
              borderBottom: i < items.length - 1 ? '1px solid var(--gb-border-subtle)' : 'none',
              borderRadius: 'var(--gb-r-sm)',
            }}>
              <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 'var(--gb-r-sm)',
                  background: v, border: '1px solid var(--gb-border-default)',
                }} />
                <input type="color" value={v} onChange={e => onChange?.({ ...palette, [k]: e.target.value })} style={{
                  position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer',
                }} />
              </label>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{k}</div>
              </div>
              <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, color: 'var(--gb-text-tertiary)', letterSpacing: .4 }}>
                {v.toUpperCase()}
              </span>
              {mod && (
                <button onClick={() => onChange?.({ ...palette, [k]: def })} style={{
                  width: 22, height: 22, borderRadius: 5,
                  background: 'transparent', border: 'none',
                  color: 'var(--gb-text-muted)', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <I.refresh size={10} />
                </button>
              )}
              {!mod && <span style={{ width: 22 }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── E. Status — color + contrast + applied/default indicator */
function ColorStatus({ value, defaultValue, name, desc, varName, onChange, contrast }) {
  const modified = value !== defaultValue;
  return (
    <div style={{
      padding: 14,
      background: 'var(--gb-surface-1)',
      border: '1px solid ' + (modified ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
      borderRadius: 'var(--gb-r-lg)',
      display: 'flex', alignItems: 'center', gap: 14,
      transition: 'all var(--gb-anim)',
    }}>
      <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 'var(--gb-r-md)',
          background: value, border: '1px solid var(--gb-border-default)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06)',
        }} />
        <input type="color" value={value} onChange={e => onChange?.(e.target.value)} style={{
          position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer',
        }} />
      </label>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{name}</span>
          <Dot tone={modified ? 'brand' : 'muted'} glow={modified} size={6} />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: modified ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}>
            {modified ? 'Custom' : 'Default'}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--gb-text-tertiary)', marginTop: 2 }}>{desc}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, color: 'var(--gb-text-tertiary)' }}>{value.toUpperCase()}</span>
          <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 9.5, color: 'var(--gb-text-ghost)' }}>{varName}</span>
        </div>
      </div>
      {contrast && (
        <div style={{
          padding: '6px 10px',
          background: 'var(--gb-fill-subtle)',
          border: '1px solid var(--gb-border-subtle)',
          borderRadius: 'var(--gb-r-sm)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: contrast.ratio >= 4.5 ? 'var(--gb-brand-label)' : contrast.ratio >= 3 ? 'var(--gb-warning-fg)' : 'var(--gb-error-fg)' }}>
            {contrast.ratio.toFixed(2)}:1
          </div>
          <div style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .7, color: 'var(--gb-text-muted)', marginTop: 2 }}>
            {contrast.label}
          </div>
        </div>
      )}
      {modified && (
        <button onClick={() => onChange?.(defaultValue)} style={{
          width: 30, height: 30, borderRadius: 'var(--gb-r-sm)',
          background: 'transparent',
          border: '1px solid var(--gb-border-default)',
          color: 'var(--gb-text-muted)', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <I.refresh size={12} />
        </button>
      )}
    </div>
  );
}

Object.assign(window, { ColorSpotlight, ColorHero, ColorPreview, ColorBank, ColorStatus });

/* ════════════════════════════════════════════════════════════
   EXPANDABLE FEATURE — toggle in header, sub-settings revealed below
   For features with nested configuration. Two variants:
   · Soft (amber/warning) — for experimental features
   · Brand (green) — for stable features
════════════════════════════════════════════════════════════ */
function ExpandableFeature({ on, onChange, name, desc, icon, tone = 'brand', children, defaultExpanded }) {
  const palette = tone === 'warning'
    ? { fg: 'var(--gb-warning-fg)', tint: 'var(--gb-warning-tint-soft)', tintM: 'var(--gb-warning-tint-medium)', bd: 'var(--gb-warning-tint-border)' }
    : { fg: 'var(--gb-brand-label)', tint: 'var(--gb-brand-tint-soft)', tintM: 'var(--gb-brand-tint-medium)', bd: 'var(--gb-brand-tint-border)' };

  // Expanded body only visible when toggle is on
  const expanded = on && (defaultExpanded !== false);

  return (
    <div style={{
      background: on ? palette.tint : 'var(--gb-surface-1)',
      border: `1px solid ${on ? palette.bd : 'var(--gb-border-default)'}`,
      borderRadius: 'var(--gb-r-lg)', overflow: 'hidden',
      transition: 'all var(--gb-anim)',
    }}>
      <div onClick={() => onChange?.(!on)} style={{
        padding: '13px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer',
        borderBottom: expanded ? `1px solid ${palette.bd}` : 'none',
      }}>
        {icon && (
          <div style={{
            width: 34, height: 34, borderRadius: 'var(--gb-r-md)', flexShrink: 0,
            background: on ? palette.tintM : 'var(--gb-fill-subtle)',
            color: on ? palette.fg : 'var(--gb-text-muted)',
            border: `1px solid ${on ? palette.bd : 'var(--gb-border-default)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{React.cloneElement(icon, { size: 16 })}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: on ? palette.fg : 'var(--gb-text-primary)' }}>
              {name}
            </span>
            {on && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 700, color: palette.fg, textTransform: 'uppercase', letterSpacing: .6 }}>
                <Dot tone={tone} glow size={5} /> ACTIVE
              </span>
            )}
          </div>
          {desc && (
            <div style={{ fontSize: 11, color: on ? palette.fg : 'var(--gb-text-muted)', marginTop: 2, lineHeight: 1.5, opacity: on ? .75 : 1 }}>{desc}</div>
          )}
        </div>
        <Switch on={on} size="md" tone={tone === 'warning' ? 'warning' : 'brand'} />
      </div>

      {expanded && (
        <div style={{
          padding: 14,
          background: 'var(--gb-fill-inverse-soft)',
          animation: 'gb-toast-in-top .25s cubic-bezier(.34,1.4,.64,1) both',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ExpandableFeature });

/* ════════════════════════════════════════════════════════════
   SECTION LABEL — uppercase title with optional hairline
════════════════════════════════════════════════════════════ */
function SectionLabel({ children, action, divider = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{
        fontSize: 9.5, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 1.2,
        color: 'var(--gb-text-muted)', whiteSpace: 'nowrap',
      }}>{children}</div>
      {divider && <div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />}
      {action}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   CARD
════════════════════════════════════════════════════════════ */
function Card({ children, padding = 12, hover, active, style, ...rest }) {
  return (
    <div style={{
      background: active ? 'var(--gb-surface-2)' : 'var(--gb-surface-1)',
      border: '1px solid ' + (active ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
      borderRadius: 'var(--gb-r-md)',
      padding,
      transition: 'all var(--gb-anim)',
      ...style,
    }} {...rest}>{children}</div>
  );
}

/* ════════════════════════════════════════════════════════════
   KEY-VALUE — info row with fixed-width key
════════════════════════════════════════════════════════════ */
function KeyVal({ k, v, tone, mono }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0', minWidth: 0 }}>
      <div style={{
        fontSize: 9, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: .8,
        color: 'var(--gb-text-muted)',
        minWidth: 58, flexShrink: 0,
      }}>{k}</div>
      <div style={{
        flex: 1, fontSize: 12,
        color: tone === 'ok' ? 'var(--gb-brand-label)' :
               tone === 'error' ? 'var(--gb-error)' :
               tone === 'warn' ? 'var(--gb-warning-fg)' :
               'var(--gb-text-secondary)',
        fontWeight: tone === 'ok' ? 600 : 500,
        fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{v}</div>
    </div>
  );
}

/* Export all */
Object.assign(window, {
  Icon, I,
  Btn, IconBtn,
  Tag, Chip, Dot,
  Input, Textarea, Dropdown, Field,
  Switch, PillTag,
  ModalShell, ModalHeader, ModalFooter,
  SectionLabel, Card, KeyVal,
  Callout, Checkbox, Slider, RangeSlider, SwitchTag,
  Toast, ToastHost, ToastProvider, useToasts,
});
