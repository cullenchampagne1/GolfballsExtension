import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Switch } from './Switch.jsx';
import { I } from '../icons.jsx';
import { CustomLinkField } from './CustomLinkField.jsx';
import { surfaceSummary, SHELF_PAGES } from '../../lib/features/featureConfig.js';

/* ───────────────────────────────────────────────────────────────
   FeatureRow — a compact, expandable feature toggle for Settings.

   Collapsed (dense): icon · name · a live surface chip (Popup · Shelf ·
   2 pages) · master switch. When the feature is enabled AND has surfaces,
   the row expands in place (animated, no layout jump) to reveal:
     • Show in popup        (only if the feature has a popup)
     • Show in action shelf (only if the feature has a shelf action)
     • Pages                (chip picker, only while shown-in-shelf)
─────────────────────────────────────────────────────────────── */

function SubToggle({ label, hint, on, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>{label}</div>
        {hint ? <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>{hint}</div> : null}
      </div>
      <Switch on={on} onChange={onChange} />
    </div>
  );
}

function PageChips({ pages, onToggle }) {
  const active = new Set(pages || []);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {SHELF_PAGES.map((p) => {
        const on = active.has(p.id);
        return (
          <button key={p.id} type="button" onClick={() => onToggle(p.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
              fontSize: 10.5, fontWeight: 700, transition: 'background .12s ease, color .12s ease, border-color .12s ease',
              border: `1px solid ${on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}`,
              background: on ? 'var(--gb-brand-tint-soft)' : 'transparent',
              color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
            }}>
            {on ? <I.check size={10} /> : null}{p.label}
          </button>
        );
      })}
    </div>
  );
}

export function FeatureRow({ feature, icon, on, cfg, onToggleEnabled, onSetSurface, onTogglePage, onSetCustomUrl }) {
  const [open, setOpen] = useState(false);
  const surfaces = feature.surfaces || {};
  const hasSub = !!(surfaces.popup || surfaces.shelf);
  const canExpand = on && hasSub;
  const summary = on ? surfaceSummary(cfg) : 'Off';

  return (
    <div style={{ border: `1px solid ${on ? 'var(--gb-border-default)' : 'var(--gb-border-subtle)'}`, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-surface-1)', overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 13px' }}>
        <span style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-sm)', flexShrink: 0, background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon || null}
        </span>
        <button type="button" onClick={() => canExpand && setOpen((o) => !o)}
          style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: canExpand ? 'pointer' : 'default' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, maxWidth: '100%' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap' }}>{feature.name}</span>
            {on && hasSub ? (
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.03em', padding: '1px 6px', borderRadius: 999, color: 'var(--gb-text-muted)', background: 'var(--gb-fill-subtle)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{summary}</span>
            ) : null}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{feature.desc}</div>
        </button>
        {canExpand ? (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Expand surfaces"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex', padding: 2, transition: 'transform .18s ease', transform: open ? 'rotate(90deg)' : 'none' }}>
            <I.chevr size={14} />
          </button>
        ) : null}
        <Switch on={on} onChange={onToggleEnabled} />
      </div>

      {/* Expanded surface controls */}
      <AnimatePresence initial={false}>
        {open && canExpand && (
          <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '4px 12px 12px 48px', borderTop: '1px solid var(--gb-border-subtle)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {surfaces.popup ? (
                <SubToggle label="Show in popup" hint="Open this feature as a floating modal." on={!!cfg.showInPopup} onChange={(v) => onSetSurface('showInPopup', v)} />
              ) : null}
              {surfaces.shelf ? (
                <SubToggle label="Show in action shelf" hint="Add its quick action to the bottom-right shelf." on={!!cfg.showInShelf} onChange={(v) => onSetSurface('showInShelf', v)} />
              ) : null}
              {surfaces.shelf && cfg.showInShelf ? (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--gb-text-muted)', marginBottom: 6 }}>Pages</div>
                  <PageChips pages={cfg.pages} onToggle={onTogglePage} />
                  {onSetCustomUrl ? (
                    <div style={{ marginTop: 6 }}>
                      <CustomLinkField value={cfg.customUrl} onChange={onSetCustomUrl} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default FeatureRow;
