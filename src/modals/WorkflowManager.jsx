import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Btn, IconBtn, Tag, Dot, Input, Dropdown, PillTag, Checkbox, Field, SectionLabel, RangeSlider, ModalShell, I,
} from '../ui/index.js';
import { CodeAutomationPanel } from '../ui/components/CodeAutomationPanel.jsx';
import { CodeDocsSidebar } from '../ui/components/CodeDocsSidebar.jsx';
import { resolveDoc } from '../lib/codeEngine/docs.js';
import { buildCodeSpec } from '../lib/codeEngine/spec.js';
import { codeIdsFor } from '../lib/codeEngine/userBinding.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import {
  loadWorkflows, saveWorkflow, removeWorkflow, newWorkflow, subscribeWorkflows, writeWorkflowCode,
} from '../lib/workflow/store.js';
import { loadCallTemplates } from '../lib/callLog.js';
import { loadTaskTemplates } from '../lib/quickTask.js';
import { parseWorkflowBlob, importWorkflows } from '../lib/workflow/workflowImport.js';
import { hydrateWorkflowContact } from '../lib/workflow/codeContext.js';
import { runCodeWorkflow } from '../lib/workflow/codeRunner.js';
import { evaluateWorkflowTemplate } from '../lib/workflow/templateEvaluation.js';
import { translateProgram, flattenBlocks } from '../lib/codeEngine/translate.js';
import { simulateProgram } from '../lib/codeEngine/simulate.js';
import { makeSandboxRunner } from '../lib/codeEngine/sandboxRunner.js';
import { runInSandbox } from '../lib/page-engine/sandbox-bridge.js';
import { makeExecutor } from '../lib/codeEngine/executor.js';
import { pipelinePlanSummary, planRunFromPipeline } from '../lib/codeEngine/runPlan.js';
import { readEmailConfig, sendEmail } from '../lib/emailSender.js';
import { pickFromAddress } from '../lib/sender.js';
import { submitQuickTask } from '../lib/submitQuickTask.js';
import { submitCallLog } from '../lib/submitCallLog.js';
import { resolveEmployeeId } from '../lib/employeeIdentity.js';
import { completeTaskById, updateTaskById } from '../lib/crmTasks.js';
import { crmUpdateContact } from '../lib/crm-detail-shared.jsx';
import { dispatchBackgroundMessage } from '../lib/backgroundMessage.js';
import { useDevSettings } from '../lib/devSettings.js';
import {
  WORKFLOW_MANAGER_HEIGHT,
  WORKFLOW_MANAGER_WIDTH,
  fitWorkflowManagerScale,
  normalizeWorkflowManagerScale,
} from '../lib/workflow/presentation.js';
import {
  advanceRunRow,
  buildRunPipeline,
  displayRunPipeline,
  finishRunRow,
} from '../lib/workflow/runPresentation.js';

/* ───────────────────────────────────────────────────────────────
   WorkflowManager — code-first workflow editor.

   One authoring surface: a library sidebar + the CodeAutomationPanel,
   where a workflow is plain JS written against `page.*` (the audience
   model) and `actions.*` (the callable action library), projected live
   into blocks and runnable as a no-side-effect Simulate. Workflows
   persist via lib/workflow/store.js (`automation` = the code source).
   The manual step timeline was retired in favor of pure code.
─────────────────────────────────────────────────────────────── */

