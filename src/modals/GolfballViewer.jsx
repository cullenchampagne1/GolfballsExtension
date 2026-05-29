import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useDevSetting, useDevSettings } from '../lib/devSettings.js';
import { LiquidDrawer } from '../ui/components/LiquidDrawer.jsx';
import { ColorPickerPopover } from '../ui/components/ColorPicker.jsx';

/* ───────────────────────────────────────────────────────────────
   GolfballViewer — Three.js scene that renders a golf ball with
   an image projected onto its top pole as a decal.

   ALL of Three.js (core + OBJLoader + OrbitControls + DecalGeometry)
   is dynamic-imported the first time this component mounts, so the
   ~600KB engine + 4.7MB model don't weigh down the playground
   bundle. First mount shows a spinner while loading; subsequent
   mounts reuse the cached module + parsed model.

   Public props:
     decalDataUrl   data: URL (or any image URL) to paint as the decal
     onError        optional callback if loading fails

   The viewer:
     • White Lambert-shaded sphere/ball
     • Single decal projected from above the top pole
     • Orbit controls (drag to rotate, wheel to zoom)
     • Soft hemisphere + directional lighting so the decal reads
   Off-white pixels in the decal source paint as white on the ball;
   we don't try to color-match the ball surface here because the
   user's cropped image is already on a white surface (the alignment
   ring sits over a white canvas).
─────────────────────────────────────────────────────────────── */

// Module-level cache so opening 3D view multiple times in one session
// doesn't refetch / reparse the OBJ. Three.js itself is cached by the
// dynamic import system; we just need our own cache for the parsed
// model geometry. Lazy-initialized on first mount.
const cache = {
  three: null,           // resolved { THREE, OBJLoader, DecalGeometry, CANNON }
  modelPromise: null,    // in-flight or resolved Promise<THREE.Mesh>
};

async function loadThreeAndModel() {
  if (cache.three && cache.modelPromise) {
    return { ...cache.three, model: await cache.modelPromise };
  }
  // Parallel-load engine + helpers + model so first-mount latency is
  // dominated by whichever is slowest, not the sum. cannon-es is
  // pulled in here too so throw mode has zero extra wait when toggled.
  const [THREE, { OBJLoader }, { DecalGeometry }, { EXRLoader }, CANNON] = await Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/OBJLoader.js'),
    import('three/examples/jsm/geometries/DecalGeometry.js'),
    import('three/examples/jsm/loaders/EXRLoader.js'),
    import('cannon-es'),
  ]);
  cache.three = { THREE, OBJLoader, DecalGeometry, EXRLoader, CANNON };

  // Kick off the model fetch+parse exactly once. The OBJ is web-
  // accessible so chrome.runtime.getURL gives a load-anywhere URL.
  if (!cache.modelPromise) {
    const url = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
      ? chrome.runtime.getURL('assets/golfball_model/Golf_ball.obj')
      : 'assets/golfball_model/Golf_ball.obj';
    cache.modelPromise = new Promise((resolve, reject) => {
      const loader = new OBJLoader();
      loader.load(
        url,
        // OBJLoader returns a Group; we flatten to the first Mesh so
        // the decal projection has a single target geometry.
        (group) => {
          let foundMesh = null;
          group.traverse((child) => { if (!foundMesh && child.isMesh) foundMesh = child; });
          if (!foundMesh) { reject(new Error('OBJ contains no mesh')); return; }
          // Make sure normals exist (required by DecalGeometry).
          foundMesh.geometry.computeVertexNormals();
          resolve(foundMesh);
        },
        undefined,
        (err) => reject(err),
      );
    });
  }
  const model = await cache.modelPromise;
  return { ...cache.three, model };
}

/* HDRI scene registry — one entry per scene. Add a row, drop the
   matching .exr in /assets, and the drawer picks it up automatically.
   `icon` is the glyph component used in the drawer chip; `file` is
   the manifest-listed web-accessible resource path. */
export const SCENES = [
  { key: 'goldenGate',  label: 'Golden Gate hills', file: 'assets/golden_gate_hills_4k.exr', icon: 'bridge' },
  { key: 'sunsetFairway', label: 'Sunset fairway',   file: 'assets/sunset_fairway_4k.exr',   icon: 'sunset' },
  { key: 'lilienstein', label: 'Lilienstein',       file: 'assets/lilienstein_4k.exr',      icon: 'mountain' },
  { key: 'moonlitGolf', label: 'Moonlit golf',      file: 'assets/moonlit_golf_4k.exr',     icon: 'moon' },
];

