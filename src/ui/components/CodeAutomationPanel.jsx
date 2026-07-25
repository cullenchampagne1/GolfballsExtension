import React, { useMemo, useState } from 'react';
import { CodeVarEditor } from './CodeVarEditor.jsx';
import { BlocksView } from './BlocksView.jsx';
import { Spinner } from '../shared.jsx';
import { I } from '../icons.jsx';
import { resolveDoc } from '../../lib/codeEngine/docs.js';

/* ───────────────────────────────────────────────────────────────
   CodeAutomationPanel — the authoring body (Code ⇆ Blocks) + live docs.

   This is a controlled display: the parent (CampaignManager) owns the
   code, the simulation, and the run — exactly like the old timeline was
   driven by the top bar. The panel just renders the editor, the block
   flow (fed the parent's trace/runningId/done), and the docs sidebar
   that follows the caret. The Simulate / Run controls live in the top
   bar, not here.
─────────────────────────────────────────────────────────────── */

const STARTER = `// page.contact = who you're simulating · user.* = your saved templates
// Re-engage a cold contact with a SAVED email, else a saved task:
const c = page.contact;

if (c.daysCold > 30) {
  await actions.sendEmail(user.email("Win-back"));   // a saved email
} else {
  await actions.createTask(user.task("Quick follow-up"));
}`;

export function CodeAutomationPanel({
  value, onChange, blocks = [], errors = [],
  view = 'code', onView,
  trace = [], runningId = null, done = false, result = null, error = null,
  simStatus = 'idle',
}) {
  const code = value || '';
  const [docToken, setDocToken] = useState('');
  const activeDoc = useMemo(() => resolveDoc(docToken), [docToken]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      {/* Toolbar: the Code ⇆ Blocks switch + sim status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--gb-border-default)', flexShrink: 0 }}>
        <ViewSwitch view={view} onView={onView} blockCount={blocks.length} />
        <div style={{ marginLeft: 'auto' }}><SimStatus status={simStatus} /></div>
      </div>

      {/* Body: [ code | blocks ] + live docs */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {view === 'code' ? (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: 12, gap: 8, minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <CodeVarEditor
                value={code}
                onChange={onChange}
                onContext={setDocToken}
                typeId="account"
                varNames={[]}
                hideActions
                fill
                placeholder={STARTER}
              />
            </div>
            <div style={{ flexShrink: 0, fontSize: 10, color: 'var(--gb-text-muted)', lineHeight: 1.5 }}>
              <b>page.*</b> is the contact being run. <b>user.*</b> are your saved emails/tasks/calls. <b>actions.*</b> — <code>sendEmail</code>, <code>createTask</code>, <code>logCall</code>.
            </div>
            {errors.length ? (
              <div style={{ flexShrink: 0, fontSize: 10.5, color: 'var(--gb-error-fg)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <I.alert size={12} /> Syntax error — the blocks pause until it's fixed.
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 0, overflow: 'auto', background: 'var(--gb-surface-canvas)', minHeight: 0 }}>
            {error ? (
              <div style={{ margin: '14px 18px 0', display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', border: '1px solid var(--gb-error-tint-border)', borderRadius: 10, background: 'var(--gb-error-tint-soft)' }}>
                <I.alert size={14} style={{ color: 'var(--gb-error-fg)', marginTop: 1, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--gb-error-fg)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Dependency error</div>
                  <div style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)', marginTop: 2, lineHeight: 1.5 }}>{error}</div>
                </div>
              </div>
            ) : null}
            <BlocksView
              blocks={blocks}
              trace={trace}
              runningId={runningId}
              done={done}
              result={result}
              emptyHint={(
                <span>No blocks yet.<br />Switch to <b>Code</b>, write against <code>page.*</code> + <code>actions.*</code>, then <b>Simulate</b>.</span>
              )}
            />
          </div>
        )}
        <DocsSidebar doc={activeDoc} />
      </div>
    </div>
  );
}

function SimStatus({ status }) {
  if (status === 'running') {
    return <span style={{ fontSize: 10.5, color: 'var(--gb-brand-label)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Spinner size={11} /> evaluating…</span>;
  }
  if (status === 'replaying') {
    return <span style={{ fontSize: 10.5, color: 'var(--gb-brand-label)' }}>running…</span>;
  }
  return null;
}

/* Code ⇆ Blocks segmented switch — flips the whole body between the two. */
function ViewSwitch({ view, onView, blockCount }) {
  const Item = ({ id, Ic, label, badge }) => {
    const on = view === id;
    return (
      <button type="button" onClick={() => onView && onView(id)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
          fontSize: 11.5, fontWeight: 700, transition: 'background .14s ease, color .14s ease',
          background: on ? 'var(--gb-surface-1)' : 'transparent', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
          boxShadow: on ? '0 1px 2px rgba(0,0,0,.14)' : 'none' }}>
        <Ic size={13} /> {label}
        {badge != null && badge > 0 ? (
          <span style={{ fontSize: 9.5, fontWeight: 800, padding: '0 5px', borderRadius: 999, background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}>{badge}</span>
        ) : null}
      </button>
    );
  };
  return (
    <div style={{ display: 'flex', gap: 2, background: 'var(--gb-fill-subtle)', padding: 2, borderRadius: 9 }}>
      <Item id="code" Ic={I.code} label="Code" />
      <Item id="blocks" Ic={I.branch} label="Blocks" badge={blockCount} />
    </div>
  );
}

/* ── Live documentation — follows the token under the caret ── */
function DocsSidebar({ doc }) {
  if (!doc) return null;
  const KIND_ACCENT = {
    action: 'var(--gb-brand-label)', data: 'var(--gb-info-fg)',
    flow: 'var(--gb-warning-fg)', topic: 'var(--gb-text-secondary)',
  };
  const accent = KIND_ACCENT[doc.kind] || 'var(--gb-text-secondary)';
  return (
    <div style={{ width: 288, flexShrink: 0, borderLeft: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--gb-border-subtle)', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        <I.code size={13} style={{ color: 'var(--gb-text-muted)' }} />
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Docs · {doc.kind}</span>
      </div>
      <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 4, height: 14, borderRadius: 2, background: accent, flexShrink: 0 }} />
            <code style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono, ui-monospace, monospace)' }}>{doc.title}</code>
            {doc.gate ? <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, letterSpacing: '.03em', padding: '1px 6px', borderRadius: 999, color: 'var(--gb-warning-fg)', background: 'var(--gb-warning-tint-soft)', textTransform: 'uppercase' }}>{doc.gate}</span> : null}
          </div>
          <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--gb-text-secondary)', lineHeight: 1.55 }}>{doc.summary}</div>
        </div>
        {doc.rows?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {doc.rows.map(([k, v], i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <code style={{ fontSize: 10.5, fontWeight: 700, color: accent, fontFamily: 'var(--gb-font-mono, ui-monospace, monospace)' }}>{k}</code>
                <span style={{ fontSize: 11, color: 'var(--gb-text-muted)', lineHeight: 1.5 }}>{v}</span>
              </div>
            ))}
          </div>
        ) : null}
        {doc.examples?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Example</span>
            {doc.examples.map((ex, i) => (
              <pre key={i} style={{ margin: 0, padding: '8px 10px', borderRadius: 8, background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-subtle)', fontSize: 10.5, lineHeight: 1.5, color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-mono, ui-monospace, monospace)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ex}</pre>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default CodeAutomationPanel;
