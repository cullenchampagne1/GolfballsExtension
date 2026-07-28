import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn, I } from '../index.js';
import { useToast } from './ToastHost.jsx';
import { customActionEntryPoints } from '../../lib/customActionEntryPoints.js';

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

/* True when an action declared entry points but none of them resolved to
   real data at run time (e.g. the quarterly reach-out action needs the Task
   List modal open + loaded — otherwise its `tasks`/`contacts` are empty and
   the script early-returns without writing anything). */
function entryDataEmpty(action, page) {
  if (!action?.entryPoints?.length) return false;
  const eps = (page?.entryPoints || []);
  if (!eps.length) return true;
  const empty = (d) => {
    if (d == null) return true;
    if (Array.isArray(d)) return d.length === 0;
    if (typeof d === 'object') {
      const vals = Object.values(d);
      if (!vals.length) return true;
      return vals.every((v) => v == null || (Array.isArray(v) && v.length === 0));
    }
    return false;
  };
  return eps.every((ep) => empty(ep.data));
}

/* Warn to the toast layer, falling back through the tones a given ToastHost
   actually implements. */
function warn(toast, msg, duration = 6500) {
  (toast?.warning || toast?.error || toast?.info)?.(msg, { duration });
}

export function CustomActionRunHost() {
  const toast = useToast();
  const [pending, setPending] = useState(null); // { action, page, summary }
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Preparing…');

  useEffect(() => {
    const onRun = (e) => {
      const detail = e?.detail;
      const action = detail?.action || detail;
      if (action && action.source != null) prepare(action, detail?.entryPoints);
    };
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

  async function prepare(action, suppliedEntryPoints) {
    if (busy) return;
    setBusyLabel('Preparing “' + (action?.name || 'action') + '”…');
    setBusy(true);
    try {
      const eng = await loadEngine();
      // A CRM partial postback can replace the record tables without replacing
      // `document`. Re-extract on every explicit action run so orders/tasks
      // reflect what is on screen now, not an earlier cached page snapshot.
      eng.clearEngineCache(document);
      const page = eng.live.shapeLivePage(eng.runEngine(document));
      const entryPoints = Array.isArray(suppliedEntryPoints)
        ? suppliedEntryPoints
        : customActionEntryPoints.resolve(action.entryPoints, document);
      page.entryPoints = entryPoints.map((entryPoint) => ({
        id: entryPoint.id,
        label: entryPoint.label,
        token: entryPoint.token,
        data: entryPoint.data ?? null,
      }));
      page.entryPoint = page.entryPoints[0] || null;
      const dry = await eng.simulateProgram(action.source || '', page, { run: eng.makeSandboxRunner({ exec: eng.runInSandbox }), user: {} });
      if (dry.error) { toast?.error?.(`“${action.name}” error: ${dry.error}`, { duration: 5000 }); setBusy(false); return; }
      const plan = eng.planRun(dry.trace, 1);
      if (!plan.hasEffects) {
        // Nothing to write. Distinguish "required context missing" from a
        // benign no-op, and use a persistent-ish warning (not an ephemeral
        // info pill the user misses) so it's clear WHY nothing happened.
        if (entryDataEmpty(action, page)) {
          const label = (page.entryPoint && page.entryPoint.label) || 'its data source';
          warn(toast, `“${action.name}” had no data to act on — open and load ${label} first, then run it again.`);
        } else if (typeof dry.result === 'string' && dry.result) {
          warn(toast, `“${action.name}”: ${dry.result}`);   // e.g. "Skipped — Task List has no tasks to evaluate"
        } else {
          warn(toast, `“${action.name}” has nothing to change on this page.`);
        }
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
    setBusyLabel('Running “' + (p.action?.name || 'action') + '”…');
    setBusy(true);
    try {
      const eng = await loadEngine();
      const executor = await eng.live.makeLiveExecutor(p.page);
      const res = await eng.simulateProgram(p.action.source || '', p.page, { run: eng.makeSandboxRunner({ exec: eng.runInSandbox }), user: {}, executor });
      await customActionEntryPoints.notifyRunComplete(p.page.entryPoints, {
        action: p.action,
        result: res,
      });
      // Per-step effect failures are recorded in the trace but do NOT set
      // res.error (simulateProgram only errors if the program itself throws),
      // so surface them explicitly — otherwise a run that silently failed to
      // write anything looks like success.
      const failed = (res.trace || []).filter((t) => t && t.status === 'failed');
      if (res.error) {
        toast?.error?.(`“${p.action.name}” failed: ${res.error}`, { duration: 6500 });
      } else if (failed.length) {
        const first = failed[0];
        const why = (first && (first.error || first.message)) || 'unknown error';
        toast?.error?.(`“${p.action.name}”: ${failed.length} step${failed.length > 1 ? 's' : ''} failed — ${why}`, { duration: 7000 });
      } else {
        toast?.success?.(typeof res.result === 'string' && res.result ? res.result : `“${p.action.name}” done.`, { duration: 3600 });
      }
    } catch (err) {
      toast?.error?.(`“${p.action.name}” failed: ${String(err?.message || err)}`, { duration: 6500 });
    }
    setBusy(false);
  }

  return (
    <AnimatePresence>
      {/* Blocking loading overlay — shown during the (slow) dry-run prepare
          AND during the real write run, which previously happened with zero
          feedback. Sits above everything but below its own confirm modal
          (they never overlap: busy is false while `pending` is set). */}
      {busy && !pending && (
        <motion.div key="cah-busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
          style={{ position: 'fixed', inset: 0, zIndex: 2147483601, background: 'rgba(0,0,0,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(1px)' }}>
          <motion.div initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0 }} transition={{ duration: 0.16 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '26px 34px', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
            <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
              style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid var(--gb-border-strong)', borderTopColor: 'var(--gb-brand-label)' }} />
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-secondary)', maxWidth: 260, textAlign: 'center' }}>{busyLabel}</div>
          </motion.div>
        </motion.div>
      )}
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
