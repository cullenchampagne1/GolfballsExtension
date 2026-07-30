import React, { useState } from 'react';
import { I } from '../icons.jsx';

/* ───────────────────────────────────────────────────────────────
   CustomLinkField — a "Custom link" chip that animates open a text box
   for a URL substring. When the active page's URL contains that text,
   the action shelf shows the action (OR'd with the page chips). Used by
   both the built-in FeatureRow and the custom-action editor so the two
   surfaces behave identically.
─────────────────────────────────────────────────────────────── */
export function CustomLinkField({ value, onChange, alwaysOpen = false }) {
  const active = !!(value && value.trim());
  const [opened, setOpened] = useState(active);
  const open = alwaysOpen || opened;

  return (
    <div>
      {!alwaysOpen && (
        <button type="button" onClick={() => setOpened((o) => !o)}
          title="Show on any page whose URL contains a link you specify"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
            fontSize: 10.5, fontWeight: 700, transition: 'background .12s ease, color .12s ease, border-color .12s ease',
            border: `1px solid ${active ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}`,
            background: active ? 'var(--gb-brand-tint-soft)' : 'transparent',
            color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
          }}>
          <I.link size={10} />Custom link
        </button>
      )}
      {/* Animated reveal (grid 0fr → 1fr) of the URL input. */}
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows var(--gb-anim, .18s ease)' }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ paddingTop: alwaysOpen ? 0 : 7 }}>
            <input
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder="URL contains… e.g. Page=271 or /Admin/Order"
              style={{
                width: '100%', height: 28, padding: '0 9px', boxSizing: 'border-box',
                border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)',
                background: 'var(--gb-fill-inverse-medium)', color: 'var(--gb-text-primary)',
                fontFamily: 'var(--gb-font-mono)', fontSize: 11, outline: 'none',
              }} />
            {!alwaysOpen && (
              <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 4 }}>
                Shows the shelf action on any page whose URL contains this text.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CustomLinkField;
