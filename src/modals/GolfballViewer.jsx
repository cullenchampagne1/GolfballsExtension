import React, { useEffect, useRef, useState } from 'react';
import { Spinner } from '../ui/index.js';

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
        const printPos = new THREE.Vector3(0, targetRadius, 0);
        // Frame the print area with a bit of headroom — too close and
        // the ball fills the frame; this gives the decal room to read
        // without forcing the user to immediately scroll-zoom out.
        camera.position.set(0, targetRadius * 1.8, targetRadius * 3.4);
        camera.lookAt(printPos);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(printPos);
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        controls.enablePan = false;
        controls.minDistance = 160;
        controls.maxDistance = 600;
        controls.rotateSpeed = 0.7;
        controls.update();

        // ── Render loop ────────────────────────────────────────
        const render = () => {
          if (disposed) return;
          controls.update();
          renderer.render(scene, camera);
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
    </div>
  );
}
