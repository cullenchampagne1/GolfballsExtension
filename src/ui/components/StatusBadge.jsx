import React from 'react';

/**
 * StatusBadge — the small monospace count / hotkey chip used in the
 * keyboard-composer rows (QuickTask, CallLog). When `active`, it adopts
 * the row's tone; otherwise it sits in a neutral fill.
 *
 * Props:
 *   active   — selected/active state
 *   tone     — { bgMed, bd, fg } palette (e.g. a COMPOSER_TONE entry)
 *   style    — overrides
 *   children — the label (a hotkey, a count…)
 */
export function StatusBadge({ active, tone = {}, style, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 17, height: 17, padding: '0 4px', borderRadius: 4,
      fontSize: 9.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)',
      background: active ? tone.bgMed : 'var(--gb-fill-inverse-medium)',
      border: `1px solid ${active ? tone.bd : 'var(--gb-border-default)'}`,
      color: active ? tone.fg : 'var(--gb-text-tertiary)',
      transition: 'all .15s', ...style,
    }}>{children}</span>
  );
}
