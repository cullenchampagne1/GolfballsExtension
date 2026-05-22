import React, { useState } from 'react';
import { Btn } from '../Btn.jsx';
import { IconBtn } from '../IconBtn.jsx';
import { SectionLabel } from '../SectionLabel.jsx';
import { Dropdown } from '../Dropdown.jsx';
import { Input } from '../Input.jsx';
import { Card } from '../Card.jsx';
import { I } from '../../icons.jsx';

/* ───────────────────────────────────────────────────────────────
   AccountRules — Solr-record conditions for account templates.

   The field set, operators, and value shape are ported verbatim from
   backup/editor.js so saved templates' `accountConditions` import
   directly — same { field, op, val, num, unit } shape.
─────────────────────────────────────────────────────────────── */

const ACC_FIELDS = [
  { key: 'orderCount_i',        label: 'Order Count',           type: 'int' },
  { key: 'lastOrderDate_dt',    label: 'Last Order Date',       type: 'date' },
  { key: 'priorYearRevenue_f',  label: 'Prior Year Revenue',    type: 'float' },
  { key: 'yearToDateRevenue_f', label: 'YTD Revenue',           type: 'float' },
  { key: 'lastEmailDate_dt',    label: 'Last Email Date',       type: 'date' },
  { key: 'createDate_dt',       label: 'Creation Date',         type: 'date' },
  { key: 'salesRep_s',          label: 'Sales Rep (Strict)',    type: 'text' },
  { key: 'nextTaskDate_dt',     label: 'Next Task Date',        type: 'date' },
  { key: 'nextTaskName',        label: 'Tasks: Next Task Name', type: 'text' },
  { key: 'salesRep',            label: 'Account: Sales Rep',    type: 'text' },
  { key: 'firstName',           label: 'Contact: First Name',   type: 'text' },
  { key: 'lastName',            label: 'Contact: Last Name',    type: 'text' },
  { key: 'companyName',         label: 'Contact: Company',      type: 'text' },
  { key: 'accountName',         label: 'Account: Name',         type: 'text' },
];

const ACC_OPS = {
  int:   [['eq', '='], ['ne', '≠'], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'], ['exists', 'is set'], ['not_exists', 'is not set']],
  float: [['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'], ['eq', '='], ['exists', 'is set'], ['not_exists', 'is not set']],
  date:  [['rel_before', 'more than … ago'], ['rel_after', 'within last …'], ['before', 'before date'], ['after', 'after date'], ['before_today', 'before today'], ['after_today', 'after today'], ['exists', 'is set'], ['not_exists', 'is not set']],
  text:  [['is', 'is'], ['contains', 'contains'], ['exists', 'is set'], ['not_exists', 'is not set']],
};
const ACC_UNITS = ['days', 'weeks', 'months', 'years'];
const NO_VAL_OPS = ['exists', 'not_exists', 'before_today', 'after_today'];

const FIELD_OPTIONS = ACC_FIELDS.map((f) => ({ id: f.key, label: f.label }));
const UNIT_OPTIONS = ACC_UNITS.map((u) => ({ id: u, label: u }));
const opOptions = (type) => (ACC_OPS[type] || ACC_OPS.text).map(([id, label]) => ({ id, label }));
const fieldType = (key) => (ACC_FIELDS.find((f) => f.key === key) || ACC_FIELDS[0]).type;

const emptyStyle = {
  padding: '13px 12px', textAlign: 'center', fontSize: 11,
  color: 'var(--gb-text-muted)', background: 'var(--gb-fill-subtle)',
  border: '1px dashed var(--gb-border-default)', borderRadius: 'var(--gb-r-md)',
};

let _uid = 0;

/**
 * AccountRules — props: `initial` (saved accountConditions to import),
 * `onChange` (emits the conditions array on every edit).
 */
export function AccountRules({ initial, onChange }) {
  const [conds, setConds] = useState(() =>
    (Array.isArray(initial) ? initial : []).map((c) => ({
      _id: ++_uid,
      field: c.field || 'orderCount_i',
      op: c.op || 'gt',
      val: c.val ?? '',
      num: c.num ?? '1',
      unit: c.unit || 'days',
    })),
  );

  const commit = (next) => {
    setConds(next);
    onChange?.(next.map(({ _id, ...rest }) => rest));
  };
  const add = () => commit([...conds, { _id: ++_uid, field: 'orderCount_i', op: 'gt', val: '0', num: '1', unit: 'days' }]);
  const del = (id) => commit(conds.filter((c) => c._id !== id));
  const edit = (id, patch) => commit(conds.map((c) => (c._id === id ? { ...c, ...patch } : c)));
  const changeField = (id, field) => {
    const ops = ACC_OPS[fieldType(field)] || ACC_OPS.text;
    edit(id, { field, op: ops[0][0], val: '', num: '1', unit: 'days' });
  };

  return (
    <div>
      <SectionLabel action={<Btn variant="ghost" size="xs" icon={<I.plus />} onClick={add}>Add condition</Btn>}>
        Account conditions
      </SectionLabel>

      {conds.length === 0 ? (
        <div style={emptyStyle}>No conditions — add one to target specific accounts.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {conds.map((c) => {
            const type = fieldType(c.field);
            const ops = ACC_OPS[type] || ACC_OPS.text;
            // self-heal saved data whose op no longer fits the field's type
            const op = ops.some((o) => o[0] === c.op) ? c.op : ops[0][0];
            const noVal = NO_VAL_OPS.includes(op);
            const isRel = op === 'rel_before' || op === 'rel_after';
            const isDate = op === 'before' || op === 'after';

            return (
              <Card key={c._id} padding={8}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Dropdown
                    size="sm" value={c.field} options={FIELD_OPTIONS}
                    onChange={(v) => changeField(c._id, v)}
                    style={{ width: 156, flexShrink: 0 }}
                  />
                  <Dropdown
                    size="sm" value={op} options={opOptions(type)}
                    onChange={(v) => edit(c._id, { op: v })}
                    style={{ width: 130, flexShrink: 0 }}
                  />
                  {noVal ? (
                    <div style={{ flex: 1 }} />
                  ) : isRel ? (
                    <>
                      <Input
                        size="sm" mono value={c.num || ''} placeholder="1"
                        onChange={(v) => edit(c._id, { num: v })}
                        style={{ width: 60, flexShrink: 0 }}
                      />
                      <Dropdown
                        size="sm" value={c.unit || 'days'} options={UNIT_OPTIONS}
                        onChange={(v) => edit(c._id, { unit: v })}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                    </>
                  ) : (
                    <Input
                      size="sm" mono value={c.val || ''}
                      placeholder={isDate ? 'YYYY-MM-DD or {{var}}' : 'value or {{var}}…'}
                      onChange={(v) => edit(c._id, { val: v })}
                      style={{ flex: 1, minWidth: 0 }}
                    />
                  )}
                  <IconBtn size="sm" icon={<I.trash />} danger onClick={() => del(c._id)} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
