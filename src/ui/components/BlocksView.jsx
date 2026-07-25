import React from 'react';
import { I, Icon } from '../icons.jsx';
import { indexTrace, describeBlock, blockStatus } from '../../lib/codeEngine/blockView.js';

/* ───────────────────────────────────────────────────────────────
   BlocksView — the read-only visual projection of the code IR.

   Code is the source of truth; translate.js turns it into a block
   tree and simulate.js runs it into a node-keyed trace. This renders
   that tree as an indented flow of cards — action leaves plus
   if / for / switch containers — and lights each one by its run
   status ('pending' | 'running' | 'ran' | 'failed'). It never edits
   the IR and never executes anything; it's a mirror of the code the
   rep is typing, animated by whatever trace the simulator produced.

   Props:
     blocks     block[]  — translateProgram(source).blocks
     trace      []        — simulateProgram(...).trace (node-keyed)
     runningId  string    — the block id currently replaying (pulse)
     emptyHint  node      — shown when there are no blocks yet
─────────────────────────────────────────────────────────────── */

/* Status → visual tone. Mirrors the timeline's language so the two
   views read the same: brand = live, success = fired, error = failed. */
const TONE = {
  pending: { fg: 'var(--gb-text-muted)', border: 'var(--gb-border-default)', bg: 'transparent', rail: 'var(--gb-border-strong)' },
  running: { fg: 'var(--gb-brand-label)', border: 'var(--gb-brand-tint-border, var(--gb-brand-label))', bg: 'var(--gb-brand-tint-soft)', rail: 'var(--gb-brand-label)' },
  ran:     { fg: 'var(--gb-success-fg)', border: 'var(--gb-success-tint-border)', bg: 'var(--gb-success-tint-soft)', rail: 'var(--gb-success-fg)' },
  failed:  { fg: 'var(--gb-error-fg)', border: 'var(--gb-error-tint-border)', bg: 'var(--gb-error-tint-soft)', rail: 'var(--gb-error-fg)' },
};
/* Effect gate → chip. auto = silent, confirm = shows a preview + click,
   hard = money / explicit human confirm. */
const GATE_CHIP = {
  auto:    { label: 'auto',    fg: 'var(--gb-info-fg)',    bg: 'var(--gb-info-tint-soft)' },
  confirm: { label: 'confirm', fg: 'var(--gb-warning-fg)', bg: 'var(--gb-warning-tint-soft)' },
  hard:    { label: 'gated',   fg: 'var(--gb-error-fg)',   bg: 'var(--gb-error-tint-soft)' },
};

function toneFor(status, id, runningId) {
  if (runningId && id === runningId) return TONE.running;
  return TONE[status] || TONE.pending;
}

function StatusBadge({ status, runs }) {
  if (status === 'ran') {
    return (
      <span title={runs > 1 ? `ran ${runs}×` : 'ran'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--gb-success-fg)', fontSize: 10.5, fontWeight: 700 }}>
        <Icon size={12}><path d="M20 6L9 17l-5-5" /></Icon>{runs > 1 ? `${runs}×` : ''}
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span title="contract validation failed — would not send" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--gb-error-fg)', fontSize: 10.5, fontWeight: 700 }}>
        <I.alert size={12} /> stop
      </span>
    );
  }
  return null;
}

/* A leaf action card. */
function ActionRow({ block, traceById, runningId }) {
  const d = describeBlock(block, traceById);
  const tone = toneFor(d.status, block.id, runningId);
  const NIcon = I[d.icon] || I.code;
  const gate = GATE_CHIP[d.gate] || null;
  const pulsing = runningId && block.id === runningId;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 10px',
        border: `1px solid ${tone.border}`, borderRadius: 10, background: tone.bg,
        transition: 'border-color .18s ease, background .18s ease',
        boxShadow: pulsing ? '0 0 0 3px var(--gb-brand-tint-soft), 0 0 14px var(--gb-brand-tint-strong)' : 'none',
      }}
    >
      <span style={{ display: 'inline-flex', width: 22, height: 22, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'var(--gb-fill-subtle)', color: tone.fg }}>
        <NIcon size={13} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <StatusBadge status={d.status} runs={d.runs} />
            {gate && (
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.02em', padding: '1px 6px', borderRadius: 999, color: gate.fg, background: gate.bg, textTransform: 'uppercase' }}>{gate.label}</span>
            )}
          </span>
        </div>
        {d.detail ? (
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono, ui-monospace, monospace)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.detail}</div>
        ) : null}
        {d.errors.length ? (
          <div style={{ fontSize: 10, color: 'var(--gb-error-fg)', marginTop: 3 }}>{d.errors[0]}</div>
        ) : null}
      </div>
    </div>
  );
}

