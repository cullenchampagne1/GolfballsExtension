/* ───────────────────────────────────────────────────────────────
   codeEngine/blockView — presentation view-model for the block IR.

   translate.js turns code into a block tree; simulate.js runs it into an
   ordered, node-keyed trace. This module is the PURE glue between them and
   the UI: it indexes the trace by block id, aggregates a per-block run
   status (a container is "ran" if any descendant ran, "failed" if any
   descendant failed), and produces a stable, JSX-free descriptor per block
   (icon name, title, detail, effect/gate, status, run count, errors).

   Keeping this out of the component keeps it unit-testable and lets the
   block view, the run animation, and any future read-only preview share
   exactly one labelling + status table.
─────────────────────────────────────────────────────────────── */

import { CONTRACTS, describeContract, contractGate } from './contracts.js';

/* Contract → icon name in the shared `I` set (resolved by the component). */
const CONTRACT_ICON = Object.freeze({ sendEmail: 'mail', createTask: 'task', logCall: 'phone' });

/** The direct child block lists of a container, flattened. */
function childBlocks(block) {
  const out = [];
  if (Array.isArray(block.then)) out.push(...block.then);
  if (Array.isArray(block.else)) out.push(...block.else);
  if (Array.isArray(block.body)) out.push(...block.body);
  if (Array.isArray(block.cases)) for (const c of block.cases) out.push(...(c.body || []));
  return out;
}

/** Index an ordered trace (`[{id, contract, status, summary, errors}]`) by block id. */
export function indexTrace(trace = []) {
  const by = Object.create(null);
  for (const e of Array.isArray(trace) ? trace : []) {
    (by[e.id] || (by[e.id] = [])).push(e);
  }
  return by;
}

/**
 * Aggregate run status for a block from a trace index.
 *   'pending' — never reached (no trace entry under it)
 *   'ran'     — it (or a descendant) executed with no contract failure
 *   'failed'  — it (or a descendant) had a contract-validation failure
 * A leaf action keys directly on its own id; a container folds its children.
 */
export function blockStatus(block, traceById = {}) {
  if (!block) return 'pending';
  if (block.kind === 'action') {
    const entries = traceById[block.id];
    if (!entries || !entries.length) return 'pending';
    return entries.some((e) => e.status === 'failed') ? 'failed' : 'ran';
  }
  let saw = 'pending';
  for (const kid of childBlocks(block)) {
    const s = blockStatus(kid, traceById);
    if (s === 'failed') return 'failed';
    if (s === 'ran') saw = 'ran';
  }
  return saw;
}

const firstLine = (text) => String(text ?? '').split('\n').map((l) => l.trim()).find(Boolean) || '';

function loopTitle(block) {
  const head = block.headText ? ` ${block.headText}` : '';
  if (block.loopKind === 'while') return `While${head || ' …'}`;
  if (block.loopKind === 'forEach') return `For each${head || ' …'}`;
  return `For${head || ' …'}`;
}

/**
 * A stable, JSX-free descriptor for one block — everything the row needs to
 * render without reaching back into the IR or the contract registry.
 *
 * @returns {{ id, kind, icon, title, detail, effect, gate, status, runs, errors }}
 */
export function describeBlock(block, traceById = {}) {
  const status = blockStatus(block, traceById);
  const base = { id: block.id, kind: block.kind, icon: 'code', title: '', detail: '', effect: null, gate: null, status, runs: 0, errors: [] };

  if (block.kind === 'action') {
    const c = CONTRACTS[block.contract];
    const entries = traceById[block.id] || [];
    // A concrete run gives a richer, value-filled summary; otherwise the
    // static contract summary + the source arg text.
    const summary = entries.length ? entries[entries.length - 1].summary : (c ? c.summary : block.contract);
    const errors = [...new Set(entries.flatMap((e) => e.errors || []))];
    return {
      ...base,
      icon: CONTRACT_ICON[block.contract] || 'code',
      title: summary || block.contract,
      detail: block.assignTo ? `→ ${block.assignTo}` : (block.argText || ''),
      effect: c ? c.effect : null,
      gate: contractGate(block.contract),
      runs: entries.length,
      errors,
    };
  }
  if (block.kind === 'branch') {
    return { ...base, icon: 'branch', title: `If ${block.condText || 'condition'}` };
  }
  if (block.kind === 'loop') {
    return { ...base, icon: 'refresh', title: loopTitle(block) };
  }
  if (block.kind === 'cases') {
    return { ...base, icon: 'branch', title: `Switch on ${block.onText || '…'}` };
  }
  if (block.kind === 'comment') {
    const clean = String(block.text || '')
      .replace(/^\s*\/\/+\s?/, '')
      .replace(/^\s*\/\*+/, '').replace(/\*+\/\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    return { ...base, kind: 'comment', icon: 'code', title: clean };
  }
  if (block.kind === 'setVar') {
    return { ...base, kind: 'setVar', icon: 'code', title: block.name || 'value', detail: block.valueText || '' };
  }
  // raw code block
  return { ...base, icon: 'code', title: firstLine(block.text) || 'code', detail: '' };
}
