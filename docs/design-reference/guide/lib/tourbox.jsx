/* ───────────────────────────────────────────────────────────────
   tourbox.jsx — a focused doc unit: a live snippet of UI paired
   side-by-side with the explanation for exactly that piece, so the
   words sit next to the thing they describe. Compose pages as a
   stack of these instead of one giant demo + distant prose.
   Exposed as window.TourBox + window.MiniFrame.
─────────────────────────────────────────────────────────────── */
(function () {
  const { I } = window.GB;
  const { useRef, useEffect, useState, useLayoutEffect } = React;

  /* A small framed surface to sit a live snippet on (popup-ish chrome).
     Auto-scales DOWN (never up) to fit its container so a fixed-width
     snippet can never overflow the window. Uses CSS `zoom` so the
     layout footprint shrinks too (no leftover overflow box). */
  function MiniFrame({ width, label, children, pad = true }) {
    const ref = useRef(null);
    const [zoom, setZoom] = useState(1);
    useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return undefined;
      const host = el.closest('.tourbox-live') || el.parentElement;
      const measure = () => {
        if (!host) return;
        const cs = getComputedStyle(host);
        const padX = parseFloat(cs.paddingLeft || 0) + parseFloat(cs.paddingRight || 0);
        const avail = host.clientWidth - padX;
        const w = typeof width === 'number' ? width : el.offsetWidth / (zoom || 1);
        setZoom(avail > 0 && avail < w ? Math.max(0.5, avail / w) : 1);
      };
      measure();
      const ro = new ResizeObserver(measure);
      if (host) ro.observe(host);
      window.addEventListener('resize', measure);
      return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [width]);
    return (
      <div className="tb-miniframe" ref={ref} style={{ width, zoom }}>
        {label && <div className="tb-miniframe-label">{label}</div>}
        <div className="tb-miniframe-body" style={{ padding: pad ? 14 : 0 }}>{children}</div>
      </div>
    );
  }

  function TourBox({ n, title, eyebrow, live, liveLabel, children, flip, wide, stack }) {
    return (
      <div className={`tourbox ${flip ? 'flip' : ''} ${wide ? 'wide' : ''} ${stack ? 'stack' : ''}`}>
        <div className="tourbox-doc">
          <div className="tourbox-docinner">
            {(n != null || eyebrow) && (
              <div className="tourbox-head">
                {n != null && <span className="tourbox-n">{n}</span>}
                {eyebrow && <span className="tourbox-eyebrow">{eyebrow}</span>}
              </div>
            )}
            <h3 className="tourbox-title">{title}</h3>
            <div className="tourbox-body">{children}</div>
          </div>
        </div>
        <div className="tourbox-live">
          <div className="tourbox-livewrap">
            {liveLabel && <div className="tourbox-livelabel">{I.cube({ size: 11 })} {liveLabel}</div>}
            {live}
          </div>
        </div>
      </div>
    );
  }

  window.TourBox = TourBox;
  window.MiniFrame = MiniFrame;

  /* TabbedTour — a tab strip over a set of TourBoxes (sibling tools). */
  function TabbedTour({ tabs }) {
    const { useState } = React;
    const [active, setActive] = useState(tabs[0].id);
    const cur = tabs.find((t) => t.id === active) || tabs[0];
    return (
      <div className="tabbedtour">
        <div className="tt-strip">
          {tabs.map((t) => (
            <button key={t.id} className={'tt-tab ' + (active === t.id ? 'on' : '')} onClick={() => setActive(t.id)}>
              {t.icon && <span className="tt-ico">{t.icon}</span>}{t.label}
            </button>
          ))}
        </div>
        <TourBox key={cur.id} eyebrow={cur.eyebrow} title={cur.title} live={cur.live} flip={cur.flip} wide={cur.wide} stack={cur.stack}>{cur.body}</TourBox>
      </div>
    );
  }
  window.TabbedTour = TabbedTour;
})();
