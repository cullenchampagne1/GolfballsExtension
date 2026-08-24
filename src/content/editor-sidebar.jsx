import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import {
  Btn, IconBtn, Tag, Input, Segmented, SectionLabel, Callout, I, Icon, T,
  TYPE_ICONS, TYPE_COLORS,
  useSettingNotification,
} from '../ui/index.js';
import {
  buildEmailTemplateFile,
  importSharedEmailTemplate,
  importTemplates,
  importedEmailShare,
  isImportedEmailTemplate,
  normalizeTemplate,
  parseEmailTemplateFile,
  removeImportedEmailTemplate,
} from '../lib/templateImport.js';
import { sendBackgroundMessage } from '../lib/backgroundMessage.js';
import { ownedTemplateShares } from '../lib/templateShareSync.js';
import { useDevSettings } from '../lib/devSettings.js';
import {
  canSubmitEmailTemplate,
  emailTemplateIsEditable,
  filterLocalEmailTemplates,
  managedEmailTemplate,
  resolveEmailTemplateCapabilities,
} from '../lib/emailTemplateCapabilities.js';
import {
  buildEmailTemplateTrackerCatalog,
  emailTemplateTrackingIssue,
} from '../lib/emailSubjectTracking.js';
import { CapabilitySlot } from '../ui/components/CapabilitySlot.jsx';

/* ────────────────────────────────────────────────────────────────
   editor-sidebar.jsx
   Mounts into #sidebar-react. Owns the full sidebar visual: tabs,
   search, folders (with per-type sub-sections + disabled at the
   bottom), drag-and-drop into folders, signature button.

   Legacy editor.js stays the source of truth for actions — clicking
   a row calls window.openTemplate(id), New calls window.newTemplate(),
   etc. The sidebar subscribes to chrome.storage.onChanged so any CRUD
   done elsewhere immediately reflects here.
──────────────────────────────────────────────────────────────── */

/* ── Per-type metadata: icon + color stripe + section label.
      Color is the left-border accent shown on each template row. */
/* Per-type label + color stripe. Icons + colors come from the shared
   TYPE_ICONS/TYPE_COLORS maps so the sidebar, editor headers, and any
   future surface all agree on the glyph for a given type. */
const TYPE_META_TPL = {
  order:   { label: 'Order',    color: TYPE_COLORS.order,    icon: TYPE_ICONS.order },
  account: { label: 'Account',  color: TYPE_COLORS.account,  icon: TYPE_ICONS.account },
  case:    { label: 'Case',     color: TYPE_COLORS.case,     icon: TYPE_ICONS.case },
};
const TYPE_META_NOTE = {
  note:     { label: 'Note',     color: TYPE_COLORS.note,     icon: TYPE_ICONS.note },
  task:     { label: 'Task',     color: TYPE_COLORS.task,     icon: TYPE_ICONS.task },
  call_log: { label: 'Call log', color: TYPE_COLORS.call_log, icon: TYPE_ICONS.call_log },
};
const TYPE_ORDER_TPL  = ['order', 'account', 'case'];
const TYPE_ORDER_NOTE = ['note', 'task', 'call_log'];

/* Picker palette for folder accents — tokens, so themes track. The id
   is what gets persisted on `folder.color`; default = 'brand'. */
const FOLDER_COLORS = [
  { id: 'brand',   color: 'var(--gb-brand-label)'   },
  { id: 'info',    color: 'var(--gb-info-fg)'       },
  { id: 'warning', color: 'var(--gb-warning-fg)'    },
  { id: 'success', color: 'var(--gb-success-fg)'    },
  { id: 'error',   color: 'var(--gb-error-fg)'      },
  { id: 'neutral', color: 'var(--gb-text-tertiary)' },
];
function folderColor(folder) {
  const id = folder?.color || 'brand';
  return (FOLDER_COLORS.find((c) => c.id === id) || FOLDER_COLORS[0]).color;
}

