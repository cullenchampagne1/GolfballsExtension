import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { motion, useMotionValue, useAnimationFrame } from 'motion/react';

/* ───────────────────────────────────────────────────────────────
   Throwable — drag-and-throw physics for any draggable surface.

   The built-in motion `drag` + `dragTransition` does spring-into-wall:
   when a flicked element hits a constraint it springs back along the
   same axis, oscillates a few times, settles. Reads as "stuck on the
   wall with rubber bands" rather than "bounced off". Throwable replaces
   that with a real step simulator: every frame the element's position
   advances by its current velocity, friction multiplies the velocity
   down, and a wall collision reverses the perpendicular velocity
   component (scaled by `restitution`). One flick → multiple visible
   ricochets like a puck on ice.

   Owns its own x/y motion values. Drag is captured at the pointer
   level rather than via Motion's drag controller so we have raw access
   to velocity at release (and can throttle/scale it to taste).

   Props:
     children      what gets thrown (e.g. a modal panel)
     dragHandle    optional ref to the element that starts drags. If
                   omitted, the entire <Throwable> root is a drag handle.
                   Pointer-down on a button INSIDE the handle is ignored.
     bounds        DOMRect-like { left, top, right, bottom } describing
                   the walls. Defaults to the viewport (window). Pass a
                   ref-derived rect when the throw should be contained
                   to a specific container.
     friction      Velocity multiplier per frame at 60fps (0.95 = light
                   friction, slides far; 0.85 = heavy, stops quickly).
                   Default 0.97. Scaled internally to dt so frame rate
                   doesn't change feel.
     restitution   Energy retained after a wall bounce, 0..1. 1.0 =
                   perfectly elastic (puck), 0 = sticks. Default 0.78.
     maxSpeed      Velocity cap (px/sec) so a violent flick doesn't
                   blow the element across three screens in one frame.
                   Default 3000.
     throwScale    Multiplier on the pointer-release velocity. <1 dampens
                   flicks, >1 amplifies. Default 0.55 — pointer move
                   velocities are typically very high so we damp by
                   default. Bump to 1.0 to throw harder.
     onThrowEnd    Optional callback fired when motion settles (speed
                   crosses below 1 px/sec for >100ms).
     style         Extra style on the motion root.
     instanceRef   Forwarded ref. Exposes { stop(), throwTo(x,y) }.
─────────────────────────────────────────────────────────────── */

const FRAME_BASIS = 1 / 60;  // friction is calibrated for 60fps; scale dt against this
const REST_SPEED = 1;        // below this px/sec the simulation considers itself at rest
const REST_TIME_MS = 100;    // motionless duration before onThrowEnd fires

