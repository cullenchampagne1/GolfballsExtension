import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { T } from '../shared.jsx';
import { I, Icon } from '../icons.jsx';
import { Btn } from './Btn.jsx';
import { IconBtn } from './IconBtn.jsx';
import { Field } from './Field.jsx';
import { Input } from './Input.jsx';
import { Dropdown } from './Dropdown.jsx';
import { Tag } from './Tag.jsx';
import { Dot } from './Dot.jsx';
import { KindPickerGrid } from './KindPickerGrid.jsx';

/* ── Kind icons ──────────────────────────────────────────────── */
const BoltIcon    = (p) => <Icon {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></Icon>;
const PickerIcon  = (p) => <Icon {...p}><path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></Icon>;
const RegexIcon   = (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M12 5v6M12 12v6M6 12h12"/></Icon>;
const VariableIcon= (p) => <Icon {...p}><path d="M5 4 a14 14 0 000 16M19 4a14 14 0 010 16"/><path d="M9 9l6 6M9 15l6-6"/></Icon>;

export const SOURCE_KINDS = {
  order:   ['builtin', 'dom', 'pick', 'regex', 'literal'],
  case:    ['builtin', 'regex', 'literal'],
  account: ['builtin', 'dom', 'regex', 'literal'],
};

const KIND_OPTIONS = {
  builtin: { icon: <BoltIcon />,   label: 'Built-in', desc: 'Pre-defined from the page context' },
  dom:     { icon: <I.search />,   label: 'DOM',      desc: 'CSS selector against the page' },
  pick:    { icon: <PickerIcon />, label: 'Pick',     desc: 'Click an element on the page' },
  regex:   { icon: <RegexIcon />,  label: 'Regex',    desc: 'Capture group from an email field' },
  literal: { icon: <I.edit />,     label: 'Literal',  desc: 'Fixed string' },
};

/**
 * AddVariableModal — centered 560px modal for creating a new variable.
 *
 * Props:
 *   typeId  'order'|'case'|'account'
 *   onClose () => void
 *   onAdd   ({ name, kind, config }) => void
 */
export function AddVariableModal({ typeId, onClose, onAdd }) {
  const [name,       setName]       = useState('');
  const [kind,       setKind]       = useState(SOURCE_KINDS[typeId]?.[0] ?? 'literal');
  const [config,     setConfig]     = useState('');
  const [picking,    setPicking]    = useState(false);
  const [pickText,   setPickText]   = useState('');
  const [regexField, setRegexField] = useState('body');

  // Reset kind when typeId changes
  useEffect(() => {
    setKind(SOURCE_KINDS[typeId]?.[0] ?? 'literal');
    setConfig('');
    setPicking(false);
    setPickText('');
  }, [typeId]);

  // Wire pick mode: listen for pickResult in storage while picking is active
  useEffect(() => {
    if (!picking) return;
    function onChanged(changes) {
      if (!changes.pickResult) return;
      const result = changes.pickResult.newValue;
      if (result && result.fieldId === 'pick_addvar') {
        setConfig(result.selector || '');
        setPickText(result.text   || '');
        setPicking(false);
      }
    }
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [picking]);

  function startPick() {
    setPicking(true);
    setConfig('');
    setPickText('');
    chrome.runtime.sendMessage({ action: 'startPick', fieldId: 'pick_addvar' });
  }

  function cancelPick() {
    setPicking(false);
    chrome.runtime.sendMessage({ action: 'cancelPick' });
  }

  const kindOptions = (SOURCE_KINDS[typeId] || []).map(id => ({
    id,
    ...KIND_OPTIONS[id],
  }));

  const previewResolved = (
    kind === 'literal' ? (config || '— empty —')
    : kind === 'builtin' ? (config ? '(live value)' : '— select a path —')
    : kind === 'dom'     ? (config ? '(live value)' : '— enter a selector —')
    : kind === 'pick'    ? (config ? '(live value)' : '— click an element on the page —')
    : kind === 'regex'   ? (config ? '(first capture group)' : '— enter a regex —')
    : '—'
  );

  const canAdd = !!name && (kind === 'literal' ? !!config : !!config || kind === 'pick');

  return (
    <motion.div
      key="add-var-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={T.base}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--gb-backdrop)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, padding: 24,
      }}
    >
      <motion.div
        key="add-var-sheet"
        initial={{ scale: 0.95, y: -10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: -10 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: 560, maxHeight: 'calc(100vh - 48px)',
          background: 'var(--gb-surface-canvas)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-xl)',
          boxShadow: 'var(--gb-shadow-modal)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{
          padding: '14px 18px',
          background: 'var(--gb-fill-inverse-strong)',
          borderBottom: '1px solid var(--gb-border-subtle)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 'var(--gb-r-md)', flexShrink: 0,
            background: 'var(--gb-brand-tint-medium)',
            border: '1px solid var(--gb-brand-tint-border)',
            color: 'var(--gb-brand-label)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <I.plus size={14} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
              New variable
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>
              Resolves against the active page
            </div>
          </div>
          <IconBtn size="sm" icon={<I.close />} onClick={onClose} />
        </div>

        {/* ── Body ───────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Variable name */}
          <Field label="Variable name" required hint="No spaces. Used as {{name}} in the body.">
            <Input
              value={name}
              placeholder="e.g. customer_first"
              leading={<VariableIcon />}
              mono
              onChange={e => setName(e.target.value.replace(/\s/g, '_'))}
            />
          </Field>

          {/* Source kind picker */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)', marginBottom: 7 }}>
              Source kind
            </div>
            <KindPickerGrid
              options={kindOptions}
              value={kind}
              onChange={(id) => { setKind(id); setConfig(''); setPicking(false); setPickText(''); }}
            />
          </div>

          {/* Kind-specific config */}
          {kind === 'builtin' && (
            <Field label="Built-in path" hint="Type-ahead from the page's available fields">
              <Dropdown value={config || 'Select a field…'} leading={<BoltIcon />} />
            </Field>
          )}

          {kind === 'dom' && (
            <>
              <Field label="CSS selector" hint="First matching element's .textContent is used">
                <Input
                  value={config}
                  placeholder=".order-total .amount"
                  mono
                  leading={<I.search />}
                  onChange={e => setConfig(e.target.value)}
                />
              </Field>
              <div style={{
                padding: '10px 12px',
                background: 'var(--gb-fill-subtle)',
                border: '1px solid var(--gb-border-subtle)',
                borderRadius: 'var(--gb-r-sm)',
                fontSize: 11, color: 'var(--gb-text-tertiary)',
                display: 'flex', alignItems: 'center', gap: 9,
              }}>
                <Dot tone={config ? 'brand' : 'muted'} glow={!!config} size={6} />
                <span style={{ flex: 1 }}>
                  {config
                    ? <><strong style={{ color: 'var(--gb-brand-label)' }}>1 match</strong> found on the active page</>
                    : 'Enter a selector to test it live'
                  }
                </span>
                {config && <Tag tone="brand" size="xs">$1,247.50</Tag>}
              </div>
            </>
          )}

          {kind === 'pick' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* ── Idle: no selector captured yet ── */}
              {!picking && !config && (
                <Btn variant="primary" size="lg" icon={<PickerIcon />} full onClick={startPick}>
                  Pick element from page
                </Btn>
              )}

              {/* ── Active: waiting for user to click ── */}
              {picking && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={T.base}
                  style={{
                    padding: '14px 16px',
                    background: 'var(--gb-brand-tint-soft)',
                    border: '1px solid var(--gb-brand-tint-border)',
                    borderRadius: 'var(--gb-r-md)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Dot tone="brand" glow size={7} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-brand-label)' }}>
                      Waiting for pick…
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gb-text-secondary)', lineHeight: 1.6 }}>
                    Switch to your order tab and click any element on the page. The extension will capture its selector and return you here automatically.
                  </div>
                  <div>
                    <Btn variant="ghost" size="sm" onClick={cancelPick}>
                      Cancel
                    </Btn>
                  </div>
                </motion.div>
              )}

              {/* ── Result: selector captured ── */}
              {config && !picking && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={T.base}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--gb-fill-subtle)',
                    border: '1px solid var(--gb-border-subtle)',
                    borderRadius: 'var(--gb-r-sm)',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Dot tone="brand" glow size={5} />
                      <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)' }}>
                        Captured selector
                      </span>
                    </div>
                    <div style={{
                      fontFamily: 'var(--gb-font-mono)', fontSize: 10.5,
                      color: 'var(--gb-brand-label)', wordBreak: 'break-all', lineHeight: 1.5,
                    }}>
                      {config}
                    </div>
                    {pickText && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Tag tone="brand" size="xs" icon={<I.check />}>LIVE</Tag>
                        <span style={{
                          fontFamily: 'var(--gb-font-mono)', fontSize: 10.5,
                          color: 'var(--gb-text-secondary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          "{pickText}"
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <Btn variant="ghost" size="sm" icon={<PickerIcon />} onClick={startPick}>
                      Pick again
                    </Btn>
                  </div>
                </motion.div>
              )}
            </div>
          )}

          {kind === 'regex' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
                <Field label="From field">
                  <Dropdown value={regexField} />
                </Field>
                <Field label="Regex (capture group 1 used)">
                  <Input
                    value={config}
                    placeholder="order\s+(ORD-\d+)"
                    mono
                    leading={<RegexIcon />}
                    onChange={e => setConfig(e.target.value)}
                  />
                </Field>
              </div>
              {config && (
                <div style={{
                  padding: '10px 12px',
                  background: 'var(--gb-fill-subtle)',
                  border: '1px solid var(--gb-border-subtle)',
                  borderRadius: 'var(--gb-r-sm)',
                  fontSize: 11, color: 'var(--gb-text-tertiary)',
                }}>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)', marginBottom: 4 }}>
                    Test against
                  </div>
                  <div style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, color: 'var(--gb-text-secondary)', lineHeight: 1.5 }}>
                    "Hi, our order ORD-28104 arrived crushed. Please advise."
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag tone="brand" size="xs" icon={<I.check />}>MATCH</Tag>
                    <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)' }}>ORD-28104</span>
                  </div>
                </div>
              )}
            </>
          )}

          {kind === 'literal' && (
            <Field label="Fixed value" hint="Used verbatim every time">
              <Input
                value={config}
                placeholder="e.g. Customer Service Team"
                onChange={e => setConfig(e.target.value)}
              />
            </Field>
          )}

          {/* Preview chip */}
          <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '2px 0' }} />
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)', marginBottom: 7 }}>
              Preview
            </div>
            <div style={{
              padding: 12, borderRadius: 'var(--gb-r-md)',
              background: 'var(--gb-fill-inverse-medium)',
              border: '1px solid var(--gb-border-default)',
              fontSize: 12, color: 'var(--gb-text-secondary)', lineHeight: 1.6,
            }}>
              In your template:{' '}
              <span style={{
                display: 'inline-flex', alignItems: 'stretch',
                borderRadius: 'var(--gb-r-sm)',
                border: '1px solid var(--gb-brand-tint-border)',
                background: 'var(--gb-brand-tint-soft)',
                overflow: 'hidden',
              }}>
                <span style={{ padding: '1px 7px', fontFamily: 'var(--gb-font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--gb-brand-label)' }}>
                  {name || 'variable_name'}
                </span>
                <span style={{ padding: '0 5px', borderLeft: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'inline-flex', alignItems: 'center', opacity: 0.55 }}>
                  <BoltIcon size={9} />
                </span>
              </span>
              {' → '}
              <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-tertiary)' }}>
                {previewResolved}
              </span>
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div style={{
          padding: 12,
          background: 'var(--gb-fill-inverse-strong)',
          borderTop: '1px solid var(--gb-border-subtle)',
          display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0,
        }}>
          <div style={{ flex: 1, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>
            Smart options can be set after creating.
          </div>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            icon={<I.plus />}
            disabled={!canAdd}
            onClick={() => onAdd?.({ name, kind, config })}
          >
            Add variable
          </Btn>
        </div>
      </motion.div>
    </motion.div>
  );
}
