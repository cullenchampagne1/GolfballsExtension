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
import { CRMCreateContact } from '../modals/CRMCreateContact.jsx';
import { SubmitProof } from '../modals/SubmitProof.jsx';
import { CRMSearch } from '../modals/CRMSearch.jsx';
import { QueryBuilder } from '../modals/QueryBuilder.jsx';
import { TaskList } from '../modals/TaskList.jsx';
import { CallLog } from '../modals/CallLog.jsx';
import { submitCallLog } from '../lib/submitCallLog.js';
import { QuickTask } from '../modals/QuickTask.jsx';
import { submitQuickTask } from '../lib/submitQuickTask.js';
import { EmailPreview } from '../modals/EmailPreview.jsx';
import { ActionsShelf } from '../ui/components/ActionsShelf.jsx';
import { actionRegistry } from '../lib/actionRegistry.js';
import { findPhone } from '../lib/findPhone.js';
import { useFeatureFlag } from '../lib/useFeatureFlag.js';

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
  { id: 'emailPreview', label: 'Email Preview',   icon: 'mail',    wired: true  },
  { id: 'imageViewer',  label: 'Image Viewer',    icon: 'eye',     wired: true  },
  { id: 'submitProof',  label: 'Submit Proof',    icon: 'send',    wired: true  },
  { id: 'crmSearch',    label: 'CRM Search',      icon: 'search',  wired: true  },
  { id: 'crmQuery',     label: 'CRM Query',       icon: 'filter',  wired: true  },
  { id: 'crmContact',   label: 'New Contact',     icon: 'user',    wired: true  },
  { id: 'taskList',     label: 'Tasks',           icon: 'check',   wired: true  },
  { id: 'callLog',      label: 'Call Log',        icon: 'phone',   wired: true  },
  { id: 'quickTask',    label: 'Quick Task',      icon: 'check',   wired: true  },
  { id: 'calendar',     label: 'Calendar',        icon: 'cog',     wired: false },
];

/* ── Email Preview fixtures ───────────────────────────────────
   Two hand-crafted `email` records (the shape parseEml emits:
   { subject, from, to, date, bodyHtml }) so the EmailPreview thread
   builder + categorize rail can be exercised without a CRM page:

     single  — one inbound customer message, no quoted history.
     thread  — a reply chain in Outlook's quoted-reply format
               (divRplyFwdMsg + a bold From/Sent/To/Subject header
               block) so splitThreadHtml() cuts it into 3 cards.

   The header blocks deliberately mirror real Outlook markup — bold
   labels closed by a </p> before each quoted body — which is exactly
   what findQuoteBoundaries / stripHeaderBlock anchor on. */
const EMAIL_SINGLE_HTML = `
  <div style="font-family:Calibri,'Segoe UI',sans-serif;font-size:11pt;color:#1f1f1f;">
    <p>Hi Bob,</p>
    <p>Quick question on the custom logo Pro V1s — can we still hit the
       tournament date if we approve the proof this week? Also curious about
       volume pricing past 50 dozen.</p>
    <p>Thanks,<br>Alice</p>
  </div>`;

const EMAIL_THREAD_HTML = `
  <div style="font-family:Calibri,'Segoe UI',sans-serif;font-size:11pt;color:#1f1f1f;">
    <p>Hi Alice — the proof looks great, we'll get these into production and
       ship Friday so you're well ahead of the tournament. Volume pricing
       past 50 dozen is 8% off; I'll attach the sheet.</p>
    <p>Best,<br>Bob</p>
  </div>
  <div id="divRplyFwdMsg">
    <hr style="border:none;border-top:1px solid #ccc;">
    <p style="margin:0"><b>From:</b> Alice Carter &lt;alice.carter@acmegolf.com&gt;<br>
       <b>Sent:</b> Monday, May 25, 2026 9:14 AM<br>
       <b>To:</b> Bob Lee &lt;bob.lee@golfballs.com&gt;<br>
       <b>Subject:</b> RE: Custom logo golf balls — proof?</p>
    <p>Hi Bob, any update on the logo proof? Hoping to approve today so we
       stay on schedule for the member-guest.</p>
  </div>
  <div id="divRplyFwdMsg">
    <hr style="border:none;border-top:1px solid #ccc;">
    <p style="margin:0"><b>From:</b> Bob Lee &lt;bob.lee@golfballs.com&gt;<br>
       <b>Sent:</b> Friday, May 22, 2026 4:02 PM<br>
       <b>To:</b> Alice Carter &lt;alice.carter@acmegolf.com&gt;<br>
       <b>Subject:</b> Custom logo golf balls — proof?</p>
    <p>Hi Alice, attached is the first proof for your logo on Pro V1s. Let me
       know if the placement looks right and we'll lock it in.</p>
  </div>`;

