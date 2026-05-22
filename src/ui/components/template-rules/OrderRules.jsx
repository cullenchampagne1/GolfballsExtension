import React, { useState } from 'react';
import { Btn } from '../Btn.jsx';
import { IconBtn } from '../IconBtn.jsx';
import { Input } from '../Input.jsx';
import { Dropdown } from '../Dropdown.jsx';
import { Card } from '../Card.jsx';
import { SectionLabel } from '../SectionLabel.jsx';
import { I } from '../../icons.jsx';

/* Operator ids match backup/editor.js so saved `rules` import 1:1. */
const OP_OPTIONS = [
  { id: 'contains',   label: 'contains' },
  { id: 'equals',     label: 'equals' },
  { id: 'startsWith', label: 'starts with' },
  { id: 'endsWith',   label: 'ends with' },
  { id: 'exists',     label: 'is set' },
  { id: 'notExists',  label: 'is not set' },
];
const NO_VAL = ['exists', 'notExists'];

const emptyStyle = {
  padding: '13px 12px', textAlign: 'center', fontSize: 11,
  color: 'var(--gb-text-muted)', background: 'var(--gb-fill-subtle)',
  border: '1px dashed var(--gb-border-default)', borderRadius: 'var(--gb-r-md)',
};

let _uid = 0;

/**
 * OrderRules — auto-match DOM rule rows for order templates.
 * Props: `initial` (saved `rules` to import — old {selector,operator,value}
 * or new shape), `onChange` (emits rule array on edit).
 */
export function OrderRules({ initial, onChange }) {
  const [rules, setRules] = useState(() =>
    (Array.isArray(initial) ? initial : []).map((r) => ({
      _id: ++_uid,
      left: r.left ?? r.selector ?? '',
      op: r.op ?? r.operator ?? 'contains',
      right: r.right ?? r.value ?? '',
    })),
  );

  const commit = (next) => {
    setRules(next);
    onChange?.(next.map(({ _id, ...r }) => r));
  };
  const add = () => commit([...rules, { _id: ++_uid, left: '', op: 'contains', right: '' }]);
  const edit = (id, patch) => commit(rules.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  const del = (id) => commit(rules.filter((r) => r._id !== id));

  return (
    <div>
      <SectionLabel action={<Btn variant="ghost" size="xs" icon={<I.plus />} onClick={add}>Add rule</Btn>}>
        Auto-match rules
      </SectionLabel>

      {rules.length === 0 ? (
        <div style={emptyStyle}>No match rules — add one to auto-trigger this template.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rules.map((r) => {
            const noVal = NO_VAL.includes(r.op);
            return (
              <Card key={r._id} padding={8}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: noVal ? '1fr 132px 26px' : '1fr 132px 1fr 26px',
                  gap: 6, alignItems: 'center',
                }}>
                  <Input
                    size="sm" mono value={r.left} leading={<I.search />}
                    placeholder="page.url or .selector"
                    onChange={(v) => edit(r._id, { left: v })}
                  />
                  <Dropdown size="sm" value={r.op} options={OP_OPTIONS} onChange={(v) => edit(r._id, { op: v })} />
                  {!noVal && (
                    <Input size="sm" mono value={r.right} placeholder="value" onChange={(v) => edit(r._id, { right: v })} />
                  )}
                  <IconBtn size="sm" icon={<I.trash />} danger onClick={() => del(r._id)} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
