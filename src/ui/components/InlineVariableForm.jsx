import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { I, Icon } from '../icons.jsx';
import { Btn } from './Btn.jsx';
import { Field } from './Field.jsx';
import { Input } from './Input.jsx';
import { Dropdown } from './Dropdown.jsx';
import { Dot } from './Dot.jsx';
import { Segmented } from './Segmented.jsx';
import { SOURCE_KINDS, BUILTIN_PATHS, REGEX_FIELDS } from './AddVariableModal.jsx';
import { VariableSchemaPicker } from './VariableSchemaPicker.jsx';
import { CodeVarEditor, isAsyncBody } from './CodeVarEditor.jsx';
import { orderSchema } from '../../lib/page-schemas/order.js';
import { variableEditorKinds } from '../../lib/templateVariableEditing.js';

/* ────────────────────────────────────────────────────────────────
   InlineVariableForm — compact, in-table replacement for
   AddVariableModal. Renders as an expanding row inside VariableTable
   so adding a variable feels like adding a spreadsheet entry rather
   than opening a 560px modal.

   Animates open/closed via motion height-auto; mirrors AddVariableModal's
   data flow (kind picker, kind-specific config, live DOM preview, regex
   from-field) but with one column and tighter spacing.

   Props:
     typeId  'order'|'case'|'account'
     onAdd   ({ name, kind, config, source? }) => void
     onCancel() => void
──────────────────────────────────────────────────────────────── */