const EMAIL_FIXTURES = {
  single: {
    email: {
      subject: 'Custom logo golf balls — quick question',
      from: 'Alice Carter <alice.carter@acmegolf.com>',
      to: 'Bob Lee <bob.lee@golfballs.com>',
      date: 'Mon, 25 May 2026 09:14:00 -0700',
      bodyHtml: EMAIL_SINGLE_HTML,
    },
    meta: {
      from: 'Alice Carter <alice.carter@acmegolf.com>',
      to: 'Bob Lee <bob.lee@golfballs.com>',
      subject: 'Custom logo golf balls — quick question',
      date: 'Mon, 25 May 2026 09:14:00 -0700',
    },
  },
  thread: {
    email: {
      subject: 'RE: Custom logo golf balls — proof?',
      from: 'Bob Lee <bob.lee@golfballs.com>',
      to: 'Alice Carter <alice.carter@acmegolf.com>',
      date: 'Tue, 26 May 2026 08:30:00 -0700',
      bodyHtml: EMAIL_THREAD_HTML,
    },
    meta: {
      from: 'Bob Lee <bob.lee@golfballs.com>',
      to: 'Alice Carter <alice.carter@acmegolf.com>',
      subject: 'RE: Custom logo golf balls — proof?',
      date: 'Tue, 26 May 2026 08:30:00 -0700',
    },
  },
};

