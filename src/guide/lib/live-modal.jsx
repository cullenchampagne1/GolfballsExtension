import React, { useRef, useState, useLayoutEffect, useMemo } from 'react';
import { MotionConfig } from 'motion/react';
import { I, FloatingPanelEmbedContext } from '../../ui/index.js';

/* ───────────────────────────────────────────────────────────────
   live-modal.jsx — mounts a REAL modal component (WatchList,
   TaskList, CRMSearch, …) inside a bounded, scaled stage so the
   guide shows the genuine UI instead of a hand-built lookalike.

   How it works:
     • An outer wrapper reserves the post-scale footprint (W·s × H·s).
     • An inner box is the modal's true size (W × H), transform-scaled
       to fit. transform (not zoom) keeps the math predictable and
       makes the box the containing block for the modal's portal.
     • The modal is rendered with FloatingPanel's `contained` +
       `portalContainer` props, so it portals INTO the box and anchors
       with position:absolute instead of covering the viewport.

   render(box) receives the box element to portal into; the page
   passes it straight to the modal as portalContainer, e.g.
     <LiveModal w={480} h={520} render={(box) => (
       <WatchList contained portalContainer={box} onClosed={...} />
     )} />
─────────────────────────────────────────────────────────────── */

export function LiveModal({ w = 480, h = 520, scale, frameLabel, note, render, autoFit = true }) {
  const wrapRef = useRef(null);
  const boxRef = useRef(null);
  const [box, setBox] = useState(null);
  const [fit, setFit] = useState(scale || 1);
  const [instance, setInstance] = useState(0);   // bump to remount the modal
  const [closed, setClosed] = useState(false);

  useLayoutEffect(() => { setBox(boxRef.current); }, []);

  /* Scale down to fit the available column width (never up). A fixed
     `scale` prop wins when given. */
  useLayoutEffect(() => {
    if (scale) { setFit(scale); return undefined; }
    if (!autoFit) return undefined;
    const measure = () => {
      const host = wrapRef.current?.parentElement;
      if (!host) return;
      const avail = host.clientWidth;
      setFit(avail > 0 && avail < w ? Math.max(0.5, avail / w) : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current?.parentElement) ro.observe(wrapRef.current.parentElement);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [w, scale, autoFit]);

  const reopen = () => { setClosed(false); setInstance((n) => n + 1); };
  const onClosed = () => setClosed(true);
  const embedValue = useMemo(() => ({ container: box }), [box]);

  return (
    <div className="gb-livemodal" ref={wrapRef}>
      <div className="gb-livemodal-chrome">
        <span className="gb-ls-dot r" /><span className="gb-ls-dot y" /><span className="gb-ls-dot g" />
        <span className="gb-ls-chrome-label">{frameLabel || 'live · sample data'}</span>
      </div>
      <div className="gb-livemodal-stage" style={{ width: w * fit, height: h * fit }}>
        <div
          ref={boxRef}
          className="gb-livemodal-box"
          style={{ width: w, height: h, transform: `scale(${fit})`, transformOrigin: 'top left' }}
        >
          {box && !closed && (
            /* duration:0 makes every entrance animation instant — inside a
               portaled, transform-scaled stage framer-motion's mount springs
               can stall mid-flight (leaving rows faded). Snapping to the
               final state keeps the demo fully visible; click-driven
               interactions set their own transitions and still animate. */
            <MotionConfig transition={{ duration: 0 }}>
              <FloatingPanelEmbedContext.Provider value={embedValue}>
                <React.Fragment key={instance}>{render(box, onClosed)}</React.Fragment>
              </FloatingPanelEmbedContext.Provider>
            </MotionConfig>
          )}
        </div>
        {closed && (
          <button className="gb-livemodal-reopen" onClick={reopen}>
            <I.refresh size={14} /> Reopen demo
          </button>
        )}
      </div>
      {note && <div className="gb-ls-note">{note}</div>}
    </div>
  );
}
