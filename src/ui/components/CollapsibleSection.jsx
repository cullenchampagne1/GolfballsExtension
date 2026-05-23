import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { T } from '../shared.jsx';
import { I } from '../icons.jsx';

/* One-time injected style: hides the native scrollbar on opt-in surfaces
   marked with `.gb-cs-nobar`. Firefox uses scrollbar-width; Chromium needs
   the ::-webkit pseudo. The class is scoped so it only affects sections
   that explicitly request scrollbar hiding. */
const NOBAR_STYLE_ID = '__gb-cs-nobar';
function ensureNobarStyle() {
  if (typeof document === 'undefined' || document.getElementById(NOBAR_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = NOBAR_STYLE_ID;
  el.textContent =
    '.gb-cs-nobar{scrollbar-width:none;-ms-overflow-style:none}' +
    '.gb-cs-nobar::-webkit-scrollbar{width:0;height:0;display:none}';
  (document.head || document.documentElement).appendChild(el);
}

/**
 * CollapsibleSection — neutral collapsible card. Same chrome as
 * ExpandableFeature/CollapsibleChecklist but without a Switch or
 * select-all in the header. For sections that are just "show / hide
 * this body": developer settings, advanced options, etc.
 *
 * Props:
 *   icon          Optional React element in the 22px header tile.
 *   title         Required. Header text.
 *   subtitle      Optional second-line muted text.
 *   action        Optional right-side slot (e.g. a Reset button).
 *                 Clicks inside it shouldn't toggle the section, so
 *                 wrap your action handlers with `e.stopPropagation()`.
 *   defaultOpen   Default false.
 *   maxHeight     Optional. Caps the body height (px) and scrolls inside.
 *                 Useful when the body can grow long (e.g. dev settings
 *                 registry) so it doesn't stretch the whole settings page.
 *   hideScrollbar Optional. When true (only meaningful with maxHeight),
 *                 the native scrollbar is hidden via CSS — content still
 *                 scrolls via wheel/touch/keyboard. Use when the visible
 *                 scrollbar is more distracting than helpful.
 *   children      Body.
 */
export function CollapsibleSection({ icon, title, subtitle, action, defaultOpen = false, maxHeight, hideScrollbar, children }) {
  useEffect(() => { if (hideScrollbar) ensureNobarStyle(); }, [hideScrollbar]);
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-md)',
      background: 'var(--gb-surface-1)',
      overflow: 'hidden',
    }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: '8px 10px',
          display: 'flex', alignItems: 'center', gap: 9,
          cursor: 'pointer', userSelect: 'none',
          borderBottom: open ? '1px solid var(--gb-border-subtle)' : '1px solid transparent',
        }}
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={T.fast}
          style={{ display: 'inline-flex', color: 'var(--gb-text-muted)', flexShrink: 0 }}
        >
          <I.chevr size={10} />
        </motion.span>
        {icon && (
          <span style={{
            width: 22, height: 22, borderRadius: 'var(--gb-r-sm)', flexShrink: 0,
            background: 'var(--gb-brand-tint-medium)',
            border: '1px solid var(--gb-brand-tint-border)',
            color: 'var(--gb-brand-label)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {React.cloneElement(icon, { size: 11 })}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 1 }}>
              {subtitle}
            </div>
          )}
        </div>
        {action && (
          <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
            {action}
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={T.base}
            style={{ overflow: 'hidden' }}
          >
            <div
              className={hideScrollbar && maxHeight ? 'gb-cs-nobar' : undefined}
              style={{
                padding: '10px 12px',
                background: 'var(--gb-fill-inverse-soft)',
                maxHeight, overflowY: maxHeight ? 'auto' : undefined,
              }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
