/* Shared Three.js bridge.
 *
 * Vite builds every extension surface as an independent IIFE. Keeping the 3D
 * imports inside GolfballViewer therefore embedded an entire Three.js runtime
 * in every bundle that happened to render that component. This entry is loaded
 * once, before those surfaces, and exposes the engine through the extension's
 * isolated-world global.
 */

import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as CANNON from 'cannon-es';
import { THREE_RUNTIME_GLOBAL } from '../lib/threeRuntime.js';

const runtime = Object.freeze({
  THREE,
  OBJLoader,
  DecalGeometry,
  EXRLoader,
  RoomEnvironment,
  CANNON,
});

const existing = globalThis[THREE_RUNTIME_GLOBAL];
if (!existing || existing.THREE?.REVISION !== THREE.REVISION) {
  globalThis[THREE_RUNTIME_GLOBAL] = runtime;
}
