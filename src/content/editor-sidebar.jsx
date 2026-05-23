import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import {
  Btn, IconBtn, Tag, Input, Segmented, I, Icon, T,
  useSettingNotification,
} from '../ui/index.js';

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
const TYPE_META_TPL = {
  order:   { label: 'Order',   color: 'var(--gb-brand-label)',
             icon: (p) => <Icon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></Icon> },
  account: { label: 'Account', color: 'var(--gb-info-fg)',
             icon: (p) => <Icon {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></Icon> },
  case:    { label: 'Case',    color: 'var(--gb-warning-fg)',
             icon: (p) => <Icon {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></Icon> },
};
const TYPE_META_NOTE = {
  note:     { label: 'Note',     color: 'var(--gb-text-tertiary)',
              icon: (p) => <Icon {...p}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></Icon> },
  task:     { label: 'Task',     color: 'var(--gb-brand-label)',
              icon: (p) => <Icon {...p}><polyline points="20 6 9 17 4 12"/></Icon> },
  call_log: { label: 'Call log', color: 'var(--gb-info-fg)',
              icon: (p) => <Icon {...p}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></Icon> },
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
const PenIcon    = (p) => <Icon {...p}><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></Icon>;
const CogIcon    = (p) => <Icon {...p}><path d="M10.3 4.3c.4-1.7 2.9-1.7 3.3 0a1.7 1.7 0 002.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 001 2.5c1.8.5 1.8 3 0 3.4a1.7 1.7 0 00-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 00-2.6 1c-.4 1.8-2.9 1.8-3.3 0a1.7 1.7 0 00-2.6-1c-1.5.9-3.3-.8-2.4-2.4a1.7 1.7 0 00-1-2.6c-1.8-.4-1.8-2.9 0-3.4a1.7 1.7 0 001-2.5c-.9-1.6.9-3.3 2.4-2.4 1 .6 2.3.1 2.6-1.1z"/><circle cx="12" cy="12" r="3"/></Icon>;

/* ── Storage helpers ────────────────────────────────────────────── */
const STORAGE_KEYS = ['templates', 'noteTemplates', 'templateFolders', 'noteFolders'];
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

/* Tab-aware "what type is this row?" */
function rowType(t, isNote) {
  if (isNote) return t.subType || 'note';
  const x = t.type || 'order';
  return x === 'email' ? 'order' : x;
}

/* ── Tiny popover for the per-folder / per-row action menu ──────── */
function ActionMenu({ onClose, anchorRef, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => {
      if (!ref.current?.contains(e.target) && !anchorRef.current?.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose, anchorRef]);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      transition={T.base}
      onClick={(e) => e.stopPropagation()}
      style={{
        // Sits above motion's layout-animated rows (layoutId can elevate
        // their stacking). 2147483400 is below the global notification
        // host (2147483600) so a confirm still wins over a kebab menu.
        position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 2147483400,
        minWidth: 150,
        background: 'var(--gb-surface-modal)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-md)',
        boxShadow: 'var(--gb-shadow-popover)',
        padding: 4,
      }}
    >
      {children}
    </motion.div>
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
function TemplateRow({ tpl, isNote, type, active, onClick, onMove, folders, onDragStart, onDragEnd }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef(null);
  const meta = (isNote ? TYPE_META_NOTE : TYPE_META_TPL)[type] || (isNote ? TYPE_META_NOTE.note : TYPE_META_TPL.order);
  const TypeIcon = meta.icon;
  const disabled = tpl.enabled === false;

  return (
    <motion.div
      // layoutId makes the row a SHARED element across folder / type-
      // section parents — when its grouping changes (type change, folder
      // move, enable/disable bucket flip) motion springs it from the old
      // position to the new instead of cross-fading.
      layoutId={`tpl-${tpl.id}`}
      layout="position"
      transition={LAYOUT_SPRING}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, tpl.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(tpl.id);
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={onClick}
      whileHover={{ background: 'var(--gb-fill-soft)' }}
      whileTap={{ scale: 0.985 }}
      animate={{
        background: active ? 'var(--gb-brand-tint-soft)' : (disabled ? 'var(--gb-surface-deep)' : 'transparent'),
        boxShadow: active ? 'inset 0 0 0 1px var(--gb-brand-tint-border)' : 'inset 0 0 0 1px transparent',
      }}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px 6px 14px',
        borderRadius: 'var(--gb-r-sm)',
        cursor: 'grab', userSelect: 'none',
      }}
    >
      {/* Type stripe — inset rounded bar, never a full border. Stays put
          when the row goes active. */}
      <span style={{
        position: 'absolute',
        left: 4, top: 6, bottom: 6,
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
        {!isNote && (
          <div style={{ fontSize: 9.5, color: disabled ? 'var(--gb-text-ghost)' : 'var(--gb-text-muted)', marginTop: 1 }}>
            {(tpl.rules || []).length} rule{(tpl.rules || []).length !== 1 ? 's' : ''} ·{' '}
            {Object.keys(tpl.vars || {}).length} var{Object.keys(tpl.vars || {}).length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
      {disabled && <Tag tone="neutral" size="xs">OFF</Tag>}
      <div ref={btnRef} style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <IconBtn size="xs" icon={<I.more />} onClick={() => setMenuOpen((v) => !v)} />
        <AnimatePresence>
          {menuOpen && (
            <ActionMenu onClose={() => setMenuOpen(false)} anchorRef={btnRef}>
              <div style={{ padding: '4px 8px 2px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--gb-text-muted)' }}>
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
            </ActionMenu>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ── Per-type sub-section (Order / Account / Case ...). Enabled rows
      first, then disabled rows below. */
function TypeSection({ type, isNote, tpls, currentId, onOpen, onMove, folders, onDragStart, onDragEnd }) {
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
            key={t.id} tpl={t} isNote={isNote} type={type}
            active={t.id === currentId}
            onClick={() => onOpen(t)} onMove={(fid) => onMove(t, fid)}
            folders={folders} onDragStart={onDragStart} onDragEnd={onDragEnd}
          />
        ))}
        {disabled.map((t) => (
          <TemplateRow
            key={t.id} tpl={t} isNote={isNote} type={type}
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
function FolderGroup({ folder, tpls, isNote, currentId, onOpen, onMove, onRename, onDelete, onColor, folders, defaultOpen, onDragStart, onDragEnd }) {
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
        whileHover={{ background: 'var(--gb-fill-soft)' }}
        whileTap={{ scale: 0.99 }}
        transition={SNAP}
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
                        title={c.id}
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
function TemplateSidebar() {
  // No local SettingNotificationHost — the hook below picks up
  // window.__gbNotify (mounted globally by editor-notifications.jsx),
  // so confirm/prompt overlays the whole window, not the sidebar.
  const notify = useSettingNotification();
  const [tab,         setTab]         = useState('templates');
  const [templates,   setTemplates]   = useState([]);
  const [notes,       setNotes]       = useState([]);
  const [tplFolders,  setTplFolders]  = useState([]);
  const [noteFolders, setNoteFolders] = useState([]);
  const [search,      setSearch]      = useState('');
  const [currentId,   setCurrentId]   = useState(null);
  const draggingId = useRef(null);
  const [, force] = useState(0);

  useEffect(() => {
    let alive = true;
    loadAll().then((d) => {
      if (!alive) return;
      setTemplates(d.templates || []);
      setNotes(d.noteTemplates || []);
      setTplFolders(d.templateFolders || []);
      setNoteFolders(d.noteFolders || []);
    });
    const onChange = (changes) => {
      if (changes.templates)       setTemplates(changes.templates.newValue || []);
      if (changes.noteTemplates)   setNotes(changes.noteTemplates.newValue || []);
      if (changes.templateFolders) setTplFolders(changes.templateFolders.newValue || []);
      if (changes.noteFolders)     setNoteFolders(changes.noteFolders.newValue || []);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => { alive = false; chrome.storage.onChanged.removeListener(onChange); };
  }, []);

  const isNote = tab === 'notes';
  const allItems  = isNote ? notes : templates;
  const folders   = isNote ? noteFolders : tplFolders;
  const tplsKey   = isNote ? 'noteTemplates' : 'templates';
  const folderKey = isNote ? 'noteFolders' : 'templateFolders';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((t) => (t.name || '').toLowerCase().includes(q));
  }, [allItems, search]);

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
    const fn = isNote ? window.newNoteTemplate : window.newTemplate;
    if (typeof fn === 'function') fn();
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

  // Sync selection from legacy editor.js' globals so the active row tracks.
  useEffect(() => {
    const i = setInterval(() => {
      const id = isNote ? window.currentNoteId : window.currentId;
      if (id && id !== currentId) setCurrentId(id);
    }, 300);
    return () => clearInterval(i);
  }, [currentId, isNote]);

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
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>
            Golfballs · Templates
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -0.2, marginTop: 2 }}>
            Manager
          </div>
        </div>
        <IconBtn size="sm" icon={<CogIcon />} onClick={openSettings} title="Settings" />
      </div>

      {/* Controls: tabs + search + new template + new folder */}
      <div style={{ padding: '10px 10px 8px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          full
          options={[
            { id: 'templates', label: `Templates · ${templates.length}` },
            { id: 'notes',     label: `Notes · ${notes.length}` },
          ]}
        />
        <Input size="sm" value={search} onChange={setSearch} placeholder="Search…" leading={<I.search />} />
        {/* Both buttons share the row equally via flex:1. `full` would set
            each to 100% width → overflow + clipping in a 240–280px sidebar. */}
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn variant="dashed" size="sm" icon={<I.plus />} onClick={newTpl}
               style={{ flex: 1, minWidth: 0 }}>
            {isNote ? 'Note' : 'Template'}
          </Btn>
          <Btn variant="dashed" size="sm" icon={<FolderIcon />} onClick={newFolder}
               style={{ flex: 1, minWidth: 0 }}>
            Folder
          </Btn>
        </div>
      </div>

      {/* Folder + uncategorized list — wrapped in a LayoutGroup so every
          row's `layoutId` resolves against the same shared layout context,
          letting rows spring between folder/type sections cleanly. */}
      <div style={{
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
            {/* Folders first */}
            {groups.folders.map(({ folder, tpls }) => (
              <FolderGroup
                key={folder.id}
                folder={folder} tpls={tpls} isNote={isNote} currentId={currentId}
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
            {(hasUncat || !hasFolders) && (
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

            {allItems.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 11, color: 'var(--gb-text-muted)' }}>
                No {isNote ? 'notes' : 'templates'} yet.
              </div>
            )}
            {allItems.length > 0 && filtered.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: 'var(--gb-text-muted)' }}>
                No matches for "{search}"
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        </LayoutGroup>
      </div>

      {/* Pinned signature button */}
      <div style={{
        padding: 10, borderTop: '1px solid var(--gb-border-subtle)', flexShrink: 0,
        background: 'var(--gb-surface-canvas)',
      }}>
        <Btn variant="ghost" size="sm" icon={<PenIcon />} full onClick={openSignature}>
          Email signature
        </Btn>
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
  window.__gbReactSidebar = true;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
