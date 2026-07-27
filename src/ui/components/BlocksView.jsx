import React from 'react';
import { I } from '../icons.jsx';
import { Tag } from './Tag.jsx';
import {
  indexTrace, describeBlock, runStatus, subtreeRan,
} from '../../lib/codeEngine/blockView.js';

/* ───────────────────────────────────────────────────────────────
   BlocksView — the run UI for code-authored campaigns.

   Same shape and animation as the old step timeline: sending an email
   is a step, creating a task is a step, if/else are branches that fan
   out with hooked connectors, and once a run finishes the paths that
   weren't taken are greyed as "skipped". The only difference from the
   old design is that these steps are INTERPRETED from code rather than
   hand-built — so every construct (action, set-variable, comment,
   branch, loop, switch, raw code) gets its own block, and the trace
   from simulate.js drives the exact same running/ran/skipped states.
─────────────────────────────────────────────────────────────── */

const KF_ID = '__gb-blocks-kf';
function ensureKeyframes() {
  if (typeof document === 'undefined' || document.getElementById(KF_ID)) return;
  const s = document.createElement('style');
  s.id = KF_ID;
  s.textContent = `
    @keyframes gbb-step-in    { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
    @keyframes gbb-flow       { to   { stroke-dashoffset: -28; } }
    @keyframes gbb-pulse-ring { 0%, 100% { box-shadow: 0 0 0 0 var(--gb-brand-tint-strong); } 50% { box-shadow: 0 0 0 6px transparent; } }
    @keyframes gbb-running    { 0%, 100% { box-shadow: 0 0 0 0 var(--gb-brand-tint-strong); } 50% { box-shadow: 0 0 0 4px var(--gb-brand-tint-soft), 0 0 18px var(--gb-brand-tint-strong); } }
  `;
  (document.head || document.documentElement).appendChild(s);
}

/* ── Connector between blocks (animated when the run is on this edge) ── */
function Connector({ active, height = 30, tone = 'default', hookRight, hookLeft }) {
  const stroke = active ? 'var(--gb-brand-label)'
    : tone === 'branch' ? 'var(--gb-warning-fg)' : 'var(--gb-border-strong)';
  const dash = active ? '4 4' : '0';
  const anim = active ? { animation: 'gbb-flow 1.2s linear infinite' } : null;
  return (
    <div style={{ position: 'relative', height, width: 26, marginLeft: 10, display: 'flex', justifyContent: 'center' }}>
      <svg width={26} height={height} style={{ overflow: 'visible' }}>
        {hookRight
          ? <path d={`M13 0 L13 ${height - 10} Q13 ${height} 23 ${height}`} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} style={anim} />
          : hookLeft
            ? <path d={`M23 0 Q13 0 13 10 L13 ${height}`} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} style={anim} />
            : <path d={`M13 0 L13 ${height}`} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} style={anim} />}
        {active && <circle r="3" fill={stroke}><animate attributeName="cy" from="0" to={height} dur="1.2s" repeatCount="indefinite" /></circle>}
      </svg>
    </div>
  );
}

/* tone palette per block family. */
const TONE = {
  brand:   { badgeBg: 'var(--gb-brand-tint-medium)', badgeFg: 'var(--gb-brand-label)', run: 'var(--gb-brand-label)' },
  info:    { badgeBg: 'var(--gb-info-tint-medium, var(--gb-fill-subtle))', badgeFg: 'var(--gb-info-fg, var(--gb-text-secondary))', run: 'var(--gb-brand-label)' },
  warning: { badgeBg: 'var(--gb-warning-tint-medium)', badgeFg: 'var(--gb-warning-fg)', run: 'var(--gb-warning-fg)' },
  neutral: { badgeBg: 'var(--gb-fill-strong)', badgeFg: 'var(--gb-text-secondary)', run: 'var(--gb-brand-label)' },
};
const CONTRACT_TONE = {
  sendEmail: 'brand',
  createTask: 'info',
  completeTask: 'info',
  logCall: 'info',
  addNote: 'info',
  editContact: 'info',
};
const GATE_LABEL = { auto: 'auto', confirm: 'confirm', hard: 'gated' };

