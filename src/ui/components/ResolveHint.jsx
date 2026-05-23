import React from 'react';
import { Dot } from './Dot.jsx';

/**
 * ResolveHint — small inline pill that reports what a DOM selector
 * resolves to on the active page. Three states, one component:
 *
 *   picking  — "Hover an element on the page…" with a brand pulse
 *   resolved — "1 match · <code>matched text</code>" brand-tinted
 *   neither  — "No match on active page" warning text
 *
 * Used under recipient inputs in the email editor and under each rule
 * row in OrderRules. Same body in both before this was factored.
 *
 * Props:
 *   picking   true while a cross-tab pick is in flight
 *   resolved  string of the matched text, or null/undefined when not found
 *   style     optional style overrides for the outer container
 *   size      'sm' (default) | 'xs' — controls font size/padding
 */
const SIZES = {
  xs: { fontSize: 10,   padding: '6px 9px',  codeSize: 10 },
  sm: { fontSize: 10.5, padding: '7px 10px', codeSize: 10 },
};

export function ResolveHint({ picking, resolved, size = 'sm', style }) {
  const s = SIZES[size] || SIZES.sm;
  const isOk = !!resolved;
  return (
    <div style={{
      padding: s.padding,
      background: 'var(--gb-fill-subtle)',
      border: '1px solid var(--gb-border-subtle)',
      borderRadius: 'var(--gb-r-sm)',
      fontSize: s.fontSize,
      display: 'flex', alignItems: 'center', gap: 7,
      ...style,
    }}>
      <Dot
        tone={picking || isOk ? 'brand' : 'warning'}
        glow={picking || isOk}
        size={5}
      />
      <span style={{
        flex: 1, color: 'var(--gb-text-tertiary)',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {picking
          ? 'Hover an element on the page…'
          : isOk
            ? <><strong style={{ color: 'var(--gb-brand-label)' }}>1 match</strong> · <code style={{ fontFamily: 'var(--gb-font-mono)', fontSize: s.codeSize }}>{resolved}</code></>
            : <span style={{ color: 'var(--gb-warning-fg)' }}>No match on active page</span>
        }
      </span>
    </div>
  );
}