/* Sample recommendations for the case-mode categorize rail. */
const EMAIL_RECOMMENDED = [
  { category: 'Sales', subcategory: 'Quote', label: 'Sales · Quote' },
  { category: 'Art', subcategory: 'Proof', label: 'Art · Proof' },
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

/* One-time cleanup of templates that earlier playground builds
   wrote into chrome.storage.local.noteTemplates. Those builds
   seeded sample call_log + task templates with ids prefixed
   `pg-cl-` and `pg-task-`. The playground no longer seeds; this
   strip lets a returning user end up with ONLY their real
   Notes-editor-configured templates the next time they open the
   playground. Safe to run unconditionally — it only touches ids
   that match our prefixes, so any real template stays put. */
const NOTE_TEMPLATES_KEY = 'noteTemplates';
function purgePlaygroundTemplateSeeds() {
  const hasChromeStorage = (() => {
    try { return typeof chrome !== 'undefined' && !!chrome.storage?.local; }
    catch { return false; }
  })();

  const isSeed = (t) => {
    const id = String(t?.id || '');
    return id.startsWith('pg-cl-') || id.startsWith('pg-task-');
  };

  const apply = (existing) => {
    const arr = Array.isArray(existing) ? existing : [];
    const cleaned = arr.filter((t) => !isSeed(t));
    if (cleaned.length === arr.length) return;  // nothing to strip
    if (hasChromeStorage) {
      chrome.storage.local.set({ [NOTE_TEMPLATES_KEY]: cleaned });
    } else {
      try { localStorage.setItem(NOTE_TEMPLATES_KEY, JSON.stringify(cleaned)); } catch {}
    }
  };

  if (hasChromeStorage) {
    chrome.storage.local.get(NOTE_TEMPLATES_KEY, (data) => apply(data?.[NOTE_TEMPLATES_KEY]));
  } else {
    try {
      const raw = localStorage.getItem(NOTE_TEMPLATES_KEY);
      apply(raw ? JSON.parse(raw) : null);
    } catch {}
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
  // Carries the image (if any) the user loaded in ImagePreview when
  // they click Submit Proof — handed to SubmitProof on the swap.
  const [proofImage, setProofImage] = useState(null);
  // Carries the contact context (name + phone) that the CallLog modal
  // should log against. Set by the "Call {name}" smart action handler
  // before mounting the modal; cleared on close.
  const [callContext, setCallContext] = useState(null);
  // Same pattern for the QuickTask modal — name + type are enough for
  // the playground; submitQuickTask will refuse for lack of contactId/
  // employeeId, which is the desired sandbox behavior.
  const [taskContext, setTaskContext] = useState(null);
  /* Email Preview debug controls — which fixture (single vs multi-
     thread) and whether to open in case mode (categorize rail on). */
  const [emailVariant, setEmailVariant] = useState('thread');
  const [emailCase, setEmailCase] = useState(true);
  const notify = useSettingNotification();
  const toast = useToast();

  // Find-phone is gated on a feature flag so admins can disable the
  // action without rebuilding. Default-on outside an extension context
  // (the playground in a browser tab has no chrome.storage). When the
  // flag is OFF the action never registers, so it doesn't appear in
  // the shelf list at all — exactly what we want.
  const phoneFinderEnabled = useFeatureFlag('phoneFinderEnabled');

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

  /* ── Seed the ActionsShelf with demo actions + a fake page context.
       Lets you see the registry-driven drawer with real content in the
       playground without depending on smart-detection running on a
       golfballs.com page. setPage triggers the "smart for this page"
       group to filter actions whose smartFor includes 'contact'.
       Unregisters on unmount so HMR doesn't double-up entries. */
  React.useEffect(() => {
    const RegSvg = ({ children, size = 13, stroke = 2 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    );
    const SearchG = (p) => (<RegSvg {...p}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></RegSvg>);
    const UserG   = (p) => (<RegSvg {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></RegSvg>);
    const ListG   = (p) => (<RegSvg {...p}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></RegSvg>);
    const EyeG    = (p) => (<RegSvg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></RegSvg>);

    // Page-context demo: pretend we're on a contact page. The shelf
    // header reflects this, and any action with `smartFor: ['contact']`
    // floats into the Smart group.
    actionRegistry.setPage('contact', 'Marcus Chen', 'Contact · Acme Industries');

    // Read the current page label so "Call {name}" reflects the
    // active contact/account. The page is set above (setPage) so
    // this is fresh — for a real content-script the same pattern
    // re-registers when smart-detection updates the page.
    const pageLabel = actionRegistry.getPageLabel() || 'contact';

    const unsubs = [
      actionRegistry.register({
        id: 'demo-call-contact',
        label: `Call ${pageLabel}`,
        icon: <I.phone size={13} />,
        hint: 'Dial via tel: + log the outcome',
        smartFor: ['contact', 'account'],
        handler: async () => {
          // Mock phone for the playground demo. In the real extension
          // this'll come from the contact's saved CRM record.
          const mockPhone = '(415) 555-0142';
          const digits = mockPhone.replace(/\D/g, '');
          // `tel:` in a _blank target hands the dial off to whatever
          // app owns the protocol (3CX desktop / PWA / FaceTime) without
          // navigating the current tab away — the rep stays on the
          // contact page so they can keep working.
          if (typeof window !== 'undefined') {
            window.open(`tel:${digits}`, '_blank');
          }
          // Mount the log modal — the modal reads the rep's real
          // call_log templates from chrome.storage.local.noteTemplates
          // (configured via the Notes editor). Playground no longer
          // injects sample data, so an empty Notes editor means an
          // empty Quick Log section with a "configure in editor" hint.
          setCallContext({
            contactName: actionRegistry.getPageLabel() || 'Contact',
            contactType: actionRegistry.getPage() || 'contact',
            phone: mockPhone,
          });
          setMounted('callLog');
        },
      }),
      actionRegistry.register({
        id: 'demo-quick-task',
        label: `Quick task for ${pageLabel}`,
        icon: <I.check size={13} />,
        hint: 'Create a CRM task from a preset or custom form',
        smartFor: ['contact', 'account'],
        handler: async () => {
          setTaskContext({
            contactName: actionRegistry.getPageLabel() || 'Contact',
            contactType: actionRegistry.getPage() || 'contact',
          });
          setMounted('quickTask');
        },
      }),
      actionRegistry.register({
        id: 'demo-crm-search',
        label: 'Open CRM Search',
        icon: <SearchG />,
        hint: 'Find another contact or account',
        handler: () => launch({ id: 'crmSearch', wired: true }),
      }),
      actionRegistry.register({
        id: 'demo-task-list',
        label: 'Open Task List',
        icon: <ListG />,
        hint: 'Your open tasks',
        handler: () => launch({ id: 'taskList', wired: true }),
      }),
      actionRegistry.register({
        id: 'demo-watch-list',
        label: 'Open Watch List',
        icon: <EyeG />,
        handler: () => launch({ id: 'watchList', wired: true }),
      }),
      actionRegistry.register({
        id: 'demo-new-contact',
        label: 'Create new contact',
        icon: <UserG />,
        handler: () => launch({ id: 'crmCreateContact', wired: true }),
      }),
    ];

    return () => {
      for (const u of unsubs) u();
      actionRegistry.setPage(null, '', '');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Find-phone action — gated on `phoneFinderEnabled`. Lives in its
       own effect so flipping the flag at runtime (via the popup) adds
       or removes the entry from the shelf without remounting any other
       action. When the flag is off we register nothing and return a
       no-op cleanup — the shelf list won't include find-phone at all. */
  React.useEffect(() => {
    if (!phoneFinderEnabled) return undefined;
    const PhoneG = ({ size = 13, stroke = 2 }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.72 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0122 16.92z"/>
      </svg>
    );

    // Mock orders the demo handler scans. Each page returns HTML
    // shaped like the real CRM's order page (table#customerInfo with
    // Name + Phone rows) so extractPhonesFromOrderHtml exercises the
    // structured-parse path, not just the regex fallback.
    const mockOrderPage = (name, phone) => (`
      <html><body>
        <table id="customerInfo">
          <tr><td>Name</td>  <td class="darkText">${name}</td></tr>
          <tr><td>Phone</td> <td class="darkText">${phone}</td></tr>
        </table>
      </body></html>
    `);

    const unsub = actionRegistry.register({
      id: 'demo-find-phone',
      label: 'Find phone for Marcus',
      icon: <PhoneG />,
      hint: 'Scan orders for the right number',
      smartFor: ['contact'],
      badge: { label: 'CRM', tone: 'brand' },
      handler: () => findPhone({
        contactName: 'Marcus Chen',
        // 3 mock orders → 2 unique phone numbers + 1 duplicate (so the
        // dedupe path runs). One has a shipping-address name, one doesn't.
        fetchOrderLinks: async () => ([
          'mock://order/A-1001',
          'mock://order/A-1002',
          'mock://order/A-1003',
        ]),
        fetchOrderPage: async (url) => {
          await new Promise((r) => setTimeout(r, 180));
          if (url.endsWith('A-1001')) return { html: mockOrderPage('Marcus Chen',  '(415) 555-0142'), url };
          if (url.endsWith('A-1002')) return { html: mockOrderPage('Acme Receiving', '(212) 555-0188'), url };
          // Dupe of the first — exercises the seen-set dedupe path.
          return { html: mockOrderPage('Marcus Chen', '(415) 555-0142'), url };
        },
        saveContact: async (_phone) => {
          await new Promise((r) => setTimeout(r, 250));
          return { ok: true };
        },
        toast,
      }),
    });

    return () => unsub();
  }, [phoneFinderEnabled, toast]);

  const launch = (entry) => {
    if (entry.wired) {
      // Seed sample watchlist data on first open so the modal shows
      // its full design instead of an empty state in the playground.
      if (entry.id === 'watchList') seedWatchListSamples();
      // When the Call Log / Quick Task modals are opened directly from
      // the modal toolbar (no smart action upstream), seed a default
      // contact context so the modal subtitle has a name. Templates
      // come from chrome.storage.local.noteTemplates (the rep's real
      // configured templates from the Notes editor) — playground
      // doesn't inject sample data.
      if (entry.id === 'callLog' && !callContext) {
        setCallContext({
          contactName: 'Marcus Chen',
          contactType: 'contact',
          phone: '(415) 555-0142',
        });
      }
      if (entry.id === 'quickTask' && !taskContext) {
        setTaskContext({
          contactName: 'Marcus Chen',
          contactType: 'contact',
        });
      }
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
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'var(--gb-font-sans)',
      color: 'var(--gb-text-secondary)',
    }}>
    {/* Background — sits behind everything and stays at 100% regardless
        of the Playground slider. Pulled out of the parent's style so
        zooming the content wrapper above doesn't compound the grid. */}
    <div
      aria-hidden
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none',
        ...gridBackground,
      }}
    />
    {/* Content wrapper — everything the Playground slider scales: the
        modal-scaling wrapper, the toolbar/DraggablePanel, sidebars,
        action buttons, and the ActionsShelf live inside. The grid
        background above is intentionally OUTSIDE this so zooming
        doesn't tile-shift the graph paper. */}
    <div
      data-gb-scale="playground"
      style={{ position: 'absolute', inset: 0 }}
    >
    {/* Scaled wrapper holds the modal mount + center hint. The toolbar
        lives OUTSIDE so it stays at native chrome size — a transformed
        ancestor would scale the toolbar AND break its position:fixed
        anchoring (CSS quirk: fixed elements anchor to their nearest
        transformed ancestor, not the viewport). Modals INSIDE this
        wrapper inherit the scale, which is the whole point. */}
    <div
      style={{
        transform: `scale(${PLAYGROUND_SCALE})`,
        transformOrigin: 'top left',
        width:  `${inv * 100}%`,
        height: `${inv * 100}%`,
        position: 'relative',
      }}
    >
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
          /* No `url` passed → ImagePreview falls back to assets/photo_ball.jpg
             so the modal opens fully populated for design iteration. */
          <ImagePreview
            key="imageViewer"
            onClosed={() => setMounted(null)}
            onLaunchSubmitProof={(payload) => {
              setProofImage(payload || null);
              setMounted('submitProofForm');
            }}
          />
        )}
        {mounted === 'watchList' && (
          <WatchList
            key="watchList"
            onClosed={() => setMounted(null)}
          />
        )}
        {mounted === 'crmContact' && (
          <CRMCreateContact
            key="crmContact"
            onClosed={() => setMounted(null)}
          />
        )}
        {mounted === 'submitProof' && (
          /* Entry point is ImagePreview, NOT SubmitProof directly. The
             user drops / pastes / skips an image, then clicks Submit
             Proof inside ImagePreview, which hands off to SubmitProof
             via onLaunchSubmitProof. ImagePreview opens with no url →
             drop-zone view. */
          <ImagePreview
            key="submitProof-entry"
            onClosed={() => setMounted(null)}
            onLaunchSubmitProof={(payload) => {
              // Swap to SubmitProof with whatever image (if any) the
              // user had loaded. Mount key differs from the playground
              // imageViewer entry so AnimatePresence treats it as a
              // distinct modal lifecycle.
              setProofImage(payload || null);
              setMounted('submitProofForm');
            }}
          />
        )}
        {mounted === 'submitProofForm' && (
          <SubmitProof
            key="submitProofForm"
            image={proofImage}
            onClosed={() => { setMounted(null); setProofImage(null); }}
          />
        )}
        {mounted === 'crmSearch' && (
          <CRMSearch
            key="crmSearch"
            /* Playground always uses mock data + the mock send loop so
               reps can drive the entire email-runner animation end-to-
               end without needing real Solr / Power Automate behind it.
               Mock templates ship from EmailRunner so the template
               dropdown isn't empty even if chrome.storage has nothing
               seeded. */
            useMock
            onClosed={() => setMounted(null)}
          />
        )}
        {mounted === 'crmQuery' && (
          /* Standalone Query Builder. With no `onApply` prop, clicking
             Apply falls back to a toast that surfaces the compiled
             fq= — so the modal is testable without a parent CRM
             search. Re-uses the same saved-queries storage so anything
             saved here shows up in the in-context QB and vice versa. */
          <QueryBuilder
            key="crmQuery"
            onClosed={() => setMounted(null)}
          />
        )}
        {mounted === 'taskList' && (
          <TaskList
            key="taskList"
            /* Same playground-only mock blast wiring as CRMSearch:
               mock tasks + mock send loop so the rep can debug the
               per-row email animation without an extension context. */
            useMock
            onClosed={() => setMounted(null)}
          />
        )}
        {mounted === 'quickTask' && taskContext && (
          <QuickTask
            key="quickTask"
            contactName={taskContext.contactName}
            contactType={taskContext.contactType}
            /* Same dep-injection pattern as CallLog: use the real
               submitQuickTask. In the playground we have no
               contactId/employeeId, so it short-circuits with a
               "Missing contact ID, employee ID..." toast — same
               error a real contact page would surface if smart-
               detection ever returned an incomplete context. */
            onSubmit={(template) => submitQuickTask({
              template,
              context: {
                contactId:  taskContext.contactId  || '',
                contactName: taskContext.contactName,
                employeeId: taskContext.employeeId || '',
              },
            })}
            onClosed={() => { setMounted(null); setTaskContext(null); }}
          />
        )}
        {mounted === 'callLog' && callContext && (
          <CallLog
            key="callLog"
            contactName={callContext.contactName}
            contactType={callContext.contactType}
            phone={callContext.phone}
            /* Use the SAME submitCallLog the production content-script
               uses. In the playground there's no contactId/employeeId
               on the page (and the CRM URL isn't reachable from a
               regular tab), so submitCallLog will short-circuit with
               a clear "Missing contact ID, employee ID…" error that
               the modal surfaces as a toast. Mirrors exactly what the
               rep would see in production if smart-detection ever
               returned an incomplete context — no divergence between
               sandbox + production code paths. */
            onSubmit={(template) => submitCallLog({
              template,
              context: {
                contactId:  callContext.contactId  || '',
                phone:      (callContext.phone || '').replace(/\D/g, ''),
                contactName: callContext.contactName,
                employeeId: callContext.employeeId || '',
              },
            })}
            onClosed={() => { setMounted(null); setCallContext(null); }}
          />
        )}
        {mounted === 'emailPreview' && (
          /* Keyed on variant + mode so flipping either control in the
             Email Preview pane remounts the modal with the new fixture.
             The modal's own header Case/Inbox toggle still works for
             live flips once open. */
          <EmailPreview
            key={`email-${emailVariant}-${emailCase}`}
            email={EMAIL_FIXTURES[emailVariant].email}
            meta={EMAIL_FIXTURES[emailVariant].meta}
            loading={false}
            defaultCase={emailCase}
            recommended={EMAIL_RECOMMENDED}
            onApplyCategory={(category, subcategory) => toast?.success?.(`Applied ${category} · ${subcategory}`, { duration: 1800 })}
            onJunk={() => toast?.info?.('Marked as junk')}
            applyState={null}
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

    {/* ── Email Preview debug pane — only while that modal is open ── */}
    {mounted === 'emailPreview' && (
      <DraggablePanel title="Email Preview" width={216} initial={{ top: 14, left: 230 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)' }}>Content</div>
            <Segmented
              size="sm"
              value={emailVariant}
              onChange={setEmailVariant}
              options={[
                { id: 'single', label: 'Single' },
                { id: 'thread', label: 'Thread' },
              ]}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)' }}>View</div>
            <Segmented
              size="sm"
              value={emailCase ? 'case' : 'inbox'}
              onChange={(v) => setEmailCase(v === 'case')}
              options={[
                { id: 'inbox', label: 'Normal' },
                { id: 'case', label: 'Case' },
              ]}
            />
          </div>
          <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', lineHeight: 1.4 }}>
            Switching remounts the modal with that fixture. The modal's header
            toggle also flips Case/Normal live.
          </div>
        </div>
      </DraggablePanel>
    )}

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

    {/* ── Actions Shelf (bottom-right) ──────────────────────────
        Floating shelf that reads the live actionRegistry. The
        playground seeds a few demo actions + a placeholder page
        context on mount (see PlaygroundApp below) so the shelf
        opens with real content instead of an empty list.

        The shelf renders OUTSIDE the scaled wrapper so its
        position:fixed anchors to the viewport at native scale —
        anything inside the wrapper would be 0.74× of its style. */}
    <ActionsShelf />
    </div>
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
// Clear any leftover playground-seeded sample templates from earlier
// builds that did `seedCallLogTemplates` / `seedQuickTaskTemplates`.
// Idempotent — leaves the rep's real Notes-editor templates alone.
purgePlaygroundTemplateSeeds();

function mount() {
  const host = document.getElementById('playground-root');
  // Don't put data-gb-scale on #playground-root — that would also
  // scale the gridBackground div. The scaled wrapper INSIDE
  // PlaygroundSurface gets the attribute instead so only the demo
  // modals + center hint pick up the user's Playground slider.
  if (!host) return;
  createRoot(host).render(<PlaygroundApp />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