/* Which kinds are "steps": email/task/call sends, email evaluations, returns,
   and branches (if/switch) + loops. These get a numbered badge + run status.
   set-variable / comment / raw code are supporting blocks, not steps. */
const STEP_KINDS = new Set(['action', 'evaluate', 'complete', 'return', 'branch', 'loop', 'cases', 'function']);
const isStep = (b) => STEP_KINDS.has(b.kind);
/** True for branch-family containers (if / switch). */
const isBranchKind = (b) => b.kind === 'branch' || b.kind === 'cases';

/** Precompute display indices: top-level steps 1,2,3; nested 2a,2b… */
function indexSteps(blocks, prefix = '', map = {}) {
  let n = 0;
  for (const b of blocks) {
    if (!isStep(b)) continue;
    n += 1;
    const label = prefix ? `${prefix}${String.fromCharCode(96 + n)}` : `${n}`;
    map[b.id] = label;
    const kids = [];
    if (b.then) kids.push(...b.then);
    if (b.else) kids.push(...b.else);
    if (b.body) kids.push(...b.body);
    if (b.cases) for (const c of b.cases) kids.push(...(c.body || []));
    indexSteps(kids, label, map);
  }
  return map;
}

/* ── The card chrome shared by every step-like block ── */
function Card({ tone = 'neutral', status, idx, icon, title, sublabel, tag, right, children }) {
  const t = TONE[tone] || TONE.neutral;
  const live = status === 'running';
  const ran = status === 'ran';
  const failed = status === 'failed';
  const skipped = status === 'skipped';
  const cut = status === 'cut';
  const Ic = icon;
  const border = live ? t.run
    : ran ? 'var(--gb-success-tint-border)'
    : failed ? 'var(--gb-error-tint-border)'
    : 'var(--gb-border-default)';
  return (
    <div style={{
      background: 'var(--gb-surface-1)', border: `1px solid ${border}`, borderRadius: 'var(--gb-r-lg)',
      boxShadow: '0 1px 0 rgba(0,0,0,.12)', overflow: 'hidden',
      opacity: cut ? 0.42 : skipped ? 0.62 : 1,
      transition: 'border-color var(--gb-anim), box-shadow var(--gb-anim), opacity var(--gb-anim)',
      animation: live ? 'gbb-running 1.4s ease-in-out infinite' : 'gbb-step-in .3s cubic-bezier(.34,1.4,.64,1)',
    }}>
      <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 11, alignItems: 'flex-start' }}>
        <div style={{
          position: 'relative', width: 26, height: 26, borderRadius: 'var(--gb-r-sm)', flexShrink: 0,
          background: ran ? 'var(--gb-success-tint-medium)' : t.badgeBg,
          border: '1px solid ' + (ran ? 'var(--gb-success-tint-border)' : 'var(--gb-border-default)'),
          color: ran ? 'var(--gb-success-fg)' : t.badgeFg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10.5, fontWeight: 800, fontFamily: 'var(--gb-font-mono)',
        }}>
          {ran ? <I.check size={13} /> : skipped ? '–' : (idx != null ? idx : (Ic ? <Ic size={13} /> : null))}
          {live && <span style={{ position: 'absolute', inset: -3, borderRadius: 8, border: `1.5px solid ${t.run}`, animation: 'gbb-pulse-ring 1.2s ease-in-out infinite' }} />}
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            {Ic && idx != null ? <Ic size={12} style={{ color: t.badgeFg, flexShrink: 0 }} /> : null}
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
            {tag}
            <div style={{ flex: 1 }} />
            {ran && <Tag tone="success" size="xs">RAN</Tag>}
            {failed && <Tag tone="error" size="xs">FAILED</Tag>}
            {skipped && <Tag tone="neutral" size="xs">SKIPPED</Tag>}
            {cut && <Tag tone="neutral" size="xs">NOT REACHED</Tag>}
            {right}
          </div>
          {sublabel != null && (
            <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--gb-font-mono, ui-monospace, monospace)' }}>{sublabel}</div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── a note tag-box (the // markers stripped) — NOT a step. Consecutive
   comments merge into one box, one line of text per source line. ── */
function CommentNote({ lines }) {
  if (!lines || !lines.length) return null;
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '100%', display: 'inline-flex', flexDirection: 'column', gap: 1,
      margin: '2px 0 2px 8px', padding: '5px 10px', borderRadius: 8,
      background: 'var(--gb-warning-tint-soft, var(--gb-fill-subtle))', border: '1px solid var(--gb-warning-tint-border, var(--gb-border-subtle))' }}>
      {lines.map((l, i) => (
        <span key={i} style={{ fontSize: 10.5, color: 'var(--gb-warning-fg, var(--gb-text-muted))', lineHeight: 1.5 }}>{l}</span>
      ))}
    </div>
  );
}

