import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import {
  Btn, IconBtn, Tag, Dot, Input, Segmented, I, Icon, T,
} from '../ui/index.js';

/* ────────────────────────────────────────────────────────────────
   editor-sidebar.jsx
   Mounts into #sidebar-react (an empty div inserted next to the legacy
   sidebar markup). Owns the full sidebar visual: tabs, search, folders,
   template rows, signature button.

   Legacy editor.js stays the source of truth for actions — clicking a
   row calls window.openTemplate(id), New calls window.newTemplate(), etc.
   The sidebar subscribes to chrome.storage.onChanged so any CRUD done
   elsewhere immediately reflects here.
──────────────────────────────────────────────────────────────── */

/* ── Per-template icons ─────────────────────────────────────────── */
const TYPE_ICON = {
  order:   (p) => <Icon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></Icon>,
  account: (p) => <Icon {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></Icon>,
  case:    (p) => <Icon {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></Icon>,
  note:    (p) => <Icon {...p}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></Icon>,
};
const FolderIcon = (p) => <Icon {...p}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></Icon>;
const PenIcon    = (p) => <Icon {...p}><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></Icon>;
const CogIcon    = (p) => <Icon {...p}><path d="M10.3 4.3c.4-1.7 2.9-1.7 3.3 0a1.7 1.7 0 002.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 001 2.5c1.8.5 1.8 3 0 3.4a1.7 1.7 0 00-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 00-2.6 1c-.4 1.8-2.9 1.8-3.3 0a1.7 1.7 0 00-2.6-1c-1.5.9-3.3-.8-2.4-2.4a1.7 1.7 0 00-1-2.6c-1.8-.4-1.8-2.9 0-3.4a1.7 1.7 0 001-2.5c-.9-1.6.9-3.3 2.4-2.4 1 .6 2.3.1 2.6-1.1z"/><circle cx="12" cy="12" r="3"/></Icon>;

/* ── Storage helpers ────────────────────────────────────────────── */
const STORAGE_KEYS = ['templates', 'noteTemplates', 'templateFolders', 'noteFolders'];
function loadAll() {
  return new Promise((res) => chrome.storage.local.get(STORAGE_KEYS, res));
}
function saveFolders(key, folders) {
  chrome.storage.local.set({ [key]: folders });
}
function saveTpls(key, tpls) {
  chrome.storage.local.set({ [key]: tpls });
}

/* ── Tiny popover for the per-folder / per-row action menu ──────── */
function ActionMenu({ open, onClose, anchorRef, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target) && !anchorRef.current?.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose, anchorRef]);
  if (!open) return null;
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      transition={T.base}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 60,
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
      onClick={onClick}
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

/* ── Single template row ────────────────────────────────────────── */
function TemplateRow({ tpl, isNote, active, onClick, onMove, folders }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef(null);
  const TypeIcon = isNote ? TYPE_ICON.note : (TYPE_ICON[tpl.type] || TYPE_ICON.order);
  const disabled = tpl.enabled === false;

  return (
    <motion.div
      onClick={onClick}
      whileHover={{ background: 'var(--gb-fill-soft)' }}
      animate={{ background: active ? 'var(--gb-brand-tint-soft)' : 'transparent' }}
      transition={T.base}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px 6px 22px',
        borderRadius: 'var(--gb-r-sm)',
        border: '1px solid ' + (active ? 'var(--gb-brand-tint-border)' : 'transparent'),
        cursor: 'pointer', userSelect: 'none',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <TypeIcon size={11} style={{ color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11.5, fontWeight: 600,
          color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{tpl.name || 'Untitled'}</div>
        {!isNote && (
          <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>
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
            <ActionMenu open onClose={() => setMenuOpen(false)} anchorRef={btnRef}>
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

/* ── Collapsible folder row + its children ──────────────────────── */
function FolderGroup({ folder, tpls, isNote, currentId, onOpen, onMove, onRename, onDelete, folders, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef(null);
  const isUncategorized = folder.id === '__uncat';

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Folder header */}
      <motion.div
        onClick={() => setOpen((v) => !v)}
        whileHover={isUncategorized ? undefined : { background: 'var(--gb-fill-soft)' }}
        transition={T.base}
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 'var(--gb-r-sm)',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={T.base}
          style={{ display: 'inline-flex', color: 'var(--gb-text-muted)' }}
        >
          <I.chevr size={9} />
        </motion.span>
        <FolderIcon size={11} style={{ color: isUncategorized ? 'var(--gb-text-muted)' : 'var(--gb-brand-label)', flexShrink: 0 }} />
        <span style={{
          flex: 1, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
          textTransform: 'uppercase',
          color: 'var(--gb-text-tertiary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{folder.name}</span>
        <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--gb-text-muted)' }}>{tpls.length}</span>
        {!isUncategorized && (
          <div ref={btnRef} style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <IconBtn size="xs" icon={<I.more />} onClick={() => setMenuOpen((v) => !v)} />
            <AnimatePresence>
              {menuOpen && (
                <ActionMenu open onClose={() => setMenuOpen(false)} anchorRef={btnRef}>
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
        )}
      </motion.div>

      {/* Children — spring-animated height collapse */}
      <AnimatePresence initial={false}>
        {open && tpls.length > 0 && (
          <motion.div
            key="children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingTop: 2 }}>
              {tpls.map((t) => (
                <TemplateRow
                  key={t.id}
                  tpl={t} isNote={isNote}
                  active={t.id === currentId}
                  onClick={() => onOpen(t)}
                  onMove={(fid) => onMove(t, fid)}
                  folders={folders.filter((f) => f.id !== folder.id)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Root ───────────────────────────────────────────────────────── */
function TemplateSidebar() {
  const [tab,           setTab]           = useState('templates');
  const [templates,     setTemplates]     = useState([]);
  const [notes,         setNotes]         = useState([]);
  const [tplFolders,    setTplFolders]    = useState([]);
  const [noteFolders,   setNoteFolders]   = useState([]);
  const [search,        setSearch]        = useState('');
  const [currentId,     setCurrentId]     = useState(null);

  // Load from storage + subscribe to changes so legacy CRUD reflects here.
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
  const allItems = isNote ? notes : templates;
  const folders  = isNote ? noteFolders : tplFolders;
  const tplsKey  = isNote ? 'noteTemplates' : 'templates';
  const folderKey = isNote ? 'noteFolders' : 'templateFolders';

  // Filter by search (name match).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((t) => (t.name || '').toLowerCase().includes(q));
  }, [allItems, search]);

  // Group by folderId. Templates with no folderId → Uncategorized.
  const groups = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, []]));
    const uncat = [];
    for (const t of filtered) {
      const fid = t.folderId;
      if (fid && byId.has(fid)) byId.get(fid).push(t);
      else uncat.push(t);
    }
    return { uncat, folders: folders.map((f) => ({ folder: f, tpls: byId.get(f.id) || [] })) };
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
  function newFolder() {
    const name = window.prompt('Folder name:');
    if (!name) return;
    const next = [...folders, { id: 'f_' + Date.now().toString(36), name: name.trim() }];
    (isNote ? setNoteFolders : setTplFolders)(next);
    saveFolders(folderKey, next);
  }
  function renameFolder(folder) {
    const name = window.prompt('Rename folder:', folder.name);
    if (!name) return;
    const next = folders.map((f) => (f.id === folder.id ? { ...f, name: name.trim() } : f));
    (isNote ? setNoteFolders : setTplFolders)(next);
    saveFolders(folderKey, next);
  }
  function deleteFolder(folder) {
    if (!window.confirm(`Delete folder "${folder.name}"? Templates inside move to Uncategorized.`)) return;
    const nextFolders = folders.filter((f) => f.id !== folder.id);
    const nextTpls = allItems.map((t) => (t.folderId === folder.id ? { ...t, folderId: undefined } : t));
    (isNote ? setNoteFolders : setTplFolders)(nextFolders);
    (isNote ? setNotes : setTemplates)(nextTpls);
    saveFolders(folderKey, nextFolders);
    saveTpls(tplsKey, nextTpls);
  }
  function moveTpl(tpl, folderId) {
    const next = allItems.map((t) => (t.id === tpl.id ? { ...t, folderId: folderId || undefined } : t));
    (isNote ? setNotes : setTemplates)(next);
    saveTpls(tplsKey, next);
  }
  function openSignature() {
    if (typeof window.__gbOpenSignature === 'function') window.__gbOpenSignature();
    else if (typeof window.openSignatureEditor === 'function') window.openSignatureEditor();
  }
  function openSettings() {
    if (typeof window.openSettings === 'function') window.openSettings();
    else document.getElementById('btn-settings')?.click();
  }

  // Track active selection from the legacy global so highlight syncs.
  useEffect(() => {
    const i = setInterval(() => {
      const id = window.currentId || window.currentNoteId || null;
      if (id !== currentId) setCurrentId(id);
    }, 300);
    return () => clearInterval(i);
  }, [currentId]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--gb-surface-base)',
      fontFamily: 'var(--gb-font-sans)',
      color: 'var(--gb-text-secondary)',
    }}>

      {/* ── Brand header ─────────────────────────────────────────── */}
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

      {/* ── Controls: tabs + search + new ────────────────────────── */}
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
        <Input
          size="sm"
          value={search}
          onChange={setSearch}
          placeholder="Search…"
          leading={<I.search />}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn variant="dashed" size="sm" icon={<I.plus />} full onClick={newTpl}>
            New {isNote ? 'note' : 'template'}
          </Btn>
          <Btn variant="ghost" size="sm" icon={<FolderIcon />} onClick={newFolder} title="New folder" />
        </div>
      </div>

      {/* ── Folder/template list ─────────────────────────────────── */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
        padding: '4px 8px 12px',
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={T.base}
          >
            {/* Uncategorized — always visible if it has content (or no folders exist) */}
            {(groups.uncat.length > 0 || folders.length === 0) && (
              <FolderGroup
                folder={{ id: '__uncat', name: 'Uncategorized' }}
                tpls={groups.uncat}
                isNote={isNote}
                currentId={currentId}
                onOpen={openTpl}
                onMove={moveTpl}
                onRename={() => {}}
                onDelete={() => {}}
                folders={folders}
                defaultOpen
              />
            )}
            {groups.folders.map(({ folder, tpls }) => (
              <FolderGroup
                key={folder.id}
                folder={folder} tpls={tpls} isNote={isNote} currentId={currentId}
                onOpen={openTpl} onMove={moveTpl}
                onRename={renameFolder} onDelete={deleteFolder}
                folders={folders}
                defaultOpen={tpls.some((t) => t.id === currentId)}
              />
            ))}
            {allItems.length === 0 && (
              <div style={{
                padding: 24, textAlign: 'center', fontSize: 11, color: 'var(--gb-text-muted)',
              }}>
                No {isNote ? 'notes' : 'templates'} yet.
              </div>
            )}
            {allItems.length > 0 && filtered.length === 0 && (
              <div style={{
                padding: 16, textAlign: 'center', fontSize: 11, color: 'var(--gb-text-muted)',
              }}>
                No matches for "{search}"
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Pinned signature button ──────────────────────────────── */}
      <div style={{
        padding: 10, borderTop: '1px solid var(--gb-border-subtle)', flexShrink: 0,
        background: 'var(--gb-surface-base)',
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
  // Flag for legacy editor.js so it knows it doesn't own the sidebar.
  window.__gbReactSidebar = true;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