export const GolfballViewer = React.forwardRef(function GolfballViewer({ decalDataUrl, onError, onSceneChange, onThrowChange }, ref) {
  const containerRef = useRef(null);
  // Imperative snapshot handle — set by the WebGL effect once the
  // scene is ready. Parent calls snapshotRef.current() to capture a
  // square, transparent PNG of the ball at its current rotation.
  const snapshotRef = useRef(null);
  // Imperative bomb-drop handle. Parent passes the cursor's CSS
  // viewport coords (clientX/clientY); the viewer raycasts those
  // into world space and spawns a bomb mesh at the back wall (Z
  // plane) so it lands visibly inside the room.
  const dropBombRef = useRef(null);
  // Hit test — is a CSS point inside the live 3D canvas? Lets the
  // parent decide whether the drop happened over the viewer.
  const containsPointRef = useRef(null);
  // Ball-pit spawner: hold-to-spawn colored physics balls from cursor.
  const spawnBallAtRef = useRef(null);   // ({clientX,clientY}) — spawn one ball now
  const spawnBallActiveRef = useRef(false); // true while the button is held
  // Confetti rain: toggle on/off, reactive to explosions.
  const confettiActiveRef = useRef(false);
  const setConfettiRef = useRef(null);   // (bool) — turn rain on/off
  // Water pour: hold to fill, release to stop. Level persists.
  const waterActiveRef = useRef(false);
  const pourWaterAtRef = useRef(null);   // ({clientX,clientY}) — set pour position
  // Cursor-push: when set to a non-null {clientX,clientY}, the render
  // loop raycasts to the water plane each frame and subtracts a Gaussian
  // bump from the heightfield centered at the hit point — "finger pressed
  // into water". null = no push. Setting to null releases the depression
  // and the wave equation closes it back up naturally.
  const pushWaterAtRef = useRef(null);
  const drainWaterRef  = useRef(null);   // () — drain all water instantly
  // Clear every item in the room (bombs, balls, confetti, water,
  // particles) but leave the main ball untouched. Called when the
  // user closes the fun menu OR enters a scene.
  const clearRoomItemsRef = useRef(null);
  // Ball-explode effect: explodeBallAt fires the burst (hides the
  // ball mesh, spawns shards flying outward + a particle puff);
  // reassembleBall plays the reverse — shards ease back to their
  // home seats and the ball re-shows when the last one lands.
  const explodeBallAtRef = useRef(null);   // ({clientX,clientY}) — burst from ball center
  const reassembleBallRef = useRef(null);  // () — tween shards home, restore ball
  // MutationObserver that watches the document element for theme
  // changes and rebakes wall textures. Held on a ref so the
  // effect's teardown can disconnect it across re-runs.
  const themeObserverRef = useRef(null);
  // Manual override for the key/rim light tint. null = follow the
  // current theme's auto-balanced default; a hex string forces both
  // lights to that color so the user can color the ball at will. The
  // applyLightingRef setter is wired up by the WebGL effect once the
  // lights exist; the React state drives the picker UI.
  const [lightColor, setLightColor] = useState(null);
  const lightColorRef = useRef(null);
  useEffect(() => { lightColorRef.current = lightColor; }, [lightColor]);
  const applyLightingRef = useRef(null);
  useEffect(() => { applyLightingRef.current?.(); }, [lightColor]);
  React.useImperativeHandle(ref, () => ({
    snapshot: (...args) => snapshotRef.current?.(...args),
    dropBomb: (...args) => dropBombRef.current?.(...args),
    containsPoint: (...args) => containsPointRef.current?.(...args),
    spawnBallAt: (...args) => spawnBallAtRef.current?.(...args),
    get spawnBallActive() { return spawnBallActiveRef.current; },
    set spawnBallActive(v) { spawnBallActiveRef.current = v; },
    setConfetti: (v) => setConfettiRef.current?.(v),
    get waterActive() { return waterActiveRef.current; },
    set waterActive(v) { waterActiveRef.current = v; },
    pourWaterAt: (...args) => pourWaterAtRef.current?.(...args),
    pushWaterAt: (...args) => pushWaterAtRef.current?.(...args),
    drainWater: () => drainWaterRef.current?.(),
    clearRoomItems: () => clearRoomItemsRef.current?.(),
    explodeBallAt: (...args) => explodeBallAtRef.current?.(...args),
    reassembleBall: () => reassembleBallRef.current?.(),
  }), []);
  // 'loading' until Three.js + the model finish; then 'ready'. 'error'
  // surfaces a basic message instead of an empty canvas.
  const [status, setStatus] = useState('loading');
  // (Underwater tint is now a real WebGL pass — see the underwaterQuad
  // in the scene setup below. The old React state + DOM-overlayed div
  // for clipping a blue gradient at waterLineTop has been removed.)
  // Debug HUD is gated behind a developer setting (default off). When
  // off, the render loop also skips publishing snapshot state so we
  // avoid the ~10Hz React re-renders entirely. Mirror the flag to a
  // ref so the long-lived render closure can read it live without
  // forcing the WebGL effect to tear down on every toggle.
  const debugEnabled = !!useDevSetting('golfballViewer.showDebugHud');
  const debugEnabledRef = useRef(debugEnabled);
  useEffect(() => { debugEnabledRef.current = debugEnabled; }, [debugEnabled]);
  const [debug, setDebug] = useState(null);
  const [debugCopied, setDebugCopied] = useState(false);
  // Throw mode — toggled by the in-frame chip button. When on:
  //   • OrbitControls are disabled so drag = throw, not orbit
  //   • The render loop integrates ball velocity + angular velocity
  //   • Walls bounce the ball back inward (4-wall x/y box)
  // Mirrored to a ref so the long-lived render closure picks up
  // changes without re-running the WebGL init effect.
  const [throwMode, setThrowMode] = useState(false);
  const throwModeRef = useRef(false);
  useEffect(() => { throwModeRef.current = throwMode; }, [throwMode]);
  // Surface throwMode to the parent (ImagePreview) so it can show /
  // hide the fun menu in sync with gravity.
  useEffect(() => { onThrowChange?.(throwMode); }, [throwMode, onThrowChange]);
  // Scene mode — swaps the room for an HDRI environment. The state
  // holds the active scene's KEY (one of SCENES below) or null when
  // the user is in the room. Mutually exclusive with throw mode and
  // with bomb drops (dropBomb no-ops while a scene is active). When
  // the user clicks the same scene chip again it goes back to null;
  // clicking a DIFFERENT scene chip swaps to that scene without
  // returning to the room first. Ball pose carries through unchanged.
  const [sceneKey, setSceneKey] = useState(null);
  const sceneKeyRef = useRef(null);
  useEffect(() => { sceneKeyRef.current = sceneKey; }, [sceneKey]);
  // Flipping into a scene forces gravity off — they're mutually exclusive.
  useEffect(() => { if (sceneKey && throwMode) setThrowMode(false); }, [sceneKey, throwMode]);
  // Notify the parent (ImagePreview) so it can hide the fun menu /
  // bomb drawer while the user is in an HDRI scene.
  useEffect(() => { onSceneChange?.(sceneKey); }, [sceneKey, onSceneChange]);
  // Clear stale snapshot the moment the flag flips off so the HUD
  // doesn't linger with its last reading.
  useEffect(() => { if (!debugEnabled) setDebug(null); }, [debugEnabled]);

  // Camera is fixed (straight-on, floor at the bottom edge). The
  // remaining tunables are the BALL — initial scale + Euler rotation —
  // driven from Developer Settings so the team can dial in default
  // framing per-install. Snapshotted once into a ref at mount; future
  // toggles affect the next 3D-view open, not the live scene.
  const [dev] = useDevSettings();
  const initialBallRef = useRef(null);
  if (!initialBallRef.current) {
    const deg = (k, fallback) => (Number(dev[k] ?? fallback) * Math.PI) / 180;
    initialBallRef.current = {
      scale: Number(dev['golfballViewer.ballScale'] ?? 1),
      rotX: deg('golfballViewer.ballRotX', 0),
      rotY: deg('golfballViewer.ballRotY', 0),
      rotZ: deg('golfballViewer.ballRotZ', 0),
    };
  }

  useEffect(() => {
    let disposed = false;
    let renderer, scene, camera, ballMesh, decalMesh, ballGroup, animationId;
    let world, ballBody;  // cannon-es physics world + sphere body
    const wallMeshes = []; // populated after wall construction; used by snapshot() to hide chrome
    const objectsToDispose = [];
    const mountStart = performance.now();
    const MIN_LOADING_MS = 2000;

    /* Box bounds in world units — defines the 3D play area. Sized
       to roughly fill the camera viewport (480 units away, 40° FOV)
       so the user is looking INTO a room rather than at a small box
       floating in space. The ball radius is 100; the box has to be
       comfortably larger on every axis or the ball clips through. */
    const HALF_X = 260;
    const HALF_Y = 175;
    const HALF_Z = 180;
    const SCALE_MIN = 0.4;
    const SCALE_MAX = 2.5;
    const ROTATE_SENSITIVITY = 0.008;  // radians per CSS px of drag
    const THROW_SCALE = 0.55;
    const MAX_THROW_SPEED = 1500;

    /* Closure-scoped state. The two modes share these but use them
       differently:

         normal mode (throwMode=false):
           • drag rotates the ballGroup in place via quaternion deltas
           • wheel scales the ballGroup
           • physics world is NOT stepped — ball sits at origin

         throw mode (throwMode=true):
           • physics world IS stepped each frame
           • drag = grab the cannon body (kinematic-ish) + capture
             velocity; release re-enables dynamic body with that velocity
           • wheel still scales (cosmetic — also resizes the physics
             sphere shape so collisions match) */
    const state = {
      // Initial scale comes from the dev-settings snapshot so the
      // team can set a baseline ball size per-install. Wheel still
      // overrides during use.
      scale: initialBallRef.current.scale,
      dragging: false,
      dragStart: { px: 0, py: 0, wx: 0, wy: 0 },
      history: [],
      lastMode: false,
      lastSceneKey: null,
      // Active "return to rest" tween. Populated when gravity flips
      // off so the ball slides + rotates + rescales smoothly back to
      // its default position/orientation/scale instead of snapping.
      // Shape: { start, dur, fromPos, fromQuat, fromScale, toPos,
      //          toQuat, toScale }. null when no tween is in flight.
      returnTween: null,
    };

    (async () => {
      try {
        const { THREE, DecalGeometry, EXRLoader, CANNON, model } = await loadThreeAndModel();
        if (disposed) return;
        const container = containerRef.current;
        if (!container) return;

        // ── Scene setup ────────────────────────────────────────
        scene = new THREE.Scene();
        // No background — transparent renderer lets the grid show through
        // around the ball. Matches the playground's design-canvas vibe.

        const { clientWidth: w, clientHeight: h } = container;
        // Camera fixed straight-on at the room's center — no Y offset,
        // no downward tilt. The floor wall (y = -HALF_Y) therefore
        // projects as a horizontal line at the bottom edge of the
        // panel instead of receding diagonally. The print decal sits
        // on the +Z face of the ball, directly facing the camera.
        camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 2000);
        camera.position.set(0, 0, 520);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(w, h);
        renderer.setClearColor(0x000000, 0);   // fully transparent clear
        // Shadow mapping — enabled so the key light can drop a soft
        // shadow under the ball as it moves around the room. PCFSoft
        // gives a smooth penumbra without the hard pixel stair-step
        // of basic shadow maps.
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        // ── Lighting ───────────────────────────────────────────
        // Four-light rig sized for the ball:
        //   • hemisphere — sky/ground fill so shadowed dimples never
        //     go pitch black; warm sky tint + cool ground tint reads
        //     more "real" than a flat grey
        //   • key — main directional from upper-left-front, casts the
        //     shadow onto the floor/walls
        //   • fill — cooler counter-bounce from the opposite side so
        //     the dark side of the ball still shows form
        //   • rim — small specular accent from behind to separate
        //     the ball silhouette from the back wall
        //
        // Sky/ground/key/fill/rim values flip with the document theme
        // so the ball reads well on every surface (dark variants get
        // a cool moody rig; light/cream get a warmer, slightly punchier
        // one so the ball doesn't gray out against bright canvas).
        // Applied via applyLighting() so theme observer + manual
        // override (lightColorRef) can both drive the same path.
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
        scene.add(hemiLight);
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
        keyLight.position.set(180, 240, 220);
        keyLight.castShadow = true;
        // Orthographic shadow camera tuned to the room bounds so the
        // ball's shadow has enough resolution and doesn't get clipped
        // when the ball is at a far corner.
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.camera.near = 50;
        keyLight.shadow.camera.far = 900;
        keyLight.shadow.camera.left   = -HALF_X * 1.4;
        keyLight.shadow.camera.right  =  HALF_X * 1.4;
        keyLight.shadow.camera.top    =  HALF_Y * 1.4;
        keyLight.shadow.camera.bottom = -HALF_Y * 1.4;
        keyLight.shadow.bias = -0.0008;
        keyLight.shadow.radius = 6;        // PCFSoft blur radius
        scene.add(keyLight);
        const fill = new THREE.DirectionalLight(0xb8d4ff, 0.55);
        fill.position.set(-200, -60, 120);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffffff, 0.6);
        rim.position.set(0, 80, -300);
        scene.add(rim);

        /* Per-theme rig presets — sky/ground hemisphere tints + key
           and rim default colors + per-light intensities. Light
           variants need a warmer key (so the ball doesn't read as a
           gray disc against bright canvas) and a brighter hemisphere
           to fill the dimple shadows; dark variants stay cool. */
        const LIGHT_PRESETS = {
          dark:     { sky: 0xfff4e5, ground: 0x2a3340, hemi: 0.65, key: 0xffffff, keyI: 1.60, fillI: 0.55, rim: 0xffffff, rimI: 0.60 },
          midnight: { sky: 0xeaf0ff, ground: 0x1a1f2e, hemi: 0.55, key: 0xeef2ff, keyI: 1.50, fillI: 0.60, rim: 0xc8d4ff, rimI: 0.55 },
          light:    { sky: 0xffffff, ground: 0xe8eaf0, hemi: 1.05, key: 0xfff2dc, keyI: 1.85, fillI: 0.45, rim: 0xfff0d0, rimI: 0.75 },
          cream:    { sky: 0xfff8ed, ground: 0xf0e6d4, hemi: 1.00, key: 0xffe9c2, keyI: 1.80, fillI: 0.40, rim: 0xffe2b0, rimI: 0.80 },
        };

        /* Apply the active theme preset, optionally overridden by a
           manual key/rim color (lightColorRef). Called at init, on
           every theme mutation (via the existing observer), and from
           the React effect that watches lightColor state. Idempotent
           — safe to call repeatedly. HDRI scene mode zeroes the
           intensities elsewhere; we only write colors/intensities for
           room mode here so the scene path keeps full control. The
           walls are emissive-mapped (MeshBasicMaterial-equivalent) so
           they intentionally do NOT pick up any tint — only the ball
           reacts. */
        const applyLighting = () => {
          if (sceneKeyRef.current) return; // HDRI scene owns lighting
          const variant = document.documentElement.dataset.theme || 'dark';
          const p = LIGHT_PRESETS[variant] || LIGHT_PRESETS.dark;
          hemiLight.color.setHex(p.sky);
          hemiLight.groundColor.setHex(p.ground);
          hemiLight.intensity = p.hemi;
          const override = lightColorRef.current;
          keyLight.color.set(override || p.key);
          keyLight.intensity = p.keyI;
          rim.color.set(override || p.rim);
          rim.intensity = p.rimI;
          fill.intensity = p.fillI;
        };
        applyLighting();
        applyLightingRef.current = applyLighting;

        // ── Room walls ─────────────────────────────────────────
        // 5 inward-facing planes form the room; the 6th (front) is
        // omitted so the user can see in. Each wall uses a per-wall
        // baked CanvasTexture: flat surface color + the playground
        // grid + a vignette of soft inward shadows along the edges.
        //
        // We bake the shadows into the texture (instead of letting
        // scene lights cast them) so the wall fills stay the EXACT
        // background color — no global darkening — and only the
        // edges/seams pick up shading. The material is therefore
        // MeshBasicMaterial (no lighting) so nothing dims the fill.
        {
          /* Bake a wall texture sized to the wall's actual aspect
             ratio so the grid stays square + the edge vignette
             reads symmetrically. The base color matches the
             playground background; the grid is the same 16/64 spacing
             as the playground page; the vignette uses 4 directional
             linear gradients (one per edge) that fall off from
             opaque-dark at the edge to fully transparent ~22% of the
             way in. Result: walls visually disappear into the
             background and only the corners catch shadow.

             Reads design tokens FROM THE LIVE DOCUMENT on every call
             (not at outer scope) so rebakeWalls() picks up the new
             theme after the user flips themes. */
          function makeWallTexture(widthWU, heightWU) {
            const cs = getComputedStyle(document.documentElement);
            const surface = cs.getPropertyValue('--gb-surface-canvas').trim() || '#0e0f10';
            const minor = cs.getPropertyValue('--gb-border-subtle').trim() || '#1a1c1f';
            const major = cs.getPropertyValue('--gb-border-default').trim() || '#26292d';

            // Texture resolution: 4 px per world unit, capped, so big
            // walls don't blow out the upload size.
            const PXPU = 3;
            const w = Math.min(2048, Math.max(256, Math.round(widthWU * PXPU)));
            const h = Math.min(2048, Math.max(256, Math.round(heightWU * PXPU)));
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const ctx = cv.getContext('2d');

            // Fill — exact background color, no darkening
            ctx.fillStyle = surface;
            ctx.fillRect(0, 0, w, h);

            // Grid — same 16/64 spacing as the playground, scaled to
            // texture pixels (PXPU px per world unit).
            const MINOR_PX = 16 * PXPU;
            const MAJOR_PX = 64 * PXPU;
            ctx.lineWidth = 1;
            ctx.strokeStyle = minor;
            for (let x = 0; x <= w; x += MINOR_PX) {
              ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
            }
            for (let y = 0; y <= h; y += MINOR_PX) {
              ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
            }
            ctx.strokeStyle = major;
            for (let x = 0; x <= w; x += MAJOR_PX) {
              ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
            }
            for (let y = 0; y <= h; y += MAJOR_PX) {
              ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
            }

            // Soft edge vignette — 4 directional linear gradients
            // with a multi-stop ease-out falloff. The geometry of the
            // wall itself curves at the corners (see makeWall), so we
            // don't try to fake roundness in the texture — keeping
            // the shadow falloff soft and clip-free is what makes
            // the bowed corners read correctly.
            const fade = 0.35;
            const edgeShadow = (g) => {
              g.addColorStop(0.00, 'rgba(0,0,0,0.30)');
              g.addColorStop(0.20, 'rgba(0,0,0,0.18)');
              g.addColorStop(0.50, 'rgba(0,0,0,0.07)');
              g.addColorStop(0.80, 'rgba(0,0,0,0.02)');
              g.addColorStop(1.00, 'rgba(0,0,0,0)');
            };
            let g = ctx.createLinearGradient(0, 0, w * fade, 0); edgeShadow(g);
            ctx.fillStyle = g; ctx.fillRect(0, 0, w * fade, h);
            g = ctx.createLinearGradient(w, 0, w - w * fade, 0); edgeShadow(g);
            ctx.fillStyle = g; ctx.fillRect(w - w * fade, 0, w * fade, h);
            g = ctx.createLinearGradient(0, 0, 0, h * fade); edgeShadow(g);
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h * fade);
            g = ctx.createLinearGradient(0, h, 0, h - h * fade); edgeShadow(g);
            ctx.fillStyle = g; ctx.fillRect(0, h - h * fade, w, h * fade);

            const tex = new THREE.CanvasTexture(cv);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            objectsToDispose.push(tex);
            return tex;
          }

          // ── Rounded room — actual geometry, no seams ──────────
          // Cross-section in (X, Y) is a "stadium": flat vertical
          // sides at x=±HALF_X, flat horizontal top and bottom at
          // y=±HALF_Y, joined at the four corners by quarter-circle
          // fillets of radius ROUND_R. The shape is constant along
          // Z, so the back wall reads as a flat plane and the left/
          // right walls stay straight verticals — they only curve
          // where they meet the floor or ceiling, in the corners.
          //
          // Snap rule (rounded-rect SDF in 2D):
          //   • clamp X into the inner band [−INNER_X, INNER_X]
          //   • clamp Y into the inner band [−INNER_Y, INNER_Y]
          //   • compute the offset from the clamped point
          //   • if the vertex sat in a CORNER zone (both axes
          //     clamped), normalize the offset and re-place it at
          //     distance ROUND_R → produces the quarter-circle curve
          //   • if it sat along a FLAT side (only one axis clamped),
          //     leave it alone — sides/top/bottom stay perfectly flat
          //   • Z is untouched throughout → back wall is flat
          const ROUND_R = 72;
          const INNER_X = HALF_X - ROUND_R;
          const INNER_Y = HALF_Y - ROUND_R;

          const tmpV = new THREE.Vector3();
          const snapToRoundedBox = (p) => {
            const cx = Math.max(-INNER_X, Math.min(INNER_X, p.x));
            const cy = Math.max(-INNER_Y, Math.min(INNER_Y, p.y));
            const dx = p.x - cx;
            const dy = p.y - cy;
            // Only round in the CORNER zone (where both X and Y were
            // clamped). On a flat side only one of dx/dy will be
            // non-zero relative to the unclamped axis — but with the
            // clamp above, the axis that was inside the inner band
            // returns dx=0 or dy=0. So we need both to be nonzero
            // (within tolerance) to mean "this vertex is in the
            // corner region". Otherwise leave it alone.
            const onCornerX = Math.abs(p.x) > INNER_X;
            const onCornerY = Math.abs(p.y) > INNER_Y;
            if (!(onCornerX && onCornerY)) return; // flat side — no snap
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1e-6) return;
            const k = ROUND_R / len;
            p.x = cx + dx * k;
            p.y = cy + dy * k;
          };

          function makeWall(widthWU, heightWU) {
            const tex = makeWallTexture(widthWU, heightWU);
            const mat = new THREE.MeshStandardMaterial({
              color: 0x000000,
              emissive: 0xffffff,
              emissiveMap: tex,
              roughness: 1,
              metalness: 0,
              side: THREE.FrontSide,
            });
            objectsToDispose.push(mat);

            // High subdivision so the rounded corner reads smooth.
            const SEGS = 64;
            const geo = new THREE.PlaneGeometry(widthWU, heightWU, SEGS, SEGS);
            objectsToDispose.push(geo);

            const mesh = new THREE.Mesh(geo, mat);
            mesh.receiveShadow = true;
            // Stash bake dims so rebakeWalls() can regenerate the
            // texture with the SAME aspect ratio after a theme flip.
            mesh.userData.wallBakeWidth = widthWU;
            mesh.userData.wallBakeHeight = heightWU;
            return mesh;
          }

          /* Rebake every wall's emissive texture using the current
             document theme tokens. Called when a theme change is
             detected by the MutationObserver below; cheap enough at
             that frequency (a handful of canvas paints + GPU upload). */
          const rebakeWalls = () => {
            for (const mesh of wallMeshes) {
              const w = mesh.userData.wallBakeWidth;
              const h = mesh.userData.wallBakeHeight;
              if (!w || !h) continue;
              const oldTex = mesh.material.emissiveMap;
              const newTex = makeWallTexture(w, h);
              mesh.material.emissiveMap = newTex;
              mesh.material.needsUpdate = true;
              if (oldTex) oldTex.dispose();
            }
          };

          /* Apply the rounded-box snap to a wall AFTER it's been
             positioned/rotated into the room. Each vertex is taken
             to world space, snapped onto the rounded inner box, then
             converted back to the mesh's local space and written
             back. We then recompute normals so the lighting follows
             the new curvature. Because the snap function depends only
             on world position (not which wall it is), adjacent walls
             that share a corner vertex in world space will both map
             it to the same rounded-corner point — seams stay tight. */
          const roundWall = (mesh) => {
            mesh.updateMatrixWorld(true);
            const geo = mesh.geometry;
            const pos = geo.attributes.position;
            const inv = mesh.matrixWorld.clone().invert();
            for (let i = 0; i < pos.count; i++) {
              tmpV.set(pos.getX(i), pos.getY(i), pos.getZ(i));
              tmpV.applyMatrix4(mesh.matrixWorld);
              snapToRoundedBox(tmpV);
              tmpV.applyMatrix4(inv);
              pos.setXYZ(i, tmpV.x, tmpV.y, tmpV.z);
            }
            pos.needsUpdate = true;
            geo.computeVertexNormals();
          };

          const wT = HALF_X * 2;
          const hT = HALF_Y * 2;
          const dT = HALF_Z * 2;

          // Floor (y = -HALF_Y, facing up)
          const floor = makeWall(wT, dT);
          floor.rotation.x = -Math.PI / 2;
          floor.position.set(0, -HALF_Y, 0);
          scene.add(floor);

          // Ceiling (y = +HALF_Y, facing down)
          const ceil = makeWall(wT, dT);
          ceil.rotation.x = Math.PI / 2;
          ceil.position.set(0, HALF_Y, 0);
          scene.add(ceil);

          // Back wall (z = -HALF_Z, facing toward camera = +Z)
          const back = makeWall(wT, hT);
          back.position.set(0, 0, -HALF_Z);
          scene.add(back);

          // Left wall (x = -HALF_X, facing +X)
          const left = makeWall(dT, hT);
          left.rotation.y = Math.PI / 2;
          left.position.set(-HALF_X, 0, 0);
          scene.add(left);

          // Right wall (x = +HALF_X, facing -X)
          const right = makeWall(dT, hT);
          right.rotation.y = -Math.PI / 2;
          right.position.set(HALF_X, 0, 0);
          scene.add(right);

          // Apply rounded-box deformation now that all walls are
          // positioned. Every vertex within ROUND_R of an edge gets
          // snapped onto the rounded surface; vertices from different
          // walls at the same world point land at the same destination
          // so the seams stay welded.
          // Back wall stays flat — only the four walls that share
          // a corner with it (floor/ceiling/left/right) round into
          // the X/Y fillet so they meet at the curve.
          [floor, ceil, left, right].forEach(roundWall);

          // Stash the wall meshes so the snapshot routine can hide
          // them temporarily — the snapshot is ball-only.
          wallMeshes.push(floor, ceil, back, left, right);

          /* Theme observer — rebake wall textures whenever the live
             theme changes. The token sheet flips via either a new
             data-theme attribute on <html> or inline style overrides
             on the same element. Watch BOTH:
               • attributeFilter: ['data-theme', 'style'] catches all
                 entry points in lib/theme.js (applyTheme writes both
                 the variant attribute and per-token style props).
             Stashed on themeObserverRef so the effect's teardown can
             disconnect it. */
          const themeObserver = new MutationObserver(() => { rebakeWalls(); applyLighting(); });
          themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme', 'style'],
          });
          themeObserverRef.current = themeObserver;

          // No front wall — user looks INTO the room from outside.
          // The 6th cannon plane still bounces the ball back from the
          // front edge though, so it can't escape toward the camera.
        }

        /* ── HDRI scene env ───────────────────────────────────────
           Lazy-load each scene on first request, cache its
           {equirect, envMap} keyed by SCENES.key. Toggling between
           already-loaded scenes is instant. PMREMGenerator builds
           the prefiltered envMap so the ball reflects/lights as a
           real PBR object; the raw equirect doubles as the visible
           background so the user sees the location. */
        const envCache = new Map();   // key → { equirect, envMap }
        const envInFlight = new Map(); // key → Promise
        const loadEnvironment = (key) => {
          if (envCache.has(key)) return Promise.resolve(envCache.get(key));
          if (envInFlight.has(key)) return envInFlight.get(key);
          const scene = SCENES.find((s) => s.key === key);
          if (!scene) return Promise.reject(new Error(`Unknown scene: ${key}`));
          const p = new Promise((resolve, reject) => {
            const url = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
              ? chrome.runtime.getURL(scene.file)
              : scene.file;
            new EXRLoader().load(
              url,
              (tex) => {
                tex.mapping = THREE.EquirectangularReflectionMapping;
                const pmrem = new THREE.PMREMGenerator(renderer);
                pmrem.compileEquirectangularShader();
                const env = pmrem.fromEquirectangular(tex).texture;
                pmrem.dispose();
                const entry = { equirect: tex, envMap: env };
                envCache.set(key, entry);
                objectsToDispose.push(tex, env);
                resolve(entry);
              },
              undefined,
              (err) => { envInFlight.delete(key); reject(err); },
            );
          });
          envInFlight.set(key, p);
          return p;
        };

        // Swap the scene env to whichever HDRI key is active (or
        // clear and show the room walls when key is null). Hides
        // every wall while ANY scene is up; toggles cast-shadow on
        // the key light so the ball doesn't drop a fake floor shadow
        // into empty space.
        const applySceneMode = (key) => {
          const on = key != null;
          for (const w of wallMeshes) w.visible = !on;
          if (on) {
            const entry = envCache.get(key);
            scene.background = entry?.equirect || null;
            scene.environment = entry?.envMap || null;
            // Kill room lights — HDRI env map provides all lighting in
            // scene mode. Leaving them on washes out the environment.
            keyLight.intensity = 0;
            fill.intensity = 0;
            rim.intensity = 0;
          } else {
            scene.background = null;
            scene.environment = null;
            keyLight.castShadow = true;
            // Re-apply the active theme preset + any manual override.
            // applyLighting() early-outs when sceneKey is set, so we
            // intentionally call it AFTER applySceneMode finishes (the
            // caller flips sceneKeyRef before invoking us).
            applyLighting();
          }
        };

        // ── Ball ───────────────────────────────────────────────
        // Clone the cached geometry so multiple GolfballViewer mounts
        // don't share + mutate the same Mesh (DecalGeometry attaches
        // to the mesh and we'd cross-contaminate state).
        ballMesh = new THREE.Mesh(
          model.geometry.clone(),
          new THREE.MeshStandardMaterial({
            color: 0xf6f6f6,
            // Slight emissive so the shadow-side never fully grays
            // out. Roughness lowered so the dimples catch a crisper
            // highlight (a real golfball is fairly glossy plastic).
            emissive: 0x101418,
            emissiveIntensity: 0.4,
            roughness: 0.28,
            metalness: 0.02,
          }),
        );
        ballMesh.castShadow = true;
        ballMesh.receiveShadow = false;
        // The OBJ ships at an arbitrary size; rescale so its bounding-
        // box diameter is ~100 units (matches our camera framing).
        ballMesh.geometry.computeBoundingSphere();
        const bsphere = ballMesh.geometry.boundingSphere;
        const targetRadius = 100;
        const scale = targetRadius / bsphere.radius;
        ballMesh.scale.setScalar(scale);
        // Recenter the geometry on the origin so OrbitControls rotates
        // around the ball's middle, not its model-space center.
        ballMesh.position.set(-bsphere.center.x * scale, -bsphere.center.y * scale, -bsphere.center.z * scale);
        // Wrap ball+decal in a Group so throw-mode translates and
        // rotates the whole assembly together. The mesh's recentering
        // offset lives INSIDE the group so the group's origin is the
        // visual center of the ball — clean pivot for rotation +
        // wall-collision math.
        ballGroup = new THREE.Group();
        ballGroup.add(ballMesh);
        // Apply the dev-settings default rotation so the print sits
        // at whatever orientation the team has dialed in. Drag-to-
        // rotate during use can override this freely.
        ballGroup.rotation.set(
          initialBallRef.current.rotX,
          initialBallRef.current.rotY,
          initialBallRef.current.rotZ,
        );
        scene.add(ballGroup);
        objectsToDispose.push(ballMesh.material);

        // Decal projection params, stashed at module scope so the
        // explode tool can re-project the SAME decal onto each shard
        // individually (the logo physically tears apart along shard
        // seams instead of riding on one piece).
        let decalProjectionParams = null;  // { position, orientation, size, texture }
        // ── Decal — projected onto the top pole ────────────────
        if (decalDataUrl) {
          // eslint-disable-next-line no-console
          console.log('[gb-decal] starting decal build, dataUrl length =', decalDataUrl?.length, 'prefix =', decalDataUrl?.slice(0, 40));
          const texLoader = new THREE.TextureLoader();
          const decalTexture = await new Promise((res, rej) => {
            texLoader.load(decalDataUrl, res, undefined, rej);
          });
          // eslint-disable-next-line no-console
          console.log('[gb-decal] texture loaded, image=', decalTexture.image?.width, 'x', decalTexture.image?.height, 'disposed?', disposed);
          if (disposed) return;
          // Texture flags: clamp to edge so edge pixels don't tile across
          // the decal's edges; sRGB so white reads as white.
          decalTexture.colorSpace = THREE.SRGBColorSpace;
          decalTexture.wrapS = THREE.ClampToEdgeWrapping;
          decalTexture.wrapT = THREE.ClampToEdgeWrapping;
          objectsToDispose.push(decalTexture);

          // Camera is straight-on at +Z, so the decal projects from
          // +Z directly toward the ball center along -Z. Default
          // identity Euler aims the projection box's -Z axis at the
          // origin, which IS the ball center — the print lands flat
          // on the camera-facing face of the ball.
          const decalPosition = new THREE.Vector3(0, 0, targetRadius * 0.999);
          const decalOrientation = new THREE.Euler(0, 0, 0);
          const decalSize = new THREE.Vector3(targetRadius * 0.7, targetRadius * 0.7, targetRadius * 2);

          /* Force matrixWorld up-to-date BEFORE DecalGeometry projects.
             DecalGeometry walks ballMesh.matrixWorld to transform the
             projector into mesh-local space; if matrixWorld is stale
             (Three.js only refreshes it during render), the projection
             can collapse and produce an empty mesh. The previous fix
             called updateMatrixWorld on ballGroup with force=true —
             which SHOULD propagate to ballMesh — but the decal still
             went invisible on 2026-05-29, so we belt-and-suspenders
             the chain: explicit local-matrix rebuilds on each node
             first (so updateMatrix sees the latest scale + position
             before composing matrixWorld), then a recursive group
             call, then a direct mesh call as a final guarantee.
             Geometry's boundingBox is also recomputed since
             DecalGeometry's early-out uses it for AABB rejection. */
          ballMesh.updateMatrix();
          ballGroup.updateMatrix();
          ballGroup.updateMatrixWorld(true);
          ballMesh.updateMatrixWorld(true);
          if (!ballMesh.geometry.boundingBox) ballMesh.geometry.computeBoundingBox();
          const decalGeo = new DecalGeometry(ballMesh, decalPosition, decalOrientation, decalSize);
          // eslint-disable-next-line no-console
          console.log('[gb-decal] decalGeo built, vertex count =', decalGeo.attributes?.position?.count, 'ballMesh matrixWorld[0..3] =', ballMesh.matrixWorld.elements.slice(0, 4));
          /* Empty decal = projection silently failed (matrixWorld
             still stale, or projection box missed every triangle).
             Surface it to the host so the toast layer can flag it
             instead of just rendering a no-op decal. */
          if (!decalGeo.attributes?.position?.count) {
            console.warn('[gb-decal] DecalGeometry produced 0 vertices — projection missed the mesh');
            try { onError?.('Decal projection produced no geometry'); } catch { /* ignore */ }
          }
          const decalMat = new THREE.MeshStandardMaterial({
            map: decalTexture,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            roughness: 0.5,
            metalness: 0,
          });
          decalMesh = new THREE.Mesh(decalGeo, decalMat);
          // Decal must match the ball's transform so its UV mapping
          // aligns. Added to the same Group as the ball so throw-mode
          // translation/rotation moves them together; otherwise the
          // decal would stay glued to the origin.
          decalMesh.position.copy(ballMesh.position);
          decalMesh.scale.copy(ballMesh.scale);
          /* Render after the ball so depth+polygonOffset are honored
             in the correct order. Without this, scene order isn't
             guaranteed and the decal occasionally lost the depth
             tiebreak when the lighting overhaul changed sort hints. */
          decalMesh.renderOrder = 1;
          ballGroup.add(decalMesh);
          objectsToDispose.push(decalGeo, decalMat);
          // eslint-disable-next-line no-console
          console.log('[gb-decal] decalMesh added to ballGroup, visible =', decalMesh.visible, 'parent children count =', ballGroup.children.length);
          // Stash projection params for explode-time per-shard reuse.
          decalProjectionParams = {
            position: decalPosition.clone(),
            orientation: decalOrientation.clone(),
            size: decalSize.clone(),
            texture: decalTexture,
          };
        }

        /* ── Snapshot ────────────────────────────────────────────
           Render the ball (no walls, no shadows, fully transparent
           background) to an offscreen square canvas and return a
           PNG dataURL. Used by ImagePreview's Copy / Download
           buttons in the 3D action strip.

           We spin up a SEPARATE WebGLRenderer for this so we don't
           perturb the live canvas size/clear color/shadow state.
           Three.js scenes can be shared across renderers without
           any GPU resource conflict — both renderers compile their
           own programs against the same geometry/material objects.
        */
        snapshotRef.current = (size = 1024) => {
          // Frame the ball precisely on the camera at its current
          // scale. Camera FOV = 40°, distance 520. Visible half-
          // height at the ball plane = 520 * tan(20°) ≈ 189. We
          // want the ball (radius 100 * state.scale) to fill ~90%
          // of the snapshot, so push the snapshot camera closer:
          const snapCam = camera.clone();
          const ballRadiusVisual = 100 * state.scale;
          const padFraction = 0.72;             // how much of the frame the ball occupies (lower = more breathing room)
          const visHalfH = ballRadiusVisual / padFraction;
          // distance for ortho-equivalent framing under perspective:
          // visHalfH = dist * tan(FOV/2)
          const dist = visHalfH / Math.tan((camera.fov * Math.PI / 180) / 2);
          snapCam.position.set(0, 0, dist);
          snapCam.aspect = 1;
          snapCam.lookAt(0, 0, 0);
          snapCam.updateProjectionMatrix();

          // Hide chrome — walls only. The ball/decal stay visible.
          const prevVis = wallMeshes.map((m) => m.visible);
          wallMeshes.forEach((m) => { m.visible = false; });

          const snapCanvas = document.createElement('canvas');
          snapCanvas.width = size;
          snapCanvas.height = size;
          const snapRenderer = new THREE.WebGLRenderer({
            canvas: snapCanvas,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,  // required for toDataURL
          });
          snapRenderer.setPixelRatio(1);
          snapRenderer.setSize(size, size, false);
          snapRenderer.setClearColor(0x000000, 0);
          snapRenderer.outputColorSpace = renderer.outputColorSpace;
          snapRenderer.toneMapping = renderer.toneMapping;
          snapRenderer.render(scene, snapCam);
          const dataUrl = snapCanvas.toDataURL('image/png');

          // Restore + dispose the snapshot renderer (its GL context
          // is throwaway; the scene's resources are reference-counted
          // by Three.js so they're untouched).
          snapRenderer.dispose();
          wallMeshes.forEach((m, i) => { m.visible = prevVis[i]; });
          return dataUrl;
        };

        containsPointRef.current = ({ clientX, clientY }) => {
          const canvas = renderer.domElement;
          const r = canvas.getBoundingClientRect();
          return clientX >= r.left && clientX <= r.right
              && clientY >= r.top  && clientY <= r.bottom;
        };

        /* ── cannon-es physics world ─────────────────────────────
           One sphere body for the ball + 6 static planes for the box
           walls + zero-to-many bomb bodies added on drop. The world
           steps every frame whenever throwMode is on OR any bombs
           exist (bombs always have gravity so they need physics even
           when the ball is at rest).

           Three contact materials:
             • ball ↔ wall   — restitution 0.6, friction 0.05
             • ball ↔ ball   — used for ball↔bomb and bomb↔bomb, since
                              bombs are also tagged ballMaterial.
                              Restitution 0.55 reads as a soft thud
                              rather than a click; friction 0.10 lets
                              the ball roll-push a bomb naturally. */
        world = new CANNON.World();
        world.gravity.set(0, -650, 0);
        world.broadphase = new CANNON.NaiveBroadphase();

        const ballMaterial = new CANNON.Material('ball');
        const wallMaterial = new CANNON.Material('wall');
        world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, wallMaterial, {
          friction: 0.05,
          restitution: 0.6,
        }));
        world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, ballMaterial, {
          friction: 0.10,
          restitution: 0.55,
        }));

        // bombs: array of { group, body, radius, sparkMat, fuseStart }
        // Render loop drives fuse animation, syncs physics to mesh,
        // and triggers explode() when fuseStart + FUSE_MS elapses.
        const bombs = [];
        // particles: short-lived burst sprites spawned at explosion.
        // Each is { mesh, vel, life, maxLife } — pure visual, no
        // physics (manual position += vel*dt + light gravity drag).
        const particles = [];
        // spawnedBalls: colored mini-balls from the ball-pit tool.
        // Each is { mesh, body } — full physics, blastable by bombs.
        const spawnedBalls = [];
        // confettiPieces: flat physics boxes raining from the ceiling.
        // Each is { mesh, body } — blastable by bombs, pile up on floor.
        const confettiPieces = [];
        // shards: pieces of the ball when the user fires the "explode"
        // fun-menu tool. Each is a curved spherical wedge that flies
        // outward with its own velocity + angular velocity, then —
        // when reassembleBall() is called — tweens back to its home
        // pose so the ball pops back into existence intact.
        //
        // Shape: { mesh, home, homeQuat, vel, angVel, mode, t,
        //          startPos, startQuat }
        //   mode: 'flying' | 'returning'
        //   t:    progress 0..1 used by 'returning' (lerps mesh.position
        //         from startPos → home, quaternion startQuat → homeQuat)
        const shards = [];
        let ballExploded = false;          // mesh visibility flag

        /* ══════════════════════════════════════════════════════════
           WATER — heightfield fluid + shader.

           The water surface is a 2D heightfield: a GRID×GRID array of
           heights and velocities sampled in the XZ plane spanning the
           room. Each frame we:
             1. Run the wave equation:   v += k*(neighbors_avg − h)
                                          h += v*dt
                with damping so ripples die out naturally.
             2. Inject height where the cursor pumps water in.
             3. Push height DOWN where objects displace the surface
                (creates real splash waves spreading outward).
             4. Inject impulse where bombs detonate underwater
                (concentric shock rings).
             5. Apply quadratic drag to every underwater body so
                explosions actually dissipate underwater.
             6. Upload the heightfield to a data texture for the
                custom water shader (refraction + Fresnel + depth tint).
           ════════════════════════════════════════════════════════ */
        const FLOOR_Y = -HALF_Y;
        const GRID_RES = 128;             // cells per axis — 16k cells total
        const CELL_X = (HALF_X * 2) / GRID_RES;
        const CELL_Z = (HALF_Z * 2) / GRID_RES;

        // Two arrays per heightfield: current heights (above baseLevel)
        // and per-cell velocities. Stored as Float32 for simd-friendly
        // iteration. Width-major: idx = z*GRID_RES + x.
        const heights    = new Float32Array(GRID_RES * GRID_RES);
        const velocities = new Float32Array(GRID_RES * GRID_RES);
        const WAVE_SPEED = 0.30;      // wave equation stiffness
        const WAVE_DAMP  = 0.985;     // per-frame velocity damping
        let baseLevel = FLOOR_Y - 4;  // global water level (rises while pouring)
        const POUR_FILL_RATE = 30;    // base level rise (units/sec)
        const POUR_HEIGHT_INJECT = 14; // height injected at cursor cells/frame

        // Heightfield data texture — fed into the shader as a
        // displacement + normal source.
        const heightTexData = new Float32Array(GRID_RES * GRID_RES);
        const heightTex = new THREE.DataTexture(
          heightTexData, GRID_RES, GRID_RES,
          THREE.RedFormat, THREE.FloatType,
        );
        heightTex.minFilter = THREE.LinearFilter;
        heightTex.magFilter = THREE.LinearFilter;
        heightTex.wrapS = THREE.ClampToEdgeWrapping;
        heightTex.wrapT = THREE.ClampToEdgeWrapping;
        heightTex.needsUpdate = true;
        objectsToDispose.push(heightTex);

        // Scene render target for screen-space refraction. The water
        // shader samples this to compose what's behind the surface
        // with refraction offset and depth-based blue absorption.
        const sceneRT = new THREE.WebGLRenderTarget(1, 1, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          depthBuffer: true,
        });
        const sizeSceneRT = () => {
          const cw = renderer.domElement.width;
          const ch = renderer.domElement.height;
          if (sceneRT.width !== cw || sceneRT.height !== ch) {
            sceneRT.setSize(cw, ch);
          }
        };
        objectsToDispose.push(sceneRT);

        /* Water surface mesh — high-poly plane subdivided enough that
           per-vertex heightfield sampling produces a believable
           silhouette without blocky stairstepping. */
        const waterGeo = new THREE.PlaneGeometry(
          HALF_X * 2, HALF_Z * 2, GRID_RES - 1, GRID_RES - 1,
        );
        const waterUniforms = {
          uTime:        { value: 0 },
          uHeightTex:   { value: heightTex },
          uHeightScale: { value: 1.0 },        // multiplier on heightfield values
          uBaseLevel:   { value: baseLevel },  // shader needs this to read submerged depth
          uSceneTex:    { value: sceneRT.texture },
          uResolution:  { value: new THREE.Vector2(1, 1) },
          uCameraPos:   { value: new THREE.Vector3() },
          uShallowCol:  { value: new THREE.Color(0x2bb6ff) },
          uDeepCol:     { value: new THREE.Color(0x002850) },
          uFresnelBias: { value: 0.04 },
          uFresnelPow:  { value: 4.5 },
          uRefractStr:  { value: 0.018 },
          uFloorY:      { value: FLOOR_Y },
          uGridX:       { value: HALF_X },
          uGridZ:       { value: HALF_Z },
        };
        const waterMat = new THREE.ShaderMaterial({
          uniforms: waterUniforms,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          vertexShader: /* glsl */`
            uniform sampler2D uHeightTex;
            uniform float uHeightScale;
            uniform float uBaseLevel;
            varying vec3 vWorldPos;
            varying vec2 vUv;
            varying vec3 vNormal;
            void main() {
              vUv = uv;
              // Sample the heightfield + neighbors for normals via finite difference.
              float h  = texture2D(uHeightTex, uv).r * uHeightScale;
              vec2 px = vec2(1.0 / 128.0, 0.0);
              vec2 py = vec2(0.0, 1.0 / 128.0);
              float hl = texture2D(uHeightTex, uv - px).r * uHeightScale;
              float hr = texture2D(uHeightTex, uv + px).r * uHeightScale;
              float hd = texture2D(uHeightTex, uv - py).r * uHeightScale;
              float hu = texture2D(uHeightTex, uv + py).r * uHeightScale;
              vec3 n = normalize(vec3(hl - hr, 8.0, hd - hu));
              vNormal = n;
              vec3 displaced = position + vec3(0.0, h, 0.0);
              vec4 wp = modelMatrix * vec4(displaced, 1.0);
              vWorldPos = wp.xyz;
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `,
          fragmentShader: /* glsl */`
            precision highp float;
            uniform sampler2D uSceneTex;
            uniform vec2 uResolution;
            uniform vec3 uCameraPos;
            uniform vec3 uShallowCol;
            uniform vec3 uDeepCol;
            uniform float uFresnelBias;
            uniform float uFresnelPow;
            uniform float uRefractStr;
            uniform float uFloorY;
            uniform float uTime;
            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying vec2 vUv;
            void main() {
              // Screen-space UV for sampling the scene texture beneath us.
              vec2 screenUv = gl_FragCoord.xy / uResolution;

              // Refraction offset from the surface normal's XZ tilt.
              vec2 refractOffset = vec2(vNormal.x, vNormal.z) * uRefractStr;
              vec3 refracted = texture2D(uSceneTex, screenUv + refractOffset).rgb;

              // Depth absorption — deeper water = more blue tint.
              // Estimated depth = water surface height − floor.
              float depth = max(0.0, vWorldPos.y - uFloorY);
              float depthFrac = clamp(depth / 220.0, 0.0, 1.0);
              vec3 waterColor = mix(uShallowCol, uDeepCol, depthFrac);
              vec3 absorbed = mix(refracted, waterColor, depthFrac * 0.85);

              // Fresnel: more reflection at grazing angles.
              vec3 V = normalize(uCameraPos - vWorldPos);
              float fres = uFresnelBias + (1.0 - uFresnelBias)
                         * pow(1.0 - max(dot(vNormal, V), 0.0), uFresnelPow);

              // Specular highlight — fake sun reflection on wave peaks.
              vec3 lightDir = normalize(vec3(0.4, 0.9, 0.3));
              vec3 H = normalize(V + lightDir);
              float spec = pow(max(dot(vNormal, H), 0.0), 80.0);

              vec3 reflection = mix(uShallowCol * 1.3, vec3(1.0), 0.4);
              vec3 col = mix(absorbed, reflection, fres) + spec * 0.6;

              // Alpha — water is mostly opaque when deep, more
              // translucent at the very edge of fill.
              float alpha = mix(0.78, 0.95, depthFrac);
              gl_FragColor = vec4(col, alpha);
            }
          `,
        });
        const waterMesh = new THREE.Mesh(waterGeo, waterMat);
        waterMesh.rotation.x = -Math.PI / 2;
        waterMesh.position.y = baseLevel;
        waterMesh.visible = false;
        waterMesh.renderOrder = 10; // render after opaque scene so refraction works
        scene.add(waterMesh);
        objectsToDispose.push(waterGeo, waterMat);

        /* ── Underwater tint (replaces the CSS blue-gradient div) ─────
           Fullscreen quad in clip-space — its vertex shader bypasses
           Three.js's projection so the same NDC quad always fills the
           viewport regardless of camera transform. Renders LAST
           (renderOrder = 999) on top of the water mesh and everything
           else, applying a depth-attenuated water tint to pixels below
           the projected water line.

           Improvements over the CSS div:
             • Beer's-law alpha so the tint darkens exponentially with
               depth-from-surface — far more "real water" than a fixed
               linear gradient.
             • Soft caustic wobble at the surface band (a thin animated
               sine ripple) to sell the water line as a refractive
               interface rather than a flat color stop.
             • Uses the water shader's own uShallowCol/uDeepCol uniforms
               so the tint stays consistent with the water surface
               material when those colors are tuned.

           Set `mesh.visible = hasWater` each frame so the quad only
           paints when there's water to show. */
        const underwaterQuadGeo = new THREE.PlaneGeometry(2, 2);
        objectsToDispose.push(underwaterQuadGeo);
        const underwaterUniforms = {
          uTime:        { value: 0 },
          uWaterLineNDC:{ value: -1 },                 // -1 = below screen (no tint)
          uShallowCol:  waterUniforms.uShallowCol,     // share so retunes track
          uDeepCol:     waterUniforms.uDeepCol,
        };
        const underwaterMat = new THREE.ShaderMaterial({
          uniforms: underwaterUniforms,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          vertexShader: /* glsl */`
            varying vec2 vUv;
            void main() {
              vUv = uv;
              // Bypass modelView/projection — pass position straight to
              // clip space so the quad fills the viewport regardless of
              // where the camera is or what it's looking at.
              gl_Position = vec4(position, 1.0);
            }
          `,
          fragmentShader: /* glsl */`
            precision highp float;
            uniform float uWaterLineNDC;   // -1 .. +1 (Y of the water surface in NDC)
            uniform vec3  uShallowCol;
            uniform vec3  uDeepCol;
            uniform float uTime;
            varying vec2 vUv;
            void main() {
              // vUv is 0..1; convert to NDC.y in -1..+1.
              float ndcY = vUv.y * 2.0 - 1.0;
              if (ndcY > uWaterLineNDC) discard;       // above water — pass through

              // 0 at the water line, 1 at the bottom of the screen.
              float bandH = uWaterLineNDC + 1.0;       // total NDC distance below the line
              float depthFrac = clamp((uWaterLineNDC - ndcY) / max(bandH, 1e-3), 0.0, 1.0);

              // Beer's law absorption — the deeper the pixel, the more
              // light is absorbed. 2.5 is the absorption coefficient;
              // ~93% opacity at the bottom of the screen.
              float alpha = 1.0 - exp(-2.5 * depthFrac);

              // Shallow→deep color blend.
              vec3 col = mix(uShallowCol, uDeepCol, smoothstep(0.0, 1.0, depthFrac));

              // Surface caustic: a thin animated ripple at the water
              // line, fades out within 6% of the band. Sells the line
              // as a refractive boundary instead of a flat color stop.
              float surfBand = 1.0 - smoothstep(0.0, 0.06, depthFrac);
              float caustic = sin(vUv.x * 26.0 + uTime * 1.8) * 0.5 + 0.5;
              col += vec3(0.05, 0.10, 0.16) * caustic * surfBand * 0.55;

              gl_FragColor = vec4(col, alpha);
            }
          `,
        });
        const underwaterQuad = new THREE.Mesh(underwaterQuadGeo, underwaterMat);
        underwaterQuad.frustumCulled = false;          // never cull (NDC coords don't fit Three.js's bbox math)
        underwaterQuad.renderOrder = 999;
        underwaterQuad.visible = false;
        scene.add(underwaterQuad);
        objectsToDispose.push(underwaterMat);

        // Pour cursor world position — updated by hold handler.
        const waterPourWorld = new THREE.Vector3(0, 0, 0);
        let pourActive = false;

        // Helper: convert (x, z) world coords → grid (i, j).
        const xToGridI = (wx) => Math.round(((wx + HALF_X) / (HALF_X * 2)) * (GRID_RES - 1));
        const zToGridJ = (wz) => Math.round(((wz + HALF_Z) / (HALF_Z * 2)) * (GRID_RES - 1));

        /* Inject height into a circular region centered at grid (ci,cj).
           Used by cursor pump AND object displacement. */
        const injectHeight = (ci, cj, radius, amount) => {
          const r2 = radius * radius;
          const i0 = Math.max(0, ci - radius);
          const i1 = Math.min(GRID_RES - 1, ci + radius);
          const j0 = Math.max(0, cj - radius);
          const j1 = Math.min(GRID_RES - 1, cj + radius);
          for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
              const d2 = (i - ci) * (i - ci) + (j - cj) * (j - cj);
              if (d2 > r2) continue;
              const falloff = 1 - Math.sqrt(d2) / radius;
              heights[j * GRID_RES + i] += amount * falloff;
            }
          }
        };

        /* Inject impulse (velocity) — for bomb shockwaves. Positive
           amount pushes water UP at the center, negative pushes DOWN. */
        const injectImpulse = (ci, cj, radius, amount) => {
          const r2 = radius * radius;
          const i0 = Math.max(0, ci - radius);
          const i1 = Math.min(GRID_RES - 1, ci + radius);
          const j0 = Math.max(0, cj - radius);
          const j1 = Math.min(GRID_RES - 1, cj + radius);
          for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
              const d2 = (i - ci) * (i - ci) + (j - cj) * (j - cj);
              if (d2 > r2) continue;
              const falloff = 1 - Math.sqrt(d2) / radius;
              velocities[j * GRID_RES + i] += amount * falloff;
            }
          }
        };

        // Read the water surface height at world (wx, wz). Combines
        // global baseLevel with the heightfield perturbation.
        const surfaceHeightAt = (wx, wz) => {
          if (wx < -HALF_X || wx > HALF_X || wz < -HALF_Z || wz > HALF_Z) return baseLevel;
          const i = xToGridI(wx);
          const j = zToGridJ(wz);
          return baseLevel + heights[j * GRID_RES + i];
        };

        pourWaterAtRef.current = (pos) => {
          const canvas = renderer.domElement;
          const r = canvas.getBoundingClientRect();
          if (pos.clientX < r.left || pos.clientX > r.right ||
              pos.clientY < r.top  || pos.clientY > r.bottom) {
            pourActive = false;
            return;
          }
          ndc.x =  ((pos.clientX - r.left) / r.width)  * 2 - 1;
          ndc.y = -((pos.clientY - r.top)  / r.height) * 2 + 1;
          ray.setFromCamera(ndc, camera);
          ray.ray.intersectPlane(dropPlane, hitPoint);
          waterPourWorld.set(
            Math.max(-HALF_X + 8, Math.min(HALF_X - 8, hitPoint.x)),
            hitPoint.y,
            Math.max(-HALF_Z + 8, Math.min(HALF_Z - 8, hitPoint.z)),
          );
          pourActive = true;
        };

        /* Cursor-push: each call updates an internal target world point
           that the render loop reads to inject a negative-height bump
           into the heightfield. Pass `null` to release the depression —
           the existing wave equation propagates the displacement outward
           and the surface heals naturally. The plane we raycast against
           is the live water surface (baseLevel), so a tall pour and a
           low pool both feel pushable from the right screen position. */
        let pushActive = false;
        const pushTarget = new THREE.Vector3(0, 0, 0);
        const pushPlane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        pushWaterAtRef.current = (pos) => {
          if (!pos) { pushActive = false; return; }
          const canvas = renderer.domElement;
          const r = canvas.getBoundingClientRect();
          if (pos.clientX < r.left || pos.clientX > r.right ||
              pos.clientY < r.top  || pos.clientY > r.bottom) {
            pushActive = false;
            return;
          }
          // Update plane to live water surface so the raycast hits where
          // the user expects after pouring (baseLevel rises as the pool
          // fills).
          pushPlane.constant = -baseLevel;
          ndc.x =  ((pos.clientX - r.left) / r.width)  * 2 - 1;
          ndc.y = -((pos.clientY - r.top)  / r.height) * 2 + 1;
          ray.setFromCamera(ndc, camera);
          if (!ray.ray.intersectPlane(pushPlane, hitPoint)) {
            pushActive = false;
            return;
          }
          pushTarget.set(
            Math.max(-HALF_X + 6, Math.min(HALF_X - 6, hitPoint.x)),
            hitPoint.y,
            Math.max(-HALF_Z + 6, Math.min(HALF_Z - 6, hitPoint.z)),
          );
          pushActive = true;
        };

        drainWaterRef.current = () => {
          baseLevel = FLOOR_Y - 4;
          waterActiveRef.current = false;
          pourActive = false;
          waterMesh.visible = false;
          waterMesh.position.y = baseLevel;
          heights.fill(0);
          velocities.fill(0);
          // Remove pour stream droplets.
          for (const d of streamDroplets) {
            scene.remove(d.mesh);
            d.mesh.geometry.dispose();
            d.mesh.material.dispose();
          }
          streamDroplets.length = 0;
        };

        /* clearRoomItems — purge everything in the room except the
           main golf ball. Used by both the scene-mode transition AND
           the fun-menu close. */
        clearRoomItemsRef.current = () => {
          for (let i = bombs.length - 1; i >= 0; i--) {
            scene.remove(bombs[i].group);
            world.removeBody(bombs[i].body);
          }
          bombs.length = 0;
          for (let i = spawnedBalls.length - 1; i >= 0; i--) {
            scene.remove(spawnedBalls[i].mesh);
            world.removeBody(spawnedBalls[i].body);
          }
          spawnedBalls.length = 0;
          for (let i = confettiPieces.length - 1; i >= 0; i--) {
            scene.remove(confettiPieces[i].mesh);
            world.removeBody(confettiPieces[i].body);
          }
          confettiPieces.length = 0;
          confettiActiveRef.current = false;
          setConfettiRef.current?.(false);
          drainWaterRef.current?.();
          for (let i = particles.length - 1; i >= 0; i--) {
            scene.remove(particles[i].mesh);
            particles[i].mesh.geometry.dispose();
            particles[i].mesh.material.dispose();
          }
          particles.length = 0;
          // Shards — kill them instantly and restore the ball + the
          // original decal. Used when the user closes the fun menu
          // mid-explosion: no point animating a graceful return when
          // the whole UI is going away. The per-shard decals live as
          // children of each shardGroup, so disposing the group
          // disposes them too.
          for (let i = shards.length - 1; i >= 0; i--) {
            const s = shards[i];
            s.group.traverse((child) => {
              if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
              }
            });
            scene.remove(s.group);
          }
          shards.length = 0;
          if (ballExploded) {
            ballMesh.visible = true;
            if (decalMesh) decalMesh.visible = true;
            ballExploded = false;
          }
        };

        /* ── Ball-explode effect ───────────────────────────────────
           Slice the real ball mesh into ~16 wedges by spatially
           binning its triangles, fling them outward with random spins
           + realistic gravity, and burst a particle puff at the
           origin. The ball mesh goes invisible while shards are out
           so the user sees the ball "become" its pieces. Reassemble()
           reverses it: tween each shard back home, then show the
           ball + dispose the shards.

           Binning: each source triangle's CENTROID is converted to
           spherical coords (phi, theta) on the ball; the (phi, theta)
           pair indexes one of 4×4=16 wedge bins. All triangles in a
           bin become one shard's BufferGeometry — so each shard owns
           a real, dimpled patch of the original ball surface.

           Closed cuts: each wedge would be hollow viewed from inside
           since the model's only the outer shell. We cap every shard
           with a fan of inner triangles meeting at the ball center,
           textured with the same material, so seeing into a tumbling
           shard reads as solid rather than empty.

           Decal: the camera-facing logo lives at (0,0,+100) on the
           ball. Whichever shard's bin contains that direction adopts
           the decal mesh as a child — when the shard tumbles, the
           decal tumbles with it (it will visibly warp; per design,
           that's preferred over the decal vanishing). */
        const SHARD_LON_BANDS  = 6;                   // phi divisions (around Y)
        const SHARD_LAT_BANDS  = 5;                   // theta divisions (top→bottom) → 30 wedges
        const SHARD_LIFE_MS    = 1100;
        const SHARD_RETURN_MS  = 700;
        const SHARD_DRAG       = 0.985;               // per-frame velocity damping (gentle — gravity dominates)
        const SHARD_GRAVITY    = 980;                 // px/s² — matches the rest of the world
        const SHARD_BOUNCE     = 0.45;                // floor/wall restitution
        const SHARD_FRICTION   = 0.78;                // tangential damping on bounce
        const _tmpV3a = new THREE.Vector3();
        const _tmpQa  = new THREE.Quaternion();
        const _tmpScale = new THREE.Vector3();
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        /* Bin the source geometry's triangles by (phi, theta) of their
           centroid. We pre-compute this ONCE so re-clicking explode
           doesn't re-walk the geometry every time. The result is a
           Map keyed by `${i}_${j}` → { positions:Float32Array,
           normals:Float32Array }. Positions are pre-baked through
           ballMesh's local matrix so the shard geometry lives in
           ballGroup-local space, which matches the camera framing
           the user already sees. */
        let cachedShardBins = null;
        const buildShardBins = () => {
          if (cachedShardBins) return cachedShardBins;
          const srcGeo = ballMesh.geometry;
          const srcPos = srcGeo.attributes.position;
          const srcNrm = srcGeo.attributes.normal;
          const srcIdx = srcGeo.index;
          // Compose ballMesh's local matrix (scale + recentering
          // offset) so the shard verts land where the visible ball
          // sits, not at the OBJ's native scale.
          ballMesh.updateMatrix();
          const mat4 = ballMesh.matrix;
          const nMat3 = new THREE.Matrix3().getNormalMatrix(mat4);
          const phiStep   = (Math.PI * 2) / SHARD_LON_BANDS;
          const thetaStep =  Math.PI      / SHARD_LAT_BANDS;
          const bins = new Map();
          const getBin = (key) => {
            let b = bins.get(key);
            if (!b) { b = { positions: [], normals: [] }; bins.set(key, b); }
            return b;
          };
          const triCount = srcIdx ? srcIdx.count / 3 : srcPos.count / 3;
          const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
          const na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3();
          const ce = new THREE.Vector3();
          for (let t = 0; t < triCount; t++) {
            const i0 = srcIdx ? srcIdx.getX(t * 3 + 0) : t * 3 + 0;
            const i1 = srcIdx ? srcIdx.getX(t * 3 + 1) : t * 3 + 1;
            const i2 = srcIdx ? srcIdx.getX(t * 3 + 2) : t * 3 + 2;
            va.fromBufferAttribute(srcPos, i0).applyMatrix4(mat4);
            vb.fromBufferAttribute(srcPos, i1).applyMatrix4(mat4);
            vc.fromBufferAttribute(srcPos, i2).applyMatrix4(mat4);
            na.fromBufferAttribute(srcNrm, i0).applyMatrix3(nMat3).normalize();
            nb.fromBufferAttribute(srcNrm, i1).applyMatrix3(nMat3).normalize();
            nc.fromBufferAttribute(srcNrm, i2).applyMatrix3(nMat3).normalize();
            ce.set((va.x + vb.x + vc.x) / 3, (va.y + vb.y + vc.y) / 3, (va.z + vb.z + vc.z) / 3);
            // Sphere coords for the centroid. theta∈[0,π] from +Y down
            // matches Three.js SphereGeometry conventions; phi∈[0,2π)
            // around Y. Both map directly to bin indices.
            const r = Math.sqrt(ce.x * ce.x + ce.y * ce.y + ce.z * ce.z) || 1;
            const theta = Math.acos(Math.max(-1, Math.min(1, ce.y / r)));
            let phi = Math.atan2(ce.z, ce.x);
            if (phi < 0) phi += Math.PI * 2;
            const li = Math.min(SHARD_LON_BANDS - 1, Math.floor(phi / phiStep));
            const lj = Math.min(SHARD_LAT_BANDS - 1, Math.floor(theta / thetaStep));
            const bin = getBin(`${li}_${lj}`);
            bin.positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
            bin.normals.push(na.x, na.y, na.z, nb.x, nb.y, nb.z, nc.x, nc.y, nc.z);
          }
          cachedShardBins = { bins, phiStep, thetaStep };
          return cachedShardBins;
        };

        /* Decide which (li, lj) bin contains the decal anchor point
           (0, 0, +100). That bin's shard adopts the decal. */
        const decalBinKey = (() => {
          const dir = new THREE.Vector3(0, 0, 1);
          const r = 1;
          const theta = Math.acos(Math.max(-1, Math.min(1, dir.y / r)));
          let phi = Math.atan2(dir.z, dir.x);
          if (phi < 0) phi += Math.PI * 2;
          const phiStep   = (Math.PI * 2) / SHARD_LON_BANDS;
          const thetaStep =  Math.PI      / SHARD_LAT_BANDS;
          const li = Math.min(SHARD_LON_BANDS - 1, Math.floor(phi / phiStep));
          const lj = Math.min(SHARD_LAT_BANDS - 1, Math.floor(theta / thetaStep));
          return `${li}_${lj}`;
        })();

        explodeBallAtRef.current = () => {
          // Re-explode while shards are already out: toss them again
          // with fresh velocities. Avoids the awkward "nothing happens"
          // path when the user clicks rapidly.
          if (shards.length > 0) {
            for (const s of shards) {
              s.mode = 'flying';
              s.life = SHARD_LIFE_MS;
              const speed = 260 + Math.random() * 240;
              s.vel.copy(s.outDir).multiplyScalar(speed);
              s.vel.y += 200 + Math.random() * 120;
              s.angVel.set(
                (Math.random() - 0.5) * 8,
                (Math.random() - 0.5) * 8,
                (Math.random() - 0.5) * 8,
              );
            }
            spawnExplodeParticles();
            return;
          }

          /* Capture ballGroup's CURRENT world transform — shards
             detach from ballGroup and live in scene-space from here
             on, so they don't inherit the ball's physics motion or
             rotation. Each shard's initial pose = ballGroup's world
             pose; integration is pure scripted (no parent yanking). */
          ballGroup.updateMatrixWorld(true);
          const startWorldPos   = new THREE.Vector3();
          const startWorldQuat  = new THREE.Quaternion();
          const startWorldScale = new THREE.Vector3();
          ballGroup.matrixWorld.decompose(startWorldPos, startWorldQuat, startWorldScale);
          const startScale = startWorldScale.x; // uniform

          const { bins, phiStep, thetaStep } = buildShardBins();
          const ballMatSrc = ballMesh.material;
          for (const [key, bin] of bins) {
            if (bin.positions.length === 0) continue;
            const [liStr, ljStr] = key.split('_');
            const li = +liStr, lj = +ljStr;
            // Build the outer (dimpled) surface from the binned tris.
            const positions = new Float32Array(bin.positions);
            const normals = new Float32Array(bin.normals);
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            // Cap the cut faces with a fan of inner triangles meeting
            // at the ball center, sealing each wedge so the inside
            // isn't visible mid-tumble.
            const triCount = positions.length / 9;
            const capPos = new Float32Array(triCount * 9);
            const capNrm = new Float32Array(triCount * 9);
            for (let t = 0; t < triCount; t++) {
              const o = t * 9;
              capPos[o + 0] = 0; capPos[o + 1] = 0; capPos[o + 2] = 0;
              capPos[o + 3] = positions[o + 6]; capPos[o + 4] = positions[o + 7]; capPos[o + 5] = positions[o + 8];
              capPos[o + 6] = positions[o + 3]; capPos[o + 7] = positions[o + 4]; capPos[o + 8] = positions[o + 5];
              const ax = positions[o + 0], ay = positions[o + 1], az = positions[o + 2];
              const bx = positions[o + 3], by = positions[o + 4], bz = positions[o + 5];
              const cx = positions[o + 6], cy = positions[o + 7], cz = positions[o + 8];
              const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
              const ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
              const nx = -mx / ml, ny = -my / ml, nz = -mz / ml;
              capNrm[o + 0] = nx; capNrm[o + 1] = ny; capNrm[o + 2] = nz;
              capNrm[o + 3] = nx; capNrm[o + 4] = ny; capNrm[o + 5] = nz;
              capNrm[o + 6] = nx; capNrm[o + 7] = ny; capNrm[o + 8] = nz;
            }
            const mergedPos = new Float32Array(positions.length + capPos.length);
            const mergedNrm = new Float32Array(normals.length + capNrm.length);
            mergedPos.set(positions, 0); mergedPos.set(capPos, positions.length);
            mergedNrm.set(normals, 0); mergedNrm.set(capNrm, normals.length);
            geo.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(mergedNrm, 3));
            const mat = ballMatSrc.clone();
            mat.side = THREE.DoubleSide;

            // Wrap each shard in a Group: shell mesh + optional decal
            // child. Group lives in WORLD space (parented to scene),
            // so its position/rotation are not inherited from ballGroup.
            const shellMesh = new THREE.Mesh(geo, mat);
            shellMesh.castShadow = true;
            shellMesh.position.set(0, 0, 0);
            shellMesh.quaternion.identity();

            const shardGroup = new THREE.Group();
            shardGroup.add(shellMesh);

            /* Per-shard decal projection. DecalGeometry projects the
               original logo box onto THIS shard's mesh only — any
               triangles outside the projection box just don't appear
               in the resulting geometry, so shards far from the logo
               get an empty (or near-empty) decal that we skip. The
               result: each shard naturally carries its own slice of
               the logo, torn along shard seams. */
            if (decalProjectionParams) {
              try {
                const sDecalGeo = new DecalGeometry(
                  shellMesh,
                  decalProjectionParams.position,
                  decalProjectionParams.orientation,
                  decalProjectionParams.size,
                );
                // DecalGeometry returns an empty buffer if no source
                // triangles fall inside the projection box. Skip those.
                if (sDecalGeo.attributes?.position?.count > 0) {
                  const sDecalMat = new THREE.MeshStandardMaterial({
                    map: decalProjectionParams.texture,
                    transparent: true,
                    depthTest: true,
                    depthWrite: false,
                    polygonOffset: true,
                    polygonOffsetFactor: -4,
                    roughness: 0.5,
                    metalness: 0,
                  });
                  const sDecalMesh = new THREE.Mesh(sDecalGeo, sDecalMat);
                  shardGroup.add(sDecalMesh);
                } else {
                  sDecalGeo.dispose();
                }
              } catch { /* projection failed for this shard — skip */ }
            }

            // Initial world pose = the ball's current world pose.
            // Shards therefore "appear" exactly where the visible
            // ball was sitting at click time, regardless of throw-
            // mode physics.
            shardGroup.position.copy(startWorldPos);
            shardGroup.quaternion.copy(startWorldQuat);
            shardGroup.scale.setScalar(startScale);
            scene.add(shardGroup);

            // Outward direction = wedge centroid on the unit sphere,
            // then ROTATED by the ball's current world orientation so
            // the burst sprays outward relative to the visible ball,
            // not the local frame. Without this, an upside-down ball
            // would still spray its "north" pieces toward world +Y.
            const phiMid   = (li + 0.5) * phiStep;
            const thetaMid = (lj + 0.5) * thetaStep;
            const localOutDir = new THREE.Vector3(
              Math.sin(thetaMid) * Math.cos(phiMid),
              Math.cos(thetaMid),
              Math.sin(thetaMid) * Math.sin(phiMid),
            );
            const outDir = localOutDir.clone().applyQuaternion(startWorldQuat);

            const speed = 280 + Math.random() * 260;
            const vel = outDir.clone().multiplyScalar(speed);
            vel.y += 220 + Math.random() * 140;
            const angVel = new THREE.Vector3(
              (Math.random() - 0.5) * 9,
              (Math.random() - 0.5) * 9,
              (Math.random() - 0.5) * 9,
            );
            shards.push({
              group: shardGroup,                          // moves in world space
              outDir,
              vel,
              angVel,
              mode: 'flying',
              t: 0,
              startPos: new THREE.Vector3(),              // for return tween
              startQuat: new THREE.Quaternion(),
              life: SHARD_LIFE_MS,
              scale: startScale,                          // frozen at explode time
            });
          }
          // Hide the intact ball + decal — shards carry both visuals.
          ballMesh.visible = false;
          if (decalMesh) decalMesh.visible = false;
          ballExploded = true;
          spawnExplodeParticles();
        };

        /* Spawn a sparkle puff at the ball center. Reuses the
           existing particle array so the render loop's particle
           update path is the only thing that touches them. Brand
           color + white mix reads as a "magic burst" rather than the
           bomb's orange/red. */
        const spawnExplodeParticles = () => {
          const cs = getComputedStyle(document.documentElement);
          const brandHex = cs.getPropertyValue('--gb-brand-label').trim() || '#a78bfa';
          const PUFF_COUNT = 48;
          for (let i = 0; i < PUFF_COUNT; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = (Math.random() - 0.5) * Math.PI;
            const speed = 220 + Math.random() * 240;
            const dir = new THREE.Vector3(
              Math.cos(theta) * Math.cos(phi),
              Math.sin(phi) + 0.4,
              Math.sin(theta) * Math.cos(phi) * 0.6,
            ).normalize();
            const geo = new THREE.SphereGeometry(1.4 + Math.random() * 1.3, 6, 6);
            const mat = new THREE.MeshBasicMaterial({
              color: Math.random() < 0.5 ? brandHex : 0xffffff,
              transparent: true,
              opacity: 1,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(ballGroup.position);
            scene.add(mesh);
            particles.push({
              mesh,
              vel: dir.multiplyScalar(speed),
              life: 750,
              maxLife: 750,
            });
          }
        };

        reassembleBallRef.current = () => {
          if (shards.length === 0) return;
          // Snapshot each shard's CURRENT world pose as the tween
          // start, so we lerp from wherever the shard happens to be
          // back to the live ball pose (re-computed every frame in
          // the integration loop). Flipping mode to 'returning' stops
          // the gravity/bounce integration.
          for (const s of shards) {
            s.mode = 'returning';
            s.t = 0;
            s.startPos.copy(s.group.position);
            s.startQuat.copy(s.group.quaternion);
          }
          // Paired "magic" puff at the destination, same beat as the
          // explosion so the eye reads it as a reverse motion.
          spawnExplodeParticles();
        };

        /* Pour stream — visual water droplets gushing from the cursor.
           Each droplet is a small sphere with physics-driven fall.
           When it hits the water surface (or floor if no water yet)
           it vanishes and INJECTS height into the heightfield at the
           impact cell, creating real splash ripples. */
        const streamDroplets = [];
        let streamSpawnTimer = 0;
        const ndc = new THREE.Vector2();
        const ray = new THREE.Raycaster();
        const dropPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // z = 0
        const hitPoint = new THREE.Vector3();

        // Tunables for the explosion. FUSE_MS is the visible burn
        // time before detonation. BLAST_R + IMPULSE_BASE control how
        // hard nearby bodies get punched; force falls off with 1/(d+1).
        const FUSE_MS = 2500;
        const BLAST_R = 280;
        const IMPULSE_BASE = 3800;        // bomb impulse @ contact (linear falloff to 0 at BLAST_R)
        const BALL_IMPULSE_SHARE = 1.6;   // ball-mass=1 vs bomb-mass=0.6, multiply so a close blast actually flings it
        const PARTICLE_COUNT = 36;
        const PARTICLE_LIFE_MS = 950;

        /* Detonate a bomb: apply radial impulse to the ball + every
           OTHER bomb in range, spawn a particle burst, then remove
           the bomb's mesh + physics body from the world.

           Impulse direction is from the bomb's center to the target
           body's center; magnitude scales with IMPULSE_BASE / (d+1)
           and is zero past BLAST_R. The ball gets a smaller share
           (it's much heavier) so the room doesn't fling it across
           on a near-miss; bombs are lighter so they scatter visibly. */
        const tmpDir = new THREE.Vector3();
        const explode = (bomb) => {
          const origin = bomb.body.position;

          /* Underwater shockwave — water is nearly incompressible so
             pressure waves transmit hard. If the bomb detonates beneath
             the surface, push a massive shock ring into the heightfield
             AND boost the body impulse for any target also underwater. */
          let underwaterBlast = false;
          if (baseLevel > FLOOR_Y) {
            const surfY = surfaceHeightAt(origin.x, origin.z);
            if (origin.y < surfY) {
              underwaterBlast = true;
              const ci = xToGridI(origin.x);
              const cj = zToGridJ(origin.z);
              // Massive central plume + concentric shock rings.
              injectHeight(ci, cj, 22, 40);
              injectImpulse(ci, cj, 16, 60);
              injectImpulse(ci, cj, 34, 22);
              injectImpulse(ci, cj, 52, 8);
            }
          }

          // Affected bodies: every bomb except the one detonating,
          // plus the ball (only when it's DYNAMIC — kinematic ball
          // is static while gravity is off, so don't poke it).
          // Linear falloff: full force at contact, zero past BLAST_R.
          // Quadratic-ish 1/(d+1) was too punishing near the bomb —
          // the user reported "very little effect on the ball." Linear
          // means a near-hit actually flings, and a far hit is a nudge.
          const falloff = (d) => Math.max(0, 1 - d / BLAST_R) * IMPULSE_BASE;
          // Per-target water amplification — only bodies that are
          // ALSO underwater at detonation time get the pressure boost.
          // A body in the air above the water doesn't feel an underwater
          // blast as hard. This means later, when a body in the air
          // falls into the water, no "absorption" is retroactively
          // applied to it — the impulse is already settled.
          const waterAmplify = (body) => {
            if (!underwaterBlast || baseLevel <= FLOOR_Y) return 1.0;
            const surfY = surfaceHeightAt(body.position.x, body.position.z);
            return body.position.y < surfY ? 1.9 : 1.0;
          };

          const targets = [];
          for (const other of bombs) {
            if (other === bomb) continue;
            const dx = other.body.position.x - origin.x;
            const dy = other.body.position.y - origin.y;
            const dz = other.body.position.z - origin.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d > BLAST_R) continue;
            targets.push({ body: other.body, dx, dy, dz, d, falloff: falloff(d) * waterAmplify(other.body) });
          }
          {
            const dx = ballBody.position.x - origin.x;
            const dy = ballBody.position.y - origin.y;
            const dz = ballBody.position.z - origin.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d <= BLAST_R && ballBody.type === CANNON.Body.DYNAMIC) {
              targets.push({ body: ballBody, dx, dy, dz, d, falloff: falloff(d) * BALL_IMPULSE_SHARE * waterAmplify(ballBody) });
            }
          }
          // Spawned balls and confetti scatter in the blast.
          for (const sb of spawnedBalls) {
            const dx = sb.body.position.x - origin.x;
            const dy = sb.body.position.y - origin.y;
            const dz = sb.body.position.z - origin.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d <= BLAST_R) targets.push({ body: sb.body, dx, dy, dz, d, falloff: falloff(d) * waterAmplify(sb.body) });
          }
          for (const cp of confettiPieces) {
            const dx = cp.body.position.x - origin.x;
            const dy = cp.body.position.y - origin.y;
            const dz = cp.body.position.z - origin.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d <= BLAST_R * 1.4) targets.push({ body: cp.body, dx, dy, dz, d, falloff: falloff(d) * 2.2 * waterAmplify(cp.body) });
          }
          // applyImpulse(impulse, relativePoint): relativePoint is
          // an offset from the body center in WORLD orientation. Pass
          // (0,0,0) so the impulse is centered — no spurious torque,
          // pure outward linear push. (Previously we passed the body's
          // world position, which cannon-es interprets as a massive
          // offset from the body center; that fed back through the
          // angular term and inverted the apparent linear direction.)
          const zero = new CANNON.Vec3(0, 0, 0);
          // Cap post-impulse velocity to MAX_BLAST_SPEED so a tiny
          // body (confetti, mass 0.03) doesn't get Δv = impulse/mass
          // = thousands of units/sec → tunnels right through the walls
          // in a single physics step. cannon-es uses discrete collision
          // so anything moving more than ~wall_thickness per step
          // escapes. 600 units/sec at 60Hz = 10 units/frame, well
          // under the wall thickness.
          const MAX_BLAST_SPEED = 600;
          for (const t of targets) {
            const inv = t.d > 1e-3 ? 1 / t.d : 0;
            const ix = t.dx * inv * t.falloff;
            const iy = t.dy * inv * t.falloff;
            const iz = t.dz * inv * t.falloff;
            t.body.applyImpulse(new CANNON.Vec3(ix, iy, iz), zero);
            // Clamp the resulting velocity.
            const v = t.body.velocity;
            const sp = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
            if (sp > MAX_BLAST_SPEED) {
              const k = MAX_BLAST_SPEED / sp;
              v.x *= k; v.y *= k; v.z *= k;
            }
            t.body.wakeUp();
          }

          // Particle burst. Each particle is a tiny emissive sphere
          // shot in a random outward direction with a small Z-bias
          // so the burst reads as volumetric rather than flat.
          for (let i = 0; i < PARTICLE_COUNT; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = (Math.random() - 0.5) * Math.PI * 0.6; // shallow elevation
            const speed = 280 + Math.random() * 220;
            tmpDir.set(
              Math.cos(theta) * Math.cos(phi),
              Math.sin(phi) + 0.25,                 // bias up a bit
              Math.sin(theta) * Math.cos(phi) * 0.55, // squash Z so we see the burst
            ).normalize();
            const geo = new THREE.SphereGeometry(1.6 + Math.random() * 1.5, 6, 6);
            const mat = new THREE.MeshBasicMaterial({
              color: Math.random() < 0.55 ? 0xffb347 : 0xff5722,
              transparent: true,
              opacity: 1,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(origin.x, origin.y, origin.z);
            scene.add(mesh);
            particles.push({
              mesh,
              vel: tmpDir.clone().multiplyScalar(speed),
              life: PARTICLE_LIFE_MS,
              maxLife: PARTICLE_LIFE_MS,
            });
          }

          // Strip the bomb out of bombs[] + the world.
          const idx = bombs.indexOf(bomb);
          if (idx >= 0) bombs.splice(idx, 1);
          scene.remove(bomb.group);
          world.removeBody(bomb.body);
          // Dispose materials/geometry created for this bomb. The
          // sphereGeometry / standard materials were pushed to
          // objectsToDispose at spawn — leave the global dispose
          // pass to free them on unmount; that's idempotent.
        };

        dropBombRef.current = ({ clientX, clientY }) => {
          // Bombs are disabled while an HDRI scene is up — there's
          // no room to hold them, just the ball in a skybox.
          if (sceneKeyRef.current) return;
          const canvas = renderer.domElement;
          const r = canvas.getBoundingClientRect();
          ndc.x =  ((clientX - r.left) / r.width)  * 2 - 1;
          ndc.y = -((clientY - r.top)  / r.height) * 2 + 1;
          ray.setFromCamera(ndc, camera);
          ray.ray.intersectPlane(dropPlane, hitPoint);

          const BOMB_R = 14;
          const margin = BOMB_R + 4;
          hitPoint.x = Math.max(-HALF_X + margin, Math.min(HALF_X - margin, hitPoint.x));
          hitPoint.y = Math.max(-HALF_Y + margin, Math.min(HALF_Y - margin, hitPoint.y));
          hitPoint.z = 0;

          const bombGroup = new THREE.Group();
          const mBody = new THREE.Mesh(
            new THREE.SphereGeometry(BOMB_R, 24, 18),
            new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.55, metalness: 0.15 }),
          );
          mBody.castShadow = true;
          const mFuse = new THREE.Mesh(
            new THREE.CylinderGeometry(1.2, 1.2, 10, 8),
            new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 }),
          );
          mFuse.position.y = BOMB_R + 4;
          const sparkMat = new THREE.MeshStandardMaterial({
            color: 0xffb347, emissive: 0xff7a1a, emissiveIntensity: 1.4, roughness: 0.4,
          });
          const mSpark = new THREE.Mesh(
            new THREE.SphereGeometry(2, 12, 10),
            sparkMat,
          );
          mSpark.position.y = BOMB_R + 10;
          bombGroup.add(mBody, mFuse, mSpark);
          bombGroup.position.copy(hitPoint);
          scene.add(bombGroup);
          objectsToDispose.push(
            mBody.geometry, mBody.material,
            mFuse.geometry, mFuse.material,
            mSpark.geometry, mSpark.material,
          );

          // Physics body — tagged ballMaterial so it picks up both
          // the ball↔wall AND ball↔ball contact materials (collides
          // with walls AND with the ball / other bombs).
          const cBody = new CANNON.Body({
            mass: 0.6,
            shape: new CANNON.Sphere(BOMB_R),
            material: ballMaterial,
            linearDamping: 0.05,
            angularDamping: 0.20,
          });
          cBody.position.set(hitPoint.x, hitPoint.y, hitPoint.z);
          world.addBody(cBody);

          bombs.push({
            group: bombGroup,
            body: cBody,
            radius: BOMB_R,
            spark: mSpark,
            sparkMat,
            fuseStart: performance.now(),
          });
        };

        /* ── Ball-pit spawner ─────────────────────────────────────
           Spawns one small colored physics ball at the cursor's world-
           space position (raycasted onto z=0 plane). Called once per
           second while the tool button is held in ViewerToolbox.
           Each ball is a real cannon-es Sphere so it stacks, rolls,
           and reacts to bomb explosions exactly like the main ball. */
        const BALL_COLORS = [
          0xff3b30, 0xff9500, 0xffcc00, 0x34c759, 0x30d158,
          0x5ac8fa, 0x007aff, 0xaf52de, 0xff2d55, 0xffd60a,
          0x64d2ff, 0xbf5af2, 0xff6961, 0xffb340, 0x30b0c7,
        ];
        const SPAWN_R = 12;

        spawnBallAtRef.current = ({ clientX, clientY }) => {
          if (sceneKeyRef.current) return;
          // Only spawn when the cursor is actually over the canvas.
          const canvas = renderer.domElement;
          const r = canvas.getBoundingClientRect();
          if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return;

          ndc.x =  ((clientX - r.left) / r.width)  * 2 - 1;
          ndc.y = -((clientY - r.top)  / r.height) * 2 + 1;
          ray.setFromCamera(ndc, camera);
          ray.ray.intersectPlane(dropPlane, hitPoint);

          const margin = SPAWN_R + 2;
          hitPoint.x = Math.max(-HALF_X + margin, Math.min(HALF_X - margin, hitPoint.x));
          hitPoint.y = Math.max(-HALF_Y + margin, Math.min(HALF_Y - margin, hitPoint.y));
          hitPoint.z = (Math.random() - 0.5) * HALF_Z * 0.4; // slight Z spread so balls don't pancake

          const color = BALL_COLORS[Math.floor(Math.random() * BALL_COLORS.length)];
          const geo = new THREE.SphereGeometry(SPAWN_R, 14, 10);
          const mat = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.35,
            metalness: 0.05,
            emissive: color,
            emissiveIntensity: 0.1,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = true;
          mesh.position.copy(hitPoint);
          scene.add(mesh);

          const cBody = new CANNON.Body({
            mass: 0.3,
            shape: new CANNON.Sphere(SPAWN_R),
            material: ballMaterial,
            linearDamping: 0.04,
            angularDamping: 0.15,
          });
          cBody.position.set(hitPoint.x, hitPoint.y, hitPoint.z);
          cBody.velocity.set(
            (Math.random() - 0.5) * 80,
            (Math.random() - 0.5) * 80,
            (Math.random() - 0.5) * 40,
          );
          world.addBody(cBody);
          spawnedBalls.push({ mesh, body: cBody });
          objectsToDispose.push(geo, mat);
        };

        /* ── Confetti rain ────────────────────────────────────────
           While active, one confetti piece spawns every ~60ms from a
           random X position at the ceiling (y = HALF_Y). Each piece is
           a flat CANNON.Box (thin slab) with very low mass so air drag
           makes it flutter. The render loop syncs mesh ↔ body each frame.
           Explosion impulse scatters them like leaves. */
        const CONFETTI_COLORS = [
          0xff3b30, 0xff9500, 0xffcc00, 0x34c759, 0x5ac8fa,
          0x007aff, 0xaf52de, 0xff2d55, 0xffd60a, 0x64d2ff,
          0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf9ca24, 0xf0932b,
          0x6ab04c, 0xeb4d4b, 0x7bed9f, 0x70a1ff, 0xff6348,
        ];
        let confettiSpawnTimer = 0;
        const CONFETTI_INTERVAL = 55; // ms between spawns
        const CONFETTI_W = 10;
        const CONFETTI_H = 5;
        const CONFETTI_DEPTH = 1;

        setConfettiRef.current = (active) => {
          confettiActiveRef.current = active;
          confettiSpawnTimer = 0;
        };

        ballBody = new CANNON.Body({
          mass: 1,
          shape: new CANNON.Sphere(targetRadius),
          material: ballMaterial,
          linearDamping: 0.06,
          angularDamping: 0.18,
          // Start the body sleeping (no physics applied) until throw
          // mode turns on. We control sleep state manually each frame.
          allowSleep: true,
        });
        ballBody.position.set(0, 0, 0);
        // Default to KINEMATIC: throwMode is off at boot, so the
        // ball is treated as an immovable collider for any bombs
        // the user drops. Flipping throwMode ON switches it back
        // to DYNAMIC so gravity takes over.
        ballBody.type = CANNON.Body.KINEMATIC;
        ballBody.sleep();
        world.addBody(ballBody);

        // Six walls — planes oriented inward, positioned at +/-HALF_* on each axis.
        // CANNON.Plane is infinite; we use position + quaternion to put it where we want.
        function addWall(pos, axis, angle) {
          const wall = new CANNON.Body({ mass: 0, material: wallMaterial });
          wall.addShape(new CANNON.Plane());
          wall.quaternion.setFromAxisAngle(new CANNON.Vec3(axis[0], axis[1], axis[2]), angle);
          wall.position.set(pos[0], pos[1], pos[2]);
          world.addBody(wall);
        }
        // Floor (Y = -HALF_Y), pointing up
        addWall([0, -HALF_Y, 0], [1, 0, 0], -Math.PI / 2);
        // Ceiling (Y = +HALF_Y), pointing down
        addWall([0,  HALF_Y, 0], [1, 0, 0],  Math.PI / 2);
        // Left wall (X = -HALF_X), pointing right
        addWall([-HALF_X, 0, 0], [0, 1, 0],  Math.PI / 2);
        // Right wall (X = +HALF_X), pointing left
        addWall([ HALF_X, 0, 0], [0, 1, 0], -Math.PI / 2);
        // Back wall (Z = -HALF_Z), pointing toward camera
        addWall([0, 0, -HALF_Z], [0, 1, 0], 0);
        // Front wall (Z = +HALF_Z), pointing away from camera
        addWall([0, 0,  HALF_Z], [0, 1, 0], Math.PI);

        // ── Render loop ────────────────────────────────────────
        let lastDebugTs = 0;
        let lastFrameTs = performance.now();
        const tmpQuat = new THREE.Quaternion();

        const render = () => {
          if (disposed) return;
          const nowMs = performance.now();
          const dt = Math.min(0.05, (nowMs - lastFrameTs) / 1000);
          lastFrameTs = nowMs;

          /* ── Mode transitions ──────────────────────────────────
             flip ON: take whatever rotation the user set, copy it
             to the cannon body, place body at origin. World starts
             stepping. Ball falls from origin via gravity.
             flip OFF: stop the world, snap ball back to identity
             rotation at origin, reset scale. */
          if (throwModeRef.current !== state.lastMode) {
            state.lastMode = throwModeRef.current;
            if (throwModeRef.current) {
              // Restore DYNAMIC so gravity applies again. The OFF
              // branch flips the ball KINEMATIC for bomb-collision
              // staging; we have to undo that on every ON flip.
              ballBody.type = CANNON.Body.DYNAMIC;
              ballBody.position.set(0, 0, 0);
              ballBody.velocity.set(0, 0, 0);
              ballBody.angularVelocity.set(0, 0, 0);
              // Mirror whatever quaternion the user spun the ball
              // into during normal-mode rotation onto the physics
              // body so the print orientation is preserved.
              ballBody.quaternion.set(
                ballGroup.quaternion.x,
                ballGroup.quaternion.y,
                ballGroup.quaternion.z,
                ballGroup.quaternion.w,
              );
              ballBody.wakeUp();
            } else {
              // Gravity OFF — stop physics immediately, then TWEEN
              // the visual ball from wherever it landed back to its
              // dev-settings default pose (origin, default rotation,
              // default scale) over ~450ms with an ease-out. Snapping
              // felt jarring; the slide reads as "settling".
              //
              // Switch the body to KINEMATIC so it ignores gravity
              // but still acts as a collider for bombs. (Bombs that
              // hit a sleeping dynamic body wake it; the ball would
              // then drift away from its rest pose. Kinematic
              // bodies are immovable from the physics side.)
              ballBody.type = CANNON.Body.KINEMATIC;
              ballBody.sleep();
              ballBody.position.set(0, 0, 0);
              ballBody.velocity.set(0, 0, 0);
              ballBody.angularVelocity.set(0, 0, 0);
              const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                initialBallRef.current.rotX,
                initialBallRef.current.rotY,
                initialBallRef.current.rotZ,
                'XYZ',
              ));
              state.returnTween = {
                start: nowMs,
                dur: 450,
                fromPos: ballGroup.position.clone(),
                fromQuat: ballGroup.quaternion.clone(),
                fromScale: state.scale,
                toPos: new THREE.Vector3(0, 0, 0),
                toQuat: targetQuat,
                toScale: initialBallRef.current.scale,
              };
            }
          }

          /* ── Scene-mode transition ─────────────────────────────
             sceneKey === null  → room (walls visible, no env)
             sceneKey === 'foo' → HDRI scene 'foo'
             Going A → B without stopping in between is supported:
             we just (lazy-)load B's env and re-apply. Walls stay
             hidden, the ball's pose is never touched. */
          if (sceneKeyRef.current !== state.lastSceneKey) {
            state.lastSceneKey = sceneKeyRef.current;
            if (sceneKeyRef.current) {
              clearRoomItemsRef.current?.();
              const target = sceneKeyRef.current;
              loadEnvironment(target)
                .then(() => {
                  if (!disposed && sceneKeyRef.current === target) applySceneMode(target);
                })
                .catch((e) => { console.warn('GolfballViewer: failed to load HDRI', target, e); });
            } else {
              applySceneMode(null);
            }
          }

          /* ── Return-to-rest tween ──────────────────────────────
             Runs after gravity flips off. Drives the visual group
             smoothly toward the default pose; cleared on completion
             OR if the user starts a new drag / re-enables gravity. */
          if (state.returnTween) {
            if (state.dragging || throwModeRef.current) {
              // Interaction interrupts the settle — drop the tween.
              state.returnTween = null;
            } else {
              const rt = state.returnTween;
              const tRaw = (nowMs - rt.start) / rt.dur;
              const t = Math.min(1, Math.max(0, tRaw));
              // easeOutCubic
              const e = 1 - Math.pow(1 - t, 3);
              ballGroup.position.lerpVectors(rt.fromPos, rt.toPos, e);
              tmpQuat.slerpQuaternions(rt.fromQuat, rt.toQuat, e);
              ballGroup.quaternion.copy(tmpQuat);
              state.scale = rt.fromScale + (rt.toScale - rt.fromScale) * e;
              if (t >= 1) state.returnTween = null;
            }
          }

          /* ── Physics step ──────────────────────────────────────
             Step whenever throwMode is on OR any bombs exist —
             bombs always need gravity, so as soon as one drops the
             world has to integrate every frame even if the ball is
             at rest. While dragging the active target, that body
             is kinematic and we mirror its pose from the pointer. */
          /* ── Confetti spawn ──────────────────────────────────────
             Drip one piece per CONFETTI_INTERVAL while rain is active.
             Each piece starts at the ceiling with a slight random tilt
             and a gentle downward + random lateral velocity. */
          if (confettiActiveRef.current) {
            confettiSpawnTimer += dt * 1000;
            if (confettiSpawnTimer >= CONFETTI_INTERVAL) {
              confettiSpawnTimer = 0;
              const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
              const geo = new THREE.PlaneGeometry(CONFETTI_W, CONFETTI_H);
              const mat = new THREE.MeshBasicMaterial({
                color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.92,
              });
              const mesh = new THREE.Mesh(geo, mat);
              mesh.castShadow = false;
              const sx = (Math.random() - 0.5) * HALF_X * 1.8;
              const sy = HALF_Y - 4;
              const sz = (Math.random() - 0.5) * HALF_Z * 0.6;
              mesh.position.set(sx, sy, sz);
              // Random initial tilt so pieces look natural at spawn.
              mesh.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI,
              );
              scene.add(mesh);

              const halfW = CONFETTI_W / 2;
              const halfH = CONFETTI_H / 2;
              const halfD = CONFETTI_DEPTH / 2;
              const cBody = new CANNON.Body({
                mass: 0.03,
                shape: new CANNON.Box(new CANNON.Vec3(halfW, halfH, halfD)),
                material: ballMaterial,
                linearDamping: 0.55,
                angularDamping: 0.45,
              });
              cBody.position.set(sx, sy, sz);
              cBody.quaternion.set(
                mesh.quaternion.x,
                mesh.quaternion.y,
                mesh.quaternion.z,
                mesh.quaternion.w,
              );
              // Gentle initial drift: fall + lateral wobble.
              cBody.velocity.set(
                (Math.random() - 0.5) * 40,
                -20 - Math.random() * 30,
                (Math.random() - 0.5) * 20,
              );
              cBody.angularVelocity.set(
                (Math.random() - 0.5) * 4,
                (Math.random() - 0.5) * 4,
                (Math.random() - 0.5) * 4,
              );
              world.addBody(cBody);
              confettiPieces.push({ mesh, body: cBody });
              objectsToDispose.push(geo, mat);

              // Cap total confetti to keep perf reasonable.
              if (confettiPieces.length > 300) {
                const old = confettiPieces.shift();
                scene.remove(old.mesh);
                world.removeBody(old.body);
              }
            }
          }

          /* ── Water heightfield simulation ────────────────────────
             Order each frame:
               1. Raise baseLevel while pouring (water "fills" the box).
               2. Spawn / advance pour-stream droplets; on hit, inject
                  height into the heightfield.
               3. Object displacement — push down cells under each
                  submerged body, proportional to submerged volume.
               4. Wave equation: v += k*(neighbor_avg − h);  h += v*dt
                  with damping + edge clamping.
               5. Quadratic drag on every underwater body.
               6. Buoyancy force (proper Archimedes: F = ρ * g * V_submerged).
               7. Upload heightfield to GPU texture for the shader.   */

          if (waterActiveRef.current && pourActive) {
            baseLevel = Math.min(HALF_Y - 6, baseLevel + POUR_FILL_RATE * dt);
            // Inject height at the cursor cell so the pour visibly
            // pumps water in (creates a spout + outward ripples).
            const ci = xToGridI(waterPourWorld.x);
            const cj = zToGridJ(waterPourWorld.z);
            injectHeight(ci, cj, 4, POUR_HEIGHT_INJECT * dt * 60);
          }

          const hasWater = baseLevel > FLOOR_Y;

          /* ── Cursor-push depression ──────────────────────────────
             When the consumer has set a push target (via pushWaterAt)
             AND there's water to push, subtract a small Gaussian bump
             from the heightfield at the target each frame. The wave
             equation handles the rest — water flows in from the sides
             and a stable dimple forms under the cursor. Releasing the
             push (passing null) stops the negative injection; the
             dimple heals as neighboring height feeds back in. */
          if (hasWater && pushActive) {
            const ci = xToGridI(pushTarget.x);
            const cj = zToGridJ(pushTarget.z);
            // Same per-frame scaling pattern as pour (×dt×60 = "per
            // logical 60-fps frame"), but negative and smaller radius
            // so it reads as a finger-press, not a drain.
            injectHeight(ci, cj, 6, -8 * dt * 60);
          }

          /* ── Pour stream droplets ──────────────────────────────── */
          if (waterActiveRef.current && pourActive) {
            streamSpawnTimer += dt * 1000;
            while (streamSpawnTimer >= 22) {
              streamSpawnTimer -= 22;
              const count = 3 + Math.floor(Math.random() * 3);
              for (let si = 0; si < count; si++) {
                const r = 2 + Math.random() * 2.2;
                const dGeo = new THREE.SphereGeometry(r, 6, 5);
                const dMat = new THREE.MeshBasicMaterial({
                  color: 0x55aaff,
                  transparent: true,
                  opacity: 0.7 + Math.random() * 0.2,
                });
                const dMesh = new THREE.Mesh(dGeo, dMat);
                dMesh.position.set(
                  waterPourWorld.x + (Math.random() - 0.5) * 10,
                  waterPourWorld.y + 8 + Math.random() * 16,
                  waterPourWorld.z + (Math.random() - 0.5) * 10,
                );
                scene.add(dMesh);
                streamDroplets.push({
                  mesh: dMesh,
                  velX: (Math.random() - 0.5) * 30,
                  velY: -(180 + Math.random() * 80),
                  velZ: (Math.random() - 0.5) * 30,
                  life: 1500,
                });
              }
            }
          } else {
            streamSpawnTimer = 0;
          }

          // Advance droplets; on impact with water surface or floor,
          // inject height (real splash) and remove the droplet.
          for (let di = streamDroplets.length - 1; di >= 0; di--) {
            const d = streamDroplets[di];
            d.velY -= 500 * dt;
            d.mesh.position.x += d.velX * dt;
            d.mesh.position.y += d.velY * dt;
            d.mesh.position.z += d.velZ * dt;
            d.life -= dt * 1000;

            const surfY = hasWater ? surfaceHeightAt(d.mesh.position.x, d.mesh.position.z) : FLOOR_Y;
            if (d.mesh.position.y <= surfY + 0.5 || d.life <= 0) {
              if (d.mesh.position.y <= surfY + 0.5) {
                // Splash — inject a small height pulse at impact cell.
                const ci = xToGridI(d.mesh.position.x);
                const cj = zToGridJ(d.mesh.position.z);
                if (ci >= 0 && ci < GRID_RES && cj >= 0 && cj < GRID_RES) {
                  injectHeight(ci, cj, 2, 1.5);
                  injectImpulse(ci, cj, 2, -8);
                }
              }
              scene.remove(d.mesh);
              d.mesh.geometry.dispose();
              d.mesh.material.dispose();
              streamDroplets.splice(di, 1);
            }
          }

          if (hasWater) {
            /* ── Object displacement → splash waves ────────────── */
            const displaceFromBody = (body, radius) => {
              if (body.type === CANNON.Body.STATIC || body.type === CANNON.Body.KINEMATIC) return;
              const surfY = surfaceHeightAt(body.position.x, body.position.z);
              const top = body.position.y + radius;
              const bot = body.position.y - radius;
              if (bot >= surfY || top <= surfY - 30) return; // fully above water or fully buried
              // Submersion ratio for displacement amount.
              const subFrac = Math.min(1, Math.max(0, (surfY - bot) / (radius * 2)));
              // Radius in grid cells ~ body radius / cell size.
              const gridR = Math.max(2, Math.round(radius / Math.max(CELL_X, CELL_Z)));
              const ci = xToGridI(body.position.x);
              const cj = zToGridJ(body.position.z);
              // Body's vertical velocity drives the splash impulse —
              // fast entry = big splash, slow drift = ripples.
              const vy = body.velocity.y;
              const splashImpulse = -vy * subFrac * 0.012;
              if (Math.abs(splashImpulse) > 0.01) {
                injectImpulse(ci, cj, gridR, splashImpulse);
              }
              // Continuous displacement — body still sitting in water
              // pushes the local cells down by its volume above the bed.
              injectHeight(ci, cj, gridR, -subFrac * 0.08 * dt * 60);
            };

            if (ballBody.type === CANNON.Body.DYNAMIC) {
              displaceFromBody(ballBody, targetRadius * state.scale);
            }
            for (const b of bombs) displaceFromBody(b.body, b.radius);
            for (const sb of spawnedBalls) displaceFromBody(sb.body, SPAWN_R);
            for (const cp of confettiPieces) displaceFromBody(cp.body, CONFETTI_W * 0.5);

            /* ── Wave equation step ────────────────────────────── */
            for (let j = 1; j < GRID_RES - 1; j++) {
              const row = j * GRID_RES;
              for (let i = 1; i < GRID_RES - 1; i++) {
                const idx = row + i;
                const avg = (
                  heights[idx - 1] + heights[idx + 1]
                  + heights[idx - GRID_RES] + heights[idx + GRID_RES]
                ) * 0.25;
                velocities[idx] = (velocities[idx] + (avg - heights[idx]) * WAVE_SPEED) * WAVE_DAMP;
              }
            }
            // Apply velocity to height + clamp.
            for (let k = 0; k < heights.length; k++) {
              heights[k] += velocities[k];
              // Clamp peaks so a runaway wave can't blow past the ceiling.
              if (heights[k] > 35) heights[k] = 35;
              if (heights[k] < -35) heights[k] = -35;
            }
            // Boundary cells — clamp to zero so waves reflect.
            for (let i = 0; i < GRID_RES; i++) {
              heights[i] = heights[GRID_RES + i] * 0.5;
              heights[(GRID_RES - 1) * GRID_RES + i] = heights[(GRID_RES - 2) * GRID_RES + i] * 0.5;
              heights[i * GRID_RES] = heights[i * GRID_RES + 1] * 0.5;
              heights[i * GRID_RES + (GRID_RES - 1)] = heights[i * GRID_RES + (GRID_RES - 2)] * 0.5;
            }

            // Upload heightfield to GPU.
            heightTexData.set(heights);
            heightTex.needsUpdate = true;

            /* ── Buoyancy + quadratic drag ─────────────────────────
               Physics:
                 ρ_body = body.mass / V_full
                 V_sub  = V_full * frac
                 F_buoy = ρ_water * g * V_sub  (upward)
                        = (ρ_water / ρ_body) * body.mass * g * frac
               We parameterize each body type by `floatRatio = ρ_water/ρ_body`:
                   floatRatio < 1  → buoyancy weaker than gravity → SINKS
                   floatRatio > 1  → buoyancy stronger than gravity → FLOATS
               Cannon already integrates body.mass*g downward, so we
               just add F_buoy upward. */
            const G = 650;
            const applyWaterForces = (body, radius, floatRatio, dragCoef) => {
              if (body.type === CANNON.Body.STATIC || body.type === CANNON.Body.KINEMATIC) return;
              const surfY = surfaceHeightAt(body.position.x, body.position.z);
              const bot = body.position.y - radius;
              if (bot >= surfY) return;
              const submerged = Math.min(radius * 2, surfY - bot);
              const frac = submerged / (radius * 2);

              const buoyF = floatRatio * body.mass * G * frac;
              body.applyForce(new CANNON.Vec3(0, buoyF, 0), new CANNON.Vec3(0, 0, 0));

              // Quadratic drag — F = -0.5 * Cd * |v| * v * frac²
              // Squaring frac means a body barely touching the surface
              // gets nearly zero drag, so high-speed re-entry doesn't
              // stop dead — only fully-submerged bodies feel the full
              // viscous brake.
              const vx = body.velocity.x, vy = body.velocity.y, vz = body.velocity.z;
              const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
              if (speed > 0.5) {
                let dragMag = 0.5 * dragCoef * speed * speed * frac * frac;
                // Cap drag impulse per frame to ≤ 15% of body momentum
                // so a fast body can punch through the surface without
                // instantly halting.
                const maxDrag = body.mass * speed * 0.15 / Math.max(dt, 1e-3);
                if (dragMag > maxDrag) dragMag = maxDrag;
                const inv = 1 / speed;
                body.applyForce(
                  new CANNON.Vec3(-dragMag * vx * inv, -dragMag * vy * inv, -dragMag * vz * inv),
                  new CANNON.Vec3(0, 0, 0),
                );
              }
              // Angular damping — water is viscous.
              const ad = 1 - frac * 0.12;
              body.angularVelocity.x *= ad;
              body.angularVelocity.y *= ad;
              body.angularVelocity.z *= ad;
              body.wakeUp();
            };

            // floatRatio < 1 sinks, > 1 floats.
            // Tuned so gravity wins decisively for ball + bombs.
            if (ballBody.type === CANNON.Body.DYNAMIC) {
              applyWaterForces(ballBody, targetRadius * state.scale, 0.30, 0.5);
            }
            // Bombs MUST sink — floatRatio 0.25 → net downward = 0.75*m*g
            for (const b of bombs)           applyWaterForces(b.body, b.radius, 0.25, 0.4);
            for (const sb of spawnedBalls)   applyWaterForces(sb.body, SPAWN_R, 1.6, 0.25);
            for (const cp of confettiPieces) applyWaterForces(cp.body, CONFETTI_W * 0.5, 4.0, 0.4);

            // Push shader uniforms.
            waterMesh.visible = true;
            waterMesh.position.y = baseLevel;
            waterUniforms.uTime.value = nowMs / 1000;
            waterUniforms.uBaseLevel.value = baseLevel;
            waterUniforms.uCameraPos.value.copy(camera.position);
          } else {
            waterMesh.visible = false;
          }

          /* ── Water line projection → underwater shader uniform ──
             Project the water surface (at world Y = baseLevel) into
             clip space, hand the NDC.y directly to the underwater
             overlay shader. The shader discards anything above this
             line so above-water pixels stay clean; below it, depth-
             attenuated water tint paints over the rendered scene. */
          if (hasWater) {
            const wp = new THREE.Vector3(0, baseLevel, 0);
            wp.project(camera);
            // wp.y is the water surface in NDC, -1..+1 (+1 = top of screen).
            underwaterUniforms.uWaterLineNDC.value = wp.y;
            underwaterUniforms.uTime.value = nowMs / 1000;
            underwaterQuad.visible = true;
          } else {
            underwaterQuad.visible = false;
          }

          const stepNeeded = throwModeRef.current || bombs.length > 0
            || spawnedBalls.length > 0 || confettiPieces.length > 0 || hasWater
            || streamDroplets.length > 0;
          if (stepNeeded) {
            // Sub-step the solver more aggressively (max 6 substeps)
            // so fast bodies don't tunnel through walls after impulse.
            world.step(1 / 120, dt, 6);
            // Sync the ball — only when throwMode is on AND we're
            // not actively dragging it (drag owns the transform).
            if (throwModeRef.current && !state.dragging) {
              ballGroup.position.set(
                ballBody.position.x,
                ballBody.position.y,
                ballBody.position.z,
              );
              ballGroup.quaternion.set(
                ballBody.quaternion.x,
                ballBody.quaternion.y,
                ballBody.quaternion.z,
                ballBody.quaternion.w,
              );
            }
            // Sync every bomb from physics — bombs are non-
            // interactive after spawn, so we always sync.
            for (const b of bombs) {
              b.group.position.set(b.body.position.x, b.body.position.y, b.body.position.z);
              b.group.quaternion.set(b.body.quaternion.x, b.body.quaternion.y, b.body.quaternion.z, b.body.quaternion.w);
            }
            // Sync spawned balls.
            for (const sb of spawnedBalls) {
              sb.mesh.position.set(sb.body.position.x, sb.body.position.y, sb.body.position.z);
              sb.mesh.quaternion.set(sb.body.quaternion.x, sb.body.quaternion.y, sb.body.quaternion.z, sb.body.quaternion.w);
            }
            // Sync confetti pieces.
            for (const cp of confettiPieces) {
              cp.mesh.position.set(cp.body.position.x, cp.body.position.y, cp.body.position.z);
              cp.mesh.quaternion.set(cp.body.quaternion.x, cp.body.quaternion.y, cp.body.quaternion.z, cp.body.quaternion.w);
            }
          }

          /* ── Fuse animation + detonation ───────────────────────
             For each bomb, drive the spark's emissive intensity and
             scale on a 0→1 ramp keyed off (now - fuseStart) / FUSE_MS.
             A subtle saw-wave overlay makes it pulse faster as it
             gets closer to zero. When t hits 1, explode().

             Iterate backwards so explode()'s splice doesn't skip a
             bomb. */
          for (let i = bombs.length - 1; i >= 0; i--) {
            const b = bombs[i];
            const t = Math.min(1, (nowMs - b.fuseStart) / FUSE_MS);
            // Pulse rate ramps from ~2Hz to ~10Hz as the fuse burns.
            const pulseHz = 2 + t * 8;
            const pulse = 0.5 + 0.5 * Math.sin((nowMs / 1000) * pulseHz * Math.PI * 2);
            // Base brightness + scale ramps with t; pulse adds wobble.
            b.sparkMat.emissiveIntensity = 1.0 + t * 3.5 + pulse * (0.4 + t * 1.2);
            b.spark.scale.setScalar(1 + t * 0.9 + pulse * (0.15 + t * 0.4));
            if (t >= 1) explode(b);
          }

          /* ── Particle update ───────────────────────────────────
             Integrate position with a mild gravity drag + air
             damping, fade opacity over life, remove when expired.
             Particles are independent of physics — they pass through
             the ball/walls so the burst reads as visual flair, not a
             second physics system. */
          if (particles.length > 0) {
            const PARTICLE_GRAV = 380;
            const PARTICLE_DAMP = Math.pow(0.92, dt * 60);
            for (let i = particles.length - 1; i >= 0; i--) {
              const p = particles[i];
              p.vel.y -= PARTICLE_GRAV * dt;
              p.vel.multiplyScalar(PARTICLE_DAMP);
              p.mesh.position.x += p.vel.x * dt;
              p.mesh.position.y += p.vel.y * dt;
              p.mesh.position.z += p.vel.z * dt;
              p.life -= dt * 1000;
              const k = Math.max(0, p.life / p.maxLife);
              p.mesh.material.opacity = k;
              if (p.life <= 0) {
                scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                particles.splice(i, 1);
              }
            }
          }

          /* ── Shard update ──────────────────────────────────────
             Two modes share one loop:
               flying:   integrate vel + angVel with gravity drag.
                         When life hits zero the shard simply hovers
                         until reassembleBall() is called (we don't
                         auto-dispose — the burst stays visible).
               returning: ease position/quaternion from start → home.
                         When the LAST shard lands we re-show the ball
                         + dispose all shards in one pass. */
          if (shards.length > 0) {
            const SHARD_DAMP_F = Math.pow(SHARD_DRAG, dt * 60);
            // Room bounds (world space). Shards collide with the
            // same 5-wall room the ball lives in. Shards live DIRECTLY
            // in scene-space (parented to scene at explode time), so
            // their position is world-space — no parent offset needed.
            const SHARD_R = 35;
            const SHARD_FLOOR   = -HALF_Y + SHARD_R;
            const SHARD_CEIL    =  HALF_Y - SHARD_R;
            const SHARD_LEFT    = -HALF_X + SHARD_R;
            const SHARD_RIGHT   =  HALF_X - SHARD_R;
            const SHARD_BACK    = -HALF_Z + SHARD_R;
            const SHARD_FRONT   =  HALF_Z - SHARD_R;
            let returningCount = 0;
            let landedCount = 0;
            // Reassemble target: ballGroup's CURRENT world pose. We
            // recompute each frame so if the ball keeps moving in
            // throw mode while shards return, they chase the live
            // ball pose instead of an out-of-date snapshot.
            ballGroup.updateMatrixWorld(true);
            const _retPos = _tmpV3a; // reuse scratch
            const _retQuat = _tmpQa;
            const _retScale = _tmpScale;
            ballGroup.matrixWorld.decompose(_retPos, _retQuat, _retScale);
            for (let i = shards.length - 1; i >= 0; i--) {
              const s = shards[i];
              const p = s.group.position;
              const q = s.group.quaternion;
              if (s.mode === 'flying') {
                s.vel.y -= SHARD_GRAVITY * dt;
                s.vel.multiplyScalar(SHARD_DAMP_F);
                p.x += s.vel.x * dt;
                p.y += s.vel.y * dt;
                p.z += s.vel.z * dt;
                // Floor/wall collision (world space — direct).
                let bounced = false;
                if (p.y < SHARD_FLOOR) { p.y = SHARD_FLOOR; if (s.vel.y < 0) { s.vel.y = -s.vel.y * SHARD_BOUNCE; s.vel.x *= SHARD_FRICTION; s.vel.z *= SHARD_FRICTION; bounced = true; } }
                if (p.y > SHARD_CEIL)  { p.y = SHARD_CEIL;  if (s.vel.y > 0) { s.vel.y = -s.vel.y * SHARD_BOUNCE; bounced = true; } }
                if (p.x < SHARD_LEFT)  { p.x = SHARD_LEFT;  if (s.vel.x < 0) { s.vel.x = -s.vel.x * SHARD_BOUNCE; bounced = true; } }
                if (p.x > SHARD_RIGHT) { p.x = SHARD_RIGHT; if (s.vel.x > 0) { s.vel.x = -s.vel.x * SHARD_BOUNCE; bounced = true; } }
                if (p.z < SHARD_BACK)  { p.z = SHARD_BACK;  if (s.vel.z < 0) { s.vel.z = -s.vel.z * SHARD_BOUNCE; bounced = true; } }
                if (p.z > SHARD_FRONT) { p.z = SHARD_FRONT; if (s.vel.z > 0) { s.vel.z = -s.vel.z * SHARD_BOUNCE; bounced = true; } }
                if (bounced) s.angVel.multiplyScalar(0.7);
                // Tumble.
                _tmpQa.setFromAxisAngle(_tmpV3a.set(1, 0, 0), s.angVel.x * dt);
                q.multiply(_tmpQa);
                _tmpQa.setFromAxisAngle(_tmpV3a.set(0, 1, 0), s.angVel.y * dt);
                q.multiply(_tmpQa);
                _tmpQa.setFromAxisAngle(_tmpV3a.set(0, 0, 1), s.angVel.z * dt);
                q.multiply(_tmpQa);
                s.life -= dt * 1000;
                if (s.life <= 0) {
                  // Aggressive damping past life — settle on the floor
                  // rather than sliding forever.
                  s.vel.multiplyScalar(0.88);
                  s.angVel.multiplyScalar(0.9);
                }
              } else {
                // returning — tween group to live ballGroup world pose
                returningCount++;
                s.t += (dt * 1000) / SHARD_RETURN_MS;
                if (s.t >= 1) {
                  s.t = 1;
                  landedCount++;
                }
                const k = easeOutCubic(s.t);
                p.lerpVectors(s.startPos, _retPos, k);
                q.slerpQuaternions(s.startQuat, _retQuat, k);
                s.group.scale.setScalar(_retScale.x);
              }
            }
            // All shards landed → restore the ball, dispose shards.
            if (returningCount > 0 && landedCount === returningCount && returningCount === shards.length) {
              for (let i = shards.length - 1; i >= 0; i--) {
                const s = shards[i];
                // Dispose shell + decal child(ren).
                s.group.traverse((child) => {
                  if (child.isMesh) {
                    child.geometry.dispose();
                    child.material.dispose();
                  }
                });
                scene.remove(s.group);
              }
              shards.length = 0;
              ballMesh.visible = true;
              if (decalMesh) decalMesh.visible = true;
              ballExploded = false;
            }
          }

          // Scale is independent of mode — wheel-driven only.
          ballGroup.scale.setScalar(state.scale);

          /* ── Two-pass render for refraction ────────────────────
             When water is present we need the scene WITHOUT water
             rendered into a texture, then re-render with water on top
             sampling that texture for refraction. When there's no
             water, skip the off-screen pass entirely (free perf). */
          if (hasWater) {
            waterMesh.visible = false;
            sizeSceneRT();
            renderer.setRenderTarget(sceneRT);
            renderer.render(scene, camera);
            renderer.setRenderTarget(null);
            waterMesh.visible = true;
            waterUniforms.uResolution.value.set(sceneRT.width, sceneRT.height);
            waterUniforms.uSceneTex.value = sceneRT.texture;
          }
          renderer.render(scene, camera);

          const now = performance.now();
          if (debugEnabledRef.current && now - lastDebugTs > 100) {
            lastDebugTs = now;
            // Snapshot the ball's user-visible state — scale + Euler
            // rotation in degrees. These are the values the user will
            // copy into the dev settings to set new defaults.
            const rad2deg = (r) => (r * 180) / Math.PI;
            setDebug({
              scale: state.scale,
              rotDeg: [
                rad2deg(ballGroup.rotation.x),
                rad2deg(ballGroup.rotation.y),
                rad2deg(ballGroup.rotation.z),
              ],
            });
          }
          animationId = requestAnimationFrame(render);
        };
        render();

        /* ── Canvas input handlers ───────────────────────────────
           Drag behavior splits by mode:
             • normal mode → drag rotates the ballGroup in place
               via quaternion deltas (no translation, no physics)
             • throw mode → drag moves the cannon body around in
               world X/Y space; release seeds linear+angular velocity
           Wheel always scales the ballGroup. */

        /* Pointer handlers — ball-only. Bombs are passive physics
           objects after spawn (no drag, no pick); they fall and
           collide on their own. The original two-mode split applies:
             • normal mode → drag rotates the ballGroup in place
             • throw mode  → drag moves the kinematic body around;
                             release seeds linear+angular velocity */
        const onPDown = (e) => {
          if (e.button !== 0) return;
          // Raycast against the ball mesh — only start a drag when the
          // pointer actually lands on the ball, not empty canvas space.
          const cvs = renderer.domElement;
          const cr = cvs.getBoundingClientRect();
          ndc.x =  ((e.clientX - cr.left) / cr.width)  * 2 - 1;
          ndc.y = -((e.clientY - cr.top)  / cr.height) * 2 + 1;
          ray.setFromCamera(ndc, camera);
          const hits = ray.intersectObject(ballGroup, true);
          if (hits.length === 0) return;

          state.dragging = true;
          state.dragStart = {
            px: e.clientX,
            py: e.clientY,
            wx: ballBody.position.x,
            wy: ballBody.position.y,
            mode: throwModeRef.current,
          };
          state.dragStartQuat = ballGroup.quaternion.clone();
          state.history = [{ t: performance.now(), x: e.clientX, y: e.clientY }];

          if (throwModeRef.current) {
            ballBody.type = CANNON.Body.KINEMATIC;
            ballBody.velocity.set(0, 0, 0);
            ballBody.angularVelocity.set(0, 0, 0);
            ballBody.wakeUp();
          }
          try { renderer.domElement.setPointerCapture(e.pointerId); } catch {}
        };

        const onPMove = (e) => {
          if (!state.dragging) return;
          const dxPx = e.clientX - state.dragStart.px;
          const dyPx = e.clientY - state.dragStart.py;

          if (state.dragStart.mode !== throwModeRef.current) {
            state.dragging = false;
            state.dragStartQuat = null;
            return;
          }

          if (throwModeRef.current) {
            ballBody.position.x = state.dragStart.wx + dxPx * 0.7;
            ballBody.position.y = state.dragStart.wy - dyPx * 0.7;
            ballBody.position.z = 0;
            ballGroup.position.set(ballBody.position.x, ballBody.position.y, 0);
          } else {
            tmpQuat.setFromEuler(new THREE.Euler(
              dyPx * ROTATE_SENSITIVITY,
              dxPx * ROTATE_SENSITIVITY,
              0,
              'XYZ',
            ));
            ballGroup.quaternion.copy(state.dragStartQuat).premultiply(tmpQuat);
          }
          const now = performance.now();
          state.history.push({ t: now, x: e.clientX, y: e.clientY });
          const cutoff = now - 80;
          while (state.history.length > 2 && state.history[0].t < cutoff) {
            state.history.shift();
          }
        };

        const onPUp = (e) => {
          if (!state.dragging) return;
          state.dragging = false;
          state.dragStartQuat = null;
          try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}

          // Throw-mode release → seed velocity. Otherwise just stop.
          if (ballBody.type === CANNON.Body.KINEMATIC && throwModeRef.current) {
            ballBody.type = CANNON.Body.DYNAMIC;
            ballBody.quaternion.set(
              ballGroup.quaternion.x,
              ballGroup.quaternion.y,
              ballGroup.quaternion.z,
              ballGroup.quaternion.w,
            );
          }
          if (!throwModeRef.current) { state.history = []; return; }

          const h = state.history;
          if (h.length >= 2) {
            const last = h[h.length - 1];
            const first = h[0];
            const dtMs = last.t - first.t;
            if (dtMs > 0) {
              let vx = (last.x - first.x) / (dtMs / 1000) * THROW_SCALE * 0.7;
              let vy = -(last.y - first.y) / (dtMs / 1000) * THROW_SCALE * 0.7;
              const speed = Math.hypot(vx, vy);
              if (speed > MAX_THROW_SPEED) {
                const k = MAX_THROW_SPEED / speed;
                vx *= k; vy *= k;
              }
              ballBody.velocity.set(vx, vy, 0);
              const ANG_PER_UNIT = 0.025;
              ballBody.angularVelocity.set(
                vy * ANG_PER_UNIT,
                -vx * ANG_PER_UNIT,
                0,
              );
            }
          }
          state.history = [];
          ballBody.wakeUp();
        };

        const onWheel = (e) => {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
          state.scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, state.scale * factor));
          // Resize the cannon collision sphere to match the visual
          // scale. Without this, the physics sphere stays at its
          // original 100-unit radius while the rendered ball changes
          // size — the ball's visible bottom drifts above (when
          // scaled down) or clips through (when scaled up) the floor.
          syncBodyRadius();
        };

        /* Replace the cannon sphere with one matching the current
           visual scale. cannon-es doesn't support live shape resizing,
           so we clear + add. Cheap enough at click frequency. */
        function syncBodyRadius() {
          if (!ballBody) return;
          // Snapshot pos+quat so the shape swap doesn't reset them.
          const px = ballBody.position.x, py = ballBody.position.y, pz = ballBody.position.z;
          const qx = ballBody.quaternion.x, qy = ballBody.quaternion.y;
          const qz = ballBody.quaternion.z, qw = ballBody.quaternion.w;
          ballBody.shapes = [];
          ballBody.shapeOffsets = [];
          ballBody.shapeOrientations = [];
          ballBody.addShape(new CANNON.Sphere(targetRadius * state.scale));
          ballBody.updateMassProperties();
          ballBody.position.set(px, py, pz);
          ballBody.quaternion.set(qx, qy, qz, qw);
        }
        // Initial sync so the body matches the dev-default ball scale.
        if (state.scale !== 1) syncBodyRadius();

        renderer.domElement.addEventListener('pointerdown', onPDown);
        renderer.domElement.addEventListener('pointermove', onPMove);
        renderer.domElement.addEventListener('pointerup', onPUp);
        renderer.domElement.addEventListener('pointercancel', onPUp);
        renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

        // ── Resize observer ────────────────────────────────────
        // Keep canvas size in sync with its parent (DraggablePanel,
        // throw, etc. can change preview area dimensions in theory).
        const ro = new ResizeObserver(() => {
          if (!renderer || !camera || !container) return;
          const { clientWidth, clientHeight } = container;
          renderer.setSize(clientWidth, clientHeight);
          camera.aspect = clientWidth / clientHeight;
          camera.updateProjectionMatrix();
        });
        ro.observe(container);

        // Park the cleanup helpers on a closure so the outer effect's
        // teardown can reach them.
        cleanupRef.current = () => {
          ro.disconnect();
          if (animationId) cancelAnimationFrame(animationId);
          if (renderer) {
            renderer.domElement?.removeEventListener('pointerdown', onPDown);
            renderer.domElement?.removeEventListener('pointermove', onPMove);
            renderer.domElement?.removeEventListener('pointerup', onPUp);
            renderer.domElement?.removeEventListener('pointercancel', onPUp);
            renderer.domElement?.removeEventListener('wheel', onWheel);
            renderer.dispose();
            if (renderer.domElement?.parentNode) {
              renderer.domElement.parentNode.removeChild(renderer.domElement);
            }
          }
          objectsToDispose.forEach((o) => o?.dispose?.());
        };
        // Hold the loading splash for the full MIN_LOADING_MS even
        // if Three.js + the model loaded faster. By the time we flip
        // to 'ready', the WebGL canvas has had several frames to paint
        // the ball at its final camera-framed position, so the fade
        // reveals a settled scene instead of a teleporting model.
        const elapsed = performance.now() - mountStart;
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
        setTimeout(() => { if (!disposed) setStatus('ready'); }, remaining);
      } catch (e) {
        console.error('[GolfballViewer] load failed', e);
        if (!disposed) {
          setStatus('error');
          onError?.(e);
        }
      }
    })();

    return () => {
      disposed = true;
      snapshotRef.current = null;
      dropBombRef.current = null;
      containsPointRef.current = null;
      spawnBallAtRef.current = null;
      setConfettiRef.current = null;
      confettiActiveRef.current = false;
      spawnBallActiveRef.current = false;
      pourWaterAtRef.current = null;
      pushWaterAtRef.current = null;
      drainWaterRef.current = null;
      clearRoomItemsRef.current = null;
      explodeBallAtRef.current = null;
      reassembleBallRef.current = null;
      waterActiveRef.current = false;
      themeObserverRef.current?.disconnect();
      themeObserverRef.current = null;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
    // Re-running on decalDataUrl change is desired so swapping the
    // alignment image rebuilds the decal projection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decalDataUrl]);

  // cleanupRef holds the dispose closure across the async boundary so
  // strict-mode double-mount + teardown still releases GPU resources.
  const cleanupRef = useRef(null);

  return (
    <div ref={containerRef} style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Fade the splash out smoothly when the load completes so the
          settled scene reveals naturally beneath instead of snap-cutting. */}
      <AnimatePresence>
        {status === 'loading' && (
          <motion.div
            key="loading-splash"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
            style={{ position: 'absolute', inset: 0, zIndex: 4 }}
          >
            <LoadingBall />
          </motion.div>
        )}
      </AnimatePresence>
      {status === 'error' && (
        <div style={{
          fontSize: 12, color: 'var(--gb-error-fg)', textAlign: 'center', padding: 20,
        }}>
          Failed to load 3D viewer.
        </div>
      )}

      {/* Top-right chip — gravity toggle. Hidden while a scene is
          active (no room to fall in). Lives ABOVE the canvas; the
          bomb listener excludes any element marked
          data-viewer-ui="true" so this can't trigger a drop. */}
      {status === 'ready' && !sceneKey && (
        <button
          type="button"
          data-viewer-ui="true"
          onClick={() => setThrowMode((v) => !v)}
          style={{
            position: 'absolute', top: 8, right: 8, zIndex: 6,
            minWidth: 28, height: 24, padding: '0 8px',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: 'var(--gb-font-mono)', fontSize: 10, fontWeight: 700,
            letterSpacing: 0.4,
            color: throwMode ? '#ffffff' : 'var(--gb-text-secondary)',
            background: throwMode
              ? 'rgba(255,255,255,0.18)'
              : 'color-mix(in srgb, var(--gb-surface-canvas) 62%, transparent)',
            backdropFilter: 'blur(18px) saturate(160%)',
            WebkitBackdropFilter: 'blur(18px) saturate(160%)',
            border: '1px solid ' + (throwMode
              ? 'rgba(255,255,255,0.28)'
              : 'color-mix(in srgb, var(--gb-text-primary) 12%, transparent)'),
            boxShadow: throwMode
              ? '0 0 0 1px rgba(255,255,255,0.18) inset, 0 0 14px -2px rgba(255,255,255,0.25)'
              : '0 4px 14px -6px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.05) inset',
            borderRadius: 9,
            cursor: 'pointer',
            lineHeight: 1,
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
            transition: 'color .14s, background .14s, border-color .14s, box-shadow .14s',
          }}
        >
          <BounceIcon size={11} />
          <span>{throwMode ? 'GRAVITY ON' : 'GRAVITY'}</span>
        </button>
      )}

      {/* Scene drawer — bottom-LEFT mirror of the bomb drawer.
          Toggle chip with a landscape glyph; clicking it opens a
          row of scene chips above it. Hidden while gravity is on
          (mutually exclusive). The drawer lives ABOVE the canvas
          and is tagged data-viewer-ui so the bomb listener doesn't
          spawn a bomb when the user closes the drawer. */}
      {status === 'ready' && !throwMode && (
        <SceneDrawer
          active={sceneKey}
          onPick={(k) => setSceneKey((cur) => (cur === k ? null : k))}
        />
      )}

      {/* Light-color chip — bottom-left swatch that opens the design
          system color picker for the key + rim lights. Hidden in HDRI
          mode (the environment map owns all lighting; tinting room
          lights would do nothing visible). The chip's swatch shows the
          active override or a neutral white when on theme default;
          shift-click resets back to the theme. */}
      {status === 'ready' && !sceneKey && (
        <LightColorChip
          color={lightColor}
          onChange={setLightColor}
          onReset={() => setLightColor(null)}
        />
      )}

      {/* Debug HUD — top-left overlay showing the camera's current
          position, target, distance, and orbit angles. Lets you orbit
          the ball into a desired default framing and copy the values
          straight back into the source. The copy payload is a JS-ready
          snippet of camera.position.set + target.set so you can paste
          directly into the GolfballViewer init code. */}
      {/* Debug HUD — shows ball scale + Euler rotation in degrees so
          you can orbit/scale the ball into the desired default look
          and copy the exact values into Developer Settings → Golfball
          viewer defaults. Camera is now fixed; what matters is what
          the BALL is doing. */}
      {debug && (
        <div style={{
          position: 'absolute', top: 8, left: 8, zIndex: 5,
          padding: '6px 8px',
          background: 'var(--gb-surface-modal)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-sm)',
          fontFamily: 'var(--gb-font-mono)',
          fontSize: 9.5, lineHeight: 1.4,
          color: 'var(--gb-text-secondary)',
          pointerEvents: 'auto',
          minWidth: 180,
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontWeight: 700, fontSize: 9, letterSpacing: 0.4,
              textTransform: 'uppercase', color: 'var(--gb-text-muted)',
            }}>Ball debug</span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => {
                // Snippet matches the dev-setting keys exactly so the
                // user can paste the values directly into Developer
                // Settings without translating coordinate systems.
                const snippet =
                  `golfballViewer.ballScale = ${debug.scale.toFixed(2)}\n` +
                  `golfballViewer.ballRotX  = ${debug.rotDeg[0].toFixed(1)}°\n` +
                  `golfballViewer.ballRotY  = ${debug.rotDeg[1].toFixed(1)}°\n` +
                  `golfballViewer.ballRotZ  = ${debug.rotDeg[2].toFixed(1)}°`;
                navigator.clipboard?.writeText(snippet)
                  .then(() => { setDebugCopied(true); setTimeout(() => setDebugCopied(false), 1500); })
                  .catch(() => {});
              }}
              style={{
                fontFamily: 'var(--gb-font-mono)', fontSize: 9, fontWeight: 700,
                background: debugCopied ? 'var(--gb-success-tint-medium)' : 'var(--gb-fill-soft)',
                color: debugCopied ? 'var(--gb-success-fg)' : 'var(--gb-text-secondary)',
                border: '1px solid ' + (debugCopied ? 'var(--gb-success-tint-border)' : 'var(--gb-border-default)'),
                borderRadius: 'var(--gb-r-xs)',
                padding: '1px 6px', cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: 0.4,
              }}
            >{debugCopied ? 'copied' : 'copy'}</button>
          </div>
          <div>scale   {debug.scale.toFixed(2)}</div>
          <div>rot.x   {debug.rotDeg[0].toFixed(1)}°</div>
          <div>rot.y   {debug.rotDeg[1].toFixed(1)}°</div>
          <div>rot.z   {debug.rotDeg[2].toFixed(1)}°</div>
        </div>
      )}

      {/* (CSS underwater tint removed — now rendered as a depth-
          attenuated fullscreen WebGL pass inside the Three.js scene.
          See the underwaterQuad creation block above.) */}
    </div>
  );
});

