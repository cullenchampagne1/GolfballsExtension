import React, { useState, useEffect, useRef } from 'react';
import { CompactModal } from './CompactModal.jsx';
import { RichTextEditor } from './RichTextEditor.jsx';

/**
 * SignatureModal — edits the global email signature stored at
 * chrome.storage.local.emailSignature.
 *
 * The "modal" is just the RichTextEditor itself: backdrop dims the page,
 * the editor sits centered with its own slight border (no header, no
 * footer, no Cancel/Save). Clicking the backdrop or pressing Esc saves
 * the current contents and closes. Mount inside an <AnimatePresence>.
 *
 * Props:
 *   onClose () => void  — fired AFTER persistence completes
 */
export function SignatureModal({ onClose }) {
  const [loaded, setLoaded] = useState(false);
  const [initial, setInitial] = useState('');
  const htmlRef = useRef('');

  // Load the stored signature once.
  useEffect(() => {
    let alive = true;
    chrome.storage.local.get('emailSignature', ({ emailSignature }) => {
      if (!alive) return;
      const sig = emailSignature || '';
      setInitial(sig);
      htmlRef.current = sig;
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  // Backdrop click / Esc → persist then close. No explicit Save button —
  // exit IS save.
  function saveAndClose() {
    chrome.storage.local.set({ emailSignature: htmlRef.current }, () => {
      window.__gbToast?.success('Signature saved');
      onClose?.();
    });
  }

  return (
    // CompactModal handles portal + backdrop + escape stack. Override its
    // card chrome to transparent so the RichTextEditor's own border IS
    // the visible "modal" boundary — one slight border, not nested.
    <CompactModal
      size={680}
      onClose={saveAndClose}
      style={{
        background: 'transparent',
        border: 'none',
        boxShadow: 'none',
        borderRadius: 0,
        overflow: 'visible',
      }}
    >
      {loaded ? (
        <RichTextEditor
          size="sm"
          initialHtml={initial}
          onChange={html => { htmlRef.current = html; }}
          minHeight={220}
          placeholder="Name, title, phone, company — formatted how you like it."
        />
      ) : (
        <div style={{
          minHeight: 220, borderRadius: 'var(--gb-r-md)',
          border: '1px solid var(--gb-border-default)',
          background: 'var(--gb-surface-canvas)',
        }} />
      )}
    </CompactModal>
  );
}
