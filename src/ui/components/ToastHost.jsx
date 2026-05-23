import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { PillToast } from './PillToast.jsx';
import { ActionToast } from './ActionToast.jsx';
import { StepToast } from './StepToast.jsx';
import { TrayToast } from './TrayToast.jsx';
import { EdgeToast } from './EdgeToast.jsx';

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

/** Render a single toast inside the manager's exit-animation wrapper. */
function ToastWrapper({ entry, dismiss }) {
  const onDismiss = () => dismiss(entry.id);
  const props = { ...entry.props, onDismiss };
  let node;
  switch (entry.kind) {
    case 'pill':   node = <PillToast   {...props} />; break;
    case 'action': node = <ActionToast {...props} />; break;
    case 'step':   node = <StepToast   {...props} />; break;
    case 'tray':   node = <TrayToast   {...props} />; break;
    case 'edge':   node = <EdgeToast   {...props} />; break;
    default: return null;
  }
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      style={{ pointerEvents: 'auto' }}
    >
      {node}
    </motion.div>
  );
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
    // Shorthand wrappers — always pill with the named tone
    success: (message, opts = {}) => push('pill', { message, tone: 'success', ...opts }),
    info:    (message, opts = {}) => push('pill', { message, tone: 'info',    ...opts }),
    warning: (message, opts = {}) => push('pill', { message, tone: 'warning', ...opts }),
    error:   (message, opts = {}) => push('pill', { message, tone: 'error',   ...opts }),
    brand:   (message, opts = {}) => push('pill', { message, tone: 'brand',   ...opts }),
    // Imperative dismiss
    dismiss,
    dismissAll: () => setStack([]),
  }), [push, dismiss]);

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

  // Group the stack by placement so we can render each fixed container's
  // children together. Empty placements skip rendering entirely.
  const byPlacement = useMemo(() => {
    const map = new Map();
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
                <AnimatePresence initial={false}>
                  {entries.map((entry) => (
                    <ToastWrapper key={entry.id} entry={entry} dismiss={dismiss} />
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