/* ── LoadingBall ────────────────────────────────────────────────
   Placeholder splash shown while Three.js + the OBJ file are
   resolving. A CSS-styled "golf ball" rotates in 3D via Motion's
   continuous keyframes loop on rotateY. A radial-gradient body
   gives it the highlight/shadow of a real ball; a multi-stop
   tiled background-image fakes the dimple pattern.

   Pure CSS + Motion (no Three.js dependency yet — that's still
   loading) so this paints the instant the component mounts.
─────────────────────────────────────────────────────────────── */
// Arrow-arc icon for the throw chip — reads as motion/bounce.
const BounceIcon = (p) => (
  <svg width={p.size || 11} height={p.size || 11} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18c4-10 14-10 18 0" />
    <circle cx="3" cy="18" r="1.5" fill="currentColor" />
    <polyline points="15 5 21 5 21 11" />
  </svg>
);

/* Scene / landscape glyph — sun + mountain silhouette. Used by the
   HDRI scene toggle in the top-right strip. */
/* Generic scene/landscape glyph — used for the drawer's toggle
   chip. The framed picture metaphor reads as "swap the view"
   without committing to any one scene's vibe. */
const SceneIcon = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <circle cx="16.5" cy="7.5" r="2" />
    <path d="M3 16l5-6 4 5 3-3 6 7" />
  </svg>
);

