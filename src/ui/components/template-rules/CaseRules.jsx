import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn } from '../Btn.jsx';
import { IconBtn } from '../IconBtn.jsx';
import { SectionLabel } from '../SectionLabel.jsx';
import { I } from '../../icons.jsx';

/* ───────────────────────────────────────────────────────────────
   CaseRules — grouped match rules for case templates.

   Save shape (the engine port consumes this exact tree):

     {
       outerJoiner: 'AND' | 'OR',                  // joins groups
       groups: [
         {
           id:        string,
           joiner:    'AND' | 'OR',                // joins conditions within
           conditions: [
             {
               id:    string,
               field: 'subject' | 'body' | 'from' | 'to',
               op:    'contains' | 'equals' | 'startsWith' |
                      'endsWith' | 'matchesRegex' | 'exists' | 'notExists',
               value: string,
               not:   boolean,
             },
           ],
         },
       ],
     }

   Legacy shape (the array of flat `{field, op, value}` triples
   still living in defaults.js) is lifted into a single AND group
   on first mount so existing templates render correctly.

   This file is pure UI + save-state; the rule evaluator in
   src/vanilla/modals/email-preview.js still expects the legacy
   flat form. The user has the engine port scheduled separately —
   any flat-rules consumers will be migrated when that lands.
─────────────────────────────────────────────────────────────── */

const FIELDS = [
  { id: 'subject', label: 'Subject' },
  { id: 'body',    label: 'Body'    },
  { id: 'from',    label: 'From'    },
  { id: 'to',      label: 'To'      },
];

const OPS = [
  { id: 'contains',     label: 'contains',     valueless: false },
  { id: 'equals',       label: 'equals',       valueless: false },
  { id: 'startsWith',   label: 'starts with',  valueless: false },
  { id: 'endsWith',     label: 'ends with',    valueless: false },
  { id: 'matchesRegex', label: 'matches /regex/', valueless: false },
  { id: 'exists',       label: 'is set',       valueless: true },
  { id: 'notExists',    label: 'is not set',   valueless: true },
];
const VALUELESS = new Set(OPS.filter((o) => o.valueless).map((o) => o.id));

const ROW_TRANSITION = { duration: 0.22, ease: [0.32, 0.72, 0, 1] };
const ROW_INITIAL    = { opacity: 0, y: -6, scale: 0.97 };
const ROW_ANIMATE    = { opacity: 1, y: 0,  scale: 1 };
const ROW_EXIT       = { opacity: 0, scale: 0.94, transition: { duration: 0.14 } };

let _uid = 0;
const uid = () => `r${++_uid}`;

const newCondition = () => ({
  id: uid(),
  field: 'subject',
  op: 'contains',
  value: '',
  not: false,
});
const newGroup = () => ({
  id: uid(),
  joiner: 'AND',
  conditions: [newCondition()],
});

/* Accept either the legacy flat array or the new grouped tree.
   Returning null tells the caller to seed with a single empty
   group on first edit — keeps the empty-state path explicit. */
function normalizeInitial(input) {
  if (!input) return { outerJoiner: 'AND', groups: [] };
  // Already the new shape
  if (!Array.isArray(input) && Array.isArray(input.groups)) {
    return {
      outerJoiner: input.outerJoiner === 'OR' ? 'OR' : 'AND',
      groups: input.groups.map((g) => ({
        id: g.id || uid(),
        joiner: g.joiner === 'OR' ? 'OR' : 'AND',
        conditions: (g.conditions || []).map((c) => ({
          id: c.id || uid(),
          field: c.field || 'subject',
          op:    c.op    || 'contains',
          value: c.value ?? '',
          not:   !!c.not,
        })),
      })),
    };
  }
  // Legacy flat array → one AND group
  if (Array.isArray(input) && input.length > 0) {
    return {
      outerJoiner: 'AND',
      groups: [{
        id: uid(),
        joiner: 'AND',
        conditions: input.map((r) => ({
          id: uid(),
          field: r.field || r.left || 'subject',
          op:    canonicalizeOp(r.op),
          value: r.value ?? r.right ?? '',
          not:   false,
        })),
      }],
    };
  }
  return { outerJoiner: 'AND', groups: [] };
}

/* Snake_case ops from the legacy engine (e.g. starts_with) → our
   camelCase ids. Unknown ops fall through unchanged so anyone
   inspecting the saved JSON in storage can see the original. */
