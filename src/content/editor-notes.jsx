import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { NoteEditor, EmptyState } from '../pages/NoteEditor.jsx';

/* ─────────────────────────────────────────────────────────────
   editor-notes — content-script entry for the NoteEditor page.
   Mounts into #ed-note-form. Same shape as editor-templates.
───────────────────────────────────────────────────────────── */

function NoteEditorRoot() {
  const [tpl, setTpl] = useState(null);

  useEffect(() => {
    window.__gbOpenNote = (template) => setTpl({ ...template });
    // Race-recovery: editor-bridge's init() may have set currentNoteId
    // before this mount registered __gbOpenNote.
    const initial = typeof window.__gbCurrentNote === 'function'
      ? window.__gbCurrentNote()
      : null;
    if (initial) setTpl({ ...initial });
    return () => { delete window.__gbOpenNote; };
  }, []);

  return tpl ? (
    <NoteEditor
      key={tpl.id}
      tpl={tpl}
      onDelete={() => { if (typeof window.deleteNoteTemplate === 'function') window.deleteNoteTemplate(); }}
    />
  ) : (
    <EmptyState />
  );
}

function mount() {
  const host = document.getElementById('ed-note-form');
  if (!host || host.__gbNotesMounted) return;
  host.__gbNotesMounted = true;
  // Match editor-templates so the top gap and centered 750px column
  // are identical across the two editors.
  host.style.padding = '40px 0 48px';
  ensureTheme();
  createRoot(host).render(<NoteEditorRoot />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