/* Per-scene icons. Keyed by the SCENES[].icon string. Each glyph is
   ~24px viewBox, currentColor stroke, no fill — the chip wrapper
   handles active-state coloring. Pick visuals that hint at the
   scene's identity: bridge for Golden Gate, mountain for Lilienstein,
   sunset for Sunset Fairway, moon for Moonlit Golf. */
const SCENE_ICONS = {
  bridge: (p) => (
    <svg width={p.size || 13} height={p.size || 13} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17h18" />
      <path d="M6 17V8M18 17V8" />
      <path d="M4 8c4-3 12-3 16 0" />
      <path d="M8 17v-4M12 17v-5M16 17v-4" />
    </svg>
  ),
  sunset: (p) => (
    <svg width={p.size || 13} height={p.size || 13} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18h18" />
      <path d="M6 14a6 6 0 0 1 12 0" />
      <path d="M2 18l1.5-1.5M22 18l-1.5-1.5M12 6v2M5.6 9.6l1.4 1.4M18.4 9.6l-1.4 1.4" />
    </svg>
  ),
  mountain: (p) => (
    <svg width={p.size || 13} height={p.size || 13} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 19l6-9 4 5 2-2 6 6z" />
      <circle cx="17" cy="6" r="1.6" />
    </svg>
  ),
  moon: (p) => (
    <svg width={p.size || 13} height={p.size || 13} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14a8 8 0 1 1-9-10 6 6 0 0 0 9 10z" />
      <circle cx="16" cy="6" r="0.9" fill="currentColor" />
      <circle cx="20" cy="9" r="0.7" fill="currentColor" />
    </svg>
  ),
};

