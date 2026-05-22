import React from 'react';
import { Card } from './Card.jsx';
import { Dropdown } from './Dropdown.jsx';
import { IconBtn } from './IconBtn.jsx';
import { I } from '../icons.jsx';

/**
 * ConditionCard — reusable layout for an account condition row.
 * Three slots: label+op column, value control (children), delete action.
 *
 * Props:
 *   label       string     "Tag", "Days since order", etc.
 *   op          string     current operator value
 *   onOpChange  (op) => void
 *   onDelete    () => void
 *   children    ReactNode  the value-side control
 */
export function ConditionCard({ label, op, onOpChange, onDelete, children }) {
  return (
    <Card padding={12}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Label + operator column — fixed 130px */}
        <div style={{ width: 130, flexShrink: 0 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: 0.8, color: 'var(--gb-text-muted)', marginBottom: 3,
          }}>
            {label}
          </div>
          <Dropdown value={op} onChange={onOpChange} />
        </div>

        {/* Value control — flex grows */}
        <div style={{ flex: 1, paddingTop: 6 }}>
          {children}
        </div>

        {/* Delete */}
        <div style={{ flexShrink: 0, paddingTop: 6 }}>
          <IconBtn size="sm" icon={<I.trash />} danger onClick={onDelete} />
        </div>
      </div>
    </Card>
  );
}
