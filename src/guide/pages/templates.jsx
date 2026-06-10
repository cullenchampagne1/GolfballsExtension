import React, { useState } from 'react';
import { I, Btn, Input, Field, Tag, Dot, TemplatePicker, Switch } from '../../ui/index.js';
import { GIcon } from '../lib/app.jsx';
import { TourBox, MiniFrame } from '../lib/tourbox.jsx';

/* ───────────────────────────────────────────────────────────────
   templates.jsx — DEEP page: the Email Templates system. Layout
   from the design exemplar (page-templates.jsx); helper table,
   source kinds, and smart options corrected to the verified
   articles (template-editor, template-variables, code-variables).
─────────────────────────────────────────────────────────────── */

/* ---- a {{variable}} chip, matching the editor's preview style ---- */
function VarChip({ name, empty }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'stretch', borderRadius: 5, border: '1px solid ' + (empty ? 'var(--gb-warning-tint-border)' : 'var(--gb-brand-tint-border)'), background: empty ? 'var(--gb-warning-tint-soft)' : 'var(--gb-brand-tint-soft)', overflow: 'hidden', verticalAlign: 'middle', margin: '0 1px' }}>
      <span style={{ padding: '0 5px', fontFamily: 'var(--gb-font-mono)', fontSize: 11.5, fontWeight: 600, color: empty ? 'var(--gb-warning-fg)' : 'var(--gb-brand-label)' }}>{name}</span>
      <span style={{ padding: '0 3px', borderLeft: '1px solid ' + (empty ? 'var(--gb-warning-tint-border)' : 'var(--gb-brand-tint-border)'), color: empty ? 'var(--gb-warning-fg)' : 'var(--gb-brand-label)', display: 'inline-flex', alignItems: 'center', opacity: 0.6 }}><I.bolt size={8} /></span>
    </span>
  );
}

function firstVal(raw, resolved) {
  const names = String(raw).split('|').map((s) => s.trim()).filter(Boolean);
  for (const n of names) { if (resolved[n] != null && String(resolved[n]).length > 0) return resolved[n]; }
  return '';
}
function BodyView({ text, resolved, mode, conditional = [] }) {
  const lines = text.split('\n');
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-sans)', whiteSpace: 'pre-wrap' }}>
      {lines.map((line, li) => {
        if (mode === 'resolved') {
          const dropped = conditional.some((cv) => line.includes(`{{${cv}}}`) && !firstVal(cv, resolved));
          if (dropped) return null;
        }
        const parts = []; let last = 0; const rx = /\{\{([^}]+)\}\}/g; let m; let idx = 0;
        while ((m = rx.exec(line)) !== null) {
          if (m.index > last) parts.push(line.slice(last, m.index));
          const raw = m[1].trim();
          if (mode === 'raw') parts.push(<VarChip key={idx++} name={raw} />);
          else { const v = firstVal(raw, resolved); parts.push(v || <VarChip key={idx++} name={raw} empty />); }
          last = m.index + m[0].length;
        }
        if (last < line.length) parts.push(line.slice(last));
        return <div key={li} style={{ minHeight: line === '' ? '0.7em' : undefined }}>{parts}</div>;
      })}
    </div>
  );
}

const SAMPLE_BODY = "Hi {{first_name}},\n\nGood news — your order {{order_no}} is on its way!\n\nYour tracking number is {{tracking}}.\n\nThanks for choosing Golfballs.com.";
const SAMPLE_RESOLVED = { first_name: 'Jordan', order_no: '4815162342', tracking: '1Z999AA10123456784' };

function BodySnippet() {
  const [mode, setMode] = useState('raw');
  return (
    <MiniFrame width={400} label="template · body" pad>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        <Btn size="xs" variant={mode === 'raw' ? 'tinted' : 'ghost'} status="brand" onClick={() => setMode('raw')}>Template</Btn>
        <Btn size="xs" variant={mode === 'resolved' ? 'tinted' : 'ghost'} status="brand" onClick={() => setMode('resolved')}>Resolved</Btn>
      </div>
      <div style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', padding: 14, minHeight: 168 }}>
        <BodyView text={SAMPLE_BODY} resolved={SAMPLE_RESOLVED} mode={mode} />
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 8, textAlign: 'center' }}>{mode === 'raw' ? 'What you write' : 'What the customer gets — filled from the live order'}</div>
    </MiniFrame>
  );
}

