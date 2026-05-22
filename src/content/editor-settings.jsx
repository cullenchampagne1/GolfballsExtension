import React from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { SettingsPanel } from '../pages/SettingsPanel.jsx';
import { Btn, I } from '../ui/index.js';

/* ───────────────────────────────────────────────────────────────
   editor-settings.jsx — entry for the Manage window's Settings page.

   Loaded by editor.html after editor.js. Mounts the React
   SettingsPanel straight into #ed-settings, which editor.js no
   longer populates (renderSettingsPanel is now inert). The Back
   button calls editor.js's global closeSettings().

   Build → react-dist/content/editor-settings.js
─────────────────────────────────────────────────────────────── */

function EditorSettings() {
  return (
    /* Full-bleed design-system surface. The panel must carry its own
       --gb-surface-canvas background so background AND text retone together
       with the variant — otherwise switching to light/cream leaves dark text
       on the editor's still-dark legacy chrome. */
    <div
      style={{
        background: 'var(--gb-surface-canvas)',
        color: 'var(--gb-text-secondary)',
        fontFamily: 'var(--gb-font-sans)',
        minHeight: '100%',
      }}
    >
      <div style={{ padding: '0 0 64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <Btn
            variant="ghost"
            size="sm"
            icon={<I.chevr style={{ transform: 'scaleX(-1)' }} />}
            onClick={() => window.closeSettings?.()}
          >
            Back
          </Btn>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -0.2 }}>
              Settings
            </div>
            <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 1 }}>
              Theme &amp; features — applied live here and across open order tabs.
            </div>
          </div>
        </div>
        <SettingsPanel />
      </div>
    </div>
  );
}

function mount() {
  const host = document.getElementById('ed-settings');
  if (!host || host.__gbSettingsMounted) return;
  host.__gbSettingsMounted = true;
  // The host is the legacy editor's view container (old token theme). Paint it
  // with the design-system canvas so the panel never sits on un-themed chrome.
  host.style.background = 'var(--gb-surface-canvas)';
  ensureTheme();
  createRoot(host).render(<EditorSettings />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
