import React from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';

/* ───────────────────────────────────────────────────────────────
   playground.jsx — in-extension modal playground.

   A blank canvas with a graph-paper line-grid background, opened
   from Developer Settings → Modal Playground. Lets us mount and
   iterate on modals without needing the production golfballs.com
   page to be reachable.

   For now: just the bare surface. Modals will land here one by
   one as we rebuild them.
─────────────────────────────────────────────────────────────── */

// Grid tunables — derived from the active theme so the surface re-themes
// when the user switches variant. The two gradient layers stack:
//   minor: every 16px, faint
//   major: every 64px, slightly heavier
const GRID_MINOR_PX = 16;
const GRID_MAJOR_PX = 64;

const gridBackground = {
  background: 'var(--gb-surface-canvas)',
  backgroundImage: [
    // Major grid — heavier lines every 64px
    `linear-gradient(to right,  var(--gb-border-default) 1px, transparent 1px)`,
    `linear-gradient(to bottom, var(--gb-border-default) 1px, transparent 1px)`,
    // Minor grid — faint lines every 16px
    `linear-gradient(to right,  var(--gb-border-subtle)  1px, transparent 1px)`,
    `linear-gradient(to bottom, var(--gb-border-subtle)  1px, transparent 1px)`,
  ].join(', '),
  backgroundSize: [
    `${GRID_MAJOR_PX}px ${GRID_MAJOR_PX}px`,
    `${GRID_MAJOR_PX}px ${GRID_MAJOR_PX}px`,
    `${GRID_MINOR_PX}px ${GRID_MINOR_PX}px`,
    `${GRID_MINOR_PX}px ${GRID_MINOR_PX}px`,
  ].join(', '),
  // Pin the grid to the top-left corner so the major lines stay aligned
  // when the viewport resizes — otherwise they'd recentered and jitter.
  backgroundPosition: '0 0',
};

function PlaygroundApp() {
  return (
    <div style={{
      width: '100%', height: '100vh',
      ...gridBackground,
      position: 'relative',
      overflow: 'auto',
      fontFamily: 'var(--gb-font-sans)',
      color: 'var(--gb-text-secondary)',
    }}>
      {/* Center hint — disappears as soon as modals land here. */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{
          fontSize: 13, fontWeight: 500,
          color: 'var(--gb-text-ghost)',
          letterSpacing: 0.2,
          padding: '8px 14px',
          background: 'var(--gb-surface-1)',
          border: '1px solid var(--gb-border-subtle)',
          borderRadius: 'var(--gb-r-md)',
          boxShadow: 'var(--gb-shadow-popover)',
        }}>
          Modal playground — empty surface
        </div>
      </div>
    </div>
  );
}

ensureTheme();

function mount() {
  const host = document.getElementById('playground-root');
  if (!host) return;
  createRoot(host).render(<PlaygroundApp />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
