import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import {
  Btn, IconBtn, Tag,
  Input, Dropdown, Field,
  SwitchTag, SectionLabel, Card,
  I, Icon,
  BodyVar, SmartModal, AddVariableModal,
  VariableTable, OrderRules, CaseRules, AccountRules,
} from '../ui/index.js';

/* ─────────────────────────────────────────────────────────────
   editor-templates.jsx
   Mounts into #ed-form. editor.js calls window.__gbOpenTemplate(tpl).
   The .ed-form CSS already handles max-width:750px + padding:20px 0 40px,
   so this component adds NO extra horizontal padding.
───────────────────────────────────────────────────────────── */

/* ── Extra icons ──────────────────────────────────────────── */
const RTE = {
  bold:      p => <Icon {...p}><path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z"/><path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z"/></Icon>,
  italic:    p => <Icon {...p}><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></Icon>,
  underline: p => <Icon {...p}><path d="M6 3v7a6 6 0 0012 0V3"/><line x1="4" y1="21" x2="20" y2="21"/></Icon>,
  strike:    p => <Icon {...p}><path d="M16 4H9a3 3 0 00-2.83 4M14 12a4 4 0 010 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></Icon>,
  text:      p => <Icon {...p}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></Icon>,
  paint:     p => <Icon {...p}><path d="M19 7v4H5V7"/><rect x="3" y="11" width="18" height="10" rx="2"/></Icon>,
  listNum:   p => <Icon {...p}><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></Icon>,
  fontSize:  p => <Icon {...p}><polyline points="4 7 4 4 20 4 20 7"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="9" y1="20" x2="15" y2="20"/></Icon>,
  alignL:    p => <Icon {...p}><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></Icon>,
  alignC:    p => <Icon {...p}><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/></Icon>,
  alignR:    p => <Icon {...p}><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></Icon>,
  list:      p => <Icon {...p}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></Icon>,
  link:      p => <Icon {...p}><path d="M10 13a5 5 0 007 0l4-4a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-4 4a5 5 0 007 7l1-1"/></Icon>,
  quote:     p => <Icon {...p}><path d="M3 7c0-2 1-3 3-3v3c0 1 1 2 1 3v2H3zM14 7c0-2 1-3 3-3v3c0 1 1 2 1 3v2h-5z"/></Icon>,
  bolt:      p => <Icon {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></Icon>,
  doc:       p => <Icon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></Icon>,
  inbox:     p => <Icon {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></Icon>,
  user:      p => <Icon {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></Icon>,
};

/* ────────────────────────────────────────────────────────────
   Convert old template format → new
   Old: tpl.vars = { name: { type, builtin?, selector?, pattern? } }
   New: [{ name, kind, config, resolved, status, smart }]
──────────────────────────────────────────────────────────── */
function convertVars(tpl) {
  const typeId = tpl.type === 'email' ? 'order' : (tpl.type || 'order');

  // Case templates may already have caseVars in new format
  if (typeId === 'case' && Array.isArray(tpl.caseVars) && tpl.caseVars.length > 0) {
    return tpl.caseVars.map(v => ({
      name:     v.name,
      kind:     v.kind || 'literal',
      config:   v.config || '',
      resolved: v.resolved ?? null,
      status:   v.status  || 'miss',
      smart:    v.smart   || {},
    }));
  }

  // Convert old vars object
  const varsObj  = tpl.vars     || {};
  const order    = tpl.varOrder || Object.keys(varsObj);

  return order.filter(n => varsObj[n]).map(name => {
    const v = varsObj[name];
    let kind, config;
    if (v.type === 'builtin') {
      kind   = 'builtin';
      config = v.builtin || 'page.data';
    } else if (v.type === 'selector') {
      kind   = 'dom';
      config = v.selector || '';
    } else if (v.type === 'regex') {
      kind   = 'regex';
      config = v.pattern  || '';
    } else {
      kind   = 'literal';
      config = v.value || v.selector || '';
    }
    return { name, kind, config, resolved: null, status: 'miss', smart: v.smart || {} };
  });
}

/* New-format variable → stored definition (also the resolver's input shape). */
function varDef(v) {
  if (v.kind === 'builtin')                  return { type: 'builtin',  builtin:  v.config };
  if (v.kind === 'dom' || v.kind === 'pick') return { type: 'selector', selector: v.config };
  if (v.kind === 'regex')                    return { type: 'regex',    pattern:  v.config };
  return { type: 'literal', value: v.config };
}

/* ────────────────────────────────────────────────────────────
   Render a text string with {{varname}} tokens as BodyVar chips
──────────────────────────────────────────────────────────── */
function renderTokens(text, vars, onOpenSmart) {
  if (!text) return null;
  const parts = String(text).split(/({{[^}]+}})/g);
  return parts.map((part, i) => {
    const m = part.match(/^{{([^}]+)}}$/);
    if (m) {
      const name   = m[1].trim();
      const varObj = vars.find(v => v.name === name) || { name, status: 'miss', smart: {} };
      return <BodyVar key={i} v={varObj} onOpenSmart={onOpenSmart} />;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/* ────────────────────────────────────────────────────────────
   Convert stored HTML body to paragraphs with BodyVar chips
──────────────────────────────────────────────────────────── */
function renderBodyHtml(html, vars, onOpenSmart) {
  if (!html) return <span style={{ color: 'var(--gb-text-ghost)', fontSize: 11 }}>No body yet — add content above.</span>;

  // Strip HTML tags to get paragraphs
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const blocks = [];

  // Collect paragraphs / line breaks
  const nodes = tmp.childNodes.length ? tmp.childNodes : [tmp];
  nodes.forEach(node => {
    const txt = node.textContent || '';
    if (txt.trim()) blocks.push(txt.trim());
  });

  if (!blocks.length) {
    const plain = tmp.textContent.trim();
    if (!plain) return <span style={{ color: 'var(--gb-text-ghost)', fontSize: 11 }}>Empty body.</span>;
    return <p style={{ margin: '0 0 8px', fontSize: 11.5, lineHeight: 1.6 }}>{renderTokens(plain, vars, onOpenSmart)}</p>;
  }

  return blocks.map((block, i) => (
    <p key={i} style={{ margin: i < blocks.length - 1 ? '0 0 8px' : 0, fontSize: 11.5, lineHeight: 1.6 }}>
      {renderTokens(block, vars, onOpenSmart)}
    </p>
  ));
}

/* ────────────────────────────────────────────────────────────
   Type metadata
──────────────────────────────────────────────────────────── */
const TYPE_META = {
  order: {
    icon: <RTE.doc />,
    desc: 'Shown in the popup on order pages. Variables resolve against live page DOM.',
    callout: { tone: 'info',  title: 'Smart triggers', body: 'Activates when auto-match rules pass on an order page.' },
    recipientOptions: ['Smart detect', 'Pick from page', 'Fixed email'],
  },
  case: {
    icon: <RTE.inbox />,
    desc: 'Shown in the case email modal. Matches From / Subject / Body of the inbound email.',
    callout: { tone: 'brand', title: 'Case reply template', body: 'Match rules and variables both run against the inbound email.' },
    recipientOptions: ['Reply to sender', 'Pick from case', 'Fixed email'],
  },
  account: {
    icon: <RTE.user />,
    desc: "Shown in the popup on account pages. Variables pull from the contact's Solr record.",
    callout: { tone: 'info',  title: 'Account conditions', body: "Variables pull from the contact's live Solr record." },
    recipientOptions: ['Contact email', 'Account email', 'Fixed email'],
  },
};

/* ────────────────────────────────────────────────────────────
   Compact RTE toolbar + body surface
──────────────────────────────────────────────────────────── */
function TBtn({ icon, label, active, onClick, mono }) {
  return (
    <button onClick={onClick} style={{
      height: 24, padding: '0 5px', borderRadius: 4,
      background: active ? 'var(--gb-brand-tint-medium)' : 'transparent',
      color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
      border: 'none', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontFamily: mono ? 'var(--gb-font-mono)' : 'inherit',
      fontSize: 10.5, fontWeight: 600,
    }}>
      {icon && React.cloneElement(icon, { size: 11 })}
      {label && <span>{label}</span>}
    </button>
  );
}
const Sep = () => <div style={{ width: 1, height: 14, background: 'var(--gb-border-subtle)', margin: '0 3px' }} />;

function EditorPane({ body, align, setAlign, marks, setMarks }) {
  const toggle = k => setMarks(m => ({ ...m, [k]: !m[k] }));
  return (
    <div style={{ border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden', background: 'var(--gb-surface-canvas)' }}>
      <div style={{ padding: '5px 8px', background: 'var(--gb-surface-modal)', borderBottom: '1px solid var(--gb-border-subtle)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <TBtn label="Para" /><TBtn label="Geist" mono /><TBtn label="12px" mono icon={<RTE.fontSize />} />
        <Sep />
        <TBtn icon={<RTE.bold />}      active={marks.bold}      onClick={() => toggle('bold')} />
        <TBtn icon={<RTE.italic />}    active={marks.italic}    onClick={() => toggle('italic')} />
        <TBtn icon={<RTE.underline />} active={marks.underline} onClick={() => toggle('underline')} />
        <TBtn icon={<RTE.strike />}    active={marks.strike}    onClick={() => toggle('strike')} />
        <Sep />
        <button title="Text color" style={{ height: 24, padding: '0 5px', borderRadius: 4, background: 'transparent', color: 'var(--gb-text-tertiary)', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <RTE.text size={11} />
            <span style={{ position: 'absolute', bottom: -1, left: 0, right: 0, height: 2, background: 'var(--gb-brand-label)', borderRadius: 1 }} />
          </span>
          <I.chevd size={8} style={{ opacity: .6 }} />
        </button>
        <button title="Highlight" style={{ height: 24, padding: '0 5px', borderRadius: 4, background: 'transparent', color: 'var(--gb-text-tertiary)', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <RTE.paint size={11} />
          <I.chevd size={8} style={{ opacity: .6 }} />
        </button>
        <Sep />
        <div style={{ display: 'inline-flex', padding: 1, borderRadius: 4, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>
          {[{ id: 'left', icon: <RTE.alignL /> }, { id: 'center', icon: <RTE.alignC /> }, { id: 'right', icon: <RTE.alignR /> }].map(o => (
            <button key={o.id} onClick={() => setAlign(o.id)} style={{ width: 20, height: 18, borderRadius: 3, background: align === o.id ? 'var(--gb-brand-tint-medium)' : 'transparent', color: align === o.id ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {React.cloneElement(o.icon, { size: 9 })}
            </button>
          ))}
        </div>
        <Sep />
        <TBtn icon={<RTE.list />} /><TBtn icon={<RTE.listNum />} /><TBtn icon={<RTE.quote />} /><TBtn icon={<RTE.link />} />
      </div>
      <div style={{ padding: '16px 20px 20px', background: 'var(--gb-surface-canvas)', color: 'var(--gb-text-secondary)', textAlign: align, minHeight: 160 }}>
        {body}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Empty state
──────────────────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 280, gap: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-sans)' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <I.mail size={18} style={{ opacity: .4 }} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-tertiary)' }}>Select a template from the sidebar</div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Template editor — compact for ~700px panel
──────────────────────────────────────────────────────────── */
function TemplateEditor({ tpl, onDelete }) {
  const typeId = tpl.type === 'email' ? 'order' : (tpl.type || 'order');
  const meta   = TYPE_META[typeId] || TYPE_META.order;

  const [vars,     setVars]     = useState(() => convertVars(tpl));
  const [enabled,  setEnabled]  = useState(tpl.enabled !== false);
  const [name,     setName]     = useState(tpl.name || '');
  const [ruleData, setRuleData] = useState(null);
  const [resolvedMap, setResolvedMap] = useState({});
  const [align,    setAlign]    = useState('left');
  const [marks,    setMarks]    = useState({ bold: false, italic: false, underline: false, strike: false });
  const [smartFor, setSmartFor] = useState(null);
  const [showAdd,  setShowAdd]  = useState(false);
  const [recipient, setRecipient] = useState(meta.recipientOptions[0]);

  const handleSaveSmart = smart => {
    setVars(vs => vs.map(v => v.name === smartFor.name ? { ...v, smart } : v));
    setSmartFor(null);
  };
  const handleAddVar    = ({ name, kind, config }) => {
    setVars(vs => [...vs, { name, kind, config, resolved: null, status: 'miss', smart: {} }]);
    setShowAdd(false);
  };
  const handleDeleteVar = name => setVars(vs => vs.filter(v => v.name !== name));

  /* ── Auto-save ──────────────────────────────────────────────
     No Save button: the editor merges its state onto the opened
     template and persists (debounced) on every change. Fields the
     React editor doesn't yet own (subject, body, type, toField …)
     pass through untouched via the {...tpl} spread. */
  function buildTemplate() {
    const next = { ...tpl, name: name.trim() || 'Untitled', enabled, updatedAt: Date.now() };
    if (typeId === 'case') {
      next.caseVars = vars;
    } else {
      const obj = {};
      vars.forEach((v) => {
        const base = (tpl.vars && tpl.vars[v.name]) ? { ...tpl.vars[v.name] } : {};
        obj[v.name] = { ...base, ...varDef(v), smart: v.smart || {} };
      });
      next.vars = obj;
      next.varOrder = vars.map((v) => v.name);
    }
    // Rules only overwrite storage once the user actually edits them.
    if (ruleData != null) {
      if (typeId === 'account')   next.accountConditions = ruleData;
      else if (typeId === 'case') next.caseRules = ruleData.map((r) => ({ field: r.left, op: r.op, value: r.right }));
      else                        next.rules = ruleData.map((r) => ({ selector: r.left, operator: r.op, value: r.right }));
    }
    return next;
  }

  const skipSave  = useRef(true);
  const saveTimer = useRef(0);
  useEffect(() => {
    if (skipSave.current) { skipSave.current = false; return undefined; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (typeof window.__gbSaveTemplate === 'function') window.__gbSaveTemplate(buildTemplate());
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [name, enabled, vars, ruleData]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Live resolution ────────────────────────────────────────
     The editor window has no page DOM, so it asks the order /
     account tab (via editor.js' __gbResolveVars bridge) to resolve
     each variable, then overlays the values onto the table. */
  const varSig = vars.map((v) => `${v.name} ${v.kind} ${v.config}`).join('');
  useEffect(() => {
    if (typeof window.__gbResolveVars !== 'function' || vars.length === 0) {
      setResolvedMap({});
      return undefined;
    }
    let cancelled = false;
    const obj = {};
    vars.forEach((v) => { obj[v.name] = varDef(v); });
    Promise.resolve(window.__gbResolveVars(obj)).then((res) => {
      if (cancelled) return;
      const resolved = (res && res.resolved) || {};
      const map = {};
      vars.forEach((v) => {
        const val = resolved[v.name];
        map[v.name] = { resolved: val ? String(val) : null, status: val ? 'ok' : 'miss' };
      });
      setResolvedMap(map);
    });
    return () => { cancelled = true; };
  }, [varSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const RulesComp = typeId === 'order' ? OrderRules : typeId === 'case' ? CaseRules : AccountRules;

  const S = { // compact spacing constants
    mb8:  { marginBottom: 8  },
    mb12: { marginBottom: 12 },
    mb14: { marginBottom: 14 },
    label: { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--gb-text-muted)', marginBottom: 4, display: 'block' },
  };

  // Overlay live-resolved values onto the variable definitions for display.
  const displayVars = vars.map((v) => {
    const r = resolvedMap[v.name];
    return r ? { ...v, resolved: r.resolved, status: r.status } : v;
  });

  return (
    <div style={{ fontFamily: 'var(--gb-font-sans)', color: 'var(--gb-text-secondary)' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-sm)', flexShrink: 0, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {React.cloneElement(meta.icon, { size: 13 })}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ flex: '0 1 auto', minWidth: 0, fontSize: 14, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name || 'New Template'}
            </span>
            <Tag tone="neutral" size="xs" mono style={{ flexShrink: 0 }}>{typeId.toUpperCase()}</Tag>
            <SwitchTag on={enabled} label={enabled ? 'Enabled' : 'Disabled'} onClick={() => setEnabled(e => !e)} size="sm" style={{ flexShrink: 0 }} />
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.desc}</div>
        </div>
        <Btn variant="danger" size="sm" icon={<I.trash />} onClick={onDelete}>Delete</Btn>
      </div>

      {/* ── Meta row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 12 }}>
        <Field label="Template name">
          <Input value={name} placeholder="e.g. Charge Error Follow-Up" size="sm" onChange={setName} />
        </Field>
        <Field label="Recipient (to)">
          <Dropdown
            size="sm"
            value={recipient}
            options={meta.recipientOptions.map((o) => ({ id: o, label: o }))}
            onChange={setRecipient}
          />
        </Field>
      </div>

      {/* ── Rules — imports the template's saved rules/conditions ── */}
      <div style={S.mb14}>
        <RulesComp
          initial={
            typeId === 'account' ? tpl.accountConditions
              : typeId === 'case' ? tpl.caseRules
                : tpl.rules
          }
          onChange={setRuleData}
        />
      </div>

      {/* ── Subject ── */}
      <div style={S.mb12}>
        <span style={S.label}>Subject</span>
        <div style={{ padding: '7px 10px', background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)', fontSize: 12, color: 'var(--gb-text-primary)', fontWeight: 600, lineHeight: 1.5, minHeight: 32 }}>
          {renderTokens(tpl.subject || '', displayVars, setSmartFor)}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={S.mb12}>
        <span style={S.label}>Email body</span>
        <EditorPane
          body={renderBodyHtml(tpl.body || '', displayVars, setSmartFor)}
          align={align} setAlign={setAlign}
          marks={marks} setMarks={setMarks}
        />
      </div>

      {/* ── Variables ── */}
      <div style={S.mb12}>
        <VariableTable typeId={typeId} vars={displayVars} onAdd={() => setShowAdd(true)} onDelete={handleDeleteVar} />
      </div>

      <AnimatePresence>
        {smartFor && <SmartModal key="smart" variable={smartFor} onClose={() => setSmartFor(null)} onSave={handleSaveSmart} />}
        {showAdd  && <AddVariableModal key="add" typeId={typeId} onClose={() => setShowAdd(false)} onAdd={handleAddVar} />}
      </AnimatePresence>
    </div>
  );
}

/* ── Root ───────────────────────────────────────────────── */
function TemplateEditorRoot() {
  const [tpl, setTpl] = useState(null);

  useEffect(() => {
    window.__gbOpenTemplate = template => setTpl({ ...template });
    return () => { delete window.__gbOpenTemplate; };
  }, []);

  if (!tpl) return <EmptyState />;

  return (
    <TemplateEditor
      key={tpl.id}
      tpl={tpl}
      onDelete={() => { if (typeof window.deleteTemplate === 'function') window.deleteTemplate(); }}
    />
  );
}

/* ── Mount ─────────────────────────────────────────────── */
function mount() {
  const host = document.getElementById('ed-form');
  if (!host || host.__gbTemplatesMounted) return;
  host.__gbTemplatesMounted = true;
  // Padding on the host itself, so the top gap shows regardless of layout.
  host.style.padding = '24px 0 40px';
  ensureTheme();
  createRoot(host).render(<TemplateEditorRoot />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
