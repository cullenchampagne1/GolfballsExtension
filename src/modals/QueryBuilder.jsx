import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPanel, ModalHeader, ModalFooter, Btn, Input, Dropdown, IconBtn, I,
} from '../ui/index.js';
import { useDevSetting } from '../lib/devSettings.js';

/* ───────────────────────────────────────────────────────────────
   QueryBuilder — React port of content/crm-query-builder.js.

   A modal that lets users compose a Solr `fq` filter as a list of
   field/op/value conditions joined by AND. On Apply, it returns:
     {
       label:   human-readable summary, e.g. "Sales Rep is Jamie · Orders > 5"
       solrFq:  the compiled fq= clause, e.g. "salesRep_s:Jamie AND orderCount_i:{5 TO *}"
       conditions: the editable state, for re-opening
     }

   Two surface areas are kept in lock-step with the source:
     • QB_FIELDS  — list of queryable Solr fields; mirrors CRMSearch's
                    table columns so users can only filter on what
                    they can see.
     • compileToSolr — must produce the same fq syntax the legacy
                    crm-query-builder.js emitted, so the existing
                    server-side Solr index keeps working without a
                    parallel parser. Verbatim port of qbConditionToSolr.

   Value-editor variants by (field.type, op):
     text                          → single Input
     enum                          → Dropdown of field.options
     int/float (single op)         → number Input
     int/float (between)           → number Input + 'to' + number Input
     date (rel_past, rel_future)   → number Input + unit Dropdown + suffix
     date (before, after)          → date Input
     exists, not_exists,
     after_today, before_today     → no value editor
─────────────────────────────────────────────────────────────── */

export const QB_FIELDS = [
  { key: 'recordType_s',        label: 'Record Type',        type: 'enum',  options: ['Contact', 'Account'] },
  { key: 'salesRep_s',          label: 'Sales Rep',          type: 'text' },
  { key: 'podID_i',             label: 'Pod ID',             type: 'int'  },
  { key: 'role_s',              label: 'Role',               type: 'enum',  options: ['BDR', 'AE', 'CSM', 'SE', 'Manager'] },
  { key: 'contactName_t',       label: 'Contact Name',       type: 'text' },
  { key: 'accountName_t',       label: 'Account Name',       type: 'text' },
  { key: 'accountID_s',         label: 'Account ID',         type: 'text' },
  { key: 'emails_tps',          label: 'Email',              type: 'text' },
  { key: 'phones_ss',           label: 'Phone',              type: 'text' },
  { key: 'orderCount_i',        label: 'Order Count',        type: 'int'  },
  { key: 'lastOrderDate_dt',    label: 'Last Order Date',    type: 'date' },
  { key: 'nextTaskDate_dt',     label: 'Next Task Date',     type: 'date' },
  { key: 'priorYearRevenue_f',  label: 'Prior Year Revenue', type: 'float'},
  { key: 'yearToDateRevenue_f', label: 'YTD Revenue',        type: 'float'},
  { key: 'salesRepID_s',        label: 'Sales Rep ID',       type: 'text' },
];

export const QB_OPS = {
  text:  [
    { id: 'is',         label: 'is (exact)'  },
    { id: 'contains',   label: 'contains'    },
    { id: 'starts',     label: 'starts with' },
    { id: 'exists',     label: 'is set'      },
    { id: 'not_exists', label: 'is not set'  },
  ],
  enum:  [
    { id: 'is',         label: 'is'      },
    { id: 'is_not',     label: 'is not'  },
  ],
  int:   [
    { id: 'eq',         label: '=' },
    { id: 'ne',         label: '≠' },
    { id: 'gt',         label: '>' },
    { id: 'gte',        label: '≥' },
    { id: 'lt',         label: '<' },
    { id: 'lte',        label: '≤' },
    { id: 'between',    label: 'between'    },
    { id: 'exists',     label: 'is set'     },
    { id: 'not_exists', label: 'is not set' },
  ],
  float: [
    { id: 'eq',         label: '=' },
    { id: 'gt',         label: '>' },
    { id: 'gte',        label: '≥' },
    { id: 'lt',         label: '<' },
    { id: 'lte',        label: '≤' },
    { id: 'between',    label: 'between'    },
    { id: 'exists',     label: 'is set'     },
    { id: 'not_exists', label: 'is not set' },
  ],
  date:  [
    { id: 'rel_past',     label: 'more than … ago'  },
    { id: 'rel_future',   label: 'within next …'    },
    { id: 'before',       label: 'before date'      },
    { id: 'after',        label: 'after date'       },
    { id: 'after_today',  label: 'after today'      },
    { id: 'before_today', label: 'before today'     },
    { id: 'exists',       label: 'is set'           },
    { id: 'not_exists',   label: 'is not set'       },
  ],
};

