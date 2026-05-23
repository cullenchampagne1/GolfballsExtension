import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Tag } from './Tag.jsx';
import { Dot } from './Dot.jsx';
import { Btn } from './Btn.jsx';
import { IconBtn } from './IconBtn.jsx';
import { KindPill } from './KindPill.jsx';
import { BodyVar } from './BodyVar.jsx';
import { InlineVariableForm } from './InlineVariableForm.jsx';
import { I, Icon } from '../icons.jsx';

const VariableIcon = (p) => (
  <Icon {...p}>
    <path d="M5 4 a14 14 0 000 16M19 4a14 14 0 010 16"/>
    <path d="M9 9l6 6M9 15l6-6"/>
  </Icon>
);
// Variable name needs the most room — chip + bolt + ellipsis room.
// Kind pill is content-width; source/resolved share the remainder.
const COL_GRID = '2fr 70px 1.1fr 1.1fr 70px 28px';

/**
 * VariableTable — 6-column grid showing all variables for a template.
 * Columns: name · kind · source config · resolved value · status · delete.
 *
 * Props:
 *   typeId      'order'|'case'|'account'
 *   vars        Variable[]
 *   onAdd       () => void      — fires when the dashed Add row is clicked
 *   onDelete    (name) => void
 *   onOpenSmart (variable) => void — opens the smart-options modal
 */
export function VariableTable({ typeId, vars = [], onAdd, onDelete, onOpenSmart }) {
  const [adding, setAdding] = useState(false);
  return (
    <div style={{
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-lg)',
      overflow: 'hidden',
      background: 'var(--gb-surface-canvas)',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '7px 10px',
        background: 'var(--gb-surface-modal)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
      }}>
        <VariableIcon size={12} style={{ color: 'var(--gb-brand-label)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
          Variables
        </span>
        <Tag tone="brand" size="xs">{vars.filter(v => v.status === 'ok').length} resolved</Tag>
        {vars.some(v => v.status === 'miss') && (
          <Tag tone="warning" size="xs">
            {vars.filter(v => v.status === 'miss').length} unresolved
          </Tag>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9.5, color: 'var(--gb-text-muted)' }}>
          Live
        </span>
        <Dot tone="brand" glow size={5} />
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: COL_GRID,
        gap: 7, padding: '5px 10px',
        background: 'var(--gb-surface-canvas)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: 0.5, color: 'var(--gb-text-muted)',
      }}>
        <div>Variable</div>
        <div>Kind</div>
        <div>Source</div>
        <div>Resolved</div>
        <div style={{ textAlign: 'center' }}>Status</div>
        <div />
      </div>

      {/* Rows */}
      {vars.map((v, i) => {
        const hasSmart = !!(v.smart && (
          (typeof v.smart.fallback === 'string' && v.smart.fallback.length > 0)
            || v.smart.transform
            || v.smart.conditional
            || v.smart.format
        ));
        const tone  = v.status === 'ok' ? 'brand' : 'warning';
        const label = v.status === 'ok' ? 'OK' : hasSmart ? 'FALLBACK' : 'MISS';
        const tagIcon = v.status === 'ok'
          ? <I.check />
          : hasSmart ? <I.bolt /> : <I.alert />;
        const isMissNoFallback = v.status === 'miss' && !hasSmart;

        return (
          <div
            key={v.name}
            style={{
              display: 'grid', gridTemplateColumns: COL_GRID,
              gap: 7, padding: '6px 10px', alignItems: 'center',
              borderBottom: i < vars.length - 1 ? '1px solid var(--gb-border-subtle)' : 'none',
              fontSize: 10,
              background: isMissNoFallback ? 'var(--gb-warning-tint-soft)' : 'transparent',
            }}
          >
            {/* Name — the canonical BodyVar chip at table density.
                Bolt is BodyVar's own clickable smart-options button. */}
            <div style={{ minWidth: 0, display: 'flex' }}>
              <BodyVar v={v} size="sm" onOpenSmart={onOpenSmart} />
            </div>

            {/* Kind */}
            <div><KindPill kind={v.kind} /></div>

            {/* Source config */}
            <div style={{
              fontFamily: 'var(--gb-font-mono)', fontSize: 9.5,
              color: 'var(--gb-text-tertiary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {v.config}
            </div>

            {/* Resolved value */}
            <div style={{
              color: v.resolved ? 'var(--gb-text-primary)' : 'var(--gb-warning-fg)',
              fontWeight: 600,
              fontStyle: v.resolved ? 'normal' : 'italic',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {v.resolved
                || (hasSmart && v.smart?.fallback ? `↳ "${v.smart.fallback}"` : '— not found —')
              }
            </div>

            {/* Status tag */}
            <div style={{ textAlign: 'center' }}>
              <Tag tone={tone} size="xs" icon={tagIcon}>{label}</Tag>
            </div>

            {/* Delete */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <IconBtn size="sm" icon={<I.trash />} danger onClick={() => onDelete?.(v.name)} />
            </div>
          </div>
        );
      })}

      {/* Inline add-variable form — slides into the table when the
          dashed Add button is clicked. Replaces the legacy modal. */}
      <AnimatePresence initial={false}>
        {adding && (
          <InlineVariableForm
            key="inline-add"
            typeId={typeId}
            onAdd={(payload) => { onAdd?.(payload); setAdding(false); }}
            onCancel={() => setAdding(false)}
          />
        )}
      </AnimatePresence>
      {!adding && (
        <div style={{
          padding: 8,
          background: 'var(--gb-surface-modal)',
          borderTop: '1px solid var(--gb-border-subtle)',
        }}>
          <Btn variant="dashed" size="sm" icon={<I.plus />} full onClick={() => setAdding(true)}>
            Add variable
          </Btn>
        </div>
      )}
    </div>
  );
}
