import React from 'react';

/* ───────────────────────────────────────────────────────────────
   Kbd — a small keycap chip. Used by the keyboard composer to hint
   shortcuts ( / , ↵ , ↑↓ , Tab ). `dim` drops the fill so it reads
   as an inline glyph rather than a raised cap.
─────────────────────────────────────────────────────────────── */
export function Kbd({ children, dim }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 17, height: 17, padding: '0 4px',
      background: dim ? 'transparent' : 'var(--gb-fill-inverse-medium)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 4, fontSize: 9.5, fontWeight: 700,
      fontFamily: 'var(--gb-font-mono)',
      color: 'var(--gb-text-tertiary)', flexShrink: 0,
    }}>{children}</span>
  );
}
