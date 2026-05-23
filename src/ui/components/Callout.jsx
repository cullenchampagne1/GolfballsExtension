import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { T, sizeIcon } from '../shared.jsx';
import { I } from '../icons.jsx';

/* Per-tip dismissal persisted across reloads. Use stable, unique ids;
   reusing an id across different copy means users won't see the updated
   text after their first dismissal. */
const DISMISS_KEY = '__gb_callouts_dismissed';
function readDismissed() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DISMISS_KEY) : null;
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (_) { return new Set(); }
}
function writeDismissed(set) {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...set])); } catch (_) {}
}

const TONES = {
  info:    { fg: 'var(--gb-info-fg)',       bg: 'var(--gb-info-tint-soft)',    bd: 'var(--gb-info-tint-border)' },
  brand:   { fg: 'var(--gb-brand-label)',   bg: 'var(--gb-brand-tint-soft)',   bd: 'var(--gb-brand-tint-border)' },
  success: { fg: 'var(--gb-success-fg)',    bg: 'var(--gb-success-tint-soft)', bd: 'var(--gb-success-tint-border)' },
  warning: { fg: 'var(--gb-warning-fg)',    bg: 'var(--gb-warning-tint-soft)', bd: 'var(--gb-warning-tint-border)' },
  error:   { fg: 'var(--gb-error-fg)',      bg: 'var(--gb-error-tint-soft)',   bd: 'var(--gb-error-tint-border)' },
  neutral: { fg: 'var(--gb-text-tertiary)', bg: 'var(--gb-fill-subtle)',       bd: 'var(--gb-border-default)' },
};
const DEFAULT_ICON = { info: 'alert', brand: 'bolt', success: 'check', warning: 'alert', error: 'alert', neutral: 'alert' };

/**
 * Callout — inline note box. Tone-aware, with a load-bearing left
 * accent border.
 *
 * Props: tone 'info'|'brand'|'success'|'warning'|'error'|'neutral',
 *   title, icon (ReactElement | false), dismissable, onDismiss, children.
 *   persistId — when set, dismissal is saved to localStorage and the
 *               callout stays hidden across reloads. Implies dismissable.
 */
export function Callout({ tone = 'info', icon, title, children, dismissable, onDismiss, persistId, style }) {
  const isPersist = !!persistId;
  // Persistable callouts start hidden until we've checked storage to
  // avoid a flash of "shown then hidden" on mount.
  const [visible, setVisible] = useState(!isPersist);
  useEffect(() => {
    if (!isPersist) return;
    setVisible(!readDismissed().has(persistId));
  }, [isPersist, persistId]);
  const canDismiss = dismissable || isPersist;
  const dismiss = () => {
    setVisible(false);
    if (isPersist) {
      const next = readDismissed();
      next.add(persistId);
      writeDismissed(next);
    }
    onDismiss?.();
  };
  const t = TONES[tone] || TONES.info;
  const DefaultIcon = I[DEFAULT_ICON[tone] || 'alert'];
  const shownIcon = icon === false ? null : (icon || <DefaultIcon />);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, marginBottom: 0 }}
          transition={T.bounce}
          style={{
            padding: '11px 14px',
            background: t.bg,
            border: `1px solid ${t.bd}`,
            borderLeft: `3px solid ${t.fg}`,
            borderRadius: 'var(--gb-r-sm)',
            display: 'flex', gap: 10, alignItems: 'flex-start',
            fontSize: 11.5, lineHeight: 1.55, color: 'var(--gb-text-tertiary)',
            overflow: 'hidden', boxSizing: 'border-box',
            ...style,
          }}
        >
          {shownIcon && (
            <span style={{ color: t.fg, display: 'flex', flexShrink: 0, marginTop: 1 }}>
              {sizeIcon(shownIcon, 13)}
            </span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && (
              <div style={{
                fontSize: 12, fontWeight: 700, color: 'var(--gb-text-secondary)',
                marginBottom: children ? 2 : 0,
              }}>{title}</div>
            )}
            {children}
          </div>
          {canDismiss && (
            <motion.span
              onClick={dismiss}
              whileHover={{ color: 'var(--gb-text-secondary)' }}
              style={{ color: 'var(--gb-text-muted)', cursor: 'pointer', display: 'flex', flexShrink: 0, marginTop: 1 }}
            >
              <I.close size={12} />
            </motion.span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
