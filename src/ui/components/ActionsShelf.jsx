import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useActionRegistry, actionRegistry } from '../../lib/actionRegistry.js';

/* ───────────────────────────────────────────────────────────────
   ActionsShelf — bottom-right floating shelf with page-aware
   actions. Port of /tmp/gb-design/golfballs/project/actions-shelf.jsx
   (Claude Design output) into our React + design-token stack.

     Collapsed → pill / fab / tab trigger (variant prop)
     Expanded  → 320-wide panel with:
                   context header ("You're on … <page>")
                   "Smart for this page" group (animated sparkle)
                   "Page actions" group
                   danger group (separated by divider)
                   footer hint + esc-to-dismiss

   The shelf reads the live registry — features call
   actionRegistry.register(...) to add themselves. The shelf
   updates automatically on every register / page-change /
   modal-stack push or pop. See src/lib/actionRegistry.js.
─────────────────────────────────────────────────────────────── */

/* CSS keyframes — injected once at first mount. Same names + curves
   as the design file so the entrance staggers and twinkle feel
   identical. Kept as raw CSS rather than motion/react variants
   because the row-stagger is cleanest done via animation-delay
   per row, which motion/react doesn't make easy without a parent
   variants container. */
function useShelfKeyframes() {
  useEffect(() => {
    if (document.getElementById('gb-actions-shelf-keyframes')) return;
    const s = document.createElement('style');
    s.id = 'gb-actions-shelf-keyframes';
    // Row stagger still uses CSS keyframes (per-row animation-delay is
    // ugly under motion/react). The panel's own enter/exit is now
    // motion-driven so we get a clean exit animation too. See below.
    s.textContent = `
      @keyframes gb-as-row-in   { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes gb-as-twinkle  { 0%, 100% { opacity: .35; transform: scale(.85); } 50% { opacity: 1; transform: scale(1.05); } }
      @keyframes gb-as-glow     { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }
    `;
    document.head.appendChild(s);
  }, []);
}

/* Outside-click / Escape closer — wraps both shelf trigger + panel
   in a single hit-test so clicking either keeps it alive. */
function useDismissShelf(ref, onDismiss, when) {
  useEffect(() => {
    if (!when) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onDismiss(); };
    const onKey  = (e) => { if (e.key === 'Escape') onDismiss(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [when]);
}

/* ── Inline icons ─────────────────────────────────────────────
   The shelf uses a handful of stroke-icon glyphs. Inlined as
   plain SVG so the component is self-contained — no design-system
   dependency just for the trigger sparkle. */
const Svg = ({ children, size = 14, stroke = 2, style }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
    style={style}
  >{children}</svg>
);
const SparkleIcon  = (p) => (<Svg {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="2.5"/></Svg>);
const PageIcon     = (p) => (<Svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></Svg>);
const ChevIcon     = (p) => (<Svg {...p} stroke={2.4}><path d="M6 9l6 6 6-6"/></Svg>);
const ArrowRight   = (p) => (<Svg {...p}><path d="M9 6l6 6-6 6"/></Svg>);

/* ── Keyboard shortcut chip ─────────────────────────────────── */
function Kbd({ children }) {
  return (
    <span style={{
      fontFamily: 'var(--gb-font-mono)',
      fontSize: 9.5, fontWeight: 600,
      color: 'var(--gb-text-muted)',
      background: 'var(--gb-fill-subtle)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 4,
      padding: '1px 5px',
      lineHeight: 1.3,
      letterSpacing: 0.2,
    }}>{children}</span>
  );
}

/* ── Tag (lightweight — design uses our Tag component but here
   it's only a small badge for action.badge so an inline span is fine
   without dragging in the full Tag dependency). */
function MiniTag({ tone = 'brand', children }) {
  const palette = {
    brand:   { bg: 'var(--gb-brand-tint-medium)',   fg: 'var(--gb-brand-label)',  bd: 'var(--gb-brand-tint-border)' },
    warning: { bg: 'var(--gb-warning-tint-soft)',   fg: 'var(--gb-warning-fg)',    bd: 'var(--gb-warning-tint-border)' },
    info:    { bg: 'var(--gb-info-tint-soft)',      fg: 'var(--gb-info-fg)',       bd: 'var(--gb-info-tint-border)' },
    neutral: { bg: 'var(--gb-fill-subtle)',         fg: 'var(--gb-text-secondary)',bd: 'var(--gb-border-default)' },
  };
  const c = palette[tone] || palette.brand;
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
      textTransform: 'uppercase',
      borderRadius: 999,
      background: c.bg, color: c.fg, border: `1px solid ${c.bd}`,
      lineHeight: 1.3,
    }}>{children}</span>
  );
}

