import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import { Btn, SectionLabel, I, SettingNotificationHost, useSettingNotification } from '../ui/index.js';
import { MarginCalc } from '../modals/MarginCalc.jsx';

/* ───────────────────────────────────────────────────────────────
   playground.jsx — in-extension modal playground.

   A blank canvas with a graph-paper line-grid background, opened
   from Developer Settings → Modal Playground. Lets us mount and
   iterate on modals without needing the production golfballs.com
   page to be reachable.

   Top-right toolbar lists every modal we plan to (re)build. As each
   is migrated, swap its onClick from the "coming soon" toast to a
   real mount, then move on to the next.
─────────────────────────────────────────────────────────────── */

// One row per planned modal. `id` doubles as the React-key + the
// `mounted` state value when wired. `wired: true` means the onClick
// actually mounts the modal; `false` means a "coming soon" toast.
const MODAL_REGISTRY = [
  { id: 'margin',       label: 'Margin',          icon: 'calc',    wired: true  },
  { id: 'charge',       label: 'Charge',          icon: 'card',    wired: false },
  { id: 'orderEdit',    label: 'Order Edit',      icon: 'edit',    wired: false },
  { id: 'watchList',    label: 'Watch List',      icon: 'eye',     wired: false },
  { id: 'emailPreview', label: 'Email Preview',   icon: 'mail',    wired: false },
  { id: 'imageViewer',  label: 'Image Viewer',    icon: 'eye',     wired: false },
  { id: 'submitProof',  label: 'Submit Proof',    icon: 'send',    wired: false },
  { id: 'crmSearch',    label: 'CRM Search',      icon: 'search',  wired: false },
  { id: 'crmQuery',     label: 'CRM Query',       icon: 'filter',  wired: false },
  { id: 'crmContact',   label: 'New Contact',     icon: 'user',    wired: false },
  { id: 'taskList',     label: 'Tasks',           icon: 'check',   wired: false },
  { id: 'phoneFinder',  label: 'Phone Finder',    icon: 'search',  wired: false },
  { id: 'calendar',     label: 'Calendar',        icon: 'cog',     wired: false },
];

// Visual scale applied to the whole playground surface. The default Chrome
// 100% zoom renders DS chrome larger than it does on a real GB tab (their
// page CSS shrinks form elements down). 0.74 matches what you'd manually
// dial to on Cmd/Ctrl+Minus and bakes that in so opening the playground
// always lands at the right size.
const PLAYGROUND_SCALE = 0.74;

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

/* Inner component — needs to live below SettingNotificationHost so it can
   useSettingNotification() for the "coming soon" toasts. */
function PlaygroundSurface() {
  // Single mounted modal at a time. Value is the registry id, or null.
  const [mounted, setMounted] = useState(null);
  const notify = useSettingNotification();

  const launch = (entry) => {
    if (entry.wired) { setMounted(entry.id); return; }
    notify.notify(`${entry.label} modal — coming soon`, { tone: 'info' });
  };

  // 1/scale so the inner box, after `transform: scale(SCALE)`, lands at
  // 100% of the viewport. Without this the scaled content would occupy
  // SCALE × viewport, leaving an empty gutter on the right + bottom.
  const inv = 1 / PLAYGROUND_SCALE;

  return (
    <div style={{
      width: '100%', height: '100vh',
      ...gridBackground,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'var(--gb-font-sans)',
      color: 'var(--gb-text-secondary)',
    }}>
    {/* Scaled wrapper holds the modal mount + center hint. The toolbar
        lives OUTSIDE so it stays at native chrome size — a transformed
        ancestor would scale the toolbar AND break its position:fixed
        anchoring (CSS quirk: fixed elements anchor to their nearest
        transformed ancestor, not the viewport). Modals INSIDE this
        wrapper inherit the scale, which is the whole point. */}
    <div style={{
      transform: `scale(${PLAYGROUND_SCALE})`,
      transformOrigin: 'top left',
      width:  `${inv * 100}%`,
      height: `${inv * 100}%`,
      position: 'relative',
    }}>
      {/* Center hint — empty-state cue when no modal is up. */}
      {!mounted && (
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
            Pick a modal from the top-right toolbar.
          </div>
        </div>
      )}

      {/* Modal mount points — one block per wired modal. Each is gated on
          `mounted === id` so only one renders at a time; AnimatePresence
          plays the modal's exit animation when we null out `mounted`.
          Lives INSIDE the scaled wrapper so modals inherit the scale. */}
      <AnimatePresence>
        {mounted === 'margin' && (
          <MarginCalc
            key="margin"
            onClosed={() => setMounted(null)}
          />
        )}
      </AnimatePresence>
    </div>
    {/* /scaled wrapper */}

    {/* Top-right toolbar — one button per planned modal. Wired entries
        mount the real component into the playground; everything else
        fires a "coming soon" toast so the chrome is in place for when
        each modal lands.

        Lives OUTSIDE the scaled wrapper so it stays at native size and
        is anchored to the viewport edge (a position:fixed child of a
        transformed ancestor anchors to that ancestor, not the viewport,
        so we keep it as a sibling instead). */}
    <div style={{
      position: 'fixed', top: 14, right: 14, zIndex: 10,
      background: 'var(--gb-surface-modal)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-lg)',
      boxShadow: 'var(--gb-shadow-popover)',
      padding: 10,
      display: 'flex', flexDirection: 'column', gap: 8,
      minWidth: 180,
    }}>
      <SectionLabel divider={false} style={{ marginBottom: 0 }}>Modals</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {MODAL_REGISTRY.map((entry) => {
          const Icon = I[entry.icon] || I.bolt;
          return (
            <Btn
              key={entry.id}
              size="sm"
              full
              icon={<Icon />}
              variant={entry.wired ? 'tinted' : 'secondary'}
              status="brand"
              onClick={() => launch(entry)}
              style={{ justifyContent: 'flex-start' }}
            >
              {entry.label}
            </Btn>
          );
        })}
      </div>
    </div>
    </div>
  );
}

function PlaygroundApp() {
  return (
    <SettingNotificationHost placement="top">
      <PlaygroundSurface />
    </SettingNotificationHost>
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
