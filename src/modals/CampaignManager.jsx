import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Btn, IconBtn, Tag, Dot, Input, Dropdown, PillTag, Checkbox, Field, SectionLabel, RangeSlider, ModalShell, I,
} from '../ui/index.js';
import { CodeAutomationPanel } from '../ui/components/CodeAutomationPanel.jsx';
import { CodeDocsSidebar } from '../ui/components/CodeDocsSidebar.jsx';
import { resolveDoc } from '../lib/codeEngine/docs.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import {
  loadCampaigns, saveCampaign, removeCampaign, newCampaign, subscribeCampaigns,
} from '../lib/campaign/store.js';
import { loadCallTemplates } from '../lib/callLog.js';
import { loadTaskTemplates } from '../lib/quickTask.js';
import { parseCampaignBlob, importCampaigns } from '../lib/campaign/campaignImport.js';
import { translateProgram, flattenBlocks } from '../lib/codeEngine/translate.js';
import { simulateProgram } from '../lib/codeEngine/simulate.js';
import { makeSandboxRunner } from '../lib/codeEngine/sandboxRunner.js';
import { runInSandbox } from '../lib/page-engine/sandbox-bridge.js';
import { useDevSettings } from '../lib/devSettings.js';
import {
  CAMPAIGN_MANAGER_HEIGHT,
  CAMPAIGN_MANAGER_WIDTH,
  fitCampaignManagerScale,
  normalizeCampaignManagerScale,
} from '../lib/campaign/presentation.js';

/* ───────────────────────────────────────────────────────────────
   CampaignManager — code-first campaign editor.

   One authoring surface: a library sidebar + the CodeAutomationPanel,
   where a campaign is plain JS written against `page.*` (the audience
   model) and `actions.*` (the callable action library), projected live
   into blocks and runnable as a no-side-effect Simulate. Campaigns
   persist via lib/campaign/store.js (`automation` = the code source).
   The manual step timeline was retired in favor of pure code.
─────────────────────────────────────────────────────────────── */

