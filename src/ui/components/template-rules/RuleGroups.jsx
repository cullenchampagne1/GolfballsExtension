import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn } from '../Btn.jsx';
import { IconBtn } from '../IconBtn.jsx';
import { SectionLabel } from '../SectionLabel.jsx';
import { I } from '../../icons.jsx';
import { isValuelessOp, emptyTree } from '../../../lib/matchEngine.js';

/* ───────────────────────────────────────────────────────────────
   RuleGroups — the shared grouped AND/OR rule builder.

   Generalizes the grouped UI CaseRules pioneered into a reusable
   shell for account + order page-match rules. It owns the group /
   condition CRUD, the AND/OR joiners, the NOT pill, the operator
   dropdown, and the op-aware value cell. The ONLY pluggable piece is
   the "subject" cell (what the condition matches against), supplied
   per template type:

     • account → schema tree + a Variables section
     • order   → Variables only (no order parser yet)
     • (case keeps its own CaseRules with email fields)

   Save shape is the matchEngine tree:
     { outerJoiner, groups: [{ joiner, conditions: [
         { source, ref, op, value, not } ] }] }

   Props:
     initial      grouped tree OR a legacy flat array
     fromLegacy   (rawItem) => { source, ref, op, value, not }
                  maps each legacy flat rule into a condition
     defaultSource source for newly-added conditions ('schema'|'var')
     renderSubject (condition, patch) => JSX  — the subject cell;
                  patch({ source, ref, type }) updates the condition
     opsFor       (condition) => [{ id, label, valueless? }]
     onChange     (tree) => void
     label, emptyHint  copy
─────────────────────────────────────────────────────────────── */

let _uid = 0;
const uid = () => `g${++_uid}`;

const ROW_TRANSITION = { duration: 0.22, ease: [0.32, 0.72, 0, 1] };
const ROW_INITIAL    = { opacity: 0, y: -6, scale: 0.97 };
const ROW_ANIMATE    = { opacity: 1, y: 0,  scale: 1 };
const ROW_EXIT       = { opacity: 0, scale: 0.94, transition: { duration: 0.14 } };

function normalizeInitial(input, fromLegacy) {
  if (!input) return emptyTree();
  // Already the grouped tree.
  if (!Array.isArray(input) && Array.isArray(input.groups)) {
    return {
      outerJoiner: input.outerJoiner === 'OR' ? 'OR' : 'AND',
      groups: input.groups.map((g) => ({
        id: g.id || uid(),
        joiner: g.joiner === 'OR' ? 'OR' : 'AND',
        conditions: (g.conditions || []).map((c) => ({ id: c.id || uid(), ...stripId(c) })),
      })),
    };
  }
  // Legacy flat array → one AND group.
  if (Array.isArray(input) && input.length > 0) {
    return {
      outerJoiner: 'AND',
      groups: [{
        id: uid(),
        joiner: 'AND',
        conditions: input.map((r) => ({ id: uid(), ...(fromLegacy ? fromLegacy(r) : r) })),
      }],
    };
  }
  return emptyTree();
}
function stripId(c) {
  const { id, ...rest } = c || {};
  return {
    source: rest.source || 'schema',
    ref:    rest.ref || '',
    type:   rest.type || 'string',
    op:     rest.op || 'contains',
    value:  rest.value ?? '',
    not:    !!rest.not,
  };
}

