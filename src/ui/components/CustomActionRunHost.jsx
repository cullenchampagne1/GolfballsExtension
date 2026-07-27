import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn, I } from '../index.js';
import { useToast } from './ToastHost.jsx';

/* ───────────────────────────────────────────────────────────────
   CustomActionRunHost — runs a custom action from the Action Shelf.

   Mounted once in the shelf tree. The shelf action handler fires a
   `gb-run-custom-action` window event with the action record; we:
     1. dry-simulate it against the LIVE page (no writes),
     2. if it has remote/money effects, show a confirm with the plan,
     3. on confirm, run it for REAL through the gated executor.

   The heavy engine + writer libs are dynamic-imported on demand so the
   always-loaded shelf bundle stays lean.
─────────────────────────────────────────────────────────────── */

export function CustomActionRunHost() {
  const toast = useToast();
  const [pending, setPending] = useState(null); // { action, page, summary }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onRun = (e) => { const action = e?.detail; if (action && action.source != null) prepare(action); };
    window.addEventListener('gb-run-custom-action', onRun);
    return () => window.removeEventListener('gb-run-custom-action', onRun);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadEngine() {
    const [sim, sb, bridge, plan, engine, live] = await Promise.all([
      import('../../lib/codeEngine/simulate.js'),
      import('../../lib/codeEngine/sandboxRunner.js'),
      import('../../lib/page-engine/sandbox-bridge.js'),
      import('../../lib/codeEngine/runPlan.js'),
      import('../../lib/page-engine/index.js'),
      import('../../lib/codeEngine/liveActionRun.js'),
    ]);
    return {
      simulateProgram: sim.simulateProgram,
      makeSandboxRunner: sb.makeSandboxRunner,
      runInSandbox: bridge.runInSandbox,
      planRun: plan.planRun,
      planSummary: plan.planSummary,
      runEngine: engine.runEngine,
      clearEngineCache: engine.clearCache,
      live,
    };
  }

  async function prepare(action) {
    if (busy) return;
    setBusy(true);
    try {
      const eng = await loadEngine();
      // A CRM partial postback can replace the record tables without replacing
      // `document`. Re-extract on every explicit action run so orders/tasks
      // reflect what is on screen now, not an earlier cached page snapshot.
      eng.clearEngineCache(document);
      const page = eng.live.shapeLivePage(eng.runEngine(document));
      const dry = await eng.simulateProgram(action.source || '', page, { run: eng.makeSandboxRunner({ exec: eng.runInSandbox }), user: {} });
      if (dry.error) { toast?.error?.(`“${action.name}” error: ${dry.error}`, { duration: 5000 }); setBusy(false); return; }
      const plan = eng.planRun(dry.trace, 1);
      if (!plan.hasEffects) {
        // Nothing to write — surface the script's own result string, if any.
        const msg = typeof dry.result === 'string' && dry.result ? dry.result : `“${action.name}” has nothing to run on this page.`;
        toast?.info?.(msg, { duration: 3200 });
        setBusy(false);
        return;
      }
      setPending({ action, page, summary: eng.planSummary(plan) });
      setBusy(false);
    } catch (err) {
      toast?.error?.(`Could not prepare “${action?.name || 'action'}”: ${String(err?.message || err)}`, { duration: 5000 });
      setBusy(false);
    }
  }

  async function doRun() {
    const p = pending;
    setPending(null);
    if (!p) return;
    setBusy(true);
    try {
      const eng = await loadEngine();
      const executor = await eng.live.makeLiveExecutor(p.page);
      const res = await eng.simulateProgram(p.action.source || '', p.page, { run: eng.makeSandboxRunner({ exec: eng.runInSandbox }), user: {}, executor });
      if (res.error) toast?.error?.(`“${p.action.name}” failed: ${res.error}`, { duration: 6000 });
      else toast?.success?.(typeof res.result === 'string' && res.result ? res.result : `“${p.action.name}” done.`, { duration: 3600 });
    } catch (err) {
      toast?.error?.(`“${p.action.name}” failed: ${String(err?.message || err)}`, { duration: 6000 });
    }
    setBusy(false);
  }

  return (
    <AnimatePresence>
      {pending && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
          onClick={() => setPending(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 2147483600, background: 'rgba(0,0,0,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <motion.div initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0 }} transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 380, maxWidth: '92vw', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', boxShadow: '0 24px 60px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {(() => { const G = I[pending.action.icon] || I.bolt; return <G size={15} />; })()}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pending.action.name}</div>
                <div style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>Run this action on the current page?</div>
              </div>
            </div>
            <div style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--gb-text-secondary)', lineHeight: 1.5 }}>
              {pending.summary}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--gb-border-subtle)' }}>
              <Btn variant="ghost" size="sm" onClick={() => setPending(null)}>Cancel</Btn>
              <Btn variant="primary" size="sm" icon={<I.play />} onClick={doRun}>Run action</Btn>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default CustomActionRunHost;
