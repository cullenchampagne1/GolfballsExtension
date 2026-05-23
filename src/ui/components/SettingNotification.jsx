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

/* ── Internal: hook owning the prompt's input state. The input itself
   lives in the grey body of the card so the tone-tinted footer only
   carries the action buttons — visually separates "what you type" from
   "what you confirm". */
function usePromptValue(active) {
  const [value, setValue] = useState(active?.defaultValue || '');
  // Reset when a different prompt opens (queue advances).
  useEffect(() => { setValue(active?.defaultValue || ''); }, [active?.id, active?.defaultValue]);
  return [value, setValue];
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
  const isPrompt = active.kind === 'prompt';
  const title    = active.title || (isNotify ? null : active.message);
  const message  = active.title ? active.message : (isNotify ? active.message : null);
  // Prompt's input value lives at card level so the input (body) and
  // submit button (footer) stay in sync across the colored / grey split.
  const [promptValue, setPromptValue] = usePromptValue(isPrompt ? active : null);
  const submitPrompt = () => {
    const v = promptValue.trim();
    active.onResolve(v || null);
  };

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
        // Center-align so single-line title/message sits flush with the
        // 24px icon tile. Multi-line content still wraps below the icon —
        // alignItems applies to the cross-axis baseline, not the wrap.
        display: 'flex', alignItems: 'center', gap: 9,
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

      {/* Prompt input — lives in the grey body (matching the card's
          surface), so the tinted footer below holds only the action
          buttons. Keeps "what you type" visually distinct from "what
          you confirm". */}
      {isPrompt && (
        <div style={{ padding: '0 10px 10px' }}>
          <Input
            size="sm"
            value={promptValue}
            placeholder={active.placeholder}
            onChange={setPromptValue}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submitPrompt(); }
              if (e.key === 'Escape') { e.preventDefault(); active.onResolve(null); }
            }}
          />
        </div>
      )}

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

      {/* Tinted action footer for prompt — buttons only; the input is up
          in the body above. */}
      {isPrompt && (
        <div style={{
          display: 'flex', gap: 6, padding: '6px 8px 7px',
          borderTop: '1px solid var(--gb-border-subtle)',
          background: tone.bg,
        }}>
          <div style={{ flex: 1 }} />
          <Btn variant="ghost" size="sm" onClick={() => active.onResolve(null)}>
            {active.cancelLabel}
          </Btn>
          <Btn
            variant={active.tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            disabled={!promptValue.trim()}
            onClick={submitPrompt}
          >
            {active.confirmLabel}
          </Btn>
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
