import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn, IconBtn, Tag, I, Spinner } from '../ui/index.js';
import { DraggablePopup } from '../ui/components/DraggablePopup.jsx';
import { useSurfaceUsage } from '../lib/usageTelemetry.js';

/* qs-* keyframes for the in-popover run lifecycle (the popover can open
   without the EmailRunner mounted, so inject our own copy; redefining the
   global keyframes is harmless). */
const QT_STYLE_ID = 'gb-quicktask-anim';
function ensureQuickTaskStyles() {
  if (typeof document === 'undefined' || document.getElementById(QT_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = QT_STYLE_ID;
  el.textContent = `
    @keyframes qs-state-in { from { transform: translateY(9px); } to { transform: none; } }
    @keyframes qs-breathe { 0%,100% { opacity: .75; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
    @keyframes qs-pop { from { transform: scale(.4); } to { transform: scale(1); } }
    @keyframes qs-bump { 0% { transform: scale(1); } 32% { transform: scale(1.38); } 100% { transform: scale(1); } }
    @keyframes qs-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-4px); } 40% { transform: translateX(4px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
    @keyframes gb-tpl-in { from { transform: translateX(-8px); } to { transform: translateX(0); } }
  `;
  document.head.appendChild(el);
}

/* Action → verb + done icon/tone for the RunPanel headline. */
const QT_VERB = {
  complete: { ing: 'Completing', ed: 'Completed', icon: 'check', tone: 'success' },
  'bulk-complete': { ing: 'Completing', ed: 'Completed', icon: 'check', tone: 'success' },
  reopen: { ing: 'Reopening', ed: 'Reopened', icon: 'refresh', tone: 'warning' },
  push: { ing: 'Pushing', ed: 'Pushed', icon: 'check', tone: 'success' },
  'bulk-push': { ing: 'Pushing', ed: 'Pushed', icon: 'check', tone: 'success' },
  'set-date': { ing: 'Updating', ed: 'Date set', icon: 'check', tone: 'success' },
  'bulk-set-date': { ing: 'Updating', ed: 'Dates set', icon: 'check', tone: 'success' },
  'create-task': { ing: 'Adding', ed: 'Task added', icon: 'plus', tone: 'success' },
  'bulk-create-task': { ing: 'Adding', ed: 'Tasks added', icon: 'plus', tone: 'success' },
};

/* RunPanel — the loading → done / error lifecycle the popover cross-fades
   to when an action fires (ported from the design). */
function RunPanel({ run, onClose, onRetry }) {
  const v = QT_VERB[run.action] || QT_VERB.complete;
  const isBulk = run.action.startsWith('bulk-');
  const total = run.total || 1;
  const loading = run.phase === 'loading';
  const done = run.phase === 'done';
  const error = run.phase === 'error';
  const tone = error ? 'error' : done ? v.tone : 'brand';
  const T = { brand: 'var(--gb-brand-label)', success: 'var(--gb-success)', warning: 'var(--gb-warning-fg)', error: 'var(--gb-error)' }[tone];
  const TBG = { brand: 'var(--gb-brand-tint-medium)', success: 'var(--gb-success-tint-medium)', warning: 'var(--gb-warning-tint-medium)', error: 'var(--gb-error-tint-medium)' }[tone];
  const pct = isBulk ? Math.round((run.done / total) * 100) : (loading ? null : 100);
  const plural = (n) => `${n} task${n === 1 ? '' : 's'}`;
  const headline = error
    ? (isBulk && run.failed ? `${run.failed} of ${total} failed` : 'Something went wrong')
    : loading ? `${v.ing}${isBulk ? ` ${plural(total)}…` : '…'}`
      : (isBulk ? `${v.ed} ${plural(run.done)}` : v.ed);
  return (
    <div style={{ padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, animation: error ? 'qs-shake .34s ease' : 'none' }}>
      <div style={{ position: 'relative', width: 64, height: 64, display: 'grid', placeItems: 'center' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle, ${TBG} 0%, transparent 70%)`, opacity: loading ? 0.9 : 1, animation: loading ? 'qs-breathe 2s ease-in-out infinite' : 'none' }} />
        <div style={{ position: 'relative', width: 52, height: 52, borderRadius: '50%', background: TBG, color: T, display: 'grid', placeItems: 'center', animation: !loading ? 'qs-pop .5s cubic-bezier(.34,1.5,.64,1) both' : 'none' }}>
          {loading ? <Spinner size={24} /> : error ? <I.alert size={26} /> : React.createElement(I[v.icon] || I.check, { size: 26 })}
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -0.2 }}>{headline}</div>
        {loading && isBulk && <div style={{ fontSize: 11.5, color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)', fontWeight: 700, marginTop: 3 }}>{run.done} / {total}</div>}
        {loading && !isBulk && <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', marginTop: 3 }}>Talking to the CRM…</div>}
        {done && <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', marginTop: 3 }}>{run.failed > 0 ? `${run.failed} skipped · closing…` : 'Closing…'}</div>}
      </div>
      {isBulk && (loading || done) && (
        <div style={{ width: '100%', height: 5, borderRadius: 999, background: 'var(--gb-surface-3)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--gb-brand-label)', borderRadius: 999, transition: 'width .25s ease' }} />
        </div>
      )}
      {error && (
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <Btn size="sm" variant="ghost" full onClick={onClose}>Close</Btn>
          <Btn size="sm" variant="tinted" status="brand" full icon={<I.refresh size={12} />} onClick={onRetry}>Try again</Btn>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   QuickTaskPopover — moveable popover replacing the legacy
   QuickTaskMenu portal. Drives the per-row + bulk Quick Task
   actions from TaskList.jsx.

   Layout (V1 design — preset chips + slide panes):
     • Drag-handle header (DraggablePopup chrome): subject as title,
       `${account} · ${contact}` as subtitle, close X.
     • Body wraps three lateral panes; only one is mounted as the
       active layout block at any moment. Inactive panes are
       absolutely positioned with opacity 0 so the popup height
       tracks the visible pane's height.
         - 'main'      → complete + push card + Set Date / Add Task
         - 'date'      → mini calendar + Save
         - 'templates' → follow-up template list
     • Inside the push card, picking "Other" expand-reveals a
       stepper so the rep can dial a custom day count.
     • Bulk mode collapses the per-row identity ("5 selected") and
       routes onAction to the bulk-* events the parent already
       handles. Set Date and Add Task panes carry through.

   Animations are token-aligned with the other popovers:
     • Header drag wired by DraggablePopup itself.
     • Pane swap: opacity + translateX 16, 250ms ease-out.
     • Stepper reveal: max-height + opacity, 300ms ease.
     • Chip pick / day pick: scale 1.02 / 1.05, transform tween.

   Action contract is the same the legacy QuickTaskMenu used so
   TaskList's runQuickAction handler doesn't change:
     'complete' / 'reopen' / 'push' / 'set-date' / 'create-task'
     'bulk-complete' / 'bulk-push' / 'bulk-set-date' /
     'bulk-create-task'
─────────────────────────────────────────────────────────────── */

const PUSH_PRESETS = [
  { label: '+3d',  days: 3   },
  { label: '+1w',  days: 7   },
  { label: '+2w',  days: 14  },
  { label: '+1mo', days: 30  },
  { label: '+1yr', days: 365 },
];

/* Quick due-date choices for the inline custom-task form (design). */
const DUE_OPTS = [
  { k: 'today', label: 'Today',     days: 0 },
  { k: '+1d',   label: 'Tomorrow',  days: 1 },
  { k: '+3d',   label: 'In 3 days', days: 3 },
  { k: '+1w',   label: 'Next week', days: 7 },
];

const PANE_TRANSITION = { duration: 0.25, ease: [0.4, 0, 0.2, 1] };

function isComplete(task) {
  return task?.status === 'Complete';
}

function fmtMonthLabel(d) {
  return d.toLocaleString('default', { month: 'long', year: 'numeric' });
}

/* Build the 6-row calendar grid for `view` (a Date pinned to the
   first day of the displayed month). Returns flat 42 cells —
   leading + trailing cells from neighboring months render dimmed.
   The picker stores the active selection as a Y-M-D triple so we
   don't have to thread Date instances through the click handler. */
function buildMonthGrid(view) {
  const firstDow = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells = [];
  // Leading days from prev month
  const prevDays = new Date(view.getFullYear(), view.getMonth(), 0).getDate();
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ day: prevDays - i, outside: true, month: view.getMonth() - 1, year: view.getFullYear() });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, outside: false, month: view.getMonth(), year: view.getFullYear() });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1];
    const nextDay = last.outside && last.month === view.getMonth() + 1
      ? last.day + 1
      : 1;
    const nextMonth = last.outside && last.month === view.getMonth() + 1
      ? last.month
      : view.getMonth() + 1;
    cells.push({ day: nextDay, outside: true, month: nextMonth, year: view.getFullYear() });
  }
  return cells;
}

function isoFromCell(c) {
  const yr = c.year;
  let mo = c.month;
  let y = yr;
  if (mo < 0) { mo += 12; y -= 1; }
  if (mo > 11) { mo -= 12; y += 1; }
  return `${y}-${String(mo + 1).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
}
function apiDateFromIso(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}
function apiDateLabel(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleString('default', { month: 'short', day: 'numeric' });
}

/* ── Component ───────────────────────────────────────────── */
export function QuickTaskPopover({
  /* When falsy, the popup unmounts (caller controls open via the
     presence of a non-null `qt` object). */
  open,
  /* { mode: 'main'|'bulk', taskId, anchor } — anchor is
     { x, y } from the trigger click (rect.right + rect.top works
     too; DraggablePopup's cursorAnchor handles either). */
  qt,
  /* Resolves to the task object for the active row. Used to show
     subject / account / contact + the priority chip. Bulk mode
     ignores this. */
  getTask,
  selectedCount = 0,
  taskTpls = [],
  pushDays,
  setPushDays,
  onClose,
  /* Same event names the legacy QuickTaskMenu used so
     TaskList's runQuickAction handler doesn't have to change. */
  onAction,
}) {
  // Always mounted by TaskList and toggled by `open`, so the report keys off
  // the prop rather than the mount — otherwise every task list would count as
  // a Quick Task open.
  useSurfaceUsage('Quick Task Popover', { active: !!open });
  const [pane, setPane] = useState('main');
  /* Pushed chip index. -1 = no chip selected (defaults to first on
     first interaction). The "Other" pseudo-chip lives at index
     PUSH_PRESETS.length and exposes the stepper. */
  const [pushIdx, setPushIdx] = useState(2); // default +1w
  const [calView, setCalView] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [pickedIso, setPickedIso] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  /* Reset to the main pane every time the popover is freshly
     opened for a new row. The qt.taskId identity changes per
     trigger so this fires correctly even when the same row is
     re-opened. */
  useEffect(() => {
    if (!open) return;
    setPane('main');
    setPushIdx(2);
  }, [open, qt?.taskId, qt?.mode]);

  /* In-popover run lifecycle. `fire` flips the body to the RunPanel, drives
     the parent dispatcher (onAction returns { done, failed } + reports
     progress), then settles to done (auto-close after a beat) or error
     (with a retry). Replaces the old "close the instant it's clicked". */
  const [run, setRun] = useState(null);
  /* Inline custom-task form (the "Add task" pane types a title + a
     due-in-N-days instead of only offering saved templates). */
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('+3d');
  useEffect(() => { ensureQuickTaskStyles(); }, []);
  useEffect(() => { setRun(null); setTaskTitle(''); }, [open, qt?.taskId, qt?.mode]);

  const bodyRef = useRef(null);
  const [bodyH, setBodyH] = useState('auto');
  React.useLayoutEffect(() => {
    if (bodyRef.current) { const h = bodyRef.current.offsetHeight; setBodyH((p) => (p === h ? p : h)); }
  });

  const fire = (action, payload) => {
    const runTotal = action.startsWith('bulk-') ? selectedCount : 1;
    setRun({ action, payload, phase: 'loading', done: 0, failed: 0, total: runTotal });
    Promise.resolve(onAction(action, payload, (d, f) => setRun((r) => (r ? { ...r, done: d, failed: f } : r))))
      .then((res) => {
        const failed = res?.failed || 0;
        const allFailed = failed > 0 && failed === runTotal;
        setRun((r) => (r ? { ...r, phase: allFailed ? 'error' : 'done', done: res?.done ?? r.done, failed } : r));
        if (!allFailed) setTimeout(() => onClose?.(), 1100);
      })
      .catch(() => setRun((r) => (r ? { ...r, phase: 'error' } : r)));
  };

  /* Fire an inline custom task — same { custom: { title, days } } shape
     TaskList's create-task branch already speaks. */
  const fireCustom = () => {
    const title = taskTitle.trim();
    if (!title) return;
    const opt = DUE_OPTS.find((o) => o.k === taskDue) || DUE_OPTS[2];
    fire(isBulk ? 'bulk-create-task' : 'create-task',
      isBulk ? { custom: { title, days: opt.days } }
             : { taskId: qtv.taskId, custom: { title, days: opt.days } });
  };

  /* Retain the last qt so the close animation can play: the parent nulls
     qt on close (open→false), but DraggablePopup must stay mounted through
     its exit. Render the retained content while open is false; the popup's
     AnimatePresence fades it out. */
  const lastQtRef = useRef(qt);
  if (qt) lastQtRef.current = qt;
  const qtv = qt || lastQtRef.current;
  const isBulk = qtv?.mode === 'bulk';
  const task = !isBulk && getTask && qtv?.taskId ? getTask(qtv.taskId) : null;
  const showOther = pushIdx === PUSH_PRESETS.length;
  const customDays = Number(pushDays) || 7;
  const effectiveDays = showOther ? customDays : PUSH_PRESETS[pushIdx].days;
  const dueText = showOther
    ? `+${customDays}d`
    : PUSH_PRESETS[pushIdx].label;

  /* Sync the parent's pushDays state with the active chip's days
     so a follow-on "Apply push" reads the right value. The custom
     stepper drives pushDays directly; preset chips flush their
     days into pushDays on every pick. */
  useEffect(() => {
    if (showOther) return;
    setPushDays?.(PUSH_PRESETS[pushIdx].days);
  }, [pushIdx, showOther, setPushDays]);

  /* Priority chip for the header right slot. The legacy task model
     uses { priority: 1|2|3, priorityLabel: 'High'|'Med'|'Low' }. */
  const priorityTone = task?.priority === 1 ? 'error'
    : task?.priority === 3 ? 'info'
    : 'warning';
  const priorityLabel = task?.priorityLabel
    || (task?.priority === 1 ? 'High' : task?.priority === 3 ? 'Low' : 'Med');
  /* Soft-tinted priority chip colours (matches the design's small chip). */
  const pTone = {
    error:   { fg: 'var(--gb-error-fg)',   bg: 'var(--gb-error-tint-soft)' },
    warning: { fg: 'var(--gb-warning-fg)', bg: 'var(--gb-warning-tint-soft)' },
    info:    { fg: 'var(--gb-info-fg)',    bg: 'var(--gb-info-tint-soft)' },
  }[priorityTone] || { fg: 'var(--gb-text-secondary)', bg: 'var(--gb-fill-subtle)' };

  /* Titles for the popover chrome. Bulk mode says "{n} selected"
     instead of the subject; single mode shows the subject + the
     account/contact line. Truncation handled inside DraggablePopup. */
  const popTitle = isBulk
    ? `${selectedCount} selected`
    : (task?.subject || 'Quick Task');
  const popSubtitle = isBulk
    ? 'Bulk action across all selected tasks'
    : task ? `${task.account || '—'} · ${task.contact || '—'}` : 'Quick Task';

  if (!qtv) return null;

  return (
    <DraggablePopup
      open={open}
      onClose={onClose}
      cursorAnchor={qtv.anchor || null}
      width={360}
      maxHeight={520}
      title={popTitle}
      subtitle={popSubtitle}
      icon={<I.check size={12} />}
      enterFrom="bottom"
      closeDisabled={!!run && run.phase === 'loading'}
    >
      {/* Height-morphing body: panes ↔ RunPanel cross-fade (keyed) while the
          measured wrapper height glides instead of snapping. */}
      <div style={{ height: bodyH, overflow: 'hidden', transition: run ? 'height .3s cubic-bezier(.34,1.12,.64,1)' : 'none' }}>
       <div ref={bodyRef}>
        <div key={run ? 'run' : 'panes'} style={{ animation: 'qs-state-in .28s cubic-bezier(.34,1.2,.64,1) both' }}>
        {run ? (
          <RunPanel run={run} onClose={onClose} onRetry={() => fire(run.action, run.payload)} />
        ) : (
      <div style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--gb-surface-modal)',
      }}>
        {/* MAIN pane ─────────────────────────────────────── */}
        <Pane visible={pane === 'main'} direction="left">
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Priority sticker so the rep sees the task urgency
                without re-reading the row underneath. Skipped in
                bulk mode where each task may have a different
                priority. */}
            {!isBulk && task && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', background: pTone.bg, color: pTone.fg }}>{priorityLabel}</span>
                {task.category && (
                  <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{task.category}</span>
                )}
                <div style={{ flex: 1 }} />
                {task.due && (
                  <span style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)', fontFamily: 'var(--gb-font-mono)' }}>due {task.due}</span>
                )}
              </div>
            )}

            {/* Primary action — complete (or reopen when already done). */}
            {!isBulk && isComplete(task) ? (
              <Btn
                size="md" variant="tinted" full
                icon={<RefreshIcon size={12} />}
                onClick={() => fire('reopen', { taskId: qtv.taskId })}
              >Reopen task</Btn>
            ) : (
              <Btn
                size="md" variant="tinted" status="success" full
                icon={<I.check size={13} />}
                onClick={() => fire(isBulk ? 'bulk-complete' : 'complete', isBulk ? {} : { taskId: qtv.taskId })}
              >{isBulk ? 'Complete all' : 'Mark complete'}</Btn>
            )}

            {/* Push due date card. */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              padding: 10,
              background: 'var(--gb-surface-1)',
              border: '1px solid var(--gb-border-subtle)',
              borderRadius: 'var(--gb-r-md)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CalIcon size={11} style={{ color: 'var(--gb-info-fg)' }} />
                <Caption>Push due date</Caption>
                <div style={{ flex: 1 }} />
                {/* Re-key on dueText so the new value pops in instead
                    of crossfading — the animation makes the change
                    register at a glance. */}
                <motion.span
                  key={dueText}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{
                    fontSize: 10, color: 'var(--gb-brand-label)',
                    fontFamily: 'var(--gb-font-mono)', fontWeight: 700,
                  }}
                >→ {dueText}</motion.span>
              </div>

              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {PUSH_PRESETS.map((p, i) => (
                  <ChipBtn
                    key={p.label}
                    active={pushIdx === i}
                    onClick={() => setPushIdx(i)}
                  >{p.label}</ChipBtn>
                ))}
                <ChipBtn
                  active={showOther}
                  onClick={() => setPushIdx(PUSH_PRESETS.length)}
                >Other</ChipBtn>
              </div>

              <ExpandWhen open={showOther}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>
                  <span style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)' }}>Push by</span>
                  <Stepper
                    value={customDays}
                    setValue={(v) => setPushDays?.(v)}
                    min={1}
                    max={365}
                    suffix="d"
                  />
                  <div style={{ flex: 1 }} />
                </div>
              </ExpandWhen>

              <Btn
                size="sm" variant="tinted" full
                icon={<CalIcon size={11} />}
                onClick={() => fire(isBulk ? 'bulk-push' : 'push', isBulk
                  ? { days: effectiveDays }
                  : { taskId: qtv.taskId, days: effectiveDays })}
              >Apply push</Btn>
            </div>

            {/* Secondary navigation. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <Btn
                size="sm" variant="secondary"
                icon={<CalIcon size={11} />}
                onClick={() => setPane('date')}
              >Set date</Btn>
              <Btn
                size="sm" variant="secondary"
                icon={<I.plus size={11} />}
                onClick={() => setPane('templates')}
              >{isBulk ? 'Add to all' : 'Add task'}</Btn>
            </div>
          </div>
        </Pane>

        {/* DATE pane ────────────────────────────────────── */}
        <Pane visible={pane === 'date'} direction="right">
          <PaneHeader title="Set due date" onBack={() => setPane('main')} />
          <div style={{ padding: 12 }}>
            <MiniCalendar
              view={calView}
              setView={setCalView}
              pickedIso={pickedIso}
              setPickedIso={setPickedIso}
            />
            <Btn
              size="sm" variant="tinted" full
              icon={<CalIcon size={11} />}
              style={{ marginTop: 10 }}
              onClick={() => {
                const api = apiDateFromIso(pickedIso);
                if (!api) return;
                fire(isBulk ? 'bulk-set-date' : 'set-date', isBulk
                  ? { date: api }
                  : { taskId: qtv.taskId, date: api });
              }}
            >Save · {apiDateLabel(pickedIso)}</Btn>
          </div>
        </Pane>

        {/* TEMPLATES pane ───────────────────────────────── */}
        <Pane visible={pane === 'templates'} direction="right">
          <PaneHeader
            title={isBulk ? 'Add to all selected' : 'Add follow-up task'}
            onBack={() => setPane('main')}
          />
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 11 }}>
            {/* Custom task — type a title + pick a due, no template needed. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Caption>{isBulk ? 'Custom task · all selected' : 'Custom task'}</Caption>
              <input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && taskTitle.trim()) fireCustom(); }}
                placeholder="What needs doing?"
                autoFocus
                onFocus={(e) => { e.target.style.borderColor = 'var(--gb-brand-label)'; e.target.style.boxShadow = 'var(--gb-focus-ring)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--gb-border-default)'; e.target.style.boxShadow = 'none'; }}
                style={{
                  height: 32, padding: '0 10px',
                  background: 'var(--gb-surface-1)',
                  border: '1px solid var(--gb-border-default)',
                  borderRadius: 'var(--gb-r-sm)',
                  color: 'var(--gb-text-primary)',
                  fontFamily: 'var(--gb-font-sans)', fontSize: 12.5,
                  outline: 'none', transition: 'border-color .15s, box-shadow .15s',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)', marginRight: 2 }}>Due</span>
                {DUE_OPTS.map((o) => (
                  <ChipBtn key={o.k} active={taskDue === o.k} onClick={() => setTaskDue(o.k)}>{o.label}</ChipBtn>
                ))}
              </div>
              <Btn
                size="sm" variant="tinted" full
                icon={<I.plus size={12} />}
                disabled={!taskTitle.trim()}
                onClick={fireCustom}
              >{isBulk ? `Add to all ${selectedCount}` : 'Add task'}</Btn>
            </div>

            {/* Divider into the saved templates. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>or start from a template</span>
              <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
            </div>

            <div style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              maxHeight: 176, overflowY: 'auto',
            }}>
              {taskTpls.length === 0 ? (
                <div style={{
                  padding: 14, textAlign: 'center',
                  fontSize: 11.5, color: 'var(--gb-text-muted)',
                  fontStyle: 'italic',
                }}>
                  No task templates found.<br />Add some in the Notes editor.
                </div>
              ) : (
                taskTpls.map((tpl, i) => (
                  <TemplateRow
                    key={tpl.id}
                    index={i}
                    name={tpl.name || tpl.subject || 'Untitled'}
                    meta={describeTemplate(tpl)}
                    onClick={() => fire(isBulk ? 'bulk-create-task' : 'create-task',
                      isBulk ? { template: tpl } : { taskId: qtv.taskId, template: tpl })}
                  />
                ))
              )}
            </div>
          </div>
        </Pane>
      </div>
        )}
        </div>
       </div>
      </div>
    </DraggablePopup>
  );
}

/* ── Pane wrapper ─────────────────────────────────────────────
   Absolute-positions the inactive pane so the popup tracks the
   ACTIVE pane's height. We mount both panes so the slide animation
   on swap has something to crossfade with; pointer-events disabled
   on the inactive one keeps misclicks from triggering hidden
   buttons mid-transition. */
function Pane({ visible, direction, children }) {
  const dx = visible ? 0 : direction === 'left' ? -16 : 16;
  return (
    <div style={{
      position: visible ? 'relative' : 'absolute',
      inset: visible ? undefined : 0,
      width: '100%',
      pointerEvents: visible ? 'auto' : 'none',
      opacity: visible ? 1 : 0,
      transform: `translateX(${dx}px)`,
      transition: 'opacity .25s cubic-bezier(.4,0,.2,1), transform .25s cubic-bezier(.4,0,.2,1)',
    }}>
      {children}
    </div>
  );
}

function PaneHeader({ title, onBack }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '8px 10px',
      borderBottom: '1px solid var(--gb-border-subtle)',
      background: 'var(--gb-fill-faint)',
    }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          height: 22, padding: '0 8px 0 6px',
          background: 'transparent', border: 'none',
          color: 'var(--gb-text-tertiary)',
          cursor: 'pointer', fontSize: 11, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 3,
          borderRadius: 4,
          fontFamily: 'inherit',
        }}
      ><ChevLeftIcon size={10} /> Back</button>
      <div style={{
        flex: 1, textAlign: 'center',
        fontSize: 11, fontWeight: 700,
        color: 'var(--gb-text-primary)', letterSpacing: 0.2,
      }}>{title}</div>
      <div style={{ width: 50 }} />
    </div>
  );
}