/* ── Action row ──────────────────────────────────────────────
   Same icon + label + hint + (badge|kbd) layout as the design.
   Uses CSS keyframe gb-as-row-in for the staggered entrance. */
function ActionRow({ action, index, smart, onPick }) {
  const [hover, setHover] = useState(false);
  const tone = action.tone;
  const bg = hover
    ? (smart ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-soft)')
    : 'transparent';
  return (
    <button
      type="button"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onPick && onPick(action)}
      style={{
        width: '100%',
        display: 'grid',
        gridTemplateColumns: '26px 1fr auto',
        alignItems: 'center',
        gap: 10,
        padding: '7px 10px 7px 9px',
        background: bg,
        border: '1px solid transparent',
        borderRadius: 'var(--gb-r-sm)',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--gb-font-sans)',
        color: tone === 'danger'
          ? 'var(--gb-error-fg)'
          : (smart ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)'),
        transition: 'background var(--gb-anim-fast), color var(--gb-anim-fast)',
        animation: 'gb-as-row-in .28s cubic-bezier(.34,1.4,.64,1) both',
        animationDelay: `${60 + index * 32}ms`,
      }}
    >
      <span style={{
        width: 26, height: 26, borderRadius: 'var(--gb-r-sm)', flexShrink: 0,
        background: smart
          ? (hover ? 'var(--gb-brand-tint-strong)' : 'var(--gb-brand-tint-medium)')
          : tone === 'danger'
            ? (hover ? 'var(--gb-error-tint-medium)' : 'var(--gb-error-tint-soft)')
            : (hover ? 'var(--gb-fill-medium)' : 'var(--gb-fill-subtle)'),
        border: '1px solid ' + (smart
          ? 'var(--gb-brand-tint-border)'
          : tone === 'danger'
            ? 'var(--gb-error-tint-border)'
            : 'var(--gb-border-subtle)'),
        color: tone === 'danger' ? 'var(--gb-error-fg)' : smart ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all var(--gb-anim-fast)',
      }}>
        {action.icon
          ? React.cloneElement(action.icon, { size: 13 })
          : <SparkleIcon size={12} />}
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{
          fontSize: 12.5, fontWeight: 600, letterSpacing: -0.05,
          color: tone === 'danger'
            ? 'var(--gb-error-fg)'
            : (smart ? 'var(--gb-brand-label)' : 'var(--gb-text-primary)'),
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{action.label}</span>
        {action.hint && (
          <span style={{
            fontSize: 10.5, color: 'var(--gb-text-muted)',
            marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            fontWeight: 500,
          }}>{action.hint}</span>
        )}
      </span>

      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {action.badge && <MiniTag tone={action.badge.tone}>{action.badge.label}</MiniTag>}
        {action.kbd && <Kbd>{action.kbd}</Kbd>}
        {hover && !action.kbd && !action.badge && (
          <ArrowRight size={11} style={{ color: smart ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }} />
        )}
      </span>
    </button>
  );
}

function SmartHeader({ count }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '4px 11px 6px',
    }}>
      <SparkleIcon size={14} style={{ color: 'var(--gb-brand-label)', animation: 'gb-as-twinkle 2.2s ease-in-out infinite' }} />
      <span style={{
        fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.9,
        color: 'var(--gb-brand-label)',
      }}>Smart for this page</span>
      <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--gb-brand-tint-medium), transparent)' }} />
      <span style={{
        fontSize: 9.5, fontWeight: 700, color: 'var(--gb-text-muted)',
        fontFamily: 'var(--gb-font-mono)',
      }}>{count}</span>
    </div>
  );
}

