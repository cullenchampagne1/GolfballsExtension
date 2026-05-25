import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { PillToast } from './PillToast.jsx';
import { ActionToast } from './ActionToast.jsx';
import { StepToast } from './StepToast.jsx';
import { TrayToast } from './TrayToast.jsx';
import { EdgeToast } from './EdgeToast.jsx';
import { SelectToast } from './SelectToast.jsx';

/* ───────────────────────────────────────────────────────────────
   ToastHost — the global notification manager.

   Wrap a surface in <ToastHost> once. Anywhere underneath, call
   `useToast()` to fire toasts:

     const toast = useToast();
     toast.pill('Saved', { tone: 'success' });
     toast.action({ title: 'Proof ready', primary: 'Send', onPrimary: ... });
     toast.step({ steps: [...], currentStep: 0 });
     toast.tray({ items: [...] });
     toast.edge('Connected to Solr', { tone: 'brand' });

   ToastHost also installs a `window.__gbToast` shim so content
   scripts (which can't import React hooks) can fire toasts:

     window.__gbToast?.success('Order saved');     // → pill, success tone
     window.__gbToast?.warning('Watch list full'); // → pill, warning tone
     window.__gbToast?.error(...);  .info(...);

   Per-variant defaults (placement + auto-dismiss):
     pill   top-center · 3000ms
     action top-right  · sticky (CTA-driven, user dismisses)
     step   top-right  · sticky (lifecycle-driven)
     tray   top-right  · sticky
     edge   top-edge   · sticky

   `duration` opt-in on any variant overrides the default.
─────────────────────────────────────────────────────────────── */

const Ctx = createContext(null);

/* Per-variant defaults. `placement` picks which fixed container renders the
   toast. `duration` of null means sticky; a number sets an auto-dismiss
   timer (ms). These match the spec's smart-defaults choice. */
const VARIANT_DEFAULTS = {
  pill:   { placement: 'top-center', duration: 3000 },
  action: { placement: 'top-right',  duration: null },
  step:   { placement: 'top-right',  duration: null },
  tray:   { placement: 'top-right',  duration: null },
  edge:   { placement: 'top-edge',   duration: null },
  select: { placement: 'top-right',  duration: null },
};

/* Maximum simultaneously rendered toasts per placement. Older entries
   get dropped from the head — newer ones are more relevant. Tray
   compounds many items into one toast, so it has its own implicit cap. */
const MAX_PER_PLACEMENT = 5;

/* Slot geometry for each placement. Defines the fixed container's
   anchor + flex direction. New toasts append at the END of the array
   and render at the FRONT of the column (column-reverse) so the most
   recent toast lands closest to where the user expects new content.
   `top-edge` is the special ambient strip pinned to the very top edge —
   not configurable from the caller, only EdgeToast uses it. */
const PLACEMENTS = {
  'top-left':   { top: 16, left:  16, alignItems: 'flex-start', flexDirection: 'column-reverse' },
  'top-center': { top: 16, left: '50%', transform: 'translateX(-50%)', alignItems: 'center', flexDirection: 'column-reverse' },
  'top-right':  { top: 16, right: 16, alignItems: 'flex-end',   flexDirection: 'column-reverse' },
  'top-edge':   { top: 0,  left: '50%', transform: 'translateX(-50%)', alignItems: 'center', flexDirection: 'column' },
};

/** Render a single toast's body. Pure switch — no animation wrapper here;
 *  the AnimatePresence motion.div lives at the call site so its key sits
 *  on a direct AnimatePresence child (custom-component children sometimes
 *  swallow the exit callback in Motion's reconciliation). */
function ToastBody({ entry, dismiss }) {
  const props = { ...entry.props, onDismiss: () => dismiss(entry.id) };
  switch (entry.kind) {
    case 'pill':   return <PillToast   {...props} />;
    case 'action': return <ActionToast {...props} />;
    case 'step':   return <StepToast   {...props} />;
    case 'tray':   return <TrayToast   {...props} />;
    case 'edge':   return <EdgeToast   {...props} />;
    case 'select': return <SelectToast {...props} />;
    default:       return null;
  }
}

/** Public hook. Returns null outside a host (callers should null-check). */
export function useToast() {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  // Fallback: the global host (installed by any mounted ToastHost) so
  // call sites outside the host tree (deeply portaled modals, content
  // scripts that imported into a React tree) still work.
  if (typeof window !== 'undefined' && window.__gbToast) return window.__gbToast;
  return null;
}

/**
 * ToastHost — context provider + fixed-positioned render targets.
 *
 * Props:
 *   children   the app subtree that can call useToast()
 *   maxPerPlacement  override the per-slot cap (default 5)
 *   installGlobal    when true, sets window.__gbToast on mount so content
 *                    scripts can fire toasts without React (default true
 *                    only on the first mounted host; later mounts skip)
 */
