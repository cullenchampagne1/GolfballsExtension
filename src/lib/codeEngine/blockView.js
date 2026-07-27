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
const CONTRACT_ICON = Object.freeze({
  sendEmail: 'mail',
  createTask: 'task',
  completeTask: 'check',
  logCall: 'phone',
  addNote: 'edit',
  editContact: 'edit',
});

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
  // Functions own an entry trace in addition to their nested action traces.
  // A pure helper therefore reads as executed even when it performs no CRM
  // action, while a failed nested action still wins during aggregation.
  const ownFunctionEntries = block.kind === 'function'
    ? (traceById[block.id] || []).filter((e) => e.kind === 'function')
    : [];
  let saw = ownFunctionEntries.length ? 'ran' : 'pending';
  for (const kid of childBlocks(block)) {
    const s = blockStatus(kid, traceById);
    if (s === 'failed') return 'failed';
    if (s === 'ran') saw = 'ran';
  }
  return saw;
}

/** A leaf that produces a trace entry (an action send or an evaluate step). */
const isTracedLeaf = (b) => b && (b.kind === 'action' || b.kind === 'evaluate');

/** Did this block (or any descendant action/evaluate) actually fire in the trace? */
export function subtreeRan(block, traceById = {}) {
  if (!block) return false;
  if (block.kind === 'function') {
    const own = traceById[block.id];
    if (own && own.some((e) => e.kind === 'function' && e.status !== 'failed')) return true;
  }
  if (isTracedLeaf(block)) {
    const e = traceById[block.id];
    return !!(e && e.length && e.some((x) => x.status !== 'failed'));
  }
  return childBlocks(block).some((k) => subtreeRan(k, traceById));
}

/** Did any descendant action fail its contract preflight? */
export function subtreeFailed(block, traceById = {}) {
  if (!block) return false;
  if (isTracedLeaf(block)) {
    const e = traceById[block.id];
    return !!(e && e.some((x) => x.status === 'failed'));
  }
  return childBlocks(block).some((k) => subtreeFailed(k, traceById));
}

/**
 * Run status for a step-like block, matching the old timeline vocabulary:
 *   'running' — currently replaying (runningId)
 *   'ran'     — fired  ·  'failed' — contract preflight failed
 *   'skipped' — reached-but-not-taken / not run once the run is done
 *   'cut'     — forced un-reached (an ancestor branch/side didn't run)
 *   'pending' — not yet replayed (mid-run) or neutral (idle)
 * `force` is set to 'skipped'/'cut' when an ancestor decides this whole
 * subtree didn't run (the greyed untaken branch).
 */
export function runStatus(block, traceById, { done = false, runningId = null, force = null } = {}) {
  if (runningId && block.id === runningId) return 'running';
  // complete/edit steps aren't trace-keyed by node id (the id is dynamic); if
  // reached they ran, if in an untaken branch they're skipped.
  if (block.kind === 'complete' || block.kind === 'edit') {
    if (force) return force;
    return done ? 'ran' : 'pending';
  }
  if (isTracedLeaf(block)) {
    const entries = traceById[block.id];
    if (entries && entries.length) return entries.some((e) => e.status === 'failed') ? 'failed' : 'ran';
    if (force) return force;
    return done ? 'skipped' : 'pending';
  }
  // container — 'ran' if a descendant fired, else inherit the forced/greyed state
  if (subtreeRan(block, traceById)) return subtreeFailed(block, traceById) ? 'failed' : 'ran';
  if (force) return force;
  return done ? 'skipped' : 'pending';
}

const firstLine = (text) => String(text ?? '').split('\n').map((l) => l.trim()).find(Boolean) || '';

/** A comment's text → clean lines, with the //, / *, * markers stripped. */
export function commentLines(text) {
  const s = String(text ?? '').replace(/^\s*\/\*+/, '').replace(/\*+\/\s*$/, '');
  return s.split('\n')
    .map((l) => l.replace(/^\s*\/\/+\s?/, '').replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean);
}

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
  if (block.kind === 'function') {
    const signature = `${block.name || 'anonymous'}(${block.paramsText || ''})`;
    const entries = (traceById[block.id] || []).filter((e) => e.kind === 'function');
    return {
      ...base,
      kind: 'function',
      icon: 'code',
      title: signature,
      detail: `${block.async ? 'async ' : ''}${block.functionKind === 'arrow' ? 'arrow function' : 'function'} · ${(block.body || []).length} block${(block.body || []).length === 1 ? '' : 's'}`,
      runs: entries.length,
    };
  }
  if (block.kind === 'comment') {
    const lines = commentLines(block.text);
    return { ...base, kind: 'comment', icon: 'code', title: lines.join(' '), lines };
  }
  if (block.kind === 'setVar') {
    return { ...base, kind: 'setVar', icon: 'code', title: block.name || 'value', detail: block.valueText || '' };
  }
  if (block.kind === 'complete') {
    const label = block.method === 'completeAll' ? 'Complete all open tasks'
      : block.method === 'completeLatest' ? 'Complete the latest task'
      : 'Complete task';
    return { ...base, kind: 'complete', icon: 'check', title: label, detail: block.method === 'complete' ? (block.refText || '') : '' };
  }
  if (block.kind === 'edit') {
    return { ...base, kind: 'edit', icon: 'task', field: block.field, valueText: block.valueText, title: block.field, detail: block.valueText };
  }
  if (block.kind === 'return') {
    return { ...base, kind: 'return', icon: 'check', title: block.valueText ? `Return ${block.valueText}` : 'Return', detail: '' };
  }
  if (block.kind === 'evaluate') {
    const entries = traceById[block.id] || [];
    const summary = entries.length ? entries[entries.length - 1].summary : `Evaluate ${block.refText || 'template'}`;
    return {
      ...base, kind: 'evaluate', icon: 'refresh',
      title: summary,
      detail: block.assignTo ? `→ ${block.assignTo}` : (block.refText || ''),
      runs: entries.length,
    };
  }
  if (block.kind === 'compose') {
    return {
      ...base, kind: 'compose', objType: block.objType,
      icon: block.objType === 'task' ? 'task' : 'mail',
      title: block.name || (block.objType === 'task' ? 'task' : 'email'),
      subject: block.subject || '', body: block.body || '',
      detail: block.subject ? `“${block.subject}”` : (block.keys || []).join(', '),
    };
  }
  // raw code block
  return { ...base, icon: 'code', title: firstLine(block.text) || 'code', detail: '' };
}