const QB_UNITS      = ['days', 'weeks', 'months', 'years'];
const QB_UNIT_OPTS  = QB_UNITS.map((u) => ({ id: u, label: u }));
const QB_UNIT_SOLR  = { days: 'DAY', weeks: 'WEEK', months: 'MONTH', years: 'YEAR' };

// Ops that don't take a value editor (the predicate is the whole condition).
const VALUELESS = new Set(['exists', 'not_exists', 'after_today', 'before_today']);

let _nextId = 1;
const newCondition = () => {
  const field = QB_FIELDS[0];
  const defaultVal = field.type === 'enum' ? (field.options[0] ?? '') : '';
  return { id: ++_nextId, fieldKey: field.key, op: 'is', val: defaultVal, val2: '', unit: 'years', num: '1' };
};

/* ── Solr compilation — verbatim from qbConditionToSolr ────────── */
function qbQuote(v) { return v.includes(' ') ? `"${v}"` : v; }

function conditionToSolr(field, c) {
  const k = field.key;
  const v = (c.val || '').trim();
  const v2 = (c.val2 || '').trim();
  const n = c.num || '1';
  const u = QB_UNIT_SOLR[c.unit] || 'YEAR';
  switch (c.op) {
    case 'is':           return v  ? `${k}:${qbQuote(v)}`         : null;
    case 'contains':     return v  ? `${k}:*${v}*`                : null;
    case 'starts':       return v  ? `${k}:${v}*`                 : null;
    case 'is_not':       return v  ? `-${k}:${qbQuote(v)}`        : null;
    case 'exists':       return `${k}:[* TO *]`;
    case 'not_exists':   return `-${k}:[* TO *]`;
    case 'eq':           return v  ? `${k}:${v}`                  : null;
    case 'ne':           return v  ? `-${k}:${v}`                 : null;
    case 'gt':           return v  ? `${k}:{${v} TO *}`           : null;
    case 'gte':          return v  ? `${k}:[${v} TO *]`           : null;
    case 'lt':           return v  ? `${k}:{* TO ${v}}`           : null;
    case 'lte':          return v  ? `${k}:[* TO ${v}]`           : null;
    case 'between':      return (v && v2) ? `${k}:[${v} TO ${v2}]` : null;
    case 'rel_past':     return `${k}:[* TO NOW-${n}${u}]`;
    case 'rel_future':   return `${k}:[NOW TO NOW%2B${n}${u}]`;
    case 'after_today':  return `${k}:[NOW TO *]`;
    case 'before_today': return `${k}:[* TO NOW]`;
    case 'before':       return v  ? `${k}:[* TO ${v}T00:00:00Z]` : null;
    case 'after':        return v  ? `${k}:[${v}T00:00:00Z TO *]` : null;
    default:             return null;
  }
}

export function compileToSolr(conditions) {
  return conditions.map((c) => {
    const field = QB_FIELDS.find((f) => f.key === c.fieldKey);
    return field ? conditionToSolr(field, c) : null;
  }).filter(Boolean).join(' AND ');
}