const CMP_STYLE_ID = '__gb-campaign-mgr-css';
function ensureCampaignStyles() {
  if (typeof document === 'undefined' || document.getElementById(CMP_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = CMP_STYLE_ID;
  // Hover-reveal the sidebar delete + the run-view animations.
  s.textContent = `
    .gb-cmp-row .gb-cmp-del { opacity: 0; transition: opacity .12s ease; }
    .gb-cmp-row:hover .gb-cmp-del { opacity: 1; }
    @keyframes cm-running    { 0%, 100% { box-shadow: 0 0 0 0 var(--gb-brand-tint-strong); } 50% { box-shadow: 0 0 0 4px var(--gb-brand-tint-soft), 0 0 18px var(--gb-brand-tint-strong); } }
    @keyframes cm-pulse-ring { 0%, 100% { box-shadow: 0 0 0 0 var(--gb-brand-tint-strong); } 50% { box-shadow: 0 0 0 6px transparent; } }
  `;
  (document.head || document.documentElement).appendChild(s);
}

/* ── Sidebar ── */
function CampaignSidebar({ library, currentId, onSelect, onNew, onDelete, onImport }) {
  const [q, setQ] = useState('');
  const [confirmId, setConfirmId] = useState(null);   // row pending delete-confirm
  const filtered = library.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));
  const groups = [
    { key: 'Active', rows: filtered.filter((c) => c.status === 'Active') },
    { key: 'Drafts', rows: filtered.filter((c) => c.status === 'Draft') },
    { key: 'Paused', rows: filtered.filter((c) => c.status === 'Paused') },
  ].filter((g) => g.rows.length);
  return (
    <div style={{ width: 264, flexShrink: 0, background: 'var(--gb-surface-1)', borderRight: '1px solid var(--gb-border-default)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.megaphone size={14} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Campaigns</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{library.length} total</div>
        </div>
        <IconBtn size="sm" variant="ghost" icon={<I.download />} title="Import campaign (paste AI JSON)" onClick={onImport} />
        <IconBtn size="sm" variant="secondary" icon={<I.plus />} onClick={onNew} />
      </div>
      <div style={{ padding: '0 12px 10px', flexShrink: 0 }}>
        <Input value={q} placeholder="Search campaigns…" leading={<I.search size={13} />} onChange={(v) => setQ(v)} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 16px' }}>
        {groups.length === 0 && <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 11.5, color: 'var(--gb-text-muted)' }}>No campaigns yet.</div>}
        {groups.map((g) => (
          <div key={g.key} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px 4px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--gb-text-muted)' }}>
              <span>{g.key}</span><span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} /><span style={{ fontFamily: 'var(--gb-font-mono)' }}>{g.rows.length}</span>
            </div>
            {g.rows.map((row) => {
              const cur = row.id === currentId;
              const confirming = confirmId === row.id;
              return (
                <div key={row.id} className="gb-cmp-row" onClick={() => onSelect(row.id)} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 9, alignItems: 'center', padding: '8px 10px', background: cur ? 'var(--gb-brand-tint-soft)' : 'transparent', border: '1px solid ' + (cur ? 'var(--gb-brand-tint-border)' : 'transparent'), borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', marginBottom: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}><Dot tone={row.status === 'Active' ? 'brand' : row.status === 'Paused' ? 'warning' : 'muted'} glow={row.status === 'Active'} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: cur ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</div>
                    <div style={{ marginTop: 2, fontSize: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{(row.automation || '').trim() ? 'code' : 'empty'}</div>
                  </div>
                  {/* Delete: a hover-revealed trash that turns into an inline
                      confirm (no native dialog, stays in-modal). */}
                  {confirming ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      <IconBtn size="xs" danger icon={<I.check />} title="Confirm delete" onClick={() => { setConfirmId(null); onDelete?.(row.id); }} />
                      <IconBtn size="xs" variant="ghost" icon={<I.close />} title="Cancel" onClick={() => setConfirmId(null)} />
                    </div>
                  ) : (
                    <IconBtn className="gb-cmp-del" size="xs" variant="ghost" icon={<I.trash />} title="Delete campaign"
                      onClick={(e) => { e.stopPropagation(); setConfirmId(row.id); }} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Top bar ── */
/* Compact money for the audience-value chip ($12.3k / $1.2M). */
function fmtMoney(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}k`;
  return `$${Math.round(v)}`;
}

function TopBar({ campaign, onChange, sim, onSimStart, onSimStop, onSimReset, audience = [], simContactKey, onSimContactChange, audienceCount, audienceValue, onRun, onClose, dryRun, onDryRunChange }) {
  const simBusy = sim.status === 'running' || sim.status === 'replaying';
  const building = sim.status === 'running';
  const contactOptions = audience.map((c, i) => ({ id: c._key, label: c.contactName || c.name || c.contactId || `Contact ${i + 1}` }));
  return (
    <div style={{ padding: '12px 22px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.megaphone size={17} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Campaign Manager</div>
          <input value={campaign.name} onChange={(e) => onChange({ ...campaign, name: e.target.value })}
            style={{ marginTop: 2, width: '100%', height: 24, background: 'transparent', border: 'none', outline: 'none', padding: 0, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 16, fontWeight: 800, letterSpacing: -.3 }} />
        </div>
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px 5px 7px', background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-pill)' }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.users size={12} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Audience</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)' }}>{audienceCount}</span>
        </div>
        {audienceValue > 0 && (
          <>
            <div style={{ width: 1, height: 20, background: 'var(--gb-border-default)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Value</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gb-success-fg)', fontFamily: 'var(--gb-font-mono)' }}>{fmtMoney(audienceValue)}</span>
            </div>
          </>
        )}
      </div>
      {/* Simulate = run the code against one chosen contact, watch the blocks. */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 3, background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>
        <IconBtn size="sm" variant="ghost" icon={<I.rewind />} title="Reset simulation" onClick={onSimReset} />
        {contactOptions.length > 0 && (
          <div style={{ width: 150 }}>
            <Dropdown size="sm" value={simContactKey} options={contactOptions} searchable placeholder="Pick a contact…" disabled={simBusy} onChange={onSimContactChange} />
          </div>
        )}
        <Btn variant={simBusy ? 'tinted' : 'secondary'} status={simBusy ? 'warning' : 'brand'} size="sm" icon={simBusy ? <I.pause /> : <I.play />} disabled={!contactOptions.length} state={building ? 'loading' : 'idle'} onClick={simBusy ? onSimStop : onSimStart}>{simBusy ? 'Stop sim' : 'Simulate'}</Btn>
      </div>
      <PillTag on={dryRun} onClick={() => onDryRunChange(!dryRun)}>
        <Dot tone={dryRun ? 'warning' : 'muted'} /> Dry run
      </PillTag>
      <Btn variant="primary" status="brand" size="sm" icon={<I.zap />} onClick={onRun} disabled={simBusy}>{dryRun ? 'Dry run' : 'Run campaign'}</Btn>
      <div style={{ width: 1, height: 26, background: 'var(--gb-border-default)' }} />
      <IconBtn size="md" icon={<I.close />} onClick={onClose} />
    </div>
  );
}

/* ── Import campaigns — paste an AI-generated JSON blob ──────────
   Shape contract lives in docs/llm-campaign-toolset.md (the toolset file
   handed to a model so it can author full campaigns). Validates live as
   you paste; Import appends with fresh ids (never overwrites) and
   resolves saved-template references by name. */
function ImportCampaignsModal({ onClose, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => {
    const t = text.trim();
    if (!t) return null;
    try { return { ok: true, items: parseCampaignBlob(t) }; }
    catch (e) { return { ok: false, error: e.message }; }
  }, [text]);
  const doImport = async () => {
    if (!parsed || !parsed.ok || busy) return;
    setBusy(true);
    try { onDone(await importCampaigns(parsed.items)); }
    catch (e) { onDone({ error: e.message }); }
  };
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 2147483600, background: 'var(--gb-backdrop)', backdropFilter: 'var(--gb-backdrop-blur)', WebkitBackdropFilter: 'var(--gb-backdrop-blur)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 600, maxWidth: '92vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', boxShadow: 'var(--gb-shadow-modal)', overflow: 'hidden', fontFamily: 'var(--gb-font-sans)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <span style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.download size={14} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Import campaign</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>Paste an AI-generated JSON blob — single campaign, array, or {'{ campaigns: […] }'} · spec in docs/llm-campaign-toolset.md</div>
          </div>
          <IconBtn size="sm" icon={<I.close />} onClick={onClose} />
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflow: 'auto' }}>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='Paste the campaign JSON here…'
            spellCheck={false}
            style={{ width: '100%', boxSizing: 'border-box', height: 240, resize: 'vertical', padding: 10,
              background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)',
              outline: 'none', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', fontSize: 11, lineHeight: 1.5 }}
          />
          {parsed && (
            parsed.ok ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-success-tint-soft)', border: '1px solid var(--gb-success-tint-border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-success-fg)' }}>
                  {parsed.items.length} campaign{parsed.items.length === 1 ? '' : 's'} ready to import
                </div>
                {parsed.items.map(({ campaign: c, warnings }, i) => {
                  const branches = c.steps.filter((s) => s.branch).length;
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--gb-text-secondary)', minWidth: 0 }}>
                        <Tag tone="brand" size="xs">{c.steps.length} step{c.steps.length === 1 ? '' : 's'}</Tag>
                        <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                        <span style={{ color: 'var(--gb-text-muted)', flexShrink: 0 }}>{branches ? `${branches} branch${branches === 1 ? '' : 'es'} · ` : ''}{c.audienceOrder}</span>
                      </div>
                      {warnings.map((w, j) => (
                        <div key={j} style={{ fontSize: 10, color: 'var(--gb-warning-fg)', paddingLeft: 4 }}>⚠ {w}</div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: '9px 11px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-error-tint-soft, var(--gb-warning-tint-soft))', border: '1px solid var(--gb-error-tint-border, var(--gb-warning-tint-border))', fontSize: 11, color: 'var(--gb-error-fg, var(--gb-warning-fg))', lineHeight: 1.5 }}>
                {parsed.error}
              </div>
            )
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '11px 14px', borderTop: '1px solid var(--gb-border-subtle)' }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="sm" icon={<I.download />} disabled={!parsed || !parsed.ok || busy} state={busy ? 'loading' : 'idle'} onClick={doImport}>
            Import{parsed && parsed.ok ? ` ${parsed.items.length}` : ''}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ── Root ── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* The `page` model for one contact — same shape the panel simulates against. */
function pageFor(contact, audience) {
  return { contact: contact || {}, contacts: audience, count: audience.length };
}

/* ── Run engine (code-driven) ───────────────────────────────────
   Mirrors the old useCampaignRunner interface (rows / progress /
   start / pause / stop / reset / again), but each contact is evaluated
   by RUNNING THE CODE (simulateProgram) rather than the step engine —
   the "evaluation is the same", the authoring is code. Dry by default;
   real gated sends are the executor swap (next phase). */
function useCodeRunner() {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [complete, setComplete] = useState(false);
  const [rows, setRows] = useState({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const controlRef = useRef({ paused: false, stopped: false });
  const lastArgsRef = useRef(null);

  const start = async (args) => {
    lastArgsRef.current = args;
    const { code, audience, user, pace = 140 } = args;
    controlRef.current = { paused: false, stopped: false };
    setPaused(false); setComplete(false); setRunning(true);
    const init = {};
    audience.forEach((c) => { init[c._key] = { status: 'queued', label: '', ran: 0 }; });
    setRows(init);
    setProgress({ done: 0, total: audience.length });

    const run = makeSandboxRunner({ exec: runInSandbox });
    for (let i = 0; i < audience.length; i += 1) {
      if (controlRef.current.stopped) break;
      while (controlRef.current.paused && !controlRef.current.stopped) await sleep(150);
      if (controlRef.current.stopped) break;
      const c = audience[i];
      setRows((r) => ({ ...r, [c._key]: { ...(r[c._key] || {}), status: 'sending' } }));
      let res;
      try { res = await simulateProgram(code, pageFor(c, audience), { run, user }); }
      catch (e) { res = { ok: false, trace: [], error: String(e?.message || e) }; }
      const ran = res.trace.filter((t) => t.status === 'ran').length;
      const failed = res.trace.some((t) => t.status === 'failed') || !res.ok;
      const last = res.trace.length ? res.trace[res.trace.length - 1].summary : '';
      setRows((r) => ({
        ...r,
        [c._key]: { ...(r[c._key] || {}), ran, label: last || (res.error || '—'), status: failed ? 'failed' : ran > 0 ? 'sent' : 'skipped' },
      }));
      setProgress({ done: i + 1, total: audience.length });
      await sleep(pace);
    }
    setRunning(false); setComplete(!controlRef.current.stopped);
  };

  const pause = () => { controlRef.current.paused = true; setPaused(true); };
  const resume = () => { controlRef.current.paused = false; setPaused(false); };
  const stop = () => { controlRef.current.stopped = true; setRunning(false); };
  const reset = () => { setRows({}); setProgress({ done: 0, total: 0 }); setComplete(false); };
  const again = () => { if (lastArgsRef.current) start(lastArgsRef.current); };

  return { running, paused, complete, rows, progress, start, pause, resume, stop, reset, again };
}

function RunInitials({ name, size = 28 }) {
  const initials = (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: 'var(--gb-fill-strong)', color: 'var(--gb-text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', flexShrink: 0, border: '1px solid var(--gb-border-default)' }}>{initials}</span>
  );
}

const RUN_STATUS_TONE = {
  queued: { fg: 'var(--gb-text-muted)', bg: 'var(--gb-fill-subtle)', bd: 'var(--gb-border-default)', label: 'Queued' },
  sending: { fg: 'var(--gb-brand-label)', bg: 'var(--gb-brand-tint-medium)', bd: 'var(--gb-brand-tint-border)', label: 'Running' },
  sent: { fg: 'var(--gb-success-fg)', bg: 'var(--gb-success-tint-medium)', bd: 'var(--gb-success-tint-border)', label: 'Done' },
  stopped: { fg: 'var(--gb-warning-fg)', bg: 'var(--gb-warning-tint-medium)', bd: 'var(--gb-warning-tint-border)', label: 'Branch · stop' },
  skipped: { fg: 'var(--gb-text-muted)', bg: 'var(--gb-fill-subtle)', bd: 'var(--gb-border-default)', label: 'Skipped' },
  failed: { fg: 'var(--gb-error-fg)', bg: 'var(--gb-error-tint-medium)', bd: 'var(--gb-error-tint-border)', label: 'Failed' },
};

function RunPipeline({ mainCount, ran, status }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      {Array.from({ length: Math.max(1, mainCount) }).map((_, i) => {
        const done = i < ran;
        const active = status === 'sending' && i === ran;
        const color = done || active ? 'var(--gb-brand-label)' : 'var(--gb-text-ghost)';
        return (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ width: 10, height: 1.5, background: i <= ran ? 'var(--gb-brand-label)' : 'var(--gb-border-default)' }} />}
            <span style={{ width: active ? 10 : 8, height: active ? 10 : 8, borderRadius: '50%', background: (done || active) ? color : 'transparent', border: `1.5px solid ${color}`, animation: active ? 'cm-pulse-ring 1.2s ease-in-out infinite' : 'none', flexShrink: 0 }} />
          </React.Fragment>
        );
      })}
    </div>
  );
}

function AudienceRunView({ campaign, audience, mainCount, runner, dryRun, onExit }) {
  const { rows, progress, paused, complete, running, pause, resume, again } = runner;
  const exit = () => { runner.stop(); onExit?.(); };
  const counts = useMemo(() => {
    const c = { queued: 0, sending: 0, sent: 0, stopped: 0, skipped: 0, failed: 0 };
    audience.forEach((a) => { const s = rows[a._key]?.status || 'queued'; c[s] = (c[s] || 0) + 1; });
    return c;
  }, [rows, audience]);
  const total = audience.length;
  const audValue = useMemo(() => audience.reduce((s, c) => s + (Number(c.value) || 0), 0), [audience]);
  const finished = counts.sent + counts.stopped + counts.skipped + counts.failed;
  const pct = total > 0 ? (finished / total) * 100 : 0;
  const Tally = ({ label, value, tone }) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 16.5, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: tone || 'var(--gb-text-secondary)', lineHeight: 1.1 }}>{value}</div>
    </div>
  );
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: .3 }}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-canvas)', minHeight: 0 }}>
      <div style={{ padding: '14px 22px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: (running && !paused) ? 'cm-running 1.8s ease-in-out infinite' : 'none' }}><I.send size={15} /></div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>{dryRun ? 'Dry-run · nothing is sent' : 'Running campaign'}</div>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--gb-text-primary)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{campaign.name}</span>
            {paused && <Tag tone="warning" size="xs">Paused</Tag>}
            {complete && <Tag tone="brand" size="xs">Complete</Tag>}
            {dryRun && <Tag tone="neutral" size="xs">DRY RUN</Tag>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 18, paddingLeft: 18, borderLeft: '1px solid var(--gb-border-default)' }}>
          <Tally label="Audience" value={total} />
          {audValue > 0 && <Tally label="Value" value={fmtMoney(audValue)} tone="var(--gb-success-fg)" />}
          <Tally label="Running" value={counts.sending} tone="var(--gb-brand-label)" />
          <Tally label="Sent" value={counts.sent} tone="var(--gb-success-fg)" />
          <Tally label="Skipped" value={counts.skipped} />
          {counts.failed > 0 && <Tally label="Failed" value={counts.failed} tone="var(--gb-error-fg)" />}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 3, background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>
          {paused
            ? <Btn size="sm" variant="tinted" status="brand" icon={<I.play />} onClick={resume}>Resume</Btn>
            : complete
              ? <Btn size="sm" variant="tinted" status="brand" icon={<I.refresh />} onClick={again}>Run again</Btn>
              : <Btn size="sm" variant="tinted" status="warning" icon={<I.pause />} onClick={pause}>Pause</Btn>}
          <Btn size="sm" variant="ghost" icon={<I.close />} onClick={exit}>Stop &amp; edit</Btn>
        </div>
      </div>
      <div style={{ height: 4, background: 'var(--gb-fill-inverse-medium)', borderBottom: '1px solid var(--gb-border-default)', flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--gb-brand) 0%, var(--gb-brand-label) 100%)', boxShadow: '0 0 8px var(--gb-brand-label)', transition: 'width .35s ease' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '36px 1.4fr 1.1fr auto 1.1fr 120px', gap: 14, padding: '9px 22px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)', fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-text-muted)', flexShrink: 0 }}>
        <div /><div>Contact</div><div>Email</div><div>Steps · {mainCount}</div><div>Last step</div><div style={{ textAlign: 'right' }}>State</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {audience.map((c) => {
          const st = rows[c._key] || { status: 'queued', label: '', ran: 0 };
          const tone = RUN_STATUS_TONE[st.status] || RUN_STATUS_TONE.queued;
          const inflight = st.status === 'sending';
          return (
            <div key={c._key} style={{ display: 'grid', gridTemplateColumns: '36px 1.4fr 1.1fr auto 1.1fr 120px', gap: 14, alignItems: 'center', padding: '10px 19px', borderBottom: '1px solid var(--gb-border-subtle)', borderLeft: `3px solid ${inflight ? 'var(--gb-brand-label)' : st.status === 'sent' ? 'color-mix(in srgb, var(--gb-brand-label) 30%, transparent)' : 'transparent'}`, background: inflight ? 'color-mix(in srgb, var(--gb-brand-tint-soft) 80%, transparent)' : 'transparent', opacity: st.status === 'sent' || st.status === 'skipped' ? 0.75 : 1, transition: 'background-color .35s, opacity .35s, border-left-color .25s' }}>
              <RunInitials name={c.contactName || c.name} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.contactName || c.name || '(unknown)'}</div>
                <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.account || ''}</div>
              </div>
              <div style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 11, color: 'var(--gb-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email || ''}</div>
              <RunPipeline mainCount={mainCount} ran={st.ran || 0} status={st.status} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.label || (st.status === 'queued' ? 'Up next' : '—')}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 4, background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`, fontSize: 10, fontWeight: 700, letterSpacing: .4, fontFamily: 'var(--gb-font-mono)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{tone.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ── Stats strip (footer) — code program summary + Save ── */
function StatsStrip({ program, campaign, dirty, onSave }) {
  const ratePerMin = Math.round(60 / Math.max(campaign.paceDelay || 12, 1));
  const isValid = program.errors.length === 0 && program.actionCount > 0;
  const Cell = ({ icon, k, v, sub, tone = 'neutral' }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 10px', flexShrink: 0 }}>
      <div style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-sm)', background: tone === 'brand' ? 'var(--gb-brand-tint-medium)' : tone === 'warning' ? 'var(--gb-warning-tint-medium)' : tone === 'success' ? 'var(--gb-success-tint-medium)' : 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', color: tone === 'brand' ? 'var(--gb-brand-label)' : tone === 'warning' ? 'var(--gb-warning-fg)' : tone === 'success' ? 'var(--gb-success-fg)' : 'var(--gb-text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{React.cloneElement(icon, { size: 13 })}</div>
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>{k}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 1 }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: tone === 'warning' ? 'var(--gb-warning-fg)' : tone === 'success' ? 'var(--gb-success-fg)' : 'var(--gb-text-primary)' }}>{v}</span>
          {sub && <span style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>{sub}</span>}
        </div>
      </div>
    </div>
  );
  const Divider = () => <div style={{ width: 1, height: 32, background: 'var(--gb-border-subtle)', flexShrink: 0 }} />;
  return (
    <div style={{ padding: '8px 16px', borderTop: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, minHeight: 56 }}>
      <Cell icon={<I.zap />} tone="brand" k="Pacing" v={`~${ratePerMin}/min`} sub={`${campaign.paceDelay || 12}s`} />
      <Divider />
      <Cell icon={<I.flow />} k="Steps" v={program.actionCount} sub={program.branchCount ? `${program.branchCount} branch${program.branchCount !== 1 ? 'es' : ''}` : ''} />
      <div style={{ flex: 1 }} />
      <Cell icon={isValid ? <I.check /> : <I.alert />} tone={isValid ? 'success' : 'warning'} k={isValid ? 'Valid' : 'Issues'} v={isValid ? 'OK' : (program.errors.length || 'empty')} />
      <Divider />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 6 }}>
        <Btn variant="primary" size="sm" icon={<I.check />} onClick={onSave} disabled={!dirty}>{dirty ? 'Save campaign' : 'Saved'}</Btn>
      </div>
    </div>
  );
}

/* ── Campaign settings (right sidebar in Blocks view) — the original
   pacing / delivery / order controls. ── */
function CampaignSettings({ campaign, onChange }) {
  const upd = (patch) => onChange({ ...campaign, ...patch });
  const ratePerMin = Math.round(60 / Math.max(campaign.paceDelay || 12, 1));
  const paceLo = Math.max(1, (campaign.paceDelay || 0) - (campaign.paceJitter || 0));
  const paceHi = (campaign.paceDelay || 0) + (campaign.paceJitter || 0);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Campaign settings</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <SectionLabel>Status</SectionLabel>
          <div style={{ display: 'flex', gap: 5 }}>
            {['Draft', 'Active', 'Paused'].map((s) => (
              <PillTag key={s} on={campaign.status === s} onClick={() => upd({ status: s })}>
                <Dot tone={s === 'Active' ? 'brand' : s === 'Paused' ? 'warning' : 'muted'} glow={s === 'Active'} /> {s}
              </PillTag>
            ))}
          </div>
        </div>
        <div>
          <SectionLabel>Pacing</SectionLabel>
          <div style={{ padding: 12, background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', borderRadius: 'var(--gb-r-md)', display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <I.zap size={14} style={{ color: 'var(--gb-brand-label)', alignSelf: 'center' }} />
            <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)' }}>~{ratePerMin}</span>
            <span style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)' }}>per minute · runs only while the tab is open</span>
          </div>
          <Field label={<span>Delay between actions · {paceLo}–{paceHi}s</span>} hint="Each action waits a random time in this range — keeps the run looking human.">
            <RangeSlider values={[paceLo, paceHi]} min={1} max={90} step={1} unit="s" onChange={([a, b]) => upd({ paceDelay: Math.round((a + b) / 2), paceJitter: Math.round((b - a) / 2) })} />
          </Field>
        </div>
        <div>
          <SectionLabel>Delivery</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 12, background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)' }}>
            <Checkbox checked={campaign.suppressDoNotContact !== false} label="Skip “do not contact”" hint="Name or email contains the phrase (any case)" onChange={(v) => upd({ suppressDoNotContact: v })} />
            <Checkbox checked={campaign.suppressBounced !== false} label="Skip bounced contacts" hint="Contacts with a CRM bounce code" onChange={(v) => upd({ suppressBounced: v })} />
            <Checkbox checked={campaign.suppressMailerRemoved !== false} label="Skip mailer-removed contacts" hint="Opted out of mailings" onChange={(v) => upd({ suppressMailerRemoved: v })} />
          </div>
          <div style={{ height: 12 }} />
          <Field label="Audience order" hint="The order contacts are worked through this run">
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {[['list', 'As selected'], ['valueDesc', 'Highest value'], ['shuffle', 'Shuffle']].map(([id, label]) => (
                <PillTag key={id} on={(campaign.audienceOrder || 'list') === id} onClick={() => upd({ audienceOrder: id })}>{label}</PillTag>
              ))}
            </div>
          </Field>
          <div style={{ height: 12 }} />
          <Field label={<span>Send cap <span style={{ color: 'var(--gb-text-muted)', fontWeight: 500 }}>· {campaign.sendCap ? `${campaign.sendCap} per run` : 'no cap'}</span></span>} hint="Stop the run after this many actions — 0 = unlimited">
            <Input value={String(campaign.sendCap || 0)} mono onChange={(v) => upd({ sendCap: Math.max(0, parseInt(v.replace(/[^0-9]/g, ''), 10) || 0) })} />
          </Field>
        </div>
      </div>
    </div>
  );
}

export function CampaignManager({ onClose, contacts = [] }) {
  ensureCampaignStyles();
  const toast = useToast();
  // Modal zoom is a dev setting (mirrors the Gifting Catalog), live-updating
  // from Settings without a reload. The final scale also fits the full editor
  // into the current CSS viewport, which compensates for per-site browser zoom.
  const [devSettings] = useDevSettings();
  const preferredScale = normalizeCampaignManagerScale(devSettings['campaignManager.scale']);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));
  useEffect(() => {
    const read = () => setViewport({
      width: window.visualViewport?.width || window.innerWidth,
      height: window.visualViewport?.height || window.innerHeight,
    });
    read();
    window.addEventListener('resize', read);
    window.visualViewport?.addEventListener('resize', read);
    return () => {
      window.removeEventListener('resize', read);
      window.visualViewport?.removeEventListener('resize', read);
    };
  }, []);
  const scale = fitCampaignManagerScale(preferredScale, viewport.width, viewport.height);
  // Drive an exit animation: requestClose flips `open` false, the
  // AnimatePresence plays the fade/scale-out, then onExitComplete unmounts.
  const [open, setOpen] = useState(true);
  const requestClose = () => setOpen(false);
  const [library, setLibrary] = useState([]);
  const [campaign, setCampaign] = useState(() => newCampaign('Untitled campaign'));
  const [dirty, setDirty] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Which audience member the code simulation runs against (page.contact).
  const [simContactKey, setSimContactKey] = useState(null);
  // The rep's saved templates, exposed to code as user.emails / user.tasks / user.calls.
  const [userData, setUserData] = useState({ emails: [], tasks: [], calls: [] });
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  // Import result from the paste dialog: refresh the library, open the first
  // imported campaign, and surface anything the importer couldn't resolve.
  const onImported = (r) => {
    setImportOpen(false);
    if (!r || r.error) { toast?.error?.('Import failed — ' + (r?.error || 'unknown')); return; }
    setLibrary(r.list);
    const first = r.list[0];
    if (first) { setCampaign(first); setDirty(false); }
    if (r.unresolved?.length) {
      toast?.warning?.(`Imported ${r.count} — ${r.unresolved.length} template${r.unresolved.length === 1 ? '' : 's'} need picking in the editor`, { duration: 5000 });
    } else {
      toast?.success?.(`Imported ${r.count} campaign${r.count === 1 ? '' : 's'}`);
    }
  };

  // Load campaigns once + stay subscribed to store changes.
  useEffect(() => {
    let alive = true;
    loadCampaigns().then((list) => {
      if (!alive) return;
      setLibrary(list);
      if (list.length) setCampaign(list[0]);
    });
    const unsub = subscribeCampaigns((list) => { if (alive) setLibrary(list); });
    return () => { alive = false; unsub(); };
  }, []);

  // Load the rep's saved email / task / call templates for the user.* binding.
  useEffect(() => {
    let alive = true;
    const emails = new Promise((res) => {
      try {
        chrome.storage.local.get('templates', (o) => res((o?.templates || [])
          .filter((t) => t.enabled !== false && (!t.type || t.type === 'email' || t.type === 'account'))
          .map((t) => ({ id: t.id, name: t.name, subject: t.subject || '' }))));
      } catch { res([]); }
    });
    Promise.all([emails, loadTaskTemplates(), loadCallTemplates()]).then(([em, tasks, calls]) => {
      if (!alive) return;
      setUserData({
        emails: em,
        tasks: (tasks || []).map((t) => ({ id: t.id, name: t.name, subject: t.subject || '', priority: t.priority, daysOut: t.daysOut })),
        calls: (calls || []).map((c) => ({ id: c.id, name: c.name, subject: c.subject || '' })),
      });
      setTemplatesLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  const patchCampaign = (next) => { setCampaign(next); setDirty(true); };

  const selectCampaign = (id) => {
    const c = library.find((x) => x.id === id);
    if (c) { setCampaign(c); setDirty(false); }
  };
  const createCampaign = () => {
    setCampaign(newCampaign('Untitled campaign')); setDirty(true);
  };
  const deleteCampaign = (id) => {
    const removed = library.find((c) => c.id === id);
    removeCampaign(id).then((list) => {
      setLibrary(list);
      // If we deleted the open campaign, fall back to the first remaining
      // one (or a fresh untitled draft if the library is now empty).
      if (campaign.id === id) {
        setCampaign(list[0] || newCampaign('Untitled campaign')); setDirty(!list.length);
      }
      toast?.success?.(`Deleted “${removed?.name || 'campaign'}”`);
    }).catch(() => toast?.error?.('Couldn’t delete campaign'));
  };
  const save = () => {
    saveCampaign(campaign).then(({ campaign: saved, list }) => {
      setLibrary(list); setCampaign(saved); setDirty(false);
      toast?.success?.(`Saved “${saved.name}”`);
    }).catch(() => toast?.error?.('Couldn’t save campaign'));
  };

  // The read-only `page` model the code panel simulates against — the live
  // audience selection, so `page.contacts` / `page.contact` resolve for real.
  const audienceKeyed = useMemo(() => contacts.map((c, i) => ({ ...c, _key: c.contactId || c.contactUrl || `row${i}` })), [contacts]);
  // Keep the chosen simulation contact valid as the audience changes.
  useEffect(() => {
    if (!audienceKeyed.length) { setSimContactKey(null); return; }
    setSimContactKey((k) => (audienceKeyed.some((c) => c._key === k) ? k : audienceKeyed[0]._key));
  }, [audienceKeyed]);
  const setAutomation = (src) => patchCampaign({ ...campaign, automation: src });
  const audienceValue = useMemo(() => contacts.reduce((s, c) => s + (Number(c.value) || 0), 0), [contacts]);

  // Translate the code once — feeds the blocks view + the stats footer.
  const program = useMemo(() => {
    const { blocks, errors } = translateProgram(campaign.automation || '');
    const flat = flattenBlocks(blocks);
    return { blocks, errors, actionCount: flat.filter((b) => b.kind === 'action').length, branchCount: flat.filter((b) => b.kind === 'branch').length };
  }, [campaign.automation]);

  const [view, setView] = useState('code');
  const [dryRun, setDryRun] = useState(true);
  const [runMode, setRunMode] = useState(false);
  // The token under the caret → the live docs card (Code view right sidebar).
  const [docToken, setDocToken] = useState('');
  const activeDoc = useMemo(() => resolveDoc(docToken), [docToken]);
  // Saved-template names, fed to the editor for autocomplete + missing-dependency lint.
  const bindings = useMemo(() => ({
    ready: templatesLoaded,
    emails: userData.emails.map((e) => e.name).filter(Boolean),
    tasks: userData.tasks.map((t) => t.name).filter(Boolean),
    calls: userData.calls.map((c) => c.name).filter(Boolean),
  }), [userData, templatesLoaded]);
  const runner = useCodeRunner();
  // Single-contact simulation that animates the blocks (top-bar Simulate).
  const [sim, setSim] = useState({ status: 'idle', trace: [], replayIdx: -1, done: false, result: null, contactName: '' });
  const simRunRef = useRef(0);
  const simTimer = useRef(null);

  const runningId = sim.status === 'replaying' ? (sim.trace[sim.replayIdx]?.id || null) : null;
  const shownTrace = sim.status === 'replaying' ? sim.trace.slice(0, sim.replayIdx + 1) : sim.trace;

  const startSim = async () => {
    if (!program.blocks.length) { toast?.warning?.('Write some code first.'); return; }
    if (program.errors.length) { toast?.warning?.('Fix the syntax error first.'); return; }
    const contact = audienceKeyed.find((c) => c._key === simContactKey) || audienceKeyed[0];
    if (simTimer.current) { clearTimeout(simTimer.current); simTimer.current = null; }
    const my = ++simRunRef.current;
    setView('blocks');
    setSim({ status: 'running', trace: [], replayIdx: -1, done: false, result: null, contactName: contact?.contactName || contact?.name || '(contact)' });
    let res;
    try { res = await simulateProgram(campaign.automation || '', pageFor(contact, audienceKeyed), { run: makeSandboxRunner({ exec: runInSandbox }), user: userData }); }
    catch (e) { if (my === simRunRef.current) { toast?.error?.('Simulate failed — ' + String(e?.message || e)); setSim((s) => ({ ...s, status: 'idle' })); } return; }
    if (my !== simRunRef.current) return;
    if (res.error) toast?.error?.(res.error);
    setSim((s) => ({ ...s, status: 'replaying', trace: res.trace, replayIdx: res.trace.length ? 0 : -1, result: res.result, error: res.error || null }));
  };
  const stopSim = () => { simRunRef.current += 1; if (simTimer.current) { clearTimeout(simTimer.current); simTimer.current = null; } setSim((s) => ({ ...s, status: s.trace.length ? 'done' : 'idle', done: true })); };
  const resetSim = () => { simRunRef.current += 1; if (simTimer.current) { clearTimeout(simTimer.current); simTimer.current = null; } setSim({ status: 'idle', trace: [], replayIdx: -1, done: false, result: null, contactName: '' }); };

  // Replay: advance one trace entry ~600ms, then settle on 'done'.
  useEffect(() => {
    if (sim.status !== 'replaying') return undefined;
    if (sim.replayIdx >= sim.trace.length - 1) {
      simTimer.current = setTimeout(() => setSim((s) => ({ ...s, status: 'done', done: true })), 650);
      return () => { if (simTimer.current) clearTimeout(simTimer.current); };
    }
    simTimer.current = setTimeout(() => setSim((s) => ({ ...s, replayIdx: s.replayIdx + 1 })), 600);
    return () => { if (simTimer.current) clearTimeout(simTimer.current); };
  }, [sim.status, sim.replayIdx, sim.trace]);

  const startRun = () => {
    if (!audienceKeyed.length) { toast?.warning?.('No audience — launch from a CRM Search / Task selection.'); return; }
    if (!program.actionCount) { toast?.warning?.('Add a send/create step before running.'); return; }
    if (program.errors.length) { toast?.warning?.('Fix the syntax error first.'); return; }
    resetSim();
    setRunMode(true);
    runner.start({ code: campaign.automation || '', audience: audienceKeyed, user: userData, pace: 140 });
  };

  return (
    <AnimatePresence onExitComplete={onClose}>
    {open && (
    <motion.div key="cm-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      style={{ position: 'fixed', inset: 0, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-backdrop)', backdropFilter: 'var(--gb-backdrop-blur)', WebkitBackdropFilter: 'var(--gb-backdrop-blur)', zIndex: 'var(--gb-z-max)' }}>
      {/* The shared ModalShell (non-draggable card) keeps chrome + the
          bounce-in consistent with every other modal. Fixed-pixel size (not
          vw/vh) lets this surface own one deterministic zoom value; its mount
          root deliberately opts out of the shared Modals scale. The wrapper
          (initial=false ⇒ no entrance, ModalShell owns the bounce-in) plays
          the scale/fade exit on close. */}
      <motion.div initial={false} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }} style={{ display: 'flex' }}>
      <ModalShell width={CAMPAIGN_MANAGER_WIDTH} height={CAMPAIGN_MANAGER_HEIGHT} style={{ zoom: scale, color: 'var(--gb-text-secondary)' }}>
        <TopBar campaign={campaign} onChange={patchCampaign} sim={sim}
          onSimStart={startSim} onSimStop={stopSim} onSimReset={resetSim}
          audience={audienceKeyed} simContactKey={simContactKey} onSimContactChange={setSimContactKey}
          audienceCount={contacts.length} audienceValue={audienceValue} onRun={startRun} onClose={requestClose}
          dryRun={dryRun} onDryRunChange={setDryRun} />
        <AnimatePresence mode="wait" initial={false}>
        {runMode ? (
          <AudienceRunView key="run"
            campaign={campaign}
            audience={audienceKeyed}
            mainCount={program.actionCount}
            runner={runner}
            dryRun={dryRun}
            onExit={() => { setRunMode(false); runner.reset(); }}
          />
        ) : (
        <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <CampaignSidebar library={library} currentId={campaign.id} onSelect={selectCampaign} onNew={createCampaign} onDelete={deleteCampaign} onImport={() => setImportOpen(true)} />
          <CodeAutomationPanel
            value={campaign.automation || ''} onChange={setAutomation}
            blocks={program.blocks} errors={program.errors}
            view={view} onView={setView} onContext={setDocToken} bindings={bindings}
            trace={shownTrace} runningId={runningId} done={sim.status === 'done'} result={sim.status === 'done' ? sim.result : null}
            error={sim.status === 'done' ? sim.error : null} simStatus={sim.status} />
          {/* Contextual right sidebar: live docs while coding, campaign
              settings while looking at the blocks. */}
          <div style={{ width: 288, flexShrink: 0, borderLeft: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', position: 'relative', minHeight: 0 }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={view === 'code' ? 'docs' : 'settings'}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
                style={{ position: 'absolute', inset: 0, minHeight: 0 }}>
                {view === 'code'
                  ? <CodeDocsSidebar doc={activeDoc} />
                  : <CampaignSettings campaign={campaign} onChange={patchCampaign} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <StatsStrip program={program} campaign={campaign} dirty={dirty} onSave={save} />
        </motion.div>
        )}
        </AnimatePresence>
      </ModalShell>
      </motion.div>
      {importOpen && <ImportCampaignsModal onClose={() => setImportOpen(false)} onDone={onImported} />}
    </motion.div>
    )}
    </AnimatePresence>
  );
}

export default CampaignManager;
