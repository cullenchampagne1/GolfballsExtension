import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Btn, IconBtn, Tag, Dot, Input, Textarea, Checkbox, Field, Dropdown, Switch, Slider, RangeSlider,
  Callout, SectionLabel, PillTag, TemplateSplits, equalWeights, ModalShell,
  TemplatePicker, parseTemplateValue, variationLabel, I, Icon,
} from '../ui/index.js';
import { CampaignConditions } from '../ui/components/template-rules/CampaignConditions.jsx';
import { CodeVarEditor } from '../ui/components/CodeVarEditor.jsx';
import { useToast } from '../ui/components/ToastHost.jsx';
import {
  loadCampaigns, saveCampaign, removeCampaign, newCampaign, newStep, uid, subscribeCampaigns,
} from '../lib/campaign/store.js';
import { loadCallTemplates, CALL_CATEGORY_OPTIONS } from '../lib/callLog.js';
import { loadTaskTemplates, PRIORITY_OPTIONS, DEFAULT_PRIORITY } from '../lib/quickTask.js';
import { runCampaign } from '../lib/campaign/engine.js';
import { parseCampaignBlob, importCampaigns } from '../lib/campaign/campaignImport.js';
import { readEmailConfig } from '../lib/emailSender.js';
import { pickFromAddress } from '../lib/sender.js';
import { useDevSettings } from '../lib/devSettings.js';

/* ───────────────────────────────────────────────────────────────
   CampaignManager — full-page campaign editor.

   Translates the design (campaign-manager-page + -parts) onto the
   project's src/ui stack. Step run-conditions use the shared
   RuleGroups (grouped AND/OR), template splits use the shared
   TemplateSplits (auto-sum-100 weighted picker), and everything
   persists via lib/campaign/store.js. The run engine + audience
   run view land in the next phase; this phase is the editor + the
   per-contact "Simulate" flow preview.
─────────────────────────────────────────────────────────────── */

const sumPct = (templates) => (templates || []).reduce((a, t) => a + (t.pct || 0), 0);

/* A step is "ready" (has something to do) if it has a template, a custom
   inline build, or is a task in a complete-open mode (no template needed). */
function stepHasAction(s) {
  if (s.kind === 'custom') return !!(s.code && s.code.trim());
  if (s.kind === 'task' && (s.taskMode === 'completeAll' || s.taskMode === 'completeLatest')) return true;
  if (s.useCustom) return true;
  return !!s.templateId;
}

/* Branch is a flag, not a kind — these are the real actions. */
const STEP_KIND_META = {
  email:  { label: 'Email',  icon: I.mail,   color: 'var(--gb-brand-tint-medium)',   fg: 'var(--gb-brand-label)' },
  call:   { label: 'Call',   icon: I.phone,  color: 'var(--gb-info-tint-medium, var(--gb-fill-subtle))', fg: 'var(--gb-info-fg, var(--gb-text-secondary))' },
  task:   { label: 'Task',   icon: I.task,   color: 'var(--gb-info-tint-medium, var(--gb-fill-subtle))', fg: 'var(--gb-info-fg, var(--gb-text-secondary))' },
  custom: { label: 'Custom', icon: I.code,   color: 'var(--gb-fill-strong)', fg: 'var(--gb-text-primary)' },
};

const KF_ID = '__gb-campaign-kf';
function ensureCampaignKeyframes() {
  if (typeof document === 'undefined' || document.getElementById(KF_ID)) return;
  const s = document.createElement('style');
  s.id = KF_ID;
  s.textContent = `
    @keyframes cm-step-in    { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
    @keyframes cm-flow       { to   { stroke-dashoffset: -28; } }
    @keyframes cm-pulse-ring { 0%, 100% { box-shadow: 0 0 0 0 var(--gb-brand-tint-strong); } 50% { box-shadow: 0 0 0 6px transparent; } }
    @keyframes cm-running    { 0%, 100% { box-shadow: 0 0 0 0 var(--gb-brand-tint-strong); } 50% { box-shadow: 0 0 0 4px var(--gb-brand-tint-soft), 0 0 18px var(--gb-brand-tint-strong); } }
    @keyframes cm-twinkle    { 0%, 100% { opacity: .4; } 50% { opacity: 1; } }
    @keyframes cm-inspector-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    .gb-cmp-row .gb-cmp-del { opacity: 0; transition: opacity .12s ease; }
    .gb-cmp-row:hover .gb-cmp-del { opacity: 1; }
  `;
  (document.head || document.documentElement).appendChild(s);
}

/* ── Timeline connector (animated when the sim is on this edge) ── */
function Connector({ active, height = 30, tone = 'default', hookRight, hookLeft }) {
  const stroke = active ? 'var(--gb-brand-label)'
    : tone === 'branch' ? 'var(--gb-warning-fg)' : 'var(--gb-border-strong)';
  const dash = active ? '4 4' : '0';
  const anim = active ? { animation: 'cm-flow 1.2s linear infinite' } : null;
  return (
    <div style={{ position: 'relative', height, width: 26, marginLeft: 27, display: 'flex', justifyContent: 'center' }}>
      <svg width={26} height={height} style={{ overflow: 'visible' }}>
        {hookRight
          ? <path d={`M13 0 L13 ${height - 10} Q13 ${height} 23 ${height}`} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} style={anim} />
          : hookLeft
            ? <path d={`M23 0 Q13 0 13 10 L13 ${height}`} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} style={anim} />
            : <path d={`M13 0 L13 ${height}`} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} style={anim} />}
        {active && (
          <circle r="3" fill={stroke}><animate attributeName="cy" from="0" to={height} dur="1.2s" repeatCount="indefinite" /></circle>
        )}
      </svg>
    </div>
  );
}

