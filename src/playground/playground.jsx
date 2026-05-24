import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import {
  Btn, SectionLabel, Segmented, I,
  SettingNotificationHost, useSettingNotification,
  ToastHost, useToast,
} from '../ui/index.js';
import { MarginCalc } from '../modals/MarginCalc.jsx';
import { ImagePreview } from '../modals/ImagePreview.jsx';
import { WatchList } from '../modals/WatchList.jsx';

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
  { id: 'watchList',    label: 'Watch List',      icon: 'eye',     wired: true  },
  { id: 'emailPreview', label: 'Email Preview',   icon: 'mail',    wired: false },
  { id: 'imageViewer',  label: 'Image Viewer',    icon: 'eye',     wired: true  },
  { id: 'submitProof',  label: 'Submit Proof',    icon: 'send',    wired: false },
  { id: 'crmSearch',    label: 'CRM Search',      icon: 'search',  wired: false },
  { id: 'crmQuery',     label: 'CRM Query',       icon: 'filter',  wired: false },
  { id: 'crmContact',   label: 'New Contact',     icon: 'user',    wired: false },
  { id: 'taskList',     label: 'Tasks',           icon: 'check',   wired: false },
  { id: 'phoneFinder',  label: 'Phone Finder',    icon: 'search',  wired: false },
  { id: 'calendar',     label: 'Calendar',        icon: 'cog',     wired: false },
];

/* Playground seed for the Watch List / Task List modal. Writes a
   spread of sample tasks (standalone + context-linked, mixed priorities
   and dues, including one completed) so the modal opens with its full
   visual surface populated. No-op if the user already has tasks saved. */
