/* page-viewers-2.jsx — Image Viewer + 3D Golfball Viewer pages.
   Ported from ImagePreview.jsx / GolfballViewer.jsx. */
(function () {
  const { useState, useRef, useEffect } = React;
  const { I, Btn, Tag, Dot, Input } = window.GB;
  const { ViewToggle } = window.GBViewerShared;
  const TourBox = window.TourBox;
  const MiniFrame = window.MiniFrame;
  window.GBPages = window.GBPages || {};

  const PREVIEW_GRID = {
    backgroundColor: 'var(--gb-surface-canvas)',
    backgroundImage: 'linear-gradient(var(--gb-border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--gb-border-subtle) 1px, transparent 1px), linear-gradient(var(--gb-border-default) 1px, transparent 1px), linear-gradient(90deg, var(--gb-border-default) 1px, transparent 1px)',
    backgroundSize: '12px 12px, 12px 12px, 48px 48px, 48px 48px',
  };

  /* a vector "logo" used as the sample print (so no external asset needed) */
  function SampleLogo({ color = '#1b3a6b', size = 150 }) {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" style={{ display: 'block' }}>
        <circle cx="60" cy="60" r="54" fill="none" stroke={color} strokeWidth="4" />
        <path d="M38 78 L38 42 L60 64 L82 42 L82 78" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <text x="60" y="103" textAnchor="middle" fontFamily="var(--gb-font-mono)" fontSize="11" fontWeight="700" fill={color} letterSpacing="2">BRIGHTLINE</text>
      </svg>
    );
  }

  /* ============ IMAGE VIEWER ============ */
  const SWAP_COLORS = ['#1b3a6b', '#0e7a4b', '#b4313b', '#5a2d82', '#1a1a1a', '#c9851f'];
  function ImageViewerSnippet() {
    const [zoom, setZoom] = useState(1);
    const [rot, setRot] = useState(0);
    const [logoColor, setLogoColor] = useState('#1b3a6b');
    const [eyedrop, setEyedrop] = useState(false);
    const [aligning, setAligning] = useState(false);
    const drag = useRef({ on: false, x: 0, y: 0 });
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const clampZ = (z) => Math.max(0.5, Math.min(8, z));
    const reset = () => { setZoom(1); setRot(0); setPan({ x: 0, y: 0 }); };
    const onWheel = (e) => { e.preventDefault(); setZoom((z) => clampZ(z - Math.sign(e.deltaY) * 0.12)); };
    const onDown = (e) => { drag.current = { on: true, x: e.clientX - pan.x, y: e.clientY - pan.y }; };
    const onMove = (e) => { if (!drag.current.on) return; setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); };
    const onUp = () => { drag.current.on = false; };
    const ctrlBtn = { width: 28, height: 28, borderRadius: 'var(--gb-r-sm)', border: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', color: 'var(--gb-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
    return (
      <MiniFrame width={540} label="modal · Image preview" pad={false}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', borderBottom: '1px solid var(--gb-border-default)', background: 'var(--gb-fill-inverse-strong)' }}>
          <span style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.eye size={14} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>brightline-logo.png</div>
            <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>1200 × 1200 · PNG</div>
          </div>
          <ViewToggle value="2d" onChange={() => { window.location.hash = '#viewer-3d'; }} options={[{ id: '2d', label: '2D', icon: <I.eye size={11} /> }, { id: '3d', label: '3D', icon: <I.cube size={11} /> }]} />
        </div>
        {/* preview surface */}
        <div onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
          style={{ position: 'relative', height: 300, overflow: 'hidden', cursor: eyedrop ? 'crosshair' : drag.current.on ? 'grabbing' : 'grab', ...PREVIEW_GRID }}>
          {aligning && <div style={{ position: 'absolute', left: '50%', top: '50%', width: 160, height: 160, marginLeft: -80, marginTop: -80, borderRadius: '50%', border: '2px dashed var(--gb-brand-label)', pointerEvents: 'none', zIndex: 2, opacity: 0.7 }} />}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rot}deg) scale(${zoom})`, transition: drag.current.on ? 'none' : 'transform .18s cubic-bezier(.25,.8,.25,1)' }}>
              <SampleLogo color={logoColor} size={150} />
            </div>
          </div>
          {/* zoom chip */}
          <div style={{ position: 'absolute', left: 10, bottom: 10, fontSize: 10.5, fontFamily: 'var(--gb-font-mono)', fontWeight: 700, color: 'var(--gb-text-secondary)', background: 'var(--gb-tooltip-bg)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-pill)', padding: '3px 9px' }}>{Math.round(zoom * 100)}%</div>
          {eyedrop && <div style={{ position: 'absolute', left: 10, top: 10, fontSize: 10.5, fontWeight: 700, color: 'var(--gb-brand-label)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', borderRadius: 'var(--gb-r-pill)', padding: '3px 9px' }}>Click a color to sample</div>}
          {/* zoom controls */}
          <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <button style={ctrlBtn} onClick={() => setZoom((z) => clampZ(z + 0.25))}><I.plus size={13} /></button>
            <button style={ctrlBtn} onClick={() => setZoom((z) => clampZ(z - 0.25))}><span style={{ fontSize: 16, lineHeight: 1 }}>−</span></button>
            <button style={ctrlBtn} onClick={reset} title="Reset"><I.refresh size={12} /></button>
          </div>
        </div>
        {/* color swap row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)' }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Recolor logo</span>
          <div style={{ display: 'flex', gap: 5 }}>
            {SWAP_COLORS.map((c) => { const on = logoColor === c; return <button key={c} onClick={() => setLogoColor(c)} title={c} style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer', border: '2px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), boxShadow: on ? '0 0 0 2px var(--gb-brand-tint-medium)' : 'none' }} />; })}
          </div>
          <button onClick={() => setEyedrop((v) => !v)} title="Eyedropper" style={{ width: 26, height: 26, borderRadius: 'var(--gb-r-sm)', border: '1px solid ' + (eyedrop ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: eyedrop ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-2)', color: eyedrop ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 22l1-4 11-11 3 3L6 21l-4 1zM15 5l3-3a2 2 0 0 1 3 3l-3 3" /></svg>
          </button>
        </div>
        {/* footer actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 13px', borderTop: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)' }}>
          <button onClick={() => setRot((r) => r - 90)} style={ctrlBtn}><I.refresh size={12} style={{ transform: 'scaleX(-1)' }} /></button>
          <Btn size="sm" variant={aligning ? 'tinted' : 'secondary'} status="brand" onClick={() => setAligning((v) => !v)}>{aligning ? 'Done aligning' : 'Align'}</Btn>
          <div style={{ flex: 1 }} />
          <Btn size="sm" variant="ghost" icon={<I.copy size={11} />}>Copy URL</Btn>
          <Btn size="sm" variant="ghost" icon={<I.send size={11} />}>Submit Proof</Btn>
          <Btn size="sm" variant="tinted" status="brand" icon={<I.bolt size={11} />}>Download</Btn>
        </div>
      </MiniFrame>
    );
  }

  function ImageViewerPage() {
    return (
      <div className="prose">
        <div className="eyebrow">On-page Helpers</div>
        <h1 className="title">Image Viewer</h1>
        <p className="lede">A full logo / artwork inspector that opens over any image on the page. Zoom and pan to check print detail, rotate and align a crop, recolor a one-color logo on the fly, then download it, copy its URL, or hand it straight to Submit Proof — all without downloading the file and opening Photoshop.</p>

        <TourBox stack title="Inspect, recolor, and align artwork" live={<ImageViewerSnippet />} eyebrow="any image · logo preview">
          <p>The preview sits on a graph-paper surface so you can judge alignment. <strong>Scroll to zoom</strong> (50%–800%), <strong>drag to pan</strong>, and use the corner controls for precise <strong>+ / − / reset</strong>. The live percentage chip shows your zoom.</p>
          <p><strong>Recolor logo</strong> swaps a one-color print to any swatch — or use the <strong>eyedropper</strong> to sample an exact color off the image (with a tolerance so anti-aliased edges come along). <strong>Align</strong> drops a centered ring and unlocks free rotation/pan so you can park a logo dead-center for proofing. Then <strong>Download</strong>, <strong>Copy URL</strong>, or <strong>Submit Proof</strong>. Try it — every control above is live.</p>
        </TourBox>

        <h2 className="sec">Every control</h2>
        <table className="spectable">
          <thead><tr><th>Control</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><b>Scroll / + − reset</b></td><td>Zoom 50%–800%; reset returns to 100% centered.</td></tr>
            <tr><td><b>Drag</b></td><td>Pan the image within the frame.</td></tr>
            <tr><td><b>Rotate / Align</b></td><td>Rotate in 90° steps, or enter Align mode for a centered ring + free rotation to dial in a crop.</td></tr>
            <tr><td><b>Recolor + Eyedropper</b></td><td>Replace a logo color from swatches, or sample a precise color off the artwork (RGB tolerance catches edges).</td></tr>
            <tr><td><b>2D / 3D toggle</b></td><td>Flip to the <a href="#viewer-3d">3D Golfball Viewer</a> to see the print wrapped on a ball.</td></tr>
            <tr><td><b>Copy URL / Download / Submit Proof</b></td><td>Grab the link, save the (recolored) PNG, or send it to the proofing flow.</td></tr>
          </tbody>
        </table>
        <div className="docnote brand">
          <span className="dn-ico">{I.bolt({ size: 15 })}</span>
          <div className="dn-b"><div className="dn-t">Drop in your own</div><p style={{ margin: 0 }}>You can <strong>drag an image file</strong> onto the preview to swap it in — handy for checking a customer-emailed logo against the order without re-uploading anywhere. Color swaps and alignment then apply to the dropped file.</p></div>
        </div>
      </div>
    );
  }

  /* ============ 3D GOLFBALL VIEWER ============ */
  function GolfBall3D({ rot, zoom, logoColor, dragging }) {
    // CSS-shaded sphere with a decal patch that rotates with the ball.
    const size = 200 * zoom;
    const decalShift = Math.max(-1, Math.min(1, rot.y / 90)); // -1..1 as it spins
    const decalVisible = Math.cos((rot.y * Math.PI) / 180); // hide when facing away
    return (
      <div style={{ position: 'relative', width: size, height: size, transition: dragging ? 'none' : 'width .2s, height .2s' }}>
        {/* ball */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle at ${38 + rot.y * 0.15}% ${32 + rot.x * 0.15}%, #ffffff 0%, #f0f1f3 32%, #cfd2d8 66%, #9aa0aa 100%)`, boxShadow: 'inset -18px -22px 44px rgba(0,0,0,.32), inset 12px 14px 30px rgba(255,255,255,.55), 0 24px 50px rgba(0,0,0,.45)', overflow: 'hidden' }}>
          {/* dimples */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundImage: 'radial-gradient(circle, rgba(0,0,0,.10) 1.3px, transparent 1.6px)', backgroundSize: `${13 * zoom}px ${13 * zoom}px`, opacity: 0.7, mixBlendMode: 'multiply' }} />
          {/* decal */}
          <div style={{ position: 'absolute', left: '50%', top: '42%', transform: `translate(-50%,-50%) translateX(${decalShift * size * 0.34}px) scaleX(${Math.abs(decalVisible)})`, opacity: decalVisible > 0.08 ? decalVisible : 0, transition: dragging ? 'none' : 'all .1s', pointerEvents: 'none' }}>
            <SampleLogo color={logoColor} size={size * 0.42} />
          </div>
          {/* specular */}
          <div style={{ position: 'absolute', left: '26%', top: '20%', width: '26%', height: '20%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.9), transparent 70%)', filter: 'blur(2px)' }} />
        </div>
      </div>
    );
  }
  function GolfViewerSnippet() {
    const [rot, setRot] = useState({ x: -8, y: 18 });
    const [zoom, setZoom] = useState(1);
    const [logoColor, setLogoColor] = useState('#1b3a6b');
    const [scene, setScene] = useState('room');
    const [throwMode, setThrow] = useState(false);
    const drag = useRef({ on: false, x: 0, y: 0, rx: 0, ry: 0 });
    const onDown = (e) => { drag.current = { on: true, x: e.clientX, y: e.clientY, rx: rot.x, ry: rot.y }; };
    const onMove = (e) => { if (!drag.current.on) return; setRot({ x: Math.max(-60, Math.min(60, drag.current.rx + (e.clientY - drag.current.y) * 0.4)), y: drag.current.ry + (e.clientX - drag.current.x) * 0.5 }); };
    const onUp = () => { drag.current.on = false; };
    const onWheel = (e) => { e.preventDefault(); setZoom((z) => Math.max(0.5, Math.min(2.2, z - Math.sign(e.deltaY) * 0.1))); };
    const SCENES = { room: { bg: 'var(--gb-surface-canvas)', label: 'Studio room' }, course: { bg: 'linear-gradient(180deg, #6ea8d8 0%, #a9d0e8 45%, #5a8f३b 46%, #3f7a2e 100%)'.replace('३', '3'), label: 'Golf course' }, sunset: { bg: 'linear-gradient(180deg, #2a2350 0%, #7a4a6b 50%, #d98a5a 100%)', label: 'Sunset' } };
    const chip = (on) => ({ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 'var(--gb-r-pill)', border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-surface-1)', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });
    return (
      <MiniFrame width={520} label="modal · 3D golfball viewer" pad={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderBottom: '1px solid var(--gb-border-default)', background: 'var(--gb-fill-inverse-strong)' }}>
          <span style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.cube size={14} /></span>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Logo on Tour Soft</div><div style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>drag to rotate · scroll to zoom</div></div>
          <ViewToggle value="3d" onChange={() => { window.location.hash = '#viewer-image'; }} options={[{ id: '2d', label: '2D', icon: <I.eye size={11} /> }, { id: '3d', label: '3D', icon: <I.cube size={11} /> }]} />
        </div>
        <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onWheel={onWheel}
          style={{ position: 'relative', height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: drag.current.on ? 'grabbing' : 'grab', overflow: 'hidden', background: SCENES[scene].bg, userSelect: 'none' }}>
          {scene === 'room' && <div style={{ position: 'absolute', inset: 0, ...PREVIEW_GRID, opacity: 0.5 }} />}
          <GolfBall3D rot={rot} zoom={zoom} logoColor={logoColor} dragging={drag.current.on} />
          {/* scene chips */}
          <div style={{ position: 'absolute', left: 10, top: 10, display: 'flex', gap: 5 }}>
            {Object.entries(SCENES).map(([k, v]) => <button key={k} onClick={() => setScene(k)} style={chip(scene === k)}>{v.label}</button>)}
          </div>
          {/* throw chip */}
          <button onClick={() => setThrow((v) => !v)} style={{ ...chip(throwMode), position: 'absolute', right: 10, top: 10 }}><I.bolt size={11} /> {throwMode ? 'Gravity on' : 'Throw mode'}</button>
          <div style={{ position: 'absolute', left: 10, bottom: 10, fontSize: 10.5, fontFamily: 'var(--gb-font-mono)', fontWeight: 700, color: 'var(--gb-text-primary)', background: 'var(--gb-tooltip-bg)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-pill)', padding: '3px 9px' }}>{Math.round(zoom * 100)}%</div>
        </div>
        {/* controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', borderTop: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)' }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Logo color</span>
          <div style={{ display: 'flex', gap: 5 }}>
            {SWAP_COLORS.map((c) => { const on = logoColor === c; return <button key={c} onClick={() => setLogoColor(c)} style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer', border: '2px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)') }} />; })}
          </div>
          <div style={{ flex: 1 }} />
          <Btn size="sm" variant="secondary" icon={<I.refresh size={11} />} onClick={() => { setRot({ x: -8, y: 18 }); setZoom(1); setThrow(false); }}>Reset view</Btn>
          <Btn size="sm" variant="tinted" status="brand" icon={<I.bolt size={11} />}>Snapshot</Btn>
        </div>
      </MiniFrame>
    );
  }

  function Golf3DPage() {
    return (
      <div className="prose">
        <div className="eyebrow">On-page Helpers</div>
        <h1 className="title">3D Golfball Viewer</h1>
        <p className="lede">See a customer's logo wrapped onto an actual golf ball, in 3D, before a single ball is printed. Reached from the <a href="#viewer-image">Image Viewer's</a> 2D/3D toggle, it projects the aligned print onto a real ball model you can spin, zoom, recolor, drop into different scenes — and even bounce around for fun.</p>

        <TourBox stack title="Spin the ball, check the print" live={<GolfViewerSnippet />} eyebrow="three.js · decal on a real ball model">
          <p><strong>Drag to rotate</strong> the ball in any direction and <strong>scroll to zoom</strong> — the decal is projected onto the surface, so it curves and disappears around the back just like real printing. Swap the <strong>logo color</strong> live, change the <strong>scene</strong> (studio room, course, sunset — the real viewer loads HDRI environments), and grab a <strong>Snapshot</strong> PNG for a proof. Give it a spin above.</p>
        </TourBox>

        <div className="docnote info">
          <span className="dn-ico">{I.cube({ size: 15 })}</span>
          <div className="dn-b"><div className="dn-t">About this demo</div><p style={{ margin: 0 }}>The shipping viewer is a full <strong>three.js</strong> scene — a 4.7&nbsp;MB ball model with a projected decal, soft multi-light rig, and real HDRI environments, dynamically loaded the first time you open 3D. The demo above is a faithful <em>representation</em> of its controls and behavior (rotate, zoom, recolor, scenes, snapshot) without shipping the heavy engine into this guide.</p></div>
        </div>

        <h2 className="sec">Controls &amp; modes</h2>
        <table className="spectable">
          <thead><tr><th>Control</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><b>Drag</b></td><td>Orbit / rotate the ball to inspect the print from any angle.</td></tr>
            <tr><td><b>Scroll</b></td><td>Zoom the ball in and out (orbit-controls zoom).</td></tr>
            <tr><td><b>Logo color</b></td><td>Recolor the projected decal live.</td></tr>
            <tr><td><b>Scene</b></td><td>Swap the studio room for an HDRI environment (course, sunset, …) for realistic lighting.</td></tr>
            <tr><td><b>Throw mode</b></td><td>A physics easter-egg: disables orbit so a drag <em>throws</em> the ball, which bounces off the walls under gravity. Toggle it back off to settle the ball home.</td></tr>
            <tr><td><b>Snapshot</b></td><td>Capture a square, transparent PNG of the ball at its current angle — drops straight into a proof.</td></tr>
          </tbody>
        </table>
        <div className="docnote brand">
          <span className="dn-ico">{I.bolt({ size: 15 })}</span>
          <div className="dn-b"><div className="dn-t">From flat art to a believable mockup</div><p style={{ margin: 0 }}>Pair this with the <a href="#viewer-image">Image Viewer's</a> align + recolor and the <a href="#catalog">Grass Mockup Composer</a> to turn a customer's flat logo file into a photoreal "here's what you're getting" image — without art software.</p></div>
        </div>
      </div>
    );
  }

  window.GBPages['viewer-image'] = { title: 'Image Viewer', group: 'On-page Helpers', icon: 'eye', render: () => <ImageViewerPage /> };
  window.GBPages['viewer-3d'] = { title: '3D Golfball Viewer', group: 'On-page Helpers', icon: 'cube', render: () => <Golf3DPage /> };
})();
