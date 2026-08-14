import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn, Field, Input, Segmented, EditorHeader, I } from '../ui/index.js';
import { IconPicker } from '../ui/components/IconPicker.jsx';
import { CustomLinkField } from '../ui/components/CustomLinkField.jsx';
import { CodeVarEditor } from '../ui/components/CodeVarEditor.jsx';
import { useToast } from '../ui/components/ToastHost.jsx';
import { simulateProgram } from '../lib/codeEngine/simulate.js';
import { makeSandboxRunner } from '../lib/codeEngine/sandboxRunner.js';
import { runInSandbox } from '../lib/page-engine/sandbox-bridge.js';
import { samplePageFor } from '../lib/codeEngine/samplePages.js';
import { loadCodeTemplateLibrary } from '../lib/codeEngine/templateLibrary.js';
import { normalizeCustomAction, defaultPagesFor, ACTION_PAGE_TYPES } from '../lib/customActions.js';
import { normalizeEntryPoints } from '../lib/customActionEntryPoints.js';

/* ───────────────────────────────────────────────────────────────
   CustomActionEditor — the Manage-window sub-page for authoring a custom
   shelf action. Unlike email/note templates, custom actions are explicit
   drafts: nothing reaches storage until Save Action is clicked. The body is a
   plain code box (no Blocks view/docs sidebar), and its runtime namespaces are
   page.* / user.* / actions.* rather than the template editor's ctx.* schema.

   Simulate runs the script DRY against a sample page (no live CRM page here,
   no writes) and reports the outcome as a toast. The real, gated run happens
   from the Action Shelf on a live page.
─────────────────────────────────────────────────────────────── */

/* Type-tab options — mirrors the email template editor's top Segmented. */
const PT_ICONS = { contact: I.user, account: I.users, order: I.card, any: I.sparkle, custom: I.link };
const PT_OPTIONS = ACTION_PAGE_TYPES.map((p) => {
  const Glyph = PT_ICONS[p.id];
  return { id: p.id, label: p.label, icon: Glyph ? <Glyph /> : undefined };
});

export function EmptyState() {
  const goBack = () => {
    if (typeof window.closeActionEditor === 'function') window.closeActionEditor();
  };
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--gb-text-muted)', textAlign: 'center' }}>
      <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <I.bolt size={20} />
      </span>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-secondary)' }}>No action selected</div>
      <div style={{ fontSize: 12, maxWidth: 320 }}>Choose an action from the Custom Actions table in Settings, or create a new one there.</div>
      <Btn
        variant="secondary"
        size="sm"
        icon={<I.chevr style={{ transform: 'rotate(180deg)' }} />}
        onClick={goBack}
      >
        Back to Settings
      </Btn>
    </div>
  );
}

