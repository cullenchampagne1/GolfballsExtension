import React from 'react';
import { I } from '../icons.jsx';

/* ───────────────────────────────────────────────────────────────
   CodeDocsSidebar — the live documentation column (Code view).

   Renders a doc card resolved from the token under the caret (see
   lib/codeEngine/docs.js). Pure presentation.
─────────────────────────────────────────────────────────────── */

const KIND_ACCENT = {
  action: 'var(--gb-brand-label)', data: 'var(--gb-info-fg)',
  flow: 'var(--gb-warning-fg)', topic: 'var(--gb-text-secondary)',
};

export function CodeDocsSidebar({ doc }) {
  if (!doc) return null;
  const accent = KIND_ACCENT[doc.kind] || 'var(--gb-text-secondary)';
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gb-border-subtle)', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        <I.code size={13} style={{ color: 'var(--gb-text-muted)' }} />
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Docs · {doc.kind}</span>
      </div>
      <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 4, height: 14, borderRadius: 2, background: accent, flexShrink: 0 }} />
            <code style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono, ui-monospace, monospace)' }}>{doc.title}</code>
            {doc.gate ? <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, letterSpacing: '.03em', padding: '1px 6px', borderRadius: 999, color: 'var(--gb-warning-fg)', background: 'var(--gb-warning-tint-soft)', textTransform: 'uppercase' }}>{doc.gate}</span> : null}
          </div>
          <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--gb-text-secondary)', lineHeight: 1.55 }}>{doc.summary}</div>
        </div>
        {doc.rows?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {doc.rows.map(([k, v], i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <code style={{ fontSize: 10.5, fontWeight: 700, color: accent, fontFamily: 'var(--gb-font-mono, ui-monospace, monospace)' }}>{k}</code>
                <span style={{ fontSize: 11, color: 'var(--gb-text-muted)', lineHeight: 1.5 }}>{v}</span>
              </div>
            ))}
          </div>
        ) : null}
        {doc.examples?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Example</span>
            {doc.examples.map((ex, i) => (
              <pre key={i} style={{ margin: 0, padding: '8px 10px', borderRadius: 8, background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-subtle)', fontSize: 10.5, lineHeight: 1.5, color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-mono, ui-monospace, monospace)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ex}</pre>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default CodeDocsSidebar;
