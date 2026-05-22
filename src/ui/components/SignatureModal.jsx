import React, { useState, useEffect, useRef } from 'react';
import { I, Icon } from '../icons.jsx';
import { Btn } from './Btn.jsx';
import { CompactModal } from './CompactModal.jsx';
import { ModalHeader } from './ModalHeader.jsx';
import { ModalFooter } from './ModalFooter.jsx';
import { Callout } from './Callout.jsx';
import { RichTextEditor } from './RichTextEditor.jsx';

const PenIcon = (p) => (
  <Icon {...p}><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></Icon>
);

/**
 * SignatureModal — edits the global email signature stored at
 * chrome.storage.local.emailSignature. The signature HTML is appended
 * to every email sent through Direct Send / Power Automate.
 *
 * Built on CompactModal — a small, focused dialog rather than a full
 * 560px modal. Mount it inside an <AnimatePresence>.
 *
 * Props:
 *   onClose () => void
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

  // Returning a Promise lets Btn animate loading → success automatically.
  function save() {
    return new Promise(resolve => {
      chrome.storage.local.set({ emailSignature: htmlRef.current }, () => {
        setTimeout(() => { onClose?.(); resolve(); }, 450);
      });
    });
  }

  return (
    <CompactModal size="compact" onClose={onClose}>
      <ModalHeader
        icon={<PenIcon />}
        title="Email Signature"
        subtitle="Appended to every outgoing email"
        onClose={onClose}
      />

      {/* Body scrolls within CompactModal's height cap; header/footer pin. */}
      <div style={{
        padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
        flex: 1, minHeight: 0, overflow: 'auto',
      }}>
        {loaded ? (
          <RichTextEditor
            size="sm"
            initialHtml={initial}
            onChange={html => { htmlRef.current = html; }}
            minHeight={140}
            placeholder="Name, title, phone, company — formatted how you like it."
          />
        ) : (
          <div style={{
            minHeight: 140, borderRadius: 'var(--gb-r-md)',
            border: '1px solid var(--gb-border-default)',
            background: 'var(--gb-surface-canvas)',
          }} />
        )}
        <Callout tone="info">
          Keep it lightweight — inline images can render inconsistently in some
          recipient inboxes when relayed through Power Automate.
        </Callout>
      </div>

      <ModalFooter>
        <span style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon={<I.check />} onClick={save}>Save</Btn>
      </ModalFooter>
    </CompactModal>
  );
}
