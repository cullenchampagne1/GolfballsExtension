import React from 'react';
import { I } from '../../ui/index.js';

/* ───────────────────────────────────────────────────────────────
   DocsBreadcrumbs.jsx — "Section / Group / Title" path above the
   article. Earlier crumbs are muted; only the home crumb is
   clickable (jumps back to the first article).
─────────────────────────────────────────────────────────────── */

export function DocsBreadcrumbs({ path, onHome }) {
  if (!path?.length) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      fontSize: 10.5, color: 'var(--gb-text-muted)', marginBottom: 4,
    }}>
      <button
        type="button"
        onClick={onHome}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          border: 'none', background: 'transparent', cursor: 'pointer',
          font: 'inherit', fontSize: 10.5, fontWeight: 600, padding: 0,
          color: 'var(--gb-text-tertiary)',
        }}
      >
        Help
      </button>
      {path.map((part, i) => (
        <React.Fragment key={i}>
          <I.chevr size={8} style={{ color: 'var(--gb-text-ghost)' }} />
          <span style={{
            fontWeight: i === path.length - 1 ? 700 : 500,
            color: i === path.length - 1 ? 'var(--gb-text-secondary)' : 'var(--gb-text-muted)',
          }}>{part}</span>
        </React.Fragment>
      ))}
    </div>
  );
}
