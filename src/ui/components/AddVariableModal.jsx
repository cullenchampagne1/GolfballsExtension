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
  order:   ['builtin', 'dom', 'regex', 'literal'],
  case:    ['builtin', 'regex', 'literal'],
  account: ['builtin', 'dom', 'regex', 'literal'],
};

const KIND_OPTIONS = {
  builtin: { icon: <BoltIcon />,  label: 'Built-in', desc: 'Pre-defined from the page context' },
  dom:     { icon: <I.search />,  label: 'DOM',      desc: 'CSS selector — or pick from page' },
  regex:   { icon: <RegexIcon />, label: 'Regex',    desc: 'Capture group from an email field' },
  literal: { icon: <I.edit />,    label: 'Literal',  desc: 'Fixed string' },
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
  const [config,       setConfig]       = useState('');
  const [picking,      setPicking]      = useState(false);
  const [hoverText,    setHoverText]    = useState('');
  const [liveResolved, setLiveResolved] = useState(null);
  const [regexField,   setRegexField]   = useState('body');

  // Reset kind when typeId changes
  useEffect(() => {
    setKind(SOURCE_KINDS[typeId]?.[0] ?? 'literal');
    setConfig('');
    setPicking(false);
    setHoverText('');
  }, [typeId]);

  // Listen for pick result + real-time hover text while pick mode is active
  useEffect(() => {
    if (!picking) { setHoverText(''); return; }
    function onChanged(changes) {
      if (changes.pickResult) {
        const result = changes.pickResult.newValue;
        if (result && result.fieldId === 'pick_addvar') {
          setConfig(result.selector || '');
          setPicking(false);
          setHoverText('');
        }
      }
      if (changes.pickHover) {
        setHoverText(changes.pickHover.newValue?.text || '');
      }
    }
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [picking]);

  function startPick() {
    setPicking(true);
    setHoverText('');
    chrome.runtime.sendMessage({ action: 'startPick', fieldId: 'pick_addvar' });
  }

  function cancelPick() {
    setPicking(false);
    chrome.runtime.sendMessage({ action: 'cancelPick' });
  }

  // Live DOM resolution: query the order page whenever the selector changes
  useEffect(() => {
    if (kind !== 'dom' || !config || picking) { setLiveResolved(null); return; }
    if (typeof window.__gbResolveVars !== 'function') return;
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.resolve(window.__gbResolveVars({ __preview: { type: 'selector', selector: config } }))
        .then(res => {
          if (cancelled) return;
          const val = res?.resolved?.__preview;
          setLiveResolved(val ? String(val) : null);
        });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [kind, config, picking]); // eslint-disable-line

  const kindOptions = (SOURCE_KINDS[typeId] || []).map(id => ({
    id,
    ...KIND_OPTIONS[id],
  }));

  const previewResolved = (
    kind === 'literal' ? (config || '— empty —')
    : kind === 'builtin' ? (config ? '(live value)' : '— select a path —')
    : kind === 'dom'     ? (liveResolved || (config ? '(querying…)' : '— enter a selector —'))
    : kind === 'regex'   ? (config ? '(first capture group)' : '— enter a regex —')
    : '—'
  );

  const canAdd = !!name && !!config;

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
              onChange={v => setName(v.replace(/\s/g, '_'))}
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
                  onChange={v => setConfig(v)}
                />
              </Field>
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
                <div style={{
                  flex: 1, padding: '8px 10px',
                  background: 'var(--gb-fill-subtle)',
                  border: '1px solid ' + (picking ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'),
                  borderRadius: 'var(--gb-r-sm)',
                  fontSize: 11, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <Dot
                    tone={picking ? 'brand' : liveResolved ? 'brand' : config ? 'warning' : 'muted'}
                    glow={picking || !!liveResolved}
                    size={6}
                  />
                  <span style={{ flex: 1, color: 'var(--gb-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {picking
                      ? hoverText
                        ? <span style={{ color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', fontSize: 10.5 }}>"{hoverText}"</span>
                        : <span style={{ fontStyle: 'italic' }}>Hover an element on the page…</span>
                      : liveResolved
                        ? <><strong style={{ color: 'var(--gb-brand-label)' }}>1 match</strong> · <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 10.5 }}>{liveResolved}</span></>
                        : config
                          ? <span style={{ color: 'var(--gb-warning-fg)' }}>No match on active page</span>
                          : 'Enter a selector or pick from page'
                    }
                  </span>
                </div>
                <Btn
                  variant={picking ? 'ghost' : 'tinted'}
                  size="sm"
                  icon={<PickerIcon />}
                  onClick={picking ? cancelPick : startPick}
                >
                  {picking ? 'Cancel' : 'Pick from page'}
                </Btn>
              </div>
            </>
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
                    onChange={v => setConfig(v)}
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
                onChange={v => setConfig(v)}
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