export function ToastHost({ children, maxPerPlacement = MAX_PER_PLACEMENT, installGlobal = true }) {
  const [stack, setStack] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setStack((s) => s.filter((t) => t.id !== id));
  }, []);

  // Mutate an existing toast's props in place. Use this for progress
  // updates (StepToast advancing through steps) so the toast stays
  // mounted — dismiss+re-fire causes a fresh mount + entry animation on
  // every update which reads as a re-floating, fighting toast.
  const update = useCallback((id, patch) => {
    setStack((s) => s.map((t) => (t.id === id ? { ...t, props: { ...t.props, ...patch } } : t)));
  }, []);

  const push = useCallback((kind, props = {}) => {
    const id = ++idRef.current;
    const defaults = VARIANT_DEFAULTS[kind] || VARIANT_DEFAULTS.pill;
    const placement = props.placement || defaults.placement;
    const duration  = props.duration !== undefined ? props.duration : defaults.duration;
    // Strip framework-only options before forwarding to the toast component
    const { placement: _p, duration: _d, ...rest } = props;
    setStack((s) => {
      const sameSlot = s.filter((t) => t.placement === placement);
      const others   = s.filter((t) => t.placement !== placement);
      const trimmed = sameSlot.length >= maxPerPlacement
        ? sameSlot.slice(-(maxPerPlacement - 1))  // drop oldest in this slot
        : sameSlot;
      return [...others, ...trimmed, { id, kind, props: rest, placement, duration }];
    });
    if (duration && duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss, maxPerPlacement]);

  /* Convenience API mirroring window.__gbToast. The shorthand methods
     (success/warning/error/info) all fire pills with the matching tone.
     Variant constructors (pill/action/step/tray/edge) accept the full
     props bag and return the toast id so callers can dismiss imperatively. */
  const api = useMemo(() => ({
    // Variant constructors — full control
    pill:   (message, opts = {}) => push('pill',   { message, ...opts }),
    action: (opts = {})          => push('action', opts),
    step:   (opts = {})          => push('step',   opts),
    tray:   (opts = {})          => push('tray',   opts),
    edge:   (message, opts = {}) => push('edge',   { message, ...opts }),
    select: (opts = {})          => push('select', opts),
    // Shorthand wrappers — always pill with the named tone
    success: (message, opts = {}) => push('pill', { message, tone: 'success', ...opts }),
    info:    (message, opts = {}) => push('pill', { message, tone: 'info',    ...opts }),
    warning: (message, opts = {}) => push('pill', { message, tone: 'warning', ...opts }),
    error:   (message, opts = {}) => push('pill', { message, tone: 'error',   ...opts }),
    brand:   (message, opts = {}) => push('pill', { message, tone: 'brand',   ...opts }),
    // Imperative dismiss + mutate-in-place
    dismiss,
    update,
    dismissAll: () => setStack([]),
  }), [push, dismiss, update]);

  // Install the global shim. First mounted host wins so content scripts
  // get a stable reference; later mounts (e.g. a popup opening on top of
  // the editor) leave the existing one in place.
  useEffect(() => {
    if (!installGlobal || typeof window === 'undefined') return undefined;
    if (window.__gbToast) return undefined;
    window.__gbToast = api;
    return () => {
      if (window.__gbToast === api) delete window.__gbToast;
    };
  }, [api, installGlobal]);

  // Group the stack by placement. We pre-seed every known placement
  // with an empty array so the matching container + AnimatePresence
  // always mount, even when there are no toasts at that placement.
  // Critical for exit animations: if the LAST toast at a placement
  // gets dismissed and we'd otherwise drop the container, the exiting
  // toast's AnimatePresence unmounts before its exit animation runs.
  // Keeping the host mounted lets AnimatePresence track the departing
  // child long enough to play its exit transition cleanly.
  const byPlacement = useMemo(() => {
    const map = new Map(Object.keys(PLACEMENTS).map((p) => [p, []]));
    for (const t of stack) {
      if (!map.has(t.placement)) map.set(t.placement, []);
      map.get(t.placement).push(t);
    }
    return map;
  }, [stack]);

  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  return (
    <Ctx.Provider value={api}>
      {children}
      {portalTarget && createPortal(
        <>
          {Array.from(byPlacement.entries()).map(([placement, entries]) => {
            const p = PLACEMENTS[placement] || PLACEMENTS['top-right'];
            return (
              <div
                key={placement}
                style={{
                  position: 'fixed',
                  zIndex: 2147483600,
                  display: 'flex',
                  gap: 8,
                  pointerEvents: 'none',
                  ...p,
                }}
              >
                {/* initial:true (the default) so even the first toast in a
                    fresh placement animates in. We had initial=false here
                    previously; Motion treats that as "skip entry for the
                    FIRST child of this AnimatePresence" which gave us the
                    odd behavior where the very first toast popped in
                    without animation while every toast after it slid in
                    cleanly. mode:sync (the default) so layout animations
                    don't fight the entry — popLayout is for cases where
                    exiting siblings need to NOT shift the layout, which
                    isn't the case here (we want neighbors to slide). */}
                <AnimatePresence>
                  {entries.map((entry) => (
                    <motion.div
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, scale: 0.85, y: -12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{
                        opacity: 0, scale: 0.85, y: -8,
                        transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] },
                      }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      style={{ pointerEvents: 'auto' }}
                    >
                      <ToastBody entry={entry} dismiss={dismiss} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            );
          })}
        </>,
        portalTarget,
      )}
    </Ctx.Provider>
  );
}
