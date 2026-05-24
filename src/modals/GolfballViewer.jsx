import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
  const [THREE, { OBJLoader }, { DecalGeometry }, CANNON] = await Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/OBJLoader.js'),
    import('three/examples/jsm/geometries/DecalGeometry.js'),
    import('cannon-es'),
  ]);
  cache.three = { THREE, OBJLoader, DecalGeometry, CANNON };

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
  // Throw mode — toggled by the in-frame chip button. When on:
  //   • OrbitControls are disabled so drag = throw, not orbit
  //   • The render loop integrates ball velocity + angular velocity
  //   • Walls bounce the ball back inward (4-wall x/y box)
  // Mirrored to a ref so the long-lived render closure picks up
  // changes without re-running the WebGL init effect.
  const [throwMode, setThrowMode] = useState(false);
  const throwModeRef = useRef(false);
  useEffect(() => { throwModeRef.current = throwMode; }, [throwMode]);
  // Clear stale snapshot the moment the flag flips off so the HUD
  // doesn't linger with its last reading.
  useEffect(() => { if (!debugEnabled) setDebug(null); }, [debugEnabled]);

  // Camera is fixed: side view, ball centered, decal facing the
  // camera. No more mode-switching cameras or user-controlled orbit.
  // The dev-setting registry entries for camera x/y/z + target stay
  // in place for future tuning but aren't read here.

  useEffect(() => {
    let disposed = false;
    let renderer, scene, camera, ballMesh, decalMesh, ballGroup, animationId;
    let world, ballBody;  // cannon-es physics world + sphere body
    const objectsToDispose = [];
    const mountStart = performance.now();
    const MIN_LOADING_MS = 2000;

    /* Box bounds in world units — defines the 3D play area. The
       camera is fixed pointing at the origin so these bounds map
       directly to "visible screen edges". cannon-es planes form the
       6 walls; the ball bounces inside. */
    const HALF_X = 140;
    const HALF_Y = 95;
    const HALF_Z = 80;
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
      scale: 1,
      dragging: false,
      dragStart: { px: 0, py: 0, wx: 0, wy: 0 },
      history: [],
      lastMode: false,
    };

    (async () => {
      try {
        const { THREE, DecalGeometry, CANNON, model } = await loadThreeAndModel();
        if (disposed) return;
        const container = containerRef.current;
        if (!container) return;

        // ── Scene setup ────────────────────────────────────────
        scene = new THREE.Scene();
        // No background — transparent renderer lets the grid show through
        // around the ball. Matches the playground's design-canvas vibe.

        const { clientWidth: w, clientHeight: h } = container;
        // Camera is fixed at side view looking straight at the ball
        // along -Z. Decal projects onto +Z (camera-facing) so we never
        // need to reorient; whatever you see is what gets painted.
        camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 1000);
        camera.position.set(0, 0, 360);
        camera.lookAt(0, 0, 0);

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
        // Wrap ball+decal in a Group so throw-mode translates and
        // rotates the whole assembly together. The mesh's recentering
        // offset lives INSIDE the group so the group's origin is the
        // visual center of the ball — clean pivot for rotation +
        // wall-collision math.
        ballGroup = new THREE.Group();
        ballGroup.add(ballMesh);
        scene.add(ballGroup);
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

          // Project the decal from +Z (toward the camera) onto the
          // front face of the ball. With the camera fixed at +Z,
          // whatever the user sees IS the print area — no orient/look
          // gymnastics. The projection-box X/Y define the decal's
          // on-surface size; Z is the projection depth (= 2x radius
          // so the wrap reaches around the curvature cleanly).
          const decalPosition = new THREE.Vector3(0, 0, targetRadius * 0.999);
          const decalOrientation = new THREE.Euler(0, 0, 0);
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
          // Decal must match the ball's transform so its UV mapping
          // aligns. Added to the same Group as the ball so throw-mode
          // translation/rotation moves them together; otherwise the
          // decal would stay glued to the origin.
          decalMesh.position.copy(ballMesh.position);
          decalMesh.scale.copy(ballMesh.scale);
          ballGroup.add(decalMesh);
          objectsToDispose.push(decalGeo, decalMat);
        }

        /* ── cannon-es physics world ─────────────────────────────
           One sphere body for the ball + 6 static planes for the box
           walls. World is stepped each frame ONLY when throw mode is
           on; otherwise the ball sits at the origin and is driven
           by drag-rotation.

           bodyMaterial restitution=0.6 gives a satisfying bounce
           without infinite oscillation; air friction 0.05 makes the
           ball slow naturally on the floor. Gravity is -y. */
        world = new CANNON.World();
        world.gravity.set(0, -650, 0);
        world.broadphase = new CANNON.NaiveBroadphase();

        const ballMaterial = new CANNON.Material('ball');
        const wallMaterial = new CANNON.Material('wall');
        world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, wallMaterial, {
          friction: 0.05,
          restitution: 0.6,
        }));

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
              ballBody.sleep();
              ballBody.position.set(0, 0, 0);
              ballBody.velocity.set(0, 0, 0);
              ballBody.angularVelocity.set(0, 0, 0);
              ballGroup.position.set(0, 0, 0);
              ballGroup.quaternion.identity();
              state.scale = 1;
            }
          }

          /* ── Throw-mode physics step ───────────────────────────
             World.step every frame. While dragging, the body is
             kinematic-ish: position is set directly from pointer,
             velocity is recalculated on next move. cannon-es runs
             collisions automatically. */
          if (throwModeRef.current) {
            world.step(1 / 60, dt, 3);
            if (!state.dragging) {
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
          }

          // Scale is independent of mode — wheel-driven only.
          ballGroup.scale.setScalar(state.scale);

          renderer.render(scene, camera);

          const now = performance.now();
          if (debugEnabledRef.current && now - lastDebugTs > 100) {
            lastDebugTs = now;
            setDebug({
              pos: [camera.position.x, camera.position.y, camera.position.z],
              target: [0, 0, 0],
              dist: camera.position.length(),
              azimuth: 0,
              polar: 90,
              radius: targetRadius,
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

        const onPDown = (e) => {
          if (e.button !== 0) return;
          state.dragging = true;
          // Snapshot EVERYTHING the move handler will need: pointer
          // start, ball position at start, ball rotation at start.
          // Without snapshotting on EVERY pointerdown, a stale value
          // from a previous drag (e.g. dragStartQuat from a release
          // that never fired onPUp) would carry into the new drag
          // and the ball would jump.
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
            // Convert to KINEMATIC: cannon-es no longer applies
            // gravity / collisions move the body. We own position
            // entirely while holding it; the body acts as a sensor.
            // On release, switch back to DYNAMIC and seed velocity.
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

          // Mode change mid-drag invalidates dragStart anchors. End
          // the drag cleanly so the new mode starts fresh on the
          // user's next press. (Pre-edit, throw toggle during a drag
          // produced the "ball teleports to cursor" symptom because
          // `wx`/`wy` were 0 from the original mode but body position
          // had drifted from the new mode's physics.)
          if (state.dragStart.mode !== throwModeRef.current) {
            state.dragging = false;
            state.dragStartQuat = null;
            return;
          }

          if (throwModeRef.current) {
            // Move the kinematic body. Mirror to ballGroup so the
            // render reflects the drag without waiting for the next
            // world.step.
            ballBody.position.x = state.dragStart.wx + dxPx * 0.7;
            ballBody.position.y = state.dragStart.wy - dyPx * 0.7;
            ballBody.position.z = 0;
            ballGroup.position.set(ballBody.position.x, ballBody.position.y, 0);
          } else {
            // Quaternion delta from drag-start. premultiply applies
            // the rotation in world space, which feels like trackball
            // "drag the surface".
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

          // ALWAYS restore the body to DYNAMIC so future physics
          // ticks apply gravity again. Even if we didn't switch it
          // (e.g. a mode-change mid-drag aborted), it's a no-op.
          if (ballBody.type === CANNON.Body.KINEMATIC) {
            ballBody.type = CANNON.Body.DYNAMIC;
            // Sync the rendered rotation onto the body — the user
            // may have re-positioned the ball after rotating it,
            // and we want the throw to inherit that orientation.
            ballBody.quaternion.set(
              ballGroup.quaternion.x,
              ballGroup.quaternion.y,
              ballGroup.quaternion.z,
              ballGroup.quaternion.w,
            );
          }

          // In throw mode, seed velocity from the recent drag arc so
          // releasing flings the ball. In normal mode, nothing — the
          // ball stays at whatever rotation the user landed on.
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
              // Angular: top-spin axis perpendicular to throw vector
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
        };

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

      {/* Throw-mode toggle — small in-frame chip pinned top-right of
          the viewport, mirroring the chip styling from ImagePreview's
          align/3D controls. Disabled while the loading splash is up
          so the user can't toggle into a half-initialized scene. */}
      {status === 'ready' && (
        <button
          type="button"
          onClick={() => setThrowMode((v) => !v)}
          title={throwMode ? 'Exit throw mode' : 'Throw ball'}
          style={{
            position: 'absolute', top: 8, right: 8, zIndex: 6,
            minWidth: 28, height: 24, padding: '0 8px',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: 'var(--gb-font-mono)', fontSize: 10, fontWeight: 700,
            letterSpacing: 0.4,
            color: throwMode ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
            background: throwMode ? 'var(--gb-brand-tint-medium)' : 'var(--gb-surface-modal)',
            border: '1px solid ' + (throwMode ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
            borderRadius: 'var(--gb-r-sm)',
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          <BounceIcon size={11} />
          <span>{throwMode ? 'THROWING' : 'THROW'}</span>
        </button>
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
