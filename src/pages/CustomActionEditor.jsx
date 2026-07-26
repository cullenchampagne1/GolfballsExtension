import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Btn, Field, Input, Segmented, EditorHeader, I } from '../ui/index.js';
import { IconPicker } from '../ui/components/IconPicker.jsx';
import { CodeAutomationPanel } from '../ui/components/CodeAutomationPanel.jsx';
import { CodeDocsSidebar } from '../ui/components/CodeDocsSidebar.jsx';
import { useToast } from '../ui/components/ToastHost.jsx';
import { resolveDoc } from '../lib/codeEngine/docs.js';
import { translateProgram, flattenBlocks } from '../lib/codeEngine/translate.js';
import { simulateProgram } from '../lib/codeEngine/simulate.js';
import { makeSandboxRunner } from '../lib/codeEngine/sandboxRunner.js';
import { runInSandbox } from '../lib/page-engine/sandbox-bridge.js';
import { samplePageFor } from '../lib/codeEngine/samplePages.js';
import { normalizeCustomAction, defaultPagesFor, ACTION_PAGE_TYPES } from '../lib/customActions.js';

/* ───────────────────────────────────────────────────────────────
   CustomActionEditor — the Manage-window sub-page for authoring a custom
   shelf action. Mirrors the template pages (EditorHeader + Field inputs +
   auto-save via window.__gbSaveAction), but the BODY is the code-blocks
   engine (Code⇆Blocks) instead of a rich-text box, plus a page-type
   selector that scopes what page.* exposes.

   Simulate runs the script DRY against a sample page (no live CRM page here,
   no writes) so the rep can watch the blocks light up. The real, gated run
   happens later from the Action Shelf on a live page.
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
  const [view, setView] = useState('code');
  const [docToken, setDocToken] = useState('');
  const activeDoc = useMemo(() => resolveDoc(docToken), [docToken]);
  // Shelf page scope isn't edited here (the Settings table owns it) but must
  // be persisted; reset to the type default when the page type changes.
  const pagesRef = useRef(action.pages && action.pages.length ? action.pages : defaultPagesFor(action.pageType || 'contact'));

  const program = useMemo(() => {
    const { blocks, errors } = translateProgram(source || '');
    const flat = flattenBlocks(blocks);
    return { blocks, errors, blockCount: flat.length };
  }, [source]);

  // ── single-run simulation that animates the blocks ──
  const [sim, setSim] = useState({ status: 'idle', trace: [], replayIdx: -1, result: null, error: null });
  const simRunRef = useRef(0);
  const simTimer = useRef(null);
  const runningId = sim.status === 'replaying' ? (sim.trace[sim.replayIdx]?.id || null) : null;
  const shownTrace = sim.status === 'replaying' ? sim.trace.slice(0, sim.replayIdx + 1) : sim.trace;

  const startSim = async () => {
    if (!program.blocks.length) { toast?.warning?.('Write some code first.'); return; }
    if (program.errors.length) { toast?.warning?.('Fix the syntax error first.'); return; }
    if (simTimer.current) { clearTimeout(simTimer.current); simTimer.current = null; }
    const my = ++simRunRef.current;
    setView('blocks');
    setSim({ status: 'running', trace: [], replayIdx: -1, result: null, error: null });
    let res;
    try {
      res = await simulateProgram(source || '', samplePageFor(pageType), { run: makeSandboxRunner({ exec: runInSandbox }), user: {} });
    } catch (e) {
      if (my === simRunRef.current) { toast?.error?.('Simulate failed — ' + String(e?.message || e)); setSim((s) => ({ ...s, status: 'idle' })); }
      return;
    }
    if (my !== simRunRef.current) return;
    if (res.error) toast?.error?.(res.error);
    setSim({ status: 'replaying', trace: res.trace, replayIdx: res.trace.length ? 0 : -1, result: res.result, error: res.error || null });
  };

  useEffect(() => {
    if (sim.status !== 'replaying') return undefined;
    if (sim.replayIdx >= sim.trace.length - 1) {
      simTimer.current = setTimeout(() => setSim((s) => ({ ...s, status: 'done' })), 650);
      return () => { if (simTimer.current) clearTimeout(simTimer.current); };
    }
    simTimer.current = setTimeout(() => setSim((s) => ({ ...s, replayIdx: s.replayIdx + 1 })), 600);
    return () => { if (simTimer.current) clearTimeout(simTimer.current); };
  }, [sim.status, sim.replayIdx, sim.trace]);

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
  const IconGlyph = I[icon] || I.bolt;

  const goBack = () => { if (typeof window.closeActionEditor === 'function') window.closeActionEditor(); };

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
      {/* Meta — icon + page type */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, marginBottom: 12, alignItems: 'end' }}>
        <Field label="Icon"><IconPicker value={icon} onChange={setIcon} /></Field>
        <Field label="Runs on"><Segmented value={pageType} onChange={changePageType} options={PT_OPTIONS} /></Field>
      </div>

      {/* Body — Code ⇆ Blocks + docs sidebar */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
        <CodeAutomationPanel
          value={source} onChange={setSource}
          blocks={program.blocks} errors={program.errors} blockCount={program.blockCount}
          view={view} onView={setView} onContext={setDocToken} bindings={null}
          trace={shownTrace} runningId={runningId} done={sim.status === 'done'}
          result={sim.status === 'done' ? sim.result : null}
          error={sim.status === 'done' ? sim.error : null} simStatus={sim.status}
        />
        <div style={{ width: 288, flexShrink: 0, borderLeft: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', minHeight: 0 }}>
          <CodeDocsSidebar doc={activeDoc} />
        </div>
      </div>

      {/* Footer — Simulate */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 20px' }}>
        <Btn size="sm" variant="secondary" icon={<I.play />} onClick={startSim} disabled={sim.status === 'running' || sim.status === 'replaying'}>Simulate</Btn>
        <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>
          Dry run against a sample {pageType} page — no writes. The real, confirm-gated run happens from the Action Shelf.
        </span>
      </div>
    </div>
  );
}

export default CustomActionEditor;
