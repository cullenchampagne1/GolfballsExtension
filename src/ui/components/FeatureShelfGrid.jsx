import React from 'react';
import { I } from '../icons.jsx';
import { SHELF_PAGES, pageApplies } from '../../lib/features/featureConfig.js';

/* ───────────────────────────────────────────────────────────────
   FeatureShelfGrid — the Action Shelf "what shows where" matrix.

   Rows = features that expose a shelf action AND are enabled. Columns =
   SHELF_PAGES (All · Contact · Account · Order · Orders · Opp). A cell is
   lit when the feature's action appears on that page. Two lit styles:
     • solid  — explicitly selected page
     • ghost  — lit because the row is on "All pages" (the `*` wildcard)
   Clicking a cell drives the SAME featureConfig.pages the per-feature row
   edits (via togglePage upstream), so the two stay in lockstep. Clicking a
   cell also switches the feature's shelf surface on, since placing it on a
   page implies you want it on the shelf.

   Pure presentational: all state lives in featureCfg upstream; every cell
   calls onToggleCell(key, pageId).
─────────────────────────────────────────────────────────────── */

const COL = 38; // px per page column — compact so all 6 fit the narrow settings panel

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

export function FeatureShelfGrid({ features, cfg, getIcon, onToggleCell }) {
  if (!features.length) {
    return (
      <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 11.5, color: 'var(--gb-text-muted)', border: '1px dashed var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>
        No custom actions yet. Use <strong style={{ color: 'var(--gb-text-secondary)' }}>+</strong> to build one and place it on pages.
      </div>
    );
  }
  const gridCols = `minmax(88px, 1fr) repeat(${SHELF_PAGES.length}, ${COL}px)`;
  return (
    <div style={{ border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden', background: 'var(--gb-surface-1)' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', columnGap: 2, padding: '7px 9px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-fill-subtle)' }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--gb-text-muted)' }}>Action</div>
        {SHELF_PAGES.map((p) => (
          <div key={p.id} title={p.label} style={{ justifySelf: 'center', fontSize: 8.5, fontWeight: 700, letterSpacing: '.01em', color: p.id === '*' ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', textAlign: 'center', whiteSpace: 'nowrap' }}>{p.short}</div>
        ))}
      </div>
      {/* Rows */}
      {features.map((f, i) => {
        const c = cfg[f.key] || {};
        const wildcard = (c.pages || []).includes('*');
        return (
          <div key={f.key} style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', columnGap: 2, padding: '6px 9px', borderTop: i ? '1px solid var(--gb-border-subtle)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ color: 'var(--gb-text-muted)', display: 'flex', flexShrink: 0 }}>{getIcon ? getIcon(f.icon) : null}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
            </div>
            {SHELF_PAGES.map((p) => {
              const isWildCol = p.id === '*';
              const lit = isWildCol ? wildcard : pageApplies(c.pages, p.id);
              const ghost = !isWildCol && wildcard; // lit only because of the All wildcard
              return (
                <div key={p.id} style={{ justifySelf: 'center' }}>
                  <Cell lit={lit} ghost={ghost} onClick={() => onToggleCell(f.key, p.id)}
                    title={`${f.name} · ${p.label}${ghost ? ' (via All pages)' : ''}`} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default FeatureShelfGrid;
