import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Btn, Dropdown, Field, RangeSlider, Tag, I, Spinner } from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';

/* ───────────────────────────────────────────────────────────────
   EmailRunner — draggable bottom-anchored panel that drives a bulk
   email send.

   UX
   --
   The panel slides up from the bottom of the viewport (initial
   position is centred horizontally, hugging the bottom edge with
   24px of breathing room). A drag handle (six dots) on the header
   lets the user reposition it anywhere on screen — same pattern as
   the Color Swap popover in ImagePreview.

   Template picker
   ---------------
   Ports the popup.jsx dropdown shape: each template with variations
   renders an inline-expanding parent row whose sub-options are
   "(original) + every variation". Selecting:
     - just the parent template  → random variation per contact
     - a specific variation row  → that variation pinned for ALL contacts
   Composite ids (`${tplId}::${varId}`) drive the selection so the
   dropdown's active highlight + check mark land on the chosen row.

   Orchestration runs in background.js: we send the list of
   { url, name, id } contacts plus the chosen template and delay
   bounds. Progress events come back via chrome.runtime.onMessage
   filtered by a per-run runId so a stray older run can't bleed in.
─────────────────────────────────────────────────────────────── */

const PANEL_W = 340;
const PANEL_H = 480;
const fmtSeconds = (n) => `${n}s`;

const DragHandleDots = () => (
  <svg width="9" height="13" viewBox="0 0 9 13" fill="currentColor" aria-hidden>
    <circle cx="2" cy="2"  r="1" />
    <circle cx="7" cy="2"  r="1" />
    <circle cx="2" cy="6.5" r="1" />
    <circle cx="7" cy="6.5" r="1" />
    <circle cx="2" cy="11" r="1" />
    <circle cx="7" cy="11" r="1" />
  </svg>
);

