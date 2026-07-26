import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { CustomActionEditor, EmptyState } from '../pages/CustomActionEditor.jsx';

/* ───────────────────────────────────────────────────────────────
   editor-actions.jsx — mounts the Custom Action authoring page into the
   Manage window's #ed-action-form host. Mirrors editor-templates.jsx: the
   plain-JS bridge (editor-bridge.jsx) owns view-switching + storage and
   hands us a record via window.__gbOpenAction(rec); we hand edits back via
   window.__gbSaveAction(rec).
─────────────────────────────────────────────────────────────── */

function CustomActionEditorRoot() {
  const [action, setAction] = useState(() => {
    try { return typeof window.__gbCurrentAction === 'function' ? window.__gbCurrentAction() : null; }
    catch { return null; }
  });

  useEffect(() => {
    window.__gbOpenAction = (rec) => setAction(rec ? { ...rec } : null);
    // Race recovery: the bridge may have opened an action before we mounted.
    if (!action && typeof window.__gbCurrentAction === 'function') {
      try { const cur = window.__gbCurrentAction(); if (cur) setAction({ ...cur }); } catch { /* */ }
    }
    return () => { if (window.__gbOpenAction) delete window.__gbOpenAction; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ToastHost>
      {action ? <CustomActionEditor key={action.id} action={action} /> : <EmptyState />}
    </ToastHost>
  );
}

function mount() {
  const host = document.getElementById('ed-action-form');
  if (!host || host.__gbActionsMounted) return;
  host.__gbActionsMounted = true;
  host.style.height = '100%';
  ensureTheme();
  createRoot(host).render(<CustomActionEditorRoot />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
