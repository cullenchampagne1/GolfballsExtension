/* page-templates.jsx — DEEP page: the Email Templates editor.
   Variables (with deep Schema + Code) & variations, via live TourBoxes. */
(function () {
  const { useState } = React;
  const { I, Btn, Input, Field, Tag, Dot, TemplatePicker, Switch } = window.GB;
  const TourBox = window.TourBox;
  const MiniFrame = window.MiniFrame;
  window.GBPages = window.GBPages || {};

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

  /* ---- kinds overview ---- */
  const KINDS = [
    { id: 'schema', label: 'Schema', icon: (p) => <I.grid size={14} />, desc: 'Pick a field from the page\u2019s data tree' },
    { id: 'code', label: 'Code', icon: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6" /></svg>, desc: 'Compute a value with a little JavaScript' },
    { id: 'literal', label: 'Literal', icon: (p) => <I.edit size={14} />, desc: 'A fixed string, used verbatim' },
    { id: 'regex', label: 'Regex', icon: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 5v6M12 12v6M6 12h12" /></svg>, desc: 'Capture group from an email (case templates)' },
  ];
  const KIND_PREVIEW = { schema: '(field value)', code: '(resolves on load)', literal: 'Customer Service Team', regex: '(first capture group)' };
  function VarCreatorSnippet() {
    const [name, setName] = useState('order_total');
    const [kind, setKind] = useState('schema');
    return (
      <MiniFrame width={420} label="editor · new variable" pad>
        <Field label="Variable name" required hint="No spaces. Used as {{name}}.">
          <Input value={name} mono leading={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 4 a14 14 0 000 16M19 4a14 14 0 010 16" /></svg>} onChange={(v) => setName(v.replace(/\s/g, '_'))} />
        </Field>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)', margin: '12px 0 7px' }}>Source kind</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {KINDS.map((k) => {
            const on = kind === k.id;
            return (
              <button key={k.id} onClick={() => setKind(k.id)} style={{ textAlign: 'left', cursor: 'pointer', padding: 9, borderRadius: 'var(--gb-r-md)', border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: on ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)', display: 'flex', flexDirection: 'column', gap: 3, transition: 'background .14s, border-color .14s' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontWeight: 700, fontSize: 12 }}>{k.icon({})} {k.label}</span>
                <span style={{ fontSize: 10, color: 'var(--gb-text-muted)', lineHeight: 1.4 }}>{k.desc}</span>
              </button>
            );
          })}
        </div>
        <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '12px 0' }} />
        <div style={{ padding: 11, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', fontSize: 12, color: 'var(--gb-text-secondary)', lineHeight: 1.7 }}>
          In your template: <VarChip name={name || 'variable_name'} /> {' → '} <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-tertiary)', fontSize: 11 }}>{KIND_PREVIEW[kind]}</span>
        </div>
      </MiniFrame>
    );
  }

  /* ============ SCHEMA deep snippet — live field tree ============ */
  const SCHEMA_TREE = [
    { group: 'Order', fields: [
      { path: 'ctx.order.number', label: 'Order number', val: '4815162342' },
      { path: 'ctx.order.status', label: 'Status', val: 'Shipped' },
      { path: 'ctx.order.total', label: 'Order total', val: '$412.50' },
      { path: 'ctx.order.tracking', label: 'Tracking #', val: '1Z999AA10123456784' },
      { path: 'ctx.order.shipDate', label: 'Ship date', val: 'Jun 3, 2026' },
    ] },
    { group: 'Contact', fields: [
      { path: 'ctx.contact.firstName', label: 'First name', val: 'Jordan' },
      { path: 'ctx.contact.email', label: 'Email', val: 'jordan.lee@example.com' },
      { path: 'ctx.contact.phone', label: 'Phone', val: '(512) 555-1234' },
    ] },
    { group: 'Items (list)', fields: [
      { path: 'ctx.items[].name', label: 'Item name', val: 'Titleist Pro V1' },
      { path: 'ctx.items[].qty', label: 'Quantity', val: '2' },
      { path: 'ctx.items[].price', label: 'Unit price', val: '$54.99' },
    ] },
    { group: 'Account', fields: [
      { path: 'ctx.account.companyName', label: 'Company', val: 'Lee Industries' },
      { path: 'ctx.account.salesRep', label: 'Sales rep', val: 'Pat M.' },
    ] },
  ];
  function SchemaSnippet() {
    const [q, setQ] = useState('');
    const [sel, setSel] = useState('ctx.order.total');
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
                    <span style={{ fontSize: 9.5, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-ghost)' }}>{f.path.replace('ctx.', '')}</span>
                    {on && <I.check size={12} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {selField && (
          <div style={{ marginTop: 8, padding: 10, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', fontSize: 11.5, lineHeight: 1.6 }}>
            <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)' }}>{selField.path}</span>
            <span style={{ color: 'var(--gb-text-muted)' }}> → </span>
            <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-secondary)' }}>{selField.val}</span>
          </div>
        )}
      </MiniFrame>
    );
  }

  /* ============ CODE deep snippet — examples + computed output ============ */
  const CTX = {
    order: { number: '4815162342', status: 'Shipped', total: 412.5, subtotal: 380, tracking: '1Z999AA10123456784' },
    contact: { firstName: 'jordan', lastName: 'lee', email: 'jordan.lee@example.com', phone: '5125551234' },
    account: { email: '' },
    items: [{ name: 'Titleist Pro V1', qty: 2, price: 54.99 }, { name: 'Callaway Chrome Soft', qty: 1, price: 44.99 }],
  };
  const hMock = {
    fmt: {
      currency: (n) => '$' + Number(n).toFixed(2),
      title: (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase()),
      upper: (s) => String(s || '').toUpperCase(),
    },
    coalesce: (...a) => a.find((x) => x != null && String(x).length > 0) ?? '',
    regex: (str, pat, g = 1, f = '') => { try { const m = new RegExp(pat, f).exec(String(str)); return m ? (m[g] != null ? m[g] : m[0]) : ''; } catch (e) { return ''; } },
    sum: (arr, key) => arr.reduce((s, o) => s + Number(key ? o[key] : o || 0), 0),
    normalizePhone: (v) => '+1' + String(v || '').replace(/\D/g, ''),
  };
  const CODE_EXAMPLES = [
    { id: 'fmt', label: 'Format', async: false, body: "return 'Your total is ' +\n  h.fmt.currency(ctx.order.total);", run: () => 'Your total is ' + hMock.fmt.currency(CTX.order.total) },
    { id: 'name', label: 'Tidy name', async: false, body: "return h.fmt.title(\n  ctx.contact.firstName + ' ' +\n  ctx.contact.lastName);", run: () => hMock.fmt.title(CTX.contact.firstName + ' ' + CTX.contact.lastName) },
    { id: 'coalesce', label: 'Fallback', async: false, body: "return h.coalesce(\n  ctx.contact.email,\n  ctx.account.email,\n  'no email on file');", run: () => hMock.coalesce(CTX.contact.email, CTX.account.email, 'no email on file') },
    { id: 'sum', label: 'Sum items', async: false, body: "return ctx.items.length + ' items · ' +\n  h.fmt.currency(h.sum(ctx.items,'price'));", run: () => CTX.items.length + ' items · ' + hMock.fmt.currency(hMock.sum(CTX.items, 'price')) },
    { id: 'regex', label: 'Regex', async: false, body: "// pull the digits after the 1Z prefix\nreturn h.regex(ctx.order.tracking,\n  '1Z(\\\\w+)');", run: () => hMock.regex(CTX.order.tracking, '1Z(\\w+)') },
    { id: 'server', label: 'Server call', async: true, body: "// fetch the brand catalog (CORS-safe)\nconst cat = await h.fetchJson(\n  'https://api.golfballs.com/stock');\nreturn cat.find(p =>\n  p.inStock)?.name;", run: () => 'Titleist Pro V1' },
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
          <Tag tone={ex.async ? 'warning' : 'brand'} size="xs">{ex.async ? 'ASYNC · awaits server' : 'SYNC'}</Tag>
          <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>resolves to</span>
        </div>
        <div style={{ marginTop: 6, padding: '8px 11px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', fontFamily: 'var(--gb-font-mono)', fontSize: 12, color: 'var(--gb-brand-label)' }}>
          {ex.run()}{ex.async && <span style={{ color: 'var(--gb-text-muted)', marginLeft: 6 }}>// from live catalog</span>}
        </div>
      </MiniFrame>
    );
  }

  /* ============ SMART OPTIONS (⚡) — the per-variable transform popover ============ */
  const SMART_TABS = [
    { id: 'fallback', label: 'Fallback', icon: () => <I.bolt size={13} /> },
    { id: 'extract', label: 'Extract', icon: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 5v6M12 12v6M6 12h12" /></svg> },
    { id: 'transform', label: 'Transform', icon: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V5h11v2M9 5v14M7 19h4M17 13v-1h5v1M19.5 12v7M18 19h3" /></svg> },
    { id: 'conditional', label: 'Conditional', icon: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4v16M19 4v16M5 12h14" /></svg> },
    { id: 'format', label: 'Format', icon: () => <I.filter size={13} /> },
  ];
  const SMART_TRANSFORMS = [
    { id: 'upper', label: 'UPPERCASE', fn: (s) => s.toUpperCase() },
    { id: 'lower', label: 'lowercase', fn: (s) => s.toLowerCase() },
    { id: 'titleCase', label: 'Title Case', fn: (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()) },
    { id: 'capitalize', label: 'Capitalize first', fn: (s) => s.charAt(0).toUpperCase() + s.slice(1) },
    { id: 'trim', label: 'Trim whitespace', fn: (s) => s.trim() },
    { id: 'firstWord', label: 'First word only', fn: (s) => s.split(/\s+/)[0] },
  ];
  const SMART_FORMATS = [
    { id: 'number', label: 'Number', inp: '1234.5', out: '1,234.5' },
    { id: 'currency', label: 'Currency', inp: '412.5', out: '$412.50' },
    { id: 'date', label: 'Date', inp: '2026-06-03', out: '6/3/2026' },
    { id: 'percent', label: 'Percent', inp: '0.15', out: '15%' },
  ];
  const SMART_SCOPES = ['Sentence', 'Line', 'Paragraph'];
  function SmartOptionsSnippet() {
    const [tab, setTab] = useState('transform');
    const [tf, setTf] = useState('titleCase');
    const [fmt, setFmt] = useState('currency');
    const [pat, setPat] = useState('ORD-(\\d+)');
    const [fb, setFb] = useState('there');
    const [scope, setScope] = useState('Sentence');
    const tSample = 'marcus chen';
    const tActive = SMART_TRANSFORMS.find((t) => t.id === tf);
    const fActive = SMART_FORMATS.find((f) => f.id === fmt);
    let extractOut = '';
    try { const m = new RegExp(pat).exec('Re: order ORD-28104 arrived crushed'); extractOut = m ? (m[1] != null ? m[1] : m[0]) : '— no match —'; } catch (e) { extractOut = '— invalid regex —'; }
    const resultRow = (a, b) => (
      <div style={{ marginTop: 10, padding: '8px 11px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', fontSize: 12, fontFamily: 'var(--gb-font-mono)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--gb-text-muted)' }}>{a}</span>
        <I.chevr size={11} style={{ color: 'var(--gb-text-ghost)' }} />
        <span style={{ color: 'var(--gb-brand-label)', fontWeight: 600 }}>{b}</span>
      </div>
    );
    return (
      <MiniFrame width={430} label="editor · smart options" pad>
        {/* the variable this popover is attached to */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <VarChip name="customer" />
          <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>· Smart options</span>
          <span style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: 5, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.bolt size={12} /></span>
        </div>
        {/* tab strip */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', padding: 3 }}>
          {SMART_TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 2px', borderRadius: 'var(--gb-r-sm)', border: 'none', cursor: 'pointer', background: on ? 'var(--gb-brand-tint-medium)' : 'transparent', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', fontFamily: 'inherit', transition: 'background .13s, color .13s' }}>
                {t.icon()}
                <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
        {/* tab content */}
        <div style={{ marginTop: 10, minHeight: 132 }}>
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
          {tab === 'extract' && (
            <Field label="Regex pattern" hint="Capture group 1 of the resolved value is used">
              <Input size="sm" mono value={pat} onChange={setPat} leading={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 5v6M6 12h12" /></svg>} />
            </Field>
          )}
          {tab === 'fallback' && (
            <Field label="Fallback value" hint="Used when the variable resolves empty">
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
        {/* live result */}
        {tab === 'transform' && resultRow(`"${tSample}"`, `"${tActive.fn(tSample)}"`)}
        {tab === 'format' && resultRow(fActive.inp, fActive.out)}
        {tab === 'extract' && resultRow('"…order ORD-28104…"', `"${extractOut}"`)}
        {tab === 'fallback' && resultRow('(empty)', `"${fb || '—'}"`)}
        {tab === 'conditional' && resultRow('(empty)', `whole ${scope.toLowerCase()} removed`)}
      </MiniFrame>
    );
  }

  /* ---- OR-fallback + conditional drop ---- */
  function SmartSnippet() {
    const [hasTracking, setHasTracking] = useState(true);
    const resolved = { first_name: 'Jordan', order_no: '4815162342', tracking: hasTracking ? '1Z999AA10123456784' : '' };
    const text = "Hi {{first_name}},\n\nYour order {{order_no}} shipped.\n\nYour tracking number is {{tracking}}.";
    return (
      <MiniFrame width={400} label="template · smart drop" pad>
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

  function HelperTable() {
    const rows = [
      ['h.fmt.currency(n)', 'Format a number as money — $412.50'],
      ['h.fmt.date(v, "M/d/yyyy")', 'Format a date'],
      ['h.fmt.title / upper / lower', 'Re-case text'],
      ['h.coalesce(a, b, …)', 'First non-empty argument'],
      ['h.regex(str, pattern, group?)', 'Pull a capture group out of text'],
      ['h.sum(arr, key?) · h.pick(arr, key)', 'Total / pluck a field across a list'],
      ['h.parseNumber / parseDate / normalizePhone', 'Coerce messy values'],
      ['await h.fetchJson(url) · h.fetchText(url)', 'GET a URL through the background (CORS-safe)'],
      ['await h.fetchText(url)', 'Read text from an allowlisted HTTPS resource'],
      ['h.dom(sel) · h.domAll(sel) · h.domText(sel)', 'Read straight from the live page DOM'],
    ];
    return (
      <table className="spectable">
        <thead><tr><th>Helper</th><th>What it does</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r[0]}><td><code>{r[0]}</code></td><td>{r[1]}</td></tr>)}</tbody>
      </table>
    );
  }

  function TemplatesPage() {
    return (
      <div className="prose">
        <div className="eyebrow">Daily Driver</div>
        <h1 className="title">Email Templates</h1>
        <p className="lede">
          Templates are pre-written emails that fill themselves in. You write the wording once, drop in
          <code>{'{{variables}}'}</code> where the order's details should go, and the extension resolves them
          live every time you send. Below: how variables work — including a deep look at <strong>Schema</strong> and
          <strong> Code</strong> — plus smart fallbacks and A/B variations, each on a real, interactive snippet.
        </p>

        {TourBox && (<>
          <TourBox n={1} eyebrow="The idea" title="Write once, fill automatically" live={<BodySnippet />} wide>
            <p>A template has a <strong>subject</strong> and a <strong>body</strong>. Anywhere you'd type a customer-specific detail, you write a variable in <code>{'{{double braces}}'}</code> instead.</p>
            <p>Flip the snippet between <strong>Template</strong> (what you write) and <strong>Resolved</strong> (what the customer receives). The braces become real values pulled from the order.</p>
          </TourBox>

          <TourBox n={2} eyebrow="Where values come from" title="Four kinds of variable" live={<VarCreatorSnippet />} flip wide>
            <p>When you add a variable, you choose its <strong>source kind</strong>:</p>
            <ul>
              <li><strong>Schema</strong> — point at a field in the page's data (the durable, no-code choice). Available for orders and accounts.</li>
              <li><strong>Code</strong> — compute a value with a snippet of JavaScript when a plain field isn't enough.</li>
              <li><strong>Literal</strong> — a fixed string, the same every time.</li>
              <li><strong>Regex</strong> — pull a capture group out of an inbound email (case templates).</li>
            </ul>
            <p>Schema and Code do the heavy lifting — the next two sections go deep on each.</p>
          </TourBox>

          <TourBox n={3} eyebrow="Deep dive · Schema" title="Point at a field, no code" live={<SchemaSnippet />}>
            <p>A <strong>Schema</strong> variable binds to a field in the page's extracted data tree — the same structured <code>ctx</code> the engine builds from the order, contact, line items, and account. You just <strong>search and pick</strong>; no selectors, no script.</p>
            <p>Because it reads the structured data (not the page's HTML), it <strong>survives site redesigns</strong> — when the CRM moves a button, a CSS-selector variable breaks, but <code>ctx.order.total</code> keeps resolving. This is the recommended choice for anything that's simply “a field on the page,” on <strong>order</strong> and account templates alike.</p>
            <p>Try the picker — searching narrows the tree; selecting shows the exact path and a sample value.</p>
          </TourBox>

          <TourBox n={4} eyebrow="Deep dive · Code" title="Compute anything" live={<CodeSnippet />} flip wide>
            <p>A <strong>Code</strong> variable runs a small JavaScript block and returns the string to drop in. Reach for it when a value needs to be <em>computed</em> — formatted, combined, looked up, or fetched.</p>
            <p>Your code receives three things:</p>
            <ul>
              <li><code>ctx</code> — the page's structured data (the same tree Schema picks from).</li>
              <li><code>vars</code> — variables resolved <em>before</em> this one, so you can build on them.</li>
              <li><code>h</code> — a toolbox of helpers: formatters, <code>coalesce</code>, <code>regex</code>, list math, and server calls.</li>
            </ul>
            <p>Click through the examples. <strong>Sync</strong> blocks resolve instantly; an <strong>async</strong> block (it uses <code>await h.fetchJson(...)</code>) can pull from a server — fetched through the extension's background so it's never blocked by CORS.</p>
          </TourBox>
        </>)}

        <h3 className="sub">The <code>h</code> helper toolbox</h3>
        <p>Everything available inside a Code variable. Anything that hits the network is <code>await</code>-ed and routed through the background worker.</p>
        <HelperTable />

        <div className="docnote warn">
          <span className="dn-ico">{I.alert({ size: 15 })}</span>
          <div className="dn-b">
            <div className="dn-t">Guard rails on Code</div>
            <p style={{ margin: 0 }}>Code runs in a soft sandbox: a raw <code>fetch()</code>, <code>chrome.*</code>, <code>eval</code>, <code>while(true)</code> and friends are blocked (use the <code>h.*</code> helpers instead), bodies are length-capped, and async blocks time out after 10s so a hung request can't freeze a send. Templates are authored by you, never imported from outside.</p>
          </div>
        </div>

        {TourBox && (<>
          <TourBox n={5} eyebrow="The ⚡ menu" title="Smart options on any variable" live={<SmartOptionsSnippet />} flip wide>
            <p>Every variable in the table has a little <strong>lightning bolt</strong>. Click it to open <strong>Smart options</strong> — quick post-processing that runs on the resolved value, no matter where the value came from. Five tabs:</p>
            <ul>
              <li><strong>Fallback</strong> — a default to use when it resolves empty.</li>
              <li><strong>Extract</strong> — pull a capture group out with a regex (e.g. <code>ORD-(\d+)</code>).</li>
              <li><strong>Transform</strong> — UPPERCASE, lowercase, Title Case, Capitalize, Trim, or First-word-only.</li>
              <li><strong>Conditional</strong> — drop the surrounding sentence / line / paragraph when empty.</li>
              <li><strong>Format</strong> — render as Number, Currency, Date, or Percent.</li>
            </ul>
            <p>So a raw <code>order.total</code> of <code>412.5</code> becomes <strong>$412.50</strong> with two clicks — no Code variable needed. Switch tabs in the snippet; the result preview updates live.</p>
          </TourBox>

          <TourBox n={6} eyebrow="Conditional, in action" title="Empty values, gracefully dropped" live={<SmartSnippet />}>
            <p>The <strong>Conditional</strong> smart option (and the OR-fallback <code>{'{{a|b}}'}</code> syntax) keep emails clean when data is missing.</p>
            <p>Here the tracking sentence is marked conditional. Toggle the tracking number off and the whole sentence is removed — instead of leaving an awkward “Your tracking number is .” Mark a variable conditional from the <strong>Conditional</strong> tab of its ⚡ menu.</p>
          </TourBox>

          <TourBox n={7} eyebrow="A/B versions" title="Variations" live={<VariationsSnippet />} flip>
            <p>A template can hold several <strong>variations</strong> — alternate wordings. The pool always includes <strong>Variation 1</strong> (the base body) plus any you add.</p>
            <p>In the popup, selecting the template name sends a <strong>random</strong> variation each time; expand the row to <strong>pin</strong> one. The <code>3v</code> chip counts the pool.</p>
          </TourBox>
        </>)}

        <h2 className="sec">When does a template show up?</h2>
        <p>
          Each template has a <strong>type</strong> — <strong>order</strong>, <strong>account/contact</strong>, or <strong>case</strong> — and optional <strong>rules</strong>. The popup only offers templates whose type fits the current page, and a template whose rules match the exact record (e.g. <em>status is Shipped</em>) jumps to the top under “Matched on this page.” That's the matching you saw on <a href="#popup">the Popup</a>.
        </p>

        <h2 className="sec">Recipient &amp; how it sends</h2>
        <table className="spectable">
          <thead><tr><th>Setting</th><th>What it controls</th></tr></thead>
          <tbody>
            <tr><td><b>To field</b></td><td><b>Auto</b> resolves the recipient from the page; <b>Manual</b> lets you fix an address or a variable.</td></tr>
            <tr><td><b>Reply mode</b></td><td><b>Standalone</b> starts a fresh email; <b>Reply</b> threads onto the prior message (Send reads “Reply”).</td></tr>
            <tr><td><b>Sender</b></td><td>Which account the email comes from — optionally randomized across a set.</td></tr>
            <tr><td><b>Preset task</b></td><td>Optionally log a CRM task automatically when the email is sent.</td></tr>
          </tbody>
        </table>

        <div className="docnote info" style={{ marginTop: 24 }}>
          <span className="dn-ico">{I.bolt({ size: 15 })}</span>
          <div className="dn-b">
            <div className="dn-t">Building templates lives in the Manager</div>
            <p style={{ margin: 0 }}>You create and edit templates from the popup's <strong>Manage</strong> button. The editor has the full subject/body editor, the variable table (with the Schema picker and the Code editor shown above), the variations panel, and the rules builder.</p>
          </div>
        </div>
      </div>
    );
  }

  window.GBPages['templates'] = { title: 'Email Templates', group: 'Daily Driver', icon: 'edit', render: () => <TemplatesPage /> };
})();