export function RuleGroups({
  initial, fromLegacy, defaultSource = 'schema',
  renderSubject, opsFor, onChange,
  label = 'Match rules',
  emptyHint = 'No match rules yet. Add a group of conditions to start matching.',
}) {
  const [state, setState] = useState(() => normalizeInitial(initial, fromLegacy));
  const { outerJoiner, groups } = state;

  const newCondition = () => ({ id: uid(), source: defaultSource, ref: '', type: 'string', op: 'contains', value: '', not: false });
  const newGroup = () => ({ id: uid(), joiner: 'AND', conditions: [newCondition()] });

  /* Commit strips the editor-only `id`s the engine doesn't need, so
     the parent always receives a clean { outerJoiner, groups } tree. */
  const commit = (next) => {
    setState(next);
    onChange?.({
      outerJoiner: next.outerJoiner,
      groups: next.groups.map((g) => ({
        joiner: g.joiner,
        conditions: g.conditions.map(({ id, ...c }) => c),
      })),
    });
  };

  const setOuterJoiner = (j) => commit({ ...state, outerJoiner: j });
  const addGroup = () => commit({ ...state, groups: [...groups, newGroup()] });
  const removeGroup = (gid) => commit({ ...state, groups: groups.filter((g) => g.id !== gid) });
  const setGroupJoiner = (gid, joiner) => commit({ ...state, groups: groups.map((g) => (g.id === gid ? { ...g, joiner } : g)) });
  const addCondition = (gid) => commit({ ...state, groups: groups.map((g) => (g.id === gid ? { ...g, conditions: [...g.conditions, newCondition()] } : g)) });
  const patchCondition = (gid, cid, patch) => commit({
    ...state,
    groups: groups.map((g) => (g.id === gid
      ? { ...g, conditions: g.conditions.map((c) => (c.id === cid ? { ...c, ...patch } : c)) }
      : g)),
  });
  const removeCondition = (gid, cid) => commit({
    ...state,
    groups: groups.map((g) => (g.id === gid ? { ...g, conditions: g.conditions.filter((c) => c.id !== cid) } : g)),
  });

  const hasGroups = groups.length > 0;

  return (
    <div>
      <SectionLabel action={<Btn variant="ghost" size="xs" icon={<I.plus />} onClick={addGroup}>Add group</Btn>}>
        {label}
      </SectionLabel>

      {!hasGroups ? (
        <EmptyState hint={emptyHint} onAdd={addGroup} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <AnimatePresence mode="popLayout" initial={false}>
            {groups.map((g, i) => (
              <motion.div key={g.id} layout initial={ROW_INITIAL} animate={ROW_ANIMATE} exit={ROW_EXIT} transition={ROW_TRANSITION}>
                <GroupCard
                  group={g}
                  index={i}
                  canRemove={groups.length > 1}
                  renderSubject={renderSubject}
                  opsFor={opsFor}
                  onJoinerChange={(j) => setGroupJoiner(g.id, j)}
                  onAddCondition={() => addCondition(g.id)}
                  onPatchCondition={(cid, patch) => patchCondition(g.id, cid, patch)}
                  onRemoveCondition={(cid) => removeCondition(g.id, cid)}
                  onRemoveGroup={() => removeGroup(g.id)}
                />
                {i < groups.length - 1 && (
                  <JoinerDivider value={outerJoiner} onChange={setOuterJoiner} label="GROUP JOIN" large />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          <div style={{ marginTop: 10, display: 'flex' }}>
            <Btn size="sm" variant="dashed" icon={<I.plus size={11} />} onClick={addGroup}>Add group</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupCard({ group, index, canRemove, renderSubject, opsFor, onJoinerChange, onAddCondition, onPatchCondition, onRemoveCondition, onRemoveGroup }) {
  return (
    <div style={{ padding: 12, background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={labelStyle}>Group {String.fromCharCode(65 + index)}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
        <span style={labelStyle}>match</span>
        <JoinerToggle value={group.joiner} onChange={onJoinerChange} />
        <IconBtn size="xs" variant="ghost" danger icon={<I.trash size={10} />} disabled={!canRemove} onClick={onRemoveGroup} tooltip={canRemove ? 'Remove group' : 'At least one group required'} />
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {group.conditions.map((c, i) => (
          <motion.div key={c.id} layout initial={ROW_INITIAL} animate={ROW_ANIMATE} exit={ROW_EXIT} transition={ROW_TRANSITION}>
            {i > 0 && <JoinerDivider value={group.joiner} small />}
            <ConditionRow
              condition={c}
              canRemove={group.conditions.length > 1}
              renderSubject={renderSubject}
              opsFor={opsFor}
              onPatch={(patch) => onPatchCondition(c.id, patch)}
              onRemove={() => onRemoveCondition(c.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      <div style={{ marginTop: 8 }}>
        <Btn size="xs" variant="ghost" icon={<I.plus size={10} />} onClick={onAddCondition}>Add condition</Btn>
      </div>
    </div>
  );
}

function ConditionRow({ condition, renderSubject, opsFor, onPatch, onRemove, canRemove }) {
  const ops = (opsFor ? opsFor(condition) : []) || [];
  const valueless = isValuelessOp(condition.op);
  const vKind = valueKind(condition.op, valueless);

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, padding: 10,
      background: 'var(--gb-surface-2)',
      border: '1px solid ' + (condition.not ? 'var(--gb-error-tint-border)' : 'var(--gb-border-subtle)'),
      borderRadius: 'var(--gb-r-sm)', transition: 'border-color .2s',
    }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <NotPill on={condition.not} onClick={() => onPatch({ not: !condition.not })} />
        {/* Pluggable subject cell — schema/var/field picker per type. */}
        <div style={{ flex: '1 1 160px', minWidth: 150 }}>
          {renderSubject?.(condition, (patch) => onPatch(patch))}
        </div>
        <NativeSelect
          value={condition.op}
          options={ops}
          width={140}
          onChange={(v) => {
            const patch = { op: v };
            if (isValuelessOp(v)) patch.value = '';
            onPatch(patch);
          }}
        />
        {!valueless && (
          <ValueCell kind={vKind} value={condition.value} onChange={(v) => onPatch({ value: v })} />
        )}
      </div>
      <div style={{ flexShrink: 0 }}>
        <IconBtn size="xs" variant="ghost" danger icon={<I.trash size={10} />} disabled={!canRemove} onClick={onRemove} tooltip={canRemove ? 'Remove condition' : 'At least one condition is required'} />
      </div>
    </div>
  );
}

/* Op → value input kind. Date ops get a date input; relative date ops
   ("older than" / "within the last") get a number + unit; everything
   else is free text. */
function valueKind(op, valueless) {
  if (valueless) return 'none';
  const k = String(op || '').toLowerCase();
  if (k === 'relbefore' || k === 'relafter') return 'rel';
  if (k === 'before' || k === 'after')       return 'date';
  return 'text';
}

function ValueCell({ kind, value, onChange }) {
  if (kind === 'date') {
    return <input type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} style={baseControlStyle({ flex: 1, minWidth: 140 })} />;
  }
  if (kind === 'rel') return <RelValue value={value} onChange={onChange} />;
  return (
    <input
      type="text"
      value={value || ''}
      placeholder="value"
      onChange={(e) => onChange(e.target.value)}
      style={{ ...baseControlStyle({ flex: 1, minWidth: 140 }), fontFamily: 'var(--gb-font-mono)' }}
    />
  );
}

const REL_UNITS = ['days', 'weeks', 'months', 'years'];
function RelValue({ value, onChange }) {
  const m = String(value || '').match(/^(\d+(?:\.\d+)?)\s*:\s*(\w+)/);
  const n = m ? m[1] : '';
  const unit = m && REL_UNITS.includes(m[2]) ? m[2] : 'days';
  return (
    <span style={{ display: 'inline-flex', gap: 4, flex: 1, minWidth: 150 }}>
      <input type="number" min={0} value={n} placeholder="30" onChange={(e) => onChange(`${e.target.value || 0}:${unit}`)} style={baseControlStyle({ width: 64 })} />
      <select value={unit} onChange={(e) => onChange(`${n || 0}:${e.target.value}`)} style={baseControlStyle({ flex: 1, minWidth: 80 })}>
        {REL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
    </span>
  );
}

function NotPill({ on, onClick }) {
  return (
    <button type="button" onClick={onClick} title={on ? 'Negation on — click to remove' : 'Negate this condition'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 26, borderRadius: 4,
        background: on ? 'var(--gb-error-tint-medium)' : 'var(--gb-fill-subtle)',
        border: '1px solid ' + (on ? 'var(--gb-error-tint-border)' : 'var(--gb-border-default)'),
        color: on ? 'var(--gb-error-fg)' : 'var(--gb-text-muted)',
        fontSize: 10, fontWeight: 800, letterSpacing: .4, fontFamily: 'var(--gb-font-mono)', cursor: 'pointer',
        transition: 'background-color .2s, border-color .2s, color .2s', flexShrink: 0,
      }}>NOT</button>
  );
}

function JoinerToggle({ value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', padding: 2, gap: 2, background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)' }}>
      {['AND', 'OR'].map((j) => {
        const on = value === j;
        return (
          <button key={j} type="button" onClick={() => onChange(j)}
            style={{
              padding: '0 8px', height: 20, border: 'none', cursor: 'pointer',
              background: on ? 'var(--gb-brand-tint-medium)' : 'transparent',
              color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
              fontSize: 10, fontWeight: 800, letterSpacing: .5, fontFamily: 'var(--gb-font-mono)', borderRadius: 3,
            }}>{j}</button>
        );
      })}
    </div>
  );
}

function JoinerDivider({ value, onChange, label, small, large }) {
  const hr = <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: small ? '6px 0' : large ? '14px 0' : '8px 0' }}>
      {hr}
      {label && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>{label}</span>}
      {onChange ? <JoinerToggle value={value} onChange={onChange} /> : (
        <span style={{ display: 'inline-flex', padding: '2px 8px', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', borderRadius: 'var(--gb-r-pill)', fontSize: 9.5, fontWeight: 800, letterSpacing: .6, color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)' }}>{value}</span>
      )}
      {hr}
    </div>
  );
}

function NativeSelect({ value, options, onChange, width }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={baseControlStyle({ width })}>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

function baseControlStyle({ width, minWidth, flex }) {
  return {
    height: 26, width, minWidth, flex, padding: '0 8px',
    background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 4,
    color: 'var(--gb-text-primary)', fontSize: 11.5, fontFamily: 'var(--gb-font-sans)', outline: 'none', boxSizing: 'border-box',
  };
}

function EmptyState({ hint, onAdd }) {
  return (
    <div style={{ padding: '20px 14px', textAlign: 'center', background: 'var(--gb-fill-subtle)', border: '1px dashed var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', maxWidth: 340, lineHeight: 1.45 }}>{hint}</div>
      <Btn size="sm" variant="dashed" icon={<I.plus size={11} />} onClick={onAdd}>Add first group</Btn>
    </div>
  );
}

const labelStyle = { fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-text-muted)' };
