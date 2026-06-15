import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { useDevSetting } from '../lib/devSettings.js';
import { DraggablePopup } from '../ui/components/DraggablePopup.jsx';
import { IconBtn } from '../ui/components/IconBtn.jsx';
import { Btn } from '../ui/components/Btn.jsx';
import { I, Icon } from '../ui/icons.jsx';

/* ───────────────────────────────────────────────────────────────
   proposal-debug.jsx — content-script entry for the Proposal Debug
   panel. Gated by devSettings['proposalDebug.enabled']. The background
   fetch interceptor records every proposal- / email-submit request into
   chrome.storage.local.gbProposalDebugLog (newest first); this panel
   lists them in a draggable window — split into Proposal and Email
   sections — each with a Copy button that puts the FULL request +
   response (with timing) on the clipboard for troubleshooting.
─────────────────────────────────────────────────────────────── */

const LOG_KEY = 'gbProposalDebugLog';
const BugIcon = (p) => <Icon {...p}><path d="M8 2l1.5 1.5M16 2l-1.5 1.5"/><rect x="7" y="6" width="10" height="12" rx="5"/><path d="M3 9h4M17 9h4M3 14h3M18 14h3M4 19l3-2M20 19l-3-2"/></Icon>;

function fmtTime(ts) {
  try { const d = new Date(ts); return d.toLocaleTimeString([], { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0'); }
  catch { return String(ts); }
}

/* The full, copy-paste-ready dump of one request — everything needed to
   diff our call against the website's. */
const srcLabel = (e) => (e.source === 'website' ? 'WEBSITE' : 'OUR EXTENSION');

function fmtEntry(e) {
  const L = [];
  L.push('=== ' + e.label + '  [' + e.cat + ' · ' + srcLabel(e) + '] ===');
  L.push('time:     ' + new Date(e.ts).toISOString() + '  (duration ' + e.durationMs + 'ms)');
  L.push('request:  ' + e.method + ' ' + e.url);
  L.push('status:   ' + (e.status || (e.error ? 'ERROR' : '—')) + (e.ok ? '  OK' : (e.error ? '  FAIL' : '')));
  if (e.error) L.push('error:    ' + e.error);
  if (e.reqBody) { L.push(''); L.push('----- REQUEST BODY -----'); L.push(e.reqBody); }
  if (e.respBody) { L.push(''); L.push('----- RESPONSE BODY -----'); L.push(e.respBody); }
  return L.join('\n');
}

function StatusBadge({ e }) {
  const tone = e.error || (e.status && e.status >= 400) ? 'var(--gb-error-fg)'
    : e.ok ? 'var(--gb-success-fg)' : 'var(--gb-text-muted)';
  const bg = e.error || (e.status && e.status >= 400) ? 'var(--gb-error-tint-soft)'
    : e.ok ? 'var(--gb-success-tint-soft)' : 'var(--gb-fill-subtle)';
  return (
    <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', padding: '1px 6px', borderRadius: 'var(--gb-r-pill)', color: tone, background: bg, border: '1px solid var(--gb-border-subtle)' }}>
      {e.error ? 'ERR' : (e.status || '—')}
    </span>
  );
}

function Row({ e }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(fmtEntry(e)); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* */ }
  };
  const web = e.source === 'website';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-surface-1)', border: '1px solid ' + (web ? 'var(--gb-info-tint-border, var(--gb-border-default))' : 'var(--gb-border-subtle)') }}>
      <StatusBadge e={e} />
      <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 800, letterSpacing: .4, padding: '1px 5px', borderRadius: 'var(--gb-r-pill)', color: web ? 'var(--gb-info-fg, var(--gb-brand-label))' : 'var(--gb-text-tertiary)', background: web ? 'var(--gb-info-tint-soft, var(--gb-brand-tint-soft))' : 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>{web ? 'WEB' : 'EXT'}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.label}</div>
        <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {fmtTime(e.ts)} · {e.method} · {e.durationMs}ms · {e.reqBody ? (Math.round(e.reqBody.length / 1024) + 'KB req') : 'no body'}
        </div>
      </div>
      <Btn size="xs" variant={copied ? 'tinted' : 'ghost'} icon={copied ? <I.check /> : <I.copy />} onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </Btn>
    </div>
  );
}

function Section({ title, entries }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 2px' }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>{title}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--gb-text-ghost)' }}>{entries.length}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
      </div>
      {entries.length === 0
        ? <div style={{ fontSize: 10.5, color: 'var(--gb-text-ghost)', fontStyle: 'italic', padding: '2px 2px 4px' }}>None yet</div>
        : entries.map((e) => <Row key={e.id} e={e} />)}
    </div>
  );
}

