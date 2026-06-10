/* ───────────────────────────────────────────────────────────────
   gb-kit-core.jsx — faithful port of the Golfballs extension's
   design-system primitives, lifted from src/ui/* so the live UIs in
   this guide are pixel-true to the real extension. Exposed on
   window.GB. Loaded as a Babel classic script; consumes the global
   React + window.Motion (framer-motion UMD).
─────────────────────────────────────────────────────────────── */
(function () {
  const { motion, AnimatePresence } = window.Motion;
  const { useState, useEffect, useRef } = React;

  /* ===== shared.jsx ===== */
  const T = {
    fast:   { duration: 0.12, ease: [0.4, 0, 0.2, 1] },
    base:   { duration: 0.18, ease: [0.4, 0, 0.2, 1] },
    bounce: { duration: 0.28, ease: [0.34, 1.4, 0.64, 1] },
  };
  const TINT = {
    neutral: { fg: 'var(--gb-text-tertiary)', bg: 'var(--gb-fill-subtle)',         soft: 'var(--gb-fill-faint)',        strong: 'var(--gb-fill-soft)',           bd: 'var(--gb-border-default)' },
    brand:   { fg: 'var(--gb-brand-label)',   bg: 'var(--gb-brand-tint-medium)',   soft: 'var(--gb-brand-tint-soft)',   strong: 'var(--gb-brand-tint-strong)',   bd: 'var(--gb-brand-tint-border)' },
    error:   { fg: 'var(--gb-error-fg)',      bg: 'var(--gb-error-tint-medium)',   soft: 'var(--gb-error-tint-soft)',   strong: 'var(--gb-error-tint-strong)',   bd: 'var(--gb-error-tint-border)' },
    warning: { fg: 'var(--gb-warning-fg)',    bg: 'var(--gb-warning-tint-medium)', soft: 'var(--gb-warning-tint-soft)', strong: 'var(--gb-warning-tint-strong)', bd: 'var(--gb-warning-tint-border)' },
    success: { fg: 'var(--gb-success-fg)',    bg: 'var(--gb-success-tint-medium)', soft: 'var(--gb-success-tint-soft)', strong: 'var(--gb-success-tint-strong)', bd: 'var(--gb-success-tint-border)' },
    info:    { fg: 'var(--gb-info-fg)',       bg: 'var(--gb-info-tint-medium)',    soft: 'var(--gb-info-tint-soft)',    strong: 'var(--gb-info-tint-strong)',    bd: 'var(--gb-info-tint-border)' },
  };
  function sizeIcon(icon, size) {
    return React.isValidElement(icon) ? React.cloneElement(icon, { size }) : icon;
  }
  function useAsyncState(stateProp = 'idle') {
    const [auto, setAuto] = useState('idle');
    const effective = stateProp !== 'idle' ? stateProp : auto;
    const run = (onClick, event) => {
      if (effective === 'loading' || !onClick) return;
      const result = onClick(event);
      if (result && typeof result.then === 'function') {
        setAuto('loading');
        result.then(() => setAuto('success'), () => setAuto('error'))
          .finally(() => setTimeout(() => setAuto('idle'), 1200));
      }
    };
    return [effective, run];
  }
  function Spinner({ size = 12 }) {
    return (
      <motion.span
        style={{ width: size, height: size, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', display: 'block', flexShrink: 0 }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 0.8, ease: 'linear', repeat: Infinity }}
      />
    );
  }
  const INPUT_RADII = { xs: 'var(--gb-r-sm)', sm: 'var(--gb-r-sm)', md: 'var(--gb-r-md)', lg: 'var(--gb-r-md)' };
  function inputBaseStyle({ focused, error, size = 'md' }) {
    const heights = { xs: 24, sm: 28, md: 32, lg: 36 };
    const fontSizes = { xs: 11, sm: 11.5, md: 12, lg: 13 };
    return {
      background: 'var(--gb-surface-2)',
      border: '1px solid ' + (focused ? 'var(--gb-brand-label)' : error ? 'var(--gb-error)' : 'var(--gb-border-default)'),
      borderRadius: INPUT_RADII[size] || INPUT_RADII.md,
      boxShadow: focused ? 'var(--gb-focus-ring)' : 'none',
      height: heights[size], fontSize: fontSizes[size],
      fontFamily: 'var(--gb-font-sans)', fontWeight: 500, color: 'var(--gb-text-primary)',
      transition: 'border-color var(--gb-anim-fast), box-shadow var(--gb-anim-fast)',
      display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', boxSizing: 'border-box',
    };
  }

  /* ===== icons.jsx ===== */
  const Icon = ({ size = 14, strokeWidth = 2, children, style, ...rest }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0, ...style }} {...rest}>{children}</svg>
  );
  const I = {
    mail:   (p) => <Icon {...p}><path d="M3 8l8.5 5.5a2 2 0 002 0L22 8" /><path d="M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></Icon>,
    phone:  (p) => <Icon {...p}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.72 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0122 16.92z" /></Icon>,
    cog:    (p) => <Icon {...p}><path d="M10.3 4.3c.4-1.7 2.9-1.7 3.3 0a1.7 1.7 0 002.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 001 2.5c1.8.5 1.8 3 0 3.4a1.7 1.7 0 00-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 00-2.6 1c-.4 1.8-2.9 1.8-3.3 0a1.7 1.7 0 00-2.6-1c-1.5.9-3.3-.8-2.4-2.4a1.7 1.7 0 00-1-2.6c-1.8-.4-1.8-2.9 0-3.4a1.7 1.7 0 001-2.5c-.9-1.6.9-3.3 2.4-2.4 1 .6 2.3.1 2.6-1.1z" /><circle cx="12" cy="12" r="3" /></Icon>,
    card:   (p) => <Icon {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M7 16h2" /></Icon>,
    edit:   (p) => <Icon {...p}><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></Icon>,
    eye:    (p) => <Icon {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Icon>,
    check:  (p) => <Icon {...p} strokeWidth={2.4}><path d="M20 6L9 17l-5-5" /></Icon>,
    send:   (p) => <Icon {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></Icon>,
    search: (p) => <Icon {...p}><circle cx="11" cy="11" r="7.5" /><path d="M20.5 20.5L17 17" /></Icon>,
    close:  (p) => <Icon {...p} strokeWidth={2.2}><path d="M18 6L6 18M6 6l12 12" /></Icon>,
    plus:   (p) => <Icon {...p} strokeWidth={2.4}><path d="M12 5v14M5 12h14" /></Icon>,
    chevd:  (p) => <Icon {...p} strokeWidth={2.2}><path d="M6 9l6 6 6-6" /></Icon>,
    chevr:  (p) => <Icon {...p} strokeWidth={2.2}><path d="M9 6l6 6-6 6" /></Icon>,
    trash:  (p) => <Icon {...p}><path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></Icon>,
    alert:  (p) => <Icon {...p}><path d="M10.3 3.86L1.82 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.86a2 2 0 00-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Icon>,
    bolt:   (p) => <Icon {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></Icon>,
    copy:   (p) => <Icon {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></Icon>,
    user:   (p) => <Icon {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>,
    filter: (p) => <Icon {...p}><path d="M22 3H2l8 9.5V19l4 2v-8.5z" /></Icon>,
    more:   (p) => <Icon {...p}><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></Icon>,
    sun:    (p) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></Icon>,
    moon:   (p) => <Icon {...p}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></Icon>,
    calc:   (p) => <Icon {...p}><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="11" x2="8" y2="11" /><line x1="12" y1="11" x2="12" y2="11" /><line x1="16" y1="11" x2="16" y2="11" /><line x1="8" y1="15" x2="8" y2="15" /><line x1="12" y1="15" x2="12" y2="15" /><line x1="16" y1="15" x2="16" y2="15" /><line x1="8" y1="19" x2="8" y2="19" /><line x1="12" y1="19" x2="12" y2="19" /><line x1="16" y1="19" x2="16" y2="19" /></Icon>,
    refresh:(p) => <Icon {...p}><path d="M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15" /></Icon>,
    shuffle:(p) => <Icon {...p}><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></Icon>,
    grid:   (p) => <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></Icon>,
    list:   (p) => <Icon {...p}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></Icon>,
    cube:   (p) => <Icon {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></Icon>,
    gift:   (p) => <Icon {...p}><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></Icon>,
    calendar:(p)=> <Icon {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>,
    play:   (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></Icon>,
    pause:  (p) => <Icon {...p} fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></Icon>,
    restart:(p) => <Icon {...p}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></Icon>,
  };

  /* ===== Btn.jsx ===== */
  const BTN_SIZES = {
    xs: { fontSize: 10.5, padding: '0 8px',  height: 22, gap: 4, iconSize: 10, radius: 'var(--gb-r-sm)' },
    sm: { fontSize: 11,   padding: '0 10px', height: 28, gap: 5, iconSize: 11, radius: 'var(--gb-r-sm)' },
    md: { fontSize: 12,   padding: '0 12px', height: 32, gap: 6, iconSize: 12, radius: 'var(--gb-r-md)' },
    lg: { fontSize: 13,   padding: '0 16px', height: 36, gap: 7, iconSize: 13, radius: 'var(--gb-r-lg)' },
  };
  const STATUS = {
    brand:   { bg: 'var(--gb-brand-tint-medium)',   hover: 'var(--gb-brand-tint-strong)' },
    error:   { bg: 'var(--gb-error-tint-medium)',   hover: 'var(--gb-error-tint-strong)' },
    warning: { bg: 'var(--gb-warning-tint-medium)', hover: 'var(--gb-warning-tint-strong)' },
    success: { bg: 'var(--gb-success-tint-medium)', hover: 'var(--gb-success-tint-strong)' },
    info:    { bg: 'var(--gb-info-tint-medium)',    hover: 'var(--gb-info-tint-strong)'    },
  };
  const STATUS_FG = { brand: 'var(--gb-brand-label)', error: 'var(--gb-error-fg)', warning: 'var(--gb-warning-fg)', success: 'var(--gb-success-fg)', info: 'var(--gb-info-fg)' };
  const STATUS_BD = { brand: 'var(--gb-brand-tint-border)', error: 'var(--gb-error-tint-border)', warning: 'var(--gb-warning-tint-border)', success: 'var(--gb-success-tint-border)', info: 'var(--gb-info-tint-border)' };
  function resolveVariant(variant, status) {
    const key = (status && STATUS[status]) ? status : 'brand';
    switch (variant) {
      case 'primary': return { base: { background: 'linear-gradient(180deg, var(--gb-brand) 0%, var(--gb-brand-dark) 100%)', color: 'var(--gb-text-on-brand)', border: '1px solid var(--gb-brand-border)' }, hover: { filter: 'brightness(1.1)' } };
      case 'tinted': return { base: { background: STATUS[key].bg, color: STATUS_FG[key], border: `1px solid ${STATUS_BD[key]}` }, hover: { backgroundColor: STATUS[key].hover } };
      case 'ghost': return { base: { background: 'transparent', color: 'var(--gb-text-tertiary)', border: '1px solid transparent' }, hover: { backgroundColor: 'var(--gb-fill-subtle)' } };
      case 'danger': return { base: { background: 'var(--gb-error-tint-medium)', color: 'var(--gb-error-fg)', border: '1px solid var(--gb-error-tint-border)' }, hover: { backgroundColor: 'var(--gb-error-tint-strong)' } };
      case 'dashed': return { base: { background: 'var(--gb-brand-tint-soft)', color: 'var(--gb-brand-label)', border: '1px dashed var(--gb-brand-tint-border)' }, hover: { backgroundColor: 'var(--gb-brand-tint-medium)' } };
      default: return { base: { background: 'var(--gb-fill-subtle)', color: 'var(--gb-text-secondary)', border: '1px solid var(--gb-border-default)' }, hover: { backgroundColor: 'var(--gb-fill-soft)' } };
    }
  }
  const BADGE_SIZES = {
    xs: { height: 13, minWidth: 13, font: 8.5, padX: 4, offsetY: -5, offsetX: -5 },
    sm: { height: 15, minWidth: 15, font: 9,   padX: 4, offsetY: -6, offsetX: -6 },
    md: { height: 17, minWidth: 17, font: 9.5, padX: 5, offsetY: -7, offsetX: -7 },
    lg: { height: 19, minWidth: 19, font: 10,  padX: 6, offsetY: -8, offsetX: -8 },
  };
  const BADGE_TONES = {
    brand: { bg: 'var(--gb-brand-label)', fg: 'var(--gb-text-on-brand)' },
    error: { bg: 'var(--gb-error)', fg: '#fff' },
    warning: { bg: 'var(--gb-warning)', fg: '#1a1a1a' },
    success: { bg: 'var(--gb-success)', fg: '#0a0a0a' },
    info: { bg: 'var(--gb-info)', fg: '#0a0a0a' },
    neutral: { bg: 'var(--gb-text-tertiary)', fg: 'var(--gb-surface-canvas)' },
  };
  function BtnBadge({ value, size, tone, pulse, ring }) {
    const b = BADGE_SIZES[size] || BADGE_SIZES.md;
    const t = BADGE_TONES[tone] || BADGE_TONES.brand;
    return (
      <span style={{ position: 'absolute', top: b.offsetY, right: b.offsetX, pointerEvents: 'none', display: 'flex', zIndex: 1 }}>
        <AnimatePresence initial={true} mode="popLayout">
          <motion.span key={String(value)}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={pulse ? { opacity: [1, 0.55, 1], scale: 1 } : { opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={pulse ? { scale: T.bounce, opacity: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } } : T.bounce}
            style={{ background: t.bg, color: t.fg, height: b.height, minWidth: b.minWidth, padding: `0 ${b.padX}px`, borderRadius: b.height / 2, fontSize: b.font, fontWeight: 800, lineHeight: 1, letterSpacing: 0.2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: ring ? '0 0 0 2px var(--gb-surface-canvas)' : 'none', fontFamily: 'var(--gb-font-sans)' }}>
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
    );
  }
  function Btn({ variant = 'secondary', size = 'md', status, state = 'idle', icon, iconRight, children, full, disabled, onClick, style, badge, badgeTone = 'brand', badgePulse, badgeRing = true, ...rest }) {
    const [effState, run] = useAsyncState(state);
    const [hovered, setHovered] = useState(false);
    const s = BTN_SIZES[size] || BTN_SIZES.md;
    const { base, hover } = resolveVariant(variant, status);
    const busy = effState === 'loading';
    const slot = busy ? <Spinner size={s.iconSize} /> : effState === 'success' ? <I.check size={s.iconSize} /> : effState === 'error' ? <I.alert size={s.iconSize} /> : icon ? sizeIcon(icon, s.iconSize) : null;
    const badgeValue = (() => {
      if (badge === 0 || badge === null || badge === undefined || badge === '') return null;
      if (typeof badge === 'number') return badge > 99 ? '99+' : String(badge);
      return badge;
    })();
    const hoverStyle = (hovered && !disabled && !busy) ? hover : null;
    return (
      <motion.button type="button" disabled={disabled || busy} onClick={(e) => run(onClick, e)}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        animate={{ x: effState === 'error' ? [0, -4, 4, -4, 4, 0] : 0 }}
        transition={effState === 'error' ? { duration: 0.35, ease: [0.36, 0.07, 0.19, 0.97] } : T.base}
        whileTap={disabled || busy ? undefined : { scale: 0.97 }}
        style={{ ...base, fontFamily: 'var(--gb-font-sans)', fontWeight: 600, letterSpacing: -0.05, fontSize: s.fontSize, padding: s.padding, height: s.height, gap: s.gap, borderRadius: s.radius, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'not-allowed' : busy ? 'progress' : 'pointer', opacity: disabled && !busy ? 0.5 : 1, whiteSpace: 'nowrap', flexShrink: 0, boxSizing: 'border-box', width: full ? '100%' : undefined, position: 'relative', outline: 'none', transition: 'background-color .15s, filter .15s, border-color .15s', ...style, ...hoverStyle }}
        {...rest}>
        {slot != null && (
          <span style={{ position: 'relative', width: s.iconSize, height: s.iconSize, flexShrink: 0 }}>
            <AnimatePresence initial={false}>
              <motion.span key={effState} initial={{ opacity: 0, scale: effState === 'success' ? 0.4 : 1 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={effState === 'success' ? T.bounce : T.base}
                style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{slot}</motion.span>
            </AnimatePresence>
          </span>
        )}
        {children}
        {iconRight && effState === 'idle' && <span style={{ display: 'flex' }}>{sizeIcon(iconRight, s.iconSize)}</span>}
        {badgeValue != null && <BtnBadge value={badgeValue} size={size} tone={badgeTone} pulse={badgePulse} ring={badgeRing} />}
      </motion.button>
    );
  }

  /* ===== Tag.jsx ===== */
  const TAG_SIZES = {
    xs: { fontSize: 9, padding: '1px 5px', borderRadius: 3, gap: 3, iconSize: 8 },
    sm: { fontSize: 9.5, padding: '1px 6px', borderRadius: 4, gap: 4, iconSize: 9 },
    md: { fontSize: 10.5, padding: '2px 7px', borderRadius: 5, gap: 4, iconSize: 10 },
    lg: { fontSize: 11.5, padding: '3px 9px', borderRadius: 5, gap: 5, iconSize: 11 },
  };
  function Tag({ children, tone = 'neutral', size = 'md', mono, icon, onRemove, pulse, style }) {
    const t = TINT[tone] || TINT.neutral;
    const s = TAG_SIZES[size] || TAG_SIZES.md;
    return (
      <motion.span initial={{ opacity: 0, scale: 0.6 }}
        animate={pulse ? { opacity: [1, 0.5, 1], scale: 1 } : { opacity: 1, scale: 1 }}
        transition={pulse ? { scale: T.bounce, opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut' } } : T.bounce}
        style={{ fontSize: s.fontSize, padding: s.padding, borderRadius: s.borderRadius, gap: s.gap, color: t.fg, background: t.bg, border: `1px solid ${t.bd}`, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)', display: 'inline-flex', alignItems: 'center', lineHeight: 1.5, whiteSpace: 'nowrap', boxSizing: 'border-box', ...style }}>
        {icon && sizeIcon(icon, s.iconSize)}
        {children}
        {onRemove && <span onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{ cursor: 'pointer', display: 'flex', marginLeft: 1 }}><I.close size={s.iconSize - 1} /></span>}
      </motion.span>
    );
  }

  /* ===== Dot.jsx ===== */
  const DOT_COLORS = { brand: 'var(--gb-brand-label)', error: 'var(--gb-error)', warning: 'var(--gb-warning)', success: 'var(--gb-success)', muted: 'var(--gb-text-muted)', info: 'var(--gb-info)' };
  function Dot({ tone = 'brand', size = 6, glow, pulse }) {
    const c = DOT_COLORS[tone] || DOT_COLORS.brand;
    return (
      <motion.span animate={pulse ? { opacity: [1, 0.4, 1], scale: [1, 0.85, 1] } : undefined}
        transition={pulse ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
        style={{ width: size, height: size, borderRadius: '50%', background: c, flexShrink: 0, display: 'inline-block', boxShadow: glow ? `0 0 ${size}px ${c}, 0 0 ${size * 2}px color-mix(in srgb, ${c} 20%, transparent)` : 'none' }} />
    );
  }

  /* ===== KeyVal.jsx ===== */
  const KV_TONE = { ok: 'var(--gb-brand-label)', error: 'var(--gb-error)', warn: 'var(--gb-warning-fg)' };
  function KeyVal({ k, v, tone = 'default', mono, style }) {
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0', minWidth: 0, ...style }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)', minWidth: 58, flexShrink: 0 }}>{k}</div>
        <div style={{ flex: 1, fontSize: 12, color: KV_TONE[tone] || 'var(--gb-text-secondary)', fontWeight: tone === 'ok' ? 600 : 500, fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{v}</div>
      </div>
    );
  }

  /* ===== SectionLabel.jsx ===== */
  function SectionLabel({ children, action, divider = true, style }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, ...style }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--gb-text-muted)', whiteSpace: 'nowrap' }}>{children}</div>
        {divider && <div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />}
        {action}
      </div>
    );
  }

  /* ===== Switch.jsx (CSS transitions — framer-motion can't parse var() colors) ===== */
  const SW_SIZES = { sm: { w: 28, h: 16, knob: 12 }, md: { w: 34, h: 20, knob: 16 }, lg: { w: 40, h: 22, knob: 18 } };
  function Switch({ on, size = 'md', tone = 'brand', disabled, onChange, style }) {
    const s = SW_SIZES[size] || SW_SIZES.md;
    const warn = tone === 'warning';
    const trackOn = warn ? 'var(--gb-warning-tint-medium)' : 'var(--gb-brand-tint-medium)';
    const borderOn = warn ? 'var(--gb-warning)' : 'var(--gb-brand)';
    const knobOn = warn ? 'var(--gb-warning)' : 'var(--gb-brand-label)';
    const knobX = s.w - s.knob - 4;
    return (
      <span role="switch" aria-checked={!!on} onClick={() => !disabled && onChange?.(!on)}
        style={{ position: 'relative', display: 'inline-block', flexShrink: 0, width: s.w, height: s.h, borderRadius: s.h, border: '1px solid', transition: 'background-color .18s, border-color .18s', backgroundColor: on ? trackOn : 'var(--gb-surface-2)', borderColor: on ? borderOn : 'var(--gb-border-default)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, boxSizing: 'border-box', ...style }}>
        <span style={{ position: 'absolute', top: '50%', left: 2, marginTop: -s.knob / 2, width: s.knob, height: s.knob, borderRadius: '50%', transition: 'transform .18s cubic-bezier(.4,0,.2,1), background-color .18s', transform: `translateX(${on ? knobX : 0}px)`, backgroundColor: on ? knobOn : 'var(--gb-text-tertiary)' }} />
      </span>
    );
  }

  /* ===== Input.jsx (compact faithful) ===== */
  function Input({ value, onChange, placeholder, size = 'md', mono, leading, trailing, error, disabled, autoFocus, onKeyDown, onFocus, onBlur, type = 'text', style }) {
    const [focused, setFocused] = useState(false);
    return (
      <div style={{ ...inputBaseStyle({ focused, error, size }), ...(disabled ? { opacity: 0.5 } : null), ...style }}>
        {leading && <span style={{ display: 'flex', flexShrink: 0, color: 'var(--gb-text-muted)' }}>{sizeIcon(leading, 13)}</span>}
        <input type={type} value={value ?? ''} placeholder={placeholder} disabled={disabled} autoFocus={autoFocus}
          onChange={(e) => onChange?.(e.target.value)} onKeyDown={onKeyDown}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }} onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--gb-text-primary)', fontSize: 'inherit', fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)', fontWeight: 500 }} />
        {trailing && <span style={{ display: 'flex', flexShrink: 0, color: 'var(--gb-text-muted)' }}>{trailing}</span>}
      </div>
    );
  }
  function Textarea({ value, onChange, placeholder, mono, rows = 4, style }) {
    const [focused, setFocused] = useState(false);
    return (
      <textarea value={value ?? ''} placeholder={placeholder} rows={rows}
        onChange={(e) => onChange?.(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--gb-surface-2)', border: '1px solid ' + (focused ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), boxShadow: focused ? 'var(--gb-focus-ring)' : 'none', borderRadius: 'var(--gb-r-md)', color: 'var(--gb-text-primary)', fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)', fontSize: 12, fontWeight: 500, padding: 10, outline: 'none', resize: 'vertical', lineHeight: 1.6, ...style }} />
    );
  }

  /* ===== Field.jsx ===== */
  function Field({ label, required, hint, children, style }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
        {label && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>{label}</span>
            {required && <span style={{ fontSize: 9, color: 'var(--gb-brand-label)', fontWeight: 700 }}>•</span>}
            {hint && <span style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>{hint}</span>}
          </div>
        )}
        {children}
      </div>
    );
  }

  /* ===== Card.jsx ===== */
  function Card({ children, style }) {
    return <div style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', ...style }}>{children}</div>;
  }

  /* ===== Callout.jsx ===== */
  function Callout({ tone = 'brand', title, children, icon, style }) {
    const t = TINT[tone] || TINT.brand;
    return (
      <div style={{ background: t.soft, border: `1px solid ${t.bd}`, borderRadius: 'var(--gb-r-md)', padding: '10px 12px', display: 'flex', gap: 9, ...style }}>
        <span style={{ color: t.fg, flexShrink: 0, marginTop: 1 }}>{icon || <I.alert size={14} />}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {title && <div style={{ fontSize: 11.5, fontWeight: 700, color: t.fg, marginBottom: 3 }}>{title}</div>}
          <div style={{ fontSize: 11, color: 'var(--gb-text-tertiary)', lineHeight: 1.6 }}>{children}</div>
        </div>
      </div>
    );
  }

  /* ===== FeatureSpotlight.jsx ===== */
  const FS_SIZES = {
    xs: { pad: 8,  box: 24, icon: 12, name: 11.5, desc: 10,   gap: 9,  sw: 'sm', radius: 'var(--gb-r-md)' },
    sm: { pad: 11, box: 30, icon: 15, name: 12.5, desc: 10.5, gap: 11, sw: 'sm', radius: 'var(--gb-r-lg)' },
    md: { pad: 14, box: 36, icon: 17, name: 13.5, desc: 11,   gap: 12, sw: 'md', radius: 'var(--gb-r-lg)' },
    lg: { pad: 16, box: 44, icon: 20, name: 14,   desc: 11.5, gap: 14, sw: 'lg', radius: 'var(--gb-r-lg)' },
  };
  function FeatureSpotlight({ on, icon, name, desc, onChange, tone, experimental, size = 'md' }) {
    const s = FS_SIZES[size] || FS_SIZES.md;
    const effectiveTone = tone || (experimental ? 'warning' : 'brand');
    const fg = experimental ? 'var(--gb-warning)' : 'var(--gb-brand-label)';
    const bg = experimental ? 'var(--gb-warning-tint-soft)' : 'var(--gb-brand-tint-soft)';
    const bd = experimental ? 'var(--gb-warning-tint-border)' : 'var(--gb-brand-tint-border)';
    const tintMedium = experimental ? 'var(--gb-warning-tint-medium)' : 'var(--gb-brand-tint-medium)';
    return (
      <div onClick={() => onChange?.(!on)}
        style={{ padding: s.pad, border: '1px solid', borderRadius: s.radius, display: 'flex', alignItems: 'center', gap: s.gap, cursor: 'pointer', transition: 'background-color .18s, border-color .18s, box-shadow .18s', backgroundColor: on ? bg : 'var(--gb-surface-1)', borderColor: on ? bd : 'var(--gb-border-default)', boxShadow: on ? `0 0 0 4px ${bg}` : '0 0 0 0px transparent' }}>
        <div style={{ width: s.box, height: s.box, borderRadius: 'var(--gb-r-md)', flexShrink: 0, border: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color .18s, color .18s, border-color .18s', backgroundColor: on ? tintMedium : 'var(--gb-fill-subtle)', color: on ? fg : 'var(--gb-text-muted)', borderColor: on ? bd : 'var(--gb-border-default)' }}>
          {icon && React.cloneElement(icon, { size: s.icon })}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ fontSize: s.name, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{name}</span>
            {experimental && <Tag tone="warning" size="xs">EXPERIMENTAL</Tag>}
          </div>
          {desc && <div style={{ fontSize: s.desc, color: 'var(--gb-text-tertiary)', marginTop: 3, lineHeight: 1.5 }}>{desc}</div>}
        </div>
        <Switch on={on} size={s.sw} tone={effectiveTone} onChange={onChange} />
      </div>
    );
  }

  window.GB = Object.assign(window.GB || {}, {
    T, TINT, sizeIcon, useAsyncState, Spinner, inputBaseStyle, Icon, I,
    Btn, Tag, Dot, KeyVal, SectionLabel, Switch, Input, Textarea, Field, Card, Callout, FeatureSpotlight,
  });
})();