/* ── Human-readable label for the QB filter bar in CRMSearch ──── */
function conditionToLabel(field, c) {
  const fl = field.label;
  const v = (c.val || '').trim();
  const v2 = (c.val2 || '').trim();
  const n = c.num || '1';
  const u = c.unit || 'years';
  switch (c.op) {
    case 'is':            return v  ? `${fl} is ${v}` : null;
    case 'contains':      return v  ? `${fl} contains "${v}"` : null;
    case 'starts':        return v  ? `${fl} starts with "${v}"` : null;
    case 'is_not':        return v  ? `${fl} is not ${v}` : null;
    case 'exists':        return `${fl} is set`;
    case 'not_exists':    return `${fl} is not set`;
    case 'eq':            return v  ? `${fl} = ${v}`  : null;
    case 'ne':            return v  ? `${fl} ≠ ${v}`  : null;
    case 'gt':            return v  ? `${fl} > ${v}`  : null;
    case 'gte':           return v  ? `${fl} ≥ ${v}`  : null;
    case 'lt':            return v  ? `${fl} < ${v}`  : null;
    case 'lte':           return v  ? `${fl} ≤ ${v}`  : null;
    case 'between':       return (v && v2) ? `${fl} between ${v} and ${v2}` : null;
    case 'rel_past':      return `${fl} more than ${n} ${u} ago`;
    case 'rel_future':    return `${fl} within next ${n} ${u}`;
    case 'after_today':   return `${fl} after today`;
    case 'before_today':  return `${fl} before today`;
    case 'before':        return v  ? `${fl} before ${v}` : null;
    case 'after':         return v  ? `${fl} after ${v}`  : null;
    default:              return null;
  }
}

export function compileToLabel(conditions) {
  const parts = conditions.map((c) => {
    const field = QB_FIELDS.find((f) => f.key === c.fieldKey);
    return field ? conditionToLabel(field, c) : null;
  }).filter(Boolean);
  return parts.join(' · ');
}

/* ── Component ─────────────────────────────────────────────── */

