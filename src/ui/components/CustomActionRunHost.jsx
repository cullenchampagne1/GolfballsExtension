import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn, I } from '../index.js';
import { useToast } from './ToastHost.jsx';
import { customActionEntryPoints } from '../../lib/customActionEntryPoints.js';

/* ───────────────────────────────────────────────────────────────
   CustomActionRunHost — runs a custom action from the Action Shelf.

   Mounted once in the shelf tree. The shelf action handler fires a
   `gb-run-custom-action` window event with the action record; we:
     1. dry-simulate it against the LIVE page (no writes),
     2. run one-record page actions immediately from that explicit shelf click,
     3. confirm broad/modal audiences, then use the same gated executor.

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
  // Live run state: done/total drive the % bar; logs is a rolling list of
  // section markers + per-step errors; cancelling latches the Cancel button.
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0, label: '', logs: [] });
  const [cancelling, setCancelling] = useState(false);
  const cancelRef = useRef(false);   // read live by simulateProgram's isCancelled

  const pushLog = (level, text) => setProgress((pr) => {
    const logs = pr.logs.concat({ level, text }).slice(-40);
    return { ...pr, logs };
  });

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
      countEffectSteps: sim.countEffectSteps,
      isCancelledError: sim.isCancelledError,
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
    setBusyLabel('Analyzing “' + (action?.name || 'action') + '”…');
    setProgress({ done: 0, total: 0, failed: 0, label: '', logs: [] });
    setCancelling(false);
    cancelRef.current = false;
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
      const runtime = await eng.live.prepareLiveActionRuntime(page, action.source || '', {
        doc: document,
      });
      // Count dry-run steps so the "analysing" phase shows it's progressing
      // rather than hung. No failures here (no executor). Cancel is honoured
      // even during analysis so a huge plan can be aborted before confirming.
      const onEffect = () => setProgress((pr) => ({ ...pr, done: pr.done + 1 }));
      const dry = await eng.simulateProgram(action.source || '', page, {
        run: eng.makeSandboxRunner({ exec: eng.runInSandbox, evaluateRef: runtime.evaluateRef }),
        user: runtime.user,
        evaluateRef: runtime.evaluateRef,
        onEffect,
        isCancelled: () => cancelRef.current,
      });
      if (dry.cancelled || cancelRef.current) { setBusy(false); return; }   // aborted during analysis
      if (dry.error) { toast?.error?.(`“${action.name}” error: ${dry.error}`, { duration: 5000 }); setBusy(false); return; }
      const plan = eng.planRun(dry.trace, 1);
      // Denominator for the run progress bar = real-write steps in the plan.
      const totalSteps = eng.countEffectSteps(dry.trace);
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
      const policy = eng.live.liveActionRunPolicy(page, plan);
      const prepared = {
        action,
        page,
        summary: eng.planSummary(plan),
        totalSteps,
        announceSuccess: policy.announceSuccess,
        user: runtime.user,
        evaluateRef: runtime.evaluateRef,
      };
      if (!policy.confirm) {
        // Clicking a shelf action on one live record is already an explicit
        // user instruction. Run it immediately and stay silent on success;
        // broad/modal audiences still stop on the confirmation plan below.
        await runPrepared(prepared, eng);
        return;
      }
      setPending(prepared);
      setBusy(false);
    } catch (err) {
      toast?.error?.(`Could not prepare “${action?.name || 'action'}”: ${String(err?.message || err)}`, { duration: 5000 });
      setBusy(false);
    }
  }

  async function runPrepared(p, loadedEngine = null) {
    setPending(null);
    if (!p) return;
    setBusyLabel('Running “' + (p.action?.name || 'action') + '”…');
    setProgress({ done: 0, total: p.totalSteps || 0, failed: 0, label: '', logs: [] });
    setCancelling(false);
    cancelRef.current = false;
    setBusy(true);
    try {
      const eng = loadedEngine || await loadEngine();
      const executor = await eng.live.makeLiveExecutor(p.page, { evaluateRef: p.evaluateRef });
      // Per real write: advance the bar, count failures, and log the error so
      // it's visible AS IT HAPPENS (not only at the end).
      const onEffect = ({ status, entry, name }) => {
        setProgress((pr) => ({ ...pr, done: pr.done + 1, failed: pr.failed + (status === 'failed' ? 1 : 0) }));
        if (status === 'failed') pushLog('error', (entry && entry.errors && entry.errors[0]) || `${name} failed`);
      };
      // Script-authored progress markers → section label, total override, logs.
      const onProgress = (ev) => {
        if (!ev) return;
        if (ev.op === 'total' && Number(ev.total) > 0) setProgress((pr) => ({ ...pr, total: Number(ev.total), label: ev.label != null ? String(ev.label) : pr.label }));
        else if (ev.op === 'section') setProgress((pr) => ({ ...pr, label: String(ev.label || '') }));
        else if (ev.op === 'log') pushLog(ev.level === 'error' ? 'error' : 'info', String(ev.message || ''));
      };
      const res = await eng.simulateProgram(p.action.source || '', p.page, {
        run: eng.makeSandboxRunner({ exec: eng.runInSandbox, evaluateRef: p.evaluateRef }),
        user: p.user || {}, executor, evaluateRef: p.evaluateRef,
        onEffect, onProgress, isCancelled: () => cancelRef.current,
      });
      await customActionEntryPoints.notifyRunComplete(p.page.entryPoints, { action: p.action, result: res });

      const failed = (res.trace || []).filter((t) => t && t.status === 'failed');
      if (res.cancelled || eng.isCancelledError(res.error)) {
        const committed = (res.trace || []).filter((t) => t && t.contract && t.status === 'ran').length;
        warn(toast, `“${p.action.name}” cancelled — stopped after ${committed} write${committed === 1 ? '' : 's'}.`, 6000);
      } else if (res.error) {
        toast?.error?.(`“${p.action.name}” failed: ${res.error}`, { duration: 6500 });
      } else if (failed.length) {
        // Per-step effect failures don't set res.error, so surface them (else a
        // run that silently failed every write looks like success).
        const first = failed[0];
        const why = (first && (first.errors && first.errors[0])) || 'unknown error';
        toast?.error?.(`“${p.action.name}”: ${failed.length} of ${res.trace.filter((t) => t && t.contract).length} step(s) failed — ${why}`, { duration: 8000 });
      } else if (p.announceSuccess !== false) {
        toast?.success?.(typeof res.result === 'string' && res.result ? res.result : `“${p.action.name}” done.`, { duration: 3600 });
      }
    } catch (err) {
      toast?.error?.(`“${p.action.name}” failed: ${String(err?.message || err)}`, { duration: 6500 });
    }
    setBusy(false);
    setCancelling(false);
    cancelRef.current = false;
  }

  async function doRun() {
    await runPrepared(pending);
  }

  const requestCancel = () => { cancelRef.current = true; setCancelling(true); };

  return (
    <AnimatePresence>
      {/* Blocking loading overlay — shown during the (slow) dry-run prepare
          AND during the real write run, which previously happened with zero
          feedback. Sits above everything but below its own confirm modal
          (they never overlap: busy is false while `pending` is set). */}
      {busy && !pending && (() => {
        const pct = progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : null;
        return (
        <motion.div key="cah-busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
          style={{ position: 'fixed', inset: 0, zIndex: 2147483601, background: 'rgba(0,0,0,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(1px)' }}>
          <motion.div initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0 }} transition={{ duration: 0.16 }}
            style={{ width: 420, maxWidth: '94vw', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', boxShadow: '0 24px 60px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                  style={{ width: 22, height: 22, borderRadius: '50%', border: '2.5px solid var(--gb-border-strong)', borderTopColor: 'var(--gb-brand-label)', flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{busyLabel}</div>
                  {progress.label && <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{progress.label}</div>}
                </div>
                <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 12, fontWeight: 700, color: progress.failed ? 'var(--gb-warning-fg)' : 'var(--gb-text-secondary)', flexShrink: 0 }}>
                  {pct != null ? `${pct}%` : (progress.done > 0 ? progress.done : '')}
                </span>
              </div>

              {/* Progress bar (determinate when a total is known, else indeterminate). */}
              <div style={{ height: 7, borderRadius: 99, background: 'var(--gb-fill-subtle)', overflow: 'hidden', position: 'relative' }}>
                {pct != null ? (
                  <motion.div animate={{ width: pct + '%' }} transition={{ duration: 0.25 }}
                    style={{ position: 'absolute', inset: 0, right: 'auto', background: progress.failed ? 'linear-gradient(90deg, var(--gb-brand), var(--gb-warning))' : 'linear-gradient(90deg, var(--gb-brand-dark), var(--gb-brand-label))', borderRadius: 99 }} />
                ) : (
                  <motion.div animate={{ x: ['-40%', '140%'] }} transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', background: 'var(--gb-brand-label)', borderRadius: 99, opacity: 0.8 }} />
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>
                <span>{progress.total > 0 ? `${progress.done} of ${progress.total}` : (progress.done > 0 ? `${progress.done} done` : 'starting…')}</span>
                {progress.failed > 0 && <span style={{ color: 'var(--gb-error-fg)', fontWeight: 700 }}>{progress.failed} failed</span>}
              </div>

              {/* Live log — section markers + errors as they happen. */}
              {progress.logs.length > 0 && (
                <div className="gb-scroll" style={{ maxHeight: 132, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', background: 'var(--gb-fill-faint)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)' }}>
                  {progress.logs.slice(-24).map((l, i) => (
                    <div key={i} style={{ fontSize: 10.5, lineHeight: 1.4, color: l.level === 'error' ? 'var(--gb-error-fg)' : 'var(--gb-text-muted)', fontFamily: l.level === 'error' ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)', wordBreak: 'break-word' }}>
                      {l.level === 'error' ? '⚠ ' : '· '}{l.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 16px', borderTop: '1px solid var(--gb-border-subtle)' }}>
              <Btn variant="danger" size="sm" icon={<I.close />} disabled={cancelling} onClick={requestCancel}>
                {cancelling ? 'Cancelling…' : 'Cancel run'}
              </Btn>
            </div>
          </motion.div>
        </motion.div>
        );
      })()}
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