/* ---- source kinds (verified: Schema / Code / Literal / Regex) ---- */
const KINDS = [
  { id: 'schema', label: 'Schema', icon: () => <GIcon.grid size={14} />, desc: "Pick a field from the page's data tree" },
  { id: 'code', label: 'Code', icon: () => <I.code size={14} />, desc: 'Compute a value with a little JavaScript' },
  { id: 'literal', label: 'Literal', icon: () => <I.edit size={14} />, desc: 'A fixed string, used verbatim' },
  { id: 'regex', label: 'Regex', icon: () => <I.filter size={14} />, desc: 'Capture group from an inbound email (case templates)' },
];
const KIND_PREVIEW = { schema: '(field value)', code: '(resolves on load)', literal: 'Customer Service Team', regex: '(capture group 1)' };

function VarCreatorSnippet() {
  const [name, setName] = useState('order_total');
  const [kind, setKind] = useState('schema');
  return (
    <MiniFrame width={420} label="editor · new variable" pad>
      <Field label="Variable name" required hint="No spaces — they become underscores. Used as {{name}}.">
        <Input value={name} mono onChange={(v) => setName(v.replace(/\s/g, '_'))} />
      </Field>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)', margin: '12px 0 7px' }}>Source kind</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
        {KINDS.map((k) => {
          const on = kind === k.id;
          return (
            <button key={k.id} onClick={() => setKind(k.id)} style={{ textAlign: 'left', cursor: 'pointer', padding: 9, borderRadius: 'var(--gb-r-md)', border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: on ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)', display: 'flex', flexDirection: 'column', gap: 3, transition: 'background .14s, border-color .14s', fontFamily: 'inherit' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontWeight: 700, fontSize: 12 }}>{k.icon()} {k.label}</span>
              <span style={{ fontSize: 10, color: 'var(--gb-text-muted)', lineHeight: 1.4 }}>{k.desc}</span>
            </button>
          );
        })}
      </div>
      <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '12px 0' }} />
      <div style={{ padding: 11, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-medium)', border: '1px solid var(--gb-border-default)', fontSize: 12, color: 'var(--gb-text-secondary)', lineHeight: 1.7 }}>
        In your template: <VarChip name={name || 'variable_name'} /> {' → '} <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-tertiary)', fontSize: 11 }}>{KIND_PREVIEW[kind]}</span>
      </div>
    </MiniFrame>
  );
}