export function QueryBuilder({ onClosed, bindClose, initialConditions = [], onApply }) {
  // Draggable preference mirrors CRMSearch so users get the same
  // behavior in both modals from a single setting.
  const draggable = useDevSetting('crmSearch.draggable') ?? false;

  const [conditions, setConditions] = useState(() =>
    initialConditions.length ? initialConditions.map((c) => ({ ...c, id: ++_nextId })) : [newCondition()]
  );

  const bindCloseRef = useRef(null);
  const handleBindClose = useCallback((fn) => {
    bindCloseRef.current = fn;
    bindClose?.(fn);
  }, [bindClose]);

  const solrFq = useMemo(() => compileToSolr(conditions), [conditions]);
  const label  = useMemo(() => compileToLabel(conditions), [conditions]);
  const canApply = solrFq.length > 0;

  const updateCondition = useCallback((id, patch) => {
    setConditions((arr) => arr.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);
  const removeCondition = useCallback((id) => {
    setConditions((arr) => arr.length <= 1 ? arr : arr.filter((c) => c.id !== id));
  }, []);
  const addCondition = useCallback(() => {
    setConditions((arr) => [...arr, newCondition()]);
  }, []);

  const handleApply = () => {
    if (!canApply) return;
    onApply?.({
      label,
      solrFq,
      // Strip the auto-incremented client id when handing back — caller
      // doesn't need it and we'll re-issue on re-open.
      conditions: conditions.map(({ id: _id, ...rest }) => rest),
    });
    bindCloseRef.current?.();
  };
  const handleClear = () => setConditions([newCondition()]);

  return (
    <FloatingPanel
      width={820}
      height={580}
      backdrop
      draggable={draggable}
      onClose={onClosed}
      bindClose={handleBindClose}
    >
      <ModalHeader
        icon={<FunnelIcon size={14} />}
        title="Query Builder"
        subtitle="Build a Solr filter — conditions are joined with AND"
      />

      {/* Conditions list — scrollable */}
      <div style={{
        flex: 1, minHeight: 0,
        overflow: 'auto',
        padding: '14px 18px',
        background: 'var(--gb-surface-canvas)',
      }}>
        <AnimatePresence initial={false}>
          {conditions.map((c, idx) => (
            <ConditionRow
              key={c.id}
              index={idx}
              condition={c}
              isLast={idx === conditions.length - 1}
              canDelete={conditions.length > 1}
              onChange={(patch) => updateCondition(c.id, patch)}
              onRemove={() => removeCondition(c.id)}
            />
          ))}
        </AnimatePresence>

        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-start' }}>
          <Btn
            size="sm"
            variant="ghost"
            icon={<I.plus size={11} />}
            onClick={addCondition}
          >
            Add condition
          </Btn>
        </div>
      </div>

      {/* Preview — compiled Solr fq, mono font, dim when empty */}
      <div style={{
        padding: '10px 18px',
        borderTop: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-surface-1)',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: 'var(--gb-text-muted)',
          flexShrink: 0,
        }}>fq</span>
        <code style={{
          flex: 1, minWidth: 0,
          fontSize: 11,
          fontFamily: 'var(--gb-font-mono)',
          color: canApply ? 'var(--gb-text-secondary)' : 'var(--gb-text-muted)',
          fontStyle: canApply ? 'normal' : 'italic',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={solrFq}>
          {canApply ? solrFq : '— add a condition above —'}
        </code>
      </div>

      <ModalFooter>
        <Btn variant="ghost" size="sm" onClick={handleClear}>Reset</Btn>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm" onClick={() => bindCloseRef.current?.()}>Cancel</Btn>
        <Btn
          variant="tinted"
          status="brand"
          size="sm"
          icon={<I.check size={11} />}
          disabled={!canApply}
          onClick={handleApply}
        >
          Apply filter
        </Btn>
      </ModalFooter>
    </FloatingPanel>
  );
}

/* ── ConditionRow ──────────────────────────────────────────── */
function ConditionRow({ index, condition, isLast, canDelete, onChange, onRemove }) {
  const field = QB_FIELDS.find((f) => f.key === condition.fieldKey) || QB_FIELDS[0];
  const ops = QB_OPS[field.type] || QB_OPS.text;

  // When the field changes, op might be invalid for the new field type
  // (e.g., text→int means "contains" is gone). Reset op + value if the
  // current op isn't available under the new field's type.
  const onFieldChange = (newKey) => {
    const newField = QB_FIELDS.find((f) => f.key === newKey) || QB_FIELDS[0];
    const newOps = QB_OPS[newField.type] || QB_OPS.text;
    const opStillValid = newOps.some((o) => o.id === condition.op);
    const patch = { fieldKey: newKey };
    if (!opStillValid) patch.op = newOps[0].id;
    // For enum fields, seed val with the first option so the Solr query
    // is non-empty as soon as the user picks the field.
    if (newField.type === 'enum') patch.val = newField.options[0] ?? '';
    else if (field.type === 'enum' && newField.type !== 'enum') patch.val = '';
    onChange(patch);
  };

  const fieldOpts = useMemo(() =>
    QB_FIELDS.map((f) => ({ id: f.key, label: f.label })),
  []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
      transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
      style={{ marginBottom: isLast ? 0 : 8 }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          width: 18, flexShrink: 0,
          fontSize: 10, fontWeight: 700, letterSpacing: 0.2,
          color: 'var(--gb-text-muted)',
          textAlign: 'right',
          fontFamily: 'var(--gb-font-mono)',
        }}>{index + 1}</span>

        <div style={{
          flex: 1, minWidth: 0,
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          padding: '8px 10px',
          background: 'var(--gb-surface-1)',
          border: '1px solid var(--gb-border-subtle)',
          borderRadius: 'var(--gb-r-sm)',
          transition: 'border-color .18s, background-color .18s',
        }}>
          <Dropdown
            value={condition.fieldKey}
            options={fieldOpts}
            onChange={onFieldChange}
            searchable
            size="sm"
            style={{ width: 180 }}
          />
          <Dropdown
            value={condition.op}
            options={ops}
            onChange={(op) => onChange({ op })}
            size="sm"
            style={{ width: 160 }}
          />
          <ValueEditor field={field} condition={condition} onChange={onChange} />
        </div>

        <IconBtn
          icon={<I.trash size={12} />}
          size="sm"
          variant="ghost"
          danger
          disabled={!canDelete}
          onClick={onRemove}
          tooltip={canDelete ? 'Remove condition' : 'At least one condition is required'}
        />
      </div>

      {!isLast && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          margin: '6px 0 6px 30px',
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: 0.8,
            color: 'var(--gb-text-muted)',
            textTransform: 'uppercase',
          }}>AND</span>
          <div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
        </div>
      )}
    </motion.div>
  );
}