/* ── Step card (collapsed timeline row) ── */
function StepCard({ step, displayIdx, indent, branchChild, selected, simState, templateLib = {}, onSelect, onDelete, onDuplicate }) {
  const meta = STEP_KIND_META[step.kind] || STEP_KIND_META.email;
  const KIcon = step.branch ? I.branch : meta.icon;
  const live = simState === 'running';
  const done = simState === 'done';
  const tplName = (() => {
    if (step.kind === 'custom') return (step.code || '').trim() ? (step.kill ? 'code · kill flow' : 'code') : 'no code';
    if (step.kind === 'task' && (step.taskMode === 'completeAll' || step.taskMode === 'completeLatest')) {
      return step.taskMode === 'completeLatest' ? 'complete latest task' : 'complete open tasks';
    }
    if (step.useCustom) return step.kind === 'call' ? 'custom call' : 'custom task';
    const tpl = (templateLib[step.kind] || []).find((t) => t.id === step.templateId);
    return tpl?.name || (step.templateId ? 'template' : 'no template');
  })();
  const hasAction = stepHasAction(step);
  const varWeights = Object.entries(step.variationWeights || {});
  const tone = branchChild
    ? { bg: 'var(--gb-warning-tint-soft)', bd: 'var(--gb-warning-tint-border)', bdSel: 'var(--gb-warning-fg)', ring: 'var(--gb-warning-tint-soft)', badgeBg: 'var(--gb-warning-tint-medium)', badgeFg: 'var(--gb-warning-fg)', run: 'var(--gb-warning-fg)' }
    : { bg: 'var(--gb-surface-1)', bd: 'var(--gb-border-default)', bdSel: 'var(--gb-brand-tint-border)', ring: 'var(--gb-brand-tint-soft)', badgeBg: meta.color, badgeFg: meta.fg, run: 'var(--gb-brand-label)' };
  const cond0 = step.conditions?.groups?.[0]?.conditions?.[0];
  const condCount = (step.conditions?.groups || []).reduce((a, g) => a + (g.conditions?.length || 0), 0);

  return (
    <div onClick={() => onSelect(step.id)} className="cm-step"
      style={{
        position: 'relative', marginLeft: indent || 0, background: tone.bg,
        border: '1px solid ' + (live ? tone.run : selected ? tone.bdSel : tone.bd),
        borderRadius: 'var(--gb-r-lg)',
        boxShadow: selected ? `0 0 0 3px ${tone.ring}, 0 6px 18px rgba(0,0,0,.18)` : '0 1px 0 rgba(0,0,0,.12)',
        cursor: 'pointer', overflow: 'hidden',
        transition: 'border-color var(--gb-anim), box-shadow var(--gb-anim), transform var(--gb-anim)',
        transform: selected ? 'translateX(-2px)' : 'none',
        animation: live ? 'cm-running 1.4s ease-in-out infinite' : 'cm-step-in .3s cubic-bezier(.34,1.4,.64,1)',
      }}>
      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 'var(--gb-r-sm)', background: tone.badgeBg,
            border: '1px solid ' + (selected ? tone.bdSel : tone.bd), color: tone.badgeFg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: branchChild ? 10 : 11, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', position: 'relative', flexShrink: 0,
          }}>
            {done ? <I.check size={13} /> : displayIdx}
            {live && <span style={{ position: 'absolute', inset: -3, borderRadius: 8, border: '1.5px solid ' + tone.run, animation: 'cm-pulse-ring 1.2s ease-in-out infinite' }} />}
          </div>
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <KIcon size={12} style={{ color: step.branch ? 'var(--gb-warning-fg)' : meta.fg, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.label}</span>
            {step.branch && <Tag tone="warning" size="xs" style={{ flexShrink: 0 }}>BRANCH</Tag>}
            {step.group && <span style={{ fontSize: 10, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)', flexShrink: 0 }}>· {step.group}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--gb-text-muted)', minWidth: 0, overflow: 'hidden' }}>
            <span style={{ color: 'var(--gb-text-ghost)', flexShrink: 0 }}>{meta.label.toLowerCase()}</span>
            <span style={{ color: 'var(--gb-text-ghost)', flexShrink: 0 }}>·</span>
            <span style={{ color: hasAction ? 'var(--gb-text-tertiary)' : 'var(--gb-text-ghost)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, fontStyle: hasAction ? 'normal' : 'italic' }}>
              {tplName}{varWeights.length > 1 ? ` · ${varWeights.length} variations` : ''}
            </span>
            {condCount > 0 && (
              <>
                <span style={{ color: 'var(--gb-text-ghost)', flexShrink: 0 }}>·</span>
                <span style={{ color: 'var(--gb-warning-fg)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                  if {cond0 ? `${shortRef(cond0)} ${cond0.op}` : 'conditions'}{condCount > 1 ? ` +${condCount - 1}` : ''}
                </span>
              </>
            )}
          </div>
          {varWeights.length > 1 && (
            <div style={{ marginTop: 2, height: 4, borderRadius: 2, background: 'var(--gb-fill-subtle)', overflow: 'hidden', display: 'flex' }}>
              {varWeights.map(([vid, pct], i) => (
                <div key={vid} style={{ width: `${pct}%`, height: '100%', background: i === 0 ? 'var(--gb-brand-label)' : i === 1 ? 'var(--gb-info, var(--gb-text-tertiary))' : 'var(--gb-warning)', opacity: .85, transition: 'width var(--gb-anim)' }} />
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <IconBtn size="xs" variant="ghost" icon={<I.copy />} onClick={(e) => { e.stopPropagation(); onDuplicate(step.id); }} />
          <IconBtn size="xs" variant="ghost" icon={<I.trash />} onClick={(e) => { e.stopPropagation(); onDelete(step.id); }} />
        </div>
      </div>
    </div>
  );
}

function shortRef(cond) {
  if (!cond) return '';
  if (cond.source === 'var') return 'code';
  // schema path — show the leaf (e.g. "orders[any].total" → "total")
  const ref = cond.ref || '';
  return ref.split(/[.[]/).filter(Boolean).pop() || ref || cond.source;
}

/* ── Timeline ── */
function Timeline({ steps, selectedId, sim, templateLib, onSelect, onAdd, onDelete, onDuplicate }) {
  let mainCount = 0;
  let branchChildCount = 0;
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '20px 22px 80px', overflowY: 'auto', background: 'var(--gb-surface-canvas)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gb-text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <I.flow size={15} style={{ color: 'var(--gb-brand-label)' }} /> Flow
          </div>
          <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--gb-text-muted)' }}>{steps.length} steps · stops after first branch sends</div>
        </div>
        <div style={{ flex: 1 }} />
        {sim.running && <Tag tone="brand" size="md" icon={<I.play size={9} />}>SIMULATING · {sim.activeIdx + 1}/{steps.length}</Tag>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {steps.map((step, idx) => {
          const prev = steps[idx - 1];
          const next = steps[idx + 1];
          const isChild = !!step.parentId;
          const wasChild = !!(prev && prev.parentId);
          const childOfSame = isChild && prev && prev.parentId === step.parentId;
          const enteringBranch = isChild && !wasChild;
          const leavingBranch = !isChild && wasChild;

          let displayIdx;
          if (isChild) {
            if (!childOfSame) branchChildCount = 0;
            branchChildCount += 1;
            const parentMainIdx = steps.filter((s, i) => i < idx && !s.parentId).length;
            displayIdx = `${parentMainIdx}${String.fromCharCode(96 + branchChildCount)}`;
          } else { branchChildCount = 0; mainCount += 1; displayIdx = mainCount; }

          const simState = sim.running ? (idx < sim.activeIdx ? 'done' : idx === sim.activeIdx ? 'running' : 'pending') : null;
          const active = sim.running && idx === sim.activeIdx;
          let connectorProps = null;
          if (idx > 0) {
            if (enteringBranch) connectorProps = { tone: 'branch', active, hookRight: true, height: 28 };
            else if (leavingBranch) connectorProps = { tone: 'default', active, hookLeft: true, height: 28 };
            else if (isChild) connectorProps = { tone: 'branch', active, height: 24 };
            else connectorProps = { tone: 'default', active, height: 30 };
          }
          return (
            <React.Fragment key={step.id}>
              {connectorProps && <Connector {...connectorProps} />}
              <StepCard step={step} displayIdx={displayIdx} indent={isChild ? 32 : 0} branchChild={isChild}
                selected={selectedId === step.id} simState={simState} templateLib={templateLib}
                onSelect={onSelect} onDelete={onDelete} onDuplicate={onDuplicate} />
              {isChild && (!next || next.parentId !== step.parentId) && (
                <div style={{ marginLeft: 59, marginTop: 6, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', background: 'var(--gb-warning-tint-medium)', border: '1px solid var(--gb-warning-tint-border)', borderRadius: 'var(--gb-r-pill)', color: 'var(--gb-warning-fg)', fontSize: 9.5, fontWeight: 800, letterSpacing: .8, textTransform: 'uppercase' }}>
                    <Dot tone="warning" size={5} /> Stops campaign
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>Main path resumes if branch didn't fire ↓</span>
                </div>
              )}
            </React.Fragment>
          );
        })}
        <Connector tone="default" height={28} />
        <Btn variant="dashed" size="lg" icon={<I.plus />} onClick={onAdd}>Add step</Btn>
      </div>
    </div>
  );
}

/* ── Branch visualizer (shown for branch steps) ── */
function BranchVisualizer({ step }) {
  const cond = step.conditions?.groups?.[0]?.conditions?.[0];
  const condLabel = cond ? `${shortRef(cond)} ${cond.op}${cond.value ? ' ' + cond.value : ''}` : '(no condition set)';
  const varCount = Object.keys(step.variationWeights || {}).length;
  return (
    <div style={{ padding: 14, background: 'var(--gb-warning-tint-soft)', border: '1px solid var(--gb-warning-tint-border)', borderRadius: 'var(--gb-r-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
        <I.branch size={14} style={{ color: 'var(--gb-warning-fg)' }} />
        <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-warning-fg)' }}>Branch logic</div>
        <div style={{ flex: 1 }} />
        <Tag tone="warning" size="xs">BRANCH</Tag>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 26, textAlign: 'center', fontSize: 9, fontWeight: 800, color: 'var(--gb-warning-fg)' }}>IF</span>
        <div style={{ flex: 1, padding: '7px 11px', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)', fontFamily: 'var(--gb-font-mono)', fontSize: 11.5, color: 'var(--gb-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <I.target size={11} style={{ color: 'var(--gb-warning-fg)', flexShrink: 0 }} /> {condLabel}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 50, flexShrink: 0, fontSize: 9, fontWeight: 800, color: 'var(--gb-success-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}><Dot tone="success" glow size={5} /> TRUE</div>
        <div style={{ flex: 1, padding: 10, background: 'var(--gb-success-tint-soft)', border: '1px solid var(--gb-success-tint-border)', borderRadius: 'var(--gb-r-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <I.zap size={11} style={{ color: 'var(--gb-success-fg)' }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-secondary)' }}>Sends {varCount > 1 ? `1 of ${varCount} variations` : 'its template'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'var(--gb-error-tint-soft)', border: '1px solid var(--gb-error-tint-border)', borderRadius: 'var(--gb-r-sm)' }}>
            <I.alert size={10} style={{ color: 'var(--gb-error-fg)' }} />
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--gb-error-fg)' }}>Campaign STOPS for this recipient</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ width: 50, flexShrink: 0, fontSize: 9, fontWeight: 800, color: 'var(--gb-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}><Dot tone="muted" size={5} /> FALSE</div>
        <div style={{ flex: 1, padding: '8px 10px', background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)' }}>Skips this step · continues to the next step</span>
        </div>
      </div>
    </div>
  );
}

/* ── Custom call / task inline forms ── */
function CustomCallForm({ c, setCustom }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Field label="Category">
        <Dropdown size="sm" value={String(c.callCategory || '')} placeholder="Pick a category…"
          options={CALL_CATEGORY_OPTIONS.filter((o) => o.id !== '0')} onChange={(v) => setCustom({ callCategory: v })} />
      </Field>
      <Field label="Direction">
        <div style={{ display: 'flex', gap: 5 }}>
          {[[0, 'Outbound'], [1, 'Inbound']].map(([id, label]) => (
            <PillTag key={id} on={(c.callDirection | 0) === id} onClick={() => setCustom({ callDirection: id })}>{label}</PillTag>
          ))}
        </div>
      </Field>
      <Field label="Subject"><Input value={c.subject || ''} placeholder="Call subject" onChange={(v) => setCustom({ subject: v })} /></Field>
      <Field label="Notes"><Textarea value={c.body || ''} rows={3} placeholder="What was discussed…" onChange={(v) => setCustom({ body: v })} /></Field>
      <Checkbox checked={!!c.callVoicemail} label="Left a voicemail" onChange={(v) => setCustom({ callVoicemail: v })} />
    </div>
  );
}
function CustomTaskForm({ c, setCustom }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Field label="Subject"><Input value={c.subject || ''} placeholder="Task subject" onChange={(v) => setCustom({ subject: v })} /></Field>
      <Field label="Notes"><Textarea value={c.body || ''} rows={3} placeholder="Task details…" onChange={(v) => setCustom({ body: v })} /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Due in (days)" style={{ flex: 1 }}>
          <Input value={c.daysOut == null ? '' : String(c.daysOut)} mono placeholder="0 = today" onChange={(v) => setCustom({ daysOut: v.replace(/[^0-9]/g, '') })} />
        </Field>
        <Field label="Priority" style={{ flex: 1 }}>
          <Dropdown size="sm" value={String(c.priority || DEFAULT_PRIORITY)} options={PRIORITY_OPTIONS} onChange={(v) => setCustom({ priority: v })} />
        </Field>
      </div>
    </div>
  );
}

/* Custom step config — a full code box (ctx + h + window/document) plus
   flow-control toggles (kill). */
function CustomConfig({ step, upd }) {
  return (
    <div>
      <SectionLabel>Custom code</SectionLabel>
      <CodeVarEditor
        value={step.code || ''}
        onChange={(v) => upd({ code: v })}
        typeId="account"
        varNames={[]}
        hideActions
        placeholder="ctx = contact/account data · h = fetch/send/dom · window.open(url) opens a tab"
      />
      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--gb-text-muted)', lineHeight: 1.5 }}>
        Runs once per contact for side effects. Use <b>h.fetchJson / h.fetchText</b> for requests, <b>h.send(action, payload)</b> for background actions, <b>h.dom / document</b> for the page, and <b>window.open(url)</b> to open a tab.
      </div>
      <div style={{ height: 14 }} />
      <SectionLabel>Flow control</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
        <div style={{ paddingRight: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>Kill the flow after this step</div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>Stops everything for this contact — no later steps (or branch children) run. The code can also <code>return 'kill'</code>.</div>
        </div>
        <Switch on={!!step.kill} tone="warning" onChange={(on) => upd({ kill: on })} />
      </div>
    </div>
  );
}

/* Call / Task config: saved-template vs custom inline, plus the task
   create / complete-open modes. */
function CallTaskConfig({ step, templateLib, upd }) {
  const isCall = step.kind === 'call';
  const tplOptions = (templateLib[step.kind] || []).map((t) => ({ id: t.id, label: t.name }));
  const c = step.custom || {};
  const setCustom = (patch) => upd({ custom: { ...c, ...patch } });
  const taskMode = step.taskMode || 'create';
  const completing = !isCall && taskMode !== 'create';

  return (
    <div>
      {!isCall && (
        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Task action</SectionLabel>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {[['create', 'Create new'], ['completeAll', 'Complete all open'], ['completeLatest', 'Complete latest open']].map(([id, label]) => (
              <PillTag key={id} on={taskMode === id} onClick={() => upd({ taskMode: id })}>{label}</PillTag>
            ))}
          </div>
        </div>
      )}

      {completing ? (
        <Callout tone="info" icon={<I.check />} title="Completes existing tasks">
          {taskMode === 'completeLatest'
            ? "Marks the contact's most recent open task complete."
            : "Marks every open task on the contact complete."} No template needed.
        </Callout>
      ) : (
        <>
          <SectionLabel>{isCall ? 'Call log' : 'New task'}</SectionLabel>
          <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
            <PillTag on={!step.useCustom} onClick={() => upd({ useCustom: false })}>Saved template</PillTag>
            <PillTag on={!!step.useCustom} onClick={() => upd({ useCustom: true })}>Custom</PillTag>
          </div>
          {!step.useCustom ? (
            tplOptions.length ? (
              <Dropdown size="sm" value={step.templateId} placeholder="Choose template…" searchable options={tplOptions} onChange={(tid) => upd({ templateId: tid })} />
            ) : (
              <div style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>No saved {isCall ? 'call' : 'task'} templates — switch to Custom to build one.</div>
            )
          ) : isCall ? (
            <CustomCallForm c={c} setCustom={setCustom} />
          ) : (
            <CustomTaskForm c={c} setCustom={setCustom} />
          )}
        </>
      )}
    </div>
  );
}

/* ── Step inspector ── */
function StepInspector({ step, allSteps, templateLib, onChange, onDelete }) {
  const meta = STEP_KIND_META[step.kind] || STEP_KIND_META.email;
  const MIcon = step.branch ? I.branch : meta.icon;
  const headLabel = step.branch ? 'Branch' : meta.label;
  const headFg = step.branch ? 'var(--gb-warning-fg)' : meta.fg;
  const stepIdx = allSteps.findIndex((s) => s.id === step.id);
  const candidateBranches = allSteps.filter((s, i) => s.branch && s.id !== step.id && i < stepIdx);
  const isEmailKind = step.kind === 'email';
  const tplOptions = (templateLib[step.kind] || []).map((t) => ({ id: t.id, label: t.name }));
  const selectedTpl = (templateLib[step.kind] || []).find((t) => t.id === step.templateId) || null;

  const upd = (patch) => onChange({ ...step, ...patch });

  /* Variation pool for the chosen template (base + saved variations) —
     only for email steps whose template has variations. Mirrors the Quick
     Send popover: the split only appears when there are variations, and the
     weights always sum to 100. */
  const variationItems = (() => {
    const vs = Array.isArray(selectedTpl?.variations) ? selectedTpl.variations : [];
    if (!isEmailKind || vs.length === 0) return [];
    return [{ id: '__original', label: selectedTpl.baseLabel || 'Original' }, ...vs.map((v, i) => ({ id: v.id, label: variationLabel(v, i) }))];
  })();
  const variationWeights = variationItems.length
    ? (Object.keys(step.variationWeights || {}).length ? step.variationWeights : equalWeights(variationItems.map((it) => it.id)))
    : {};

  const onPickTemplate = (tid) => {
    const t = (templateLib[step.kind] || []).find((x) => x.id === tid);
    const vs = Array.isArray(t?.variations) ? t.variations : [];
    const pool = (isEmailKind && vs.length) ? ['__original', ...vs.map((v) => v.id)] : [];
    upd({ templateId: tid, variationWeights: pool.length ? equalWeights(pool) : {} });
  };

  return (
    <div key={step.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, animation: 'cm-inspector-in .22s ease-out' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-modal)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--gb-r-md)', background: step.branch ? 'var(--gb-warning-tint-medium)' : meta.color, border: '1px solid var(--gb-border-default)', color: headFg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MIcon size={15} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: headFg }}>{headLabel} step</div>
          <Input value={step.label} onChange={(v) => upd({ label: v })} style={{ marginTop: 3, height: 28, fontSize: 14, fontWeight: 700 }} />
        </div>
        <IconBtn size="sm" variant="ghost" icon={<I.trash />} onClick={() => onDelete(step.id)} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 80px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {step.branch && <BranchVisualizer step={step} />}

        <div>
          <SectionLabel>Step type</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
            {Object.entries(STEP_KIND_META).map(([k, m]) => {
              const On = k === step.kind;
              const KIcon = m.icon;
              return (
                <button key={k} onClick={() => upd({ kind: k, templateId: '', variationWeights: {} })}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '11px 6px', background: On ? m.color : 'var(--gb-surface-2)', border: '1px solid ' + (On ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), borderRadius: 'var(--gb-r-md)', color: On ? m.fg : 'var(--gb-text-tertiary)', cursor: 'pointer', fontFamily: 'var(--gb-font-sans)', fontSize: 11, fontWeight: 600 }}>
                  <KIcon size={16} /> {m.label}
                </button>
              );
            })}
          </div>
          {/* Branch is a flag on any step — when it fires it stops the
              campaign for that recipient and runs its child steps. */}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>Branch step</div>
              <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>Stops the campaign after firing; child steps run only if it fires.</div>
            </div>
            <Switch on={step.branch} tone="warning" onChange={(on) => upd({ branch: on })} />
          </div>
        </div>

        <div>
          <SectionLabel>Identification</SectionLabel>
          <Field label="Group label" hint="Steps in the same group are mutually exclusive — only the first whose conditions pass runs">
            <Input value={step.group} placeholder="(none)" mono onChange={(v) => upd({ group: v })} />
          </Field>
        </div>

        {candidateBranches.length > 0 && (
          <div>
            <SectionLabel>Branch membership</SectionLabel>
            <Field label="Part of branch" hint="Only runs if the parent branch fires. Renders indented in the timeline.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <PillTag on={!step.parentId} onClick={() => upd({ parentId: null })}>
                  <Dot tone={!step.parentId ? 'brand' : 'muted'} glow={!step.parentId} /> Main path
                </PillTag>
                {candidateBranches.map((b) => {
                  const on = step.parentId === b.id;
                  return (
                    <PillTag key={b.id} on={on} onClick={() => upd({ parentId: b.id })}>
                      <I.branch size={10} style={{ color: on ? 'var(--gb-warning-fg)' : 'var(--gb-text-muted)' }} />
                      <span style={{ color: on ? 'var(--gb-warning-fg)' : 'var(--gb-text-tertiary)', fontWeight: 600 }}>{b.label}</span>
                    </PillTag>
                  );
                })}
              </div>
            </Field>
          </div>
        )}

        {isEmailKind ? (
          <div>
            <SectionLabel>Template</SectionLabel>
            {tplOptions.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>No email templates saved yet.</div>
            ) : (
              /* Same rich picker as the Quick Send popover — shows each
                 template's variation count + expandable variations. We only
                 use the parent selection here; the weighting lives in the
                 variation split below. */
              <TemplatePicker
                mode="random"
                templates={templateLib.email || []}
                value={step.templateId}
                onChange={(composite) => { const [pid] = parseTemplateValue(composite); onPickTemplate(pid); }}
                placeholder="Choose email template…"
                floating={false}
                listMaxHeight={320}
              />
            )}
            {/* Variation split — only when the chosen email template has
                variations; weights always sum to 100 and break down live as
                you drag, same as the Quick Send popover. */}
            {variationItems.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <Field label="Variation split" hint="Each contact rolls one variation, weighted by these.">
                  <TemplateSplits items={variationItems} weights={variationWeights} onChange={(w) => upd({ variationWeights: w })} />
                </Field>
              </div>
            )}
          </div>
        ) : step.kind === 'custom' ? (
          <CustomConfig step={step} upd={upd} />
        ) : (
          <CallTaskConfig step={step} templateLib={templateLib} upd={upd} />
        )}

        <div>
          <CampaignConditions key={step.id} initial={step.conditions} onChange={(tree) => upd({ conditions: tree })} />
        </div>
      </div>
    </div>
  );
}

/* ── Campaign inspector (no step selected) ── */
function CampaignInspector({ campaign, onChange }) {
  const upd = (patch) => onChange({ ...campaign, ...patch });
  const ratePerMin = Math.round(60 / Math.max(campaign.paceDelay, 1));
  // base ± jitter  ↔  [lo, hi] for the dual-handle slider
  const paceLo = Math.max(1, (campaign.paceDelay || 0) - (campaign.paceJitter || 0));
  const paceHi = (campaign.paceDelay || 0) + (campaign.paceJitter || 0);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, animation: 'cm-inspector-in .22s ease-out' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-modal)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-brand-label)' }}>Campaign defaults</div>
        <div style={{ marginTop: 3, fontSize: 14, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Pacing & status</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 80px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <SectionLabel>Name & status</SectionLabel>
          <Field label="Campaign name" required><Input value={campaign.name} onChange={(v) => upd({ name: v })} /></Field>
          <div style={{ height: 8 }} />
          <Field label="Status">
            <div style={{ display: 'flex', gap: 5 }}>
              {['Draft', 'Active', 'Paused'].map((s) => (
                <PillTag key={s} on={campaign.status === s} onClick={() => upd({ status: s })}>
                  <Dot tone={s === 'Active' ? 'brand' : s === 'Paused' ? 'warning' : 'muted'} glow={s === 'Active'} /> {s}
                </PillTag>
              ))}
            </div>
          </Field>
        </div>
        <div>
          <SectionLabel>Pacing</SectionLabel>
          <div style={{ padding: 12, background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', borderRadius: 'var(--gb-r-md)', display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <I.zap size={14} style={{ color: 'var(--gb-brand-label)', alignSelf: 'center' }} />
            <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)' }}>~{ratePerMin}</span>
            <span style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)' }}>sends per minute · runs only while the tab is open</span>
          </div>
          {/* Dual-handle delay range (same control as the Quick Send popover).
              The low/high bounds map to the engine's base ± jitter: base is
              the midpoint, jitter is the half-width. */}
          <Field label={<span>Delay between sends · {paceLo}–{paceHi}s</span>} hint="Each send waits a random time in this range — keeps the run looking human.">
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
          <Field label={<span>Send cap <span style={{ color: 'var(--gb-text-muted)', fontWeight: 500 }}>· {campaign.sendCap ? `${campaign.sendCap} per run` : 'no cap'}</span></span>} hint="Stop the run after this many sends/actions — 0 = unlimited">
            <Input value={String(campaign.sendCap || 0)} mono onChange={(v) => upd({ sendCap: Math.max(0, parseInt(v.replace(/[^0-9]/g, ''), 10) || 0) })} />
          </Field>
        </div>

      </div>
    </div>
  );
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
                    <div style={{ marginTop: 2, fontSize: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{row.steps?.length || 0} steps</div>
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

/* ── Stats strip (footer) ── */
function StatsStrip({ steps, campaign, selectedId, onClearSelection, dirty, onSave }) {
  const branches = steps.filter((s) => s.branch).length;
  const totalConditions = steps.reduce((a, s) => a + (s.conditions?.groups || []).reduce((x, g) => x + (g.conditions?.length || 0), 0), 0);
  const invalid = steps.filter((s) => !stepHasAction(s));
  const isValid = invalid.length === 0 && steps.length > 0;
  const selected = steps.find((s) => s.id === selectedId);
  const selectedIdx = selected ? steps.findIndex((s) => s.id === selectedId) + 1 : null;
  const ratePerMin = Math.round(60 / Math.max(campaign.paceDelay, 1));

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
      <div onClick={selected ? onClearSelection : undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: selected ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)', border: '1px solid ' + (selected ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), borderRadius: 'var(--gb-r-pill)', fontSize: 11, fontWeight: 600, color: selected ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)', cursor: selected ? 'pointer' : 'default', flexShrink: 0 }}>
        <Dot tone={selected ? 'brand' : 'muted'} glow={!!selected} />
        {selected ? <>Editing step {selectedIdx}</> : <>Editing campaign defaults</>}
        {selected && <I.close size={10} style={{ marginLeft: 2 }} />}
      </div>
      <Divider />
      <Cell icon={<I.zap />} tone="brand" k="Pacing" v={`~${ratePerMin}/min`} sub={`${campaign.paceDelay}s${campaign.paceJitter ? ` ±${campaign.paceJitter}` : ''}`} />
      <Divider />
      <Cell icon={<I.flow />} k="Steps" v={steps.length} />
      <Divider />
      <Cell icon={<I.target />} tone={totalConditions > 0 ? 'warning' : 'neutral'} k="Gates" v={totalConditions} sub={`${branches} branch${branches !== 1 ? 'es' : ''}`} />
      <div style={{ flex: 1 }} />
      <Cell icon={isValid ? <I.check /> : <I.alert />} tone={isValid ? 'success' : 'warning'} k={isValid ? 'Valid' : 'Issues'} v={isValid ? 'OK' : invalid.length} />
      <Divider />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 6 }}>
        <Btn variant="primary" size="sm" icon={<I.check />} onClick={onSave} disabled={!dirty}>{dirty ? 'Save campaign' : 'Saved'}</Btn>
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

function TopBar({ campaign, onChange, sim, onSimStart, onSimStop, onSimReset, dirty, audienceCount, audienceValue, onRun, onClose, dryRun, onDryRunChange }) {
  return (
    <div style={{ padding: '12px 22px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.megaphone size={17} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Campaign Manager</div>
          {/* Plain transparent field — flush-left under the label, no box, grows to fill the bar. */}
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
        {/* Total audience value — summed handed-off revenue. Hidden when the
            selection carried no value (e.g. a Task List launch ⇒ $0). */}
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
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 3, background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>
        <IconBtn size="sm" variant="ghost" icon={<I.rewind />} onClick={onSimReset} />
        <Btn variant={sim.running ? 'tinted' : 'secondary'} status={sim.running ? 'warning' : 'brand'} size="sm" icon={sim.running ? <I.pause /> : <I.play />} onClick={sim.running ? onSimStop : onSimStart}>{sim.running ? 'Pause sim' : 'Simulate'}</Btn>
      </div>
      <PillTag on={dryRun} onClick={() => onDryRunChange(!dryRun)}>
        <Dot tone={dryRun ? 'warning' : 'muted'} /> Dry run
      </PillTag>
      <Btn variant="primary" status="brand" size="sm" icon={<I.zap />} onClick={onRun} disabled={sim.running}>{dryRun ? 'Dry run' : 'Run campaign'}</Btn>
      <div style={{ width: 1, height: 26, background: 'var(--gb-border-default)' }} />
      <IconBtn size="md" icon={<I.close />} onClick={onClose} />
    </div>
  );
}

/* ── Run engine bridge ─────────────────────────────────────────
   Wraps lib/campaign/engine.runCampaign, projecting its progress
   callbacks into per-contact row state the AudienceRunView renders.
   Control (pause/resume/stop) is backed by a ref the engine polls. */
const sendBg = (msg) => new Promise((resolve) => {
  try { chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? null : r)); }
  catch { resolve(null); }
});

function useCampaignRunner() {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [complete, setComplete] = useState(false);
  const [rows, setRows] = useState({});            // key -> { status, label, ran }
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const controlRef = useRef({ paused: false, stopped: false });
  const lastArgsRef = useRef(null);

  const start = async (args) => {
    lastArgsRef.current = args;
    const { campaign, audience, lookupTemplate, deps } = args;
    controlRef.current = { paused: false, stopped: false };
    setPaused(false); setComplete(false); setRunning(true);
    const init = {};
    audience.forEach((c) => { init[c._key] = { status: 'queued', label: '', ran: 0 }; });
    setRows(init);
    setProgress({ done: 0, total: audience.length });

    await runCampaign({
      campaign, audience, lookupTemplate, deps,
      control: { isPaused: () => controlRef.current.paused, isStopped: () => controlRef.current.stopped },
      on: {
        contactStart: (c) => setRows((r) => ({ ...r, [c._key]: { ...(r[c._key] || {}), status: 'sending' } })),
        stepResult: ({ contact, step, status }) => setRows((r) => {
          const cur = r[contact._key] || { ran: 0 };
          return { ...r, [contact._key]: { ...cur, label: step.label, ran: status === 'ran' ? (cur.ran || 0) + 1 : (cur.ran || 0) } };
        }),
        contactDone: (s) => setRows((r) => ({
          ...r,
          [s.contact._key]: {
            ...(r[s.contact._key] || {}),
            ran: s.ran,
            status: s.suppressed ? 'suppressed' : s.failed ? 'failed' : s.stoppedAtBranch ? 'stopped' : s.ran > 0 ? 'sent' : 'skipped',
          },
        })),
        progress: (p) => setProgress(p),
        complete: ({ stopped }) => { setRunning(false); setComplete(!stopped); },
      },
    });
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
  suppressed: { fg: 'var(--gb-warning-fg)', bg: 'var(--gb-warning-tint-soft)', bd: 'var(--gb-warning-tint-border)', label: 'Suppressed' },
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
    audience.forEach((a) => {
      const s = rows[a._key]?.status || 'queued';
      const bucket = s === 'suppressed' ? 'skipped' : s; // fold suppressed into the skipped tally
      c[bucket] = (c[bucket] || 0) + 1;
    });
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
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-canvas)', minHeight: 0 }}>
      {/* Header */}
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
          <Tally label="Stopped" value={counts.stopped} tone="var(--gb-warning-fg)" />
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
      {/* Progress */}
      <div style={{ height: 4, background: 'var(--gb-fill-inverse-medium)', borderBottom: '1px solid var(--gb-border-default)', flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--gb-brand) 0%, var(--gb-brand-label) 100%)', boxShadow: '0 0 8px var(--gb-brand-label)', transition: 'width .35s ease' }} />
      </div>
      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '36px 1.4fr 1.1fr auto 1.1fr 120px', gap: 14, padding: '9px 22px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)', fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-text-muted)', flexShrink: 0 }}>
        <div /><div>Contact</div><div>Email</div><div>Pipeline · {mainCount} steps</div><div>Current step</div><div style={{ textAlign: 'right' }}>State</div>
      </div>
      {/* Rows */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {audience.map((c) => {
          const st = rows[c._key] || { status: 'queued', label: '', ran: 0 };
          const tone = RUN_STATUS_TONE[st.status] || RUN_STATUS_TONE.queued;
          const inflight = st.status === 'sending';
          return (
            <div key={c._key} style={{ display: 'grid', gridTemplateColumns: '36px 1.4fr 1.1fr auto 1.1fr 120px', gap: 14, alignItems: 'center', padding: '10px 19px', borderBottom: '1px solid var(--gb-border-subtle)', borderLeft: `3px solid ${inflight ? 'var(--gb-brand-label)' : st.status === 'stopped' ? 'var(--gb-warning)' : st.status === 'sent' ? 'color-mix(in srgb, var(--gb-brand-label) 30%, transparent)' : 'transparent'}`, background: inflight ? 'color-mix(in srgb, var(--gb-brand-tint-soft) 80%, transparent)' : st.status === 'stopped' ? 'color-mix(in srgb, var(--gb-warning-tint-soft) 70%, transparent)' : 'transparent', opacity: st.status === 'sent' || st.status === 'skipped' ? 0.75 : 1, transition: 'background-color .35s, opacity .35s, border-left-color .25s' }}>
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
export function CampaignManager({ onClose, contacts = [] }) {
  ensureCampaignKeyframes();
  const toast = useToast();
  // Modal zoom is a dev setting (mirrors the Gifting Catalog), live-updating
  // from Settings without a reload. Falls back to the long-standing 1.2.
  const [devSettings] = useDevSettings();
  const scale = Number(devSettings['campaignManager.scale']) || 1.2;
  // Drive an exit animation: requestClose flips `open` false, the
  // AnimatePresence plays the fade/scale-out, then onExitComplete unmounts.
  const [open, setOpen] = useState(true);
  const requestClose = () => setOpen(false);
  const [library, setLibrary] = useState([]);
  const [campaign, setCampaign] = useState(() => newCampaign('Untitled campaign'));
  const [selectedId, setSelectedId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [sim, setSim] = useState({ running: false, activeIdx: 0 });
  const [templateLib, setTemplateLib] = useState({ email: [], call: [], task: [] });
  const [dryRun, setDryRun] = useState(false);
  const [runMode, setRunMode] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const runner = useCampaignRunner();
  const simTimer = useRef(null);

  // Import result from the paste dialog: refresh the library, open the first
  // imported campaign, and surface anything the importer couldn't resolve.
  const onImported = (r) => {
    setImportOpen(false);
    if (!r || r.error) { toast?.error?.('Import failed — ' + (r?.error || 'unknown')); return; }
    setLibrary(r.list);
    const first = r.list[0];
    if (first) { setCampaign(first); setSelectedId(null); setDirty(false); }
    if (r.unresolved?.length) {
      toast?.warning?.(`Imported ${r.count} — ${r.unresolved.length} template${r.unresolved.length === 1 ? '' : 's'} need picking in the editor`, { duration: 5000 });
    } else {
      toast?.success?.(`Imported ${r.count} campaign${r.count === 1 ? '' : 's'}`);
    }
  };

  // Load campaigns + the template stores once.
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

  useEffect(() => {
    let alive = true;
    const emails = new Promise((res) => {
      try { chrome.storage.local.get('templates', (o) => res((o?.templates || []).filter((t) => t.enabled !== false && (!t.type || t.type === 'email' || t.type === 'account')))); }
      catch { res([]); }
    });
    Promise.all([emails, loadCallTemplates(), loadTaskTemplates()]).then(([email, call, task]) => {
      if (alive) setTemplateLib({ email, call, task });
    });
    return () => { alive = false; };
  }, []);

  const steps = campaign.steps;
  const selected = steps.find((s) => s.id === selectedId);
  const patchCampaign = (next) => { setCampaign(next); setDirty(true); };
  const updateStep = (next) => patchCampaign({ ...campaign, steps: steps.map((s) => (s.id === next.id ? next : s)) });

  const addStep = () => {
    const s = newStep('email');
    patchCampaign({ ...campaign, steps: [...steps, s] });
    setSelectedId(s.id);
  };
  const deleteStep = (id) => {
    // Orphaned children fall back to the main path.
    const next = steps.filter((s) => s.id !== id).map((s) => (s.parentId === id ? { ...s, parentId: null } : s));
    patchCampaign({ ...campaign, steps: next });
    if (selectedId === id) setSelectedId(null);
  };
  const duplicateStep = (id) => {
    const i = steps.findIndex((s) => s.id === id);
    if (i < 0) return;
    const copy = { ...steps[i], id: uid('s'), label: steps[i].label + ' (copy)', templates: steps[i].templates.map((t) => ({ ...t, id: uid('t') })) };
    patchCampaign({ ...campaign, steps: [...steps.slice(0, i + 1), copy, ...steps.slice(i + 1)] });
  };

  const selectCampaign = (id) => {
    const c = library.find((x) => x.id === id);
    if (c) { setCampaign(c); setSelectedId(null); setDirty(false); setSim({ running: false, activeIdx: 0 }); }
  };
  const createCampaign = () => {
    const c = newCampaign('Untitled campaign');
    setCampaign(c); setSelectedId(null); setDirty(true);
  };
  const deleteCampaign = (id) => {
    const removed = library.find((c) => c.id === id);
    removeCampaign(id).then((list) => {
      setLibrary(list);
      // If we deleted the open campaign, fall back to the first remaining
      // one (or a fresh untitled draft if the library is now empty).
      if (campaign.id === id) {
        const next = list[0] || newCampaign('Untitled campaign');
        setCampaign(next); setSelectedId(null); setDirty(!list.length);
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

  // Simulation: sweep the activeIdx through the steps (flow preview only).
  const startSim = () => { if (!steps.length) return; setSim({ running: true, activeIdx: 0 }); setSelectedId(steps[0].id); };
  const stopSim = () => setSim((s) => ({ ...s, running: false }));
  const resetSim = () => setSim({ running: false, activeIdx: 0 });
  useEffect(() => {
    if (!sim.running) { if (simTimer.current) { clearTimeout(simTimer.current); simTimer.current = null; } return; }
    if (sim.activeIdx >= steps.length - 1) {
      simTimer.current = setTimeout(() => setSim((s) => ({ ...s, running: false, activeIdx: steps.length })), 1300);
      return;
    }
    simTimer.current = setTimeout(() => {
      setSim((s) => ({ ...s, activeIdx: s.activeIdx + 1 }));
      setSelectedId(steps[sim.activeIdx + 1]?.id);
    }, 1200);
    return () => { if (simTimer.current) clearTimeout(simTimer.current); };
  }, [sim.running, sim.activeIdx, steps.length]);

  const startRun = async () => {
    if (!contacts.length) { toast?.warning?.('No audience — launch from a CRM Search / Task selection.'); return; }
    if (!steps.length) { toast?.warning?.('Add at least one step before running.'); return; }
    stopSim();
    // Stable per-row key + the deps the engine delegates with.
    const audience = contacts.map((c, i) => ({ ...c, _key: c.contactId || c.contactUrl || `row${i}` }));
    const [emailConfig, rep] = await Promise.all([
      readEmailConfig(),
      new Promise((res) => { try { chrome.storage.local.get('gbEmployeeId', (d) => res({ employeeId: d?.gbEmployeeId || '' })); } catch { res({ employeeId: '' }); } }),
    ]);
    const lookupTemplate = (kind, id) => (templateLib[kind] || []).find((t) => t.id === id) || null;
    setRunMode(true);
    runner.start({
      campaign,
      audience,
      lookupTemplate,
      deps: { rep, emailConfig, signature: emailConfig.signature, fromLocalPart: emailConfig.localPart, dispatch: sendBg, dryRun },
    });
  };

  const mainCount = steps.filter((s) => !s.parentId).length;
  const audienceValue = useMemo(() => contacts.reduce((s, c) => s + (Number(c.value) || 0), 0), [contacts]);

  return (
    <AnimatePresence onExitComplete={onClose}>
    {open && (
    <motion.div key="cm-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      style={{ position: 'fixed', inset: 0, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-backdrop)', backdropFilter: 'var(--gb-backdrop-blur)', WebkitBackdropFilter: 'var(--gb-backdrop-blur)', zIndex: 'var(--gb-z-max)' }}>
      {/* The shared ModalShell (non-draggable card) keeps chrome + the
          bounce-in consistent with every other modal. Fixed-pixel size (not
          vw/vh) so the modal-scale `zoom` on the mount host scales it
          cleanly; the inline 1.2 zoom is the default size bump and composes
          on top of whatever the modal scaler is set to. The motion wrapper
          (initial=false ⇒ no entrance, ModalShell owns the bounce-in) plays
          the scale/fade exit on close. */}
      <motion.div initial={false} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }} style={{ display: 'flex' }}>
      <ModalShell width={1280} height={760} style={{ maxWidth: `calc(94vw / ${scale})`, maxHeight: `calc(90vh / ${scale})`, zoom: scale, color: 'var(--gb-text-secondary)' }}>
        <TopBar campaign={campaign} onChange={patchCampaign} sim={sim} onSimStart={startSim} onSimStop={stopSim} onSimReset={resetSim}
          dirty={dirty} audienceCount={contacts.length} audienceValue={audienceValue} onRun={startRun} onClose={requestClose}
          dryRun={dryRun} onDryRunChange={setDryRun} />
        {runMode ? (
          <AudienceRunView
            campaign={campaign}
            audience={contacts.map((c, i) => ({ ...c, _key: c.contactId || c.contactUrl || `row${i}` }))}
            mainCount={mainCount}
            runner={runner}
            dryRun={dryRun}
            onExit={() => { setRunMode(false); runner.reset(); }}
          />
        ) : (
        <>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <CampaignSidebar library={library} currentId={campaign.id} onSelect={selectCampaign} onNew={createCampaign} onDelete={deleteCampaign} onImport={() => setImportOpen(true)} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid var(--gb-border-default)' }}>
            <Timeline steps={steps} selectedId={selectedId} sim={sim} templateLib={templateLib} onSelect={setSelectedId} onAdd={addStep} onDelete={deleteStep} onDuplicate={duplicateStep} />
          </div>
          <div style={{ width: 500, flexShrink: 0, background: 'var(--gb-surface-modal)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {selected
              ? <StepInspector step={selected} allSteps={steps} templateLib={templateLib} onChange={updateStep} onDelete={deleteStep} />
              : <CampaignInspector campaign={campaign} onChange={patchCampaign} />}
          </div>
        </div>
        <StatsStrip steps={steps} campaign={campaign} selectedId={selectedId} onClearSelection={() => setSelectedId(null)} dirty={dirty} onSave={save} />
        </>
        )}
      </ModalShell>
      </motion.div>
      {importOpen && <ImportCampaignsModal onClose={() => setImportOpen(false)} onDone={onImported} />}
    </motion.div>
    )}
    </AnimatePresence>
  );
}

export default CampaignManager;
