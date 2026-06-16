import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { I, Btn } from '../../ui/index.js';
import { GIcon } from './app.jsx';

/* ───────────────────────────────────────────────────────────────
   stage.jsx — the live-UI stage used across the guide. Ported from
   docs/design-reference/guide/lib/demo-engine.jsx onto the real
   stack (motion/react + src/ui).

   <LiveStage> frames a live snippet like the real surface and
   overlays:
     • numbered callout pins + a legend       (Tour mode)
     • a synthetic cursor + step captions     (Play mode)
     • nothing — hands-on with Reset          (Try-it mode)

   Targets are located by [data-demo="<name>"] attributes inside the
   rendered UI.

   Props:
     width        device width for the frame (px)
     frameLabel   chrome label above the UI (e.g. a fake URL)
     frameKind    'popup' squares the top corners under the chrome bar
     render       (apiRef, helpers) => ReactNode  — helpers.showToast(msg)
     callouts     [{ target, n, title, text }]
     steps        [{ target, caption, run?(api, helpers), hold? }]
     note         italic caption under the frame
─────────────────────────────────────────────────────────────── */

function CursorSVG() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.5))' }}>
      <path d="M5 3l14 7-5.5 1.8L11 18 5 3z" fill="#fff" stroke="#0a0a0a" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function LiveStage({ width = 320, frameLabel, frameKind = 'popup', render, callouts = [], steps = [], note, wide = false, legend = 'right' }) {
  const stageRef = useRef(null);
  const apiRef = useRef(null);
  const [mode, setMode] = useState(callouts.length ? 'tour' : 'plain'); // 'tour' | 'play' | 'plain'
  const [runKey, setRunKey] = useState(0);
  const [stepIdx, setStepIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState({ x: width / 2, y: 60, visible: false });
  const [ring, setRing] = useState(null);
  const [hoverN, setHoverN] = useState(null);
  const [, setTick] = useState(0); // forces pin re-measure while layout settles
  const timerRef = useRef(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  /* measure a target rect relative to the stage */
  const rectOf = useCallback((target) => {
    const stage = stageRef.current;
    if (!stage || !target) return null;
    const el = stage.querySelector(`[data-demo="${target}"]`);
    if (!el) return null;
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height, cx: r.left - s.left + r.width / 2, cy: r.top - s.top + r.height / 2 };
  }, []);

  useEffect(() => {
    const onR = () => setTick((t) => t + 1);
    window.addEventListener('resize', onR);
    const iv = setInterval(onR, 600);
    return () => { window.removeEventListener('resize', onR); clearInterval(iv); };
  }, []);

  const clearTimers = () => { clearTimeout(timerRef.current); };

  const restart = useCallback(() => {
    clearTimers();
    setRunKey((k) => k + 1);   // remounts the rendered UI fresh
    setStepIdx(-1);
    setRing(null);
    setCursor((c) => ({ ...c, visible: false }));
  }, []);

  /* run the step sequence */
  const runStep = useCallback((idx) => {
    if (idx >= steps.length) {
      setPlaying(false);
      setStepIdx(steps.length);
      setTimeout(() => { setRing(null); setCursor((c) => ({ ...c, visible: false })); }, 600);
      return;
    }
    const step = steps[idx];
    setStepIdx(idx);
    let attempts = 0;
    const place = () => {
      const r = rectOf(step.target);
      if (!r && attempts < 6) { attempts++; setTimeout(place, 80); return; }
      if (r) { setCursor({ x: r.cx, y: r.cy, visible: true }); setRing(r); }
      const actDelay = 520;
      timerRef.current = setTimeout(() => {
        try { step.run && step.run(apiRef.current, { showToast }); } catch { /* demo actions are best-effort */ }
        setTimeout(() => { const r2 = rectOf(step.target); if (r2) setRing(r2); }, 220);
        timerRef.current = setTimeout(() => runStep(idx + 1), step.hold || 1700);
      }, actDelay);
    };
    place();
  }, [steps, rectOf, showToast]);

  const play = useCallback(() => {
    setMode('play');
    setPlaying(true);
    if (stepIdx >= steps.length || stepIdx < 0) { restart(); setTimeout(() => runStep(0), 260); }
    else runStep(stepIdx);
  }, [runStep, restart, stepIdx, steps.length]);

  const pause = useCallback(() => { setPlaying(false); clearTimers(); }, []);

  const enterTour = () => { pause(); setMode('tour'); setRing(null); setCursor((c) => ({ ...c, visible: false })); };
  const enterPlain = () => { pause(); setMode('plain'); setRing(null); setCursor((c) => ({ ...c, visible: false })); };

  useEffect(() => () => clearTimers(), []);

  const helpers = { showToast };
  const curStep = mode === 'play' && stepIdx >= 0 && stepIdx < steps.length ? steps[stepIdx] : null;

  return (
    <div className={`gb-livestage${wide ? ' wide' : ''}${legend === 'left' ? ' legend-left' : ''}${legend === 'bottom' ? ' legend-bottom' : ''}`}>
      {/* mode tabs */}
      <div className="gb-ls-tabs">
        {callouts.length > 0 && (
          <button className={mode === 'tour' ? 'on' : ''} onClick={enterTour}>
            <GIcon.grid size={12} /> Tour ({callouts.length})
          </button>
        )}
        {steps.length > 0 && (
          <button className={mode === 'play' ? 'on' : ''} onClick={() => (playing ? pause() : play())}>
            {playing ? <I.pause size={12} /> : <I.play size={12} />} {playing ? 'Pause' : 'Play walkthrough'}
          </button>
        )}
        <button className={mode === 'plain' ? 'on' : ''} onClick={enterPlain}>
          <GIcon.cube size={12} /> Try it
        </button>
        {(mode === 'play' || mode === 'plain') && (
          <button onClick={restart} title="Restart"><I.refresh size={12} /> Reset</button>
        )}
      </div>

      <div className="gb-ls-body">
        {/* the device frame + stage */}
        <div className="gb-ls-framewrap">
          {/* Chrome titlebar + frame are one window, sized together so the
              titlebar always spans the modal width and sits flush on top.
              Wide mode caps the window at `width` so the table reflows
              instead of overflowing; otherwise it's the fixed device width. */}
          <div className="gb-ls-window" style={{ width: wide ? '100%' : width, maxWidth: wide ? width : '100%' }}>
          {frameLabel && (
            <div className="gb-ls-chrome">
              <span className="gb-ls-dot r" /><span className="gb-ls-dot y" /><span className="gb-ls-dot g" />
              <span className="gb-ls-chrome-label">{frameLabel}</span>
            </div>
          )}
          <div className={`gb-ls-frame ${frameKind}`}>
            <div className="gb-ls-stage" ref={stageRef}>
              <div key={runKey}>{render(apiRef, helpers)}</div>

              {/* highlight ring */}
              <AnimatePresence>
                {ring && mode === 'play' && (
                  <motion.div className="gb-ls-ring" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                    style={{ left: ring.left - 6, top: ring.top - 6, width: ring.width + 12, height: ring.height + 12 }} />
                )}
              </AnimatePresence>

              {/* numbered callout pins (tour mode) */}
              {mode === 'tour' && callouts.map((c) => {
                const r = rectOf(c.target);
                if (!r) return null;
                return (
                  <button key={c.n} className={`gb-ls-pin ${hoverN === c.n ? 'hot' : ''}`} style={{ left: r.left + r.width - 10, top: r.top - 10 }}
                    onMouseEnter={() => setHoverN(c.n)} onMouseLeave={() => setHoverN(null)}>{c.n}</button>
                );
              })}
              {/* pin hover ring */}
              {mode === 'tour' && hoverN != null && (() => {
                const c = callouts.find((x) => x.n === hoverN); const r = c && rectOf(c.target);
                return r ? <div className="gb-ls-ring tour" style={{ left: r.left - 5, top: r.top - 5, width: r.width + 10, height: r.height + 10 }} /> : null;
              })()}

              {/* synthetic cursor */}
              {cursor.visible && (
                <div className="gb-ls-cursor" style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}><CursorSVG /></div>
              )}

              {/* in-stage toast (mimics host-page toasts) */}
              <AnimatePresence>
                {toast && (
                  <motion.div className="gb-ls-toast" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                    <I.bolt size={12} /> {toast}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          </div>
          {note && <div className="gb-ls-note">{note}</div>}
        </div>

        {/* side panel: legend (tour) or step caption (play) */}
        <div className="gb-ls-side">
          {mode === 'tour' && (
            <div className="gb-ls-legend">
              <div className="gb-ls-legend-h">Controls on this screen</div>
              {callouts.map((c) => (
                <div key={c.n} className={`gb-ls-legend-row ${hoverN === c.n ? 'hot' : ''}`} onMouseEnter={() => setHoverN(c.n)} onMouseLeave={() => setHoverN(null)}>
                  <span className="gb-ls-legend-n">{c.n}</span>
                  <div><div className="gb-ls-legend-t">{c.title}</div><div className="gb-ls-legend-d">{c.text}</div></div>
                </div>
              ))}
            </div>
          )}
          {mode === 'play' && (
            <div className="gb-ls-player">
              <div className="gb-ls-player-h">
                <span>Walkthrough</span>
                <span className="gb-ls-player-count">{Math.min(stepIdx + 1, steps.length)} / {steps.length}</span>
              </div>
              <div className="gb-ls-progress"><div style={{ width: `${(Math.min(stepIdx + 1, steps.length) / steps.length) * 100}%` }} /></div>
              <div className="gb-ls-caption">
                {curStep ? curStep.caption : stepIdx >= steps.length ? "That's the tour — press Reset to replay, or switch to “Try it”." : 'Press play to start the walkthrough.'}
              </div>
              <div className="gb-ls-player-btns">
                <Btn size="sm" variant="tinted" status="brand" icon={playing ? <I.pause /> : <I.play />} onClick={() => (playing ? pause() : play())}>{playing ? 'Pause' : stepIdx >= steps.length ? 'Replay' : 'Play'}</Btn>
                <Btn size="sm" variant="ghost" icon={<I.refresh />} onClick={restart}>Reset</Btn>
              </div>
            </div>
          )}
          {mode === 'plain' && (
            <div className="gb-ls-legend">
              <div className="gb-ls-legend-h">Hands-on</div>
              <div className="gb-ls-plain-note">This is the real interface running live — click around. It's wired to sample data, so nothing you do here affects a real order. Hit <b>Reset</b> to start fresh.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
