import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { T, TINT } from '../shared.jsx';
import { I, Icon } from '../icons.jsx';
import { Btn } from './Btn.jsx';
import { IconBtn } from './IconBtn.jsx';
import { Dot } from './Dot.jsx';
import { Callout } from './Callout.jsx';
import { Field } from './Field.jsx';
import { Input } from './Input.jsx';
import { Dropdown } from './Dropdown.jsx';
import { Switch } from './Switch.jsx';

const BoltIcon   = (p) => <Icon {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></Icon>;
const CaseIcon   = (p) => <Icon {...p}><path d="M4 7V4h16v3"/><path d="M9 20h6M12 4v16"/></Icon>;
const IfElseIcon = (p) => <Icon {...p}><path d="M5 4v16M19 4v16M5 12h14"/></Icon>;
const FilterIcon = (p) => <Icon {...p}><path d="M22 3H2l8 9.5V19l4 2v-8.5z"/></Icon>;

const Mono = ({ children }) => (
  <code style={{
    fontFamily: 'var(--gb-font-mono)', fontSize: 11,
    color: 'var(--gb-brand-label)',
    background: 'var(--gb-brand-tint-soft)',
    border: '1px solid var(--gb-brand-tint-border)',
    padding: '0 5px', borderRadius: 3,
  }}>
    {children}
  </code>
);

const TABS = [
  { id: 'fallback',    icon: BoltIcon,   label: 'Fallback',    hint: 'Use a default if unresolved' },
  { id: 'transform',   icon: CaseIcon,   label: 'Transform',   hint: 'Reshape the value' },
  { id: 'conditional', icon: IfElseIcon, label: 'Conditional', hint: 'Drop sentence if missing' },
  { id: 'format',      icon: FilterIcon, label: 'Format',      hint: 'Number / date / currency' },
];

const TRANSFORMS = [
  { id: 'upper',      label: 'UPPERCASE',       example: '"marcus" → "MARCUS"' },
  { id: 'lower',      label: 'lowercase',        example: '"Marcus" → "marcus"' },
  { id: 'titleCase',  label: 'Title Case',       example: '"jamie lewis" → "Jamie Lewis"' },
  { id: 'capitalize', label: 'Capitalize first', example: '"hello" → "Hello"' },
  { id: 'trim',       label: 'Trim whitespace',  example: '"  abc  " → "abc"' },
  { id: 'firstWord',  label: 'First word only',  example: '"Marcus Chen" → "Marcus"' },
];

/**
 * SmartModal — tab-based modal for configuring a variable's smart behaviors.
 * Tabs: Fallback · Transform · Conditional · Format.
 *
 * Props:
 *   variable  Variable | null       — null = closed
 *   onClose   () => void
 *   onSave    (smart: SmartConfig) => void
 */
export function SmartModal({ variable, onClose, onSave }) {
  const [tab, setTab]     = useState('fallback');
  const [smart, setSmart] = useState(variable?.smart || {});

  // Re-sync if variable changes (e.g. user clicks a different chip)
  React.useEffect(() => {
    if (variable) {
      setSmart(variable.smart || {});
      setTab('fallback');
    }
  }, [variable?.name]);

  if (!variable) return null;

  const upd = (patch) => setSmart(s => ({ ...s, ...patch }));

  const isTabEnabled = (id) => {
    if (id === 'fallback')    return typeof smart.fallback === 'string' && smart.fallback.length > 0;
    if (id === 'transform')   return !!smart.transform;
    if (id === 'conditional') return !!smart.conditional;
    if (id === 'format')      return !!smart.format;
    return false;
  };

  const activeOptionCount = Object.entries(smart).filter(([, v]) =>
    v !== null && v !== undefined && v !== '' && v !== false,
  ).length;

  return (
    <motion.div
      key="smart-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={T.base}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--gb-backdrop)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <motion.div
        key="smart-sheet"
        initial={{ scale: 0.95, y: -10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: -10 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: 560,
          background: 'var(--gb-surface-canvas)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-xl)',
          boxShadow: 'var(--gb-shadow-modal)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{
          padding: '12px 16px',
          background: 'var(--gb-fill-inverse-strong)',
          borderBottom: '1px solid var(--gb-border-subtle)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0,
            background: 'var(--gb-warning-tint-medium)',
            border: '1px solid var(--gb-warning-tint-border)',
            color: 'var(--gb-warning-fg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BoltIcon size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
              Smart options
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', marginTop: 1 }}>
              {`{{${variable.name}}}`}
            </div>
          </div>
          <IconBtn size="sm" icon={<I.close />} onClick={onClose} />
        </div>

        {/* ── Tab rail ───────────────────────────────────────── */}
        <div style={{
          display: 'flex', padding: '0 16px',
          background: 'var(--gb-fill-subtle)',
          borderBottom: '1px solid var(--gb-border-subtle)',
          flexShrink: 0,
        }}>
          {TABS.map(({ id, icon: TabIcon, label }) => {
            const active  = tab === id;
            const enabled = isTabEnabled(id);
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  padding: '11px 13px', background: 'transparent',
                  color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
                  border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--gb-font-sans)', fontSize: 11.5, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  borderBottom: active ? '2px solid var(--gb-brand-label)' : '2px solid transparent',
                  marginBottom: -1,
                  transition: 'color var(--gb-anim)',
                }}
              >
                <TabIcon size={11} />
                {label}
                {enabled && <Dot tone="brand" glow size={4} />}
              </button>
            );
          })}
        </div>

        {/* ── Body ───────────────────────────────────────────── */}
        <div style={{ padding: 18, minHeight: 220, flex: 1, overflow: 'auto' }}>

          {/* Fallback tab */}
          {tab === 'fallback' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Callout tone="info">
                If the variable can't resolve, this value is used instead.
                Leave empty to keep the raw placeholder in the output.
              </Callout>
              <Field label="Fallback value" hint="Plain text, used verbatim · empty = no fallback">
                <Input
                  value={smart.fallback || ''}
                  placeholder="e.g. pending · unknown · 0"
                  leading={<BoltIcon />}
                  onChange={e => upd({ fallback: e.target.value })}
                />
              </Field>
              {typeof smart.fallback === 'string' && smart.fallback.length > 0 && (
                <div style={{
                  padding: '8px 11px',
                  background: 'var(--gb-warning-tint-soft)',
                  border: '1px solid var(--gb-warning-tint-border)',
                  borderRadius: 'var(--gb-r-sm)',
                  fontSize: 11, color: 'var(--gb-text-tertiary)',
                  display: 'flex', alignItems: 'center', gap: 7,
                }}>
                  <BoltIcon size={11} style={{ color: 'var(--gb-warning-fg)', flexShrink: 0 }} />
                  Preview: when missing, the body shows{' '}
                  <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-warning-fg)', fontWeight: 600 }}>
                    "{smart.fallback}"
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Transform tab */}
          {tab === 'transform' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', lineHeight: 1.55 }}>
                Reshape the resolved value before insertion. Useful for normalizing messy sources.
              </div>
              <Field label="Transform">
                <Dropdown value={smart.transform || 'None'} />
              </Field>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {TRANSFORMS.map(({ id, label, example }) => {
                  const active = smart.transform === id;
                  return (
                    <div
                      key={id}
                      onClick={() => upd({ transform: active ? null : id })}
                      style={{
                        padding: '8px 11px', borderRadius: 'var(--gb-r-sm)', cursor: 'pointer',
                        background: active ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)',
                        border: '1px solid ' + (active ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'),
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}
                    >
                      <div style={{
                        width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                        background: active ? 'var(--gb-brand-label)' : 'transparent',
                        border: '1.5px solid ' + (active ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#0a0b0c',
                      }}>
                        {active && <I.check size={9} strokeWidth={3} />}
                      </div>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>
                        {label}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>
                        {example}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Conditional tab */}
          {tab === 'conditional' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Callout tone="info">
                When the variable can't resolve, remove the{' '}
                <strong style={{ color: 'var(--gb-text-secondary)' }}>entire surrounding sentence</strong>{' '}
                from the email instead of leaving an empty placeholder or fallback.
              </Callout>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Switch
                  on={!!smart.conditional}
                  size="md"
                  onChange={(on) => upd({ conditional: on })}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)' }}>
                    Drop sentence if unresolved
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 2 }}>
                    Boundary detected by the nearest <Mono>.</Mono> / <Mono>!</Mono> / <Mono>?</Mono> or newline.
                  </div>
                </div>
              </div>
              <Field label="Scope">
                <Dropdown value={smart.conditionalScope || 'Sentence containing the variable'} />
              </Field>
            </div>
          )}

          {/* Format tab */}
          {tab === 'format' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Format type">
                <Dropdown value={smart.format?.type || 'None'} />
              </Field>
              <Field label="Pattern" hint="Use ICU-style tokens">
                <Input
                  value={smart.format?.pattern || ''}
                  placeholder="$#,##0.00  ·  yyyy-MM-dd  ·  #,###"
                  mono
                />
              </Field>
              <div style={{
                padding: 11,
                background: 'var(--gb-fill-subtle)',
                border: '1px solid var(--gb-border-subtle)',
                borderRadius: 'var(--gb-r-sm)',
                fontSize: 11, color: 'var(--gb-text-tertiary)', lineHeight: 1.5,
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)', marginBottom: 4 }}>
                  Preview
                </div>
                Raw:{' '}
                <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-secondary)' }}>
                  {variable.resolved || '—'}
                </span>
                <br />
                Formatted:{' '}
                <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)' }}>
                  {variable.resolved || '—'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div style={{
          padding: 12,
          background: 'var(--gb-fill-inverse-strong)',
          borderTop: '1px solid var(--gb-border-subtle)',
          display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0,
        }}>
          <div style={{ flex: 1, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>
            {activeOptionCount} option{activeOptionCount !== 1 ? 's' : ''} active
          </div>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon={<I.check />} onClick={() => onSave?.(smart)}>Save</Btn>
        </div>
      </motion.div>
    </motion.div>
  );
}
