import React from 'react';
import { Dropdown } from '../Dropdown.jsx';
import { Btn } from '../Btn.jsx';
import { RuleGroups } from './RuleGroups.jsx';
import { OPS_BY_TYPE } from '../../../lib/matchEngine.js';
import { listPaths } from '../../../lib/page-engine/resolve.js';
import { orderSchema } from '../../../lib/page-schemas/order.js';

/* ───────────────────────────────────────────────────────────────
   OrderRules — auto-match rules for order templates, a thin wrapper
   over the shared grouped RuleGroups.

   Now that the order page has a schema (src/lib/page-schemas/order.js)
   conditions test ORDER SCHEMA fields directly — order.status,
   order.totals.total, order.number, … — picked from one dropdown
   alongside the template's own variables. The runtime matcher already
   resolves source:'schema' conditions via the page engine (see
   vanilla/main.js getValue), so a schema rule "just works" on a
   ViewOrder page.

   Legacy selector rules (source:'dom') still render as a read-only
   chip with a "Use field" swap — but the one-version migration
   scratches old order rules so they get re-authored against the
   schema.

   Props: initial (saved rules — legacy flat array or grouped tree),
   onChange (emits the grouped tree), varNames (this template's vars).
─────────────────────────────────────────────────────────────── */

function mapType(t) {
  if (t === 'number' || t === 'currency') return 'number';
  if (t === 'date') return 'date';
  return 'string';
}

/* Selectable order-schema fields (leaves + array-item leaves; object
   containers aren't selectable values). Built once. */
const SCHEMA_OPTIONS = (() => {
  try {
    return listPaths(orderSchema, {})
      .filter((n) => n.type !== 'object')
      .map((n) => ({ id: `schema:${n.path}`, label: n.path, _type: mapType(n.type) }));
  } catch { return []; }
})();
const TYPE_BY_PATH = Object.fromEntries(SCHEMA_OPTIONS.map((o) => [o.label, o._type]));
const canonPath = (p) => (p || '').replace(/\[(?:-?\d+|any|none)\]/g, '[0]');
const typeForRef = (ref) => TYPE_BY_PATH[canonPath(ref)] || 'string';

/* Legacy flat order rule { left/selector, op, right/value } → a grouped
   condition. A selector carries over as source:'dom' (read-only chip);
   most legacy rules are cleared by the migration, so this is a safety net. */
function fromLegacy(r) {
  if (r && (r.source === 'var' || r.source === 'schema')) {
    return { source: r.source, ref: r.ref ?? '', type: r.type ?? 'string', op: r.op ?? 'is', value: r.value ?? '', not: !!r.not };
  }
  return {
    source: 'dom',
    ref:   r.left ?? r.selector ?? '',
    type:  'string',
    op:    r.op ?? r.operator ?? 'contains',
    value: r.right ?? r.value ?? '',
    not:   false,
  };
}

export function OrderRules({ initial, onChange, varNames = [] }) {
  const options = [
    ...SCHEMA_OPTIONS.map((o) => ({ id: o.id, label: o.label })),
    ...varNames.map((n) => ({ id: `var:${n}`, label: n })),
  ];

  const renderSubject = (condition, patch) => {
    // Legacy selector condition — show it, offer to swap to a schema field.
    if (condition.source === 'dom') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
          <span style={{
            flex: 1, minWidth: 0, padding: '0 8px', height: 26, display: 'flex', alignItems: 'center',
            background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', borderRadius: 4,
            fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, color: 'var(--gb-text-tertiary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{condition.ref || '(selector)'}</span>
          <Btn size="xs" variant="ghost" onClick={() => patch({ source: 'schema', ref: '', type: 'string' })}>Use field</Btn>
        </div>
      );
    }
    const value = condition.source === 'var' ? `var:${condition.ref}` : (condition.ref ? `schema:${condition.ref}` : '');
    return (
      <Dropdown
        size="sm"
        searchable
        value={value}
        placeholder={options.length ? 'Pick a field or variable…' : 'No fields yet'}
        options={options}
        onChange={(val) => {
          if (val && val.startsWith('schema:')) {
            const ref = val.slice('schema:'.length);
            patch({ source: 'schema', ref, type: typeForRef(ref) });
          } else if (val && val.startsWith('var:')) {
            patch({ source: 'var', ref: val.slice('var:'.length), type: 'string' });
          }
        }}
      />
    );
  };

  return (
    <RuleGroups
      initial={initial}
      fromLegacy={fromLegacy}
      defaultSource="schema"
      renderSubject={renderSubject}
      opsFor={(c) => OPS_BY_TYPE[c.type || 'string'] || OPS_BY_TYPE.string}
      onChange={onChange}
      label="Auto-match rules"
      emptyHint="No match rules yet. Add a group of conditions that test the order schema fields (order.status, order.totals.total, …) or this template's variables — combine them with AND/OR — to auto-trigger this template on a ViewOrder page."
    />
  );
}