const FolderIcon = (p) => <Icon {...p}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></Icon>;
const ImportIcon = (p) => <Icon {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Icon>;
const PenIcon    = (p) => <Icon {...p}><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></Icon>;
const CogIcon    = (p) => <Icon {...p}><path d="M10.3 4.3c.4-1.7 2.9-1.7 3.3 0a1.7 1.7 0 002.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 001 2.5c1.8.5 1.8 3 0 3.4a1.7 1.7 0 00-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 00-2.6 1c-.4 1.8-2.9 1.8-3.3 0a1.7 1.7 0 00-2.6-1c-1.5.9-3.3-.8-2.4-2.4a1.7 1.7 0 00-1-2.6c-1.8-.4-1.8-2.9 0-3.4a1.7 1.7 0 001-2.5c-.9-1.6.9-3.3 2.4-2.4 1 .6 2.3.1 2.6-1.1z"/><circle cx="12" cy="12" r="3"/></Icon>;
const HelpIcon   = (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 2.5-3 4.5"/><path d="M12 17.5h.01"/></Icon>;

/* ── Storage helpers ────────────────────────────────────────────── */
const STORAGE_KEYS = ['templates', 'noteTemplates', 'templateFolders', 'noteFolders', 'gbEmailTemplateSends', 'gbEmailTemplateSubmissions'];
function loadAll() { return new Promise((res) => chrome.storage.local.get(STORAGE_KEYS, res)); }
function saveKey(key, value) { chrome.storage.local.set({ [key]: value }); }

/* DataTransfer MIME — kept unique so we don't trample other drags. */
const DRAG_MIME = 'application/x-gb-tpl';

/* Consistent animation language. Used everywhere so every interaction
   feels like it belongs to the same UI:
   - LAYOUT_SPRING — row teleporting between folders / type sections /
                     enabled-vs-disabled buckets.
   - SOFT          — folder collapse, content area fades.
   - SNAP          — instant color/opacity transitions (hover, active). */
const LAYOUT_SPRING = { type: 'spring', stiffness: 360, damping: 32, mass: 0.9 };
const SOFT          = { duration: 0.26, ease: [0.32, 0.72, 0, 1] };
const SNAP          = { duration: 0.14, ease: [0.4, 0, 0.2, 1] };

/* Hover backgrounds for rows and folder headers live in CSS instead of
   motion's `whileHover` — motion tries to interpolate between two CSS
   `var()` strings on the same property and falls back to a bright
   midpoint on first hover (the "flash" the user reported). A plain CSS
   `:hover` with a `transition` handles the fade cleanly; the active
   class wins so the brand tint never gets overwritten by hover. */
const ROW_STYLE_ID = '__gb-sidebar-row';
function ensureRowStyle() {
  if (typeof document === 'undefined' || document.getElementById(ROW_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = ROW_STYLE_ID;
  el.textContent = `
    .gb-sidebar-hoverable { transition: background-color 140ms ease; }
    .gb-sidebar-hoverable:not(.is-active):not(.is-disabled):hover {
      background-color: var(--gb-fill-soft) !important;
    }
    .gb-template-row-secondary-label { display: inline; white-space: nowrap; }
    .gb-template-row-meta[data-icon-only="true"] .gb-template-row-secondary-label {
      display: none;
    }
  `;
  (document.head || document.documentElement).appendChild(el);
}

/* Tab-aware "what type is this row?" */
function rowType(t, isNote) {
  if (isNote) return t.subType || 'note';
  const x = t.type || 'order';
  return x === 'email' ? 'order' : x;
}

/* ── Tiny popover for the per-folder / per-row action menu ──────── */
const MENU_W = 168;
function ActionMenu({ onClose, anchorRef, children }) {
  const ref = useRef(null);

  // Position from the anchor's viewport rect. Recompute on resize; close
  // on outside scroll so the menu doesn't float when the list scrolls.
  // Portal-to-body escapes every parent stacking context (motion's layout
  // transform on TemplateRow was elevating rows above an inline menu).
  // The menu is height-capped and scrolls internally: with many folders the
  // "Move to folder" list used to grow past the viewport and push Share
  // off-screen. When the space under the anchor is too tight, the whole
  // menu shifts up so the cap still fits on screen.
  const MENU_MAX_H = 320;
  const [pos, setPos] = useState(null);
  useEffect(() => {
    function update() {
      const el = anchorRef?.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let top = r.bottom + 4;
      let maxH = Math.min(MENU_MAX_H, window.innerHeight - top - 12);
      if (maxH < 180) {
        top = Math.max(12, window.innerHeight - 12 - MENU_MAX_H);
        maxH = Math.min(MENU_MAX_H, window.innerHeight - top - 12);
      }
      setPos({ top, left: r.right - MENU_W, maxH });
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [anchorRef]);

  useEffect(() => {
    const onDown = (e) => {
      if (!ref.current?.contains(e.target) && !anchorRef.current?.contains(e.target)) onClose();
    };
    const onScroll = (e) => {
      if (ref.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose, anchorRef]);

  if (!pos) return null;
  return createPortal(
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      transition={T.base}
      onClick={(e) => e.stopPropagation()}
      style={{
        // Fixed in viewport so layout transforms on rows can't paint over
        // it. Z below the notification host (2147483600) and the color
        // popover (2147483500) so confirms still appear on top.
        position: 'fixed', top: pos.top, left: pos.left,
        zIndex: 2147483400,
        width: MENU_W,
        maxHeight: pos.maxH,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        background: 'var(--gb-surface-modal)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-md)',
        boxShadow: 'var(--gb-shadow-popover)',
        padding: 4,
      }}
    >
      {children}
    </motion.div>,
    document.body,
  );
}
function MenuItem({ children, onClick, danger }) {
  return (
    <button
      type="button"
      // Stop propagation so clicks never leak past the menu — the row
      // beneath shouldn't open just because the menu was over it.
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '6px 8px', borderRadius: 'var(--gb-r-sm)', border: 'none',
        background: 'transparent', cursor: 'pointer', textAlign: 'left',
        font: 'inherit', fontSize: 11.5,
        color: danger ? 'var(--gb-error-fg)' : 'var(--gb-text-secondary)',
        transition: 'background .12s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--gb-fill-soft)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}

/* ── Single template row — draggable, colored left stripe by type.
      Disabled rows render darker + dimmer and sit below enabled siblings. */
function TemplateRow({ tpl, tracker, summary, isNote, type, active, onClick, onMove, folders, onDragStart, onDragEnd }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef(null);
  const metaRef = useRef(null);
  const meta = (isNote ? TYPE_META_NOTE : TYPE_META_TPL)[type] || (isNote ? TYPE_META_NOTE.note : TYPE_META_TPL.order);
  const TypeIcon = meta.icon;
  const disabled = tpl.enabled === false;
  const imported = !isNote && isImportedEmailTemplate(tpl);
  const importedSource = imported ? importedEmailShare(tpl) : null;
  const ownedShares = !isNote && !imported ? ownedTemplateShares(tpl) : [];
  const ownerShared = ownedShares.length > 0;
  const managed = !isNote ? managedEmailTemplate(tpl) : null;
  const managedEditable = managed?.editable === true;
  const trackingIssue = !isNote && !disabled
    ? emailTemplateTrackingIssue(tracker)
    : null;
  useEffect(() => { ensureRowStyle(); }, []);
  useEffect(() => {
    const el = metaRef.current;
    if (!el) return undefined;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Measure the complete labels first. If they exceed the actual row,
        // collapse every secondary attachment together so provenance never
        // wraps or leaves one half-visible label behind.
        el.dataset.iconOnly = 'false';
        el.dataset.iconOnly = el.scrollWidth > el.clientWidth + 1 ? 'true' : 'false';
      });
    };
    measure();
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(measure)
      : null;
    observer?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [tpl, tracker, summary, importedSource?.ownerName, ownerShared, managed]);

  return (
    <motion.div
      // layoutId makes the row a SHARED element across folder / type-
      // section parents — when its grouping changes (type change, folder
      // move, enable/disable bucket flip) motion springs it from the old
      // position to the new instead of cross-fading.
      layoutId={`tpl-${tpl.id}`}
      layout="position"
      transition={LAYOUT_SPRING}
      draggable={!managed || managedEditable}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, tpl.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(tpl.id);
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={onClick}
      whileTap={{ scale: 0.985 }}
      animate={{
        boxShadow: active ? 'inset 0 0 0 1px var(--gb-brand-tint-border)' : 'inset 0 0 0 1px transparent',
      }}
      className={`gb-sidebar-hoverable${active ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px 6px 14px',
        borderRadius: 'var(--gb-r-sm)',
        cursor: (!managed || managedEditable) ? 'grab' : 'pointer', userSelect: 'none',
        // Base background is plain CSS so :hover can fade cleanly. Active
        // and disabled states override via the className-scoped rule
        // below, and the class wins over :hover (CSS specificity).
        background: active
          ? (ownerShared ? 'var(--gb-warning-tint-medium)' : 'var(--gb-brand-tint-soft)')
          : (disabled ? 'var(--gb-surface-deep)' : (ownerShared
            ? 'var(--gb-warning-tint-soft)'
            : 'transparent')),
      }}
    >
      {/* Type stripe — inset rounded bar, never a full border. Stays put
          when the row goes active. Left inset matches top/bottom so the
          stripe sits in a balanced gutter. */}
      <span style={{
        position: 'absolute',
        left: 6, top: 6, bottom: 6,
        width: 2, borderRadius: 2,
        background: meta.color,
        opacity: disabled ? 0.45 : 1,
        pointerEvents: 'none',
      }} />
      <TypeIcon size={11} style={{ color: disabled ? 'var(--gb-text-ghost)' : (active ? 'var(--gb-brand-label)' : meta.color), flexShrink: 0, opacity: disabled ? 0.55 : 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11.5, fontWeight: 600,
          color: disabled
            ? 'var(--gb-text-ghost)'
            : (active ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)'),
          textDecoration: disabled ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{tpl.name || 'Untitled'}</div>
        {!isNote && (() => {
          // Rules live in `accountConditions` for account templates, `rules`
          // for everything else — and both are now the grouped tree
          // ({groups:[{conditions:[]}]}), so the old `tpl.rules.length` was
          // `undefined`. Count total conditions across all groups (still
          // handling the legacy flat array).
          const tree = type === 'account'
            ? tpl.accountConditions
            : type === 'case'
              ? tpl.caseRules
              : tpl.rules;
          const ruleN = !tree
            ? 0
            : Array.isArray(tree)
              ? tree.length
              : Array.isArray(tree.groups)
                ? tree.groups.reduce((n, g) => n + ((g && g.conditions ? g.conditions.length : 0)), 0)
                : 0;
          const varN  = type === 'case'
            ? (Array.isArray(tpl.caseVars) ? tpl.caseVars.length : 0)
            : Object.keys(tpl.vars || {}).length;
          const varsN = (tpl.variations || []).length;
          return (
            <div
              ref={metaRef}
              className="gb-template-row-meta"
              data-icon-only="false"
              style={{
              display: 'flex', alignItems: 'center', gap: 5, minWidth: 0,
              overflow: 'hidden', whiteSpace: 'nowrap',
              fontSize: 9.5, color: disabled ? 'var(--gb-text-ghost)' : 'var(--gb-text-muted)', marginTop: 1,
            }}>
              <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                {ruleN} rule{ruleN !== 1 ? 's' : ''}
                {' · '}
                {varN} var{varN !== 1 ? 's' : ''}
                {/* Show variations stat once there's any variation — keeps
                    the row chrome quiet for single-version templates. */}
                {varsN > 0 && (
                  <>{' · '}{varsN} variation{varsN !== 1 ? 's' : ''}</>
                )}
                {summary?.sent > 0 && (
                  <>{' · '}{summary.responded}/{summary.sent} replies{' · '}{summary.ordered} orders</>
                )}
              </span>
              {imported && (
                <span
                  title={`Shared by ${importedSource?.ownerName || 'Unregistered installation'}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    flexShrink: 0, whiteSpace: 'nowrap',
                    color: disabled ? 'var(--gb-text-ghost)' : 'var(--gb-brand-label)',
                    fontWeight: 650,
                  }}
                >
                  <I.user size={8} style={{ flexShrink: 0 }} />
                  <span className="gb-template-row-secondary-label">
                    {importedSource?.ownerName || 'Unregistered installation'}
                  </span>
                </span>
              )}
              {ownerShared && (
                <span
                  title="Changes to this template update everyone who imported it"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, whiteSpace: 'nowrap', color: 'var(--gb-warning-fg)', fontWeight: 700 }}
                >
                  <I.link size={8} style={{ flexShrink: 0 }} />
                  <span className="gb-template-row-secondary-label">Shared by you</span>
                </span>
              )}
              {managed && (
                <span
                  title={managedEditable
                    ? 'Account-managed template · changes update managed extension users'
                    : `Locked management template · approved by ${managed.lastEditor || managed.createdBy || 'Management'}`}
                  aria-label={managedEditable
                    ? 'Account-managed template'
                    : 'Locked management template'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    color: managed.conflictWith?.length
                      ? 'var(--gb-warning-fg)'
                      : 'var(--gb-brand-label)',
                    fontWeight: 700, minWidth: 0, flexShrink: 0,
                  }}
                >
                  {managed.conflictWith?.length
                    ? <><I.alert size={8} /><span className="gb-template-row-secondary-label">Conflict with {managed.conflictWith.join(', ')}</span></>
                    : (managedEditable ? <I.users size={9} /> : <I.lock size={9} />)}
                </span>
              )}
            </div>
          );
        })()}
      </div>
      {disabled && <Tag tone="neutral" size="xs">OFF</Tag>}
      {trackingIssue && <Tag tone={trackingIssue.tone} size="xs">{trackingIssue.badge}</Tag>}
      <div ref={btnRef} style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <IconBtn size="xs" icon={<I.more />} onClick={() => setMenuOpen((v) => !v)} />
        <AnimatePresence>
          {menuOpen && (
            <ActionMenu onClose={() => setMenuOpen(false)} anchorRef={btnRef}>
              {(!managed || managedEditable) && <><div style={{ padding: '4px 8px 2px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--gb-text-muted)' }}>
                Move to folder
              </div>
              <MenuItem onClick={() => { onMove(null); setMenuOpen(false); }}>
                <FolderIcon size={11} style={{ opacity: 0.6 }} /> Uncategorized
              </MenuItem>
              {folders.map((f) => (
                <MenuItem key={f.id} onClick={() => { onMove(f.id); setMenuOpen(false); }}>
                  <FolderIcon size={11} style={{ color: 'var(--gb-brand-label)' }} /> {f.name}
                </MenuItem>
              ))}
              <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '4px 6px 2px' }} />
              </>}
              {!isNote && !imported && !managed && !ownerShared && (
                <MenuItem onClick={() => {
                  setMenuOpen(false);
                  window.dispatchEvent(new CustomEvent('gb:share-email-template', { detail: tpl }));
                }}>
                  <I.link size={11} /> Share template
                </MenuItem>
              )}
              {ownerShared && (
                <MenuItem danger onClick={() => {
                  setMenuOpen(false);
                  window.__gbRevokeTemplateShares?.(tpl.id);
                }}>
                  <I.link size={11} /> Revoke share
                </MenuItem>
              )}
              {(!managed || managedEditable) && <MenuItem
                danger
                onClick={() => {
                  setMenuOpen(false);
                  /* The bridge owns the confirm prompt + persistence
                     + "if this was the open one, drop the form back
                     to empty" handling — we just forward by id. */
                  const fn = isNote ? window.deleteNoteTemplateById : window.deleteTemplateById;
                  if (typeof fn === 'function') fn(tpl.id);
                }}
              >
                <I.trash size={11} /> Delete {isNote ? 'note' : 'template'}
              </MenuItem>}
            </ActionMenu>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ── Per-type sub-section (Order / Account / Case ...). Enabled rows
      first, then disabled rows below. */
