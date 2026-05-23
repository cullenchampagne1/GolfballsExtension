import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import { PillToast } from '../ui/index.js';

/* ────────────────────────────────────────────────────────────────
   editor-toasts.jsx — global bottom-right toast manager.

   Mounts a stacking ToastHost into #toasts-root and exposes the API
   as `window.__gbToast`. Other roots and the legacy editor.js call it
   to surface small visual confirmations (theme applied, folder created,
   template saved, …).

   Auto-dismisses after 2400ms by default. Newest toast appears at the
   bottom of the stack (closest to the bottom-right corner) so it
   doesn't push existing toasts around.
──────────────────────────────────────────────────────────────── */

function ToastHost() {
  const [stack, setStack] = useState([]);

  const add = useCallback((toast) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setStack((s) => [...s, { id, ...toast }]);
    const duration = toast.duration ?? 2400;
    if (duration > 0) {
      setTimeout(() => setStack((s) => s.filter((t) => t.id !== id)), duration);
    }
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setStack((s) => s.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const make = (tone) => (message, opts = {}) => add({ tone, message, ...opts });
    const api = {
      notify:  (message, opts = {}) => add({ tone: opts.tone || 'info', message, ...opts }),
      success: make('success'),
      error:   make('error'),
      info:    make('info'),
      brand:   make('brand'),
      warning: make('warning'),
      dismiss,
    };
    window.__gbToast = api;
    return () => { if (window.__gbToast === api) delete window.__gbToast; };
  }, [add, dismiss]);

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16,
      display: 'flex', flexDirection: 'column', gap: 8,
      zIndex: 2147483700,
      pointerEvents: 'none',                    // pass-through outside pills
      fontFamily: 'var(--gb-font-sans)',
    }}>
      <AnimatePresence initial={false}>
        {stack.map((t) => (
          <motion.div
            key={t.id}
            initial={false}                      // CSS keyframe handles entry
            exit={{ opacity: 0, x: 24, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } }}
            style={{ pointerEvents: 'auto' }}    // each pill is interactive
          >
            <PillToast
              tone={t.tone}
              message={t.message}
              size="sm"
              onDismiss={() => dismiss(t.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function mount() {
  let host = document.getElementById('toasts-root');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts-root';
    document.body.appendChild(host);
  }
  if (host.__gbToastsMounted) return;
  host.__gbToastsMounted = true;
  ensureTheme();
  createRoot(host).render(<ToastHost />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
