import React, { useEffect, useRef, useState } from 'react';
import { Spinner } from '../ui/index.js';
import { useDevSetting } from '../lib/devSettings.js';

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
  three: null,           // resolved { THREE, OrbitControls, OBJLoader, DecalGeometry }
  modelPromise: null,    // in-flight or resolved Promise<THREE.Mesh>
};

async function loadThreeAndModel() {
  if (cache.three && cache.modelPromise) {
    return { ...cache.three, model: await cache.modelPromise };
  }
  // Parallel-load engine + helpers + model so first-mount latency is
  // dominated by whichever is slowest, not the sum.
  const [THREE, { OrbitControls }, { OBJLoader }, { DecalGeometry }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('three/examples/jsm/loaders/OBJLoader.js'),
    import('three/examples/jsm/geometries/DecalGeometry.js'),
  ]);
  cache.three = { THREE, OrbitControls, OBJLoader, DecalGeometry };

  // Kick off the model fetch+parse exactly once. The OBJ is web-
  // accessible so chrome.runtime.getURL gives a load-anywhere URL.
  if (!cache.modelPromise) {
    const url = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
      ? chrome.runtime.getURL('icons/golfball_model/Golf_ball.obj')
      : 'icons/golfball_model/Golf_ball.obj';
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

export function GolfballViewer({ decalDataUrl, onError }) {
  const containerRef = useRef(null);
  // 'loading' until Three.js + the model finish; then 'ready'. 'error'
  // surfaces a basic message instead of an empty canvas.
  const [status, setStatus] = useState('loading');
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
  // Clear stale snapshot the moment the flag flips off so the HUD
  // doesn't linger with its last reading.
  useEffect(() => { if (!debugEnabled) setDebug(null); }, [debugEnabled]);

  useEffect(() => {
    let disposed = false;
    let renderer, scene, camera, controls, ballMesh, decalMesh, animationId;
    const objectsToDispose = [];

    (async () => {
      try {
        const { THREE, OrbitControls, DecalGeometry, model } = await loadThreeAndModel();
        if (disposed) return;
        const container = containerRef.current;
        if (!container) return;

        // ── Scene setup ────────────────────────────────────────
        scene = new THREE.Scene();
        // No background — transparent renderer lets the grid show through
        // around the ball. Matches the playground's design-canvas vibe.

        const { clientWidth: w, clientHeight: h } = container;
        camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 1000);
        // Camera position is set AFTER the ball + decal so we can frame
        // the actual print area. Placed below in the controls setup.

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(w, h);
        renderer.setClearColor(0x000000, 0);   // fully transparent clear
        container.appendChild(renderer.domElement);

        // ── Lighting ───────────────────────────────────────────
        // Hemisphere fill so the ball never goes black anywhere;
        // directional key for the dimple highlights.
        scene.add(new THREE.HemisphereLight(0xffffff, 0xcccccc, 0.9));
        const key = new THREE.DirectionalLight(0xffffff, 1.1);
        key.position.set(150, 200, 150);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xffffff, 0.45);
        fill.position.set(-200, -100, -100);
        scene.add(fill);

        // ── Ball ───────────────────────────────────────────────
        // Clone the cached geometry so multiple GolfballViewer mounts
        // don't share + mutate the same Mesh (DecalGeometry attaches
        // to the mesh and we'd cross-contaminate state).
        ballMesh = new THREE.Mesh(
          model.geometry.clone(),
          new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.42,
            metalness: 0,
          }),
        );
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
        scene.add(ballMesh);
        objectsToDispose.push(ballMesh.material);

        // ── Decal — projected onto the top pole ────────────────
        if (decalDataUrl) {
          const texLoader = new THREE.TextureLoader();
          const decalTexture = await new Promise((res, rej) => {
            texLoader.load(decalDataUrl, res, undefined, rej);
          });
          if (disposed) return;
          // Texture flags: clamp to edge so edge pixels don't tile across
          // the decal's edges; sRGB so white reads as white.
          decalTexture.colorSpace = THREE.SRGBColorSpace;
          decalTexture.wrapS = THREE.ClampToEdgeWrapping;
          decalTexture.wrapT = THREE.ClampToEdgeWrapping;
          objectsToDispose.push(decalTexture);

          // Project from straight up (+Y axis) down through the ball's
          // top pole. The decal "size" is the projection box (X = U
          // size on the ball surface, Y = V size, Z = projection depth).
          // Using equal X/Y keeps the decal circular; tall Z (= target
          // radius * 2) ensures the decal wraps the curvature without
          // missing surface area.
          const decalPosition = new THREE.Vector3(0, targetRadius * 0.999, 0);  // just above the surface
          const decalOrientation = new THREE.Euler(-Math.PI / 2, 0, 0);          // face downward
          const decalSize = new THREE.Vector3(targetRadius * 0.65, targetRadius * 0.65, targetRadius * 2);

          const decalGeo = new DecalGeometry(ballMesh, decalPosition, decalOrientation, decalSize);
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
          // Decal must match the ball's transform so its UV mapping aligns.
          decalMesh.position.copy(ballMesh.position);
          decalMesh.scale.copy(ballMesh.scale);
          scene.add(decalMesh);
          objectsToDispose.push(decalGeo, decalMat);
        }

        // ── Controls + camera framing ─────────────────────────
        // Aim at the print area (the top pole, at world +Y). Position
        // the camera up-and-forward so the print sits front-and-center
        // on first open instead of needing the user to orbit up. The
        // user can still drag to rotate freely from there.
        // Print area is the top pole at world +Y. To see it head-on
        // the camera needs to sit ABOVE the pole on the same +Y side
        // of the ball, looking down. A pure top-down view reads as
        // flat; tilt the camera slightly forward (+Z) so the ball's
        // curvature is visible and the print sits front-and-center.
        const printPos = new THREE.Vector3(0, targetRadius, 0);
        camera.position.set(0, targetRadius * 3.0, targetRadius * 1.8);
        camera.lookAt(printPos);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(printPos);
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        controls.enablePan = false;
        controls.minDistance = 160;
        controls.maxDistance = 600;
        controls.rotateSpeed = 0.7;
        // update() ONCE here syncs internal spherical coords with the
        // camera position we just set. Without this, the first frame
        // can paint the camera at a stale orientation (Orbit re-derives
        // its spherical from the camera vs target on first call); the
        // user has to drag once before things look right.
        controls.update();
        // Snapshot this as the default state so future reset()s land
        // back here (also useful for any "reset view" UI we add later).
        controls.saveState();

        // ── Render loop ────────────────────────────────────────
        // Debug HUD pulls camera/target state once every ~100ms so React
        // re-renders are bounded; the WebGL frame loop is independent.
        let lastDebugTs = 0;
        const render = () => {
          if (disposed) return;
          controls.update();
          renderer.render(scene, camera);
          const now = performance.now();
          if (debugEnabledRef.current && now - lastDebugTs > 100) {
            lastDebugTs = now;
            // Spherical (azimuth, polar, radius) is how OrbitControls
            // really thinks about the camera — easier to dial in than
            // raw x/y/z. Distance is the same as spherical.radius.
            const offset = camera.position.clone().sub(controls.target);
            const r = offset.length();
            const polarDeg = Math.acos(Math.max(-1, Math.min(1, offset.y / r))) * 180 / Math.PI;
            const azimuthDeg = Math.atan2(offset.x, offset.z) * 180 / Math.PI;
            setDebug({
              pos: [camera.position.x, camera.position.y, camera.position.z],
              target: [controls.target.x, controls.target.y, controls.target.z],
              dist: r,
              azimuth: azimuthDeg,
              polar: polarDeg,
              radius: targetRadius,
            });
          }
          animationId = requestAnimationFrame(render);
        };
        render();

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
          if (controls) controls.dispose();
          if (renderer) {
            renderer.dispose();
            if (renderer.domElement?.parentNode) {
              renderer.domElement.parentNode.removeChild(renderer.domElement);
            }
          }
          objectsToDispose.forEach((o) => o?.dispose?.());
        };
        setStatus('ready');
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
      {status === 'loading' && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          color: 'var(--gb-text-muted)', fontSize: 12,
        }}>
          <Spinner size={20} />
          <span>Loading 3D model…</span>
        </div>
      )}
      {status === 'error' && (
        <div style={{
          fontSize: 12, color: 'var(--gb-error-fg)', textAlign: 'center', padding: 20,
        }}>
          Failed to load 3D viewer.
        </div>
      )}

      {/* Debug HUD — top-left overlay showing the camera's current
          position, target, distance, and orbit angles. Lets you orbit
          the ball into a desired default framing and copy the values
          straight back into the source. The copy payload is a JS-ready
          snippet of camera.position.set + target.set so you can paste
          directly into the GolfballViewer init code. */}
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
            }}>Camera debug</span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => {
                const r = debug.radius;
                const snippet =
                  `// targetRadius = ${r.toFixed(1)}\n` +
                  `camera.position.set(${debug.pos.map((n) => n.toFixed(1)).join(', ')});\n` +
                  `controls.target.set(${debug.target.map((n) => n.toFixed(1)).join(', ')});\n` +
                  `// orbit: azimuth ${debug.azimuth.toFixed(1)}°, polar ${debug.polar.toFixed(1)}°, dist ${debug.dist.toFixed(1)}`;
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
          {/* Stripped down to the values useful for tuning the default
              camera framing. Multiply-by-r values give you the value in
              "radius units" which is how the source code expresses
              camera.position.set (e.g. targetRadius * 1.8). */}
          <div>pos    [{debug.pos.map((n) => (n / debug.radius).toFixed(2) + 'r').join(', ')}]</div>
          <div>target [{debug.target.map((n) => (n / debug.radius).toFixed(2) + 'r').join(', ')}]</div>
          <div>dist   {(debug.dist / debug.radius).toFixed(2)}r</div>
          <div>az     {debug.azimuth.toFixed(1)}°</div>
          <div>polar  {debug.polar.toFixed(1)}°</div>
        </div>
      )}
    </div>
  );
}
