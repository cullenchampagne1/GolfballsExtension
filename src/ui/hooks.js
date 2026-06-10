/* ───────────────────────────────────────────────────────────────
   ui/hooks.js — small reusable hooks shared across the component
   library and modals. Pure logic (no rendering), so they're safe
   drop-ins for the hand-rolled effects scattered through the modals.
─────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * useClickOutside(ref, handler, enabled?) — fire `handler` when a
 * mousedown lands outside `ref`. Replaces the document mousedown +
 * `ref.current.contains(e.target)` effect duplicated across popovers.
 * The handler is read through a ref so changing its identity each
 * render doesn't re-subscribe the listener.
 */
export function useClickOutside(ref, handler, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!enabled) return undefined;
    const onDown = (e) => {
      const el = ref && ref.current;
      if (el && !el.contains(e.target)) handlerRef.current(e);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, enabled]);
}

/**
 * useTransientFlag(duration?) — a boolean that flips true on trigger()
 * then auto-resets after `duration` ms. For "Copied!" / "Saved!"
 * flashes. Unlike the inline `setTimeout(() => setX(false), …)` it
 * clears a pending timer on re-trigger and on unmount (no setState
 * after unmount, no stuck flash).
 *
 * Returns [on, trigger].
 */
export function useTransientFlag(duration = 1500) {
  const [on, setOn] = useState(false);
  const timer = useRef(null);
  const trigger = useCallback(() => {
    setOn(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), duration);
  }, [duration]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return [on, trigger];
}
