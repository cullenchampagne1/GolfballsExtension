import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CodeVarEditor } from './CodeVarEditor.jsx';
import { BlocksView } from './BlocksView.jsx';
import { Btn } from './Btn.jsx';
import { Spinner } from '../shared.jsx';
import { I } from '../icons.jsx';
import { translateProgram } from '../../lib/codeEngine/translate.js';
import { simulateProgram } from '../../lib/codeEngine/simulate.js';
import { makeSandboxRunner } from '../../lib/codeEngine/sandboxRunner.js';
import { runInSandbox } from '../../lib/page-engine/sandbox-bridge.js';

/* ───────────────────────────────────────────────────────────────
   CodeAutomationPanel — the code-first campaign authoring surface.

   Left: the same CodeMirror code box the image variables use, where
   the rep writes plain JS against two bindings:
       page.*      the contact / order object model (read-only)
       actions.*   the callable action library — actions.sendEmail(…),
                   actions.createTask(…), actions.logCall(…)
   Right: BlocksView, a live projection of that code as an indented
   flow of blocks (if / for / switch + action leaves).

   "Simulate" runs the program with ZERO side effects: the instrumented
   code executes in the page-engine sandbox against a recording proxy,
   returning a node-keyed trace; each contract call is preflighted
   against its schema (a bad param shows as a red "stop" without ever
   sending). We then replay that trace, pulsing each block so the rep
   watches the flow light up — exactly the campaign sim, but for code.

   This slice is simulate-only. Real (gated) execution — sendEmail /
   createTask / logCall actually firing behind their confirm/hard
   gates — is deliberately NOT wired here; it follows once the rep has
   validated the simulation.

   Props:
     value    string      — the code source
     onChange (src)=>void  — persist edits (campaign.automation)
     page     object       — the model exposed as `page` (read-only)
     doc      Document      — document the sandbox's read helpers read
─────────────────────────────────────────────────────────────── */

const STARTER = `// Write automation against page.* and actions.*
// e.g. thank this year's high-value contacts, nurture the rest:
for (const c of (page.contacts || [])) {
  if (c.ytd > 1000) {
    await actions.sendEmail({ to: c.email, subject: "Thanks for your business" });
  } else {
    await actions.createTask({ subject: "Re-engage " + c.name });
  }
}`;

