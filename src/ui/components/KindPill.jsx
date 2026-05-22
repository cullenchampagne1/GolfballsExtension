import React from 'react';
import { I, Icon } from '../icons.jsx';
import { sizeIcon } from '../shared.jsx';

/** Icons for each kind — bolt, search, picker crosshair, regex circle, edit */
const KindIcons = {
  builtin: (p) => <Icon {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></Icon>,
  dom:     (p) => <Icon {...p}><circle cx="11" cy="11" r="7.5"/><path d="M20.5 20.5L17 17"/></Icon>,
  pick:    (p) => <Icon {...p}><path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></Icon>,
  regex:   (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M12 5v6M12 12v6M6 12h12"/></Icon>,
  literal: (p) => <Icon {...p}><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>,
};

const KIND_LABELS = {
  builtin: 'Built-in',
  dom:     'DOM',
  pick:    'Pick',
  regex:   'Regex',
  literal: 'Literal',
};

/**
 * KindPill — compact badge showing a variable's source kind.
 *
 * Props: kind 'builtin'|'dom'|'pick'|'regex'|'literal'
 */
export function KindPill({ kind }) {
  const IconComp = KindIcons[kind] || KindIcons.literal;
  const label    = KIND_LABELS[kind] || kind;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', borderRadius: 4,
      background: 'var(--gb-fill-subtle)',
      border: '1px solid var(--gb-border-default)',
      color: 'var(--gb-text-tertiary)',
      fontSize: 9.5, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: 0.5,
      whiteSpace: 'nowrap',
    }}>
      <IconComp size={10} />
      {label}
    </span>
  );
}
