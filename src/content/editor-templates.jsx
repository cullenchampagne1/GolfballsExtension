import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import {
  Btn, Tag,
  Input, Dropdown, Field,
  SwitchTag, Segmented,
  I, Icon,
  SmartModal, SignatureModal,
  RichTextEditor,
  VariableTable, OrderRules, CaseRules, AccountRules,
} from '../ui/index.js';

/* ─────────────────────────────────────────────────────────────
   editor-templates.jsx
   Mounts into #ed-form. editor.js calls window.__gbOpenTemplate(tpl).
   The .ed-form CSS already handles max-width:750px + padding:20px 0 40px,
   so this component adds NO extra horizontal padding.
───────────────────────────────────────────────────────────── */

/* ── Template-type icons ──────────────────────────────────── */
const RTE = {
  doc:   p => <Icon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></Icon>,
  inbox: p => <Icon {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></Icon>,
  user:  p => <Icon {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></Icon>,
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
      ...(v.source ? { source: v.source } : {}),
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
    return {
      name, kind, config,
      ...(v.type === 'regex' ? { source: v.source || 'body' } : {}),
      resolved: null, status: 'miss', smart: v.smart || {},
    };
  });
}

/* New-format variable → stored definition (also the resolver's input shape).
   Regex carries `source` (body|subject|from|html) so the resolver knows
   which inbound field to scan. */
function varDef(v) {
  if (v.kind === 'builtin') return { type: 'builtin',  builtin:  v.config };
  if (v.kind === 'dom')     return { type: 'selector', selector: v.config };
  if (v.kind === 'regex')   return { type: 'regex',    pattern:  v.config, source: v.source || 'body' };
  return { type: 'literal', value: v.config };
}

/* ────────────────────────────────────────────────────────────
   Type metadata
──────────────────────────────────────────────────────────── */
const TYPE_META = {
  order: {
    icon: <RTE.doc />, label: 'Order',
    desc: 'Shown in the popup on order pages. Variables resolve against live page DOM.',
    recipientOptions: [
      { label: 'Smart detect',   toType: 'auto' },
      { label: 'Pick from page', toType: 'selector' },
      { label: 'Fixed email',    toType: 'literal' },
    ],
  },
  case: {
    icon: <RTE.inbox />, label: 'Case',
    desc: 'Shown in the case email modal. Matches From / Subject / Body of the inbound email.',
    recipientOptions: [
      { label: 'Reply to sender', toType: 'auto' },
      { label: 'Pick from case',  toType: 'selector' },
      { label: 'Fixed email',     toType: 'literal' },
    ],
  },
  account: {
    icon: <RTE.user />, label: 'Account',
    desc: "Shown in the popup on account pages. Variables pull from the contact's Solr record.",
    recipientOptions: [
      { label: 'Contact email', toType: 'auto' },
      { label: 'Fixed email',   toType: 'literal' },
    ],
  },
};

/* Type-tab options — feeds the design-spec Segmented control at the top
   of the template editor. */
const TYPE_OPTIONS = Object.entries(TYPE_META).map(([id, m]) => ({
  id, label: m.label, icon: m.icon,
}));

