import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { I, Icon } from '../icons.jsx';
import { Btn } from './Btn.jsx';
import { Field } from './Field.jsx';
import { Input } from './Input.jsx';
import { Dropdown } from './Dropdown.jsx';
import { Switch } from './Switch.jsx';

/* Compact, anchor-positioned replacement for SmartModal. Lives inside
   a tooltip-sized popover (340px) instead of a 560px modal. Same five
   smart options (fallback / extract / transform / conditional / format)
   but laid out as an icon tab strip + inline body, so even on a small
   monitor it doesn't take over the screen. Portals to <body> so it
   escapes ancestor stacking contexts and overflow clips. */

const POPOVER_W = 340;

const CaseIcon   = (p) => <Icon {...p}><path d="M4 7V4h16v3"/><path d="M9 20h6M12 4v16"/></Icon>;
const IfElseIcon = (p) => <Icon {...p}><path d="M5 4v16M19 4v16M5 12h14"/></Icon>;
const FilterIcon = (p) => <Icon {...p}><path d="M22 3H2l8 9.5V19l4 2v-8.5z"/></Icon>;
const ExtractIcon= (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M12 5v6M12 12v6M6 12h12"/></Icon>;

const TABS = [
  { id: 'fallback',    icon: I.bolt,      label: 'Fallback' },
  { id: 'extract',     icon: ExtractIcon, label: 'Extract' },
  { id: 'transform',   icon: CaseIcon,    label: 'Transform' },
  { id: 'conditional', icon: IfElseIcon,  label: 'Conditional' },
  { id: 'format',      icon: FilterIcon,  label: 'Format' },
];

const TRANSFORMS = [
  { id: 'upper',      label: 'UPPERCASE',         example: '"abc" → "ABC"' },
  { id: 'lower',      label: 'lowercase',         example: '"ABC" → "abc"' },
  { id: 'titleCase',  label: 'Title Case',        example: '"jamie lewis" → "Jamie Lewis"' },
  { id: 'capitalize', label: 'Capitalize first',  example: '"hello" → "Hello"' },
  { id: 'trim',       label: 'Trim whitespace',   example: '"  abc  " → "abc"' },
  { id: 'firstWord',  label: 'First word only',   example: '"Marcus Chen" → "Marcus"' },
];

const SCOPE_OPTIONS = [
  { id: 'sentence',  label: 'Sentence' },
  { id: 'paragraph', label: 'Paragraph' },
  { id: 'line',      label: 'Line' },
];

const FORMAT_TYPES = [
  { id: 'none',     label: 'None' },
  { id: 'number',   label: 'Number' },
  { id: 'currency', label: 'Currency' },
  { id: 'date',     label: 'Date' },
  { id: 'percent',  label: 'Percent' },
];

function isOptionSet(smart, id) {
  if (id === 'fallback')    return typeof smart.fallback === 'string' && smart.fallback.length > 0;
  if (id === 'extract')     return !!smart.extract?.pattern;
  if (id === 'transform')   return !!smart.transform;
  if (id === 'conditional') return !!smart.conditional;
  if (id === 'format')      return !!smart.format;
  return false;
}

/**
 * SmartPopover — anchor-positioned compact editor for a variable's
 * smart options. Replaces SmartModal for the in-table + body chip flows.
 *
 * Props:
 *   variable   The variable object {name, smart, resolved, ...}
 *   anchor     A DOM element to position against (the clicked bolt span)
 *   onSave     (smart) => void
 *   onClose    () => void
 */
export function SmartPopover({ variable, anchor, onSave, onClose }) {
  const popoverRef = useRef(null);
  const [tab, setTab]   = useState('fallback');
  const [smart, setSmart] = useState(variable?.smart || {});
  // Per-instance id keeps multiple SmartPopovers from colliding on
  // the shared layoutId for the active-tab indicator.
  const groupId = useId();

  // Reset when the variable changes (user clicked a different chip while
  // the previous popover was still open).
  useEffect(() => {
    if (variable) {
      setSmart(variable.smart || {});
      setTab('fallback');
    }
  }, [variable?.name]);

  // Position from the anchor's bounding rect. Update on resize; close on
  // outside scroll (so it doesn't float when the table scrolls).
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!anchor) return undefined;
    function update() {
      const r = anchor.getBoundingClientRect();
      // Default: drop down + align left with anchor. Flip to left-of-anchor
      // if it would clip the right edge of the viewport.
      let left = r.left;
      const right = left + POPOVER_W;
      if (right > window.innerWidth - 8) left = window.innerWidth - POPOVER_W - 8;
      if (left < 8) left = 8;
      // Try below first; flip above if it would clip the bottom.
      let top = r.bottom + 6;
      // We don't know height until the popover renders. Use a conservative
      // estimate (320) for the initial flip decision.
      if (top + 320 > window.innerHeight - 8) top = Math.max(8, r.top - 320 - 6);
      setPos({ top, left });
    }
    update();
    const onScroll = (e) => {
      if (popoverRef.current?.contains(e.target)) return;
      onClose?.();
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [anchor, onClose]);

  // Outside click + Esc close.
  useEffect(() => {
    const onDown = (e) => {
      if (popoverRef.current?.contains(e.target)) return;
      if (anchor && anchor.contains(e.target)) return;
      onClose?.();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  const upd = (patch) => setSmart((s) => ({ ...s, ...patch }));

  const activeCount = useMemo(
    () => TABS.filter((t) => isOptionSet(smart, t.id)).length,
    [smart],
  );

  if (!variable || !pos) return null;

  return createPortal(
    <motion.div
      ref={popoverRef}
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      exit={{    opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: 'fixed',
        top: pos.top, left: pos.left,
        width: POPOVER_W,
        zIndex: 2147483500,
        background: 'var(--gb-surface-modal)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-md)',
        boxShadow: 'var(--gb-shadow-popover)',
        fontFamily: 'var(--gb-font-sans)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header — tight pill with var name + close */}
      <div style={{
        padding: '8px 10px',
        background: 'var(--gb-warning-tint-soft)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <I.bolt size={11} style={{ color: 'var(--gb-warning-fg)', flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--gb-text-secondary)', letterSpacing: 0.3 }}>
          Smart options
        </span>
        <code style={{
          fontFamily: 'var(--gb-font-mono)', fontSize: 10, fontWeight: 600,
          color: 'var(--gb-warning-fg)', background: 'transparent',
          padding: '0 4px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minWidth: 0, flex: 1,
        }}>
          {`{{${variable.name}}}`}
        </code>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--gb-text-muted)', padding: 2, display: 'flex',
            borderRadius: 'var(--gb-r-sm)',
          }}
        >
          <I.close size={11} />
        </button>
      </div>

      {/* Icon tab strip — 5 columns equal width, with dot indicator */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
        background: 'var(--gb-surface-canvas)',
        borderBottom: '1px solid var(--gb-border-subtle)',
      }}>
        {TABS.map(({ id, icon: TabIcon, label }) => {
          const active = tab === id;
          const set    = isOptionSet(smart, id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                position: 'relative',
                padding: '7px 4px',
                background: active ? 'var(--gb-fill-soft)' : 'transparent',
                border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 2,
                color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
                // Underline is the sliding indicator (motion below). Reserve
                // the 2px so the row height doesn't jump when the tab
                // changes — the actual stroke is the layoutId pill.
                borderBottom: '2px solid transparent',
                transition: 'color 140ms ease, background 140ms ease',
                fontFamily: 'inherit',
              }}
            >
              {/* Sliding active underline — springs between tabs via shared
                  layoutId, the same pattern Segmented uses. */}
              {active && (
                <motion.span
                  layoutId={`smartpop-tab-${groupId}`}
                  transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.85 }}
                  style={{
                    position: 'absolute',
                    left: 0, right: 0, bottom: -1,
                    height: 2,
                    background: 'var(--gb-brand-label)',
                  }}
                />
              )}
              <TabIcon size={12} />
              <span style={{
                fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}>
                {label}
              </span>
              {/* Active-config dot */}
              {set && (
                <span style={{
                  position: 'absolute', top: 5, right: 8,
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'var(--gb-brand-label)',
                  boxShadow: '0 0 4px var(--gb-brand-label)',
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab body — fixed-ish height with scroll if needed */}
      <div style={{
        padding: 11, maxHeight: 280, overflow: 'auto',
        display: 'flex', flexDirection: 'column', gap: 10,
        fontSize: 11,
      }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: [0.4, 0, 0.2, 1] }}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {tab === 'fallback' && (
              <>
                <div style={{ color: 'var(--gb-text-muted)', fontSize: 10.5, lineHeight: 1.45 }}>
                  Used when the variable can't resolve. Empty = no fallback.
                </div>
                <Input
                  size="sm"
                  value={smart.fallback || ''}
                  placeholder="e.g. pending"
                  leading={<I.bolt />}
                  onChange={(v) => upd({ fallback: v })}
                />
              </>
            )}

            {tab === 'extract' && (
              <>
                <div style={{ color: 'var(--gb-text-muted)', fontSize: 10.5, lineHeight: 1.45 }}>
                  Regex against the resolved value; take a capture group.
                </div>
                <Field label="Pattern">
                  <Input
                    size="sm" mono
                    value={smart.extract?.pattern || ''}
                    placeholder="ORD-(\\d+)"
                    onChange={(v) => upd({ extract: { ...(smart.extract || {}), pattern: v } })}
                  />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <Field label="Group">
                    <Input
                      size="sm"
                      value={String(smart.extract?.group ?? 1)}
                      onChange={(v) => upd({ extract: { ...(smart.extract || {}), group: Number(v) || 0 } })}
                    />
                  </Field>
                  <Field label="Flags">
                    <Input
                      size="sm" mono
                      value={smart.extract?.flags || ''}
                      placeholder="i"
                      onChange={(v) => upd({ extract: { ...(smart.extract || {}), flags: v.replace(/[^gimsuy]/g, '') } })}
                    />
                  </Field>
                </div>
              </>
            )}

            {tab === 'transform' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {TRANSFORMS.map(({ id, label, example }) => {
                  const active = smart.transform === id;
                  return (
                    <div
                      key={id}
                      onClick={() => upd({ transform: active ? null : id })}
                      style={{
                        padding: '6px 8px', borderRadius: 'var(--gb-r-sm)', cursor: 'pointer',
                        background: active ? 'var(--gb-brand-tint-soft)' : 'transparent',
                        border: '1px solid ' + (active ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'),
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <div style={{
                        width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                        background: active ? 'var(--gb-brand-label)' : 'transparent',
                        border: '1.5px solid ' + (active ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0b0c',
                      }}>
                        {active && <I.check size={8} strokeWidth={3} />}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>
                        {label}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>
                        {example}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'conditional' && (
              <>
                <div style={{ color: 'var(--gb-text-muted)', fontSize: 10.5, lineHeight: 1.45 }}>
                  When unresolved, drop the entire enclosing scope from the email.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Switch
                    size="sm"
                    on={!!smart.conditional}
                    onChange={(on) => upd({ conditional: on })}
                  />
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>
                    Drop scope if unresolved
                  </div>
                </div>
                <Field label="Scope">
                  <Dropdown
                    size="sm"
                    value={smart.conditionalScope || 'sentence'}
                    options={SCOPE_OPTIONS}
                    onChange={(v) => upd({ conditionalScope: v })}
                  />
                </Field>
              </>
            )}

            {tab === 'format' && (
              <>
                <Field label="Type">
                  <Dropdown
                    size="sm"
                    value={smart.format?.type || 'none'}
                    options={FORMAT_TYPES}
                    onChange={(v) => upd({ format: v === 'none' ? null : { ...(smart.format || {}), type: v } })}
                  />
                </Field>
                <Field label="Pattern">
                  <Input
                    size="sm" mono
                    value={smart.format?.pattern || ''}
                    placeholder="$#,##0.00 · yyyy-MM-dd"
                    onChange={(v) => upd({ format: { ...(smart.format || {}), pattern: v } })}
                  />
                </Field>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div style={{
        padding: '7px 10px',
        background: 'var(--gb-surface-canvas)',
        borderTop: '1px solid var(--gb-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{ flex: 1, fontSize: 10, color: 'var(--gb-text-muted)' }}>
          {activeCount} option{activeCount !== 1 ? 's' : ''} active
        </div>
        <Btn variant="ghost" size="xs" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" size="xs" icon={<I.check />} onClick={() => { onSave?.(smart); onClose?.(); }}>
          Save
        </Btn>
      </div>
    </motion.div>,
    document.body,
  );
}