/* ── ChipBtn ─────────────────────────────────────────────── */
function ChipBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 26, padding: '0 10px',
        background: active ? 'var(--gb-brand-tint-medium)' : 'var(--gb-surface-2)',
        border: '1px solid ' + (active ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
        borderRadius: 'var(--gb-r-sm)',
        color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
        fontSize: 11, fontWeight: 700,
        fontFamily: 'var(--gb-font-mono)',
        cursor: 'pointer',
        letterSpacing: 0.2,
        transition: 'background .18s, border-color .18s, color .18s, transform .15s',
        transform: active ? 'scale(1.02)' : 'scale(1)',
      }}
    >{children}</button>
  );
}

/* ── Stepper — mono number with – / + caps ─────────────── */
function Stepper({ value, setValue, min = 1, max = 365, suffix = 'd' }) {
  const clamp = (n) => Math.max(min, Math.min(max, n));
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      background: 'var(--gb-surface-2)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-sm)',
      height: 28, overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setValue(clamp(value - 1))}
        style={stepperBtnStyle}
      ><MinusIcon size={11} /></button>
      <div style={{
        minWidth: 52, padding: '0 8px', textAlign: 'center',
        fontFamily: 'var(--gb-font-mono)', fontSize: 12, fontWeight: 700,
        color: 'var(--gb-text-primary)',
      }}>
        {value}
        <span style={{ color: 'var(--gb-text-muted)', marginLeft: 2, fontWeight: 500 }}>{suffix}</span>
      </div>
      <button
        type="button"
        onClick={() => setValue(clamp(value + 1))}
        style={stepperBtnStyle}
      ><I.plus size={11} /></button>
    </div>
  );
}
const stepperBtnStyle = {
  height: '100%', width: 26, border: 'none', background: 'transparent',
  color: 'var(--gb-text-tertiary)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderLeft: '1px solid var(--gb-border-default)',
};

