import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Btn,
  Input, Dropdown, Field, IconBtn,
  Segmented, FeatureSpotlight, EditorHeader, ResolveHint,
  TYPE_ICONS,
  I, Icon,
  SmartPopover,
  RichTextEditor,
  VariableTable, OrderRules, CaseRules, AccountConditions, CaseTagsEditor,
} from '../ui/index.js';
import { SENDER_OPTIONS } from '../lib/sender.js';

/* ─────────────────────────────────────────────────────────────
   TemplateEditor — the production email-template editor page.
   Mounted into #ed-form by src/content/editor-templates.jsx.
   The .ed-form CSS handles max-width:750px + padding:20px 0 40px.

   Exports: TemplateEditor (the editor component) and EmptyState
   (the "no template selected" placeholder shown by the root).
───────────────────────────────────────────────────────────── */

/* Template-type icons come from the shared TYPE_ICONS map so the email
   editor header, the sidebar row, and any future surface render the same
   glyph for the same type. */
const PickerIcon = (p) => <Icon {...p}><path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></Icon>;

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
      ...(v.group  ? { group:  v.group  } : {}),
      ...(v.scope  ? { scope:  v.scope  } : {}),
      ...(v.async  ? { async:  v.async  } : {}),
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
    } else if (v.type === 'schema' || v.type === 'path') {
      /* 'path' is the internal engine kind that predated the
         user-facing 'schema' alias; both store the same `path` key
         and resolve identically. New variables save as 'schema';
         existing 'path' variables keep working without conversion. */
      kind   = 'schema';
      config = v.path || '';
    } else if (v.type === 'selector') {
      kind   = 'dom';
      config = v.selector || '';
    } else if (v.type === 'code') {
      kind   = 'code';
      config = v.body || '';
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
      ...(v.group ? { group: v.group } : {}),
      ...(v.scope ? { scope: v.scope } : {}),
      ...(v.async ? { async: true } : {}),
      resolved: null, status: 'miss', smart: v.smart || {},
    };
  });
}

/* New-format variable → stored definition (also the resolver's input shape).
   Regex carries `source` (body|subject|from|html) so the resolver knows
   which inbound field to scan. */
function varDef(v) {
  if (v.kind === 'builtin') return { type: 'builtin',  builtin:  v.config };
  /* 'schema' resolves via the page-engine field tree (contact +
     account variants share one path namespace). Saved as the
     `schema` type so legacy `path` defs and new `schema` defs both
     route through the same resolver branch. */
  if (v.kind === 'schema')  return { type: 'schema',   path:     v.config };
  if (v.kind === 'dom')     return { type: 'selector', selector: v.config };
  /* 'code' stores the body verbatim; `async` rides along so the
     resolver picks the timeout-guarded AsyncFunction path for bodies
     that await h.server / h.fetchJson. */
  if (v.kind === 'code')    return { type: 'code', body: v.config, ...(v.async ? { async: true } : {}) };
  if (v.kind === 'regex')   return {
    type: 'regex',
    pattern:  v.config,
    source:   v.source || 'body',
    ...(v.group ? { group: v.group } : {}),
    ...(v.scope ? { scope: v.scope } : {}),
  };
  return { type: 'literal', value: v.config };
}

/* ────────────────────────────────────────────────────────────
   Type metadata
──────────────────────────────────────────────────────────── */
/* Sender catalog lives in src/lib/sender.js (imported above) —
   single source of truth shared with EmailRunner and (via inlined
   copy) the vanilla sendViaPA handler. The `randomize` slot is
   added inline at the Segmented usage so the canonical list stays
   pure (real senders only) and the random pseudo-entry is purely
   a UI affordance. */

