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
    <div style={{ position: 'relative', height, width: 26, marginLeft: 15, display: 'flex', justifyContent: 'center' }}>
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
const CONTRACT_TONE = { sendEmail: 'brand', createTask: 'info', logCall: 'info' };
const GATE_LABEL = { auto: 'auto', confirm: 'confirm', hard: 'gated' };

/* Which kinds are "steps" that get a numbered badge + run status. */
const isStep = (b) => b.kind === 'action' || b.kind === 'branch' || b.kind === 'loop' || b.kind === 'cases';

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

/* ── a quiet comment note (deliberately NOT a step) ── */
function CommentNote({ block }) {
  const d = describeBlock(block);
  if (!d.title) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '3px 2px 3px 30px' }}>
      <span style={{ fontFamily: 'var(--gb-font-mono, ui-monospace, monospace)', fontSize: 11, color: 'var(--gb-text-ghost)', lineHeight: 1.5 }}>//</span>
      <span style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--gb-text-muted)', lineHeight: 1.5 }}>{d.title}</span>
    </div>
  );
}

/* ── recursive block renderer ── */
function renderList(blocks, ctx, tone, forceStatus) {
  // A connector precedes each step-like block after the first one on this level.
  let firstStepSeen = false;
  const out = [];
  blocks.forEach((b, i) => {
    if (b.kind === 'comment') {
      out.push(<CommentNote key={b.id} block={b} />);
      return;
    }
    const step = isStep(b);
    if (step && firstStepSeen) {
      // The edge lights up while the block it leads into is the one running.
      const active = !!ctx.runningId && b.id === ctx.runningId;
      out.push(<Connector key={`c-${b.id}`} height={22} tone={tone === 'warning' ? 'branch' : 'default'} active={active} />);
    }
    if (step) firstStepSeen = true;
    out.push(<BlockNode key={b.id} block={b} ctx={ctx} tone={tone} forceStatus={forceStatus} />);
  });
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--gb-surface-2)', borderBottom: '1px solid var(--gb-border-subtle)' }}>
        <span style={{ display: 'inline-flex', width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: t.badgeBg, color: t.badgeFg, flexShrink: 0 }}><Ic size={12} /></span>
        <code style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono, ui-monospace, monospace)' }}>{d.title}</code>
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

function BlockNode({ block, ctx, tone, forceStatus }) {
  const { traceById, done, runningId, indices } = ctx;
  const status = runStatus(block, traceById, { done, runningId, force: forceStatus });
  const idx = indices[block.id];

  if (block.kind === 'compose') return <ComposeCard block={block} />;

  if (block.kind === 'action') {
    const d = describeBlock(block, traceById);
    const at = CONTRACT_TONE[block.contract] || 'neutral';
    const IcMap = { mail: I.mail, task: I.task, phone: I.phone, code: I.code };
    const gate = GATE_LABEL[d.gate];
    return (
      <Card tone={at} status={status} idx={idx} icon={IcMap[d.icon] || I.code}
        title={d.title} sublabel={d.detail || null}
        right={gate ? <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.03em', padding: '1px 6px', borderRadius: 999, color: 'var(--gb-text-muted)', background: 'var(--gb-fill-subtle)', textTransform: 'uppercase', flexShrink: 0 }}>{gate}</span> : null}>
        {d.errors.length ? <div style={{ fontSize: 10, color: 'var(--gb-error-fg)' }}>{d.errors[0]}</div> : null}
      </Card>
    );
  }

  if (block.kind === 'setVar') {
    const d = describeBlock(block, traceById);
    return (
      <Card tone="neutral" status={forceStatus || 'pending'} icon={I.code}
        title={d.title}
        tag={<span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.04em', padding: '1px 6px', borderRadius: 5, color: 'var(--gb-info-fg)', background: 'var(--gb-info-tint-soft)', textTransform: 'uppercase', flexShrink: 0 }}>set</span>}
        sublabel={d.detail ? `= ${d.detail}` : null} />
    );
  }

  if (block.kind === 'branch') {
    const thenRan = block.then.some((k) => subtreeRan(k, traceById));
    const elseRan = (block.else || []).some((k) => subtreeRan(k, traceById));
    const thenForce = done && !thenRan && elseRan ? 'skipped' : forceStatus;
    const elseForce = done && !elseRan && thenRan ? 'skipped' : forceStatus;
    const d = describeBlock(block, traceById);
    return (
      <div>
        <Card tone="warning" status={status} idx={idx} icon={I.branch}
          title={d.title} tag={<Tag tone="warning" size="xs">IF</Tag>} />
        <BranchArm label="then" tone="warning" active={runningId && thenRan}>
          {block.then.length ? renderList(block.then, ctx, 'warning', thenForce) : <EmptyArm />}
        </BranchArm>
        {(block.else && block.else.length > 0) && (
          <BranchArm label="else" tone="default" active={runningId && elseRan}>
            {renderList(block.else, ctx, 'default', elseForce)}
          </BranchArm>
        )}
      </div>
    );
  }

  if (block.kind === 'loop') {
    const d = describeBlock(block, traceById);
    return (
      <div>
        <Card tone="info" status={status} idx={idx} icon={I.refresh}
          title={d.title} tag={<Tag tone="neutral" size="xs">LOOP</Tag>} />
        <BranchArm label="each" tone="info" active={runningId && subtreeRan(block, traceById)}>
          {block.body.length ? renderList(block.body, ctx, 'info', forceStatus) : <EmptyArm />}
        </BranchArm>
      </div>
    );
  }

  if (block.kind === 'cases') {
    const d = describeBlock(block, traceById);
    return (
      <div>
        <Card tone="warning" status={status} idx={idx} icon={I.branch}
          title={d.title} tag={<Tag tone="warning" size="xs">SWITCH</Tag>} />
        {block.cases.map((c) => {
          const caseRan = (c.body || []).some((k) => subtreeRan(k, traceById));
          const caseForce = done && !caseRan ? 'skipped' : forceStatus;
          return (
            <BranchArm key={c.id} label={c.test == null ? 'default' : `case ${c.test}`} tone="warning" active={runningId && caseRan}>
              {c.body.length ? renderList(c.body, ctx, 'warning', caseForce) : <EmptyArm />}
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

/* An indented arm (branch then/else, loop body, switch case) with a rail. */
function BranchArm({ label, tone, active, children }) {
  const rail = active ? 'var(--gb-brand-label)' : tone === 'warning' ? 'var(--gb-warning-tint-border)' : 'var(--gb-border-strong)';
  return (
    <div style={{ marginLeft: 13, marginTop: 6, paddingLeft: 16, borderLeft: `2px solid ${rail}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gb-text-muted)', margin: '0 0 -1px' }}>{label}</div>
      {children}
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
    <div style={{ display: 'flex', flexDirection: 'column', padding: '16px 18px 40px' }}>
      {renderList(blocks, ctx, 'default', null)}
      {done && <ReturnNote result={result} />}
    </div>
  );
}

export default BlocksView;