/* ── ExpandWhen — max-height + opacity reveal ──────────── */
function ExpandWhen({ open, children }) {
  const ref = useRef(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const measure = () => setH(ref.current.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [open]);
  return (
    <div style={{
      maxHeight: open ? h : 0,
      opacity: open ? 1 : 0,
      overflow: 'hidden',
      transition: 'max-height .3s cubic-bezier(.4,0,.2,1), opacity .25s',
    }}>
      <div ref={ref}>{children}</div>
    </div>
  );
}

/* ── Mini calendar ────────────────────────────────────── */
function MiniCalendar({ view, setView, pickedIso, setPickedIso }) {
  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const cells = useMemo(() => buildMonthGrid(view), [view]);
  const goPrev = () => {
    const d = new Date(view); d.setMonth(d.getMonth() - 1); setView(d);
  };
  const goNext = () => {
    const d = new Date(view); d.setMonth(d.getMonth() + 1); setView(d);
  };

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 2px 6px',
      }}>
        <CalNavBtn onClick={goPrev}><ChevLeftIcon size={10} /></CalNavBtn>
        <div style={{
          flex: 1, textAlign: 'center',
          fontSize: 11.5, fontWeight: 700,
          color: 'var(--gb-text-primary)',
          fontFamily: 'var(--gb-font-mono)',
        }}>{fmtMonthLabel(view)}</div>
        <CalNavBtn onClick={goNext}><ChevRightIcon size={10} /></CalNavBtn>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 2, fontSize: 9, color: 'var(--gb-text-muted)',
        textAlign: 'center', fontWeight: 700, letterSpacing: 0.5,
        textTransform: 'uppercase', marginBottom: 4,
      }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((c, i) => {
          const iso = isoFromCell(c);
          const isToday = iso === todayIso;
          const isPicked = iso === pickedIso;
          const isOutside = c.outside;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setPickedIso(iso)}
              style={{
                height: 26, padding: 0, border: 'none', cursor: 'pointer',
                background: isPicked ? 'var(--gb-brand-label)'
                  : isToday ? 'var(--gb-surface-2)'
                    : 'transparent',
                color: isPicked ? 'var(--gb-text-on-brand, var(--gb-surface-deep))'
                  : isOutside ? 'var(--gb-text-ghost)'
                    : isToday ? 'var(--gb-brand-label)'
                      : 'var(--gb-text-secondary)',
                borderRadius: 4,
                fontSize: 11,
                fontFamily: 'var(--gb-font-mono)',
                fontWeight: isToday || isPicked ? 700 : 500,
                outline: isToday && !isPicked ? '1px solid var(--gb-brand-tint-border)' : 'none',
                outlineOffset: -1,
                transition: 'background .18s, color .18s, transform .15s',
                transform: isPicked ? 'scale(1.05)' : 'scale(1)',
              }}
            >{c.day}</button>
          );
        })}
      </div>
    </div>
  );
}
function CalNavBtn({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 22, height: 22, border: 'none',
        background: 'var(--gb-surface-2)',
        color: 'var(--gb-text-tertiary)',
        borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >{children}</button>
  );
}

