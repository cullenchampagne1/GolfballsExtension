import React, { useState } from 'react';
import { Btn } from '../Btn.jsx';
import { IconBtn } from '../IconBtn.jsx';
import { Input } from '../Input.jsx';
import { Dropdown } from '../Dropdown.jsx';
import { Card } from '../Card.jsx';
import { SectionLabel } from '../SectionLabel.jsx';
import { I } from '../../icons.jsx';

const FIELD_OPTIONS = ['subject', 'body', 'from', 'to'].map((o) => ({ id: o, label: o }));
const OP_OPTIONS = [
  { id: 'contains',     label: 'contains' },
  { id: 'equals',       label: 'equals' },
  { id: 'startsWith',   label: 'starts with' },
  { id: 'endsWith',     label: 'ends with' },
  { id: 'matchesRegex', label: 'matches regex' },
];

const emptyStyle = {
  padding: '13px 12px', textAlign: 'center', fontSize: 11,
  color: 'var(--gb-text-muted)', background: 'var(--gb-fill-subtle)',
  border: '1px dashed var(--gb-border-default)', borderRadius: 'var(--gb-r-md)',
};

let _uid = 0;

/**
 * CaseRules — email-field match rule rows for case templates.
 * Props: `initial` (saved `caseRules` — old {field,op,value} or new shape),
 * `onChange` (emits rule array on edit).
 */
export function CaseRules({ initial, onChange }) {
  const [rules, setRules] = useState(() =>
    (Array.isArray(initial) ? initial : []).map((r) => ({
      _id: ++_uid,
      left: r.left ?? r.field ?? 'subject',
      op: r.op ?? 'contains',
      right: r.right ?? r.value ?? '',
    })),
  );

  const commit = (next) => {
    setRules(next);
    onChange?.(next.map(({ _id, ...r }) => r));
  };
  const add = () => commit([...rules, { _id: ++_uid, left: 'subject', op: 'contains', right: '' }]);
  const edit = (id, patch) => commit(rules.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  const del = (id) => commit(rules.filter((r) => r._id !== id));

  return (
    <div>
      <SectionLabel action={<Btn variant="ghost" size="xs" icon={<I.plus />} onClick={add}>Add rule</Btn>}>
        Match rules
      </SectionLabel>

      {rules.length === 0 ? (
        <div style={emptyStyle}>No match rules — add one to match inbound emails.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rules.map((r) => (
            <Card key={r._id} padding={8}>
              <div style={{ display: 'grid', gridTemplateColumns: '108px 138px 1fr 26px', gap: 6, alignItems: 'center' }}>
                <Dropdown size="sm" value={r.left} options={FIELD_OPTIONS} onChange={(v) => edit(r._id, { left: v })} />
                <Dropdown size="sm" value={r.op} options={OP_OPTIONS} onChange={(v) => edit(r._id, { op: v })} />
                <Input size="sm" mono value={r.right} placeholder="keyword or pattern" onChange={(v) => edit(r._id, { right: v })} />
                <IconBtn size="sm" icon={<I.trash />} danger onClick={() => del(r._id)} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