function canonicalizeOp(raw) {
  if (!raw) return 'contains';
  const k = String(raw).replace(/[_\s]+/g, '').toLowerCase();
  if (k === 'startswith')   return 'startsWith';
  if (k === 'endswith')     return 'endsWith';
  if (k === 'matchesregex') return 'matchesRegex';
  if (k === 'notcontains')  return 'contains'; // surfaced as NOT + contains
  if (k === 'notexists')    return 'notExists';
  return k;
}

export function CaseRules({ initial, onChange }) {
  const [state, setState] = useState(() => normalizeInitial(initial));
  const { outerJoiner, groups } = state;

  /* Single commit point — every mutation runs through here so the
     parent always sees a consistent {outerJoiner, groups} tree. */
  const commit = (next) => {
    setState(next);
    onChange?.(next);
  };

  const setOuterJoiner = (j) => commit({ ...state, outerJoiner: j });

  const addGroup = () => commit({
    ...state,
    groups: [...groups, newGroup()],
  });
  const removeGroup = (gid) => commit({
    ...state,
    groups: groups.filter((g) => g.id !== gid),
  });
  const setGroupJoiner = (gid, joiner) => commit({
    ...state,
    groups: groups.map((g) => (g.id === gid ? { ...g, joiner } : g)),
  });

  const addCondition = (gid) => commit({
    ...state,
    groups: groups.map((g) => (g.id === gid
      ? { ...g, conditions: [...g.conditions, newCondition()] }
      : g)),
  });
  const patchCondition = (gid, cid, patch) => commit({
    ...state,
    groups: groups.map((g) => (g.id === gid
      ? { ...g, conditions: g.conditions.map((c) => (c.id === cid ? { ...c, ...patch } : c)) }
      : g)),
  });
  const removeCondition = (gid, cid) => commit({
    ...state,
    groups: groups.map((g) => (g.id === gid
      ? { ...g, conditions: g.conditions.filter((c) => c.id !== cid) }
      : g)),
  });
  const duplicateCondition = (gid, cid) => commit({
    ...state,
    groups: groups.map((g) => {
      if (g.id !== gid) return g;
      const i = g.conditions.findIndex((c) => c.id === cid);
      if (i < 0) return g;
      const dup = { ...g.conditions[i], id: uid() };
      const next = [...g.conditions];
      next.splice(i + 1, 0, dup);
      return { ...g, conditions: next };
    }),
  });
  const moveCondition = (gid, cid, dir) => commit({
    ...state,
    groups: groups.map((g) => {
      if (g.id !== gid) return g;
      const i = g.conditions.findIndex((c) => c.id === cid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= g.conditions.length) return g;
      const next = [...g.conditions];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...g, conditions: next };
    }),
  });

  const hasGroups = groups.length > 0;

  return (
    <div>
      <SectionLabel
        action={
          <Btn variant="ghost" size="xs" icon={<I.plus />} onClick={addGroup}>
            Add group
          </Btn>
        }
      >
        Match rules
      </SectionLabel>

      {!hasGroups ? (
        <EmptyState onAdd={addGroup} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <AnimatePresence mode="popLayout" initial={false}>
            {groups.map((g, i) => (
              <motion.div
                key={g.id}
                layout
                initial={ROW_INITIAL}
                animate={ROW_ANIMATE}
                exit={ROW_EXIT}
                transition={ROW_TRANSITION}
              >
                <GroupCard
                  group={g}
                  index={i}
                  canRemove={groups.length > 1}
                  onJoinerChange={(j) => setGroupJoiner(g.id, j)}
                  onAddCondition={() => addCondition(g.id)}
                  onPatchCondition={(cid, patch) => patchCondition(g.id, cid, patch)}
                  onRemoveCondition={(cid) => removeCondition(g.id, cid)}
                  onDuplicateCondition={(cid) => duplicateCondition(g.id, cid)}
                  onMoveCondition={(cid, dir) => moveCondition(g.id, cid, dir)}
                  onRemoveGroup={() => removeGroup(g.id)}
                />
                {i < groups.length - 1 && (
                  <JoinerDivider
                    value={outerJoiner}
                    onChange={setOuterJoiner}
                    label="GROUP JOIN"
                    large
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          <div style={{ marginTop: 10, display: 'flex' }}>
            <Btn size="sm" variant="dashed" icon={<I.plus size={11} />} onClick={addGroup}>
              Add group
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   GroupCard — surface-1 panel with header + condition list
═══════════════════════════════════════════════════════════ */
function GroupCard({
  group, index, canRemove,
  onJoinerChange, onAddCondition,
  onPatchCondition, onRemoveCondition, onDuplicateCondition, onMoveCondition,
  onRemoveGroup,
}) {
  return (
    <div style={{
      padding: 12,
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-subtle)',
      borderRadius: 'var(--gb-r-md)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10,
      }}>
        <span style={groupLetterStyle}>Group {String.fromCharCode(65 + index)}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
        <span style={matchLabelStyle}>match</span>
        <JoinerToggle value={group.joiner} onChange={onJoinerChange} />
        <IconBtn
          size="xs" variant="ghost" danger
          icon={<I.trash size={10} />}
          disabled={!canRemove}
          onClick={onRemoveGroup}
          tooltip={canRemove ? 'Remove group' : 'At least one group required'}
        />
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {group.conditions.map((c, i) => (
          <motion.div
            key={c.id}
            layout
            initial={ROW_INITIAL}
            animate={ROW_ANIMATE}
            exit={ROW_EXIT}
            transition={ROW_TRANSITION}
          >
            {i > 0 && <JoinerDivider value={group.joiner} small />}
            <ConditionRow
              condition={c}
              canRemove={group.conditions.length > 1}
              onPatch={(patch) => onPatchCondition(c.id, patch)}
              onRemove={() => onRemoveCondition(c.id)}
              onDuplicate={() => onDuplicateCondition(c.id)}
              onMoveUp={i > 0 ? () => onMoveCondition(c.id, -1) : null}
              onMoveDown={i < group.conditions.length - 1 ? () => onMoveCondition(c.id, 1) : null}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      <div style={{ marginTop: 8 }}>
        <Btn size="xs" variant="ghost" icon={<I.plus size={10} />} onClick={onAddCondition}>
          Add condition
        </Btn>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ConditionRow — NOT pill + field + op + value + row actions
═══════════════════════════════════════════════════════════ */
function ConditionRow({ condition, onPatch, onRemove, onDuplicate, onMoveUp, onMoveDown, canRemove }) {
  const valueless = VALUELESS.has(condition.op);

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: 10,
      background: 'var(--gb-surface-2)',
      border: '1px solid ' + (condition.not
        ? 'var(--gb-error-tint-border)'
        : 'var(--gb-border-subtle)'),
      borderRadius: 'var(--gb-r-sm)',
      transition: 'border-color .2s',
    }}>
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      }}>
        <NotPill on={condition.not} onClick={() => onPatch({ not: !condition.not })} />
        <NativeSelect
          value={condition.field}
          options={FIELDS}
          width={108}
          onChange={(v) => onPatch({ field: v })}
        />
        <NativeSelect
          value={condition.op}
          options={OPS}
          width={150}
          onChange={(v) => {
            const patch = { op: v };
            if (VALUELESS.has(v)) patch.value = '';
            onPatch(patch);
          }}
        />
        {valueless ? (
          <span style={{
            flex: 1, minWidth: 130,
            fontSize: 11, fontStyle: 'italic',
            color: 'var(--gb-text-muted)',
            padding: '0 8px',
          }}>no value needed</span>
        ) : (
          <input
            type="text"
            value={condition.value}
            placeholder={condition.op === 'matchesRegex' ? 'pattern' : 'keyword'}
            onChange={(e) => onPatch({ value: e.target.value })}
            style={{
              ...baseControlStyle({ flex: 1, minWidth: 140 }),
              fontFamily: 'var(--gb-font-mono)',
            }}
          />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <IconBtn
          size="xs" variant="ghost"
          icon={<ChevUpIcon size={11} />}
          onClick={onMoveUp}
          disabled={!onMoveUp}
          tooltip="Move up"
        />
        <IconBtn
          size="xs" variant="ghost"
          icon={<ChevDownIcon size={11} />}
          onClick={onMoveDown}
          disabled={!onMoveDown}
          tooltip="Move down"
        />
        <IconBtn
          size="xs" variant="ghost"
          icon={<I.copy size={10} />}
          onClick={onDuplicate}
          tooltip="Duplicate"
        />
        <IconBtn
          size="xs" variant="ghost" danger
          icon={<I.trash size={10} />}
          disabled={!canRemove}
          onClick={onRemove}
          tooltip={canRemove ? 'Remove condition' : 'At least one condition is required'}
        />
      </div>
    </div>
  );
}

function NotPill({ on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={on ? 'Negation on — click to remove' : 'Negate this condition'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 26,
        borderRadius: 4,
        background: on ? 'var(--gb-error-tint-medium)' : 'var(--gb-fill-subtle)',
        border: '1px solid ' + (on ? 'var(--gb-error-tint-border)' : 'var(--gb-border-default)'),
        color: on ? 'var(--gb-error-fg)' : 'var(--gb-text-muted)',
        fontSize: 10, fontWeight: 800, letterSpacing: .4,
        fontFamily: 'var(--gb-font-mono)',
        cursor: 'pointer',
        transition: 'background-color .2s, border-color .2s, color .2s',
        flexShrink: 0,
      }}
    >NOT</button>
  );
}

/* ════════════════════════════════════════════════════════════
   JoinerToggle — compact AND/OR segmented control
═══════════════════════════════════════════════════════════ */
function JoinerToggle({ value, onChange }) {
  return (
    <div style={{
      display: 'inline-flex', padding: 2, gap: 2,
      background: 'var(--gb-surface-2)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-sm)',
    }}>
      {['AND', 'OR'].map((j) => {
        const on = value === j;
        return (
          <button
            key={j}
            type="button"
            onClick={() => onChange(j)}
            style={{
              padding: '0 8px', height: 20,
              border: 'none', cursor: 'pointer',
              background: on ? 'var(--gb-brand-tint-medium)' : 'transparent',
              color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
              fontSize: 10, fontWeight: 800, letterSpacing: .5,
              fontFamily: 'var(--gb-font-mono)',
              borderRadius: 3,
            }}
          >{j}</button>
        );
      })}
    </div>
  );
}

/* Between-conditions divider. `large` reserves the slot used
   between groups (the outer joiner gets a toggle); `small` runs
   between rows in a single group (read-only — the group header
   owns that joiner). */
function JoinerDivider({ value, onChange, label, small, large }) {
  const hr = <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      margin: small ? '6px 0' : large ? '14px 0' : '8px 0',
    }}>
      {hr}
      {label && (
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase',
          color: 'var(--gb-text-muted)',
        }}>{label}</span>
      )}
      {onChange ? (
        <JoinerToggle value={value} onChange={onChange} />
      ) : (
        <span style={{
          display: 'inline-flex', padding: '2px 8px',
          background: 'var(--gb-brand-tint-soft)',
          border: '1px solid var(--gb-brand-tint-border)',
          borderRadius: 'var(--gb-r-pill)',
          fontSize: 9.5, fontWeight: 800, letterSpacing: .6,
          color: 'var(--gb-brand-label)',
          fontFamily: 'var(--gb-font-mono)',
        }}>{value}</span>
      )}
      {hr}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   NativeSelect — token-styled native select, matched to the
   inline inputs around it so the row reads as one control bar.
═══════════════════════════════════════════════════════════ */
function NativeSelect({ value, options, onChange, width }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={baseControlStyle({ width })}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  );
}

function baseControlStyle({ width, minWidth, maxWidth, flex }) {
  return {
    height: 26,
    width:    width,
    minWidth: minWidth,
    maxWidth: maxWidth,
    flex:     flex,
    padding: '0 8px',
    background: 'var(--gb-surface-2)',
    border: '1px solid var(--gb-border-default)',
    borderRadius: 4,
    color: 'var(--gb-text-primary)',
    fontSize: 11.5,
    fontFamily: 'var(--gb-font-sans)',
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent('rgb(150,150,150)')}' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    backgroundSize: '10px',
    paddingRight: 24,
  };
}

function EmptyState({ onAdd }) {
  return (
    <div style={{
      padding: '20px 14px',
      textAlign: 'center',
      background: 'var(--gb-fill-subtle)',
      border: '1px dashed var(--gb-border-default)',
      borderRadius: 'var(--gb-r-md)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}>
      <div style={{
        fontSize: 11.5,
        color: 'var(--gb-text-muted)',
        maxWidth: 340,
        lineHeight: 1.45,
      }}>
        No match rules yet. Add a group of conditions to start matching
        inbound emails — combine conditions inside a group with AND/OR,
        then join groups with the outer AND/OR.
      </div>
      <Btn size="sm" variant="dashed" icon={<I.plus size={11} />} onClick={onAdd}>
        Add first group
      </Btn>
    </div>
  );
}

function ChevUpIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}
function ChevDownIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

const groupLetterStyle = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: 1,
  textTransform: 'uppercase',
  color: 'var(--gb-text-muted)',
};
const matchLabelStyle = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: .8,
  textTransform: 'uppercase',
  color: 'var(--gb-text-muted)',
};