/* ── Template row in the Add-Task pane ───────────────────────── */
function TemplateRow({ index, name, meta, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, delay: index * 0.04, ease: [0.4, 0, 0.2, 1] }}
      /* Hover via plain CSS (onMouseEnter/Leave + a transition) rather than
         Motion's whileHover: whileHover tries to interpolate the brand-tint
         CSS variables, which it can't do cleanly, so on mouse-leave it
         flashed the resolved primary colour before settling. */
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--gb-brand-tint-soft)'; e.currentTarget.style.borderColor = 'var(--gb-brand-tint-border)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--gb-surface-2)'; e.currentTarget.style.borderColor = 'var(--gb-border-default)'; }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px',
        background: 'var(--gb-surface-2)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-sm)',
        cursor: 'pointer', textAlign: 'left',
        fontFamily: 'inherit',
        transition: 'background-color .15s, border-color .15s',
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: 'var(--gb-brand-label)',
        boxShadow: '0 0 8px var(--gb-brand-label)',
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11.5, fontWeight: 600,
          color: 'var(--gb-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{name}</div>
        {meta && (
          <div style={{
            fontSize: 10, color: 'var(--gb-text-muted)',
            fontFamily: 'var(--gb-font-mono)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{meta}</div>
        )}
      </div>
      <ChevRightIcon size={11} style={{ color: 'var(--gb-text-muted)' }} />
    </motion.button>
  );
}

/* Best-effort meta line for a task template — falls back to the
   raw subject when no description / due offset is configured. */
function describeTemplate(tpl) {
  if (!tpl) return '';
  if (tpl.description) return tpl.description;
  if (tpl.subject && tpl.subject !== tpl.name) return tpl.subject;
  return '';
}

function Caption({ children }) {
  return (
    <div style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8,
      textTransform: 'uppercase', color: 'var(--gb-text-muted)',
    }}>{children}</div>
  );
}

/* ── Inline icons (kept local so the popover stays portable) ── */
function CalIcon({ size = 12, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={style}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function ChevLeftIcon({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevRightIcon({ size = 11, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
      style={style}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function MinusIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
    </svg>
  );
}
function RefreshIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-4.49" />
    </svg>
  );
}
