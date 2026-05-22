import React from 'react';
import { Tag } from './Tag.jsx';
import { Dot } from './Dot.jsx';
import { Btn } from './Btn.jsx';
import { IconBtn } from './IconBtn.jsx';
import { KindPill } from './KindPill.jsx';
import { I, Icon } from '../icons.jsx';

const VariableIcon = (p) => (
  <Icon {...p}>
    <path d="M5 4 a14 14 0 000 16M19 4a14 14 0 010 16"/>
    <path d="M9 9l6 6M9 15l6-6"/>
  </Icon>
);
const BoltIcon = (p) => (
  <Icon {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></Icon>
);

const COL_GRID = '1.2fr 74px 1.3fr 1.3fr 76px 30px';

/**
 * VariableTable — 6-column grid showing all variables for a template.
 * Columns: name · kind · source config · resolved value · status · delete.
 *
 * Props:
 *   typeId   'order'|'case'|'account'
 *   vars     Variable[]
 *   onAdd    () => void    — fires when the dashed Add row is clicked
 *   onDelete (name) => void
 */
export function VariableTable({ typeId, vars = [], onAdd, onDelete }) {
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
        fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase',
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
          : hasSmart ? <BoltIcon /> : <I.alert />;
        const isMissNoFallback = v.status === 'miss' && !hasSmart;

        return (
          <div
            key={v.name}
            style={{
              display: 'grid', gridTemplateColumns: COL_GRID,
              gap: 7, padding: '6px 10px', alignItems: 'center',
              borderBottom: i < vars.length - 1 ? '1px solid var(--gb-border-subtle)' : 'none',
              fontSize: 10.5,
              background: isMissNoFallback ? 'var(--gb-warning-tint-soft)' : 'transparent',
            }}
          >
            {/* Name */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <span style={{
                fontFamily: 'var(--gb-font-mono)',
                color: 'var(--gb-brand-label)',
                fontWeight: 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {`{{${v.name}}}`}
              </span>
              {hasSmart && <BoltIcon size={10} style={{ color: 'var(--gb-warning-fg)', flexShrink: 0 }} />}
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

      {/* Add-variable footer row */}
      <div style={{
        padding: 8,
        background: 'var(--gb-surface-modal)',
        borderTop: '1px solid var(--gb-border-subtle)',
      }}>
        <Btn variant="dashed" size="sm" icon={<I.plus />} full onClick={onAdd}>
          Add variable
        </Btn>
      </div>
    </div>
  );
}
