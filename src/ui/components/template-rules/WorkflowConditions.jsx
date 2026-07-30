import React from 'react';
import { VariableSchemaPicker } from '../VariableSchemaPicker.jsx';
import { CodeVarEditor } from '../CodeVarEditor.jsx';
import { Dropdown } from '../Dropdown.jsx';
import { RuleGroups } from './RuleGroups.jsx';
import { OPS_BY_TYPE } from '../../../lib/matchEngine.js';
import { listPaths } from '../../../lib/page-engine/resolve.js';
import { contactSchema } from '../../../lib/page-schemas/contact.js';

/* ───────────────────────────────────────────────────────────────
   WorkflowConditions — run conditions for a workflow step.

   Two subject sources, both reusing the exact Settings-page pieces:
     • SCHEMA — the same VariableSchemaPicker dropdown the account /
       order template rules use (the contact/account/order field tree).
     • CODE   — the full CodeVarEditor (CodeMirror + ctx/h autocomplete),
       minus the template-variable section. A return-type selector
       (string / number / boolean / array / object) drives which
       operators the value is validated against.

   Save shape is the matchEngine grouped tree; schema fields resolve via
   resolvePath, code conditions via evaluateCode (source: 'var', ref =
   the code body). condition.type carries the schema field type OR the
   code's declared return type, and drives opsFor.
─────────────────────────────────────────────────────────────── */

function mapType(t) {
  if (t === 'number' || t === 'currency') return 'number';
  if (t === 'date') return 'date';
  return 'string';
}
function typeFromSuffix(ref) {
  if (/_dt$/.test(ref))      return 'date';
  if (/_(i|f|d)$/.test(ref)) return 'number';
  return 'string';
}
const SCHEMA_TYPE_BY_PATH = (() => {
  try {
    const out = {};
    for (const n of listPaths(contactSchema, {})) if (n.type !== 'object') out[n.path] = mapType(n.type);
    return out;
  } catch { return {}; }
})();
const canonPath = (p) => (p || '').replace(/\[(?:-?\d+|any|none)\]/g, '[0]');
function engineTypeForRef(ref) {
  return SCHEMA_TYPE_BY_PATH[canonPath(ref)] || typeFromSuffix(ref);
}

/* Code return types → the operator family they validate against. */
export const CODE_RETURN_TYPES = [
  { id: 'string',  label: 'String' },
  { id: 'number',  label: 'Number' },
  { id: 'boolean', label: 'Boolean' },
  { id: 'array',   label: 'Array' },
  { id: 'object',  label: 'Object' },
];
const COLLECTION_OPS = {
  // Array uses the schema array format: an item-mode (first/last/any/none/
  // index) selector + a per-item operator — so its ops are the string ops
  // applied to the chosen item(s).
  array: OPS_BY_TYPE.string,
  boolean: [
    { id: 'isTrue',  label: 'is true',  valueless: true },
    { id: 'isFalse', label: 'is false', valueless: true },
  ],
  object: [
    { id: 'hasKey',    label: 'has key' },
    { id: 'exists',    label: 'is set',     valueless: true },
    { id: 'notExists', label: 'is not set', valueless: true },
  ],
};
const DEFAULT_OP = { string: 'contains', number: 'gte', date: 'before', boolean: 'isTrue', array: 'contains', object: 'exists' };

/* Array item-mode options — mirror the schema array quantifier control. */
const ARRAY_MODES = [
  { id: 'any',   label: 'Any item' },
  { id: 'none',  label: 'No item' },
  { id: 'first', label: 'First' },
  { id: 'last',  label: 'Last' },
  { id: 'index', label: 'At index' },
];

export function opsForWorkflowCondition(c) {
  const t = c?.type || 'string';
  return OPS_BY_TYPE[t] || COLLECTION_OPS[t] || OPS_BY_TYPE.string;
}

/* Small Schema / Code source switch. */
function SourceToggle({ source, onPick }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[['schema', 'Schema field'], ['var', 'Code']].map(([id, label]) => {
        const on = source === id;
        return (
          <button key={id} type="button" onClick={() => onPick(id)}
            style={{ flex: 1, height: 22, border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-surface-2)', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--gb-font-sans)' }}>{label}</button>
        );
      })}
    </div>
  );
}

/* The workflow subject uses RuleGroups' split contract: { header, body }.
   header = the Schema/Code source toggle; body = the schema picker, or the
   Returns-type row + code editor. NOT + delete are supplied by ConditionRow's
   header line, so they're not rendered here. */
function renderWorkflowSubject(condition, patch) {
  const isCode = condition.source === 'var';
  const pickSource = (src) => {
    if (src === 'var') patch({ source: 'var', ref: '', type: 'string', op: DEFAULT_OP.string, value: '' });
    else patch({ source: 'schema', ref: '', type: 'string', op: DEFAULT_OP.string, value: '' });
  };

  const header = <SourceToggle source={isCode ? 'var' : 'schema'} onPick={pickSource} />;

  const body = !isCode ? (
    <VariableSchemaPicker
      value={condition.ref || ''}
      varNames={[]}
      allowQuantifiers
      overlay
      embedArrayRow={false}
      placeholder="Pick a contact / account field…"
      onChange={(val) => patch({ source: 'schema', ref: val, type: engineTypeForRef(val) })}
    />
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)' }}>Returns</span>
        <div style={{ width: 132 }}>
          <Dropdown size="sm" value={condition.type || 'string'} options={CODE_RETURN_TYPES}
            onChange={(t) => patch({ type: t, op: DEFAULT_OP[t] || 'contains', value: '', arrayMode: t === 'array' ? (condition.arrayMode || 'any') : undefined, arrayIndex: undefined })} />
        </div>
        {/* Array item-mode (first/last/any/none/index) — same format as schema array types. */}
        {condition.type === 'array' && (
          <>
            <div style={{ width: 110 }}>
              <Dropdown size="sm" value={condition.arrayMode || 'any'} options={ARRAY_MODES}
                onChange={(m) => patch({ arrayMode: m })} />
            </div>
            {condition.arrayMode === 'index' && (
              <input type="number" min={0} value={String(condition.arrayIndex ?? 0)}
                onChange={(e) => patch({ arrayIndex: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                style={{ width: 52, height: 28, padding: '0 8px', boxSizing: 'border-box', background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 4, color: 'var(--gb-text-primary)', fontSize: 11.5, outline: 'none' }} />
            )}
          </>
        )}
      </div>
      <CodeVarEditor
        value={condition.ref || ''}
        onChange={(body) => patch({ ref: body })}
        typeId="account"
        varNames={[]}
        hideActions
        placeholder="return a value · ctx = contact/account data · h = helpers"
      />
    </div>
  );

  return { header, body };
}

export function WorkflowConditions({ initial, onChange }) {
  return (
    <RuleGroups
      initial={initial}
      defaultSource="schema"
      renderSubject={renderWorkflowSubject}
      opsFor={opsForWorkflowCondition}
      allowEmpty
      onChange={onChange}
      label="Run conditions"
      emptyHint="No conditions — this step always runs. Add a group that tests a schema field or a code expression, combined with AND/OR."
    />
  );
}
