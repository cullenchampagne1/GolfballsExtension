import React from 'react';
import { I } from '../icons.jsx';
import { IconBtn } from './IconBtn.jsx';
import { SHELF_PAGES, pageApplies } from '../../lib/features/featureConfig.js';

/* ───────────────────────────────────────────────────────────────
   FeatureShelfGrid — the Custom Actions "what shows where" matrix.

   Rows = user-authored custom actions. Columns = SHELF_PAGES (All · Contact ·
   Account · Order · Orders · Opp). A cell is lit when the action appears on
   that page; two lit styles — solid (explicit) vs ghost (via the All
   wildcard). Clicking a cell edits the action's own `pages` (togglePage
   upstream). Each row also opens the editor (name/icon) or deletes.

   Built-in features are NOT shown here — they're controlled by their own
   toggle rows above; only label-less custom actions live in this table.
   Compact so it fits the ~400px settings panel.
─────────────────────────────────────────────────────────────── */

const COL = 38; // px per page column

function Cell({ lit, ghost, onClick, title }) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{
        width: 20, height: 20, borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background .12s ease, border-color .12s ease, color .12s ease, opacity .12s ease',
        border: `1px solid ${lit ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}`,
        background: lit && !ghost ? 'var(--gb-brand-tint-medium)' : lit ? 'var(--gb-brand-tint-soft)' : 'transparent',
        color: lit ? 'var(--gb-brand-label)' : 'transparent',
        opacity: ghost ? 0.72 : 1,
      }}>
      <I.check size={11} />
    </button>
  );
}

export function FeatureShelfGrid({ actions = [], onToggleCell, onEdit, onDelete }) {
  if (!actions.length) {
    return (
      <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 11.5, color: 'var(--gb-text-muted)', border: '1px dashed var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>
        No custom actions yet. Use <strong style={{ color: 'var(--gb-text-secondary)' }}>+</strong> to build one and place it on pages.
      </div>
    );
  }
  const gridCols = `minmax(84px, 1fr) repeat(${SHELF_PAGES.length}, ${COL}px) 46px`;
  return (
    <div style={{ border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden', background: 'var(--gb-surface-1)' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', columnGap: 2, padding: '7px 9px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-fill-subtle)' }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--gb-text-muted)' }}>Action</div>
        {SHELF_PAGES.map((p) => (
          <div key={p.id} title={p.label} style={{ justifySelf: 'center', fontSize: 8.5, fontWeight: 700, letterSpacing: '.01em', color: p.id === '*' ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', textAlign: 'center', whiteSpace: 'nowrap' }}>{p.short}</div>
        ))}
        <div />
      </div>
      {/* Rows */}
      {actions.map((a, i) => {
        const wildcard = (a.pages || []).includes('*');
        const Glyph = I[a.icon] || I.bolt;
        const off = a.enabled === false;
        return (
          <div key={a.id} style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', columnGap: 2, padding: '6px 9px', borderTop: i ? '1px solid var(--gb-border-subtle)' : 'none', opacity: off ? 0.5 : 1 }}>
            <button type="button" onClick={() => onEdit && onEdit(a.id)} title="Edit this action"
              style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ color: 'var(--gb-text-muted)', display: 'flex', flexShrink: 0 }}><Glyph size={13} /></span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
            </button>
            {SHELF_PAGES.map((p) => {
              const isWildCol = p.id === '*';
              const lit = isWildCol ? wildcard : pageApplies(a.pages, p.id);
              const ghost = !isWildCol && wildcard;
              return (
                <div key={p.id} style={{ justifySelf: 'center' }}>
                  <Cell lit={lit} ghost={ghost} onClick={() => onToggleCell(a.id, p.id)}
                    title={`${a.name} · ${p.label}${ghost ? ' (via All pages)' : ''}`} />
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 2, justifySelf: 'end' }}>
              <IconBtn size="xs" variant="ghost" icon={<I.edit />} title="Edit" onClick={() => onEdit && onEdit(a.id)} />
              <IconBtn size="xs" variant="ghost" icon={<I.trash />} title="Delete" onClick={() => onDelete && onDelete(a.id)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default FeatureShelfGrid;