/* ── SceneDrawer ──────────────────────────────────────────────
   Top-left frosted-glass dropdown built on <LiquidDrawer>. The
   active scene's pip slides between item slots; picking the same
   scene again slides the pip back to the toggle slot and closes
   the drawer (deselect + close as one motion). */
function SceneDrawer({ active, onPick }) {
  const [open, setOpen] = React.useState(false);
  const handleOpenChange = (next) => {
    setOpen(next);
    // Closing the drawer always returns the room — the pip animates
    // back to the toggle as a result of activeKey going null.
    if (!next && active) onPick(null);
  };
  const handlePick = (key) => {
    if (key === active) {
      // Re-clicking the active scene: deselect AND close. The pip
      // slides from item → toggle, the capsule then collapses.
      onPick(null);
      setOpen(false);
    } else {
      onPick(key);
    }
  };
  const items = SCENES.map((s) => {
    const Icon = SCENE_ICONS[s.icon] || SceneIcon;
    return { key: s.key, icon: <Icon size={14} /> };
  });
  return (
    <LiquidDrawer
      anchor="top-left"
      open={open}
      onOpenChange={handleOpenChange}
      toggleIcon={<SceneIcon size={14} />}
      items={items}
      activeKey={active}
      onPick={handlePick}
      ariaLabel="Scene"
    />
  );
}

