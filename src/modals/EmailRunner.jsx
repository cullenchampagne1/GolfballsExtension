import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Btn, Dropdown, Field, RangeSlider, Tag, I, Spinner } from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';

/* ───────────────────────────────────────────────────────────────
   EmailRunner — side panel that drives a bulk email send.

   Mounts as a sibling of the parent modal (CRMSearch / TaskList)
   and floats fixed to the right side of the viewport with some
   air between it and the parent panel. Owns:

     - Template picker (filters to email/account templates)
     - Min/Max delay range slider
     - Run button + per-contact progress + final results

   Orchestration runs in background.js: we send the list of
   { url, name, id } contacts plus the chosen template and delay
   bounds. The bg script opens each contact in an inactive tab,
   sends resolveVars to that tab's content script, renders the
   template, fires the email through Power Automate, closes the
   tab, sleeps for a random delay between [min, max], and repeats.
   Progress events come back to whichever tab opened the runner
   via chrome.runtime.onMessage so we can light up the UI.

   This is the MVP entry point for a broader campaign engine — it
   intentionally omits scheduling, retries, A/B branching, etc.
─────────────────────────────────────────────────────────────── */

/* Random variation pick: even-weighted draw from tpl.variations.
   Returns null when there are none, so callers fall back to the
   template's own subject/body. */
const pickVariation = (tpl) => {
  const list = Array.isArray(tpl?.variations) ? tpl.variations : [];
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
};

const fmtSeconds = (n) => `${n}s`;

export function EmailRunner({ open, contacts, onClose }) {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [delay, setDelay] = useState([15, 45]); // seconds
  const [status, setStatus] = useState('idle');  // 'idle' | 'running' | 'done'
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' });
  const [results, setResults] = useState([]);
  const [paUrl, setPaUrl] = useState('');

  /* Pull templates once on mount. Only email-ish templates make
     sense here — we're going to render them against a contact /
     account page, so order-only templates would always fail to
     resolve. Empty `type` strings are treated as email-eligible
     because the legacy data didn't always set a type. */
  useEffect(() => {
    if (!open) return;
    try {
      chrome.storage.local.get(['templates', 'featureFlags'], (out) => {
        const all = Array.isArray(out?.templates) ? out.templates : [];
        const eligible = all.filter((t) => !t.type || t.type === 'email' || t.type === 'account');
        setTemplates(eligible);
        setPaUrl(out?.featureFlags?.powerAutomateUrl || '');
      });
    } catch {}
  }, [open]);

  /* Live progress / completion events from background.js. The
     orchestrator broadcasts to all tabs because it doesn't know
     which one initiated; we filter by a runId we generate per
     Run click so a stray older run can't bleed in. */
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

  /* Dropdown options. Templates with variations expose a top-level
     option plus nested sub-options (label per variation), so the
     user can see what's in the pool before they Run — handy when
     they don't want to spray an off-brand variant. */
  const dropdownOptions = useMemo(() => templates.map((t) => {
    const variations = Array.isArray(t.variations) ? t.variations : [];
    return {
      id: t.id,
      label: t.name || t.label || '(untitled)',
      sub: variations.length ? `${variations.length} variation${variations.length === 1 ? '' : 's'}` : null,
      subOptions: variations.length ? variations.map((v) => ({
        id: `${t.id}::${v.id}`,
        label: v.label || v.name || '(variant)',
        keepOpen: true,
      })) : null,
    };
  }), [templates]);

  const selectedTpl = templates.find((t) => t.id === selectedId);
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

    chrome.runtime.sendMessage({
      action: 'runEmailBlast',
      runId: id,
      contacts: contacts.map((c) => ({
        url:  c.contactUrl,
        name: c.contactName || c.name || '',
        id:   c.contactId   || '',
      })),
      template: {
        id:        selectedTpl.id,
        subject:   selectedTpl.subject || '',
        body:      selectedTpl.body    || '',
        vars:      selectedTpl.vars    || {},
        toField:   selectedTpl.toField || { type: 'auto' },
        replyMode: selectedTpl.replyMode || 'standalone',
        variations: Array.isArray(selectedTpl.variations) ? selectedTpl.variations : [],
      },
      delayMin: delay[0],
      delayMax: delay[1],
    });
  };

  const sentCount   = results.filter((r) => r.status === 'sent').length;
  const failedCount = results.filter((r) => r.status === 'error').length;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="email-runner"
          className="gb-email-runner"
          data-gb-scale="modals"
          initial={{ x: 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 60, opacity: 0, transition: { duration: 0.15 } }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          style={{
            position: 'fixed',
            top: '50%',
            right: 24,
            transform: 'translateY(-50%)',
            width: 340,
            maxHeight: '80vh',
            background: 'var(--gb-surface-modal)',
            border: '1px solid var(--gb-border-default)',
            borderRadius: 'var(--gb-r-md)',
            boxShadow: 'var(--gb-shadow-popover)',
            zIndex: 999998,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'var(--gb-font-sans)',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--gb-border-subtle)',
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--gb-surface-1)',
            flexShrink: 0,
          }}>
            <I.mail size={14} />
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
          }}>
            <Field label="Template" hint={templates.length ? null : 'No email templates saved yet'}>
              <Dropdown
                value={selectedId}
                onChange={(v) => setSelectedId(String(v || '').split('::')[0])}
                options={dropdownOptions}
                placeholder={templates.length ? 'Pick a template' : 'No templates'}
                searchable
                disabled={status === 'running'}
              />
              {selectedTpl?.variations?.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>
                  Random pick across {selectedTpl.variations.length} variation{selectedTpl.variations.length === 1 ? '' : 's'} per contact.
                </div>
              )}
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

            {/* Progress strip */}
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
                {/* Bar */}
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
                {/* Compact result tail — last 4 outcomes */}
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