/* A container header (if / for / switch) with a colored rail into its body. */
function ContainerRow({ block, traceById, runningId, children }) {
  const d = describeBlock(block, traceById);
  const tone = toneFor(d.status, block.id, runningId);
  const NIcon = I[d.icon] || I.branch;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 9px', border: `1px dashed ${tone.border}`, borderRadius: 9, background: tone.bg }}>
        <NIcon size={13} style={{ color: tone.fg, flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-mono, ui-monospace, monospace)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
      </div>
      <div style={{ marginLeft: 12, paddingLeft: 12, borderLeft: `2px solid ${tone.rail}`, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function GroupLabel({ text }) {
  return <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gb-text-muted)', margin: '2px 0 -1px' }}>{text}</div>;
}

function BlockList({ blocks, traceById, runningId }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {blocks.map((b) => (
        <Block key={b.id} block={b} traceById={traceById} runningId={runningId} />
      ))}
    </div>
  );
}

function Block({ block, traceById, runningId }) {
  if (block.kind === 'action') return <ActionRow block={block} traceById={traceById} runningId={runningId} />;

  if (block.kind === 'branch') {
    const hasElse = Array.isArray(block.else) && block.else.length > 0;
    return (
      <ContainerRow block={block} traceById={traceById} runningId={runningId}>
        {block.then.length ? <BlockList blocks={block.then} traceById={traceById} runningId={runningId} /> : <EmptyBranch />}
        {hasElse && (
          <>
            <GroupLabel text="else" />
            <BlockList blocks={block.else} traceById={traceById} runningId={runningId} />
          </>
        )}
      </ContainerRow>
    );
  }

  if (block.kind === 'loop') {
    return (
      <ContainerRow block={block} traceById={traceById} runningId={runningId}>
        {block.body.length ? <BlockList blocks={block.body} traceById={traceById} runningId={runningId} /> : <EmptyBranch />}
      </ContainerRow>
    );
  }

  if (block.kind === 'cases') {
    return (
      <ContainerRow block={block} traceById={traceById} runningId={runningId}>
        {block.cases.map((c) => (
          <div key={c.id}>
            <GroupLabel text={c.test == null ? 'default' : `case ${c.test}`} />
            {c.body.length ? <BlockList blocks={c.body} traceById={traceById} runningId={runningId} /> : <EmptyBranch />}
          </div>
        ))}
      </ContainerRow>
    );
  }

  // Raw code block — shown verbatim so nothing is hidden from the rep.
  const status = blockStatus(block, traceById);
  const tone = toneFor(status, block.id, runningId);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: `1px solid ${tone.border}`, borderRadius: 9, background: 'var(--gb-fill-subtle)' }}>
      <I.code size={12} style={{ color: 'var(--gb-text-muted)', flexShrink: 0 }} />
      <code style={{ fontSize: 11, color: 'var(--gb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{describeBlock(block, traceById).title}</code>
    </div>
  );
}

function EmptyBranch() {
  return <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontStyle: 'italic', padding: '2px 2px' }}>— nothing —</div>;
}

export function BlocksView({ blocks = [], trace = [], runningId = null, emptyHint = null }) {
  const traceById = React.useMemo(() => indexTrace(trace), [trace]);
  if (!blocks.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--gb-text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>
        {emptyHint || 'Write code on the left — it becomes blocks here.'}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12 }}>
      <BlockList blocks={blocks} traceById={traceById} runningId={runningId} />
    </div>
  );
}

export default BlocksView;