const WORKFLOW_STYLE_ID = '__gb-workflow-mgr-css';
function ensureWorkflowStyles() {
  if (typeof document === 'undefined' || document.getElementById(WORKFLOW_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = WORKFLOW_STYLE_ID;
  // Hover-reveal the sidebar delete + the run-view animations. The `code/pre`
  // reset neutralizes the HOST CRM page's global code/pre styling (this modal
  // mounts into document.body, not a shadow root), which was leaking a bright
  // background + border + block display onto every <code> in the blocks/docs.
  s.textContent = `
    .gb-workflow-row .gb-workflow-del { opacity: 0; transition: opacity .12s ease; }
    .gb-workflow-row:hover .gb-workflow-del { opacity: 1; }
    .gb-workflow-scope code, .gb-workflow-scope kbd, .gb-workflow-scope samp {
      background: transparent !important; border: 0 !important; box-shadow: none !important;
      padding: 0 !important; margin: 0 !important; border-radius: 0 !important;
      display: inline !important; white-space: inherit; vertical-align: baseline !important;
      font-family: var(--gb-font-mono, ui-monospace, monospace) !important;
    }
    @keyframes workflow-running    { 0%, 100% { box-shadow: 0 0 0 0 var(--gb-brand-tint-strong); } 50% { box-shadow: 0 0 0 4px var(--gb-brand-tint-soft), 0 0 18px var(--gb-brand-tint-strong); } }
    @keyframes workflow-pulse-ring { 0%, 100% { box-shadow: 0 0 0 0 var(--gb-brand-tint-strong); } 50% { box-shadow: 0 0 0 6px transparent; } }
    @keyframes workflow-repeat-hit {
      0%   { opacity: .95; transform: scale(.7); box-shadow: 0 0 0 0 var(--gb-brand-tint-strong); }
      55%  { opacity: .2; transform: scale(2.05); box-shadow: 0 0 0 5px var(--gb-brand-tint-soft); }
      100% { opacity: 0; transform: scale(2.35); box-shadow: 0 0 0 8px transparent; }
    }
  `;
  (document.head || document.documentElement).appendChild(s);
}

/* ── Sidebar ── */
function WorkflowSidebar({ library, currentId, onSelect, onNew, onDelete, onImport }) {
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
          <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Workflows</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{library.length} total</div>
        </div>
        <IconBtn size="sm" variant="ghost" icon={<I.download />} title="Import workflow (paste AI JSON)" onClick={onImport} />
        <IconBtn size="sm" variant="secondary" icon={<I.plus />} onClick={onNew} />
      </div>
      <div style={{ padding: '0 12px 10px', flexShrink: 0 }}>
        <Input value={q} placeholder="Search workflows…" leading={<I.search size={13} />} onChange={(v) => setQ(v)} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 16px' }}>
        {groups.length === 0 && <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 11.5, color: 'var(--gb-text-muted)' }}>No workflows yet.</div>}
        {groups.map((g) => (
          <div key={g.key} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px 4px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--gb-text-muted)' }}>
              <span>{g.key}</span><span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} /><span style={{ fontFamily: 'var(--gb-font-mono)' }}>{g.rows.length}</span>
            </div>
            {g.rows.map((row) => {
              const cur = row.id === currentId;
              const confirming = confirmId === row.id;
              return (
                <div key={row.id} className="gb-workflow-row" onClick={() => onSelect(row.id)} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 9, alignItems: 'center', padding: '8px 10px', background: cur ? 'var(--gb-brand-tint-soft)' : 'transparent', border: '1px solid ' + (cur ? 'var(--gb-brand-tint-border)' : 'transparent'), borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', marginBottom: 2 }}>
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
                    <IconBtn className="gb-workflow-del" size="xs" variant="ghost" icon={<I.trash />} title="Delete workflow"
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

function TopBar({ workflow, onChange, sim, onSimStart, onSimStop, onSimReset, audience = [], simContactKey, onSimContactChange, audienceCount, audienceValue, onRun, onClose, dryRun, onDryRunChange }) {
  const simBusy = sim.status === 'running' || sim.status === 'replaying';
  const building = sim.status === 'running';
  const contactOptions = audience.map((c, i) => ({ id: c._key, label: c.contactName || c.name || c.contactId || `Contact ${i + 1}` }));
  return (
    <div style={{ padding: '12px 22px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.megaphone size={17} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Workflow Manager</div>
          <input value={workflow.name} onChange={(e) => onChange({ ...workflow, name: e.target.value })}
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
      <Btn variant="primary" status="brand" size="sm" icon={<I.zap />} onClick={onRun} disabled={simBusy}>{dryRun ? 'Dry run' : 'Run workflow'}</Btn>
      <div style={{ width: 1, height: 26, background: 'var(--gb-border-default)' }} />
      <IconBtn size="md" icon={<I.close />} onClick={onClose} />
    </div>
  );
}

/* ── Import workflows — paste an AI-generated JSON blob ──────────
   Shape contract lives in docs/llm-workflow-toolset.md. Validates executable
   automation live as you paste; Import appends with fresh ids and never
   overwrites an existing workflow. */
function ImportWorkflowsModal({ onClose, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => {
    const t = text.trim();
    if (!t) return null;
    try { return { ok: true, items: parseWorkflowBlob(t) }; }
    catch (e) { return { ok: false, error: e.message }; }
  }, [text]);
  const doImport = async () => {
    if (!parsed || !parsed.ok || busy) return;
    setBusy(true);
    try { onDone(await importWorkflows(parsed.items)); }
    catch (e) { onDone({ error: e.message }); }
  };
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 2147483600, background: 'var(--gb-backdrop)', backdropFilter: 'var(--gb-backdrop-blur)', WebkitBackdropFilter: 'var(--gb-backdrop-blur)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 600, maxWidth: '92vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', boxShadow: 'var(--gb-shadow-modal)', overflow: 'hidden', fontFamily: 'var(--gb-font-sans)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <span style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.download size={14} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Import workflow</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>Paste an AI-generated JSON blob — single workflow, array, or {'{ workflows: […] }'} · spec in docs/llm-workflow-toolset.md</div>
          </div>
          <IconBtn size="sm" icon={<I.close />} onClick={onClose} />
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflow: 'auto' }}>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='Paste the workflow JSON here…'
            spellCheck={false}
            style={{ width: '100%', boxSizing: 'border-box', height: 240, resize: 'vertical', padding: 10,
              background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)',
              outline: 'none', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', fontSize: 11, lineHeight: 1.5 }}
          />
          {parsed && (
            parsed.ok ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-success-tint-soft)', border: '1px solid var(--gb-success-tint-border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-success-fg)' }}>
                  {parsed.items.length} workflow{parsed.items.length === 1 ? '' : 's'} ready to import
                </div>
                {parsed.items.map(({ workflow: c, warnings }, i) => {
                  const imported = translateProgram(c.automation || '');
                  const flat = flattenBlocks(imported.blocks);
                  const actions = flat.filter((block) => (
                    block.kind === 'action'
                    || block.kind === 'complete'
                    || block.kind === 'edit'
                  )).length;
                  const branches = flat.filter((block) => (
                    block.kind === 'branch' || block.kind === 'cases'
                  )).length;
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--gb-text-secondary)', minWidth: 0 }}>
                        <Tag tone="brand" size="xs">{actions} action{actions === 1 ? '' : 's'}</Tag>
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
/* Build the REAL executor for one contact — reuses the proven lib functions
   (emailSender.sendEmail accepts an arbitrary `to` + appends its own signature;
   crmUpdateContact / completeTaskById take explicit ids). */
function makeContactExecutor(context, runDeps, dispatch) {
  const c = context || {};
  const ec = runDeps.emailConfig || {};
  return makeExecutor({
    ctx: {
      contactId: c.contactId, contactName: c.contactName || c.name, phone: c.phone,
      employeeId: c.employeeId || runDeps.employeeId, accountId: c.accountId, email: c.email,
    },
    prepareInput: async (contract, input) => {
      if (input?.evaluated) return input;
      const isSavedReference = input?.templateId || (input?.id && input?.name);
      if (!isSavedReference && !input?.vars) return input;
      const kinds = {
        sendEmail: 'email',
        createTask: 'task',
        logCall: 'call',
      };
      return evaluateWorkflowTemplate({
        ...input,
        kind: input.kind || kinds[contract] || input.kind,
      }, c);
    },
    sendEmail: async (outbound, ctx) => {
      const to = outbound.to || ctx.email;
      if (!to) throw new Error('no email address for this contact');
      const result = await sendEmail({
        to,
        subject: outbound.subject || '',
        htmlBody: outbound.body || '',
        from: outbound.from || pickFromAddress(outbound, ec.localPart),
        replyMode: outbound.replyMode || 'standalone',
        signature: ec.signature || '',
        config: ec,
        templateId: outbound.templateId || '',
        templateName: outbound.name || '',
        variationId: outbound.variationId || '__original',
        trackingContext: { contactId: ctx.crmContactId || ctx.contactId || '', accountId: ctx.accountId || '' },
      }, { dispatch });
      if (result?.state === 'failed') throw new Error(result.error || 'email send failed');
      return result;
    },
    submitQuickTask,
    submitCallLog,
    updateTaskById,
    completeTaskById,
    updateContact: crmUpdateContact,
  });
}

function prepareWorkflowContact(contact, audience, runDeps = {}) {
  const emailConfig = runDeps.emailConfig || {};
  return hydrateWorkflowContact(contact, audience, {
    dispatch: dispatchBackgroundMessage,
    rep: { employeeId: runDeps.employeeId || '' },
    emailConfig,
    signature: emailConfig.signature || '',
    fromLocalPart: emailConfig.localPart || '',
  });
}

/* ── Run engine (code-driven) ───────────────────────────────────
   React adapter around the policy-complete pure audience runner. */
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
    const {
      workflow,
      code,
      audience,
      user,
      dryRun,
      pipeline = [],
      prepareContact,
      makeExec = null,
    } = args;
    controlRef.current = { paused: false, stopped: false };
    setPaused(false); setComplete(false); setRunning(true);
    const init = {};
    audience.forEach((c) => {
      init[c._key] = {
        status: 'queued',
        label: '',
        ran: 0,
        stepRuns: {},
        stepFailures: {},
        stepOrder: [],
        runtimeSteps: [],
        activeStepId: null,
        pulse: 0,
      };
    });
    setRows(init);
    setProgress({ done: 0, total: audience.length });

    const control = {
      isPaused: () => controlRef.current.paused,
      isStopped: () => controlRef.current.stopped,
    };
    try {
      const output = await runCodeWorkflow({
        workflow,
        audience,
        dryRun,
        control,
        prepareContact,
        executeProgram: async ({
          contact, prepared, beforeEffect, onEffect,
        }) => {
          const evaluateRef = (ref) => evaluateWorkflowTemplate(ref, prepared.context);
          return simulateProgram(code, prepared.page, {
            run: makeSandboxRunner({
              exec: runInSandbox,
              doc: prepared.context?.doc,
              evaluateRef,
            }),
            user,
            executor: makeExec ? makeExec(contact, prepared) : null,
            beforeEffect,
            onEffect,
            evaluateRef,
          });
        },
        on: {
          contactStart: (contact) => {
            setRows((current) => ({
              ...current,
              [contact._key]: {
                ...(current[contact._key] || {}),
                status: 'sending',
              },
            }));
          },
          effect: async ({ contact, event }) => {
            setRows((current) => ({
              ...current,
              [contact._key]: advanceRunRow(current[contact._key], event, pipeline),
            }));
            // A dry run has no delivery pacing, so briefly yield after each
            // effect. This gives repeated source steps a visible flash instead
            // of React batching the entire loop into one final dot.
            if (dryRun) {
              await new Promise((resolve) => setTimeout(resolve, 140));
            }
          },
          contactDone: (summary) => {
            setRows((current) => ({
              ...current,
              [summary.contact._key]: finishRunRow(
                current[summary.contact._key],
                summary,
                pipeline,
              ),
            }));
          },
          progress: ({ done, total }) => setProgress({ done, total }),
        },
      });
      setComplete(!output.stopped);
    } finally {
      setRunning(false);
    }
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

function RunPipeline({ pipeline, row }) {
  const steps = displayRunPipeline(pipeline, row);
  const shown = steps.length ? steps : [{
    id: 'program',
    label: 'Program',
    runs: 0,
    failed: false,
  }];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', minWidth: 20 }}>
      {shown.map((step, i) => {
        const done = step.runs > 0;
        const active = row.status === 'sending' && row.activeStepId === step.id;
        const color = step.failed
          ? 'var(--gb-error-fg)'
          : done || active ? 'var(--gb-brand-label)' : 'var(--gb-text-ghost)';
        return (
          <React.Fragment key={step.id}>
            {i > 0 && <span style={{
              width: 10, height: 1.5,
              background: done ? 'var(--gb-brand-label)' : 'var(--gb-border-default)',
              transition: 'background-color .2s ease',
            }} />}
            <span title={`${step.label}${step.runs > 1 ? ` · repeated ${step.runs}×` : ''}`} style={{
              position: 'relative',
              width: active ? 10 : 8,
              height: active ? 10 : 8,
              borderRadius: '50%',
              background: done || active ? color : 'transparent',
              border: `1.5px solid ${color}`,
              flexShrink: 0,
              transition: 'width .16s ease, height .16s ease, background-color .16s ease, border-color .16s ease',
            }}>
              {active && (
                <span key={`${step.id}-${row.pulse || 0}`} style={{
                  position: 'absolute', inset: -1.5, borderRadius: '50%',
                  border: '1.5px solid var(--gb-brand-label)',
                  pointerEvents: 'none',
                  animation: 'workflow-repeat-hit .48s ease-out both',
                }} />
              )}
              {step.runs > 1 && (
                <span style={{
                  position: 'absolute', left: '50%', top: -13, transform: 'translateX(-50%)',
                  minWidth: 16, height: 11, padding: '0 3px', borderRadius: 999,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)',
                  color: 'var(--gb-brand-label)', fontSize: 7.5, fontWeight: 800,
                  fontFamily: 'var(--gb-font-mono)', lineHeight: 1, whiteSpace: 'nowrap',
                }}>×{step.runs}</span>
              )}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function AudienceRunView({ workflow, audience, pipeline, runner, dryRun, onExit }) {
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
        <div style={{ width: 36, height: 36, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: (running && !paused) ? 'workflow-running 1.8s ease-in-out infinite' : 'none' }}><I.send size={15} /></div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>{dryRun ? 'Dry-run · no CRM changes' : 'Running workflow'}</div>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--gb-text-primary)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{workflow.name}</span>
            {paused && <Tag tone="warning" size="xs">Paused</Tag>}
            {complete && <Tag tone="brand" size="xs">Complete</Tag>}
            {dryRun && <Tag tone="neutral" size="xs">DRY RUN</Tag>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 18, paddingLeft: 18, borderLeft: '1px solid var(--gb-border-default)' }}>
          <Tally label="Audience" value={total} />
          {audValue > 0 && <Tally label="Value" value={fmtMoney(audValue)} tone="var(--gb-success-fg)" />}
          <Tally label="Running" value={counts.sending} tone="var(--gb-brand-label)" />
          <Tally label="Completed" value={counts.sent} tone="var(--gb-success-fg)" />
          <Tally label="Skipped" value={counts.skipped} />
          {counts.failed > 0 && <Tally label="Failed" value={counts.failed} tone="var(--gb-error-fg)" />}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 3, background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>
          {paused
            ? <Btn size="sm" variant="tinted" status="brand" icon={<I.play />} onClick={resume}>Resume</Btn>
            : complete
              ? dryRun
                ? <Btn size="sm" variant="tinted" status="brand" icon={<I.refresh />} onClick={again}>Run dry-run again</Btn>
                : null
              : <Btn size="sm" variant="tinted" status="warning" icon={<I.pause />} onClick={pause}>Pause</Btn>}
          {complete && (
            <Btn size="sm" variant="ghost" icon={<I.chevr style={{ transform: 'rotate(180deg)' }} />} onClick={exit}>
              Back to workflows
            </Btn>
          )}
          {!complete && <Btn size="sm" variant="ghost" icon={<I.close />} onClick={exit}>Stop &amp; edit</Btn>}
        </div>
      </div>
      <div style={{ height: 4, background: 'var(--gb-fill-inverse-medium)', borderBottom: '1px solid var(--gb-border-default)', flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--gb-brand) 0%, var(--gb-brand-label) 100%)', boxShadow: '0 0 8px var(--gb-brand-label)', transition: 'width .35s ease' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '36px 1.4fr 1.1fr auto 1.1fr 120px', gap: 14, padding: '9px 22px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)', fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-text-muted)', flexShrink: 0 }}>
        <div /><div>Contact</div><div>Email</div><div>Execution flow</div><div>Last step</div><div style={{ textAlign: 'right' }}>State</div>
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
              <RunPipeline pipeline={pipeline} row={st} />
              <div style={{ minWidth: 0 }}>
                <div title={st.status === 'failed' ? (st.firstError || st.label || '') : undefined} style={{ fontSize: 11.5, fontWeight: 600, color: st.status === 'failed' ? 'var(--gb-error-fg)' : 'var(--gb-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.label || (st.status === 'queued' ? 'Up next' : '—')}</div>
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
function StatsStrip({ program, workflow, dirty, onSave }) {
  const ratePerMin = Math.round(60 / Math.max(workflow.paceDelay || 12, 1));
  const isValid = program.errors.length === 0 && program.stepCount > 0;
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
      <Cell icon={<I.zap />} tone="brand" k="Pacing" v={`~${ratePerMin}/min`} sub={`${workflow.paceDelay || 12}s`} />
      <Divider />
      <Cell icon={<I.send />} k="Steps" v={program.stepCount} />
      <Divider />
      <Cell icon={<I.branch />} tone={program.branchCount ? 'warning' : 'neutral'} k="Branches" v={program.branchCount} />
      <div style={{ flex: 1 }} />
      <Cell icon={isValid ? <I.check /> : <I.alert />} tone={isValid ? 'success' : 'warning'} k={isValid ? 'Valid' : 'Issues'} v={isValid ? 'OK' : (program.errors.length || 'empty')} />
      <Divider />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 6 }}>
        <Btn variant="primary" size="sm" icon={<I.check />} onClick={onSave} disabled={!dirty}>{dirty ? 'Save workflow' : 'Saved'}</Btn>
      </div>
    </div>
  );
}

/* ── Workflow settings (right sidebar in Blocks view) — the original
   pacing / delivery / order controls. ── */
function WorkflowSettings({ workflow, onChange }) {
  const upd = (patch) => onChange({ ...workflow, ...patch });
  const ratePerMin = Math.round(60 / Math.max(workflow.paceDelay || 12, 1));
  const paceLo = Math.max(1, (workflow.paceDelay || 0) - (workflow.paceJitter || 0));
  const paceHi = (workflow.paceDelay || 0) + (workflow.paceJitter || 0);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Workflow settings</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <SectionLabel>Identity</SectionLabel>
          <Field label="Workflow name" hint="Shown in the workflow library and run history">
            <Input
              value={workflow.name || ''}
              placeholder="Workflow name"
              leading={<I.megaphone size={13} />}
              onChange={(name) => upd({ name })}
            />
          </Field>
        </div>
        <div>
          <SectionLabel>Status</SectionLabel>
          <div style={{ display: 'flex', gap: 5 }}>
            {['Draft', 'Active', 'Paused'].map((s) => (
              <PillTag key={s} on={workflow.status === s} onClick={() => upd({ status: s })}>
                <Dot tone={s === 'Active' ? 'brand' : s === 'Paused' ? 'warning' : 'muted'} glow={s === 'Active'} /> {s}
              </PillTag>
            ))}
          </div>
        </div>
        <div>
          <SectionLabel>Pacing</SectionLabel>
          {/* Rate on its own row (no baseline conflict with the caption), with
              a short one-line description beneath so nothing wraps oddly. */}
          <div style={{ padding: 12, background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', borderRadius: 'var(--gb-r-md)', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <I.zap size={14} style={{ color: 'var(--gb-brand-label)', flex: 'none' }} />
              <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', lineHeight: 1, color: 'var(--gb-brand-label)' }}>~{ratePerMin}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-brand-label)' }}>/min</span>
            </div>
            <div style={{ marginTop: 5, fontSize: 10.5, lineHeight: 1.4, color: 'var(--gb-text-tertiary)' }}>
              Estimated actions per minute — the run advances only while this tab stays open.
            </div>
          </div>
          <Field label="Delay between actions" hint={`Random ${paceLo}–${paceHi}s wait before each action.`}>
            <RangeSlider values={[paceLo, paceHi]} min={1} max={90} step={1} unit="s" onChange={([a, b]) => upd({ paceDelay: Math.round((a + b) / 2), paceJitter: Math.round((b - a) / 2) })} />
          </Field>
        </div>
        <div>
          <SectionLabel>Delivery</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 12, background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)' }}>
            <Checkbox checked={workflow.suppressDoNotContact !== false} label="Skip “do not contact”" hint="Name or email contains the phrase (any case)" onChange={(v) => upd({ suppressDoNotContact: v })} />
            <Checkbox checked={workflow.suppressBounced !== false} label="Skip bounced contacts" hint="Contacts with a CRM bounce code" onChange={(v) => upd({ suppressBounced: v })} />
            <Checkbox checked={workflow.suppressMailerRemoved !== false} label="Skip mailer-removed contacts" hint="Opted out of mailings" onChange={(v) => upd({ suppressMailerRemoved: v })} />
          </div>
          <div style={{ height: 12 }} />
          <Field label="Audience order" hint="The order contacts are worked through this run">
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {[['list', 'As selected'], ['valueDesc', 'Highest value'], ['shuffle', 'Shuffle']].map(([id, label]) => (
                <PillTag key={id} on={(workflow.audienceOrder || 'list') === id} onClick={() => upd({ audienceOrder: id })}>{label}</PillTag>
              ))}
            </div>
          </Field>
          <div style={{ height: 12 }} />
          <Field label={<span>Send cap <span style={{ color: 'var(--gb-text-muted)', fontWeight: 500 }}>· {workflow.sendCap ? `${workflow.sendCap} per run` : 'no cap'}</span></span>} hint="Stop the run after this many actions — 0 = unlimited">
            <Input value={String(workflow.sendCap || 0)} mono onChange={(v) => upd({ sendCap: Math.max(0, parseInt(v.replace(/[^0-9]/g, ''), 10) || 0) })} />
          </Field>
        </div>
      </div>
    </div>
  );
}

/* Real-run confirmation — nothing outward/irreversible fires without this. */
function ConfirmRunModal({ plan, summary, audience, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);
  const audienceLabel = Number(audience || 0).toLocaleString();
  return (
    <div className="gb-workflow-scope" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 2147483601, background: 'var(--gb-backdrop)', backdropFilter: 'var(--gb-backdrop-blur)', WebkitBackdropFilter: 'var(--gb-backdrop-blur)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 460, maxWidth: '92vw', background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', boxShadow: 'var(--gb-shadow-modal)', overflow: 'hidden', fontFamily: 'var(--gb-font-sans)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <span style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-warning-tint-medium)', border: '1px solid var(--gb-warning-tint-border)', color: 'var(--gb-warning-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.zap size={15} /></span>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gb-text-primary)' }}>Run for real?</div>
        </div>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--gb-text-secondary)', lineHeight: 1.6 }}>
            This will apply live changes to the CRM — <b>not a dry run</b>. The workflow contains <b>{summary}</b>.
          </div>
          <div style={{ display: 'flex', gap: 18, padding: '10px 12px', background: 'var(--gb-fill-subtle)', borderRadius: 'var(--gb-r-md)' }}>
            <div><div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Contacts</div><div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)' }}>{audienceLabel}</div></div>
            <div><div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Write paths</div><div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)' }}>{plan.effectSteps}</div></div>
            {plan.counts.sendEmail ? <div><div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Email paths</div><div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-warning-fg)' }}>{plan.counts.sendEmail}</div></div> : null}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.5 }}>
            No contact is loaded for this confirmation. After you confirm, each contact is loaded and evaluated once; conditions and loops determine its actual writes at run time.
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '11px 14px', borderTop: '1px solid var(--gb-border-subtle)' }}>
          <Btn variant="ghost" size="sm" disabled={busy} onClick={onCancel}>Cancel</Btn>
          <Btn variant="primary" status="warning" size="sm" icon={<I.zap />} disabled={busy} state={busy ? 'loading' : 'idle'} onClick={() => { setBusy(true); onConfirm(); }}>Run for real</Btn>
        </div>
      </div>
    </div>
  );
}

export function WorkflowManager({ onClose, contacts = [] }) {
  ensureWorkflowStyles();
  const toast = useToast();
  // Modal zoom is a dev setting (mirrors the Gifting Catalog), live-updating
  // from Settings without a reload. The final scale also fits the full editor
  // into the current CSS viewport, which compensates for per-site browser zoom.
  const [devSettings] = useDevSettings();
  const preferredScale = normalizeWorkflowManagerScale(devSettings['workflowManager.scale']);
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
  const scale = fitWorkflowManagerScale(preferredScale, viewport.width, viewport.height);
  // Drive an exit animation: requestClose flips `open` false, the
  // AnimatePresence plays the fade/scale-out, then onExitComplete unmounts.
  const [open, setOpen] = useState(true);
  const requestClose = () => setOpen(false);
  const [library, setLibrary] = useState([]);
  const [workflow, setWorkflow] = useState(() => newWorkflow('Untitled workflow'));
  const [dirty, setDirty] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Which audience member the code simulation runs against (page.contact).
  const [simContactKey, setSimContactKey] = useState(null);
  // The rep's saved templates, exposed to code as user.emails / user.tasks / user.calls.
  const [userData, setUserData] = useState({ emails: [], tasks: [], calls: [] });
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  // Import result from the paste dialog: refresh the library, open the first
  // imported workflow, and surface anything the importer couldn't resolve.
  const onImported = (r) => {
    setImportOpen(false);
    if (!r || r.error) { toast?.error?.('Import failed — ' + (r?.error || 'unknown')); return; }
    setLibrary(r.list);
    const first = r.list[0];
    if (first) { setWorkflow(first); setDirty(false); }
    if (r.unresolved?.length) {
      toast?.warning?.(`Imported ${r.count} — ${r.unresolved.length} template${r.unresolved.length === 1 ? '' : 's'} need picking in the editor`, { duration: 5000 });
    } else {
      toast?.success?.(`Imported ${r.count} workflow${r.count === 1 ? '' : 's'}`);
    }
  };

  // Load workflows once + stay subscribed to store changes.
  useEffect(() => {
    let alive = true;
    loadWorkflows().then((list) => {
      if (!alive) return;
      setLibrary(list);
      if (list.length) setWorkflow(list[0]);
    });
    const unsub = subscribeWorkflows((list) => { if (alive) setLibrary(list); });
    return () => { alive = false; unsub(); };
  }, []);

  // Load the rep's saved email / task / call templates for the user.* binding.
  useEffect(() => {
    let alive = true;
    const emails = new Promise((res) => {
      try {
        chrome.storage.local.get('templates', (o) => res((o?.templates || [])
          .filter((t) => t.enabled !== false && (!t.type || t.type === 'email' || t.type === 'account'))
          .map((t) => ({
            id: t.id,
            name: t.name,
            kind: 'email',
            subject: t.subject || '',
            body: t.body || '',
            variations: Array.isArray(t.variations) ? t.variations : [],
            vars: t.vars || {},
            toField: t.toField || null,
            replyMode: t.replyMode || 'standalone',
            senderAccount: t.senderAccount,
            senderRandomize: !!t.senderRandomize,
          }))));
      } catch { res([]); }
    });
    Promise.all([emails, loadTaskTemplates(), loadCallTemplates()]).then(([em, tasks, calls]) => {
      if (!alive) return;
      setUserData({
        emails: em,
        tasks: (tasks || []).map((t) => ({
          id: t.id,
          name: t.name,
          kind: 'task',
          subject: t.subject || '',
          body: t.body || '',
          priority: t.priority,
          daysOut: t.daysOut,
          categoryId: t.categoryId,
        })),
        calls: (calls || []).map((c) => ({
          id: c.id,
          name: c.name,
          kind: 'call',
          subject: c.subject || '',
          body: c.body || '',
          callDirection: c.callDirection,
          callCategory: c.callCategory,
          callVoicemail: c.callVoicemail,
        })),
      });
      setTemplatesLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  const patchWorkflow = (next) => { setWorkflow(next); setDirty(true); };

  const selectWorkflow = (id) => {
    const c = library.find((x) => x.id === id);
    if (c) { setWorkflow(c); setDirty(false); }
  };
  const createWorkflow = () => {
    setWorkflow(newWorkflow('Untitled workflow')); setDirty(true);
  };
  const deleteWorkflow = (id) => {
    const removed = library.find((c) => c.id === id);
    removeWorkflow(id).then((list) => {
      setLibrary(list);
      // If we deleted the open workflow, fall back to the first remaining
      // one (or a fresh untitled draft if the library is now empty).
      if (workflow.id === id) {
        setWorkflow(list[0] || newWorkflow('Untitled workflow')); setDirty(!list.length);
      }
      toast?.success?.(`Deleted “${removed?.name || 'workflow'}”`);
    }).catch(() => toast?.error?.('Couldn’t delete workflow'));
  };
  const save = () => {
    saveWorkflow(workflow).then(({ workflow: saved, list }) => {
      setLibrary(list); setWorkflow(saved); setDirty(false);
      toast?.success?.(`Saved “${saved.name}”`);
    }).catch(() => toast?.error?.('Couldn’t save workflow'));
  };

  const audienceKeyed = useMemo(() => contacts.map((c, i) => ({ ...c, _key: c.contactId || c.contactUrl || `row${i}` })), [contacts]);
  // Keep the chosen simulation contact valid as the audience changes.
  useEffect(() => {
    if (!audienceKeyed.length) { setSimContactKey(null); return; }
    setSimContactKey((k) => (audienceKeyed.some((c) => c._key === k) ? k : audienceKeyed[0]._key));
  }, [audienceKeyed]);
  const setAutomation = (src) => patchWorkflow({ ...workflow, automation: src });
  const audienceValue = useMemo(() => contacts.reduce((s, c) => s + (Number(c.value) || 0), 0), [contacts]);

  // Translate the code once — feeds the blocks view + the stats footer.
  const program = useMemo(() => {
    const { blocks, errors } = translateProgram(workflow.automation || '');
    const flat = flattenBlocks(blocks);
    const effectKinds = new Set(['action', 'complete', 'edit']);
    // Steps = every evaluated reference, CRM effect, and final return.
    const stepCount = flat.filter((b) => effectKinds.has(b.kind) || b.kind === 'evaluate' || b.kind === 'return').length;
    // Branches = if / switch.
    const branchCount = flat.filter((b) => b.kind === 'branch' || b.kind === 'cases').length;
    // Pipeline length includes direct page.task completion and contact edits.
    const effectCount = flat.filter((b) => effectKinds.has(b.kind)).length;
    const pipeline = buildRunPipeline(blocks);
    return {
      blocks,
      errors,
      stepCount,
      branchCount,
      effectCount,
      pipeline,
      blockCount: flat.length,
    };
  }, [workflow.automation]);

  const [view, setView] = useState('code');
  const [dryRun, setDryRun] = useState(true);
  const [runMode, setRunMode] = useState(false);
  const [confirmRun, setConfirmRun] = useState(null); // { plan, summary } — real-run gate
  // The token under the caret → the live docs card (Code view right sidebar).
  const [docToken, setDocToken] = useState('');
  const activeDoc = useMemo(() => resolveDoc(docToken), [docToken]);
  // Saved-template names, fed to the editor for autocomplete + missing-dependency lint.
  const bindings = useMemo(() => ({
    ready: templatesLoaded,
    emails: userData.emails.map((e) => e.name).filter(Boolean),
    tasks: userData.tasks.map((t) => t.name).filter(Boolean),
    calls: userData.calls.map((c) => c.name).filter(Boolean),
    emailIds: codeIdsFor(userData.emails),
    taskIds: codeIdsFor(userData.tasks),
    callIds: codeIdsFor(userData.calls),
  }), [userData, templatesLoaded]);
  const runner = useCodeRunner();

  // Expose the code API to an assistant so it can author/edit workflows:
  //   window.__gbWorkflowCodeSpec()  → the machine-readable spec (bindings,
  //     every action + params + gate, page fields, rules, saved templates)
  //   window.__gbWriteWorkflow({name, code}) → create/update a workflow by
  //     name and open it here. Only live while the manager is mounted.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.__gbWorkflowCodeSpec = () => buildCodeSpec(bindings);
    window.__gbWriteWorkflow = async ({ name, code }) => {
      const saved = await writeWorkflowCode({ name, automation: code });
      const list = await loadWorkflows();
      setLibrary(list); setWorkflow(saved); setDirty(false); setView('code');
      return { ok: true, id: saved.id, name: saved.name };
    };
    return () => { delete window.__gbWorkflowCodeSpec; delete window.__gbWriteWorkflow; };
  }, [bindings]); // eslint-disable-line react-hooks/exhaustive-deps
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
    try {
      const prepared = await prepareWorkflowContact(contact, audienceKeyed);
      const evaluateRef = (ref) => evaluateWorkflowTemplate(ref, prepared.context);
      res = await simulateProgram(workflow.automation || '', prepared.page, {
        run: makeSandboxRunner({
          exec: runInSandbox,
          doc: prepared.context?.doc,
          evaluateRef,
        }),
        user: userData,
        evaluateRef,
      });
    }
    catch (e) { if (my === simRunRef.current) { toast?.error?.('Simulate failed — ' + String(e?.message || e)); setSim((s) => ({ ...s, status: 'idle' })); } return; }
    if (my !== simRunRef.current) return;
    if (res.error) toast?.error?.(res.error);
    setSim((s) => ({ ...s, status: 'replaying', trace: res.trace, replayIdx: res.trace.length ? 0 : -1, result: res.result, error: res.error || null }));
  };
  const stopSim = () => { simRunRef.current += 1; if (simTimer.current) { clearTimeout(simTimer.current); simTimer.current = null; } setSim((s) => ({ ...s, status: s.trace.length ? 'done' : 'idle', done: true })); };
  const resetSim = () => { simRunRef.current += 1; if (simTimer.current) { clearTimeout(simTimer.current); simTimer.current = null; } setSim({ status: 'idle', trace: [], replayIdx: -1, done: false, result: null, contactName: '' }); };

  // Replay one ordered trace entry at a time. Function entries are brief
  // invocation pulses; action entries stay longer so their outcome remains
  // readable. Repeated function ids still advance independently and remount
  // the function card animation via its occurrence count.
  useEffect(() => {
    if (sim.status !== 'replaying') return undefined;
    if (sim.replayIdx >= sim.trace.length - 1) {
      simTimer.current = setTimeout(() => setSim((s) => ({ ...s, status: 'done', done: true })), 650);
      return () => { if (simTimer.current) clearTimeout(simTimer.current); };
    }
    const current = sim.trace[sim.replayIdx];
    const replayDelay = current?.kind === 'function' ? 320 : 600;
    simTimer.current = setTimeout(() => setSim((s) => ({ ...s, replayIdx: s.replayIdx + 1 })), replayDelay);
    return () => { if (simTimer.current) clearTimeout(simTimer.current); };
  }, [sim.status, sim.replayIdx, sim.trace]);

  const buildRunDeps = async () => {
    const emailConfig = await readEmailConfig();
    // Resolve against the current page BEFORE the cache. CRM Search exposes
    // the signed-in id through #ccaiFrame; a cache-first read skipped that
    // source and left first-run workflows without an employee id.
    let employeeId = '';
    try { employeeId = await resolveEmployeeId(); } catch { /* fail closed in the writers */ }
    return { emailConfig, employeeId };
  };

  const beginDryRun = () => {
    resetSim(); setRunMode(true);
    runner.start({
      workflow,
      code: workflow.automation || '',
      audience: audienceKeyed,
      user: userData,
      dryRun: true,
      pipeline: program.pipeline,
      prepareContact: (contact, ordered) => prepareWorkflowContact(contact, ordered),
    });
  };

  const beginRealRun = async () => {
    setConfirmRun(null);
    const rd = await buildRunDeps();
    resetSim(); setRunMode(true);
    runner.start({
      workflow,
      code: workflow.automation || '',
      audience: audienceKeyed,
      user: userData,
      dryRun: false,
      pipeline: program.pipeline,
      prepareContact: (contact, ordered) => prepareWorkflowContact(contact, ordered, rd),
      makeExec: (_contact, prepared) => makeContactExecutor(
        prepared.context,
        rd,
        dispatchBackgroundMessage,
      ),
    });
  };

  const startRun = () => {
    if (!audienceKeyed.length) { toast?.warning?.('No audience — launch from a CRM Search / Task selection.'); return; }
    if (!program.effectCount) { toast?.warning?.('Add a CRM action before running.'); return; }
    if (program.errors.length) { toast?.warning?.('Fix the syntax error first.'); return; }
    if (dryRun) { beginDryRun(); return; }
    // Confirm from the parsed source only. Hydration belongs exclusively to
    // the real runner so even a 2,000-contact audience loads each record once,
    // in sequence, with its normal animation and pacing.
    const plan = planRunFromPipeline(program.pipeline, audienceKeyed.length);
    if (!plan.hasEffects) { toast?.warning?.('Nothing to run — no sends/edits/completes.'); return; }
    setConfirmRun({ plan, summary: pipelinePlanSummary(plan) });
  };

  return (
    <AnimatePresence onExitComplete={onClose}>
    {open && (
    <motion.div key="workflow-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      style={{ position: 'fixed', inset: 0, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-backdrop)', backdropFilter: 'var(--gb-backdrop-blur)', WebkitBackdropFilter: 'var(--gb-backdrop-blur)', zIndex: 'var(--gb-z-max)' }}>
      {/* The shared ModalShell (non-draggable card) keeps chrome + the
          bounce-in consistent with every other modal. Fixed-pixel size (not
          vw/vh) lets this surface own one deterministic zoom value; its mount
          root deliberately opts out of the shared Modals scale. The wrapper
          (initial=false ⇒ no entrance, ModalShell owns the bounce-in) plays
          the scale/fade exit on close. */}
      <motion.div className="gb-workflow-scope" initial={false} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }} style={{ display: 'flex' }}>
      <ModalShell width={WORKFLOW_MANAGER_WIDTH} height={WORKFLOW_MANAGER_HEIGHT} style={{ zoom: scale, color: 'var(--gb-text-secondary)' }}>
        <TopBar workflow={workflow} onChange={patchWorkflow} sim={sim}
          onSimStart={startSim} onSimStop={stopSim} onSimReset={resetSim}
          audience={audienceKeyed} simContactKey={simContactKey} onSimContactChange={setSimContactKey}
          audienceCount={contacts.length} audienceValue={audienceValue} onRun={startRun} onClose={requestClose}
          dryRun={dryRun} onDryRunChange={setDryRun} />
        <AnimatePresence mode="wait" initial={false}>
        {runMode ? (
          <AudienceRunView key="run"
            workflow={workflow}
            audience={audienceKeyed}
            pipeline={program.pipeline}
            runner={runner}
            dryRun={dryRun}
            onExit={() => { setRunMode(false); runner.reset(); }}
          />
        ) : (
        <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <WorkflowSidebar library={library} currentId={workflow.id} onSelect={selectWorkflow} onNew={createWorkflow} onDelete={deleteWorkflow} onImport={() => setImportOpen(true)} />
          <CodeAutomationPanel
            value={workflow.automation || ''} onChange={setAutomation}
            blocks={program.blocks} errors={program.errors} blockCount={program.blockCount}
            view={view} onView={setView} onContext={setDocToken} bindings={bindings}
            trace={shownTrace} runningId={runningId} done={sim.status === 'done'} result={sim.status === 'done' ? sim.result : null}
            error={sim.status === 'done' ? sim.error : null} simStatus={sim.status} />
          {/* Contextual right sidebar: live docs while coding (narrow), the
              workflow settings while on the blocks (wider so nothing squishes). */}
          <div style={{ width: view === 'code' ? 288 : 348, flexShrink: 0, borderLeft: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', position: 'relative', minHeight: 0, transition: 'width .18s ease' }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={view === 'code' ? 'docs' : 'settings'}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
                style={{ position: 'absolute', inset: 0, minHeight: 0 }}>
                {view === 'code'
                  ? <CodeDocsSidebar doc={activeDoc} />
                  : <WorkflowSettings workflow={workflow} onChange={patchWorkflow} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <StatsStrip program={program} workflow={workflow} dirty={dirty} onSave={save} />
        </motion.div>
        )}
        </AnimatePresence>
      </ModalShell>
      </motion.div>
      {importOpen && <ImportWorkflowsModal onClose={() => setImportOpen(false)} onDone={onImported} />}
      {confirmRun && <ConfirmRunModal plan={confirmRun.plan} summary={confirmRun.summary} audience={audienceKeyed.length} onConfirm={beginRealRun} onCancel={() => setConfirmRun(null)} />}
    </motion.div>
    )}
    </AnimatePresence>
  );
}

export default WorkflowManager;
