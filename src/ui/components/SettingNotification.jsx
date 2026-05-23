import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn } from './Btn.jsx';
import { Input } from './Input.jsx';
import { I } from '../icons.jsx';

/* ────────────────────────────────────────────────────────────────
   SettingNotification — themed replacement for window.confirm /
   window.prompt, with a passive toast variant.

   Visual model: ActionToast from notification_handoff/ — icon tile +
   title/message + tone-tinted footer with action buttons — but scaled
   down for the editor panel context.

   `useSettingNotification()` returns:
     • notify(message, opts)  → void            — auto-dismissing
     • confirm(message, opts) → Promise<bool>   — yes/no
     • prompt(message, opts)  → Promise<str|null>

   Placements:
     • placement="top"        — slides down from center-top of viewport
     • placement="top-pinned" — slides into the nearest positioned ancestor

   Hook fallback: outside a host, prefers window.__gbNotify (the global
   top notification host) before browser dialogs.
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
function PromptForm({ defaultValue, placeholder, onSubmit, onCancel, confirmLabel, cancelLabel, tone }) {
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
        <Btn variant={tone === 'danger' ? 'danger' : 'primary'} size="sm" type="submit" disabled={!value.trim()}>{confirmLabel}</Btn>
      </div>
    </form>
  );
}

/* tone → fg/bg/border + default icon. Matches ActionToast TONES with the
   addition of `info` + `default` for our notify/confirm/prompt scope. */
const TONES = {
  info:    { fg: 'var(--gb-info-fg)',     bg: 'var(--gb-info-tint-soft)',    bd: 'var(--gb-info-tint-border)',    icon: <I.alert /> },
  success: { fg: 'var(--gb-success-fg)',  bg: 'var(--gb-success-tint-soft)', bd: 'var(--gb-success-tint-border)', icon: <I.check /> },
  warning: { fg: 'var(--gb-warning-fg)',  bg: 'var(--gb-warning-tint-soft)', bd: 'var(--gb-warning-tint-border)', icon: <I.alert /> },
  danger:  { fg: 'var(--gb-error-fg)',    bg: 'var(--gb-error-tint-soft)',   bd: 'var(--gb-error-tint-border)',   icon: <I.trash /> },
  default: { fg: 'var(--gb-brand-label)', bg: 'var(--gb-brand-tint-soft)',   bd: 'var(--gb-brand-tint-border)',   icon: <I.bolt />  },
};

/* ActionToast-shaped card, panel-scoped (between the spec's sm 280 and md
   360 sizes — 320 wide). Top row: icon tile + title/message + close;
   tinted footer with actions. Notify mode skips the footer. */
function NotificationCard({ active, dismiss }) {
  const tone = TONES[active.tone] || TONES.default;
  const icon = active.icon || tone.icon;
  const isNotify = active.kind === 'notify';
  const title    = active.title || (isNotify ? null : active.message);
  const message  = active.title ? active.message : (isNotify ? active.message : null);

  return (
    <div style={{
      width: '100%',
      background: 'var(--gb-surface-1)',
      border: `1px solid ${tone.bd}`,
      borderRadius: 'var(--gb-r-md)',
      boxShadow: 'var(--gb-shadow-popover)',
      overflow: 'hidden',
      fontFamily: 'var(--gb-font-sans)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 9,
        padding: '10px 10px 9px',
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: 'var(--gb-r-sm)',
          background: tone.bg, color: tone.fg,
          border: `1px solid ${tone.bd}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {React.cloneElement(icon, { size: 12 })}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {title && (
            <div style={{
              fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)',
              letterSpacing: -0.1, lineHeight: 1.3,
            }}>{title}</div>
          )}
          {message && (
            <div style={{
              fontSize: 11, color: 'var(--gb-text-tertiary)',
              marginTop: title ? 2 : 0, lineHeight: 1.45,
            }}>{message}</div>
          )}
        </div>
        {isNotify && (
          <span
            onClick={dismiss}
            style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex', padding: 2 }}
          >
            <I.close size={11} />
          </span>
        )}
      </div>

      {/* Tinted action footer — confirm + prompt only. */}
      {active.kind === 'confirm' && (
        <div style={{
          display: 'flex', gap: 6, padding: '6px 8px 7px',
          borderTop: '1px solid var(--gb-border-subtle)',
          background: tone.bg,
        }}>
          <div style={{ flex: 1 }} />
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
        <div style={{
          padding: '8px 10px 9px',
          borderTop: '1px solid var(--gb-border-subtle)',
          background: tone.bg,
        }}>
          <PromptForm
            defaultValue={active.defaultValue}
            placeholder={active.placeholder}
            confirmLabel={active.confirmLabel}
            cancelLabel={active.cancelLabel}
            tone={active.tone}
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
          <NotificationCard active={active} dismiss={dismiss} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Center-top page-wide notification — slides down from the top edge.
    No backdrop; user dismisses via the buttons / X / Esc. */
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
            width: 'min(320px, calc(100vw - 24px))',
            pointerEvents: 'auto',
          }}
        >
          <NotificationCard active={active} dismiss={dismiss} />
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
 * Legacy `placement="centered"` is accepted — treated as `top`.
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
        icon: options.icon,
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
        icon: options.icon,
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
        icon: options.icon,
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
