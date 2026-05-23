import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn } from './Btn.jsx';
import { Input } from './Input.jsx';
import { I } from '../icons.jsx';

/* ────────────────────────────────────────────────────────────────
   SettingNotification — themed replacement for window.confirm /
   window.prompt, with a passive toast variant.

   `useSettingNotification()` returns:
     • notify(message, opts)  → void            — auto-dismissing toast
     • confirm(message, opts) → Promise<bool>   — yes/no
     • prompt(message, opts)  → Promise<str|null>

   Two placements:
     • placement="top-pinned" (default) — slides into the nearest positioned
       ancestor's top edge. Wrap the surface you want it pinned to in
       <SettingNotificationHost>.
     • placement="centered" — fixed-viewport overlay with backdrop. Wrap
       once at the page root.

   If `useSettingNotification` is called outside a host, it falls back to
   `window.__gbNotify` (the global centered host) if mounted, then to
   `window.confirm/prompt` as a last resort.

   This is the SETTINGS-scoped notification system. The main-page
   notification system will be a separate component.
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

const TONES = {
  info:    { fg: 'var(--gb-info-fg)',    bg: 'var(--gb-info-tint-soft)',    bd: 'var(--gb-info-tint-border)',    icon: <I.alert /> },
  success: { fg: 'var(--gb-success-fg)', bg: 'var(--gb-success-tint-soft)', bd: 'var(--gb-success-tint-border)', icon: <I.check /> },
  warning: { fg: 'var(--gb-warning-fg)', bg: 'var(--gb-warning-tint-soft)', bd: 'var(--gb-warning-tint-border)', icon: <I.alert /> },
  danger:  { fg: 'var(--gb-error-fg)',   bg: 'var(--gb-error-tint-soft)',   bd: 'var(--gb-error-tint-border)',   icon: <I.alert /> },
  default: { fg: 'var(--gb-brand-label)', bg: 'var(--gb-surface-modal)',    bd: 'var(--gb-border-default)',      icon: <I.bolt /> },
};

/* The notification card visuals — shared by both placements. */
function NotificationCard({ active, dismiss }) {
  const tone = TONES[active.tone] || TONES.default;
  return (
    <div style={{
      padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
      background: tone.bg,
      border: `1px solid ${tone.bd}`,
      borderLeft: `3px solid ${tone.fg}`,
      borderRadius: 'var(--gb-r-md)',
      boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
      fontFamily: 'var(--gb-font-sans)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ display: 'flex', color: tone.fg, marginTop: 1, flexShrink: 0 }}>
          {React.cloneElement(tone.icon, { size: 14 })}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {active.title && (
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
              {active.title}
            </div>
          )}
          <div style={{
            fontSize: 12, fontWeight: active.title ? 500 : 600,
            color: 'var(--gb-text-secondary)', lineHeight: 1.45,
            marginTop: active.title ? 3 : 0,
          }}>
            {active.message}
          </div>
        </div>
        {active.kind === 'notify' && (
          <button
            type="button" onClick={dismiss}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--gb-text-muted)', display: 'flex', padding: 0,
            }}
            aria-label="Dismiss"
          >
            <I.close size={12} />
          </button>
        )}
      </div>

      {active.kind === 'confirm' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
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
        <PromptForm
          defaultValue={active.defaultValue}
          placeholder={active.placeholder}
          confirmLabel={active.confirmLabel}
          cancelLabel={active.cancelLabel}
          onSubmit={(v) => active.onResolve(v || null)}
          onCancel={() => active.onResolve(null)}
        />
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
          <NotificationCard active={active} dismiss={dismiss} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Centered viewport overlay with a dim+blur backdrop. */
function CenteredRenderer({ active, dismiss }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => { if (active.kind === 'notify') dismiss(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 2147483600,
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <motion.div
            key="card"
            initial={{ scale: 0.95, y: -8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: -8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 380, width: '100%' }}
          >
            <NotificationCard active={active} dismiss={dismiss} />
          </motion.div>
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
 *   placement  'top-pinned' (default) | 'centered'
 *   style      extra style on the wrapper (top-pinned only)
 */
export function SettingNotificationHost({ children, placement = 'top-pinned', style }) {
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

  if (placement === 'centered') {
    // No positioning wrapper — the overlay is position:fixed.
    return (
      <Ctx.Provider value={api}>
        {children}
        <CenteredRenderer active={active} dismiss={dismiss} />
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