/* ── LightColorChip ──────────────────────────────────────────
   Small frosted-glass swatch at the canvas bottom-left. Click
   opens the design-system ColorPickerPopover; drag-through
   updates live so the user sees the ball re-light in real time.
   When the color is null (= follow theme default), the swatch
   shows a subtle gradient hint that no override is active. */
const LCC_PALETTE = [
  '#ffffff', '#fff2dc', '#ffe2b0', '#ffd6a3',
  '#c8d4ff', '#a8c8ff', '#b4f0c8', '#f8b4d8',
  '#ff8a8a', '#ffcc66',
];
function LightColorChip({ color, onChange, onReset }) {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef(null);
  const active = !!color;
  return (
    <div
      data-viewer-ui="true"
      style={{
        position: 'absolute', bottom: 8, left: 8, zIndex: 6,
        display: 'flex', alignItems: 'center', gap: 4,
      }}
    >
      <button
        ref={anchorRef}
        type="button"
        title={active ? 'Light color (shift-click to reset)' : 'Tint the light'}
        onClick={(e) => {
          if (e.shiftKey && active) { onReset(); return; }
          setOpen((v) => !v);
        }}
        style={{
          width: 24, height: 24, padding: 0,
          borderRadius: '50%',
          // Show the chosen color as a solid fill; on default, paint a
          // soft sun-glyph gradient so the affordance still reads as
          // "this controls the light."
          background: active
            ? color
            : 'radial-gradient(circle at 35% 30%, #fff8e0 0%, #ffd98a 55%, #f0b04a 100%)',
          border: '1px solid color-mix(in srgb, var(--gb-text-primary) 18%, transparent)',
          boxShadow: '0 4px 14px -6px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05) inset',
          cursor: 'pointer',
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      />
      <AnimatePresence>
        {open && (
          <ColorPickerPopover
            value={color || '#ffffff'}
            onChange={onChange}
            anchorRef={anchorRef}
            swatches={LCC_PALETTE}
            onClose={() => setOpen(false)}
            align="left"
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* Geometric loading indicator — a brand-tinted SVG ring with a
   sweeping arc. Reads as "loading" without faking a 3D object that
   competes with the actual model that's about to render. The arc
   uses stroke-dasharray to draw 25% of the circumference, then
   spins via Motion. Nested smaller ring counter-rotates for a tiny
   bit of visual interest. */
function LoadingBall() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--gb-surface-canvas)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16,
    }}>
      <div style={{ position: 'relative', width: 52, height: 52 }}>
        {/* Static track ring — sits behind the spinning arc so the
            arc reads as motion against a stable reference. */}
        <svg width="52" height="52" viewBox="0 0 52 52" style={{ position: 'absolute', inset: 0 }}>
          <circle cx="26" cy="26" r="22" fill="none"
            stroke="var(--gb-border-default)" strokeWidth="2" />
        </svg>
        {/* Outer sweeping arc (clockwise) */}
        <motion.svg
          width="52" height="52" viewBox="0 0 52 52"
          style={{ position: 'absolute', inset: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.1, ease: 'linear', repeat: Infinity }}
        >
          {/* dasharray total ≈ 2πr = 138.2; the 35-103 split paints
              about 25% of the circumference as the visible arc. */}
          <circle cx="26" cy="26" r="22" fill="none"
            stroke="var(--gb-brand-label)" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray="35 103" />
        </motion.svg>
        {/* Inner counter-rotating arc — different stroke color +
            opposite direction so the eye sees two pieces moving past
            each other instead of a single spinner. */}
        <motion.svg
          width="52" height="52" viewBox="0 0 52 52"
          style={{ position: 'absolute', inset: 0 }}
          animate={{ rotate: -360 }}
          transition={{ duration: 1.7, ease: 'linear', repeat: Infinity }}
        >
          <circle cx="26" cy="26" r="14" fill="none"
            stroke="var(--gb-text-tertiary)" strokeWidth="1.5" strokeLinecap="round"
            strokeDasharray="18 70" opacity="0.7" />
        </motion.svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 0.7,
          textTransform: 'uppercase', color: 'var(--gb-text-secondary)',
          fontFamily: 'var(--gb-font-sans)',
        }}>Preparing 3D view</span>
        <span style={{
          fontSize: 10, color: 'var(--gb-text-muted)',
          fontFamily: 'var(--gb-font-mono)', letterSpacing: 0.3,
        }}>
          loading model + engine
        </span>
      </div>
    </div>
  );
}
