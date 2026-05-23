import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn } from './Btn.jsx';
import { Input } from './Input.jsx';
import { Dot } from './Dot.jsx';
import { I } from '../icons.jsx';

/* ────────────────────────────────────────────────────────────────
   SettingNotification — themed replacement for window.confirm /
   window.prompt, with a passive toast variant.

   `useSettingNotification()` returns:
     • notify(message, opts)  → void            — auto-dismissing toast
     • confirm(message, opts) → Promise<bool>   — yes/no
     • prompt(message, opts)  → Promise<str|null>

   Placements:
     • placement="top" (default for the global host) — slides down from the
       center-top edge of the viewport. Pill-style card per the spec's
       PillToast pattern (dot · message · actions). Smaller than the main
       page toast system that will follow.
     • placement="top-pinned" — slides into the nearest positioned ancestor's
       top edge. For surface-scoped notifications.

   Hook fallback: outside a host, prefers window.__gbNotify (the global top
   notification host) before browser dialogs.

   This is the SETTINGS-scoped notification system. The main-page
   notification system will be a separate, larger component.
──────────────────────────────────────────────────────────────── */

const Ctx = createContext(null);

export function useSettingNotification() {
  const api = useContext(Ctx);
  if (api) return api;
  if (typeof window !== 'undefined' && window.__gbNotify) return window.__gbNotify;
  return {
    notify:  (m) => { try { console.log('[notify]', m); } catch {} },
    confirm: (m) => Promise.resolve(window.confirm(m)),
    prompt:  (m, o = {}) => Promise.resolve(window.prompt(m, o.defaultValue || '')),
  };
}

/* ── Internal: input form for prompt() mode ───────────────────── */
function PromptForm({ defaultValue, placeholder, onSubmit, onCancel, confirmLabel, cancelLabel }) {
  const [value, setValue] = useState(defaultValue || '');
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(value.trim()); }}
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <Input
        size="sm"
        value={value}
        placeholder={placeholder}
        onChange={setValue}
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <Btn variant="ghost" size="sm" onClick={onCancel} type="button">{cancelLabel}</Btn>
        <Btn variant="primary" size="sm" type="submit" disabled={!value.trim()}>{confirmLabel}</Btn>
      </div>
    </form>
  );
}

/* tone → dot tone + border-left fg color. The Dot component drives the
   visual tone indicator (no icon tile — keeps the card compact). */
const TONES = {
  info:    { dot: 'brand',   fg: 'var(--gb-info-fg)'       },
  success: { dot: 'brand',   fg: 'var(--gb-success-fg)'    },
  warning: { dot: 'warning', fg: 'var(--gb-warning-fg)'    },
  danger:  { dot: 'error',   fg: 'var(--gb-error-fg)'      },
  default: { dot: 'brand',   fg: 'var(--gb-brand-label)'   },
};

/* Pill card — single message row + (optional) actions row.
   Spec inspiration: PillToast ("Dot · message · close"). Smaller than
   the main-page toast system that will follow. */
function PillCard({ active, dismiss }) {
  const tone = TONES[active.tone] || TONES.default;
  const isNotify = active.kind === 'notify';

  return (
    <div style={{
      background: 'var(--gb-surface-modal)',
      border: '1px solid var(--gb-border-default)',
      borderLeft: `2px solid ${tone.fg}`,
      borderRadius: 'var(--gb-r-md)',
      boxShadow: '0 12px 28px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.08)',
      fontFamily: 'var(--gb-font-sans)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 12px',
      }}>
        <span style={{ display: 'flex', marginTop: 6, flexShrink: 0 }}>
          <Dot tone={tone.dot} size={6} glow />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {active.title && (
            <div style={{
              fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-primary)',
              letterSpacing: -0.1,
            }}>{active.title}</div>
          )}
          <div style={{
            fontSize: 11.5,
            fontWeight: active.title ? 500 : 600,
            color: active.title ? 'var(--gb-text-tertiary)' : 'var(--gb-text-primary)',
            marginTop: active.title ? 2 : 0,
            lineHeight: 1.45,
          }}>
            {active.message}
          </div>
        </div>
        {isNotify && (
          <button
            type="button" onClick={dismiss} aria-label="Dismiss"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--gb-text-muted)', display: 'flex', padding: 0, marginTop: 2,
            }}
          >
            <I.close size={11} />
          </button>
        )}
      </div>

      {active.kind === 'confirm' && (
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 6,
          padding: '0 12px 10px',
        }}>
          <Btn variant="ghost" size="sm" onClick={() => active.onResolve(false)}>
            {active.cancelLabel}
          </Btn>
          <Btn
            variant={active.tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={() => active.onResolve(true)}
          >
            {active.confirmLabel}
          </Btn>
        </div>
      )}

      {active.kind === 'prompt' && (
        <div style={{ padding: '0 12px 10px' }}>
          <PromptForm
            defaultValue={active.defaultValue}
            placeholder={active.placeholder}
            confirmLabel={active.confirmLabel}
            cancelLabel={active.cancelLabel}
            onSubmit={(v) => active.onResolve(v || null)}
            onCancel={() => active.onResolve(null)}
          />
        </div>
      )}
    </div>
  );
}

