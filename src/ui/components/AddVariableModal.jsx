import React, { useState, useEffect } from 'react';
import { I, Icon } from '../icons.jsx';
import { Btn } from './Btn.jsx';
import { Field } from './Field.jsx';
import { Input } from './Input.jsx';
import { Dropdown } from './Dropdown.jsx';
import { Tag } from './Tag.jsx';
import { Dot } from './Dot.jsx';
import { KindPickerGrid } from './KindPickerGrid.jsx';
import { CompactModal } from './CompactModal.jsx';
import { ModalHeader } from './ModalHeader.jsx';
import { ModalFooter } from './ModalFooter.jsx';

/* ── Kind icons (BoltIcon comes from I.bolt) ───────────────────── */
const PickerIcon  = (p) => <Icon {...p}><path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></Icon>;
const RegexIcon   = (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M12 5v6M12 12v6M6 12h12"/></Icon>;
const VariableIcon= (p) => <Icon {...p}><path d="M5 4 a14 14 0 000 16M19 4a14 14 0 010 16"/><path d="M9 9l6 6M9 15l6-6"/></Icon>;

/* Regex as a primary variable kind only makes sense for case templates
   (matching the inbound email body/subject/from). For order/account
   pages, regex moved to a Smart "Extract" transform that runs against
   the already-resolved builtin/DOM/literal value. */
export const SOURCE_KINDS = {
  order:   ['builtin', 'dom', 'literal'],
  case:    ['builtin', 'regex', 'literal'],
  account: ['builtin', 'dom', 'literal'],
};

const KIND_OPTIONS = {
  builtin: { icon: <I.bolt />,  label: 'Built-in', desc: 'Pre-defined from the page context' },
  dom:     { icon: <I.search />,  label: 'DOM',      desc: 'CSS selector — or pick from page' },
  regex:   { icon: <RegexIcon />, label: 'Regex',    desc: 'Capture group from an email field' },
  literal: { icon: <I.edit />,    label: 'Literal',  desc: 'Fixed string' },
};

/* Built-in variable paths offered per template type. order/case resolve via
   the smart detectors; account pulls from the page's contact/account fields
   (see smartPageVariables in content/smart-detection.js). Exported so the
   inline variable form can reuse the same option lists. */
export const BUILTIN_PATHS = {
  order: [
    { id: 'email',                   label: 'Customer email' },
    { id: 'order_number',            label: 'Order number' },
    { id: 'payment_link',            label: 'Payment link' },
    { id: 'oos_item',                label: 'Out-of-stock item(s)' },
    { id: 'recommended_replacement', label: 'Recommended replacement' },
  ],
  case: [
    { id: 'email',        label: 'Sender email' },
    { id: 'order_number', label: 'Order number' },
    { id: 'payment_link', label: 'Payment link' },
  ],
  account: [
    { id: 'firstName',      label: 'First name',           group: 'Contact' },
    { id: 'lastName',       label: 'Last name',            group: 'Contact' },
    { id: 'middleInit',     label: 'Middle initial',       group: 'Contact' },
    { id: 'fullName',       label: 'Full name',            group: 'Contact' },
    { id: 'jobTitle',       label: 'Job title',            group: 'Contact' },
    { id: 'contactEmail',   label: 'Contact email',        group: 'Contact' },
    { id: 'phoneNumber',    label: 'Phone number',         group: 'Contact' },
    { id: 'zipCode',        label: 'Zip code',             group: 'Contact' },
    { id: 'contactId',      label: 'Contact ID',           group: 'Contact' },
    { id: 'linkedIn',       label: 'LinkedIn URL',         group: 'Contact' },
    { id: 'companyName',    label: 'Company name',         group: 'Account' },
    { id: 'accountName',    label: 'Account name',         group: 'Account' },
    { id: 'accountId',      label: 'Account ID',           group: 'Account' },
    { id: 'webAddress',     label: 'Web address',          group: 'Account' },
    { id: 'mainAddress',    label: 'Address',              group: 'Account' },
    { id: 'mainCity',       label: 'City',                 group: 'Account' },
    { id: 'mainState',      label: 'State',                group: 'Account' },
    { id: 'mainZip',        label: 'Postal code',          group: 'Account' },
    { id: 'mainCountry',    label: 'Country',              group: 'Account' },
    { id: 'salesRep',       label: 'Sales rep',            group: 'Account' },
    { id: 'userType',       label: 'User type',            group: 'Account' },
    { id: 'createdBy',      label: 'Created by',           group: 'Account' },
    { id: 'creditApproved', label: 'Credit approved date', group: 'Account' },
    { id: 'creditReqs',     label: 'Credit requirements',  group: 'Account' },
    { id: 'orderCount',     label: 'Order count',          group: 'Stats' },
    { id: 'totalRevenue',   label: 'Total revenue',        group: 'Stats' },
    { id: 'ytdRevenue',     label: 'YTD revenue',          group: 'Stats' },
    { id: 'priorYearRev',   label: 'Prior-year revenue',   group: 'Stats' },
    { id: 'avgOrderSize',   label: 'Avg order size',       group: 'Stats' },
    { id: 'lastOrderDate',  label: 'Last order date',      group: 'Stats' },
    { id: 'creationDate',   label: 'Creation date',        group: 'Stats' },
    { id: 'nextTaskName',   label: 'Next task',            group: 'Tasks' },
    { id: 'nextTaskDue',    label: 'Next task due',        group: 'Tasks' },
  ],
};

/* Inbound-email field a regex runs against. */
export const REGEX_FIELDS = [
  { id: 'body',    label: 'Email body' },
  { id: 'subject', label: 'Subject line' },
  { id: 'from',    label: 'From address' },
];

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
    <CompactModal size={560} onClose={onClose}>
      <ModalHeader
        icon={<I.plus />}
        title="New variable"
        subtitle="Resolves against the active page"
        onClose={onClose}
      />

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
              onChange={(id) => { setKind(id); setConfig(''); setPicking(false); setHoverText(''); }}
            />
          </div>

          {/* Kind-specific config */}
          {kind === 'builtin' && (
            <Field label="Built-in path" hint="Pre-defined value resolved from the page context">
              <Dropdown
                value={config}
                placeholder="Select a field…"
                leading={<I.bolt />}
                searchable
                options={BUILTIN_PATHS[typeId] || BUILTIN_PATHS.order}
                onChange={setConfig}
              />
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
                  <Dropdown value={regexField} options={REGEX_FIELDS} onChange={setRegexField} />
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
                  <I.bolt size={9} />
                </span>
              </span>
              {' → '}
              <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-tertiary)' }}>
                {previewResolved}
              </span>
            </div>
          </div>
        </div>

        <ModalFooter>
          <div style={{ flex: 1, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>
            Smart options can be set after creating.
          </div>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn
            variant="primary"
            icon={<I.plus />}
            disabled={!canAdd}
            onClick={() => onAdd?.({
              name, kind, config,
              ...(kind === 'regex' ? { source: regexField } : {}),
            })}
          >
            Add variable
          </Btn>
        </ModalFooter>
    </CompactModal>
  );
}
