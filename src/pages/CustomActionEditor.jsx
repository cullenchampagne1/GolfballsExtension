import React, { useEffect, useRef, useState } from 'react';
import { Btn, Field, Input, Segmented, EditorHeader, I } from '../ui/index.js';
import { IconPicker } from '../ui/components/IconPicker.jsx';
import { CodeVarEditor } from '../ui/components/CodeVarEditor.jsx';
import { useToast } from '../ui/components/ToastHost.jsx';
import { simulateProgram } from '../lib/codeEngine/simulate.js';
import { makeSandboxRunner } from '../lib/codeEngine/sandboxRunner.js';
import { runInSandbox } from '../lib/page-engine/sandbox-bridge.js';
import { samplePageFor } from '../lib/codeEngine/samplePages.js';
import { normalizeCustomAction, defaultPagesFor, editorTypeIdFor, ACTION_PAGE_TYPES } from '../lib/customActions.js';

/* ───────────────────────────────────────────────────────────────
   CustomActionEditor — the Manage-window sub-page for authoring a custom
   shelf action. Mirrors the template pages (EditorHeader + Field inputs +
   auto-save via window.__gbSaveAction), but the BODY is a plain code box
   (no Blocks view, no docs sidebar), plus a page-type selector that scopes
   what page.* exposes.

   Simulate runs the script DRY against a sample page (no live CRM page here,
   no writes) and reports the outcome as a toast. The real, gated run happens
   from the Action Shelf on a live page.
─────────────────────────────────────────────────────────────── */

const PT_OPTIONS = ACTION_PAGE_TYPES.map((p) => ({ id: p.id, label: p.label }));

export function EmptyState() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--gb-text-muted)', textAlign: 'center' }}>
      <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <I.bolt size={20} />
      </span>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-secondary)' }}>No action selected</div>
      <div style={{ fontSize: 12, maxWidth: 320 }}>Pick a custom action from the sidebar, or create one from Settings → Custom Actions.</div>
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
  const [simBusy, setSimBusy] = useState(false);
  // Shelf page scope isn't edited here (the Settings table owns it) but must
  // be persisted; reset to the type default when the page type changes.
  const pagesRef = useRef(action.pages && action.pages.length ? action.pages : defaultPagesFor(action.pageType || 'contact'));

  const startSim = async () => {
    setSimBusy(true);
    try {
      const res = await simulateProgram(source || '', samplePageFor(pageType), { run: makeSandboxRunner({ exec: runInSandbox }), user: {} });
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

  // ── auto-save (debounced) — mirror TemplateEditor ──
  const skipSave = useRef(true);
  const saveTimer = useRef(0);
  const build = () => normalizeCustomAction({ ...action, name, description, icon, pageType, enabled, source, pages: pagesRef.current });
  useEffect(() => {
    if (skipSave.current) { skipSave.current = false; return undefined; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { if (typeof window.__gbSaveAction === 'function') window.__gbSaveAction(build()); }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [name, description, icon, pageType, enabled, source]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDelete = () => { if (typeof window.deleteActionById === 'function') window.deleteActionById(action.id); };
  const goBack = () => { if (typeof window.closeActionEditor === 'function') window.closeActionEditor(); };
  const IconGlyph = I[icon] || I.bolt;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, padding: '20px 0 0' }}>
      <div style={{ marginBottom: 10 }}>
        <Btn variant="ghost" size="xs" icon={<I.chevr style={{ transform: 'rotate(180deg)' }} />} onClick={goBack}>Back</Btn>
      </div>
      <EditorHeader
        icon={<IconGlyph />}
        title={name || 'New action'}
        typeLabel={pageType.toUpperCase()}
        enabled={enabled}
        onToggle={() => setEnabled((e) => !e)}
        desc={description || 'Custom shelf action'}
        onDelete={onDelete}
      />

      {/* Meta — name + description */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 10, marginBottom: 10 }}>
        <Field label="Action name"><Input value={name} placeholder="e.g. Create 5 tasks" size="sm" onChange={setName} /></Field>
        <Field label="Description"><Input value={description} placeholder="Short hint shown on the shelf" size="sm" onChange={setDescription} /></Field>
      </div>
      {/* Meta — page type */}
      <div style={{ marginBottom: 10 }}>
        <Field label="Runs on"><Segmented value={pageType} onChange={changePageType} options={PT_OPTIONS} /></Field>
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
          typeId={editorTypeIdFor(pageType)}
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
          Dry run against a sample {pageType} page — no writes. The real, confirm-gated run happens from the Action Shelf.
        </span>
      </div>
    </div>
  );
}

export default CustomActionEditor;