export function CodeAutomationPanel({ value, onChange, page = {}, doc }) {
  const code = value || '';
  const { blocks, errors } = useMemo(() => translateProgram(code), [code]);

  // sim: idle → running (evaluating in the sandbox) → replaying (pulsing
  // the trace) → done. `error` holds a program/sandbox failure.
  const [sim, setSim] = useState({ status: 'idle', trace: [], replayIdx: -1, error: null });
  // Physical view switch: the whole body is EITHER the code editor or the blocks.
  const [view, setView] = useState('code');
  const runRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const runningId = sim.status === 'replaying' ? (sim.trace[sim.replayIdx]?.id || null) : null;
  const shownTrace = sim.status === 'replaying'
    // during replay, only reveal entries up to the cursor so status lights land in order
    ? sim.trace.slice(0, sim.replayIdx + 1)
    : sim.trace;

  // Replay: advance one trace entry every ~600ms, then settle on 'done'.
  useEffect(() => {
    if (sim.status !== 'replaying') return undefined;
    if (sim.replayIdx >= sim.trace.length - 1) {
      timerRef.current = setTimeout(() => setSim((s) => ({ ...s, status: 'done' })), 650);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
    timerRef.current = setTimeout(() => setSim((s) => ({ ...s, replayIdx: s.replayIdx + 1 })), 600);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [sim.status, sim.replayIdx, sim.trace]);

  const stop = () => {
    runRef.current += 1;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setSim((s) => ({ ...s, status: s.trace.length ? 'done' : 'idle' }));
  };
  const reset = () => {
    runRef.current += 1;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setSim({ status: 'idle', trace: [], replayIdx: -1, error: null });
  };

  const simulate = async () => {
    if (errors.length) { setSim({ status: 'error', trace: [], replayIdx: -1, error: 'Fix the syntax error before simulating.' }); return; }
    if (!blocks.length) return;
    const myRun = ++runRef.current;
    setSim({ status: 'running', trace: [], replayIdx: -1, error: null });
    let res;
    try {
      res = await simulateProgram(code, page, {
        run: makeSandboxRunner({ exec: runInSandbox, doc: doc || (typeof document !== 'undefined' ? document : undefined) }),
      });
    } catch (e) {
      if (myRun !== runRef.current) return;
      setSim({ status: 'error', trace: [], replayIdx: -1, error: String(e?.message || e) });
      return;
    }
    if (myRun !== runRef.current) return;
    if (!res.ok && !res.trace.length) {
      setSim({ status: 'error', trace: [], replayIdx: -1, error: res.error || 'Simulation failed.' });
      return;
    }
    setView('blocks'); // flip to the blocks so the run animation is visible
    setSim({ status: 'replaying', trace: res.trace, replayIdx: 0, error: res.error || null });
  };

  const busy = sim.status === 'running' || sim.status === 'replaying';
  const ranCount = sim.trace.filter((t) => t.status === 'ran').length;
  const failCount = sim.trace.filter((t) => t.status === 'failed').length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Toolbar: the Code ⇆ Blocks switch + simulate controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--gb-border-default)', flexShrink: 0 }}>
        <ViewSwitch view={view} onView={setView} blockCount={blocks.length} />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <SimStatus sim={sim} ranCount={ranCount} failCount={failCount} />
          {busy ? (
            <Btn size="sm" variant="ghost" onClick={stop}><I.pause size={13} /> Stop</Btn>
          ) : (
            <>
              {sim.trace.length ? <Btn size="sm" variant="ghost" onClick={reset}><I.refresh size={13} /> Reset</Btn> : null}
              <Btn size="sm" variant="primary" onClick={simulate} disabled={!blocks.length || errors.length > 0}>
                <I.play size={13} /> Simulate
              </Btn>
            </>
          )}
        </div>
      </div>

      {/* Body: the whole panel is EITHER the editor or the blocks. */}
      {view === 'code' ? (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: 12, gap: 8, minHeight: 0 }}>
          {/* The editor fills the body down to near the modal bottom. */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <CodeVarEditor
              value={code}
              onChange={onChange}
              typeId="account"
              varNames={[]}
              hideActions
              fill
              placeholder={STARTER}
            />
          </div>
          <div style={{ flexShrink: 0, fontSize: 10, color: 'var(--gb-text-muted)', lineHeight: 1.5 }}>
            <b>page.*</b> is the read-only contact/order model. <b>actions.*</b> — <code>sendEmail</code>, <code>createTask</code>, <code>logCall</code> — are simulated (no real sends); each runs behind its gate on a real run.
          </div>
          {errors.length ? (
            <div style={{ flexShrink: 0, fontSize: 10.5, color: 'var(--gb-error-fg)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <I.alert size={12} /> Syntax error — switch to Blocks pauses until it's fixed.
            </div>
          ) : null}
          {sim.error ? (
            <div style={{ flexShrink: 0, fontSize: 10.5, color: 'var(--gb-error-fg)', display: 'flex', alignItems: 'flex-start', gap: 5 }}>
              <I.alert size={12} style={{ marginTop: 1, flexShrink: 0 }} /> {sim.error}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', background: 'var(--gb-surface-modal)', minHeight: 0 }}>
          <BlocksView
            blocks={blocks}
            trace={shownTrace}
            runningId={runningId}
            emptyHint={(
              <span>No blocks yet.<br />Switch to <b>Code</b>, write against <code>page.*</code> + <code>actions.*</code>, then <b>Simulate</b>.</span>
            )}
          />
        </div>
      )}
    </div>
  );
}

/* Code ⇆ Blocks segmented switch — flips the whole body between the two. */
function ViewSwitch({ view, onView, blockCount }) {
  const Item = ({ id, Ic, label, badge }) => {
    const on = view === id;
    return (
      <button type="button" onClick={() => onView(id)}
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

function SimStatus({ sim, ranCount, failCount }) {
  if (sim.status === 'running') {
    return <span style={{ fontSize: 10.5, color: 'var(--gb-brand-label)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Spinner size={11} /> evaluating…</span>;
  }
  if (sim.status === 'replaying') {
    return <span style={{ fontSize: 10.5, color: 'var(--gb-brand-label)' }}>replaying {sim.replayIdx + 1}/{sim.trace.length}</span>;
  }
  if (sim.status === 'done') {
    return (
      <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--gb-success-fg)' }}>{ranCount} would run</span>
        {failCount ? <span style={{ color: 'var(--gb-error-fg)' }}>{failCount} blocked</span> : null}
      </span>
    );
  }
  return null;
}

export default CodeAutomationPanel;