/* Map a stored toField → the recipient option index for a given type. */
function recipientIndexFor(typeId, toField) {
  const opts = (TYPE_META[typeId] || TYPE_META.order).recipientOptions;
  const t = (toField && toField.type) || 'auto';
  const i = opts.findIndex(o => o.toType === t);
  return i >= 0 ? i : 0;
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
  const initialType = tpl.type === 'email' ? 'order' : (tpl.type || 'order');
  const [typeId, setTypeId] = useState(initialType);
  const meta = TYPE_META[typeId] || TYPE_META.order;

  const [vars,     setVars]     = useState(() => convertVars(tpl));
  const [enabled,  setEnabled]  = useState(tpl.enabled !== false);
  const [name,     setName]     = useState(tpl.name || '');
  const [subject,  setSubject]  = useState(tpl.subject || '');
  const [body,     setBody]     = useState(tpl.body || '');
  const [ruleData, setRuleData] = useState(null);
  const [resolvedMap, setResolvedMap] = useState({});
  const [smartFor, setSmartFor] = useState(null);
  const [recipientIdx,  setRecipientIdx]  = useState(() => recipientIndexFor(initialType, tpl.toField));
  const [toFieldValue, setToFieldValue] = useState(
    (tpl.toField && (tpl.toField.value || tpl.toField.selector)) || '',
  );
  const [presetTaskId,   setPresetTaskId]   = useState(tpl.presetTaskId || '');
  const [presetTaskOpts, setPresetTaskOpts] = useState([]);
  // Explicit variations replace the legacy "Variation #N" sibling naming.
  // Each variation has its own subject + body; selection logic comes later.
  const [variations, setVariations] = useState(() =>
    (tpl.variations || []).map((v, i) => ({
      id:      v.id      || `var_${Date.now()}_${i}`,
      label:   v.label   || `Variation ${i + 1}`,
      subject: v.subject || '',
      body:    v.body    || '',
    })),
  );
  const recipOpt = meta.recipientOptions[recipientIdx] || meta.recipientOptions[0];

  function addVariation() {
    setVariations((vs) => [
      ...vs,
      { id: `var_${Date.now()}`, label: `Variation ${vs.length + 1}`, subject: '', body: '' },
    ]);
  }
  function removeVariation(id) {
    // Re-label sequentially so labels stay tidy after a delete.
    setVariations((vs) =>
      vs.filter((v) => v.id !== id).map((v, i) => ({ ...v, label: `Variation ${i + 1}` })),
    );
  }
  function updateVariation(id, patch) {
    setVariations((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  // Load task templates (account "Auto-Create Task on Send" picker).
  useEffect(() => {
    chrome.storage.local.get('noteTemplates', ({ noteTemplates }) => {
      const tasks = (noteTemplates || []).filter(t => t.subType === 'task');
      setPresetTaskOpts([
        { id: '', label: '— none —' },
        ...tasks.map(t => ({ id: t.id, label: t.name || 'Untitled task' })),
      ]);
    });
  }, []);

  // Switching template type resets recipient + rules (each type's options
  // differ, and stale rule data would be written to the wrong storage key).
  function changeType(newId) {
    if (newId === typeId) return;
    setTypeId(newId);
    setRecipientIdx(0);
    setToFieldValue('');
    setRuleData(null);
  }

  const handleSaveSmart = smart => {
    setVars(vs => vs.map(v => v.name === smartFor.name ? { ...v, smart } : v));
    setSmartFor(null);
  };
  const handleAddVar    = ({ name, kind, config, source }) => {
    setVars(vs => [...vs, {
      name, kind, config,
      ...(source ? { source } : {}),
      resolved: null, status: 'miss', smart: {},
    }]);
  };
  const handleDeleteVar = name => setVars(vs => vs.filter(v => v.name !== name));
  const openSmartByName = name => {
    const v = vars.find(x => x.name === name);
    if (v) setSmartFor(v);
  };

  /* ── Auto-save ──────────────────────────────────────────────
     No Save button: the editor merges its state onto the opened
     template and persists (debounced) on every change. Fields the
     React editor doesn't own (type, presetTaskId …) pass through
     untouched via the {...tpl} spread. */
  function buildTemplate() {
    const next = {
      ...tpl,
      type: typeId,
      name: name.trim() || 'Untitled',
      enabled, subject, body,
      variations: variations.length ? variations : undefined,
      // Only account templates persist a presetTaskId — other types
      // explicitly clear it so type-switching doesn't strand stale data.
      presetTaskId: typeId === 'account' ? (presetTaskId || '') : undefined,
      updatedAt: Date.now(),
    };
    // Recipient selection → stored toField.
    if (recipOpt.toType === 'literal')       next.toField = { type: 'literal',  value: toFieldValue };
    else if (recipOpt.toType === 'selector') next.toField = { type: 'selector', selector: toFieldValue };
    else                                     next.toField = { type: 'auto' };
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

  const skipSave     = useRef(true);
  const skipTypeSave = useRef(true);
  const saveTimer    = useRef(0);
  useEffect(() => {
    if (skipSave.current) { skipSave.current = false; return undefined; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (typeof window.__gbSaveTemplate === 'function') window.__gbSaveTemplate(buildTemplate());
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [name, enabled, vars, ruleData, subject, body, recipientIdx, toFieldValue, presetTaskId, variations]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Type changes bypass the 500ms debounce — the sidebar's row-teleport
     spring is keyed on tpl.type, so we save the new type immediately and
     let the storage `onChanged` listener kick the layout animation in
     within a frame. */
  useEffect(() => {
    if (skipTypeSave.current) { skipTypeSave.current = false; return; }
    if (typeof window.__gbSaveTemplate === 'function') {
      window.__gbSaveTemplate(buildTemplate());
    }
  }, [typeId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-sm)', flexShrink: 0, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {React.cloneElement(meta.icon, { size: 13 })}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ flex: '0 1 auto', minWidth: 0, fontSize: 13, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name || 'New Template'}
            </span>
            <Tag tone="neutral" size="xs" mono style={{ flexShrink: 0 }}>{typeId.toUpperCase()}</Tag>
            <SwitchTag on={enabled} label={enabled ? 'Enabled' : 'Disabled'} onClick={() => setEnabled(e => !e)} size="sm" style={{ flexShrink: 0 }} />
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.desc}</div>
        </div>
        <Btn variant="danger" size="sm" icon={<I.trash />} onClick={onDelete}>Delete</Btn>
      </div>

      {/* ── Type tabs — sit under the title so the header reads first ── */}
      <div style={{ marginBottom: 12 }}>
        <Segmented value={typeId} onChange={changeType} options={TYPE_OPTIONS} />
      </div>

      {/* ── Meta row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: recipOpt.toType === 'auto' ? 12 : 8 }}>
        <Field label="Template name">
          <Input value={name} placeholder="e.g. Charge Error Follow-Up" size="sm" onChange={setName} />
        </Field>
        <Field label="Recipient (to)">
          <Dropdown
            size="sm"
            value={recipientIdx}
            options={meta.recipientOptions.map((o, i) => ({ id: i, label: o.label }))}
            onChange={(id) => setRecipientIdx(id)}
          />
        </Field>
      </div>

      {/* ── Conditional recipient value ── */}
      {recipOpt.toType !== 'auto' && (
        <div style={S.mb12}>
          <Field label={recipOpt.toType === 'literal' ? 'Fixed recipient email' : 'Recipient selector (CSS)'}>
            <Input
              value={toFieldValue}
              size="sm"
              mono={recipOpt.toType === 'selector'}
              placeholder={recipOpt.toType === 'literal' ? 'name@example.com' : '.customer-email'}
              onChange={setToFieldValue}
            />
          </Field>
        </div>
      )}

      {/* ── Auto-Create Task on Send (account templates only) ── */}
      {typeId === 'account' && (
        <div style={S.mb12}>
          <Field
            label="Auto-create task on send"
            hint="Picks from your saved task templates — fires when this email opens in Outlook"
          >
            <Dropdown
              size="sm"
              value={presetTaskId}
              options={presetTaskOpts}
              onChange={setPresetTaskId}
              placeholder="— none —"
            />
          </Field>
        </div>
      )}

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
        <RichTextEditor
          singleLine
          size="sm"
          initialHtml={subject}
          onChange={setSubject}
          onChipClick={openSmartByName}
          variables={vars}
          placeholder="Email subject line"
        />
      </div>

      {/* ── Body — compact 'sm' editor to fit the ~700px panel ── */}
      <div style={S.mb12}>
        <span style={S.label}>Email body</span>
        <RichTextEditor
          size="sm"
          initialHtml={body}
          onChange={setBody}
          onChipClick={openSmartByName}
          variables={vars}
          minHeight={150}
          placeholder="Write the email body — format with the toolbar, insert variables from the menu. Click a variable chip to set fallbacks, transforms, or formatting."
        />
      </div>

      {/* ── Variations — explicit sub-templates; animated in/out ── */}
      <AnimatePresence initial={false}>
        {variations.map((v) => (
          <motion.div
            key={v.id}
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: 12, borderRadius: 'var(--gb-r-md)',
              background: 'var(--gb-fill-faint)',
              border: '1px solid var(--gb-brand-tint-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <I.bolt size={11} style={{ color: 'var(--gb-brand-label)' }} />
                <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: 0.2 }}>
                  {v.label}
                </span>
                <Btn variant="ghost" size="xs" icon={<I.trash />} onClick={() => removeVariation(v.id)}>
                  Remove
                </Btn>
              </div>
              <div style={S.mb8}>
                <span style={S.label}>Subject</span>
                <RichTextEditor
                  singleLine size="sm"
                  initialHtml={v.subject}
                  onChange={(s) => updateVariation(v.id, { subject: s })}
                  onChipClick={openSmartByName}
                  variables={vars}
                  placeholder="Variation subject line"
                />
              </div>
              <div>
                <span style={S.label}>Body</span>
                <RichTextEditor
                  size="sm"
                  initialHtml={v.body}
                  onChange={(b) => updateVariation(v.id, { body: b })}
                  onChipClick={openSmartByName}
                  variables={vars}
                  minHeight={130}
                  placeholder="Variation body"
                />
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <div style={S.mb12}>
        <Btn variant="dashed" size="sm" icon={<I.plus />} full onClick={addVariation}>
          Add variation
        </Btn>
      </div>

      {/* ── Variables — VariableTable manages its own inline add form
           now, so we just pass the create callback directly. ── */}
      <div style={S.mb12}>
        <VariableTable
          typeId={typeId}
          vars={displayVars}
          onAdd={handleAddVar}
          onDelete={handleDeleteVar}
          onOpenSmart={setSmartFor}
        />
      </div>

      <AnimatePresence>
        {smartFor && <SmartModal key="smart" variable={smartFor} onClose={() => setSmartFor(null)} onSave={handleSaveSmart} />}
      </AnimatePresence>
    </div>
  );
}

/* ── Root ───────────────────────────────────────────────── */
function TemplateEditorRoot() {
  const [tpl, setTpl] = useState(null);
  const [showSig, setShowSig] = useState(false);

  useEffect(() => {
    window.__gbOpenTemplate  = template => setTpl({ ...template });
    window.__gbOpenSignature = () => setShowSig(true);
    return () => {
      delete window.__gbOpenTemplate;
      delete window.__gbOpenSignature;
    };
  }, []);

  return (
    <>
      {tpl ? (
        <TemplateEditor
          key={tpl.id}
          tpl={tpl}
          onDelete={() => { if (typeof window.deleteTemplate === 'function') window.deleteTemplate(); }}
        />
      ) : (
        <EmptyState />
      )}
      <AnimatePresence>
        {showSig && <SignatureModal key="sig" onClose={() => setShowSig(false)} />}
      </AnimatePresence>
    </>
  );
}

/* ── Mount ─────────────────────────────────────────────── */
function mount() {
  const host = document.getElementById('ed-form');
  if (!host || host.__gbTemplatesMounted) return;
  host.__gbTemplatesMounted = true;
  // Padding on the host itself, so the top gap shows regardless of layout.
  host.style.padding = '40px 0 48px';
  ensureTheme();
  createRoot(host).render(<TemplateEditorRoot />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
