import React from 'react';
import { I } from '../icons.jsx';

/* ───────────────────────────────────────────────────────────────
   IconPicker — pick one glyph from a curated subset of the `I` icon
   registry, for labelling a custom action. Value is the icon KEY (a
   string like 'check'); the shelf/popup resolve it back to <I[key]/>.
   Compact wrapping grid, brand-tint active state.
─────────────────────────────────────────────────────────────── */

// Curated, action-flavored subset (all exist in src/ui/icons.jsx).
export const ACTION_ICON_KEYS = Object.freeze([
  'bolt', 'zap', 'check', 'task', 'flag', 'bookmark', 'target', 'sparkle',
  'mail', 'send', 'phone', 'card', 'gift', 'user', 'users', 'search',
  'edit', 'copy', 'save', 'refresh', 'download', 'upload', 'link', 'calc',
  'cog', 'sliders', 'eye', 'clock', 'code', 'flow', 'megaphone', 'branch',
]);

export function IconPicker({ value, onChange }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, 28px)',
      gap: 5,
      width: '100%',
      justifyContent: 'start',
    }}>
      {ACTION_ICON_KEYS.map((key) => {
        const Glyph = I[key] || I.bolt;
        const on = value === key;
        return (
          <button key={key} type="button" onClick={() => onChange(key)} title={key} aria-pressed={on}
            style={{
              width: 28, height: 28, borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background .12s ease, border-color .12s ease, color .12s ease',
              border: `1px solid ${on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}`,
              background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-surface-2)',
              color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
            }}>
            <Glyph size={14} />
          </button>
        );
      })}
    </div>
  );
}

export default IconPicker;
