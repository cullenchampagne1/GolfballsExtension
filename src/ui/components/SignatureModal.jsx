import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { T } from '../shared.jsx';
import { I, Icon } from '../icons.jsx';
import { Btn } from './Btn.jsx';
import { ModalShell } from './ModalShell.jsx';
import { ModalHeader } from './ModalHeader.jsx';
import { ModalFooter } from './ModalFooter.jsx';
import { RichTextEditor } from './RichTextEditor.jsx';

const PenIcon = (p) => (
  <Icon {...p}><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></Icon>
);

/**
 * SignatureModal — edits the global email signature stored at
 * chrome.storage.local.emailSignature. The signature HTML is appended
 * to every email sent through Direct Send / Power Automate.
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
    <motion.div
      key="sig-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={T.base}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 220,
        background: 'var(--gb-backdrop)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div onClick={e => e.stopPropagation()}>
        <ModalShell width={620}>
          <ModalHeader
            icon={<PenIcon />}
            title="Email Signature"
            subtitle="Appended to every email sent via Direct Send"
            onClose={onClose}
          />

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: 0.8, color: 'var(--gb-text-muted)',
            }}>
              Signature content
            </div>
            {loaded ? (
              <RichTextEditor
                initialHtml={initial}
                onChange={html => { htmlRef.current = html; }}
                minHeight={170}
                placeholder="Type your signature — name, title, phone, etc."
              />
            ) : (
              <div style={{
                minHeight: 200, borderRadius: 'var(--gb-r-md)',
                border: '1px solid var(--gb-border-default)',
                background: 'var(--gb-surface-canvas)',
              }} />
            )}
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.5 }}>
              Keep it lightweight — inline images may render inconsistently in some
              recipient inboxes when relayed through Power Automate.
            </div>
          </div>

          <ModalFooter>
            <div style={{ flex: 1 }} />
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" icon={<I.check />} onClick={save}>
              Save signature
            </Btn>
          </ModalFooter>
        </ModalShell>
      </div>
    </motion.div>
  );
}