export function EmailRunner({ open, contacts, onClose }) {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedVariationId, setSelectedVariationId] = useState(null);
  const [delay, setDelay] = useState([15, 45]); // seconds
  const [status, setStatus] = useState('idle');  // 'idle' | 'running' | 'done'
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' });
  const [results, setResults] = useState([]);
  const [paUrl, setPaUrl] = useState('');

  /* Position state. Initial coords place the panel near the bottom-
     centre of the viewport with a 24px gap from the bottom edge so
     it reads as "popping up from the bottom". The user can drag it
     anywhere by grabbing the header handle. Re-pinned to the bottom
     each time the panel opens (after `open` flips true) — keeps
     the entrance feeling consistent even if a previous session
     left it elsewhere. */
  const [pos, setPos] = useState(() => ({
    left: Math.max(0, (window.innerWidth - PANEL_W) / 2),
    top:  Math.max(0, window.innerHeight - PANEL_H - 24),
  }));
  useEffect(() => {
    if (!open) return;
    setPos({
      left: Math.max(0, (window.innerWidth - PANEL_W) / 2),
      top:  Math.max(0, window.innerHeight - PANEL_H - 24),
    });
  }, [open]);

  /* Pointer-drag the panel from the header grip. Tracks the global
     pointer until release so the cursor can leave the panel without
     dropping the drag. Clamps to the visible viewport so the user
     can't lose the panel off-screen. */
  const dragRef = useRef(null);
  const onDragStart = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { px: e.clientX, py: e.clientY, left: pos.left, top: pos.top };
    dragRef.current = start;
    const onMove = (ev) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      const maxLeft = Math.max(0, window.innerWidth  - PANEL_W);
      const maxTop  = Math.max(0, window.innerHeight - PANEL_H);
      setPos({
        left: Math.max(0, Math.min(maxLeft, start.left + dx)),
        top:  Math.max(0, Math.min(maxTop,  start.top  + dy)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  /* Load templates + PA URL on open. Filter matches the popup's
     visibleTemplates: drop disabled + case templates, keep email /
     account / untyped (which still resolve against a contact page
     in the background orchestrator). */
  useEffect(() => {
    if (!open) return;
    try {
      chrome.storage.local.get(['templates', 'featureFlags'], (out) => {
        const all = Array.isArray(out?.templates) ? out.templates : [];
        const eligible = all.filter((t) =>
          t.enabled !== false
          && t.type !== 'case'
          && (!t.type || t.type === 'email' || t.type === 'account'));
        setTemplates(eligible);
        setPaUrl(out?.featureFlags?.powerAutomateUrl || '');
      });
    } catch {}
  }, [open]);

  /* Per-run id so an older blast's lingering progress events can't
     leak into a newer run's UI. */
  const [runId, setRunId] = useState(null);
  useEffect(() => {
    if (!open) return;
    const listener = (msg) => {
      if (!msg || msg.runId !== runId) return;
      if (msg.action === 'emailBlastProgress') {
        setProgress({ current: msg.current, total: msg.total, name: msg.name });
        setResults((r) => [...r, msg.result]);
      } else if (msg.action === 'emailBlastDone') {
        setStatus('done');
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [open, runId]);

  /* Dropdown option shape — ported from popup.jsx. Templates with
     variations expose an inline-expanding parent + sub-options:
     "(original)" picks the parent, each variation row pins that
     specific variant for the whole run. */
  const dropdownOptions = useMemo(() => templates.map((t) => {
    const variations = Array.isArray(t.variations) ? t.variations : [];
    const subOptions = variations.length > 0 ? [
      { id: t.id, label: `${t.name || 'Untitled'} (original — random per contact)` },
      ...variations.map((v) => ({
        id: `${t.id}::${v.id}`,
        label: v.label || 'Variation',
      })),
    ] : undefined;
    return {
      id: t.id,
      label: t.name || 'Untitled',
      sub: variations.length ? `${variations.length} variation${variations.length === 1 ? '' : 's'}` : null,
      subOptions,
    };
  }), [templates]);

  /* Composite id when a variation is pinned so the dropdown's active
     row lands on the chosen sub-option. */
  const dropdownValue = selectedVariationId
    ? `${selectedId}::${selectedVariationId}`
    : selectedId;
  const selectedTpl = templates.find((t) => t.id === selectedId);
  const dropdownDisplayLabel = (() => {
    if (!selectedTpl) return '';
    if (!selectedVariationId) return selectedTpl.name || 'Untitled';
    const v = (selectedTpl.variations || []).find((x) => x.id === selectedVariationId);
    return `${selectedTpl.name || 'Untitled'} · ${v?.label || 'Variation'}`;
  })();

  const onDropdownChange = (id) => {
    if (typeof id === 'string' && id.includes('::')) {
      const [parentId, variationId] = id.split('::');
      setSelectedId(parentId);
      setSelectedVariationId(variationId);
      return;
    }
    setSelectedId(String(id || ''));
    setSelectedVariationId(null);
  };

  const canRun = !!selectedTpl && contacts.length > 0 && status !== 'running';

  const onRun = () => {
    if (!canRun) return;
    if (!paUrl) {
      toast?.error?.('Power Automate URL not set in Settings — enable PA to send.');
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setRunId(id);
    setResults([]);
    setProgress({ current: 0, total: contacts.length, name: '' });
    setStatus('running');

    /* If the user pinned a specific variation, fold its subject/body
       INTO the template payload and clear variations — the
       orchestrator's random-pick path then has nothing to pick from
       and falls back to the parent fields (now the pinned ones).
       If they picked just the parent, pass all variations through
       and let the orchestrator random-pick per contact. */
    let payloadTpl;
    if (selectedVariationId) {
      const v = (selectedTpl.variations || []).find((x) => x.id === selectedVariationId);
      payloadTpl = {
        id:        selectedTpl.id,
        subject:   v?.subject || selectedTpl.subject || '',
        body:      v?.body    || selectedTpl.body    || '',
        vars:      selectedTpl.vars    || {},
        toField:   selectedTpl.toField || { type: 'auto' },
        replyMode: selectedTpl.replyMode || 'standalone',
        variations: [],
      };
    } else {
      payloadTpl = {
        id:        selectedTpl.id,
        subject:   selectedTpl.subject || '',
        body:      selectedTpl.body    || '',
        vars:      selectedTpl.vars    || {},
        toField:   selectedTpl.toField || { type: 'auto' },
        replyMode: selectedTpl.replyMode || 'standalone',
        variations: Array.isArray(selectedTpl.variations) ? selectedTpl.variations : [],
      };
    }

    chrome.runtime.sendMessage({
      action: 'runEmailBlast',
      runId: id,
      contacts: contacts.map((c) => ({
        url:  c.contactUrl,
        name: c.contactName || c.name || '',
        id:   c.contactId   || '',
      })),
      template: payloadTpl,
      delayMin: delay[0],
      delayMax: delay[1],
    });
  };

  const sentCount   = results.filter((r) => r.status === 'sent').length;
  const failedCount = results.filter((r) => r.status === 'error').length;
  const variationCount = selectedTpl?.variations?.length || 0;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="email-runner"
          className="gb-email-runner"
          data-gb-scale="modals"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0, transition: { duration: 0.15 } }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          style={{
            position: 'fixed',
            left: pos.left, top: pos.top,
            width: PANEL_W,
            maxHeight: PANEL_H,
            background: 'var(--gb-surface-modal)',
            border: '1px solid var(--gb-border-default)',
            borderRadius: 'var(--gb-r-md)',
            // Keep above the parent modal's FloatingPanel (z 999999)
            // so the runner floats freely on top.
            zIndex: 2147483400,
            boxShadow: '0 12px 32px -8px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.06) inset',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'var(--gb-font-sans)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {/* Header doubles as drag handle — grab the dots to drag. */}
          <div
            onPointerDown={onDragStart}
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--gb-border-subtle)',
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--gb-surface-1)',
              cursor: dragRef.current ? 'grabbing' : 'grab',
              touchAction: 'none',
              flexShrink: 0,
            }}
          >
            <span style={{ color: 'var(--gb-text-muted)', display: 'flex' }}>
              <DragHandleDots />
            </span>
            <I.mail size={13} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
                Email selected
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)' }}>
                {contacts.length} contact{contacts.length === 1 ? '' : 's'} queued
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={status === 'running'}
              aria-label="Close"
              style={{
                width: 22, height: 22, borderRadius: 'var(--gb-r-sm)',
                background: 'transparent',
                border: '1px solid var(--gb-border-subtle)',
                color: 'var(--gb-text-muted)',
                cursor: status === 'running' ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                opacity: status === 'running' ? 0.5 : 1,
              }}
            >×</button>
          </div>

          {/* Body */}
          <div style={{
            padding: '14px',
            display: 'flex', flexDirection: 'column', gap: 14,
            overflow: 'auto', flex: 1, minHeight: 0,
            userSelect: 'auto',
            WebkitUserSelect: 'auto',
          }}>
            <Field
              label="Template"
              hint={templates.length
                ? (variationCount > 0 && !selectedVariationId
                  ? `Random pick across ${variationCount} variation${variationCount === 1 ? '' : 's'} per contact`
                  : null)
                : 'No email templates saved yet'}
            >
              <Dropdown
                value={dropdownValue}
                displayLabel={dropdownDisplayLabel}
                onChange={onDropdownChange}
                options={dropdownOptions}
                placeholder={templates.length ? 'Pick a template' : 'No templates'}
                searchable
                disabled={status === 'running'}
              />
            </Field>

            <Field label="Delay between sends" hint={`${fmtSeconds(delay[0])}–${fmtSeconds(delay[1])} (random per contact)`}>
              <RangeSlider
                values={delay}
                min={5}
                max={300}
                step={5}
                unit="s"
                onChange={(next) => setDelay(next)}
                disabled={status === 'running'}
              />
            </Field>

            {status !== 'idle' && (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                padding: 12,
                background: 'var(--gb-surface-1)',
                border: '1px solid var(--gb-border-subtle)',
                borderRadius: 'var(--gb-r-sm)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {status === 'running' ? <Spinner size={12} /> : <I.check size={12} />}
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>
                    {status === 'running'
                      ? `Sending ${progress.current} of ${progress.total}…`
                      : `Done — ${sentCount} sent${failedCount ? `, ${failedCount} failed` : ''}`}
                  </div>
                </div>
                {status === 'running' && progress.name && (
                  <div style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {progress.name}
                  </div>
                )}
                <div style={{
                  height: 4, borderRadius: 999,
                  background: 'var(--gb-surface-2)', overflow: 'hidden',
                }}>
                  <motion.div
                    animate={{ width: progress.total
                      ? `${Math.min(100, (progress.current / progress.total) * 100)}%`
                      : '0%' }}
                    transition={{ duration: 0.3 }}
                    style={{ height: '100%', background: 'var(--gb-brand-fg)' }}
                  />
                </div>
                {results.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 110, overflow: 'auto' }}>
                    {results.slice(-4).map((r, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 10.5, color: 'var(--gb-text-secondary)',
                      }}>
                        <Tag size="xs" tone={r.status === 'sent' ? 'brand' : 'error'}>
                          {r.status === 'sent' ? 'sent' : 'fail'}
                        </Tag>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.name || r.email || '(unknown)'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--gb-border-subtle)',
            background: 'var(--gb-surface-1)',
            display: 'flex', alignItems: 'center', gap: 8,
            flexShrink: 0,
          }}>
            <Btn size="sm" variant="secondary" onClick={onClose} disabled={status === 'running'}>
              {status === 'done' ? 'Close' : 'Cancel'}
            </Btn>
            <div style={{ flex: 1 }} />
            <Btn
              size="sm"
              variant="tinted"
              status="brand"
              icon={status === 'running' ? <Spinner size={11} /> : <I.send size={11} />}
              onClick={onRun}
              disabled={!canRun}
            >
              {status === 'running'
                ? 'Sending…'
                : status === 'done'
                  ? 'Send again'
                  : `Run · ${contacts.length}`}
            </Btn>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