const PickerIcon  = (p) => <Icon {...p}><path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></Icon>;
const RegexIcon   = (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M12 5v6M12 12v6M6 12h12"/></Icon>;
const VariableIcon = (p) => <Icon {...p}><path d="M5 4 a14 14 0 000 16M19 4a14 14 0 010 16"/><path d="M9 9l6 6M9 15l6-6"/></Icon>;
const CodeIcon = (p) => <Icon {...p}><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></Icon>;

const ClipIcon = (p) => <Icon {...p}><path d="M21.4 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></Icon>;

const KIND_LABELS = {
  code:    'Code',
  builtin: 'Built-in',
  schema:  'Schema',
  dom:     'DOM',
  literal: 'Literal',
  regex:   'Regex',
  attachment: 'Attachment',
};
const KIND_ICONS = {
  code:    <CodeIcon />,
  builtin: <I.bolt />,
  schema:  <I.search />,
  dom:     <I.search />,
  literal: <I.edit />,
  regex:   <RegexIcon />,
  attachment: <ClipIcon />,
};

const SOFT = { duration: 0.22, ease: [0.32, 0.72, 0, 1] };

export function InlineVariableForm({ typeId, onAdd, onCancel, onDelete, varNames = [], initialVariable = null }) {
  const initial = initialVariable || {};
  const initialAttach = initial.attach || {};
  const [name,         setName]         = useState(initial.name || '');
  const [kind,         setKind]         = useState(initial.kind || SOURCE_KINDS[typeId]?.[0] || 'literal');
  const [config,       setConfig]       = useState(initial.config || '');
  const [picking,      setPicking]      = useState(false);
  const [hoverText,    setHoverText]    = useState('');
  const [liveResolved, setLiveResolved] = useState(null);
  const [regexField,   setRegexField]   = useState(initial.source || 'body');
  const [regexGroup,   setRegexGroup]   = useState(String(initial.group || 1));
  const [regexScope,   setRegexScope]   = useState(initial.scope || '');
  const [pickingScope, setPickingScope] = useState(false);
  // Attachment config — inline image (placed in the body, sized/aligned) vs an
  // attached file (rides the email as a real attachment). Source mirrors the
  // main kinds: a fixed URL, a schema path that resolves to a URL, or a code
  // block that returns a URL / data: URL.
  const [attMode,      setAttMode]      = useState(initialAttach.mode || 'inline');
  const [attSource,    setAttSource]    = useState(initialAttach.source || 'url');
  const [attFilename,  setAttFilename]  = useState(initialAttach.filename || '');
  const [attWidth,     setAttWidth]     = useState(initialAttach.width || 220);
  const [attAlign,     setAttAlign]     = useState(initialAttach.align || 'left');

  // Reset kind/config when the template type changes.
  useEffect(() => {
    if (initialVariable) return;
    setKind(SOURCE_KINDS[typeId]?.[0] ?? 'literal');
    setConfig('');
    setPicking(false);
    setHoverText('');
  }, [typeId, initialVariable]);

  // DOM picker — same plumbing as AddVariableModal: an initial .get
  // catches any pickResult that landed before we subscribed,
  // chrome.storage.onChanged carries subsequent writes + the live
  // hover text from the host page.
  useEffect(() => {
    if (!picking) { setHoverText(''); return undefined; }
    let mounted = true;
    chrome.storage.local.get(['pickResult', 'pickHover'], (data) => {
      if (!mounted) return;
      const seeded = data?.pickResult;
      if (seeded && seeded.fieldId === 'pick_inlinevar') {
        setConfig(seeded.selector || '');
        setPicking(false);
        setHoverText('');
        return;
      }
      if (data?.pickHover?.text) setHoverText(data.pickHover.text);
    });
    function onChanged(changes) {
      if (changes.pickResult) {
        const result = changes.pickResult.newValue;
        if (result && result.fieldId === 'pick_inlinevar') {
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
    return () => { mounted = false; chrome.storage.onChanged.removeListener(onChanged); };
  }, [picking]);

  function startPick() {
    setPicking(true);
    setHoverText('');
    chrome.runtime.sendMessage({ action: 'startPick', fieldId: 'pick_inlinevar' });
  }
  function cancelPick() {
    setPicking(false);
    chrome.runtime.sendMessage({ action: 'cancelPick' });
  }

  // Regex-scope DOM picker — separate fieldId so it doesn't collide with
  // the main dom-kind picker above. Only used by the regex branch when
  // the user wants to narrow the match to a subtree of the page.
  useEffect(() => {
    if (!pickingScope) return undefined;
    let mounted = true;
    chrome.storage.local.get(['pickResult'], (data) => {
      if (!mounted) return;
      const seeded = data?.pickResult;
      if (seeded && seeded.fieldId === 'pick_inlinevar_scope') {
        setRegexScope(seeded.selector || '');
        setPickingScope(false);
      }
    });
    function onChanged(changes) {
      if (!changes.pickResult) return;
      const result = changes.pickResult.newValue;
      if (result && result.fieldId === 'pick_inlinevar_scope') {
        setRegexScope(result.selector || '');
        setPickingScope(false);
      }
    }
    chrome.storage.onChanged.addListener(onChanged);
    return () => { mounted = false; chrome.storage.onChanged.removeListener(onChanged); };
  }, [pickingScope]);

  const startPickScope = () => {
    setPickingScope(true);
    chrome.runtime.sendMessage({ action: 'startPick', fieldId: 'pick_inlinevar_scope' });
  };
  const cancelPickScope = () => {
    setPickingScope(false);
    chrome.runtime.sendMessage({ action: 'cancelPick' });
  };

  // Live DOM resolution preview for the dom kind.
  useEffect(() => {
    if (kind !== 'dom' || !config || picking) { setLiveResolved(null); return undefined; }
    if (typeof window.__gbResolveVars !== 'function') return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.resolve(window.__gbResolveVars({ __preview: { type: 'selector', selector: config } }))
        .then((res) => {
          if (cancelled) return;
          const val = res?.resolved?.__preview;
          setLiveResolved(val ? String(val) : null);
        });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [kind, config, picking]);

  // Attachment definitions belong to the template, not to whether Direct Send
  // happens to be enabled at edit time. Keeping the editor available for every
  // email type prevents an existing proof attachment from becoming uneditable.
  const kinds = variableEditorKinds(typeId, SOURCE_KINDS);
  const kindOptions = kinds.map((id) => ({
    id, label: KIND_LABELS[id] || id, icon: KIND_ICONS[id],
  }));

  const previewResolved =
    kind === 'literal' ? (config || '— empty —')
    : kind === 'builtin' ? (config ? '(live value)' : '— select a path —')
    : kind === 'schema'  ? (config ? '(engine value)' : '— pick a field —')
    : kind === 'dom'     ? (liveResolved || (config ? '(querying…)' : '— enter a selector —'))
    : kind === 'regex'   ? (config ? '(first capture group)' : '— enter a regex —')
    : kind === 'code'    ? (config ? '(resolves on load)' : '— write code —')
    : kind === 'attachment' ? (config ? (attMode === 'inline' ? `(inline image · ${attWidth}px)` : '(file attachment)') : '— point at a file —')
    : '—';

  const canAdd = !!name && !!config && /^\w+$/.test(name) && !varNames.includes(name);

  /* The form previously ran a ResizeObserver that called
     anchor.scrollIntoView({ block: 'nearest' }) on every layout
     tick while the height tween was animating. The intent was to
     keep the action row visible; the effect was that — with no
     scrollable ancestor in the editor's column — `nearest`
     resolved to the window and every frame scrolled the page
     down. By the time the user finished swapping kinds, the
     editor had drifted up and stuck there until reload (the
     "whole UI gets pushed up" bug). Removed entirely; the table
     column is short enough that the form fits without forced
     scrolling, and the user can scroll manually if needed. */
  const formRef = useRef(null);
  const bottomRef = useRef(null);

  return (
    <motion.div
      ref={formRef}
      // `layout` is intentionally omitted here — it fights `height: auto`
      // on the same element (each frame motion remeasures and snaps the
      // height instead of tweening). Surrounding rows reflow naturally
      // because they're inside an `<AnimatePresence mode="popLayout">`
      // with their own `layout` props.
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={SOFT}
      style={{ overflow: 'hidden' }}
    >
      <div style={{
        padding: 12,
        background: 'var(--gb-fill-faint)',
        borderTop: '1px solid var(--gb-border-subtle)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {initialVariable ? <I.edit size={11} style={{ color: 'var(--gb-brand-label)' }} /> : <I.plus size={11} style={{ color: 'var(--gb-brand-label)' }} />}
          <span style={{
            flex: 1, fontSize: 9, fontWeight: 800, letterSpacing: 0.8,
            textTransform: 'uppercase', color: 'var(--gb-text-muted)',
          }}>
            {initialVariable ? 'Edit variable' : 'New variable'}
          </span>
        </div>

        {/* Name */}
        <Field label="Name" required>
          <Input
            size="sm"
            value={name}
            placeholder="e.g. customer_first"
            leading={<VariableIcon />}
            mono
            autoFocus
            onChange={(v) => setName(v.replace(/\s/g, '_'))}
          />
        </Field>

        {/* Source pills */}
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: 0.6, color: 'var(--gb-text-muted)', marginBottom: 6,
          }}>
            Source
          </div>
          <Segmented
            value={kind}
            onChange={(id) => { setKind(id); setConfig(''); setPicking(false); }}
            options={kindOptions}
            size="sm"
            full
          />
        </div>

        {/* Kind-specific config — keyed on kind so swapping fades the old
            config out and the new one in, instead of snapping. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={kind}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {kind === 'code' && (
              <Field label="Code" hint="Return a value · ctx = page data · vars · h = helpers">
                <CodeVarEditor
                  value={config}
                  onChange={setConfig}
                  typeId={typeId}
                  varNames={varNames}
                />
              </Field>
            )}
            {kind === 'schema' && (
              <Field
                label="Schema path"
                hint={typeId === 'order'
                  ? 'Tree of the order page schema · ↓↑ ↵'
                  : 'Tree of the unified contact + account schema · ↓↑ ↵'}
              >
                {/* Inline tree picker — opens in flow so the form
                    row grows to contain it. Order templates pick from the
                    order schema; account/contact from the unified schema. */}
                <VariableSchemaPicker
                  value={config}
                  onChange={setConfig}
                  placeholder="Pick a field…"
                  schema={typeId === 'order' ? orderSchema : undefined}
                />
              </Field>
            )}
            {kind === 'builtin' && (
              <>
                {typeId === 'account' && <DeprecatedInlineNotice />}
                <Field
                  label="Built-in path"
                  hint="Pre-defined value from the page context"
                >
                  <Dropdown
                    size="sm"
                    value={config}
                    placeholder="Select a field…"
                    leading={<I.bolt />}
                    searchable
                    options={BUILTIN_PATHS[typeId] || BUILTIN_PATHS.order}
                    onChange={setConfig}
                  />
                </Field>
              </>
            )}

            {kind === 'dom' && (
              <>
                {typeId === 'account' && <DeprecatedInlineNotice />}
                <Field
                  label="CSS selector"
                  hint="First matching element's text is used"
                >
                  <Input
                    size="sm"
                    value={config}
                    placeholder=".order-total .amount"
                    mono
                    leading={<I.search />}
                    onChange={setConfig}
                  />
                </Field>
                <div style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
                  <div style={{
                    flex: 1, padding: '6px 9px',
                    background: 'var(--gb-fill-subtle)',
                    border: '1px solid ' + (picking ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'),
                    borderRadius: 'var(--gb-r-sm)',
                    fontSize: 10.5, display: 'flex', alignItems: 'center', gap: 7,
                  }}>
                    <Dot
                      tone={picking ? 'brand' : liveResolved ? 'brand' : config ? 'warning' : 'muted'}
                      glow={picking || !!liveResolved}
                      size={5}
                    />
                    <span style={{ flex: 1, color: 'var(--gb-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {picking
                        ? hoverText
                          ? <span style={{ color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', fontSize: 10 }}>"{hoverText}"</span>
                          : <span style={{ fontStyle: 'italic' }}>Hover an element on the page…</span>
                        : liveResolved
                          ? <><strong style={{ color: 'var(--gb-brand-label)' }}>1 match</strong> · <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 10 }}>{liveResolved}</span></>
                          : config
                            ? <span style={{ color: 'var(--gb-warning-fg)' }}>No match on active page</span>
                            : 'Enter a selector or pick'
                      }
                    </span>
                  </div>
                  <Btn
                    variant={picking ? 'ghost' : 'tinted'}
                    size="sm"
                    icon={<PickerIcon />}
                    onClick={picking ? cancelPick : startPick}
                  >
                    {picking ? 'Cancel' : 'Pick'}
                  </Btn>
                </div>
              </>
            )}

            {kind === 'regex' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px', gap: 6 }}>
                  <Field label="From field">
                    <Dropdown size="sm" value={regexField} options={REGEX_FIELDS} onChange={setRegexField} />
                  </Field>
                  <Field label={`Regex (capture ${regexGroup || '1'})`}>
                    <Input
                      size="sm"
                      value={config}
                      placeholder="order\\s+(ORD-\\d+)"
                      mono
                      leading={<RegexIcon />}
                      onChange={setConfig}
                    />
                  </Field>
                  {/* Capture group number — defaults to 1, but the regex
                      may have multiple capture groups and the user might
                      want #2 or higher. Backup had this on the var def. */}
                  <Field label="Group">
                    <Input
                      size="sm"
                      mono
                      value={regexGroup}
                      placeholder="1"
                      onChange={(v) => setRegexGroup(v.replace(/[^0-9]/g, '') || '')}
                    />
                  </Field>
                </div>
                {/* Optional scope: narrow the regex to a CSS subtree of
                    the page. Only meaningful for order / account variables
                    where regex runs against the rendered DOM. Case-template
                    regex variables match against the email payload (subject
                    / body / from), which has no DOM to scope, so we hide
                    the field entirely there. */}
                {typeId !== 'case' && (
                  <Field label="Scope (optional CSS selector)" hint="Limit the regex to a subtree on the page">
                    <Input
                      size="sm"
                      mono
                      value={regexScope}
                      placeholder=".email-body, #thread-1, etc."
                      leading={<I.search />}
                      onChange={setRegexScope}
                      trailing={
                        <Btn
                          variant={pickingScope ? 'ghost' : 'tinted'}
                          size="xs"
                          icon={<PickerIcon />}
                          onClick={pickingScope ? cancelPickScope : startPickScope}
                        >
                          {pickingScope ? 'Cancel' : 'Pick'}
                        </Btn>
                      }
                    />
                  </Field>
                )}
              </>
            )}

            {kind === 'literal' && (
              <Field label="Fixed value" hint="Used verbatim every time">
                <Input
                  size="sm"
                  value={config}
                  placeholder="e.g. Customer Service Team"
                  onChange={setConfig}
                />
              </Field>
            )}

            {kind === 'attachment' && (
              <>
                {/* Placement: inline = an image placed in the body where the
                    {{chip}} sits (scalable / movable); attach = a real file
                    attachment listed on the email. */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--gb-text-muted)', marginBottom: 6 }}>
                    Placement
                  </div>
                  <Segmented
                    size="sm" full value={attMode}
                    onChange={setAttMode}
                    options={[
                      { id: 'inline', label: 'Inline image' },
                      { id: 'attach', label: 'Attached file' },
                    ]}
                  />
                </div>
                {/* Where the file comes from. */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--gb-text-muted)', marginBottom: 6 }}>
                    File source
                  </div>
                  <Segmented
                    size="sm" full value={attSource}
                    onChange={(id) => { setAttSource(id); setConfig(''); }}
                    options={[
                      { id: 'url',    label: 'URL' },
                      { id: 'schema', label: 'Schema' },
                      { id: 'code',   label: 'Code' },
                    ]}
                  />
                </div>
                {attSource === 'url' && (
                  <Field label="File URL" hint="Direct link to the image / file (https or data:)">
                    <Input size="sm" mono value={config} placeholder="https://static.golfballs.com/…/logo.png" leading={<ClipIcon />} onChange={setConfig} />
                  </Field>
                )}
                {attSource === 'schema' && (
                  <Field label="Schema path" hint="A field that resolves to a file URL (e.g. an uploaded logo)">
                    <VariableSchemaPicker
                      value={config}
                      onChange={setConfig}
                      placeholder="Pick a field…"
                      schema={typeId === 'order' ? orderSchema : undefined}
                    />
                  </Field>
                )}
                {attSource === 'code' && (
                  <Field label="Code" hint="Return a URL or data: URL · ctx = page data · vars · h = helpers">
                    <CodeVarEditor value={config} onChange={setConfig} typeId={typeId} varNames={varNames} />
                  </Field>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: attMode === 'inline' ? '1fr 90px 110px' : '1fr', gap: 6 }}>
                  <Field label="Filename" hint={attMode === 'attach' ? 'Shown on the attachment' : 'Alt text / fallback name'}>
                    <Input size="sm" value={attFilename} placeholder="logo.png" onChange={setAttFilename} />
                  </Field>
                  {attMode === 'inline' && (
                    <>
                      <Field label="Width (px)">
                        <Input size="sm" mono value={String(attWidth)} onChange={(v) => setAttWidth(Math.max(24, Math.min(600, parseInt(v.replace(/\D/g, ''), 10) || 0)) || 220)} />
                      </Field>
                      <Field label="Align">
                        <Dropdown size="sm" value={attAlign} onChange={setAttAlign}
                          options={[{ id: 'left', label: 'Left' }, { id: 'center', label: 'Center' }, { id: 'right', label: 'Right' }]} />
                      </Field>
                    </>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', lineHeight: 1.5 }}>
                  {attMode === 'inline'
                    ? <>Place <b style={{ color: 'var(--gb-text-secondary)' }}>{'{{' + (name || 'name') + '}}'}</b> in the body — it renders as a resizable image block. The image data is embedded into the email at send (works without the recipient loading remote images).</>
                    : <>The file is fetched at send time and attached to the email (sent as data, not a link). Place <b style={{ color: 'var(--gb-text-secondary)' }}>{'{{' + (name || 'name') + '}}'}</b> at the end of the body — it shows as an attachment chip.</>}
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Preview */}
        <div style={{
          padding: '7px 10px',
          background: 'var(--gb-fill-inverse-medium)',
          border: '1px solid var(--gb-border-subtle)',
          borderRadius: 'var(--gb-r-sm)',
          fontSize: 11, color: 'var(--gb-text-tertiary)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'stretch',
            borderRadius: 'var(--gb-r-sm)',
            border: '1px solid var(--gb-brand-tint-border)',
            background: 'var(--gb-brand-tint-soft)',
            overflow: 'hidden',
          }}>
            <span style={{ padding: '1px 6px', fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, fontWeight: 600, color: 'var(--gb-brand-label)' }}>
              {name || 'variable_name'}
            </span>
            <span style={{ padding: '0 4px', borderLeft: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'inline-flex', alignItems: 'center', opacity: 0.55 }}>
              <I.bolt size={8} />
            </span>
          </span>
          <span style={{ color: 'var(--gb-text-muted)' }}>→</span>
          <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, color: 'var(--gb-text-tertiary)' }}>
            {previewResolved}
          </span>
        </div>

        {/* Actions — also the scroll anchor (see ResizeObserver above) */}
        <div ref={bottomRef} style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          {initialVariable && onDelete && (
            <Btn variant="ghost" status="danger" size="sm" icon={<I.trash />} onClick={onDelete}>Delete</Btn>
          )}
          <div style={{ flex: 1 }} />
          <Btn variant="ghost" size="sm" onClick={onCancel}>Cancel</Btn>
          <Btn
            variant="primary"
            size="sm"
            icon={initialVariable ? <I.check /> : <I.plus />}
            disabled={!canAdd}
            onClick={() => onAdd?.({
              name, kind, config,
              ...(kind === 'regex' ? {
                source: regexField,
                group: Number(regexGroup) || 1,
                /* scope only applies to DOM-side regex; case templates
                   match against email data so we never emit it there
                   even if leftover state from a kind switch is around. */
                ...(typeId !== 'case' && regexScope ? { scope: regexScope } : {}),
              } : {}),
              ...(kind === 'code' ? { async: isAsyncBody(config) } : {}),
              ...(kind === 'attachment' ? {
                attach: {
                  mode: attMode, source: attSource,
                  filename: attFilename || 'attachment',
                  ...(attMode === 'inline' ? { width: attWidth, align: attAlign } : {}),
                },
                ...(attSource === 'code' ? { async: isAsyncBody(config) } : {}),
              } : {}),
            })}
          >
            {initialVariable ? 'Save changes' : 'Add'}
          </Btn>
        </div>
      </div>
    </motion.div>
  );
}

/* Smaller deprecation banner sized for the inline form row.
   Same intent as AddVariableModal's DeprecatedNotice — flagged
   above the field, warning-tinted so the rep can't miss it. */
function DeprecatedInlineNotice() {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 6,
      padding: '6px 8px',
      background: 'var(--gb-warning-tint-soft, var(--gb-warning-tint-medium))',
      border: '1px solid var(--gb-warning-tint-border)',
      borderRadius: 'var(--gb-r-sm)',
      color: 'var(--gb-warning-fg)',
      fontSize: 10.5,
      lineHeight: 1.4,
    }}>
      <span style={{
        fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5,
        padding: '1px 4px',
        borderRadius: 3,
        background: 'var(--gb-warning-tint-medium)',
        color: 'var(--gb-warning-fg)',
        flexShrink: 0,
        fontFamily: 'var(--gb-font-mono)',
        textTransform: 'uppercase',
      }}>Deprecated</span>
      <span>Use <strong>Schema</strong> for new account variables.</span>
    </div>
  );
}
