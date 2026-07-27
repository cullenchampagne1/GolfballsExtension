import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CodeVarEditor } from './CodeVarEditor.jsx';
import { BlocksView } from './BlocksView.jsx';
import { Spinner } from '../shared.jsx';
import { I } from '../icons.jsx';

/* ───────────────────────────────────────────────────────────────
   CodeAutomationPanel — the authoring body (Code ⇆ Blocks).

   A controlled display: the parent (CampaignManager) owns the code, the
   simulation, and the run. The panel renders the editor OR the block
   flow (fed the parent's trace/runningId/done) with an animated
   transition between them, and forwards the caret token up (onContext)
   so the parent's right sidebar can show live docs. The docs / settings
   sidebar lives in the parent, not here.
─────────────────────────────────────────────────────────────── */

const STARTER = `// page.contact = who you're running · user.emails.* = your saved emails
const c = page.contact;

if (c.daysCold > 30 && c.email) {
  // 1) evaluate a saved email into a sendable object (its own step)
  const outbound = await page.evaluate(user.emails.WinBack);
  // 2) optional tweak, then send
  outbound.appendSubject(" — just for " + c.contactName);
  await actions.sendEmail(outbound);
} else {
  const task = await page.evaluate(user.tasks.QuickFollowUp);
  await actions.createTask(task);
}
return "done";`;

export function CodeAutomationPanel({
  value, onChange, blocks = [], errors = [], blockCount = null,
  view = 'code', onView, onContext, bindings = null,
  trace = [], runningId = null, done = false, result = null, error = null,
  simStatus = 'idle',
}) {
  const code = value || '';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      {/* Toolbar: the Code ⇆ Blocks switch + sim status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--gb-border-default)', flexShrink: 0 }}>
        <ViewSwitch view={view} onView={onView} blockCount={blockCount == null ? blocks.length : blockCount} />
        <div style={{ marginLeft: 'auto' }}><SimStatus status={simStatus} /></div>
      </div>

      {/* Body: Code or Blocks, cross-faded. mode="wait" keeps a single child
          mounted so it can fill the height in normal flow (no absolute clip). */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
        <AnimatePresence initial={false} mode="wait">
          {view === 'code' ? (
            <motion.div key="code"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: 12, gap: 8, minHeight: 0 }}>
              <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                <CodeVarEditor
                  value={code}
                  onChange={onChange}
                  onContext={onContext}
                  bindings={bindings}
                  typeId="account"
                  varNames={[]}
                  hideActions
                  fill
                  placeholder={STARTER}
                />
              </div>
              <div style={{ flexShrink: 0, fontSize: 10, color: 'var(--gb-text-muted)', lineHeight: 1.5 }}>
                <b>page.*</b> is the hydrated audience record being run. <b>user.*</b> are your saved emails/tasks/calls. <b>actions.*</b> — <code>sendEmail</code>, <code>createTask</code>, <code>completeTask</code>, <code>logCall</code>, <code>addNote</code>.
              </div>
              {errors.length ? (
                <div style={{ flexShrink: 0, fontSize: 10.5, color: 'var(--gb-error-fg)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <I.alert size={12} /> Syntax error — the blocks pause until it's fixed.
                </div>
              ) : null}
            </motion.div>
          ) : (
            <motion.div key="blocks"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              style={{ flex: 1, minWidth: 0, overflow: 'auto', background: 'var(--gb-surface-canvas)', minHeight: 0 }}>
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
            </motion.div>
          )}
        </AnimatePresence>
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

export default CodeAutomationPanel;