const WATCHLIST_STORAGE_KEY = 'watchList';
function seedWatchListSamples() {
  const hasChromeStorage = (() => {
    try { return typeof chrome !== 'undefined' && !!chrome.storage?.local; }
    catch { return false; }
  })();

  const now = Date.now();
  // Build ISO-ish "YYYY-MM-DDTHH:MM" strings from offsets so the seed
  // adapts to whatever day the playground is opened.
  const iso = (offsetDays, hour, minute = 0) => {
    const d = new Date(now + offsetDays * 24 * 3600 * 1000);
    d.setHours(hour, minute, 0, 0);
    const yy = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yy}-${mo}-${dd}T${hh}:${mi}`;
  };
  const samples = [
    { id: 'pg-1', title: 'Call Acme — confirm reorder dates',  priority: 'high', due: iso(0, 14, 0),   done: false, createdAt: now - 3 * 60 * 1000,       context: { type: 'contact', id: '4421', name: 'Marcus Chen' } },
    { id: 'pg-2', title: 'Send proof revision to TaylorMade',  priority: 'med',  due: iso(0, 17, 0),   done: false, createdAt: now - 25 * 60 * 1000,      context: { type: 'order',   id: '29103' } },
    { id: 'pg-3', title: 'Follow up on Net-30 invoice',         priority: 'high', due: iso(1, 9, 30),   done: false, createdAt: now - 2 * 60 * 60 * 1000, context: { type: 'account', id: '2188', name: 'Acme Industries' } },
    { id: 'pg-4', title: 'Quote new logo color count',          priority: 'low',  due: iso(4, 17, 0),   done: false, createdAt: now - 4 * 60 * 60 * 1000, context: { type: 'contact', id: '4517', name: 'Pebble Beach Resort' } },
    { id: 'pg-5', title: 'Prep weekly customer recap',          priority: 'low',  due: '',              done: false, createdAt: now - 6 * 60 * 60 * 1000, context: null },
    { id: 'pg-6', title: 'Confirm setup fee waived',            priority: 'low',  due: iso(-1, 16, 0),  done: true,  createdAt: now - 9 * 60 * 60 * 1000, doneAt: now - 30 * 60 * 1000, context: { type: 'order', id: '29512' } },
  ];

  const apply = (existing) => {
    if (existing && existing.length > 0) return;
    if (hasChromeStorage) {
      chrome.storage.local.set({ [WATCHLIST_STORAGE_KEY]: samples });
    } else {
      try { localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(samples)); } catch {}
    }
  };

  if (hasChromeStorage) {
    chrome.storage.local.get(WATCHLIST_STORAGE_KEY, (data) => apply(data?.[WATCHLIST_STORAGE_KEY]));
  } else {
    try {
      const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
      apply(raw ? JSON.parse(raw) : null);
    } catch { apply(null); }
  }
}

/* Notification test pane registry — one entry per fire-button. Each entry's
   `run` receives the toast API and dispatches the matching variant with
   realistic test data. Grouped by variant for the test pane's section
   layout. The Step + Tray entries dispatch sticky toasts that the user can
   close from within; everything else uses the variant defaults. */
const TOAST_REGISTRY = [
  // ── Pill (single-line, auto-dismiss 3s) ──
  { group: 'Pill',   id: 'pill-success', label: 'Success', tone: 'success', run: (t) => t.success('Template saved') },
  { group: 'Pill',   id: 'pill-info',    label: 'Info',    tone: 'info',    run: (t) => t.info('5 new templates available') },
  { group: 'Pill',   id: 'pill-warning', label: 'Warning', tone: 'warning', run: (t) => t.warning('Watch list nearly full') },
  { group: 'Pill',   id: 'pill-error',   label: 'Error',   tone: 'error',   run: (t) => t.error('Failed to save template') },
  { group: 'Pill',   id: 'pill-brand',   label: 'Brand',   tone: 'brand',   run: (t) => t.brand('Connected to Power Automate') },

  // ── Action (card with CTA, sticky) ──
  { group: 'Action', id: 'action-brand',   label: 'Brand CTA',   tone: 'brand',
    run: (t) => t.action({ tone: 'brand',   title: 'Proof ready to send', message: 'Outlook draft created.', primary: 'Send', secondary: 'Review' }) },
  { group: 'Action', id: 'action-success', label: 'Success CTA', tone: 'success',
    run: (t) => t.action({ tone: 'success', title: 'Order saved',         message: 'All fields validated.', primary: 'View order' }) },
  { group: 'Action', id: 'action-warning', label: 'Warning CTA', tone: 'warning',
    run: (t) => t.action({ tone: 'warning', title: 'Margin below target', message: 'Quote is at 22% margin.', primary: 'Adjust price', secondary: 'Ignore' }) },
  { group: 'Action', id: 'action-error',   label: 'Error CTA',   tone: 'error',
    run: (t) => t.action({ tone: 'error',   title: 'Charge declined',     message: 'Card returned response 0501.', primary: 'Retry', secondary: 'Cancel' }) },

  // ── Step (sticky pipeline progress) ──
  { group: 'Step',   id: 'step-static', label: 'Static (3/4)', tone: 'brand',
    run: (t) => t.step({ title: 'Submitting proof…', steps: ['Render', 'Generate PDF', 'Upload', 'Notify'], currentStep: 2 }) },
  { group: 'Step',   id: 'step-animated', label: 'Animated', tone: 'brand',
    run: (t) => {
      const steps = ['Render', 'Generate PDF', 'Upload', 'Notify'];
      // Fire once, then mutate the existing toast's `currentStep` via
      // update(id, patch) so the toast stays mounted between ticks. Without
      // update() we'd dismiss+re-fire per step, causing a fresh entry
      // animation each tick that reads as the toast jittering in repeatedly.
      const id = t.step({ title: 'Submitting proof…', steps, currentStep: 0 });
      let cur = 0;
      const timer = setInterval(() => {
        cur += 1;
        if (cur >= steps.length) {
          clearInterval(timer);
          // Show the final "all done" state briefly, then dismiss.
          t.update(id, { currentStep: steps.length, title: 'Submitted' });
          setTimeout(() => t.dismiss(id), 1500);
          return;
        }
        t.update(id, { currentStep: cur });
      }, 1200);
    },
  },

  // ── Tray (collapsed badge → expanded list, sticky) ──
  { group: 'Tray',   id: 'tray-few',  label: '3 items', tone: 'brand',
    run: (t) => t.tray({ items: [
      { tone: 'brand',   title: 'Order failed',   message: 'Card declined',   time: '2m'  },
      { tone: 'warning', title: 'Proof feedback', message: 'New comments',    time: '11m' },
      { tone: 'success', title: 'Approved',       message: 'Customer signed', time: '23m' },
    ] }) },
  { group: 'Tray',   id: 'tray-many', label: '8 items', tone: 'brand',
    run: (t) => t.tray({ items: Array.from({ length: 8 }, (_, i) => ({
      tone: ['brand', 'warning', 'success', 'error', 'info'][i % 5],
      title: `Notification ${i + 1}`,
      message: 'Detail message for this notification',
      time: `${(i + 1) * 3}m`,
    })) }) },

  // ── Edge (top-edge ambient strip) ──
  { group: 'Edge',   id: 'edge-brand',   label: 'Brand',   tone: 'brand',   run: (t) => t.edge('Connected to Solr',          { tone: 'brand'   }) },
  { group: 'Edge',   id: 'edge-info',    label: 'Info',    tone: 'info',    run: (t) => t.edge('Reconnecting to live updates', { tone: 'info'    }) },
  { group: 'Edge',   id: 'edge-success', label: 'Success', tone: 'success', run: (t) => t.edge('Auto-save active',            { tone: 'success' }) },
  { group: 'Edge',   id: 'edge-warning', label: 'Warning', tone: 'warning', run: (t) => t.edge('You are working offline',     { tone: 'warning' }) },
  { group: 'Edge',   id: 'edge-error',   label: 'Error',   tone: 'error',   run: (t) => t.edge('Lost connection to API',      { tone: 'error'   }) },
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
/**
 * DraggablePanel — surface chrome you can drag around the playground.
 * The header is the only drag handle (so clicking buttons inside the body
 * doesn't start a drag). Position is uncontrolled (Motion owns it via
 * dragControls + initial top/left) so we don't fight the user mid-drag.
 *
 * Props:
 *   title    Header label (rendered in a uppercase SectionLabel).
 *   initial  { top, left } | { top, right }  initial CSS position.
 *   children Body content.
 *   width    Panel width (default 200).
 *   bounds   "viewport" → drag clamped to the visible viewport (default).
 */
function DraggablePanel({ title, initial = { top: 14, left: 14 }, width = 200, children }) {
  const dragControls = useDragControls();
  return (
    <motion.div
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0.06}
      style={{
        position: 'fixed',
        ...initial,
        zIndex: 10,
        width,
        background: 'var(--gb-surface-modal)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-lg)',
        boxShadow: 'var(--gb-shadow-popover)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Drag handle — title bar. onPointerDown forwards to the dragControls
          so this strip alone initiates the drag (clicks anywhere inside
          the body keep their normal click behavior). */}
      <div
        onPointerDown={(e) => dragControls.start(e)}
        style={{
          padding: '7px 10px',
          background: 'var(--gb-fill-subtle)',
          borderBottom: '1px solid var(--gb-border-subtle)',
          cursor: 'grab',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <I.more size={11} style={{ color: 'var(--gb-text-muted)' }} />
        <SectionLabel divider={false} style={{ marginBottom: 0 }}>{title}</SectionLabel>
      </div>
      <div style={{ padding: 10 }}>{children}</div>
    </motion.div>
  );
}

function PlaygroundSurface() {
  // Single mounted modal at a time. Value is the registry id, or null.
  const [mounted, setMounted] = useState(null);
  const notify = useSettingNotification();
  const toast = useToast();

  // Selected horizontal placement applied to the next toast fire. Edge
  // toasts ignore this — they have their own dedicated top-edge placement.
  // The same constant feeds the Segmented switcher in the test pane.
  const [placement, setPlacement] = useState('top-right');

  // Collapsed variant groups in the Notifications pane. Default: all
  // closed so the pane reads as a compact accordion instead of a long
  // scroll. Open a group by clicking its header.
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const toggleGroup = (g) => setOpenGroups((s) => {
    const next = new Set(s);
    if (next.has(g)) next.delete(g); else next.add(g);
    return next;
  });

  const launch = (entry) => {
    if (entry.wired) {
      // Seed sample watchlist data on first open so the modal shows
      // its full design instead of an empty state in the playground.
      if (entry.id === 'watchList') seedWatchListSamples();
      setMounted(entry.id);
      return;
    }
    notify.notify(`${entry.label} modal — coming soon`, { tone: 'info' });
  };

  // Wrap a registry entry's `run` so every fire inherits the current
  // placement selection (edge toasts excepted — they override). dismiss /
  // update / dismissAll pass through unchanged so step demos can advance
  // an existing toast id without re-mounting.
  const fireToast = (entry) => {
    if (!toast) return;
    const proxied = {
      ...toast,
      pill:   (m, o = {}) => toast.pill(m,   { placement, ...o }),
      action: (o = {})    => toast.action({ placement, ...o }),
      step:   (o = {})    => toast.step({   placement, ...o }),
      tray:   (o = {})    => toast.tray({   placement, ...o }),
      // EdgeToast keeps its own placement (top-edge) — too quirky to be
      // shifted horizontally and the spec calls for the ambient strip.
      edge:   (m, o = {}) => toast.edge(m, o),
      success: (m, o = {}) => toast.success(m, { placement, ...o }),
      info:    (m, o = {}) => toast.info(m,    { placement, ...o }),
      warning: (m, o = {}) => toast.warning(m, { placement, ...o }),
      error:   (m, o = {}) => toast.error(m,   { placement, ...o }),
      brand:   (m, o = {}) => toast.brand(m,   { placement, ...o }),
      // Imperative APIs forward verbatim — placement is already baked in
      // on the original fire so updates don't need to re-apply it.
      dismiss:    toast.dismiss,
      update:     toast.update,
      dismissAll: toast.dismissAll,
    };
    entry.run(proxied);
  };

  // Group the toast registry by section so the right-side pane can render
  // one header + button cluster per toast variant.
  const toastGroups = (() => {
    const out = new Map();
    for (const t of TOAST_REGISTRY) {
      if (!out.has(t.group)) out.set(t.group, []);
      out.get(t.group).push(t);
    }
    return [...out.entries()];
  })();

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
        {mounted === 'imageViewer' && (
          /* No `url` passed → ImagePreview falls back to icons/photo_ball.jpg
             so the modal opens fully populated for design iteration. */
          <ImagePreview
            key="imageViewer"
            onClosed={() => setMounted(null)}
          />
        )}
        {mounted === 'watchList' && (
          <WatchList
            key="watchList"
            onClosed={() => setMounted(null)}
          />
        )}
      </AnimatePresence>
    </div>
    {/* /scaled wrapper */}

    {/* Test panes — both live OUTSIDE the scaled wrapper so they stay at
        native chrome size and anchor to viewport coordinates (a fixed
        child of a transformed ancestor anchors to that ancestor, not the
        viewport). Both draggable by their title bars. */}

    {/* ── Modals pane (top-left default) ── */}
    <DraggablePanel title="Modals" width={200} initial={{ top: 14, left: 14 }}>
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
    </DraggablePanel>

    {/* ── Notifications pane (top-right default) ── */}
    <DraggablePanel title="Notifications" width={220} initial={{ top: 14, right: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Placement switcher — applies to the next fire of any non-edge
            toast. Edge toasts override (they have their own ambient
            top-edge slot per spec). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: 0.8, color: 'var(--gb-text-muted)',
          }}>Placement</div>
          <Segmented
            size="sm"
            value={placement}
            onChange={setPlacement}
            options={[
              { id: 'top-left',   label: 'Left'   },
              { id: 'top-center', label: 'Center' },
              { id: 'top-right',  label: 'Right'  },
            ]}
          />
        </div>

        {/* Variant groups — collapsible accordion. Header is the row;
            body slides open on click. Height-collapse + opacity exit
            keeps the pane compact when most groups are closed. */}
        {toastGroups.map(([group, entries]) => {
          const open = openGroups.has(group);
          return (
            <div key={group} style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                onClick={() => toggleGroup(group)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  cursor: 'pointer', userSelect: 'none',
                  padding: '3px 2px',
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: 0.6, color: 'var(--gb-text-tertiary)',
                }}
              >
                <motion.span
                  animate={{ rotate: open ? 90 : 0 }}
                  transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
                  style={{ display: 'flex', color: 'var(--gb-text-muted)' }}
                >
                  <I.chevr size={10} />
                </motion.span>
                <span style={{ flex: 1 }}>{group}</span>
                <span style={{
                  fontSize: 9, fontWeight: 600, color: 'var(--gb-text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}>{entries.length}</span>
              </div>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4, paddingLeft: 4 }}>
                      {entries.map((entry) => (
                        <Btn
                          key={entry.id}
                          size="sm"
                          full
                          variant="secondary"
                          onClick={() => fireToast(entry)}
                          style={{ justifyContent: 'flex-start' }}
                        >
                          {entry.label}
                        </Btn>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* Dismiss-all utility */}
        <Btn
          size="xs"
          variant="ghost"
          icon={<I.close />}
          onClick={() => toast?.dismissAll?.()}
          style={{ marginTop: 4, justifyContent: 'center' }}
        >
          Dismiss all
        </Btn>
      </div>
    </DraggablePanel>
    </div>
  );
}

function PlaygroundApp() {
  return (
    <ToastHost>
      <SettingNotificationHost placement="top">
        <PlaygroundSurface />
      </SettingNotificationHost>
    </ToastHost>
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
