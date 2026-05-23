import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import { SignatureModal } from '../ui/index.js';
import { TemplateEditor, EmptyState } from '../pages/TemplateEditor.jsx';

/* ─────────────────────────────────────────────────────────────
   editor-templates — content-script entry for the email
   TemplateEditor page. Mounts into #ed-form. Bridges the editor
   to legacy globals: editor-bridge installs window.openTemplate
   etc.; we install window.__gbOpenTemplate + window.__gbOpenSignature
   here so editor-bridge can hand off templates to React.
───────────────────────────────────────────────────────────── */

function TemplateEditorRoot() {
  const [tpl, setTpl] = useState(null);
  const [showSig, setShowSig] = useState(false);

  useEffect(() => {
    window.__gbOpenTemplate  = (template) => setTpl({ ...template });
    window.__gbOpenSignature = () => setShowSig(true);
    // Race-recovery: editor-bridge's init() may have set currentId
    // before this mount registered __gbOpenTemplate. Pull whatever
    // editor-bridge considers "currently open" and load it now.
    const initial = typeof window.__gbCurrentTemplate === 'function'
      ? window.__gbCurrentTemplate()
      : null;
    if (initial) setTpl({ ...initial });
    return () => {
      delete window.__gbOpenTemplate;
      delete window.__gbOpenSignature;
    };
  }, []);

  return (
    <>
      {tpl ? (
        <TemplateEditor
          key={tpl.id}
          tpl={tpl}
          onDelete={() => { if (typeof window.deleteTemplate === 'function') window.deleteTemplate(); }}
        />
      ) : (
        <EmptyState />
      )}
      <AnimatePresence>
        {showSig && <SignatureModal key="sig" onClose={() => setShowSig(false)} />}
      </AnimatePresence>
    </>
  );
}

function mount() {
  const host = document.getElementById('ed-form');
  if (!host || host.__gbTemplatesMounted) return;
  host.__gbTemplatesMounted = true;
  // Padding on the host itself so the top gap shows regardless of layout.
  host.style.padding = '40px 0 48px';
  ensureTheme();
  createRoot(host).render(<TemplateEditorRoot />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
