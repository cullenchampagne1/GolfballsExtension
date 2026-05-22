import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { T, sizeIcon } from '../shared.jsx';
import { I } from '../icons.jsx';

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
 */
export function Callout({ tone = 'info', icon, title, children, dismissable, onDismiss, style }) {
  const [visible, setVisible] = useState(true);
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
          {dismissable && (
            <motion.span
              onClick={() => { setVisible(false); onDismiss?.(); }}
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