/* ── ValueEditor — variant by (field.type, op) ───────────────── */
function ValueEditor({ field, condition, onChange }) {
  if (VALUELESS.has(condition.op)) {
    // Predicate is complete without a value — show a soft hint so users
    // don't think they're missing an input.
    return (
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: 11.5, fontStyle: 'italic',
        color: 'var(--gb-text-muted)',
        padding: '0 6px',
      }}>no value needed</span>
    );
  }

  switch (field.type) {
    case 'enum': {
      const opts = field.options.map((o) => ({ id: o, label: o }));
      return (
        <Dropdown
          value={condition.val || field.options[0]}
          options={opts}
          onChange={(v) => onChange({ val: v })}
          size="sm"
          style={{ flex: 1, minWidth: 140 }}
        />
      );
    }
    case 'text':
      return (
        <Input
          size="sm"
          value={condition.val}
          onChange={(v) => onChange({ val: v })}
          placeholder="value…"
          style={{ flex: 1, minWidth: 140 }}
        />
      );
    case 'int':
    case 'float':
      if (condition.op === 'between') {
        return (
          <>
            <Input
              size="sm" mono
              value={condition.val}
              onChange={(v) => onChange({ val: v })}
              placeholder="min"
              style={{ width: 90 }}
              inputMode={field.type === 'int' ? 'numeric' : 'decimal'}
            />
            <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>to</span>
            <Input
              size="sm" mono
              value={condition.val2}
              onChange={(v) => onChange({ val2: v })}
              placeholder="max"
              style={{ width: 90 }}
              inputMode={field.type === 'int' ? 'numeric' : 'decimal'}
            />
          </>
        );
      }
      return (
        <Input
          size="sm" mono
          value={condition.val}
          onChange={(v) => onChange({ val: v })}
          placeholder="0"
          style={{ flex: 1, minWidth: 110, maxWidth: 160 }}
          inputMode={field.type === 'int' ? 'numeric' : 'decimal'}
        />
      );
    case 'date':
      if (condition.op === 'rel_past' || condition.op === 'rel_future') {
        return (
          <>
            <Input
              size="sm" mono
              value={condition.num}
              onChange={(v) => onChange({ num: v })}
              placeholder="1"
              style={{ width: 60 }}
              inputMode="numeric"
            />
            <Dropdown
              value={condition.unit || 'years'}
              options={QB_UNIT_OPTS}
              onChange={(v) => onChange({ unit: v })}
              size="sm"
              style={{ width: 100 }}
            />
            <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>
              {condition.op === 'rel_past' ? 'ago' : 'from now'}
            </span>
          </>
        );
      }
      if (condition.op === 'before' || condition.op === 'after') {
        return (
          <Input
            size="sm" mono
            value={condition.val}
            onChange={(v) => onChange({ val: v })}
            placeholder="YYYY-MM-DD"
            type="date"
            style={{ flex: 1, minWidth: 150, maxWidth: 180 }}
          />
        );
      }
      return null;
    default:
      return (
        <Input
          size="sm"
          value={condition.val}
          onChange={(v) => onChange({ val: v })}
          placeholder="value…"
          style={{ flex: 1, minWidth: 140 }}
        />
      );
  }
}

/* Inline funnel icon — same shape as the one in CRMSearch's toolbar
   so users get the visual continuity that "this is the same feature." */
function FunnelIcon({ size = 12, style }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={style}
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}
