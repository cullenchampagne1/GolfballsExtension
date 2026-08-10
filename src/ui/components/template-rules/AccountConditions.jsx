import React from 'react';
import { VariableSchemaPicker } from '../VariableSchemaPicker.jsx';
import { RuleGroups } from './RuleGroups.jsx';
import { OPS_BY_TYPE } from '../../../lib/matchEngine.js';
import { listPaths } from '../../../lib/page-engine/resolve.js';
import { contactSchema } from '../../../lib/page-schemas/contact.js';

/* ───────────────────────────────────────────────────────────────
   AccountConditions — match conditions for account/contact
   templates, now a thin wrapper over the shared grouped RuleGroups.

   The subject of each condition is picked from one dropdown with two
   sections — the template's own VARIABLES and the page-engine SCHEMA
   field tree (the unified contact/account extractor). That's the
   "variables in the schema dropdown" that closes the loop: any match
   rule against any variable (incl. code) or schema field.

   Props: initial (saved accountConditions — legacy flat array or a
   grouped tree), onChange (emits the grouped tree), varNames.
─────────────────────────────────────────────────────────────── */

/* schema type → the matchEngine operator family. */
function mapType(t) {
  if (t === 'number' || t === 'currency') return 'number';
  if (t === 'date') return 'date';
  return 'string';
}
/* Legacy Solr field-name suffix → type (orderCount_i, lastOrderDate_dt). */
function typeFromSuffix(ref) {
  if (/_dt$/.test(ref))        return 'date';
  if (/_(i|f|d)$/.test(ref))   return 'number';
  return 'string';
}

/* Selectable schema fields — leaves + arrays + array-item leaves
   (object container nodes aren't selectable values). Built once. */
const SCHEMA_OPTIONS = (() => {
  try {
    return listPaths(contactSchema, {})
      .filter((n) => n.type !== 'object')
      .map((n) => {
        const top = n.path.split(/[.[]/)[0] || 'field';
        return {
          id: `schema:${n.path}`,
          label: n.path,
          group: top.charAt(0).toUpperCase() + top.slice(1),
          _engineType: mapType(n.type),
        };
      });
  } catch { return []; }
})();
const ENGINE_TYPE_BY_ID = Object.fromEntries(SCHEMA_OPTIONS.map((o) => [o.id, o._engineType]));
/* canonical schema path (array indices/quantifiers normalized) → type. */
const ENGINE_TYPE_BY_PATH = Object.fromEntries(SCHEMA_OPTIONS.map((o) => [o.label, o._engineType]));
const canonPath = (p) => (p || '').replace(/\[(?:-?\d+|any|none)\]/g, '[0]');
function engineTypeForRef(ref) {
  return ENGINE_TYPE_BY_PATH[canonPath(ref)] || typeFromSuffix(ref);
}

/* Legacy account condition → grouped condition. Accepts the current
   { path, op, value } shape and the older Solr { field, op, val,
   num, unit } shape; relative-date num+unit collapses to "N:unit". */
function accountFromLegacy(r) {
  const ref = r.path ?? r.field ?? '';
  let value = r.value ?? r.val ?? '';
  const opKey = String(r.op || '').replace(/[\s_]+/g, '').toLowerCase();
  if ((opKey === 'relbefore' || opKey === 'relafter') && r.num != null) {
    value = `${r.num}:${r.unit || 'days'}`;
  }
  const type = engineTypeForRef(ref);
  return { source: 'schema', ref, type, op: r.op || 'is', value, not: false };
}

function AccountSubjectPicker({ condition, patch, varNames }) {
  // The existing schema tree picker (sub-menus + array first/last/
  // index, plus any/none quantifiers for matching) with a Variables
  // section added. A variable selection comes back as a `vars.<name>`
  // pseudo-path; everything else is a schema path.
  const value = condition.source === 'var' ? `vars.${condition.ref}` : (condition.ref || '');
  return (
    <VariableSchemaPicker
      value={value}
      varNames={varNames}
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

export function AccountConditions({
  initial,
  onChange,
  varNames = [],
  label = 'Account match conditions',
  emptyHint = 'No conditions yet. Add a group that tests the contact/account schema fields or this template\'s variables — combine them with AND/OR.',
  allowEmpty = false,
}) {
  const renderSubject = (condition, patch) => (
    <AccountSubjectPicker condition={condition} patch={patch} varNames={varNames} />
  );
  return (
    <RuleGroups
      initial={initial}
      fromLegacy={accountFromLegacy}
      defaultSource="schema"
      renderSubject={renderSubject}
      opsFor={(c) => OPS_BY_TYPE[c.type || 'string'] || OPS_BY_TYPE.string}
      onChange={onChange}
      label={label}
      emptyHint={emptyHint}
      allowEmpty={allowEmpty}
    />
  );
}
