import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Btn, IconBtn, Tag, Dot, Input, Field, Dropdown, Switch, Slider,
  Callout, SectionLabel, PillTag, TemplateSplits, equalWeights, ModalShell, I, Icon,
} from '../ui/index.js';
import { RuleGroups } from '../ui/components/template-rules/RuleGroups.jsx';
import { useToast } from '../ui/components/ToastHost.jsx';
import {
  loadCampaigns, saveCampaign, removeCampaign, newCampaign, newStep, uid, subscribeCampaigns,
} from '../lib/campaign/store.js';
import {
  opsForCondition, signalOptionGroups, blankConditionForSource, SIGNAL_BY_ID,
} from '../lib/campaign/fields.js';
import { loadCallTemplates } from '../lib/callLog.js';
import { loadTaskTemplates } from '../lib/quickTask.js';
import { runCampaign } from '../lib/campaign/engine.js';
import { readEmailConfig } from '../lib/emailSender.js';
import { pickFromAddress } from '../lib/sender.js';

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

const STEP_KIND_META = {
  email:  { label: 'Email',  icon: I.mail,   color: 'var(--gb-brand-tint-medium)',   fg: 'var(--gb-brand-label)' },
  call:   { label: 'Call',   icon: I.phone,  color: 'var(--gb-info-tint-medium, var(--gb-fill-subtle))', fg: 'var(--gb-info-fg, var(--gb-text-secondary))' },
  task:   { label: 'Task',   icon: I.task,   color: 'var(--gb-info-tint-medium, var(--gb-fill-subtle))', fg: 'var(--gb-info-fg, var(--gb-text-secondary))' },
  branch: { label: 'Branch', icon: I.branch, color: 'var(--gb-warning-tint-medium)', fg: 'var(--gb-warning-fg)' },
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
function StepCard({ step, displayIdx, indent, branchChild, selected, simState, onSelect, onDelete, onDuplicate }) {
  const meta = STEP_KIND_META[step.kind] || STEP_KIND_META.email;
  const KIcon = meta.icon;
  const live = simState === 'running';
  const done = simState === 'done';
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
            <KIcon size={12} style={{ color: meta.fg, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.label}</span>
            {step.branch && <Tag tone="warning" size="xs" style={{ flexShrink: 0 }}>BRANCH</Tag>}
            {step.group && <span style={{ fontSize: 10, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)', flexShrink: 0 }}>· {step.group}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--gb-text-muted)', minWidth: 0, overflow: 'hidden' }}>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
              {step.kind === 'email' || step.kind === 'branch'
                ? (step.subject ? <><span style={{ color: 'var(--gb-text-ghost)' }}>subj</span> {step.subject}</> : <span style={{ color: 'var(--gb-text-ghost)', fontStyle: 'italic' }}>no subject</span>)
                : <span style={{ color: 'var(--gb-text-tertiary)' }}>{meta.label} action</span>}
            </span>
            <span style={{ color: 'var(--gb-text-ghost)', flexShrink: 0 }}>·</span>
            <span style={{ color: 'var(--gb-text-tertiary)', whiteSpace: 'nowrap' }}>
              {(step.templates || []).filter((t) => t.templateId).length || 0} template{((step.templates || []).filter((t) => t.templateId).length) === 1 ? '' : 's'}
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
          {step.templates && step.templates.length > 1 && (
            <div style={{ marginTop: 2, height: 4, borderRadius: 2, background: 'var(--gb-fill-subtle)', overflow: 'hidden', display: 'flex' }}>
              {step.templates.map((t, i) => (
                <div key={t.id} style={{ width: `${t.pct}%`, height: '100%', background: i === 0 ? 'var(--gb-brand-label)' : i === 1 ? 'var(--gb-info, var(--gb-text-tertiary))' : 'var(--gb-warning)', opacity: .85, transition: 'width var(--gb-anim)' }} />
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
  if (cond.source === 'signal') return SIGNAL_BY_ID[cond.ref]?.label?.split(' — ')[0] || cond.ref;
  return cond.ref || cond.source;
}

/* ── Timeline ── */
function Timeline({ steps, selectedId, sim, onSelect, onAdd, onDelete, onDuplicate }) {
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
                selected={selectedId === step.id} simState={simState}
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
  const tplCount = (step.templates || []).filter((t) => t.templateId).length;
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
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-secondary)' }}>Sends {tplCount > 1 ? `${tplCount} templates` : 'its template'}</span>
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

/* ── Condition subject cell (RuleGroups renderSubject) ── */
const SIGNAL_GROUPS = signalOptionGroups();
function ConditionSubject({ condition, patch }) {
  const source = condition.source || 'signal';
  const setSource = (src) => patch(blankConditionForSource(src));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[['signal', 'Signal'], ['schema', 'Field'], ['var', 'Code']].map(([id, label]) => {
          const on = source === id;
          return (
            <button key={id} type="button" onClick={() => setSource(id)}
              style={{ flex: 1, height: 22, border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-surface-2)', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)', borderRadius: 4, fontSize: 9.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--gb-font-sans)' }}>{label}</button>
          );
        })}
      </div>
      {source === 'signal' && (
        <Dropdown size="sm" value={condition.ref} placeholder="Pick a signal…"
          options={SIGNAL_GROUPS.flatMap((g) => g.options.map((o) => ({ ...o, group: g.group })))}
          onChange={(ref) => {
            const t = SIGNAL_BY_ID[ref]?.type || 'string';
            patch({ ref, type: t, op: t === 'number' ? 'gte' : 'contains' });
          }} />
      )}
      {source === 'schema' && (
        <Input size="sm" mono value={condition.ref} placeholder="contact.firstName / orders[any].total"
          onChange={(ref) => patch({ ref })} />
      )}
      {source === 'var' && (
        <Input size="sm" mono value={condition.ref} placeholder="code expression → value"
          onChange={(ref) => patch({ ref })} />
      )}
    </div>
  );
}

/* ── Step inspector ── */
function StepInspector({ step, allSteps, templateLib, onChange, onDelete }) {
  const meta = STEP_KIND_META[step.kind] || STEP_KIND_META.email;
  const MIcon = meta.icon;
  const stepIdx = allSteps.findIndex((s) => s.id === step.id);
  const candidateBranches = allSteps.filter((s, i) => s.branch && i < stepIdx);
  const storeKind = step.kind === 'branch' ? 'email' : step.kind;
  const tplOptions = (templateLib[storeKind] || []).map((t) => ({ id: t.id, label: t.name }));

  const upd = (patch) => onChange({ ...step, ...patch });
  const setTplWeights = (weights) => upd({ templates: step.templates.map((t) => ({ ...t, pct: Math.round(weights[t.id] ?? t.pct) })) });
  const setTplId = (rowId, templateId) => upd({ templates: step.templates.map((t) => (t.id === rowId ? { ...t, templateId } : t)) });
  const addTpl = () => {
    const rows = [...step.templates, { id: uid('t'), templateId: '', pct: 0 }];
    const eq = equalWeights(rows.map((r) => r.id));
    upd({ templates: rows.map((r) => ({ ...r, pct: Math.round(eq[r.id]) })) });
  };
  const delTpl = (rowId) => {
    const rows = step.templates.filter((t) => t.id !== rowId);
    const eq = equalWeights(rows.map((r) => r.id));
    upd({ templates: rows.map((r) => ({ ...r, pct: Math.round(eq[r.id]) })) });
  };

  const weights = Object.fromEntries(step.templates.map((t) => [t.id, t.pct]));
  const splitItems = step.templates.map((t) => ({ id: t.id, templateId: t.templateId }));

  return (
    <div key={step.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, animation: 'cm-inspector-in .22s ease-out' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-modal)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--gb-r-md)', background: meta.color, border: '1px solid var(--gb-border-default)', color: meta.fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MIcon size={15} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: meta.fg }}>{meta.label} step</div>
          <Input value={step.label} onChange={(v) => upd({ label: v })} style={{ marginTop: 3, height: 28, fontSize: 14, fontWeight: 700 }} />
        </div>
        <IconBtn size="sm" variant="ghost" icon={<I.trash />} onClick={() => onDelete(step.id)} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 80px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {step.kind === 'branch' && <BranchVisualizer step={step} />}

        <div>
          <SectionLabel>Step type</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
            {Object.entries(STEP_KIND_META).map(([k, m]) => {
              const On = k === step.kind;
              const KIcon = m.icon;
              return (
                <button key={k} onClick={() => upd({ kind: k, branch: k === 'branch' })}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '11px 6px', background: On ? m.color : 'var(--gb-surface-2)', border: '1px solid ' + (On ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), borderRadius: 'var(--gb-r-md)', color: On ? m.fg : 'var(--gb-text-tertiary)', cursor: 'pointer', fontFamily: 'var(--gb-font-sans)', fontSize: 11, fontWeight: 600 }}>
                  <KIcon size={16} /> {m.label}
                </button>
              );
            })}
          </div>
          {step.kind !== 'branch' && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>Branch step</div>
                <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>Stops the campaign after firing.</div>
              </div>
              <Switch on={step.branch} onChange={(on) => upd({ branch: on })} />
            </div>
          )}
        </div>

        <div>
          <SectionLabel>Identification</SectionLabel>
          {(step.kind === 'email' || step.kind === 'branch') && (
            <>
              <Field label="Subject tag" hint="Non-personalized portion used for grouping / gating">
                <Input value={step.subject} placeholder="e.g. Srixon Promo" onChange={(v) => upd({ subject: v })} />
              </Field>
              <div style={{ height: 8 }} />
            </>
          )}
          <Field label="Group label" hint="Steps in the same group are mutually exclusive">
            <Input value={step.group} placeholder="(none)" mono onChange={(v) => upd({ group: v })} />
          </Field>
        </div>

        {step.kind !== 'branch' && candidateBranches.length > 0 && (
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

        <div>
          <SectionLabel>Template splits</SectionLabel>
          {tplOptions.length === 0 && (
            <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--gb-text-muted)' }}>No {meta.label.toLowerCase()} templates saved yet.</div>
          )}
          <TemplateSplits
            items={splitItems}
            weights={weights}
            onChange={setTplWeights}
            onAdd={addTpl}
            onRemove={delTpl}
            addLabel="Add template"
            renderLabel={(it) => (
              <Dropdown size="sm" value={it.templateId} placeholder="Choose template…" searchable
                options={tplOptions} onChange={(tid) => setTplId(it.id, tid)} />
            )}
          />
        </div>

        <div>
          <RuleGroups
            key={step.id}
            initial={step.conditions}
            defaultSource="signal"
            renderSubject={(condition, patch) => <ConditionSubject condition={condition} patch={patch} />}
            opsFor={opsForCondition}
            onChange={(tree) => upd({ conditions: tree })}
            label="Run conditions"
            emptyHint="No conditions — this step always runs. Add a group to gate it (e.g. sent E1 and no reply)."
          />
        </div>
      </div>
    </div>
  );
}

/* ── Campaign inspector (no step selected) ── */
function CampaignInspector({ campaign, onChange }) {
  const upd = (patch) => onChange({ ...campaign, ...patch });
  const ratePerMin = Math.round(60 / Math.max(campaign.paceDelay, 1));
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
          <Field label={<span>Delay between sends · {campaign.paceDelay}s</span>}>
            <Slider value={campaign.paceDelay} min={1} max={60} unit="s" showValue={false} ticks={[5, 15, 30, 60]} onChange={(v) => upd({ paceDelay: v })} />
          </Field>
          <div style={{ height: 12 }} />
          <Field label={<span>Jitter ± · {campaign.paceJitter === 0 ? 'none' : campaign.paceJitter + 's'}</span>} hint="Random offset so sends don't fire on the exact same beat">
            <Slider value={campaign.paceJitter} min={0} max={15} unit="s" showValue={false} onChange={(v) => upd({ paceJitter: v })} />
          </Field>
        </div>
        <Callout tone="info" icon={<I.sparkle />} title="Branch behavior">
          Once a branch step sends, no later sibling steps run for that recipient.
        </Callout>
      </div>
    </div>
  );
}

/* ── Sidebar ── */
function CampaignSidebar({ library, currentId, onSelect, onNew }) {
  const [q, setQ] = useState('');
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
              return (
                <div key={row.id} onClick={() => onSelect(row.id)} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 9, alignItems: 'center', padding: '8px 10px', background: cur ? 'var(--gb-brand-tint-soft)' : 'transparent', border: '1px solid ' + (cur ? 'var(--gb-brand-tint-border)' : 'transparent'), borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', marginBottom: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}><Dot tone={row.status === 'Active' ? 'brand' : row.status === 'Paused' ? 'warning' : 'muted'} glow={row.status === 'Active'} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: cur ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</div>
                    <div style={{ marginTop: 2, fontSize: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{row.steps?.length || 0} steps</div>
                  </div>
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
  const invalid = steps.filter((s) => sumPct(s.templates) !== 100 || s.templates.some((t) => !t.templateId));
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
function TopBar({ campaign, onChange, sim, onSimStart, onSimStop, onSimReset, dirty, audienceCount, onRun, onClose, dryRun, onDryRunChange }) {
  return (
    <div style={{ padding: '12px 22px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.megaphone size={17} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', width: 240, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Campaign Manager</div>
          {/* Plain transparent field — flush-left under the label, no box. */}
          <input value={campaign.name} onChange={(e) => onChange({ ...campaign, name: e.target.value })}
            style={{ marginTop: 2, width: '100%', height: 24, background: 'transparent', border: 'none', outline: 'none', padding: 0, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 16, fontWeight: 800, letterSpacing: -.3 }} />
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px 5px 7px', background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-pill)' }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.users size={12} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Audience</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)' }}>{audienceCount}</span>
        </div>
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
            status: s.failed ? 'failed' : s.stoppedAtBranch ? 'stopped' : s.ran > 0 ? 'sent' : 'skipped',
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

/* ── Root ── */
export function CampaignManager({ onClose, contacts = [] }) {
  ensureCampaignKeyframes();
  const toast = useToast();
  const [library, setLibrary] = useState([]);
  const [campaign, setCampaign] = useState(() => newCampaign('Untitled campaign'));
  const [selectedId, setSelectedId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [sim, setSim] = useState({ running: false, activeIdx: 0 });
  const [templateLib, setTemplateLib] = useState({ email: [], call: [], task: [] });
  const [dryRun, setDryRun] = useState(false);
  const [runMode, setRunMode] = useState(false);
  const runner = useCampaignRunner();
  const simTimer = useRef(null);

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

  return (
    <div style={{ position: 'fixed', inset: 0, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-backdrop)', backdropFilter: 'var(--gb-backdrop-blur)', WebkitBackdropFilter: 'var(--gb-backdrop-blur)', zIndex: 2147483000 }}>
      {/* The shared ModalShell (non-draggable card) keeps chrome + the
          bounce-in consistent with every other modal. Fixed-pixel size (not
          vw/vh) so the modal-scale `zoom` on the mount host scales it
          cleanly; the inline 1.2 zoom is the default size bump and composes
          on top of whatever the modal scaler is set to. */}
      <ModalShell width={1180} height={760} style={{ maxWidth: '94vw', maxHeight: '90vh', zoom: 1.2, color: 'var(--gb-text-secondary)' }}>
        <TopBar campaign={campaign} onChange={patchCampaign} sim={sim} onSimStart={startSim} onSimStop={stopSim} onSimReset={resetSim}
          dirty={dirty} audienceCount={contacts.length} onRun={startRun} onClose={onClose}
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
          <CampaignSidebar library={library} currentId={campaign.id} onSelect={selectCampaign} onNew={createCampaign} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid var(--gb-border-default)' }}>
            <Timeline steps={steps} selectedId={selectedId} sim={sim} onSelect={setSelectedId} onAdd={addStep} onDelete={deleteStep} onDuplicate={duplicateStep} />
          </div>
          <div style={{ width: 420, flexShrink: 0, background: 'var(--gb-surface-modal)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {selected
              ? <StepInspector step={selected} allSteps={steps} templateLib={templateLib} onChange={updateStep} onDelete={deleteStep} />
              : <CampaignInspector campaign={campaign} onChange={patchCampaign} />}
          </div>
        </div>
        <StatsStrip steps={steps} campaign={campaign} selectedId={selectedId} onClearSelection={() => setSelectedId(null)} dirty={dirty} onSave={save} />
        </>
        )}
      </ModalShell>
    </div>
  );
}

export default CampaignManager;