function TypeSection({ type, isNote, tpls, trackerById, summaryById, currentId, onOpen, onMove, folders, onDragStart, onDragEnd }) {
  if (!tpls.length) return null;
  const meta = (isNote ? TYPE_META_NOTE : TYPE_META_TPL)[type];
  if (!meta) return null;
  const enabled  = tpls.filter((t) => t.enabled !== false);
  const disabled = tpls.filter((t) => t.enabled === false);

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px 3px',
        fontSize: 9, fontWeight: 800, letterSpacing: 0.8,
        textTransform: 'uppercase', color: meta.color, opacity: 0.85,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.color }} />
        {meta.label}
        <span style={{ color: 'var(--gb-text-muted)', fontWeight: 600 }}>· {tpls.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {enabled.map((t) => (
          <TemplateRow
            key={t.id} tpl={t} tracker={trackerById?.get(t.id)} summary={summaryById?.get(t.id)} isNote={isNote} type={type}
            active={t.id === currentId}
            onClick={() => onOpen(t)} onMove={(fid) => onMove(t, fid)}
            folders={folders} onDragStart={onDragStart} onDragEnd={onDragEnd}
          />
        ))}
        {disabled.map((t) => (
          <TemplateRow
            key={t.id} tpl={t} tracker={trackerById?.get(t.id)} summary={summaryById?.get(t.id)} isNote={isNote} type={type}
            active={t.id === currentId}
            onClick={() => onOpen(t)} onMove={(fid) => onMove(t, fid)}
            folders={folders} onDragStart={onDragStart} onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </div>
  );
}

/* Group an array of tpls into a Map<type, tpl[]> in render order. */
function groupByType(tpls, isNote) {
  const order = isNote ? TYPE_ORDER_NOTE : TYPE_ORDER_TPL;
  const out = new Map(order.map((k) => [k, []]));
  for (const t of tpls) {
    const k = rowType(t, isNote);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(t);
  }
  return out;
}

/* ── Collapsible folder — drop target for template drags ────────── */
function FolderGroup({ folder, tpls, isNote, trackerById, summaryById, currentId, onOpen, onMove, onRename, onDelete, onColor, folders, defaultOpen, onDragStart, onDragEnd }) {
  const [open, setOpen] = useState(defaultOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hot, setHot] = useState(false);  // drop-target highlight
  const btnRef = useRef(null);
  const grouped = useMemo(() => groupByType(tpls, isNote), [tpls, isNote]);
  const accent = folderColor(folder);

  function onDragOver(e) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!hot) setHot(true);
  }
  function onDragLeave(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setHot(false);
  }
  function onDrop(e) {
    const id = e.dataTransfer.getData(DRAG_MIME);
    setHot(false);
    if (!id) return;
    e.preventDefault();
    onMove(id, folder.id);
    setOpen(true);  // auto-expand to reveal where the row landed
  }

  return (
    <motion.div
      layout="position"
      transition={LAYOUT_SPRING}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      animate={{
        background: hot ? 'var(--gb-brand-tint-soft)' : 'transparent',
        boxShadow: hot ? 'inset 0 0 0 1px var(--gb-brand-tint-border)' : 'inset 0 0 0 1px transparent',
      }}
      style={{ borderRadius: 'var(--gb-r-md)', marginBottom: 3, padding: 1 }}
    >
      {/* Folder header */}
      <motion.div
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.99 }}
        transition={SNAP}
        className="gb-sidebar-hoverable"
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 'var(--gb-r-sm)',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ type: 'spring', stiffness: 480, damping: 26 }}
          style={{ display: 'inline-flex', color: 'var(--gb-text-muted)' }}
        >
          <I.chevr size={9} />
        </motion.span>
        <FolderIcon size={12} style={{ color: accent, flexShrink: 0 }} />
        <span style={{
          flex: 1, fontSize: 11.5, fontWeight: 700,
          color: 'var(--gb-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{folder.name}</span>
        <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--gb-text-muted)' }}>{tpls.length}</span>
        <div ref={btnRef} style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
          <IconBtn size="xs" icon={<I.more />} onClick={() => setMenuOpen((v) => !v)} />
          <AnimatePresence>
            {menuOpen && (
              <ActionMenu onClose={() => setMenuOpen(false)} anchorRef={btnRef}>
                <div style={{ padding: '4px 8px 2px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--gb-text-muted)' }}>
                  Color
                </div>
                <div style={{ display: 'flex', gap: 4, padding: '2px 8px 6px' }}>
                  {FOLDER_COLORS.map((c) => {
                    const sel = (folder.color || 'brand') === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => { onColor(folder, c.id); }}
                        style={{
                          width: 16, height: 16, borderRadius: '50%',
                          background: c.color,
                          border: sel ? '2px solid var(--gb-text-primary)' : '1px solid var(--gb-border-default)',
                          cursor: 'pointer', padding: 0, flexShrink: 0,
                        }}
                      />
                    );
                  })}
                </div>
                <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '2px 6px 4px' }} />
                <MenuItem onClick={() => { onRename(folder); setMenuOpen(false); }}>
                  <I.edit size={11} /> Rename
                </MenuItem>
                <MenuItem danger onClick={() => { onDelete(folder); setMenuOpen(false); }}>
                  <I.trash size={11} /> Delete folder
                </MenuItem>
              </ActionMenu>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence initial={false}>
        {open && tpls.length > 0 && (
          <motion.div
            key="children"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={SOFT}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '2px 0 4px 6px' }}>
              {[...grouped.entries()].map(([type, list]) => (
                <TypeSection
                  key={type} type={type} isNote={isNote} tpls={list}
                  trackerById={trackerById}
                  summaryById={summaryById}
                  currentId={currentId} onOpen={onOpen}
                  onMove={(t, fid) => onMove(t.id, fid)}
                  folders={folders.filter((f) => f.id !== folder.id)}
                  onDragStart={onDragStart} onDragEnd={onDragEnd}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Root ───────────────────────────────────────────────────────── */
/* Import one persistent email-template link, preview it, then retain its
   server identity so the local copy remains read-only and removable. */
function ImportTemplatesModal({ onClose, onDone }) {
  const fileInputRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const closingRef = useRef(false);
  const [url, setUrl] = useState('');
  const [share, setShare] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);
  const finishClose = (callback = onClose) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setVisible(false);
    setTimeout(callback, 190);
  };
  const load = async () => {
    if (!url.trim()) return;
    setBusy(true); setError(''); setShare(null);
    try {
      const response = await sendBackgroundMessage('emailTemplateShareGet', { url: url.trim() });
      setShare({ ...response.share, template: normalizeTemplate(response.share?.template, 0) });
    } catch (e) {
      setError(`${e.message}. You can import a JSON template file instead.`);
    }
    finally { setBusy(false); }
  };
  const loadFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true); setError(''); setShare(null);
    try {
      const template = parseEmailTemplateFile(await file.text());
      setShare({ template, transport: 'json' });
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const doImport = async () => {
    if (!share?.template || busy) return;
    setBusy(true);
    try {
      if (share.transport === 'json') {
        await importTemplates([share.template]);
        finishClose(() => onDone(1));
        return;
      }
      if (share.relationship === 'owned') {
        throw new Error('This is your share; open the original template to edit it');
      }
      const imported = await importSharedEmailTemplate(share.template, share);
      try {
        const retained = await sendBackgroundMessage('emailTemplateShareImport', { shareId: share.id });
        if (retained.share?.relationship === 'owned') {
          if (imported.added) await removeImportedEmailTemplate(share.id);
          throw new Error('This is your share; open the original template to edit it');
        }
      } catch (error) {
        if (imported.added) await removeImportedEmailTemplate(share.id);
        throw error;
      }
      finishClose(() => onDone(imported.added, null, imported.alreadyImported));
    } catch (e) { finishClose(() => onDone(0, e.message)); }
  };
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: visible ? 1 : 0 }} transition={SNAP}
      onMouseDown={(e) => { if (e.target === e.currentTarget) finishClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: 'rgba(10,12,8,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={loadFile} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.96, y: visible ? 0 : 10 }}
        transition={SOFT}
        style={{ width: 560, maxWidth: '92vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', boxShadow: 'var(--gb-shadow-modal)', overflow: 'hidden', fontFamily: 'var(--gb-font-sans)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <span style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ImportIcon size={14} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Import shared email template</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>Load a persistent share link or JSON file to review it before importing.</div>
          </div>
          <IconBtn size="sm" icon={<I.close />} onClick={() => finishClose()} />
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 7 }}>
          <Input
            autoFocus
            value={url}
            onChange={setUrl}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Paste shared template link…"
            leading={<I.link />}
            mono
            style={{ flex: 1 }}
          />
          <Btn variant="tinted" size="md" onClick={load} disabled={!url.trim() || busy}>Load link</Btn>
          <IconBtn
            size="md"
            icon={<I.upload />}
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            title="Import JSON file"
            aria-label="Import JSON file"
          />
          </div>
          {share && (
              <div style={{ padding: '11px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-success-tint-soft)', border: '1px solid var(--gb-success-tint-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                  <Tag tone="brand" size="xs">{share.template.type}</Tag>
                  <strong style={{ color: 'var(--gb-text-primary)', fontSize: 12 }}>{share.template.name}</strong>
                  {share.transport === 'json' && <Tag tone="neutral" size="xs">JSON file</Tag>}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginBottom: 5 }}>Subject</div>
                <div style={{ fontSize: 11, color: 'var(--gb-text-secondary)', marginBottom: 9 }}>{share.template.subject || 'No subject'}</div>
                <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginBottom: 5 }}>Body preview</div>
                <div style={{ maxHeight: 180, overflow: 'auto', padding: 9, borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-surface-1)', color: 'var(--gb-text-secondary)', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                  {String(share.template.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'Empty body'}
                </div>
              </div>
          )}
          {error && (
              <div style={{ padding: '9px 11px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-error-tint-soft, var(--gb-warning-tint-soft))', border: '1px solid var(--gb-error-tint-border, var(--gb-warning-tint-border))', fontSize: 11, color: 'var(--gb-error-fg, var(--gb-warning-fg))', lineHeight: 1.5 }}>
                {error}
              </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '11px 14px', borderTop: '1px solid var(--gb-border-subtle)' }}>
          <Btn variant="ghost" size="sm" onClick={() => finishClose()}>Cancel</Btn>
          <Btn variant="primary" size="sm" icon={<ImportIcon />} disabled={!share || busy} state={busy ? 'loading' : 'idle'} onClick={doImport}>
            Import template
          </Btn>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function ShareEmailTemplateModal({ template, onClose }) {
  const [visible, setVisible] = useState(false);
  const closingRef = useRef(false);
  const [share, setShare] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);
  const finishClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setVisible(false);
    setTimeout(onClose, 190);
  };
  useEffect(() => {
    let alive = true;
    sendBackgroundMessage('emailTemplateShareCreate', { template })
      .then(async (response) => {
        if (typeof window.__gbTrackTemplateShare === 'function') {
          await window.__gbTrackTemplateShare(template.id, response.share, template);
        }
        if (alive) setShare(response.share);
      })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [template]);
  const copy = async () => {
    await navigator.clipboard.writeText(share.url);
    window.__gbToast?.success('Template share link copied');
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(buildEmailTemplateFile(template), null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href; a.download = `${String(template.name || 'email-template').replace(/[^a-z0-9_-]+/gi, '-')}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(href), 0);
    if (error) window.__gbToast?.success('Email template downloaded as JSON');
  };
  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: visible ? 1 : 0 }} transition={SNAP} onMouseDown={(e) => { if (e.target === e.currentTarget) finishClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: 'rgba(10,12,8,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.96, y: visible ? 0 : 8 }} transition={SOFT} style={{ width: 520, maxWidth: '92vw', padding: 16, background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', boxShadow: 'var(--gb-shadow-modal)', fontFamily: 'var(--gb-font-sans)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ width: 32, height: 32, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.link size={15} /></span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 750, color: 'var(--gb-text-primary)' }}>Share “{template.name}”</div><div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 3 }}>Anyone with the Golfballs extension can retain a read-only copy. You control the share, and the link remains active until you revoke it.</div></div>
          <IconBtn size="sm" icon={<I.close />} onClick={finishClose} title="Close" />
        </div>
        <div style={{ marginTop: 14 }}>
          {share ? <><div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--gb-text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: .7 }}>Active until you revoke it</div><Input value={share.url} readOnly mono leading={<I.link />} /></> : error ? <Callout tone="warning">The sharing server is unavailable or this installation was revoked. Download the JSON file to share this template without the server.</Callout> : <div style={{ padding: 16, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 11 }}>Generating secure link…</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7, marginTop: 14 }}>
          <Btn variant={error ? 'primary' : 'ghost'} size="sm" icon={<I.download />} onClick={download}>Download JSON</Btn>
          <Btn variant="primary" size="sm" icon={<I.copy />} onClick={copy} disabled={!share}>Copy link</Btn>
        </div>
      </motion.div>
    </motion.div>, document.body,
  );
}

function SubmissionRow({ submission, active, parent, onOpen }) {
  const template = submission.template || {};
  const meta = TYPE_META_TPL[template.type] || TYPE_META_TPL.order;
  const TypeIcon = meta.icon;
  const pending = submission.status !== 'approved';
  return (
    <motion.button
      type="button"
      layout="position"
      onClick={onOpen}
      whileTap={{ scale: 0.985 }}
      className={`gb-sidebar-hoverable${active ? ' is-active' : ''}`}
      style={{
        width: '100%', position: 'relative', display: 'flex', alignItems: 'center',
        gap: 8, padding: '7px 8px 7px 14px', border: 'none',
        borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', textAlign: 'left',
        fontFamily: 'inherit',
        background: active ? 'var(--gb-brand-tint-soft)' : 'transparent',
        boxShadow: active
          ? 'inset 0 0 0 1px var(--gb-brand-tint-border)'
          : 'inset 0 0 0 1px transparent',
      }}
    >
      <span style={{
        position: 'absolute', left: 6, top: 6, bottom: 6, width: 2,
        borderRadius: 2, background: meta.color,
      }} />
      <TypeIcon size={11} style={{ color: active ? 'var(--gb-brand-label)' : meta.color }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11.5, fontWeight: 650,
          color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {template.name || 'Untitled submission'}
        </div>
        <div style={{
          marginTop: 1, fontSize: 9.5, color: 'var(--gb-text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {parent ? `From ${submission.submitter_name || 'Unregistered installation'} · ` : ''}
          Updated {String(submission.updated_at || '').slice(0, 16).replace('T', ' ') || 'just now'}
        </div>
      </div>
      <Tag tone={pending ? 'warning' : 'success'} size="xs">
        {pending ? 'PENDING' : 'APPROVED'}
      </Tag>
    </motion.button>
  );
}

function TemplateSidebar() {
  // No local SettingNotificationHost — the hook below picks up
  // window.__gbNotify (mounted globally by editor-notifications.jsx),
  // so confirm/prompt overlays the whole window, not the sidebar.
  const notify = useSettingNotification();
  const [devSettings] = useDevSettings();
  const capabilities = resolveEmailTemplateCapabilities(devSettings);
  const allowLocalTemplates = capabilities.allowLocalTemplateUsage;
  const canAuthorTemplates = allowLocalTemplates || capabilities.allowParentAccount;
  const canSubmitTemplates = canSubmitEmailTemplate(capabilities);
  const showSubmissions = capabilities.allowParentAccount || canSubmitTemplates;
  const [importOpen,  setImportOpen]  = useState(false);
  const [shareTemplate, setShareTemplate] = useState(null);
  const [tab,         setTab]         = useState('templates');
  const [templates,   setTemplates]   = useState([]);
  const [notes,       setNotes]       = useState([]);
  const [tplFolders,  setTplFolders]  = useState([]);
  const [noteFolders, setNoteFolders] = useState([]);
  const [emailSends,  setEmailSends]  = useState([]);
  const [submissionCache, setSubmissionCache] = useState(null);
  const [catalogSyncError, setCatalogSyncError] = useState('');
  const [search,      setSearch]      = useState('');
  const [currentId,   setCurrentId]   = useState(null);
  const draggingId = useRef(null);
  const [, force] = useState(0);

  useEffect(() => {
    let alive = true;
    const loadAuthoritativeCatalog = async () => {
      // Do not let a valid-looking local revision suppress the open-time
      // server check. If the request is unavailable, retain the cached catalog
      // as an offline fallback and let the notification/alarm path retry.
      const [managedResult] = await Promise.allSettled([
        sendBackgroundMessage('gbSyncManagedEmailTemplates'),
        sendBackgroundMessage('gbSyncEmailTemplateSubmissions'),
      ]);
      if (!alive) return;
      setCatalogSyncError(
        managedResult.status === 'rejected'
          ? (managedResult.reason?.message || 'Managed templates could not be refreshed.')
          : '',
      );
      const d = await loadAll();
      if (!alive) return;
      setTemplates(d.templates || []);
      setNotes(d.noteTemplates || []);
      setTplFolders(d.templateFolders || []);
      setNoteFolders(d.noteFolders || []);
      setEmailSends(d.gbEmailTemplateSends || []);
      setSubmissionCache(d.gbEmailTemplateSubmissions || null);
    };
    const onChange = (changes) => {
      if (changes.templates) {
        setTemplates(changes.templates.newValue || []);
        setCatalogSyncError('');
      }
      if (changes.noteTemplates)   setNotes(changes.noteTemplates.newValue || []);
      if (changes.templateFolders) setTplFolders(changes.templateFolders.newValue || []);
      if (changes.noteFolders)     setNoteFolders(changes.noteFolders.newValue || []);
      if (changes.gbEmailTemplateSends) setEmailSends(changes.gbEmailTemplateSends.newValue || []);
      if (changes.gbEmailTemplateSubmissions) setSubmissionCache(changes.gbEmailTemplateSubmissions.newValue || null);
    };
    chrome.storage.onChanged.addListener(onChange);
    loadAuthoritativeCatalog();
    return () => { alive = false; chrome.storage.onChanged.removeListener(onChange); };
  }, []);

  useEffect(() => {
    const listener = (event) => {
      const template = event.detail || null;
      if (template && emailTemplateIsEditable(template, devSettings)
          && !managedEmailTemplate(template) && ownedTemplateShares(template).length === 0) {
        setShareTemplate(template);
      }
    };
    window.addEventListener('gb:share-email-template', listener);
    return () => window.removeEventListener('gb:share-email-template', listener);
  }, [devSettings]);

  useEffect(() => {
    if (!capabilities.allowLinkImport) setImportOpen(false);
    if (!canAuthorTemplates) setShareTemplate(null);
  }, [capabilities.allowLinkImport, canAuthorTemplates]);

  useEffect(() => {
    if (!showSubmissions && tab === 'submissions') setTab('templates');
  }, [showSubmissions]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSubmissions = tab === 'submissions';
  const isNote = tab === 'notes';
  const usableTemplates = filterLocalEmailTemplates(templates, devSettings);
  const folderTakesRow = !isNote
    && canAuthorTemplates
    && !capabilities.allowCreation;
  const allItems  = isSubmissions ? [] : (isNote ? notes : usableTemplates);
  const folders   = isNote ? noteFolders : (canAuthorTemplates ? tplFolders : []);
  const tplsKey   = isNote ? 'noteTemplates' : 'templates';
  const folderKey = isNote ? 'noteFolders' : 'templateFolders';
  const submissions = useMemo(() => (
    Array.isArray(submissionCache?.submissions)
      ? [...submissionCache.submissions].sort((left, right) => (
        Number(left?.status === 'approved') - Number(right?.status === 'approved')
      ))
      : []
  ), [submissionCache?.submissions]);
  const filteredSubmissions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter((row) => [
      row?.template?.name, row?.submitter_name, row?.status,
    ].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [submissions, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((t) => (t.name || '').toLowerCase().includes(q));
  }, [allItems, search]);

  const trackerById = useMemo(() => new Map(
    buildEmailTemplateTrackerCatalog(usableTemplates).trackers
      .map((tracker) => [tracker.templateId, tracker]),
  ), [usableTemplates]);
  const summaryById = useMemo(() => {
    const result = new Map();
    for (const send of emailSends) {
      if (!send?.templateId) continue;
      const row = result.get(send.templateId) || { sent: 0, responded: 0, ordered: 0 };
      row.sent += 1;
      if (send.respondedAt) row.responded += 1;
      if (send.orderedAt) row.ordered += 1;
      result.set(send.templateId, row);
    }
    return result;
  }, [emailSends]);

  const groups = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, []]));
    const uncat = [];
    for (const t of filtered) {
      const fid = t.folderId;
      if (fid && byId.has(fid)) byId.get(fid).push(t);
      else uncat.push(t);
    }
    return {
      uncat,
      folders: folders.map((f) => ({ folder: f, tpls: byId.get(f.id) || [] })),
    };
  }, [filtered, folders]);

  /* ── Actions — wire to existing editor.js globals ─────────────── */
  function openTpl(t) {
    setCurrentId(t.id);
    const open = isNote ? window.openNoteTemplate : window.openTemplate;
    if (typeof open === 'function') open(t.id);
  }
  function newTpl() {
    if (!isNote && (!capabilities.allowCreation || !canAuthorTemplates)) {
      window.__gbToast?.error('Email template creation is disabled for this installation');
      return;
    }
    const fn = isNote ? window.newNoteTemplate : window.newTemplate;
    if (typeof fn === 'function') fn();
  }
  function newSubmission() {
    window.newEmailTemplateSubmission?.();
  }
  function openSubmission(row) {
    setCurrentId(row.id);
    window.openEmailTemplateSubmission?.(row.id);
  }
  async function newFolder() {
    const name = await notify.prompt('Name the new folder', {
      placeholder: 'e.g. Outreach',
      confirmLabel: 'Create',
    });
    if (!name) return;
    const next = [...folders, { id: 'f_' + Date.now().toString(36), name: name.trim() }];
    (isNote ? setNoteFolders : setTplFolders)(next);
    saveKey(folderKey, next);
    window.__gbToast?.success(`Folder "${name.trim()}" created`);
  }
  async function renameFolder(folder) {
    const name = await notify.prompt('Rename folder', {
      defaultValue: folder.name,
      confirmLabel: 'Rename',
    });
    if (!name) return;
    const next = folders.map((f) => (f.id === folder.id ? { ...f, name: name.trim() } : f));
    (isNote ? setNoteFolders : setTplFolders)(next);
    saveKey(folderKey, next);
    window.__gbToast?.success(`Folder renamed`);
  }
  function setFolderColor(folder, colorId) {
    const next = folders.map((f) => (f.id === folder.id ? { ...f, color: colorId } : f));
    (isNote ? setNoteFolders : setTplFolders)(next);
    saveKey(folderKey, next);
  }
  async function deleteFolder(folder) {
    const ok = await notify.confirm(
      `Delete "${folder.name}"? Templates inside move to Uncategorized.`,
      { tone: 'danger', confirmLabel: 'Delete' },
    );
    if (!ok) return;
    const nextFolders = folders.filter((f) => f.id !== folder.id);
    const nextTpls = allItems.map((t) => (t.folderId === folder.id ? { ...t, folderId: undefined } : t));
    (isNote ? setNoteFolders : setTplFolders)(nextFolders);
    (isNote ? setNotes : setTemplates)(nextTpls);
    saveKey(folderKey, nextFolders);
    saveKey(tplsKey, nextTpls);
    window.__gbToast?.success(`Folder "${folder.name}" deleted`);
  }
  /** Move by id (used by both the row menu and drop handlers). */
  function moveById(id, folderId) {
    const next = allItems.map((t) => (t.id === id ? { ...t, folderId: folderId || undefined } : t));
    (isNote ? setNotes : setTemplates)(next);
    saveKey(tplsKey, next);
  }
  function openSignature() {
    if (typeof window.__gbOpenSignature === 'function') window.__gbOpenSignature();
    else if (typeof window.openSignatureEditor === 'function') window.openSignatureEditor();
  }
  function openSettings() {
    if (typeof window.openSettings === 'function') window.openSettings();
    else document.getElementById('btn-settings')?.click();
  }
  function openGuide() {
    try {
      chrome.runtime.sendMessage({ action: 'openGuide' }, () => {
        if (chrome.runtime.lastError) window.open(chrome.runtime.getURL('guide.html'));
      });
    } catch {
      window.open('guide.html');
    }
  }

  /* Drop on the bottom Uncategorized region → clear folderId. */
  const [uncatHot, setUncatHot] = useState(false);
  function uncatDragOver(e) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!uncatHot) setUncatHot(true);
  }
  function uncatDragLeave(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setUncatHot(false);
  }
  function uncatDrop(e) {
    const id = e.dataTransfer.getData(DRAG_MIME);
    setUncatHot(false);
    if (!id) return;
    e.preventDefault();
    moveById(id, null);
  }

  // Sync selection from legacy editor.js' globals so the active row
  // tracks both directions: pick up when editor.js opens something, AND
  // clear when it goes back to the empty state (delete, type-switch
  // bucket flip, etc). The earlier `if (id)` guard left the row stuck
  // active forever once anything was selected.
  useEffect(() => {
    const i = setInterval(() => {
      const id = isSubmissions
        ? window.currentSubmissionId
        : (isNote ? window.currentNoteId : window.currentId);
      const next = id || null;
      if (next !== currentId) setCurrentId(next);
    }, 300);
    return () => clearInterval(i);
  }, [currentId, isNote, isSubmissions]);

  const uncatGroups = groupByType(groups.uncat, isNote);
  const hasFolders  = folders.length > 0;
  const hasUncat    = groups.uncat.length > 0;

  return (
    <div style={{
      // flex: 1 + minHeight: 0 is the correct sizing for a child of a
      // flex-column parent. `height: 100%` worked when the parent was
      // #sidebar-react directly, but the SettingNotificationHost wrapper
      // is also flex-column — height: 100% on a flex-column child can
      // collapse the list area to zero because flex sizing took over.
      display: 'flex', flexDirection: 'column',
      flex: 1, minHeight: 0,
      background: 'var(--gb-surface-canvas)',
      fontFamily: 'var(--gb-font-sans)',
      color: 'var(--gb-text-secondary)',
    }}>

      {/* Brand header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 12px 10px', borderBottom: '1px solid var(--gb-border-subtle)',
        flexShrink: 0,
      }}>
        <div>
          <SectionLabel divider={false} style={{ marginBottom: 0 }}>Golfballs · Templates</SectionLabel>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -0.2, marginTop: 2 }}>
            Manager
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <IconBtn size="sm" icon={<HelpIcon />} title="Operator's Guide" onClick={openGuide} />
          <IconBtn size="sm" icon={<CogIcon />} onClick={openSettings} />
        </div>
      </div>

      {importOpen && capabilities.allowLinkImport && (
        <ImportTemplatesModal
          onClose={() => setImportOpen(false)}
          onDone={(n, err, alreadyImported = false) => {
            setImportOpen(false);
            if (err) notify.notify('Import failed — ' + err, { tone: 'warning' });
            else if (alreadyImported) notify.notify('This shared template is already imported.');
            else notify.notify(`Imported ${n} template${n === 1 ? '' : 's'}.`);
          }}
        />
      )}
      <AnimatePresence>
        {shareTemplate && <ShareEmailTemplateModal key={shareTemplate.id} template={shareTemplate} onClose={() => setShareTemplate(null)} />}
      </AnimatePresence>

      {/* Controls: tabs + search + new template + new folder */}
      <div style={{ padding: '10px 10px 8px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        <Segmented
          value={isSubmissions ? '' : tab}
          onChange={setTab}
          full
          options={[
            { id: 'templates', label: `Templates · ${usableTemplates.length}` },
            { id: 'notes',     label: `Notes · ${notes.length}` },
          ]}
        />
        {showSubmissions && (
          <Btn
            variant={isSubmissions ? 'tinted' : 'secondary'}
            size="sm" full icon={<I.clock />}
            badge={submissionCache?.pendingCount || 0}
            badgeTone="warning"
            onClick={() => setTab('submissions')}
          >
            {capabilities.allowParentAccount ? 'Submissions' : 'My submissions'}
          </Btn>
        )}
        <Input
          size="sm" value={search} onChange={setSearch}
          placeholder={isSubmissions ? 'Search submissions…' : 'Search…'}
          leading={<I.search />}
        />
        {/* Folder stays compact beside a creation action. When managed email
            creation is off, it glides into the released width and gains a
            label so the row still reads as one intentional primary action. */}
        {!isSubmissions && <div style={{ display: 'flex', gap: 6 }}>
          <CapabilitySlot
            visible={isNote || (capabilities.allowCreation && canAuthorTemplates)}
            grow
            slotKey={isNote ? 'new-note' : 'new-email-template'}
          >
            <Btn variant="dashed" size="sm" icon={<I.plus />} onClick={newTpl}
                 style={{ flex: 1, minWidth: 0 }}>
              {isNote ? 'Note' : 'Template'}
            </Btn>
          </CapabilitySlot>
          <CapabilitySlot
            visible={isNote || canAuthorTemplates}
            grow={folderTakesRow}
            slotKey={folderTakesRow ? 'new-template-folder-wide' : 'new-template-folder-icon'}
          >
            <Btn
              variant="dashed" size="sm"
              icon={<FolderIcon />}
              onClick={newFolder}
              title="New folder"
              style={{
                flex: folderTakesRow ? 1 : undefined,
                minWidth: 0,
                flexShrink: 0,
                padding: folderTakesRow ? undefined : '0 9px',
              }}
            >
              {folderTakesRow ? 'Folder' : null}
            </Btn>
          </CapabilitySlot>
        </div>}
        {isSubmissions && canSubmitTemplates && (
          <Btn variant="dashed" size="sm" full icon={<I.send />} onClick={newSubmission}>
            Submit template
          </Btn>
        )}
      </div>

      {/* Folder + uncategorized list — wrapped in a LayoutGroup so every
          row's `layoutId` resolves against the same shared layout context,
          letting rows spring between folder/type sections cleanly. */}
      <div className="gb-thin-scroll" style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
        padding: '4px 8px 12px',
      }}>
        <LayoutGroup id="sidebar-list">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            // Each tab consistently animates from its own side: Templates
            // (left tab) slides to / from the left, Notes (right tab) from
            // the right. The outgoing element keeps the tab value it was
            // rendered with — so click Notes and Templates exits LEFT,
            // Notes enters from the RIGHT (both moving left-to-right).
            initial={{ opacity: 0, x: tab === 'templates' ? -18 : 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: tab === 'templates' ? -18 : 18 }}
            transition={SOFT}
          >
            {isSubmissions && filteredSubmissions.map((row) => (
              <SubmissionRow
                key={row.id}
                submission={row}
                active={currentId === row.id}
                parent={capabilities.allowParentAccount}
                onOpen={() => openSubmission(row)}
              />
            ))}
            {isSubmissions && submissions.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 11, color: 'var(--gb-text-muted)' }}>
                {capabilities.allowParentAccount
                  ? 'No template submissions yet.'
                  : 'Submit an email template for parent approval.'}
              </div>
            )}
            {isSubmissions && submissions.length > 0 && filteredSubmissions.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: 'var(--gb-text-muted)' }}>
                No matching submissions.
              </div>
            )}
            {/* Folders first */}
            {!isSubmissions && groups.folders.map(({ folder, tpls }) => (
              <FolderGroup
                key={folder.id}
                folder={folder} tpls={tpls} isNote={isNote} currentId={currentId}
                trackerById={trackerById}
                summaryById={summaryById}
                onOpen={openTpl} onMove={moveById}
                onRename={renameFolder} onDelete={deleteFolder} onColor={setFolderColor}
                folders={folders}
                defaultOpen={tpls.some((t) => t.id === currentId)}
                onDragStart={(id) => (draggingId.current = id)}
                onDragEnd={() => (draggingId.current = null)}
              />
            ))}

            {/* Uncategorized flows flat at the bottom — no folder wrapper.
                The whole block is itself a drop target. */}
            {!isSubmissions && (hasUncat || !hasFolders) && (
              <motion.div
                onDragOver={uncatDragOver}
                onDragLeave={uncatDragLeave}
                onDrop={uncatDrop}
                animate={{
                  background: uncatHot ? 'var(--gb-brand-tint-soft)' : 'transparent',
                  boxShadow: uncatHot ? 'inset 0 0 0 1px var(--gb-brand-tint-border)' : 'none',
                }}
                transition={T.base}
                style={{
                  marginTop: hasFolders ? 12 : 0,
                  paddingTop: hasFolders ? 8 : 0,
                  borderTop: hasFolders ? '1px solid var(--gb-border-subtle)' : 'none',
                  borderRadius: 'var(--gb-r-md)',
                }}
              >
                {hasFolders && (
                  <div style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
                    textTransform: 'uppercase', color: 'var(--gb-text-muted)',
                    padding: '4px 10px 6px',
                  }}>
                    Uncategorized
                  </div>
                )}
                {[...uncatGroups.entries()].map(([type, list]) => (
                  <TypeSection
                    key={type} type={type} isNote={isNote} tpls={list}
                    trackerById={trackerById}
                    summaryById={summaryById}
                    currentId={currentId} onOpen={openTpl}
                    onMove={(t, fid) => moveById(t.id, fid)}
                    folders={folders}
                    onDragStart={(id) => (draggingId.current = id)}
                    onDragEnd={() => (draggingId.current = null)}
                  />
                ))}
                {!hasUncat && hasFolders && (
                  <div style={{
                    padding: 10, fontSize: 10.5, color: 'var(--gb-text-muted)',
                    textAlign: 'center', fontStyle: 'italic',
                  }}>
                    Drop a {isNote ? 'note' : 'template'} here to un-file it
                  </div>
                )}
              </motion.div>
            )}

            {!isSubmissions && !isNote && allItems.length === 0 && catalogSyncError && (
              <div style={{
                margin: '8px 4px', padding: 12, borderRadius: 9,
                background: 'var(--gb-warning-tint-soft)',
                border: '1px solid var(--gb-warning-tint-border)',
                color: 'var(--gb-warning-fg)', fontSize: 10.5, lineHeight: 1.45,
              }}>
                Managed templates could not be refreshed. The cached catalog is shown; reopen the manager to retry.
              </div>
            )}
            {!isSubmissions && allItems.length === 0 && (!catalogSyncError || isNote) && (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 11, color: 'var(--gb-text-muted)' }}>
                No {isNote ? 'notes' : 'templates'} yet.
              </div>
            )}
            {!isSubmissions && allItems.length > 0 && filtered.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: 'var(--gb-text-muted)' }}>
                No matches for "{search}"
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        </LayoutGroup>
      </div>

      {/* Pinned footer — signature + persistent-share import */}
      <div style={{
        padding: 10, borderTop: '1px solid var(--gb-border-subtle)', flexShrink: 0,
        background: 'var(--gb-surface-canvas)', display: 'flex', gap: 6,
      }}>
        <Btn variant="ghost" size="sm" icon={<PenIcon />} onClick={openSignature} style={{ flex: 1, minWidth: 0 }}>
          Email signature
        </Btn>
        <CapabilitySlot
          visible={capabilities.allowLinkImport}
          slotKey="email-template-link-import"
        >
          <Btn variant="ghost" size="sm" icon={<ImportIcon />} onClick={() => setImportOpen(true)}
            title="Import a shared template link" style={{ flexShrink: 0, padding: '0 9px' }} />
        </CapabilitySlot>
      </div>
    </div>
  );
}

/* ── Mount ──────────────────────────────────────────────────────── */
function mount() {
  const host = document.getElementById('sidebar-react');
  if (!host || host.__gbSidebarMounted) return;
  host.__gbSidebarMounted = true;
  ensureTheme();
  createRoot(host).render(<TemplateSidebar />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