/* ============ SCHEMA deep snippet — live field tree ============ */
const SCHEMA_TREE = [
  { group: 'Order', fields: [
    { path: 'order.number', label: 'Order number', val: '4815162342' },
    { path: 'order.status', label: 'Status', val: 'Shipped' },
    { path: 'order.total', label: 'Order total', val: '$412.50' },
    { path: 'order.tracking', label: 'Tracking #', val: '1Z999AA10123456784' },
  ] },
  { group: 'Contact', fields: [
    { path: 'contact.firstName', label: 'First name', val: 'Jordan' },
    { path: 'contact.email', label: 'Email', val: 'jordan.lee@example.com' },
    { path: 'contact.phone', label: 'Phone', val: '(512) 555-1234' },
  ] },
  { group: 'Account', fields: [
    { path: 'account.companyName', label: 'Company', val: 'Lee Industries' },
    { path: 'account.ytdRevenue', label: 'YTD revenue', val: '$8,240' },
    { path: 'account.salesRep', label: 'Sales rep', val: 'Pat M.' },
  ] },
  { group: 'Orders (history list)', fields: [
    { path: 'orders[any].total', label: 'Any order total', val: 'array quantifier' },
    { path: 'orders[-1].date', label: 'Latest order date', val: 'Jun 3, 2026' },
  ] },
];
function SchemaSnippet() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState('order.total');
  const ql = q.trim().toLowerCase();
  const groups = SCHEMA_TREE.map((g) => ({ ...g, fields: g.fields.filter((f) => !ql || (f.label + ' ' + f.path).toLowerCase().includes(ql)) })).filter((g) => g.fields.length);
  const selField = SCHEMA_TREE.flatMap((g) => g.fields).find((f) => f.path === sel);
  return (
    <MiniFrame width={420} label="editor · schema path" pad>
      <Input value={q} onChange={setQ} size="sm" placeholder="Search fields…" leading={<I.search />} />
      <div className="gb-thin-scroll" style={{ marginTop: 8, maxHeight: 188, overflowY: 'auto', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-surface-1)', padding: 5 }}>
        {groups.map((g) => (
          <div key={g.group} style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '5px 7px 3px' }}>{g.group}</div>
            {g.fields.map((f) => {
              const on = sel === f.path;
              return (
                <button key={f.path} onClick={() => setSel(f.path)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 7px', borderRadius: 'var(--gb-r-sm)', border: 'none', background: on ? 'var(--gb-brand-tint-soft)' : 'transparent', color: 'inherit', fontFamily: 'inherit' }}>
                  <Dot tone={on ? 'brand' : 'muted'} glow={on} size={5} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>{f.label}</span>
                  <span style={{ fontSize: 9.5, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-ghost)' }}>{f.path}</span>
                  {on && <I.check size={12} />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {selField && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-medium)', border: '1px solid var(--gb-border-default)', fontSize: 11.5, lineHeight: 1.6 }}>
          <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)' }}>{selField.path}</span>
          <span style={{ color: 'var(--gb-text-muted)' }}> → </span>
          <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-secondary)' }}>{selField.val}</span>
        </div>
      )}
    </MiniFrame>
  );
}

/* ============ CODE deep snippet — verified h.* helpers only ============ */
const CTX = {
  order: { number: '4815162342', status: 'Shipped', total: 412.5, tracking: '1Z999AA10123456784' },
  contact: { firstName: 'jordan', lastName: 'lee', email: 'jordan.lee@example.com', phone: '512 555 1234' },
  account: { email: '' },
};
const hMock = {
  fmt: { currency: (n) => '$' + Number(n).toFixed(2) },
  titleCase: (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase()),
  coalesce: (...a) => a.find((x) => x != null && String(x).length > 0) ?? '',
  normalizePhone: (v) => { const d = String(v || '').replace(/\D/g, ''); return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`; },
};
const CODE_EXAMPLES = [
  { id: 'fmt', label: 'Format', async: false, body: "return 'Your total is ' +\n  h.fmt.currency(ctx.order.total);", run: () => 'Your total is ' + hMock.fmt.currency(CTX.order.total) },
  { id: 'name', label: 'Tidy name', async: false, body: "return h.titleCase(\n  ctx.contact.firstName + ' ' +\n  ctx.contact.lastName);", run: () => hMock.titleCase(CTX.contact.firstName + ' ' + CTX.contact.lastName) },
  { id: 'coalesce', label: 'Fallback', async: false, body: "return h.coalesce(\n  ctx.contact.email,\n  ctx.account.email,\n  'no email on file');", run: () => hMock.coalesce(CTX.contact.email, CTX.account.email, 'no email on file') },
  { id: 'phone', label: 'Phone', async: false, body: "return h.normalizePhone(\n  ctx.contact.phone);", run: () => hMock.normalizePhone(CTX.contact.phone) },
  { id: 'vars', label: 'Build on vars', async: false, body: "// vars = earlier variables\nreturn 'Re: order ' +\n  vars.order_no;", run: () => 'Re: order 4815162342' },
  { id: 'server', label: 'Catalog lookup', async: true, body: "// search the gift catalog\nconst hit = await h.catalogFind(\n  'pro v1');\nreturn hit?.title;", run: () => 'Titleist Pro V1 (dozen)' },
];
function CodeSnippet() {
  const [ex, setEx] = useState(CODE_EXAMPLES[0]);
  return (
    <MiniFrame width={440} label="editor · code variable" pad>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {CODE_EXAMPLES.map((e) => (
          <Btn key={e.id} size="xs" variant={ex.id === e.id ? 'tinted' : 'ghost'} status="brand" onClick={() => setEx(e)}>{e.label}</Btn>
        ))}
      </div>
      <div style={{ background: 'var(--gb-surface-deep)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', padding: '10px 12px', fontFamily: 'var(--gb-font-mono)', fontSize: 11.5, lineHeight: 1.65, color: 'var(--gb-text-secondary)', whiteSpace: 'pre-wrap', minHeight: 92 }}>
        {ex.body}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
        <Tag tone={ex.async ? 'warning' : 'brand'} size="xs">{ex.async ? 'ASYNC · awaits the background' : 'SYNC'}</Tag>
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>resolves to</span>
      </div>
      <div style={{ marginTop: 6, padding: '8px 11px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', fontFamily: 'var(--gb-font-mono)', fontSize: 12, color: 'var(--gb-brand-label)' }}>
        {ex.run()}{ex.async && <span style={{ color: 'var(--gb-text-muted)', marginLeft: 6 }}>// fetched live</span>}
      </div>
    </MiniFrame>
  );
}

/* ============ SMART OPTIONS (⚡) — the 4 verified options ============ */
const SMART_TABS = [
  { id: 'fallback', label: 'Fallback' },
  { id: 'transform', label: 'Transform' },
  { id: 'conditional', label: 'Conditional' },
  { id: 'format', label: 'Format' },
];
const SMART_TRANSFORMS = [
  { id: 'extract_regex', label: 'Extract regex', sample: '"Re: order ORD-28104…"', out: '"28104"' },
  { id: 'format_currency', label: 'Format as currency', sample: '412.5', out: '$412.50' },
  { id: 'format_number', label: 'Format as number', sample: '1234.5', out: '1,234.5' },
  { id: 'format_date', label: 'Format as date', sample: '2026-06-03', out: '06/03/2026' },
  { id: 'title_case', label: 'Title case', sample: '"marcus chen"', out: '"Marcus Chen"' },
];
const SMART_FORMATS = [
  { id: 'none', label: 'None', render: (s) => s },
  { id: 'bold', label: 'Bold', render: (s) => <b>{s}</b> },
  { id: 'italic', label: 'Italic', render: (s) => <i>{s}</i> },
  { id: 'underline', label: 'Underline', render: (s) => <u>{s}</u> },
];
const SMART_SCOPES = ['Sentence', 'Line', 'Paragraph'];

function SmartOptionsSnippet() {
  const [tab, setTab] = useState('transform');
  const [tf, setTf] = useState('format_currency');
  const [fmt, setFmt] = useState('bold');
  const [fb, setFb] = useState('there');
  const [scope, setScope] = useState('Sentence');
  const tActive = SMART_TRANSFORMS.find((t) => t.id === tf);
  const fActive = SMART_FORMATS.find((f) => f.id === fmt);
  const resultRow = (a, b) => (
    <div style={{ marginTop: 10, padding: '8px 11px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', fontSize: 12, fontFamily: 'var(--gb-font-mono)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: 'var(--gb-text-muted)' }}>{a}</span>
      <I.chevr size={11} style={{ color: 'var(--gb-text-ghost)' }} />
      <span style={{ color: 'var(--gb-brand-label)', fontWeight: 600 }}>{b}</span>
    </div>
  );
  return (
    <MiniFrame width={430} label="editor · smart options (⚡)" pad>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <VarChip name="customer" />
        <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>· Smart options</span>
        <span style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: 5, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.bolt size={12} /></span>
      </div>
      <div style={{ display: 'flex', gap: 2, background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', padding: 3 }}>
        {SMART_TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: '7px 2px', borderRadius: 'var(--gb-r-sm)', border: 'none', cursor: 'pointer', background: on ? 'var(--gb-brand-tint-medium)' : 'transparent', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', fontFamily: 'inherit', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, transition: 'background .13s, color .13s' }}>{t.label}</button>
          );
        })}
      </div>
      <div style={{ marginTop: 10, minHeight: 120 }}>
        {tab === 'transform' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {SMART_TRANSFORMS.map((t) => {
              const on = tf === t.id;
              return <button key={t.id} onClick={() => setTf(t.id)} style={{ textAlign: 'left', cursor: 'pointer', padding: '6px 9px', borderRadius: 'var(--gb-r-sm)', border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'transparent'), background: on ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600 }}>{t.label}</button>;
            })}
          </div>
        )}
        {tab === 'format' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 5 }}>
            {SMART_FORMATS.map((f) => {
              const on = fmt === f.id;
              return <button key={f.id} onClick={() => setFmt(f.id)} style={{ textAlign: 'left', cursor: 'pointer', padding: '8px 10px', borderRadius: 'var(--gb-r-sm)', border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: on ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>{f.label}</button>;
            })}
          </div>
        )}
        {tab === 'fallback' && (
          <Field label="Fallback value" hint="Used when the variable resolves empty — shows yellow instead of red in the popup">
            <Input size="sm" value={fb} onChange={setFb} placeholder="e.g. there" />
          </Field>
        )}
        {tab === 'conditional' && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--gb-text-tertiary)', lineHeight: 1.5, marginBottom: 8 }}>When this variable is empty, remove the surrounding…</div>
            <div style={{ display: 'flex', gap: 5 }}>
              {SMART_SCOPES.map((sc) => <button key={sc} onClick={() => setScope(sc)} style={{ flex: 1, cursor: 'pointer', padding: '7px 4px', borderRadius: 'var(--gb-r-sm)', border: '1px solid ' + (scope === sc ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: scope === sc ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)', color: scope === sc ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontFamily: 'inherit', fontSize: 11, fontWeight: 600 }}>{sc}</button>)}
            </div>
          </div>
        )}
      </div>
      {tab === 'transform' && resultRow(tActive.sample, tActive.out)}
      {tab === 'format' && resultRow('"Jordan"', fActive.render('Jordan'))}
      {tab === 'fallback' && resultRow('(empty)', `"${fb || '—'}"`)}
      {tab === 'conditional' && resultRow('(empty)', `whole ${scope.toLowerCase()} removed`)}
    </MiniFrame>
  );
}

/* ---- conditional drop, in action ---- */
function SmartSnippet() {
  const [hasTracking, setHasTracking] = useState(true);
  const resolved = { first_name: 'Jordan', order_no: '4815162342', tracking: hasTracking ? '1Z999AA10123456784' : '' };
  const text = "Hi {{first_name}},\n\nYour order {{order_no}} shipped.\n\nYour tracking number is {{tracking}}.";
  return (
    <MiniFrame width={400} label="template · conditional drop" pad>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, justifyContent: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>Order has a tracking number</span>
        <Switch on={hasTracking} size="sm" onChange={setHasTracking} />
      </div>
      <div style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', padding: 14, minHeight: 120 }}>
        <BodyView text={text} resolved={resolved} mode="resolved" conditional={['tracking']} />
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 8, textAlign: 'center' }}>
        {hasTracking ? 'Tracking present — the sentence stays.' : 'Tracking empty — the whole sentence is dropped, no awkward blank.'}
      </div>
    </MiniFrame>
  );
}

/* ---- variations picker ---- */
const VAR_TPL = [{ id: 'tpl_ship', name: 'Order Shipped', type: 'order', variations: [{ id: 'a', preview: 'Warmer tone' }, { id: 'b', preview: 'Brief / transactional' }] }];
function VariationsSnippet() {
  const [val, setVal] = useState('tpl_ship');
  return (
    <MiniFrame width={320} label="popup · variations" pad>
      <TemplatePicker mode="random" templates={VAR_TPL} matchedIds={['tpl_ship']} value={val} onChange={setVal} forceExpandId="tpl_ship" listMaxHeight={260} floating={false} initialOpen />
    </MiniFrame>
  );
}

/* The verified h.* toolbox (src/lib/page-engine/code-runtime.js). */
function HelperTable() {
  const rows = [
    ['h.dom(sel) · h.domAll(sel) · h.domText(sel)', 'Read straight from the live page DOM'],
    ['h.fmt.currency(n) · h.fmt.number(n) · h.fmt.date(v)', 'Format money ($412.50), numbers (1,234), dates (MM/DD/YYYY)'],
    ['h.coalesce(a, b, …)', 'First non-empty argument — the fallback chain'],
    ['h.titleCase(s)', 'Re-case text to Title Case'],
    ['h.parseNumber(s) · h.parseDate(s) · h.normalizePhone(s)', 'Coerce messy values — phone becomes (###) ###-####'],
    ['await h.fetchText(url) · h.fetchJson(url)', 'GET a URL through the background worker (CORS-safe, allow-listed hosts)'],
    ['await h.send(action, payload)', 'Call a privileged background action'],
    ['await h.catalogSearch(q, {limit}) · h.catalogFind(q)', 'Search the gift catalog by name similarity'],
  ];
  return (
    <table className="spectable">
      <thead><tr><th>Helper</th><th>What it does</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r[0]}><td><code>{r[0]}</code></td><td>{r[1]}</td></tr>)}</tbody>
    </table>
  );
}

export function TemplatesPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Daily Driver</div>
      <h1 className="title">Email Templates</h1>
      <p className="lede">
        Templates are pre-written emails that fill themselves in. You write the wording once, drop in
        <code>{'{{variables}}'}</code> where the customer's details should go, and the extension resolves them
        live every time you send. Below: how variables work — including a deep look at <strong>Schema</strong> and
        <strong> Code</strong> — plus the ⚡ smart options and A/B variations, each on a real, interactive snippet.
      </p>

      <TourBox n={1} eyebrow="The idea" title="Write once, fill automatically" live={<BodySnippet />} wide>
        <p>A template has a <strong>subject</strong> and a <strong>body</strong>. Anywhere you'd type a customer-specific detail, you write a variable in <code>{'{{double braces}}'}</code> instead.</p>
        <p>Flip the snippet between <strong>Template</strong> (what you write) and <strong>Resolved</strong> (what the customer receives). In the editor, chips are color-coded live: green resolves, yellow has a fallback, red would leak the braces.</p>
      </TourBox>

      <TourBox n={2} eyebrow="Where values come from" title="Four kinds of variable" live={<VarCreatorSnippet />} flip wide>
        <p>When you add a variable, you choose its <strong>source kind</strong>:</p>
        <ul>
          <li><strong>Schema</strong> — point at a field in the page's data tree (the durable, no-code choice for order and account templates).</li>
          <li><strong>Code</strong> — compute a value with a snippet of JavaScript when a plain field isn't enough.</li>
          <li><strong>Literal</strong> — a fixed string, the same every time.</li>
          <li><strong>Regex</strong> — capture text out of an inbound email's body, subject, or From address (case templates).</li>
        </ul>
        <p>Older templates may still carry legacy <strong>DOM-selector</strong> or <strong>Built-in</strong> variables — they keep resolving, but new ones should use Schema.</p>
      </TourBox>

      <TourBox n={3} eyebrow="Deep dive · Schema" title="Point at a field, no code" live={<SchemaSnippet />}>
        <p>A <strong>Schema</strong> variable binds to a field in the page's extracted data tree — the structured record the engine builds from the order, contact, and account. You <strong>search and pick</strong> with arrow keys + Enter; no selectors, no script.</p>
        <p>Because it reads structured data rather than the page's HTML, it <strong>survives site redesigns</strong> — when the CRM moves a button, a CSS-selector variable breaks, but <code>order.total</code> keeps resolving. History fields support quantifiers like <code>orders[any].total</code> (any / none / first / latest).</p>
      </TourBox>

      <TourBox n={4} eyebrow="Deep dive · Code" title="Compute anything" live={<CodeSnippet />} flip wide>
        <p>A <strong>Code</strong> variable runs a small JavaScript block in a guarded sandbox and returns the string to drop in. Your code receives three things:</p>
        <ul>
          <li><code>ctx</code> — the page's structured data (the same tree Schema picks from).</li>
          <li><code>vars</code> — variables resolved <em>before</em> this one, so you can build on them.</li>
          <li><code>h</code> — the helper toolbox: formatters, <code>coalesce</code>, DOM reads, catalog search, and background-routed fetches.</li>
        </ul>
        <p>Click through the examples. <strong>Sync</strong> blocks resolve instantly; write <code>await</code> and the block runs <strong>async</strong> — the popup shows “running code…” until it lands.</p>
      </TourBox>

      <h3 className="sub">The <code>h</code> helper toolbox</h3>
      <p>Everything available inside a Code variable. Anything that hits the network routes through the background worker.</p>
      <HelperTable />

      <div className="docnote warn">
        <span className="dn-ico"><I.alert size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Guard rails on Code</div>
          <p style={{ margin: 0 }}>Code runs in a soft sandbox: raw <code>fetch()</code>, <code>chrome.*</code>, <code>eval</code>, timers, and <code>while(true)</code> shapes are blocked (use the <code>h.*</code> equivalents), bodies are capped at 8,192 characters, and async blocks time out after 10 seconds so a hung request can't freeze a send. An erroring variable resolves to empty — the editor surfaces the error so you can fix it.</p>
        </div>
      </div>

      <TourBox n={5} eyebrow="The ⚡ menu" title="Smart options on any variable" live={<SmartOptionsSnippet />} flip wide>
        <p>Every variable chip carries a <strong>lightning bolt</strong>. Click it for <strong>Smart options</strong> — post-processing on the resolved value, whatever its source:</p>
        <ul>
          <li><strong>Fallback</strong> — a default used when it resolves empty (the chip shows yellow instead of red).</li>
          <li><strong>Transform</strong> — Extract regex (capture group), Format as currency / number / date, or Title case.</li>
          <li><strong>Conditional</strong> — drop the surrounding sentence / line / paragraph when empty.</li>
          <li><strong>Format</strong> — render the value <b>Bold</b>, <i>Italic</i>, or <u>Underlined</u> in the email.</li>
        </ul>
        <p>So a raw <code>order.total</code> of <code>412.5</code> becomes <strong>$412.50</strong> with two clicks — no Code variable needed.</p>
      </TourBox>

      <TourBox n={6} eyebrow="Conditional, in action" title="Empty values, gracefully dropped" live={<SmartSnippet />}>
        <p>The <strong>Conditional</strong> smart option keeps emails clean when data is missing. Here the tracking sentence is marked conditional — toggle the tracking number off and the whole sentence disappears, instead of leaving “Your tracking number is .”</p>
        <p>For value-level fallbacks there's also the OR-block syntax: <code>{'{{mobile|office|email}}'}</code> tries each candidate left to right and uses the first non-empty one. It renders in the body as a two-tone split pill.</p>
      </TourBox>

      <TourBox n={7} eyebrow="A/B versions" title="Variations" live={<VariationsSnippet />} flip>
        <p>A template can hold several <strong>variations</strong> — alternate subject + body versions that share the same variables. The pool is always the original plus every variation you add.</p>
        <p>In the popup, selecting the parent (shuffle badge) sends a <strong>random</strong> version each time with equal odds; expand the row to <strong>pin</strong> one (check badge). In bulk sends, the Campaign Runner lets you set <strong>weighted</strong> splits instead.</p>
      </TourBox>

      <h2 className="sec">When does a template show up?</h2>
      <p>
        Each template has a <strong>type</strong> — <strong>order</strong>, <strong>account</strong> (contact/account pages), or <strong>case</strong> (the email preview's reply bar) — and optional <strong>auto-match rules</strong>: field + operator + value conditions over the page's real data, grouped with AND/OR. The popup only offers templates whose type fits the current page, and one whose rules pass jumps to the top under “Matched on this page.” That's the matching you saw on <a href="#popup">the Popup</a>.
      </p>

      <h2 className="sec">Recipient &amp; how it sends</h2>
      <table className="spectable">
        <thead><tr><th>Setting</th><th>What it controls</th></tr></thead>
        <tbody>
          <tr><td><b>Recipient (To)</b></td><td>Per type: <b>Smart detect</b> / <b>Pick from page</b> (click the email element, the selector fills itself) / <b>Fixed email</b> — case templates get <b>Reply to sender</b>, account templates <b>Contact email</b>. A live hint shows the resolved address.</td></tr>
          <tr><td><b>Reply mode</b></td><td><b>Standalone</b> starts a fresh email; <b>Reply</b> threads onto the most recent conversation (the Send button reads “Reply”). Power Automate only.</td></tr>
          <tr><td><b>Sender</b></td><td>With Power Automate on, pick which account the email comes from — or <b>Random</b> to rotate per send.</td></tr>
          <tr><td><b>Auto-create task</b></td><td>Account templates can log a CRM task automatically when the email sends — pick one of your task templates.</td></tr>
        </tbody>
      </table>

      <div className="docnote info" style={{ marginTop: 24 }}>
        <span className="dn-ico"><I.bolt size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Building templates lives in the Manager</div>
          <p style={{ margin: 0 }}>Create and edit templates from the popup's <strong>Manage</strong> button: the rich-text subject/body editor with variable chips, the variable table (Schema picker and Code editor shown above), the variations panel, folders, and the rules builder. The Notes tab holds the one-click <em>note / task / call-log</em> templates used by Quick Task and Call Log.</p>
        </div>
      </div>
    </div>
  );
}