function Panel({ log, onClose }) {
  const proposal = useMemo(() => log.filter((e) => e.cat === 'proposal'), [log]);
  const email = useMemo(() => log.filter((e) => e.cat === 'email'), [log]);
  const [copiedAll, setCopiedAll] = useState(false);
  const copyAll = async () => {
    try { await navigator.clipboard.writeText(log.map(fmtEntry).join('\n\n')); setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1400); } catch { /* */ }
  };
  const clear = () => { try { chrome.storage.local.set({ [LOG_KEY]: [] }); } catch { /* */ } };
  return (
    <DraggablePopup open onClose={onClose} icon={<BugIcon size={13} />} title="Proposal Debug"
      subtitle={`${log.length} captured`} width={430} maxHeight={580} enterFrom="right">
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
          <Btn size="xs" variant={copiedAll ? 'tinted' : 'secondary'} icon={copiedAll ? <I.check /> : <I.copy />} onClick={copyAll} disabled={!log.length}>
            {copiedAll ? 'Copied all' : 'Copy all'}
          </Btn>
          <Btn size="xs" variant="ghost" icon={<I.trash />} onClick={clear} disabled={!log.length}>Clear</Btn>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 9.5, color: 'var(--gb-text-muted)' }}>live</span>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gb-success-fg)' }} />
        </div>
        <div className="gb-thin-scroll" style={{ overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 470 }}>
          <Section title="Email submit" entries={email} />
          <Section title="Proposal submit" entries={proposal} />
          {log.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', lineHeight: 1.5, textAlign: 'center', padding: '10px 6px' }}>
              No requests captured yet. Build &amp; submit a proposal (or send a proposal email) and they will appear here.
            </div>
          )}
        </div>
      </div>
    </DraggablePopup>
  );
}

function Reopen({ onOpen, count }) {
  return (
    <button onClick={onOpen} title="Open Proposal Debug" style={{
      position: 'fixed', right: 14, bottom: 14, zIndex: 2147483300, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 12px',
      borderRadius: 'var(--gb-r-pill)', border: '1px solid var(--gb-border-default)',
      background: 'var(--gb-surface-modal)', color: 'var(--gb-text-primary)',
      boxShadow: 'var(--gb-shadow-modal)', fontFamily: 'var(--gb-font-sans)', fontSize: 12, fontWeight: 700,
    }}>
      <BugIcon size={14} style={{ color: 'var(--gb-brand-label)' }} /> Proposal Debug
      {count > 0 && <span style={{ fontSize: 10, fontWeight: 800, padding: '0 6px', borderRadius: 'var(--gb-r-pill)', background: 'var(--gb-brand-tint-medium)', color: 'var(--gb-brand-label)' }}>{count}</span>}
    </button>
  );
}

function ProposalDebugRoot() {
  const enabled = useDevSetting('proposalDebug.enabled');
  const [open, setOpen] = useState(true);
  const [log, setLog] = useState([]);
  // Bridge: the MAIN-world page hook posts the WEBSITE's matched requests here;
  // forward them to the background (the single log writer) when debug is on.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  useEffect(() => {
    const onMsg = (e) => {
      if (e.source !== window || !e.data || !e.data.__gbProposalNet || !e.data.entry) return;
      if (!enabledRef.current) return;
      try { chrome.runtime.sendMessage({ action: 'gbProposalNet', entry: e.data.entry }); } catch { /* */ }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  useEffect(() => {
    let alive = true;
    try { chrome.storage.local.get(LOG_KEY, (d) => { if (alive) setLog(Array.isArray(d && d[LOG_KEY]) ? d[LOG_KEY] : []); }); } catch { /* */ }
    const onCh = (ch, area) => { if (area === 'local' && ch[LOG_KEY]) setLog(Array.isArray(ch[LOG_KEY].newValue) ? ch[LOG_KEY].newValue : []); };
    try { chrome.storage.onChanged.addListener(onCh); } catch { /* */ }
    return () => { alive = false; try { chrome.storage.onChanged.removeListener(onCh); } catch { /* */ } };
  }, []);
  useEffect(() => { if (enabled) setOpen(true); }, [enabled]);
  if (!enabled) return null;
  return open
    ? <Panel log={log} onClose={() => setOpen(false)} />
    : <Reopen onOpen={() => setOpen(true)} count={log.length} />;
}

if (!window.__gbProposalDebugLoaded) {
  window.__gbProposalDebugLoaded = true;
  ensureTheme();
  const host = document.createElement('div');
  host.id = '__gb-proposal-debug';
  document.documentElement.appendChild(host);
  createRoot(host).render(<ProposalDebugRoot />);
}
