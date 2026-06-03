import React from 'react';
import { VariableSchemaPicker } from '../VariableSchemaPicker.jsx';
import { RuleGroups } from './RuleGroups.jsx';
import { OPS_BY_TYPE } from '../../../lib/matchEngine.js';
import { listPaths } from '../../../lib/page-engine/resolve.js';
import { orderSchema } from '../../../lib/page-schemas/order.js';

/* ───────────────────────────────────────────────────────────────
   OrderRules — auto-match rules for order templates. Mirrors
   AccountConditions exactly (same grouped RuleGroups + the shared
   VariableSchemaPicker tree picker) but pointed at the ORDER schema,
   so conditions test order.status / order.totals.total / order.number
   / order.items[…] etc. alongside the template's own variables.

   The runtime matcher already resolves source:'schema' conditions via
   the page engine (vanilla/main.js getValue), so an order schema rule
   matches on a ViewOrder page with no extra wiring.

   Props: initial (saved rules — legacy flat array or grouped tree),
   onChange (emits the grouped tree), varNames (this template's vars).
─────────────────────────────────────────────────────────────── */

/* schema type → the matchEngine operator family. */
function mapType(t) {
  if (t === 'number' || t === 'currency') return 'number';
  if (t === 'date') return 'date';
  return 'string';
}

/* Selectable order-schema fields → type lookup (for op family + the
   condition's declared type). */
const SCHEMA_OPTIONS = (() => {
  try {
    return listPaths(orderSchema, {})
      .filter((n) => n.type !== 'object')
      .map((n) => ({ path: n.path, type: mapType(n.type) }));
  } catch { return []; }
})();
const TYPE_BY_PATH = Object.fromEntries(SCHEMA_OPTIONS.map((o) => [o.path, o.type]));
const canonPath = (p) => (p || '').replace(/\[(?:-?\d+|any|none)\]/g, '[0]');
function engineTypeForRef(ref) {
  return TYPE_BY_PATH[canonPath(ref)] || 'string';
}

/* Legacy flat order rule → grouped condition. Old order rules were
   selector/var based; a selector carries over as source:'dom' (still
   resolves through the engine's DOM resolver). The one-version migration
   scratches these so they get re-authored against the schema. */
function fromLegacy(r) {
  if (r && (r.source === 'schema' || r.source === 'var' || r.source === 'dom')) {
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

function OrderSubjectPicker({ condition, patch, varNames }) {
  /* Same combined tree picker the account conditions use — schema field
     tree (order.*) + a Variables section. A variable selection comes back
     as a `vars.<name>` pseudo-path; everything else is a schema path. */
  const value = condition.source === 'var' ? `vars.${condition.ref}` : (condition.ref || '');
  return (
    <VariableSchemaPicker
      value={value}
      varNames={varNames}
      schema={orderSchema}
      allowQuantifiers
      overlay
      embedArrayRow={false}
      placeholder="Pick a field or variable…"
      onChange={(val) => {
        if (val && val.startsWith('vars.')) {
          patch({ source: 'var', ref: val.slice('vars.'.length), type: 'string' });
        } else {
          patch({ source: 'schema', ref: val, type: engineTypeForRef(val) });
        }
      }}
    />
  );
}

export function OrderRules({ initial, onChange, varNames = [] }) {
  const renderSubject = (condition, patch) => (
    <OrderSubjectPicker condition={condition} patch={patch} varNames={varNames} />
  );
  return (
    <RuleGroups
      initial={initial}
      fromLegacy={fromLegacy}
      defaultSource="schema"
      renderSubject={renderSubject}
      opsFor={(c) => OPS_BY_TYPE[c.type || 'string'] || OPS_BY_TYPE.string}
      onChange={onChange}
      label="Auto-match rules"
      emptyHint="No match rules yet. Add a group that tests the order schema fields (order.status, order.totals.total, …) or this template's variables — combine them with AND/OR — to auto-trigger this template on a ViewOrder page."
    />
  );
}