export function CustomActionEditor({ action }) {
  const toast = useToast();
  const [name, setName] = useState(action.name || '');
  const [description, setDescription] = useState(action.description || '');
  const [icon, setIcon] = useState(action.icon || 'bolt');
  const [pageType, setPageType] = useState(action.pageType || 'contact');
  const [enabled, setEnabled] = useState(action.enabled !== false);
  const [source, setSource] = useState(action.source || '');
  const [entryPointsText, setEntryPointsText] = useState(
    normalizeEntryPoints(action.entryPoints).join(', '),
  );
  const [customUrl, setCustomUrl] = useState(action.customUrl || '');
  const [simBusy, setSimBusy] = useState(false);
  const [isNew, setIsNew] = useState(action.__isNew === true);
  // Shelf page scope isn't edited here (the Settings table owns it) but must
  // be persisted; reset to the type default when the page type changes.
  const pagesRef = useRef(action.pages && action.pages.length ? action.pages : defaultPagesFor(action.pageType || 'contact'));
  const snapshot = (record) => JSON.stringify({
    name: record.name || '',
    description: record.description || '',
    icon: record.icon || 'bolt',
    pageType: record.pageType || 'contact',
    enabled: record.enabled !== false,
    source: record.source || '',
    pages: record.pages || [],
    customUrl: record.customUrl || '',
    entryPoints: normalizeEntryPoints(record.entryPoints),
  });
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshot(action));
  const draftSnapshot = snapshot({
    name,
    description,
    icon,
    pageType,
    enabled,
    source,
    pages: pagesRef.current,
    customUrl,
    entryPoints: normalizeEntryPoints(entryPointsText),
  });
  const dirty = isNew || draftSnapshot !== savedSnapshot;

  const startSim = async () => {
    setSimBusy(true);
    try {
      const user = await loadCodeTemplateLibrary();
      const res = await simulateProgram(
        source || '',
        samplePageFor(pageType, { entryPoints: normalizeEntryPoints(entryPointsText) }),
        { run: makeSandboxRunner({ exec: runInSandbox }), user },
      );
      if (res.error) {
        toast?.error?.('Simulate: ' + res.error, { duration: 5000 });
      } else {
        const steps = res.trace?.length || 0;
        const result = typeof res.result === 'string' && res.result ? ` — ${res.result}` : '';
        toast?.success?.(`Simulated OK · ${steps} step${steps === 1 ? '' : 's'}${result}`, { duration: 3600 });
      }
    } catch (e) {
      toast?.error?.('Simulate failed — ' + String(e?.message || e), { duration: 5000 });
    }
    setSimBusy(false);
  };

  const changePageType = (pt) => { setPageType(pt); pagesRef.current = defaultPagesFor(pt); };

  const build = () => normalizeCustomAction({
    ...action,
    name,
    description,
    icon,
    pageType,
    enabled,
    source,
    pages: pagesRef.current,
    customUrl,
    entryPoints: normalizeEntryPoints(entryPointsText),
    updatedAt: Date.now(),
  });
  const save = async () => {
    if (typeof window.__gbSaveAction !== 'function') {
      throw new Error('Action storage is unavailable. Reload the Manage window.');
    }
    const record = build();
    await window.__gbSaveAction(record);
    setSavedSnapshot(draftSnapshot);
    setIsNew(false);
    toast?.success?.(`Saved ${record.name}`);
  };

  const onDelete = () => {
    if (!isNew && typeof window.deleteActionById === 'function') {
      window.deleteActionById(action.id);
    }
  };
  const goBack = () => { if (typeof window.closeActionEditor === 'function') window.closeActionEditor(); };
  const IconGlyph = I[icon] || I.bolt;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px 0 0' }}>
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Btn variant="ghost" size="sm" icon={<I.chevr style={{ transform: 'rotate(180deg)' }} />} onClick={goBack}>
          Back to Settings
        </Btn>
        <div style={{ flex: 1 }} />
        {dirty && (
          <span style={{ fontSize: 10.5, color: 'var(--gb-warning-fg)' }}>
            Unsaved changes
          </span>
        )}
        <Btn
          variant="primary"
          size="sm"
          icon={<I.save />}
          disabled={!dirty}
          onClick={save}
        >
          Save Action
        </Btn>
      </div>
      <EditorHeader
        icon={<IconGlyph />}
        title={name || 'New action'}
        typeLabel={pageType.toUpperCase()}
        enabled={enabled}
        onToggle={() => setEnabled((e) => !e)}
        desc={description || 'Custom shelf action'}
        onDelete={isNew ? undefined : onDelete}
      />

      {/* ── Type tabs — same top-row pattern as the email template editor:
          Contact / Account / Order / Any / Custom right under the header. ── */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Segmented value={pageType} onChange={changePageType} options={PT_OPTIONS} />
        <div style={{ flex: 1 }} />
      </div>

      {/* Custom targeting — not a standing section: it animates in under the
          tabs only while the Custom type is selected. Link = show on any page
          whose URL contains the text; entry points further gate on a live
          provider / CSS selector (e.g. an open modal). */}
      <AnimatePresence initial={false}>
        {pageType === 'custom' && (
          <motion.div
            key="custom-targeting"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <motion.div
              data-custom-target-row="link"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, delay: 0.03, ease: 'easeOut' }}
              style={{ marginBottom: 10 }}
            >
              <Field label="Link contains" hint="Optional — show the action when the page URL contains this text.">
                <CustomLinkField value={customUrl} onChange={setCustomUrl} alwaysOpen />
              </Field>
            </motion.div>
            <motion.div
              data-custom-target-row="entry-points"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, delay: 0.08, ease: 'easeOut' }}
              style={{ marginBottom: 10 }}
            >
              <Field label="Entry points" hint="Optional. Providers or CSS selectors, comma-separated.">
                <Input
                  value={entryPointsText}
                  onChange={setEntryPointsText}
                  size="sm"
                  placeholder=".gb-task-list-modal, modal:task-list"
                />
              </Field>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Meta — name + description */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 10, marginBottom: 10 }}>
        <Field label="Action name"><Input value={name} placeholder="e.g. Create 5 tasks" size="sm" onChange={setName} /></Field>
        <Field label="Description"><Input value={description} placeholder="Short hint shown on the shelf" size="sm" onChange={setDescription} /></Field>
      </div>
      {/* Meta — icon (full-width row) */}
      <div style={{ marginBottom: 12 }}>
        <Field label="Icon"><IconPicker value={icon} onChange={setIcon} /></Field>
      </div>

      {/* Body — plain code box (no Blocks view, no docs sidebar) */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
        <CodeVarEditor
          value={source}
          onChange={setSource}
          typeId={null}
          bindings={null}
          hideActions
          fill
          placeholder={'// Write your action. Use actions.* (confirm-gated) and page.*\n// e.g. for (let i = 1; i <= 5; i++) actions.createTask({ subject: `Follow up ${i}` });'}
        />
      </div>

      {/* Footer — Simulate */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 20px' }}>
        <Btn size="sm" variant="secondary" icon={<I.play />} onClick={startSim} disabled={simBusy}>Simulate</Btn>
        <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>
          Dry run against a sample {pageType === 'any' || pageType === 'custom' ? 'page' : `${pageType} page`} — no writes. The real, confirm-gated run happens from the Action Shelf.
        </span>
      </div>
    </div>
  );
}

export default CustomActionEditor;
