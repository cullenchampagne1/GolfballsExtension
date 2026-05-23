import React from 'react';
import { Btn } from './Btn.jsx';
import { Tag } from './Tag.jsx';
import { SwitchTag } from './SwitchTag.jsx';
import { I } from '../icons.jsx';

/**
 * EditorHeader — the canonical "title bar" for the email + note template
 * editors (and any future template-style editor). Brand-tinted icon tile,
 * truncating title, type tag, enable/disable SwitchTag, one-line
 * description, and a danger Delete button on the right.
 *
 * Props:
 *   icon       Required. React element rendered inside the 28px tile.
 *              Sized to 13px via cloneElement.
 *   title      Required. The big text — truncates with ellipsis.
 *   typeLabel  Required. Short uppercase mono badge text ("ORDER", "TASK", …).
 *   enabled    Boolean — drives the SwitchTag.
 *   onToggle   () => void — fires when the SwitchTag is clicked.
 *   desc       Optional one-line description shown under the title.
 *   onDelete   Optional. When set, renders a "Delete" danger button.
 */
export function EditorHeader({ icon, title, typeLabel, enabled, onToggle, desc, onDelete }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 'var(--gb-r-sm)', flexShrink: 0,
        background: 'var(--gb-brand-tint-medium)',
        border: '1px solid var(--gb-brand-tint-border)',
        color: 'var(--gb-brand-label)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon ? React.cloneElement(icon, { size: 13 }) : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            flex: '0 1 auto', minWidth: 0,
            fontSize: 13, fontWeight: 800, letterSpacing: -0.2,
            color: 'var(--gb-text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {title}
          </span>
          {typeLabel && (
            <Tag tone="neutral" size="xs" mono style={{ flexShrink: 0 }}>
              {typeLabel}
            </Tag>
          )}
          <SwitchTag
            on={enabled}
            label={enabled ? 'Enabled' : 'Disabled'}
            onClick={onToggle}
            size="sm"
            style={{ flexShrink: 0 }}
          />
        </div>
        {desc && (
          <div style={{
            fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {desc}
          </div>
        )}
      </div>
      {onDelete && (
        <Btn variant="danger" size="sm" icon={<I.trash />} onClick={onDelete}>Delete</Btn>
      )}
    </div>
  );
}
