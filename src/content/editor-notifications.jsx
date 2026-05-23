import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import {
  SettingNotificationHost, useSettingNotification,
} from '../ui/index.js';

/* ────────────────────────────────────────────────────────────────
   editor-notifications.jsx — mounts a centered, page-wide notification
   host into #notifications-root and exposes the API as window.__gbNotify.

   Other React roots (editor-sidebar, editor-templates, editor-settings)
   pick it up automatically via `useSettingNotification()` — the hook
   falls back to window.__gbNotify when no in-tree provider exists.

   editor.js (vanilla) calls window.__gbNotify.confirm/prompt directly
   to replace the native browser dialogs.
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
    <SettingNotificationHost placement="centered">
      <GlobalBridge />
    </SettingNotificationHost>
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
