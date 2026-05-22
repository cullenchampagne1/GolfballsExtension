import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  Btn, IconBtn, Tag, Dot,
  Input, Dropdown, Field,
  SwitchTag, Callout, SectionLabel, Card,
  I, Icon,
  // Template-editor components
  BodyVar, SmartModal, AddVariableModal, VariableTable, SOURCE_KINDS,
  OrderRules, CaseRules, AccountRules,
} from '../ui/index.js';

/* ────────────────────────────────────────────────────────────────
   Extra icons for the RTE toolbar (not in the base icon set)
──────────────────────────────────────────────────────────────── */
const RTE = {
  bold:      (p) => <Icon {...p}><path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z"/><path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z"/></Icon>,
  italic:    (p) => <Icon {...p}><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></Icon>,
  underline: (p) => <Icon {...p}><path d="M6 3v7a6 6 0 0012 0V3"/><line x1="4" y1="21" x2="20" y2="21"/></Icon>,
  strike:    (p) => <Icon {...p}><path d="M16 4H9a3 3 0 00-2.83 4M14 12a4 4 0 010 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></Icon>,
  text:      (p) => <Icon {...p}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></Icon>,
  paint:     (p) => <Icon {...p}><path d="M19 7v4H5V7"/><rect x="3" y="11" width="18" height="10" rx="2"/></Icon>,
  listNum:   (p) => <Icon {...p}><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></Icon>,
  fontSize:  (p) => <Icon {...p}><polyline points="4 7 4 4 20 4 20 7"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="9" y1="20" x2="15" y2="20"/></Icon>,
  alignL:    (p) => <Icon {...p}><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></Icon>,
  alignC:    (p) => <Icon {...p}><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/></Icon>,
  alignR:    (p) => <Icon {...p}><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></Icon>,
  list:      (p) => <Icon {...p}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></Icon>,
  link:      (p) => <Icon {...p}><path d="M10 13a5 5 0 007 0l4-4a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-4 4a5 5 0 007 7l1-1"/></Icon>,
  bolt:      (p) => <Icon {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></Icon>,
  doc:       (p) => <Icon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></Icon>,
  inbox:     (p) => <Icon {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></Icon>,
  variable:  (p) => <Icon {...p}><path d="M5 4 a14 14 0 000 16M19 4a14 14 0 010 16"/><path d="M9 9l6 6M9 15l6-6"/></Icon>,
};

/* ────────────────────────────────────────────────────────────────
   Sample variable data per type (used until chrome.storage is wired)
──────────────────────────────────────────────────────────────── */
const initialVars = {
  order: [
    { name: 'customer_name', kind: 'builtin', config: 'order.contact.fullName',  resolved: 'Marcus Chen',       status: 'ok',   smart: {} },
    { name: 'order_number',  kind: 'builtin', config: 'order.id',                resolved: 'ORD-29481',         status: 'ok',   smart: {} },
    { name: 'total',         kind: 'dom',     config: '.order-total .amount',    resolved: '$1,247.50',         status: 'ok',   smart: { fallback: '$0.00' } },
    { name: 'rep_name',      kind: 'pick',    config: '#main h2',               resolved: 'Jamie Lewis',       status: 'ok',   smart: { transform: 'titleCase' } },
    { name: 'tracking',      kind: 'dom',     config: '.shipment .tracking',    resolved: null,                status: 'miss', smart: { fallback: 'pending', conditional: true } },
  ],
  case: [
    { name: 'sender_name',  kind: 'builtin', config: 'email.from.displayName',              resolved: 'Sarah Patel',            status: 'ok',   smart: {} },
    { name: 'order_ref',    kind: 'regex',   config: 'body · /order\\s+(ORD-\\d+)/i',        resolved: 'ORD-28104',              status: 'ok',   smart: { fallback: 'unknown' } },
    { name: 'damage_desc',  kind: 'regex',   config: 'body · /damaged?:?\\s+(.+?)\\./i',     resolved: '18 inner boxes crushed', status: 'ok',   smart: { transform: 'lower' } },
    { name: 'event_date',   kind: 'regex',   config: 'body · /event[:\\s]+(\\w+\\s+\\d+)/i', resolved: null,                    status: 'miss', smart: {} },
  ],
  account: [
    { name: 'contact_name', kind: 'builtin', config: 'solr.fullName',           resolved: 'Marcus Chen',         status: 'ok', smart: {} },
    { name: 'company',      kind: 'builtin', config: 'solr.companyName',        resolved: 'Acme Industries',     status: 'ok', smart: {} },
    { name: 'days_since',   kind: 'builtin', config: 'solr.daysSinceLastOrder', resolved: '142',                 status: 'ok', smart: {} },
    { name: 'last_product', kind: 'builtin', config: 'solr.lastProduct',        resolved: 'Pro V1 Custom Print', status: 'ok', smart: { fallback: 'our balls' } },
  ],
};

/* ────────────────────────────────────────────────────────────────
   Type config — subject + body renderers per template type
──────────────────────────────────────────────────────────────── */
const TYPES = {
  order: {
    label: 'Order', icon: <RTE.doc />,
    desc: 'Shown in the popup on order pages. Matches against the live page DOM.',
    callout: { tone: 'info', title: 'Smart triggers', body: <>Activates when rules pass on an order page. Variables resolve live from the page.</> },
    recipientOptions: ['Smart detect', 'Pick from page', 'Fixed email'],
    subject: (vars, onOpen) => <>Issue with your order <BodyVar v={vars.find(v => v.name === 'order_number')} onOpenSmart={onOpen} /></>,
    body: (vars, onOpen) => {
      const v = (n) => vars.find(x => x.name === n);
      return (
        <>
          <p style={{ margin: '0 0 12px' }}>Hi <BodyVar v={v('customer_name')} onOpenSmart={onOpen} />,</p>
          <p style={{ margin: '0 0 12px' }}>
            We weren't able to process the payment for order{' '}
            <BodyVar v={v('order_number')} onOpenSmart={onOpen} /> totaling{' '}
            <BodyVar v={v('total')} onOpenSmart={onOpen} />.{' '}
            <strong style={{ color: 'var(--gb-text-primary)' }}>Your order is on hold</strong> until this is resolved.
          </p>
          <p style={{ margin: '0 0 12px' }}>Tracking: <BodyVar v={v('tracking')} onOpenSmart={onOpen} />.</p>
          <p style={{ margin: '14px 0 0' }}>Thanks,<br /><BodyVar v={v('rep_name')} onOpenSmart={onOpen} /></p>
        </>
      );
    },
  },
  case: {
    label: 'Case', icon: <RTE.inbox />,
    desc: 'Shown in the case email modal. Matches From / Subject / Body of the inbound email.',
    callout: { tone: 'brand', title: 'Case reply template', body: <>Match rules and variables both run against the inbound email.</> },
    recipientOptions: ['Reply to sender', 'Pick from case', 'Fixed email'],
    subject: (vars, onOpen) => <>RE: <BodyVar v={vars.find(v => v.name === 'order_ref')} onOpenSmart={onOpen} /> — replacement on the way</>,
    body: (vars, onOpen) => {
      const v = (n) => vars.find(x => x.name === n);
      return (
        <>
          <p style={{ margin: '0 0 12px' }}>Hi <BodyVar v={v('sender_name')} onOpenSmart={onOpen} />,</p>
          <p style={{ margin: '0 0 12px' }}>Sorry to hear about the damage to order <BodyVar v={v('order_ref')} onOpenSmart={onOpen} />.</p>
          <p style={{ margin: '0 0 12px' }}>Issue noted: <em><BodyVar v={v('damage_desc')} onOpenSmart={onOpen} /></em>. Event date: <BodyVar v={v('event_date')} onOpenSmart={onOpen} />.</p>
        </>
      );
    },
  },
  account: {
    label: 'Account', icon: <RTE.variable />,
    desc: 'Shown in the popup on account/contact pages. Matches the contact\'s Solr record.',
    callout: { tone: 'info', title: 'Account conditions', body: <>Variables pull from the contact's live Solr record.</> },
    recipientOptions: ['Contact email', 'Account email', 'Fixed email'],
    subject: (vars, onOpen) => <>Time to top up on <BodyVar v={vars.find(v => v.name === 'last_product')} onOpenSmart={onOpen} />?</>,
    body: (vars, onOpen) => {
      const v = (n) => vars.find(x => x.name === n);
      return (
        <>
          <p style={{ margin: '0 0 12px' }}>Hi <BodyVar v={v('contact_name')} onOpenSmart={onOpen} />,</p>
          <p style={{ margin: '0 0 12px' }}>
            It's been <BodyVar v={v('days_since')} onOpenSmart={onOpen} /> days since{' '}
            <BodyVar v={v('company')} onOpenSmart={onOpen} />'s last order. Top up on{' '}
            <BodyVar v={v('last_product')} onOpenSmart={onOpen} />?
          </p>
        </>
      );
    },
  },
};

/* ────────────────────────────────────────────────────────────────
   Toolbar button + separator
──────────────────────────────────────────────────────────────── */
function TBtn({ icon, label, active, onClick, mono }) {
  return (
    <button onClick={onClick} style={{
      height: 28, padding: '0 7px', borderRadius: 5,
      background: active ? 'var(--gb-brand-tint-medium)' : 'transparent',
      color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
      border: 'none', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontFamily: mono ? 'var(--gb-font-mono)' : 'inherit',
      fontSize: 11, fontWeight: 600,
    }}>
      {icon && React.cloneElement(icon, { size: 13 })}
      {label && <span>{label}</span>}
    </button>
  );
}

const Sep = () => (
  <div style={{ width: 1, height: 18, background: 'var(--gb-border-subtle)', margin: '0 4px' }} />
);

/* ────────────────────────────────────────────────────────────────
   EditorPane — RTE toolbar + body surface
──────────────────────────────────────────────────────────────── */
function EditorPane({ body, align, setAlign, marks, setMarks }) {
  const toggle = (k) => setMarks(m => ({ ...m, [k]: !m[k] }));

  return (
    <div style={{
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-lg)',
      overflow: 'hidden',
      background: 'var(--gb-surface-canvas)',
      boxShadow: 'var(--gb-shadow-popover)',
    }}>
      {/* Toolbar */}
      <div style={{
        padding: '7px 10px',
        background: 'var(--gb-surface-modal)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        display: 'flex', alignItems: 'center', flexWrap: 'wrap',
      }}>
        <TBtn label="Paragraph" />
        <TBtn label="Geist" mono />
        <TBtn label="13px" mono icon={<RTE.fontSize />} />
        <Sep />
        <TBtn icon={<RTE.bold />}      active={marks.bold}      onClick={() => toggle('bold')} />
        <TBtn icon={<RTE.italic />}    active={marks.italic}    onClick={() => toggle('italic')} />
        <TBtn icon={<RTE.underline />} active={marks.underline} onClick={() => toggle('underline')} />
        <TBtn icon={<RTE.strike />}    active={marks.strike}    onClick={() => toggle('strike')} />
        <Sep />
        {/* Text color */}
        <button title="Text color" style={{ height: 28, padding: '0 6px', borderRadius: 5, background: 'transparent', color: 'var(--gb-text-tertiary)', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <RTE.text size={13} />
            <span style={{ position: 'absolute', bottom: -2, left: 0, right: 0, height: 3, background: 'var(--gb-brand-label)', borderRadius: 1 }} />
          </span>
          <I.chevd size={9} style={{ opacity: .6 }} />
        </button>
        {/* Highlight */}
        <button title="Highlight" style={{ height: 28, padding: '0 6px', borderRadius: 5, background: 'transparent', color: 'var(--gb-text-tertiary)', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <RTE.paint size={13} />
          <I.chevd size={9} style={{ opacity: .6 }} />
        </button>
        <Sep />
        {/* Alignment segmented */}
        <div style={{ display: 'inline-flex', padding: 1, borderRadius: 5, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>
          {[
            { id: 'left',   icon: <RTE.alignL /> },
            { id: 'center', icon: <RTE.alignC /> },
            { id: 'right',  icon: <RTE.alignR /> },
          ].map(o => (
            <button key={o.id} onClick={() => setAlign(o.id)} style={{
              width: 24, height: 22, borderRadius: 3,
              background: align === o.id ? 'var(--gb-brand-tint-medium)' : 'transparent',
              color:      align === o.id ? 'var(--gb-brand-label)'      : 'var(--gb-text-muted)',
              border: 'none', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {React.cloneElement(o.icon, { size: 11 })}
            </button>
          ))}
        </div>
        <Sep />
        <TBtn icon={<RTE.list />} />
        <TBtn icon={<RTE.listNum />} />
        <TBtn icon={<RTE.link />} />
        <div style={{ flex: 1 }} />
        <Tag tone="warning" size="xs" icon={<RTE.bolt />}>Smart opts</Tag>
      </div>

      {/* Body surface */}
      <div style={{
        padding: '24px 32px 32px',
        background: 'var(--gb-surface-canvas)',
        color: 'var(--gb-text-secondary)',
        fontSize: 13, lineHeight: 1.7,
        textAlign: align,
        minHeight: 240,
      }}>
        {body}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   Root TemplateEditor page
──────────────────────────────────────────────────────────────── */
export function TemplateEditor({ onBack }) {
  const [typeId, setTypeId] = useState('case');
  const t = TYPES[typeId];

  const [align,   setAlign]   = useState('left');
  const [marks,   setMarks]   = useState({ bold: false, italic: false, underline: false, strike: false });
  const [enabled, setEnabled] = useState(true);
  const [smartFor, setSmartFor] = useState(null);
  const [showAdd,  setShowAdd]  = useState(false);
  const [allVars,  setAllVars]  = useState(initialVars);

  const vars = allVars[typeId];

  const handleSaveSmart = (smart) => {
    setAllVars(s => ({
      ...s,
      [typeId]: s[typeId].map(v => v.name === smartFor.name ? { ...v, smart } : v),
    }));
    setSmartFor(null);
  };

  const handleAddVar = ({ name, kind, config }) => {
    setAllVars(s => ({
      ...s,
      [typeId]: [...s[typeId], { name, kind, config, resolved: null, status: 'miss', smart: {} }],
    }));
    setShowAdd(false);
  };

  const handleDeleteVar = (name) => {
    setAllVars(s => ({
      ...s,
      [typeId]: s[typeId].filter(v => v.name !== name),
    }));
  };

  const RulesComponent = typeId === 'order' ? OrderRules
    : typeId === 'case'    ? CaseRules
    : AccountRules;

  return (
    <div style={{ minHeight: '100%', background: 'var(--gb-surface-canvas)', padding: '24px 24px 60px' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>

        {/* ── Page header ──────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          {onBack && (
            <Btn variant="ghost" size="sm"
              icon={<I.chevr style={{ transform: 'scaleX(-1)' }} />}
              onClick={onBack}>
              Back
            </Btn>
          )}
          <div style={{
            width: 36, height: 36, borderRadius: 'var(--gb-r-md)',
            background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)',
            color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {React.cloneElement(t.icon, { size: 16 })}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -.3 }}>
                Email Templates
              </h1>
              <Tag tone="neutral" size="sm" mono>{t.label.toUpperCase()}</Tag>
              <SwitchTag on={enabled} label={enabled ? 'Enabled' : 'Disabled'} onClick={() => setEnabled(e => !e)} size="md" />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', marginTop: 3 }}>{t.desc}</div>
          </div>
          <Btn variant="ghost"  icon={<I.eye />}>Preview</Btn>
          <Btn variant="danger" icon={<I.trash />}>Delete</Btn>
          <Btn variant="primary" icon={<I.check />}>Save</Btn>
        </div>

        {/* ── Type switcher ────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 4, padding: 3,
          background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-md)', marginBottom: 18, width: 'fit-content',
        }}>
          {Object.entries(TYPES).map(([id, info]) => (
            <button key={id} onClick={() => setTypeId(id)} style={{
              padding: '7px 14px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
              background: typeId === id ? 'var(--gb-brand-tint-medium)' : 'transparent',
              color:      typeId === id ? 'var(--gb-brand-label)'       : 'var(--gb-text-tertiary)',
              border: 'none', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {React.cloneElement(info.icon, { size: 12 })}
              {info.label}
            </button>
          ))}
        </div>

        {/* ── Type callout ─────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <Callout tone={t.callout.tone} title={t.callout.title} icon={<RTE.bolt />}>
            {t.callout.body}
          </Callout>
        </div>

        {/* ── Meta row ─────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 16 }}>
          <Field label="Template name">
            <Input value={`${t.label} Template — Draft`} />
          </Field>
          <Field label="Recipient (to)">
            <Dropdown value={t.recipientOptions[0]} />
          </Field>
        </div>

        {/* ── Rules ────────────────────────────────────────── */}
        <div style={{ marginBottom: 18 }}>
          <RulesComponent />
        </div>

        {/* ── Subject ──────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Subject</SectionLabel>
          <div style={{
            padding: '9px 12px',
            background: 'var(--gb-fill-inverse-medium)',
            border: '1px solid var(--gb-border-default)',
            borderRadius: 'var(--gb-r-md)',
            fontSize: 13, color: 'var(--gb-text-primary)', fontWeight: 600,
          }}>
            {t.subject(vars, setSmartFor)}
          </div>
        </div>

        {/* ── Body editor ──────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Email body</SectionLabel>
          <EditorPane
            body={t.body(vars, setSmartFor)}
            align={align} setAlign={setAlign}
            marks={marks} setMarks={setMarks}
          />
        </div>

        {/* ── Variable table ───────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <VariableTable
            typeId={typeId}
            vars={vars}
            onAdd={() => setShowAdd(true)}
            onDelete={handleDeleteVar}
          />
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────── */}
      <AnimatePresence>
        {smartFor && (
          <SmartModal
            key="smart"
            variable={smartFor}
            onClose={() => setSmartFor(null)}
            onSave={handleSaveSmart}
          />
        )}
        {showAdd && (
          <AddVariableModal
            key="add"
            typeId={typeId}
            onClose={() => setShowAdd(false)}
            onAdd={handleAddVar}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