/** Top-pinned slide-in inside the nearest positioned ancestor. */
function PinnedRenderer({ active, dismiss }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key={(active.kind || '') + (active.message || '')}
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -16, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          style={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 200 }}
        >
          <PillCard active={active} dismiss={dismiss} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Center-top page-wide notification. No backdrop — the card stands
    on its own and uses buttons / Esc for action. */
function TopRenderer({ active, dismiss }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="setting-notification"
          initial={{ x: '-50%', y: -36, opacity: 0, scale: 0.96 }}
          animate={{ x: '-50%', y: 0,   opacity: 1, scale: 1 }}
          exit={{    x: '-50%', y: -36, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          style={{
            position: 'fixed', top: 14, left: '50%',
            zIndex: 2147483600,
            width: 'min(360px, calc(100vw - 24px))',
            pointerEvents: 'auto',
          }}
        >
          <PillCard active={active} dismiss={dismiss} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Wrap a settings surface (or the whole page) to provide
 * `useSettingNotification()`.
 *
 * Props:
 *   placement  'top' (default) | 'top-pinned'
 *   style      extra style on the wrapper (top-pinned only)
 *
 * Accepts the legacy `placement="centered"` value — treated as `top`.
 */
export function SettingNotificationHost({ children, placement = 'top', style }) {
  const [active, setActive] = useState(null);

  const dismiss = useCallback(() => setActive(null), []);

  const api = useMemo(() => ({
    notify: (message, options = {}) => {
      setActive({
        kind: 'notify', message,
        tone: options.tone || 'info',
        title: options.title,
      });
      const ms = options.duration ?? 2400;
      if (ms > 0) {
        setTimeout(() => setActive((cur) => (cur && cur.kind === 'notify' ? null : cur)), ms);
      }
    },
    confirm: (message, options = {}) => new Promise((resolve) => {
      setActive({
        kind: 'confirm', message,
        tone: options.tone || 'default',
        title: options.title,
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel:  options.cancelLabel  || 'Cancel',
        onResolve: (v) => { setActive(null); resolve(v); },
      });
    }),
    prompt: (message, options = {}) => new Promise((resolve) => {
      setActive({
        kind: 'prompt', message,
        tone: options.tone || 'default',
        title: options.title,
        placeholder:  options.placeholder  || '',
        defaultValue: options.defaultValue || '',
        confirmLabel: options.confirmLabel || 'OK',
        cancelLabel:  options.cancelLabel  || 'Cancel',
        onResolve: (v) => { setActive(null); resolve(v); },
      });
    }),
  }), []);

  // Esc closes any active notification.
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (active.kind === 'confirm')      active.onResolve(false);
      else if (active.kind === 'prompt')  active.onResolve(null);
      else                                setActive(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);

  // Legacy 'centered' value maps to 'top'.
  const place = placement === 'centered' ? 'top' : placement;

  if (place === 'top') {
    return (
      <Ctx.Provider value={api}>
        {children}
        <TopRenderer active={active} dismiss={dismiss} />
      </Ctx.Provider>
    );
  }

  return (
    <Ctx.Provider value={api}>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, ...style }}>
        {children}
        <PinnedRenderer active={active} dismiss={dismiss} />
      </div>
    </Ctx.Provider>
  );
}