export function Throwable({
  children,
  dragHandle,
  bounds,
  friction = 0.97,
  restitution = 0.78,
  maxSpeed = 3000,
  throwScale = 0.55,
  onThrowEnd,
  style,
  instanceRef,
  ...rest
}) {
  const rootRef = useRef(null);
  // The inner ref measures content size (the outer ref is the fixed
  // viewport-center anchor and reports the same size, but reading from
  // the inner box matches the visible element exactly).
  const innerRef = useRef(null);
  // x, y = the element's current translate values, in viewport px.
  // We center the element at start via initial 0,0 then let the drag/
  // physics carry it. The motion values can be read sync via .get().
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // Velocity tracked manually as plain refs (motion values would re-render
  // on change which we don't want for an animation frame loop).
  const vx = useRef(0);
  const vy = useRef(0);
  // Pointer-move history for velocity estimation at release. Motion has
  // its own getVelocity() but we want a smoothed average over the last
  // ~80ms so a single jittery final frame doesn't dominate.
  const history = useRef([]);
  const draggingRef = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Last frame the simulator's `at-rest` timer started accumulating.
  const restStartRef = useRef(null);

  // Resolve current walls. Coordinate space: the element is anchored
  // at the viewport center (via `left: 50%; top: 50%`) and the x/y
  // motion values are pure translate offsets from that anchor. So at
  // x=0 the element's center sits at the viewport's center. The walls
  // are therefore symmetric around 0:  x ∈ [-(W/2 - w/2), +(W/2 - w/2)]
  // where W = viewport width, w = element width.
  const getBounds = useCallback(() => {
    const el = innerRef.current || rootRef.current;
    const rect = el ? { w: el.offsetWidth, h: el.offsetHeight } : { w: 0, h: 0 };
    const view = bounds || {
      left: 0, top: 0,
      right: typeof window === 'undefined' ? 1000 : window.innerWidth,
      bottom: typeof window === 'undefined' ? 800 : window.innerHeight,
    };
    const W = view.right - view.left;
    const H = view.bottom - view.top;
    // Offset from viewport-center-anchor at which the element's edge
    // touches the wall. e.g. for a 400px-wide element in a 1000px
    // viewport, max |x| = (1000 - 400) / 2 = 300.
    return {
      minX: -(W / 2 - rect.w / 2),
      maxX:  (W / 2 - rect.w / 2),
      minY: -(H / 2 - rect.h / 2),
      maxY:  (H / 2 - rect.h / 2),
      w: rect.w, h: rect.h,
    };
  }, [bounds]);

  /* ── Drag capture (raw pointer events, not Motion drag) ───────────
     Why raw: Motion's drag controller releases velocity via its own
     inertia animation. We want the raw release velocity to seed OUR
     physics loop. Listening at the pointer level gives us the cleanest
     access to recent movements (history) at the exact moment of release. */
  const onPointerDown = useCallback((e) => {
    // Ignore drags initiated on interactive elements (buttons, inputs,
    // anything with role=button). Lets the user click a close button on
    // the modal header without starting a throw.
    const tag = e.target?.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.target?.closest?.('button, input, textarea, select')) return;
    if (e.button !== 0) return;

    draggingRef.current = true;
    vx.current = 0;
    vy.current = 0;
    history.current = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
    // pointer client coords → element offset-from-viewport-center coords:
    // subtract the viewport center plus the current x/y to get the
    // "where on the element did the user grab" offset, then we can
    // re-derive the target offset on each pointermove via the same
    // relationship.
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    dragOffset.current = { x: e.clientX - cx - x.get(), y: e.clientY - cy - y.get() };
    // Pointer capture so we keep receiving move/up even if the pointer
    // leaves the element (e.g. fast drag past the edge).
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
    e.preventDefault();
  }, [x, y]);

  const onPointerMove = useCallback((e) => {
    if (!draggingRef.current) return;
    const now = performance.now();
    history.current.push({ t: now, x: e.clientX, y: e.clientY });
    // Trim to last 80ms — older samples don't reflect the throw arc.
    const cutoff = now - 80;
    while (history.current.length > 2 && history.current[0].t < cutoff) {
      history.current.shift();
    }
    // Mirror image of the pointerdown math: translate the live pointer
    // coords back into offset-from-viewport-center space.
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    x.set(e.clientX - cx - dragOffset.current.x);
    y.set(e.clientY - cy - dragOffset.current.y);
  }, [x, y]);

  const onPointerUp = useCallback((e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    // Velocity = (last - first) / dt over the kept history window.
    // px/sec. Clamped to maxSpeed.
    const h = history.current;
    if (h.length >= 2) {
      const last = h[h.length - 1];
      const first = h[0];
      const dt = (last.t - first.t) / 1000;
      if (dt > 0) {
        let velX = (last.x - first.x) / dt * throwScale;
        let velY = (last.y - first.y) / dt * throwScale;
        const speed = Math.hypot(velX, velY);
        if (speed > maxSpeed) {
          const k = maxSpeed / speed;
          velX *= k; velY *= k;
        }
        vx.current = velX;
        vy.current = velY;
      }
    }
    history.current = [];
    restStartRef.current = null;
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}
  }, [throwScale, maxSpeed]);

  /* ── Physics step ─────────────────────────────────────────────────
     Runs every animation frame. Integrates velocity into position,
     applies wall collisions (with energy loss via `restitution`), and
     damps velocity via `friction`. When the element is sitting still
     (no velocity, no active drag) the loop short-circuits early so
     idle modals don't churn the GPU. */
  useAnimationFrame((_, deltaMs) => {
    if (draggingRef.current) return;
    const dt = deltaMs / 1000;
    if (dt <= 0 || dt > 0.1) return;  // skip outliers (tab unfocus, etc.)

    let nvx = vx.current;
    let nvy = vy.current;
    // Already at rest → fire onThrowEnd once and bail.
    const speed = Math.hypot(nvx, nvy);
    if (speed < REST_SPEED) {
      vx.current = 0; vy.current = 0;
      if (restStartRef.current === null) restStartRef.current = performance.now();
      else if (performance.now() - restStartRef.current >= REST_TIME_MS) {
        onThrowEnd?.();
        restStartRef.current = -1;  // sentinel: already fired, don't repeat
      }
      return;
    }
    restStartRef.current = null;

    let nx = x.get() + nvx * dt;
    let ny = y.get() + nvy * dt;

    // Wall collisions. Reverse the perpendicular velocity component,
    // scaled by restitution. Mirror the overshoot back across the wall
    // so the element doesn't stick flush after a fast frame.
    const b = getBounds();
    if (nx < b.minX) { nx = b.minX + (b.minX - nx); nvx = -nvx * restitution; }
    else if (nx > b.maxX) { nx = b.maxX - (nx - b.maxX); nvx = -nvx * restitution; }
    if (ny < b.minY) { ny = b.minY + (b.minY - ny); nvy = -nvy * restitution; }
    else if (ny > b.maxY) { ny = b.maxY - (ny - b.maxY); nvy = -nvy * restitution; }

    // Friction: a 60fps-calibrated multiplier scaled to current dt so
    // the feel is the same regardless of frame rate. Math: applying
    // `friction` for one 60fps frame should equal one frame of decay.
    // For dt seconds we need friction^(dt/FRAME_BASIS).
    const decay = Math.pow(friction, dt / FRAME_BASIS);
    nvx *= decay;
    nvy *= decay;

    vx.current = nvx;
    vy.current = nvy;
    x.set(nx);
    y.set(ny);
  });

  // Re-clamp position on resize so a wall-side modal doesn't end up
  // off-screen when the viewport shrinks.
  useEffect(() => {
    function onResize() {
      const b = getBounds();
      x.set(Math.max(b.minX, Math.min(b.maxX, x.get())));
      y.set(Math.max(b.minY, Math.min(b.maxY, y.get())));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [getBounds, x, y]);

  // Imperative handle: callers can stop momentum (e.g. when a modal
  // opens a popover and we don't want it sliding mid-interaction).
  useImperativeHandle(instanceRef, () => ({
    stop: () => { vx.current = 0; vy.current = 0; },
    throwTo: (tx, ty, ms = 400) => {
      // Compute the velocity that would carry the element from current
      // pos to (tx, ty) in `ms`. Simple linear seed — physics takes over
      // afterward with friction + walls.
      const dt = ms / 1000;
      vx.current = (tx - x.get()) / dt;
      vy.current = (ty - y.get()) / dt;
    },
  }), [x, y]);

  // The drag handle is either an external ref-passed element or the
  // root itself. Either way we wire pointer handlers; the handle just
  // decides where the user has to press to initiate a throw.
  useEffect(() => {
    const handleEl = dragHandle?.current || rootRef.current;
    if (!handleEl) return undefined;
    handleEl.addEventListener('pointerdown', onPointerDown);
    handleEl.addEventListener('pointermove', onPointerMove);
    handleEl.addEventListener('pointerup', onPointerUp);
    handleEl.addEventListener('pointercancel', onPointerUp);
    return () => {
      handleEl.removeEventListener('pointerdown', onPointerDown);
      handleEl.removeEventListener('pointermove', onPointerMove);
      handleEl.removeEventListener('pointerup', onPointerUp);
      handleEl.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragHandle, onPointerDown, onPointerMove, onPointerUp]);

  // Two-layer structure to avoid colliding the `-50%` self-centering
  // translate with Motion's `x`/`y` (both are `transform: translate(...)`,
  // and the last one wins). Outer fixed wrapper at viewport center +
  // motion translate-by-(x,y); inner div self-centers via static
  // transform so the outer's translate is pure displacement.
  return (
    <motion.div
      ref={rootRef}
      style={{
        x, y,
        position: 'fixed',
        left: '50%', top: '50%',
        touchAction: 'none',
      }}
      {...rest}
    >
      <div ref={innerRef} style={{ transform: 'translate(-50%, -50%)', ...style }}>
        {children}
      </div>
    </motion.div>
  );
}
