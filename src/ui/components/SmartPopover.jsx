import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { I, Icon } from '../icons.jsx';
import { Btn } from './Btn.jsx';
import { Field } from './Field.jsx';
import { Input } from './Input.jsx';
import { Dropdown } from './Dropdown.jsx';
import { Switch } from './Switch.jsx';
import { DraggablePopup } from './DraggablePopup.jsx';

/* SmartPopover — cursor-anchored editor for a variable's smart options.
   The same five tabs (fallback / extract / transform / conditional /
   format) the legacy SmartModal carried, but laid out as an icon strip
   inside a DraggablePopup so the visual chrome (drag grip, icon, title,
   close X) matches every other secondary popup in the system. The
   spawn point follows the user's cursor instead of an anchor element —
   click a variable bolt anywhere and the popup pops up right where the
   user's eyes already are, no anchor wiring required. */

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
 * SmartPopover — cursor-anchored compact editor for a variable's
 * smart options. Replaces the older anchor-element flavour with a
 * cursor-pixel anchor so callers just hand over the click event.
 *
 * Props:
 *   variable   The variable object {name, smart, resolved, ...}
 *   cursor     { x, y } viewport coords (from event.clientX/clientY).
 *              Pass null to fall back to viewport-centre placement.
 *   onSave     (smart) => void
 *   onClose    () => void
 */
export function SmartPopover({ variable, cursor, onSave, onClose }) {
  const [tab, setTab] = useState('fallback');
  const [smart, setSmart] = useState(variable?.smart || {});

  // Reset when the variable changes (user clicked a different chip while
  // the previous popover was still open).
  useEffect(() => {
    if (variable) {
      setSmart(variable.smart || {});
      setTab('fallback');
    }
  }, [variable?.name]);

  const upd = (patch) => setSmart((s) => ({ ...s, ...patch }));

  const activeCount = useMemo(
    () => TABS.filter((t) => isOptionSet(smart, t.id)).length,
    [smart],
  );

  if (!variable) return null;

  return (
    <DraggablePopup
      open={!!variable}
      onClose={onClose}
      cursorAnchor={cursor}
      width={POPOVER_W}
      maxHeight={420}
      icon={<I.bolt size={12} />}
      title="Smart options"
      subtitle={(
        <code style={{
          fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, fontWeight: 600,
          color: 'var(--gb-warning-fg)',
        }}>{`{{${variable.name}}}`}</code>
      )}
      closeOnOutside
      enterFrom="bottom"
    >
      {/* Icon tab strip — 5 columns equal width, with sliding underline. */}
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
                borderBottom: '2px solid transparent',
                transition: 'color 140ms ease, background 140ms ease',
                fontFamily: 'inherit',
              }}
            >
              {active && (
                <motion.span
                  layoutId="gb-smart-tab"
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
        fontSize: 11, flex: 1,
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
        flexShrink: 0,
      }}>
        <div style={{ flex: 1, fontSize: 10, color: 'var(--gb-text-muted)' }}>
          {activeCount} option{activeCount !== 1 ? 's' : ''} active
        </div>
        <Btn variant="ghost" size="xs" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" size="xs" icon={<I.check />} onClick={() => { onSave?.(smart); onClose?.(); }}>
          Save
        </Btn>
      </div>
    </DraggablePopup>
  );
}
