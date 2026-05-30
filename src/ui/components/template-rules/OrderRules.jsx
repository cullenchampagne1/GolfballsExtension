import React from 'react';
import { Dropdown } from '../Dropdown.jsx';
import { Btn } from '../Btn.jsx';
import { RuleGroups } from './RuleGroups.jsx';
import { OPS_BY_TYPE } from '../../../lib/matchEngine.js';

/* ───────────────────────────────────────────────────────────────
   OrderRules — auto-match rules for order templates, now a thin
   wrapper over the shared grouped RuleGroups.

   Order pages have no page-engine schema yet, so the only subject a
   condition can test is one of the template's own VARIABLES (which
   can run DOM/code to read anything on the page). Existing
   selector-based rules (source:'dom') still resolve and render as a
   read-only chip with a "Use variable" swap until they're re-authored.

   Props: initial (saved rules — legacy flat array or grouped tree),
   onChange (emits the grouped tree), varNames (this template's vars).
─────────────────────────────────────────────────────────────── */

/* Legacy flat order rule { left/selector, op/operator, right/value }
   → a grouped condition. Selectors carry over as source:'dom' so they
   keep matching through the engine's DOM resolver. */
function fromLegacy(r) {
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
  const options = varNames.map((n) => ({ id: n, label: n }));

  const renderSubject = (condition, patch) => {
    // Legacy selector condition — show it, offer to swap to a variable.
    if (condition.source === 'dom') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
          <span style={{
            flex: 1, minWidth: 0, padding: '0 8px', height: 26, display: 'flex', alignItems: 'center',
            background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', borderRadius: 4,
            fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, color: 'var(--gb-text-tertiary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{condition.ref || '(selector)'}</span>
          <Btn size="xs" variant="ghost" onClick={() => patch({ source: 'var', ref: '' })}>Use variable</Btn>
        </div>
      );
    }
    return (
      <Dropdown
        size="sm"
        searchable
        value={condition.ref}
        placeholder={options.length ? 'Pick a variable…' : 'No variables yet'}
        options={options}
        onChange={(v) => patch({ source: 'var', ref: v, type: 'string' })}
      />
    );
  };

  return (
    <RuleGroups
      initial={initial}
      fromLegacy={fromLegacy}
      defaultSource="var"
      renderSubject={renderSubject}
      opsFor={() => OPS_BY_TYPE.string}
      onChange={onChange}
      label="Auto-match rules"
      emptyHint="No match rules yet. Add a group of conditions that test this template's variables — combine them with AND/OR — to auto-trigger this template on a page."
    />
  );
}
