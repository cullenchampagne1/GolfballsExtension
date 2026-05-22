import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'motion/react';
import '../src/ui/theme.css';
import {
  I, Btn, IconBtn, Tag, Chip, Dot, NumberDisplay, Input, Textarea, Dropdown, ColorField, Field,
  Switch, PillTag, Checkbox, Slider, RangeSlider, SwitchTag, Callout,
  ModalShell, ModalHeader, ModalFooter, SectionLabel, Card, KeyVal,
} from '../src/ui/index.js';
import { MarginCalc } from '../src/modals/MarginCalc.jsx';
import { SettingsPanel } from '../src/pages/SettingsPanel.jsx';

/* Component-library showcase. Mirrors the handoff's Design System
   reference page, built with the production src/ui components.
   Everything here is live — click, type, drag. Run: `npm run dev`. */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = () => sleep(1300).then(() => Promise.reject(new Error('failed')));

/* ── layout helpers (ported from the reference page) ───────────── */
function H1({ children, sub }) {
  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: -0.5, color: 'var(--gb-text-primary)' }}>{children}</h1>
      {sub && <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--gb-text-muted)', maxWidth: 720, lineHeight: 1.55 }}>{sub}</p>}
    </div>
  );
}
function H2({ children, sub, num }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        {num && <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 12, color: 'var(--gb-text-ghost)' }}>{num}</span>}
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: -0.3, color: 'var(--gb-text-primary)' }}>{children}</h2>
      </div>
      {sub && <p style={{ margin: '4px 0 0 36px', fontSize: 12, color: 'var(--gb-text-muted)', maxWidth: 740, lineHeight: 1.5 }}>{sub}</p>}
    </div>
  );
}
function Block({ children, style }) {
  return (
    <div style={{
      padding: 22, background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)',
      ...style,
    }}>{children}</div>
  );
}
function Mono({ children }) {
  return (
    <code style={{
      fontFamily: 'var(--gb-font-mono)', fontSize: 11, color: 'var(--gb-brand-label)',
      background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)',
      padding: '1px 6px', borderRadius: 4,
    }}>{children}</code>
  );
}
function Row({ children, gap = 8, align = 'center', style }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: align, gap, ...style }}>{children}</div>;
}
function Col({ children, gap = 8, style }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>;
}
function Label({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 10 }}>
      {children}
    </div>
  );
}
function Hr() {
  return <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '20px 0' }} />;
}
function Caption({ children }) {
  return <span style={{ width: 70, flexShrink: 0, fontSize: 10.5, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>{children}</span>;
}

const DD_OPTIONS = [
  { id: 'visa', label: 'Visa ····4242', group: 'Cards' },
  { id: 'mc', label: 'Mastercard ····5512', group: 'Cards' },
  { id: 'amex', label: 'Amex ····0071', group: 'Cards' },
  { id: 'ach', label: 'ACH bank transfer', group: 'Bank' },
  { id: 'wire', label: 'Wire — unavailable', group: 'Bank', disabled: true },
];

const TONES = ['neutral', 'brand', 'error', 'warning', 'success', 'info'];

function Demo() {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('1,247.50');
  const [note, setNote] = useState('One-color print, white on black.');
  const [method, setMethod] = useState('visa');
  const [showErr, setShowErr] = useState(false);

  const [sw, setSw] = useState({ a: true, b: false });
  const [orderType, setOrderType] = useState('live');
  const [flags, setFlags] = useState({ rush: true, canada: false, dropship: false });
  const [features, setFeatures] = useState({ charge: true, edit: true, proof: false, watch: true, dev: true });
  const [picks, setPicks] = useState({ a: true, b: true, c: false, d: false });

  const [delay, setDelay] = useState(60);
  const [margin, setMargin] = useState(34);
  const [throttle, setThrottle] = useState(75);
  const [orderRange, setOrderRange] = useState([500, 5000]);
  const [sendWindow, setSendWindow] = useState([9, 17]);

  const [modalOpen, setModalOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [demoNum, setDemoNum] = useState(1234.5);
  const [color, setColor] = useState('#8fce2e');

  const pickVals = Object.values(picks);
  const allPicked = pickVals.every(Boolean);
  const somePicked = pickVals.some(Boolean);

  return (
    <div style={{ minHeight: '100vh', padding: '40px 28px 120px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 36 }}>

        {/* HERO */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)',
            color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, fontFamily: 'var(--gb-font-mono)',
          }}>gb</div>
          <H1 sub="Every primitive from the handoff spec, built with inline styles + Motion and only --gb-* tokens. Everything below is live — click, type, drag.">
            Component Library
          </H1>
        </div>

        {/* 01 · BUTTON */}
        <div>
          <H2 num="01" sub="One Btn — six variants × four sizes. An onClick that returns a Promise drives the loading → success/error states on its own.">Button</H2>
          <Block style={{ marginTop: 16 }}>
            <Label>Variants</Label>
            <Row>
              <Btn variant="primary" icon={<I.send />}>Primary</Btn>
              <Btn variant="secondary" icon={<I.card />}>Secondary</Btn>
              <Btn variant="tinted" icon={<I.bolt />}>Tinted · brand</Btn>
              <Btn variant="tinted" status="error" icon={<I.alert />}>Tinted · error</Btn>
              <Btn variant="tinted" status="warning" icon={<I.eye />}>Tinted · warn</Btn>
              <Btn variant="ghost" icon={<I.cog />}>Ghost</Btn>
              <Btn variant="danger" icon={<I.trash />}>Danger</Btn>
              <Btn variant="dashed" icon={<I.plus />}>Dashed</Btn>
            </Row>
            <Hr />
            <Label>Sizes</Label>
            <Row>
              <Btn variant="primary" size="xs" icon={<I.send />}>xs · 22</Btn>
              <Btn variant="primary" size="sm" icon={<I.send />}>sm · 26</Btn>
              <Btn variant="primary" size="md" icon={<I.send />}>md · 32</Btn>
              <Btn variant="primary" size="lg" icon={<I.send />}>lg · 38</Btn>
            </Row>
            <Hr />
            <Label>States — click the async pair to watch the transition</Label>
            <Row>
              <Btn variant="primary" icon={<I.send />}>Idle</Btn>
              <Btn variant="primary" icon={<I.send />} disabled>Disabled</Btn>
              <Btn variant="primary" state="loading">Loading</Btn>
              <Btn variant="tinted" state="success">Success</Btn>
              <Btn variant="tinted" status="error" state="error">Error</Btn>
              <Btn variant="primary" icon={<I.check />} onClick={() => sleep(1300)}>Async · succeeds</Btn>
              <Btn variant="secondary" icon={<I.check />} onClick={fail}>Async · fails</Btn>
            </Row>
          </Block>
        </div>

        {/* 02 · ICON BUTTON */}
        <div>
          <H2 num="02" sub="Square, icon-only. Modal close, row actions, toolbars. Same async states as Btn, plus a hover tooltip.">Icon button</H2>
          <Block style={{ marginTop: 16 }}>
            <Label>Sizes · 22 / 26 / 32 / 38</Label>
            <Row gap={10}>
              <IconBtn size="xs" icon={<I.close />} />
              <IconBtn size="sm" icon={<I.close />} />
              <IconBtn size="md" icon={<I.close />} />
              <IconBtn size="lg" icon={<I.close />} />
            </Row>
            <Hr />
            <Label>Variants & states — hover for tooltips</Label>
            <Row gap={10}>
              <IconBtn icon={<I.cog />} tooltip="Settings" />
              <IconBtn icon={<I.edit />} variant="ghost" tooltip="Edit" />
              <IconBtn icon={<I.filter />} active tooltip="Filter on" />
              <IconBtn icon={<I.trash />} danger tooltip="Delete" />
              <IconBtn icon={<I.copy />} tooltip="Copy (async)" onClick={() => sleep(1200)} />
              <IconBtn icon={<I.more />} disabled />
            </Row>
          </Block>
        </div>

        {/* 03 · TAGS / CHIPS / DOTS */}
        <div>
          <H2 num="03" sub="Small display primitives. Tags are uppercase status badges. Chips are mixed-case. Dots are match indicators. NumberDisplay tweens on change.">Tags, chips, dots, numbers</H2>
          <Block style={{ marginTop: 16 }}>
            <Label>Tag · 6 tones × 4 sizes</Label>
            <Col gap={6}>
              {TONES.map((tone) => (
                <Row key={tone} gap={6}>
                  <Caption>{tone}</Caption>
                  <Tag tone={tone} size="xs">xs</Tag>
                  <Tag tone={tone} size="sm">small</Tag>
                  <Tag tone={tone} size="md">medium</Tag>
                  <Tag tone={tone} size="lg">large</Tag>
                  <Tag tone={tone} size="sm" mono>MONO</Tag>
                </Row>
              ))}
              <Row gap={6}>
                <Caption>extras</Caption>
                <Tag tone="brand" pulse icon={<I.bolt />}>Live · pulse</Tag>
                <Tag tone="neutral" mono onRemove={() => {}}>ORD-29481</Tag>
                <Tag tone="success" icon={<I.check />}>With icon</Tag>
              </Row>
            </Col>
            <Hr />
            <Label>Chip · variables & filter conditions</Label>
            <Row gap={5}>
              <Chip code>{'{{order_number}}'}</Chip>
              <Chip code>{'{{customer_name}}'}</Chip>
              <Chip code onRemove={() => {}}>{'{{rep_name}}'}</Chip>
              <Chip tone="neutral">type = Contact</Chip>
              <Chip tone="neutral" onRemove={() => {}}>state = CA</Chip>
            </Row>
            <Hr />
            <Label>Dot · match indicator</Label>
            <Row gap={16}>
              <Row gap={6}><Dot tone="brand" glow pulse /> matched · live</Row>
              <Row gap={6}><Dot tone="brand" /> matched</Row>
              <Row gap={6}><Dot tone="muted" /> unmatched</Row>
              <Row gap={6}><Dot tone="error" glow /> critical</Row>
              <Row gap={6}><Dot tone="warning" /> pending</Row>
              <Row gap={6}><Dot tone="success" glow size={10} /> 10px</Row>
            </Row>
            <Hr />
            <Label>Number display · counts up / down when the value changes</Label>
            <Row gap={18}>
              <NumberDisplay value={demoNum} prefix="$" decimals={2}
                style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)' }} />
              <Btn size="sm" icon={<I.bolt />} onClick={() => setDemoNum(Math.round(Math.random() * 800000) / 100)}>
                Randomize
              </Btn>
              <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>click to watch it roll</span>
            </Row>
          </Block>
        </div>

        {/* 04 · FORM CONTROLS */}
        <div>
          <H2 num="04" sub="Input · Textarea · Dropdown share one recessed shell. Field wraps any of them with a label, hint, and an error that slides in.">Form controls</H2>
          <Block style={{ marginTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <Field label="Email" required hint="We'll send a verification link.">
                <Input placeholder="name@example.com" value={email} onChange={setEmail} leading={<I.mail size={13} />} />
              </Field>
              <Field label="Amount" error={showErr ? 'Enter a valid dollar amount.' : undefined}>
                <Input value={amount} onChange={setAmount} mono error={showErr}
                  leading={<span style={{ color: 'var(--gb-brand-label)', fontWeight: 800 }}>$</span>} />
              </Field>
              <Field label="Payment method">
                <Dropdown options={DD_OPTIONS} value={method} onChange={setMethod} searchable leading={<I.card size={13} />} />
              </Field>
              <Field label="Empty dropdown">
                <Dropdown options={DD_OPTIONS} placeholder="Select method…" />
              </Field>
              <Field label="Disabled">
                <Input value="locked field" disabled />
              </Field>
              <Field label="Size · sm / md / lg">
                <Col gap={6}>
                  <Input size="sm" placeholder="small" />
                  <Input size="lg" placeholder="large" />
                </Col>
              </Field>
              <Field label="Brand color" hint="Swatch opens the native picker.">
                <ColorField value={color} onChange={setColor} />
              </Field>
            </div>
            <div style={{ marginTop: 14 }}>
              <Field label="Internal note (textarea)">
                <Textarea rows={3} value={note} onChange={setNote} />
              </Field>
            </div>
            <div style={{ marginTop: 10 }}>
              <Btn size="sm" variant="ghost" onClick={() => setShowErr((v) => !v)}>
                Toggle error state →
              </Btn>
            </div>
          </Block>
        </div>

        {/* 05 · TOGGLES & SELECTION */}
        <div>
          <H2 num="05" sub="Switch is for on/off. Checkbox is for list selection (with indeterminate). PillTag is exclusive/toggle selection. SwitchTag packs a label + switch into one chip.">Toggles & selection</H2>
          <Block style={{ marginTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
              <div>
                <Label>Switch</Label>
                <Col gap={10}>
                  <Row gap={14}>
                    <Switch on={sw.a} size="sm" onChange={(n) => setSw((s) => ({ ...s, a: n }))} />
                    <Switch on={sw.a} size="md" onChange={(n) => setSw((s) => ({ ...s, a: n }))} />
                    <Switch on={sw.a} size="lg" onChange={(n) => setSw((s) => ({ ...s, a: n }))} />
                    <Caption>sm/md/lg</Caption>
                  </Row>
                  <Row gap={14}>
                    <Switch on={sw.b} tone="warning" onChange={(n) => setSw((s) => ({ ...s, b: n }))} />
                    <Switch on={false} disabled />
                    <Caption>warn · disabled</Caption>
                  </Row>
                </Col>
                <div style={{ height: 16 }} />
                <Label>Checkbox</Label>
                <Row gap={16}>
                  <Checkbox checked size="sm" onChange={() => {}} />
                  <Checkbox checked size="md" onChange={() => {}} />
                  <Checkbox checked size="lg" onChange={() => {}} />
                  <Checkbox checked tone="error" label="error tone" onChange={() => {}} />
                </Row>
                <div style={{ marginTop: 10, padding: 12, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)', borderRadius: 8 }}>
                  <Checkbox
                    checked={allPicked}
                    indeterminate={somePicked && !allPicked}
                    label="Select all"
                    hint={`${pickVals.filter(Boolean).length} of 4 selected`}
                    onChange={(n) => setPicks({ a: n, b: n, c: n, d: n })}
                  />
                  <div style={{ marginLeft: 26, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Checkbox checked={picks.a} label="Charge Error Follow-Up" onChange={(n) => setPicks((p) => ({ ...p, a: n }))} />
                    <Checkbox checked={picks.b} label="Shipping Delay Notice" onChange={(n) => setPicks((p) => ({ ...p, b: n }))} />
                    <Checkbox checked={picks.c} label="Proof Approval Request" onChange={(n) => setPicks((p) => ({ ...p, c: n }))} />
                    <Checkbox checked={picks.d} disabled label="Net-30 Reminder" hint="disabled — missing body" onChange={() => {}} />
                  </div>
                </div>
              </div>

              <div>
                <Label>PillTag · exclusive (order type)</Label>
                <Row gap={5}>
                  {[['live', 'Live Order'], ['sample', 'Sample'], ['quote', 'Quote'], ['reorder', 'Reorder']].map(([id, lbl]) => (
                    <PillTag key={id} on={orderType === id} onClick={() => setOrderType(id)}>{lbl}</PillTag>
                  ))}
                </Row>
                <div style={{ height: 14 }} />
                <Label>PillTag · independent toggles</Label>
                <Row gap={5}>
                  <PillTag on={flags.rush} icon={<I.bolt />} onClick={() => setFlags((f) => ({ ...f, rush: !f.rush }))}>Rush</PillTag>
                  <PillTag on={flags.canada} icon={<I.eye />} onClick={() => setFlags((f) => ({ ...f, canada: !f.canada }))}>Canada Drop</PillTag>
                  <PillTag on={flags.dropship} icon={<I.send />} onClick={() => setFlags((f) => ({ ...f, dropship: !f.dropship }))}>Drop Ship</PillTag>
                </Row>
                <div style={{ height: 14 }} />
                <Label>SwitchTag · label + state in one</Label>
                <Row gap={5}>
                  <SwitchTag size="sm" on label="Small" />
                  <SwitchTag size="md" on label="Medium" />
                  <SwitchTag size="lg" on label="Large" />
                </Row>
                <div style={{ height: 8 }} />
                <Row gap={5}>
                  <SwitchTag on={features.charge} label="Charge Card" icon={<I.card />} onClick={() => setFeatures((f) => ({ ...f, charge: !f.charge }))} />
                  <SwitchTag on={features.edit} label="Order Edit" icon={<I.edit />} onClick={() => setFeatures((f) => ({ ...f, edit: !f.edit }))} />
                  <SwitchTag on={features.proof} label="Submit Proof" onClick={() => setFeatures((f) => ({ ...f, proof: !f.proof }))} />
                  <SwitchTag on={features.watch} label="Watchlist" icon={<I.eye />} onClick={() => setFeatures((f) => ({ ...f, watch: !f.watch }))} />
                  <SwitchTag on={features.dev} tone="warning" label="Dev Mode" icon={<I.bolt />} onClick={() => setFeatures((f) => ({ ...f, dev: !f.dev }))} />
                </Row>
              </div>
            </div>
          </Block>
        </div>

        {/* 06 · CALLOUTS */}
        <div>
          <H2 num="06" sub="Inline note box, six tones, with the load-bearing left accent border. The error one is dismissable — click the × to collapse it.">Callouts</H2>
          <Block style={{ marginTop: 16 }}>
            <Col gap={8}>
              <Callout tone="info" title="Smart Triggers">
                This template activates when its match rules pass. Use <Mono>{'{{var}}'}</Mono> tokens for DOM-extracted data.
              </Callout>
              <Callout tone="brand" title="Case Reply Template">Matches against the From / Subject / Body of incoming case emails.</Callout>
              <Callout tone="success" title="Saved" dismissable>Template synced across all open tabs.</Callout>
              <Callout tone="warning" title="Heads up">Conditions are evaluated against the contact's live record.</Callout>
              <Callout tone="error" title="Charge failed" dismissable>
                The processor returned <Mono>insufficient_funds</Mono>. Dismiss to collapse.
              </Callout>
              <Callout tone="neutral" icon={false}>No icon, no title — a quiet hint at the bottom of a form.</Callout>
            </Col>
          </Block>
        </div>

        {/* 07 · SLIDERS */}
        <div>
          <H2 num="07" sub="Single-thumb Slider and two-thumb RangeSlider. Drag the thumbs or click the track.">Sliders</H2>
          <Block style={{ marginTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
              <Col gap={14}>
                <Label>Slider · single value</Label>
                <Field label="Default delay"><Slider value={delay} min={5} max={600} unit="s" onChange={setDelay} showRange /></Field>
                <Field label="Margin target" hint="With tick marks">
                  <Slider value={margin} min={20} max={60} unit="%" ticks={[25, 30, 35, 40, 45, 50, 55]} onChange={setMargin} />
                </Field>
                <Field label="Throttle (warning tone)"><Slider value={throttle} min={0} max={100} unit="%" tone="warning" onChange={setThrottle} /></Field>
              </Col>
              <Col gap={14}>
                <Label>RangeSlider · two thumbs</Label>
                <Field label="Order value range" hint="CRM Search filter">
                  <RangeSlider values={orderRange} min={0} max={10000} unit="$" onChange={setOrderRange} />
                </Field>
                <Field label="Send window (24h)" hint="Campaign business hours">
                  <RangeSlider values={sendWindow} min={0} max={24} unit="h" ticks={[6, 12, 18]} showRange onChange={setSendWindow} />
                </Field>
              </Col>
            </div>
          </Block>
        </div>

        {/* 08 · MODAL */}
        <div>
          <H2 num="08" sub="The three-zone modal: ModalHeader (icon tile + title/subtitle + close) · body with SectionLabel / Card / KeyVal · ModalFooter.">Modal pattern</H2>
          <Block style={{ marginTop: 16 }}>
            <Row gap={28} align="flex-start">
              <div style={{ flexShrink: 0 }}>
                <Label>Anatomy (static)</Label>
                <ModalShell width={440}>
                  <ModalHeader
                    icon={<I.card />}
                    title="Modal Title"
                    subtitle="Subtitle context · meta"
                    right={<Tag tone="brand" size="sm">STATE</Tag>}
                  />
                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <SectionLabel>Order</SectionLabel>
                    <Card>
                      <KeyVal k="Order" v="#ORD-29481" mono tone="ok" />
                      <KeyVal k="Customer" v="Acme Industries" />
                      <KeyVal k="Total" v="$1,247.50" mono />
                    </Card>
                    <SectionLabel action={<Btn variant="ghost" size="xs" icon={<I.plus />}>Add</Btn>}>Flags</SectionLabel>
                    <Row gap={6}>
                      <Tag tone="brand">MATCHED</Tag>
                      <Tag tone="error">CRITICAL</Tag>
                      <Tag tone="warning">HOLD</Tag>
                    </Row>
                  </div>
                  <ModalFooter>
                    <span style={{ flex: 1, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>Optional hint text</span>
                    <Btn variant="ghost">Cancel</Btn>
                    <Btn variant="primary" icon={<I.check />}>Confirm</Btn>
                  </ModalFooter>
                </ModalShell>
              </div>
              <Col gap={10} style={{ flex: 1, minWidth: 240 }}>
                <Label>Live components</Label>
                <Row gap={8}>
                  <Btn variant="primary" icon={<I.card />} onClick={() => setModalOpen(true)}>Open modal</Btn>
                  <Btn variant="secondary" icon={<I.calc />} onClick={() => setCalcOpen(true)}>Margin Calculator</Btn>
                </Row>
                <Callout tone="info" icon={false}>
                  The Margin Calculator is the first migrated modal — a draggable FloatingPanel.
                  Drag it by the header, Esc to close, and the dim backdrop stays click-through.
                </Callout>
              </Col>
            </Row>
          </Block>
        </div>

        {/* 09 · SETTINGS PAGE */}
        <div>
          <H2 num="09" sub="The migrated Manage → Settings page: variant selector, the 8 Theme colors, feature toggles — all design-system components. Editing a color retones this whole page live.">Settings page</H2>
          <Block style={{ marginTop: 16 }}>
            <SettingsPanel />
          </Block>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)' }}>
          <Dot tone="brand" glow size={8} />
          <span style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)' }}>
            23 primitives · every color reads from a <Mono>--gb-*</Mono> token, so any <Mono>data-theme</Mono> re-themes the whole tree.
          </span>
        </div>
      </div>

      {/* overlay modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setModalOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'var(--gb-backdrop)', backdropFilter: 'var(--gb-backdrop-blur)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <ModalShell width={460}>
                <ModalHeader
                  icon={<I.card />}
                  title="Run Payment"
                  subtitle="Order #ORD-29481"
                  right={<Tag tone="brand">READY</Tag>}
                  onClose={() => setModalOpen(false)}
                />
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Field label="Method">
                    <Dropdown options={DD_OPTIONS} value={method} onChange={setMethod} leading={<I.card size={13} />} />
                  </Field>
                  <Field label="Amount">
                    <Input mono value={amount} onChange={setAmount} leading={<span style={{ fontWeight: 800 }}>$</span>} />
                  </Field>
                  <Callout tone="info" icon={false}>The customer will be emailed a receipt.</Callout>
                </div>
                <ModalFooter>
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--gb-text-muted)' }}>Secured payment</span>
                  <Btn variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Btn>
                  <Btn variant="primary" icon={<I.check />} onClick={() => sleep(1100).then(() => setModalOpen(false))}>Charge</Btn>
                </ModalFooter>
              </ModalShell>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {calcOpen && (
        <MarginCalc shortcut="Ctrl+M" onClosed={() => setCalcOpen(false)} bindClose={() => {}} />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Demo />);
