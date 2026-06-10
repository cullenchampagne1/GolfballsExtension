import React from 'react';
import { Callout } from '../../ui/index.js';

/* ───────────────────────────────────────────────────────────────
   blocks.jsx — renders the structured content blocks emitted by
   scripts/build-help-content.mjs (docs/content/*.json authoring
   format). Pure presentation: every color is a --gb-* token.

   Block types: p · heading · list · table · callout
   Callout kinds map onto the design-system Callout tones.
─────────────────────────────────────────────────────────────── */

const CALLOUT_TONE = {
  tip:          { tone: 'info',    label: 'Tip' },
  info:         { tone: 'info',    label: null },
  warning:      { tone: 'warning', label: 'Heads up' },
  bestPractice: { tone: 'success', label: 'Best practice' },
  proTip:       { tone: 'brand',   label: 'Pro tip' },
  deprecated:   { tone: 'error',   label: 'Deprecated' },
};

function HelpTable({ headers, rows }) {
  const cell = {
    padding: '6px 10px',
    fontSize: 11.5,
    lineHeight: 1.5,
    borderBottom: '1px solid var(--gb-border-subtle)',
    verticalAlign: 'top',
    textAlign: 'left',
  };
  return (
    <div style={{
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-md)',
      overflow: 'hidden',
      margin: '4px 0',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--gb-fill-subtle)' }}>
            {headers.map((h, i) => (
              <th key={i} style={{
                ...cell,
                fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6,
                textTransform: 'uppercase', color: 'var(--gb-text-muted)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} style={{
                  ...cell,
                  borderBottom: i === rows.length - 1 ? 'none' : cell.borderBottom,
                  color: j === 0 ? 'var(--gb-text-primary)' : 'var(--gb-text-secondary)',
                  fontWeight: j === 0 ? 600 : 400,
                }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Render one structured block. */
export function HelpBlock({ block }) {
  switch (block.type) {
    case 'p':
      return (
        <p style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--gb-text-secondary)', margin: '0 0 4px' }}>
          {block.text}
        </p>
      );
    case 'heading':
      return (
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
          color: 'var(--gb-text-tertiary)', margin: '10px 0 2px',
        }}>{block.text}</div>
      );
    case 'list':
      return (
        <ul style={{ margin: '2px 0 4px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {block.items.map((it, i) => (
            <li key={i} style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--gb-text-secondary)' }}>{it}</li>
          ))}
        </ul>
      );
    case 'table':
      return <HelpTable headers={block.headers} rows={block.rows} />;
    case 'callout': {
      const meta = CALLOUT_TONE[block.kind] || CALLOUT_TONE.info;
      return (
        <Callout tone={meta.tone} title={block.title || meta.label} style={{ margin: '4px 0' }}>
          {block.text}
        </Callout>
      );
    }
    default:
      return null;
  }
}

/** Render a list of blocks. */
export function HelpBlocks({ blocks }) {
  if (!blocks?.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {blocks.map((b, i) => <HelpBlock key={i} block={b} />)}
    </div>
  );
}