/* One block in an arm — gets a horizontal tick from the branch's vertical
   line to the block. Top-level blocks (rail == null) get no line at all;
   lines are purposeful (branch → its steps), not generic between blocks. */
function ArmItem({ rail, children }) {
  if (!rail) return children;
  return (
    <div style={{ position: 'relative', paddingLeft: 14 }}>
      <span style={{ position: 'absolute', left: 0, top: 18, width: 12, height: 2, background: rail, borderRadius: 1 }} />
      {children}
    </div>
  );
}

/* Render a list of blocks. `rail` (a color) means we're inside a branch arm —
   each child gets a connecting tick; at the top level rail is null → no lines. */
function renderBlocks(blocks, ctx, tone, forceStatus, rail) {
  const out = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.kind === 'comment') {
      const lines = [];
      let j = i;
      while (j < blocks.length && blocks[j].kind === 'comment') {
        lines.push(...(describeBlock(blocks[j]).lines || []));
        j += 1;
      }
      out.push(<ArmItem key={`cm-${b.id}`} rail={rail}><CommentNote lines={lines} /></ArmItem>);
      i = j;
      continue;
    }
    if (b.kind === 'edit') {
      // Merge consecutive contact edits into ONE grouped "Edit contact" card.
      const fields = [];
      let j = i;
      while (j < blocks.length && blocks[j].kind === 'edit') {
        const d = describeBlock(blocks[j]);
        fields.push({ field: d.field, value: d.valueText });
        j += 1;
      }
      const status = runStatus(b, ctx.traceById, { done: ctx.done, force: forceStatus });
      out.push(<ArmItem key={`ed-${b.id}`} rail={rail}><EditGroupCard fields={fields} status={status} /></ArmItem>);
      i = j;
      continue;
    }
    out.push(
      <ArmItem key={b.id} rail={rail}>
        <BlockNode block={b} ctx={ctx} tone={tone} forceStatus={forceStatus} />
      </ArmItem>,
    );
    i += 1;
  }
  return out;
}

/* A "compose" block — an email/task object being built, with a compact
   preview so you can see what's being created without it eating the panel. */
function ComposeCard({ block }) {
  const d = describeBlock(block);
  const Ic = d.objType === 'task' ? I.task : I.mail;
  const t = TONE[d.objType === 'task' ? 'info' : 'brand'] || TONE.brand;
  return (
    <div style={{ border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', background: 'var(--gb-surface-1)', overflow: 'hidden', boxShadow: '0 1px 0 rgba(0,0,0,.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
        <span style={{ display: 'inline-flex', width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: t.badgeBg, color: t.badgeFg, flexShrink: 0 }}><Ic size={12} /></span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono, ui-monospace, monospace)' }}>{d.title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 800, letterSpacing: '.05em', padding: '1px 6px', borderRadius: 999, color: t.badgeFg, background: t.badgeBg, textTransform: 'uppercase' }}>new {d.objType}</span>
      </div>
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {d.subject ? d.subject : <span style={{ color: 'var(--gb-text-muted)', fontStyle: 'italic', fontWeight: 400 }}>computed subject</span>}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.45, maxHeight: 30, overflow: 'hidden' }}>
          {d.body ? d.body : <span style={{ fontStyle: 'italic' }}>{(block.keys || []).join(' · ') || 'body'}</span>}
        </div>
      </div>
    </div>
  );
}

/* A "set variable" — plain code text, no background box (theme-safe), and
   clearly subordinate to the step cards. */
