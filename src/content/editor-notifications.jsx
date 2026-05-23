import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import {
  SettingNotificationHost, useSettingNotification,
  ToastHost,
} from '../ui/index.js';

/* ────────────────────────────────────────────────────────────────
   editor-notifications.jsx — mounts the editor's notification roots
   into #notifications-root and exposes the APIs as globals:
     · window.__gbNotify — themed confirm/prompt (SettingNotification)
     · window.__gbToast  — pill/action/step/tray/edge toasts (ToastHost)

   Other React roots (editor-sidebar, editor-templates, editor-settings)
   pick `__gbNotify` up automatically via `useSettingNotification()` —
   the hook falls back to window.__gbNotify when no in-tree provider
   exists. Same fallback for `useToast()` and window.__gbToast.

   editor.js (vanilla) + content scripts call the globals directly.
──────────────────────────────────────────────────────────────── */

function GlobalBridge() {
  const api = useSettingNotification();
  useEffect(() => {
    window.__gbNotify = api;
    return () => { if (window.__gbNotify === api) delete window.__gbNotify; };
  }, [api]);
  return null;
}

function EditorNotifications() {
  return (
    <ToastHost>
      <SettingNotificationHost placement="top">
        <GlobalBridge />
      </SettingNotificationHost>
    </ToastHost>
  );
}

function mount() {
  let host = document.getElementById('notifications-root');
  if (!host) {
    host = document.createElement('div');
    host.id = 'notifications-root';
    document.body.appendChild(host);
  }
  if (host.__gbNotificationsMounted) return;
  host.__gbNotificationsMounted = true;
  ensureTheme();
  createRoot(host).render(<EditorNotifications />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
