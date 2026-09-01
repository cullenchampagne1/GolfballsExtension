import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Btn,
  Input, Dropdown, Field, IconBtn,
  Segmented, FeatureSpotlight, EditorHeader, ResolveHint, Callout,
  TYPE_ICONS,
  I, Icon,
  SmartPopover,
  RichTextEditor,
  VariableTable, OrderRules, CaseRules, AccountConditions, CaseTagsEditor,
} from '../ui/index.js';
import { SENDER_OPTIONS } from '../lib/sender.js';
import {
  updateVariableDefinition,
  variableDefinitionForLiveResolution,
  variableLiveResolutionSignature,
} from '../lib/templateVariableEditing.js';
import {
  buildEmailTemplateTrackerCatalog,
  emailTemplateTrackingIssue,
  trackerForTemplate,
} from '../lib/emailSubjectTracking.js';
import { importedEmailShare, isImportedEmailTemplate } from '../lib/templateImport.js';
import {
  emailTemplateIsBucketEnrolled,
  managedEmailTemplate,
  setEmailTemplateBucketEnrollment,
} from '../lib/emailTemplateCapabilities.js';
import {
  emailTemplateSubmission,
  submissionTemplateDocument,
} from '../lib/emailTemplateSubmission.js';

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

function LockedRegion({ locked, children, style }) {
  const stopLockedEvent = locked
    ? (event) => {
        event.preventDefault();
        event.stopPropagation();
      }
    : undefined;
  return (
    <div
      inert={locked || undefined}
      aria-readonly={locked || undefined}
      onPointerDownCapture={stopLockedEvent}
      onClickCapture={stopLockedEvent}
      onKeyDownCapture={stopLockedEvent}
      style={{
        ...style,
        pointerEvents: locked ? 'none' : undefined,
        opacity: locked ? 0.62 : 1,
        filter: locked ? 'saturate(.42)' : 'none',
        transition: 'opacity 160ms ease, filter 160ms ease',
      }}
    >
      {children}
    </div>
  );
}

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
      ...(v.attach ? { attach: v.attach } : {}),
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
    } else if (v.type === 'attachment') {
      /* Attachment: config is the file source (url / schema path / code
         body, per attach.source); placement + sizing ride in `attach`. */
      kind   = 'attachment';
      config = v.url || v.path || v.body || '';
    } else {
      kind   = 'literal';
      config = v.value || v.selector || '';
    }
    return {
      name, kind, config,
      ...(v.type === 'attachment' ? {
        attach: {
          mode: v.mode || 'inline', source: v.source || 'url',
          filename: v.filename || 'attachment',
          ...(v.width ? { width: v.width } : {}),
          ...(v.align ? { align: v.align } : {}),
        },
      } : {}),
      ...(v.type === 'regex' ? { source: v.source || 'body' } : {}),
      ...(v.group ? { group: v.group } : {}),
      ...(v.scope ? { scope: v.scope } : {}),
      ...(v.async ? { async: true } : {}),
      /* Carry the one-version migration's deprecation flag through so the
         variable row can warn (templateMigration.js sets it on legacy vars
         it couldn't lift onto the engine). */
      ...(v.deprecated ? { deprecated: true, deprecatedReason: v.deprecatedReason || '' } : {}),
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
  /* 'attachment' stores the file source under the key its source kind
     expects (url / path / body) plus the placement block. PA-only: the
     resolver renders inline mode as an <img> (CID-embedded at send) and
     attach mode as a hidden marker the background turns into a real
     fileAttachment — both ship the image DATA, not a link. */
  if (v.kind === 'attachment') {
    const a = v.attach || {};
    return {
      type: 'attachment',
      mode: a.mode || 'inline',
      source: a.source || 'url',
      ...(a.source === 'schema' ? { path: v.config } : a.source === 'code' ? { body: v.config } : { url: v.config }),
      filename: a.filename || 'attachment',
      ...(a.mode === 'inline' ? { width: a.width || 220, align: a.align || 'left' } : {}),
      ...(v.async ? { async: true } : {}),
    };
  }
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

export function TemplateEditor({ tpl, onDelete }) {
  const imported = isImportedEmailTemplate(tpl);
  const managed = managedEmailTemplate(tpl);
  const submission = emailTemplateSubmission(tpl);
  const readOnly = imported || (managed && managed.editable !== true);
  const source = imported ? importedEmailShare(tpl) : managed;
  const displayedTemplate = readOnly && source?.overrideDefaults?.replyMode
    ? { ...tpl, replyMode: source.overrideDefaults.replyMode }
    : tpl;
  return (
    <EditableTemplateEditor
      tpl={displayedTemplate}
      readOnly={readOnly}
      ownerName={source?.ownerName || source?.lastEditor || source?.createdBy || 'Management'}
      managed={!!managed}
      submission={submission}
      onDelete={(submission || (managed && managed.editable !== true)) ? undefined : onDelete}
    />
  );
}

/* ────────────────────────────────────────────────────────────
   Template editor — compact for ~700px panel
──────────────────────────────────────────────────────────── */
function EditableTemplateEditor({ tpl, onDelete, readOnly = false, ownerName = '', managed = false, submission = null }) {
  const initialType = tpl.type === 'email' ? 'order' : (tpl.type || 'order');
  const importRevision = (readOnly || submission)
    ? Math.max(1, Number(
      submission?.version || tpl.shareImport?.version || tpl.managedTemplate?.version,
    ) || 1) : 0;
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
  const [followUpActionId,   setFollowUpActionId]   = useState(tpl.followUpActionId || '');
  const [followUpActionOpts, setFollowUpActionOpts] = useState([]);
  // Default to reply mode for new templates — matches legacy editor's
  // "checked unless explicitly 'standalone'" load behavior.
  const [replyMode,      setReplyMode]      = useState(tpl.replyMode !== 'standalone');
  const [bucketEnrolled, setBucketEnrolled] = useState(
    () => emailTemplateIsBucketEnrolled(tpl),
  );
  const templateBucketEnrolled = emailTemplateIsBucketEnrolled(tpl);
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
  // Optional name for the INITIAL email when the template has variations, so
  // the original shows as a labeled block alongside the alternates (display
  // only — the base still sends tpl.subject/body).
  const [baseLabel, setBaseLabel] = useState(tpl.baseLabel || '');
  const [contentRevision, setContentRevision] = useState(importRevision);
  const seenImportRevision = useRef(importRevision);
  const localSubmissionSnapshot = useRef(
    submission ? JSON.stringify(submissionTemplateDocument(tpl)) : '',
  );
  const skipSave     = useRef(true);
  const skipTypeSave = useRef(true);
  const saveTimer    = useRef(0);
  const recipOpt = meta.recipientOptions[recipientIdx] || meta.recipientOptions[0];

  /* A retained share can update while this exact editor is open. Reconcile
     the new source snapshot into the existing component instead of changing
     its React key: remounting briefly collapsed #editor while paReady loaded,
     which clamped its scrollTop to zero. Recipient-owned overrides are already
     folded into `tpl` by live-updates, so these controls keep their values. */
  useEffect(() => {
    if ((!readOnly && !submission) || seenImportRevision.current === importRevision) return;
    seenImportRevision.current = importRevision;
    const incomingSnapshot = submission
      ? JSON.stringify(submissionTemplateDocument(tpl)) : '';
    if (submission && incomingSnapshot === localSubmissionSnapshot.current) return;
    if (submission) localSubmissionSnapshot.current = incomingSnapshot;
    skipSave.current = true;
    clearTimeout(saveTimer.current);
    const nextType = tpl.type === 'email' ? 'order' : (tpl.type || 'order');
    setTypeId(nextType);
    setVars(convertVars(tpl));
    setEnabled(tpl.enabled !== false);
    setName(tpl.name || '');
    setSubject(tpl.subject || '');
    setBody(tpl.body || '');
    setRuleData(null);
    setCaseTagsData(null);
    setSmartTarget(null);
    setRecipientIdx(recipientIndexFor(nextType, tpl.toField));
    setToFieldValue((tpl.toField && (tpl.toField.value || tpl.toField.selector)) || '');
    setPickingRecipient(false);
    setRecipientResolved(null);
    setPresetTaskId(tpl.presetTaskId || '');
    setFollowUpActionId(tpl.followUpActionId || '');
    setReplyMode(tpl.replyMode !== 'standalone');
    setBucketEnrolled(emailTemplateIsBucketEnrolled(tpl));
    setSenderAccount(tpl.senderAccount || 'golfballs');
    setSenderRandomize(!!tpl.senderRandomize);
    setVariations((tpl.variations || []).map((variation, index) => ({
      id: variation.id || `var_${Date.now()}_${index}`,
      label: variation.label || `Variation ${index + 1}`,
      subject: variation.subject || '',
      body: variation.body || '',
    })));
    setBaseLabel(tpl.baseLabel || '');
    setContentRevision(importRevision);
  }, [importRevision, readOnly, submission, tpl]);

  useEffect(() => {
    setBucketEnrolled(templateBucketEnrolled);
  }, [templateBucketEnrolled]);

  function addVariation() {
    // The initial email is block "Variation 1", so added blocks number from 2.
    setVariations((vs) => [
      ...vs,
      { id: `var_${Date.now()}`, label: `Variation ${vs.length + 2}`, subject: '', body: '' },
    ]);
  }
  function removeVariation(id) {
    // Preserve each variation's custom label on delete (no auto-renumber, or a
    // renamed "Warm"/"Value-first" would get clobbered back to "Variation N").
    setVariations((vs) => vs.filter((v) => v.id !== id));
  }
  function updateVariation(id, patch) {
    setVariations((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }


  // Load the two optional post-send resources in one storage read.
  useEffect(() => {
    chrome.storage.local.get(['noteTemplates', 'gbCustomActions'], ({ noteTemplates, gbCustomActions }) => {
      const tasks = (noteTemplates || []).filter(t => t.subType === 'task' && t.enabled !== false);
      const actions = (gbCustomActions || []).filter(a => a && a.enabled !== false);
      setPresetTaskOpts([
        { id: '', label: '— none —' },
        ...tasks.map(t => ({ id: t.id, label: t.name || 'Untitled task' })),
      ]);
      setFollowUpActionOpts([
        { id: '', label: '— none —' },
        ...actions.map(a => ({ id: a.id, label: a.name || 'Untitled action' })),
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
  const [parentAccount, setParentAccount] = useState(false);
  const [paReady, setPaReady] = useState(false);
  useEffect(() => {
    chrome.storage.local.get(['featureFlags', 'devSettings'], ({ featureFlags, devSettings }) => {
      setPaEnabled(!!(featureFlags && featureFlags.powerAutomateEnabled));
      setParentAccount(devSettings?.['emailTemplates.allowParentAccount'] === true);
      setPaReady(true);
    });
    function onChanged(changes) {
      if (changes.featureFlags) {
        const v = changes.featureFlags.newValue;
        setPaEnabled(!!(v && v.powerAutomateEnabled));
      }
      if (changes.devSettings) {
        setParentAccount(
          changes.devSettings.newValue?.['emailTemplates.allowParentAccount'] === true,
        );
      }
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
    // An OR chip ({{preferred|fallback}}) is one expression, not a stored
    // variable. Attach its group-level conditional behavior to the first
    // candidate; the renderer evaluates emptiness across every candidate.
    const name = smartTarget.variable.name.split('|').map((part) => part.trim()).filter(Boolean)[0];
    setVars(vs => vs.map(v => v.name === name ? { ...v, smart } : v));
    setSmartTarget(null);
  };
  const handleAddVar    = ({ name, kind, config, source, group, scope, async: isAsync, attach }) => {
    setVars(vs => [...vs, {
      name, kind, config,
      ...(source ? { source } : {}),
      ...(group ? { group } : {}),
      ...(scope ? { scope } : {}),
      ...(isAsync ? { async: true } : {}),
      ...(attach ? { attach } : {}),
      resolved: null, status: 'miss', smart: {},
    }]);
  };
  /* RichTextEditor inline-attachment block resize → persist the new width
     onto the variable so the sent <img> matches the editor placeholder. */
  const handleAttachmentResize = (name, width) => {
    setVars(vs => vs.map(v => (v.name === name && v.kind === 'attachment')
      ? { ...v, attach: { ...(v.attach || {}), width } }
      : v));
  };
  /* Variables → import-shaped JSON blob (same schema as the LLM toolset doc
     + the Import dialog), for pasting into a model conversation as context.
     Case templates export caseVars; others the stored vars map + varOrder. */
  const exportVarsJson = () => {
    if (typeId === 'case') {
      return JSON.stringify({
        caseVars: vars.map(({ resolved, status, ...v }) => v),
      }, null, 2);
    }
    const obj = {};
    vars.forEach((v) => {
      let smart = v.smart || {};
      if (v.kind === 'attachment' && smart.conditional === undefined) {
        smart = { conditionalScope: 'line', ...smart, conditional: true };
      }
      obj[v.name] = { ...varDef(v), ...(Object.keys(smart).length ? { smart } : {}) };
    });
    return JSON.stringify({ vars: obj, varOrder: vars.map((v) => v.name) }, null, 2);
  };
  const handleEditVar = ({ oldName }, updated) => {
    setVars(vs => updateVariableDefinition(vs, oldName, updated));
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
    const names = String(name).split('|').map((part) => part.trim()).filter(Boolean);
    const v = vars.find(x => x.name === names[0]);
    if (v && cursor) setSmartTarget({ variable: { ...v, name }, cursor });
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
      // Name for the initial email — only meaningful (and only persisted) when
      // the template has variations to sit alongside.
      baseLabel: variations.length && baseLabel.trim() ? baseLabel.trim() : undefined,
      // Popup + bulk both support recipient-scoped follow-ups for every
      // ordinary email template. Case templates use a separate reply flow.
      presetTaskId: typeId !== 'case' ? (presetTaskId || '') : undefined,
      followUpActionId: typeId !== 'case' ? (followUpActionId || '') : undefined,
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
        let smart = v.smart || {};
        /* Attachment vars default to conditional (line scope): an empty file
           source — e.g. proofs[0].logo_ball on an account with no proofs —
           silently drops the line instead of leaving a literal {{name}} in
           the sent email. Explicit smart.conditional === false opts out. */
        if (v.kind === 'attachment' && smart.conditional === undefined) {
          smart = { conditionalScope: 'line', ...smart, conditional: true };
        }
        obj[v.name] = { ...base, ...varDef(v), smart };
      });
      next.vars = obj;
      next.varOrder = vars.map((v) => v.name);
    }
    // Rules only overwrite storage once the user actually edits them.
    if (ruleData != null) {
      if (typeId === 'account')   next.accountConditions = ruleData;
      else if (typeId === 'case') next.caseRules = ruleData.map((r) => ({ field: r.left, op: r.op, value: r.right }));
      else                        next.rules = ruleData; // order: grouped tree from RuleGroups
    }
    return parentAccount && !submission
      ? setEmailTemplateBucketEnrollment(next, bucketEnrolled)
      : next;
  }

  const subjectTracker = useMemo(() => {
    const draft = buildTemplate();
    return trackerForTemplate(
      buildEmailTemplateTrackerCatalog([draft]),
      tpl.id,
    );
  }, [tpl, typeId, enabled, name, subject, vars, variations, baseLabel, replyMode]); // eslint-disable-line react-hooks/exhaustive-deps
  const trackingIssue = emailTemplateTrackingIssue(subjectTracker);

  useEffect(() => {
    // Imported shares use this exact editor tree and save through the same
    // debounce. The bridge applies a strict allowlist, so only recipient-local
    // overrides can persist even if a locked control changes unexpectedly.
    if (skipSave.current) { skipSave.current = false; return undefined; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const next = buildTemplate();
      if (submission) {
        localSubmissionSnapshot.current = JSON.stringify(submissionTemplateDocument(next));
      }
      if (typeof window.__gbSaveTemplate === 'function') window.__gbSaveTemplate(next);
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [name, enabled, vars, ruleData, subject, body, recipientIdx, toFieldValue, presetTaskId, followUpActionId, replyMode, bucketEnrolled, senderAccount, senderRandomize, caseTagsData, variations, baseLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Type changes bypass the 500ms debounce — the sidebar's row-teleport
     spring is keyed on tpl.type, so we save the new type immediately and
     let the storage `onChanged` listener kick the layout animation in
     within a frame. */
  useEffect(() => {
    if (readOnly) return;
    if (skipTypeSave.current) { skipTypeSave.current = false; return; }
    if (typeof window.__gbSaveTemplate === 'function') {
      const next = buildTemplate();
      if (submission) {
        localSubmissionSnapshot.current = JSON.stringify(submissionTemplateDocument(next));
      }
      window.__gbSaveTemplate(next);
    }
  }, [typeId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Live resolution ────────────────────────────────────────
     The editor window has no page DOM, so it asks the order /
     account tab (via editor.js' __gbResolveVars bridge) to resolve
     each variable, then overlays the values onto the table. */
  const varSig = variableLiveResolutionSignature(vars);
  useEffect(() => {
    if (typeof window.__gbResolveVars !== 'function' || vars.length === 0) {
      setResolvedMap({});
      return undefined;
    }
    let cancelled = false;
    const obj = {};
    vars.forEach((v) => {
      obj[v.name] = variableDefinitionForLiveResolution(varDef(v), v);
    });
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
        onToggle={readOnly ? undefined : () => setEnabled((e) => !e)}
        toggleDisabled={readOnly}
        desc={readOnly && !managed ? `${meta.desc} Shared by ${ownerName} · Source content is read only.` : meta.desc}
        onDelete={onDelete}
        deleteLabel={readOnly ? 'Remove' : 'Delete'}
      />

      {submission && (
        <Callout tone={submission.status === 'approved' ? 'success' : 'warning'} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 750, color: 'var(--gb-text-primary)' }}>
                {submission.status === 'approved' ? 'Approved template' : 'Pending approval'}
              </div>
              <div style={{ marginTop: 2 }}>
                {submission.isParent
                  ? `Submitted by ${submission.submitterName}. Review and adjust it here before publishing.`
                  : (submission.status === 'approved'
                    ? 'The approved copy is available in Templates. Editing this draft sends the new revision back for approval.'
                    : 'This draft is not available for sending until a parent account approves it.')}
              </div>
            </div>
            {submission.isParent && (
              <Btn
                variant="primary" size="sm" icon={<I.check />}
                onClick={() => window.__gbApproveTemplateSubmission?.(buildTemplate())}
              >
                {submission.status === 'approved' ? 'Approve again' : 'Approve'}
              </Btn>
            )}
          </div>
        </Callout>
      )}

      {/* Retained shares keep the production editor layout. LockedRegion dims
          and disables source-owned sections, while recipient-owned overrides
          remain normal controls and are enforced again by the save bridge. */}
      <div className={readOnly ? 'gb-template-editor-readonly' : undefined}>

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
        <LockedRegion locked={readOnly} style={{ display: 'flex' }}>
          <Segmented value={typeId} onChange={changeType} options={TYPE_OPTIONS} />
        </LockedRegion>
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

      {trackingIssue && (
        <Callout
          tone={trackingIssue.tone}
          title={trackingIssue.title}
          style={{ marginBottom: 12 }}
        >
          {trackingIssue.message}
        </Callout>
      )}

      {/* ── Meta row ── */}
      <LockedRegion locked={readOnly} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: recipOpt.toType === 'auto' ? 12 : 8 }}>
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
      </LockedRegion>

      {/* ── Conditional recipient value ── */}
      {recipOpt.toType !== 'auto' && (
        <LockedRegion locked={readOnly} style={S.mb12}>
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
        </LockedRegion>
      )}

      {/* ── Successful-delivery follow-ups (all non-case email templates) ── */}
      {typeId !== 'case' && (
        <div style={{ ...S.mb12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field
            label="Follow-up task"
            hint="Creates the selected CRM task after a successful send or Outlook handoff."
          >
            <Dropdown
              size="sm"
              value={presetTaskId}
              options={presetTaskOpts}
              onChange={setPresetTaskId}
              placeholder="— none —"
            />
          </Field>
          <Field
            label="Follow-up action"
            hint="Runs the selected custom action against that recipient after the email succeeds."
          >
            <Dropdown
              size="sm"
              value={followUpActionId}
              options={followUpActionOpts}
              onChange={setFollowUpActionId}
              placeholder="— none —"
              searchable={followUpActionOpts.length > 8}
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
        <LockedRegion locked={readOnly} style={S.mb12}>
          <FeatureSpotlight
            size="xs"
            on={replyMode}
            icon={<I.mail />}
            name="Reply to most recent email"
            desc="Threads this template as a reply instead of sending as a new message."
            onChange={(on) => setReplyMode(on)}
          />
        </LockedRegion>
      )}

      {/* Parent accounts opt individual templates into the approved bucket.
          Removing one from the bucket strips only its management provenance;
          the same document remains in this parent's private local library. */}
      {parentAccount && !readOnly && !submission && (
        <div style={S.mb12}>
          <FeatureSpotlight
            size="xs"
            on={bucketEnrolled}
            icon={<I.users />}
            name="Approved template bucket"
            desc="Shares this template with managed users and other parent accounts. Turning it off keeps a private local copy."
            onChange={setBucketEnrolled}
          />
        </div>
      )}

      {/* ── Recommended case tags (case templates only) ── */}
      {typeId === 'case' && (
        <LockedRegion locked={readOnly} style={S.mb14}>
          <CaseTagsEditor
            key={`case-tags:${contentRevision}`}
            initial={tpl.caseTags}
            onChange={setCaseTagsData}
          />
        </LockedRegion>
      )}

      {/* ── Rules — imports the template's saved rules/conditions ── */}
      <LockedRegion locked={readOnly} style={S.mb14}>
        <RulesComp
          key={`rules:${typeId}:${contentRevision}`}
          initial={
            typeId === 'account' ? tpl.accountConditions
              : typeId === 'case' ? tpl.caseRules
                : tpl.rules
          }
          varNames={vars.map((v) => v.name)}
          onChange={setRuleData}
        />
      </LockedRegion>

      <LockedRegion locked={readOnly}>
      {/* ── Subject + Body ──
          With no variations: plain Subject/Body fields. Once a variation is
          added, the initial email BECOMES the first block (default name
          "Variation 1") so every option is a uniform, renameable block — its
          subject/body stay the canonical tpl.subject/body. */}
      {variations.length === 0 ? (
        <>
          <div style={S.mb12}>
            <Field label="Subject">
              <RichTextEditor
                singleLine
                size="sm"
                initialHtml={subject}
                externalRevision={contentRevision}
                onChange={setSubject}
                onChipClick={openSmartByName}
                variables={vars}
                placeholder="Email subject line"
              />
            </Field>
          </div>
          <div style={S.mb12}>
            <Field label="Email body">
              <RichTextEditor
                size="sm"
                initialHtml={body}
                externalRevision={contentRevision}
                onChange={setBody}
                onChipClick={openSmartByName}
                variables={vars}
                onAttachmentResize={handleAttachmentResize}
                minHeight={150}
                placeholder="Write the email body — format with the toolbar, insert variables from the menu. Click a variable chip to set fallbacks, transforms, or formatting."
              />
            </Field>
          </div>
        </>
      ) : (
        <div style={S.mb12}>
          <div style={{
            padding: 12, borderRadius: 'var(--gb-r-md)',
            background: 'var(--gb-fill-faint)',
            border: '1px solid var(--gb-brand-tint-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <I.bolt size={11} style={{ color: 'var(--gb-brand-label)' }} />
              <div style={{ flex: 1 }}>
                <Input value={baseLabel} size="sm" onChange={setBaseLabel} placeholder="Variation 1" />
              </div>
            </div>
            <div style={S.mb8}>
              <Field label="Subject">
                <RichTextEditor
                  singleLine size="sm"
                  initialHtml={subject}
                  externalRevision={contentRevision}
                  onChange={setSubject}
                  onChipClick={openSmartByName}
                  variables={vars}
                  placeholder="Email subject line"
                />
              </Field>
            </div>
            <div>
              <Field label="Body">
                <RichTextEditor
                  size="sm"
                  initialHtml={body}
                  externalRevision={contentRevision}
                  onChange={setBody}
                  onChipClick={openSmartByName}
                  variables={vars}
                  onAttachmentResize={handleAttachmentResize}
                  minHeight={150}
                  placeholder="Write the email body — format with the toolbar, insert variables from the menu."
                />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* ── Variations — explicit sub-templates; animated in/out ── */}
      <AnimatePresence initial={false}>
        {variations.map((v, i) => (
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
                <div style={{ flex: 1 }}>
                  <Input value={v.label} size="sm" onChange={(val) => updateVariation(v.id, { label: val })} placeholder={`Variation ${i + 2}`} />
                </div>
                <Btn variant="ghost" size="xs" icon={<I.trash />} onClick={() => removeVariation(v.id)}>
                  Remove
                </Btn>
              </div>
              <div style={S.mb8}>
                <Field label="Subject">
                  <RichTextEditor
                    singleLine size="sm"
                    initialHtml={v.subject}
                    externalRevision={contentRevision}
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
                    externalRevision={contentRevision}
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
      </LockedRegion>

      {/* ── Variables — VariableTable manages its own inline add form
           now, so we just pass the create callback directly. ── */}
      <div style={S.mb12}>
        <VariableTable
          typeId={typeId}
          vars={displayVars}
          paEnabled={paEnabled}
          onAdd={handleAddVar}
          onEdit={handleEditVar}
          onDelete={handleDeleteVar}
          onOpenSmart={openSmartFromTable}
          onExport={exportVarsJson}
          literalOverridesOnly={readOnly}
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
    </div>
  );
}