function GroupHeader({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 11px 6px' }}>
      <span style={{
        fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.9,
        color: 'var(--gb-text-muted)',
      }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
    </div>
  );
}

/* ── Trigger variants: pill / fab / tab ─────────────────────── */
function ShelfTrigger({ variant, count, open, onClick }) {
  const [hover, setHover] = useState(false);

  if (variant === 'fab') {
    return (
      <button
        type="button"
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        onClick={onClick}
        style={{
          width: 52, height: 52, borderRadius: '50%',
          border: '1px solid var(--gb-brand-border)',
          background: 'linear-gradient(180deg, var(--gb-brand) 0%, var(--gb-brand-dark) 100%)',
          color: 'var(--gb-text-on-brand)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 10px 24px rgba(0,0,0,.45), 0 0 0 1px var(--gb-brand-tint-border), 0 0 28px var(--gb-brand-tint-strong)',
          position: 'relative',
          transition: 'transform var(--gb-anim-bounce)',
          transform: hover ? 'translateY(-2px) scale(1.04)' : open ? 'rotate(45deg)' : 'none',
        }}
      >
        <SparkleIcon size={20} />
        {count > 0 && !open && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
            background: 'var(--gb-surface-1)',
            border: '1px solid var(--gb-brand-label)',
            color: 'var(--gb-brand-label)',
            fontSize: 10, fontWeight: 800, fontFamily: 'var(--gb-font-mono)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,.5)',
          }}>{count}</span>
        )}
      </button>
    );
  }

  if (variant === 'tab') {
    return (
      <button
        type="button"
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        onClick={onClick}
        style={{
          height: 88, padding: '0 12px 0 14px',
          borderTopLeftRadius: 14, borderBottomLeftRadius: 14,
          borderTopRightRadius: 0, borderBottomRightRadius: 0,
          background: 'var(--gb-surface-1)',
          border: '1px solid var(--gb-border-default)',
          borderRight: 'none',
          color: 'var(--gb-text-secondary)',
          cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 6,
          boxShadow: '-8px 0 24px rgba(0,0,0,.4), 0 0 0 1px var(--gb-fill-faint)',
          transition: 'all var(--gb-anim-bounce)',
          transform: hover ? 'translateX(-3px)' : 'none',
        }}
      >
        <span style={{
          width: 24, height: 24, borderRadius: 'var(--gb-r-sm)',
          background: 'var(--gb-brand-tint-medium)',
          border: '1px solid var(--gb-brand-tint-border)',
          color: 'var(--gb-brand-label)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          <SparkleIcon size={13} />
          {count > 0 && (
            <span style={{
              position: 'absolute', top: -3, right: -3,
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--gb-brand-label)',
              boxShadow: '0 0 6px var(--gb-brand-label)',
              animation: 'gb-as-glow 1.6s ease-in-out infinite',
            }} />
          )}
        </span>
        <span style={{
          writingMode: 'vertical-rl', transform: 'rotate(180deg)',
          fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
          color: 'var(--gb-text-tertiary)',
        }}>Actions</span>
      </button>
    );
  }

  // default: pill
  return (
    <button
      type="button"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 9,
        padding: '0 13px 0 11px', height: 38,
        borderRadius: 'var(--gb-r-pill)',
        background: 'var(--gb-surface-1)',
        border: '1px solid var(--gb-brand-tint-border)',
        color: 'var(--gb-text-secondary)',
        cursor: 'pointer',
        boxShadow: '0 10px 28px rgba(0,0,0,.45), 0 0 0 1px var(--gb-fill-faint), 0 0 0 4px rgba(143,206,46,.06)',
        fontFamily: 'var(--gb-font-sans)',
        transition: 'all var(--gb-anim-bounce)',
        transform: hover ? 'translateY(-2px)' : 'none',
      }}
    >
      <span style={{
        position: 'relative',
        width: 22, height: 22, borderRadius: '50%',
        background: 'var(--gb-brand-tint-medium)',
        border: '1px solid var(--gb-brand-tint-border)',
        color: 'var(--gb-brand-label)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <SparkleIcon size={12} style={{ animation: 'gb-as-twinkle 2.2s ease-in-out infinite' }} />
        {count > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--gb-brand-label)',
            boxShadow: '0 0 6px var(--gb-brand-label)',
            border: '1.5px solid var(--gb-surface-1)',
          }} />
        )}
      </span>
      <span style={{
        fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -0.1,
      }}>Actions</span>
      {count > 0 && (
        <>
          <span style={{ width: 1, height: 14, background: 'var(--gb-border-default)' }} />
          <span style={{
            fontSize: 10.5, fontWeight: 700, color: 'var(--gb-brand-label)',
            fontFamily: 'var(--gb-font-mono)',
          }}>{count}</span>
        </>
      )}
    </button>
  );
}

/* ── Root ─────────────────────────────────────────────────────
   Reads the live registry and renders. No own action data —
   everything comes via actionRegistry.register(...). The shelf
   composes the trigger + panel together; outside-click + Esc
   collapse it.

   Props are layout only — the actions list itself is registry-
   driven so callers don't need to pass arrays in. */