const TYPE_META = {
  order: {
    icon: <TYPE_ICONS.order />, label: 'Order',
    desc: 'Shown in the popup on order pages.',
    recipientOptions: [
      { label: 'Smart detect',   toType: 'auto' },
      { label: 'Pick from page', toType: 'selector' },
      { label: 'Fixed email',    toType: 'literal' },
    ],
  },
  case: {
    icon: <TYPE_ICONS.case />, label: 'Case',
    desc: 'Shown in the case email modal. Matches From / Subject / Body of the inbound email.',
    recipientOptions: [
      { label: 'Reply to sender', toType: 'auto' },
      { label: 'Pick from case',  toType: 'selector' },
      { label: 'Fixed email',     toType: 'literal' },
    ],
  },
  account: {
    icon: <TYPE_ICONS.account />, label: 'Account',
    desc: 'Shown in the popup on account pages.',
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
export function EmptyState() {
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
export function TemplateEditor({ tpl, onDelete }) {
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
  // Smart-options popover state: holds the variable being edited AND the
  // DOM element it was anchored from (bolt span in the table or chip in
  // the rich text editor). Both must be set for the popover to render.
  const [smartTarget, setSmartTarget] = useState(null);
  const [recipientIdx,  setRecipientIdx]  = useState(() => recipientIndexFor(initialType, tpl.toField));
  const [toFieldValue, setToFieldValue] = useState(
    (tpl.toField && (tpl.toField.value || tpl.toField.selector)) || '',
  );
  // Recipient DOM picker — same namespace-by-id plumbing as OrderRules,
  // stores the resolved email address for the live hint.
  const [pickingRecipient, setPickingRecipient] = useState(false);
  const [recipientResolved, setRecipientResolved] = useState(null);
  const [presetTaskId,   setPresetTaskId]   = useState(tpl.presetTaskId || '');
  const [presetTaskOpts, setPresetTaskOpts] = useState([]);
  // Default to reply mode for new templates — matches legacy editor's
  // "checked unless explicitly 'standalone'" load behavior.
  const [replyMode,      setReplyMode]      = useState(tpl.replyMode !== 'standalone');
  // Sender account — only meaningful when Direct Send via Power Automate is
  // on (the flow chooses which "from" address to use). Two accounts are
  // currently provisioned; senderRandomize=true picks per send.
  const [senderAccount,   setSenderAccount]   = useState(tpl.senderAccount   || 'golfballs');
  const [senderRandomize, setSenderRandomize] = useState(!!tpl.senderRandomize);
  // caseTags is only saved for case templates. null = "user hasn't
  // touched it yet" — same `ruleData` pattern, prevents writing an
  // empty array over the saved value on initial mount.
  const [caseTagsData,   setCaseTagsData]   = useState(null);
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

  // Per-template PA controls (reply mode toggle, sender picker)
  // show when Direct Send via Power Automate is ON — the toggle in
  // Settings. The flag was previously named replyWithTemplateEnabled
  // and got renamed to powerAutomateEnabled when the feature was
  // consolidated; this read site was the one missed at rename time.
  //
  // `paReady` blocks the initial render until the async storage check
  // resolves — otherwise the editor paints first with paEnabled=false
  // (hiding reply mode + sender pills), then the async result lands
  // and those controls visibly pop in. The whole template panel takes
  // ~1 frame longer to appear but renders in its final shape.
  const [paEnabled, setPaEnabled] = useState(false);
  const [paReady, setPaReady] = useState(false);
  useEffect(() => {
    chrome.storage.local.get('featureFlags', ({ featureFlags }) => {
      setPaEnabled(!!(featureFlags && featureFlags.powerAutomateEnabled));
      setPaReady(true);
    });
    function onChanged(changes) {
      if (!changes.featureFlags) return;
      const v = changes.featureFlags.newValue;
      setPaEnabled(!!(v && v.powerAutomateEnabled));
    }
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  // Recipient DOM picker — fires when user clicks the Pick button on
  // the recipient selector input. Namespaced by 'pick_recipient' so it
  // doesn't conflict with rule pickers.
  useEffect(() => {
    if (!pickingRecipient) return undefined;
    function onChanged(changes) {
      if (!changes.pickResult) return;
      const result = changes.pickResult.newValue;
      if (!result || result.fieldId !== 'pick_recipient') return;
      setToFieldValue(result.selector || '');
      setPickingRecipient(false);
    }
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [pickingRecipient]);

  const startPickRecipient = () => {
    setPickingRecipient(true);
    chrome.runtime.sendMessage({ action: 'startPick', fieldId: 'pick_recipient' });
  };
  const cancelPickRecipient = () => {
    setPickingRecipient(false);
    chrome.runtime.sendMessage({ action: 'cancelPick' });
  };

  // Live resolution of the recipient selector on the order/account tab.
  // If recipOpt.toType === 'selector', ask __gbResolveVars to resolve
  // the toField as a DOM selector and show the resolved email address.
  useEffect(() => {
    if (recipOpt.toType !== 'selector' || !toFieldValue || pickingRecipient) {
      setRecipientResolved(null);
      return undefined;
    }
    if (typeof window.__gbResolveVars !== 'function') return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.resolve(window.__gbResolveVars({
        __recipientPreview: { type: 'selector', selector: toFieldValue },
      }))
        .then((res) => {
          if (cancelled) return;
          const val = res?.resolved?.__recipientPreview;
          setRecipientResolved(val ? String(val) : null);
        });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [recipOpt.toType, toFieldValue, pickingRecipient]);

  // Switching template type resets recipient + rules (each type's options
  // differ, and stale rule data would be written to the wrong storage key).
  function changeType(newId) {
    if (newId === typeId) return;
    setTypeId(newId);
    setRecipientIdx(0);
    setToFieldValue('');
    setRuleData(null);
    setCaseTagsData(null);
  }

  const handleSaveSmart = smart => {
    if (!smartTarget?.variable) return;
    const name = smartTarget.variable.name;
    setVars(vs => vs.map(v => v.name === name ? { ...v, smart } : v));
    setSmartTarget(null);
  };
  const handleAddVar    = ({ name, kind, config, source, group, scope }) => {
    setVars(vs => [...vs, {
      name, kind, config,
      ...(source ? { source } : {}),
      ...(group ? { group } : {}),
      ...(scope ? { scope } : {}),
      resolved: null, status: 'miss', smart: {},
    }]);
  };
  const handleEditVar = ({ oldName, newName }) => {
    // Rename only — VariableTable no longer offers kind-change because each
    // kind stores config in a different shape (path vs regex vs literal), so
    // the only sane way to "change kind" is to delete + re-add.
    setVars(vs => vs.map(v => v.name === oldName ? { ...v, name: newName } : v));
  };
  const handleDeleteVar = name => setVars(vs => vs.filter(v => v.name !== name));
  /* RichTextEditor.onChipClick → (name, chipEl, { x, y })
     VariableTable BodyVar.onOpenSmart → (v, btnEl, { x, y })
     Both pass viewport cursor coords as the 3rd arg. SmartPopover wants
     `cursor`, not an anchor element, so we capture { x, y } here and
     thread it through. Previously we dropped the cursor and the popover
     fell back to viewport-centre placement — that's the "way off cursor"
     bug the user kept reporting. */
  const openSmartByName = (name, _anchor, cursor) => {
    const v = vars.find(x => x.name === name);
    if (v && cursor) setSmartTarget({ variable: v, cursor });
  };
  const openSmartFromTable = (v, _anchor, cursor) => {
    if (v && cursor) setSmartTarget({ variable: v, cursor });
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
      // Reply-mode toggle: case templates always thread as replies (the
      // user opens them inside an existing case), so we omit the field
      // for case to match the legacy editor's behavior.
      replyMode: typeId === 'case' ? undefined : (replyMode ? 'reply' : 'standalone'),
      // Sender account fields are only meaningful for the Power Automate
      // direct-send path; persist them regardless so flipping the flag
      // back on later doesn't lose the user's choice.
      senderAccount,
      senderRandomize,
      updatedAt: Date.now(),
    };
    // Recipient selection → stored toField.
    if (recipOpt.toType === 'literal')       next.toField = { type: 'literal',  value: toFieldValue };
    else if (recipOpt.toType === 'selector') next.toField = { type: 'selector', selector: toFieldValue };
    else                                     next.toField = { type: 'auto' };
    if (typeId === 'case') {
      next.caseVars = vars;
      // Only overwrite caseTags once the user has actually edited them
      // (same null-guard as ruleData above).
      if (caseTagsData != null) next.caseTags = caseTagsData;
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
  }, [name, enabled, vars, ruleData, subject, body, recipientIdx, toFieldValue, presetTaskId, replyMode, senderAccount, senderRandomize, caseTagsData, variations]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const RulesComp = typeId === 'order' ? OrderRules : typeId === 'case' ? CaseRules : AccountConditions;

  const S = { // compact spacing constants
    mb8:  { marginBottom: 8  },
    mb12: { marginBottom: 12 },
    mb14: { marginBottom: 14 },
  };

  // Overlay live-resolved values onto the variable definitions for display.
  const displayVars = vars.map((v) => {
    const r = resolvedMap[v.name];
    return r ? { ...v, resolved: r.resolved, status: r.status } : v;
  });

  // Hold the entire panel render until the PA flag check resolves —
  // otherwise the editor would paint with paEnabled=false, then re-render
  // a moment later when the async storage.get lands, causing the reply
  // mode + sender pills to visibly pop in after the rest of the panel.
  if (!paReady) return null;

  return (
    <div style={{ fontFamily: 'var(--gb-font-sans)', color: 'var(--gb-text-secondary)' }}>

      {/* ── Header — shared EditorHeader, identical to NoteEditor's. ── */}
      <EditorHeader
        icon={meta.icon}
        title={name || 'New Template'}
        typeLabel={typeId.toUpperCase()}
        enabled={enabled}
        onToggle={() => setEnabled((e) => !e)}
        desc={meta.desc}
        onDelete={onDelete}
      />

      {/* ── Type tabs + sender picker on the same row.
          Left: order/case/account Segmented.
          Right (only when Direct Send via Power Automate is on): a second
          Segmented for which sender the PA flow should use. The shuffle
          slot is part of the same switcher so picking it visually replaces
          the active sender — internally it persists as senderRandomize=true.
          When PA is off the entire right-side switcher is hidden (not just
          dimmed) — the value is still persisted so flipping the flag back
          on later doesn't lose the user's preference. */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Segmented value={typeId} onChange={changeType} options={TYPE_OPTIONS} />
        <div style={{ flex: 1 }} />
        {paEnabled && (
          <Segmented
            value={senderRandomize ? '__random' : senderAccount}
            onChange={(v) => {
              if (v === '__random') setSenderRandomize(true);
              else { setSenderRandomize(false); setSenderAccount(v); }
            }}
            options={[
              ...SENDER_OPTIONS,
              { id: '__random', label: 'Random', icon: <I.shuffle /> },
            ]}
          />
        )}
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
              trailing={recipOpt.toType === 'selector' ? (
                <IconBtn
                  size="xs"
                  variant="ghost"
                  active={pickingRecipient}
                  icon={<PickerIcon />}
                  tooltip={pickingRecipient ? 'Cancel pick' : 'Pick element from page'}
                  onClick={() => (pickingRecipient ? cancelPickRecipient() : startPickRecipient())}
                />
              ) : undefined}
            />
          </Field>
          {/* Live hint — what the recipient selector resolves to on the
              active page. Shared ResolveHint component (same as OrderRules). */}
          {recipOpt.toType === 'selector' && toFieldValue && (
            <ResolveHint
              picking={pickingRecipient}
              resolved={recipientResolved}
              style={{ marginTop: 6 }}
            />
          )}
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

      {/* ── Reply mode (non-case only — case templates always thread).
          Only shown when Direct Send via Power Automate is enabled, since
          that's the only path where the reply-mode toggle is meaningful
          (PA's flow threads the reply; without PA, every send is a fresh
          mailto regardless of this flag). Persisted value is preserved
          when PA toggles off so the preference isn't lost. */}
      {typeId !== 'case' && paEnabled && (
        <div style={S.mb12}>
          <FeatureSpotlight
            size="xs"
            on={replyMode}
            icon={<I.mail />}
            name="Reply to most recent email"
            desc="Threads this template as a reply instead of sending as a new message."
            onChange={(on) => setReplyMode(on)}
          />
        </div>
      )}

      {/* ── Recommended case tags (case templates only) ── */}
      {typeId === 'case' && (
        <div style={S.mb14}>
          <CaseTagsEditor
            initial={tpl.caseTags}
            onChange={setCaseTagsData}
          />
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
        <Field label="Subject">
          <RichTextEditor
            singleLine
            size="sm"
            initialHtml={subject}
            onChange={setSubject}
            onChipClick={openSmartByName}
            variables={vars}
            placeholder="Email subject line"
          />
        </Field>
      </div>

      {/* ── Body — compact 'sm' editor to fit the ~700px panel ── */}
      <div style={S.mb12}>
        <Field label="Email body">
          <RichTextEditor
            size="sm"
            initialHtml={body}
            onChange={setBody}
            onChipClick={openSmartByName}
            variables={vars}
            minHeight={150}
            placeholder="Write the email body — format with the toolbar, insert variables from the menu. Click a variable chip to set fallbacks, transforms, or formatting."
          />
        </Field>
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
                <Field label="Subject">
                  <RichTextEditor
                    singleLine size="sm"
                    initialHtml={v.subject}
                    onChange={(s) => updateVariation(v.id, { subject: s })}
                    onChipClick={openSmartByName}
                    variables={vars}
                    placeholder="Variation subject line"
                  />
                </Field>
              </div>
              <div>
                <Field label="Body">
                  <RichTextEditor
                    size="sm"
                    initialHtml={v.body}
                    onChange={(b) => updateVariation(v.id, { body: b })}
                    onChipClick={openSmartByName}
                    variables={vars}
                    minHeight={130}
                    placeholder="Variation body"
                  />
                </Field>
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
          onEdit={handleEditVar}
          onDelete={handleDeleteVar}
          onOpenSmart={openSmartFromTable}
        />
      </div>

      <AnimatePresence>
        {smartTarget && (
          <SmartPopover
            key="smart"
            variable={smartTarget.variable}
            cursor={smartTarget.cursor}
            onClose={() => setSmartTarget(null)}
            onSave={handleSaveSmart}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
