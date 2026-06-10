import React from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { HelpPage } from '../pages/help/HelpPage.jsx';
import { Btn, I } from '../ui/index.js';

/* ───────────────────────────────────────────────────────────────
   editor-help.jsx — entry for the Manage window's Help & Training
   page. Mounts HelpPage into #ed-help (a sibling of #ed-settings);
   the editor bridge owns showing/hiding the view via
   window.openHelp() / window.closeHelp().

   Deep links: editor.html?view=help&article=<slug> is handled by
   the bridge, which calls openHelp(slug) → window.__gbHelpNavigate.

   Build → react-dist/content/editor-help.js
─────────────────────────────────────────────────────────────── */

function EditorHelp() {
  return (
    /* Carry the design-system canvas so the page retones with the
       theme variant instead of sitting on the legacy editor chrome. */
    <div
      style={{
        background: 'var(--gb-surface-canvas)',
        color: 'var(--gb-text-secondary)',
        fontFamily: 'var(--gb-font-sans)',
        minHeight: '100%',
      }}
    >
      <div style={{ padding: '0 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <Btn
            variant="ghost"
            size="sm"
            icon={<I.chevr style={{ transform: 'scaleX(-1)' }} />}
            onClick={() => window.closeHelp?.()}
          >
            Back
          </Btn>
        </div>
        <HelpPage />
      </div>
    </div>
  );
}

function mount() {
  const host = document.getElementById('ed-help');
  if (!host || host.__gbHelpMounted) return;
  host.__gbHelpMounted = true;
  host.style.background = 'var(--gb-surface-canvas)';
  ensureTheme();
  createRoot(host).render(<EditorHelp />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