export function ActionsShelf({
  variant = 'pill',           // 'pill' | 'fab' | 'tab'
  showShortcuts = true,       // pass-through to per-row kbd display
  showContextHeader = true,   // header showing the current page
  bottomOffset = 22,
  rightOffset = 22,
}) {
  useShelfKeyframes();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismissShelf(ref, () => setOpen(false), open);

  const { actions, pageLabel, pageSubLabel } = useActionRegistry();
  const smartCount = actions.smart.length;

  // Default header copy when nothing is set so the shelf reads
  // sensibly even on a totally-fresh page that hasn't called
  // setPage() yet.
  const headerLabel    = pageLabel    || 'Anywhere';
  const headerSubLabel = pageSubLabel || 'No specific page detected';

  // Build a flat row plan so animations get a global index
  // (smart staggers continue smoothly into page actions).
  const rows = [];
  let idx = 0;
  if (smartCount > 0) {
    rows.push({ kind: 'header-smart', key: 'h-s', count: smartCount });
    actions.smart.forEach((a) => rows.push({ kind: 'row', smart: true, action: a, key: 'sm-' + a.id, index: idx++ }));
  }
  if (actions.page.length > 0) {
    rows.push({ kind: 'header', key: 'h-p', label: 'Page actions' });
    actions.page.forEach((a) => rows.push({ kind: 'row', smart: false, action: a, key: 'pg-' + a.id, index: idx++ }));
  }
  if (actions.danger.length > 0) {
    rows.push({ kind: 'divider', key: 'd-d' });
    actions.danger.forEach((a) => rows.push({ kind: 'row', smart: false, action: { ...a, tone: 'danger' }, key: 'dg-' + a.id, index: idx++ }));
  }

  /* ── Number-key shortcuts ────────────────────────────────────
     Flatten to just the actionable rows in display order so the
     keyboard listener can fire `actionRows[n-1].action` when the
     user hits a number key 1-9. The shortcut number assigned to
     each row also gets passed back to ActionRow so the row's
     `kbd` slot renders the real shortcut (1, 2, 3…) instead of
     a cosmetic `⌘K`-style string baked into the registration. */
  const actionRows = rows.filter((r) => r.kind === 'row');
  const shortcutFor = new Map();
  actionRows.slice(0, 9).forEach((r, i) => shortcutFor.set(r.key, String(i + 1)));

  /* Keyboard control:
       • Tap Alt / Option alone → toggle the shelf open
       • While the shelf is open, 1-9 → fire that action

     The "Alt tapped alone" pattern is keydown-Alt followed by
     keyup-Alt with NO other key in between. Without that gate, a
     normal Alt+letter combo (Alt+Tab, Alt+F, etc.) would also
     trigger the toggle on keyup, which would be infuriating.

     We bail when typing in an input so number keys still type
     into search boxes / textareas. */
  useEffect(() => {
    let altDownAt = 0;
    let altCombined = false;
    const TAP_WINDOW_MS = 500;

    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName && el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    };

    const onKeyDown = (e) => {
      // Track Alt-down before any input-target check so input
      // focus doesn't block the Alt-tap toggle (Option in an
      // input still summons the shelf).
      if (e.key === 'Alt') {
        if (!altDownAt) { altDownAt = Date.now(); altCombined = false; }
        return;
      }
      // If anything else fires while Alt is held, it's NOT a
      // lone tap — cancel the toggle intent.
      if (altDownAt) altCombined = true;

      // Number keys 1-9 trigger only while the shelf is open and
      // ONLY when no modifier is held (so Alt+1 / Ctrl+1 / Cmd+1
      // still pass through to the browser's tab-switch handlers).
      if (open && /^[1-9]$/.test(e.key)
          && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
          && !isTypingTarget(e.target)) {
        const row = actionRows[parseInt(e.key, 10) - 1];
        if (row) {
          e.preventDefault();
          e.stopPropagation();
          try { row.action.handler && row.action.handler(); }
          catch (err) { console.warn('ActionsShelf: shortcut handler threw', err); }
          if (!row.action.keepOpen) setOpen(false);
        }
      }
    };

    const onKeyUp = (e) => {
      if (e.key !== 'Alt') return;
      const wasTap = altDownAt && !altCombined && (Date.now() - altDownAt) < TAP_WINDOW_MS;
      altDownAt = 0;
      altCombined = false;
      if (wasTap) setOpen((v) => !v);
    };

    // Window blur (Cmd-Tab to another app while Alt was held) →
    // wipe the half-state so the next Alt press starts clean.
    const onBlur = () => { altDownAt = 0; altCombined = false; };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [open, actionRows]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        bottom: bottomOffset,
        right: variant === 'tab' ? 0 : rightOffset,
        zIndex: 9000,
        fontFamily: 'var(--gb-font-sans)',
      }}
    >
      <AnimatePresence>
      {open && (
        <motion.div
          // Enter: panel rises + scales in from bottom-right
          // Exit: scales back down and fades to nothing
          // Same spring curve as the design's keyframe entry; the exit
          // is slightly faster and more linear so it closes cleanly.
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: [0.34, 1.4, 0.64, 1] } }}
          exit={{    opacity: 0, y: 6, scale: 0.96, transition: { duration: 0.14, ease: [0.4, 0, 0.2, 1] } }}
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 10px)',
            right: 0,
            width: 320,
            maxHeight: `calc(100vh - ${bottomOffset + 80}px)`,
            background: 'var(--gb-surface-modal, var(--gb-surface-1))',
            border: '1px solid var(--gb-border-default)',
            borderRadius: 'var(--gb-r-xl, 14px)',
            boxShadow: '0 24px 64px rgba(0,0,0,.55), 0 0 0 1px var(--gb-fill-faint), 0 0 40px rgba(143,206,46,.04)',
            overflow: 'hidden',
            transformOrigin: 'bottom right',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {showContextHeader && (
            <div style={{
              padding: '11px 13px',
              background: 'var(--gb-fill-inverse-strong, var(--gb-surface-2))',
              borderBottom: '1px solid var(--gb-border-subtle)',
              display: 'flex', alignItems: 'center', gap: 9,
              flexShrink: 0,
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 'var(--gb-r-sm)', flexShrink: 0,
                background: 'var(--gb-brand-tint-medium)',
                border: '1px solid var(--gb-brand-tint-border)',
                color: 'var(--gb-brand-label)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <PageIcon size={13} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8,
                  color: 'var(--gb-text-muted)',
                }}>You're on</div>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)',
                  letterSpacing: -0.1, marginTop: 1,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{headerLabel}</div>
                {headerSubLabel && (
                  <div style={{
                    fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    fontWeight: 500,
                  }}>{headerSubLabel}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  width: 22, height: 22, borderRadius: 'var(--gb-r-sm)',
                  background: 'var(--gb-fill-subtle)',
                  border: '1px solid var(--gb-border-default)',
                  color: 'var(--gb-text-tertiary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <ChevIcon size={11} style={{ transform: 'rotate(-180deg)' }} />
              </button>
            </div>
          )}

          <div style={{ padding: '6px 6px 8px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {rows.length === 0 && (
              <div style={{
                padding: '24px 16px',
                fontSize: 11.5,
                color: 'var(--gb-text-muted)',
                textAlign: 'center',
              }}>
                No actions registered yet.
              </div>
            )}
            {rows.map((r) => {
              if (r.kind === 'header-smart') return <SmartHeader key={r.key} count={r.count} />;
              if (r.kind === 'header')       return <GroupHeader  key={r.key} label={r.label} />;
              if (r.kind === 'divider')      return <div key={r.key} style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '6px 10px' }} />;
              /* Override `kbd` with the assigned number-key shortcut
                 (1, 2, 3…). The string a caller passed to register()
                 was cosmetic; the number reflects the actual key
                 that fires the action when the shelf is open. Rows
                 past the 9th get no shortcut (and no kbd badge). */
              const num = shortcutFor.get(r.key);
              const action = !showShortcuts
                ? { ...r.action, kbd: undefined }
                : num
                  ? { ...r.action, kbd: num }
                  : { ...r.action, kbd: undefined };
              return (
                <ActionRow
                  key={r.key}
                  action={action}
                  index={r.index}
                  smart={r.smart}
                  onPick={(a) => {
                    try { a.handler && a.handler(); } catch (err) { console.warn('ActionsShelf: action handler threw', err); }
                    if (!a.keepOpen) setOpen(false);
                  }}
                />
              );
            })}
          </div>

          <div style={{
            padding: '8px 13px',
            borderTop: '1px solid var(--gb-border-subtle)',
            background: 'var(--gb-fill-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 10, color: 'var(--gb-text-muted)', fontWeight: 500,
            flexShrink: 0,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: 'var(--gb-brand-label)',
                boxShadow: '0 0 6px var(--gb-brand-label)',
              }} />
              <span>Suggestions update with the page</span>
            </span>
            <Kbd>esc</Kbd>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      <ShelfTrigger
        variant={variant}
        count={smartCount}
        open={open}
        onClick={() => setOpen((o) => !o)}
      />
    </div>
  );
}

/* Re-export so callers can do `import { actionRegistry } from
   '../ui/components/ActionsShelf.jsx'` instead of digging into
   /lib. The shelf is the primary entry-point for the feature. */
export { actionRegistry } from '../../lib/actionRegistry.js';