function SetVarCard({ block, greyed }) {
  const d = describeBlock(block);
  const mono = 'var(--gb-font-mono, ui-monospace, monospace)';
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '1px 2px', opacity: greyed ? 0.5 : 1, minWidth: 0 }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.03em', color: 'var(--gb-info-fg)', fontFamily: mono, flexShrink: 0 }}>set</span>
      <code style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)', fontFamily: mono, flexShrink: 0 }}>{d.title}</code>
      {d.detail ? (
        <code style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontFamily: mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>= {d.detail}</code>
      ) : null}
    </div>
  );
}

/* A grouped "Edit contact" card — the staged field changes applied together
   as one CRM write. */
function EditGroupCard({ fields, status }) {
  const mono = 'var(--gb-font-mono, ui-monospace, monospace)';
  const greyed = status === 'skipped' || status === 'cut';
  const ran = status === 'ran';
  return (
    <div style={{ border: `1px solid ${ran ? 'var(--gb-success-tint-border)' : 'var(--gb-border-default)'}`, borderRadius: 'var(--gb-r-lg)', background: 'var(--gb-surface-1)', overflow: 'hidden', boxShadow: '0 1px 0 rgba(0,0,0,.12)', opacity: greyed ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
        <span style={{ display: 'inline-flex', width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: 'var(--gb-info-tint-medium, var(--gb-fill-subtle))', color: 'var(--gb-info-fg)', flexShrink: 0 }}><I.task size={12} /></span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Edit contact</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {ran && <Tag tone="success" size="xs">RAN</Tag>}
          {greyed && <Tag tone="neutral" size="xs">SKIPPED</Tag>}
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.04em', padding: '1px 6px', borderRadius: 999, color: 'var(--gb-text-muted)', background: 'var(--gb-fill-subtle)', textTransform: 'uppercase' }}>{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
        </span>
      </div>
      <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {fields.map((f, i) => (
          <div key={i} style={{ fontSize: 11, fontFamily: mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--gb-info-fg)', fontWeight: 700 }}>{f.field}</span>
            <span style={{ color: 'var(--gb-text-ghost)' }}> = </span>
            <span style={{ color: 'var(--gb-text-muted)' }}>{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function containsBlockId(block, id) {
  if (!block || !id) return false;
  if (block.id === id) return true;
  if ((block.then || []).some((kid) => containsBlockId(kid, id))) return true;
  if ((block.else || []).some((kid) => containsBlockId(kid, id))) return true;
  if ((block.body || []).some((kid) => containsBlockId(kid, id))) return true;
  return (block.cases || []).some((item) => (
    (item.body || []).some((kid) => containsBlockId(kid, id))
  ));
}

function BlockNode({ block, ctx, tone, forceStatus }) {
  const { traceById, done, runningId, indices } = ctx;
  const status = runStatus(block, traceById, { done, runningId, force: forceStatus });
  const idx = indices[block.id];

  if (block.kind === 'compose') return <ComposeCard block={block} />;

  if (block.kind === 'function') {
    const d = describeBlock(block, traceById);
    const ran = subtreeRan(block, traceById);
    const rail = containsBlockId(block, runningId) ? BRAND : ARM_RAIL.info;
    // Function entry hooks make pure helpers traceable too. Key the card by
    // occurrence count so React remounts its CSS animation when the SAME
    // function is called repeatedly.
    const functionStatus = ran ? status : (forceStatus || 'pending');
    const bodyForce = ran ? forceStatus : (forceStatus || 'definition');
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', padding: 8,
        border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-xl)',
        background: 'color-mix(in srgb, var(--gb-surface-2) 72%, transparent)',
      }}>
        <Card key={`${block.id}:${d.runs}`} tone="neutral" status={functionStatus} idx={idx} icon={I.code}
          title={d.title} sublabel={d.detail}
          tag={<Tag tone="neutral" size="xs">FUNCTION</Tag>}
          right={d.runs > 0 ? <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.03em', padding: '1px 6px', borderRadius: 999, color: 'var(--gb-info-fg)', background: 'var(--gb-info-tint-medium, var(--gb-fill-subtle))', textTransform: 'uppercase', flexShrink: 0 }}>CALLED ×{d.runs}</span> : null} />
        <BranchArm label="function body" tone="info" rail={rail}>
          {block.body.length ? renderBlocks(block.body, ctx, 'info', bodyForce, rail) : <EmptyArm />}
        </BranchArm>
      </div>
    );
  }

  if (block.kind === 'complete') {
    const d = describeBlock(block, traceById);
    return (
      <Card tone="info" status={status} idx={idx} icon={I.check}
        title={d.title} sublabel={d.detail || null}
        tag={<Tag tone="neutral" size="xs">COMPLETE TASK</Tag>} />
    );
  }

  if (block.kind === 'evaluate') {
    const d = describeBlock(block, traceById);
    return (
      <Card tone="info" status={status} idx={idx} icon={I.refresh}
        title={d.title} sublabel={d.detail || null}
        tag={<Tag tone="neutral" size="xs">EVALUATE</Tag>}
        right={<span title="rendering the template can take a few seconds" style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.03em', padding: '1px 6px', borderRadius: 999, color: 'var(--gb-text-muted)', background: 'var(--gb-fill-subtle)', textTransform: 'uppercase', flexShrink: 0 }}>~5s</span>} />
    );
  }

  if (block.kind === 'action') {
    const d = describeBlock(block, traceById);
    const at = CONTRACT_TONE[block.contract] || 'neutral';
    const IcMap = {
      mail: I.mail,
      task: I.task,
      check: I.check,
      phone: I.phone,
      edit: I.edit,
      code: I.code,
    };
    const gate = GATE_LABEL[d.gate];
    return (
      <Card tone={at} status={status} idx={idx} icon={IcMap[d.icon] || I.code}
        title={d.title} sublabel={d.detail || null}
        right={gate ? <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.03em', padding: '1px 6px', borderRadius: 999, color: 'var(--gb-text-muted)', background: 'var(--gb-fill-subtle)', textTransform: 'uppercase', flexShrink: 0 }}>{gate}</span> : null}>
        {d.errors.length ? <div style={{ fontSize: 10, color: 'var(--gb-error-fg)' }}>{d.errors[0]}</div> : null}
      </Card>
    );
  }

  if (block.kind === 'return') {
    const d = describeBlock(block, traceById);
    return (
      <Card tone="success" status={status === 'pending' && done ? 'ran' : status} idx={idx} icon={I.check}
        title={d.title} tag={<Tag tone="success" size="xs">RETURN</Tag>} />
    );
  }

  if (block.kind === 'setVar') return <SetVarCard block={block} greyed={forceStatus === 'skipped' || forceStatus === 'cut'} />;

  if (block.kind === 'branch') {
    const thenRan = block.then.some((k) => subtreeRan(k, traceById));
    const elseRan = (block.else || []).some((k) => subtreeRan(k, traceById));
    const thenForce = done && !thenRan && elseRan ? 'skipped' : forceStatus;
    const elseForce = done && !elseRan && thenRan ? 'skipped' : forceStatus;
    const railThen = runningId && thenRan ? BRAND : ARM_RAIL.warning;
    const railElse = runningId && elseRan ? BRAND : ARM_RAIL.default;
    const d = describeBlock(block, traceById);
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Card tone="warning" status={status} idx={idx} icon={I.branch}
          title={d.title} tag={<Tag tone="warning" size="xs">IF</Tag>} />
        <BranchArm label="then" tone="warning" rail={railThen}>
          {block.then.length ? renderBlocks(block.then, ctx, 'warning', thenForce, railThen) : <EmptyArm />}
        </BranchArm>
        {(block.else && block.else.length > 0) && (
          <BranchArm label="else" tone="default" rail={railElse}>
            {renderBlocks(block.else, ctx, 'default', elseForce, railElse)}
          </BranchArm>
        )}
      </div>
    );
  }

  if (block.kind === 'loop') {
    const d = describeBlock(block, traceById);
    const rail = runningId && subtreeRan(block, traceById) ? BRAND : ARM_RAIL.info;
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Card tone="info" status={status} idx={idx} icon={I.refresh}
          title={d.title} tag={<Tag tone="neutral" size="xs">LOOP</Tag>} />
        <BranchArm label="each" tone="info" rail={rail}>
          {block.body.length ? renderBlocks(block.body, ctx, 'info', forceStatus, rail) : <EmptyArm />}
        </BranchArm>
      </div>
    );
  }

  if (block.kind === 'cases') {
    const d = describeBlock(block, traceById);
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Card tone="warning" status={status} idx={idx} icon={I.branch}
          title={d.title} tag={<Tag tone="warning" size="xs">SWITCH</Tag>} />
        {block.cases.map((c) => {
          const caseRan = (c.body || []).some((k) => subtreeRan(k, traceById));
          const caseForce = done && !caseRan ? 'skipped' : forceStatus;
          const rail = runningId && caseRan ? BRAND : ARM_RAIL.warning;
          return (
            <BranchArm key={c.id} label={c.test == null ? 'default' : `case ${c.test}`} tone="warning" rail={rail}>
              {c.body.length ? renderBlocks(c.body, ctx, 'warning', caseForce, rail) : <EmptyArm />}
            </BranchArm>
          );
        })}
      </div>
    );
  }

  // generic custom code block — still a styled block, never a raw dump
  const d = describeBlock(block, traceById);
  return (
    <Card tone="neutral" status={forceStatus || 'pending'} icon={I.code}
      title={d.title || 'code'}
      tag={<span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.04em', padding: '1px 6px', borderRadius: 5, color: 'var(--gb-text-muted)', background: 'var(--gb-fill-subtle)', textTransform: 'uppercase', flexShrink: 0 }}>code</span>} />
  );
}

/* An arm (branch then/else, loop body, switch case). A straight vertical line
   descends from the branch; each child hangs off it with a horizontal tick
   (see ArmItem). The line is tinted by role and glows when the run is inside
   it, so nested branches/loops read as separate lanes. */
const BRAND = 'var(--gb-brand-label)';
const ARM_RAIL = {
  warning: 'var(--gb-warning-tint-border)',
  info: 'var(--gb-info-tint-border, var(--gb-border-strong))',
  default: 'var(--gb-border-strong)',
};
function BranchArm({ label, tone, rail, children }) {
  const labelColor = tone === 'warning' ? 'var(--gb-warning-fg)' : tone === 'info' ? 'var(--gb-info-fg)' : 'var(--gb-text-muted)';
  return (
    <div style={{ marginLeft: 22, marginTop: 4 }}>
      <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: labelColor, marginBottom: 4, marginLeft: 4 }}>{label}</div>
      <div style={{ borderLeft: `2px solid ${rail}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  );
}
function EmptyArm() {
  return <div style={{ fontSize: 10.5, fontStyle: 'italic', color: 'var(--gb-text-muted)', padding: '1px 2px' }}>— nothing —</div>;
}

/* The closing "returns …" summary — the program's final value, shown as the
   last thing in the flow so a run reads end-to-end like the old timeline. */
function ReturnNote({ result }) {
  if (result == null || result === '') return null;
  const text = typeof result === 'string' ? result : (() => { try { return JSON.stringify(result); } catch { return String(result); } })();
  return (
    <div style={{ marginTop: 8 }}>
      <Connector height={20} tone="default" active={false} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', border: '1px solid var(--gb-success-tint-border)', borderRadius: 'var(--gb-r-lg)', background: 'var(--gb-success-tint-soft)' }}>
        <I.check size={13} style={{ color: 'var(--gb-success-fg)', flexShrink: 0 }} />
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--gb-success-fg)', flexShrink: 0 }}>returns</span>
        <span style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--gb-font-mono, ui-monospace, monospace)' }}>{text}</span>
      </div>
    </div>
  );
}

export function BlocksView({ blocks = [], trace = [], runningId = null, done = false, result = null, emptyHint = null }) {
  ensureKeyframes();
  const traceById = React.useMemo(() => indexTrace(trace), [trace]);
  const indices = React.useMemo(() => indexSteps(blocks), [blocks]);
  if (!blocks.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--gb-text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>
        {emptyHint || 'Write code — it becomes a flow of blocks here.'}
      </div>
    );
  }
  const ctx = { traceById, done, runningId, indices };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 18px 40px' }}>
      {renderBlocks(blocks, ctx, 'default', null, null)}
    </div>
  );
}

export default BlocksView;
